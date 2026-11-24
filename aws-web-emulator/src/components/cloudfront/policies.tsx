"use client"

import { useQueryClient } from "@tanstack/react-query"

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
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Modal from "@cloudscape-design/components/modal"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import Toggle from "@cloudscape-design/components/toggle"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { CodeView, pretty } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { callAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"
import { CfLayout, items, policyName, toList, usePolicies, type List, type Obj, type Policy, type PolicyKind } from "@/components/cloudfront/shared"

const kinds: Record<PolicyKind, { title: string; singular: string; get: string; create: string; update: string; remove: string; config: string; item: string }> = {
  cache: { title: "Cache", singular: "cache policy", get: "GetCachePolicy", create: "CreateCachePolicy", update: "UpdateCachePolicy", remove: "DeleteCachePolicy", config: "CachePolicyConfig", item: "CachePolicy" },
  origin: { title: "Origin request", singular: "origin request policy", get: "GetOriginRequestPolicy", create: "CreateOriginRequestPolicy", update: "UpdateOriginRequestPolicy", remove: "DeleteOriginRequestPolicy", config: "OriginRequestPolicyConfig", item: "OriginRequestPolicy" },
  headers: { title: "Response headers", singular: "response headers policy", get: "GetResponseHeadersPolicy", create: "CreateResponseHeadersPolicy", update: "UpdateResponseHeadersPolicy", remove: "DeleteResponseHeadersPolicy", config: "ResponseHeadersPolicyConfig", item: "ResponseHeadersPolicy" },
}
const slug: Record<PolicyKind, string> = { cache: "cache", origin: "origin-request", headers: "response-headers" }
export const kindFromSlug = (s?: string): PolicyKind | undefined => (Object.entries(slug).find(([, v]) => v === s)?.[0] as PolicyKind | undefined)

function DeletePolicyModal({ kind, policy, onDismiss, onDone }: { kind: PolicyKind; policy: Policy; onDismiss: () => void; onDone: () => void }) {
  const k = kinds[kind]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <Modal
      visible
      header={`Delete ${k.singular}`}
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
                  const r = await callAws<{ ETag: string }>("cloudfront", k.get, { Id: policy.Id })
                  await callAws("cloudfront", k.remove, { Id: policy.Id, IfMatch: r.ETag })
                  flash.success(`Successfully deleted ${k.singular} ${policy.Name}.`)
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
        <Box>Delete {k.singular} <b>{policy.Name}</b>? You can&apos;t delete a policy that is attached to a cache behavior.</Box>
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  )
}

