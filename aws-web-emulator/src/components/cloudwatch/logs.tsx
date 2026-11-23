"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Grid from "@cloudscape-design/components/grid"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Multiselect from "@cloudscape-design/components/multiselect"
import SegmentedControl from "@cloudscape-design/components/segmented-control"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import TextFilter from "@cloudscape-design/components/text-filter"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, Section } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { CwLayout } from "@/components/cloudwatch/cw-app"
import { callAws, listAll, useAws } from "@/lib/aws"
import { consoleBytes, consoleDate } from "@/lib/format"

type LogGroup = { logGroupName?: string; creationTime?: number; retentionInDays?: number; metricFilterCount?: number; arn?: string; logGroupArn?: string; storedBytes?: number; kmsKeyId?: string; logGroupClass?: string; dataProtectionStatus?: string }
type LogStream = { logStreamName?: string; creationTime?: number; firstEventTimestamp?: number; lastEventTimestamp?: number; lastIngestionTime?: number; storedBytes?: number; arn?: string }
type LogEvent = { timestamp?: number; message?: string; ingestionTime?: number; logStreamName?: string; eventId?: string }

const retentions = [0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653]
const retentionLabel = (days?: number) => (!days ? "Never expire" : days < 30 ? `${days} day${days === 1 ? "" : "s"}` : days < 365 ? `${Math.round(days / 30)} month${days >= 60 ? "s" : ""}` : `${Math.round(days / 365)} year${days >= 730 ? "s" : ""}`)
const retentionOptions = retentions.map((d) => ({ value: String(d), label: retentionLabel(d) }))
const time = (ms?: number) => (ms ? new Date(ms).toISOString().replace("T", " ").replace("Z", "") : "–")
export const groupHref = (name?: string, tab?: string) => `/cloudwatch/log-groups/${encodeURIComponent(name ?? "")}${tab ? `?tab=${tab}` : ""}`

export function useLogGroups() {
  return useQuery({
    queryKey: ["emulator", "logs", "groups"],
    queryFn: () => listAll<LogGroup>("cloudwatchlogs", "DescribeLogGroups", { limit: 50 }, (page) => page.logGroups as LogGroup[], { input: "nextToken", output: "nextToken" }, 2000),
  })
}

