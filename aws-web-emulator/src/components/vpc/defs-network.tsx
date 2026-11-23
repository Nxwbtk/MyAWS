"use client"

import AttributeEditor from "@cloudscape-design/components/attribute-editor"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import { useState } from "react"
import { Copyable, OperationModal, ResourceTableLite, State, dash, nameTag, type Ctx, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { ResLink, VpcSelect, useList } from "@/components/vpc/shared"
import { callAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

const s = (value: unknown) => (value === undefined || value === null ? undefined : String(value))
const arr = (value: unknown) => (value as Item[] | undefined) ?? []
const nameCol = { id: "name", label: "Name", value: (item: Item) => nameTag(item) ?? "–", sort: (item: Item) => nameTag(item) }
const idCol = (label: string, key: string) => ({ id: "id", label, value: (item: Item) => s(item[key]), sort: (item: Item) => s(item[key]) })
const stateCol = (key = "State") => ({ id: "state", label: "State", value: (item: Item) => <State value={item[key]} />, sort: (item: Item) => s(item[key]) })

/* ---------------- Managed prefix lists ---------------- */

type PrefixEntry = { cidr: string; description: string }

function PrefixEntries({ id }: { id: string }) {
  const entries = useList<Item>("GetManagedPrefixListEntries", "Entries", { PrefixListId: id })
  return <ResourceTableLite title="Entries" items={entries.items} empty="No entries" columns={[{ id: "cidr", header: "CIDR", cell: (e) => s(e.Cidr) }, { id: "desc", header: "Description", cell: (e) => dash(e.Description) }]} />
}

function ModifyPrefixList({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const current = useList<Item>("GetManagedPrefixListEntries", "Entries", { PrefixListId: item.PrefixListId })
  const original = current.items.map((e) => ({ cidr: s(e.Cidr) ?? "", description: s(e.Description) ?? "" }))
  const [entries, setEntries] = useState<PrefixEntry[] | null>(null)
  const [name, setName] = useState(s(item.PrefixListName) ?? "")
  const [max, setMax] = useState(s(item.MaxEntries) ?? "10")
  const value = entries ?? original
  return (
    <OperationModal
      title="Modify prefix list"
      size="large"
      close={close}
      ctx={ctx}
      saveLabel="Save prefix list"
      success={`Successfully modified ${item.PrefixListId}.`}
      run={async () => {
        const add = value.filter((e) => e.cidr && !original.some((o) => o.cidr === e.cidr))
        const remove = original.filter((o) => !value.some((e) => e.cidr === o.cidr))
        await callAws("ec2", "ModifyManagedPrefixList", {
          PrefixListId: item.PrefixListId,
          CurrentVersion: item.Version,
          ...(name !== item.PrefixListName ? { PrefixListName: name } : {}),
          ...(add.length ? { AddEntries: add.map((e) => ({ Cidr: e.cidr, ...(e.description ? { Description: e.description } : {}) })) } : {}),
          ...(remove.length ? { RemoveEntries: remove.map((e) => ({ Cidr: e.cidr })) } : {}),
        })
        if (Number(max) !== Number(item.MaxEntries)) await callAws("ec2", "ModifyManagedPrefixList", { PrefixListId: item.PrefixListId, MaxEntries: Number(max) })
      }}
    >
      <FormField label="Prefix list name"><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
      <FormField label="Max entries"><Input type="number" value={max} onChange={({ detail }) => setMax(detail.value)} /></FormField>
      <PrefixEntryEditor entries={value} onChange={setEntries} />
    </OperationModal>
  )
}

export function PrefixEntryEditor({ entries, onChange }: { entries: PrefixEntry[]; onChange: (entries: PrefixEntry[]) => void }) {
  return (
    <AttributeEditor
      items={entries}
      addButtonText="Add new entry"
      removeButtonText="Remove"
      empty="No entries."
      onAddButtonClick={() => onChange([...entries, { cidr: "", description: "" }])}
      onRemoveButtonClick={({ detail }) => onChange(entries.filter((_, index) => index !== detail.itemIndex))}
      definition={[
        { label: "CIDR", control: (entry, index) => <Input value={entry.cidr} placeholder="10.0.0.0/24" onChange={({ detail }) => onChange(entries.map((e, i) => (i === index ? { ...e, cidr: detail.value } : e)))} /> },
        { label: <>Description - <i>optional</i></>, control: (entry, index) => <Input value={entry.description} onChange={({ detail }) => onChange(entries.map((e, i) => (i === index ? { ...e, description: detail.value } : e)))} /> },
      ]}
    />
  )
}

const prefixListsDef: ResourceDef = {
  path: "/vpc/prefix-lists",
  title: "Managed prefix lists",
  singular: "prefix list",
  operation: "DescribeManagedPrefixLists",
  items: (page) => arr(page.PrefixLists),
  key: (item) => s(item.PrefixListId) ?? "",
  create: { label: "Create prefix list", href: "/vpc/prefix-lists/create" },
  columns: [
    { id: "name", label: "Prefix list name", value: (item) => s(item.PrefixListName), sort: (item) => s(item.PrefixListName) },
    idCol("Prefix list ID", "PrefixListId"),
    { id: "max", label: "Max entries", value: (item) => dash(item.MaxEntries) },
    { id: "family", label: "Address family", value: (item) => s(item.AddressFamily) },
    stateCol(),
    { id: "version", label: "Version", value: (item) => dash(item.Version) },
    { id: "owner", label: "Owner ID", value: (item) => s(item.OwnerId) },
  ],
  details: [
    { label: "Prefix list ID", value: (item) => <Copyable value={s(item.PrefixListId)} /> },
    { label: "Prefix list name", value: (item) => s(item.PrefixListName) },
    { label: "Address family", value: (item) => s(item.AddressFamily) },
    { label: "State", value: (item) => <State value={item.State} /> },
    { label: "Max entries", value: (item) => dash(item.MaxEntries) },
    { label: "Version", value: (item) => dash(item.Version) },
    { label: "Prefix list ARN", value: (item) => <Copyable value={s(item.PrefixListArn)} /> },
    { label: "Owner ID", value: (item) => s(item.OwnerId) },
  ],
  tabs: [{ id: "entries", label: "Entries", render: (item) => <PrefixEntries id={s(item.PrefixListId)!} /> }],
  actions: [{ id: "modify", text: "Modify prefix list", operation: "ModifyManagedPrefixList", enabled: (items) => items.length === 1 && items[0].OwnerId !== "AWS", modal: ({ items, close, ctx }) => <ModifyPrefixList item={items[0]} close={close} ctx={ctx} /> }],
  deleteAction: { operation: "DeleteManagedPrefixList", input: (item) => ({ PrefixListId: item.PrefixListId }) },
}

/* ---------------- Endpoints ---------------- */

const endpointsDef: ResourceDef = {
  path: "/vpc/endpoints",
  title: "Endpoints",
  singular: "endpoint",
  operation: "DescribeVpcEndpoints",
  items: (page) => arr(page.VpcEndpoints),
  key: (item) => s(item.VpcEndpointId) ?? "",
  create: { label: "Create endpoint", href: "/vpc/endpoints/create" },
  columns: [
    nameCol,
    idCol("VPC endpoint ID", "VpcEndpointId"),
    { id: "type", label: "Endpoint type", value: (item) => s(item.VpcEndpointType), sort: (item) => s(item.VpcEndpointType) },
    { id: "status", label: "Status", value: (item) => <State value={item.State} />, sort: (item) => s(item.State) },
    { id: "service", label: "Service name", value: (item) => s(item.ServiceName), sort: (item) => s(item.ServiceName) },
    { id: "region", label: "Service region", value: (item) => s(item.ServiceName)?.split(".")[2] ?? "–" },
    { id: "vpc", label: "VPC ID", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" /> },
    { id: "created", label: "Creation time", value: (item) => consoleDate(item.CreationTimestamp as string), sort: (item) => s(item.CreationTimestamp) },
  ],
  details: [
    { label: "Endpoint ID", value: (item) => <Copyable value={s(item.VpcEndpointId)} /> },
    { label: "Status", value: (item) => <State value={item.State} /> },
    { label: "Endpoint type", value: (item) => s(item.VpcEndpointType) },
    { label: "Service name", value: (item) => s(item.ServiceName) },
    { label: "VPC ID", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" /> },
    { label: "Private DNS names enabled", value: (item) => (item.PrivateDnsEnabled ? "Yes" : "No") },
    { label: "Creation time", value: (item) => consoleDate(item.CreationTimestamp as string) },
    { label: "Owner", value: (item) => s(item.OwnerId) },
  ],
  tabs: [
    { id: "subnets", label: "Subnets", render: (item) => <ResourceTableLite title="Subnets" items={arr(item.SubnetIds).map((id) => ({ id }) as unknown as Item)} empty="No subnets" columns={[{ id: "id", header: "Subnet ID", cell: (row) => <ResLink id={s(row.id)} section="subnets" /> }]} /> },
    { id: "sgs", label: "Security groups", render: (item) => <ResourceTableLite title="Security groups" items={arr(item.Groups)} empty="No security groups" columns={[{ id: "id", header: "Group ID", cell: (g) => <ResLink id={s(g.GroupId)} section="security-groups" /> }, { id: "name", header: "Group name", cell: (g) => s(g.GroupName) }]} /> },
    { id: "rtbs", label: "Route tables", render: (item) => <ResourceTableLite title="Route tables" items={arr(item.RouteTableIds).map((id) => ({ id }) as unknown as Item)} empty="No route tables" columns={[{ id: "id", header: "Route table ID", cell: (row) => <ResLink id={s(row.id)} section="route-tables" /> }]} /> },
    { id: "policy", label: "Policy", render: (item) => <pre className="myaws-code-view">{item.PolicyDocument ? JSON.stringify(JSON.parse(String(item.PolicyDocument)), null, 2) : "Full access"}</pre> },
  ],
  actions: [
    { id: "policy", text: "Manage policy", operation: "ModifyVpcEndpoint", modal: ({ items, close, ctx }) => <EndpointPolicy item={items[0]} close={close} ctx={ctx} /> },
    { id: "dns", text: "Modify private DNS name", operation: "ModifyVpcEndpoint", enabled: (items) => items.length === 1 && items[0].VpcEndpointType === "Interface", run: (items) => callAws("ec2", "ModifyVpcEndpoint", { VpcEndpointId: items[0].VpcEndpointId, PrivateDnsEnabled: !items[0].PrivateDnsEnabled }), success: () => "Private DNS name setting updated." },
  ],
  deleteAction: { operation: "DeleteVpcEndpoints", input: (item) => ({ VpcEndpointIds: [item.VpcEndpointId] }) },
}

function EndpointPolicy({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [policy, setPolicy] = useState(item.PolicyDocument ? JSON.stringify(JSON.parse(String(item.PolicyDocument)), null, 2) : JSON.stringify({ Statement: [{ Effect: "Allow", Principal: "*", Action: "*", Resource: "*" }] }, null, 2))
  return (
    <OperationModal title="Manage policy" size="large" close={close} ctx={ctx} success="Successfully updated the endpoint policy." run={() => callAws("ec2", "ModifyVpcEndpoint", { VpcEndpointId: item.VpcEndpointId, PolicyDocument: JSON.stringify(JSON.parse(policy)) })}>
      <FormField label="Policy" stretch><textarea className="myaws-code-view" style={{ width: "100%", minHeight: 260 }} value={policy} onChange={(event) => setPolicy(event.target.value)} /></FormField>
    </OperationModal>
  )
}

const endpointServicesDef: ResourceDef = {
  path: "/vpc/endpoint-services",
  title: "Endpoint services",
  singular: "endpoint service",
  operation: "DescribeVpcEndpointServiceConfigurations",
  items: (page) => arr(page.ServiceConfigurations),
  key: (item) => s(item.ServiceId) ?? "",
  create: { label: "Create endpoint service", href: "/vpc/endpoint-services/create" },
  columns: [
    nameCol,
    idCol("Service ID", "ServiceId"),
    { id: "service", label: "Service name", value: (item) => s(item.ServiceName) },
    { id: "type", label: "Types", value: (item) => arr(item.ServiceType).map((t) => s(t.ServiceType)).join(", ") },
    { id: "state", label: "State", value: (item) => <State value={item.ServiceState} /> },
    { id: "azs", label: "Availability Zones", value: (item) => arr(item.AvailabilityZones).join(", ") || "–" },
  ],
  details: [
    { label: "Service ID", value: (item) => <Copyable value={s(item.ServiceId)} /> },
    { label: "Service name", value: (item) => s(item.ServiceName) },
    { label: "State", value: (item) => <State value={item.ServiceState} /> },
    { label: "Acceptance required", value: (item) => (item.AcceptanceRequired ? "Yes" : "No") },
    { label: "Load balancers", value: (item) => [...arr(item.NetworkLoadBalancerArns), ...arr(item.GatewayLoadBalancerArns)].join(", ") || "–" },
  ],
  deleteAction: { operation: "DeleteVpcEndpointServiceConfigurations", input: (item) => ({ ServiceIds: [item.ServiceId] }) },
}

/* ---------------- NAT gateways ---------------- */

const natDef: ResourceDef = {
  path: "/vpc/nat-gateways",
  title: "NAT gateways",
  singular: "NAT gateway",
  operation: "DescribeNatGateways",
  items: (page) => arr(page.NatGateways),
  key: (item) => s(item.NatGatewayId) ?? "",
  create: { label: "Create NAT gateway", href: "/vpc/nat-gateways/create" },
  columns: [
    nameCol,
    idCol("NAT gateway ID", "NatGatewayId"),
    { id: "type", label: "Connectivity type", value: (item) => s(item.ConnectivityType) },
    stateCol(),
    { id: "message", label: "State message", value: (item) => dash(item.FailureMessage) },
    { id: "mode", label: "Availability mode", value: (item) => (item.AvailabilityMode === "regional" ? "Regional" : "Zonal") },
    { id: "eip", label: "Primary public IPv4 address", value: (item) => dash(arr(item.NatGatewayAddresses)[0]?.PublicIp) },
    { id: "private", label: "Primary private IPv4 address", value: (item) => dash(arr(item.NatGatewayAddresses)[0]?.PrivateIp) },
    { id: "eni", label: "Primary network interface ID", value: (item) => dash(arr(item.NatGatewayAddresses)[0]?.NetworkInterfaceId) },
    { id: "vpc", label: "VPC", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" /> },
    { id: "subnet", label: "Subnet", value: (item) => <ResLink id={s(item.SubnetId)} section="subnets" /> },
    { id: "created", label: "Created", value: (item) => consoleDate(item.CreateTime as string), sort: (item) => s(item.CreateTime) },
  ],
  details: [
    { label: "NAT gateway ID", value: (item) => <Copyable value={s(item.NatGatewayId)} /> },
    { label: "Connectivity type", value: (item) => s(item.ConnectivityType) },
    { label: "State", value: (item) => <State value={item.State} /> },
    { label: "Primary public IPv4 address", value: (item) => dash(arr(item.NatGatewayAddresses)[0]?.PublicIp) },
    { label: "Primary private IPv4 address", value: (item) => dash(arr(item.NatGatewayAddresses)[0]?.PrivateIp) },
    { label: "Primary network interface ID", value: (item) => dash(arr(item.NatGatewayAddresses)[0]?.NetworkInterfaceId) },
    { label: "VPC", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" /> },
    { label: "Subnet", value: (item) => <ResLink id={s(item.SubnetId)} section="subnets" /> },
    { label: "Created", value: (item) => consoleDate(item.CreateTime as string) },
    { label: "Deleted", value: (item) => (item.DeleteTime ? consoleDate(item.DeleteTime as string) : "–") },
  ],
  tabs: [
    {
      id: "addresses",
      label: "Secondary IPv4 addresses",
      render: (item) => (
        <ResourceTableLite title="IPv4 addresses" items={arr(item.NatGatewayAddresses)} empty="No addresses" columns={[{ id: "public", header: "Public IPv4", cell: (a) => dash(a.PublicIp) }, { id: "private", header: "Private IPv4", cell: (a) => dash(a.PrivateIp) }, { id: "alloc", header: "Allocation ID", cell: (a) => dash(a.AllocationId) }, { id: "primary", header: "Primary", cell: (a) => (a.IsPrimary ? "Yes" : "No") }]} />
      ),
    },
  ],
  deleteAction: { operation: "DeleteNatGateway", input: (item) => ({ NatGatewayId: item.NatGatewayId }), warning: "Deleting a NAT gateway disassociates its Elastic IP address but doesn't release it." },
}

/* ---------------- Peering connections ---------------- */

const peeringDef: ResourceDef = {
  path: "/vpc/peering",
  title: "Peering connections",
  singular: "peering connection",
  operation: "DescribeVpcPeeringConnections",
  items: (page) => arr(page.VpcPeeringConnections),
  key: (item) => s(item.VpcPeeringConnectionId) ?? "",
  create: { label: "Create peering connection", href: "/vpc/peering/create" },
  columns: [
    nameCol,
    idCol("Peering connection ID", "VpcPeeringConnectionId"),
    { id: "status", label: "Status", value: (item) => <State value={(item.Status as Item | undefined)?.Code} /> },
    { id: "requester", label: "Requester VPC", value: (item) => <ResLink id={s((item.RequesterVpcInfo as Item | undefined)?.VpcId)} section="vpcs" /> },
    { id: "accepter", label: "Accepter VPC", value: (item) => <ResLink id={s((item.AccepterVpcInfo as Item | undefined)?.VpcId)} section="vpcs" /> },
    { id: "rcidr", label: "Requester CIDRs", value: (item) => dash((item.RequesterVpcInfo as Item | undefined)?.CidrBlock) },
    { id: "acidr", label: "Accepter CIDRs", value: (item) => dash((item.AccepterVpcInfo as Item | undefined)?.CidrBlock) },
    { id: "rowner", label: "Requester owner ID", value: (item) => dash((item.RequesterVpcInfo as Item | undefined)?.OwnerId) },
    { id: "aowner", label: "Accepter owner ID", value: (item) => dash((item.AccepterVpcInfo as Item | undefined)?.OwnerId) },
  ],
  details: [
    { label: "Peering connection ID", value: (item) => <Copyable value={s(item.VpcPeeringConnectionId)} /> },
    { label: "Status", value: (item) => <State value={(item.Status as Item | undefined)?.Code} /> },
    { label: "Requester VPC", value: (item) => <ResLink id={s((item.RequesterVpcInfo as Item | undefined)?.VpcId)} section="vpcs" /> },
    { label: "Accepter VPC", value: (item) => <ResLink id={s((item.AccepterVpcInfo as Item | undefined)?.VpcId)} section="vpcs" /> },
    { label: "Requester CIDRs", value: (item) => dash((item.RequesterVpcInfo as Item | undefined)?.CidrBlock) },
    { label: "Accepter CIDRs", value: (item) => dash((item.AccepterVpcInfo as Item | undefined)?.CidrBlock) },
    { label: "Requester Region", value: (item) => dash((item.RequesterVpcInfo as Item | undefined)?.Region) },
    { label: "Accepter Region", value: (item) => dash((item.AccepterVpcInfo as Item | undefined)?.Region) },
    { label: "Expiration time", value: (item) => (item.ExpirationTime ? consoleDate(item.ExpirationTime as string) : "–") },
  ],
  actions: [
    { id: "accept", text: "Accept request", operation: "AcceptVpcPeeringConnection", enabled: (items) => items.length === 1 && (items[0].Status as Item | undefined)?.Code === "pending-acceptance", run: (items) => callAws("ec2", "AcceptVpcPeeringConnection", { VpcPeeringConnectionId: items[0].VpcPeeringConnectionId }), success: (items) => `Accepted ${items[0].VpcPeeringConnectionId}.` },
    { id: "reject", text: "Reject request", operation: "RejectVpcPeeringConnection", enabled: (items) => items.length === 1 && (items[0].Status as Item | undefined)?.Code === "pending-acceptance", run: (items) => callAws("ec2", "RejectVpcPeeringConnection", { VpcPeeringConnectionId: items[0].VpcPeeringConnectionId }), success: (items) => `Rejected ${items[0].VpcPeeringConnectionId}.` },
    { id: "dns", text: "Edit DNS settings", operation: "ModifyVpcPeeringConnectionOptions" },
  ],
  deleteAction: { operation: "DeleteVpcPeeringConnection", input: (item) => ({ VpcPeeringConnectionId: item.VpcPeeringConnectionId }) },
}

/* ---------------- VPN, transit gateways, traffic mirroring ---------------- */

function AttachVgw({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [vpc, setVpc] = useState("")
  return (
    <OperationModal title="Attach to VPC" close={close} ctx={ctx} saveLabel="Attach to VPC" success="Virtual private gateway attached." run={() => callAws("ec2", "AttachVpnGateway", { VpnGatewayId: item.VpnGatewayId, VpcId: vpc })}>
      <FormField label="Available VPCs"><VpcSelect value={vpc} onChange={setVpc} /></FormField>
    </OperationModal>
  )
}

const simple = (def: Omit<ResourceDef, "details"> & { details?: ResourceDef["details"] }): ResourceDef => ({
  ...def,
  details: def.details ?? def.columns.map((column) => ({ label: column.label, value: column.value })),
})

const customerGatewaysDef = simple({
  path: "/vpc/customer-gateways",
  title: "Customer gateways",
  singular: "customer gateway",
  operation: "DescribeCustomerGateways",
  items: (page) => arr(page.CustomerGateways),
  key: (item) => s(item.CustomerGatewayId) ?? "",
  create: { label: "Create customer gateway", href: "/vpc/customer-gateways/create" },
  columns: [nameCol, idCol("Customer gateway ID", "CustomerGatewayId"), stateCol(), { id: "type", label: "Type", value: (item) => s(item.Type) }, { id: "ip", label: "IP address", value: (item) => s(item.IpAddress) }, { id: "asn", label: "BGP ASN", value: (item) => s(item.BgpAsn) }, { id: "device", label: "Device name", value: (item) => dash(item.DeviceName) }],
  deleteAction: { operation: "DeleteCustomerGateway", input: (item) => ({ CustomerGatewayId: item.CustomerGatewayId }) },
})

const vgwDef = simple({
  path: "/vpc/vpn-gateways",
  title: "Virtual private gateways",
  singular: "virtual private gateway",
  operation: "DescribeVpnGateways",
  items: (page) => arr(page.VpnGateways),
  key: (item) => s(item.VpnGatewayId) ?? "",
  create: { label: "Create virtual private gateway", href: "/vpc/vpn-gateways/create" },
  columns: [nameCol, idCol("Virtual private gateway ID", "VpnGatewayId"), stateCol(), { id: "type", label: "Type", value: (item) => s(item.Type) }, { id: "vpc", label: "VPC", value: (item) => <ResLink id={s(arr(item.VpcAttachments).find((a) => a.State === "attached")?.VpcId)} section="vpcs" /> }, { id: "asn", label: "Amazon side ASN", value: (item) => s(item.AmazonSideAsn) }],
  actions: [
    { id: "attach", text: "Attach to VPC", operation: "AttachVpnGateway", modal: ({ items, close, ctx }) => <AttachVgw item={items[0]} close={close} ctx={ctx} /> },
    { id: "detach", text: "Detach from VPC", operation: "DetachVpnGateway", enabled: (items) => items.length === 1 && arr(items[0].VpcAttachments).some((a) => a.State === "attached"), run: (items) => callAws("ec2", "DetachVpnGateway", { VpnGatewayId: items[0].VpnGatewayId, VpcId: arr(items[0].VpcAttachments).find((a) => a.State === "attached")?.VpcId }), success: () => "Virtual private gateway detached." },
  ],
  deleteAction: { operation: "DeleteVpnGateway", input: (item) => ({ VpnGatewayId: item.VpnGatewayId }) },
})

const vpnConnectionsDef = simple({
  path: "/vpc/vpn-connections",
  title: "VPN connections",
  singular: "VPN connection",
  operation: "DescribeVpnConnections",
  items: (page) => arr(page.VpnConnections),
  key: (item) => s(item.VpnConnectionId) ?? "",
  create: { label: "Create VPN connection", href: "/vpc/vpn-connections/create" },
  columns: [nameCol, idCol("VPN ID", "VpnConnectionId"), stateCol(), { id: "vgw", label: "Virtual private gateway", value: (item) => dash(item.VpnGatewayId) }, { id: "tgw", label: "Transit gateway", value: (item) => dash(item.TransitGatewayId) }, { id: "cgw", label: "Customer gateway", value: (item) => dash(item.CustomerGatewayId) }, { id: "routing", label: "Routing", value: (item) => ((item.Options as Item | undefined)?.StaticRoutesOnly ? "Static" : "Dynamic") }, { id: "type", label: "Type", value: (item) => s(item.Type) }],
  deleteAction: { operation: "DeleteVpnConnection", input: (item) => ({ VpnConnectionId: item.VpnConnectionId }) },
})

const clientVpnDef = simple({
  path: "/vpc/client-vpn",
  title: "Client VPN endpoints",
  singular: "Client VPN endpoint",
  operation: "DescribeClientVpnEndpoints",
  items: (page) => arr(page.ClientVpnEndpoints),
  key: (item) => s(item.ClientVpnEndpointId) ?? "",
  columns: [nameCol, idCol("Client VPN endpoint ID", "ClientVpnEndpointId"), { id: "state", label: "State", value: (item) => <State value={(item.Status as Item | undefined)?.Code} /> }, { id: "cidr", label: "Client CIDR", value: (item) => s(item.ClientCidrBlock) }, { id: "transport", label: "Transport protocol", value: (item) => s(item.TransportProtocol) }, { id: "vpc", label: "VPC ID", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" /> }],
  deleteAction: { operation: "DeleteClientVpnEndpoint", input: (item) => ({ ClientVpnEndpointId: item.ClientVpnEndpointId }) },
})

const tgwDef = simple({
  path: "/vpc/transit-gateways",
  title: "Transit gateways",
  singular: "transit gateway",
  operation: "DescribeTransitGateways",
  items: (page) => arr(page.TransitGateways),
  key: (item) => s(item.TransitGatewayId) ?? "",
  create: { label: "Create transit gateway", href: "/vpc/transit-gateways/create" },
  columns: [nameCol, idCol("Transit gateway ID", "TransitGatewayId"), stateCol(), { id: "owner", label: "Owner ID", value: (item) => s(item.OwnerId) }, { id: "asn", label: "Amazon ASN", value: (item) => s((item.Options as Item | undefined)?.AmazonSideAsn) }, { id: "desc", label: "Description", value: (item) => dash(item.Description) }],
  deleteAction: { operation: "DeleteTransitGateway", input: (item) => ({ TransitGatewayId: item.TransitGatewayId }) },
})

const tgwAttachmentsDef = simple({
  path: "/vpc/transit-gateway-attachments",
  title: "Transit gateway attachments",
  singular: "transit gateway attachment",
  operation: "DescribeTransitGatewayAttachments",
  items: (page) => arr(page.TransitGatewayAttachments),
  key: (item) => s(item.TransitGatewayAttachmentId) ?? "",
  create: { label: "Create transit gateway attachment", href: "/vpc/transit-gateway-attachments/create" },
  columns: [nameCol, idCol("Transit gateway attachment ID", "TransitGatewayAttachmentId"), { id: "tgw", label: "Transit gateway ID", value: (item) => s(item.TransitGatewayId) }, { id: "type", label: "Resource type", value: (item) => s(item.ResourceType) }, { id: "res", label: "Resource ID", value: (item) => s(item.ResourceId) }, stateCol()],
  deleteAction: { operation: "DeleteTransitGatewayVpcAttachment", input: (item) => ({ TransitGatewayAttachmentId: item.TransitGatewayAttachmentId }) },
})

const tgwRouteTablesDef = simple({
  path: "/vpc/transit-gateway-route-tables",
  title: "Transit gateway route tables",
  singular: "transit gateway route table",
  operation: "DescribeTransitGatewayRouteTables",
  items: (page) => arr(page.TransitGatewayRouteTables),
  key: (item) => s(item.TransitGatewayRouteTableId) ?? "",
  columns: [nameCol, idCol("Transit gateway route table ID", "TransitGatewayRouteTableId"), { id: "tgw", label: "Transit gateway ID", value: (item) => s(item.TransitGatewayId) }, stateCol(), { id: "default", label: "Default association route table", value: (item) => (item.DefaultAssociationRouteTable ? "Yes" : "No") }],
  actions: [{ id: "create", text: "Create transit gateway route table", operation: "CreateTransitGatewayRouteTable", enabled: () => true, modal: ({ close, ctx }) => <CreateTgwRouteTable close={close} ctx={ctx} /> }],
  deleteAction: { operation: "DeleteTransitGatewayRouteTable", input: (item) => ({ TransitGatewayRouteTableId: item.TransitGatewayRouteTableId }) },
})

function CreateTgwRouteTable({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const [tgw, setTgw] = useState("")
  return (
    <OperationModal title="Create transit gateway route table" close={close} ctx={ctx} saveLabel="Create" success="Transit gateway route table created." run={() => callAws("ec2", "CreateTransitGatewayRouteTable", { TransitGatewayId: tgw })}>
      <FormField label="Transit gateway ID"><Input value={tgw} placeholder="tgw-..." onChange={({ detail }) => setTgw(detail.value)} /></FormField>
    </OperationModal>
  )
}

const mirrorTargetsDef = simple({
  path: "/vpc/mirror-targets",
  title: "Mirror targets",
  singular: "mirror target",
  operation: "DescribeTrafficMirrorTargets",
  items: (page) => arr(page.TrafficMirrorTargets),
  key: (item) => s(item.TrafficMirrorTargetId) ?? "",
  columns: [nameCol, idCol("Target ID", "TrafficMirrorTargetId"), { id: "type", label: "Type", value: (item) => s(item.Type) }, { id: "dest", label: "Destination", value: (item) => s(item.NetworkInterfaceId ?? item.NetworkLoadBalancerArn ?? item.GatewayLoadBalancerEndpointId) }, { id: "desc", label: "Description", value: (item) => dash(item.Description) }],
  deleteAction: { operation: "DeleteTrafficMirrorTarget", input: (item) => ({ TrafficMirrorTargetId: item.TrafficMirrorTargetId }) },
})

const mirrorFiltersDef = simple({
  path: "/vpc/mirror-filters",
  title: "Mirror filters",
  singular: "mirror filter",
  operation: "DescribeTrafficMirrorFilters",
  items: (page) => arr(page.TrafficMirrorFilters),
  key: (item) => s(item.TrafficMirrorFilterId) ?? "",
  columns: [nameCol, idCol("Filter ID", "TrafficMirrorFilterId"), { id: "desc", label: "Description", value: (item) => dash(item.Description) }, { id: "in", label: "Inbound rules", value: (item) => String(arr(item.IngressFilterRules).length) }, { id: "out", label: "Outbound rules", value: (item) => String(arr(item.EgressFilterRules).length) }],
  actions: [{ id: "create", text: "Create traffic mirror filter", operation: "CreateTrafficMirrorFilter", enabled: () => true, run: () => callAws("ec2", "CreateTrafficMirrorFilter", {}), success: () => "Traffic mirror filter created." }],
  deleteAction: { operation: "DeleteTrafficMirrorFilter", input: (item) => ({ TrafficMirrorFilterId: item.TrafficMirrorFilterId }) },
})

const mirrorSessionsDef = simple({
  path: "/vpc/mirror-sessions",
  title: "Mirror sessions",
  singular: "mirror session",
  operation: "DescribeTrafficMirrorSessions",
  items: (page) => arr(page.TrafficMirrorSessions),
  key: (item) => s(item.TrafficMirrorSessionId) ?? "",
  readOnlyReason: "CreateTrafficMirrorSession is not implemented by the local emulator.",
  columns: [nameCol, idCol("Session ID", "TrafficMirrorSessionId"), { id: "source", label: "Mirror source", value: (item) => s(item.NetworkInterfaceId) }, { id: "target", label: "Mirror target", value: (item) => s(item.TrafficMirrorTargetId) }, { id: "filter", label: "Filter", value: (item) => s(item.TrafficMirrorFilterId) }, { id: "session", label: "Session number", value: (item) => s(item.SessionNumber) }],
  deleteAction: { operation: "DeleteTrafficMirrorSession", input: (item) => ({ TrafficMirrorSessionId: item.TrafficMirrorSessionId }) },
})

export const networkDefs: Record<string, ResourceDef> = {
  "prefix-lists": prefixListsDef,
  endpoints: endpointsDef,
  "endpoint-services": endpointServicesDef,
  "nat-gateways": natDef,
  peering: peeringDef,
  "customer-gateways": customerGatewaysDef,
  "vpn-gateways": vgwDef,
  "vpn-connections": vpnConnectionsDef,
  "client-vpn": clientVpnDef,
  "transit-gateways": tgwDef,
  "transit-gateway-attachments": tgwAttachmentsDef,
  "transit-gateway-route-tables": tgwRouteTablesDef,
  "mirror-targets": mirrorTargetsDef,
  "mirror-filters": mirrorFiltersDef,
  "mirror-sessions": mirrorSessionsDef,
}
