"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import ExpandableSection from "@cloudscape-design/components/expandable-section"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Grid from "@cloudscape-design/components/grid"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Modal from "@cloudscape-design/components/modal"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import TextFilter from "@cloudscape-design/components/text-filter"
import Tiles from "@cloudscape-design/components/tiles"
import Toggle from "@cloudscape-design/components/toggle"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { R53Layout } from "@/components/route53/r53-app"
import { callAws, useAws } from "@/lib/aws"

type Zone = { Id?: string; Name?: string; CallerReference?: string; Config?: { Comment?: string; PrivateZone?: boolean }; ResourceRecordSetCount?: number; LinkedService?: { ServicePrincipal?: string } }
type RecordSet = { Name?: string; Type?: string; TTL?: number; ResourceRecords?: { Value?: string }[]; AliasTarget?: { HostedZoneId?: string; DNSName?: string; EvaluateTargetHealth?: boolean }; SetIdentifier?: string; Weight?: number; Region?: string; Failover?: string; MultiValueAnswer?: boolean; HealthCheckId?: string; GeoLocation?: { ContinentCode?: string; CountryCode?: string } }

export const zoneId = (id?: string) => id?.replace("/hostedzone/", "") ?? ""
const zoneHref = (id?: string, tab?: string) => `/route53/hosted-zones/${encodeURIComponent(zoneId(id))}${tab ? `?tab=${tab}` : ""}`
const recordTypes = ["A", "AAAA", "CAA", "CNAME", "DS", "HTTPS", "MX", "NAPTR", "NS", "PTR", "SOA", "SPF", "SRV", "SSHFP", "SVCB", "TLSA", "TXT"]
const policies = [
  { value: "simple", label: "Simple routing" },
  { value: "weighted", label: "Weighted" },
  { value: "latency", label: "Latency" },
  { value: "failover", label: "Failover" },
  { value: "multivalue", label: "Multivalue answer" },
  { value: "geolocation", label: "Geolocation" },
]
const policyOf = (r: RecordSet) => (r.Weight !== undefined ? "Weighted" : r.Region ? "Latency" : r.Failover ? "Failover" : r.MultiValueAnswer ? "Multivalue answer" : r.GeoLocation ? "Geolocation" : "Simple")

export function useZones() {
  return useQuery({
    queryKey: ["emulator", "route53", "zones"],
    queryFn: async () => {
      const zones: Zone[] = []
      let marker: string | undefined
      do {
        const page = await callAws<{ HostedZones?: Zone[]; NextMarker?: string; IsTruncated?: boolean }>("route53", "ListHostedZones", { MaxItems: 100, ...(marker ? { Marker: marker } : {}) })
        zones.push(...(page.HostedZones ?? []))
        marker = page.IsTruncated ? page.NextMarker : undefined
      } while (marker)
      return zones
    },
  })
}

