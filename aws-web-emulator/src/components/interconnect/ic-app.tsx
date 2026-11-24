"use client"

import { col, copyField, MapTags, ServiceRouter, stateCol, stateField, sv, tagMap, textField, type FormSpec, type ServiceApp } from "@/components/console/service-app"
import { type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { callAws } from "@/lib/aws"

const M = "interconnect"
const base = { tagResource: false, model: M, linkColumn: 0 } as const
const provider = (i: Item) => String(((i.provider as Item | undefined) ?? {}).cloudServiceProvider ?? "–").toUpperCase()
const attach = (i: Item) => { const a = (i.attachPoint as Item | undefined) ?? {}; return sv(a.directConnectGateway) ?? sv(a.arn) }

const connections: ResourceDef = {
  ...base,
  path: "/interconnect/connections",
  title: "Connections",
  singular: "connection",
  description: "Multicloud connections link a Direct Connect gateway to a partner cloud environment with managed, private bandwidth.",
  operation: "ListConnections",
  items: (p) => (p.connections as Item[]) ?? [],
  key: (i) => String(i.id),
  display: (i) => String(i.description || i.id),
  columns: [col("id", "Connection ID", (i) => i.id), col("desc", "Description", (i) => i.description), stateCol("state", "State"), col("provider", "Provider", provider), col("location", "Location", (i) => i.location), col("bandwidth", "Bandwidth", (i) => i.bandwidth), col("attach", "Attach point", attach)],
  details: [
    copyField("Connection ID", (i) => i.id),
    copyField("ARN", (i) => i.arn),
    textField("Description", (i) => i.description),
    stateField("State", "state"),
    textField("Provider", provider),
    textField("Location", (i) => i.location),
    textField("Environment", (i) => i.environmentId),
    textField("Bandwidth", (i) => i.bandwidth),
    textField("Attach point", attach),
    textField("Type", (i) => i.type),
    copyField("Activation key", (i) => i.activationKey),
    textField("Owner account", (i) => i.ownerAccount),
  ],
  tabs: [{ id: "tags", label: "Tags", render: (i) => <MapTags model={M} arn={String(i.arn)} /> }],
  create: { label: "Create connection", href: "/interconnect/connections/create" },
  deleteAction: { operation: "DeleteConnection", input: (i) => ({ identifier: i.id }) },
}

const environments: ResourceDef = {
  ...base,
  path: "/interconnect/environments",
  title: "Environments",
  singular: "environment",
  description: "Partner cloud environments that you can connect to, with available bandwidths.",
  operation: "ListEnvironments",
  items: (p) => (p.environments as Item[]) ?? [],
  key: (i) => String(i.environmentId),
  display: (i) => String(i.environmentId),
  columns: [col("id", "Environment ID", (i) => i.environmentId), col("provider", "Provider", provider), col("location", "Location", (i) => i.location), stateCol("state", "State"), col("bw", "Available bandwidths", (i) => (((i.bandwidths as Item | undefined)?.available as string[] | undefined) ?? []).join(", "))],
  details: [
    copyField("Environment ID", (i) => i.environmentId),
    textField("Provider", provider),
    textField("Location", (i) => i.location),
    stateField("State", "state"),
    textField("Available bandwidths", (i) => ((i.bandwidths as Item | undefined)?.available as string[] | undefined) ?? []),
    textField("Supported bandwidths", (i) => ((i.bandwidths as Item | undefined)?.supported as string[] | undefined) ?? []),
  ],
}

const createConnection: FormSpec = {
  title: "Create connection",
  sections: [
    { title: "Connection settings", fields: [
      { id: "env", label: "Environment", type: "select", source: { model: M, operation: "ListEnvironments", items: (p) => (p.environments as Item[]) ?? [], value: (i) => String(i.environmentId), label: (i) => `${provider(i)} ${i.location}`, description: (i) => String(i.environmentId) } },
      { id: "bandwidth", label: "Bandwidth", type: "select", default: "1Gbps", options: ["500Mbps", "1Gbps", "2Gbps", "5Gbps", "10Gbps", "20Gbps", "50Gbps", "100Gbps"].map((b) => ({ value: b, label: b })) },
      { id: "attach", label: "Direct Connect gateway", type: "select", source: (v) => (sv(v.env) ? { model: M, operation: "ListAttachPoints", input: { environmentId: v.env }, items: (p) => (p.attachPoints as Item[]) ?? [], value: (i) => String(i.identifier), label: (i) => String(i.name ?? i.identifier), description: (i) => String(i.identifier) } : undefined) },
      { id: "description", label: "Description", optional: true },
      { id: "remote", label: "Remote account identifier", placeholder: "my-gcp-project", description: "The identifier of your account in the partner cloud, such as a Google Cloud project ID." },
    ] },
    { title: "Tags", fields: [{ id: "tags", label: "Tags", type: "tags" }] },
  ],
  submit: async (v) => {
    const tags = tagMap((v.tags as { Key: string; Value?: string }[]) ?? [])
    await callAws(M, "CreateConnection", { environmentId: v.env, bandwidth: v.bandwidth, attachPoint: { directConnectGateway: v.attach }, ...(sv(v.description) ? { description: v.description } : {}), ...(sv(v.remote) ? { remoteAccount: { identifier: v.remote } } : {}), ...(Object.keys(tags).length ? { tags } : {}) })
    return "Connection is being created."
  },
}

export const icApp: ServiceApp = {
  id: "interconnect",
  name: "AWS Interconnect - multicloud",
  home: "/interconnect/connections",
  nav: [
    { type: "link", text: "Connections", href: "/interconnect/connections" },
    { type: "link", text: "Environments", href: "/interconnect/environments" },
    { type: "divider" },
    { type: "link", text: "Direct Connect gateways", href: "/directconnect/gateways" },
  ],
  defs: { connections, environments },
  creates: { connections: createConnection },
}

export function InterconnectApp({ path }: { path: string[] }) {
  return <ServiceRouter app={icApp} path={path.length ? path : ["connections"]} />
}
