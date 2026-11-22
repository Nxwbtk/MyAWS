# Phase 2 console status

Phase 2 adds resource workspaces for all 13 networking, content delivery, and recovery services in the roadmap. The emulator source is pinned at `c29ca200a147e8100a600a7aaaf26acf82d31158` in `aws-emulator`.

## Service workspaces

Each service page is searchable, can be opened from its own service route, and is included in Recently visited. Resource areas call the local emulator through the same AWS SDK-backed route as Phase 1. The operation explorer exposes request and response shapes, Smithy documentation, handler source status, and JavaScript SDK command availability for every model operation.

| Service | Resource areas and workflows |
| --- | --- |
| Route 53 | Hosted zones and record sets, health checks, traffic policies, registered domains, Resolver endpoints/rules/query logs, Route 53 Profiles and associations, Global Resolver resources, DNS views, and firewall domain lists. Supports hosted-zone and health-check create/delete plus record changes. |
| Elastic Load Balancing | Classic and v2 load balancers, listeners, target groups, and target health. |
| CloudFront | Distributions, invalidations, Functions, origin access controls/identities, key-value stores and keys, cache/origin/response policies, static anycast IPs, VPC origins, SaaS tenant resources, trust stores, key groups/public keys, field-level encryption, and continuous-deployment policies. |
| AWS Certificate Manager | Certificate inventory, details, request/import actions, and ACME accounts, endpoints, validations, and external bindings. |
| Global Accelerator | Accelerators, listeners, and endpoint groups; supports accelerator creation and lifecycle through the operation explorer. |
| Cloud Map | Namespaces, services, and instances; supports namespace/service creation, instance registration/deregistration, and service deletion. |
| VPC Lattice | Services, service-network associations, target groups, and targets. Supports service, service-network, target-group, and service-network association workflows. Manual identifier selectors cover emulator list operations that are currently stubs. |
| Direct Connect | Connections, virtual interfaces, Direct Connect gateways, locations, and resiliency groups. |
| Interconnect | Provider environments, connections, and environment-scoped attach points. |
| Network Manager | Global networks, sites, devices, links, connections, attachments, and peerings. |
| App Mesh | Meshes and virtual nodes with detail views. |
| RTB Fabric | Requester/responder gateway identifiers and their links, including primitive-array responses. |
| Application Recovery Controller (ARC) | Region-switch plans and executions, zonal shifts and managed resources, recovery clusters/control panels/routing controls/safety rules, and readiness checks/groups/cells/resource sets. |

Resource lists include operation-specific pagination where modeled, details where the service has a describe/get call, linked selectors, and supported row actions. Less common or less-developed workflows remain available through the model-backed operation explorer, which accepts JSON inputs. That explorer reports emulator and SDK support explicitly; it does not imply AWS feature parity where the emulator source contains a stub.

## Emulator operation inventory

Inventory generated from the pinned emulator source with `scripts/generate-phase-2-operations.py`:

| Service | Models | Operations | Implemented | Explicit stubs | No handler |
| --- | --- | ---: | ---: | ---: | ---: |
| App Mesh | `appmesh` | 38 | 10 | 28 | 0 |
| ARC | `arcregionswitch`, `arczonalshift`, `route53recoverycluster`, `route53recoverycontrolconfig`, `route53recoveryreadiness` | 98 | 92 | 6 | 0 |
| ACM | `acm` | 40 | 40 | 0 | 0 |
| Cloud Map | `servicediscovery` | 30 | 30 | 0 | 0 |
| CloudFront | `cloudfront`, `cloudfrontkeyvaluestore` | 173 | 159 | 14 | 0 |
| Direct Connect | `directconnect` | 73 | 20 | 51 | 2 |
| Elastic Load Balancing | `elasticloadbalancing`, `elasticloadbalancingv2` | 80 | 73 | 7 | 0 |
| Global Accelerator | `globalaccelerator` | 56 | 25 | 31 | 0 |
| Interconnect | `interconnect` | 13 | 13 | 0 | 0 |
| Network Manager | `networkmanager` | 95 | 94 | 1 | 0 |
| Route 53 | `route53`, `route53domains`, `route53globalresolver`, `route53profiles`, `route53resolver` | 242 | 180 | 62 | 0 |
| RTB Fabric | `rtbfabric` | 36 | 26 | 10 | 0 |
| VPC Lattice | `vpclattice` | 73 | 35 | 38 | 0 |
| **Total** | **23 models** | **1,047** | **797** | **248** | **2** |

All 797 source-implemented operations have a command in the installed JavaScript SDK clients. The 248 stubs are emulator operations that explicitly return `NotImplemented`; the two Direct Connect operations without handlers also are not counted as supported. There are no retired operations in this Phase 2 inventory.

The [machine-readable inventory](../src/data/phase-2-operations.json) records every operation name, status, source file, request/response shape, and SDK command availability. Per-model counts are:

