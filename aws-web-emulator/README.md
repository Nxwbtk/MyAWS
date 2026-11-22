# MyAWS Emulator Console

A local Next.js App Router frontend for the AWS Emulator in the neighboring `aws-emulator` submodule.

## Start the emulator API

On Linux, run the Docker Compose launcher from `aws-web-emulator`. It builds an image with the official AWS Emulator RPM, publishes HTTPS on `127.0.0.1:9297`, and shares the generated certificate and credentials with the frontend. The launcher uses the x86-64 RPM by default. On ARM64, set `EMULATOR_RPM_ARCH=aarch64` for the build.

```sh
mkdir -p "$HOME/.aws/emulator"
EMULATOR_UID="$(id -u)" EMULATOR_GID="$(id -g)" docker compose up --build -d
```

Once the emulator starts, this health check should return `ok`.

```sh
curl --fail --silent --show-error \
  --cacert "$HOME/.aws/emulator/9297/ca.pem" \
  https://127.0.0.1:9297/__admin/health
```

Use `docker compose logs -f emulator` to view logs and `docker compose down` to stop the API. The emulator keeps resources in memory for the lifetime of the process.

If you installed `aws-emulator` natively, run `aws-emulator` in a separate terminal with authentication enabled, which is its default. See the [AWS installation guide](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html).

To run the checkout itself, use `cargo run -p aws-emulator-router` from the neighboring `aws-emulator` directory. See the submodule's [build prerequisites](../aws-emulator/README.md#building-from-source) before starting a full Rust build.

## Start the frontend

From `aws-web-emulator`, use Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

The Next.js server defaults to `https://127.0.0.1:9297` and `us-east-1`. It reads `ca.pem` and `emulator_credentials` from `~/.aws/emulator/9297/` on each request. The browser uses same-origin requests to the Next.js route handler. The handler uses the AWS SDK and authenticates with the emulator's generated keys.

For a different port, set `EMULATOR_PORT` when starting Compose and set `EMULATOR_ENDPOINT` when starting the frontend, for example `https://127.0.0.1:9300`. The default state directory follows the port. Set `EMULATOR_STATE_DIR` to the absolute state directory if needed. Set `EMULATOR_REGION` to use a different region.

## Find services

Use the search box in the top bar or press `Alt+S`. Search matches service names, SDK aliases, and features such as S3 Tables. Console Home shows up to 12 recently visited services, ordered by most recent and saved in the current browser. The dashboard also shows the API connection, startup commands, and counts of local buckets, tables, and queues.

The search catalog includes the service families registered in the checked-out emulator. The Phase 1 and Phase 2 services open AWS Console-aligned workspaces with their registered API operations and handler support status. After updating the submodule, regenerate the search catalog and operation inventories with Python 3.11 or newer.

```sh
python3 scripts/generate-service-catalog.py
python3 scripts/generate-phase-1-operations.py
python3 scripts/generate-phase-2-operations.py
```

Service icons are keyed by catalog ID in `src/data/service-icons.json`. The SVGs in `public/service-icons/` come from the supplied AWS Architecture Icons package dated 07312026. Where the package lacks a named service icon, the index uses the corresponding category icon.

## Resource consoles

- **S3** manages buckets, objects, S3 Tables, S3 Vectors, file systems, Access Points, Access Grants, Storage Lens, Batch Operations, account settings, and Outposts. Standard uploads switch to multipart above 16 MiB.
- **VPC** lists VPCs, subnets, route tables, internet gateways, and security groups and can create IPv4 VPCs with an optional Name tag.
- **EC2** lists instances, owned AMIs, volumes, security groups, key pairs, and network interfaces.
- **DynamoDB** creates on-demand tables with string keys, displays configuration, and lets you explore, scan, or put items as JSON.
- **SQS** creates standard and FIFO queues, displays delivery settings and queue depth, and sends or polls for messages. Polling uses the queue's visibility timeout.
- **IAM** groups identity, permissions, and Access Analyzer workflows.
- **STS** provides caller identity, session credentials, and assume-role workflows.
- **Lambda** lists functions, event source mappings, function URLs, published versions, aliases, and layers; function-scoped views can page through the selected function's versions and aliases.
- **CloudWatch** groups metrics, alarms, dashboards, metric streams, logs, canaries, Application Insights, RUM applications, Internet and Network Monitors, and cross-account observability sinks and links.
- **CloudTrail** groups event history, trails, delivery status, event data stores, and saved queries.

Every Phase 1 and Phase 2 console has an API operation explorer backed by the Smithy models in the pinned emulator submodule. It shows request and response members, operation documentation, emulator handler source, and JavaScript SDK command availability. Complex requests can be entered as JSON. Writes are sent only to the configured local emulator.

Every Phase 2 console includes the same operation explorer, plus AWS Console-style resource areas for the emulator-backed features. Resource lists support service pagination, details, selectors, and supported row actions; workflows such as DNS changes, certificate requests, accelerator creation, service registration, and recovery resource inspection use the configured local emulator.

## Development progress

All 10 Phase 1 and all 13 Phase 2 service entry points and their model-backed operation workbenches are implemented. Phase 2 covers 1,047 operations across 23 API models: 797 are marked implemented, 248 are explicit stubs, and two have no handler. Source support does not mean every feature has passed a live request test. See [Phase 1 status](docs/phase-1-console.md), the separate [S3 verification record](docs/phase-1-s3.md), [Phase 2 status and limitations](docs/phase-2-console.md), and the [service roadmap](docs/service-roadmap.md).

## Verify the frontend

```sh
npm run lint
npm run build
npm start
```
