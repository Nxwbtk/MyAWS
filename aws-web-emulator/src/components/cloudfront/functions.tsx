"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ColumnLayout from "@cloudscape-design/components/column-layout"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Modal from "@cloudscape-design/components/modal"
import RadioGroup from "@cloudscape-design/components/radio-group"
import SegmentedControl from "@cloudscape-design/components/segmented-control"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import TextFilter from "@cloudscape-design/components/text-filter"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { CodeView, EditModal, pretty } from "@/components/console/sections"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { useDistributions } from "@/components/cloudfront/distributions"
import { CfLayout, items, toList, updateConfig, type Behavior } from "@/components/cloudfront/shared"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type FunctionSummary = {
  Name: string
  Status?: string
  FunctionConfig: { Comment?: string; Runtime?: string; KeyValueStoreAssociations?: { Quantity?: number; Items?: { KeyValueStoreARN: string }[] } }
  FunctionMetadata: { FunctionARN: string; Stage?: string; CreatedTime?: string; LastModifiedTime?: string }
}

const enc = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}
const dec = (blob: unknown) => {
  if (typeof blob === "string") return blob
  const b = blob as { data?: string } | undefined
  if (!b?.data) return ""
  return new TextDecoder().decode(Uint8Array.from(atob(b.data), (c) => c.charCodeAt(0)))
}

const starter = `function handler(event) {
    // NOTE: This example function is for a viewer request event trigger.
    // Choose viewer request for event trigger when you associate this function with a distribution.
    var response = {
        statusCode: 200,
        statusDescription: 'OK',
        headers: {
            'cloudfront-functions': { value: 'generated-by-CloudFront-Functions' }
        }
    };
    return response;
}`

function useFunctions(stage?: string) {
  return useQuery({
    queryKey: ["emulator", "cloudfront", "functions", stage ?? "all"],
    queryFn: async () => {
      const r = await callAws<{ FunctionList?: { Items?: FunctionSummary[] } }>("cloudfront", "ListFunctions", stage ? { Stage: stage } : {})
      return r.FunctionList?.Items ?? []
    },
  })
}

function DeleteFunctionModal({ name, onDismiss, onDone }: { name: string; onDismiss: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <Modal
      visible
      header="Delete function"
      onDismiss={onDismiss}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true)
                setError(undefined)
                try {
                  const d = await callAws<{ ETag: string }>("cloudfront", "DescribeFunction", { Name: name, Stage: "DEVELOPMENT" })
                  await callAws("cloudfront", "DeleteFunction", { Name: name, IfMatch: d.ETag })
                  flash.success(`Successfully deleted function ${name}.`)
                  onDone()
                } catch (e) {
                  setError(errorMessage(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box>Delete function <b>{name}</b>? You can&apos;t delete a function that is associated with a distribution.</Box>
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  )
}

export function FunctionsPage() {
  const follow = useFollow()
  const router = useRouter()
  const fns = useFunctions()
  const [selected, setSelected] = useState<(FunctionSummary & { live?: boolean })[]>([])
  const [filter, setFilter] = useState("")
  const [deleting, setDeleting] = useState(false)
  const rows = useMemo(() => {
    const byName = new Map<string, FunctionSummary & { live?: boolean }>()
    for (const f of fns.data ?? []) {
      const prev = byName.get(f.Name)
      if (f.FunctionMetadata.Stage === "DEVELOPMENT" || !prev) byName.set(f.Name, { ...f, live: prev?.live || f.FunctionMetadata.Stage === "LIVE" })
      else prev.live = true
    }
    return [...byName.values()].filter((f) => !filter || f.Name.toLowerCase().includes(filter.toLowerCase()) || f.FunctionConfig.Comment?.toLowerCase().includes(filter.toLowerCase()))
  }, [fns.data, filter])
  return (
    <CfLayout breadcrumbs={[{ text: "Functions", href: "/cloudfront/functions" }]} contentType="table">
      <SpaceBetween size="l">
        <Table
          variant="full-page"
          loading={fns.isPending}
          selectionType="single"
          trackBy="Name"
          selectedItems={selected}
          onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
          items={rows}
          header={
            <Header
              variant="awsui-h1-sticky"
              counter={`(${rows.length})`}
              description="CloudFront Functions are lightweight JavaScript functions that run at CloudFront edge locations for high-scale, latency-sensitive customizations."
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void fns.refetch()} />
                  <Button disabled={selected.length !== 1} onClick={() => setDeleting(true)}>Delete</Button>
                  <Button variant="primary" href="/cloudfront/functions/create" onFollow={follow}>Create function</Button>
                </SpaceBetween>
              }
            >
              Functions
            </Header>
          }
          filter={<TextFilter filteringText={filter} filteringPlaceholder="Find functions" onChange={({ detail }) => setFilter(detail.filteringText)} />}
          columnDefinitions={[
            { id: "name", header: "Name", cell: (f) => <Link href={`/cloudfront/functions/${encodeURIComponent(f.Name)}`} onFollow={follow}>{f.Name}</Link> },
            { id: "desc", header: "Description", cell: (f) => f.FunctionConfig.Comment || "–" },
            { id: "status", header: "Status", cell: (f) => (f.live ? <StatusIndicator type="success">Deployed</StatusIndicator> : <StatusIndicator type="stopped">Not published</StatusIndicator>) },
            { id: "runtime", header: "Runtime", cell: (f) => f.FunctionConfig.Runtime ?? "–" },
            { id: "modified", header: "Last modified", cell: (f) => consoleDate(f.FunctionMetadata.LastModifiedTime) },
          ]}
          empty={<Box textAlign="center" color="inherit"><SpaceBetween size="xs"><b>No functions</b><Button onClick={() => router.push("/cloudfront/functions/create")}>Create function</Button></SpaceBetween></Box>}
        />
      </SpaceBetween>
      {deleting && selected[0] && <DeleteFunctionModal name={selected[0].Name} onDismiss={() => setDeleting(false)} onDone={() => { setDeleting(false); setSelected([]); void fns.refetch() }} />}
    </CfLayout>
  )
}

