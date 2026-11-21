"""Generate the S3 operation inventory from the pinned emulator models."""

import json
import re
from pathlib import Path


APP = Path(__file__).resolve().parents[1]
SERVICES = APP.parent / "aws-emulator" / "services"
MODELS = {
    "s3": "amazons3",
    "s3control": "awss3controlservicev20180820",
    "s3files": "s3files",
    "s3outposts": "s3outposts",
    "s3tables": "s3tablebuckets",
    "s3vectors": "s3vectors",
}
NUMERIC = {"byte", "short", "integer", "long", "float", "double", "bigInteger", "bigDecimal"}


def input_field(name, member, shapes):
    target = member["target"]
    shape = shapes.get(target, {"type": target.split("#")[-1].lower()})
    shape_type = shape["type"]
    traits = shape.get("traits", {})
    choices = [entry["value"] for entry in traits.get("smithy.api#enum", [])]
    if shape_type == "enum":
        choices = [
            fields.get("traits", {}).get("smithy.api#enumValue", key)
            for key, fields in shape["members"].items()
        ]
    required = "smithy.api#required" in member.get("traits", {})
    if choices:
        return [name, "enum", required, choices]
    kind = (
        "number" if shape_type in NUMERIC else
        "boolean" if shape_type == "boolean" else
        "file" if shape_type == "blob" else
        "date" if shape_type == "timestamp" else
        "text" if shape_type == "string" else
        "json"
    )
    return [name, kind, required]


def timestamp_paths(target, shapes, visited=frozenset()):
    if target in visited:
        return
    shape = shapes.get(target, {"type": target.split("#")[-1].lower()})
    kind = shape["type"]
    if kind == "timestamp":
        yield []
        return
    children = shape.get("members", {})
    if kind in {"list", "set"}:
        children = {"*": shape["member"]}
    if kind == "map":
        children = {"*": shape["value"]}
    for name, member in children.items():
        for child in timestamp_paths(member["target"], shapes, visited | {target}):
            yield [name, *child]


def operation_catalog(model, crate):
    [source] = (crate / "smithy-model").glob("*.json")
    shapes = json.loads(source.read_text())["shapes"]
    operations = {}
    for key, operation in shapes.items():
        if operation["type"] != "operation":
            continue
        name = key.split("#")[-1]
        snake_case = re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()
        handler = crate / "src" / "ops" / f"{snake_case}.rs"
        state = "available"
        if not handler.exists():
            state = "unwired"
        elif re.search(r"^//! SCAFFOLDED", handler.read_text(), re.MULTILINE):
            state = "stub"
        elif model == "s3" and name == "GetObjectTorrent":
            state = "retired"
        fields = shapes.get(operation.get("input", {}).get("target"), {}).get("members", {})
        inputs = [input_field(field, member, shapes) for field, member in fields.items()]
        inputs.sort(key=lambda field: (not field[2], field[0]))
        operations[name] = {"state": state, "input": inputs}
        dates = sorted(
            path for path in timestamp_paths(operation.get("input", {}).get("target", ""), shapes)
            if len(path) > 1
        )
        if dates:
            operations[name]["nestedDates"] = dates
    return dict(sorted(operations.items()))


catalog = {
    model: operation_catalog(model, SERVICES / f"service-com-amazonaws-{model}-{suffix}")
    for model, suffix in MODELS.items()
}
lines = ["{"]
for index, (model, operations) in enumerate(catalog.items()):
    lines.append(f'  "{model}": {{')
    lines.append(",\n".join(f'    "{name}": {json.dumps(spec)}' for name, spec in operations.items()))
    lines.append("  }" + ("," if index + 1 < len(catalog) else ""))
lines.append("}")
(APP / "src" / "data" / "s3-operations.json").write_text("\n".join(lines) + "\n")
