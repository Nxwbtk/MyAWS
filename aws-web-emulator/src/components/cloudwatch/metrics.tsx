"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import Container from "@cloudscape-design/components/container"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import LineChart from "@cloudscape-design/components/line-chart"
import Link from "@cloudscape-design/components/link"
import SegmentedControl from "@cloudscape-design/components/segmented-control"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import TextFilter from "@cloudscape-design/components/text-filter"
import BreadcrumbGroup from "@cloudscape-design/components/breadcrumb-group"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EditModal } from "@/components/console/sections"
import { CwLayout } from "@/components/cloudwatch/cw-app"
import { callAws, listAll, useAws } from "@/lib/aws"

export type Dimension = { Name?: string; Value?: string }
export type Metric = { Namespace?: string; MetricName?: string; Dimensions?: Dimension[] }
export type GraphMetric = { metric: Metric; stat: string; period: number; label?: string }

export const stats = ["Average", "Sum", "Minimum", "Maximum", "SampleCount", "p50", "p90", "p99"].map((s) => ({ value: s, label: s }))
export const periods = [60, 300, 900, 3600, 21600, 86400].map((p) => ({ value: String(p), label: p < 3600 ? `${p / 60} minute${p > 60 ? "s" : ""}` : p < 86400 ? `${p / 3600} hour${p > 3600 ? "s" : ""}` : "1 day" }))
export const graphRanges = [
  { id: "60", text: "1h" },
  { id: "180", text: "3h" },
  { id: "720", text: "12h" },
  { id: "1440", text: "1d" },
  { id: "4320", text: "3d" },
  { id: "10080", text: "1w" },
]

export const metricKey = (m: Metric) => `${m.Namespace}|${m.MetricName}|${(m.Dimensions ?? []).map((d) => `${d.Name}=${d.Value}`).sort().join(",")}`
export const dimensionText = (m: Metric) => (m.Dimensions ?? []).map((d) => `${d.Name}: ${d.Value}`).join(", ") || "No dimensions"

export function useAllMetrics() {
  return useQuery({
    queryKey: ["emulator", "cloudwatch", "metrics"],
    queryFn: () => listAll<Metric>("cloudwatch", "ListMetrics", {}, (p) => p.Metrics as Metric[], { input: "NextToken", output: "NextToken" }, 5000),
  })
}

/** Line chart of CloudWatch metrics, rendered from GetMetricData. */
export function MetricGraph({ metrics, minutes, height = 260, title }: { metrics: GraphMetric[]; minutes: number; height?: number; title?: string }) {
  const data = useQuery({
    queryKey: ["emulator", "cloudwatch", "graph", metrics.map((m) => [metricKey(m.metric), m.stat, m.period]), minutes],
    enabled: metrics.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const end = Date.now()
      const r = await callAws<{ MetricDataResults?: { Id?: string; Label?: string; Timestamps?: string[]; Values?: number[] }[] }>("cloudwatch", "GetMetricData", {
        MetricDataQueries: metrics.map((m, i) => ({ Id: `m${i}`, MetricStat: { Metric: m.metric, Period: m.period, Stat: m.stat }, Label: m.label ?? m.metric.MetricName })),
        StartTime: new Date(end - minutes * 60_000).toISOString(),
        EndTime: new Date(end).toISOString(),
        ScanBy: "TimestampAscending",
      })
      return r.MetricDataResults ?? []
    },
  })
  const series = (data.data ?? []).map((r, i) => ({
    title: `${r.Label ?? `m${i}`}${metrics[i]?.metric.Dimensions?.length ? ` (${metrics[i].metric.Dimensions?.map((d) => d.Value).join(", ")})` : ""}`,
    type: "line" as const,
    data: (r.Timestamps ?? []).map((t, j) => ({ x: new Date(t), y: r.Values?.[j] ?? 0 })).sort((a, b) => a.x.getTime() - b.x.getTime()),
  }))
  const end = new Date()
  const start = new Date(end.getTime() - minutes * 60_000)
  return (
    <LineChart
      series={series}
      xDomain={[start, end]}
      xScaleType="time"
      height={height}
      hideFilter
      statusType={data.isPending && metrics.length ? "loading" : data.error ? "error" : "finished"}
      errorText={data.error ? errorMessage(data.error) : undefined}
      ariaLabel={title ?? "Metric graph"}
      i18nStrings={{ xTickFormatter: (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), yTickFormatter: (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v * 100) / 100)) }}
      empty={<Box textAlign="center" color="inherit"><b>{metrics.length ? "No data available." : "Your CloudWatch graph is empty."}</b><Box variant="p" color="inherit">{metrics.length ? "Try adjusting the dashboard time range and/or the metric configuration." : "Select some metrics to appear here."}</Box></Box>}
      noMatch={<Box textAlign="center">No matching data</Box>}
    />
  )
}

