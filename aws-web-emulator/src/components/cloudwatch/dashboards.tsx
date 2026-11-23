"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import Multiselect from "@cloudscape-design/components/multiselect"
import SegmentedControl from "@cloudscape-design/components/segmented-control"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Textarea from "@cloudscape-design/components/textarea"
import Tiles from "@cloudscape-design/components/tiles"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, JsonField } from "@/components/console/sections"
import { useFollow } from "@/components/shell/page-layout"
import { CwLayout } from "@/components/cloudwatch/cw-app"
import { AlarmState } from "@/components/cloudwatch/alarms"
import { MetricGraph, dimensionText, graphRanges, metricKey, stats, useAllMetrics, type GraphMetric, type Metric } from "@/components/cloudwatch/metrics"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type Entry = { DashboardName?: string; DashboardArn?: string; LastModified?: string; Size?: number }
type Widget = { type?: string; x?: number; y?: number; width?: number; height?: number; properties?: { title?: string; markdown?: string; metrics?: unknown[][]; stat?: string; period?: number; alarms?: string[]; view?: string; region?: string } }

const dashHref = (name?: string) => `/cloudwatch/dashboards/${encodeURIComponent(name ?? "")}`

export function DashboardsPage() {
  const router = useRouter()
  const follow = useFollow()
  const dashboards = useAws<{ DashboardEntries?: Entry[] }>("cloudwatch", "ListDashboards", {})
  const [selected, setSelected] = useState<Entry[]>([])
  const [modal, setModal] = useState<string>()
  const [name, setName] = useState("")
  return (
    <CwLayout breadcrumbs={[{ text: "Dashboards", href: "/cloudwatch/dashboards" }]} contentType="table">
      <ResourceTable<Entry>
        title="Custom dashboards"
        items={dashboards.data?.DashboardEntries ?? []}
        loading={dashboards.isPending}
        loadingText="Loading dashboards"
        error={dashboards.error}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="DashboardName"
        filterPlaceholder="Filter dashboards"
        columns={[
          { id: "name", header: "Name", value: (d) => d.DashboardName, cell: (d) => <Link href={dashHref(d.DashboardName)} onFollow={follow}>{d.DashboardName}</Link> },
          { id: "sharing", header: "Sharing", value: () => "Not shared", cell: () => "Not shared" },
          { id: "updated", header: "Last updated (UTC)", value: (d) => d.LastModified, cell: (d) => consoleDate(d.LastModified) },
        ]}
        empty={<EmptyState title="No dashboards" subtitle="Create a dashboard to monitor your resources in one view." action={<Button onClick={() => { setName(""); setModal("create") }}>Create dashboard</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void dashboards.refetch()} />
            <Button disabled={selected.length === 0} onClick={() => setModal("delete")}>Delete</Button>
            <Button variant="primary" onClick={() => { setName(""); setModal("create") }}>Create dashboard</Button>
          </SpaceBetween>
        }
      />
      <EditModal visible={modal === "create"} title="Create new dashboard" saveLabel="Create dashboard" saveDisabled={!name} onDismiss={() => setModal(undefined)} success={`Dashboard ${name} created.`} onSave={async () => { await callAws("cloudwatch", "PutDashboard", { DashboardName: name, DashboardBody: JSON.stringify({ widgets: [] }) }); router.push(dashHref(name)) }}>
        <FormField label="Dashboard name" constraintText="Valid characters: A-Z, a-z, 0-9, - and _."><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
      </EditModal>
      <EditModal visible={modal === "delete"} title="Delete dashboard(s)" saveLabel="Delete" onDismiss={() => setModal(undefined)} success="Dashboard(s) deleted." onSave={async () => { await callAws("cloudwatch", "DeleteDashboards", { DashboardNames: selected.map((d) => d.DashboardName) }); setSelected([]); await dashboards.refetch() }}>
        <Box>Delete {selected.map((d) => d.DashboardName).join(", ")}?</Box>
      </EditModal>
    </CwLayout>
  )
}

/** Expands the dashboard metrics array (including "..." shorthand) into graph metrics. */
function widgetMetrics(w: Widget): GraphMetric[] {
  const out: GraphMetric[] = []
  let previous: unknown[] = []
  for (const raw of w.properties?.metrics ?? []) {
    const options = (typeof raw[raw.length - 1] === "object" ? raw[raw.length - 1] : {}) as { stat?: string; period?: number; label?: string }
    let parts = raw.filter((p) => typeof p === "string") as string[]
    if (parts[0] === "...") parts = [...(previous.slice(0, previous.length - parts.length + 1) as string[]), ...parts.slice(1)]
    else if (parts[0] === ".") parts = parts.map((p, i) => (p === "." ? (previous[i] as string) : p))
    previous = parts
    const [Namespace, MetricName, ...dims] = parts
    const Dimensions = []
    for (let i = 0; i + 1 < dims.length; i += 2) Dimensions.push({ Name: dims[i], Value: dims[i + 1] })
    out.push({ metric: { Namespace, MetricName, Dimensions }, stat: options.stat ?? w.properties?.stat ?? "Average", period: options.period ?? w.properties?.period ?? 300, label: options.label })
  }
  return out
}

