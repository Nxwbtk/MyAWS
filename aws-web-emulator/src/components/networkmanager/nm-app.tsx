"use client"

import { col, copyField, CountDashboard, dateCol, dateField, ob, ServiceRouter, Status, stateCol, stateField, SubTable, sv, tagList, TagsPanel, textField, type FormSpec, type ServiceApp } from "@/components/console/service-app"
import { dash, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { callAws } from "@/lib/aws"

const M = "networkmanager"
const base = { tagResource: false, model: M, linkColumn: 0 } as const
const tagsOf = (v: Record<string, unknown>) => tagList((v.tags as { Key: string; Value?: string }[]) ?? [])
const nameTag = (i: Item) => ((i.Tags as { Key: string; Value: string }[] | undefined) ?? []).find((t) => t.Key === "Name")?.Value
const location = (i: Item) => { const l = ob(i.Location); return [l.Address, l.Latitude && `${l.Latitude}, ${l.Longitude}`].filter(Boolean).join(" · ") || undefined }

const tags = (arn: unknown) => (
  <TagsPanel
    id={String(arn)}
    load={async () => ((await callAws<{ TagList?: { Key: string; Value: string }[] }>(M, "ListTagsForResource", { ResourceArn: arn })).TagList ?? [])}
    save={async (add, remove) => {
      if (remove.length) await callAws(M, "UntagResource", { ResourceArn: arn, TagKeys: remove })
      if (add.length) await callAws(M, "TagResource", { ResourceArn: arn, Tags: tagList(add) })
    }}
  />
)

const nameField = { id: "name", label: "Name", optional: true }
const withName = (v: Record<string, unknown>) => [...(sv(v.name) ? [{ Key: "Name", Value: String(v.name) }] : []), ...tagsOf(v)]
const locationFields = [
  { id: "address", label: "Address", optional: true },
  { id: "lat", label: "Latitude", optional: true },
  { id: "lon", label: "Longitude", optional: true },
]
const locOf = (v: Record<string, unknown>) => (sv(v.address) || sv(v.lat) ? { Location: { ...(sv(v.address) ? { Address: v.address } : {}), ...(sv(v.lat) ? { Latitude: v.lat, Longitude: v.lon } : {}) } } : {})

function SitesTab({ gn }: { gn: string }) {
  return (
    <SubTable
      title="Sites"
      description="A site represents a physical location for your network, such as a data center or branch office."
      model={M}
      operation="GetSites"
      input={{ GlobalNetworkId: gn }}
      items={(p) => (p.Sites as Item[]) ?? []}
      trackBy={(s) => String(s.SiteId)}
      columns={[
        { id: "name", header: "Name", cell: (s) => dash(nameTag(s)) },
        { id: "id", header: "Site ID", cell: (s) => dash(s.SiteId) },
        { id: "desc", header: "Description", cell: (s) => dash(s.Description) },
        { id: "loc", header: "Location", cell: (s) => dash(location(s)) },
        { id: "state", header: "State", cell: (s) => <Status value={s.State} /> },
      ]}
      create={{
        title: "Create site",
        sections: [{ title: "Site", fields: [nameField, { id: "description", label: "Description", optional: true }, ...locationFields] }],
        submit: async (v) => { await callAws(M, "CreateSite", { GlobalNetworkId: gn, Description: sv(v.description), ...locOf(v), Tags: withName(v) }); return "Site created." },
      }}
      remove={{ run: (s) => callAws(M, "DeleteSite", { GlobalNetworkId: gn, SiteId: s.SiteId }) }}
    />
  )
}

function DevicesTab({ gn }: { gn: string }) {
  return (
    <SubTable
      title="Devices"
      description="Devices are the physical or virtual appliances at your sites."
      model={M}
      operation="GetDevices"
      input={{ GlobalNetworkId: gn }}
      items={(p) => (p.Devices as Item[]) ?? []}
      trackBy={(d) => String(d.DeviceId)}
      columns={[
        { id: "name", header: "Name", cell: (d) => dash(nameTag(d)) },
        { id: "id", header: "Device ID", cell: (d) => dash(d.DeviceId) },
        { id: "type", header: "Type", cell: (d) => dash(d.Type) },
        { id: "vendor", header: "Vendor", cell: (d) => dash(d.Vendor) },
        { id: "model", header: "Model", cell: (d) => dash(d.Model) },
        { id: "site", header: "Site", cell: (d) => dash(d.SiteId) },
        { id: "state", header: "State", cell: (d) => <Status value={d.State} /> },
      ]}
      create={{
        title: "Create device",
        sections: [{ title: "Device", fields: [
          nameField,
          { id: "description", label: "Description", optional: true },
          { id: "type", label: "Type", optional: true, placeholder: "router" },
          { id: "vendor", label: "Vendor", optional: true },
          { id: "model", label: "Model", optional: true },
          { id: "serial", label: "Serial number", optional: true },
          { id: "site", label: "Site", type: "select", optional: true, source: { model: M, operation: "GetSites", input: { GlobalNetworkId: gn }, items: (p) => (p.Sites as Item[]) ?? [], value: (s) => String(s.SiteId), label: (s) => nameTag(s) ?? String(s.SiteId) } },
        ] }],
        submit: async (v) => {
          await callAws(M, "CreateDevice", { GlobalNetworkId: gn, Description: sv(v.description), Type: sv(v.type), Vendor: sv(v.vendor), Model: sv(v.model), SerialNumber: sv(v.serial), SiteId: sv(v.site), Tags: withName(v) })
          return "Device created."
        },
      }}
      remove={{ run: (d) => callAws(M, "DeleteDevice", { GlobalNetworkId: gn, DeviceId: d.DeviceId }) }}
    />
  )
}

function LinksTab({ gn }: { gn: string }) {
  return (
    <SubTable
      title="Links"
      description="Links represent the internet connections from your devices."
      model={M}
      operation="GetLinks"
      input={{ GlobalNetworkId: gn }}
      items={(p) => (p.Links as Item[]) ?? []}
      trackBy={(l) => String(l.LinkId)}
      columns={[
        { id: "name", header: "Name", cell: (l) => dash(nameTag(l)) },
        { id: "id", header: "Link ID", cell: (l) => dash(l.LinkId) },
        { id: "site", header: "Site", cell: (l) => dash(l.SiteId) },
        { id: "provider", header: "Provider", cell: (l) => dash(l.Provider) },
        { id: "bw", header: "Bandwidth (Mbps up/down)", cell: (l) => `${ob(l.Bandwidth).UploadSpeed ?? "–"} / ${ob(l.Bandwidth).DownloadSpeed ?? "–"}` },
        { id: "state", header: "State", cell: (l) => <Status value={l.State} /> },
      ]}
      create={{
        title: "Create link",
        sections: [{ title: "Link", fields: [
          nameField,
          { id: "site", label: "Site", type: "select", source: { model: M, operation: "GetSites", input: { GlobalNetworkId: gn }, items: (p) => (p.Sites as Item[]) ?? [], value: (s) => String(s.SiteId), label: (s) => nameTag(s) ?? String(s.SiteId) } },
          { id: "up", label: "Upload speed (Mbps)", type: "number", default: "100" },
          { id: "down", label: "Download speed (Mbps)", type: "number", default: "100" },
          { id: "provider", label: "Provider", optional: true },
          { id: "type", label: "Type", optional: true, placeholder: "broadband" },
        ] }],
        submit: async (v) => {
          await callAws(M, "CreateLink", { GlobalNetworkId: gn, SiteId: v.site, Bandwidth: { UploadSpeed: Number(v.up), DownloadSpeed: Number(v.down) }, Provider: sv(v.provider), Type: sv(v.type), Tags: withName(v) })
          return "Link created."
        },
      }}
      remove={{ run: (l) => callAws(M, "DeleteLink", { GlobalNetworkId: gn, LinkId: l.LinkId }) }}
    />
  )
}

function TgwTab({ gn }: { gn: string }) {
  return (
    <SubTable
      title="Transit gateway registrations"
      description="Register transit gateways to visualize and monitor them in your global network."
      model={M}
      operation="GetTransitGatewayRegistrations"
      input={{ GlobalNetworkId: gn }}
      items={(p) => (p.TransitGatewayRegistrations as Item[]) ?? []}
      trackBy={(r) => String(r.TransitGatewayArn)}
      columns={[
        { id: "arn", header: "Transit gateway ARN", cell: (r) => dash(r.TransitGatewayArn) },
        { id: "state", header: "State", cell: (r) => <Status value={ob(r.State).Code} /> },
      ]}
      create={{
        title: "Register transit gateway",
        sections: [{ title: "Transit gateway", fields: [{ id: "tgw", label: "Transit gateway", type: "select", source: { model: "ec2", operation: "DescribeTransitGateways", items: (p) => (p.TransitGateways as Item[]) ?? [], value: (t) => String(t.TransitGatewayArn), label: (t) => String(t.TransitGatewayId), description: (t) => String(t.State) } }] }],
        submit: async (v) => { await callAws(M, "RegisterTransitGateway", { GlobalNetworkId: gn, TransitGatewayArn: v.tgw }); return "Transit gateway registered." },
      }}
      remove={{ label: "Deregister", run: (r) => callAws(M, "DeregisterTransitGateway", { GlobalNetworkId: gn, TransitGatewayArn: r.TransitGatewayArn }) }}
    />
  )
}

function CoreNetworkTab({ gn }: { gn: string }) {
  return (
    <SubTable
      title="Attachments"
      description="Core network attachments in this account. Listing core networks isn't available in the local emulator."
      model={M}
      operation="ListAttachments"
      input={{}}
      items={(p) => ((p.Attachments as Item[]) ?? [])}
      trackBy={(a) => String(a.AttachmentId)}
      columns={[
        { id: "id", header: "Attachment ID", cell: (a) => dash(a.AttachmentId) },
        { id: "type", header: "Type", cell: (a) => dash(a.AttachmentType) },
        { id: "core", header: "Core network", cell: (a) => dash(a.CoreNetworkId) },
        { id: "segment", header: "Segment", cell: (a) => dash(a.SegmentName) },
        { id: "edge", header: "Edge location", cell: (a) => dash(a.EdgeLocation) },
        { id: "state", header: "State", cell: (a) => <Status value={a.State} /> },
      ]}
      create={{
        title: "Create core network",
        sections: [{ title: "Core network", fields: [{ id: "description", label: "Description", optional: true }, { id: "tags", label: "Tags", type: "tags" }] }],
        submit: async (v) => { const r = await callAws<Item>(M, "CreateCoreNetwork", { GlobalNetworkId: gn, Description: sv(v.description), Tags: tagsOf(v) }); return `Core network ${ob(r.CoreNetwork).CoreNetworkId} is being created.` },
      }}
      remove={{ run: (a) => callAws(M, "DeleteAttachment", { AttachmentId: a.AttachmentId }) }}
    />
  )
}

const globalNetworks: ResourceDef = {
  ...base,
  path: "/networkmanager/global-networks",
  title: "Global networks",
  singular: "global network",
  description: "A global network is a container for your network objects, such as sites, devices, links, transit gateways, and core networks.",
  operation: "DescribeGlobalNetworks",
  items: (p) => (p.GlobalNetworks as Item[]) ?? [],
  key: (i) => String(i.GlobalNetworkId),
  display: (i) => nameTag(i) ?? String(i.GlobalNetworkId),
  columns: [col("id", "Global network ID", (i) => i.GlobalNetworkId), col("name", "Name", (i) => nameTag(i)), col("desc", "Description", (i) => i.Description), stateCol("State", "State"), dateCol("created", "Created", "CreatedAt")],
  details: [copyField("Global network ID", (i) => i.GlobalNetworkId), copyField("ARN", (i) => i.GlobalNetworkArn), textField("Description", (i) => i.Description), stateField("State", "State"), dateField("Created", "CreatedAt")],
  tabs: [
    { id: "sites", label: "Sites", render: (i) => <SitesTab gn={String(i.GlobalNetworkId)} /> },
    { id: "devices", label: "Devices", render: (i) => <DevicesTab gn={String(i.GlobalNetworkId)} /> },
    { id: "links", label: "Links", render: (i) => <LinksTab gn={String(i.GlobalNetworkId)} /> },
    { id: "tgw", label: "Transit gateways", render: (i) => <TgwTab gn={String(i.GlobalNetworkId)} /> },
    { id: "core", label: "Core network", render: (i) => <CoreNetworkTab gn={String(i.GlobalNetworkId)} /> },
    { id: "tags", label: "Tags", render: (i) => tags(i.GlobalNetworkArn) },
  ],
  create: { label: "Create global network", href: "/networkmanager/global-networks/create" },
  deleteAction: { operation: "DeleteGlobalNetwork", input: (i) => ({ GlobalNetworkId: i.GlobalNetworkId }), warning: "Delete the sites, devices, links, and transit gateway registrations first." },
}

const attachments: ResourceDef = {
  ...base,
  path: "/networkmanager/attachments",
  title: "Attachments",
  singular: "attachment",
  operation: "ListAttachments",
  items: (p) => (p.Attachments as Item[]) ?? [],
  key: (i) => String(i.AttachmentId),
  columns: [col("id", "Attachment ID", (i) => i.AttachmentId), col("type", "Type", (i) => i.AttachmentType), col("core", "Core network", (i) => i.CoreNetworkId), col("segment", "Segment", (i) => i.SegmentName), stateCol("State", "State"), col("resource", "Resource", (i) => i.ResourceArn)],
  details: [copyField("Attachment ID", (i) => i.AttachmentId), textField("Type", (i) => i.AttachmentType), textField("Core network", (i) => i.CoreNetworkId), textField("Segment", (i) => i.SegmentName), stateField("State", "State"), textField("Edge location", (i) => i.EdgeLocation), copyField("Resource ARN", (i) => i.ResourceArn)],
  actions: [
    { id: "accept", text: "Accept", enabled: (s) => s.length === 1 && s[0].State === "PENDING_ATTACHMENT_ACCEPTANCE", run: (s) => callAws(M, "AcceptAttachment", { AttachmentId: s[0].AttachmentId }) },
    { id: "reject", text: "Reject", enabled: (s) => s.length === 1 && s[0].State === "PENDING_ATTACHMENT_ACCEPTANCE", run: (s) => callAws(M, "RejectAttachment", { AttachmentId: s[0].AttachmentId }) },
  ],
  deleteAction: { operation: "DeleteAttachment", input: (i) => ({ AttachmentId: i.AttachmentId }) },
}

const peerings: ResourceDef = {
  ...base,
  path: "/networkmanager/peerings",
  title: "Peerings",
  singular: "peering",
  operation: "ListPeerings",
  items: (p) => (p.Peerings as Item[]) ?? [],
  key: (i) => String(i.PeeringId),
  columns: [col("id", "Peering ID", (i) => i.PeeringId), col("type", "Type", (i) => i.PeeringType), col("core", "Core network", (i) => i.CoreNetworkId), stateCol("State", "State"), col("edge", "Edge location", (i) => i.EdgeLocation)],
  details: [copyField("Peering ID", (i) => i.PeeringId), textField("Type", (i) => i.PeeringType), textField("Core network", (i) => i.CoreNetworkId), stateField("State", "State"), copyField("Resource ARN", (i) => i.ResourceArn)],
  deleteAction: { operation: "DeletePeering", input: (i) => ({ PeeringId: i.PeeringId }) },
}

const coreNetworks: ResourceDef = { ...base, path: "/networkmanager/core-networks", title: "Core networks", singular: "core network", operation: "ListCoreNetworks", items: (p) => (p.CoreNetworks as Item[]) ?? [], key: (i) => String(i.CoreNetworkId), columns: [col("id", "Core network ID", (i) => i.CoreNetworkId), stateCol("State", "State")], details: [] }

const createGlobalNetwork: FormSpec = {
  title: "Create global network",
  sections: [
    { title: "Global network details", fields: [nameField, { id: "description", label: "Description", optional: true }] },
    { title: "Tags", fields: [{ id: "tags", label: "Tags", type: "tags" }] },
  ],
  submit: async (v) => { await callAws(M, "CreateGlobalNetwork", { Description: sv(v.description), Tags: withName(v) }); return "Global network is being created." },
}

export const nmApp: ServiceApp = {
  id: "networkmanager",
  name: "AWS Network Manager",
  home: "/networkmanager",
  nav: [
    { type: "link", text: "Dashboard", href: "/networkmanager" },
    { type: "link", text: "Global networks", href: "/networkmanager/global-networks" },
    { type: "section", text: "Cloud WAN", items: [
      { type: "link", text: "Core networks", href: "/networkmanager/core-networks" },
      { type: "link", text: "Attachments", href: "/networkmanager/attachments" },
      { type: "link", text: "Peerings", href: "/networkmanager/peerings" },
    ] },
    { type: "section", text: "Monitoring and troubleshooting", items: [
      { type: "link", text: "Route analyzer", href: "/networkmanager/route-analyzer" },
      { type: "link", text: "Infrastructure performance", href: "/networkmanager/performance" },
    ] },
  ],
  defs: { "global-networks": globalNetworks, "core-networks": coreNetworks, attachments, peerings },
  creates: { "global-networks": createGlobalNetwork },
  unavailable: { "route-analyzer": "Route analyzer", performance: "Infrastructure performance" },
  dashboard: () => <CountDashboard app={nmApp} title="AWS Network Manager" description="Centrally manage your AWS Cloud WAN core network and your transit gateway network across AWS accounts, Regions, and on-premises locations." sections={["global-networks", "attachments", "peerings"]} />,
}

export function NetworkManagerApp({ path }: { path: string[] }) {
  return <ServiceRouter app={nmApp} path={path} />
}
