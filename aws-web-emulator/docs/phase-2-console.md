# Phase 2 console status

Phase 2 adds resource workspaces for all 13 networking, content delivery, and recovery services in the roadmap. The emulator source is pinned at `c29ca200a147e8100a600a7aaaf26acf82d31158` in `aws-emulator`.

## Service consoles

Every Phase 2 service has a dedicated console built with [Cloudscape](https://cloudscape.design/) that follows the navigation, wording, and workflows of the real AWS Management Console. Features that need an API the local emulator doesn't implement stay visible but disabled, with the reason shown. The consoles send requests only to the local emulator configured for MyAWS.

| Service | Folder under `src/components/` | Console areas |
| --- | --- | --- |
| Route 53 | `route53` | Dashboard, hosted zones and records (create, edit, delete, test record), DNSSEC, health checks, Profiles, Global Resolver, VPC Resolver endpoints/rules/query logging, registered domains and requests, CIDR collections, traffic policies and policy records |
| Elastic Load Balancing | `ec2/defs-elb.tsx` | Load balancers with listeners, network mapping, security, attributes, and tags; target groups with targets and health checks; trust stores; create pages. Opens inside the EC2 console, as in AWS. |
| CloudFront | `cloudfront` | Distributions (create, enable/disable, delete), settings, origins, behaviors, error pages, invalidations, tags; cache, origin request, and response headers policies; Functions (code, test, publish, associations); origin access controls, public keys, key groups, key value stores |
| AWS Certificate Manager | `acm` | Certificates, request public certificate, import and reimport, domain validation records with one-click Route 53 record creation, export, tags |
| Global Accelerator | `globalaccelerator` | Accelerators (create standard or custom routing, enable/disable, delete), listeners, endpoint groups, flow log attributes, tags |
| Cloud Map | `servicediscovery` | Namespaces (HTTP, private DNS, public DNS), services, service instances, operations, tags |
| VPC Lattice | `vpclattice` | Lattice services with service network associations, auth policy, and tags; create service networks and target groups |
| Direct Connect | `directconnect` | Dashboard, connections, virtual interfaces (private), Direct Connect gateways with gateway associations, resiliency groups |
| Interconnect | `interconnect` | Multicloud connections, partner environments, tags |
| Network Manager | `networkmanager` | Dashboard, global networks with sites, devices, links, transit gateway registrations, core network attachments, tags; attachments; peerings |
| App Mesh | `appmesh` | Meshes with virtual nodes and egress filter |
| RTB Fabric | `rtbfabric` | Dashboard, requester and responder gateways with links (create, accept, reject, delete) and tags |
| Application Recovery Controller (ARC) | `arc` | Region switch plans, zonal shifts and managed resources, routing control clusters and control panels (routing controls, safety rules), recovery groups, cells, resource sets, readiness checks |

Global Accelerator, Cloud Map, VPC Lattice, Direct Connect, Interconnect, Network Manager, App Mesh, RTB Fabric, and ARC are built on a shared declarative framework in `src/components/console/service-app.tsx`: resource lists and detail pages, create forms, sub-resource tables, tag editors, and policy documents are described as data.

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

- `npx tsc --noEmit` and ESLint pass for every console.
- Every console was opened in the browser against the local emulator. Its list and detail pages were checked, and its main create, update, and delete workflows were run through the UI or the emulator API. Examples include a Route 53 record change, an ACM certificate request and import, a CloudFront distribution create and delete, and a CloudFront function test and publish. Others are a Global Accelerator listener and endpoint group, a Cloud Map instance registration, and a VPC Lattice association. The rest are a Direct Connect virtual interface, an Interconnect connection, a Network Manager site, an App Mesh virtual node, an RTB Fabric link accepted on the responder gateway, and an ARC zonal shift and routing control.
- The CloudFront KeyValueStore data API (`cloudfrontkeyvaluestore`) fails with "Invalid URL" through the emulator proxy. The key value store page shows a notice instead of key value pairs.
- No real AWS resources were created, changed, or deleted.
