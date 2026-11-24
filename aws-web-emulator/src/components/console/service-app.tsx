"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
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
import Link from "@cloudscape-design/components/link"
import Modal from "@cloudscape-design/components/modal"
import Multiselect from "@cloudscape-design/components/multiselect"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Textarea from "@cloudscape-design/components/textarea"
import Toggle from "@cloudscape-design/components/toggle"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname, useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { ConsoleLayout, Copyable, dash, ResourceDetailPage, ResourceListPage, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { useFollow, type Crumb } from "@/components/shell/page-layout"
import { callAws, isAvailable } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

/* ---------- small helpers shared by the generic service consoles ---------- */

export const sv = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : String(v))
export const ob = (v: unknown) => (v as Item | undefined) ?? {}
export const col = (id: string, label: string, get: (i: Item) => unknown) => ({ id, label, value: (i: Item) => dash(get(i)), sort: (i: Item) => sv(get(i)) })
const statusTypes: [RegExp, StatusIndicatorProps.Type][] = [
  [/^(active|available|deployed|ready|healthy|ok|enabled|in use|issued|success|succeeded|completed|associated|attached|up|accepted|confirmed|online)$/, "success"],
  [/(failed|error|unhealthy|rejected|down|impaired|alarm)/, "error"],
  [/(in progress|creating|updating|deleting|provisioning|modifying|pending|requested|ordering|verifying)/, "in-progress"],
  [/(inactive|disabled|deleted|stopped|unavailable|expired|off)/, "stopped"],
]
export function Status({ value }: { value?: unknown }) {
  if (value === undefined || value === null || value === "") return <>–</>
  const text = String(value).replace(/[_-]+/g, " ").toLowerCase()
  const type = statusTypes.find(([re]) => re.test(text))?.[1] ?? "info"
  return <StatusIndicator type={type}>{text.charAt(0).toUpperCase() + text.slice(1)}</StatusIndicator>
}
export const stateCol = (key: string, label = "Status") => ({ id: "state", label, value: (i: Item) => <Status value={i[key]} />, sort: (i: Item) => sv(i[key]) })
export const dateCol = (id: string, label: string, key: string) => ({ id, label, value: (i: Item) => consoleDate(sv(i[key])), sort: (i: Item) => sv(i[key]) })
export const copyField = (label: string, get: (i: Item) => unknown) => ({ label, value: (i: Item) => (sv(get(i)) ? <Copyable value={sv(get(i))} /> : "–") })
export const textField = (label: string, get: (i: Item) => unknown) => ({ label, value: (i: Item) => dash(Array.isArray(get(i)) ? (get(i) as unknown[]).join(", ") : get(i)) })
export const dateField = (label: string, key: string) => ({ label, value: (i: Item) => consoleDate(sv(i[key])) })
export const stateField = (label: string, key: string) => ({ label, value: (i: Item) => <Status value={i[key]} /> })
export const tagList = (tags: Tag[]) => tags.filter((t) => t.Key).map((t) => ({ Key: t.Key, Value: t.Value ?? "" }))
export const tagMap = (tags: Tag[]) => Object.fromEntries(tags.filter((t) => t.Key).map((t) => [t.Key, t.Value ?? ""]))
export const token = () => `myaws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/* ---------- declarative create forms ---------- */

export type Option = { value: string; label: string; description?: string }
export type Source = { model: string; operation: string; input?: Record<string, unknown>; items: (page: Item) => Item[]; value: (i: Item) => string; label: (i: Item) => string; description?: (i: Item) => string | undefined }
export type FieldSpec = {
  id: string
  label: string
  type?: "text" | "number" | "textarea" | "select" | "multiselect" | "toggle" | "tags" | "json"
  description?: string
  constraint?: string
  placeholder?: string
  optional?: boolean
  default?: unknown
  options?: Option[]
  source?: Source | ((values: Values) => Source | undefined)
  show?: (values: Values) => boolean
  rows?: number
}
export type Values = Record<string, unknown>
export type FormSpec = {
  title: string
  description?: string
  submitLabel?: string
  sections: { title: string; description?: string; fields: FieldSpec[] }[]
  valid?: (values: Values) => boolean
  submit: (values: Values) => Promise<string | void>
  /** Where to go after success; defaults to the list page. */
  after?: (values: Values, result: string | void) => string | undefined
}

function useSource(source: Source | undefined) {
  return useQuery({
    queryKey: ["emulator", "aws", source?.model, source?.operation, "options", source?.input ?? {}],
    enabled: Boolean(source) && isAvailable(source?.model ?? "", source?.operation ?? ""),
    queryFn: async () => {
      const page = await callAws<Item>(source!.model, source!.operation, source!.input ?? {})
      return source!.items(page).map((i) => ({ value: source!.value(i), label: source!.label(i), description: source!.description?.(i) }))
    },
  })
}

function Field({ field, values, set }: { field: FieldSpec; values: Values; set: (id: string, v: unknown) => void }) {
  const source = typeof field.source === "function" ? field.source(values) : field.source
  const loaded = useSource(source)
  const options = field.options ?? loaded.data ?? []
  const value = values[field.id]
  const label = field.optional ? <>{field.label} <i>- optional</i></> : field.label
  const control = (() => {
    switch (field.type) {
      case "number":
        return <Input type="number" value={String(value ?? "")} placeholder={field.placeholder} onChange={({ detail }) => set(field.id, detail.value)} />
      case "textarea":
      case "json":
        return <Textarea rows={field.rows ?? (field.type === "json" ? 8 : 3)} value={String(value ?? "")} placeholder={field.placeholder} onChange={({ detail }) => set(field.id, detail.value)} />
      case "toggle":
        return <Toggle checked={Boolean(value)} onChange={({ detail }) => set(field.id, detail.checked)}>{field.placeholder ?? "Enabled"}</Toggle>
      case "tags":
        return <TagEditor tags={(value as Tag[]) ?? []} onChange={(tags) => set(field.id, tags)} />
      case "select":
        return (
          <Select
            expandToViewport
            filteringType={options.length > 8 ? "auto" : "none"}
            selectedOption={options.find((o) => o.value === value) ?? (value ? { value: String(value), label: String(value) } : null)}
            placeholder={field.placeholder ?? `Choose ${field.label.toLowerCase()}`}
            statusType={loaded.isFetching ? "loading" : "finished"}
            empty="No options"
            options={options}
            onChange={({ detail }) => set(field.id, detail.selectedOption.value ?? "")}
          />
        )
      case "multiselect":
        return (
          <Multiselect
            expandToViewport
            selectedOptions={options.filter((o) => ((value as string[]) ?? []).includes(o.value))}
            placeholder={field.placeholder ?? `Choose ${field.label.toLowerCase()}`}
            statusType={loaded.isFetching ? "loading" : "finished"}
            empty="No options"
            options={options}
            onChange={({ detail }) => set(field.id, detail.selectedOptions.map((o) => o.value ?? ""))}
          />
        )
      default:
        return <Input value={String(value ?? "")} placeholder={field.placeholder} onChange={({ detail }) => set(field.id, detail.value)} />
    }
  })()
  return <FormField label={label} description={field.description} constraintText={field.constraint} stretch={field.type === "tags" || field.type === "json" || field.type === "textarea"}>{control}</FormField>
}

export function initialValues(spec: FormSpec): Values {
  const v: Values = {}
  for (const s of spec.sections) for (const f of s.fields) v[f.id] = f.default ?? (f.type === "multiselect" || f.type === "tags" ? [] : f.type === "toggle" ? false : "")
  return v
}

export function requiredFilled(spec: FormSpec, values: Values) {
  return spec.sections.every((s) => s.fields.every((f) => f.optional || f.type === "toggle" || f.type === "tags" || (f.show && !f.show(values)) || (Array.isArray(values[f.id]) ? (values[f.id] as unknown[]).length > 0 : sv(values[f.id]) !== undefined)))
}

export function FormSections({ spec, values, set }: { spec: FormSpec; values: Values; set: (id: string, v: unknown) => void }) {
  return (
    <SpaceBetween size="l">
      {spec.sections.map((s) => (
        <Container key={s.title} header={<Header variant="h2" description={s.description}>{s.title}</Header>}>
          <SpaceBetween size="l">
            {s.fields.filter((f) => !f.show || f.show(values)).map((f) => <Field key={f.id} field={f} values={values} set={set} />)}
          </SpaceBetween>
        </Container>
      ))}
    </SpaceBetween>
  )
}

/* ---------- app definition ---------- */

export type ServiceApp = {
  id: string
  name: string
  home: string
  nav: SideNavigationProps.Item[]
  defs: Record<string, ResourceDef>
  creates?: Record<string, FormSpec>
  dashboard?: () => ReactNode
  pages?: Record<string, (id?: string) => ReactNode>
  unavailable?: Record<string, string>
}

export function ServiceLayout({ app, breadcrumbs, children, contentType, splitPanel }: { app: ServiceApp; breadcrumbs: Crumb[]; children: ReactNode; contentType?: "default" | "table" | "form" | "dashboard"; splitPanel?: ReactNode }) {
  const parts = usePathname().split("/").filter(Boolean)
  return (
    <ConsoleLayout serviceName={app.name} serviceHref={app.home} nav={app.nav} activeHref={parts.length > 1 ? `/${parts[0]}/${parts[1]}` : `/${parts[0]}`} breadcrumbs={[{ text: app.name, href: app.home }, ...breadcrumbs]} contentType={contentType} splitPanel={splitPanel}>
      {children}
    </ConsoleLayout>
  )
}

function CreateFormPage({ app, section, spec }: { app: ServiceApp; section: string; spec: FormSpec }) {
  const router = useRouter()
  const client = useQueryClient()
  const back = `/${app.id}/${section}`
  const [values, setValues] = useState<Values>(() => initialValues(spec))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const crumb = app.defs[section]?.title ?? section
  const ok = requiredFilled(spec, values) && (spec.valid?.(values) ?? true)
  return (
    <ServiceLayout app={app} breadcrumbs={[{ text: crumb, href: back }, { text: spec.title, href: "#" }]} contentType="form">
      <Form
        header={<Header variant="h1" description={spec.description}>{spec.title}</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push(back)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!ok}
              onClick={async () => {
                setBusy(true)
                setError(undefined)
                try {
                  const message = await spec.submit(values)
                  await client.invalidateQueries({ queryKey: ["emulator"] })
                  flash.success(message || `${spec.title} succeeded.`)
                  router.push(spec.after?.(values, message) ?? back)
                } catch (e) {
                  setError(errorMessage(e))
                  setBusy(false)
                }
              }}
            >
              {spec.submitLabel ?? spec.title}
            </Button>
          </SpaceBetween>
        }
      >
        <FormSections spec={spec} values={values} set={(id, v) => setValues((prev) => ({ ...prev, [id]: v }))} />
      </Form>
    </ServiceLayout>
  )
}

export function UnavailablePage({ app, section, title }: { app: ServiceApp; section: string; title: string }) {
  return (
    <ServiceLayout app={app} breadcrumbs={[{ text: title, href: `/${app.id}/${section}` }]}>
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Alert type="info" header={`${title} isn't available in the local emulator`}>This feature needs APIs that the local AWS Emulator doesn&apos;t implement.</Alert>
      </ContentLayout>
    </ServiceLayout>
  )
}

