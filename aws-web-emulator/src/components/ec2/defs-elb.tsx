"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Multiselect from "@cloudscape-design/components/multiselect"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import Tiles from "@cloudscape-design/components/tiles"
import { useState, type ComponentType } from "react"
import { flash } from "@/components/console/flash"
import { EditModal } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { Copyable, State, dash, type Ctx, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { Ec2CreatePage } from "@/components/ec2/create-more"
import { MetricGrid } from "@/components/cloudwatch/metrics"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

const M = "elasticloadbalancingv2"
const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v))
const arr = <T = Item,>(v: unknown) => (v as T[] | undefined) ?? []
const col = (id: string, label: string, get: (i: Item) => unknown) => ({ id, label, value: (i: Item) => dash(get(i)), sort: (i: Item) => s(get(i)) })
const typeLabel = (t: unknown) => (t === "application" ? "application" : t === "network" ? "network" : t === "gateway" ? "gateway" : dash(t))

function ElbTags({ arn }: { arn: string }) {
  const tags = useAws<{ TagDescriptions?: { Tags?: Tag[] }[] }>(M, "DescribeTags", { ResourceArns: [arn] })
  const list = tags.data?.TagDescriptions?.[0]?.Tags ?? []
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Tag[]>([])
  return (
    <>
      <Table header={<Header variant="h2" counter={`(${list.length})`} actions={<Button onClick={() => { setEdit(list); setOpen(true) }}>Manage tags</Button>}>Tags</Header>} items={list} columnDefinitions={[{ id: "k", header: "Key", cell: (t) => t.Key }, { id: "v", header: "Value", cell: (t) => t.Value || "–" }]} empty={<Box textAlign="center" color="inherit">No tags</Box>} />
      <EditModal visible={open} size="large" title="Manage tags" onDismiss={() => setOpen(false)} success="Tags updated." onSave={async () => { const after = edit.filter((t) => t.Key); const removed = list.filter((t) => !after.some((a) => a.Key === t.Key)).map((t) => t.Key); if (removed.length) await callAws(M, "RemoveTags", { ResourceArns: [arn], TagKeys: removed }); if (after.length) await callAws(M, "AddTags", { ResourceArns: [arn], Tags: after.map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) }); await tags.refetch() }}>
        <TagEditor tags={edit} onChange={setEdit} />
      </EditModal>
    </>
  )
}

function Attributes({ op, input }: { op: string; input: Record<string, unknown> }) {
  const attrs = useAws<{ Attributes?: { Key?: string; Value?: string }[] }>(M, op, input)
  return <Container header={<Header variant="h2">Attributes</Header>}><KeyValuePairs columns={3} items={(attrs.data?.Attributes ?? []).map((a) => ({ label: a.Key ?? "", value: a.Value || "-" }))} /></Container>
}

/* ---------------- Load balancers ---------------- */