export function LogGroupsPage() {
  const router = useRouter()
  const follow = useFollow()
  const groups = useLogGroups()
  const [selected, setSelected] = useState<LogGroup[]>([])
  const [modal, setModal] = useState<string>()
  const [form, setForm] = useState({ name: "", retention: "0", logClass: "STANDARD", kms: "" })
  const [retention, setRetention] = useState("0")
  const refresh = () => void groups.refetch()
  return (
    <CwLayout breadcrumbs={[{ text: "Log Management", href: "/cloudwatch/log-groups" }]} contentType="table">
      <ResourceTable<LogGroup>
        title="Log groups"
        description="By default, we only load up to 10000 log groups."
        items={groups.data ?? []}
        loading={groups.isPending}
        loadingText="Loading log groups"
        error={groups.error}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="logGroupName"
        filterPlaceholder="Filter log groups or try prefix search"
        columns={[
          { id: "name", header: "Log group", value: (g) => g.logGroupName, cell: (g) => <Link href={groupHref(g.logGroupName)} onFollow={follow}>{g.logGroupName}</Link> },
          { id: "class", header: "Log class", value: (g) => g.logGroupClass, cell: (g) => (g.logGroupClass === "INFREQUENT_ACCESS" ? "Infrequent Access" : "Standard") },
          { id: "anomaly", header: "Anomaly detection", value: () => "", cell: () => "Configure" },
          { id: "protection", header: "Data protection", value: (g) => g.dataProtectionStatus, cell: (g) => g.dataProtectionStatus ?? "-" },
          { id: "retention", header: "Retention", value: (g) => g.retentionInDays ?? 0, cell: (g) => retentionLabel(g.retentionInDays) },
          { id: "filters", header: "Metric filters", value: (g) => g.metricFilterCount ?? 0, cell: (g) => String(g.metricFilterCount ?? 0) },
          { id: "stored", header: "Stored bytes", value: (g) => g.storedBytes ?? 0, cell: (g) => consoleBytes(g.storedBytes ?? 0) },
          { id: "created", header: "Creation time", value: (g) => g.creationTime, cell: (g) => consoleDate(g.creationTime ? new Date(g.creationTime).toISOString() : undefined) },
        ]}
        empty={<EmptyState title="No log groups" subtitle="You don't have any log groups." action={<Button onClick={() => setModal("create")}>Create log group</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={groups.isFetching} onClick={refresh} />
            <ButtonDropdown
              items={[
                { id: "retention", text: "Edit retention setting(s)", disabled: selected.length === 0 },
                { id: "delete", text: "Delete log group(s)", disabled: selected.length === 0 },
                { id: "filter", text: "Create metric filter", disabled: selected.length !== 1 },
                { id: "insights", text: "View in Logs Insights", disabled: selected.length === 0 },
                { id: "search", text: "Search all log streams", disabled: selected.length !== 1 },
              ]}
              onItemClick={({ detail }) => {
                if (detail.id === "retention") { setRetention(String(selected[0]?.retentionInDays ?? 0)); setModal("retention") }
                if (detail.id === "delete") setModal("delete")
                if (detail.id === "filter") router.push(groupHref(selected[0].logGroupName, "metric-filters"))
                if (detail.id === "insights") router.push(`/cloudwatch/logs-insights?group=${encodeURIComponent(selected.map((g) => g.logGroupName).join(","))}`)
                if (detail.id === "search") router.push(`/cloudwatch/log-groups/${encodeURIComponent(selected[0].logGroupName ?? "")}/${encodeURIComponent("*")}`)
              }}
            >
              Actions
            </ButtonDropdown>
            <Button href="/cloudwatch/logs-insights" onFollow={follow}>View in Logs Insights</Button>
            <Button href="/cloudwatch/live-tail" onFollow={follow}>Start tailing</Button>
            <Button variant="primary" onClick={() => { setForm({ name: "", retention: "0", logClass: "STANDARD", kms: "" }); setModal("create") }}>Create log group</Button>
          </SpaceBetween>
        }
      />
      <EditModal
        visible={modal === "create"}
        title="Create log group"
        saveLabel="Create"
        saveDisabled={!form.name}
        onDismiss={() => setModal(undefined)}
        success={`Log group ${form.name} has been created.`}
        onSave={async () => {
          await callAws("cloudwatchlogs", "CreateLogGroup", { logGroupName: form.name, logGroupClass: form.logClass, ...(form.kms ? { kmsKeyId: form.kms } : {}) })
          if (form.retention !== "0") await callAws("cloudwatchlogs", "PutRetentionPolicy", { logGroupName: form.name, retentionInDays: Number(form.retention) })
          refresh()
        }}
      >
        <FormField label="Log group name" constraintText="Up to 512 characters: a-z, A-Z, 0-9, '_', '-', '/', '.' and '#'."><Input value={form.name} onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
        <FormField label="Retention setting"><Select selectedOption={retentionOptions.find((o) => o.value === form.retention) ?? null} onChange={({ detail }) => setForm({ ...form, retention: detail.selectedOption.value ?? "0" })} options={retentionOptions} /></FormField>
        <FormField label="Log class"><Select selectedOption={{ value: form.logClass, label: form.logClass === "STANDARD" ? "Standard" : "Infrequent Access" }} onChange={({ detail }) => setForm({ ...form, logClass: detail.selectedOption.value ?? "STANDARD" })} options={[{ value: "STANDARD", label: "Standard" }, { value: "INFREQUENT_ACCESS", label: "Infrequent Access" }]} /></FormField>
        <FormField label="KMS key ARN - optional"><Input value={form.kms} onChange={({ detail }) => setForm({ ...form, kms: detail.value })} /></FormField>
      </EditModal>
      <EditModal visible={modal === "retention"} title="Edit retention setting" onDismiss={() => setModal(undefined)} success="Retention setting updated." onSave={async () => { for (const g of selected) { if (retention === "0") await callAws("cloudwatchlogs", "DeleteRetentionPolicy", { logGroupName: g.logGroupName }); else await callAws("cloudwatchlogs", "PutRetentionPolicy", { logGroupName: g.logGroupName, retentionInDays: Number(retention) }) } refresh() }}>
        <FormField label="Expire events after"><Select selectedOption={retentionOptions.find((o) => o.value === retention) ?? null} onChange={({ detail }) => setRetention(detail.selectedOption.value ?? "0")} options={retentionOptions} /></FormField>
      </EditModal>
      <EditModal visible={modal === "delete"} title="Delete log group(s)" saveLabel="Delete" onDismiss={() => setModal(undefined)} success="Log group(s) deleted." onSave={async () => { for (const g of selected) await callAws("cloudwatchlogs", "DeleteLogGroup", { logGroupName: g.logGroupName }); setSelected([]); refresh() }}>
        <Alert type="warning">Deleting {selected.map((g) => g.logGroupName).join(", ")} permanently deletes all archived log events. This can&apos;t be undone.</Alert>
      </EditModal>
    </CwLayout>
  )
}

type MetricFilter = { filterName?: string; filterPattern?: string; metricTransformations?: { metricName?: string; metricNamespace?: string; metricValue?: string; defaultValue?: number }[]; creationTime?: number }
type Subscription = { filterName?: string; destinationArn?: string; filterPattern?: string; creationTime?: number; distribution?: string }

export function LogGroupDetailPage({ name, tab }: { name: string; tab: string }) {
  const router = useRouter()
  const follow = useFollow()
  const groups = useAws<{ logGroups?: LogGroup[] }>("cloudwatchlogs", "DescribeLogGroups", { logGroupNamePrefix: name })
  const group = groups.data?.logGroups?.find((g) => g.logGroupName === name)
  const streams = useQuery({ queryKey: ["emulator", "logs", "streams", name], queryFn: () => listAll<LogStream>("cloudwatchlogs", "DescribeLogStreams", { logGroupName: name, orderBy: "LastEventTime", descending: true, limit: 50 }, (p) => p.logStreams as LogStream[], { input: "nextToken", output: "nextToken" }, 1000) })
  const filters = useAws<{ metricFilters?: MetricFilter[] }>("cloudwatchlogs", "DescribeMetricFilters", { logGroupName: name })
  const subs = useAws<{ subscriptionFilters?: Subscription[] }>("cloudwatchlogs", "DescribeSubscriptionFilters", { logGroupName: name })
  const [selectedStreams, setSelectedStreams] = useState<LogStream[]>([])
  const [selectedFilters, setSelectedFilters] = useState<MetricFilter[]>([])
  const [modal, setModal] = useState<string>()
  const [streamName, setStreamName] = useState("")
  const [mf, setMf] = useState({ name: "", pattern: "", namespace: "", metric: "", value: "1", defaultValue: "" })
  const [sub, setSub] = useState({ name: "", destination: "", pattern: "" })
  const [retention, setRetention] = useState("0")
  const [event, setEvent] = useState({ stream: "", message: "" })
  const functions = useAws<{ Functions?: { FunctionName?: string; FunctionArn?: string }[] }>("lambda", "ListFunctions", {}, { enabled: modal === "subscription" })
  const arn = group?.logGroupArn ?? group?.arn?.replace(/:\*$/, "")
  return (
    <CwLayout breadcrumbs={[{ text: "Log Management", href: "/cloudwatch/log-groups" }, { text: name, href: groupHref(name) }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <ButtonDropdown
                  items={[
                    { id: "retention", text: "Edit retention setting" },
                    { id: "event", text: "Put log event" },
                    { id: "delete", text: "Delete log group" },
                  ]}
                  onItemClick={({ detail }) => { setRetention(String(group?.retentionInDays ?? 0)); setEvent({ stream: streams.data?.[0]?.logStreamName ?? "", message: "" }); setModal(detail.id) }}
                >
                  Actions
                </ButtonDropdown>
                <Button href={`/cloudwatch/logs-insights?group=${encodeURIComponent(name)}`} onFollow={follow}>View in Logs Insights</Button>
                <Button href={`/cloudwatch/live-tail?group=${encodeURIComponent(name)}`} onFollow={follow}>Start tailing</Button>
                <Button variant="primary" onClick={() => router.push(`/cloudwatch/log-groups/${encodeURIComponent(name)}/${encodeURIComponent("*")}`)}>Search log group</Button>
              </SpaceBetween>
            }
          >
            {name}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {groups.error && <Alert type="error">{errorMessage(groups.error)}</Alert>}
          <Container header={<Header variant="h2">Log group details</Header>}>
            <KeyValuePairs
              columns={4}
              items={[
                { label: "Log class", value: group?.logGroupClass === "INFREQUENT_ACCESS" ? "Infrequent Access" : "Standard" },
                { label: "Retention", value: retentionLabel(group?.retentionInDays) },
                { label: "Creation time", value: consoleDate(group?.creationTime ? new Date(group.creationTime).toISOString() : undefined) },
                { label: "Stored bytes", value: consoleBytes(group?.storedBytes ?? 0) },
                { label: "ARN", value: <Copyable value={arn} /> },
                { label: "Metric filters", value: String(filters.data?.metricFilters?.length ?? 0) },
                { label: "Subscription filters", value: String(subs.data?.subscriptionFilters?.length ?? 0) },
                { label: "KMS key ID", value: group?.kmsKeyId ?? "-" },
              ]}
            />
          </Container>
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => router.replace(groupHref(name, detail.activeTabId))}
            tabs={[
              {
                id: "streams",
                label: "Log streams",
                content: (
                  <ResourceTable<LogStream>
                    title="Log streams"
                    variant="container"
                    headerVariant="h2"
                    info={false}
                    items={streams.data ?? []}
                    loading={streams.isPending}
                    loadingText="Loading log streams"
                    selectionType="multi"
                    selectedItems={selectedStreams}
                    onSelectionChange={setSelectedStreams}
                    trackBy="logStreamName"
                    filterPlaceholder="Filter log streams or try prefix search"
                    columns={[
                      { id: "name", header: "Log stream", value: (s) => s.logStreamName, cell: (s) => <Link href={`/cloudwatch/log-groups/${encodeURIComponent(name)}/${encodeURIComponent(s.logStreamName ?? "")}`} onFollow={follow}>{s.logStreamName}</Link> },
                      { id: "last", header: "Last event time", value: (s) => s.lastEventTimestamp, cell: (s) => time(s.lastEventTimestamp) },
                    ]}
                    empty={<EmptyState title="No log streams" subtitle="No log streams to display." />}
                    actions={
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void streams.refetch()} />
                        <Button disabled={selectedStreams.length === 0} onClick={() => setModal("delete-streams")}>Delete</Button>
                        <Button onClick={() => { setStreamName(""); setModal("stream") }}>Create log stream</Button>
                        <Button variant="primary" href={`/cloudwatch/log-groups/${encodeURIComponent(name)}/${encodeURIComponent("*")}`} onFollow={follow}>Search all log streams</Button>
                      </SpaceBetween>
                    }
                  />
                ),
              },
              { id: "tags", label: "Tags", content: <LogTags arn={arn} /> },
              { id: "anomaly", label: "Anomaly detection", content: <Alert type="info">Log anomaly detection isn&apos;t available in the local emulator.</Alert> },
              {
                id: "metric-filters",
                label: "Metric filters",
                content: (
                  <Table<MetricFilter>
                    header={
                      <Header
                        variant="h2"
                        counter={`(${filters.data?.metricFilters?.length ?? 0})`}
                        actions={
                          <SpaceBetween direction="horizontal" size="xs">
                            <Button disabled={selectedFilters.length === 0} onClick={async () => { for (const f of selectedFilters) await callAws("cloudwatchlogs", "DeleteMetricFilter", { logGroupName: name, filterName: f.filterName }); flash.success("Metric filter deleted."); setSelectedFilters([]); void filters.refetch() }}>Delete</Button>
                            <Button variant="primary" onClick={() => { setMf({ name: "", pattern: "", namespace: "", metric: "", value: "1", defaultValue: "" }); setModal("metric-filter") }}>Create metric filter</Button>
                          </SpaceBetween>
                        }
                      >
                        Metric filters
                      </Header>
                    }
                    items={filters.data?.metricFilters ?? []}
                    selectionType="multi"
                    selectedItems={selectedFilters}
                    onSelectionChange={({ detail }) => setSelectedFilters(detail.selectedItems)}
                    trackBy="filterName"
                    columnDefinitions={[
                      { id: "name", header: "Filter name", cell: (f) => f.filterName },
                      { id: "pattern", header: "Filter pattern", cell: (f) => f.filterPattern || "(all events)" },
                      { id: "metric", header: "Metric", cell: (f) => `${f.metricTransformations?.[0]?.metricNamespace} / ${f.metricTransformations?.[0]?.metricName}` },
                      { id: "value", header: "Metric value", cell: (f) => f.metricTransformations?.[0]?.metricValue },
                    ]}
                    empty={<Box textAlign="center" color="inherit"><b>No metric filters</b><Box variant="p" color="inherit">Create a metric filter to turn log events into CloudWatch metrics.</Box></Box>}
                  />
                ),
              },
              {
                id: "subscription-filters",
                label: "Subscription filters",
                content: (
                  <Table<Subscription>
                    header={<Header variant="h2" counter={`(${subs.data?.subscriptionFilters?.length ?? 0})`} actions={<Button onClick={() => { setSub({ name: "", destination: "", pattern: "" }); setModal("subscription") }}>Create Lambda subscription filter</Button>}>Subscription filters</Header>}
                    items={subs.data?.subscriptionFilters ?? []}
                    columnDefinitions={[
                      { id: "name", header: "Filter name", cell: (s) => s.filterName },
                      { id: "dest", header: "Destination ARN", cell: (s) => s.destinationArn },
                      { id: "pattern", header: "Filter pattern", cell: (s) => s.filterPattern || "(all events)" },
                      { id: "a", header: "Actions", cell: (s) => <Button variant="inline-link" onClick={async () => { await callAws("cloudwatchlogs", "DeleteSubscriptionFilter", { logGroupName: name, filterName: s.filterName }); void subs.refetch() }}>Delete</Button> },
                    ]}
                    empty={<Box textAlign="center" color="inherit"><b>No subscription filters</b></Box>}
                  />
                ),
              },
              { id: "contributor", label: "Contributor Insights", content: <Alert type="info">Contributor Insights isn&apos;t available in the local emulator.</Alert> },
              { id: "data-protection", label: "Data protection", content: <Alert type="info">Log data protection policies aren&apos;t enforced by the local emulator.</Alert> },
              { id: "field-indexes", label: "Field indexes", content: <Alert type="info">Field indexes aren&apos;t available in the local emulator.</Alert> },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      <EditModal visible={modal === "stream"} title="Create log stream" saveLabel="Create" saveDisabled={!streamName} onDismiss={() => setModal(undefined)} success={`Log stream ${streamName} created.`} onSave={async () => { await callAws("cloudwatchlogs", "CreateLogStream", { logGroupName: name, logStreamName: streamName }); await streams.refetch() }}>
        <FormField label="Log stream name"><Input value={streamName} onChange={({ detail }) => setStreamName(detail.value)} /></FormField>
      </EditModal>
      <EditModal visible={modal === "delete-streams"} title="Delete log stream(s)" saveLabel="Delete" onDismiss={() => setModal(undefined)} success="Log stream(s) deleted." onSave={async () => { for (const s of selectedStreams) await callAws("cloudwatchlogs", "DeleteLogStream", { logGroupName: name, logStreamName: s.logStreamName }); setSelectedStreams([]); await streams.refetch() }}>
        <Box>Delete {selectedStreams.length} log stream(s)? All their log events are permanently deleted.</Box>
      </EditModal>
      <EditModal visible={modal === "retention"} title="Edit retention setting" onDismiss={() => setModal(undefined)} success="Retention setting updated." onSave={async () => { if (retention === "0") await callAws("cloudwatchlogs", "DeleteRetentionPolicy", { logGroupName: name }); else await callAws("cloudwatchlogs", "PutRetentionPolicy", { logGroupName: name, retentionInDays: Number(retention) }); await groups.refetch() }}>
        <FormField label="Expire events after"><Select selectedOption={retentionOptions.find((o) => o.value === retention) ?? null} onChange={({ detail }) => setRetention(detail.selectedOption.value ?? "0")} options={retentionOptions} /></FormField>
      </EditModal>
      <EditModal visible={modal === "event"} title="Put log event" saveLabel="Put event" saveDisabled={!event.stream || !event.message} onDismiss={() => setModal(undefined)} success="Log event added." onSave={async () => { await callAws("cloudwatchlogs", "PutLogEvents", { logGroupName: name, logStreamName: event.stream, logEvents: [{ timestamp: Date.now(), message: event.message }] }); await streams.refetch() }}>
        <FormField label="Log stream"><Select selectedOption={event.stream ? { value: event.stream, label: event.stream } : null} placeholder="Choose a log stream" onChange={({ detail }) => setEvent({ ...event, stream: detail.selectedOption.value ?? "" })} options={(streams.data ?? []).map((s) => ({ value: s.logStreamName ?? "", label: s.logStreamName }))} /></FormField>
        <FormField label="Message" stretch><Textarea value={event.message} onChange={({ detail }) => setEvent({ ...event, message: detail.value })} /></FormField>
      </EditModal>
      <EditModal visible={modal === "delete"} title={`Delete ${name}?`} saveLabel="Delete" onDismiss={() => setModal(undefined)} success={`Log group ${name} deleted.`} onSave={async () => { await callAws("cloudwatchlogs", "DeleteLogGroup", { logGroupName: name }); router.push("/cloudwatch/log-groups") }}>
        <Alert type="warning">All archived log events in this log group are permanently deleted.</Alert>
      </EditModal>
      <EditModal
        visible={modal === "metric-filter"}
        size="large"
        title="Create metric filter"
        saveLabel="Create metric filter"
        saveDisabled={!mf.name || !mf.namespace || !mf.metric}
        onDismiss={() => setModal(undefined)}
        success={`Metric filter ${mf.name} created.`}
        onSave={async () => { await callAws("cloudwatchlogs", "PutMetricFilter", { logGroupName: name, filterName: mf.name, filterPattern: mf.pattern, metricTransformations: [{ metricName: mf.metric, metricNamespace: mf.namespace, metricValue: mf.value, ...(mf.defaultValue ? { defaultValue: Number(mf.defaultValue) } : {}) }] }); await filters.refetch() }}
      >
        <FormField label="Filter pattern" description="Specify the terms or pattern to match in your log events. Leave blank to match all events."><Input value={mf.pattern} placeholder='[ip, user, ..., status_code=4*, size]' onChange={({ detail }) => setMf({ ...mf, pattern: detail.value })} /></FormField>
        <FormField label="Filter name"><Input value={mf.name} onChange={({ detail }) => setMf({ ...mf, name: detail.value })} /></FormField>
        <Grid gridDefinition={[{ colspan: 6 }, { colspan: 6 }, { colspan: 6 }, { colspan: 6 }]}>
          <FormField label="Metric namespace"><Input value={mf.namespace} onChange={({ detail }) => setMf({ ...mf, namespace: detail.value })} /></FormField>
          <FormField label="Metric name"><Input value={mf.metric} onChange={({ detail }) => setMf({ ...mf, metric: detail.value })} /></FormField>
          <FormField label="Metric value"><Input value={mf.value} onChange={({ detail }) => setMf({ ...mf, value: detail.value })} /></FormField>
          <FormField label="Default value - optional"><Input value={mf.defaultValue} onChange={({ detail }) => setMf({ ...mf, defaultValue: detail.value })} /></FormField>
        </Grid>
      </EditModal>
      <EditModal visible={modal === "subscription"} size="large" title="Create Lambda subscription filter" saveLabel="Start streaming" saveDisabled={!sub.name || !sub.destination} onDismiss={() => setModal(undefined)} success="Subscription filter created." onSave={async () => { await callAws("cloudwatchlogs", "PutSubscriptionFilter", { logGroupName: name, filterName: sub.name, filterPattern: sub.pattern, destinationArn: sub.destination }); await subs.refetch() }}>
        <FormField label="Lambda function"><Select selectedOption={sub.destination ? { value: sub.destination, label: sub.destination.split(":").pop() } : null} placeholder="Choose a function" onChange={({ detail }) => setSub({ ...sub, destination: detail.selectedOption.value ?? "" })} options={(functions.data?.Functions ?? []).map((f) => ({ value: f.FunctionArn ?? "", label: f.FunctionName }))} /></FormField>
        <FormField label="Subscription filter name"><Input value={sub.name} onChange={({ detail }) => setSub({ ...sub, name: detail.value })} /></FormField>
        <FormField label="Subscription filter pattern - optional"><Input value={sub.pattern} onChange={({ detail }) => setSub({ ...sub, pattern: detail.value })} /></FormField>
      </EditModal>
    </CwLayout>
  )
}

function LogTags({ arn }: { arn?: string }) {
  const tags = useAws<{ tags?: Record<string, string> }>("cloudwatchlogs", "ListTagsForResource", { resourceArn: arn }, { enabled: Boolean(arn) })
  const list = Object.entries(tags.data?.tags ?? {}).map(([Key, Value]) => ({ Key, Value }))
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Tag[]>([])
  return (
    <>
      <Table header={<Header variant="h2" counter={`(${list.length})`} actions={<Button onClick={() => { setEdit(list); setOpen(true) }}>Manage tags</Button>}>Tags</Header>} items={list} columnDefinitions={[{ id: "k", header: "Key", cell: (t) => t.Key }, { id: "v", header: "Value", cell: (t) => t.Value || "–" }]} empty={<Box textAlign="center" color="inherit">No tags</Box>} />
      <EditModal visible={open} size="large" title="Manage tags" onDismiss={() => setOpen(false)} success="Tags updated." onSave={async () => { const after = edit.filter((t) => t.Key); const removed = list.filter((t) => !after.some((a) => a.Key === t.Key)).map((t) => t.Key); if (removed.length) await callAws("cloudwatchlogs", "UntagResource", { resourceArn: arn, tagKeys: removed }); if (after.length) await callAws("cloudwatchlogs", "TagResource", { resourceArn: arn, tags: Object.fromEntries(after.map((t) => [t.Key, t.Value ?? ""])) }); await tags.refetch() }}>
        <TagEditor tags={edit} onChange={setEdit} />
      </EditModal>
    </>
  )
}

export function LogStreamPage({ group, stream }: { group: string; stream: string }) {
  const all = stream === "*"
  const [pattern, setPattern] = useState("")
  const [applied, setApplied] = useState("")
  const [display, setDisplay] = useState("table")
  const [range, setRange] = useState("all")
  const events = useQuery({
    queryKey: ["emulator", "logs", "events", group, stream, applied, range],
    queryFn: async () => {
      const startTime = range === "all" ? undefined : Date.now() - Number(range) * 60_000
      if (all || applied) {
        const r = await callAws<{ events?: LogEvent[] }>("cloudwatchlogs", "FilterLogEvents", { logGroupName: group, ...(all ? {} : { logStreamNames: [stream] }), ...(applied ? { filterPattern: applied } : {}), ...(startTime ? { startTime } : {}), limit: 1000 })
        return r.events ?? []
      }
      const r = await callAws<{ events?: LogEvent[] }>("cloudwatchlogs", "GetLogEvents", { logGroupName: group, logStreamName: stream, startFromHead: false, limit: 1000, ...(startTime ? { startTime } : {}) })
      return r.events ?? []
    },
  })
  const [expanded, setExpanded] = useState<LogEvent[]>([])
  return (
    <CwLayout breadcrumbs={[{ text: "Log Management", href: "/cloudwatch/log-groups" }, { text: group, href: groupHref(group) }, { text: all ? "Search all log streams" : stream, href: "#" }]}>
      <ContentLayout header={<Header variant="h1" description={all ? `Log events in all streams of ${group}.` : undefined}>{all ? "Log events" : stream}</Header>}>
        <Table<LogEvent>
          header={
            <Header
              variant="h2"
              counter={`(${events.data?.length ?? 0})`}
              description="You can use the filter bar below to search for and match terms, phrases, or values in your log events."
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <SegmentedControl selectedId={range} onChange={({ detail }) => setRange(detail.selectedId)} options={[{ id: "1", text: "1m" }, { id: "30", text: "30m" }, { id: "60", text: "1h" }, { id: "720", text: "12h" }, { id: "all", text: "All" }]} />
                  <SegmentedControl selectedId={display} onChange={({ detail }) => setDisplay(detail.selectedId)} options={[{ id: "table", text: "Table" }, { id: "text", text: "Text" }]} />
                  <Button iconName="refresh" ariaLabel="Refresh" loading={events.isFetching} onClick={() => void events.refetch()} />
                </SpaceBetween>
              }
            >
              Log events
            </Header>
          }
          filter={
            <SpaceBetween direction="horizontal" size="xs">
              <div style={{ minWidth: 360 }}><TextFilter filteringText={pattern} filteringPlaceholder="Filter events - press enter to search" onChange={({ detail }) => setPattern(detail.filteringText)} onDelayedChange={() => undefined} /></div>
              <Button onClick={() => setApplied(pattern)}>Search</Button>
              {applied && <Button variant="link" onClick={() => { setPattern(""); setApplied("") }}>Clear</Button>}
            </SpaceBetween>
          }
          loading={events.isPending}
          loadingText="Loading log events"
          items={events.data ?? []}
          expandableRows={display === "table" ? { getItemChildren: () => [], isItemExpandable: () => false, expandedItems: expanded, onExpandableItemToggle: ({ detail }) => setExpanded(detail.expanded ? [...expanded, detail.item] : expanded.filter((e) => e !== detail.item)) } : undefined}
          wrapLines
          columnDefinitions={
            display === "text"
              ? [{ id: "line", header: "Message", cell: (e) => <Box variant="code" fontSize="body-s">{`${time(e.timestamp)}  ${e.message}`}</Box> }]
              : [
                  { id: "time", header: "Timestamp", cell: (e) => time(e.timestamp), width: 220 },
                  { id: "message", header: "Message", cell: (e) => <Box variant="code" fontSize="body-s">{e.message}</Box> },
                  ...(all ? [{ id: "stream", header: "Log stream name", cell: (e: LogEvent) => e.logStreamName }] : []),
                ]
          }
          empty={<Box textAlign="center" color="inherit"><b>No events found</b><Box variant="p" color="inherit">{events.error ? errorMessage(events.error) : "No older events at this moment."}</Box></Box>}
        />
      </ContentLayout>
    </CwLayout>
  )
}

const ranges = [
  { id: "5", text: "5m" },
  { id: "30", text: "30m" },
  { id: "60", text: "1h" },
  { id: "180", text: "3h" },
  { id: "720", text: "12h" },
  { id: "10080", text: "1w" },
]

type QueryDef = { queryDefinitionId?: string; name?: string; queryString?: string; logGroupNames?: string[] }

export function LogsInsightsPage({ initialGroup }: { initialGroup?: string }) {
  const groups = useLogGroups()
  const saved = useAws<{ queryDefinitions?: QueryDef[] }>("cloudwatchlogs", "DescribeQueryDefinitions", {})
  const [selected, setSelected] = useState<string[]>(initialGroup ? initialGroup.split(",") : [])
  const [query, setQuery] = useState("fields @timestamp, @message, @logStream, @log\n| sort @timestamp desc\n| limit 10000")
  const [range, setRange] = useState("60")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ status?: string; results?: { field?: string; value?: string }[][]; statistics?: { recordsMatched?: number; recordsScanned?: number; bytesScanned?: number } }>()
  const [error, setError] = useState<string>()
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState("")
  const queryId = useRef<string>(undefined)

  const run = async () => {
    setRunning(true)
    setError(undefined)
    setResult(undefined)
    try {
      const end = Math.floor(Date.now() / 1000)
      const start = await callAws<{ queryId?: string }>("cloudwatchlogs", "StartQuery", { logGroupNames: selected, startTime: end - Number(range) * 60, endTime: end, queryString: query, limit: 10000 })
      queryId.current = start.queryId
      for (let i = 0; i < 60; i++) {
        const r = await callAws<{ status?: string; results?: { field?: string; value?: string }[][]; statistics?: { recordsMatched?: number; recordsScanned?: number; bytesScanned?: number } }>("cloudwatchlogs", "GetQueryResults", { queryId: start.queryId })
        setResult(r)
        if (r.status !== "Running" && r.status !== "Scheduled") break
        await new Promise((res) => setTimeout(res, 1000))
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setRunning(false)
    }
  }
  const fields = [...new Set((result?.results ?? []).flatMap((row) => row.map((c) => c.field ?? "")).filter((f) => f && f !== "@ptr"))]
  const rows = (result?.results ?? []).map((row, i) => ({ id: i, ...Object.fromEntries(row.map((c) => [c.field, c.value])) })) as Record<string, string | number>[]
  return (
    <CwLayout breadcrumbs={[{ text: "Logs Insights", href: "/cloudwatch/logs-insights" }]}>
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>} description="Interactively search and analyze your log data using a purpose-built query language.">Logs Insights</Header>}>
        <Grid gridDefinition={[{ colspan: { default: 12, m: 9 } }, { colspan: { default: 12, m: 3 } }]}>
          <SpaceBetween size="l">
            <Container>
              <SpaceBetween size="m">
                <SpaceBetween direction="horizontal" size="xs">
                  <SegmentedControl selectedId="ql" options={[{ id: "ql", text: "Logs Insights QL" }, { id: "ppl", text: "OpenSearch PPL", disabled: true }, { id: "sql", text: "OpenSearch SQL", disabled: true }]} />
                  <SegmentedControl selectedId={range} onChange={({ detail }) => setRange(detail.selectedId)} options={ranges} />
                </SpaceBetween>
                <FormField label="Selection criteria" description="Select up to 50 log groups.">
                  <Multiselect selectedOptions={selected.map((g) => ({ value: g, label: g }))} placeholder="Select log groups" filteringType="auto" onChange={({ detail }) => setSelected(detail.selectedOptions.map((o) => o.value ?? ""))} options={(groups.data ?? []).map((g) => ({ value: g.logGroupName ?? "", label: g.logGroupName }))} tokenLimit={3} />
                </FormField>
                <Textarea value={query} rows={6} spellcheck={false} onChange={({ detail }) => setQuery(detail.value)} />
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="primary" loading={running} disabled={selected.length === 0} onClick={() => void run()}>Run query</Button>
                  <Button disabled={!running} onClick={async () => { if (queryId.current) await callAws("cloudwatchlogs", "StopQuery", { queryId: queryId.current }).catch(() => undefined) }}>Cancel</Button>
                  <Button onClick={() => { setSaveName(""); setSaveOpen(true) }}>Save</Button>
                </SpaceBetween>
              </SpaceBetween>
            </Container>
            {error && <Alert type="error">{error}</Alert>}
            {result && (
              <Table
                header={<Header variant="h2" counter={`(${rows.length})`} description={result.statistics ? `Showing ${rows.length} of ${result.statistics.recordsMatched ?? 0} records matched · ${result.statistics.recordsScanned ?? 0} records (${consoleBytes(result.statistics.bytesScanned ?? 0)}) scanned` : undefined}>Logs</Header>}
                items={rows}
                wrapLines
                resizableColumns
                columnDefinitions={fields.map((f) => ({ id: f, header: f, cell: (r: Record<string, string | number>) => String(r[f] ?? "") }))}
                empty={<Box textAlign="center" color="inherit"><b>No data found.</b><Box variant="p" color="inherit">{result.status === "Running" ? "Query is still running." : "Try adjusting the time range or log group selection."}</Box></Box>}
              />
            )}
          </SpaceBetween>
          <Container header={<Header variant="h2" counter={`(${saved.data?.queryDefinitions?.length ?? 0})`}>Saved queries</Header>}>
            <SpaceBetween size="xs">
              {(saved.data?.queryDefinitions ?? []).map((q) => (
                <SpaceBetween key={q.queryDefinitionId} direction="horizontal" size="xs">
                  <Link onFollow={(e) => { e.preventDefault(); setQuery(q.queryString ?? ""); if (q.logGroupNames?.length) setSelected(q.logGroupNames) }} href="#">{q.name}</Link>
                  <Button variant="inline-icon" iconName="remove" ariaLabel={`Delete ${q.name}`} onClick={async () => { await callAws("cloudwatchlogs", "DeleteQueryDefinition", { queryDefinitionId: q.queryDefinitionId }); void saved.refetch() }} />
                </SpaceBetween>
              ))}
              {!saved.data?.queryDefinitions?.length && <Box color="text-status-inactive">No saved queries</Box>}
            </SpaceBetween>
          </Container>
        </Grid>
      </ContentLayout>
      <EditModal visible={saveOpen} title="Save query" saveLabel="Save" saveDisabled={!saveName} onDismiss={() => setSaveOpen(false)} success="Query saved." onSave={async () => { await callAws("cloudwatchlogs", "PutQueryDefinition", { name: saveName, queryString: query, logGroupNames: selected }); await saved.refetch() }}>
        <FormField label="Query name" constraintText="Use / to organize queries into folders."><Input value={saveName} onChange={({ detail }) => setSaveName(detail.value)} /></FormField>
      </EditModal>
    </CwLayout>
  )
}

