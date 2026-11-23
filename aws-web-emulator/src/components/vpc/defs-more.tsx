"use client"

import Box from "@cloudscape-design/components/box"
import Checkbox from "@cloudscape-design/components/checkbox"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import Multiselect from "@cloudscape-design/components/multiselect"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import AttributeEditor from "@cloudscape-design/components/attribute-editor"
import { useState } from "react"
import { Copyable, OperationModal, ResourceTableLite, State, dash, nameTag, type Ctx, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { ResLink, VpcSelect, useList } from "@/components/vpc/shared"
import { callAws } from "@/lib/aws"
import { securityDefs } from "@/components/vpc/defs-security"
import { networkDefs } from "@/components/vpc/defs-network"
import { CreateFlowLog, FlowLogsTab } from "@/components/vpc/flow-logs"

const s = (value: unknown) => (value === undefined || value === null ? undefined : String(value))
const nameCol = { id: "name", label: "Name", value: (item: Item) => nameTag(item) ?? "–", sort: (item: Item) => nameTag(item) }
const arr = (value: unknown) => (value as Item[] | undefined) ?? []

/* ---------------- Subnets ---------------- */

function SubnetRouteTable({ subnetId, vpcId, routes }: { subnetId: string; vpcId: string; routes?: boolean }) {
  const tables = useList<Item>("DescribeRouteTables", "RouteTables")
  const table =
    tables.items.find((t) => arr(t.Associations).some((a) => a.SubnetId === subnetId)) ??
    tables.items.find((t) => t.VpcId === vpcId && arr(t.Associations).some((a) => a.Main))
  if (!routes) return <ResLink id={s(table?.RouteTableId)} section="route-tables" />
  return <RoutesTable table={table} />
}

function SubnetNetworkAcl({ subnetId, entries }: { subnetId: string; entries?: boolean }) {
  const acls = useList<Item>("DescribeNetworkAcls", "NetworkAcls")
  const acl = acls.items.find((a) => arr(a.Associations).some((assoc) => assoc.SubnetId === subnetId))
  if (!entries) return <ResLink id={s(acl?.NetworkAclId)} section="acls" />
  return <AclEntries acl={acl} />
}

export function RoutesTable({ table }: { table?: Item }) {
  return (
    <ResourceTableLite
      title="Routes"
      items={arr(table?.Routes)}
      columns={[
        { id: "dest", header: "Destination", cell: (route) => s(route.DestinationCidrBlock ?? route.DestinationIpv6CidrBlock ?? route.DestinationPrefixListId) },
        { id: "target", header: "Target", cell: (route) => s(route.GatewayId ?? route.NatGatewayId ?? route.NetworkInterfaceId ?? route.VpcPeeringConnectionId ?? route.TransitGatewayId ?? route.InstanceId ?? route.EgressOnlyInternetGatewayId ?? "–") },
        { id: "status", header: "Status", cell: (route) => <State value={route.State} /> },
        { id: "propagated", header: "Propagated", cell: (route) => (route.Origin === "EnableVgwRoutePropagation" ? "Yes" : "No") },
        { id: "origin", header: "Route Origin", cell: (route) => (route.Origin === "CreateRouteTable" ? "Create Route Table" : route.Origin === "CreateRoute" ? "Create Route" : s(route.Origin)) },
      ]}
    />
  )
}

export function AclEntries({ acl, egress }: { acl?: Item; egress?: boolean }) {
  const entries = arr(acl?.Entries).filter((entry) => Boolean(entry.Egress) === Boolean(egress)).sort((a, b) => Number(a.RuleNumber) - Number(b.RuleNumber))
  return (
    <ResourceTableLite
      title={egress ? "Outbound rules" : "Inbound rules"}
      items={entries}
      columns={[
        { id: "rule", header: "Rule number", cell: (entry) => (Number(entry.RuleNumber) === 32767 ? "*" : s(entry.RuleNumber)) },
        { id: "type", header: "Type", cell: (entry) => (entry.Protocol === "-1" ? "All traffic" : protocolName(s(entry.Protocol))) },
        { id: "protocol", header: "Protocol", cell: (entry) => (entry.Protocol === "-1" ? "All" : protocolName(s(entry.Protocol))) },
        { id: "port", header: "Port range", cell: (entry) => portRange(entry.PortRange as Item | undefined) },
        { id: egress ? "dest" : "source", header: egress ? "Destination" : "Source", cell: (entry) => s(entry.CidrBlock ?? entry.Ipv6CidrBlock) },
        { id: "action", header: "Allow/Deny", cell: (entry) => <State value={entry.RuleAction === "allow" ? "Allow" : "Deny"} /> },
      ]}
    />
  )
}

export function protocolName(value?: string) {
  return ({ "6": "TCP", "17": "UDP", "1": "ICMP", "-1": "All", tcp: "TCP", udp: "UDP", icmp: "ICMP" } as Record<string, string>)[value ?? ""] ?? value ?? "–"
}

export function portRange(range?: Item) {
  if (!range) return "All"
  return range.From === range.To ? s(range.From) : `${range.From} - ${range.To}`
}

function EditSubnetSettings({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [publicIp, setPublicIp] = useState(Boolean(item.MapPublicIpOnLaunch))
  const [ipv6, setIpv6] = useState(Boolean(item.AssignIpv6AddressOnCreation))
  const [hostname, setHostname] = useState(s((item.PrivateDnsNameOptionsOnLaunch as Item | undefined)?.HostnameType) ?? "ip-name")
  const [dnsA, setDnsA] = useState(Boolean((item.PrivateDnsNameOptionsOnLaunch as Item | undefined)?.EnableResourceNameDnsARecord))
  return (
    <OperationModal
      title="Edit subnet settings"
      size="medium"
      close={close}
      ctx={ctx}
      success={`You have successfully changed subnet settings for ${item.SubnetId}.`}
      run={async () => {
        await callAws("ec2", "ModifySubnetAttribute", { SubnetId: item.SubnetId, MapPublicIpOnLaunch: { Value: publicIp } })
        await callAws("ec2", "ModifySubnetAttribute", { SubnetId: item.SubnetId, AssignIpv6AddressOnCreation: { Value: ipv6 } })
        await callAws("ec2", "ModifySubnetAttribute", { SubnetId: item.SubnetId, PrivateDnsHostnameTypeOnLaunch: hostname })
        await callAws("ec2", "ModifySubnetAttribute", { SubnetId: item.SubnetId, EnableResourceNameDnsARecordOnLaunch: { Value: dnsA } })
      }}
    >
      <FormField label="Subnet"><Box>{s(item.SubnetId)}</Box></FormField>
      <FormField label="Auto-assign IP settings" description="Enable the auto-assign IP address setting to automatically request a public IPv4 or IPv6 address for a new network interface in this subnet.">
        <SpaceBetween size="xs">
          <Checkbox checked={publicIp} onChange={({ detail }) => setPublicIp(detail.checked)}>Enable auto-assign public IPv4 address</Checkbox>
          <Checkbox checked={ipv6} disabled={!arr(item.Ipv6CidrBlockAssociationSet).length} onChange={({ detail }) => setIpv6(detail.checked)}>Enable auto-assign IPv6 address</Checkbox>
        </SpaceBetween>
      </FormField>
      <FormField label="Hostname type">
        <RadioGroup value={hostname} onChange={({ detail }) => setHostname(detail.value)} items={[{ value: "ip-name", label: "IP name" }, { value: "resource-name", label: "Resource name" }]} />
      </FormField>
      <FormField label="Resource-based name (RBN) settings">
        <Checkbox checked={dnsA} onChange={({ detail }) => setDnsA(detail.checked)}>Enable resource name DNS A record on launch</Checkbox>
      </FormField>
    </OperationModal>
  )
}

function EditSubnetRouteTable({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const tables = useList<Item>("DescribeRouteTables", "RouteTables", { Filters: [{ Name: "vpc-id", Values: [item.VpcId] }] })
  const current = tables.items.find((t) => arr(t.Associations).some((a) => a.SubnetId === item.SubnetId))
  const association = arr(current?.Associations).find((a) => a.SubnetId === item.SubnetId)
  const [value, setValue] = useState<string>()
  const chosen = value ?? s(current?.RouteTableId)
  return (
    <OperationModal
      title="Edit route table association"
      close={close}
      ctx={ctx}
      success={`You have successfully changed the route table association for ${item.SubnetId}.`}
      run={async () => {
        if (association) await callAws("ec2", "ReplaceRouteTableAssociation", { AssociationId: association.RouteTableAssociationId, RouteTableId: chosen })
        else await callAws("ec2", "AssociateRouteTable", { SubnetId: item.SubnetId, RouteTableId: chosen })
      }}
    >
      <FormField label="Route table ID">
        <Select
          selectedOption={chosen ? { value: chosen, label: chosen } : null}
          placeholder="Select a route table"
          onChange={({ detail }) => setValue(detail.selectedOption.value)}
          options={tables.items.map((t) => ({ value: s(t.RouteTableId), label: `${t.RouteTableId}${nameTag(t) ? ` / ${nameTag(t)}` : ""}` }))}
        />
      </FormField>
      <RoutesTable table={tables.items.find((t) => t.RouteTableId === chosen)} />
    </OperationModal>
  )
}

function EditSubnetAcl({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const acls = useList<Item>("DescribeNetworkAcls", "NetworkAcls", { Filters: [{ Name: "vpc-id", Values: [item.VpcId] }] })
  const current = acls.items.find((a) => arr(a.Associations).some((assoc) => assoc.SubnetId === item.SubnetId))
  const association = arr(current?.Associations).find((a) => a.SubnetId === item.SubnetId)
  const [value, setValue] = useState<string>()
  const chosen = value ?? s(current?.NetworkAclId)
  return (
    <OperationModal
      title="Edit network ACL association"
      close={close}
      ctx={ctx}
      success={`You have successfully changed the network ACL association for ${item.SubnetId}.`}
      run={() => callAws("ec2", "ReplaceNetworkAclAssociation", { AssociationId: association?.NetworkAclAssociationId, NetworkAclId: chosen })}
    >
      <FormField label="Network ACL ID">
        <Select
          selectedOption={chosen ? { value: chosen, label: chosen } : null}
          onChange={({ detail }) => setValue(detail.selectedOption.value)}
          options={acls.items.map((a) => ({ value: s(a.NetworkAclId), label: `${a.NetworkAclId}${nameTag(a) ? ` / ${nameTag(a)}` : ""}` }))}
        />
      </FormField>
      <AclEntries acl={acls.items.find((a) => a.NetworkAclId === chosen)} />
    </OperationModal>
  )
}

function CidrReservations({ subnetId }: { subnetId: string }) {
  const result = useList<Item>("GetSubnetCidrReservations", "SubnetIpv4CidrReservations", { SubnetId: subnetId })
  return (
    <ResourceTableLite
      title="IPv4 CIDR reservations"
      items={result.items}
      empty="No CIDR reservations"
      columns={[
        { id: "cidr", header: "CIDR", cell: (r) => s(r.Cidr) },
        { id: "id", header: "Reservation ID", cell: (r) => s(r.SubnetCidrReservationId) },
        { id: "type", header: "Reservation type", cell: (r) => s(r.ReservationType) },
        { id: "desc", header: "Description", cell: (r) => dash(r.Description) },
      ]}
    />
  )
}


const subnetsDef: ResourceDef = {
  path: "/vpc/subnets",
  title: "Subnets",
  singular: "subnet",
  operation: "DescribeSubnets",
  items: (page) => arr(page.Subnets),
  key: (item) => s(item.SubnetId) ?? "",
  create: { label: "Create subnet", href: "/vpc/subnets/create" },
  columns: [
    nameCol,
    { id: "id", label: "Subnet ID", value: (item) => s(item.SubnetId), sort: (item) => s(item.SubnetId) },
    { id: "state", label: "State", value: (item) => <State value={item.State} />, sort: (item) => s(item.State) },
    { id: "vpc", label: "VPC", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" />, sort: (item) => s(item.VpcId) },
    { id: "bpa", label: "Block Public Access", value: () => "Off" },
    { id: "cidr", label: "IPv4 CIDR", value: (item) => s(item.CidrBlock), sort: (item) => s(item.CidrBlock) },
    { id: "ipv6", label: "IPv6 CIDR", value: (item) => dash(arr(item.Ipv6CidrBlockAssociationSet)[0]?.Ipv6CidrBlock) },
    { id: "available", label: "Available IPv4 addresses", value: (item) => s(item.AvailableIpAddressCount), sort: (item) => Number(item.AvailableIpAddressCount) },
    { id: "az", label: "Availability Zone", value: (item) => s(item.AvailabilityZone), sort: (item) => s(item.AvailabilityZone) },
    { id: "azid", label: "Availability Zone ID", value: (item) => s(item.AvailabilityZoneId), sort: (item) => s(item.AvailabilityZoneId) },
    { id: "rtb", label: "Route table", value: (item) => <SubnetRouteTable subnetId={s(item.SubnetId)!} vpcId={s(item.VpcId)!} /> },
    { id: "acl", label: "Network ACL", value: (item) => <SubnetNetworkAcl subnetId={s(item.SubnetId)!} /> },
    { id: "default", label: "Default subnet", value: (item) => (item.DefaultForAz ? "Yes" : "No") },
    { id: "autoip", label: "Auto-assign public IPv4 address", value: (item) => (item.MapPublicIpOnLaunch ? "Yes" : "No") },
    { id: "owner", label: "Owner ID", value: (item) => s(item.OwnerId) },
  ],
  details: [
    { label: "Subnet ID", value: (item) => <Copyable value={s(item.SubnetId)} /> },
    { label: "Subnet ARN", value: (item) => <Copyable value={s(item.SubnetArn)} /> },
    { label: "State", value: (item) => <State value={item.State} /> },
    { label: "IPv4 CIDR", value: (item) => s(item.CidrBlock) },
    { label: "Available IPv4 addresses", value: (item) => s(item.AvailableIpAddressCount) },
    { label: "IPv6 CIDR", value: (item) => dash(arr(item.Ipv6CidrBlockAssociationSet)[0]?.Ipv6CidrBlock) },
    { label: "Availability Zone", value: (item) => `${item.AvailabilityZoneId ?? ""} (${item.AvailabilityZone})` },
    { label: "VPC", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" /> },
    { label: "Route table", value: (item) => <SubnetRouteTable subnetId={s(item.SubnetId)!} vpcId={s(item.VpcId)!} /> },
    { label: "Network ACL", value: (item) => <SubnetNetworkAcl subnetId={s(item.SubnetId)!} /> },
    { label: "Default subnet", value: (item) => (item.DefaultForAz ? "Yes" : "No") },
    { label: "Auto-assign public IPv4 address", value: (item) => (item.MapPublicIpOnLaunch ? "Yes" : "No") },
    { label: "Auto-assign IPv6 address", value: (item) => (item.AssignIpv6AddressOnCreation ? "Yes" : "No") },
    { label: "IPv6-only", value: (item) => (item.Ipv6Native ? "Yes" : "No") },
    { label: "Hostname type", value: (item) => ((item.PrivateDnsNameOptionsOnLaunch as Item | undefined)?.HostnameType === "resource-name" ? "Resource name" : "IP name") },
    { label: "Resource name DNS A record", value: (item) => ((item.PrivateDnsNameOptionsOnLaunch as Item | undefined)?.EnableResourceNameDnsARecord ? "Enabled" : "Disabled") },
    { label: "DNS64", value: (item) => (item.EnableDns64 ? "Enabled" : "Disabled") },
    { label: "Owner", value: (item) => s(item.OwnerId) },
  ],
  tabs: [
    { id: "flow", label: "Flow logs", render: (item) => <FlowLogsTab resourceId={s(item.SubnetId)!} /> },
    { id: "rtb", label: "Route table", render: (item) => <SubnetRouteTable subnetId={s(item.SubnetId)!} vpcId={s(item.VpcId)!} routes /> },
    { id: "acl", label: "Network ACL", render: (item) => <SubnetNetworkAcl subnetId={s(item.SubnetId)!} entries /> },
    { id: "cidr", label: "CIDR reservations", render: (item) => <CidrReservations subnetId={s(item.SubnetId)!} /> },
  ],
  actions: [
    { id: "settings", text: "Edit subnet settings", operation: "ModifySubnetAttribute", modal: ({ items, close, ctx }) => <EditSubnetSettings item={items[0]} close={close} ctx={ctx} /> },
    { id: "ipv6", text: "Edit IPv6 CIDRs", operation: "AssociateSubnetCidrBlock", modal: ({ items, close, ctx }) => <AssociateSubnetIpv6 item={items[0]} close={close} ctx={ctx} /> },
    { id: "acl", text: "Edit network ACL association", operation: "ReplaceNetworkAclAssociation", modal: ({ items, close, ctx }) => <EditSubnetAcl item={items[0]} close={close} ctx={ctx} /> },
    { id: "rtb", text: "Edit route table association", operation: "AssociateRouteTable", modal: ({ items, close, ctx }) => <EditSubnetRouteTable item={items[0]} close={close} ctx={ctx} /> },
    { id: "reservations", text: "Edit CIDR reservations", operation: "CreateSubnetCidrReservation", modal: ({ items, close, ctx }) => <CidrReservationModal item={items[0]} close={close} ctx={ctx} /> },
    { id: "flow", text: "Create flow log", operation: "CreateFlowLogs", enabled: (items) => items.length >= 1, modal: ({ items, close, ctx }) => <CreateFlowLog items={items} close={close} ctx={ctx} resourceType="Subnet" /> },
    { id: "share", text: "Share subnet", operation: "CreateResourceShare" },
  ],
  deleteAction: { operation: "DeleteSubnet", input: (item) => ({ SubnetId: item.SubnetId }), warning: "Instances and network interfaces in the subnet must be deleted first." },
}

function AssociateSubnetIpv6({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [cidr, setCidr] = useState("")
  return (
    <OperationModal title="Edit IPv6 CIDRs" close={close} ctx={ctx} saveLabel="Add IPv6 CIDR" success="Successfully associated the IPv6 CIDR block." run={() => callAws("ec2", "AssociateSubnetCidrBlock", { SubnetId: item.SubnetId, Ipv6CidrBlock: cidr })}>
      <FormField label="Subnet IPv6 CIDR block" constraintText="The VPC must have an IPv6 CIDR block. Subnet blocks are /64.">
        <Input value={cidr} placeholder="2600:1f18:abcd:1200::/64" onChange={({ detail }) => setCidr(detail.value)} />
      </FormField>
    </OperationModal>
  )
}

function CidrReservationModal({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [form, setForm] = useState({ cidr: "", type: "prefix", description: "" })
  return (
    <OperationModal
      title="Add CIDR reservation"
      close={close}
      ctx={ctx}
      saveLabel="Add"
      success="Successfully added the CIDR reservation."
      run={() => callAws("ec2", "CreateSubnetCidrReservation", { SubnetId: item.SubnetId, Cidr: form.cidr, ReservationType: form.type, ...(form.description ? { Description: form.description } : {}) })}
    >
      <FormField label="CIDR" constraintText={`Within ${item.CidrBlock}`}><Input value={form.cidr} onChange={({ detail }) => setForm({ ...form, cidr: detail.value })} /></FormField>
      <FormField label="Reservation type"><RadioGroup value={form.type} onChange={({ detail }) => setForm({ ...form, type: detail.value })} items={[{ value: "prefix", label: "Prefix" }, { value: "explicit", label: "Explicit" }]} /></FormField>
      <FormField label={<>Description - <i>optional</i></>}><Input value={form.description} onChange={({ detail }) => setForm({ ...form, description: detail.value })} /></FormField>
    </OperationModal>
  )
}

/* ---------------- Route tables ---------------- */

type Route = { destination: string; targetType: string; target: string }
const targetTypes = [
  { value: "GatewayId", label: "Internet Gateway" },
  { value: "NatGatewayId", label: "NAT Gateway" },
  { value: "EgressOnlyInternetGatewayId", label: "Egress Only Internet Gateway" },
  { value: "NetworkInterfaceId", label: "Network Interface" },
  { value: "VpcPeeringConnectionId", label: "Peering Connection" },
  { value: "TransitGatewayId", label: "Transit Gateway" },
  { value: "InstanceId", label: "Instance" },
  { value: "VpcEndpointId", label: "Gateway Load Balancer Endpoint" },
]

function EditRoutes({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const existing = arr(item.Routes).filter((route) => route.GatewayId !== "local" && route.Origin !== "CreateRouteTable")
  const toRoute = (route: Item): Route => {
    const type = targetTypes.find((t) => route[t.value])?.value ?? "GatewayId"
    return { destination: s(route.DestinationCidrBlock ?? route.DestinationIpv6CidrBlock) ?? "", targetType: type, target: s(route[type]) ?? "" }
  }
  const [routes, setRoutes] = useState<Route[]>(existing.map(toRoute))
  const local = arr(item.Routes).filter((route) => route.GatewayId === "local")
  return (
    <OperationModal
      title="Edit routes"
      size="large"
      close={close}
      ctx={ctx}
      saveLabel="Save changes"
      success={`Updated routes for ${item.RouteTableId} successfully.`}
      run={async () => {
        const original = existing.map(toRoute)
        const destKey = (dest: string) => (dest.includes(":") ? "DestinationIpv6CidrBlock" : "DestinationCidrBlock")
        for (const route of original) if (!routes.some((r) => r.destination === route.destination)) await callAws("ec2", "DeleteRoute", { RouteTableId: item.RouteTableId, [destKey(route.destination)]: route.destination })
        for (const route of routes) {
          const before = original.find((r) => r.destination === route.destination)
          const input = { RouteTableId: item.RouteTableId, [destKey(route.destination)]: route.destination, [route.targetType]: route.target }
          if (!before) await callAws("ec2", "CreateRoute", input)
          else if (before.target !== route.target || before.targetType !== route.targetType) await callAws("ec2", "ReplaceRoute", input)
        }
      }}
    >
      {local.map((route) => (
        <Box key={s(route.DestinationCidrBlock)} variant="small">{s(route.DestinationCidrBlock ?? route.DestinationIpv6CidrBlock)} → local (can&apos;t be edited)</Box>
      ))}
      <AttributeEditor
        items={routes}
        addButtonText="Add route"
        removeButtonText="Remove"
        empty="No additional routes."
        onAddButtonClick={() => setRoutes([...routes, { destination: "", targetType: "GatewayId", target: "" }])}
        onRemoveButtonClick={({ detail }) => setRoutes(routes.filter((_, index) => index !== detail.itemIndex))}
        definition={[
          { label: "Destination", control: (route, index) => <Input value={route.destination} placeholder="0.0.0.0/0" onChange={({ detail }) => setRoutes(routes.map((r, i) => (i === index ? { ...r, destination: detail.value } : r)))} /> },
          {
            label: "Target",
            control: (route, index) => (
              <Select selectedOption={targetTypes.find((t) => t.value === route.targetType) ?? null} onChange={({ detail }) => setRoutes(routes.map((r, i) => (i === index ? { ...r, targetType: detail.selectedOption.value ?? "GatewayId" } : r)))} options={targetTypes} />
            ),
          },
          { label: "Target ID", control: (route, index) => <Input value={route.target} placeholder="igw-..." onChange={({ detail }) => setRoutes(routes.map((r, i) => (i === index ? { ...r, target: detail.value } : r)))} /> },
        ]}
      />
    </OperationModal>
  )
}

function EditSubnetAssociations({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const subnets = useList<Item>("DescribeSubnets", "Subnets", { Filters: [{ Name: "vpc-id", Values: [item.VpcId] }] })
  const current = arr(item.Associations).filter((a) => a.SubnetId).map((a) => s(a.SubnetId)!)
  const [selected, setSelected] = useState<string[]>(current)
  return (
    <OperationModal
      title="Edit subnet associations"
      size="large"
      close={close}
      ctx={ctx}
      saveLabel="Save associations"
      success={`You have successfully updated subnet associations for ${item.RouteTableId}.`}
      run={async () => {
        const tables = (await callAws<{ RouteTables?: Item[] }>("ec2", "DescribeRouteTables", { Filters: [{ Name: "vpc-id", Values: [item.VpcId] }] })).RouteTables ?? []
        for (const assoc of arr(item.Associations)) if (assoc.SubnetId && !selected.includes(s(assoc.SubnetId)!)) await callAws("ec2", "DisassociateRouteTable", { AssociationId: assoc.RouteTableAssociationId })
        for (const subnetId of selected.filter((id) => !current.includes(id))) {
          const other = tables.flatMap((t) => arr(t.Associations)).find((a) => a.SubnetId === subnetId)
          if (other) await callAws("ec2", "ReplaceRouteTableAssociation", { AssociationId: other.RouteTableAssociationId, RouteTableId: item.RouteTableId })
          else await callAws("ec2", "AssociateRouteTable", { RouteTableId: item.RouteTableId, SubnetId: subnetId })
        }
      }}
    >
      <FormField label="Available subnets">
        <Multiselect
          selectedOptions={selected.map((id) => ({ value: id, label: id }))}
          onChange={({ detail }) => setSelected(detail.selectedOptions.map((o) => o.value!))}
          options={subnets.items.map((subnet) => ({ value: s(subnet.SubnetId), label: s(subnet.SubnetId), description: `${nameTag(subnet) ?? ""} ${subnet.CidrBlock}` }))}
          placeholder="Choose subnets"
        />
      </FormField>
    </OperationModal>
  )
}

const routeTablesDef: ResourceDef = {
  path: "/vpc/route-tables",
  title: "Route tables",
  singular: "route table",
  operation: "DescribeRouteTables",
  items: (page) => arr(page.RouteTables),
  key: (item) => s(item.RouteTableId) ?? "",
  create: { label: "Create route table", href: "/vpc/route-tables/create" },
  columns: [
    nameCol,
    { id: "id", label: "Route table ID", value: (item) => s(item.RouteTableId), sort: (item) => s(item.RouteTableId) },
    { id: "explicit", label: "Explicit subnet associations", value: (item) => { const ids = arr(item.Associations).filter((a) => a.SubnetId).map((a) => s(a.SubnetId)); return ids.length ? ids.join(", ") : "–" } },
    { id: "edge", label: "Edge associations", value: (item) => { const ids = arr(item.Associations).filter((a) => a.GatewayId).map((a) => s(a.GatewayId)); return ids.length ? ids.join(", ") : "–" } },
    { id: "main", label: "Main", value: (item) => (arr(item.Associations).some((a) => a.Main) ? "Yes" : "No") },
    { id: "vpc", label: "VPC", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" />, sort: (item) => s(item.VpcId) },
    { id: "owner", label: "Owner ID", value: (item) => s(item.OwnerId) },
  ],
  details: [
    { label: "Route table ID", value: (item) => <Copyable value={s(item.RouteTableId)} /> },
    { label: "Main", value: (item) => (arr(item.Associations).some((a) => a.Main) ? "Yes" : "No") },
    { label: "Explicit subnet associations", value: (item) => arr(item.Associations).filter((a) => a.SubnetId).map((a) => s(a.SubnetId)).join(", ") || "–" },
    { label: "Edge associations", value: (item) => arr(item.Associations).filter((a) => a.GatewayId).map((a) => s(a.GatewayId)).join(", ") || "–" },
    { label: "VPC", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" /> },
    { label: "Owner ID", value: (item) => s(item.OwnerId) },
  ],
  tabs: [
    { id: "routes", label: "Routes", render: (item) => <RoutesTable table={item} /> },
    {
      id: "subnets",
      label: "Subnet associations",
      render: (item) => (
        <ResourceTableLite
          title="Explicit subnet associations"
          items={arr(item.Associations).filter((a) => a.SubnetId)}
          empty="No subnet associations"
          columns={[
            { id: "subnet", header: "Subnet ID", cell: (a) => <ResLink id={s(a.SubnetId)} section="subnets" /> },
            { id: "assoc", header: "Association ID", cell: (a) => s(a.RouteTableAssociationId) },
            { id: "state", header: "State", cell: (a) => <State value={(a.AssociationState as Item | undefined)?.State} /> },
          ]}
        />
      ),
    },
    {
      id: "edge",
      label: "Edge associations",
      render: (item) => (
        <ResourceTableLite
          title="Edge associations"
          items={arr(item.Associations).filter((a) => a.GatewayId)}
          empty="No edge associations"
          columns={[{ id: "gw", header: "Gateway ID", cell: (a) => s(a.GatewayId) }, { id: "assoc", header: "Association ID", cell: (a) => s(a.RouteTableAssociationId) }]}
        />
      ),
    },
    {
      id: "propagation",
      label: "Route propagation",
      render: (item) => (
        <ResourceTableLite
          title="Route propagation"
          items={arr(item.PropagatingVgws)}
          empty="No virtual private gateways"
          columns={[{ id: "vgw", header: "Virtual private gateway", cell: (p) => s(p.GatewayId) }, { id: "prop", header: "Propagation", cell: () => "Yes" }]}
        />
      ),
    },
  ],
  actions: [
    {
      id: "main",
      text: "Set main route table",
      operation: "ReplaceRouteTableAssociation",
      enabled: (items) => items.length === 1 && !arr(items[0].Associations).some((a) => a.Main),
      run: async (items) => {
        const tables = (await callAws<{ RouteTables?: Item[] }>("ec2", "DescribeRouteTables", { Filters: [{ Name: "vpc-id", Values: [items[0].VpcId] }] })).RouteTables ?? []
        const main = tables.flatMap((t) => arr(t.Associations)).find((a) => a.Main)
        await callAws("ec2", "ReplaceRouteTableAssociation", { AssociationId: main?.RouteTableAssociationId, RouteTableId: items[0].RouteTableId })
      },
      success: (items) => `${items[0].RouteTableId} is now the main route table.`,
    },
    { id: "subnets", text: "Edit subnet associations", operation: "AssociateRouteTable", modal: ({ items, close, ctx }) => <EditSubnetAssociations item={items[0]} close={close} ctx={ctx} /> },
    { id: "edge", text: "Edit edge associations", operation: "AssociateRouteTable", modal: ({ items, close, ctx }) => <EdgeAssociation item={items[0]} close={close} ctx={ctx} /> },
    { id: "propagation", text: "Edit route propagation", operation: "EnableVgwRoutePropagation" },
    { id: "routes", text: "Edit routes", operation: "CreateRoute", modal: ({ items, close, ctx }) => <EditRoutes item={items[0]} close={close} ctx={ctx} /> },
  ],
  deleteAction: { operation: "DeleteRouteTable", input: (item) => ({ RouteTableId: item.RouteTableId }), warning: "You can't delete the main route table or a route table with subnet associations." },
}

function EdgeAssociation({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [gateway, setGateway] = useState("")
  return (
    <OperationModal title="Edit edge associations" close={close} ctx={ctx} saveLabel="Save changes" success="Successfully associated the gateway." run={() => callAws("ec2", "AssociateRouteTable", { RouteTableId: item.RouteTableId, GatewayId: gateway })}>
      <FormField label="Gateway ID" description="Associate an internet gateway or virtual private gateway with this route table."><Input value={gateway} placeholder="igw-..." onChange={({ detail }) => setGateway(detail.value)} /></FormField>
    </OperationModal>
  )
}

/* ---------------- Internet gateways ---------------- */

function AttachIgw({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [vpc, setVpc] = useState("")
  return (
    <OperationModal title="Attach to VPC" close={close} ctx={ctx} saveLabel="Attach internet gateway" success={`Internet gateway ${item.InternetGatewayId} successfully attached to ${vpc}.`} run={() => callAws("ec2", "AttachInternetGateway", { InternetGatewayId: item.InternetGatewayId, VpcId: vpc })}>
      <Box variant="small">Attach an internet gateway to a VPC to enable the VPC to communicate with the internet.</Box>
      <FormField label="Available VPCs"><VpcSelect value={vpc} onChange={setVpc} /></FormField>
    </OperationModal>
  )
}

const igwDef: ResourceDef = {
  path: "/vpc/igws",
  title: "Internet gateways",
  singular: "internet gateway",
  operation: "DescribeInternetGateways",
  items: (page) => arr(page.InternetGateways),
  key: (item) => s(item.InternetGatewayId) ?? "",
  create: { label: "Create internet gateway", href: "/vpc/igws/create" },
  columns: [
    nameCol,
    { id: "id", label: "Internet gateway ID", value: (item) => s(item.InternetGatewayId), sort: (item) => s(item.InternetGatewayId) },
    { id: "state", label: "State", value: (item) => <State value={arr(item.Attachments)[0]?.State === "available" ? "Attached" : arr(item.Attachments)[0]?.State ?? "Detached"} /> },
    { id: "vpc", label: "VPC ID", value: (item) => <ResLink id={s(arr(item.Attachments)[0]?.VpcId)} section="vpcs" /> },
    { id: "owner", label: "Owner", value: (item) => s(item.OwnerId) },
  ],
  details: [
    { label: "Internet gateway ID", value: (item) => <Copyable value={s(item.InternetGatewayId)} /> },
    { label: "State", value: (item) => <State value={arr(item.Attachments)[0] ? "Attached" : "Detached"} /> },
    { label: "VPC ID", value: (item) => <ResLink id={s(arr(item.Attachments)[0]?.VpcId)} section="vpcs" /> },
    { label: "Owner", value: (item) => s(item.OwnerId) },
  ],
  actions: [
    { id: "attach", text: "Attach to VPC", operation: "AttachInternetGateway", enabled: (items) => items.length === 1 && !arr(items[0].Attachments).length, modal: ({ items, close, ctx }) => <AttachIgw item={items[0]} close={close} ctx={ctx} /> },
    {
      id: "detach",
      text: "Detach from VPC",
      operation: "DetachInternetGateway",
      enabled: (items) => items.length === 1 && arr(items[0].Attachments).length > 0,
      run: (items) => callAws("ec2", "DetachInternetGateway", { InternetGatewayId: items[0].InternetGatewayId, VpcId: arr(items[0].Attachments)[0]?.VpcId }),
      success: (items) => `Internet gateway ${items[0].InternetGatewayId} successfully detached.`,
    },
  ],
  deleteAction: { operation: "DeleteInternetGateway", input: (item) => ({ InternetGatewayId: item.InternetGatewayId }), warning: "Detach the internet gateway from its VPC before you delete it." },
}

const eigwDef: ResourceDef = {
  path: "/vpc/egress-only-igws",
  title: "Egress-only internet gateways",
  singular: "egress-only internet gateway",
  operation: "DescribeEgressOnlyInternetGateways",
  items: (page) => arr(page.EgressOnlyInternetGateways),
  key: (item) => s(item.EgressOnlyInternetGatewayId) ?? "",
  create: { label: "Create egress only internet gateway", href: "/vpc/egress-only-igws/create" },
  columns: [
    nameCol,
    { id: "id", label: "Egress only internet gateway ID", value: (item) => s(item.EgressOnlyInternetGatewayId), sort: (item) => s(item.EgressOnlyInternetGatewayId) },
    { id: "state", label: "State", value: (item) => <State value={arr(item.Attachments)[0]?.State === "attached" ? "Attached" : "Detached"} /> },
    { id: "vpc", label: "Attached VPC ID", value: (item) => <ResLink id={s(arr(item.Attachments)[0]?.VpcId)} section="vpcs" /> },
  ],
  details: [
    { label: "Egress only internet gateway ID", value: (item) => <Copyable value={s(item.EgressOnlyInternetGatewayId)} /> },
    { label: "State", value: (item) => <State value={arr(item.Attachments)[0]?.State ?? "detached"} /> },
    { label: "Attached VPC ID", value: (item) => <ResLink id={s(arr(item.Attachments)[0]?.VpcId)} section="vpcs" /> },
  ],
  deleteAction: { operation: "DeleteEgressOnlyInternetGateway", input: (item) => ({ EgressOnlyInternetGatewayId: item.EgressOnlyInternetGatewayId }) },
}

const dhcpValue = (item: Item, key: string) => arr(item.DhcpConfigurations).find((config) => config.Key === key)
const dhcpValues = (item: Item, key: string) => arr(dhcpValue(item, key)?.Values).map((v) => s(v.Value)).join(", ") || "–"

const dhcpDef: ResourceDef = {
  path: "/vpc/dhcp-options",
  title: "DHCP option sets",
  singular: "DHCP option set",
  operation: "DescribeDhcpOptions",
  items: (page) => arr(page.DhcpOptions),
  key: (item) => s(item.DhcpOptionsId) ?? "",
  create: { label: "Create DHCP option set", href: "/vpc/dhcp-options/create" },
  columns: [
    nameCol,
    { id: "id", label: "DHCP option set ID", value: (item) => s(item.DhcpOptionsId), sort: (item) => s(item.DhcpOptionsId) },
    { id: "domain", label: "Domain name", value: (item) => dhcpValues(item, "domain-name") },
    { id: "servers", label: "Domain name servers", value: (item) => dhcpValues(item, "domain-name-servers") },
    { id: "ntp", label: "NTP servers", value: (item) => dhcpValues(item, "ntp-servers") },
    { id: "netbios", label: "NetBIOS name servers", value: (item) => dhcpValues(item, "netbios-name-servers") },
    { id: "nodetype", label: "NetBIOS node type", value: (item) => dhcpValues(item, "netbios-node-type") },
    { id: "owner", label: "Owner", value: (item) => s(item.OwnerId) },
  ],
  details: [
    { label: "DHCP option set ID", value: (item) => <Copyable value={s(item.DhcpOptionsId)} /> },
    { label: "Domain name", value: (item) => dhcpValues(item, "domain-name") },
    { label: "Domain name servers", value: (item) => dhcpValues(item, "domain-name-servers") },
    { label: "NTP servers", value: (item) => dhcpValues(item, "ntp-servers") },
    { label: "NetBIOS name servers", value: (item) => dhcpValues(item, "netbios-name-servers") },
    { label: "NetBIOS node type", value: (item) => dhcpValues(item, "netbios-node-type") },
    { label: "IPv6 preferred lease time", value: (item) => dhcpValues(item, "ipv6-address-preferred-lease-time") },
    { label: "Owner", value: (item) => s(item.OwnerId) },
  ],
  deleteAction: { operation: "DeleteDhcpOptions", input: (item) => ({ DhcpOptionsId: item.DhcpOptionsId }), warning: "You can't delete a DHCP option set that is associated with a VPC." },
}

/* ---------------- Elastic IPs ---------------- */

function AssociateAddress({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [type, setType] = useState("instance")
  const [target, setTarget] = useState("")
  const [privateIp, setPrivateIp] = useState("")
  const [reassoc, setReassoc] = useState(false)
  const instances = useList<{ Instances?: Item[] }>("DescribeInstances", "Reservations")
  const enis = useList<Item>("DescribeNetworkInterfaces", "NetworkInterfaces")
  const options =
    type === "instance"
      ? instances.items.flatMap((r) => arr(r.Instances)).map((i) => ({ value: s(i.InstanceId), label: `${i.InstanceId}${nameTag(i) ? ` (${nameTag(i)})` : ""}` }))
      : enis.items.map((n) => ({ value: s(n.NetworkInterfaceId), label: s(n.NetworkInterfaceId) }))
  return (
    <OperationModal
      title="Associate Elastic IP address"
      close={close}
      ctx={ctx}
      saveLabel="Associate"
      success={`Elastic IP address ${item.PublicIp} associated successfully.`}
      run={() => callAws("ec2", "AssociateAddress", { AllocationId: item.AllocationId, ...(type === "instance" ? { InstanceId: target } : { NetworkInterfaceId: target }), ...(privateIp ? { PrivateIpAddress: privateIp } : {}), AllowReassociation: reassoc })}
    >
      <Box variant="small">Choose the instance or network interface to associate to this Elastic IP address ({s(item.PublicIp)}).</Box>
      <FormField label="Resource type"><RadioGroup value={type} onChange={({ detail }) => { setType(detail.value); setTarget("") }} items={[{ value: "instance", label: "Instance" }, { value: "eni", label: "Network interface" }]} /></FormField>
      <FormField label={type === "instance" ? "Instance" : "Network interface"}>
        <Select selectedOption={options.find((o) => o.value === target) ?? null} placeholder="Choose" onChange={({ detail }) => setTarget(detail.selectedOption.value ?? "")} options={options} filteringType="auto" />
      </FormField>
      <FormField label={<>Private IP address - <i>optional</i></>}><Input value={privateIp} onChange={({ detail }) => setPrivateIp(detail.value)} /></FormField>
      <Checkbox checked={reassoc} onChange={({ detail }) => setReassoc(detail.checked)}>Allow this Elastic IP address to be reassociated</Checkbox>
    </OperationModal>
  )
}

const eipDef: ResourceDef = {
  path: "/vpc/addresses",
  title: "Elastic IP addresses",
  singular: "Elastic IP address",
  operation: "DescribeAddresses",
  items: (page) => arr(page.Addresses),
  key: (item) => s(item.AllocationId) ?? s(item.PublicIp) ?? "",
  create: { label: "Allocate Elastic IP address", href: "/vpc/addresses/create" },
  columns: [
    nameCol,
    { id: "ip", label: "Allocated IPv4 address", value: (item) => s(item.PublicIp), sort: (item) => s(item.PublicIp) },
    { id: "type", label: "Type", value: () => "Public IP" },
    { id: "alloc", label: "Allocation ID", value: (item) => s(item.AllocationId), sort: (item) => s(item.AllocationId) },
    { id: "rdns", label: "Reverse DNS record", value: () => "–" },
    { id: "instance", label: "Associated instance ID", value: (item) => dash(item.InstanceId) },
    { id: "private", label: "Private IP address", value: (item) => dash(item.PrivateIpAddress) },
    { id: "assoc", label: "Association ID", value: (item) => dash(item.AssociationId) },
    { id: "eni", label: "Network interface ID", value: (item) => dash(item.NetworkInterfaceId) },
    { id: "border", label: "Network border group", value: (item) => dash(item.NetworkBorderGroup) },
  ],
  details: [
    { label: "Allocated IPv4 address", value: (item) => <Copyable value={s(item.PublicIp)} /> },
    { label: "Type", value: () => "Public IP" },
    { label: "Allocation ID", value: (item) => <Copyable value={s(item.AllocationId)} /> },
    { label: "Associated instance ID", value: (item) => dash(item.InstanceId) },
    { label: "Private IP address", value: (item) => dash(item.PrivateIpAddress) },
    { label: "Association ID", value: (item) => dash(item.AssociationId) },
    { label: "Network interface ID", value: (item) => dash(item.NetworkInterfaceId) },
    { label: "Network interface owner account ID", value: (item) => dash(item.NetworkInterfaceOwnerId) },
    { label: "Public IPv4 pool", value: (item) => dash(item.PublicIpv4Pool) },
    { label: "Network border group", value: (item) => dash(item.NetworkBorderGroup) },
    { label: "Scope", value: (item) => dash(item.Domain) },
  ],
  actions: [
    { id: "associate", text: "Associate Elastic IP address", operation: "AssociateAddress", modal: ({ items, close, ctx }) => <AssociateAddress item={items[0]} close={close} ctx={ctx} /> },
    {
      id: "disassociate",
      text: "Disassociate Elastic IP address",
      operation: "DisassociateAddress",
      enabled: (items) => items.length === 1 && Boolean(items[0].AssociationId),
      run: (items) => callAws("ec2", "DisassociateAddress", { AssociationId: items[0].AssociationId }),
      success: () => "Elastic IP address disassociated successfully.",
    },
    { id: "rdns", text: "Update reverse DNS", operation: "ModifyAddressAttribute" },
    {
      id: "release",
      text: "Release Elastic IP addresses",
      operation: "ReleaseAddress",
      enabled: (items) => items.length >= 1 && items.every((item) => !item.AssociationId),
      run: async (items) => { for (const item of items) await callAws("ec2", "ReleaseAddress", { AllocationId: item.AllocationId }) },
      success: () => "Elastic IP addresses released successfully.",
    },
  ],
}

export const moreDefs: Record<string, ResourceDef> = {
  subnets: subnetsDef,
  "route-tables": routeTablesDef,
  igws: igwDef,
  "egress-only-igws": eigwDef,
  "dhcp-options": dhcpDef,
  addresses: eipDef,
  ...securityDefs,
  ...networkDefs,
}