function PolicyTables({ kind }: { kind: PolicyKind }) {
  const follow = useFollow()
  const router = useRouter()
  const policies = usePolicies(kind)
  const k = kinds[kind]
  const [selected, setSelected] = useState<Policy[]>([])
  const [deleting, setDeleting] = useState(false)
  const managed = (policies.data ?? []).filter((p) => p.Type === "managed")
  const custom = (policies.data ?? []).filter((p) => p.Type !== "managed")
  const href = (p: Policy) => `/cloudfront/policies/${slug[kind]}/${p.Id}`
  const cols = [
    { id: "name", header: "Name", cell: (p: Policy) => <Link href={href(p)} onFollow={follow}>{policyName(p.Name)}</Link> },
    { id: "desc", header: "Description", cell: (p: Policy) => p.Comment || "–" },
  ]
  return (
    <SpaceBetween size="l">
      <Table
        header={<Header variant="h2" counter={`(${managed.length})`}>Managed policies</Header>}
        loading={policies.isPending}
        items={managed}
        columnDefinitions={cols}
        empty={<Box textAlign="center" color="inherit">No managed policies</Box>}
      />
      <Table
        header={
          <Header
            variant="h2"
            counter={`(${custom.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={selected.length !== 1} onClick={() => setDeleting(true)}>Delete</Button>
                <Button disabled={selected.length !== 1} onClick={() => router.push(`${href(selected[0])}/edit`)}>Edit</Button>
                <Button href={`/cloudfront/policies/${slug[kind]}/create`} onFollow={follow}>Create {k.title.toLowerCase()} policy</Button>
              </SpaceBetween>
            }
          >
            Custom policies
          </Header>
        }
        selectionType="single"
        trackBy="Id"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        loading={policies.isPending}
        items={custom}
        columnDefinitions={[...cols, { id: "modified", header: "Last modified", cell: (p: Policy) => consoleDate(p.LastModifiedTime) }]}
        empty={<Box textAlign="center" color="inherit"><SpaceBetween size="xs"><b>No custom policies</b><Button onClick={() => router.push(`/cloudfront/policies/${slug[kind]}/create`)}>Create {k.title.toLowerCase()} policy</Button></SpaceBetween></Box>}
      />
      {deleting && selected[0] && <DeletePolicyModal kind={kind} policy={selected[0]} onDismiss={() => setDeleting(false)} onDone={() => { setDeleting(false); setSelected([]); void policies.refetch() }} />}
    </SpaceBetween>
  )
}

export function PoliciesPage({ tab }: { tab: string }) {
  const router = useRouter()
  return (
    <CfLayout breadcrumbs={[{ text: "Policies", href: "/cloudfront/policies" }]}>
      <ContentLayout header={<Header variant="h1" description="Policies control how CloudFront caches content, which values it includes in origin requests, and which headers it adds to viewer responses.">Policies</Header>}>
        <Tabs
          activeTabId={tab}
          onChange={({ detail }) => router.replace(`/cloudfront/policies?tab=${detail.activeTabId}`)}
          tabs={(Object.keys(kinds) as PolicyKind[]).map((k) => ({ id: slug[k], label: kinds[k].title, content: <PolicyTables kind={k} /> }))}
        />
      </ContentLayout>
    </CfLayout>
  )
}

const behaviors = {
  header: { cache: ["none", "whitelist"], origin: ["none", "whitelist", "allViewer", "allViewerAndWhitelistCloudFront", "allExcept"] },
  cookie: ["none", "whitelist", "allExcept", "all"],
  query: ["none", "whitelist", "allExcept", "all"],
}
const behaviorLabel: Record<string, string> = { none: "None", whitelist: "Include specified", allExcept: "All except", all: "All", allViewer: "All viewer headers", allViewerAndWhitelistCloudFront: "All viewer headers and the following CloudFront headers" }
const listOf = (s: string) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)

type KeyForm = { headers: string; headerList: string; cookies: string; cookieList: string; queries: string; queryList: string }
function KeyFields({ form, set, kind }: { form: KeyForm; set: (f: KeyForm) => void; kind: "cache" | "origin" }) {
  const sel = (value: string, options: string[], onChange: (v: string) => void) => <Select expandToViewport selectedOption={{ value, label: behaviorLabel[value] }} options={options.map((v) => ({ value: v, label: behaviorLabel[v] }))} onChange={({ detail }) => onChange(detail.selectedOption.value ?? "none")} />
  const list = (show: boolean, value: string, onChange: (v: string) => void, placeholder: string) => show && <Textarea rows={2} value={value} placeholder={placeholder} onChange={({ detail }) => onChange(detail.value)} />
  return (
    <SpaceBetween size="l">
      <FormField label="Headers" stretch><SpaceBetween size="xs">{sel(form.headers, behaviors.header[kind], (headers) => set({ ...form, headers }))}{list(form.headers !== "none" && form.headers !== "allViewer", form.headerList, (headerList) => set({ ...form, headerList }), "Host, CloudFront-Viewer-Country")}</SpaceBetween></FormField>
      <FormField label="Query strings" stretch><SpaceBetween size="xs">{sel(form.queries, behaviors.query, (queries) => set({ ...form, queries }))}{list(form.queries === "whitelist" || form.queries === "allExcept", form.queryList, (queryList) => set({ ...form, queryList }), "page, size")}</SpaceBetween></FormField>
      <FormField label="Cookies" stretch><SpaceBetween size="xs">{sel(form.cookies, behaviors.cookie, (cookies) => set({ ...form, cookies }))}{list(form.cookies === "whitelist" || form.cookies === "allExcept", form.cookieList, (cookieList) => set({ ...form, cookieList }), "session-id")}</SpaceBetween></FormField>
    </SpaceBetween>
  )
}
const keyToConfig = (f: KeyForm) => {
  const names = (behavior: string, value: string) => (behavior !== "none" && behavior !== "all" && behavior !== "allViewer" && listOf(value).length ? { Quantity: listOf(value).length, Items: listOf(value) } : undefined)
  return {
    HeadersConfig: { HeaderBehavior: f.headers, ...(names(f.headers, f.headerList) ? { Headers: names(f.headers, f.headerList) } : {}) },
    CookiesConfig: { CookieBehavior: f.cookies, ...(names(f.cookies, f.cookieList) ? { Cookies: names(f.cookies, f.cookieList) } : {}) },
    QueryStringsConfig: { QueryStringBehavior: f.queries, ...(names(f.queries, f.queryList) ? { QueryStrings: names(f.queries, f.queryList) } : {}) },
  }
}
const configToKey = (c: Obj): KeyForm => {
  const h = (c.HeadersConfig as Obj | undefined) ?? {}
  const k = (c.CookiesConfig as Obj | undefined) ?? {}
  const q = (c.QueryStringsConfig as Obj | undefined) ?? {}
  return {
    headers: (h.HeaderBehavior as string) ?? "none",
    headerList: items(h.Headers as List<string>).join(", "),
    cookies: (k.CookieBehavior as string) ?? "none",
    cookieList: items(k.Cookies as List<string>).join(", "),
    queries: (q.QueryStringBehavior as string) ?? "none",
    queryList: items(q.QueryStrings as List<string>).join(", "),
  }
}

type CorsForm = { enabled: boolean; origins: string; headers: string; methods: string[]; expose: string; credentials: boolean; maxAge: string; override: boolean }
type SecForm = { hsts: boolean; hstsAge: string; nosniff: boolean; frame: string; referrer: string; xss: boolean }
const allMethods = ["GET", "HEAD", "PUT", "POST", "PATCH", "DELETE", "OPTIONS"]
const corsToConfig = (f: CorsForm) => ({
  AccessControlAllowOrigins: toList(listOf(f.origins)),
  AccessControlAllowHeaders: toList(listOf(f.headers)),
  AccessControlAllowMethods: toList(f.methods.length === allMethods.length ? ["ALL"] : f.methods),
  AccessControlExposeHeaders: toList(listOf(f.expose)),
  AccessControlAllowCredentials: f.credentials,
  ...(f.maxAge ? { AccessControlMaxAgeSec: Number(f.maxAge) } : {}),
  OriginOverride: f.override,
})
const configToCors = (c?: Obj): CorsForm => {
  const m = items(c?.AccessControlAllowMethods as List<string>)
  return {
    enabled: Boolean(c),
    origins: items(c?.AccessControlAllowOrigins as List<string>).join(", ") || "*",
    headers: items(c?.AccessControlAllowHeaders as List<string>).join(", ") || "*",
    methods: m.includes("ALL") ? allMethods : m.length ? m : ["GET", "HEAD"],
    expose: items(c?.AccessControlExposeHeaders as List<string>).join(", "),
    credentials: Boolean(c?.AccessControlAllowCredentials),
    maxAge: c?.AccessControlMaxAgeSec !== undefined ? String(c.AccessControlMaxAgeSec) : "600",
    override: c ? Boolean(c.OriginOverride) : true,
  }
}
const secToConfig = (f: SecForm) => ({
  ...(f.hsts ? { StrictTransportSecurity: { Override: true, AccessControlMaxAgeSec: Number(f.hstsAge) || 31536000, IncludeSubdomains: true, Preload: false } } : {}),
  ...(f.nosniff ? { ContentTypeOptions: { Override: true } } : {}),
  ...(f.frame ? { FrameOptions: { Override: true, FrameOption: f.frame } } : {}),
  ...(f.referrer ? { ReferrerPolicy: { Override: true, ReferrerPolicy: f.referrer } } : {}),
  ...(f.xss ? { XSSProtection: { Override: true, Protection: true, ModeBlock: true } } : {}),
})
const configToSec = (c?: Obj): SecForm => ({
  hsts: Boolean(c?.StrictTransportSecurity),
  hstsAge: String((c?.StrictTransportSecurity as Obj | undefined)?.AccessControlMaxAgeSec ?? 31536000),
  nosniff: Boolean(c?.ContentTypeOptions),
  frame: ((c?.FrameOptions as Obj | undefined)?.FrameOption as string) ?? "",
  referrer: ((c?.ReferrerPolicy as Obj | undefined)?.ReferrerPolicy as string) ?? "",
  xss: Boolean(c?.XSSProtection),
})

export function PolicyEditPage({ kind, id }: { kind: PolicyKind; id?: string }) {
  const router = useRouter()
  const k = kinds[kind]
  const policies = usePolicies(kind)
  const existing = id ? policies.data?.find((p) => p.Id === id) : undefined
  if (id && policies.isPending) return <CfLayout breadcrumbs={[{ text: "Policies", href: "/cloudfront/policies" }]}><StatusIndicator type="loading">Loading</StatusIndicator></CfLayout>
  if (id && !existing) return <CfLayout breadcrumbs={[{ text: "Policies", href: "/cloudfront/policies" }]}><Alert type="error" header="Policy not found">{id} doesn&apos;t exist.</Alert></CfLayout>
  return <PolicyForm key={id ?? "new"} kind={kind} existing={existing} onDone={(pid) => router.push(`/cloudfront/policies/${slug[kind]}/${pid}`)} onCancel={() => router.push(`/cloudfront/policies?tab=${slug[kind]}`)} title={`${existing ? "Edit" : "Create"} ${k.title.toLowerCase()} policy`} />
}

function PolicyForm({ kind, existing, onDone, onCancel, title }: { kind: PolicyKind; existing?: Policy; onDone: (id: string) => void; onCancel: () => void; title: string }) {
  const client = useQueryClient()
  const k = kinds[kind]
  const c = existing?.Config ?? {}
  const params = (c.ParametersInCacheKeyAndForwardedToOrigin as Obj | undefined) ?? c
  const [name, setName] = useState((c.Name as string) ?? "")
  const [comment, setComment] = useState((c.Comment as string) ?? "")
  const [ttl, setTtl] = useState({ min: String(c.MinTTL ?? 1), def: String(c.DefaultTTL ?? 86400), max: String(c.MaxTTL ?? 31536000) })
  const [key, setKey] = useState<KeyForm>(configToKey(params))
  const [gzip, setGzip] = useState(Boolean(params.EnableAcceptEncodingGzip ?? true))
  const [brotli, setBrotli] = useState(Boolean(params.EnableAcceptEncodingBrotli ?? true))
  const [cors, setCors] = useState<CorsForm>(configToCors(c.CorsConfig as Obj | undefined))
  const [secOn, setSecOn] = useState(Boolean(c.SecurityHeadersConfig))
  const [sec, setSec] = useState<SecForm>(configToSec(c.SecurityHeadersConfig as Obj | undefined))
  const [custom, setCustom] = useState<Tag[]>(items(c.CustomHeadersConfig as List<{ Header: string; Value: string }> | undefined).map((h) => ({ Key: h.Header, Value: h.Value })))
  const [timing, setTiming] = useState(Boolean((c.ServerTimingHeadersConfig as Obj | undefined)?.Enabled))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const build = (): Obj => {
    if (kind === "cache") {
      return { Name: name, Comment: comment, MinTTL: Number(ttl.min) || 0, DefaultTTL: Number(ttl.def) || 0, MaxTTL: Number(ttl.max) || 0, ParametersInCacheKeyAndForwardedToOrigin: { EnableAcceptEncodingGzip: gzip, EnableAcceptEncodingBrotli: brotli, ...keyToConfig(key) } }
    }
    if (kind === "origin") return { Name: name, Comment: comment, ...keyToConfig(key) }
    return {
      Name: name,
      Comment: comment,
      ...(cors.enabled ? { CorsConfig: corsToConfig(cors) } : {}),
      ...(secOn ? { SecurityHeadersConfig: secToConfig(sec) } : {}),
      ...(custom.filter((h) => h.Key).length ? { CustomHeadersConfig: toList(custom.filter((h) => h.Key).map((h) => ({ Header: h.Key, Value: h.Value ?? "", Override: true }))) } : {}),
      ...(timing ? { ServerTimingHeadersConfig: { Enabled: true, SamplingRate: 100 } } : {}),
    }
  }
  return (
    <CfLayout breadcrumbs={[{ text: "Policies", href: "/cloudfront/policies" }, { text: title, href: "#" }]} contentType="form">
      <Form
        header={<Header variant="h1">{title}</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onCancel}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!/^[A-Za-z0-9_-]{1,128}$/.test(name)}
              onClick={async () => {
                setBusy(true)
                setError(undefined)
                try {
                  if (existing) {
                    const g = await callAws<{ ETag: string }>("cloudfront", k.get, { Id: existing.Id })
                    await callAws("cloudfront", k.update, { Id: existing.Id, IfMatch: g.ETag, [k.config]: build() })
                    await client.invalidateQueries({ queryKey: ["emulator", "cloudfront", "policies"] })
                  flash.success(`Successfully updated ${k.singular} ${name}.`)
                    onDone(existing.Id)
                  } else {
                    const r = await callAws("cloudfront", k.create, { [k.config]: build() })
                    await client.invalidateQueries({ queryKey: ["emulator", "cloudfront", "policies"] })
                    flash.success(`Successfully created ${k.singular} ${name}.`)
                    onDone(((r[k.item] as Obj).Id as string) ?? "")
                  }
                } catch (e) {
                  setError(errorMessage(e))
                  setBusy(false)
                }
              }}
            >
              {existing ? "Save changes" : "Create"}
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Details</Header>}>
            <SpaceBetween size="l">
              <FormField label="Name" constraintText="The name can have up to 128 characters. Valid characters: letters, numbers, hyphens (-), and underscores (_)."><Input value={name} disabled={Boolean(existing)} onChange={({ detail }) => setName(detail.value)} /></FormField>
              <FormField label={<>Description <i>- optional</i></>}><Input value={comment} onChange={({ detail }) => setComment(detail.value)} /></FormField>
            </SpaceBetween>
          </Container>
          {kind === "cache" && (
            <Container header={<Header variant="h2" description="Specify the minimum, maximum, and default TTL (time to live) values for objects in the CloudFront cache.">TTL settings</Header>}>
              <SpaceBetween direction="horizontal" size="l">
                <FormField label="Minimum TTL (seconds)"><Input type="number" value={ttl.min} onChange={({ detail }) => setTtl({ ...ttl, min: detail.value })} /></FormField>
                <FormField label="Maximum TTL (seconds)"><Input type="number" value={ttl.max} onChange={({ detail }) => setTtl({ ...ttl, max: detail.value })} /></FormField>
                <FormField label="Default TTL (seconds)"><Input type="number" value={ttl.def} onChange={({ detail }) => setTtl({ ...ttl, def: detail.value })} /></FormField>
              </SpaceBetween>
            </Container>
          )}
          {kind !== "headers" && (
            <Container header={<Header variant="h2" description={kind === "cache" ? "Choose the values to include in the cache key. They're also included in origin requests." : "Choose the values to include in origin requests."}>{kind === "cache" ? "Cache key settings" : "Origin request settings"}</Header>}>
              <SpaceBetween size="l">
                <KeyFields kind={kind} form={key} set={setKey} />
                {kind === "cache" && (
                  <FormField label="Compression support">
                    <SpaceBetween size="xxs"><Checkbox checked={gzip} onChange={({ detail }) => setGzip(detail.checked)}>Gzip</Checkbox><Checkbox checked={brotli} onChange={({ detail }) => setBrotli(detail.checked)}>Brotli</Checkbox></SpaceBetween>
                  </FormField>
                )}
              </SpaceBetween>
            </Container>
          )}
          {kind === "headers" && (
            <>
              <Container header={<Header variant="h2" description="Cross-origin resource sharing (CORS) headers.">Cross-origin resource sharing (CORS)</Header>}>
                <SpaceBetween size="l">
                  <Toggle checked={cors.enabled} onChange={({ detail }) => setCors({ ...cors, enabled: detail.checked })}>Configure CORS</Toggle>
                  {cors.enabled && (
                    <>
                      <FormField label="Access-Control-Allow-Origin" description="Comma-separated origins, or * for all."><Input value={cors.origins} onChange={({ detail }) => setCors({ ...cors, origins: detail.value })} /></FormField>
                      <FormField label="Access-Control-Allow-Headers"><Input value={cors.headers} onChange={({ detail }) => setCors({ ...cors, headers: detail.value })} /></FormField>
                      <FormField label="Access-Control-Allow-Methods"><SpaceBetween direction="horizontal" size="s">{allMethods.map((m) => <Checkbox key={m} checked={cors.methods.includes(m)} onChange={({ detail }) => setCors({ ...cors, methods: detail.checked ? [...cors.methods, m] : cors.methods.filter((x) => x !== m) })}>{m}</Checkbox>)}</SpaceBetween></FormField>
                      <FormField label={<>Access-Control-Expose-Headers <i>- optional</i></>}><Input value={cors.expose} onChange={({ detail }) => setCors({ ...cors, expose: detail.value })} /></FormField>
                      <FormField label="Access-Control-Max-Age (seconds)"><Input type="number" value={cors.maxAge} onChange={({ detail }) => setCors({ ...cors, maxAge: detail.value })} /></FormField>
                      <Checkbox checked={cors.credentials} onChange={({ detail }) => setCors({ ...cors, credentials: detail.checked })}>Access-Control-Allow-Credentials</Checkbox>
                      <Checkbox checked={cors.override} onChange={({ detail }) => setCors({ ...cors, override: detail.checked })}>Origin override</Checkbox>
                    </>
                  )}
                </SpaceBetween>
              </Container>
              <Container header={<Header variant="h2">Security headers</Header>}>
                <SpaceBetween size="l">
                  <Toggle checked={secOn} onChange={({ detail }) => setSecOn(detail.checked)}>Configure security headers</Toggle>
                  {secOn && (
                    <>
                      <Checkbox checked={sec.hsts} onChange={({ detail }) => setSec({ ...sec, hsts: detail.checked })}>Strict-Transport-Security</Checkbox>
                      {sec.hsts && <FormField label="max-age (seconds)"><Input type="number" value={sec.hstsAge} onChange={({ detail }) => setSec({ ...sec, hstsAge: detail.value })} /></FormField>}
                      <Checkbox checked={sec.nosniff} onChange={({ detail }) => setSec({ ...sec, nosniff: detail.checked })}>X-Content-Type-Options: nosniff</Checkbox>
                      <FormField label="X-Frame-Options"><Select expandToViewport selectedOption={{ value: sec.frame, label: sec.frame || "Not set" }} options={[{ value: "", label: "Not set" }, { value: "DENY", label: "DENY" }, { value: "SAMEORIGIN", label: "SAMEORIGIN" }]} onChange={({ detail }) => setSec({ ...sec, frame: detail.selectedOption.value ?? "" })} /></FormField>
                      <FormField label="Referrer-Policy"><Select expandToViewport selectedOption={{ value: sec.referrer, label: sec.referrer || "Not set" }} options={["", "no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin", "same-origin", "strict-origin", "strict-origin-when-cross-origin", "unsafe-url"].map((v) => ({ value: v, label: v || "Not set" }))} onChange={({ detail }) => setSec({ ...sec, referrer: detail.selectedOption.value ?? "" })} /></FormField>
                      <Checkbox checked={sec.xss} onChange={({ detail }) => setSec({ ...sec, xss: detail.checked })}>X-XSS-Protection: 1; mode=block</Checkbox>
                    </>
                  )}
                </SpaceBetween>
              </Container>
              <Container header={<Header variant="h2">Custom headers - optional</Header>}><TagEditor tags={custom} onChange={setCustom} emptyText="No custom headers." limit={10} /></Container>
              <Container header={<Header variant="h2">Server-Timing header</Header>}><Toggle checked={timing} onChange={({ detail }) => setTiming(detail.checked)}>Enable</Toggle></Container>
            </>
          )}
        </SpaceBetween>
      </Form>
    </CfLayout>
  )
}

export function PolicyDetailPage({ kind, id }: { kind: PolicyKind; id: string }) {
  const follow = useFollow()
  const router = useRouter()
  const policies = usePolicies(kind)
  const p = policies.data?.find((x) => x.Id === id)
  const [deleting, setDeleting] = useState(false)
  const c = p?.Config ?? {}
  const params = (c.ParametersInCacheKeyAndForwardedToOrigin as Obj | undefined) ?? c
  const key = configToKey(params)
  const fmt = (b: string, l: string) => `${behaviorLabel[b] ?? b}${l ? `: ${l}` : ""}`
  return (
    <CfLayout breadcrumbs={[{ text: "Policies", href: `/cloudfront/policies?tab=${slug[kind]}` }, { text: policyName(p?.Name) || id, href: "#" }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            description={p?.Comment}
            actions={p && p.Type !== "managed" && (
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => setDeleting(true)}>Delete</Button>
                <Button href={`/cloudfront/policies/${slug[kind]}/${id}/edit`} onFollow={follow}>Edit</Button>
              </SpaceBetween>
            )}
          >
            {policyName(p?.Name) || id}
          </Header>
        }
      >
        {policies.isPending ? (
          <StatusIndicator type="loading">Loading</StatusIndicator>
        ) : !p ? (
          <Alert type="error" header="Policy not found">{id} doesn&apos;t exist.</Alert>
        ) : (
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Details</Header>}>
              <KeyValuePairs columns={3} items={[{ label: "Name", value: p.Name }, { label: "ID", value: p.Id }, { label: "Type", value: p.Type === "managed" ? "Managed" : "Custom" }, { label: "Description", value: p.Comment || "–" }, { label: "Last modified", value: consoleDate(p.LastModifiedTime) }]} />
            </Container>
            {kind === "cache" && (
              <Container header={<Header variant="h2">TTL settings</Header>}>
                <KeyValuePairs columns={3} items={[{ label: "Minimum TTL (seconds)", value: String(c.MinTTL ?? "–") }, { label: "Maximum TTL (seconds)", value: String(c.MaxTTL ?? "–") }, { label: "Default TTL (seconds)", value: String(c.DefaultTTL ?? "–") }]} />
              </Container>
            )}
            {kind !== "headers" ? (
              <Container header={<Header variant="h2">{kind === "cache" ? "Cache key settings" : "Origin request settings"}</Header>}>
                <KeyValuePairs
                  columns={3}
                  items={[
                    { label: "Headers", value: fmt(key.headers, key.headerList) },
                    { label: "Query strings", value: fmt(key.queries, key.queryList) },
                    { label: "Cookies", value: fmt(key.cookies, key.cookieList) },
                    ...(kind === "cache" ? [{ label: "Compression support", value: [params.EnableAcceptEncodingGzip && "Gzip", params.EnableAcceptEncodingBrotli && "Brotli"].filter(Boolean).join(", ") || "None" }] : []),
                  ]}
                />
              </Container>
            ) : (
              <Container header={<Header variant="h2">Policy configuration</Header>}><CodeView value={pretty(c)} /></Container>
            )}
          </SpaceBetween>
        )}
        {deleting && p && <DeletePolicyModal kind={kind} policy={p} onDismiss={() => setDeleting(false)} onDone={() => { void policies.refetch(); router.push(`/cloudfront/policies?tab=${slug[kind]}`) }} />}
      </ContentLayout>
    </CfLayout>
  )
}
