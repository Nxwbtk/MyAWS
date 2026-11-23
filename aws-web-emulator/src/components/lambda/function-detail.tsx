"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import ExpandableSection from "@cloudscape-design/components/expandable-section"
import FormField from "@cloudscape-design/components/form-field"
import Grid from "@cloudscape-design/components/grid"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SideNavigation from "@cloudscape-design/components/side-navigation"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { CodeView, EditModal, JsonField, Section, pretty } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { DeleteFunctionsModal } from "@/components/lambda/functions"
import { LambdaLayout } from "@/components/lambda/lambda-app"
import { decodePayload, encodeText, fetchCode, fnHref, lambdaDate, runtimeLabel, runtimes, unzipBase64, waitForUpdate, zipFiles, type FunctionConfig } from "@/components/lambda/shared"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type GetFunction = { Configuration?: FunctionConfig; Tags?: Record<string, string>; Concurrency?: { ReservedConcurrentExecutions?: number }; Code?: { ImageUri?: string; RepositoryType?: string } }
type Mapping = { UUID?: string; EventSourceArn?: string; State?: string; BatchSize?: number; LastModified?: string }
type UrlConfig = { FunctionUrl?: string; AuthType?: string; Cors?: Record<string, unknown>; InvokeMode?: string; CreationTime?: string }

export function FunctionDetailPage({ name, tab, sub }: { name: string; tab: string; sub?: string }) {
  const router = useRouter()
  const fn = useAws<GetFunction>("lambda", "GetFunction", { FunctionName: name }, { refetchInterval: (q) => (q.state.data?.Configuration?.State === "Pending" || q.state.data?.Configuration?.LastUpdateStatus === "InProgress" ? 2000 : false) })
  const url = useAws<UrlConfig>("lambda", "GetFunctionUrlConfig", { FunctionName: name }, { retry: false })
  const mappings = useAws<{ EventSourceMappings?: Mapping[] }>("lambda", "ListEventSourceMappings", { FunctionName: name })
  const [modal, setModal] = useState<string>()
  const [alias, setAlias] = useState({ name: "", version: "$LATEST", description: "" })
  const [versionDesc, setVersionDesc] = useState("")
  const c = fn.data?.Configuration
  const base = fnHref(name)
  const throttled = fn.data?.Concurrency?.ReservedConcurrentExecutions === 0
  const refresh = () => void fn.refetch()
  return (
    <LambdaLayout breadcrumbs={[{ text: "Functions", href: "/lambda/functions" }, { text: name, href: base }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={async () => { await callAws("lambda", throttled ? "DeleteFunctionConcurrency" : "PutFunctionConcurrency", throttled ? { FunctionName: name } : { FunctionName: name, ReservedConcurrentExecutions: 0 }).then(() => { flash.success(throttled ? "Function unthrottled." : "Function throttled. Reserved concurrency is set to 0."); refresh() }, (e) => flash.error(errorMessage(e))) }}>{throttled ? "Unthrottle" : "Throttle"}</Button>
                <ButtonDropdown items={[{ id: "arn", text: "Copy ARN" }]} onItemClick={() => { void navigator.clipboard.writeText(c?.FunctionArn ?? ""); flash.success("Function ARN copied.") }}>Copy ARN</ButtonDropdown>
                <ButtonDropdown
                  items={[
                    { id: "publish", text: "Publish new version" },
                    { id: "alias", text: "Create alias" },
                    { id: "export", text: "Export function", disabled: true, disabledReason: "AWS SAM and CloudFormation export isn't available in the local emulator." },
                    { id: "delete", text: "Delete function" },
                  ]}
                  onItemClick={({ detail }) => {
                    if (detail.id === "alias") setAlias({ name: "", version: "$LATEST", description: "" })
                    if (detail.id === "publish") setVersionDesc("")
                    setModal(detail.id)
                  }}
                >
                  Actions
                </ButtonDropdown>
              </SpaceBetween>
            }
          >
            {name}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {fn.error && <Alert type="error">{errorMessage(fn.error)}</Alert>}
          {throttled && <Alert type="warning">This function is throttled. Its reserved concurrency is set to 0, so invocations are rejected.</Alert>}
          {c?.State === "Pending" && <Alert type="info">The function is being created. You can&apos;t invoke or modify it until it&apos;s active.</Alert>}
          <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>}>Function overview</Header>}>
            <Grid gridDefinition={[{ colspan: { default: 12, s: 7 } }, { colspan: { default: 12, s: 5 } }]}>
              <div className="myaws-lambda-diagram">
                <div className="myaws-lambda-node">
                  <Box fontWeight="bold">{name}</Box>
                  <Box fontSize="body-s" color="text-body-secondary">Layers ({c?.Layers?.length ?? 0})</Box>
                </div>
                <SpaceBetween direction="horizontal" size="xs">
                  <Button iconName="add-plus" onClick={() => router.replace(`${base}?tab=configuration&section=triggers`)}>Add trigger</Button>
                  <Button iconName="add-plus" onClick={() => router.replace(`${base}?tab=configuration&section=destinations`)}>Add destination</Button>
                </SpaceBetween>
                {(mappings.data?.EventSourceMappings?.length ?? 0) > 0 && <Box fontSize="body-s">Triggers: {mappings.data?.EventSourceMappings?.map((m) => m.EventSourceArn?.split(":")[2]).join(", ")}</Box>}
              </div>
              <KeyValuePairs
                items={[
                  { label: "Description", value: c?.Description || "-" },
                  { label: "Last modified", value: lambdaDate(c?.LastModified) },
                  { label: "Function ARN", value: <Copyable value={c?.FunctionArn} /> },
                  { label: "Function URL", value: url.data?.FunctionUrl ? <Copyable value={url.data.FunctionUrl} /> : "-" },
                ]}
              />
            </Grid>
          </Container>
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => router.replace(`${base}?tab=${detail.activeTabId}`)}
            tabs={[
              { id: "code", label: "Code", content: <CodeTab name={name} config={c} imageUri={fn.data?.Code?.ImageUri} refresh={refresh} onTest={() => router.replace(`${base}?tab=test`)} /> },
              { id: "test", label: "Test", content: <TestTab name={name} /> },
              { id: "monitor", label: "Monitor", content: <MonitorTab name={name} config={c} /> },
              { id: "configuration", label: "Configuration", content: <ConfigurationTab name={name} data={fn.data} url={url.data} refreshUrl={() => void url.refetch()} mappings={mappings.data?.EventSourceMappings ?? []} refreshMappings={() => void mappings.refetch()} section={sub ?? "general"} onSection={(s) => router.replace(`${base}?tab=configuration&section=${s}`)} refresh={refresh} /> },
              { id: "aliases", label: "Aliases", content: <AliasesTab name={name} onCreate={() => { setAlias({ name: "", version: "$LATEST", description: "" }); setModal("alias") }} /> },
              { id: "versions", label: "Versions", content: <VersionsTab name={name} onPublish={() => { setVersionDesc(""); setModal("publish") }} /> },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      {modal === "delete" && <DeleteFunctionsModal names={[name]} close={() => setModal(undefined)} onDone={() => router.push("/lambda/functions")} />}
      <EditModal visible={modal === "publish"} title="Publish new version" saveLabel="Publish" onDismiss={() => setModal(undefined)} success="Successfully published a new version." onSave={async () => { await callAws("lambda", "PublishVersion", { FunctionName: name, ...(versionDesc ? { Description: versionDesc } : {}) }); router.replace(`${base}?tab=versions`) }}>
        <Box>Publishing a version saves the function&apos;s code and configuration as an immutable snapshot.</Box>
        <FormField label="Version description"><Input value={versionDesc} onChange={({ detail }) => setVersionDesc(detail.value)} /></FormField>
      </EditModal>
      <AliasModal visible={modal === "alias"} name={name} value={alias} onChange={setAlias} close={() => setModal(undefined)} onDone={() => router.replace(`${base}?tab=aliases`)} />
    </LambdaLayout>
  )
}

