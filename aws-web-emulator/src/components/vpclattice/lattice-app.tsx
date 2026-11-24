"use client"

import { col, copyField, dateCol, dateField, JsonDocPanel, MapTags, ob, ServiceRouter, stateCol, stateField, Status, SubTable, sv, tagMap, textField, type FormSpec, type ServiceApp } from "@/components/console/service-app"
import { dash, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { callAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

const M = "vpclattice"
const base = { tagResource: false, model: M, linkColumn: 0 } as const
const items = (p: Item) => (p.items as Item[]) ?? []
const tagsOf = (v: { tags?: unknown }) => tagMap((v.tags as { Key: string; Value?: string }[]) ?? [])

const authTab = (arn: unknown, id: string) => (
  <JsonDocPanel
    title="Auth policy"
    description="Auth policies are applied when the auth type is AWS_IAM."
    id={`lattice-auth-${id}`}
    load={async () => sv((await callAws<Item>(M, "GetAuthPolicy", { resourceIdentifier: arn }).catch(() => ({}) as Item)).policy)}
    save={(policy) => callAws(M, "PutAuthPolicy", { resourceIdentifier: arn, policy })}
    remove={() => callAws(M, "DeleteAuthPolicy", { resourceIdentifier: arn })}
  />
)

const services: ResourceDef = {
  ...base,
  path: "/vpclattice/services",
  title: "Lattice services",
  singular: "service",
  description: "A service is an independently deployable unit of software that delivers a specific task or function.",
  operation: "ListServices",
  items,
  key: (i) => String(i.id),
  display: (i) => String(i.name),
  columns: [col("name", "Name", (i) => i.name), col("id", "ID", (i) => i.id), stateCol("status"), col("domain", "Domain name", (i) => ob(i.dnsEntry).domainName), col("custom", "Custom domain name", (i) => i.customDomainName), dateCol("created", "Created", "createdAt")],
  details: [
    textField("Name", (i) => i.name),
    copyField("ID", (i) => i.id),
    copyField("ARN", (i) => i.arn),
    stateField("Status", "status"),
    copyField("Domain name", (i) => ob(i.dnsEntry).domainName),
    textField("Custom domain name", (i) => i.customDomainName),
    dateField("Created", "createdAt"),
    dateField("Last updated", "lastUpdatedAt"),
  ],
  tabs: [
    {
      id: "associations",
      label: "Service network associations",
      render: (i) => (
        <SubTable
          title="Service network associations"
          model={M}
          operation="ListServiceNetworkServiceAssociations"
          input={{ serviceIdentifier: i.id }}
          items={items}
          trackBy={(a) => String(a.id)}
          columns={[
            { id: "id", header: "Association ID", cell: (a) => dash(a.id) },
            { id: "sn", header: "Service network", cell: (a) => dash(a.serviceNetworkName ?? a.serviceNetworkId) },
            { id: "status", header: "Status", cell: (a) => <Status value={a.status} /> },
            { id: "created", header: "Created", cell: (a) => consoleDate(sv(a.createdAt)) },
          ]}
          create={{
            title: "Associate with service network",
            sections: [{ title: "Association", fields: [{ id: "sn", label: "Service network ID or ARN", placeholder: "sn-0123456789abcdef0", description: "Listing service networks isn't available in the local emulator, so enter the ID." }] }],
            submit: async (v) => { await callAws(M, "CreateServiceNetworkServiceAssociation", { serviceIdentifier: i.id, serviceNetworkIdentifier: v.sn }); return "Association created." },
          }}
          remove={{ label: "Disassociate", run: (a) => callAws(M, "DeleteServiceNetworkServiceAssociation", { serviceNetworkServiceAssociationIdentifier: a.id }) }}
        />
      ),
    },
    { id: "auth", label: "Access", render: (i) => authTab(i.arn, String(i.id)) },
    { id: "tags", label: "Tags", render: (i) => <MapTags model={M} arn={String(i.arn)} /> },
  ],
  create: { label: "Create service", href: "/vpclattice/services/create" },
  deleteAction: { operation: "DeleteService", input: (i) => ({ serviceIdentifier: i.id }), warning: "Remove the service's service network associations first." },
}

const unlisted = (path: string, title: string, singular: string, operation: string, extra?: Partial<ResourceDef>): ResourceDef => ({
  ...base,
  path,
  title,
  singular,
  operation,
  items,
  key: (i) => String(i.id),
  display: (i) => String(i.name),
  columns: [col("name", "Name", (i) => i.name), col("id", "ID", (i) => i.id), stateCol("status"), dateCol("created", "Created", "createdAt")],
  details: [textField("Name", (i) => i.name), copyField("ID", (i) => i.id), copyField("ARN", (i) => i.arn)],
  ...extra,
})

const serviceNetworks = unlisted("/vpclattice/service-networks", "Service networks", "service network", "ListServiceNetworks", {
  description: "A service network is a logical boundary for a collection of services and resource configurations.",
  create: { label: "Create service network", href: "/vpclattice/service-networks/create" },
})
const targetGroups = unlisted("/vpclattice/target-groups", "Target groups", "target group", "ListTargetGroups", { create: { label: "Create target group", href: "/vpclattice/target-groups/create" } })
const resourceGateways = unlisted("/vpclattice/resource-gateways", "Resource gateways", "resource gateway", "ListResourceGateways")
const resourceConfigurations = unlisted("/vpclattice/resource-configurations", "Resource configurations", "resource configuration", "ListResourceConfigurations")

const createService: FormSpec = {
  title: "Create service",
  sections: [
    { title: "Identifiers", fields: [
      { id: "name", label: "Service name", constraint: "3-40 characters: lowercase letters, numbers, and hyphens. Must begin and end with a letter or number." },
      { id: "custom", label: "Custom domain name", optional: true, placeholder: "parking.example.com" },
    ] },
    { title: "Service access", fields: [
      { id: "auth", label: "Auth type", type: "select", default: "NONE", options: [{ value: "NONE", label: "None", description: "Allow all requests from clients in associated VPCs." }, { value: "AWS_IAM", label: "AWS IAM", description: "Apply an auth policy to control access." }] },
    ] },
    { title: "Tags", fields: [{ id: "tags", label: "Tags", type: "tags" }] },
  ],
  valid: (v) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(String(v.name)),
  submit: async (v) => {
    await callAws(M, "CreateService", { name: v.name, authType: v.auth, ...(sv(v.custom) ? { customDomainName: v.custom } : {}), tags: tagsOf(v) })
    return `Service ${v.name} is being created.`
  },
}

const createServiceNetwork: FormSpec = {
  title: "Create service network",
  description: "Listing service networks isn't available in the local emulator. After you create it, note the ID to associate services.",
  sections: [
    { title: "Identifiers", fields: [{ id: "name", label: "Name", constraint: "3-63 characters: lowercase letters, numbers, and hyphens." }] },
    { title: "Access", fields: [{ id: "auth", label: "Auth type", type: "select", default: "NONE", options: [{ value: "NONE", label: "None" }, { value: "AWS_IAM", label: "AWS IAM" }] }] },
    { title: "Tags", fields: [{ id: "tags", label: "Tags", type: "tags" }] },
  ],
  valid: (v) => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(String(v.name)),
  submit: async (v) => {
    const r = await callAws<Item>(M, "CreateServiceNetwork", { name: v.name, authType: v.auth, tags: tagsOf(v) })
    return `Service network ${v.name} created with ID ${r.id}.`
  },
  after: () => "/vpclattice/services",
}

const createTargetGroup: FormSpec = {
  title: "Create target group",
  description: "Listing target groups isn't available in the local emulator.",
  sections: [
    { title: "Basic configuration", fields: [
      { id: "type", label: "Target type", type: "select", default: "INSTANCE", options: [{ value: "INSTANCE", label: "Instances" }, { value: "IP", label: "IP addresses" }, { value: "LAMBDA", label: "Lambda function" }, { value: "ALB", label: "Application Load Balancer" }] },
      { id: "name", label: "Target group name" },
      { id: "protocol", label: "Protocol", type: "select", default: "HTTPS", options: ["HTTP", "HTTPS", "TCP"].map((p) => ({ value: p, label: p })), show: (v) => v.type !== "LAMBDA" },
      { id: "port", label: "Port", type: "number", default: "443", show: (v) => v.type !== "LAMBDA" },
      { id: "vpc", label: "VPC", type: "select", show: (v) => v.type !== "LAMBDA", source: { model: "ec2", operation: "DescribeVpcs", items: (p) => (p.Vpcs as Item[]) ?? [], value: (i) => String(i.VpcId), label: (i) => String(i.VpcId), description: (i) => String(i.CidrBlock) } },
    ] },
  ],
  submit: async (v) => {
    const r = await callAws<Item>(M, "CreateTargetGroup", { name: v.name, type: v.type, ...(v.type !== "LAMBDA" ? { config: { protocol: v.protocol, port: Number(v.port), vpcIdentifier: v.vpc } } : {}) })
    return `Target group ${v.name} created with ID ${r.id}.`
  },
  after: () => "/vpclattice/services",
}

export const latticeApp: ServiceApp = {
  id: "vpclattice",
  name: "VPC Lattice",
  home: "/vpclattice/services",
  nav: [
    { type: "link", text: "Service networks", href: "/vpclattice/service-networks" },
    { type: "link", text: "Lattice services", href: "/vpclattice/services" },
    { type: "link", text: "Resource configurations", href: "/vpclattice/resource-configurations" },
    { type: "link", text: "Resource gateways", href: "/vpclattice/resource-gateways" },
    { type: "link", text: "Target groups", href: "/vpclattice/target-groups" },
    { type: "divider" },
    { type: "link", text: "VPC console", href: "/vpc" },
  ],
  defs: { services, "service-networks": serviceNetworks, "target-groups": targetGroups, "resource-gateways": resourceGateways, "resource-configurations": resourceConfigurations },
  creates: { services: createService, "service-networks": createServiceNetwork, "target-groups": createTargetGroup },
}

export function VpcLatticeApp({ path }: { path: string[] }) {
  return <ServiceRouter app={latticeApp} path={path.length ? path : ["services"]} />
}