export function CreateFunctionPage() {
  const client = useQueryClient()
  const router = useRouter()
  const [name, setName] = useState("")
  const [comment, setComment] = useState("")
  const [runtime, setRuntime] = useState("cloudfront-js-2.0")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <CfLayout breadcrumbs={[{ text: "Functions", href: "/cloudfront/functions" }, { text: "Create function", href: "/cloudfront/functions/create" }]} contentType="form">
      <Form
        header={<Header variant="h1">Create function</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push("/cloudfront/functions")}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!/^[A-Za-z0-9_-]{1,64}$/.test(name)}
              onClick={async () => {
                setBusy(true)
                setError(undefined)
                try {
                  await callAws("cloudfront", "CreateFunction", { Name: name, FunctionConfig: { Comment: comment, Runtime: runtime }, FunctionCode: enc(starter) })
                  await client.invalidateQueries({ queryKey: ["emulator", "cloudfront", "functions"] })
                  flash.success(`Successfully created function ${name}.`)
                  router.push(`/cloudfront/functions/${encodeURIComponent(name)}`)
                } catch (e) {
                  setError(errorMessage(e))
                  setBusy(false)
                }
              }}
            >
              Create function
            </Button>
          </SpaceBetween>
        }
      >
        <Container header={<Header variant="h2">Details</Header>}>
          <SpaceBetween size="l">
            <FormField label="Name" constraintText="The name can have up to 64 characters. Valid characters: letters, numbers, hyphens (-), and underscores (_)."><Input value={name} placeholder="MyFunctionName" onChange={({ detail }) => setName(detail.value)} /></FormField>
            <FormField label={<>Description <i>- optional</i></>}><Input value={comment} onChange={({ detail }) => setComment(detail.value)} /></FormField>
            <FormField label="Runtime">
              <RadioGroup value={runtime} onChange={({ detail }) => setRuntime(detail.value)} items={[{ value: "cloudfront-js-2.0", label: "cloudfront-js-2.0", description: "Supports ES 5.1 plus some ES 6–12 features, and key value stores." }, { value: "cloudfront-js-1.0", label: "cloudfront-js-1.0", description: "Compliant with ES 5.1." }]} />
            </FormField>
          </SpaceBetween>
        </Container>
      </Form>
    </CfLayout>
  )
}