export function HostedZonesPage() {
  const router = useRouter()
  const follow = useFollow()
  const zones = useZones()
  const [selected, setSelected] = useState<Zone[]>([])
  const [modal, setModal] = useState<string>()
  const [comment, setComment] = useState("")
  const current = selected[0]
  return (
    <R53Layout breadcrumbs={[{ text: "Hosted zones", href: "/route53/hosted-zones" }]} contentType="table">
      <ResourceTable<Zone>
        title="Hosted zones"
        description="Automatic mode is the current search behavior optimized for best filter results."
        items={zones.data ?? []}
        loading={zones.isPending}
        loadingText="Loading hosted zones"
        error={zones.error}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="Id"
        filterPlaceholder="Filter records by property or value"
        columns={[
          { id: "name", header: "Hosted zone name", value: (z) => z.Name, cell: (z) => <Link href={zoneHref(z.Id)} onFollow={follow}>{z.Name}</Link> },
          { id: "tier", header: "Tier", value: () => "Standard", cell: () => "Standard" },
          { id: "type", header: "Type", value: (z) => (z.Config?.PrivateZone ? "Private" : "Public"), cell: (z) => (z.Config?.PrivateZone ? "Private" : "Public") },
          { id: "created", header: "Created by", value: (z) => z.LinkedService?.ServicePrincipal ?? "Route 53", cell: (z) => z.LinkedService?.ServicePrincipal ?? "Route 53" },
          { id: "count", header: "Record count", value: (z) => z.ResourceRecordSetCount ?? 0, cell: (z) => String(z.ResourceRecordSetCount ?? 0) },
          { id: "description", header: "Description", value: (z) => z.Config?.Comment, cell: (z) => z.Config?.Comment || "-" },
          { id: "id", header: "Hosted zone ID", value: (z) => zoneId(z.Id), cell: (z) => zoneId(z.Id) },
        ]}
        empty={<EmptyState title="No hosted zones" subtitle="There are no hosted zones created for this account." action={<Button href="/route53/hosted-zones/create" onFollow={follow}>Create hosted zone</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={zones.isFetching} onClick={() => void zones.refetch()} />
            <Button disabled={!current} onClick={() => current && router.push(zoneHref(current.Id))}>View details</Button>
            <Button disabled={!current} onClick={() => { setComment(current?.Config?.Comment ?? ""); setModal("edit") }}>Edit</Button>
            <Button disabled disabledReason="Hosted zone tiers aren't available in the local emulator.">Manage tier</Button>
            <Button disabled={!current} onClick={() => setModal("delete")}>Delete</Button>
            <Button variant="primary" href="/route53/hosted-zones/create" onFollow={follow}>Create hosted zone</Button>
          </SpaceBetween>
        }
      />
      <EditModal visible={modal === "edit"} title="Edit hosted zone" onDismiss={() => setModal(undefined)} success="Hosted zone updated." onSave={async () => { await callAws("route53", "UpdateHostedZoneComment", { Id: current?.Id, Comment: comment }); await zones.refetch() }}>
        <FormField label="Description - optional"><Input value={comment} onChange={({ detail }) => setComment(detail.value)} /></FormField>
      </EditModal>
      {modal === "delete" && current && <DeleteZoneModal zone={current} close={() => setModal(undefined)} onDone={() => { setSelected([]); void zones.refetch() }} />}
    </R53Layout>
  )
}

function DeleteZoneModal({ zone, close, onDone }: { zone: Zone; close: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState("")
  return (
    <EditModal visible title="Delete hosted zone" saveLabel="Delete" saveDisabled={confirm !== "delete"} onDismiss={close} success={`Hosted zone ${zone.Name} deleted.`} onSave={async () => { await callAws("route53", "DeleteHostedZone", { Id: zone.Id }); onDone() }}>
      <Alert type="warning">You can delete a hosted zone only if it contains just the default NS and SOA records. Delete other records first.</Alert>
      <FormField label={<>To confirm deletion, type <i>delete</i>.</>}><Input value={confirm} placeholder="delete" onChange={({ detail }) => setConfirm(detail.value)} /></FormField>
    </EditModal>
  )
}

export function CreateHostedZonePage() {
  const router = useRouter()
  const follow = useFollow()
  const vpcs = useAws<{ Vpcs?: { VpcId?: string }[] }>("ec2", "DescribeVpcs", {})
  const [form, setForm] = useState({ name: "", comment: "", type: "public", vpc: "", region: "ap-southeast-1" })
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const create = async () => {
    setSaving(true)
    setError(undefined)
    try {
      const r = await callAws<{ HostedZone?: Zone }>("route53", "CreateHostedZone", { Name: form.name, CallerReference: `${Date.now()}`, HostedZoneConfig: { Comment: form.comment, PrivateZone: form.type === "private" }, ...(form.type === "private" ? { VPC: { VPCId: form.vpc, VPCRegion: form.region } } : {}) })
      const valid = tags.filter((t) => t.Key)
      if (valid.length) await callAws("route53", "ChangeTagsForResource", { ResourceType: "hostedzone", ResourceId: zoneId(r.HostedZone?.Id), AddTags: valid.map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) })
      flash.success(`${form.name} was successfully created.`)
      router.push(zoneHref(r.HostedZone?.Id))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <R53Layout breadcrumbs={[{ text: "Hosted zones", href: "/route53/hosted-zones" }, { text: "Create hosted zone", href: "#" }]} contentType="form">
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>} description="A hosted zone is a container that holds information about how you want to route traffic for a domain, such as example.com, and its subdomains.">Create hosted zone</Header>}>
        <Form errorText={error} actions={<SpaceBetween direction="horizontal" size="xs"><Button variant="link" href="/route53/hosted-zones" onFollow={follow}>Cancel</Button><Button variant="primary" loading={saving} disabled={!form.name || (form.type === "private" && !form.vpc)} onClick={() => void create()}>Create hosted zone</Button></SpaceBetween>}>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Hosted zone configuration</Header>}>
              <SpaceBetween size="l">
                <FormField label="Domain name" description="This is the name of the domain that you want to route traffic for." constraintText="Valid characters: a-z, 0-9, ! &quot; # $ % & ' ( ) * + , - / : ; < = > ? @ [ \ ] ^ _ ` { | } . ~"><Input value={form.name} placeholder="example.com" onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
                <FormField label="Description - optional" description="This value lets you distinguish hosted zones that have the same name."><Input value={form.comment} placeholder="The hosted zone is used for..." onChange={({ detail }) => setForm({ ...form, comment: detail.value })} /></FormField>
                <FormField label="Type">
                  <Tiles value={form.type} onChange={({ detail }) => setForm({ ...form, type: detail.value })} items={[{ value: "public", label: "Public hosted zone", description: "A public hosted zone determines how traffic is routed on the internet." }, { value: "private", label: "Private hosted zone", description: "A private hosted zone determines how traffic is routed within an Amazon VPC." }]} />
                </FormField>
              </SpaceBetween>
            </Container>
            {form.type === "private" && (
              <Container header={<Header variant="h2" description="To use this hosted zone to resolve DNS queries for one or more VPCs, choose the VPCs.">VPCs to associate with the hosted zone</Header>}>
                <Grid gridDefinition={[{ colspan: 6 }, { colspan: 6 }]}>
                  <FormField label="Region"><Input value={form.region} onChange={({ detail }) => setForm({ ...form, region: detail.value })} /></FormField>
                  <FormField label="VPC ID"><Select selectedOption={form.vpc ? { value: form.vpc, label: form.vpc } : null} placeholder="Choose VPC" onChange={({ detail }) => setForm({ ...form, vpc: detail.selectedOption.value ?? "" })} options={(vpcs.data?.Vpcs ?? []).map((v) => ({ value: v.VpcId ?? "", label: v.VpcId }))} /></FormField>
                </Grid>
              </Container>
            )}
            <Container header={<Header variant="h2" description="Apply tags to hosted zones to help organize and identify them.">Tags</Header>}><TagEditor tags={tags} onChange={setTags} /></Container>
          </SpaceBetween>
        </Form>
      </ContentLayout>
    </R53Layout>
  )
}