export function LiveTailPage() {
  const groups = useLogGroups()
  const [selected, setSelected] = useState<string[]>([])
  const [pattern, setPattern] = useState("")
  const [tailing, setTailing] = useState(false)
  const [events, setEvents] = useState<(LogEvent & { group: string })[]>([])
  const since = useRef(0)
  useEffect(() => {
    if (typeof window === "undefined") return
    const initial = new URLSearchParams(window.location.search).get("group")
    // Preselect the log group passed from the log group page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial) setSelected([initial])
  }, [])
  useEffect(() => {
    if (!tailing) return
    let cancelled = false
    const tick = async () => {
      const start = since.current
      since.current = Date.now()
      const batches = await Promise.all(selected.map(async (g) => ((await callAws<{ events?: LogEvent[] }>("cloudwatchlogs", "FilterLogEvents", { logGroupName: g, startTime: start, ...(pattern ? { filterPattern: pattern } : {}), limit: 500 }).catch(() => ({ events: [] }))).events ?? []).map((e) => ({ ...e, group: g }))))
      if (!cancelled) setEvents((prev) => [...prev, ...batches.flat().sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))].slice(-500))
    }
    void tick()
    const timer = setInterval(() => void tick(), 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [tailing, selected, pattern])
  return (
    <CwLayout breadcrumbs={[{ text: "Live Tail", href: "/cloudwatch/live-tail" }]}>
      <ContentLayout header={<Header variant="h1" description="View your log events as they're ingested.">Live Tail</Header>}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Filter</Header>}>
            <SpaceBetween size="m">
              <FormField label="Select log groups"><Multiselect selectedOptions={selected.map((g) => ({ value: g, label: g }))} disabled={tailing} placeholder="Select up to 10 log groups" filteringType="auto" onChange={({ detail }) => setSelected(detail.selectedOptions.map((o) => o.value ?? "").slice(0, 10))} options={(groups.data ?? []).map((g) => ({ value: g.logGroupName ?? "", label: g.logGroupName }))} /></FormField>
              <FormField label="Filter pattern - optional"><Input value={pattern} disabled={tailing} onChange={({ detail }) => setPattern(detail.value)} /></FormField>
              <SpaceBetween direction="horizontal" size="xs">
                {tailing ? <Button onClick={() => setTailing(false)}>Stop</Button> : <Button variant="primary" disabled={selected.length === 0} onClick={() => { since.current = Date.now() - 60_000; setEvents([]); setTailing(true) }}>Start</Button>}
                <Button onClick={() => setEvents([])}>Clear</Button>
                {tailing && <StatusIndicator type="loading">Streaming</StatusIndicator>}
              </SpaceBetween>
            </SpaceBetween>
          </Container>
          <Section title="Events" counter={`(${events.length})`}>
            <div className="myaws-live-tail">
              {events.length === 0 ? <Box color="text-status-inactive">{tailing ? "Waiting for new events…" : "Choose log groups and start a session."}</Box> : events.map((e, i) => (
                <div key={`${e.eventId}-${i}`}><span className="ts">{time(e.timestamp)}</span> <span className="grp">{e.group}</span> {e.message}</div>
              ))}
            </div>
          </Section>
        </SpaceBetween>
      </ContentLayout>
    </CwLayout>
  )
}
