"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import Multiselect from "@cloudscape-design/components/multiselect"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, Section } from "@/components/console/sections"
import { useFollow } from "@/components/shell/page-layout"
import { DdbLayout } from "@/components/dynamodb/ddb-app"
import { callAws, unavailableReason, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type Node = { NodeId?: string; Endpoint?: { Address?: string; Port?: number }; NodeCreateTime?: string; AvailabilityZone?: string; NodeStatus?: string; ParameterGroupStatus?: string }
type Cluster = {
  ClusterName?: string
  Description?: string
  ClusterArn?: string
  TotalNodes?: number
  ActiveNodes?: number
  NodeType?: string
  Status?: string
  ClusterDiscoveryEndpoint?: { Address?: string; Port?: number; URL?: string }
  Nodes?: Node[]
  PreferredMaintenanceWindow?: string
  SubnetGroup?: string
  SecurityGroups?: { SecurityGroupIdentifier?: string; Status?: string }[]
  IamRoleArn?: string
  ParameterGroup?: { ParameterGroupName?: string; ParameterApplyStatus?: string }
  SSEDescription?: { Status?: string }
  ClusterEndpointEncryptionType?: string
  NetworkType?: string
}
type SubnetGroup = { SubnetGroupName?: string; Description?: string; VpcId?: string; Subnets?: { SubnetIdentifier?: string; SubnetAvailabilityZone?: string }[] }
type ParameterGroup = { ParameterGroupName?: string; Description?: string }
type Parameter = { ParameterName?: string; ParameterValue?: string; Description?: string; DataType?: string; AllowedValues?: string; IsModifiable?: string; ChangeType?: string }
type DaxEvent = { SourceName?: string; SourceType?: string; Message?: string; Date?: string }

const nodeTypes = ["dax.t3.small", "dax.t3.medium", "dax.r5.large", "dax.r5.xlarge", "dax.r5.2xlarge", "dax.r5.4xlarge"]

function ClusterStatus({ value }: { value?: string }) {
  if (!value) return <>–</>
  return <StatusIndicator type={value === "available" ? "success" : value === "deleting" ? "in-progress" : value.includes("fail") ? "error" : "in-progress"}>{value.charAt(0).toUpperCase() + value.slice(1)}</StatusIndicator>
}

export function DaxPage({ section, sub }: { section: string; sub?: string }) {
  if (section === "clusters" && sub) return <ClusterDetail name={decodeURIComponent(sub)} />
  if (section === "subnet-groups") return <SubnetGroups />
  if (section === "parameter-groups") return sub ? <ParameterGroupDetail name={decodeURIComponent(sub)} /> : <ParameterGroups />
  if (section === "events") return <Events />
  return <Clusters />
}

function Clusters() {
  const follow = useFollow()
  const clusters = useAws<{ Clusters?: Cluster[] }>("dax", "DescribeClusters", {}, { refetchInterval: (q) => ((q.state.data?.Clusters ?? []).some((c) => c.Status !== "available") ? 4000 : false) })
  const [selected, setSelected] = useState<Cluster[]>([])
  const [modal, setModal] = useState<string>()
  return (
    <DdbLayout breadcrumbs={[{ text: "DAX", href: "/dynamodb/dax/clusters" }, { text: "Clusters", href: "/dynamodb/dax/clusters" }]} contentType="table">
      <ResourceTable<Cluster>
        title="Clusters"
        items={clusters.data?.Clusters ?? []}
        loading={clusters.isPending}
        loadingText="Loading clusters"
        error={clusters.error}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="ClusterName"
        filterPlaceholder="Find clusters"
        columns={[
          { id: "name", header: "Cluster name", value: (c) => c.ClusterName, cell: (c) => <Link href={`/dynamodb/dax/clusters/${encodeURIComponent(c.ClusterName ?? "")}`} onFollow={follow}>{c.ClusterName}</Link> },
          { id: "status", header: "Status", value: (c) => c.Status, cell: (c) => <ClusterStatus value={c.Status} /> },
          { id: "nodes", header: "Nodes", value: (c) => c.TotalNodes, cell: (c) => String(c.TotalNodes ?? 0) },
          { id: "type", header: "Node type", value: (c) => c.NodeType, cell: (c) => c.NodeType },
          { id: "endpoint", header: "Cluster endpoint", value: (c) => c.ClusterDiscoveryEndpoint?.Address, cell: (c) => c.ClusterDiscoveryEndpoint?.URL ?? c.ClusterDiscoveryEndpoint?.Address ?? "–" },
          { id: "encryption", header: "Encryption", value: (c) => c.SSEDescription?.Status, cell: (c) => (c.SSEDescription?.Status === "ENABLED" ? "Enabled" : "Disabled") },
        ]}
        empty={<EmptyState title="No clusters" subtitle="No clusters to display." action={<Button onClick={() => setModal("create")}>Create cluster</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={clusters.isFetching} onClick={() => void clusters.refetch()} />
            <Button disabled={!selected[0]} onClick={() => setModal("delete")}>Delete</Button>
            <Button variant="primary" onClick={() => setModal("create")}>Create cluster</Button>
          </SpaceBetween>
        }
      />
      {modal === "create" && <CreateClusterModal close={() => setModal(undefined)} onDone={() => void clusters.refetch()} />}
      {modal === "delete" && selected[0] && <DeleteClusterModal name={selected[0].ClusterName ?? ""} close={() => setModal(undefined)} onDone={() => { setSelected([]); void clusters.refetch() }} />}
    </DdbLayout>
  )
}

function DeleteClusterModal({ name, close, onDone }: { name: string; close: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState("")
  return (
    <EditModal visible title="Delete cluster" saveLabel="Delete" saveDisabled={confirm !== "delete"} onDismiss={close} success={`Deleting cluster ${name}.`} onSave={async () => { await callAws("dax", "DeleteCluster", { ClusterName: name }); onDone() }}>
      <Box>Delete cluster <b>{name}</b>? All nodes in the cluster are deleted.</Box>
      <FormField label={<>To confirm deletion, type <i>delete</i>.</>}><Input value={confirm} placeholder="delete" onChange={({ detail }) => setConfirm(detail.value)} /></FormField>
    </EditModal>
  )
}

function CreateClusterModal({ close, onDone }: { close: () => void; onDone: () => void }) {
  const subnets = useAws<{ SubnetGroups?: SubnetGroup[] }>("dax", "DescribeSubnetGroups", {})
  const params = useAws<{ ParameterGroups?: ParameterGroup[] }>("dax", "DescribeParameterGroups", {})
  const [form, setForm] = useState({ name: "", description: "", nodeType: "dax.t3.small", nodes: "3", subnetGroup: "", role: "", parameterGroup: "default.dax1.0", encryption: "ENABLED", tls: "TLS" })
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })
  return (
    <EditModal
      visible
      size="large"
      title="Create cluster"
      saveLabel="Create cluster"
      saveDisabled={!form.name || !form.role}
      onDismiss={close}
      success={`Creating cluster ${form.name}.`}
      onSave={async () => {
        await callAws("dax", "CreateCluster", {
          ClusterName: form.name,
          NodeType: form.nodeType,
          ReplicationFactor: Number(form.nodes),
          IamRoleArn: form.role,
          ...(form.description ? { Description: form.description } : {}),
          ...(form.subnetGroup ? { SubnetGroupName: form.subnetGroup } : {}),
          ...(form.parameterGroup ? { ParameterGroupName: form.parameterGroup } : {}),
          SSESpecification: { Enabled: form.encryption === "ENABLED" },
          ClusterEndpointEncryptionType: form.tls,
        })
        onDone()
      }}
    >
      <FormField label="Cluster name" constraintText="Up to 20 characters. Letters, numbers and hyphens."><Input value={form.name} onChange={({ detail }) => set({ name: detail.value })} /></FormField>
      <FormField label="Description - optional"><Input value={form.description} onChange={({ detail }) => set({ description: detail.value })} /></FormField>
      <SpaceBetween direction="horizontal" size="l">
        <FormField label="Node type"><Select selectedOption={{ value: form.nodeType, label: form.nodeType }} onChange={({ detail }) => set({ nodeType: detail.selectedOption.value ?? "dax.t3.small" })} options={nodeTypes.map((t) => ({ value: t, label: t }))} /></FormField>
        <FormField label="Cluster size" description="Number of nodes (1-11)."><Input type="number" value={form.nodes} onChange={({ detail }) => set({ nodes: detail.value })} /></FormField>
      </SpaceBetween>
      <FormField label="Subnet group"><Select selectedOption={form.subnetGroup ? { value: form.subnetGroup, label: form.subnetGroup } : null} placeholder="Default subnet group" onChange={({ detail }) => set({ subnetGroup: detail.selectedOption.value ?? "" })} options={(subnets.data?.SubnetGroups ?? []).map((g) => ({ value: g.SubnetGroupName ?? "", label: g.SubnetGroupName ?? "", description: g.VpcId }))} /></FormField>
      <FormField label="IAM role ARN" description="The role DAX assumes to access DynamoDB tables."><Input value={form.role} placeholder="arn:aws:iam::123456789012:role/DAXServiceRole" onChange={({ detail }) => set({ role: detail.value })} /></FormField>
      <FormField label="Parameter group"><Select selectedOption={{ value: form.parameterGroup, label: form.parameterGroup }} onChange={({ detail }) => set({ parameterGroup: detail.selectedOption.value ?? "" })} options={(params.data?.ParameterGroups ?? [{ ParameterGroupName: "default.dax1.0" }]).map((g) => ({ value: g.ParameterGroupName ?? "", label: g.ParameterGroupName ?? "" }))} /></FormField>
      <SpaceBetween direction="horizontal" size="l">
        <FormField label="Encryption at rest"><Select selectedOption={{ value: form.encryption, label: form.encryption === "ENABLED" ? "Turn on" : "Turn off" }} onChange={({ detail }) => set({ encryption: detail.selectedOption.value ?? "ENABLED" })} options={[{ value: "ENABLED", label: "Turn on" }, { value: "DISABLED", label: "Turn off" }]} /></FormField>
        <FormField label="Encryption in transit"><Select selectedOption={{ value: form.tls, label: form.tls === "TLS" ? "Turn on" : "Turn off" }} onChange={({ detail }) => set({ tls: detail.selectedOption.value ?? "TLS" })} options={[{ value: "TLS", label: "Turn on" }, { value: "NONE", label: "Turn off" }]} /></FormField>
      </SpaceBetween>
    </EditModal>
  )
}

function ClusterDetail({ name }: { name: string }) {
  const router = useRouter()
  const clusters = useAws<{ Clusters?: Cluster[] }>("dax", "DescribeClusters", { ClusterNames: [name] }, { refetchInterval: (q) => (q.state.data?.Clusters?.[0]?.Status !== "available" ? 4000 : false) })
  const cluster = clusters.data?.Clusters?.[0]
  const [modal, setModal] = useState<string>()
  const [nodes, setNodes] = useState("")
  const [form, setForm] = useState({ description: "", window: "" })
  return (
    <DdbLayout breadcrumbs={[{ text: "DAX", href: "/dynamodb/dax/clusters" }, { text: "Clusters", href: "/dynamodb/dax/clusters" }, { text: name, href: "#" }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <ButtonDropdown
                  items={[
                    { id: "add", text: "Add nodes" },
                    { id: "remove", text: "Remove nodes", disabled: true, disabledReason: unavailableReason("dax", "DecreaseReplicationFactor") },
                    { id: "edit", text: "Edit settings" },
                  ]}
                  onItemClick={({ detail }) => {
                    setNodes(String((cluster?.TotalNodes ?? 1) + 1))
                    setForm({ description: cluster?.Description ?? "", window: cluster?.PreferredMaintenanceWindow ?? "" })
                    setModal(detail.id)
                  }}
                >
                  Actions
                </ButtonDropdown>
                <Button onClick={() => setModal("delete")}>Delete</Button>
              </SpaceBetween>
            }
          >
            {name}
          </Header>
        }
      >
        <Tabs
          tabs={[
            {
              id: "settings",
              label: "Cluster settings",
              content: (
                <SpaceBetween size="l">
                  <Section
                    title="Cluster details"
                    columns={3}
                    items={[
                      { label: "Cluster name", value: cluster?.ClusterName ?? name },
                      { label: "Status", value: <ClusterStatus value={cluster?.Status} /> },
                      { label: "Description", value: cluster?.Description || "–" },
                      { label: "Node type", value: cluster?.NodeType ?? "–" },
                      { label: "Nodes", value: `${cluster?.ActiveNodes ?? 0} of ${cluster?.TotalNodes ?? 0} active` },
                      { label: "Cluster ARN", value: cluster?.ClusterArn ?? "–" },
                      { label: "Cluster endpoint", value: cluster?.ClusterDiscoveryEndpoint?.URL ?? cluster?.ClusterDiscoveryEndpoint?.Address ?? "–" },
                      { label: "Subnet group", value: cluster?.SubnetGroup ?? "–" },
                      { label: "Security groups", value: cluster?.SecurityGroups?.map((g) => g.SecurityGroupIdentifier).join(", ") || "–" },
                      { label: "IAM role", value: cluster?.IamRoleArn ?? "–" },
                      { label: "Parameter group", value: cluster?.ParameterGroup?.ParameterGroupName ?? "–" },
                      { label: "Maintenance window", value: cluster?.PreferredMaintenanceWindow ?? "–" },
                      { label: "Encryption at rest", value: cluster?.SSEDescription?.Status === "ENABLED" ? "Enabled" : "Disabled" },
                      { label: "Encryption in transit", value: cluster?.ClusterEndpointEncryptionType === "TLS" ? "Enabled" : "Disabled" },
                      { label: "Network type", value: cluster?.NetworkType ?? "IPv4" },
                    ]}
                  />
                </SpaceBetween>
              ),
            },
            {
              id: "nodes",
              label: "Nodes",
              content: (
                <Table<Node>
                  header={<Header variant="h2" counter={`(${cluster?.Nodes?.length ?? 0})`}>Nodes</Header>}
                  items={cluster?.Nodes ?? []}
                  columnDefinitions={[
                    { id: "id", header: "Node name", cell: (n) => n.NodeId },
                    { id: "status", header: "Status", cell: (n) => <ClusterStatus value={n.NodeStatus} /> },
                    { id: "az", header: "Availability Zone", cell: (n) => n.AvailabilityZone ?? "–" },
                    { id: "endpoint", header: "Endpoint", cell: (n) => (n.Endpoint?.Address ? `${n.Endpoint.Address}:${n.Endpoint.Port}` : "–") },
                    { id: "created", header: "Created", cell: (n) => consoleDate(n.NodeCreateTime) },
                  ]}
                  empty={<Box textAlign="center">No nodes</Box>}
                />
              ),
            },
            { id: "metrics", label: "Metrics", content: <Box color="text-status-inactive">CloudWatch metrics for DAX are not reported by the local emulator.</Box> },
            { id: "tags", label: "Tags", content: <Section title="Tags"><Box color="text-status-inactive">{unavailableReason("dax", "ListTags")}</Box></Section> },
          ]}
        />
      </ContentLayout>
      {modal === "delete" && <DeleteClusterModal name={name} close={() => setModal(undefined)} onDone={() => router.push("/dynamodb/dax/clusters")} />}
      <EditModal visible={modal === "add"} title="Add nodes" saveLabel="Add nodes" onDismiss={() => setModal(undefined)} success="Adding nodes to the cluster." onSave={async () => { await callAws("dax", "IncreaseReplicationFactor", { ClusterName: name, NewReplicationFactor: Number(nodes) }); await clusters.refetch() }}>
        <FormField label="New number of nodes"><Input type="number" value={nodes} onChange={({ detail }) => setNodes(detail.value)} /></FormField>
      </EditModal>
      <EditModal visible={modal === "edit"} title="Edit cluster settings" onDismiss={() => setModal(undefined)} success="Cluster settings updated." onSave={async () => { await callAws("dax", "UpdateCluster", { ClusterName: name, Description: form.description, ...(form.window ? { PreferredMaintenanceWindow: form.window } : {}) }); await clusters.refetch() }}>
        <FormField label="Description"><Input value={form.description} onChange={({ detail }) => setForm({ ...form, description: detail.value })} /></FormField>
        <FormField label="Maintenance window" constraintText="Format: ddd:hh24:mi-ddd:hh24:mi"><Input value={form.window} placeholder="sun:05:00-sun:06:00" onChange={({ detail }) => setForm({ ...form, window: detail.value })} /></FormField>
      </EditModal>
    </DdbLayout>
  )
}

function SubnetGroups() {
  const groups = useAws<{ SubnetGroups?: SubnetGroup[] }>("dax", "DescribeSubnetGroups", {})
  const vpcs = useAws<{ Vpcs?: { VpcId?: string }[] }>("ec2", "DescribeVpcs", {})
  const [selected, setSelected] = useState<SubnetGroup[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", vpc: "", subnets: [] as string[] })
  const subnets = useAws<{ Subnets?: { SubnetId?: string; AvailabilityZone?: string; CidrBlock?: string }[] }>("ec2", "DescribeSubnets", { Filters: [{ Name: "vpc-id", Values: [form.vpc] }] }, { enabled: Boolean(form.vpc) })
  return (
    <DdbLayout breadcrumbs={[{ text: "DAX", href: "/dynamodb/dax/clusters" }, { text: "Subnet groups", href: "/dynamodb/dax/subnet-groups" }]} contentType="table">
      <ResourceTable<SubnetGroup>
        title="Subnet groups"
        items={groups.data?.SubnetGroups ?? []}
        loading={groups.isPending}
        loadingText="Loading subnet groups"
        error={groups.error}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="SubnetGroupName"
        filterPlaceholder="Find subnet groups"
        columns={[
          { id: "name", header: "Name", value: (g) => g.SubnetGroupName, cell: (g) => g.SubnetGroupName },
          { id: "description", header: "Description", value: (g) => g.Description, cell: (g) => g.Description || "–" },
          { id: "vpc", header: "VPC ID", value: (g) => g.VpcId, cell: (g) => g.VpcId ?? "–" },
          { id: "subnets", header: "Subnets", value: (g) => g.Subnets?.length, cell: (g) => g.Subnets?.map((s) => s.SubnetIdentifier).join(", ") || "–" },
        ]}
        empty={<EmptyState title="No subnet groups" subtitle="No subnet groups to display." action={<Button onClick={() => setOpen(true)}>Create subnet group</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={groups.isFetching} onClick={() => void groups.refetch()} />
            <Button disabled disabledReason={unavailableReason("dax", "UpdateSubnetGroup")}>Edit</Button>
            <Button disabled disabledReason={unavailableReason("dax", "DeleteSubnetGroup")}>Delete</Button>
            <Button variant="primary" onClick={() => setOpen(true)}>Create subnet group</Button>
          </SpaceBetween>
        }
      />
      <EditModal
        visible={open}
        size="large"
        title="Create subnet group"
        saveLabel="Create"
        saveDisabled={!form.name || form.subnets.length === 0}
        onDismiss={() => setOpen(false)}
        success={`Subnet group ${form.name} was created.`}
        onSave={async () => { await callAws("dax", "CreateSubnetGroup", { SubnetGroupName: form.name, ...(form.description ? { Description: form.description } : {}), SubnetIds: form.subnets }); await groups.refetch() }}
      >
        <FormField label="Name"><Input value={form.name} onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
        <FormField label="Description - optional"><Input value={form.description} onChange={({ detail }) => setForm({ ...form, description: detail.value })} /></FormField>
        <FormField label="VPC ID"><Select selectedOption={form.vpc ? { value: form.vpc, label: form.vpc } : null} placeholder="Choose a VPC" onChange={({ detail }) => setForm({ ...form, vpc: detail.selectedOption.value ?? "", subnets: [] })} options={(vpcs.data?.Vpcs ?? []).map((v) => ({ value: v.VpcId ?? "", label: v.VpcId ?? "" }))} /></FormField>
        <FormField label="Subnets">
          <Multiselect
            selectedOptions={form.subnets.map((s) => ({ value: s, label: s }))}
            placeholder="Choose subnets"
            onChange={({ detail }) => setForm({ ...form, subnets: detail.selectedOptions.map((o) => o.value ?? "") })}
            options={(subnets.data?.Subnets ?? []).map((s) => ({ value: s.SubnetId ?? "", label: s.SubnetId ?? "", description: `${s.AvailabilityZone} · ${s.CidrBlock}` }))}
          />
        </FormField>
      </EditModal>
    </DdbLayout>
  )
}

function ParameterGroups() {
  const follow = useFollow()
  const groups = useAws<{ ParameterGroups?: ParameterGroup[] }>("dax", "DescribeParameterGroups", {})
  const [selected, setSelected] = useState<ParameterGroup[]>([])
  const [modal, setModal] = useState<string>()
  const [form, setForm] = useState({ name: "", description: "" })
  return (
    <DdbLayout breadcrumbs={[{ text: "DAX", href: "/dynamodb/dax/clusters" }, { text: "Parameter groups", href: "/dynamodb/dax/parameter-groups" }]} contentType="table">
      <ResourceTable<ParameterGroup>
        title="Parameter groups"
        items={groups.data?.ParameterGroups ?? []}
        loading={groups.isPending}
        loadingText="Loading parameter groups"
        error={groups.error}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="ParameterGroupName"
        filterPlaceholder="Find parameter groups"
        columns={[
          { id: "name", header: "Name", value: (g) => g.ParameterGroupName, cell: (g) => <Link href={`/dynamodb/dax/parameter-groups/${encodeURIComponent(g.ParameterGroupName ?? "")}`} onFollow={follow}>{g.ParameterGroupName}</Link> },
          { id: "description", header: "Description", value: (g) => g.Description, cell: (g) => g.Description || "–" },
        ]}
        empty={<EmptyState title="No parameter groups" subtitle="No parameter groups to display." />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={groups.isFetching} onClick={() => void groups.refetch()} />
            <Button disabled={!selected[0] || selected[0].ParameterGroupName?.startsWith("default.")} onClick={() => setModal("delete")}>Delete</Button>
            <Button variant="primary" onClick={() => { setForm({ name: "", description: "" }); setModal("create") }}>Create parameter group</Button>
          </SpaceBetween>
        }
      />
      <EditModal visible={modal === "create"} title="Create parameter group" saveLabel="Create" saveDisabled={!form.name} onDismiss={() => setModal(undefined)} success={`Parameter group ${form.name} was created.`} onSave={async () => { await callAws("dax", "CreateParameterGroup", { ParameterGroupName: form.name, ...(form.description ? { Description: form.description } : {}) }); await groups.refetch() }}>
        <FormField label="Name"><Input value={form.name} onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
        <FormField label="Description - optional"><Input value={form.description} onChange={({ detail }) => setForm({ ...form, description: detail.value })} /></FormField>
      </EditModal>
      <EditModal visible={modal === "delete"} title="Delete parameter group" saveLabel="Delete" onDismiss={() => setModal(undefined)} success={`Parameter group ${selected[0]?.ParameterGroupName} was deleted.`} onSave={async () => { await callAws("dax", "DeleteParameterGroup", { ParameterGroupName: selected[0]?.ParameterGroupName }); setSelected([]); await groups.refetch() }}>
        <Box>Delete parameter group <b>{selected[0]?.ParameterGroupName}</b>?</Box>
      </EditModal>
    </DdbLayout>
  )
}

function ParameterGroupDetail({ name }: { name: string }) {
  const params = useAws<{ Parameters?: Parameter[] }>("dax", "DescribeParameters", { ParameterGroupName: name })
  const [editing, setEditing] = useState<Parameter>()
  const [value, setValue] = useState("")
  return (
    <DdbLayout breadcrumbs={[{ text: "DAX", href: "/dynamodb/dax/clusters" }, { text: "Parameter groups", href: "/dynamodb/dax/parameter-groups" }, { text: name, href: "#" }]}>
      <ContentLayout header={<Header variant="h1">{name}</Header>}>
        <Table<Parameter>
          header={<Header variant="h2" counter={`(${params.data?.Parameters?.length ?? 0})`}>Parameters</Header>}
          loading={params.isPending}
          items={params.data?.Parameters ?? []}
          columnDefinitions={[
            { id: "name", header: "Name", cell: (p) => p.ParameterName },
            { id: "value", header: "Value", cell: (p) => p.ParameterValue ?? "–" },
            { id: "allowed", header: "Allowed values", cell: (p) => p.AllowedValues ?? "–" },
            { id: "type", header: "Data type", cell: (p) => p.DataType ?? "–" },
            { id: "modifiable", header: "Modifiable", cell: (p) => (p.IsModifiable === "TRUE" ? "Yes" : "No") },
            { id: "description", header: "Description", cell: (p) => p.Description ?? "–" },
            { id: "edit", header: "", cell: (p) => <Button variant="inline-link" disabled={p.IsModifiable !== "TRUE" || name.startsWith("default.")} onClick={() => { setValue(p.ParameterValue ?? ""); setEditing(p) }}>Edit</Button> },
          ]}
          empty={<Box textAlign="center">No parameters</Box>}
        />
      </ContentLayout>
      <EditModal visible={Boolean(editing)} title={`Edit ${editing?.ParameterName ?? ""}`} onDismiss={() => setEditing(undefined)} success="Parameter updated." onSave={async () => { await callAws("dax", "UpdateParameterGroup", { ParameterGroupName: name, ParameterNameValues: [{ ParameterName: editing?.ParameterName, ParameterValue: value }] }); await params.refetch() }}>
        <FormField label="Value" description={editing?.AllowedValues ? `Allowed values: ${editing.AllowedValues}` : undefined}><Input value={value} onChange={({ detail }) => setValue(detail.value)} /></FormField>
      </EditModal>
    </DdbLayout>
  )
}

function Events() {
  const events = useAws<{ Events?: DaxEvent[] }>("dax", "DescribeEvents", { Duration: 20160 })
  return (
    <DdbLayout breadcrumbs={[{ text: "DAX", href: "/dynamodb/dax/clusters" }, { text: "Events", href: "/dynamodb/dax/events" }]} contentType="table">
      <ResourceTable<DaxEvent>
        title="Events"
        description="Events from the past 14 days."
        items={events.data?.Events ?? []}
        loading={events.isPending}
        loadingText="Loading events"
        error={events.error}
        trackBy={(e) => `${e.Date}${e.SourceName}${e.Message}`}
        filterPlaceholder="Find events"
        columns={[
          { id: "source", header: "Source", value: (e) => e.SourceName, cell: (e) => e.SourceName },
          { id: "type", header: "Type", value: (e) => e.SourceType, cell: (e) => e.SourceType },
          { id: "date", header: "Date", value: (e) => e.Date, cell: (e) => consoleDate(e.Date) },
          { id: "message", header: "Message", value: (e) => e.Message, cell: (e) => e.Message },
        ]}
        empty={<EmptyState title="No events" subtitle="No events in the past 14 days." />}
        actions={<Button iconName="refresh" ariaLabel="Refresh" loading={events.isFetching} onClick={() => void events.refetch()} />}
      />
    </DdbLayout>
  )
}