export function MetricsPage() {
  const router = useRouter()
  const metrics = useAllMetrics()
  const dashboards = useAws<{ DashboardEntries?: { DashboardName?: string }[] }>("cloudwatch", "ListDashboards", {})
  const [range, setRange] = useState("180")
  const [title, setTitle] = useState("Untitled graph")
  const [namespace, setNamespace] = useState<string>()
  const [dimSet, setDimSet] = useState<string>()
  const [filter, setFilter] = useState("")
  const [graphed, setGraphed] = useState<GraphMetric[]>([])
  const [tab, setTab] = useState("browse")
  const [dashOpen, setDashOpen] = useState(false)
  const [dashName, setDashName] = useState("")
  const all = useMemo(() => metrics.data ?? [], [metrics.data])
  const namespaces = useMemo(() => {
    const map = new Map<string, number>()
    all.forEach((m) => map.set(m.Namespace ?? "", (map.get(m.Namespace ?? "") ?? 0) + 1))
    return [...map.entries()].sort(([a], [b]) => (a.startsWith("AWS/") === b.startsWith("AWS/") ? a.localeCompare(b) : a.startsWith("AWS/") ? 1 : -1))
  }, [all])
  const dimSets = useMemo(() => {
    const map = new Map<string, number>()
    all.filter((m) => m.Namespace === namespace).forEach((m) => {
      const key = (m.Dimensions ?? []).map((d) => d.Name).sort().join(", ") || "Metrics with no dimensions"
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return [...map.entries()]
  }, [all, namespace])
  const rows = all.filter((m) => m.Namespace === namespace && ((m.Dimensions ?? []).map((d) => d.Name).sort().join(", ") || "Metrics with no dimensions") === dimSet).filter((m) => !filter || `${m.MetricName} ${dimensionText(m)}`.toLowerCase().includes(filter.toLowerCase()))
  const isGraphed = (m: Metric) => graphed.some((g) => metricKey(g.metric) === metricKey(m))
  const toggle = (items: Metric[]) => {
    const keys = new Set(items.map(metricKey))
    setGraphed([...graphed.filter((g) => g.metric.Namespace !== namespace || keys.has(metricKey(g.metric)) || !rows.some((r) => metricKey(r) === metricKey(g.metric))), ...items.filter((m) => !isGraphed(m)).map((m) => ({ metric: m, stat: "Average", period: 300 }))])
  }
  return (
    <CwLayout breadcrumbs={[{ text: "Metrics", href: "/cloudwatch/metrics" }, { text: "All metrics", href: "/cloudwatch/metrics" }]}>
      <SpaceBetween size="l">
        <Container
          header={
            <Header
              variant="h2"
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <SegmentedControl selectedId={range} onChange={({ detail }) => setRange(detail.selectedId)} options={graphRanges} />
                  <ButtonDropdown
                    items={[{ id: "dashboard", text: "Add to dashboard", disabled: graphed.length === 0 }, { id: "alarm", text: "Create alarm", disabled: graphed.length !== 1 }]}
                    onItemClick={({ detail }) => {
                      if (detail.id === "dashboard") { setDashName(dashboards.data?.DashboardEntries?.[0]?.DashboardName ?? ""); setDashOpen(true) }
                      if (detail.id === "alarm") router.push(`/cloudwatch/alarms/create?metric=${encodeURIComponent(JSON.stringify(graphed[0]))}`)
                    }}
                  >
                    Actions
                  </ButtonDropdown>
                </SpaceBetween>
              }
            >
              <Input value={title} onChange={({ detail }) => setTitle(detail.value)} ariaLabel="Graph title" />
            </Header>
          }
        >
          <MetricGraph metrics={graphed} minutes={Number(range)} height={300} title={title} />
        </Container>
        <Tabs
          activeTabId={tab}
          onChange={({ detail }) => setTab(detail.activeTabId)}
          tabs={[
            {
              id: "browse",
              label: "Browse",
              content: (
                <Container
                  header={
                    <Header variant="h2" counter={namespace ? undefined : `(${all.length})`} actions={<Button iconName="refresh" ariaLabel="Refresh" loading={metrics.isFetching} onClick={() => void metrics.refetch()} />}>
                      <BreadcrumbGroup
                        items={[{ text: "All metrics", href: "#all" }, ...(namespace ? [{ text: namespace, href: "#ns" }] : []), ...(dimSet ? [{ text: dimSet, href: "#dim" }] : [])]}
                        onFollow={(e) => { e.preventDefault(); if (e.detail.href === "#all") { setNamespace(undefined); setDimSet(undefined) } if (e.detail.href === "#ns") setDimSet(undefined) }}
                      />
                    </Header>
                  }
                >
                  {!namespace ? (
                    <SpaceBetween size="s">
                      {metrics.isPending && <Box color="text-status-inactive">Loading metrics…</Box>}
                      {namespaces.length === 0 && !metrics.isPending && <Box color="text-status-inactive">No metrics. Publish metrics with PutMetricData or use AWS services to generate them.</Box>}
                      <div className="myaws-metric-cards">
                        {namespaces.map(([ns, count]) => (
                          <button key={ns} type="button" onClick={() => setNamespace(ns)}>
                            <Box fontWeight="bold">{ns}</Box>
                            <Box fontSize="body-s" color="text-body-secondary">{count} metric{count === 1 ? "" : "s"}</Box>
                          </button>
                        ))}
                      </div>
                    </SpaceBetween>
                  ) : !dimSet ? (
                    <div className="myaws-metric-cards">
                      {dimSets.map(([key, count]) => (
                        <button key={key} type="button" onClick={() => setDimSet(key)}>
                          <Box fontWeight="bold">{key}</Box>
                          <Box fontSize="body-s" color="text-body-secondary">{count} metric{count === 1 ? "" : "s"}</Box>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Table<Metric>
                      variant="embedded"
                      items={rows}
                      selectionType="multi"
                      selectedItems={rows.filter(isGraphed)}
                      onSelectionChange={({ detail }) => toggle(detail.selectedItems)}
                      trackBy={metricKey}
                      filter={<TextFilter filteringText={filter} filteringPlaceholder="Search for any metric, dimension, resource id or account id" onChange={({ detail }) => setFilter(detail.filteringText)} />}
                      columnDefinitions={[
                        ...(dimSet === "Metrics with no dimensions" ? [] : (dimSet.split(", ").map((d) => ({ id: d, header: d, cell: (m: Metric) => m.Dimensions?.find((x) => x.Name === d)?.Value ?? "" })))),
                        { id: "name", header: "Metric name", cell: (m) => m.MetricName },
                      ]}
                      empty={<Box textAlign="center">No metrics</Box>}
                    />
                  )}
                </Container>
              ),
            },
            {
              id: "graphed",
              label: `Graphed metrics (${graphed.length})`,
              content: (
                <Table<GraphMetric>
                  items={graphed}
                  columnDefinitions={[
                    { id: "label", header: "Label", cell: (g) => g.label ?? g.metric.MetricName },
                    { id: "details", header: "Details", cell: (g) => `${g.metric.Namespace} • ${g.metric.MetricName} • ${dimensionText(g.metric)}` },
                    { id: "stat", header: "Statistic", cell: (g) => <Select selectedOption={{ value: g.stat, label: g.stat }} onChange={({ detail }) => setGraphed(graphed.map((x) => (x === g ? { ...x, stat: detail.selectedOption.value ?? "Average" } : x)))} options={stats} expandToViewport /> },
                    { id: "period", header: "Period", cell: (g) => <Select selectedOption={periods.find((p) => p.value === String(g.period)) ?? null} onChange={({ detail }) => setGraphed(graphed.map((x) => (x === g ? { ...x, period: Number(detail.selectedOption.value) } : x)))} options={periods} expandToViewport /> },
                    { id: "actions", header: "Actions", cell: (g) => <SpaceBetween direction="horizontal" size="xs"><Button variant="inline-link" onClick={() => router.push(`/cloudwatch/alarms/create?metric=${encodeURIComponent(JSON.stringify(g))}`)}>Create alarm</Button><Button variant="inline-icon" iconName="close" ariaLabel="Remove" onClick={() => setGraphed(graphed.filter((x) => x !== g))} /></SpaceBetween> },
                  ]}
                  empty={<Box textAlign="center" color="inherit"><b>No graphed metrics</b><Box variant="p" color="inherit">Select metrics in the Browse tab.</Box></Box>}
                />
              ),
            },
            { id: "query", label: "Multi source query", content: <Box color="text-status-inactive">Metrics Insights queries aren&apos;t available in the local console. <Link external href="https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/query_with_cloudwatch-metrics-insights.html">Learn more</Link></Box> },
          ]}
        />
      </SpaceBetween>
      <EditModal
        visible={dashOpen}
        title="Add to dashboard"
        saveLabel="Add to dashboard"
        saveDisabled={!dashName}
        onDismiss={() => setDashOpen(false)}
        success={`Graph added to ${dashName}.`}
        onSave={async () => {
          let body: { widgets: unknown[] } = { widgets: [] }
          try {
            const existing = await callAws<{ DashboardBody?: string }>("cloudwatch", "GetDashboard", { DashboardName: dashName })
            body = JSON.parse(existing.DashboardBody ?? '{"widgets":[]}')
          } catch {
            body = { widgets: [] }
          }
          const y = Math.max(0, ...body.widgets.map((w) => ((w as { y?: number; height?: number }).y ?? 0) + ((w as { height?: number }).height ?? 6)))
          body.widgets.push({ type: "metric", x: 0, y, width: 12, height: 6, properties: { title, view: "timeSeries", region: "ap-southeast-7", period: graphed[0]?.period ?? 300, stat: graphed[0]?.stat ?? "Average", metrics: graphed.map((g) => [g.metric.Namespace, g.metric.MetricName, ...(g.metric.Dimensions ?? []).flatMap((d) => [d.Name, d.Value]), { stat: g.stat, period: g.period }]) } })
          await callAws("cloudwatch", "PutDashboard", { DashboardName: dashName, DashboardBody: JSON.stringify(body) })
          void dashboards.refetch()
          flash.info("Open the dashboard to see the new widget.")
        }}
      >
        <FormField label="Dashboard" description="Choose an existing dashboard or enter a new name.">
          <SpaceBetween size="xs">
            <Select selectedOption={null} placeholder="Choose a dashboard" empty="No dashboards" onChange={({ detail }) => setDashName(detail.selectedOption.value ?? "")} options={(dashboards.data?.DashboardEntries ?? []).map((d) => ({ value: d.DashboardName ?? "", label: d.DashboardName }))} />
            <Input value={dashName} onChange={({ detail }) => setDashName(detail.value)} />
          </SpaceBetween>
        </FormField>
      </EditModal>
    </CwLayout>
  )
}

/** A grid of small metric graphs, as on a resource's Monitor tab. */
export function MetricGrid({ namespace, dimensions, metrics, minutes = 180 }: { namespace: string; dimensions: Dimension[]; metrics: { name: string; stat: string; title?: string }[]; minutes?: number }) {
  return (
    <div className="myaws-metric-grid">
      {metrics.map((m) => (
        <Container key={`${m.name}-${m.stat}`} header={<Header variant="h3">{m.title ?? m.name}</Header>}>
          <MetricGraph metrics={[{ metric: { Namespace: namespace, MetricName: m.name, Dimensions: dimensions }, stat: m.stat, period: 60, label: m.name }]} minutes={minutes} height={150} />
        </Container>
      ))}
    </div>
  )
}