/** Dashboard that counts the resources of each listed def. */
export function CountDashboard({ app, title, description, sections, intro }: { app: ServiceApp; title: string; description: string; sections: string[]; intro?: ReactNode }) {
  const follow = useFollow()
  return (
    <ServiceLayout app={app} breadcrumbs={[]} contentType="dashboard">
      <ContentLayout header={<Header variant="h1" description={description}>{title}</Header>}>
        <SpaceBetween size="l">
          {intro}
          <Container header={<Header variant="h2">Resources</Header>}>
            <ColumnLayout columns={Math.min(4, sections.length)} variant="text-grid">
              {sections.map((s) => <Count key={s} app={app} section={s} follow={follow} />)}
            </ColumnLayout>
          </Container>
        </SpaceBetween>
      </ContentLayout>
    </ServiceLayout>
  )
}

function Count({ app, section, follow }: { app: ServiceApp; section: string; follow: ReturnType<typeof useFollow> }) {
  const def = app.defs[section]
  const model = def.model ?? "ec2"
  const available = isAvailable(model, def.operation)
  const q = useQuery({
    queryKey: ["emulator", "aws", model, def.operation, "count", def.input ?? {}],
    enabled: available,
    queryFn: async () => def.items(await callAws<Item>(model, def.operation, def.input ?? {})).length,
  })
  return (
    <div>
      <Box variant="awsui-key-label">{def.title}</Box>
      {available ? <Link variant="awsui-value-large" href={def.path} onFollow={follow}>{q.isPending ? "–" : String(q.data ?? 0)}</Link> : <Box variant="awsui-value-large" color="text-status-inactive">–</Box>}
    </div>
  )
}