type RecordForm = { name: string; type: string; value: string; ttl: string; policy: string; setId: string; weight: string; region: string; failover: string; alias: boolean; aliasTarget: string; aliasZone: string; health: string }
const blankRecord: RecordForm = { name: "", type: "A", value: "", ttl: "300", policy: "simple", setId: "", weight: "10", region: "ap-southeast-7", failover: "PRIMARY", alias: false, aliasTarget: "", aliasZone: "", health: "" }

function toForm(r: RecordSet, zone: string): RecordForm {
  const sub = (r.Name ?? "").replace(/\\052/g, "*").replace(new RegExp(`\\.?${zone.replace(/\./g, "\\.")}$`), "")
  return {
    ...blankRecord,
    name: sub,
    type: r.Type ?? "A",
    value: (r.ResourceRecords ?? []).map((v) => v.Value).join("\n"),
    ttl: String(r.TTL ?? 300),
    policy: r.Weight !== undefined ? "weighted" : r.Region ? "latency" : r.Failover ? "failover" : r.MultiValueAnswer ? "multivalue" : "simple",
    setId: r.SetIdentifier ?? "",
    weight: String(r.Weight ?? 10),
    region: r.Region ?? "ap-southeast-7",
    failover: r.Failover ?? "PRIMARY",
    alias: Boolean(r.AliasTarget),
    aliasTarget: r.AliasTarget?.DNSName ?? "",
    aliasZone: r.AliasTarget?.HostedZoneId ?? "",
    health: r.HealthCheckId ?? "",
  }
}

function toRecordSet(f: RecordForm, zone: string): RecordSet {
  return {
    Name: f.name ? `${f.name}.${zone}` : zone,
    Type: f.type,
    ...(f.alias ? { AliasTarget: { DNSName: f.aliasTarget, HostedZoneId: f.aliasZone, EvaluateTargetHealth: false } } : { TTL: Number(f.ttl), ResourceRecords: f.value.split("\n").map((v) => v.trim()).filter(Boolean).map((Value) => ({ Value })) }),
    ...(f.policy !== "simple" ? { SetIdentifier: f.setId } : {}),
    ...(f.policy === "weighted" ? { Weight: Number(f.weight) } : {}),
    ...(f.policy === "latency" ? { Region: f.region } : {}),
    ...(f.policy === "failover" ? { Failover: f.failover } : {}),
    ...(f.policy === "multivalue" ? { MultiValueAnswer: true } : {}),
    ...(f.health ? { HealthCheckId: f.health } : {}),
  }
}

