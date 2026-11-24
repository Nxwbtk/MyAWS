"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import Header from "@cloudscape-design/components/header"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { col, copyField, dateCol, dateField, ob, stateCol, stateField, sv, SubTable, CreateModal, tagList, TagsPanel, textField, token, ServiceRouter, type FormSpec, type ServiceApp } from "@/components/console/service-app"
import { dash, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { callAws } from "@/lib/aws"

const M = "globalaccelerator"
const ipList = (i: Item) => ((i.IpSets as Item[] | undefined) ?? []).flatMap((s) => (s.IpAddresses as string[] | undefined) ?? [])
const ports = (i: Item) => ((i.PortRanges as Item[] | undefined) ?? []).map((p) => (p.FromPort === p.ToPort ? String(p.FromPort) : `${p.FromPort}-${p.ToPort}`)).join(", ")
const regions = ["ap-southeast-7", "ap-southeast-1", "ap-northeast-1", "us-east-1", "us-west-2", "eu-west-1", "eu-central-1"].map((r) => ({ value: r, label: r }))
const parsePorts = (v: string) => v.split(",").map((p) => p.trim()).filter(Boolean).map((p) => { const [a, b] = p.split("-").map(Number); return { FromPort: a, ToPort: b || a } })

function ListenersTab({ arn }: { arn: string }) {
  const listenerForm: FormSpec = {
    title: "Add listener",
    sections: [{ title: "Listener", fields: [
      { id: "ports", label: "Ports", placeholder: "80, 443, 8000-8080", description: "Enter one or more ports or port ranges, separated by commas." },
      { id: "protocol", label: "Protocol", type: "select", default: "TCP", options: [{ value: "TCP", label: "TCP" }, { value: "UDP", label: "UDP" }] },
      { id: "affinity", label: "Client affinity", type: "select", default: "NONE", options: [{ value: "NONE", label: "None" }, { value: "SOURCE_IP", label: "Source IP" }] },
    ] }],
    submit: async (v) => { await callAws(M, "CreateListener", { AcceleratorArn: arn, PortRanges: parsePorts(String(v.ports)), Protocol: v.protocol, ClientAffinity: v.affinity, IdempotencyToken: token() }); return "Listener added." },
  }
  return (
    <SubTable
      title="Listeners"
      description="Listeners process inbound connections from clients to Global Accelerator, based on the port and protocol that you configure."
      model={M}
      operation="ListListeners"
      input={{ AcceleratorArn: arn }}
      items={(p) => (p.Listeners as Item[]) ?? []}
      trackBy={(i) => String(i.ListenerArn)}
      columns={[
        { id: "id", header: "Listener ID", cell: (i) => String(i.ListenerArn).split("/").pop() },
        { id: "ports", header: "Ports", cell: (i) => ports(i) },
        { id: "protocol", header: "Protocol", cell: (i) => dash(i.Protocol) },
        { id: "affinity", header: "Client affinity", cell: (i) => (i.ClientAffinity === "SOURCE_IP" ? "Source IP" : "None") },
      ]}
      create={listenerForm}
      remove={{ label: "Remove", run: (i) => callAws(M, "DeleteListener", { ListenerArn: i.ListenerArn }) }}
    />
  )
}

function endpointGroupForm(arn: string): FormSpec {
  return {
    title: "Add endpoint group",
    sections: [{ title: "Endpoint group", fields: [
      { id: "listener", label: "Listener", type: "select", source: { model: M, operation: "ListListeners", input: { AcceleratorArn: arn }, items: (p) => (p.Listeners as Item[]) ?? [], value: (i) => String(i.ListenerArn), label: (i) => `${i.Protocol} ${ports(i)}` } },
      { id: "region", label: "Region", type: "select", default: "ap-southeast-7", options: regions },
      { id: "dial", label: "Traffic dial", type: "number", default: "100", description: "Percentage of traffic to direct to this endpoint group (0-100)." },
      { id: "endpoints", label: "Endpoints", type: "textarea", optional: true, placeholder: "arn:aws:elasticloadbalancing:...\neipalloc-0123456789abcdef0", description: "One endpoint ID per line: a load balancer ARN, an Elastic IP allocation ID, or an EC2 instance ID." },
      { id: "hcProtocol", label: "Health check protocol", type: "select", default: "TCP", options: ["TCP", "HTTP", "HTTPS"].map((p) => ({ value: p, label: p })) },
      { id: "hcPath", label: "Health check path", optional: true, placeholder: "/", show: (v) => v.hcProtocol !== "TCP" },
    ] }],
    submit: async (v) => {
      const endpoints = String(v.endpoints ?? "").split("\n").map((e) => e.trim()).filter(Boolean).map((EndpointId) => ({ EndpointId, Weight: 128 }))
      await callAws(M, "CreateEndpointGroup", { ListenerArn: v.listener, EndpointGroupRegion: v.region, TrafficDialPercentage: Number(v.dial), HealthCheckProtocol: v.hcProtocol, ...(sv(v.hcPath) ? { HealthCheckPath: v.hcPath } : {}), EndpointConfigurations: endpoints, IdempotencyToken: token() })
      return "Endpoint group added."
    },
  }
}

const accelerators: ResourceDef = {
  tagResource: false,
  path: "/globalaccelerator/accelerators",
  title: "Accelerators",
  singular: "accelerator",
  description: "Accelerators improve the availability and performance of your applications by routing traffic over the AWS global network.",
  model: M,
  operation: "ListAccelerators",
  items: (p) => (p.Accelerators as Item[]) ?? [],
  key: (i) => String(i.AcceleratorArn).split("/").pop() ?? "",
  display: (i) => String(i.Name),
  linkColumn: 0,
  columns: [
    col("name", "Name", (i) => i.Name),
    stateCol("Status"),
    col("enabled", "Accelerator status", (i) => (i.Enabled ? "Enabled" : "Disabled")),
    col("type", "Accelerator type", () => "Standard"),
    col("ipType", "IP address type", (i) => i.IpAddressType),
    col("ips", "Static IP addresses", (i) => ipList(i).join(", ")),
    col("dns", "DNS name", (i) => i.DnsName),
    dateCol("created", "Created", "CreatedTime"),
  ],
  details: [
    textField("Name", (i) => i.Name),
    copyField("ARN", (i) => i.AcceleratorArn),
    stateField("Status", "Status"),
    textField("Accelerator status", (i) => (i.Enabled ? "Enabled" : "Disabled")),
    textField("IP address type", (i) => i.IpAddressType),
    copyField("DNS name", (i) => i.DnsName),
    copyField("Dual-stack DNS name", (i) => i.DualStackDnsName),
    textField("Static IP address set", (i) => ipList(i)),
    dateField("Created", "CreatedTime"),
    dateField("Last modified", "LastModifiedTime"),
  ],
  tabs: [
    { id: "listeners", label: "Listeners", render: (i) => <ListenersTab arn={String(i.AcceleratorArn)} /> },
    { id: "endpoint-groups", label: "Endpoint groups", render: (i) => <ListenerGroups arn={String(i.AcceleratorArn)} /> },
    { id: "attributes", label: "Attributes", render: (i) => <Attributes arn={String(i.AcceleratorArn)} /> },
    { id: "tags", label: "Tags", render: (i) => <TagsPanel id={String(i.AcceleratorArn)} load={async () => ((await callAws<{ Tags?: { Key: string; Value: string }[] }>(M, "ListTagsForResource", { ResourceArn: i.AcceleratorArn })).Tags ?? [])} save={async (add, remove) => { if (remove.length) await callAws(M, "UntagResource", { ResourceArn: i.AcceleratorArn, TagKeys: remove }); if (add.length) await callAws(M, "TagResource", { ResourceArn: i.AcceleratorArn, Tags: tagList(add) }) }} /> },
  ],
  actions: [
    { id: "enable", text: "Enable", enabled: (s) => s.length === 1 && !s[0].Enabled, run: (s) => callAws(M, "UpdateAccelerator", { AcceleratorArn: s[0].AcceleratorArn, Enabled: true }), success: (s) => `Enabled accelerator ${s[0].Name}.` },
    { id: "disable", text: "Disable", enabled: (s) => s.length === 1 && Boolean(s[0].Enabled), run: (s) => callAws(M, "UpdateAccelerator", { AcceleratorArn: s[0].AcceleratorArn, Enabled: false }), success: (s) => `Disabled accelerator ${s[0].Name}. You can delete it after it's deployed.` },
  ],
  create: { label: "Create accelerator", href: "/globalaccelerator/accelerators/create" },
  deleteAction: { operation: "DeleteAccelerator", input: (i) => ({ AcceleratorArn: i.AcceleratorArn }), warning: "You must disable the accelerator and remove its listeners before you can delete it." },
}



function ListenerGroups({ arn }: { arn: string }) {
  const q = useQuery({
    queryKey: ["emulator", "aws", M, "endpoint-groups", arn],
    queryFn: async () => {
      const ls = ((await callAws<Item>(M, "ListListeners", { AcceleratorArn: arn })).Listeners as Item[]) ?? []
      const out: Item[] = []
      for (const l of ls) {
        const gs = ((await callAws<Item>(M, "ListEndpointGroups", { ListenerArn: l.ListenerArn })).EndpointGroups as Item[]) ?? []
        out.push(...gs.map((g) => ({ ...g, _listener: `${l.Protocol} ${ports(l)}` })))
      }
      return out
    },
  })
  const [selected, setSelected] = useState<Item[]>([])
  const [adding, setAdding] = useState(false)
  const form = endpointGroupForm(arn)
  return (
    <>
      <Table
        header={
          <Header
            variant="h2"
            counter={`(${q.data?.length ?? 0})`}
            description="Each endpoint group is associated with a specific AWS Region and contains endpoints in that Region."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void q.refetch()} />
                <Button
                  disabled={!selected.length}
                  onClick={async () => {
                    try {
                      for (const g of selected) await callAws(M, "DeleteEndpointGroup", { EndpointGroupArn: g.EndpointGroupArn })
                      flash.success("Endpoint group removed.")
                      setSelected([])
                      await q.refetch()
                    } catch (e) {
                      flash.error(errorMessage(e))
                    }
                  }}
                >
                  Remove
                </Button>
                <Button onClick={() => setAdding(true)}>Add endpoint group</Button>
              </SpaceBetween>
            }
          >
            Endpoint groups
          </Header>
        }
        loading={q.isPending}
        selectionType="multi"
        trackBy={(g) => String(g.EndpointGroupArn)}
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        items={q.data ?? []}
        columnDefinitions={[
          { id: "region", header: "Region", cell: (g) => dash(g.EndpointGroupRegion) },
          { id: "listener", header: "Listener", cell: (g) => String(g._listener) },
          { id: "dial", header: "Traffic dial", cell: (g) => `${g.TrafficDialPercentage ?? 100}%` },
          { id: "hc", header: "Health check", cell: (g) => `${g.HealthCheckProtocol ?? "TCP"}${g.HealthCheckPath ? ` ${g.HealthCheckPath}` : ""}` },
          { id: "endpoints", header: "Endpoints", cell: (g) => ((g.EndpointDescriptions as Item[] | undefined) ?? []).map((e) => `${e.EndpointId} (${String(e.HealthState ?? "").toLowerCase() || "initial"})`).join(", ") || "–" },
        ]}
        empty={<Box textAlign="center" color="inherit">No endpoint groups</Box>}
      />
      {adding && <CreateModal spec={form} onDismiss={() => setAdding(false)} onDone={() => q.refetch()} />}
    </>
  )
}

