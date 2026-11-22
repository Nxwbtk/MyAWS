# Phase 1 console coverage

**Source:** AWS Emulator submodule commit `c29ca200a147e8100a600a7aaaf26acf82d31158` · **Operation inventory:** generated from the registered Smithy models and Rust operation sources.

The console now has a service workspace for all 10 Phase 1 entries. Resource screens provide AWS-style resource lists and detail panels for S3, VPC, EC2, DynamoDB, SQS, IAM, Lambda, CloudWatch, and CloudTrail. STS has a caller-identity panel and temporary-credential workflows because it has no standalone resource inventory. The operation explorer remains available on every Phase 1 page for the broader Smithy API surface; it shows modeled request/response members, operation documentation, handler source, and JavaScript SDK command availability. It sends requests only to the local emulator configured for MyAWS.

## Service coverage

| Service | Main console areas | Registered models | Operations | Implemented | Stub | Retired | No handler |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| S3 | General and directory buckets, objects, tables, vectors, files, access points, grants, Storage Lens, Batch Operations, account settings, Outposts | 6 | 305 | 259 | 44 | 1 | 1 |
| VPC | VPCs, subnets, route tables, internet gateways, security groups, VPC creation | EC2 model | Included under EC2 | — | — | — | — |
| EC2 | Instances, AMIs, volumes, security groups, key pairs, network interfaces, instance connect | EC2, EC2 Instance Connect | 809 | 656 | 153 | 0 | 0 |
| DynamoDB | Tables, table configuration, item scan/put; Streams and DAX through API explorer | 3 | 85 | 78 | 7 | 0 | 0 |
| SQS | Queues, delivery configuration, depth, send/receive/poll | 1 | 23 | 23 | 0 | 0 | 0 |
| IAM | Users, groups, roles, policies, policy simulation, Access Analyzer | 3 | 220 | 207 | 13 | 0 | 0 |
| STS | Caller identity, session credentials, assume-role and federation | 1 | 11 | 11 | 0 | 0 | 0 |
| Lambda | Functions, event sources, function URLs, versions, aliases, layers | 4 | 138 | 130 | 8 | 0 | 0 |
| CloudWatch | Metrics, alarms, dashboards, metric streams, logs, synthetics, Application Insights, RUM, Internet and Network Monitors, cross-account sinks and links | 13 | 463 | 389 | 74 | 0 | 0 |
| CloudTrail | Event history, trails, status, event data stores, saved queries, data events | 2 | 61 | 59 | 2 | 0 | 0 |
| **Total API inventory** | **10 service entries; VPC shares the EC2 model** | **35** | **2,115** | **1,812** | **301** | **1** | **1** |

“Implemented” means the pinned Rust source contains an operation handler without the explicit `SCAFFOLDED, NOT IMPLEMENTED` marker, excluding retired S3 `GetObjectTorrent`. It is a source inventory, not a claim that every request succeeds. A separate runtime check disables calls when the JavaScript SDK client or command is unavailable; the catalog currently exposes SDK commands for 1,788 operations, with 24 source handlers lacking a published command in the installed JavaScript SDK packages. The separate S3 test record covers all 259 active operations.

## Verification

- `npm run lint`, `npx tsc --noEmit`, the Next.js production build, and `git diff --check` passed after the final console changes.
- All 10 local service routes rendered their service-specific headings. All 35 operation-catalog endpoints returned the complete 2,115-operation inventory.
- The SDK availability gate was checked: 1,788 operations can be sent with installed JavaScript SDK commands. Unsupported states are explicit: stub and no-handler requests return HTTP 501, operations without an installed command return HTTP 501, and retired S3 `GetObjectTorrent` returns HTTP 410 without being sent to the emulator.
- DynamoDB browser workflow passed validation, table creation, ACTIVE metadata and index display, item put/scan/delete, and table deletion. The UI uses a two-step inline confirmation for item removal.
- SQS browser workflows passed standard and FIFO queue creation, FIFO message-group validation, queue attribute update, send/receive/delete message, and queue deletion. Received system/message attributes are visible on the message row.
- IAM emulator workflows passed user/group creation and lookup, membership add/remove, and managed-policy create/read/version/delete.
- The IAM browser details action was checked against an isolated user fixture; `GetUser` fields and tags appeared in the structured details panel.
- IAM user detail, managed-policy, inline-policy, and access-key actions returned HTTP 200 in the browser. The panel rendered nested `AccessKeyMetadata` and policy response fields; these list operations do not return access-key secrets. Group, role, and managed-policy rows also expose membership, policy-version, attachment, and detail actions.
- VPC create/list/delete passed against the isolated emulator. The EC2/VPC resource-list set was also exercised through the MyAWS route; its implemented list calls returned HTTP 200.
- Lambda create/wait-until-active/invoke/delete passed with a small local Python ZIP fixture.
- Lambda Versions, Aliases, and Function URLs tabs were checked in the browser against an isolated function fixture. The published version and `live` alias appeared, alias details rendered through `GetAlias`, and a Function URL with `AWS_IAM` authentication rendered through `GetFunctionUrlConfig`.
- CloudWatch alarm create/delete; log group/stream/event write, filter and delete; dashboard put/list/get/delete; and metric put/list/get-data passed. A nested metric timestamp conversion issue found during the run was fixed and rechecked.
- The CloudWatch browser dashboard list and “Open dashboard” details action were checked against an isolated dashboard fixture. Dashboard JSON is shown formatted in the details panel.
- All 13 CloudWatch resource tabs were clicked in the browser; each selected the intended panel and displayed its empty state without an API error. `ListApplications`, `ListAppMonitors`, the Internet/Network Monitor `ListMonitors` variants, Network Flow Monitor `ListMonitors`, `ListMetricStreams`, `ListSinks`, and `ListLinks` each returned HTTP 200 with the response keys used by their resource tables. The tab list wraps across rows so the final tabs remain directly clickable.
- CloudTrail trail create/start/status/stop/delete and bucket/log-object cleanup passed. CloudTrail Lake event data store creation/listing, saved-query listing, query start and result polling passed. The browser UI now asks for an event data store before listing saved queries.
- STS `GetCallerIdentity` and `GetSessionToken` passed. S3 has a separate isolated emulator test record covering all 259 active operations in [phase-1-s3.md](phase-1-s3.md).
- The authenticated real AWS Console was inspected read-only for service navigation and representative list views across the nine resource-oriented services. STS has no standalone resource inventory, so its comparison is API-oriented. No real AWS resources were created, edited, or deleted. The reference account lacked populated resources for several detail screens, so those were compared using emulator fixtures and the registered AWS operation models instead.

These checks cover the console's main supported workflows; they are not a request-by-request regression run of every non-stub operation. In particular, the operation counts above describe handler source status, not verified behavior. Emulator constraints remain: 301 explicit stubs, one retired operation, one operation without a handler, and 24 non-stub source handlers without a command in the installed JavaScript SDK packages. Such operations are marked and kept out of the supported workflow claims. CloudTrail Lake deletion follows the emulator's seven-day pending-deletion behavior; verification data lived only in the disposable isolated emulator state, which was removed after the run.

The reference AWS account did not provide existing resources for every resource-specific detail view, so those empty-account screens were not compared against populated resources. For features requiring pre-existing resources, compare with AWS documentation or create fixtures only in the isolated emulator.

## Repeatable inventory generation

After changing the pinned emulator submodule, regenerate the operation inventory from its Smithy model files and handler markers:

```sh
python3 scripts/generate-phase-1-operations.py
```

The script fails if the submodule checkout is missing and records its exact source commit in `src/data/phase-1-operations.json`.
