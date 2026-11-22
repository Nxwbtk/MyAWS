#!/usr/bin/env python3
"""Generate Phase 1 API operation metadata from the pinned emulator models."""

from __future__ import annotations

import html
import json
import re
import subprocess
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
WORKSPACE = PROJECT.parent
EMULATOR = WORKSPACE / "aws-emulator"
CATALOG = PROJECT / "src/data/service-catalog.json"
OUTPUT = PROJECT / "src/data/phase-1-operations.json"
S3_OPERATIONS = PROJECT / "src/data/s3-operations.json"
PHASE_1 = {
    "s3",
    "ec2",
    "dynamodb",
    "sqs",
    "iam",
    "sts",
    "lambda",
    "cloudwatch",
    "cloudtrail",
}
STUB = re.compile(r"^//! SCAFFOLDED, NOT IMPLEMENTED:\s*(.*)$", re.MULTILINE)
OP_NAME = re.compile(r"^//! @op ([A-Za-z0-9]+)\s*$", re.MULTILINE)
HTML_TAG = re.compile(r"<[^>]+>")


def clean_documentation(value: str, limit: int = 360) -> str:
    text = html.unescape(HTML_TAG.sub(" ", value))
    text = " ".join(text.split())
    if len(text) > limit:
        text = text[: limit - 1].rsplit(" ", 1)[0] + "…"
    return text


def member_kind(shapes: dict, target: str) -> str:
    shape = shapes.get(target, {})
    kind = shape.get("type", "unknown")
    if kind in {"list", "map", "set"}:
        return kind
    return kind


def model_operations(model_id: str) -> dict:
    retired = set()
    if model_id == "s3":
        s3_inventory = json.loads(S3_OPERATIONS.read_text()).get("s3", {})
        retired = {
            name
            for name, entry in s3_inventory.items()
            if entry.get("state") == "retired"
        }
    directories = sorted(
        path
        for path in (EMULATOR / "services").glob(
            f"service-com-amazonaws-{model_id}-*"
        )
        if path.is_dir()
    )
    operations = []
    for directory in directories:
        model_files = sorted((directory / "smithy-model").glob("*.json"))
        model = json.loads(model_files[0].read_text()) if model_files else {}
        shapes = model.get("shapes", {})
        source_by_name = {}
        for source in sorted((directory / "src/ops").glob("*.rs")):
            if source.stem == "mod":
                continue
            content = source.read_text(errors="replace")
            operation = OP_NAME.search(content)
            if operation:
                source_by_name[operation.group(1)] = (source, content)

        # Smithy is the inventory source of truth. The handler source annotates each
        # operation as implemented or scaffolded; an operation missing a file is a
        # separate no-handler case rather than silently disappearing from the report.
        for shape_id, shape in shapes.items():
            if shape.get("type") != "operation":
                continue
            name = shape_id.rsplit("#", 1)[-1]
            source_entry = source_by_name.get(name)
            source, content = source_entry if source_entry else (None, "")
            def fields_for(shape_ref: dict) -> list[dict]:
                shape_id = shape_ref.get("target")
                member_shape = shapes.get(shape_id, {}) if shape_id else {}
                fields = []
                for field_name, field in member_shape.get("members", {}).items():
                    target = field.get("target", "")
                    traits = field.get("traits", {})
                    doc = traits.get("smithy.api#documentation", "")
                    fields.append(
                        {
                            "name": field_name,
                            "type": member_kind(shapes, target),
                            "target": target.rsplit("#", 1)[-1],
                            "required": "smithy.api#required" in traits,
                            "documentation": clean_documentation(doc, 180),
                        }
                    )
                return fields

            input_fields = fields_for(shape.get("input") or {})
            output_fields = fields_for(shape.get("output") or {})
            stub = STUB.search(content)
            is_retired = name in retired
            doc = (shape.get("traits") or {}).get(
                "smithy.api#documentation", ""
            )
            operations.append(
                {
                    "name": name,
                    "sourceFile": str(source.relative_to(EMULATOR))
                    if source
                    else None,
                    "status": "no_handler"
                    if source is None
                    else "stub"
                    if stub
                    else "retired"
                    if is_retired
                    else "implemented",
                    "supportNote": clean_documentation(stub.group(1), 220)
                    if stub
                    else "This operation is retired in the MyAWS console."
                    if is_retired
                    else "",
                    "documentation": clean_documentation(doc),
                    "inputFields": input_fields,
                    "outputFields": output_fields,
                }
            )

    operations.sort(key=lambda item: item["name"].casefold())
    return {
        "id": model_id,
        "operationCount": len(operations),
        "implementedCount": sum(
            operation["status"] == "implemented" for operation in operations
        ),
        "stubCount": sum(operation["status"] == "stub" for operation in operations),
        "retiredCount": sum(
            operation["status"] == "retired" for operation in operations
        ),
        "missingHandlerCount": sum(
            operation["status"] == "no_handler" for operation in operations
        ),
        "operations": operations,
    }


def main() -> None:
    catalog = json.loads(CATALOG.read_text())
    commit = subprocess.check_output(
        ["git", "-C", str(EMULATOR), "rev-parse", "HEAD"], text=True
    ).strip()
    result = {
        "sourceCommit": commit,
        "services": [],
    }
    for service in catalog["services"]:
        if service["id"] not in PHASE_1:
            continue
        models = [model_operations(model["id"]) for model in service["models"]]
        result["services"].append(
            {
                "id": service["id"],
                "name": service["name"],
                "modelCount": len(models),
                "operationCount": sum(model["operationCount"] for model in models),
                "implementedCount": sum(
                    model["implementedCount"] for model in models
                ),
                "stubCount": sum(model["stubCount"] for model in models),
                "retiredCount": sum(model["retiredCount"] for model in models),
                "missingHandlerCount": sum(
                    model["missingHandlerCount"] for model in models
                ),
                "models": models,
            }
        )

    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    total_operations = sum(service["operationCount"] for service in result["services"])
    implemented = sum(service["implementedCount"] for service in result["services"])
    stubs = sum(service["stubCount"] for service in result["services"])
    retired = sum(service["retiredCount"] for service in result["services"])
    missing = sum(
        service["missingHandlerCount"] for service in result["services"]
    )
    print(
        f"Wrote {OUTPUT.relative_to(PROJECT)} for {commit}: "
        f"{implemented}/{total_operations} operations implemented, "
        f"{stubs} stubs, {retired} retired, {missing} with no handler."
    )


if __name__ == "__main__":
    main()
