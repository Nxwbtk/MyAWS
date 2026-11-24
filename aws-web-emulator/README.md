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

## Console UI

The interface is built with [Cloudscape](https://cloudscape.design/), the design system the AWS Console uses. `src/app/one-theme.css` maps the AWS Console "one theme" token values (light and dark) onto the installed Cloudscape version; the source values live in `scripts/one-theme/`. Regenerate the file after upgrading `@cloudscape-design/components`:

```sh
node scripts/generate-one-theme.mjs
```

The top navigation includes service search (services, features, and resources in the emulator), a categorized services menu with favorites, the emulator Region, and the account from STS `GetCallerIdentity`. Settings switches between light, dark, and browser-default visual modes. The console defaults to `ap-southeast-7`; the health check enables that opt-in Region in the local emulator.

`scripts/generate-service-meta.py` maps the console services menu (`scripts/console-services.tsv`) to catalog IDs for short names, categories, and taglines. `scripts/generate-operation-status.py` writes the client-side list of operations the emulator does not implement.

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

- **S3** follows the AWS Console page by page: general purpose and directory buckets, create bucket (all sections), bucket Objects / Metadata / Properties / Permissions / Metrics / Management / File systems / Access Points tabs, object details and versions, upload with status, empty and delete confirmations, table buckets, vector buckets, file systems, Access Points, Access Grants, Storage Lens, Batch Operations, and account Block Public Access. Controls for operations the emulator lacks stay visible but disabled.
- **VPC** follows the VPC console: dashboard, VPCs (VPC only or VPC and more), subnets, route tables, internet and egress-only gateways, DHCP option sets, Elastic IPs, network ACLs, security groups with rule editors, endpoints, endpoint services, NAT gateways, peering, managed prefix lists, VPN, transit gateways, traffic mirroring, and flow logs.
- **EC2** follows the EC2 console: dashboard, instances with the launch wizard and instance state actions, instance types, launch templates, Spot requests, reservations, dedicated hosts, AMIs and the AMI catalog, volumes, snapshots, placement groups, key pairs, and network interfaces.
- **DynamoDB** covers tables and the create-table form, table detail tabs (overview, indexes, monitor, backups, exports and streams, permissions, additional settings), Explore items with scan and query, a JSON item editor, the PartiQL editor, backups, exports, imports, and DAX.
- **SQS** covers queues, the create and edit queue form, queue detail tabs, send and receive messages with polling, Lambda triggers, and DLQ redrive.
- **IAM** covers the dashboard, users (create wizard, security credentials, access keys), user groups, roles (create wizard, trust relationships), policies (JSON editor, versions, attached entities), identity providers, account settings, and the credential report.
- **STS** shows the caller identity and issues temporary credentials (assume role, session token, federation token, web identity), and decodes authorization messages.
- **Lambda** covers the dashboard, functions, create function, a code editor that deploys to the emulator, test events with invocation logs, monitoring, configuration sections, aliases, versions, layers, event source mappings, and code signing configurations.
- **CloudWatch** covers log groups and streams, Logs Insights, Live Tail, the metrics browser with graphs, alarms with the create wizard and history, and dashboards with metric, text, and alarm widgets.
- **CloudTrail** covers the dashboard, event history with event records, Insights, trails, and Lake event data stores with SQL queries.

Every Phase 2 service also has a Cloudscape console that follows the real AWS Console: Route 53, Elastic Load Balancing, CloudFront, AWS Certificate Manager, Global Accelerator, Cloud Map, VPC Lattice, Direct Connect, Interconnect, Network Manager, App Mesh, RTB Fabric, and Application Recovery Controller. Features without an emulator API stay visible but disabled.

## Development progress

All 10 Phase 1 services have Cloudscape consoles that follow the real AWS Console. All 13 Phase 2 services have Cloudscape consoles as well. Phase 2 covers 1,047 operations across 23 API models: 797 are marked implemented, 248 are explicit stubs, and two have no handler. Source support does not mean every feature has passed a live request test. See [Phase 1 status](docs/phase-1-console.md), the separate [S3 verification record](docs/phase-1-s3.md), [Phase 2 status and limitations](docs/phase-2-console.md), and the [service roadmap](docs/service-roadmap.md).

## Verify the frontend

```sh
npm run lint
npm run build
npm start
```
