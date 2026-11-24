"use client"

import { col, copyField, dateCol, dateField, LinkTo, ob, ServiceRouter, stateCol, SubTable, sv, tagList, TagsPanel, textField, token, CountDashboard, type FormSpec, type ServiceApp } from "@/components/console/service-app"
import { dash, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { callAws } from "@/lib/aws"

const M = "servicediscovery"
const nsType: Record<string, string> = { HTTP: "API calls", DNS_PUBLIC: "API calls and public DNS queries", DNS_PRIVATE: "API calls and DNS queries in VPCs" }

const tags = (arn: unknown) => (
  <TagsPanel
    id={String(arn)}
    load={async () => ((await callAws<{ Tags?: { Key: string; Value: string }[] }>(M, "ListTagsForResource", { ResourceARN: arn })).Tags ?? [])}
    save={async (add, remove) => {
      if (remove.length) await callAws(M, "UntagResource", { ResourceARN: arn, TagKeys: remove })
      if (add.length) await callAws(M, "TagResource", { ResourceARN: arn, Tags: tagList(add) })
    }}
  />
)

const serviceForm = (namespaceId?: string): FormSpec => ({
  title: "Create service",
  sections: [
    { title: "Service configuration", fields: [
      { id: "ns", label: "Namespace", type: "select", default: namespaceId ?? "", show: () => !namespaceId, source: { model: M, operation: "ListNamespaces", items: (p) => (p.Namespaces as Item[]) ?? [], value: (i) => String(i.Id), label: (i) => String(i.Name), description: (i) => String(i.Type) } },
      { id: "name", label: "Service name", constraint: "Up to 127 characters: letters, numbers, periods, hyphens, and underscores." },
      { id: "description", label: "Service description", optional: true },
      { id: "discovery", label: "Service discovery configuration", type: "select", default: "API", options: [{ value: "API", label: "API calls", description: "Instances are discoverable using DiscoverInstances." }, { value: "DNS", label: "API calls and DNS queries", description: "Requires a DNS namespace." }] },
      { id: "recordType", label: "DNS record type", type: "select", default: "A", options: ["A", "AAAA", "SRV", "CNAME"].map((v) => ({ value: v, label: v })), show: (v) => v.discovery === "DNS" },
      { id: "ttl", label: "TTL (seconds)", type: "number", default: "60", show: (v) => v.discovery === "DNS" },
      { id: "health", label: "Health check configuration", type: "select", default: "none", options: [{ value: "none", label: "No health check" }, { value: "custom", label: "Custom health check (reported by your application)" }, { value: "route53", label: "Route 53 health check", description: "Public DNS namespaces only." }] },
      { id: "threshold", label: "Failure threshold", type: "number", default: "1", show: (v) => v.health !== "none" },
      { id: "hcType", label: "Health check protocol", type: "select", default: "HTTP", options: ["HTTP", "HTTPS", "TCP"].map((v) => ({ value: v, label: v })), show: (v) => v.health === "route53" },
      { id: "hcPath", label: "Health check path", optional: true, placeholder: "/", show: (v) => v.health === "route53" && v.hcType !== "TCP" },
    ] },
    { title: "Tags", fields: [{ id: "tags", label: "Tags", type: "tags" }] },
  ],
  submit: async (v) => {
    await callAws(M, "CreateService", {
      Name: v.name,
      NamespaceId: namespaceId ?? v.ns,
      Description: sv(v.description),
      CreatorRequestId: token(),
      ...(v.discovery === "DNS" ? { DnsConfig: { RoutingPolicy: v.recordType === "CNAME" ? "WEIGHTED" : "MULTIVALUE", DnsRecords: [{ Type: v.recordType, TTL: Number(v.ttl) || 60 }] } } : { Type: "HTTP" }),
      ...(v.health === "custom" ? { HealthCheckCustomConfig: { FailureThreshold: Number(v.threshold) || 1 } } : {}),
      ...(v.health === "route53" ? { HealthCheckConfig: { Type: v.hcType, FailureThreshold: Number(v.threshold) || 1, ...(sv(v.hcPath) ? { ResourcePath: v.hcPath } : {}) } } : {}),
      Tags: tagList((v.tags as { Key: string; Value?: string }[]) ?? []),
    })
    return `Service ${v.name} created.`
  },
})

const namespaces: ResourceDef = {
  tagResource: false,
  path: "/servicediscovery/namespaces",
  title: "Namespaces",
  singular: "namespace",
  description: "A namespace is a logical group of services that share a domain name or a name for API discovery.",
  model: M,
  operation: "ListNamespaces",
  items: (p) => (p.Namespaces as Item[]) ?? [],
  key: (i) => String(i.Id),
  display: (i) => String(i.Name),
  linkColumn: 0,
  columns: [
    col("name", "Namespace name", (i) => i.Name),
    col("id", "Namespace ID", (i) => i.Id),
    col("type", "Instance discovery", (i) => nsType[String(i.Type)] ?? i.Type),
    col("services", "Services", (i) => i.ServiceCount),
    col("desc", "Description", (i) => i.Description),
    dateCol("created", "Creation time", "CreateDate"),
  ],
  details: [
    textField("Namespace name", (i) => i.Name),
    copyField("Namespace ID", (i) => i.Id),
    copyField("ARN", (i) => i.Arn),
    textField("Instance discovery", (i) => nsType[String(i.Type)] ?? i.Type),
    textField("Description", (i) => i.Description),
    textField("Hosted zone", (i) => ob(ob(i.Properties).DnsProperties).HostedZoneId),
    textField("HTTP name", (i) => ob(ob(i.Properties).HttpProperties).HttpName),
    dateField("Creation time", "CreateDate"),
  ],
  tabs: [
    {
      id: "services",
      label: "Services",
      render: (i) => (
        <SubTable
          title="Services"
          model={M}
          operation="ListServices"
          input={{ Filters: [{ Name: "NAMESPACE_ID", Values: [i.Id], Condition: "EQ" }] }}
          items={(p) => (p.Services as Item[]) ?? []}
          trackBy={(s) => String(s.Id)}
          columns={[
            { id: "name", header: "Service name", cell: (s) => <LinkTo href={`/servicediscovery/services/${s.Id}`}>{String(s.Name)}</LinkTo> },
            { id: "id", header: "Service ID", cell: (s) => dash(s.Id) },
            { id: "instances", header: "Instances", cell: (s) => dash(s.InstanceCount ?? 0) },
            { id: "type", header: "Discovery", cell: (s) => (((ob(s.DnsConfig).DnsRecords as unknown[] | undefined) ?? []).length ? "API calls and DNS queries" : "API calls") },
            { id: "desc", header: "Description", cell: (s) => dash(s.Description) },
          ]}
          create={serviceForm(String(i.Id))}
          remove={{ run: (s) => callAws(M, "DeleteService", { Id: s.Id }) }}
        />
      ),
    },
    { id: "tags", label: "Tags", render: (i) => tags(i.Arn) },
  ],
  create: { label: "Create namespace", href: "/servicediscovery/namespaces/create" },
  deleteAction: { operation: "DeleteNamespace", input: (i) => ({ Id: i.Id }), warning: "You must delete all services in the namespace first." },
}

const services: ResourceDef = {
  tagResource: false,
  path: "/servicediscovery/services",
  title: "Services",
  singular: "service",
  description: "Services in all namespaces in this Region.",
  model: M,
  operation: "ListServices",
  items: (p) => (p.Services as Item[]) ?? [],
  key: (i) => String(i.Id),
  display: (i) => String(i.Name),
  linkColumn: 0,
  columns: [
    col("name", "Service name", (i) => i.Name),
    col("id", "Service ID", (i) => i.Id),
    col("instances", "Instances", (i) => i.InstanceCount ?? 0),
    col("type", "Discovery", (i) => (((ob(i.DnsConfig).DnsRecords as unknown[] | undefined) ?? []).length ? "API calls and DNS queries" : "API calls")),
    col("desc", "Description", (i) => i.Description),
    dateCol("created", "Creation time", "CreateDate"),
  ],
  details: [
    textField("Service name", (i) => i.Name),
    copyField("Service ID", (i) => i.Id),
    copyField("ARN", (i) => i.Arn),
    textField("Description", (i) => i.Description),
    textField("DNS records", (i) => ((ob(i.DnsConfig).DnsRecords as Item[] | undefined) ?? []).map((r) => `${r.Type} (TTL ${r.TTL})`)),
    textField("Routing policy", (i) => ob(i.DnsConfig).RoutingPolicy),
    textField("Health check", (i) => (i.HealthCheckConfig ? `Route 53 (${ob(i.HealthCheckConfig).Type})` : i.HealthCheckCustomConfig ? "Custom" : "None")),
    dateField("Creation time", "CreateDate"),
  ],
  tabs: [
    {
      id: "instances",
      label: "Service instances",
      render: (i) => (
        <SubTable
          title="Service instances"
          model={M}
          operation="ListInstances"
          input={{ ServiceId: i.Id }}
          items={(p) => (p.Instances as Item[]) ?? []}
          trackBy={(x) => String(x.Id)}
          columns={[
            { id: "id", header: "Service instance ID", cell: (x) => dash(x.Id) },
            { id: "ip", header: "IPv4 address", cell: (x) => dash(ob(x.Attributes).AWS_INSTANCE_IPV4) },
            { id: "port", header: "Port", cell: (x) => dash(ob(x.Attributes).AWS_INSTANCE_PORT) },
            { id: "attrs", header: "Custom attributes", cell: (x) => Object.entries(ob(x.Attributes)).filter(([k]) => !k.startsWith("AWS_")).map(([k, v]) => `${k}=${v}`).join(", ") || "–" },
          ]}
          create={{
            title: "Register service instance",
            sections: [{ title: "Instance", fields: [
              { id: "id", label: "Service instance ID", constraint: "Up to 64 characters." },
              { id: "ip", label: "IPv4 address", optional: true, placeholder: "192.0.2.44" },
              { id: "port", label: "Port", type: "number", optional: true },
              { id: "attrs", label: "Custom attributes", type: "tags" },
            ] }],
            valid: (v) => Boolean(sv(v.ip)) || ((v.attrs as unknown[]) ?? []).length > 0,
            submit: async (v) => {
              const Attributes: Record<string, string> = Object.fromEntries(((v.attrs as { Key: string; Value?: string }[]) ?? []).filter((t) => t.Key).map((t) => [t.Key, t.Value ?? ""]))
              if (sv(v.ip)) Attributes.AWS_INSTANCE_IPV4 = String(v.ip)
              if (sv(v.port)) Attributes.AWS_INSTANCE_PORT = String(v.port)
              await callAws(M, "RegisterInstance", { ServiceId: i.Id, InstanceId: v.id, CreatorRequestId: token(), Attributes })
              return `Service instance ${v.id} registered.`
            },
          }}
          remove={{ label: "Deregister", run: (x) => callAws(M, "DeregisterInstance", { ServiceId: i.Id, InstanceId: x.Id }) }}
        />
      ),
    },
    { id: "tags", label: "Tags", render: (i) => tags(i.Arn) },
  ],
  create: { label: "Create service", href: "/servicediscovery/services/create" },
  deleteAction: { operation: "DeleteService", input: (i) => ({ Id: i.Id }), warning: "You must deregister all service instances first." },
}

const operations: ResourceDef = {
  tagResource: false,
  path: "/servicediscovery/operations",
  title: "Operations",
  singular: "operation",
  description: "Asynchronous operations such as creating and deleting namespaces.",
  model: M,
  operation: "ListOperations",
  items: (p) => (p.Operations as Item[]) ?? [],
  key: (i) => String(i.Id),
  noDetailPage: true,
  columns: [col("id", "Operation ID", (i) => i.Id), stateCol("Status")],
  details: [],
}

const createNamespace: FormSpec = {
  title: "Create namespace",
  sections: [
    { title: "Namespace", fields: [
      { id: "name", label: "Namespace name", placeholder: "example.com", constraint: "For DNS namespaces, enter a domain name." },
      { id: "description", label: "Namespace description", optional: true },
      { id: "type", label: "Instance discovery", type: "select", default: "HTTP", options: [{ value: "HTTP", label: "API calls" }, { value: "DNS_PRIVATE", label: "API calls and DNS queries in VPCs" }, { value: "DNS_PUBLIC", label: "API calls and public DNS queries" }] },
      { id: "vpc", label: "VPC", type: "select", show: (v) => v.type === "DNS_PRIVATE", source: { model: "ec2", operation: "DescribeVpcs", items: (p) => (p.Vpcs as Item[]) ?? [], value: (i) => String(i.VpcId), label: (i) => String(i.VpcId), description: (i) => String(i.CidrBlock) } },
      { id: "ttl", label: "SOA record TTL (seconds)", type: "number", default: "15", show: (v) => v.type !== "HTTP" },
    ] },
    { title: "Tags", fields: [{ id: "tags", label: "Tags", type: "tags" }] },
  ],
  submit: async (v) => {
    const common = { Name: v.name, Description: sv(v.description), CreatorRequestId: token(), Tags: tagList((v.tags as { Key: string; Value?: string }[]) ?? []) }
    const props = { Properties: { DnsProperties: { SOA: { TTL: Number(v.ttl) || 15 } } } }
    if (v.type === "HTTP") await callAws(M, "CreateHttpNamespace", common)
    else if (v.type === "DNS_PRIVATE") await callAws(M, "CreatePrivateDnsNamespace", { ...common, Vpc: v.vpc, ...props })
    else await callAws(M, "CreatePublicDnsNamespace", { ...common, ...props })
    return `Namespace ${v.name} is being created.`
  },
}

export const cmApp: ServiceApp = {
  id: "servicediscovery",
  name: "AWS Cloud Map",
  home: "/servicediscovery/namespaces",
  nav: [
    { type: "link", text: "Namespaces", href: "/servicediscovery/namespaces" },
    { type: "link", text: "Services", href: "/servicediscovery/services" },
    { type: "link", text: "Operations", href: "/servicediscovery/operations" },
  ],
  defs: { namespaces, services, operations },
  creates: { namespaces: createNamespace, services: serviceForm() },
  dashboard: () => <CountDashboard app={cmApp} title="AWS Cloud Map" description="Cloud Map is a cloud resource discovery service." sections={["namespaces", "services"]} />,
}

export function CloudMapApp({ path }: { path: string[] }) {
  return <ServiceRouter app={cmApp} path={path.length ? path : ["namespaces"]} />
}