export function HostedZoneDetailPage({ id, tab }: { id: string; tab: string }) {
  const router = useRouter()
  const zone = useAws<{ HostedZone?: Zone; DelegationSet?: { NameServers?: string[] }; VPCs?: { VPCId?: string; VPCRegion?: string }[] }>("route53", "GetHostedZone", { Id: id })
  const records = useQuery({
    queryKey: ["emulator", "route53", "records", id],
    queryFn: async () => {
      const all: RecordSet[] = []
      let next: { StartRecordName?: string; StartRecordType?: string; StartRecordIdentifier?: string } = {}
      do {
        const page = await callAws<{ ResourceRecordSets?: RecordSet[]; IsTruncated?: boolean; NextRecordName?: string; NextRecordType?: string; NextRecordIdentifier?: string }>("route53", "ListResourceRecordSets", { HostedZoneId: id, MaxItems: 300, ...next })
        all.push(...(page.ResourceRecordSets ?? []))
        next = page.IsTruncated ? { StartRecordName: page.NextRecordName, StartRecordType: page.NextRecordType, StartRecordIdentifier: page.NextRecordIdentifier } : {}
      } while (next.StartRecordName)
      return all
    },
  })
  const dnssec = useAws<{ Status?: { ServeSignature?: string; StatusMessage?: string }; KeySigningKeys?: { Name?: string; Status?: string }[] }>("route53", "GetDNSSEC", { HostedZoneId: id }, { retry: false })
  const healthChecks = useAws<{ HealthChecks?: { Id?: string; HealthCheckConfig?: { FullyQualifiedDomainName?: string; IPAddress?: string } }[] }>("route53", "ListHealthChecks", {})
  const [selected, setSelected] = useState<RecordSet[]>([])
  const [filter, setFilter] = useState("")
  const [form, setForm] = useState<RecordForm>()
  const [editing, setEditing] = useState<RecordSet>()
  const [modal, setModal] = useState<string>()
  const [test, setTest] = useState({ name: "", type: "A" })
  const [testResult, setTestResult] = useState<{ RecordData?: string[]; ResponseCode?: string; Protocol?: string }>()
  const z = zone.data?.HostedZone
  const name = z?.Name ?? ""
  const items = (records.data ?? []).filter((r) => !filter || `${r.Name} ${r.Type} ${(r.ResourceRecords ?? []).map((v) => v.Value).join(" ")}`.toLowerCase().includes(filter.toLowerCase()))
  const isDefault = (r: RecordSet) => (r.Type === "NS" || r.Type === "SOA") && r.Name === name
  const change = async (changes: { Action: string; ResourceRecordSet: RecordSet }[]) => {
    await callAws("route53", "ChangeResourceRecordSets", { HostedZoneId: id, ChangeBatch: { Changes: changes } })
    await records.refetch()
    void zone.refetch()
  }
  return (
    <R53Layout breadcrumbs={[{ text: "Hosted zones", href: "/route53/hosted-zones" }, { text: name || id, href: zoneHref(id) }]}>
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>} actions={<SpaceBetween direction="horizontal" size="xs"><Button onClick={() => setModal("delete")}>Delete zone</Button><Button onClick={() => { setTest({ name: "", type: "A" }); setTestResult(undefined); setModal("test") }}>Test record</Button><Button disabled disabledReason="Query logging needs a CloudWatch Logs resource policy; configure it from VPC Resolver > Query logging.">Configure query logging</Button></SpaceBetween>}>{name || id}</Header>}>
        <SpaceBetween size="l">
          {zone.error && <Alert type="error">{errorMessage(zone.error)}</Alert>}
          <ExpandableSection variant="container" headerText="Hosted zone details" defaultExpanded={false}>
            <KeyValuePairs
              columns={3}
              items={[
                { label: "Hosted zone name", value: name },
                { label: "Hosted zone ID", value: <Copyable value={id} /> },
                { label: "Description", value: z?.Config?.Comment || "-" },
                { label: "Type", value: z?.Config?.PrivateZone ? "Private hosted zone" : "Public hosted zone" },
                { label: "Record count", value: String(z?.ResourceRecordSetCount ?? 0) },
                { label: "Name servers", value: zone.data?.DelegationSet?.NameServers?.map((n) => <div key={n}>{n}</div>) ?? "-" },
                ...(z?.Config?.PrivateZone ? [{ label: "VPCs", value: zone.data?.VPCs?.map((v) => `${v.VPCId} (${v.VPCRegion})`).join(", ") ?? "-" }] : []),
              ]}
            />
          </ExpandableSection>
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => router.replace(zoneHref(id, detail.activeTabId))}
            tabs={[
              {
                id: "records",
                label: `Records (${records.data?.length ?? 0})`,
                content: (
                  <Table<RecordSet>
                    header={
                      <Header
                        variant="h2"
                        counter={`(${records.data?.length ?? 0})`}
                        description="Automatic mode is the current search behavior optimized for best filter results."
                        actions={
                          <SpaceBetween direction="horizontal" size="xs">
                            <Button iconName="refresh" ariaLabel="Refresh" loading={records.isFetching} onClick={() => void records.refetch()} />
                            <Button disabled={selected.length === 0 || selected.some(isDefault)} onClick={() => setModal("delete-records")}>Delete record</Button>
                            <Button disabled={selected.length !== 1} onClick={() => { setEditing(selected[0]); setForm(toForm(selected[0], name)) }}>Edit record</Button>
                            <Button disabled>Import zone file</Button>
                            <Button variant="primary" onClick={() => { setEditing(undefined); setForm({ ...blankRecord }) }}>Create record</Button>
                          </SpaceBetween>
                        }
                      >
                        Records
                      </Header>
                    }
                    loading={records.isPending}
                    loadingText="Loading records"
                    items={items}
                    selectionType="multi"
                    selectedItems={selected}
                    onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
                    trackBy={(r) => `${r.Name}|${r.Type}|${r.SetIdentifier ?? ""}`}
                    filter={<TextFilter filteringText={filter} filteringPlaceholder="Filter records by property or value" onChange={({ detail }) => setFilter(detail.filteringText)} />}
                    wrapLines
                    columnDefinitions={[
                      { id: "name", header: "Record name", cell: (r) => r.Name?.replace(/\\052/g, "*") },
                      { id: "type", header: "Type", cell: (r) => r.Type },
                      { id: "policy", header: "Routing policy", cell: (r) => policyOf(r) },
                      { id: "diff", header: "Differentiator", cell: (r) => (r.Weight !== undefined ? String(r.Weight) : r.Region ?? r.Failover ?? "-") },
                      { id: "alias", header: "Alias", cell: (r) => (r.AliasTarget ? "Yes" : "No") },
                      { id: "value", header: "Value/Route traffic to", cell: (r) => (r.AliasTarget ? r.AliasTarget.DNSName : (r.ResourceRecords ?? []).map((v) => <div key={v.Value}>{v.Value}</div>)) },
                      { id: "ttl", header: "TTL (seconds)", cell: (r) => r.TTL ?? "-" },
                      { id: "health", header: "Health check ID", cell: (r) => r.HealthCheckId ?? "-" },
                      { id: "setid", header: "Record ID", cell: (r) => r.SetIdentifier ?? "-" },
                    ]}
                    empty={<Box textAlign="center" color="inherit"><b>No records</b></Box>}
                  />
                ),
              },
              { id: "accelerated", label: "Accelerated recovery", content: <Alert type="info">Accelerated recovery isn&apos;t available in the local emulator.</Alert> },
              {
                id: "dnssec",
                label: "DNSSEC signing",
                content: (
                  <Container header={<Header variant="h2" actions={dnssec.data?.Status?.ServeSignature === "SIGNING" ? <Button onClick={async () => { await callAws("route53", "DisableHostedZoneDNSSEC", { HostedZoneId: id }).then(() => { flash.success("DNSSEC signing disabled."); void dnssec.refetch() }, (e) => flash.error(errorMessage(e))) }}>Disable DNSSEC signing</Button> : <Button disabled disabledReason="Enabling DNSSEC needs an asymmetric KMS key in us-east-1.">Enable DNSSEC signing</Button>}>DNSSEC signing</Header>}>
                    <KeyValuePairs columns={2} items={[{ label: "DNSSEC signing status", value: dnssec.data?.Status?.ServeSignature === "SIGNING" ? <StatusIndicator type="success">Signing</StatusIndicator> : <StatusIndicator type="stopped">Not signing</StatusIndicator> }, { label: "Key-signing keys", value: String(dnssec.data?.KeySigningKeys?.length ?? 0) }]} />
                  </Container>
                ),
              },
              { id: "tags", label: "Hosted zone tags", content: <ZoneTags id={id} /> },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      <EditModal
        visible={Boolean(form)}
        size="large"
        title={editing ? "Edit record" : "Create record"}
        saveLabel={editing ? "Save" : "Create records"}
        onDismiss={() => setForm(undefined)}
        success={editing ? "Record updated successfully." : `Record for ${name} was successfully created.`}
        onSave={async () => {
          if (!form) return
          const next = toRecordSet(form, name)
          const changes = editing && (editing.Name !== next.Name || editing.Type !== next.Type || editing.SetIdentifier !== next.SetIdentifier) ? [{ Action: "DELETE", ResourceRecordSet: editing }, { Action: "CREATE", ResourceRecordSet: next }] : [{ Action: editing ? "UPSERT" : "CREATE", ResourceRecordSet: next }]
          await change(changes)
          setSelected([])
        }}
      >
        {form && (
          <SpaceBetween size="l">
            <Grid gridDefinition={[{ colspan: 8 }, { colspan: 4 }]}>
              <FormField label="Record name" description="To route traffic to a subdomain, enter the subdomain name." constraintText="Keep blank to create a record for the root domain."><Input value={form.name} placeholder="subdomain" onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
              <FormField label="Record type"><Select selectedOption={{ value: form.type, label: form.type }} onChange={({ detail }) => setForm({ ...form, type: detail.selectedOption.value ?? "A" })} options={recordTypes.map((t) => ({ value: t, label: t }))} /></FormField>
            </Grid>
            <Box fontSize="body-s" color="text-body-secondary">{form.name ? `${form.name}.${name}` : name}</Box>
            <Toggle checked={form.alias} onChange={({ detail }) => setForm({ ...form, alias: detail.checked })}>Alias</Toggle>
            {form.alias ? (
              <Grid gridDefinition={[{ colspan: 8 }, { colspan: 4 }]}>
                <FormField label="Route traffic to (DNS name)"><Input value={form.aliasTarget} placeholder="dualstack.my-lb.ap-southeast-7.elb.amazonaws.com" onChange={({ detail }) => setForm({ ...form, aliasTarget: detail.value })} /></FormField>
                <FormField label="Target hosted zone ID"><Input value={form.aliasZone} onChange={({ detail }) => setForm({ ...form, aliasZone: detail.value })} /></FormField>
              </Grid>
            ) : (
              <>
                <FormField label="Value" description="Enter multiple values on separate lines." stretch><Textarea value={form.value} rows={4} placeholder="192.0.2.235" onChange={({ detail }) => setForm({ ...form, value: detail.value })} /></FormField>
                <FormField label="TTL (seconds)" description="Recommended values: 60 to 172800 (two days)"><Input type="number" value={form.ttl} onChange={({ detail }) => setForm({ ...form, ttl: detail.value })} /></FormField>
              </>
            )}
            <FormField label="Routing policy"><Select selectedOption={policies.find((p) => p.value === form.policy) ?? null} onChange={({ detail }) => setForm({ ...form, policy: detail.selectedOption.value ?? "simple" })} options={policies.filter((p) => p.value !== "geolocation")} /></FormField>
            {form.policy !== "simple" && <FormField label="Record ID" description="Enter a value that uniquely identifies this record among records that have the same name and type."><Input value={form.setId} onChange={({ detail }) => setForm({ ...form, setId: detail.value })} /></FormField>}
            {form.policy === "weighted" && <FormField label="Weight" constraintText="0 to 255"><Input type="number" value={form.weight} onChange={({ detail }) => setForm({ ...form, weight: detail.value })} /></FormField>}
            {form.policy === "latency" && <FormField label="Region"><Input value={form.region} onChange={({ detail }) => setForm({ ...form, region: detail.value })} /></FormField>}
            {form.policy === "failover" && <FormField label="Failover record type"><Select selectedOption={{ value: form.failover, label: form.failover === "PRIMARY" ? "Primary" : "Secondary" }} onChange={({ detail }) => setForm({ ...form, failover: detail.selectedOption.value ?? "PRIMARY" })} options={[{ value: "PRIMARY", label: "Primary" }, { value: "SECONDARY", label: "Secondary" }]} /></FormField>}
            {form.policy !== "simple" && <FormField label="Health check - optional"><Select selectedOption={form.health ? { value: form.health, label: form.health } : null} placeholder="Choose health check" onChange={({ detail }) => setForm({ ...form, health: detail.selectedOption.value ?? "" })} options={[{ value: "", label: "None" }, ...(healthChecks.data?.HealthChecks ?? []).map((h) => ({ value: h.Id ?? "", label: h.Id, description: h.HealthCheckConfig?.FullyQualifiedDomainName ?? h.HealthCheckConfig?.IPAddress }))]} /></FormField>}
          </SpaceBetween>
        )}
      </EditModal>
      <EditModal visible={modal === "delete-records"} title="Delete records" saveLabel="Delete" onDismiss={() => setModal(undefined)} success={`${selected.length} record(s) deleted.`} onSave={async () => { await change(selected.map((r) => ({ Action: "DELETE", ResourceRecordSet: r }))); setSelected([]) }}>
        <Box>Delete {selected.length} record(s)? Route 53 stops responding to DNS queries for them.</Box>
      </EditModal>
      <Modal
        visible={modal === "test"}
        header="Test record"
        onDismiss={() => setModal(undefined)}
        footer={<Box float="right"><SpaceBetween direction="horizontal" size="xs"><Button variant="link" onClick={() => setModal(undefined)}>Close</Button><Button variant="primary" onClick={async () => { await callAws<{ RecordData?: string[]; ResponseCode?: string; Protocol?: string }>("route53", "TestDNSAnswer", { HostedZoneId: id, RecordName: test.name ? `${test.name}.${name}` : name, RecordType: test.type }).then(setTestResult, (e) => flash.error(errorMessage(e))) }}>Get response</Button></SpaceBetween></Box>}
      >
        <SpaceBetween size="m">
          <Grid gridDefinition={[{ colspan: 8 }, { colspan: 4 }]}>
            <FormField label="Record name"><Input value={test.name} placeholder="subdomain" onChange={({ detail }) => setTest({ ...test, name: detail.value })} /></FormField>
            <FormField label="Type"><Select selectedOption={{ value: test.type, label: test.type }} onChange={({ detail }) => setTest({ ...test, type: detail.selectedOption.value ?? "A" })} options={recordTypes.map((t) => ({ value: t, label: t }))} /></FormField>
          </Grid>
          {testResult && <KeyValuePairs columns={3} items={[{ label: "DNS response code", value: testResult.ResponseCode }, { label: "Protocol", value: testResult.Protocol }, { label: "Response returned by Route 53", value: testResult.RecordData?.join(", ") || "-" }]} />}
        </SpaceBetween>
      </Modal>
      {modal === "delete" && z && <DeleteZoneModal zone={z} close={() => setModal(undefined)} onDone={() => router.push("/route53/hosted-zones")} />}
    </R53Layout>
  )
}