function AliasModal({ visible, name, value, onChange, close, onDone, editing }: { visible: boolean; name: string; value: { name: string; version: string; description: string }; onChange: (v: { name: string; version: string; description: string }) => void; close: () => void; onDone: () => void; editing?: boolean }) {
  const versions = useAws<{ Versions?: { Version?: string; Description?: string }[] }>("lambda", "ListVersionsByFunction", { FunctionName: name }, { enabled: visible })
  return (
    <EditModal
      visible={visible}
      title={editing ? `Edit alias ${value.name}` : "Create alias"}
      saveLabel="Save"
      saveDisabled={!value.name}
      onDismiss={close}
      success={editing ? "Alias updated." : `Successfully created alias ${value.name}.`}
      onSave={async () => {
        await callAws("lambda", editing ? "UpdateAlias" : "CreateAlias", { FunctionName: name, Name: value.name, FunctionVersion: value.version, Description: value.description })
        onDone()
      }}
    >
      <FormField label="Name"><Input value={value.name} disabled={editing} onChange={({ detail }) => onChange({ ...value, name: detail.value })} /></FormField>
      <FormField label="Description"><Input value={value.description} onChange={({ detail }) => onChange({ ...value, description: detail.value })} /></FormField>
      <FormField label="Version"><Select selectedOption={{ value: value.version, label: value.version }} onChange={({ detail }) => onChange({ ...value, version: detail.selectedOption.value ?? "$LATEST" })} options={(versions.data?.Versions ?? [{ Version: "$LATEST" }]).map((v) => ({ value: v.Version ?? "", label: v.Version, description: v.Description }))} /></FormField>
    </EditModal>
  )
}

function CodeTab({ name, config, imageUri, refresh, onTest }: { name: string; config?: FunctionConfig; imageUri?: string; refresh: () => void; onTest: () => void }) {
  const code = useQuery({ queryKey: ["emulator", "lambda", "code", name, config?.CodeSha256], enabled: Boolean(config) && config?.PackageType !== "Image", queryFn: async () => unzipBase64((await fetchCode(name)).zip ?? "") })
  const [files, setFiles] = useState<Record<string, string>>()
  const [active, setActive] = useState<string>()
  const [deploying, setDeploying] = useState(false)
  const [modal, setModal] = useState<string>()
  const [settings, setSettings] = useState({ runtime: "", handler: "", arch: "x86_64" })
  const [newFile, setNewFile] = useState("")
  const editable = config?.Runtime && /^(nodejs|python|ruby)/.test(config.Runtime)
  useEffect(() => {
    if (!code.data) return
    // Load the deployed package into the editor when it (re)loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFiles(code.data)
    setActive((current) => (current && current in code.data ? current : Object.keys(code.data).find((f) => /(index|lambda_function)\./.test(f)) ?? Object.keys(code.data)[0]))
  }, [code.data])
  const dirty = files && code.data && JSON.stringify(files) !== JSON.stringify(code.data)
  const deploy = async () => {
    if (!files) return
    setDeploying(true)
    try {
      await callAws("lambda", "UpdateFunctionCode", { FunctionName: name, ZipFile: zipFiles(files) })
      await waitForUpdate(name)
      flash.success(`Successfully updated the function ${name}.`)
      refresh()
      void code.refetch()
    } catch (e) {
      flash.error(errorMessage(e))
    } finally {
      setDeploying(false)
    }
  }
  if (config?.PackageType === "Image")
    return (
      <Section title="Image" items={[{ label: "Image URI", value: <Copyable value={imageUri} /> }]} />
    )
  return (
    <SpaceBetween size="l">
      <Container
        header={
          <Header
            variant="h2"
            info={<Link variant="info">Info</Link>}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <ButtonDropdown items={[{ id: "zip", text: ".zip file", disabled: true, disabledReason: "Upload a .zip by deploying from the editor in the local console." }, { id: "s3", text: "Amazon S3 location", disabled: true }]}>Upload from</ButtonDropdown>
              </SpaceBetween>
            }
          >
            Code source
          </Header>
        }
      >
        {code.error ? (
          <Alert type="error">{errorMessage(code.error)}</Alert>
        ) : !files ? (
          <Box color="text-status-inactive">Loading code…</Box>
        ) : (
          <div className="myaws-lambda-editor">
            <div className="myaws-lambda-files">
              <Box variant="awsui-key-label">EXPLORER</Box>
              <Box fontSize="body-s" color="text-body-secondary">{name.toUpperCase()}</Box>
              {Object.keys(files).sort().map((file) => (
                <button key={file} type="button" className={file === active ? "active" : ""} onClick={() => setActive(file)}>{file}</button>
              ))}
              {editable && <Button variant="inline-link" iconName="add-plus" onClick={() => { setNewFile(""); setModal("file") }}>New file</Button>}
              <div className="myaws-lambda-deploy">
                <SpaceBetween size="xs">
                  <Box fontSize="body-s" color="text-body-secondary">DEPLOY</Box>
                  <Button variant="primary" loading={deploying} disabled={!editable || !dirty} onClick={() => void deploy()}>Deploy (Ctrl+Shift+U)</Button>
                  <Button onClick={onTest}>Test (Ctrl+Shift+I)</Button>
                  {dirty && <StatusIndicator type="warning">Changes not deployed</StatusIndicator>}
                </SpaceBetween>
              </div>
            </div>
            <div className="myaws-lambda-code">
              {active && (
                <>
                  <Box fontSize="body-s" color="text-body-secondary" padding={{ bottom: "xxs" }}>{active}</Box>
                  <Textarea
                    value={files[active] ?? ""}
                    rows={22}
                    spellcheck={false}
                    readOnly={!editable}
                    onChange={({ detail }) => setFiles({ ...files, [active]: detail.value })}
                  />
                </>
              )}
              {!editable && <Box fontSize="body-s" color="text-status-inactive">The console code editor supports only Node.js, Python, and Ruby.</Box>}
            </div>
          </div>
        )}
      </Container>
      <Section
        title="Runtime settings"
        info
        onEdit={() => { setSettings({ runtime: config?.Runtime ?? "", handler: config?.Handler ?? "", arch: config?.Architectures?.[0] ?? "x86_64" }); setModal("runtime") }}
        columns={3}
        items={[{ label: "Runtime", value: runtimeLabel(config?.Runtime) }, { label: "Handler", value: config?.Handler ?? "–" }, { label: "Architecture", value: config?.Architectures?.[0] ?? "x86_64" }]}
      />
      <LayersSection name={name} config={config} refresh={refresh} />
      <EditModal visible={modal === "runtime"} title="Edit runtime settings" saveLabel="Save" onDismiss={() => setModal(undefined)} success="Runtime settings updated." onSave={async () => { await callAws("lambda", "UpdateFunctionConfiguration", { FunctionName: name, Runtime: settings.runtime, Handler: settings.handler }); await waitForUpdate(name); refresh() }}>
        <FormField label="Runtime"><Select selectedOption={runtimes.find((r) => r.value === settings.runtime) ?? { value: settings.runtime, label: settings.runtime }} onChange={({ detail }) => setSettings({ ...settings, runtime: detail.selectedOption.value ?? "" })} options={runtimes} /></FormField>
        <FormField label="Handler" description="The handler is the method in your function code that processes events."><Input value={settings.handler} onChange={({ detail }) => setSettings({ ...settings, handler: detail.value })} /></FormField>
        <FormField label="Architecture" description="Changing the architecture requires redeploying the code."><Input value={settings.arch} disabled /></FormField>
      </EditModal>
      <EditModal visible={modal === "file"} title="New file" saveLabel="Create" saveDisabled={!newFile || Boolean(files && newFile in files)} onDismiss={() => setModal(undefined)} onSave={async () => { setFiles({ ...(files ?? {}), [newFile]: "" }); setActive(newFile) }}>
        <FormField label="File name"><Input value={newFile} placeholder="utils.mjs" onChange={({ detail }) => setNewFile(detail.value)} /></FormField>
      </EditModal>
    </SpaceBetween>
  )
}