function AlarmWidget({ names }: { names: string[] }) {
  const alarms = useAws<{ MetricAlarms?: { AlarmName?: string; StateValue?: string }[] }>("cloudwatch", "DescribeAlarms", { AlarmNames: names }, { enabled: names.length > 0 })
  return (
    <SpaceBetween size="xs">
      {(alarms.data?.MetricAlarms ?? []).map((a) => (
        <SpaceBetween key={a.AlarmName} direction="horizontal" size="xs"><AlarmState value={a.StateValue} /><span>{a.AlarmName}</span></SpaceBetween>
      ))}
    </SpaceBetween>
  )
}

export function DashboardDetailPage({ name }: { name: string }) {
  const router = useRouter()
  const dashboard = useAws<{ DashboardBody?: string; DashboardArn?: string }>("cloudwatch", "GetDashboard", { DashboardName: name })
  const metrics = useAllMetrics()
  const alarms = useAws<{ MetricAlarms?: { AlarmName?: string; AlarmArn?: string }[] }>("cloudwatch", "DescribeAlarms", {})
  const [range, setRange] = useState("180")
  const [modal, setModal] = useState<string>()
  const [source, setSource] = useState("")
  const [widgetType, setWidgetType] = useState("line")
  const [widget, setWidget] = useState({ title: "", metrics: [] as string[], stat: "Average", markdown: "# Title\n\nDescribe this dashboard.", alarms: [] as string[] })
  let body: { widgets?: Widget[] } = {}
  let parseError: string | undefined
  try {
    body = JSON.parse(dashboard.data?.DashboardBody ?? "{}")
  } catch (e) {
    parseError = errorMessage(e)
  }
  const widgets = [...(body.widgets ?? [])].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))
  const save = async (next: { widgets?: Widget[] }) => {
    await callAws("cloudwatch", "PutDashboard", { DashboardName: name, DashboardBody: JSON.stringify(next) })
    await dashboard.refetch()
  }
  const removeWidget = async (w: Widget) => {
    await save({ ...body, widgets: (body.widgets ?? []).filter((x) => x !== w) })
    flash.success("Widget removed.")
  }
  const metricOptions = (metrics.data ?? []).map((m) => ({ value: metricKey(m), label: `${m.Namespace} • ${m.MetricName}`, description: dimensionText(m) }))
  return (
    <CwLayout breadcrumbs={[{ text: "Dashboards", href: "/cloudwatch/dashboards" }, { text: name, href: dashHref(name) }]} contentType="dashboard">
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <SegmentedControl selectedId={range} onChange={({ detail }) => setRange(detail.selectedId)} options={graphRanges} />
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void dashboard.refetch()} />
                <ButtonDropdown
                  items={[{ id: "source", text: "View/edit source" }, { id: "delete", text: "Delete dashboard" }]}
                  onItemClick={({ detail }) => { setSource(JSON.stringify(body, null, 2)); setModal(detail.id) }}
                >
                  Actions
                </ButtonDropdown>
                <Button variant="primary" iconName="add-plus" onClick={() => { setWidget({ title: "", metrics: [], stat: "Average", markdown: "# Title\n\nDescribe this dashboard.", alarms: [] }); setWidgetType("line"); setModal("widget") }}>Add widget</Button>
              </SpaceBetween>
            }
          >
            {name}
          </Header>
        }
      >
        {dashboard.error ? (
          <Alert type="error">{errorMessage(dashboard.error)}</Alert>
        ) : parseError ? (
          <Alert type="error">The dashboard body isn&apos;t valid JSON: {parseError}</Alert>
        ) : widgets.length === 0 ? (
          <Container><Box textAlign="center" color="inherit" padding="xl"><b>This dashboard is empty.</b><Box variant="p" color="inherit">Add a widget to start monitoring your resources.</Box><Button onClick={() => setModal("widget")}>Add widget</Button></Box></Container>
        ) : (
          <div className="myaws-dashboard-grid">
            {widgets.map((w, i) => (
              <div key={i} style={{ gridColumn: `${(w.x ?? 0) + 1} / span ${w.width ?? 6}` }}>
                <Container fitHeight header={<Header variant="h3" actions={<Button variant="inline-icon" iconName="close" ariaLabel="Remove widget" onClick={() => void removeWidget(w)} />}>{w.properties?.title ?? (w.type === "text" ? "" : "Untitled")}</Header>}>
                  {w.type === "text" ? (
                    <Box variant="p"><span style={{ whiteSpace: "pre-wrap" }}>{w.properties?.markdown}</span></Box>
                  ) : w.type === "alarm" ? (
                    <AlarmWidget names={(w.properties?.alarms ?? []).map((a) => a.split(":").pop() ?? a)} />
                  ) : w.type === "metric" ? (
                    <MetricGraph metrics={widgetMetrics(w)} minutes={Number(range)} height={Math.max(120, (w.height ?? 6) * 30)} title={w.properties?.title} />
                  ) : (
                    <Box color="text-status-inactive">The {w.type} widget type isn&apos;t supported in the local console.</Box>
                  )}
                </Container>
              </div>
            ))}
          </div>
        )}
      </ContentLayout>
      <EditModal
        visible={modal === "widget"}
        size="large"
        title="Add widget"
        saveLabel="Create widget"
        saveDisabled={widgetType === "line" ? widget.metrics.length === 0 : widgetType === "alarm" ? widget.alarms.length === 0 : !widget.markdown}
        onDismiss={() => setModal(undefined)}
        success="Widget added."
        onSave={async () => {
          const y = Math.max(0, ...(body.widgets ?? []).map((w) => (w.y ?? 0) + (w.height ?? 6)))
          const chosen = (metrics.data ?? []).filter((m) => widget.metrics.includes(metricKey(m)))
          const w: Widget =
            widgetType === "text"
              ? { type: "text", x: 0, y, width: 24, height: 3, properties: { markdown: widget.markdown } }
              : widgetType === "alarm"
                ? { type: "alarm", x: 0, y, width: 12, height: 3, properties: { title: widget.title || "Alarm status", alarms: widget.alarms } }
                : { type: "metric", x: 0, y, width: 12, height: 6, properties: { title: widget.title || chosen[0]?.MetricName, view: "timeSeries", region: "ap-southeast-7", stat: widget.stat, period: 300, metrics: chosen.map((m: Metric) => [m.Namespace, m.MetricName, ...(m.Dimensions ?? []).flatMap((d) => [d.Name, d.Value])]) } }
          await save({ ...body, widgets: [...(body.widgets ?? []), w] })
        }}
      >
        <FormField label="Widget type">
          <Tiles value={widgetType} onChange={({ detail }) => setWidgetType(detail.value)} columns={3} items={[{ value: "line", label: "Line", description: "Compare metrics over time" }, { value: "text", label: "Text", description: "Free text with markdown formatting" }, { value: "alarm", label: "Alarm status", description: "Display a set of alarms" }]} />
        </FormField>
        {widgetType !== "text" && <FormField label="Widget title"><Input value={widget.title} onChange={({ detail }) => setWidget({ ...widget, title: detail.value })} /></FormField>}
        {widgetType === "line" && (
          <>
            <FormField label="Metrics"><Multiselect selectedOptions={metricOptions.filter((o) => widget.metrics.includes(o.value))} placeholder="Choose metrics" filteringType="auto" onChange={({ detail }) => setWidget({ ...widget, metrics: detail.selectedOptions.map((o) => o.value ?? "") })} options={metricOptions} tokenLimit={3} /></FormField>
            <FormField label="Statistic"><Select selectedOption={{ value: widget.stat, label: widget.stat }} onChange={({ detail }) => setWidget({ ...widget, stat: detail.selectedOption.value ?? "Average" })} options={stats} /></FormField>
          </>
        )}
        {widgetType === "text" && <FormField label="Markdown" stretch><Textarea value={widget.markdown} rows={6} onChange={({ detail }) => setWidget({ ...widget, markdown: detail.value })} /></FormField>}
        {widgetType === "alarm" && <FormField label="Alarms"><Multiselect selectedOptions={(alarms.data?.MetricAlarms ?? []).filter((a) => widget.alarms.includes(a.AlarmArn ?? "")).map((a) => ({ value: a.AlarmArn, label: a.AlarmName }))} placeholder="Choose alarms" onChange={({ detail }) => setWidget({ ...widget, alarms: detail.selectedOptions.map((o) => o.value ?? "") })} options={(alarms.data?.MetricAlarms ?? []).map((a) => ({ value: a.AlarmArn ?? "", label: a.AlarmName }))} /></FormField>}
      </EditModal>
      <EditModal visible={modal === "source"} size="large" title="Source" saveLabel="Update" onDismiss={() => setModal(undefined)} success="Dashboard updated." onSave={() => save(JSON.parse(source))}>
        <JsonField value={source} onChange={setSource} rows={24} />
      </EditModal>
      <EditModal visible={modal === "delete"} title={`Delete ${name}?`} saveLabel="Delete" onDismiss={() => setModal(undefined)} success={`Dashboard ${name} deleted.`} onSave={async () => { await callAws("cloudwatch", "DeleteDashboards", { DashboardNames: [name] }); router.push("/cloudwatch/dashboards") }}>
        <Box>This can&apos;t be undone.</Box>
      </EditModal>
    </CwLayout>
  )
}
