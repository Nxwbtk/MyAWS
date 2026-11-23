"use client"

import Box from "@cloudscape-design/components/box"
import Checkbox from "@cloudscape-design/components/checkbox"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import { useState } from "react"
import { Copyable, OperationModal, ResourceTableLite, State, dash, nameTag, type Ctx, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { MainNetworkAcl, MainRouteTable, ResLink, useList } from "@/components/vpc/shared"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"
import { moreDefs } from "@/components/vpc/defs-more"

const s = (value: unknown) => (value === undefined || value === null ? undefined : String(value))
const nameCol = { id: "name", label: "Name", value: (item: Item) => nameTag(item) ?? "–", sort: (item: Item) => nameTag(item) }

function VpcAttribute({ vpcId, attribute }: { vpcId: string; attribute: "enableDnsHostnames" | "enableDnsSupport" | "enableNetworkAddressUsageMetrics" }) {
  const result = useAws<Record<string, { Value?: boolean }>>("ec2", "DescribeVpcAttribute", { VpcId: vpcId, Attribute: attribute }, { staleTime: 10_000 })
  const key = attribute.charAt(0).toUpperCase() + attribute.slice(1)
  if (result.isPending) return <>…</>
  return <>{result.data?.[key]?.Value ? "Enabled" : "Disabled"}</>
}

function EditVpcSettings({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const vpcId = item.VpcId as string
  const dhcp = useList<Item>("DescribeDhcpOptions", "DhcpOptions")
  const hostnames = useAws<{ EnableDnsHostnames?: { Value?: boolean } }>("ec2", "DescribeVpcAttribute", { VpcId: vpcId, Attribute: "enableDnsHostnames" })
  const support = useAws<{ EnableDnsSupport?: { Value?: boolean } }>("ec2", "DescribeVpcAttribute", { VpcId: vpcId, Attribute: "enableDnsSupport" })
  const nau = useAws<{ EnableNetworkAddressUsageMetrics?: { Value?: boolean } }>("ec2", "DescribeVpcAttribute", { VpcId: vpcId, Attribute: "enableNetworkAddressUsageMetrics" })
  const [form, setForm] = useState<{ dns?: boolean; hostnames?: boolean; nau?: boolean; dhcp?: string }>({})
  const value = {
    dns: form.dns ?? support.data?.EnableDnsSupport?.Value ?? true,
    hostnames: form.hostnames ?? hostnames.data?.EnableDnsHostnames?.Value ?? false,
    nau: form.nau ?? nau.data?.EnableNetworkAddressUsageMetrics?.Value ?? false,
    dhcp: form.dhcp ?? (item.DhcpOptionsId as string),
  }
  return (
    <OperationModal
      title="Edit VPC settings"
      size="medium"
      close={close}
      ctx={ctx}
      success={`You successfully modified the settings for ${vpcId}.`}
      run={async () => {
        await callAws("ec2", "ModifyVpcAttribute", { VpcId: vpcId, EnableDnsSupport: { Value: value.dns } })
        await callAws("ec2", "ModifyVpcAttribute", { VpcId: vpcId, EnableDnsHostnames: { Value: value.hostnames } })
        await callAws("ec2", "ModifyVpcAttribute", { VpcId: vpcId, EnableNetworkAddressUsageMetrics: { Value: value.nau } })
        if (value.dhcp !== item.DhcpOptionsId) await callAws("ec2", "AssociateDhcpOptions", { VpcId: vpcId, DhcpOptionsId: value.dhcp })
      }}
    >
      <FormField label="VPC ID"><Box>{vpcId}</Box></FormField>
      <FormField label="DHCP settings" description="DHCP option set">
        <Select
          selectedOption={{ value: value.dhcp, label: value.dhcp }}
          onChange={({ detail }) => setForm({ ...form, dhcp: detail.selectedOption.value })}
          options={[...dhcp.items.map((set) => ({ value: set.DhcpOptionsId as string, label: set.DhcpOptionsId as string })), { value: "default", label: "No DHCP option set" }]}
        />
      </FormField>
      <FormField label="DNS settings">
        <SpaceBetween size="xs">
          <Checkbox checked={value.dns} onChange={({ detail }) => setForm({ ...form, dns: detail.checked })}>Enable DNS resolution</Checkbox>
          <Checkbox checked={value.hostnames} onChange={({ detail }) => setForm({ ...form, hostnames: detail.checked })}>Enable DNS hostnames</Checkbox>
        </SpaceBetween>
      </FormField>
      <FormField label="Network Address Usage metrics settings">
        <Checkbox checked={value.nau} onChange={({ detail }) => setForm({ ...form, nau: detail.checked })}>Enable Network Address Usage metrics</Checkbox>
      </FormField>
    </OperationModal>
  )
}

function EditCidrs({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [cidr, setCidr] = useState("")
  const sets = (item.CidrBlockAssociationSet as Item[] | undefined) ?? []
  return (
    <OperationModal
      title="Edit CIDRs"
      size="large"
      close={close}
      ctx={ctx}
      saveLabel="Add new IPv4 CIDR"
      success={`Successfully associated ${cidr} with ${item.VpcId}.`}
      run={() => callAws("ec2", "AssociateVpcCidrBlock", { VpcId: item.VpcId, CidrBlock: cidr })}
    >
      <ResourceTableLite
        title="IPv4 CIDRs"
        items={sets}
        columns={[
          { id: "cidr", header: "IPv4 CIDR", cell: (set) => s(set.CidrBlock) },
          { id: "status", header: "Status", cell: (set) => <State value={(set.CidrBlockState as Item | undefined)?.State} /> },
        ]}
      />
      <FormField label="New IPv4 CIDR" constraintText="CIDR block size must be between /16 and /28.">
        <Input value={cidr} placeholder="10.1.0.0/16" onChange={({ detail }) => setCidr(detail.value)} />
      </FormField>
    </OperationModal>
  )
}

function CreateFlowLog({ items, close, ctx, resourceType }: { items: Item[]; close: () => void; ctx: Ctx; resourceType: "VPC" | "Subnet" | "NetworkInterface" }) {
  const [form, setForm] = useState({ name: "", filter: "ALL", destinationType: "cloud-watch-logs", destination: "", role: "", interval: "600" })
  const ids = items.map((item) => (item.VpcId ?? item.SubnetId ?? item.NetworkInterfaceId) as string)
  return (
    <OperationModal
      title="Create flow log"
      size="large"
      close={close}
      ctx={ctx}
      saveLabel="Create flow log"
      success="Successfully created flow log."
      run={() =>
        callAws("ec2", "CreateFlowLogs", {
          ResourceIds: ids,
          ResourceType: resourceType,
          TrafficType: form.filter,
          LogDestinationType: form.destinationType,
          MaxAggregationInterval: Number(form.interval),
          ...(form.destinationType === "cloud-watch-logs" ? { LogGroupName: form.destination, DeliverLogsPermissionArn: form.role } : { LogDestination: form.destination }),
          ...(form.name ? { TagSpecifications: [{ ResourceType: "vpc-flow-log", Tags: [{ Key: "Name", Value: form.name }] }] } : {}),
        })
      }
    >
      <Box variant="small">Flow logs can capture IP traffic flow information for the network interfaces associated with your resources.</Box>
      <FormField label={<>Name - <i>optional</i></>}><Input value={form.name} onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
      <FormField label="Filter"><RadioGroup value={form.filter} onChange={({ detail }) => setForm({ ...form, filter: detail.value })} items={[{ value: "ACCEPT", label: "Accept" }, { value: "REJECT", label: "Reject" }, { value: "ALL", label: "All" }]} /></FormField>
      <FormField label="Maximum aggregation interval"><RadioGroup value={form.interval} onChange={({ detail }) => setForm({ ...form, interval: detail.value })} items={[{ value: "600", label: "10 minutes" }, { value: "60", label: "1 minute" }]} /></FormField>
      <FormField label="Destination">
        <RadioGroup
          value={form.destinationType}
          onChange={({ detail }) => setForm({ ...form, destinationType: detail.value })}
          items={[
            { value: "cloud-watch-logs", label: "Send to CloudWatch Logs" },
            { value: "s3", label: "Send to an Amazon S3 bucket" },
            { value: "kinesis-data-firehose", label: "Send to Amazon Data Firehose in the same account" },
          ]}
        />
      </FormField>
      <FormField label={form.destinationType === "cloud-watch-logs" ? "Destination log group" : "Destination ARN"}>
        <Input value={form.destination} placeholder={form.destinationType === "s3" ? "arn:aws:s3:::bucket/prefix" : ""} onChange={({ detail }) => setForm({ ...form, destination: detail.value })} />
      </FormField>
      {form.destinationType === "cloud-watch-logs" && (
        <FormField label="IAM role"><Input value={form.role} placeholder="arn:aws:iam::account-id:role/role-name" onChange={({ detail }) => setForm({ ...form, role: detail.value })} /></FormField>
      )}
    </OperationModal>
  )
}

export function FlowLogsTab({ resourceId }: { resourceId: string }) {
  const logs = useList<Item>("DescribeFlowLogs", "FlowLogs", { Filter: [{ Name: "resource-id", Values: [resourceId] }] })
  return (
    <ResourceTableLite
      title="Flow logs"
      items={logs.items}
      empty="No flow logs found"
      columns={[
        { id: "name", header: "Name", cell: (log) => nameTag(log) ?? "–" },
        { id: "id", header: "Flow log ID", cell: (log) => s(log.FlowLogId) },
        { id: "filter", header: "Traffic type", cell: (log) => s(log.TrafficType) },
        { id: "type", header: "Destination type", cell: (log) => s(log.LogDestinationType) },
        { id: "dest", header: "Destination name", cell: (log) => s(log.LogGroupName ?? log.LogDestination) },
        { id: "role", header: "IAM role ARN", cell: (log) => dash(log.DeliverLogsPermissionArn) },
        { id: "interval", header: "Maximum aggregation interval", cell: (log) => dash(log.MaxAggregationInterval) },
        { id: "created", header: "Creation time", cell: (log) => consoleDate(log.CreationTime as string) },
        { id: "status", header: "Status", cell: (log) => <State value={log.FlowLogStatus} /> },
      ]}
    />
  )
}

function ResourceMap({ vpcId }: { vpcId: string }) {
  const subnets = useList<Item>("DescribeSubnets", "Subnets", { Filters: [{ Name: "vpc-id", Values: [vpcId] }] })
  const tables = useList<Item>("DescribeRouteTables", "RouteTables", { Filters: [{ Name: "vpc-id", Values: [vpcId] }] })
  const igws = useList<Item>("DescribeInternetGateways", "InternetGateways", { Filters: [{ Name: "attachment.vpc-id", Values: [vpcId] }] })
  const column = (title: string, description: string, entries: { id: string; label: string; section: string }[]) => (
    <div className="myaws-resource-map-column">
      <Box variant="h3">{title} <Box variant="span" color="text-body-secondary">({entries.length})</Box></Box>
      <Box variant="small" color="text-body-secondary">{description}</Box>
      <SpaceBetween size="xs">
        {entries.map((entry) => (
          <div key={entry.id} className="myaws-resource-map-node">
            <ResLink id={entry.id} section={entry.section} />
            {entry.label && <Box variant="small">{entry.label}</Box>}
          </div>
        ))}
      </SpaceBetween>
    </div>
  )
  return (
    <div className="myaws-resource-map">
      {column("VPC", "Your AWS virtual network", [{ id: vpcId, label: "", section: "vpcs" }])}
      {column("Subnets", "Subnets within this VPC", subnets.items.map((subnet) => ({ id: subnet.SubnetId as string, label: `${subnet.AvailabilityZone} · ${nameTag(subnet) ?? subnet.CidrBlock}`, section: "subnets" })))}
      {column("Route tables", "Route network traffic to resources", tables.items.map((table) => ({ id: table.RouteTableId as string, label: nameTag(table) ?? "", section: "route-tables" })))}
      {column("Network Connections", "Connections to other networks", igws.items.map((igw) => ({ id: igw.InternetGatewayId as string, label: nameTag(igw) ?? "", section: "igws" })))}
    </div>
  )
}

export const vpcsDef: ResourceDef = {
  path: "/vpc/vpcs",
  title: "Your VPCs",
  singular: "VPC",
  operation: "DescribeVpcs",
  items: (page) => (page.Vpcs as Item[]) ?? [],
  key: (item) => item.VpcId as string,
  create: { label: "Create VPC", href: "/vpc/vpcs/create" },
  columns: [
    nameCol,
    { id: "id", label: "VPC ID", value: (item) => s(item.VpcId), sort: (item) => s(item.VpcId) },
    { id: "state", label: "State", value: (item) => <State value={item.State} />, sort: (item) => s(item.State) },
    { id: "bpa", label: "Block Public Access", value: () => "Off" },
    { id: "cidr", label: "IPv4 CIDR", value: (item) => s(item.CidrBlock), sort: (item) => s(item.CidrBlock) },
    { id: "ipv6", label: "IPv6 CIDR", value: (item) => dash(((item.Ipv6CidrBlockAssociationSet as Item[] | undefined) ?? [])[0]?.Ipv6CidrBlock) },
    { id: "dhcp", label: "DHCP option set", value: (item) => <ResLink id={s(item.DhcpOptionsId)} section="dhcp-options" />, sort: (item) => s(item.DhcpOptionsId) },
    { id: "rtb", label: "Main route table", value: (item) => <MainRouteTable vpcId={s(item.VpcId)} /> },
    { id: "acl", label: "Main network ACL", value: (item) => <MainNetworkAcl vpcId={s(item.VpcId)} /> },
    { id: "tenancy", label: "Tenancy", value: (item) => s(item.InstanceTenancy), sort: (item) => s(item.InstanceTenancy) },
    { id: "default", label: "Default VPC", value: (item) => (item.IsDefault ? "Yes" : "No"), sort: (item) => (item.IsDefault ? 1 : 0) },
    { id: "owner", label: "Owner ID", value: (item) => s(item.OwnerId), sort: (item) => s(item.OwnerId) },
  ],
  details: [
    { label: "VPC ID", value: (item) => <Copyable value={s(item.VpcId)} /> },
    { label: "State", value: (item) => <State value={item.State} /> },
    { label: "Block Public Access", value: () => "Off" },
    { label: "DNS hostnames", value: (item) => <VpcAttribute vpcId={item.VpcId as string} attribute="enableDnsHostnames" /> },
    { label: "DNS resolution", value: (item) => <VpcAttribute vpcId={item.VpcId as string} attribute="enableDnsSupport" /> },
    { label: "Tenancy", value: (item) => s(item.InstanceTenancy) },
    { label: "DHCP option set", value: (item) => <ResLink id={s(item.DhcpOptionsId)} section="dhcp-options" /> },
    { label: "Main route table", value: (item) => <MainRouteTable vpcId={s(item.VpcId)} /> },
    { label: "Main network ACL", value: (item) => <MainNetworkAcl vpcId={s(item.VpcId)} /> },
    { label: "Default VPC", value: (item) => (item.IsDefault ? "Yes" : "No") },
    { label: "IPv4 CIDR", value: (item) => s(item.CidrBlock) },
    { label: "IPv6 pool", value: () => "–" },
    { label: "IPv6 CIDR", value: (item) => dash(((item.Ipv6CidrBlockAssociationSet as Item[] | undefined) ?? [])[0]?.Ipv6CidrBlock) },
    { label: "Network Address Usage metrics", value: (item) => <VpcAttribute vpcId={item.VpcId as string} attribute="enableNetworkAddressUsageMetrics" /> },
    { label: "Route 53 Resolver DNS Firewall rule groups", value: () => "–" },
    { label: "Owner ID", value: (item) => <Copyable value={s(item.OwnerId)} /> },
  ],
  tabs: [
    { id: "map", label: "Resource map", render: (item) => <ResourceMap vpcId={item.VpcId as string} /> },
    {
      id: "cidrs",
      label: "CIDRs",
      render: (item) => (
        <ResourceTableLite
          title="IPv4 CIDRs"
          items={(item.CidrBlockAssociationSet as Item[]) ?? []}
          columns={[
            { id: "cidr", header: "IPv4 CIDR", cell: (set) => s(set.CidrBlock) },
            { id: "assoc", header: "Association ID", cell: (set) => s(set.AssociationId) },
            { id: "status", header: "Status", cell: (set) => <State value={(set.CidrBlockState as Item | undefined)?.State} /> },
          ]}
        />
      ),
    },
    { id: "flow", label: "Flow logs", render: (item) => <FlowLogsTab resourceId={item.VpcId as string} /> },
  ],
  actions: [
    { id: "default", text: "Create default VPC", operation: "CreateDefaultVpc", enabled: () => true, run: () => callAws("ec2", "CreateDefaultVpc", {}), success: () => "Successfully created a default VPC." },
    { id: "flow", text: "Create flow log", operation: "CreateFlowLogs", enabled: (items) => items.length >= 1, modal: ({ items, close, ctx }) => <CreateFlowLog items={items} close={close} ctx={ctx} resourceType="VPC" /> },
    { id: "settings", text: "Edit VPC settings", operation: "ModifyVpcAttribute", modal: ({ items, close, ctx }) => <EditVpcSettings item={items[0]} close={close} ctx={ctx} /> },
    { id: "cidrs", text: "Edit CIDRs", operation: "AssociateVpcCidrBlock", modal: ({ items, close, ctx }) => <EditCidrs item={items[0]} close={close} ctx={ctx} /> },
    { id: "attach-igw", text: "Internet gateway", group: "Attach", href: () => "/vpc/igws" },
    { id: "attach-tgw", text: "Transit gateway", group: "Attach", href: () => "/vpc/transit-gateway-attachments" },
    { id: "attach-vgw", text: "Virtual private gateway", group: "Attach", href: () => "/vpc/vpn-gateways" },
    { id: "middlebox", text: "Manage middlebox routes", operation: "ManageMiddleboxRoutes" },
  ],
  deleteAction: {
    operation: "DeleteVpc",
    input: (item) => ({ VpcId: item.VpcId }),
    warning: "Before you can delete a VPC, you must delete or detach its subnets, internet gateways, and other dependent resources.",
  },
}

export { CreateFlowLog }

export const vpcDefs: Record<string, ResourceDef> = {
  vpcs: vpcsDef,
  ...moreDefs,
}