function Attributes({ arn }: { arn: string }) {
  const q = useQuery({ queryKey: ["emulator", "aws", M, "DescribeAcceleratorAttributes", arn], queryFn: () => callAws<Item>(M, "DescribeAcceleratorAttributes", { AcceleratorArn: arn }) })
  const a = ob(q.data?.AcceleratorAttributes)
  return (
    <Container header={<Header variant="h2">Flow logs</Header>}>
      <KeyValuePairs columns={3} items={[{ label: "Flow logs", value: a.FlowLogsEnabled ? "Enabled" : "Disabled" }, { label: "S3 bucket", value: dash(a.FlowLogsS3Bucket) }, { label: "S3 prefix", value: dash(a.FlowLogsS3Prefix) }]} />
    </Container>
  )
}

const createAccelerator: FormSpec = {
  title: "Create accelerator",
  description: "Create a standard accelerator, then add listeners and endpoint groups from the accelerator's details page.",
  sections: [
    { title: "Basic configuration", fields: [
      { id: "name", label: "Accelerator name", constraint: "Up to 64 characters: letters, numbers, periods (.), and hyphens (-)." },
      { id: "type", label: "Accelerator type", type: "select", default: "standard", options: [{ value: "standard", label: "Standard", description: "Route traffic to the optimal endpoint based on performance and your policies." }, { value: "custom", label: "Custom routing", description: "Map one or more users to a specific destination among many destinations." }] },
      { id: "ipType", label: "IP address type", type: "select", default: "IPV4", options: [{ value: "IPV4", label: "IPv4" }, { value: "DUAL_STACK", label: "Dual-stack" }] },
    ] },
    { title: "Listener", description: "Optionally add a first listener now.", fields: [
      { id: "ports", label: "Ports", optional: true, placeholder: "80, 443", show: (v) => v.type === "standard" },
      { id: "protocol", label: "Protocol", type: "select", default: "TCP", options: [{ value: "TCP", label: "TCP" }, { value: "UDP", label: "UDP" }], show: (v) => v.type === "standard" },
    ] },
    { title: "Tags", fields: [{ id: "tags", label: "Tags", type: "tags" }] },
  ],
  valid: (v) => /^[A-Za-z0-9.-]{1,64}$/.test(String(v.name)),
  submit: async (v) => {
    const op = v.type === "custom" ? "CreateCustomRoutingAccelerator" : "CreateAccelerator"
    const r = await callAws<{ Accelerator?: Item }>(M, op, { Name: v.name, IpAddressType: v.ipType, Enabled: true, IdempotencyToken: token(), Tags: tagList((v.tags as { Key: string; Value?: string }[]) ?? []) })
    if (v.type === "standard" && sv(v.ports) && r.Accelerator) await callAws(M, "CreateListener", { AcceleratorArn: r.Accelerator.AcceleratorArn, PortRanges: parsePorts(String(v.ports)), Protocol: v.protocol, IdempotencyToken: token() })
    return `Accelerator ${v.name} is being created.`
  },
}

const nav = [
  { type: "link" as const, text: "Accelerators", href: "/globalaccelerator/accelerators" },
  { type: "link" as const, text: "Custom routing accelerators", href: "/globalaccelerator/custom-routing" },
  { type: "link" as const, text: "Cross-account attachments", href: "/globalaccelerator/attachments" },
  { type: "link" as const, text: "BYOIP addresses", href: "/globalaccelerator/byoip" },
]

export const gaApp: ServiceApp = {
  id: "globalaccelerator",
  name: "Global Accelerator",
  home: "/globalaccelerator/accelerators",
  nav,
  defs: { accelerators },
  creates: { accelerators: createAccelerator },
  unavailable: { "custom-routing": "Custom routing accelerators", attachments: "Cross-account attachments", byoip: "BYOIP addresses" },
}

export function GlobalAcceleratorApp({ path }: { path: string[] }) {
  return <ServiceRouter app={gaApp} path={path.length ? path : ["accelerators"]} />
}