function Listeners({ lb, ctx }: { lb: Item; ctx: Ctx }) {
  const arn = s(lb.LoadBalancerArn) ?? ""
  const listeners = useAws<{ Listeners?: Item[] }>(M, "DescribeListeners", { LoadBalancerArn: arn })
  const groups = useAws<{ TargetGroups?: Item[] }>(M, "DescribeTargetGroups", {})
  const [selected, setSelected] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const app = lb.Type === "application"
  const [form, setForm] = useState({ protocol: app ? "HTTP" : "TCP", port: "80", action: "forward", group: "", status: "200", body: "OK" })
  const list = listeners.data?.Listeners ?? []
  const action = (l: Item) => arr(l.DefaultActions).map((a) => (a.Type === "forward" ? `Forward to ${s(a.TargetGroupArn)?.split("/")[1] ?? arr(o(a.ForwardConfig).TargetGroups).map((t) => s(t.TargetGroupArn)?.split("/")[1]).join(", ")}` : a.Type === "fixed-response" ? `Return fixed response ${o(a.FixedResponseConfig).StatusCode}` : a.Type === "redirect" ? "Redirect" : s(a.Type))).join("; ")
  return (
    <>
      <Table<Item>
        header={
          <Header
            variant="h2"
            counter={`(${list.length})`}
            description="A listener checks for connection requests on its port and protocol. Traffic received by the listener is routed according to the default action and any additional rules."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void listeners.refetch()} />
                <Button disabled={selected.length === 0} onClick={async () => { for (const l of selected) await callAws(M, "DeleteListener", { ListenerArn: l.ListenerArn }); flash.success("Listener deleted."); setSelected([]); void listeners.refetch() }}>Delete</Button>
                <Button variant="primary" onClick={() => setOpen(true)}>Add listener</Button>
              </SpaceBetween>
            }
          >
            Listeners and rules
          </Header>
        }
        items={list}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        trackBy={(l) => s(l.ListenerArn) ?? ""}
        columnDefinitions={[
          { id: "pp", header: "Protocol:Port", cell: (l) => `${l.Protocol}:${l.Port}` },
          { id: "action", header: "Default action", cell: action },
          { id: "arn", header: "ARN", cell: (l) => s(l.ListenerArn) },
          { id: "ssl", header: "Security policy", cell: (l) => dash(l.SslPolicy) },
        ]}
        empty={<Box textAlign="center" color="inherit"><b>No listeners</b><Box variant="p" color="inherit">Add a listener to route traffic.</Box></Box>}
      />
      <EditModal
        visible={open}
        size="large"
        title="Add listener"
        saveLabel="Add"
        saveDisabled={form.action === "forward" && !form.group}
        onDismiss={() => setOpen(false)}
        success="Listener added."
        onSave={async () => {
          await callAws(M, "CreateListener", { LoadBalancerArn: arn, Protocol: form.protocol, Port: Number(form.port), DefaultActions: [form.action === "forward" ? { Type: "forward", TargetGroupArn: form.group } : { Type: "fixed-response", FixedResponseConfig: { StatusCode: form.status, ContentType: "text/plain", MessageBody: form.body } }] })
          await listeners.refetch()
          await ctx.refresh()
        }}
      >
        <SpaceBetween direction="horizontal" size="l">
          <FormField label="Protocol"><Select selectedOption={{ value: form.protocol, label: form.protocol }} onChange={({ detail }) => setForm({ ...form, protocol: detail.selectedOption.value ?? "HTTP" })} options={(app ? ["HTTP", "HTTPS"] : ["TCP", "UDP", "TCP_UDP", "TLS"]).map((p) => ({ value: p, label: p }))} /></FormField>
          <FormField label="Port"><Input type="number" value={form.port} onChange={({ detail }) => setForm({ ...form, port: detail.value })} /></FormField>
        </SpaceBetween>
        <FormField label="Default action"><RadioGroup value={form.action} onChange={({ detail }) => setForm({ ...form, action: detail.value })} items={[{ value: "forward", label: "Forward to target groups" }, ...(app ? [{ value: "fixed", label: "Return fixed response" }] : [])]} /></FormField>
        {form.action === "forward" ? (
          <FormField label="Target group"><Select selectedOption={form.group ? { value: form.group, label: form.group.split("/")[1] } : null} placeholder="Choose a target group" empty="No target groups" onChange={({ detail }) => setForm({ ...form, group: detail.selectedOption.value ?? "" })} options={(groups.data?.TargetGroups ?? []).map((g) => ({ value: s(g.TargetGroupArn) ?? "", label: s(g.TargetGroupName), description: `${g.Protocol}:${g.Port}` }))} /></FormField>
        ) : (
          <SpaceBetween direction="horizontal" size="l">
            <FormField label="Response code"><Input value={form.status} onChange={({ detail }) => setForm({ ...form, status: detail.value })} /></FormField>
            <FormField label="Response body"><Input value={form.body} onChange={({ detail }) => setForm({ ...form, body: detail.value })} /></FormField>
          </SpaceBetween>
        )}
      </EditModal>
    </>
  )
}

const o = (v: unknown) => (v as Item | undefined) ?? {}

