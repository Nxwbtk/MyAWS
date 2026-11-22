"""Write src/data/operation-status.json: {model: {operation: status}} for every
operation that is not implemented in the Phase 1 and Phase 2 inventories.
Operations missing from a listed model are implemented."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
status = {}
for name in ["phase-1-operations.json", "phase-2-operations.json"]:
    data = json.loads((root / "src/data" / name).read_text())
    for service in data["services"]:
        for model in service["models"]:
            status[model["id"]] = {op["name"]: op["status"] for op in model["operations"] if op["status"] != "implemented"}
(root / "src/data/operation-status.json").write_text(json.dumps(status, separators=(",", ":")) + "\n")
print(sum(len(v) for v in status.values()), "operations in", len(status), "models")