const sampleEvent = (type: string, method: string, uri: string, headers: string) => {
  const h: Record<string, { value: string }> = {}
  for (const line of headers.split("\n")) {
    const [k, ...v] = line.split(":")
    if (k?.trim()) h[k.trim().toLowerCase()] = { value: v.join(":").trim() }
  }
  const base = { version: "1.0", context: { eventType: type }, viewer: { ip: "1.2.3.4" }, request: { method, uri, querystring: {}, headers: h, cookies: {} } }
  return type === "viewer-response" ? { ...base, response: { statusCode: 200, statusDescription: "OK", headers: {}, cookies: {} } } : base
}

function TestTab({ name, stage: initialStage }: { name: string; stage: string }) {
  const [stage, setStage] = useState(initialStage)
  const [type, setType] = useState("viewer-request")
  const [method, setMethod] = useState("GET")
  const [uri, setUri] = useState("/index.html")
  const [headers, setHeaders] = useState("")
  const [mode, setMode] = useState("visual")
  const [json, setJson] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ output?: string; error?: string; logs?: string[]; compute?: string }>()
  const [error, setError] = useState<string>()
  return (
    <SpaceBetween size="l">
      <Container
        header={
          <Header
            variant="h2"
            actions={
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(undefined)
                  try {
                    const event = mode === "json" ? JSON.parse(json || "{}") : sampleEvent(type, method, uri, headers)
                    const d = await callAws<{ ETag: string }>("cloudfront", "DescribeFunction", { Name: name, Stage: stage })
                    const r = await callAws<{ TestResult?: { FunctionOutput?: string; FunctionErrorMessage?: string; FunctionExecutionLogs?: string[]; ComputeUtilization?: string } }>("cloudfront", "TestFunction", { Name: name, IfMatch: d.ETag, Stage: stage, EventObject: enc(JSON.stringify(event)) })
                    setResult({ output: r.TestResult?.FunctionOutput, error: r.TestResult?.FunctionErrorMessage, logs: r.TestResult?.FunctionExecutionLogs, compute: r.TestResult?.ComputeUtilization })
                  } catch (e) {
                    setError(errorMessage(e))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Test function
              </Button>
            }
          >
            Test event
          </Header>
        }
      >
        <SpaceBetween size="l">
          <ColumnLayout columns={2}>
            <FormField label="Event type"><Select expandToViewport selectedOption={{ value: type, label: type === "viewer-request" ? "Viewer request" : "Viewer response" }} options={[{ value: "viewer-request", label: "Viewer request" }, { value: "viewer-response", label: "Viewer response" }]} onChange={({ detail }) => setType(detail.selectedOption.value ?? "viewer-request")} /></FormField>
            <FormField label="Stage"><SegmentedControl selectedId={stage} onChange={({ detail }) => setStage(detail.selectedId)} options={[{ id: "DEVELOPMENT", text: "Development" }, { id: "LIVE", text: "Live" }]} /></FormField>
          </ColumnLayout>
          <SegmentedControl selectedId={mode} onChange={({ detail }) => { if (detail.selectedId === "json" && !json) setJson(JSON.stringify(sampleEvent(type, method, uri, headers), null, 2)); setMode(detail.selectedId) }} options={[{ id: "visual", text: "Visual editor" }, { id: "json", text: "JSON editor" }]} />
          {mode === "visual" ? (
            <SpaceBetween size="l">
              <ColumnLayout columns={2}>
                <FormField label="HTTP method"><Select expandToViewport selectedOption={{ value: method, label: method }} options={["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"].map((m) => ({ value: m, label: m }))} onChange={({ detail }) => setMethod(detail.selectedOption.value ?? "GET")} /></FormField>
                <FormField label="URL path"><Input value={uri} onChange={({ detail }) => setUri(detail.value)} /></FormField>
              </ColumnLayout>
              <FormField label="Headers" description="One header per line, in the form name: value." stretch><Textarea rows={3} value={headers} placeholder="host: www.example.com" onChange={({ detail }) => setHeaders(detail.value)} /></FormField>
            </SpaceBetween>
          ) : (
            <div className="myaws-lambda-code"><Textarea rows={14} value={json} onChange={({ detail }) => setJson(detail.value)} /></div>
          )}
        </SpaceBetween>
      </Container>
      {error && <Alert type="error" header="Test failed">{error}</Alert>}
      {result && (
        <Container header={<Header variant="h2">Execution result</Header>}>
          <SpaceBetween size="l">
            <KeyValuePairs columns={2} items={[{ label: "Status", value: result.error ? <StatusIndicator type="error">Failed</StatusIndicator> : <StatusIndicator type="success">Succeeded</StatusIndicator> }, { label: "Compute utilization", value: result.compute ?? "–" }]} />
            {result.error && <Alert type="error">{result.error}</Alert>}
            <FormField label="Output" stretch><CodeView value={result.output ? pretty(result.output) : ""} /></FormField>
            <FormField label="Execution logs" stretch><CodeView value={(result.logs ?? []).join("\n")} empty="No logs" /></FormField>
          </SpaceBetween>
        </Container>
      )}
    </SpaceBetween>
  )
}