const lbDim = (lb: Item) => s(lb.LoadBalancerArn)?.split(":loadbalancer/")[1] ?? ""

export const loadBalancersDef: ResourceDef = {
  path: "/ec2/load-balancers",
  title: "Load balancers",
  singular: "load balancer",
  description: "Elastic Load Balancing scales your load balancer capacity automatically in response to changes in incoming traffic.",
  model: M,
  operation: "DescribeLoadBalancers",
  items: (p) => arr(p.LoadBalancers),
  key: (i) => s(i.LoadBalancerName) ?? "",
  display: (i) => s(i.LoadBalancerName) ?? "",
  tagResource: false,
  columns: [
    col("name", "Name", (i) => i.LoadBalancerName),
    col("dns", "DNS name", (i) => i.DNSName),
    { id: "state", label: "State", value: (i) => <State value={o(i.State).Code} />, sort: (i) => s(o(i.State).Code) },
    col("vpc", "VPC ID", (i) => i.VpcId),
    col("azs", "Availability Zones", (i) => `${arr(i.AvailabilityZones).length} Availability Zones`),
    { id: "type", label: "Type", value: (i) => typeLabel(i.Type), sort: (i) => s(i.Type) },
    col("created", "Date created", (i) => consoleDate(s(i.CreatedTime))),
  ],
  details: [
    { label: "Load balancer type", value: (i) => typeLabel(i.Type) },
    { label: "Status", value: (i) => <State value={o(i.State).Code} /> },
    { label: "VPC", value: (i) => dash(i.VpcId) },
    { label: "Load balancer IP address type", value: (i) => dash(i.IpAddressType) },
    { label: "Scheme", value: (i) => dash(i.Scheme) },
    { label: "Hosted zone", value: (i) => dash(i.CanonicalHostedZoneId) },
    { label: "Availability Zones", value: (i) => arr(i.AvailabilityZones).map((z) => `${z.SubnetId} (${z.ZoneName})`).join(", ") || "-" },
    { label: "Date created", value: (i) => consoleDate(s(i.CreatedTime)) },
    { label: "Load balancer ARN", value: (i) => <Copyable value={s(i.LoadBalancerArn)} /> },
    { label: "DNS name", value: (i) => <Copyable value={s(i.DNSName)} /> },
  ],
  detailColumns: 3,
  tabs: [
    { id: "listeners", label: "Listeners and rules", render: (i, ctx) => <Listeners lb={i} ctx={ctx} /> },
    { id: "network", label: "Network mapping", render: (i) => <Table items={arr(i.AvailabilityZones)} header={<Header variant="h2">Network mapping</Header>} columnDefinitions={[{ id: "az", header: "Zone", cell: (z) => s(z.ZoneName) }, { id: "subnet", header: "Subnet", cell: (z) => s(z.SubnetId) }, { id: "ip", header: "IPv4 address", cell: (z) => arr(z.LoadBalancerAddresses).map((a) => s(a.IpAddress)).join(", ") || "Assigned by AWS" }]} /> },
    { id: "security", label: "Security", render: (i) => <Container header={<Header variant="h2">Security groups</Header>}>{arr<string>(i.SecurityGroups).join(", ") || "-"}</Container> },
    { id: "monitoring", label: "Monitoring", render: (i) => <MetricGrid namespace={i.Type === "network" ? "AWS/NetworkELB" : "AWS/ApplicationELB"} dimensions={[{ Name: "LoadBalancer", Value: lbDim(i) }]} metrics={i.Type === "network" ? [{ name: "ActiveFlowCount", stat: "Average" }, { name: "NewFlowCount", stat: "Sum" }, { name: "ProcessedBytes", stat: "Sum" }] : [{ name: "RequestCount", stat: "Sum" }, { name: "TargetResponseTime", stat: "Average" }, { name: "HTTPCode_Target_2XX_Count", stat: "Sum" }, { name: "HTTPCode_ELB_5XX_Count", stat: "Sum" }]} /> },
    { id: "attributes", label: "Attributes", render: (i) => <Attributes op="DescribeLoadBalancerAttributes" input={{ LoadBalancerArn: i.LoadBalancerArn }} /> },
    { id: "elbtags", label: "Tags", render: (i) => <ElbTags arn={s(i.LoadBalancerArn) ?? ""} /> },
  ],
  create: { label: "Create load balancer", href: "/ec2/load-balancers/create" },
  deleteAction: { operation: "DeleteLoadBalancer", input: (i) => ({ LoadBalancerArn: i.LoadBalancerArn }), warning: "Deleting a load balancer also deletes its listeners. Registered targets keep running." },
}

