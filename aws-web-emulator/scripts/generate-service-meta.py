"""Match AWS Console services-menu entries (scripts/console-services.tsv) to the
emulator catalog and write src/data/service-meta.json with the console's short
name, category, and tagline for each catalog service."""
import json, re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
catalog = json.loads((root / "src/data/service-catalog.json").read_text())["services"]
catalog.append({"id": "vpc", "name": "Amazon VPC", "aliases": ["VPC", "Virtual Private Cloud"], "models": []})

def norm(value):
    value = re.sub(r"^(Amazon|AWS)\s+", "", value.strip(), flags=re.I)
    return re.sub(r"[^a-z0-9]+", "", value.lower())

rows = []
for line in (root / "scripts/console-services.tsv").read_text().splitlines():
    parts = line.split("\t")
    if len(parts) >= 2 and parts[1]:
        rows.append({"category": parts[0], "name": parts[1], "description": parts[2] if len(parts) > 2 else ""})

by_norm = {}
for row in rows:
    by_norm.setdefault(norm(row["name"]), row)

# Catalog services whose console menu name differs from every catalog alias.
manual = {
    "ecs": "Elastic Container Service", "rds": "Aurora and RDS", "kafka": "MSK",
    "arc": "Application Recovery Controller", "applicationautoscaling": "AWS Auto Scaling",
    "mgn": "AWS Transform MGN", "glacier": "S3 Glacier", "greengrass": "IoT Greengrass",
    "health": "AWS Health Dashboard", "acmpca": "AWS Private Certificate Authority",
    "chatbot": "Amazon Q Developer in chat applications (previously AWS Chatbot)",
    "resourcegroups": "Resource Groups & Tag Editor", "mwaa": "Managed Apache Airflow",
    "amp": "Amazon Prometheus", "waf": "WAF & Shield", "shield": "WAF & Shield",
    "networkfirewall": "VPC", "codestarnotifications": "AWS User Notifications",
    "kinesisanalytics": "Kinesis", "controlcatalog": "Control Tower",
}
# Services the console reaches from another service's pages.
extra = {
    "sts": ("STS", "Security, Identity, & Compliance", "Temporary security credentials"),
    "elasticloadbalancing": ("Elastic Load Balancing", "Networking & Content Delivery", "Distribute incoming traffic across targets"),
    "vpclattice": ("VPC Lattice", "Networking & Content Delivery", "Connect, secure, and monitor service-to-service communication"),
    "networkmanager": ("Network Manager", "Networking & Content Delivery", "Manage your global network"),
    "interconnect": ("Interconnect", "Networking & Content Delivery", "Private connectivity between networks"),
}
meta, unmatched = {}, []
for service in catalog:
    keys = [service["name"], service["id"], *service["aliases"]]
    match = next((by_norm[norm(k)] for k in keys if norm(k) in by_norm), None)
    if not match and service["id"] in manual:
        match = by_norm.get(norm(manual[service["id"]]))
    if not match and service["id"] in extra:
        short, category, description = extra[service["id"]]
        match = {"name": short, "category": category, "description": description}
    if match:
        meta[service["id"]] = {"short": match["name"], "category": match["category"], "description": match["description"]}
    else:
        unmatched.append(service["id"])

(root / "src/data/service-meta.json").write_text(json.dumps({"categories": sorted({r["category"] for r in rows}), "services": meta}, indent=1) + "\n")
print(len(meta), "matched;", len(unmatched), "unmatched:", " ".join(unmatched))