function AssociationsTab({ arn }: { arn: string }) {
  const follow = useFollow()
  const dists = useDistributions()
  const [form, setForm] = useState<{ dist: string; event: string; behavior: string }>()
  const details = useQuery({
    queryKey: ["emulator", "cloudfront", "fn-assoc", arn, (dists.data ?? []).map((d) => d.Id).join(",")],
    enabled: Boolean(dists.data),
    queryFn: async () => {
      const out: { dist: string; behavior: string; event: string }[] = []
      for (const d of dists.data ?? []) {
        const r = await callAws<{ DistributionConfig: { DefaultCacheBehavior: Behavior; CacheBehaviors?: { Items?: Behavior[] } } }>("cloudfront", "GetDistributionConfig", { Id: d.Id })
        const bs = [{ ...r.DistributionConfig.DefaultCacheBehavior, PathPattern: "Default (*)" }, ...items(r.DistributionConfig.CacheBehaviors)]
        for (const b of bs) for (const f of items(b.FunctionAssociations)) if (f.FunctionARN === arn) out.push({ dist: d.Id, behavior: b.PathPattern ?? "Default (*)", event: f.EventType })
      }
      return out
    },
  })
  const target = (dists.data ?? []).find((d) => d.Id === form?.dist)
  const behaviorsQ = useAws<{ DistributionConfig?: { CacheBehaviors?: { Items?: Behavior[] } } }>("cloudfront", "GetDistributionConfig", { Id: form?.dist }, { enabled: Boolean(form?.dist) })
  const behaviorOptions = [{ value: "", label: "Default (*)" }, ...items(behaviorsQ.data?.DistributionConfig?.CacheBehaviors).map((b) => ({ value: b.PathPattern ?? "", label: b.PathPattern ?? "" }))]
  const change = async (dist: string, behavior: string, event: string, add: boolean) => {
    await updateConfig(dist, (c) => {
      const apply = (b: Behavior) => {
        const list = items(b.FunctionAssociations).filter((f) => f.EventType !== event)
        b.FunctionAssociations = toList(add ? [...list, { FunctionARN: arn.replace(/:\d+$/, ""), EventType: event }] : list.filter((f) => f.FunctionARN !== arn))
      }
      if (!behavior || behavior === "Default (*)") apply(c.DefaultCacheBehavior)
      else items(c.CacheBehaviors).filter((b) => b.PathPattern === behavior).forEach(apply)
    })
  }
  return (
    <>
      <Table
        header={<Header variant="h2" counter={`(${details.data?.length ?? 0})`} actions={<Button onClick={() => setForm({ dist: "", event: "viewer-request", behavior: "" })}>Add association</Button>}>Associated distributions</Header>}
        loading={dists.isPending || details.isPending}
        items={details.data ?? []}
        columnDefinitions={[
          { id: "dist", header: "Distribution", cell: (a) => <Link href={`/cloudfront/distributions/${a.dist}?tab=behaviors`} onFollow={follow}>{a.dist}</Link> },
          { id: "behavior", header: "Cache behavior", cell: (a) => a.behavior },
          { id: "event", header: "Event type", cell: (a) => a.event },
          { id: "remove", header: "", cell: (a) => <Button variant="inline-link" onClick={async () => { try { await change(a.dist, a.behavior, a.event, false); flash.success("Association removed."); await details.refetch() } catch (e) { flash.error(errorMessage(e)) } }}>Remove</Button> },
        ]}
        empty={<Box textAlign="center" color="inherit">This function isn&apos;t associated with any distribution. Publish the function first, then add an association.</Box>}
      />
      <EditModal
        visible={Boolean(form)}
        title="Add association"
        saveLabel="Add association"
        saveDisabled={!form?.dist}
        onDismiss={() => setForm(undefined)}
        success="Successfully added association."
        onSave={async () => {
          if (!form) return
          await change(form.dist, form.behavior, form.event, true)
          await details.refetch()
        }}
      >
        {form && (
          <SpaceBetween size="l">
            <FormField label="Distribution"><Select expandToViewport selectedOption={target ? { value: target.Id, label: target.Id, description: target.DomainName } : null} placeholder="Choose distribution" options={(dists.data ?? []).map((d) => ({ value: d.Id, label: d.Id, description: d.Comment || d.DomainName }))} onChange={({ detail }) => setForm({ ...form, dist: detail.selectedOption.value ?? "", behavior: "" })} /></FormField>
            <FormField label="Event type"><Select expandToViewport selectedOption={{ value: form.event, label: form.event === "viewer-request" ? "Viewer request" : "Viewer response" }} options={[{ value: "viewer-request", label: "Viewer request" }, { value: "viewer-response", label: "Viewer response" }]} onChange={({ detail }) => setForm({ ...form, event: detail.selectedOption.value ?? "viewer-request" })} /></FormField>
            <FormField label="Cache behavior"><Select expandToViewport disabled={!form.dist} selectedOption={behaviorOptions.find((b) => b.value === form.behavior) ?? null} options={behaviorOptions} onChange={({ detail }) => setForm({ ...form, behavior: detail.selectedOption.value ?? "" })} /></FormField>
          </SpaceBetween>
        )}
      </EditModal>
    </>
  )
}