/* ---------------- Target groups ---------------- */

function Targets({ group, ctx }: { group: Item; ctx: Ctx }) {
  const arn = s(group.TargetGroupArn) ?? ""
  const health = useAws<{ TargetHealthDescriptions?: Item[] }>(M, "DescribeTargetHealth", { TargetGroupArn: arn })
  const instances = useAws<{ Reservations?: { Instances?: Item[] }[] }>("ec2", "DescribeInstances", {})
  const [selected, setSelected] = useState<Item[]>([])
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<string[]>([])
  const [ipTarget, setIpTarget] = useState("")
  const [port, setPort] = useState(s(group.Port) ?? "80")
  const list = health.data?.TargetHealthDescriptions ?? []
  const type = s(group.TargetType) ?? "instance"
  return (
    <>
      <Table<Item>
        header={
          <Header
            variant="h2"
            counter={`(${list.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void health.refetch()} />
                <Button disabled={selected.length === 0} onClick={async () => { await callAws(M, "DeregisterTargets", { TargetGroupArn: arn, Targets: selected.map((t) => o(t.Target)) }); flash.success("Targets deregistered."); setSelected([]); void health.refetch() }}>Deregister</Button>
                <Button variant="primary" onClick={() => { setPick([]); setOpen(true) }}>Register targets</Button>
              </SpaceBetween>
            }
          >
            Registered targets
          </Header>
        }
        items={list}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        trackBy={(t) => `${o(t.Target).Id}:${o(t.Target).Port}`}
        columnDefinitions={[
          { id: "id", header: type === "ip" ? "IP address" : "Instance ID", cell: (t) => s(o(t.Target).Id) },
          { id: "port", header: "Port", cell: (t) => s(o(t.Target).Port) },
          { id: "az", header: "Zone", cell: (t) => dash(o(t.Target).AvailabilityZone) },
          { id: "health", header: "Health status", cell: (t) => <State value={o(t.TargetHealth).State} /> },
          { id: "details", header: "Health status details", cell: (t) => dash(o(t.TargetHealth).Description) },
        ]}
        empty={<Box textAlign="center" color="inherit"><b>No registered targets</b><Box variant="p" color="inherit">Register targets to receive traffic.</Box></Box>}
      />
      <EditModal
        visible={open}
        size="large"
        title="Register targets"
        saveLabel="Register pending targets"
        saveDisabled={type === "ip" ? !ipTarget : pick.length === 0}
        onDismiss={() => setOpen(false)}
        success="Targets registered."
        onSave={async () => {
          const targets = type === "ip" ? ipTarget.split(/[\s,]+/).filter(Boolean).map((Id) => ({ Id, Port: Number(port) })) : pick.map((Id) => ({ Id, Port: Number(port) }))
          await callAws(M, "RegisterTargets", { TargetGroupArn: arn, Targets: targets })
          await health.refetch()
          await ctx.refresh()
        }}
      >
        {type === "ip" ? (
          <FormField label="IPv4 addresses" description="Comma-separated."><Input value={ipTarget} onChange={({ detail }) => setIpTarget(detail.value)} /></FormField>
        ) : (
          <FormField label="Available instances"><Multiselect selectedOptions={pick.map((p) => ({ value: p, label: p }))} placeholder="Choose instances" onChange={({ detail }) => setPick(detail.selectedOptions.map((x) => x.value ?? ""))} options={(instances.data?.Reservations ?? []).flatMap((r) => r.Instances ?? []).filter((i) => o(i.State).Name !== "terminated").map((i) => ({ value: s(i.InstanceId) ?? "", label: s(i.InstanceId), description: `${o(i.State).Name} · ${i.VpcId}` }))} /></FormField>
        )}
        <FormField label="Ports for the selected targets"><Input type="number" value={port} onChange={({ detail }) => setPort(detail.value)} /></FormField>
      </EditModal>
    </>
  )
}

export const targetGroupsDef: ResourceDef = {
  path: "/ec2/target-groups",
  title: "Target groups",
  singular: "target group",
  model: M,
  operation: "DescribeTargetGroups",
  items: (p) => arr(p.TargetGroups),
  key: (i) => s(i.TargetGroupName) ?? "",
  display: (i) => s(i.TargetGroupName) ?? "",
  tagResource: false,
  columns: [
    col("name", "Name", (i) => i.TargetGroupName),
    col("arn", "ARN", (i) => i.TargetGroupArn),
    col("port", "Port", (i) => i.Port),
    col("protocol", "Protocol", (i) => i.Protocol),
    col("type", "Target type", (i) => i.TargetType),
    col("lb", "Load balancer", (i) => arr<string>(i.LoadBalancerArns).map((a) => a.split("/")[2]).join(", ") || "None associated"),
    col("vpc", "VPC ID", (i) => i.VpcId),
  ],
  details: [
    { label: "Target type", value: (i) => dash(i.TargetType) },
    { label: "Protocol : Port", value: (i) => `${i.Protocol}: ${i.Port}` },
    { label: "Protocol version", value: (i) => dash(i.ProtocolVersion) },
    { label: "VPC", value: (i) => dash(i.VpcId) },
    { label: "IP address type", value: (i) => dash(i.IpAddressType) },
    { label: "Load balancer", value: (i) => arr<string>(i.LoadBalancerArns).map((a) => a.split("/")[2]).join(", ") || "None associated" },
    { label: "ARN", value: (i) => <Copyable value={s(i.TargetGroupArn)} /> },
  ],
  detailColumns: 3,
  tabs: [
    { id: "targets", label: "Targets", render: (i, ctx) => <Targets group={i} ctx={ctx} /> },
    { id: "health", label: "Health checks", render: (i) => <Container header={<Header variant="h2">Health check settings</Header>}><KeyValuePairs columns={3} items={[{ label: "Protocol", value: dash(i.HealthCheckProtocol) }, { label: "Path", value: dash(i.HealthCheckPath) }, { label: "Port", value: dash(i.HealthCheckPort) }, { label: "Healthy threshold", value: dash(i.HealthyThresholdCount) }, { label: "Unhealthy threshold", value: dash(i.UnhealthyThresholdCount) }, { label: "Timeout", value: `${i.HealthCheckTimeoutSeconds ?? "-"} seconds` }, { label: "Interval", value: `${i.HealthCheckIntervalSeconds ?? "-"} seconds` }, { label: "Success codes", value: dash(o(i.Matcher).HttpCode ?? o(i.Matcher).GrpcCode) }]} /></Container> },
    { id: "attributes", label: "Attributes", render: (i) => <Attributes op="DescribeTargetGroupAttributes" input={{ TargetGroupArn: i.TargetGroupArn }} /> },
    { id: "tgtags", label: "Tags", render: (i) => <ElbTags arn={s(i.TargetGroupArn) ?? ""} /> },
  ],
  create: { label: "Create target group", href: "/ec2/target-groups/create" },
  deleteAction: { operation: "DeleteTargetGroup", input: (i) => ({ TargetGroupArn: i.TargetGroupArn }), warning: "You can't delete a target group that a listener or rule uses." },
}

export const trustStoresDef: ResourceDef = {
  path: "/ec2/trust-stores",
  title: "Trust stores",
  singular: "trust store",
  model: M,
  operation: "DescribeTrustStores",
  items: (p) => arr(p.TrustStores),
  key: (i) => s(i.Name) ?? "",
  tagResource: false,
  columns: [col("name", "Name", (i) => i.Name), { id: "status", label: "Status", value: (i) => <State value={i.Status} />, sort: (i) => s(i.Status) }, col("certs", "Certificates", (i) => i.NumberOfCaCertificates), col("arn", "ARN", (i) => i.TrustStoreArn)],
  details: [{ label: "ARN", value: (i) => <Copyable value={s(i.TrustStoreArn)} /> }, { label: "CA certificates", value: (i) => dash(i.NumberOfCaCertificates) }, { label: "Revoked entries", value: (i) => dash(i.TotalRevokedEntries) }],
  deleteAction: { operation: "DeleteTrustStore", input: (i) => ({ TrustStoreArn: i.TrustStoreArn }) },
}

/* ---------------- Create pages ---------------- */

function useNetwork(vpc: string) {
  const vpcs = useAws<{ Vpcs?: Item[] }>("ec2", "DescribeVpcs", {})
  const subnets = useAws<{ Subnets?: Item[] }>("ec2", "DescribeSubnets", { Filters: [{ Name: "vpc-id", Values: [vpc] }] }, { enabled: Boolean(vpc) })
  const sgs = useAws<{ SecurityGroups?: Item[] }>("ec2", "DescribeSecurityGroups", { Filters: [{ Name: "vpc-id", Values: [vpc] }] }, { enabled: Boolean(vpc) })
  return { vpcs: vpcs.data?.Vpcs ?? [], subnets: subnets.data?.Subnets ?? [], sgs: sgs.data?.SecurityGroups ?? [] }
}

function CreateLoadBalancerPage() {
  const groups = useAws<{ TargetGroups?: Item[] }>(M, "DescribeTargetGroups", {})
  const [f, setF] = useState({ type: "application", name: "", scheme: "internet-facing", ipType: "ipv4", vpc: "", subnets: [] as string[], sgs: [] as string[], protocol: "HTTP", port: "80", group: "" })
  const net = useNetwork(f.vpc)
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p })
  const app = f.type === "application"
  return (
    <Ec2CreatePage
      title={`Create ${app ? "Application" : f.type === "network" ? "Network" : "Gateway"} Load Balancer`}
      listTitle="Load balancers"
      listHref="/ec2/load-balancers"
      submitLabel="Create load balancer"
      onSubmit={async () => {
        if (!f.name || !f.vpc || f.subnets.length === 0) throw new Error("Enter a name and choose a VPC and subnets.")
        const r = await callAws<{ LoadBalancers?: Item[] }>(M, "CreateLoadBalancer", { Name: f.name, Type: f.type, ...(f.type !== "gateway" ? { Scheme: f.scheme, IpAddressType: f.ipType } : {}), Subnets: f.subnets, ...(app && f.sgs.length ? { SecurityGroups: f.sgs } : {}) })
        const arn = s(r.LoadBalancers?.[0]?.LoadBalancerArn)
        if (f.group) await callAws(M, "CreateListener", { LoadBalancerArn: arn, ...(f.type === "gateway" ? {} : { Protocol: f.protocol, Port: Number(f.port) }), DefaultActions: [{ Type: "forward", TargetGroupArn: f.group }] })
        flash.success(`Successfully created load balancer: ${f.name}`)
        return `/ec2/load-balancers/${encodeURIComponent(f.name)}`
      }}
    >
      <Container header={<Header variant="h2">Load balancer types</Header>}>
        <Tiles value={f.type} onChange={({ detail }) => set({ type: detail.value, protocol: detail.value === "application" ? "HTTP" : "TCP" })} columns={3} items={[{ value: "application", label: "Application Load Balancer", description: "HTTP and HTTPS traffic with advanced request routing." }, { value: "network", label: "Network Load Balancer", description: "TCP, UDP and TLS traffic with ultra-low latency." }, { value: "gateway", label: "Gateway Load Balancer", description: "Third-party virtual appliances using GENEVE." }]} />
      </Container>
      <Container header={<Header variant="h2">Basic configuration</Header>}>
        <SpaceBetween size="l">
          <FormField label="Load balancer name" constraintText="A maximum of 32 alphanumeric characters including hyphens are allowed, but the name must not begin or end with a hyphen."><Input value={f.name} onChange={({ detail }) => set({ name: detail.value })} /></FormField>
          {f.type !== "gateway" && <FormField label="Scheme"><RadioGroup value={f.scheme} onChange={({ detail }) => set({ scheme: detail.value })} items={[{ value: "internet-facing", label: "Internet-facing", description: "Serves internet-facing traffic." }, { value: "internal", label: "Internal", description: "Serves internal traffic." }]} /></FormField>}
          {f.type !== "gateway" && <FormField label="Load balancer IP address type"><RadioGroup value={f.ipType} onChange={({ detail }) => set({ ipType: detail.value })} items={[{ value: "ipv4", label: "IPv4" }, { value: "dualstack", label: "Dualstack" }]} /></FormField>}
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">Network mapping</Header>}>
        <SpaceBetween size="l">
          <FormField label="VPC"><Select selectedOption={f.vpc ? { value: f.vpc, label: f.vpc } : null} placeholder="Select a VPC" onChange={({ detail }) => set({ vpc: detail.selectedOption.value ?? "", subnets: [], sgs: [] })} options={net.vpcs.map((v) => ({ value: s(v.VpcId) ?? "", label: s(v.VpcId), description: s(v.CidrBlock) }))} /></FormField>
          <FormField label="Availability Zones and subnets" description={app ? "Select at least two Availability Zones and one subnet per zone." : "Select at least one subnet."}><Multiselect selectedOptions={f.subnets.map((x) => ({ value: x, label: x }))} placeholder="Choose subnets" onChange={({ detail }) => set({ subnets: detail.selectedOptions.map((x) => x.value ?? "") })} options={net.subnets.map((x) => ({ value: s(x.SubnetId) ?? "", label: s(x.SubnetId), description: `${x.AvailabilityZone} · ${x.CidrBlock}` }))} /></FormField>
        </SpaceBetween>
      </Container>
      {app && <Container header={<Header variant="h2">Security groups</Header>}><Multiselect selectedOptions={f.sgs.map((x) => ({ value: x, label: x }))} placeholder="Select up to 5 security groups" onChange={({ detail }) => set({ sgs: detail.selectedOptions.map((x) => x.value ?? "") })} options={net.sgs.map((g) => ({ value: s(g.GroupId) ?? "", label: s(g.GroupName), description: s(g.GroupId) }))} /></Container>}
      <Container header={<Header variant="h2">Listeners and routing</Header>}>
        <SpaceBetween size="l">
          {f.type !== "gateway" && (
            <SpaceBetween direction="horizontal" size="l">
              <FormField label="Protocol"><Select selectedOption={{ value: f.protocol, label: f.protocol }} onChange={({ detail }) => set({ protocol: detail.selectedOption.value ?? "HTTP" })} options={(app ? ["HTTP", "HTTPS"] : ["TCP", "UDP", "TCP_UDP", "TLS"]).map((p) => ({ value: p, label: p }))} /></FormField>
              <FormField label="Port"><Input type="number" value={f.port} onChange={({ detail }) => set({ port: detail.value })} /></FormField>
            </SpaceBetween>
          )}
          <FormField label="Default action - forward to" description="Leave empty to create the load balancer without a listener."><Select selectedOption={f.group ? { value: f.group, label: f.group.split("/")[1] } : null} placeholder="Select a target group" empty="No target groups" onChange={({ detail }) => set({ group: detail.selectedOption.value ?? "" })} options={(groups.data?.TargetGroups ?? []).map((g) => ({ value: s(g.TargetGroupArn) ?? "", label: s(g.TargetGroupName), description: `${g.Protocol}:${g.Port} · ${g.TargetType}` }))} /></FormField>
        </SpaceBetween>
      </Container>
    </Ec2CreatePage>
  )
}

function CreateTargetGroupPage() {
  const [f, setF] = useState({ type: "instance", name: "", protocol: "HTTP", port: "80", vpc: "", hcProtocol: "HTTP", hcPath: "/" })
  const net = useNetwork(f.vpc)
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p })
  return (
    <Ec2CreatePage
      title="Create target group"
      listTitle="Target groups"
      listHref="/ec2/target-groups"
      submitLabel="Create target group"
      onSubmit={async () => {
        if (!f.name) throw new Error("Enter a target group name.")
        await callAws(M, "CreateTargetGroup", { Name: f.name, TargetType: f.type, ...(f.type !== "lambda" ? { Protocol: f.protocol, Port: Number(f.port), VpcId: f.vpc, HealthCheckProtocol: f.hcProtocol, ...(f.hcProtocol.startsWith("HTTP") ? { HealthCheckPath: f.hcPath } : {}) } : {}) })
        flash.success(`Successfully created target group: ${f.name}`)
        return `/ec2/target-groups/${encodeURIComponent(f.name)}`
      }}
    >
      <Container header={<Header variant="h2">Basic configuration</Header>}>
        <SpaceBetween size="l">
          <FormField label="Choose a target type"><Tiles value={f.type} onChange={({ detail }) => set({ type: detail.value })} columns={2} items={[{ value: "instance", label: "Instances", description: "Supports load balancing to instances within a specific VPC." }, { value: "ip", label: "IP addresses", description: "Supports load balancing to VPC and on-premises resources." }, { value: "lambda", label: "Lambda function", description: "Facilitates routing to a single Lambda function." }, { value: "alb", label: "Application Load Balancer", description: "Use a Network Load Balancer to route to an Application Load Balancer." }]} /></FormField>
          <FormField label="Target group name" constraintText="A maximum of 32 alphanumeric characters including hyphens are allowed."><Input value={f.name} onChange={({ detail }) => set({ name: detail.value })} /></FormField>
          {f.type !== "lambda" && (
            <>
              <SpaceBetween direction="horizontal" size="l">
                <FormField label="Protocol"><Select selectedOption={{ value: f.protocol, label: f.protocol }} onChange={({ detail }) => set({ protocol: detail.selectedOption.value ?? "HTTP" })} options={["HTTP", "HTTPS", "TCP", "TLS", "UDP", "TCP_UDP", "GENEVE"].map((p) => ({ value: p, label: p }))} /></FormField>
                <FormField label="Port"><Input type="number" value={f.port} onChange={({ detail }) => set({ port: detail.value })} /></FormField>
              </SpaceBetween>
              <FormField label="VPC"><Select selectedOption={f.vpc ? { value: f.vpc, label: f.vpc } : null} placeholder="Select a VPC" onChange={({ detail }) => set({ vpc: detail.selectedOption.value ?? "" })} options={net.vpcs.map((v) => ({ value: s(v.VpcId) ?? "", label: s(v.VpcId), description: s(v.CidrBlock) }))} /></FormField>
            </>
          )}
        </SpaceBetween>
      </Container>
      {f.type !== "lambda" && (
        <Container header={<Header variant="h2">Health checks</Header>}>
          <SpaceBetween direction="horizontal" size="l">
            <FormField label="Health check protocol"><Select selectedOption={{ value: f.hcProtocol, label: f.hcProtocol }} onChange={({ detail }) => set({ hcProtocol: detail.selectedOption.value ?? "HTTP" })} options={["HTTP", "HTTPS", "TCP"].map((p) => ({ value: p, label: p }))} /></FormField>
            {f.hcProtocol.startsWith("HTTP") && <FormField label="Health check path"><Input value={f.hcPath} onChange={({ detail }) => set({ hcPath: detail.value })} /></FormField>}
          </SpaceBetween>
        </Container>
      )}
    </Ec2CreatePage>
  )
}

export const elbDefs: Record<string, ResourceDef> = { "load-balancers": loadBalancersDef, "target-groups": targetGroupsDef, "trust-stores": trustStoresDef }
export const elbCreatePages: Record<string, ComponentType> = { "load-balancers": CreateLoadBalancerPage, "target-groups": CreateTargetGroupPage }
