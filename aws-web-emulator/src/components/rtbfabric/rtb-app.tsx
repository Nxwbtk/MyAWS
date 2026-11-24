"use client"

import { col, copyField, CountDashboard, dateCol, dateField, MapTags, ServiceRouter, Status, stateCol, stateField, SubTable, sv, tagMap, textField, type FieldSpec, type FormSpec, type ServiceApp, type Values } from "@/components/console/service-app"
import { dash, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { callAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

const M = "rtbfabric"
const base = { tagResource: false, model: M, linkColumn: 0 } as const
const ids = (p: Item) => ((p.gatewayIds as string[] | undefined) ?? []).map((gatewayId) => ({ gatewayId }))
const tagsOf = (v: Values) => { const t = tagMap((v.tags as { Key: string; Value?: string }[]) ?? []); return Object.keys(t).length ? t : undefined }

function linksTab(gateway: Item) {
  return (
    <SubTable
      title="Links"
      description="Links connect a requester gateway to a responder gateway so that bid requests flow between them."
      model={M}
      operation="ListLinks"
      input={{ gatewayId: gateway.gatewayId }}
      items={(p) => (p.links as Item[]) ?? []}
      trackBy={(l) => String(l.linkId)}
      columns={[
        { id: "id", header: "Link ID", cell: (l) => dash(l.linkId) },
        { id: "peer", header: "Peer gateway", cell: (l) => dash(l.peerGatewayId) },
        { id: "direction", header: "Direction", cell: (l) => dash(l.direction) },
        { id: "status", header: "Status", cell: (l) => <Status value={l.status} /> },
        { id: "conn", header: "Connectivity", cell: (l) => dash(l.connectivityType) },
        { id: "created", header: "Created", cell: (l) => consoleDate(sv(l.createdAt)) },
      ]}
      create={{
        title: "Create link",
        sections: [{ title: "Link", fields: [
          { id: "peer", label: "Peer gateway", type: "select", source: { model: M, operation: gateway.port !== undefined ? "ListRequesterGateways" : "ListResponderGateways", items: (p) => ids(p), value: (i) => String(i.gatewayId), label: (i) => String(i.gatewayId) } },
          { id: "errorLog", label: "Error log sampling (%)", type: "number", default: "10" },
          { id: "filterLog", label: "Filter log sampling (%)", type: "number", default: "10" },
          { id: "timeout", label: "Timeout (milliseconds)", type: "number", optional: true },
        ] }],
        submit: async (v) => {
          await callAws(M, "CreateLink", { gatewayId: gateway.gatewayId, peerGatewayId: v.peer, logSettings: { applicationLogs: { sampling: { errorLog: Number(v.errorLog), filterLog: Number(v.filterLog) } } }, ...(sv(v.timeout) ? { timeoutInMillis: Number(v.timeout) } : {}) })
          return "Link requested."
        },
      }}
      actions={[
        { label: "Accept", enabled: (l) => l.status === "PENDING_ACCEPTANCE" || l.status === "REQUESTED", run: (l) => callAws(M, "AcceptLink", { gatewayId: gateway.gatewayId, linkId: l.linkId, logSettings: { applicationLogs: { sampling: { errorLog: 10, filterLog: 10 } } } }) },
        { label: "Reject", enabled: (l) => l.status === "PENDING_ACCEPTANCE" || l.status === "REQUESTED", run: (l) => callAws(M, "RejectLink", { gatewayId: gateway.gatewayId, linkId: l.linkId }) },
      ]}
      remove={{ run: (l) => callAws(M, "DeleteLink", { gatewayId: gateway.gatewayId, linkId: l.linkId }) }}
    />
  )
}

const gatewayDetails = [
  copyField("Gateway ID", (i) => i.gatewayId),
  stateField("Status", "status"),
  textField("Description", (i) => i.description),
  copyField("Domain name", (i) => i.domainName),
  textField("VPC", (i) => i.vpcId),
  textField("Subnets", (i) => i.subnetIds),
  textField("Security groups", (i) => i.securityGroupIds),
  textField("Active links", (i) => `${i.activeLinksCount ?? 0} of ${i.totalLinksCount ?? 0}`),
  dateField("Created", "createdAt"),
  dateField("Last updated", "updatedAt"),
]

const gatewayDef = (kind: "requester" | "responder"): ResourceDef => {
  const Kind = kind === "requester" ? "Requester" : "Responder"
  return {
    ...base,
    path: `/rtbfabric/${kind}-gateways`,
    title: `${Kind} gateways`,
    singular: `${kind} gateway`,
    description: kind === "requester" ? "Requester gateways send bid requests from your supply-side applications." : "Responder gateways receive bid requests for your demand-side applications.",
    operation: `List${Kind}Gateways`,
    items: ids,
    expand: async (i) => ({ ...(await callAws<Item>(M, `Get${Kind}Gateway`, { gatewayId: i.gatewayId })), gatewayId: i.gatewayId }),
    key: (i) => String(i.gatewayId),
    display: (i) => String(i.gatewayId),
    columns: [
      col("id", "Gateway ID", (i) => i.gatewayId),
      stateCol("status"),
      col("desc", "Description", (i) => i.description),
      col("vpc", "VPC", (i) => i.vpcId),
      ...(kind === "responder" ? [col("port", "Port", (i) => i.port), col("protocol", "Protocol", (i) => i.protocol)] : [col("domain", "Domain name", (i) => i.domainName)]),
      col("links", "Active links", (i) => i.activeLinksCount ?? 0),
      dateCol("created", "Created", "createdAt"),
    ],
    details: [...gatewayDetails, ...(kind === "responder" ? [textField("Port", (i) => i.port), textField("Protocol", (i) => i.protocol), textField("Gateway type", (i) => i.gatewayType)] : [])],
    tabs: [
      { id: "links", label: "Links", render: (i) => linksTab(i) },
      { id: "tags", label: "Tags", render: (i) => <MapTags model={M} arn={`arn:aws:rtbfabric:ap-southeast-7:000000000000:gateway/${i.gatewayId}`} /> },
    ],
    create: { label: `Create ${kind} gateway`, href: `/rtbfabric/${kind}-gateways/create` },
    deleteAction: { operation: `Delete${Kind}Gateway`, input: (i) => ({ gatewayId: i.gatewayId }), warning: "Delete the gateway's links first." },
  }
}

const networkFields: FieldSpec[] = [
  { id: "vpc", label: "VPC", type: "select", source: { model: "ec2", operation: "DescribeVpcs", items: (p) => (p.Vpcs as Item[]) ?? [], value: (i) => String(i.VpcId), label: (i) => String(i.VpcId), description: (i) => String(i.CidrBlock) } },
  { id: "subnets", label: "Subnets", type: "multiselect", source: (v) => (sv(v.vpc) ? { model: "ec2", operation: "DescribeSubnets", input: { Filters: [{ Name: "vpc-id", Values: [v.vpc] }] }, items: (p) => (p.Subnets as Item[]) ?? [], value: (i) => String(i.SubnetId), label: (i) => String(i.SubnetId), description: (i) => String(i.AvailabilityZone) } : undefined) },
  { id: "sgs", label: "Security groups", type: "multiselect", source: (v) => (sv(v.vpc) ? { model: "ec2", operation: "DescribeSecurityGroups", input: { Filters: [{ Name: "vpc-id", Values: [v.vpc] }] }, items: (p) => (p.SecurityGroups as Item[]) ?? [], value: (i) => String(i.GroupId), label: (i) => String(i.GroupName), description: (i) => String(i.GroupId) } : undefined) },
  { id: "description", label: "Description", optional: true },
]

const createGateway = (kind: "requester" | "responder"): FormSpec => ({
  title: `Create ${kind} gateway`,
  sections: [
    { title: "Gateway settings", fields: [...networkFields, ...(kind === "responder" ? [
      { id: "domain", label: "Domain name", placeholder: "bidder.example.com", description: "The domain name of your bidder endpoint." },
      { id: "port", label: "Port", type: "number" as const, default: "443" },
      { id: "protocol", label: "Protocol", type: "select" as const, default: "HTTPS", options: [{ value: "HTTPS", label: "HTTPS" }, { value: "HTTP", label: "HTTP" }] },
    ] : [])] },
    { title: "Tags", fields: [{ id: "tags", label: "Tags", type: "tags" }] },
  ],
  submit: async (v) => {
    const common = { vpcId: v.vpc, subnetIds: v.subnets, securityGroupIds: v.sgs, ...(sv(v.description) ? { description: v.description } : {}), tags: tagsOf(v) }
    const r = kind === "requester"
      ? await callAws<Item>(M, "CreateRequesterGateway", common)
      : await callAws<Item>(M, "CreateResponderGateway", { ...common, port: Number(v.port), protocol: v.protocol, ...(sv(v.domain) ? { domainName: v.domain } : {}) })
    return `Gateway ${r.gatewayId} is being created.`
  },
})

export const rtbApp: ServiceApp = {
  id: "rtbfabric",
  name: "AWS RTB Fabric",
  home: "/rtbfabric",
  nav: [
    { type: "link", text: "Dashboard", href: "/rtbfabric" },
    { type: "link", text: "Requester gateways", href: "/rtbfabric/requester-gateways" },
    { type: "link", text: "Responder gateways", href: "/rtbfabric/responder-gateways" },
    { type: "link", text: "External links", href: "/rtbfabric/external-links" },
  ],
  defs: { "requester-gateways": gatewayDef("requester"), "responder-gateways": gatewayDef("responder") },
  creates: { "requester-gateways": createGateway("requester"), "responder-gateways": createGateway("responder") },
  unavailable: { "external-links": "External links" },
  dashboard: () => <CountDashboard app={rtbApp} title="AWS RTB Fabric" description="Connect real-time bidding applications with private, low-latency networking." sections={["requester-gateways", "responder-gateways"]} />,
}

export function RtbFabricApp({ path }: { path: string[] }) {
  return <ServiceRouter app={rtbApp} path={path} />
}