export function FunctionDetailPage({ name, tab }: { name: string; tab: string }) {
  const router = useRouter()
  const dev = useAws<{ FunctionSummary?: FunctionSummary; ETag?: string }>("cloudfront", "DescribeFunction", { Name: name, Stage: "DEVELOPMENT" })
  const live = useAws<{ FunctionSummary?: FunctionSummary }>("cloudfront", "DescribeFunction", { Name: name, Stage: "LIVE" }, { retry: false })
  const code = useAws<{ FunctionCode?: unknown }>("cloudfront", "GetFunction", { Name: name, Stage: "DEVELOPMENT" })
  const liveArn = live.data?.FunctionSummary?.FunctionMetadata.FunctionARN
  const fn = dev.data?.FunctionSummary
  const [draft, setDraft] = useState<string>()
  const [comment, setComment] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [deleting, setDeleting] = useState(false)
  const source = draft ?? dec(code.data?.FunctionCode)
  const refresh = async () => { await Promise.all([dev.refetch(), live.refetch(), code.refetch()]) }
  const save = async () => {
    if (!fn) return
    setBusy("save")
    try {
      const d = await callAws<{ ETag: string }>("cloudfront", "DescribeFunction", { Name: name, Stage: "DEVELOPMENT" })
      await callAws("cloudfront", "UpdateFunction", { Name: name, IfMatch: d.ETag, FunctionConfig: { ...fn.FunctionConfig, Comment: comment ?? fn.FunctionConfig.Comment ?? "" }, FunctionCode: enc(source) })
      flash.success(`Successfully saved changes to function ${name}.`)
      setDraft(undefined)
      await refresh()
    } catch (e) {
      flash.error(errorMessage(e))
    } finally {
      setBusy(undefined)
    }
  }
  const publish = async () => {
    setBusy("publish")
    try {
      const d = await callAws<{ ETag: string }>("cloudfront", "DescribeFunction", { Name: name, Stage: "DEVELOPMENT" })
      await callAws("cloudfront", "PublishFunction", { Name: name, IfMatch: d.ETag })
      flash.success(`Successfully published function ${name}.`)
      await refresh()
    } catch (e) {
      flash.error(errorMessage(e))
    } finally {
      setBusy(undefined)
    }
  }
  return (
    <CfLayout breadcrumbs={[{ text: "Functions", href: "/cloudfront/functions" }, { text: name, href: `/cloudfront/functions/${encodeURIComponent(name)}` }]}>
      <ContentLayout header={<Header variant="h1" actions={fn && <Button onClick={() => setDeleting(true)}>Delete</Button>}>{name}</Header>}>
        {dev.isPending ? (
          <StatusIndicator type="loading">Loading</StatusIndicator>
        ) : !fn ? (
          <Alert type="error" header="Function not found">{name} doesn&apos;t exist in the local emulator.</Alert>
        ) : (
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Details</Header>}>
              <KeyValuePairs
                columns={4}
                items={[
                  { label: "Description", value: fn.FunctionConfig.Comment || "–" },
                  { label: "Runtime", value: fn.FunctionConfig.Runtime ?? "–" },
                  { label: "Development ARN", value: <Copyable value={fn.FunctionMetadata.FunctionARN} /> },
                  { label: "Live ARN", value: liveArn ? <Copyable value={liveArn} /> : "Not published" },
                  { label: "Created", value: consoleDate(fn.FunctionMetadata.CreatedTime) },
                  { label: "Last modified", value: consoleDate(fn.FunctionMetadata.LastModifiedTime) },
                  { label: "Status", value: liveArn ? <StatusIndicator type="success">Deployed</StatusIndicator> : <StatusIndicator type="stopped">Not published</StatusIndicator> },
                ]}
              />
            </Container>
            <Tabs
              activeTabId={tab}
              onChange={({ detail }) => router.replace(`/cloudfront/functions/${encodeURIComponent(name)}?tab=${detail.activeTabId}`)}
              tabs={[
                {
                  id: "build",
                  label: "Build",
                  content: (
                    <Container
                      header={
                        <Header
                          variant="h2"
                          description="Edit the function code in the development stage. Save the changes, test them, and then publish to the live stage."
                          actions={<Button variant="primary" loading={busy === "save"} disabled={draft === undefined && comment === undefined} onClick={() => void save()}>Save changes</Button>}
                        >
                          Function code
                        </Header>
                      }
                    >
                      <SpaceBetween size="l">
                        <FormField label="Description"><Input value={comment ?? fn.FunctionConfig.Comment ?? ""} onChange={({ detail }) => setComment(detail.value)} /></FormField>
                        {code.isPending ? <StatusIndicator type="loading">Loading code</StatusIndicator> : <div className="myaws-lambda-code"><Textarea rows={22} value={source} onChange={({ detail }) => setDraft(detail.value)} spellcheck={false} /></div>}
                        {draft !== undefined && <Alert type="warning">You have unsaved changes.</Alert>}
                      </SpaceBetween>
                    </Container>
                  ),
                },
                { id: "test", label: "Test", content: <TestTab name={name} stage="DEVELOPMENT" /> },
                {
                  id: "publish",
                  label: "Publish",
                  content: (
                    <SpaceBetween size="l">
                      <Container header={<Header variant="h2" description="Publishing copies the function code from the development stage to the live stage. All distributions associated with the function use the live stage." actions={<Button variant="primary" loading={busy === "publish"} onClick={() => void publish()}>Publish function</Button>}>Publish</Header>}>
                        <KeyValuePairs columns={2} items={[{ label: "Live stage", value: liveArn ? `Last published ${consoleDate(live.data?.FunctionSummary?.FunctionMetadata.LastModifiedTime)}` : "Not published" }, { label: "Development stage", value: `Last modified ${consoleDate(fn.FunctionMetadata.LastModifiedTime)}` }]} />
                      </Container>
                      {liveArn ? <AssociationsTab arn={liveArn} /> : <Alert type="info">Publish the function to associate it with a distribution.</Alert>}
                    </SpaceBetween>
                  ),
                },
              ]}
            />
          </SpaceBetween>
        )}
        {deleting && <DeleteFunctionModal name={name} onDismiss={() => setDeleting(false)} onDone={() => router.push("/cloudfront/functions")} />}
      </ContentLayout>
    </CfLayout>
  )
}
