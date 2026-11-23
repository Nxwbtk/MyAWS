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
import RadioGroup from "@cloudscape-design/components/radio-group"
import SegmentedControl from "@cloudscape-design/components/segmented-control"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import Tiles from "@cloudscape-design/components/tiles"
import Wizard from "@cloudscape-design/components/wizard"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal } from "@/components/console/sections"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { CwLayout } from "@/components/cloudwatch/cw-app"
import { MetricGraph, dimensionText, graphRanges, metricKey, periods, stats, useAllMetrics, type GraphMetric, type Metric } from "@/components/cloudwatch/metrics"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type Alarm = {
  AlarmName?: string
  AlarmArn?: string
  AlarmDescription?: string
  StateValue?: string
  StateReason?: string
  StateUpdatedTimestamp?: string
  ActionsEnabled?: boolean
  AlarmActions?: string[]
  OKActions?: string[]
  InsufficientDataActions?: string[]
  MetricName?: string
  Namespace?: string
  Statistic?: string
  ExtendedStatistic?: string
  Dimensions?: { Name?: string; Value?: string }[]
  Period?: number
  EvaluationPeriods?: number
  DatapointsToAlarm?: number
  Threshold?: number
  ComparisonOperator?: string
  TreatMissingData?: string
  AlarmRule?: string
  AlarmConfigurationUpdatedTimestamp?: string
}

const operators = [
  { value: "GreaterThanThreshold", label: "Greater", symbol: ">" },
  { value: "GreaterThanOrEqualToThreshold", label: "Greater/Equal", symbol: ">=" },
  { value: "LessThanOrEqualToThreshold", label: "Lower/Equal", symbol: "<=" },
  { value: "LessThanThreshold", label: "Lower", symbol: "<" },
]
const missing = [
  { value: "missing", label: "Treat missing data as missing" },
  { value: "notBreaching", label: "Treat missing data as good (not breaching threshold)" },
  { value: "breaching", label: "Treat missing data as bad (breaching threshold)" },
  { value: "ignore", label: "Ignore (maintain the alarm state)" },
]

export function AlarmState({ value }: { value?: string }) {
  if (value === "ALARM") return <StatusIndicator type="error">In alarm</StatusIndicator>
  if (value === "OK") return <StatusIndicator type="success">OK</StatusIndicator>
  return <StatusIndicator type="info">Insufficient data</StatusIndicator>
}

export const condition = (a: Alarm) => (a.AlarmRule ? a.AlarmRule : `${a.MetricName} ${operators.find((o) => o.value === a.ComparisonOperator)?.symbol ?? a.ComparisonOperator} ${a.Threshold} for ${a.DatapointsToAlarm ?? a.EvaluationPeriods} datapoints within ${Math.round(((a.Period ?? 60) * (a.EvaluationPeriods ?? 1)) / 60)} minutes`)
const alarmHref = (name?: string) => `/cloudwatch/alarms/${encodeURIComponent(name ?? "")}`

function useAlarms() {
  return useAws<{ MetricAlarms?: Alarm[]; CompositeAlarms?: Alarm[] }>("cloudwatch", "DescribeAlarms", { MaxRecords: 100, AlarmTypes: ["MetricAlarm", "CompositeAlarm"] }, { refetchInterval: 30_000 })
}