function LayersSection({ name, config, refresh }: { name: string; config?: FunctionConfig; refresh: () => void }) {
  const layers = useAws<{ Layers?: { LayerName?: string; LayerArn?: string; LatestMatchingVersion?: { LayerVersionArn?: string; Version?: number } }[] }>("lambda", "ListLayers", {})
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState("")
  const [selected, setSelected] = useState<{ Arn?: string }[]>([])
  const current = config?.Layers ?? []
  return (
    <>
      <Table
        header={
          <Header
            variant="h2"
            counter={`(${current.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={selected.length === 0} onClick={async () => { await callAws("lambda", "UpdateFunctionConfiguration", { FunctionName: name, Layers: current.filter((l) => !selected.some((s) => s.Arn === l.Arn)).map((l) => l.Arn) }); await waitForUpdate(name); setSelected([]); flash.success("Layers updated."); refresh() }}>Remove</Button>
                <Button onClick={() => setOpen(true)}>Add a layer</Button>
              </SpaceBetween>
            }
          >
            Layers
          </Header>
        }
        items={current}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        trackBy="Arn"
        columnDefinitions={[
          { id: "order", header: "Merge order", cell: (l) => current.indexOf(l) + 1 },
          { id: "name", header: "Name", cell: (l) => l.Arn?.split(":")[6] },
          { id: "version", header: "Layer version", cell: (l) => l.Arn?.split(":")[7] },
          { id: "arn", header: "Version ARN", cell: (l) => l.Arn },
        ]}
        empty={<Box textAlign="center" color="inherit">There is no data to display.</Box>}
      />
      <EditModal visible={open} title="Add layer" saveLabel="Add" saveDisabled={!pick} onDismiss={() => setOpen(false)} success="Layer added." onSave={async () => { await callAws("lambda", "UpdateFunctionConfiguration", { FunctionName: name, Layers: [...current.map((l) => l.Arn), pick] }); await waitForUpdate(name); refresh() }}>
        <FormField label="Layer version" description="Choose a layer in this account or enter a layer version ARN.">
          <SpaceBetween size="xs">
            <Select selectedOption={null} placeholder="Choose a layer" empty="No layers" onChange={({ detail }) => setPick(detail.selectedOption.value ?? "")} options={(layers.data?.Layers ?? []).map((l) => ({ value: l.LatestMatchingVersion?.LayerVersionArn ?? "", label: l.LayerName, description: `Version ${l.LatestMatchingVersion?.Version}` }))} />
            <Input value={pick} placeholder="arn:aws:lambda:region:account:layer:name:version" onChange={({ detail }) => setPick(detail.value)} />
          </SpaceBetween>
        </FormField>
      </EditModal>
    </>
  )
}

type SavedEvent = { name: string; body: string }
const eventsKey = (name: string) => `myaws.lambda.test-events.${name}`
function readEvents(name: string): SavedEvent[] {
  try {
    return JSON.parse(localStorage.getItem(eventsKey(name)) ?? "[]")
  } catch {
    return []
  }
}
function writeEvents(name: string, events: SavedEvent[]) {
  try {
    localStorage.setItem(eventsKey(name), JSON.stringify(events))
  } catch {
    // Saved test events stay in memory only.
  }
}

const defaultEvent = JSON.stringify({ key1: "value1", key2: "value2", key3: "value3" }, null, 2)

function TestTab({ name }: { name: string }) {
  const [events, setEvents] = useState<SavedEvent[]>([])
  const [mode, setMode] = useState("new")
  const [eventName, setEventName] = useState("")
  const [body, setBody] = useState(defaultEvent)
  const [invocation, setInvocation] = useState("RequestResponse")
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; payload: string; log: string; status?: number; error?: string; version?: string }>()
  useEffect(() => {
    // Saved test events live in browser storage, which is only readable after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEvents(readEvents(name))
  }, [name])
  const run = async () => {
    setRunning(true)
    try {
      JSON.parse(body)
      const r = await callAws<{ StatusCode?: number; FunctionError?: string; Payload?: unknown; LogResult?: string; ExecutedVersion?: string }>("lambda", "Invoke", { FunctionName: name, Payload: encodeText(body), LogType: invocation === "RequestResponse" ? "Tail" : "None", InvocationType: invocation })
      setResult({ ok: !r.FunctionError, payload: decodePayload(r.Payload), log: r.LogResult ? new TextDecoder().decode(Uint8Array.from(atob(r.LogResult), (c) => c.charCodeAt(0))) : "", status: r.StatusCode, error: r.FunctionError, version: r.ExecutedVersion })
    } catch (e) {
      setResult({ ok: false, payload: "", log: "", error: errorMessage(e) })
    } finally {
      setRunning(false)
    }
  }
  const save = () => {
    if (!eventName) return flash.error("Enter an event name to save the test event.")
    const next = [...events.filter((e) => e.name !== eventName), { name: eventName, body }]
    setEvents(next)
    writeEvents(name, next)
    flash.success(`The test event ${eventName} was successfully saved.`)
  }
  const duration = result?.log.match(/Duration: ([\d.]+ ms)/)?.[1]
  const billed = result?.log.match(/Billed Duration: ([\d.]+ ms)/)?.[1]
  const memory = result?.log.match(/Max Memory Used: (\d+ MB)/)?.[1]
  const requestId = result?.log.match(/RequestId: ([\w-]+)/)?.[1]
  return (
    <SpaceBetween size="l">
      {result && (
        <Alert type={result.ok ? "success" : "error"} header={result.ok ? `Executing function: succeeded` : `Executing function: failed`}>
          <ExpandableSection headerText="Details" defaultExpanded>
            <SpaceBetween size="m">
              <Box>{invocation === "Event" ? `The function was invoked asynchronously (status ${result.status}).` : "The area below shows the last 4 KB of the execution log."}</Box>
              {result.error && !result.payload && <Box>{result.error}</Box>}
              {result.payload && <CodeView value={pretty(result.payload) || result.payload} />}
              <KeyValuePairs columns={4} items={[{ label: "Summary - Request ID", value: requestId ?? "–" }, { label: "Duration", value: duration ?? "–" }, { label: "Billed duration", value: billed ?? "–" }, { label: "Max memory used", value: memory ?? "–" }]} />
              {result.log && <><Box variant="h4">Log output</Box><CodeView value={result.log} /></>}
            </SpaceBetween>
          </ExpandableSection>
        </Alert>
      )}
      <Container
        header={
          <Header
            variant="h2"
            info={<Link variant="info">Info</Link>}
            description="To invoke your function without saving an event, configure the JSON event, then choose Test."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={mode !== "saved" || !eventName} onClick={() => { const next = events.filter((e) => e.name !== eventName); setEvents(next); writeEvents(name, next); setEventName(""); setMode("new"); flash.success("Test event deleted.") }}>Delete</Button>
                <Button onClick={save}>Save</Button>
                <Button variant="primary" iconName="caret-right-filled" loading={running} onClick={() => void run()}>Test</Button>
              </SpaceBetween>
            }
          >
            Test event
          </Header>
        }
      >
        <SpaceBetween size="l">
          <FormField label="Test event action">
            <RadioGroup value={mode} onChange={({ detail }) => { setMode(detail.value); if (detail.value === "new") { setEventName(""); setBody(defaultEvent) } }} items={[{ value: "new", label: "Create new event" }, { value: "saved", label: "Edit saved event", disabled: events.length === 0 }]} />
          </FormField>
          {mode === "saved" ? (
            <FormField label="Event name"><Select selectedOption={eventName ? { value: eventName, label: eventName } : null} placeholder="Choose a saved event" onChange={({ detail }) => { const e = events.find((x) => x.name === detail.selectedOption.value); setEventName(e?.name ?? ""); setBody(e?.body ?? defaultEvent) }} options={events.map((e) => ({ value: e.name, label: e.name }))} /></FormField>
          ) : (
            <FormField label="Event name" constraintText="Maximum of 25 characters consisting of letters, numbers, dots, hyphens and underscores."><Input value={eventName} placeholder="MyEventName" onChange={({ detail }) => setEventName(detail.value)} /></FormField>
          )}
          <FormField label="Invocation type"><RadioGroup value={invocation} onChange={({ detail }) => setInvocation(detail.value)} items={[{ value: "RequestResponse", label: "Synchronous" }, { value: "Event", label: "Asynchronous" }]} /></FormField>
          <FormField label="Event JSON" stretch><JsonField value={body} onChange={setBody} rows={14} /></FormField>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  )
}

function MonitorTab({ name, config }: { name: string; config?: FunctionConfig }) {
  const follow = useFollow()
  const group = config?.LoggingConfig?.LogGroup ?? `/aws/lambda/${name}`
  const events = useAws<{ events?: { timestamp?: number; message?: string; logStreamName?: string }[] }>("cloudwatchlogs", "FilterLogEvents", { logGroupName: group, limit: 50 }, { retry: false })
  return (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2">Metrics</Header>}><Box color="text-status-inactive">Lambda metrics (invocations, duration, errors, throttles) are not reported by the local emulator.</Box></Container>
      <Table
        header={<Header variant="h2" description={`Log group ${group}`} actions={<SpaceBetween direction="horizontal" size="xs"><Button iconName="refresh" ariaLabel="Refresh" onClick={() => void events.refetch()} /><Button href={`/cloudwatch/log-groups/${encodeURIComponent(group)}`} onFollow={follow}>View CloudWatch logs</Button></SpaceBetween>}>Recent invocations</Header>}
        items={[...(events.data?.events ?? [])].reverse()}
        loading={events.isPending}
        columnDefinitions={[{ id: "time", header: "Timestamp", cell: (e) => (e.timestamp ? new Date(e.timestamp).toLocaleString() : "–") }, { id: "msg", header: "Message", cell: (e) => <Box variant="code" fontSize="body-s">{e.message}</Box> }, { id: "stream", header: "Log stream", cell: (e) => e.logStreamName }]}
        wrapLines
        empty={<Box textAlign="center" color="inherit"><b>No log events</b><Box variant="p" color="inherit">{events.error ? errorMessage(events.error) : "Invoke the function to generate logs."}</Box></Box>}
      />
    </SpaceBetween>
  )
}

const configSections = [
  ["general", "General configuration"],
  ["triggers", "Triggers"],
  ["permissions", "Permissions"],
  ["destinations", "Destinations"],
  ["url", "Function URL"],
  ["environment", "Environment variables"],
  ["tags", "Tags"],
  ["vpc", "VPC"],
  ["monitoring", "Monitoring and operations tools"],
  ["concurrency", "Concurrency and recursion detection"],
  ["async", "Asynchronous invocation"],
  ["signing", "Code signing"],
  ["filesystems", "File systems"],
]

function ConfigurationTab(props: { name: string; data?: GetFunction; url?: UrlConfig; refreshUrl: () => void; mappings: Mapping[]; refreshMappings: () => void; section: string; onSection: (s: string) => void; refresh: () => void }) {
  const { section, onSection } = props
  return (
    <Grid gridDefinition={[{ colspan: { default: 12, s: 3 } }, { colspan: { default: 12, s: 9 } }]}>
      <SideNavigation activeHref={section} items={configSections.map(([id, text]) => ({ type: "link", text, href: id }))} onFollow={(e) => { e.preventDefault(); onSection(e.detail.href) }} />
      <ConfigSection {...props} />
    </Grid>
  )
}

function ConfigSection({ name, data, url, refreshUrl, mappings, refreshMappings, section, refresh }: { name: string; data?: GetFunction; url?: UrlConfig; refreshUrl: () => void; mappings: Mapping[]; refreshMappings: () => void; section: string; refresh: () => void }) {
  const follow = useFollow()
  const c = data?.Configuration
  const [modal, setModal] = useState<string>()
  const [general, setGeneral] = useState({ description: "", memory: "128", storage: "512", timeoutMin: "0", timeoutSec: "3", role: "" })
  const [env, setEnv] = useState<Tag[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [concurrency, setConcurrency] = useState({ mode: "unreserved", value: "100" })
  const [urlForm, setUrlForm] = useState({ auth: "AWS_IAM", mode: "BUFFERED" })
  const [trigger, setTrigger] = useState({ source: "", batch: "10" })
  const roles = useAws<{ Roles?: { RoleName?: string; Arn?: string }[] }>("iam", "ListRoles", { MaxItems: 1000 }, { enabled: modal === "general" })
  const queues = useAws<{ QueueUrls?: string[] }>("sqs", "ListQueues", {}, { enabled: modal === "trigger" })
  const tables = useAws<{ TableNames?: string[] }>("dynamodb", "ListTables", {}, { enabled: modal === "trigger" })
  const policy = useAws<{ Policy?: string }>("lambda", "GetPolicy", { FunctionName: name }, { retry: false, enabled: section === "permissions" })
  const asyncConfig = useAws<{ MaximumRetryAttempts?: number; MaximumEventAgeInSeconds?: number; DestinationConfig?: { OnSuccess?: { Destination?: string }; OnFailure?: { Destination?: string } } }>("lambda", "GetFunctionEventInvokeConfig", { FunctionName: name }, { retry: false, enabled: section === "async" || section === "destinations" })
  const recursion = useAws<{ RecursiveLoop?: string }>("lambda", "GetFunctionRecursionConfig", { FunctionName: name }, { retry: false, enabled: section === "concurrency" })
  const [asyncForm, setAsyncForm] = useState({ retries: "2", age: "21600", success: "", failure: "" })

  const updateConfig = async (input: Record<string, unknown>) => {
    await callAws("lambda", "UpdateFunctionConfiguration", { FunctionName: name, ...input })
    await waitForUpdate(name)
    refresh()
  }

  switch (section) {
    case "triggers":
      return (
        <>
          <Table
            header={<Header variant="h2" counter={`(${mappings.length})`} actions={<SpaceBetween direction="horizontal" size="xs"><Button iconName="refresh" ariaLabel="Refresh" onClick={refreshMappings} /><Button onClick={() => { setTrigger({ source: "", batch: "10" }); setModal("trigger") }}>Add trigger</Button></SpaceBetween>}>Triggers</Header>}
            items={mappings}
            columnDefinitions={[
              { id: "source", header: "Trigger", cell: (m) => m.EventSourceArn },
              { id: "state", header: "State", cell: (m) => (m.State === "Enabled" ? <StatusIndicator type="success">Enabled</StatusIndicator> : m.State) },
              { id: "batch", header: "Batch size", cell: (m) => m.BatchSize },
              { id: "actions", header: "Actions", cell: (m) => <SpaceBetween direction="horizontal" size="xs"><Button variant="inline-link" onClick={async () => { await callAws("lambda", "UpdateEventSourceMapping", { UUID: m.UUID, Enabled: m.State !== "Enabled" }); refreshMappings() }}>{m.State === "Enabled" ? "Disable" : "Enable"}</Button><Button variant="inline-link" onClick={async () => { await callAws("lambda", "DeleteEventSourceMapping", { UUID: m.UUID }); flash.success("Trigger deleted."); refreshMappings() }}>Delete</Button></SpaceBetween> },
            ]}
            empty={<Box textAlign="center" color="inherit"><b>No triggers</b><Box variant="p" color="inherit">There are no triggers configured for this function.</Box></Box>}
          />
          <EditModal visible={modal === "trigger"} size="large" title="Add trigger" saveLabel="Add" saveDisabled={!trigger.source} onDismiss={() => setModal(undefined)} success="The trigger was successfully added to the function." onSave={async () => { await callAws("lambda", "CreateEventSourceMapping", { FunctionName: name, EventSourceArn: trigger.source, BatchSize: Number(trigger.batch), ...(trigger.source.includes(":dynamodb:") ? { StartingPosition: "LATEST" } : {}) }); refreshMappings() }}>
            <FormField label="Source" description="Choose an SQS queue or DynamoDB stream.">
              <Select
                selectedOption={trigger.source ? { value: trigger.source, label: trigger.source.split(":").slice(-1)[0] } : null}
                placeholder="Select a source"
                onChange={async ({ detail }) => {
                  const v = detail.selectedOption.value ?? ""
                  if (v.startsWith("sqs:")) {
                    const attrs = await callAws<{ Attributes?: { QueueArn?: string } }>("sqs", "GetQueueAttributes", { QueueUrl: v.slice(4), AttributeNames: ["QueueArn"] })
                    setTrigger({ ...trigger, source: attrs.Attributes?.QueueArn ?? "" })
                  } else if (v.startsWith("ddb:")) {
                    const t = await callAws<{ Table?: { LatestStreamArn?: string } }>("dynamodb", "DescribeTable", { TableName: v.slice(4) })
                    if (!t.Table?.LatestStreamArn) flash.error("Turn on DynamoDB Streams for the table first.")
                    else setTrigger({ ...trigger, source: t.Table.LatestStreamArn })
                  }
                }}
                options={[
                  { label: "SQS", options: (queues.data?.QueueUrls ?? []).map((u) => ({ value: `sqs:${u}`, label: u.split("/").pop() })) },
                  { label: "DynamoDB", options: (tables.data?.TableNames ?? []).map((t) => ({ value: `ddb:${t}`, label: t })) },
                ]}
              />
            </FormField>
            <FormField label="Batch size"><Input type="number" value={trigger.batch} onChange={({ detail }) => setTrigger({ ...trigger, batch: detail.value })} /></FormField>
          </EditModal>
        </>
      )
    case "permissions":
      return (
        <SpaceBetween size="l">
          <Section title="Execution role" items={[{ label: "Role name", value: c?.Role ? <Link href={`/iam/roles/details/${encodeURIComponent(c.Role.split("/").pop() ?? "")}`} onFollow={follow}>{c.Role.split("/").pop()}</Link> : "–" }]} />
          <Section title="Resource-based policy statements" description="Resource-based policies grant other AWS accounts and services permissions to access your Lambda resources.">
            <CodeView value={pretty(policy.data?.Policy)} empty="No resource-based policy" />
          </Section>
        </SpaceBetween>
      )
    case "destinations":
      return (
        <Section title="Destinations" description="Send invocation records for asynchronous invocations to a destination." onEdit={() => { setAsyncForm({ retries: String(asyncConfig.data?.MaximumRetryAttempts ?? 2), age: String(asyncConfig.data?.MaximumEventAgeInSeconds ?? 21600), success: asyncConfig.data?.DestinationConfig?.OnSuccess?.Destination ?? "", failure: asyncConfig.data?.DestinationConfig?.OnFailure?.Destination ?? "" }); setModal("async") }} columns={2} items={[{ label: "On success", value: asyncConfig.data?.DestinationConfig?.OnSuccess?.Destination ?? "–" }, { label: "On failure", value: asyncConfig.data?.DestinationConfig?.OnFailure?.Destination ?? "–" }]}>
          <AsyncModal visible={modal === "async"} name={name} form={asyncForm} setForm={setAsyncForm} close={() => setModal(undefined)} onDone={() => void asyncConfig.refetch()} />
        </Section>
      )
    case "url":
      return (
        <>
          <Section
            title="Function URL"
            info
            actions={url ? <SpaceBetween direction="horizontal" size="xs"><Button onClick={async () => { await callAws("lambda", "DeleteFunctionUrlConfig", { FunctionName: name }); flash.success("Function URL deleted."); refreshUrl() }}>Delete</Button><Button onClick={() => { setUrlForm({ auth: url.AuthType ?? "AWS_IAM", mode: url.InvokeMode ?? "BUFFERED" }); setModal("url") }}>Edit</Button></SpaceBetween> : <Button onClick={() => setModal("url")}>Create function URL</Button>}
            columns={2}
            items={url ? [{ label: "Function URL", value: <Copyable value={url.FunctionUrl} /> }, { label: "Auth type", value: url.AuthType }, { label: "Invoke mode", value: url.InvokeMode ?? "BUFFERED" }, { label: "Created", value: consoleDate(url.CreationTime) }] : []}
          >
            {!url && <Box color="text-status-inactive">No function URL configured.</Box>}
          </Section>
          <EditModal visible={modal === "url"} title={url ? "Edit function URL" : "Configure function URL"} onDismiss={() => setModal(undefined)} success="Function URL saved." onSave={async () => { await callAws("lambda", url ? "UpdateFunctionUrlConfig" : "CreateFunctionUrlConfig", { FunctionName: name, AuthType: urlForm.auth, InvokeMode: urlForm.mode }); refreshUrl() }}>
            <FormField label="Auth type"><RadioGroup value={urlForm.auth} onChange={({ detail }) => setUrlForm({ ...urlForm, auth: detail.value })} items={[{ value: "AWS_IAM", label: "AWS_IAM", description: "Only authenticated IAM users and roles can make requests to your function URL." }, { value: "NONE", label: "NONE", description: "Lambda won't perform IAM authentication on requests to your function URL." }]} /></FormField>
            <FormField label="Invoke mode"><RadioGroup value={urlForm.mode} onChange={({ detail }) => setUrlForm({ ...urlForm, mode: detail.value })} items={[{ value: "BUFFERED", label: "BUFFERED (default)" }, { value: "RESPONSE_STREAM", label: "RESPONSE_STREAM" }]} /></FormField>
          </EditModal>
        </>
      )
    case "environment": {
      const vars = Object.entries(c?.Environment?.Variables ?? {}).map(([Key, Value]) => ({ Key, Value }))
      return (
        <>
          <Table header={<Header variant="h2" counter={`(${vars.length})`} description="You can use environment variables to adjust your function's behavior without updating code." actions={<Button onClick={() => { setEnv(vars); setModal("env") }}>Edit</Button>}>Environment variables</Header>} items={vars} columnDefinitions={[{ id: "k", header: "Key", cell: (v) => v.Key }, { id: "v", header: "Value", cell: (v) => v.Value }]} empty={<Box textAlign="center" color="inherit">No environment variables</Box>} />
          <EditModal visible={modal === "env"} size="large" title="Edit environment variables" onDismiss={() => setModal(undefined)} success="Environment variables updated." onSave={() => updateConfig({ Environment: { Variables: Object.fromEntries(env.filter((t) => t.Key).map((t) => [t.Key, t.Value ?? ""])) } })}>
            <TagEditor tags={env} onChange={setEnv} limit={100} emptyText="No environment variables." />
          </EditModal>
        </>
      )
    }
    case "tags": {
      const list = Object.entries(data?.Tags ?? {}).map(([Key, Value]) => ({ Key, Value }))
      return (
        <>
          <Table header={<Header variant="h2" counter={`(${list.length})`} actions={<Button onClick={() => { setTags(list); setModal("tags") }}>Manage tags</Button>}>Tags</Header>} items={list} columnDefinitions={[{ id: "k", header: "Key", cell: (t) => t.Key }, { id: "v", header: "Value", cell: (t) => t.Value || "–" }]} empty={<Box textAlign="center" color="inherit">No tags</Box>} />
          <EditModal
            visible={modal === "tags"}
            size="large"
            title="Manage tags"
            onDismiss={() => setModal(undefined)}
            success="Tags updated."
            onSave={async () => {
              const after = tags.filter((t) => t.Key)
              const removed = list.filter((t) => !after.some((a) => a.Key === t.Key)).map((t) => t.Key)
              if (removed.length) await callAws("lambda", "UntagResource", { Resource: c?.FunctionArn, TagKeys: removed })
              if (after.length) await callAws("lambda", "TagResource", { Resource: c?.FunctionArn, Tags: Object.fromEntries(after.map((t) => [t.Key, t.Value ?? ""])) })
              refresh()
            }}
          >
            <TagEditor tags={tags} onChange={setTags} />
          </EditModal>
        </>
      )
    }
    case "vpc":
      return <Section title="VPC" info columns={3} items={[{ label: "VPC", value: c?.VpcConfig?.VpcId || "–" }, { label: "Subnets", value: c?.VpcConfig?.SubnetIds?.join(", ") || "–" }, { label: "Security groups", value: c?.VpcConfig?.SecurityGroupIds?.join(", ") || "–" }]} />
    case "monitoring":
      return (
        <SpaceBetween size="l">
          <Section title="Logging configuration" columns={2} items={[{ label: "Log format", value: c?.LoggingConfig?.LogFormat ?? "Text" }, { label: "Log group", value: c?.LoggingConfig?.LogGroup ?? `/aws/lambda/${name}` }]} />
          <Section title="Additional monitoring tools" columns={2} items={[{ label: "AWS X-Ray active tracing", value: c?.TracingConfig?.Mode === "Active" ? "Enabled" : "Not enabled" }, { label: "CloudWatch Lambda Insights", value: "Not enabled" }]} actions={<Button onClick={async () => { await updateConfig({ TracingConfig: { Mode: c?.TracingConfig?.Mode === "Active" ? "PassThrough" : "Active" } }); flash.success("Tracing updated.") }}>{c?.TracingConfig?.Mode === "Active" ? "Disable X-Ray tracing" : "Enable X-Ray tracing"}</Button>} />
        </SpaceBetween>
      )
    case "concurrency": {
      const reserved = data?.Concurrency?.ReservedConcurrentExecutions
      return (
        <SpaceBetween size="l">
          <Section title="Concurrency" onEdit={() => { setConcurrency({ mode: reserved === undefined ? "unreserved" : "reserved", value: String(reserved ?? 100) }); setModal("concurrency") }} items={[{ label: "Function concurrency", value: reserved === undefined ? "Use unreserved account concurrency" : `Reserved: ${reserved}` }]} />
          <Section title="Recursive loop detection" items={[{ label: "Recursive loop", value: recursion.data?.RecursiveLoop === "Allow" ? "Allow" : "Terminate" }]} actions={<Button onClick={async () => { await callAws("lambda", "PutFunctionRecursionConfig", { FunctionName: name, RecursiveLoop: recursion.data?.RecursiveLoop === "Allow" ? "Terminate" : "Allow" }); void recursion.refetch() }}>{recursion.data?.RecursiveLoop === "Allow" ? "Terminate recursive loops" : "Allow recursive loops"}</Button>} />
          <EditModal visible={modal === "concurrency"} title="Edit concurrency" onDismiss={() => setModal(undefined)} success="Concurrency updated." onSave={async () => { if (concurrency.mode === "unreserved") await callAws("lambda", "DeleteFunctionConcurrency", { FunctionName: name }); else await callAws("lambda", "PutFunctionConcurrency", { FunctionName: name, ReservedConcurrentExecutions: Number(concurrency.value) }); refresh() }}>
            <RadioGroup value={concurrency.mode} onChange={({ detail }) => setConcurrency({ ...concurrency, mode: detail.value })} items={[{ value: "unreserved", label: "Use unreserved account concurrency" }, { value: "reserved", label: "Reserve concurrency" }]} />
            {concurrency.mode === "reserved" && <FormField label="Reserved concurrency"><Input type="number" value={concurrency.value} onChange={({ detail }) => setConcurrency({ ...concurrency, value: detail.value })} /></FormField>}
          </EditModal>
        </SpaceBetween>
      )
    }
    case "async":
      return (
        <Section
          title="Asynchronous invocation"
          onEdit={() => { setAsyncForm({ retries: String(asyncConfig.data?.MaximumRetryAttempts ?? 2), age: String(asyncConfig.data?.MaximumEventAgeInSeconds ?? 21600), success: asyncConfig.data?.DestinationConfig?.OnSuccess?.Destination ?? "", failure: asyncConfig.data?.DestinationConfig?.OnFailure?.Destination ?? "" }); setModal("async") }}
          columns={3}
          items={[{ label: "Maximum age of event", value: `${Math.floor((asyncConfig.data?.MaximumEventAgeInSeconds ?? 21600) / 3600)}h ${Math.floor(((asyncConfig.data?.MaximumEventAgeInSeconds ?? 21600) % 3600) / 60)}min` }, { label: "Retry attempts", value: String(asyncConfig.data?.MaximumRetryAttempts ?? 2) }, { label: "Dead-letter queue service", value: c?.DeadLetterConfig?.TargetArn ?? "None" }]}
        >
          <AsyncModal visible={modal === "async"} name={name} form={asyncForm} setForm={setAsyncForm} close={() => setModal(undefined)} onDone={() => void asyncConfig.refetch()} />
        </Section>
      )
    case "signing":
      return <Section title="Code signing configuration" items={[{ label: "Code signing configuration", value: "None" }]}><Box color="text-status-inactive">Code signing isn&apos;t enforced by the local emulator.</Box></Section>
    case "filesystems":
      return <Section title="File system" counter="(0)"><Box color="text-status-inactive">Amazon EFS file systems aren&apos;t available in the local emulator.</Box></Section>
    default:
      return (
        <>
          <Section
            title="General configuration"
            info
            onEdit={() => { const t = c?.Timeout ?? 3; setGeneral({ description: c?.Description ?? "", memory: String(c?.MemorySize ?? 128), storage: String(c?.EphemeralStorage?.Size ?? 512), timeoutMin: String(Math.floor(t / 60)), timeoutSec: String(t % 60), role: c?.Role ?? "" }); setModal("general") }}
            columns={3}
            items={[
              { label: "Description", value: c?.Description || "-" },
              { label: "Memory", value: `${c?.MemorySize ?? 128} MB` },
              { label: "Ephemeral storage", value: `${c?.EphemeralStorage?.Size ?? 512} MB` },
              { label: "Timeout", value: `${Math.floor((c?.Timeout ?? 3) / 60)} min ${(c?.Timeout ?? 3) % 60} sec` },
              { label: "SnapStart", value: c?.SnapStart?.ApplyOn === "PublishedVersions" ? "PublishedVersions" : "None" },
              { label: "Last modified", value: consoleDate(c?.LastModified?.replace(/\+0000$/, "Z")) },
            ]}
          />
          <EditModal
            visible={modal === "general"}
            size="large"
            title="Edit basic settings"
            onDismiss={() => setModal(undefined)}
            success="Successfully updated the function configuration."
            onSave={() => updateConfig({ Description: general.description, MemorySize: Number(general.memory), EphemeralStorage: { Size: Number(general.storage) }, Timeout: Number(general.timeoutMin) * 60 + Number(general.timeoutSec), Role: general.role })}
          >
            <FormField label="Description - optional"><Input value={general.description} onChange={({ detail }) => setGeneral({ ...general, description: detail.value })} /></FormField>
            <FormField label="Memory" description="Your function is allocated CPU proportional to the memory configured." constraintText="Set memory to between 128 MB and 10240 MB"><Input type="number" value={general.memory} onChange={({ detail }) => setGeneral({ ...general, memory: detail.value })} /></FormField>
            <FormField label="Ephemeral storage" constraintText="Set ephemeral storage (/tmp) to between 512 MB and 10240 MB."><Input type="number" value={general.storage} onChange={({ detail }) => setGeneral({ ...general, storage: detail.value })} /></FormField>
            <FormField label="Timeout">
              <SpaceBetween direction="horizontal" size="xs">
                <Input type="number" value={general.timeoutMin} onChange={({ detail }) => setGeneral({ ...general, timeoutMin: detail.value })} />
                <Box padding={{ top: "xs" }}>min</Box>
                <Input type="number" value={general.timeoutSec} onChange={({ detail }) => setGeneral({ ...general, timeoutSec: detail.value })} />
                <Box padding={{ top: "xs" }}>sec</Box>
              </SpaceBetween>
            </FormField>
            <FormField label="Execution role"><Select selectedOption={{ value: general.role, label: general.role.split("/").pop() }} filteringType="auto" onChange={({ detail }) => setGeneral({ ...general, role: detail.selectedOption.value ?? "" })} options={(roles.data?.Roles ?? []).map((r) => ({ value: r.Arn ?? "", label: r.RoleName }))} /></FormField>
          </EditModal>
        </>
      )
  }
}

function AsyncModal({ visible, name, form, setForm, close, onDone }: { visible: boolean; name: string; form: { retries: string; age: string; success: string; failure: string }; setForm: (f: { retries: string; age: string; success: string; failure: string }) => void; close: () => void; onDone: () => void }) {
  return (
    <EditModal
      visible={visible}
      size="large"
      title="Edit asynchronous invocation configuration"
      onDismiss={close}
      success="Asynchronous invocation configuration updated."
      onSave={async () => {
        await callAws("lambda", "PutFunctionEventInvokeConfig", {
          FunctionName: name,
          MaximumRetryAttempts: Number(form.retries),
          MaximumEventAgeInSeconds: Number(form.age),
          DestinationConfig: { ...(form.success ? { OnSuccess: { Destination: form.success } } : {}), ...(form.failure ? { OnFailure: { Destination: form.failure } } : {}) },
        })
        onDone()
      }}
    >
      <FormField label="Maximum age of event (seconds)" constraintText="Between 60 seconds and 6 hours."><Input type="number" value={form.age} onChange={({ detail }) => setForm({ ...form, age: detail.value })} /></FormField>
      <FormField label="Retry attempts" constraintText="Between 0 and 2."><Input type="number" value={form.retries} onChange={({ detail }) => setForm({ ...form, retries: detail.value })} /></FormField>
      <FormField label="On-success destination ARN - optional"><Input value={form.success} placeholder="arn:aws:sqs:..." onChange={({ detail }) => setForm({ ...form, success: detail.value })} /></FormField>
      <FormField label="On-failure destination ARN - optional"><Input value={form.failure} placeholder="arn:aws:sqs:..." onChange={({ detail }) => setForm({ ...form, failure: detail.value })} /></FormField>
    </EditModal>
  )
}

type AliasT = { Name?: string; FunctionVersion?: string; Description?: string; AliasArn?: string }

function AliasesTab({ name, onCreate }: { name: string; onCreate: () => void }) {
  const aliases = useAws<{ Aliases?: AliasT[] }>("lambda", "ListAliases", { FunctionName: name })
  const [selected, setSelected] = useState<AliasT[]>([])
  const [edit, setEdit] = useState<{ name: string; version: string; description: string }>()
  return (
    <>
      <Table<AliasT>
        header={
          <Header
            variant="h2"
            counter={`(${aliases.data?.Aliases?.length ?? 0})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void aliases.refetch()} />
                <Button disabled={!selected[0]} onClick={async () => { await callAws("lambda", "DeleteAlias", { FunctionName: name, Name: selected[0].Name }); flash.success(`Alias ${selected[0].Name} deleted.`); setSelected([]); void aliases.refetch() }}>Delete</Button>
                <Button disabled={!selected[0]} onClick={() => setEdit({ name: selected[0].Name ?? "", version: selected[0].FunctionVersion ?? "$LATEST", description: selected[0].Description ?? "" })}>Edit</Button>
                <Button variant="primary" onClick={onCreate}>Create alias</Button>
              </SpaceBetween>
            }
          >
            Aliases
          </Header>
        }
        items={aliases.data?.Aliases ?? []}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        trackBy="Name"
        columnDefinitions={[{ id: "name", header: "Name", cell: (a) => a.Name }, { id: "version", header: "Versions", cell: (a) => a.FunctionVersion }, { id: "description", header: "Description", cell: (a) => a.Description || "-" }, { id: "arn", header: "Alias ARN", cell: (a) => a.AliasArn }]}
        empty={<Box textAlign="center" color="inherit"><b>No aliases</b><Box variant="p" color="inherit">There are no aliases for this function.</Box><Button onClick={onCreate}>Create alias</Button></Box>}
      />
      {edit && <AliasModal visible editing name={name} value={edit} onChange={setEdit} close={() => setEdit(undefined)} onDone={() => void aliases.refetch()} />}
    </>
  )
}

