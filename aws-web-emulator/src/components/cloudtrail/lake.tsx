"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, Section } from "@/components/console/sections"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { CtLayout } from "@/components/cloudtrail/ct-app"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type Store = { EventDataStoreArn?: string; Name?: string; Status?: string; RetentionPeriod?: number; MultiRegionEnabled?: boolean; OrganizationEnabled?: boolean; TerminationProtectionEnabled?: boolean; CreatedTimestamp?: string; UpdatedTimestamp?: string; BillingMode?: string; AdvancedEventSelectors?: { Name?: string }[] }

const storeHref = (arn?: string) => `/cloudtrail/event-data-stores/${encodeURIComponent(arn ?? "")}`
const storeId = (arn?: string) => arn?.split("/").pop() ?? ""

function StoreStatus({ value }: { value?: string }) {
  return <StatusIndicator type={value === "ENABLED" ? "success" : value === "PENDING_DELETION" ? "stopped" : value?.includes("STOPP") ? "stopped" : "in-progress"}>{value?.charAt(0)}{value?.slice(1).toLowerCase().replace(/_/g, " ")}</StatusIndicator>
}

export function EventDataStoresPage() {
  const follow = useFollow()
  const stores = useAws<{ EventDataStores?: Store[] }>("cloudtrail", "ListEventDataStores", {})
  return (
    <CtLayout breadcrumbs={[{ text: "Lake", href: "/cloudtrail/event-data-stores" }, { text: "Event data stores", href: "/cloudtrail/event-data-stores" }]} contentType="table">
      <SpaceBetween size="m">
        <Alert type="info">AWS CloudTrail Lake will no longer be open to new customers starting on May 31, 2026. For similar capabilities, explore Amazon CloudWatch.</Alert>
        <ResourceTable<Store>
          title="Event data stores"
          items={stores.data?.EventDataStores ?? []}
          loading={stores.isPending}
          loadingText="Loading event data stores"
          error={stores.error}
          trackBy="EventDataStoreArn"
          filterPlaceholder="Filter event data stores"
          columns={[
            { id: "name", header: "Name", value: (s) => s.Name, cell: (s) => <Link href={storeHref(s.EventDataStoreArn)} onFollow={follow}>{s.Name}</Link> },
            { id: "status", header: "Status", value: (s) => s.Status, cell: (s) => <StoreStatus value={s.Status} /> },
            { id: "retention", header: "Retention period", value: (s) => s.RetentionPeriod, cell: (s) => `${s.RetentionPeriod ?? "–"} days` },
            { id: "multi", header: "Multi-region", value: (s) => String(s.MultiRegionEnabled), cell: (s) => (s.MultiRegionEnabled ? "Yes" : "No") },
            { id: "protection", header: "Termination protection", value: (s) => String(s.TerminationProtectionEnabled), cell: (s) => (s.TerminationProtectionEnabled ? "Enabled" : "Disabled") },
            { id: "created", header: "Creation time", value: (s) => s.CreatedTimestamp, cell: (s) => consoleDate(s.CreatedTimestamp) },
          ]}
          empty={<EmptyState title="No event data stores" subtitle="Create an event data store to run SQL queries on your events." action={<Button href="/cloudtrail/event-data-stores/create" onFollow={follow}>Create event data store</Button>} />}
          actions={<SpaceBetween direction="horizontal" size="xs"><Button iconName="refresh" ariaLabel="Refresh" onClick={() => void stores.refetch()} /><Button variant="primary" href="/cloudtrail/event-data-stores/create" onFollow={follow}>Create event data store</Button></SpaceBetween>}
        />
      </SpaceBetween>
    </CtLayout>
  )
}