function ZoneTags({ id }: { id: string }) {
  const tags = useAws<{ ResourceTagSet?: { Tags?: Tag[] } }>("route53", "ListTagsForResource", { ResourceType: "hostedzone", ResourceId: id })
  const list = tags.data?.ResourceTagSet?.Tags ?? []
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Tag[]>([])
  return (
    <>
      <Table header={<Header variant="h2" counter={`(${list.length})`} actions={<Button onClick={() => { setEdit(list); setOpen(true) }}>Manage tags</Button>}>Tags</Header>} items={list} columnDefinitions={[{ id: "k", header: "Key", cell: (t) => t.Key }, { id: "v", header: "Value", cell: (t) => t.Value || "–" }]} empty={<Box textAlign="center" color="inherit">No tags</Box>} />
      <EditModal visible={open} size="large" title="Manage tags" onDismiss={() => setOpen(false)} success="Tags updated." onSave={async () => { const after = edit.filter((t) => t.Key); const removed = list.filter((t) => !after.some((a) => a.Key === t.Key)).map((t) => t.Key); await callAws("route53", "ChangeTagsForResource", { ResourceType: "hostedzone", ResourceId: id, ...(after.length ? { AddTags: after.map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) } : {}), ...(removed.length ? { RemoveTagKeys: removed } : {}) }); await tags.refetch() }}>
        <TagEditor tags={edit} onChange={setEdit} />
      </EditModal>
    </>
  )
}