export function ServiceRouter({ app, path }: { app: ServiceApp; path: string[] }) {
  const [section, id] = path
  const layout = (props: { children: ReactNode; splitPanel?: ReactNode; breadcrumbs: Crumb[] }) => <ServiceLayout app={app} {...props} />
  if (!section) return app.dashboard ? <>{app.dashboard()}</> : <UnavailablePage app={app} section="" title={app.name} />
  const page = app.pages?.[section]
  if (page) return <>{page(id ? decodeURIComponent(id) : undefined)}</>
  const create = id === "create" ? app.creates?.[section] : undefined
  if (create) return <CreateFormPage key={section} app={app} section={section} spec={create} />
  const def = app.defs[section]
  if (def) return id ? <ResourceDetailPage def={def} id={decodeURIComponent(id)} layout={layout} /> : <ResourceListPage def={def} layout={layout} />
  return <UnavailablePage app={app} section={section} title={app.unavailable?.[section] ?? "Not found"} />
}

/* ---------- sub-resource tables for detail tabs ---------- */

export type SubColumn = { id: string; header: string; cell: (i: Item) => ReactNode }
export function SubTable({
  title,
  description,
  model,
  operation,
  input,
  items,
  columns,
  trackBy,
  create,
  remove,
  actions,
  enabled = true,
}: {
  title: string
  description?: string
  model: string
  operation: string
  input: Record<string, unknown>
  items: (page: Item) => Item[]
  columns: SubColumn[]
  trackBy: (i: Item) => string
  create?: FormSpec
  remove?: { label?: string; run: (i: Item) => Promise<unknown> }
  actions?: { label: string; run: (i: Item) => Promise<unknown>; enabled?: (i: Item) => boolean }[]
  enabled?: boolean
}) {
  const client = useQueryClient()
  const available = isAvailable(model, operation)
  const q = useQuery({
    queryKey: ["emulator", "aws", model, operation, "sub", input],
    enabled: enabled && available,
    queryFn: async () => items(await callAws<Item>(model, operation, input)),
  })
  const [selected, setSelected] = useState<Item[]>([])
  const [creating, setCreating] = useState(false)
  const rows = q.data ?? []
  const run = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn()
      flash.success(message)
      setSelected([])
      await client.invalidateQueries({ queryKey: ["emulator"] })
    } catch (e) {
      flash.error(errorMessage(e))
    }
  }
  return (
    <>
      <TableLite
        title={title}
        description={description}
        loading={q.isPending && available && enabled}
        rows={rows}
        columns={columns}
        trackBy={trackBy}
        selected={selected}
        setSelected={setSelected}
        unavailable={!available}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void q.refetch()} />
            {actions?.map((a) => (
              <Button key={a.label} disabled={selected.length !== 1 || (a.enabled ? !a.enabled(selected[0]) : false)} onClick={() => void run(() => a.run(selected[0]), `${a.label} succeeded.`)}>{a.label}</Button>
            ))}
            {remove && <Button disabled={!selected.length} onClick={() => void run(async () => { for (const s of selected) await remove.run(s) }, `${remove.label ?? "Delete"} succeeded.`)}>{remove.label ?? "Delete"}</Button>}
            {create && <Button onClick={() => setCreating(true)}>{create.submitLabel ?? create.title}</Button>}
          </SpaceBetween>
        }
      />
      {creating && create && <CreateModal spec={create} onDismiss={() => setCreating(false)} onDone={async () => { await client.invalidateQueries({ queryKey: ["emulator"] }) }} />}
    </>
  )
}