export function CreateEventDataStorePage() {
  const router = useRouter()
  const follow = useFollow()
  const [form, setForm] = useState({ name: "", retention: "366", billing: "EXTENDABLE_RETENTION_PRICING", protection: true, multi: true, management: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const create = async () => {
    setSaving(true)
    setError(undefined)
    try {
      const r = await callAws<{ EventDataStoreArn?: string }>("cloudtrail", "CreateEventDataStore", {
        Name: form.name,
        RetentionPeriod: Number(form.retention),
        BillingMode: form.billing,
        TerminationProtectionEnabled: form.protection,
        MultiRegionEnabled: form.multi,
        AdvancedEventSelectors: [{ Name: "Management events selector", FieldSelectors: [{ Field: "eventCategory", Equals: ["Management"] }] }],
      })
      flash.success(`Event data store ${form.name} created.`)
      router.push(storeHref(r.EventDataStoreArn))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <CtLayout breadcrumbs={[{ text: "Event data stores", href: "/cloudtrail/event-data-stores" }, { text: "Create", href: "#" }]} contentType="form">
      <ContentLayout header={<Header variant="h1">Create event data store</Header>}>
        <Form errorText={error} actions={<SpaceBetween direction="horizontal" size="xs"><Button variant="link" href="/cloudtrail/event-data-stores" onFollow={follow}>Cancel</Button><Button variant="primary" loading={saving} disabled={!form.name} onClick={() => void create()}>Create event data store</Button></SpaceBetween>}>
          <Container header={<Header variant="h2">General details</Header>}>
            <SpaceBetween size="l">
              <FormField label="Event data store name" constraintText="3-128 characters. Letters, numbers, periods, underscores, and dashes."><Input value={form.name} onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
              <FormField label="Pricing option"><Select selectedOption={{ value: form.billing, label: form.billing === "FIXED_RETENTION_PRICING" ? "Seven-year retention pricing" : "One-year extendable retention pricing" }} onChange={({ detail }) => setForm({ ...form, billing: detail.selectedOption.value ?? "EXTENDABLE_RETENTION_PRICING", retention: detail.selectedOption.value === "FIXED_RETENTION_PRICING" ? "2557" : "366" })} options={[{ value: "EXTENDABLE_RETENTION_PRICING", label: "One-year extendable retention pricing" }, { value: "FIXED_RETENTION_PRICING", label: "Seven-year retention pricing" }]} /></FormField>
              <FormField label="Retention period (days)" constraintText="Between 7 and 3653 days."><Input type="number" value={form.retention} onChange={({ detail }) => setForm({ ...form, retention: detail.value })} /></FormField>
              <Checkbox checked={form.protection} onChange={({ detail }) => setForm({ ...form, protection: detail.checked })}>Enable termination protection</Checkbox>
              <Checkbox checked={form.multi} onChange={({ detail }) => setForm({ ...form, multi: detail.checked })}>Include all AWS Regions</Checkbox>
              <Checkbox checked={form.management} disabled>CloudTrail management events</Checkbox>
            </SpaceBetween>
          </Container>
        </Form>
      </ContentLayout>
    </CtLayout>
  )
}

export function EventDataStoreDetailPage({ arn }: { arn: string }) {
  const router = useRouter()
  const follow = useFollow()
  const store = useAws<Store>("cloudtrail", "GetEventDataStore", { EventDataStore: arn })
  const s = store.data
  const [modal, setModal] = useState<string>()
  const action = async (op: string, input: Record<string, unknown>, message: string) => {
    await callAws("cloudtrail", op, input).then(() => { flash.success(message); void store.refetch() }, (e) => flash.error(errorMessage(e)))
  }
  return (
    <CtLayout breadcrumbs={[{ text: "Event data stores", href: "/cloudtrail/event-data-stores" }, { text: s?.Name ?? storeId(arn), href: "#" }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => void action("UpdateEventDataStore", { EventDataStore: arn, TerminationProtectionEnabled: !s?.TerminationProtectionEnabled }, "Termination protection updated.")}>{s?.TerminationProtectionEnabled ? "Disable termination protection" : "Enable termination protection"}</Button>
                <Button onClick={() => void action(s?.Status === "ENABLED" ? "StopEventDataStoreIngestion" : "StartEventDataStoreIngestion", { EventDataStore: arn }, "Ingestion updated.")}>{s?.Status === "ENABLED" ? "Stop ingestion" : "Start ingestion"}</Button>
                <Button disabled={s?.TerminationProtectionEnabled} disabledReason="Disable termination protection first." onClick={() => setModal("delete")}>Delete</Button>
                <Button variant="primary" href={`/cloudtrail/query/${encodeURIComponent(arn)}`} onFollow={follow}>Query</Button>
              </SpaceBetween>
            }
          >
            {s?.Name ?? storeId(arn)}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {store.error && <Alert type="error">{errorMessage(store.error)}</Alert>}
          <Section
            title="General details"
            columns={3}
            items={[
              { label: "Status", value: <StoreStatus value={s?.Status} /> },
              { label: "Retention period", value: `${s?.RetentionPeriod ?? "–"} days` },
              { label: "Pricing option", value: s?.BillingMode === "FIXED_RETENTION_PRICING" ? "Seven-year retention pricing" : "One-year extendable retention pricing" },
              { label: "Multi-region", value: s?.MultiRegionEnabled ? "Yes" : "No" },
              { label: "Termination protection", value: s?.TerminationProtectionEnabled ? "Enabled" : "Disabled" },
              { label: "Created", value: consoleDate(s?.CreatedTimestamp) },
              { label: "ARN", value: <Copyable value={arn} /> },
              { label: "Event data store ID", value: storeId(arn) },
            ]}
          />
          <Table header={<Header variant="h2">Event selectors</Header>} items={s?.AdvancedEventSelectors ?? []} columnDefinitions={[{ id: "n", header: "Name", cell: (x) => x.Name ?? "–" }]} empty={<Box textAlign="center">No selectors</Box>} />
        </SpaceBetween>
      </ContentLayout>
      <EditModal visible={modal === "delete"} title={`Delete ${s?.Name}?`} saveLabel="Delete" onDismiss={() => setModal(undefined)} success="Event data store scheduled for deletion." onSave={async () => { await callAws("cloudtrail", "DeleteEventDataStore", { EventDataStore: arn }); router.push("/cloudtrail/event-data-stores") }}>
        <Box>The event data store enters a 7-day pending deletion period.</Box>
      </EditModal>
    </CtLayout>
  )
}

type QueryRow = Record<string, string>[]

export function LakeQueryPage({ store: initialStore }: { store?: string; queryId?: string }) {
  const stores = useAws<{ EventDataStores?: Store[] }>("cloudtrail", "ListEventDataStores", {})
  const [store, setStore] = useState(initialStore ?? "")
  const id = storeId(store)
  const [sql, setSql] = useState("")
  const [since] = useState(() => new Date(new Date().getTime() - 86_400_000).toISOString().replace("T", " ").slice(0, 19))
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ status?: string; rows?: QueryRow[]; stats?: { ResultsCount?: number; EventsScanned?: number; BytesScanned?: number }; error?: string }>()
  const queries = useAws<{ Queries?: { QueryId?: string; QueryStatus?: string; CreationTime?: string }[] }>("cloudtrail", "ListQueries", { EventDataStore: store }, { enabled: Boolean(store) })
  const template = `SELECT eventName, eventSource, eventTime, userIdentity.arn FROM ${id || "<event-data-store-id>"} WHERE eventTime > '${since}' ORDER BY eventTime DESC LIMIT 50`
  const run = async () => {
    setRunning(true)
    setResult(undefined)
    try {
      const start = await callAws<{ QueryId?: string }>("cloudtrail", "StartQuery", { QueryStatement: sql || template })
      for (let i = 0; i < 60; i++) {
        const r = await callAws<{ QueryStatus?: string; QueryResultRows?: QueryRow[]; QueryStatistics?: { ResultsCount?: number; EventsScanned?: number; BytesScanned?: number }; ErrorMessage?: string }>("cloudtrail", "GetQueryResults", { QueryId: start.QueryId, ...(store ? { EventDataStore: store } : {}) })
        setResult({ status: r.QueryStatus, rows: r.QueryResultRows, stats: r.QueryStatistics, error: r.ErrorMessage })
        if (r.QueryStatus !== "QUEUED" && r.QueryStatus !== "RUNNING") break
        await new Promise((res) => setTimeout(res, 1000))
      }
      void queries.refetch()
    } catch (e) {
      setResult({ error: errorMessage(e) })
    } finally {
      setRunning(false)
    }
  }
  const rows = (result?.rows ?? []).map((row) => Object.assign({}, ...row) as Record<string, string>)
  const columns = rows[0] ? Object.keys(rows[0]) : []
  return (
    <CtLayout breadcrumbs={[{ text: "Lake", href: "/cloudtrail/event-data-stores" }, { text: "Query", href: "/cloudtrail/query" }]}>
      <ContentLayout header={<Header variant="h1" description="Run SQL queries on events in your event data stores.">Query</Header>}>
        <Tabs
          tabs={[
            {
              id: "editor",
              label: "Editor",
              content: (
                <SpaceBetween size="l">
                  <Container>
                    <SpaceBetween size="m">
                      <FormField label="Event data store"><Select selectedOption={store ? { value: store, label: stores.data?.EventDataStores?.find((s) => s.EventDataStoreArn === store)?.Name ?? id } : null} placeholder="Choose an event data store" empty="No event data stores" onChange={({ detail }) => setStore(detail.selectedOption.value ?? "")} options={(stores.data?.EventDataStores ?? []).map((s) => ({ value: s.EventDataStoreArn ?? "", label: s.Name, description: storeId(s.EventDataStoreArn) }))} /></FormField>
                      <Textarea value={sql} placeholder={template} rows={8} spellcheck={false} onChange={({ detail }) => setSql(detail.value)} />
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button variant="primary" loading={running} disabled={!store} onClick={() => void run()}>Run</Button>
                        <Button onClick={() => setSql(template)}>Use sample query</Button>
                      </SpaceBetween>
                    </SpaceBetween>
                  </Container>
                  {result?.error && <Alert type="error">{result.error}</Alert>}
                  {result && !result.error && (
                    <Table
                      header={<Header variant="h2" counter={`(${rows.length})`} description={result.stats ? `${result.stats.EventsScanned ?? 0} events scanned · status ${result.status}` : `Status ${result.status}`}>Query results</Header>}
                      items={rows}
                      resizableColumns
                      wrapLines
                      columnDefinitions={columns.map((c) => ({ id: c, header: c, cell: (r: Record<string, string>) => r[c] }))}
                      empty={<Box textAlign="center" color="inherit">No results</Box>}
                    />
                  )}
                </SpaceBetween>
              ),
            },
            {
              id: "results",
              label: "Command output",
              content: (
                <Table
                  header={<Header variant="h2" counter={`(${queries.data?.Queries?.length ?? 0})`}>Query results history</Header>}
                  items={queries.data?.Queries ?? []}
                  columnDefinitions={[{ id: "id", header: "Query ID", cell: (q) => q.QueryId }, { id: "status", header: "Status", cell: (q) => q.QueryStatus }, { id: "created", header: "Created", cell: (q) => consoleDate(q.CreationTime) }]}
                  empty={<Box textAlign="center" color="inherit">{store ? "No queries" : "Choose an event data store"}</Box>}
                />
              ),
            },
          ]}
        />
      </ContentLayout>
    </CtLayout>
  )
}