export function AlarmsPage({ stateFilter }: { stateFilter?: string }) {
  const router = useRouter()
  const follow = useFollow()
  const alarms = useAlarms()
  const [selected, setSelected] = useState<Alarm[]>([])
  const [state, setState] = useState(stateFilter ?? "any")
  const [deleting, setDeleting] = useState(false)
  const all = [...(alarms.data?.MetricAlarms ?? []), ...(alarms.data?.CompositeAlarms ?? [])]
  const items = all.filter((a) => state === "any" || a.StateValue === state)
  return (
    <CwLayout breadcrumbs={[{ text: "Alarms", href: "/cloudwatch/alarms" }]} contentType="table">
      <ResourceTable<Alarm>
        title="Alarms"
        items={items}
        loading={alarms.isPending}
        loadingText="Loading alarms"
        error={alarms.error}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="AlarmName"
        filterPlaceholder="Search"
        columns={[
          { id: "name", header: "Name", value: (a) => a.AlarmName, cell: (a) => <Link href={alarmHref(a.AlarmName)} onFollow={follow}>{a.AlarmName}</Link> },
          { id: "state", header: "State", value: (a) => a.StateValue, cell: (a) => <AlarmState value={a.StateValue} /> },
          { id: "updated", header: "Last state update (UTC)", value: (a) => a.StateUpdatedTimestamp, cell: (a) => (a.StateUpdatedTimestamp ? a.StateUpdatedTimestamp.replace("T", " ").slice(0, 19) : "–") },
          { id: "conditions", header: "Conditions", value: (a) => condition(a), cell: (a) => condition(a) },
          { id: "actions", header: "Actions", value: (a) => String(a.ActionsEnabled), cell: (a) => (a.ActionsEnabled ? (a.AlarmActions?.length ? <StatusIndicator type="success">Actions enabled</StatusIndicator> : <StatusIndicator type="warning">No actions</StatusIndicator>) : <StatusIndicator type="stopped">Actions disabled</StatusIndicator>) },
        ]}
        empty={<EmptyState title="No alarms" subtitle="No alarms to display." action={<Button href="/cloudwatch/alarms/create" onFollow={follow}>Create alarm</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Select selectedOption={{ value: state, label: { any: "Any state", ALARM: "In alarm", OK: "OK", INSUFFICIENT_DATA: "Insufficient data" }[state] }} onChange={({ detail }) => setState(detail.selectedOption.value ?? "any")} options={[{ value: "any", label: "Any state" }, { value: "ALARM", label: "In alarm" }, { value: "OK", label: "OK" }, { value: "INSUFFICIENT_DATA", label: "Insufficient data" }]} />
            <Button iconName="refresh" ariaLabel="Refresh" loading={alarms.isFetching} onClick={() => void alarms.refetch()} />
            <ButtonDropdown
              disabled={selected.length === 0}
              items={[
                { id: "edit", text: "Edit", disabled: selected.length !== 1 || Boolean(selected[0]?.AlarmRule) },
                { id: "delete", text: "Delete" },
                { id: "enable", text: "Enable actions" },
                { id: "disable", text: "Disable actions" },
              ]}
              onItemClick={async ({ detail }) => {
                if (detail.id === "edit") router.push(`/cloudwatch/alarms/create?edit=${encodeURIComponent(selected[0].AlarmName ?? "")}`)
                if (detail.id === "delete") setDeleting(true)
                if (detail.id === "enable" || detail.id === "disable") {
                  await callAws("cloudwatch", detail.id === "enable" ? "EnableAlarmActions" : "DisableAlarmActions", { AlarmNames: selected.map((a) => a.AlarmName) }).then(() => { flash.success(`Actions ${detail.id}d.`); void alarms.refetch() }, (e) => flash.error(errorMessage(e)))
                }
              }}
            >
              Actions
            </ButtonDropdown>
            <Button variant="primary" href="/cloudwatch/alarms/create" onFollow={follow}>Create alarm</Button>
          </SpaceBetween>
        }
      />
      <EditModal visible={deleting} title="Delete alarm(s)" saveLabel="Delete" onDismiss={() => setDeleting(false)} success="Alarm(s) deleted." onSave={async () => { await callAws("cloudwatch", "DeleteAlarms", { AlarmNames: selected.map((a) => a.AlarmName) }); setSelected([]); await alarms.refetch() }}>
        <Box>Are you sure you want to delete {selected.map((a) => a.AlarmName).join(", ")}?</Box>
      </EditModal>
    </CwLayout>
  )
}

export function CreateAlarmPage() {
  const router = useRouter()
  const params = useSearchParams()
  const editName = params.get("edit") ?? undefined
  const initial = useMemo(() => {
    try {
      return params.get("metric") ? (JSON.parse(params.get("metric") ?? "") as GraphMetric) : undefined
    } catch {
      return undefined
    }
  }, [params])
  const metrics = useAllMetrics()
  const existing = useAws<{ MetricAlarms?: Alarm[] }>("cloudwatch", "DescribeAlarms", { AlarmNames: [editName] }, { enabled: Boolean(editName) })
  const functions = useAws<{ Functions?: { FunctionName?: string; FunctionArn?: string }[] }>("lambda", "ListFunctions", {})
  const [step, setStep] = useState(0)
  const [metric, setMetric] = useState<Metric | undefined>(initial?.metric)
  const [stat, setStat] = useState(initial?.stat ?? "Average")
  const [period, setPeriod] = useState(String(initial?.period ?? 300))
  const [op, setOp] = useState("GreaterThanThreshold")
  const [threshold, setThreshold] = useState("")
  const [datapoints, setDatapoints] = useState({ alarm: "1", eval: "1" })
  const [treat, setTreat] = useState("missing")
  const [actions, setActions] = useState<{ state: string; arn: string }[]>([])
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [loaded, setLoaded] = useState(false)
  const e = existing.data?.MetricAlarms?.[0]
  if (editName && e && !loaded) {
    setLoaded(true)
    setMetric({ Namespace: e.Namespace, MetricName: e.MetricName, Dimensions: e.Dimensions })
    setStat(e.Statistic ?? e.ExtendedStatistic ?? "Average")
    setPeriod(String(e.Period ?? 300))
    setOp(e.ComparisonOperator ?? "GreaterThanThreshold")
    setThreshold(String(e.Threshold ?? ""))
    setDatapoints({ alarm: String(e.DatapointsToAlarm ?? e.EvaluationPeriods ?? 1), eval: String(e.EvaluationPeriods ?? 1) })
    setTreat(e.TreatMissingData ?? "missing")
    setActions([...(e.AlarmActions ?? []).map((arn) => ({ state: "ALARM", arn })), ...(e.OKActions ?? []).map((arn) => ({ state: "OK", arn })), ...(e.InsufficientDataActions ?? []).map((arn) => ({ state: "INSUFFICIENT_DATA", arn }))])
    setName(e.AlarmName ?? "")
    setDescription(e.AlarmDescription ?? "")
  }
  const metricOptions = (metrics.data ?? []).map((m) => ({ value: metricKey(m), label: `${m.Namespace} • ${m.MetricName}`, description: dimensionText(m) }))
  const percentile = /^p\d/.test(stat)
  const save = async () => {
    setSaving(true)
    setError(undefined)
    try {
      await callAws("cloudwatch", "PutMetricAlarm", {
        AlarmName: name,
        AlarmDescription: description,
        Namespace: metric?.Namespace,
        MetricName: metric?.MetricName,
        Dimensions: metric?.Dimensions ?? [],
        ...(percentile ? { ExtendedStatistic: stat } : { Statistic: stat }),
        Period: Number(period),
        EvaluationPeriods: Number(datapoints.eval),
        DatapointsToAlarm: Number(datapoints.alarm),
        Threshold: Number(threshold),
        ComparisonOperator: op,
        TreatMissingData: treat,
        ActionsEnabled: true,
        AlarmActions: actions.filter((a) => a.state === "ALARM" && a.arn).map((a) => a.arn),
        OKActions: actions.filter((a) => a.state === "OK" && a.arn).map((a) => a.arn),
        InsufficientDataActions: actions.filter((a) => a.state === "INSUFFICIENT_DATA" && a.arn).map((a) => a.arn),
      })
      flash.success(`Successfully ${editName ? "updated" : "created"} alarm ${name}.`)
      router.push(alarmHref(name))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  const metricSummary = metric ? <KeyValuePairs columns={3} items={[{ label: "Namespace", value: metric.Namespace }, { label: "Metric name", value: metric.MetricName }, { label: "Dimensions", value: dimensionText(metric) }, { label: "Statistic", value: stat }, { label: "Period", value: periods.find((p) => p.value === period)?.label ?? `${period} seconds` }]} /> : null
  const conditionText = `Whenever ${metric?.MetricName ?? "the metric"} is ${operators.find((o) => o.value === op)?.label.toLowerCase()} than ${threshold || "…"}`
  return (
    <CwLayout breadcrumbs={[{ text: "Alarms", href: "/cloudwatch/alarms" }, { text: editName ? `Edit ${editName}` : "Create alarm", href: "#" }]} contentType="wizard">
      <Wizard
        activeStepIndex={step}
        isLoadingNextStep={saving}
        onNavigate={({ detail }) => {
          if (detail.requestedStepIndex > 0 && (!metric || threshold === "")) return setError("Select a metric and enter a threshold value.")
          if (detail.requestedStepIndex > 2 && !name) return setError("Enter an alarm name.")
          setError(undefined)
          setStep(detail.requestedStepIndex)
        }}
        onCancel={() => router.push("/cloudwatch/alarms")}
        onSubmit={() => void save()}
        submitButtonText={editName ? "Update alarm" : "Create alarm"}
        i18nStrings={{ stepNumberLabel: (n) => `Step ${n}`, collapsedStepsLabel: (n, c) => `Step ${n} of ${c}`, cancelButton: "Cancel", previousButton: "Previous", nextButton: "Next", optional: "optional" }}
        steps={[
          {
            title: "Specify metric and conditions",
            errorText: error,
            content: (
              <SpaceBetween size="l">
                <Container header={<Header variant="h2">Metric</Header>}>
                  <SpaceBetween size="l">
                    <FormField label="Metric" description="Choose the metric that this alarm watches.">
                      <Select selectedOption={metric ? metricOptions.find((o) => o.value === metricKey(metric)) ?? { value: metricKey(metric), label: `${metric.Namespace} • ${metric.MetricName}` } : null} placeholder="Select metric" filteringType="auto" statusType={metrics.isPending ? "loading" : "finished"} empty="No metrics" onChange={({ detail }) => setMetric((metrics.data ?? []).find((m) => metricKey(m) === detail.selectedOption.value))} options={metricOptions} disabled={Boolean(editName)} />
                    </FormField>
                    {metric && <MetricGraph metrics={[{ metric, stat, period: Number(period) }]} minutes={180} height={180} />}
                    {metricSummary}
                    <Grid gridDefinition={[{ colspan: 6 }, { colspan: 6 }]}>
                      <FormField label="Statistic"><Select selectedOption={{ value: stat, label: stat }} onChange={({ detail }) => setStat(detail.selectedOption.value ?? "Average")} options={stats} /></FormField>
                      <FormField label="Period"><Select selectedOption={periods.find((p) => p.value === period) ?? null} onChange={({ detail }) => setPeriod(detail.selectedOption.value ?? "300")} options={periods} /></FormField>
                    </Grid>
                  </SpaceBetween>
                </Container>
                <Container header={<Header variant="h2">Conditions</Header>}>
                  <SpaceBetween size="l">
                    <FormField label="Threshold type"><Tiles value="static" items={[{ value: "static", label: "Static", description: "Use a value as a threshold" }, { value: "anomaly", label: "Anomaly detection", description: "Use a band as a threshold", disabled: true }]} /></FormField>
                    <FormField label={`Whenever ${metric?.MetricName ?? "the metric"} is...`}><RadioGroup value={op} onChange={({ detail }) => setOp(detail.value)} items={operators.map((o) => ({ value: o.value, label: o.label, description: `${o.symbol} threshold` }))} /></FormField>
                    <FormField label="than..." description="Define the threshold value." constraintText="Must be a number."><Input type="number" value={threshold} onChange={({ detail }) => setThreshold(detail.value)} /></FormField>
                    <SpaceBetween direction="horizontal" size="xs">
                      <FormField label="Datapoints to alarm"><Input type="number" value={datapoints.alarm} onChange={({ detail }) => setDatapoints({ ...datapoints, alarm: detail.value })} /></FormField>
                      <FormField label="out of"><Input type="number" value={datapoints.eval} onChange={({ detail }) => setDatapoints({ ...datapoints, eval: detail.value })} /></FormField>
                    </SpaceBetween>
                    <FormField label="Missing data treatment"><Select selectedOption={missing.find((m) => m.value === treat) ?? null} onChange={({ detail }) => setTreat(detail.selectedOption.value ?? "missing")} options={missing} /></FormField>
                  </SpaceBetween>
                </Container>
              </SpaceBetween>
            ),
          },
          {
            title: "Configure actions",
            isOptional: true,
            content: (
              <Container header={<Header variant="h2" description="Define what happens when the alarm changes state.">Actions</Header>}>
                <SpaceBetween size="l">
                  <Alert type="info">Amazon SNS isn&apos;t available in the local emulator. You can invoke a Lambda function or enter any action ARN.</Alert>
                  {actions.map((a, i) => (
                    <Container key={i} header={<Header variant="h3" actions={<Button onClick={() => setActions(actions.filter((_, j) => j !== i))}>Remove</Button>}>Lambda action</Header>}>
                      <SpaceBetween size="m">
                        <FormField label="Alarm state trigger"><RadioGroup value={a.state} onChange={({ detail }) => setActions(actions.map((x, j) => (j === i ? { ...x, state: detail.value } : x)))} items={[{ value: "ALARM", label: "In alarm" }, { value: "OK", label: "OK" }, { value: "INSUFFICIENT_DATA", label: "Insufficient data" }]} /></FormField>
                        <FormField label="Function or action ARN">
                          <SpaceBetween size="xs">
                            <Select selectedOption={null} placeholder="Choose a Lambda function" empty="No functions" onChange={({ detail }) => setActions(actions.map((x, j) => (j === i ? { ...x, arn: detail.selectedOption.value ?? "" } : x)))} options={(functions.data?.Functions ?? []).map((f) => ({ value: f.FunctionArn ?? "", label: f.FunctionName }))} />
                            <Input value={a.arn} onChange={({ detail }) => setActions(actions.map((x, j) => (j === i ? { ...x, arn: detail.value } : x)))} />
                          </SpaceBetween>
                        </FormField>
                      </SpaceBetween>
                    </Container>
                  ))}
                  <Button onClick={() => setActions([...actions, { state: "ALARM", arn: "" }])}>Add Lambda action</Button>
                </SpaceBetween>
              </Container>
            ),
          },
          {
            title: "Add name and description",
            errorText: error,
            content: (
              <Container header={<Header variant="h2">Name and description</Header>}>
                <SpaceBetween size="l">
                  <FormField label="Alarm name"><Input value={name} disabled={Boolean(editName)} onChange={({ detail }) => setName(detail.value)} /></FormField>
                  <FormField label="Alarm description - optional" constraintText="Up to 1024 characters. Markdown is supported."><Textarea value={description} onChange={({ detail }) => setDescription(detail.value)} /></FormField>
                </SpaceBetween>
              </Container>
            ),
          },
          {
            title: "Preview and create",
            errorText: error,
            content: (
              <SpaceBetween size="l">
                <Container header={<Header variant="h2">Step 1: Metric and conditions</Header>}>
                  <SpaceBetween size="m">
                    {metricSummary}
                    <KeyValuePairs columns={3} items={[{ label: "Conditions", value: conditionText }, { label: "Datapoints to alarm", value: `${datapoints.alarm} out of ${datapoints.eval}` }, { label: "Missing data treatment", value: missing.find((m) => m.value === treat)?.label }]} />
                  </SpaceBetween>
                </Container>
                <Container header={<Header variant="h2">Step 2: Actions</Header>}>{actions.length ? actions.map((a, i) => <Box key={i}>When in {a.state}: {a.arn}</Box>) : <Box color="text-status-inactive">No actions</Box>}</Container>
                <Container header={<Header variant="h2">Step 3: Name and description</Header>}><KeyValuePairs columns={2} items={[{ label: "Name", value: name }, { label: "Description", value: description || "-" }]} /></Container>
              </SpaceBetween>
            ),
          },
        ]}
      />
    </CwLayout>
  )
}

type HistoryItem = { Timestamp?: string; HistoryItemType?: string; HistorySummary?: string; HistoryData?: string }

export function AlarmDetailPage({ name }: { name: string }) {
  const router = useRouter()
  const follow = useFollow()
  const alarms = useAws<{ MetricAlarms?: Alarm[]; CompositeAlarms?: Alarm[] }>("cloudwatch", "DescribeAlarms", { AlarmNames: [name], AlarmTypes: ["MetricAlarm", "CompositeAlarm"] }, { refetchInterval: 30_000 })
  const history = useAws<{ AlarmHistoryItems?: HistoryItem[] }>("cloudwatch", "DescribeAlarmHistory", { AlarmName: name, MaxRecords: 100, ScanBy: "TimestampDescending" })
  const a = alarms.data?.MetricAlarms?.[0] ?? alarms.data?.CompositeAlarms?.[0]
  const [range, setRange] = useState("180")
  const [deleting, setDeleting] = useState(false)
  const actionList = [...(a?.AlarmActions ?? []).map((arn) => ({ state: "In alarm", arn })), ...(a?.OKActions ?? []).map((arn) => ({ state: "OK", arn })), ...(a?.InsufficientDataActions ?? []).map((arn) => ({ state: "Insufficient data", arn }))]
  return (
    <CwLayout breadcrumbs={[{ text: "Alarms", href: "/cloudwatch/alarms" }, { text: name, href: alarmHref(name) }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <ButtonDropdown
                  items={[{ id: "edit", text: "Edit", disabled: Boolean(a?.AlarmRule) }, { id: "toggle", text: a?.ActionsEnabled ? "Disable actions" : "Enable actions" }, { id: "delete", text: "Delete" }]}
                  onItemClick={async ({ detail }) => {
                    if (detail.id === "edit") router.push(`/cloudwatch/alarms/create?edit=${encodeURIComponent(name)}`)
                    if (detail.id === "delete") setDeleting(true)
                    if (detail.id === "toggle") await callAws("cloudwatch", a?.ActionsEnabled ? "DisableAlarmActions" : "EnableAlarmActions", { AlarmNames: [name] }).then(() => { flash.success("Alarm actions updated."); void alarms.refetch() }, (e) => flash.error(errorMessage(e)))
                  }}
                >
                  Actions
                </ButtonDropdown>
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => { void alarms.refetch(); void history.refetch() }} />
              </SpaceBetween>
            }
          >
            {name}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {alarms.error && <Alert type="error">{errorMessage(alarms.error)}</Alert>}
          {!a?.AlarmRule && a?.MetricName && (
            <Container header={<Header variant="h2" description={condition(a)} actions={<SegmentedControl selectedId={range} onChange={({ detail }) => setRange(detail.selectedId)} options={graphRanges} />}>{a.MetricName}</Header>}>
              <MetricGraph metrics={[{ metric: { Namespace: a.Namespace, MetricName: a.MetricName, Dimensions: a.Dimensions }, stat: a.Statistic ?? a.ExtendedStatistic ?? "Average", period: a.Period ?? 300 }]} minutes={Number(range)} height={220} />
            </Container>
          )}
          <Container header={<Header variant="h2">Details</Header>}>
            <KeyValuePairs
              columns={3}
              items={[
                { label: "Name", value: name },
                { label: "Type", value: a?.AlarmRule ? "Composite alarm" : "Metric alarm" },
                { label: "Description", value: a?.AlarmDescription || "-" },
                { label: "State", value: <AlarmState value={a?.StateValue} /> },
                { label: "State reason", value: a?.StateReason ?? "-" },
                { label: "Last state update", value: consoleDate(a?.StateUpdatedTimestamp) },
                ...(a?.AlarmRule
                  ? [{ label: "Alarm rule", value: a.AlarmRule }]
                  : [
                      { label: "Threshold", value: a ? condition(a) : "-" },
                      { label: "Namespace", value: a?.Namespace ?? "-" },
                      { label: "Metric name", value: a?.MetricName ?? "-" },
                      { label: "Dimensions", value: a ? dimensionText(a) : "-" },
                      { label: "Statistic", value: a?.Statistic ?? a?.ExtendedStatistic ?? "-" },
                      { label: "Period", value: periods.find((p) => p.value === String(a?.Period))?.label ?? `${a?.Period} seconds` },
                      { label: "Datapoints to alarm", value: `${a?.DatapointsToAlarm ?? a?.EvaluationPeriods} out of ${a?.EvaluationPeriods}` },
                      { label: "Missing data treatment", value: missing.find((m) => m.value === (a?.TreatMissingData ?? "missing"))?.label },
                    ]),
                { label: "Actions", value: a?.ActionsEnabled ? <StatusIndicator type="success">Actions enabled</StatusIndicator> : <StatusIndicator type="stopped">Actions disabled</StatusIndicator> },
                { label: "ARN", value: <Copyable value={a?.AlarmArn} /> },
              ]}
            />
          </Container>
          <Tabs
            tabs={[
              { id: "actions", label: "Actions", content: <Table header={<Header variant="h2" counter={`(${actionList.length})`}>Actions</Header>} items={actionList} columnDefinitions={[{ id: "state", header: "Trigger", cell: (x) => x.state }, { id: "arn", header: "Action", cell: (x) => (x.arn.includes(":lambda:") ? <Link href={`/lambda/functions/${encodeURIComponent(x.arn.split(":")[6] ?? "")}`} onFollow={follow}>{x.arn}</Link> : x.arn) }]} empty={<Box textAlign="center" color="inherit">No actions</Box>} /> },
              {
                id: "history",
                label: "History",
                content: (
                  <Table<HistoryItem>
                    header={<Header variant="h2" counter={`(${history.data?.AlarmHistoryItems?.length ?? 0})`}>History</Header>}
                    items={history.data?.AlarmHistoryItems ?? []}
                    loading={history.isPending}
                    wrapLines
                    columnDefinitions={[{ id: "date", header: "Date", cell: (h) => consoleDate(h.Timestamp) }, { id: "type", header: "Type", cell: (h) => h.HistoryItemType }, { id: "desc", header: "Description", cell: (h) => h.HistorySummary }]}
                    empty={<Box textAlign="center" color="inherit">No history</Box>}
                  />
                ),
              },
              { id: "parents", label: "Parent alarms", content: <Box color="text-status-inactive">This alarm isn&apos;t part of a composite alarm.</Box> },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      <EditModal visible={deleting} title={`Delete ${name}?`} saveLabel="Delete" onDismiss={() => setDeleting(false)} success={`Alarm ${name} deleted.`} onSave={async () => { await callAws("cloudwatch", "DeleteAlarms", { AlarmNames: [name] }); router.push("/cloudwatch/alarms") }}>
        <Box>This can&apos;t be undone.</Box>
      </EditModal>
    </CwLayout>
  )
}
