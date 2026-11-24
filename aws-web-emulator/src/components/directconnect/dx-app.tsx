"use client"

import { col, copyField, CountDashboard, ServiceRouter, stateCol, stateField, SubTable, sv, tagList, textField, Status, type FormSpec, type ServiceApp } from "@/components/console/service-app"
import { dash, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import { useState } from "react"
import { EditModal } from "@/components/console/sections"
import { callAws } from "@/lib/aws"

function RenameModal({ item, close, refresh }: { item: Item; close: () => void; refresh: () => Promise<unknown> }) {
  const [name, setName] = useState(String(item.directConnectGatewayName ?? ""))
  return (
    <EditModal visible title="Edit Direct Connect gateway" onDismiss={close} saveDisabled={!name} success="Direct Connect gateway updated." onSave={async () => { await callAws(M, "UpdateDirectConnectGateway", { directConnectGatewayId: item.directConnectGatewayId, newDirectConnectGatewayName: name }); await refresh() }}>
      <FormField label="Name"><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
    </EditModal>
  )
}

const M = "directconnect"
const base = { tagResource: false, model: M, linkColumn: 0 } as const
const bandwidths = ["50Mbps", "100Mbps", "200Mbps", "300Mbps", "400Mbps", "500Mbps", "1Gbps", "2Gbps", "5Gbps", "10Gbps", "25Gbps", "100Gbps", "400Gbps"].map((b) => ({ value: b, label: b }))
const tagsOf = (v: Record<string, unknown>) => {
  const t = tagList((v.tags as { Key: string; Value?: string }[]) ?? []).map((x) => ({ key: x.Key, value: x.Value }))
  return t.length ? t : undefined
}
const connectionSource = { model: M, operation: "DescribeConnections", items: (p: Item) => (p.connections as Item[]) ?? [], value: (i: Item) => String(i.connectionId), label: (i: Item) => String(i.connectionName), description: (i: Item) => `${i.connectionId} · ${i.location} · ${i.bandwidth}` }
const gatewaySource = { model: M, operation: "DescribeDirectConnectGateways", items: (p: Item) => (p.directConnectGateways as Item[]) ?? [], value: (i: Item) => String(i.directConnectGatewayId), label: (i: Item) => String(i.directConnectGatewayName), description: (i: Item) => String(i.directConnectGatewayId) }

const connections: ResourceDef = {
  ...base,
  path: "/directconnect/connections",
  title: "Connections",
  singular: "connection",
  description: "A connection is a dedicated network link between your network and an AWS Direct Connect location.",
  operation: "DescribeConnections",
  items: (p) => (p.connections as Item[]) ?? [],
  key: (i) => String(i.connectionId),
  display: (i) => String(i.connectionName),
  columns: [col("name", "Name", (i) => i.connectionName), col("id", "ID", (i) => i.connectionId), stateCol("connectionState", "State"), col("location", "Location", (i) => i.location), col("bandwidth", "Bandwidth", (i) => i.bandwidth), col("device", "AWS device", (i) => i.awsDeviceV2), col("region", "Region", (i) => i.region)],
  details: [
    textField("Name", (i) => i.connectionName),
    copyField("ID", (i) => i.connectionId),
    stateField("State", "connectionState"),
    textField("Location", (i) => i.location),
    textField("Bandwidth", (i) => i.bandwidth),
    textField("Region", (i) => i.region),
    textField("AWS device", (i) => i.awsDeviceV2),
    textField("AWS logical device", (i) => i.awsLogicalDeviceId),
    textField("Jumbo frame capable", (i) => i.jumboFrameCapable),
    textField("MACsec capable", (i) => i.macSecCapable),
    textField("Logical redundancy", (i) => i.hasLogicalRedundancy),
    textField("Provider", (i) => i.providerName),
  ],
  tabs: [
    {
      id: "vifs",
      label: "Virtual interfaces",
      render: (i) => (
        <SubTable
          title="Virtual interfaces"
          model={M}
          operation="DescribeVirtualInterfaces"
          input={{ connectionId: i.connectionId }}
          items={(p) => (p.virtualInterfaces as Item[]) ?? []}
          trackBy={(v) => String(v.virtualInterfaceId)}
          columns={vifColumns}
        />
      ),
    },
  ],
  create: { label: "Create connection", href: "/directconnect/connections/create" },
  deleteAction: { operation: "DeleteConnection", input: (i) => ({ connectionId: i.connectionId }), warning: "Delete the virtual interfaces on this connection first." },
}

const vifColumns = [
  { id: "name", header: "Name", cell: (v: Item) => dash(v.virtualInterfaceName) },
  { id: "id", header: "ID", cell: (v: Item) => dash(v.virtualInterfaceId) },
  { id: "type", header: "Type", cell: (v: Item) => dash(v.virtualInterfaceType) },
  { id: "state", header: "State", cell: (v: Item) => <Status value={v.virtualInterfaceState} /> },
  { id: "vlan", header: "VLAN", cell: (v: Item) => dash(v.vlan) },
  { id: "asn", header: "BGP ASN", cell: (v: Item) => dash(v.asn) },
]

const vifs: ResourceDef = {
  ...base,
  path: "/directconnect/virtual-interfaces",
  title: "Virtual interfaces",
  singular: "virtual interface",
  description: "Virtual interfaces enable access to AWS services from your Direct Connect connections.",
  operation: "DescribeVirtualInterfaces",
  items: (p) => (p.virtualInterfaces as Item[]) ?? [],
  key: (i) => String(i.virtualInterfaceId),
  display: (i) => String(i.virtualInterfaceName),
  columns: [col("name", "Name", (i) => i.virtualInterfaceName), col("id", "ID", (i) => i.virtualInterfaceId), stateCol("virtualInterfaceState", "State"), col("type", "Type", (i) => i.virtualInterfaceType), col("conn", "Connection", (i) => i.connectionId), col("vlan", "VLAN", (i) => i.vlan), col("asn", "BGP ASN", (i) => i.asn), col("gw", "Direct Connect gateway", (i) => i.directConnectGatewayId)],
  details: [
    textField("Name", (i) => i.virtualInterfaceName),
    copyField("ID", (i) => i.virtualInterfaceId),
    stateField("State", "virtualInterfaceState"),
    textField("Type", (i) => i.virtualInterfaceType),
    textField("Connection", (i) => i.connectionId),
    textField("VLAN", (i) => i.vlan),
    textField("BGP ASN", (i) => i.asn),
    textField("Amazon side ASN", (i) => i.amazonSideAsn),
    textField("Your router peer IP", (i) => i.customerAddress),
    textField("Amazon router peer IP", (i) => i.amazonAddress),
    textField("Address family", (i) => i.addressFamily),
    textField("MTU", (i) => i.mtu),
    textField("Direct Connect gateway", (i) => i.directConnectGatewayId),
    textField("Virtual private gateway", (i) => i.virtualGatewayId),
    textField("BGP peers", (i) => ((i.bgpPeers as Item[] | undefined) ?? []).map((b) => `${b.bgpPeerId ?? ""} ${b.bgpPeerState ?? ""}/${b.bgpStatus ?? ""}`)),
  ],
  create: { label: "Create virtual interface", href: "/directconnect/virtual-interfaces/create" },
  deleteAction: { operation: "DeleteVirtualInterface", input: (i) => ({ virtualInterfaceId: i.virtualInterfaceId }) },
}

const gateways: ResourceDef = {
  ...base,
  path: "/directconnect/gateways",
  title: "Direct Connect gateways",
  singular: "Direct Connect gateway",
  description: "A Direct Connect gateway is a globally available resource that connects virtual interfaces to virtual private gateways or transit gateways in any Region.",
  operation: "DescribeDirectConnectGateways",
  items: (p) => (p.directConnectGateways as Item[]) ?? [],
  key: (i) => String(i.directConnectGatewayId),
  display: (i) => String(i.directConnectGatewayName),
  columns: [col("name", "Name", (i) => i.directConnectGatewayName), col("id", "ID", (i) => i.directConnectGatewayId), stateCol("directConnectGatewayState", "State"), col("asn", "Amazon side ASN", (i) => i.amazonSideAsn), col("owner", "Account", (i) => i.ownerAccount)],
  details: [
    textField("Name", (i) => i.directConnectGatewayName),
    copyField("ID", (i) => i.directConnectGatewayId),
    stateField("State", "directConnectGatewayState"),
    textField("Amazon side ASN", (i) => i.amazonSideAsn),
    textField("Account", (i) => i.ownerAccount),
    textField("State change error", (i) => i.stateChangeError),
  ],
  tabs: [
    {
      id: "associations",
      label: "Gateway associations",
      render: (i) => (
        <SubTable
          title="Gateway associations"
          description="Associate a virtual private gateway or transit gateway with this Direct Connect gateway."
          model={M}
          operation="DescribeDirectConnectGatewayAssociations"
          input={{ directConnectGatewayId: i.directConnectGatewayId }}
          items={(p) => (p.directConnectGatewayAssociations as Item[]) ?? []}
          trackBy={(a) => String(a.associationId)}
          columns={[
            { id: "id", header: "Association ID", cell: (a) => dash(a.associationId) },
            { id: "gw", header: "Gateway", cell: (a) => dash(a.associatedGateway ? (a.associatedGateway as Item).id : a.virtualGatewayId) },
            { id: "type", header: "Gateway type", cell: (a) => dash(a.associatedGateway ? (a.associatedGateway as Item).type : "virtualPrivateGateway") },
            { id: "state", header: "State", cell: (a) => <Status value={a.associationState} /> },
            { id: "prefixes", header: "Allowed prefixes", cell: (a) => ((a.allowedPrefixesToDirectConnectGateway as Item[] | undefined) ?? []).map((p) => p.cidr).join(", ") || "–" },
          ]}
          create={{
            title: "Associate gateway",
            sections: [{ title: "Association", fields: [
              { id: "gw", label: "Virtual private gateway or transit gateway", type: "select", source: { model: "ec2", operation: "DescribeVpnGateways", items: (p) => (p.VpnGateways as Item[]) ?? [], value: (g) => String(g.VpnGatewayId), label: (g) => String(g.VpnGatewayId), description: (g) => String(g.State) } },
              { id: "prefixes", label: "Allowed prefixes", optional: true, placeholder: "10.0.0.0/16, 10.1.0.0/16" },
            ] }],
            submit: async (v) => {
              const prefixes = String(v.prefixes ?? "").split(/[\s,]+/).filter(Boolean).map((cidr) => ({ cidr }))
              await callAws(M, "CreateDirectConnectGatewayAssociation", { directConnectGatewayId: i.directConnectGatewayId, gatewayId: v.gw, ...(prefixes.length ? { addAllowedPrefixesToDirectConnectGateway: prefixes } : {}) })
              return "Gateway association is being created."
            },
          }}
          remove={{ label: "Disassociate", run: (a) => callAws(M, "DeleteDirectConnectGatewayAssociation", { associationId: a.associationId }) }}
        />
      ),
    },
    {
      id: "vifs",
      label: "Virtual interfaces",
      render: (i) => (
        <SubTable title="Virtual interfaces" model={M} operation="DescribeVirtualInterfaces" input={{ directConnectGatewayId: i.directConnectGatewayId }} items={(p) => ((p.virtualInterfaces as Item[]) ?? []).filter((v) => v.directConnectGatewayId === i.directConnectGatewayId)} trackBy={(v) => String(v.virtualInterfaceId)} columns={vifColumns} />
      ),
    },
  ],
  actions: [
    { id: "rename", text: "Edit name", enabled: (s) => s.length === 1, modal: ({ items, close, ctx }) => <RenameModal item={items[0]} close={close} refresh={ctx.refresh} /> },
  ],
  create: { label: "Create Direct Connect gateway", href: "/directconnect/gateways/create" },
  deleteAction: { operation: "DeleteDirectConnectGateway", input: (i) => ({ directConnectGatewayId: i.directConnectGatewayId }), warning: "Delete the gateway's associations and virtual interfaces first." },
}

const resiliency: ResourceDef = {
  ...base,
  path: "/directconnect/resiliency-groups",
  title: "Resiliency groups",
  singular: "resiliency group",
  operation: "ListResiliencyGroups",
  items: (p) => (p.items as Item[]) ?? (p.resiliencyGroups as Item[]) ?? [],
  key: (i) => String(i.resiliencyGroupId ?? i.id),
  display: (i) => String(i.resiliencyGroupName ?? i.name ?? i.resiliencyGroupId),
  columns: [col("name", "Name", (i) => i.resiliencyGroupName ?? i.name), col("id", "ID", (i) => i.resiliencyGroupId ?? i.id), stateCol("state")],
  details: [textField("Name", (i) => i.resiliencyGroupName ?? i.name), copyField("ID", (i) => i.resiliencyGroupId ?? i.id), stateField("State", "state")],
  deleteAction: { operation: "DeleteResiliencyGroup", input: (i) => ({ resiliencyGroupId: i.resiliencyGroupId ?? i.id }) },
}

const lags: ResourceDef = { ...base, path: "/directconnect/lags", title: "LAGs", singular: "LAG", operation: "DescribeLags", items: (p) => (p.lags as Item[]) ?? [], key: (i) => String(i.lagId), columns: [col("name", "Name", (i) => i.lagName), col("id", "ID", (i) => i.lagId), stateCol("lagState", "State")], details: [] }
const interconnects: ResourceDef = { ...base, path: "/directconnect/interconnects", title: "Interconnects", singular: "interconnect", operation: "DescribeInterconnects", items: (p) => (p.interconnects as Item[]) ?? [], key: (i) => String(i.interconnectId), columns: [col("name", "Name", (i) => i.interconnectName), col("id", "ID", (i) => i.interconnectId), stateCol("interconnectState", "State")], details: [] }
const vgws: ResourceDef = { ...base, path: "/directconnect/virtual-private-gateways", title: "Virtual private gateways", singular: "virtual private gateway", operation: "DescribeVirtualGateways", items: (p) => (p.virtualGateways as Item[]) ?? [], key: (i) => String(i.virtualGatewayId), columns: [col("id", "ID", (i) => i.virtualGatewayId), stateCol("virtualGatewayState", "State")], details: [] }

const createConnection: FormSpec = {
  title: "Create connection",
  sections: [
    { title: "Connection settings", fields: [
      { id: "name", label: "Name" },
      { id: "location", label: "Location", placeholder: "EqSe2", description: "The AWS Direct Connect location code. The local emulator doesn't publish locations, so enter a code." },
      { id: "bandwidth", label: "Port speed", type: "select", default: "1Gbps", options: bandwidths },
      { id: "provider", label: "Service provider", optional: true },
    ] },
    { title: "Tags", fields: [{ id: "tags", label: "Tags", type: "tags" }] },
  ],
  submit: async (v) => {
    await callAws(M, "CreateConnection", { connectionName: v.name, location: v.location, bandwidth: v.bandwidth, ...(sv(v.provider) ? { providerName: v.provider } : {}), tags: tagsOf(v) })
    return `Connection ${v.name} requested.`
  },
}

const createVif: FormSpec = {
  title: "Create virtual interface",
  sections: [
    { title: "Virtual interface type", fields: [{ id: "type", label: "Type", type: "select", default: "private", options: [{ value: "private", label: "Private", description: "Access an Amazon VPC using private IP addresses." }, { value: "public", label: "Public (not available in the local emulator)" }, { value: "transit", label: "Transit (not available in the local emulator)" }] }] },
    { title: "Private virtual interface settings", fields: [
      { id: "name", label: "Virtual interface name" },
      { id: "connection", label: "Connection", type: "select", source: connectionSource },
      { id: "gateway", label: "Direct Connect gateway", type: "select", source: gatewaySource },
      { id: "vlan", label: "VLAN", type: "number", default: "101" },
      { id: "asn", label: "BGP ASN", type: "number", default: "65000", description: "The Border Gateway Protocol Autonomous System Number of your on-premises router." },
      { id: "family", label: "Address family", type: "select", default: "ipv4", options: [{ value: "ipv4", label: "IPv4" }, { value: "ipv6", label: "IPv6" }] },
      { id: "customer", label: "Your router peer IP", optional: true, placeholder: "169.254.255.2/30" },
      { id: "amazon", label: "Amazon router peer IP", optional: true, placeholder: "169.254.255.1/30" },
      { id: "auth", label: "BGP authentication key", optional: true },
      { id: "mtu", label: "Jumbo MTU (MTU size 9001)", type: "toggle", placeholder: "Enabled" },
    ] },
    { title: "Tags", fields: [{ id: "tags", label: "Tags", type: "tags" }] },
  ],
  valid: (v) => v.type === "private",
  submit: async (v) => {
    await callAws(M, "CreatePrivateVirtualInterface", {
      connectionId: v.connection,
      newPrivateVirtualInterface: {
        virtualInterfaceName: v.name,
        vlan: Number(v.vlan),
        asn: Number(v.asn),
        addressFamily: v.family,
        directConnectGatewayId: v.gateway,
        mtu: v.mtu ? 9001 : 1500,
        ...(sv(v.customer) ? { customerAddress: v.customer } : {}),
        ...(sv(v.amazon) ? { amazonAddress: v.amazon } : {}),
        ...(sv(v.auth) ? { authKey: v.auth } : {}),
        tags: tagsOf(v),
      },
    })
    return `Virtual interface ${v.name} is being created.`
  },
}

const createGateway: FormSpec = {
  title: "Create Direct Connect gateway",
  sections: [
    { title: "Direct Connect gateway configuration", fields: [
      { id: "name", label: "Name" },
      { id: "asn", label: "Amazon side ASN", type: "number", default: "64512", constraint: "Must be in the 64,512 to 65,534 or 4,200,000,000 to 4,294,967,294 range." },
    ] },
    { title: "Tags", fields: [{ id: "tags", label: "Tags", type: "tags" }] },
  ],
  submit: async (v) => {
    await callAws(M, "CreateDirectConnectGateway", { directConnectGatewayName: v.name, amazonSideAsn: Number(v.asn), tags: tagsOf(v) })
    return `Direct Connect gateway ${v.name} is being created.`
  },
}

export const dxApp: ServiceApp = {
  id: "directconnect",
  name: "AWS Direct Connect",
  home: "/directconnect",
  nav: [
    { type: "link", text: "Dashboard", href: "/directconnect" },
    { type: "link", text: "Connections", href: "/directconnect/connections" },
    { type: "link", text: "Virtual interfaces", href: "/directconnect/virtual-interfaces" },
    { type: "link", text: "LAGs", href: "/directconnect/lags" },
    { type: "link", text: "Direct Connect gateways", href: "/directconnect/gateways" },
    { type: "link", text: "Virtual private gateways", href: "/directconnect/virtual-private-gateways" },
    { type: "link", text: "Interconnects", href: "/directconnect/interconnects" },
    { type: "link", text: "Resiliency groups", href: "/directconnect/resiliency-groups" },
    { type: "divider" },
    { type: "link", text: "Multicloud interconnects", href: "/interconnect" },
  ],
  defs: { connections, "virtual-interfaces": vifs, gateways, lags, "virtual-private-gateways": vgws, interconnects, "resiliency-groups": resiliency },
  creates: { connections: createConnection, "virtual-interfaces": createVif, gateways: createGateway },
  dashboard: () => <CountDashboard app={dxApp} title="AWS Direct Connect" description="Establish a dedicated network connection from your premises to AWS." sections={["connections", "virtual-interfaces", "gateways", "lags"]} />,
}

export function DirectConnectApp({ path }: { path: string[] }) {
  return <ServiceRouter app={dxApp} path={path} />
}