| Model | Operations | Implemented | Stubs | No handler |
| --- | ---: | ---: | ---: | ---: |
| `appmesh` | 38 | 10 | 28 | 0 |
| `arcregionswitch` | 22 | 18 | 4 | 0 |
| `arczonalshift` | 15 | 14 | 1 | 0 |
| `route53recoverycluster` | 4 | 4 | 0 | 0 |
| `route53recoverycontrolconfig` | 25 | 24 | 1 | 0 |
| `route53recoveryreadiness` | 32 | 32 | 0 | 0 |
| `acm` | 40 | 40 | 0 | 0 |
| `servicediscovery` | 30 | 30 | 0 | 0 |
| `cloudfront` | 167 | 153 | 14 | 0 |
| `cloudfrontkeyvaluestore` | 6 | 6 | 0 | 0 |
| `directconnect` | 73 | 20 | 51 | 2 |
| `elasticloadbalancing` | 29 | 23 | 6 | 0 |
| `elasticloadbalancingv2` | 51 | 50 | 1 | 0 |
| `globalaccelerator` | 56 | 25 | 31 | 0 |
| `interconnect` | 13 | 13 | 0 | 0 |
| `networkmanager` | 95 | 94 | 1 | 0 |
| `route53` | 71 | 69 | 2 | 0 |
| `route53domains` | 35 | 15 | 20 | 0 |
| `route53globalresolver` | 48 | 10 | 38 | 0 |
| `route53profiles` | 16 | 15 | 1 | 0 |
| `route53resolver` | 72 | 71 | 1 | 0 |
| `rtbfabric` | 36 | 26 | 10 | 0 |
| `vpclattice` | 73 | 35 | 38 | 0 |

The two Direct Connect operations with no handler are `DescribeCustomerMetadata` and `DescribeVirtualGateways`. These counts describe source support in the pinned emulator, not AWS support and not successful execution of every operation. A stub remains unavailable even when the AWS console has a corresponding control.

The emulator limits visible in the service workspaces include:

- Route 53 has 62 stubs, concentrated in Domains (20) and Global Resolver (38); the base Route 53 model has two stubs and Profiles/Resolver have one each.
- Direct Connect has 51 stubs and two operations without handlers. In particular, LAG lifecycle operations such as `CreateLag`, `DeleteLag`, and `DescribeLags` are unavailable.
- Global Accelerator has 31 stubs. Its AWS Console exposes Cross-account attachments, but the registered Phase 2 SDK model has no corresponding attachment workflow.
- VPC Lattice has 38 stubs. `ListServiceNetworks` and `ListTargetGroups` are unavailable in this emulator build, so related identifier fields are entered manually. Creating an IP target group needs `port`, `protocol`, and `vpcIdentifier` in its target-group configuration.
- App Mesh has 28 stubs out of 38; only 10 operations are source-implemented.
- RTB Fabric has 10 stubs out of 36.
- CloudFront has 14 stubs across the distribution and key-value-store models.
- Network Manager has one stub: `ListCoreNetworks`, which limits Cloud WAN-specific inventory.
- ELB has seven stubs, ARC six, ACM/Cloud Map/Interconnect none.

These counts describe source support in the pinned emulator, not AWS support and not successful execution of every operation. A stub remains unavailable even when the AWS console has a corresponding control.

## AWS Console comparison

The authenticated AWS Console was inspected read-only in region `ap-southeast-7`; App Mesh and RTB Fabric were also inspected in `ap-southeast-1` after the console marked RTB Fabric unavailable in Thailand. Navigation and representative list/detail flows were compared for all 13 services. App Mesh displayed an end-of-support notice: the service was no longer available as of September 30, 2026, with remaining resources accessible until March 30, 2027; its selected-region console page was a service landing page rather than an active resource inventory. See the [AWS migration notice](https://aws.amazon.com/blogs/containers/migrating-from-aws-app-mesh-to-amazon-ecs-service-connect/). RTB Fabric was available in Singapore and exposed Dashboard, Requester gateways, Responder gateways, and module-marketplace navigation; the requester-gateway inventory showed the account's current empty state and a create entry point. No real AWS resources were created, changed, or deleted.

The comparison covered the primary console navigation and inventory patterns: Route 53 zones/domains/Resolver and Profiles; load balancers/listeners/target groups; CloudFront distributions/policies/functions/origin access and related resource areas; certificate and ACME navigation; accelerator, Cloud Map, VPC Lattice, Direct Connect and Interconnect inventory; Network Manager topology; ARC region/zonal recovery and readiness; and RTB Fabric requester/responder gateways and module marketplace. AWS menu coverage can vary by account permissions, region, service lifecycle, and enabled features.

## Verification record

- `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass.
- All 13 service routes return HTTP 200 from the running frontend, and render both the local resource workspace and API operation explorer.
- The operation catalog was queried for all 23 models. It exposes JavaScript SDK commands for all 797 source-implemented operations and excludes unsupported operations from runnable status.
- The 60 list operations that did not require fixture identifiers returned successfully against an isolated blank emulator. Two calls needed service-specific identifiers: `interconnect.ListAttachPoints` requires `environmentId`, and `vpclattice.ListServiceNetworkServiceAssociations` requires `serviceIdentifier` or `serviceNetworkIdentifier`. The workspace now provides selectors/manual identifier entry for both.
- Isolated fixture workflows passed for Route 53 hosted-zone create/list-record-sets/delete; ACM request/describe/delete; Cloud Map namespace/service/instance registration and cleanup; Global Accelerator create/list/delete; VPC Lattice service and target-group creation with required target-group configuration; App Mesh mesh create/list/delete; Network Manager global-network create/describe/delete; ARC cluster/control-panel/routing-control create/list/delete; and CloudFront KeyValueStore create/list.
- All fixture calls used a disposable local emulator with temporary state. That container and state are removed after verification. They did not use or change the user's running emulator on port 9297 or real AWS resources.

These are representative resource and lifecycle checks, not a request-by-request test of all 797 implemented operations. Features whose upstream handler is stubbed or absent remain documented as emulator gaps rather than being presented as verified workflows.