function TableLite({ title, description, loading, rows, columns, trackBy, selected, setSelected, actions, unavailable }: { title: string; description?: string; loading: boolean; rows: Item[]; columns: SubColumn[]; trackBy: (i: Item) => string; selected: Item[]; setSelected: (s: Item[]) => void; actions: ReactNode; unavailable?: boolean }) {
  return (
    <Table
      header={<Header variant="h2" counter={`(${rows.length})`} description={description} actions={actions}>{title}</Header>}
      loading={loading}
      loadingText="Loading"
      selectionType="multi"
      trackBy={trackBy}
      selectedItems={selected}
      onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
      items={rows}
      columnDefinitions={columns}
      empty={<Box textAlign="center" color="inherit">{unavailable ? "Not available in the local emulator." : `No ${title.toLowerCase()}`}</Box>}
    />
  )
}

export function CreateModal({ spec, onDismiss, onDone }: { spec: FormSpec; onDismiss: () => void; onDone: () => Promise<unknown> }) {
  const [values, setValues] = useState<Values>(() => initialValues(spec))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const ok = requiredFilled(spec, values) && (spec.valid?.(values) ?? true)
  return (
    <Modal
      visible
      size="large"
      header={spec.title}
      onDismiss={onDismiss}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!ok}
              onClick={async () => {
                setBusy(true)
                setError(undefined)
                try {
                  const message = await spec.submit(values)
                  flash.success(message || `${spec.title} succeeded.`)
                  await onDone()
                  onDismiss()
                } catch (e) {
                  setError(errorMessage(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {spec.submitLabel ?? spec.title}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="l">
        {spec.sections.flatMap((s) => s.fields).filter((f) => !f.show || f.show(values)).map((f) => <Field key={f.id} field={f} values={values} set={(id, v) => setValues((p) => ({ ...p, [id]: v }))} />)}
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  )
}

/* ---------- tags tab for services with their own tagging APIs ---------- */

export function TagsPanel({ id, load, save }: { id: string; load: () => Promise<Tag[]>; save: (add: Tag[], remove: string[]) => Promise<unknown> }) {
  const q = useQuery({ queryKey: ["emulator", "tags", id], queryFn: load })
  const list = q.data ?? []
  const [edit, setEdit] = useState<Tag[]>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <>
      <Table
        header={<Header variant="h2" counter={`(${list.length})`} actions={<Button onClick={() => setEdit(list)}>Manage tags</Button>}>Tags</Header>}
        loading={q.isPending}
        items={list}
        columnDefinitions={[{ id: "k", header: "Key", cell: (t) => t.Key }, { id: "v", header: "Value", cell: (t) => t.Value || "–" }]}
        empty={<Box textAlign="center" color="inherit">No tags</Box>}
      />
      <Modal
        visible={Boolean(edit)}
        size="large"
        header="Manage tags"
        onDismiss={() => setEdit(undefined)}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setEdit(undefined)}>Cancel</Button>
              <Button
                variant="primary"
                loading={busy}
                onClick={async () => {
                  setBusy(true)
                  setError(undefined)
                  try {
                    const after = (edit ?? []).filter((t) => t.Key)
                    await save(after, list.filter((t) => !after.some((a) => a.Key === t.Key)).map((t) => t.Key))
                    flash.success("Tags updated.")
                    setEdit(undefined)
                    await q.refetch()
                  } catch (e) {
                    setError(errorMessage(e))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Save changes
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          {edit && <TagEditor tags={edit} onChange={setEdit} />}
          {error && <Alert type="error">{error}</Alert>}
        </SpaceBetween>
      </Modal>
    </>
  )
}

export function LinkTo({ href, children }: { href: string; children: ReactNode }) {
  const follow = useFollow()
  return <Link href={href} onFollow={follow}>{children}</Link>
}

/** Tags tab for APIs that take tags as a { key: value } map. */
export function MapTags({ model, arn, arnKey = "resourceArn", listOp = "ListTagsForResource", tagOp = "TagResource", untagOp = "UntagResource", tagsKey = "tags", keysKey = "tagKeys" }: { model: string; arn: string; arnKey?: string; listOp?: string; tagOp?: string; untagOp?: string; tagsKey?: string; keysKey?: string }) {
  return (
    <TagsPanel
      id={arn}
      load={async () => Object.entries(((await callAws<Item>(model, listOp, { [arnKey]: arn }))[tagsKey] as Record<string, string> | undefined) ?? {}).map(([Key, Value]) => ({ Key, Value }))}
      save={async (add, remove) => {
        if (remove.length) await callAws(model, untagOp, { [arnKey]: arn, [keysKey]: remove })
        if (add.length) await callAws(model, tagOp, { [arnKey]: arn, [tagsKey]: tagMap(add) })
      }}
    />
  )
}

/** JSON document (policy) viewer with an editor. */
export function JsonDocPanel({ title, description, id, load, save, remove }: { title: string; description?: string; id: string; load: () => Promise<string | undefined>; save: (doc: string) => Promise<unknown>; remove?: () => Promise<unknown> }) {
  const q = useQuery({ queryKey: ["emulator", "doc", id], queryFn: async () => (await load()) ?? "" })
  const [edit, setEdit] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const pretty = (s: string) => { try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s } }
  return (
    <Container
      header={
        <Header
          variant="h2"
          description={description}
          actions={
            edit === undefined ? (
              <SpaceBetween direction="horizontal" size="xs">
                {remove && q.data && <Button onClick={async () => { try { await remove(); flash.success(`${title} removed.`); await q.refetch() } catch (e) { flash.error(errorMessage(e)) } }}>Remove</Button>}
                <Button onClick={() => setEdit(pretty(q.data ?? "") || "{\n  \"Version\": \"2012-10-17\",\n  \"Statement\": []\n}")}>Edit</Button>
              </SpaceBetween>
            ) : (
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => { setEdit(undefined); setError(undefined) }}>Cancel</Button>
                <Button
                  variant="primary"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true)
                    setError(undefined)
                    try {
                      JSON.parse(edit)
                      await save(edit)
                      flash.success(`${title} saved.`)
                      setEdit(undefined)
                      await q.refetch()
                    } catch (e) {
                      setError(errorMessage(e))
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Save changes
                </Button>
              </SpaceBetween>
            )
          }
        >
          {title}
        </Header>
      }
    >
      {edit === undefined ? (
        q.isPending ? <Box>Loading</Box> : q.data ? <Box variant="code"><pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{pretty(q.data)}</pre></Box> : <Box color="text-body-secondary">No {title.toLowerCase()}.</Box>
      ) : (
        <SpaceBetween size="s">
          <div className="myaws-lambda-code"><Textarea rows={14} value={edit} onChange={({ detail }) => setEdit(detail.value)} /></div>
          {error && <Alert type="error">{error}</Alert>}
        </SpaceBetween>
      )}
    </Container>
  )
}