function VersionsTab({ name, onPublish }: { name: string; onPublish: () => void }) {
  const versions = useAws<{ Versions?: FunctionConfig[] }>("lambda", "ListVersionsByFunction", { FunctionName: name })
  const [selected, setSelected] = useState<FunctionConfig[]>([])
  const list = [...(versions.data?.Versions ?? [])].reverse()
  return (
    <Table<FunctionConfig>
      header={
        <Header
          variant="h2"
          counter={`(${list.length})`}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void versions.refetch()} />
              <Button disabled={!selected[0] || selected[0].Version === "$LATEST"} onClick={async () => { await callAws("lambda", "DeleteFunction", { FunctionName: name, Qualifier: selected[0].Version }); flash.success(`Version ${selected[0].Version} deleted.`); setSelected([]); void versions.refetch() }}>Delete</Button>
              <Button variant="primary" onClick={onPublish}>Publish new version</Button>
            </SpaceBetween>
          }
        >
          Versions
        </Header>
      }
      items={list}
      selectionType="single"
      selectedItems={selected}
      onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
      trackBy="Version"
      columnDefinitions={[{ id: "version", header: "Version", cell: (v) => v.Version }, { id: "description", header: "Description", cell: (v) => v.Description || "-" }, { id: "modified", header: "Last modified", cell: (v) => lambdaDate(v.LastModified) }, { id: "arn", header: "Function ARN", cell: (v) => v.FunctionArn }]}
      empty={<Box textAlign="center">No versions</Box>}
    />
  )
}
