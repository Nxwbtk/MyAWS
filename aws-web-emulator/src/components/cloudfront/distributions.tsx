"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import Checkbox from "@cloudscape-design/components/checkbox"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import ExpandableSection from "@cloudscape-design/components/expandable-section"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Modal from "@cloudscape-design/components/modal"
import Pagination from "@cloudscape-design/components/pagination"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import TextFilter from "@cloudscape-design/components/text-filter"
import Autosuggest from "@cloudscape-design/components/autosuggest"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EditModal } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"
import {
  CfLayout,
  DistStatus,
  getConfig,
  httpVersions,
  items,
  label,
  methodSets,
  policyName,
  priceClasses,
  toList,
  updateConfig,
  usePolicies,
  viewerProtocols,
  type Behavior,
  type Distribution,
  type DistributionConfig,
  type DistributionSummary,
  type Origin,
} from "@/components/cloudfront/shared"

export function useDistributions() {
  return useQuery({
    queryKey: ["emulator", "cloudfront", "distributions"],
    queryFn: async () => {
      const all: DistributionSummary[] = []
      let marker: string | undefined
      do {
        const r = await callAws<{ DistributionList?: { Items?: DistributionSummary[]; NextMarker?: string; IsTruncated?: boolean } }>("cloudfront", "ListDistributions", marker ? { Marker: marker } : {})
        all.push(...(r.DistributionList?.Items ?? []))
        marker = r.DistributionList?.IsTruncated ? r.DistributionList.NextMarker : undefined
      } while (marker)
      return all
    },
  })
}

function DeleteDistributionsModal({ dists, onDismiss, onDone }: { dists: DistributionSummary[]; onDismiss: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const enabled = dists.filter((d) => d.Enabled !== false)
  return (
    <Modal
      visible
      header={`Delete ${dists.length === 1 ? "distribution" : "distributions"}`}
      onDismiss={onDismiss}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={enabled.length > 0}
              onClick={async () => {
                setBusy(true)
                setError(undefined)
                try {
                  for (const d of dists) {
                    const { ETag } = await getConfig(d.Id)
                    await callAws("cloudfront", "DeleteDistribution", { Id: d.Id, IfMatch: ETag })
                  }
                  flash.success(`Successfully deleted ${dists.length === 1 ? `distribution ${dists[0].Id}` : `${dists.length} distributions`}.`)
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
        {enabled.length > 0 ? (
          <Alert type="warning" header="Disable the distribution first">You can only delete a distribution that is disabled and deployed. Disable {enabled.map((d) => d.Id).join(", ")} and wait for the deployment to finish.</Alert>
        ) : (
          <Box>Delete {dists.map((d) => d.Id).join(", ")} permanently? This action can&apos;t be undone.</Box>
        )}
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  )
}

export function DistributionsPage() {
  const follow = useFollow()
  const router = useRouter()
  const dists = useDistributions()
  const [selected, setSelected] = useState<DistributionSummary[]>([])
  const [filter, setFilter] = useState("")
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState(false)
  const list = useMemo(() => (dists.data ?? []).filter((d) => !filter || [d.Id, d.Comment, d.DomainName, ...items(d.Aliases), ...items(d.Origins).map((o) => o.DomainName)].some((v) => v?.toLowerCase().includes(filter.toLowerCase()))), [dists.data, filter])
  const toggle = async (enable: boolean) => {
    try {
      for (const d of selected) await updateConfig(d.Id, (c) => { c.Enabled = enable })
      flash.success(`Successfully ${enable ? "enabled" : "disabled"} ${selected.length === 1 ? selected[0].Id : `${selected.length} distributions`}.`)
      await dists.refetch()
      setSelected([])
    } catch (e) {
      flash.error(errorMessage(e))
    }
  }
  return (
    <CfLayout breadcrumbs={[{ text: "Distributions", href: "/cloudfront/distributions" }]} contentType="table">
      <Table
        variant="full-page"
        loading={dists.isPending}
        loadingText="Loading distributions"
        selectionType="multi"
        trackBy="Id"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        items={list.slice((page - 1) * 20, page * 20)}
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={`(${dists.data?.length ?? 0})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void dists.refetch()} />
                <ButtonDropdown
                  disabled={!selected.length}
                  items={[
                    { id: "enable", text: "Enable", disabled: selected.every((d) => d.Enabled !== false) },
                    { id: "disable", text: "Disable", disabled: selected.every((d) => d.Enabled === false) },
                    { id: "delete", text: "Delete" },
                  ]}
                  onItemClick={({ detail }) => (detail.id === "delete" ? setDeleting(true) : void toggle(detail.id === "enable"))}
                >
                  Actions
                </ButtonDropdown>
                <Button variant="primary" href="/cloudfront/distributions/create" onFollow={follow}>Create distribution</Button>
              </SpaceBetween>
            }
          >
            Distributions
          </Header>
        }
        filter={<TextFilter filteringText={filter} filteringPlaceholder="Search all distributions" onChange={({ detail }) => { setFilter(detail.filteringText); setPage(1) }} countText={`${list.length} matches`} />}
        pagination={<Pagination currentPageIndex={page} pagesCount={Math.max(1, Math.ceil(list.length / 20))} onChange={({ detail }) => setPage(detail.currentPageIndex)} />}
        columnDefinitions={[
          { id: "id", header: "ID", cell: (d) => <Link href={`/cloudfront/distributions/${d.Id}`} onFollow={follow}>{d.Id}</Link>, sortingField: "Id" },
          { id: "desc", header: "Description", cell: (d) => d.Comment || "–" },
          { id: "type", header: "Type", cell: () => "Production" },
          { id: "domain", header: "Domain name (standard)", cell: (d) => d.DomainName },
          { id: "aliases", header: "Alternate domain names", cell: (d) => items(d.Aliases).join(", ") || "–" },
          { id: "origins", header: "Origins", cell: (d) => items(d.Origins).map((o) => o.DomainName).join(", ") || "–" },
          { id: "status", header: "Status", cell: (d) => <DistStatus status={d.Status} enabled={d.Enabled} /> },
          { id: "modified", header: "Last modified", cell: (d) => (d.Status === "InProgress" ? <StatusIndicator type="in-progress">Deploying</StatusIndicator> : consoleDate(d.LastModifiedTime)) },
        ]}
        empty={
          <Box textAlign="center" color="inherit">
            <SpaceBetween size="xs">
              <b>No distributions</b>
              <Box color="inherit">You don&apos;t have any distributions.</Box>
              <Button onClick={() => router.push("/cloudfront/distributions/create")}>Create distribution</Button>
            </SpaceBetween>
          </Box>
        }
      />
      {deleting && <DeleteDistributionsModal dists={selected} onDismiss={() => setDeleting(false)} onDone={() => { setDeleting(false); setSelected([]); void dists.refetch() }} />}
    </CfLayout>
  )
}

function useOacs() {
  return useAws<{ OriginAccessControlList?: { Items?: { Id: string; Name: string; OriginAccessControlOriginType?: string }[] } }>("cloudfront", "ListOriginAccessControls", {})
}
function useBuckets() {
  return useAws<{ Buckets?: { Name: string }[] }>("s3", "ListBuckets", {})
}

type OriginForm = { domain: string; path: string; id: string; access: "public" | "oac"; oac: string; protocol: string; httpPort: string; httpsPort: string; attempts: string; timeout: string; headers: Tag[] }
const isS3 = (domain: string) => /\.s3[.-]/.test(domain) || domain.endsWith(".s3.amazonaws.com")
const emptyOrigin = (): OriginForm => ({ domain: "", path: "", id: "", access: "public", oac: "", protocol: "https-only", httpPort: "80", httpsPort: "443", attempts: "3", timeout: "10", headers: [] })
const originToForm = (o: Origin): OriginForm => ({
  domain: o.DomainName,
  path: o.OriginPath ?? "",
  id: o.Id,
  access: o.OriginAccessControlId ? "oac" : "public",
  oac: o.OriginAccessControlId ?? "",
  protocol: o.CustomOriginConfig?.OriginProtocolPolicy ?? "https-only",
  httpPort: String(o.CustomOriginConfig?.HTTPPort ?? 80),
  httpsPort: String(o.CustomOriginConfig?.HTTPSPort ?? 443),
  attempts: String(o.ConnectionAttempts ?? 3),
  timeout: String(o.ConnectionTimeout ?? 10),
  headers: items(o.CustomHeaders).map((h) => ({ Key: h.HeaderName, Value: h.HeaderValue })),
})
function formToOrigin(f: OriginForm, prev?: Origin): Origin {
  const s3 = isS3(f.domain)
  const o: Origin = {
    ...(prev ?? {}),
    Id: f.id || f.domain,
    DomainName: f.domain,
    OriginPath: f.path,
    CustomHeaders: toList(f.headers.filter((h) => h.Key).map((h) => ({ HeaderName: h.Key, HeaderValue: h.Value ?? "" }))),
    ConnectionAttempts: Number(f.attempts) || 3,
    ConnectionTimeout: Number(f.timeout) || 10,
    OriginAccessControlId: s3 && f.access === "oac" ? f.oac : "",
  }
  if (s3) {
    o.S3OriginConfig = { OriginAccessIdentity: "" }
    delete o.CustomOriginConfig
  } else {
    o.CustomOriginConfig = { HTTPPort: Number(f.httpPort) || 80, HTTPSPort: Number(f.httpsPort) || 443, OriginProtocolPolicy: f.protocol, OriginSslProtocols: { Quantity: 1, Items: ["TLSv1.2"] }, OriginReadTimeout: 30, OriginKeepaliveTimeout: 5 }
    delete o.S3OriginConfig
  }
  return o
}

function OriginFields({ form, set, idEditable = true }: { form: OriginForm; set: (f: OriginForm) => void; idEditable?: boolean }) {
  const buckets = useBuckets()
  const oacs = useOacs()
  const s3 = isS3(form.domain)
  const region = "ap-southeast-7"
  return (
    <SpaceBetween size="l">
      <FormField label="Origin domain" description="Choose an AWS origin, or enter your origin's domain name.">
        <Autosuggest
          value={form.domain}
          placeholder="Choose origin domain"
          enteredTextLabel={(v) => `Use: "${v}"`}
          empty="No AWS origins"
          options={[{ label: "Amazon S3", options: (buckets.data?.Buckets ?? []).map((b) => ({ value: `${b.Name}.s3.${region}.amazonaws.com` })) }]}
          onChange={({ detail }) => set({ ...form, domain: detail.value, id: idEditable && (!form.id || form.id === form.domain) ? detail.value : form.id })}
        />
      </FormField>
      <FormField label={<>Origin path <i>- optional</i></>} description="Enter a URL path to append to the origin domain name for origin requests."><Input value={form.path} placeholder="/path" onChange={({ detail }) => set({ ...form, path: detail.value })} /></FormField>
      <FormField label="Name" description="Enter a name for this origin."><Input value={form.id} disabled={!idEditable} onChange={({ detail }) => set({ ...form, id: detail.value })} /></FormField>
      {s3 ? (
        <FormField label="Origin access">
          <RadioGroup
            value={form.access}
            onChange={({ detail }) => set({ ...form, access: detail.value as "public" | "oac" })}
            items={[
              { value: "public", label: "Public", description: "Bucket must allow public access." },
              { value: "oac", label: "Origin access control settings (recommended)", description: "Bucket can restrict access to only CloudFront." },
            ]}
          />
        </FormField>
      ) : (
        <SpaceBetween size="l">
          <FormField label="Protocol">
            <RadioGroup value={form.protocol} onChange={({ detail }) => set({ ...form, protocol: detail.value })} items={[{ value: "http-only", label: "HTTP only" }, { value: "https-only", label: "HTTPS only" }, { value: "match-viewer", label: "Match viewer" }]} />
          </FormField>
          <SpaceBetween direction="horizontal" size="l">
            <FormField label="HTTP port"><Input type="number" value={form.httpPort} onChange={({ detail }) => set({ ...form, httpPort: detail.value })} /></FormField>
            <FormField label="HTTPS port"><Input type="number" value={form.httpsPort} onChange={({ detail }) => set({ ...form, httpsPort: detail.value })} /></FormField>
          </SpaceBetween>
        </SpaceBetween>
      )}
      {s3 && form.access === "oac" && (
        <FormField label="Origin access control" description="Select an existing origin access control, or create a new one on the Origin access page.">
          <Select
            selectedOption={form.oac ? { value: form.oac, label: oacs.data?.OriginAccessControlList?.Items?.find((o) => o.Id === form.oac)?.Name ?? form.oac } : null}
            placeholder="Choose origin access control"
            loadingText="Loading"
            statusType={oacs.isPending ? "loading" : "finished"}
            options={(oacs.data?.OriginAccessControlList?.Items ?? []).map((o) => ({ value: o.Id, label: o.Name, description: o.Id }))}
            onChange={({ detail }) => set({ ...form, oac: detail.selectedOption.value ?? "" })}
          />
        </FormField>
      )}
      <ExpandableSection headerText="Additional settings">
        <SpaceBetween size="l">
          <FormField label="Connection attempts"><Input type="number" value={form.attempts} onChange={({ detail }) => set({ ...form, attempts: detail.value })} /></FormField>
          <FormField label="Connection timeout" description="Seconds"><Input type="number" value={form.timeout} onChange={({ detail }) => set({ ...form, timeout: detail.value })} /></FormField>
          <FormField label={<>Add custom header <i>- optional</i></>} stretch><TagEditor tags={form.headers} onChange={(headers) => set({ ...form, headers })} emptyText="No custom headers." limit={10} /></FormField>
        </SpaceBetween>
      </ExpandableSection>
    </SpaceBetween>
  )
}

type BehaviorForm = { path: string; origin: string; viewer: string; methods: string; cacheMethods: boolean; compress: boolean; cache: string; originReq: string; headers: string }
const behaviorToForm = (b: Behavior): BehaviorForm => ({
  path: b.PathPattern ?? "",
  origin: b.TargetOriginId,
  viewer: b.ViewerProtocolPolicy,
  methods: items(b.AllowedMethods).slice().sort((a, c) => order(a) - order(c)).join(","),
  cacheMethods: items(b.AllowedMethods?.CachedMethods).includes("OPTIONS"),
  compress: b.Compress ?? true,
  cache: b.CachePolicyId ?? "",
  originReq: b.OriginRequestPolicyId ?? "",
  headers: b.ResponseHeadersPolicyId ?? "",
})
const methodOrder = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
const order = (m: string) => methodOrder.indexOf(m)
function formToBehavior(f: BehaviorForm, prev?: Behavior): Behavior {
  const allowed = f.methods.split(",")
  const cached = f.cacheMethods && allowed.includes("OPTIONS") ? ["GET", "HEAD", "OPTIONS"] : ["GET", "HEAD"]
  const b: Behavior = {
    ...(prev ?? {}),
    TargetOriginId: f.origin,
    ViewerProtocolPolicy: f.viewer,
    AllowedMethods: { Quantity: allowed.length, Items: allowed, CachedMethods: { Quantity: cached.length, Items: cached } },
    Compress: f.compress,
    CachePolicyId: f.cache,
    ...(f.originReq ? { OriginRequestPolicyId: f.originReq } : {}),
    ...(f.headers ? { ResponseHeadersPolicyId: f.headers } : {}),
  }
  if (!f.originReq) delete b.OriginRequestPolicyId
  if (!f.headers) delete b.ResponseHeadersPolicyId
  delete b.ForwardedValues
  delete b.MinTTL
  delete b.DefaultTTL
  delete b.MaxTTL
  if (f.path) b.PathPattern = f.path
  else delete b.PathPattern
  return b
}

function PolicySelect({ kind, value, onChange, optional }: { kind: "cache" | "origin" | "headers"; value: string; onChange: (v: string) => void; optional?: boolean }) {
  const policies = usePolicies(kind)
  const options = (policies.data ?? []).map((p) => ({ value: p.Id, label: policyName(p.Name), description: p.Comment, tags: [p.Type === "managed" ? "Managed" : "Custom"] }))
  const selected = options.find((o) => o.value === value)
  return (
    <Select
      selectedOption={selected ?? (value ? { value, label: value } : null)}
      placeholder={optional ? "Select policy (optional)" : "Select policy"}
      statusType={policies.isPending ? "loading" : "finished"}
      filteringType="auto"
      options={[...(optional ? [{ value: "", label: "None" }] : []), ...options]}
      onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")}
    />
  )
}

function BehaviorFields({ form, set, origins, isDefault }: { form: BehaviorForm; set: (f: BehaviorForm) => void; origins: string[]; isDefault?: boolean }) {
  return (
    <SpaceBetween size="l">
      {!isDefault && <FormField label="Path pattern" description="Path pattern is case sensitive."><Input value={form.path} placeholder="/images/*" onChange={({ detail }) => set({ ...form, path: detail.value })} /></FormField>}
      <FormField label="Origin and origin groups"><Select selectedOption={form.origin ? { value: form.origin, label: form.origin } : null} placeholder="Choose origin" options={origins.map((o) => ({ value: o, label: o }))} onChange={({ detail }) => set({ ...form, origin: detail.selectedOption.value ?? "" })} /></FormField>
      <FormField label="Compress objects automatically"><RadioGroup value={form.compress ? "yes" : "no"} onChange={({ detail }) => set({ ...form, compress: detail.value === "yes" })} items={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} /></FormField>
      <FormField label="Viewer protocol policy"><RadioGroup value={form.viewer} onChange={({ detail }) => set({ ...form, viewer: detail.value })} items={viewerProtocols} /></FormField>
      <FormField label="Allowed HTTP methods"><RadioGroup value={form.methods} onChange={({ detail }) => set({ ...form, methods: detail.value })} items={methodSets} /></FormField>
      {form.methods !== "GET,HEAD" && <Checkbox checked={form.cacheMethods} onChange={({ detail }) => set({ ...form, cacheMethods: detail.checked })}>Cache HTTP methods: OPTIONS</Checkbox>}
      <FormField label="Cache policy" description="Choose an existing cache policy or create a new one on the Policies page."><PolicySelect kind="cache" value={form.cache} onChange={(cache) => set({ ...form, cache })} /></FormField>
      <FormField label={<>Origin request policy <i>- optional</i></>}><PolicySelect kind="origin" optional value={form.originReq} onChange={(originReq) => set({ ...form, originReq })} /></FormField>
      <FormField label={<>Response headers policy <i>- optional</i></>}><PolicySelect kind="headers" optional value={form.headers} onChange={(headers) => set({ ...form, headers })} /></FormField>
    </SpaceBetween>
  )
}

function useCertificates() {
  return useAws<{ CertificateSummaryList?: { CertificateArn: string; DomainName?: string; Status?: string }[] }>("acm", "ListCertificates", { CertificateStatuses: ["ISSUED"] })
}

type SettingsForm = { priceClass: string; aliases: string; cert: string; http: string; root: string; ipv6: boolean; comment: string; logging: boolean; logBucket: string; logPrefix: string; cookies: boolean }
function SettingsFields({ form, set }: { form: SettingsForm; set: (f: SettingsForm) => void }) {
  const certs = useCertificates()
  const certOptions = (certs.data?.CertificateSummaryList ?? []).map((c) => ({ value: c.CertificateArn, label: c.DomainName ?? c.CertificateArn, description: c.CertificateArn }))
  return (
    <SpaceBetween size="l">
      <FormField label="Price class" description="Choose the price class associated with the maximum price that you want to pay."><RadioGroup value={form.priceClass} onChange={({ detail }) => set({ ...form, priceClass: detail.value })} items={priceClasses} /></FormField>
      <FormField label="AWS WAF web ACL" description="Not available in the local emulator."><Select disabled selectedOption={null} placeholder="Do not enable security protections" options={[]} /></FormField>
      <FormField label={<>Alternate domain name (CNAME) <i>- optional</i></>} description="Add the custom domain names that you use in URLs for the files served by this distribution. Enter one per line."><Textarea rows={2} value={form.aliases} placeholder="www.example.com" onChange={({ detail }) => set({ ...form, aliases: detail.value })} /></FormField>
      <FormField label={<>Custom SSL certificate <i>- optional</i></>} description="Associate a certificate from AWS Certificate Manager.">
        <Select selectedOption={certOptions.find((c) => c.value === form.cert) ?? null} placeholder="Choose certificate" statusType={certs.isPending ? "loading" : "finished"} empty="No issued certificates" options={[{ value: "", label: "Default CloudFront certificate (*.cloudfront.net)" }, ...certOptions]} onChange={({ detail }) => set({ ...form, cert: detail.selectedOption.value ?? "" })} />
      </FormField>
      <FormField label="Supported HTTP versions"><Select selectedOption={{ value: form.http, label: label(httpVersions, form.http) }} options={httpVersions} onChange={({ detail }) => set({ ...form, http: detail.selectedOption.value ?? "http2" })} /></FormField>
      <FormField label={<>Default root object <i>- optional</i></>} description="The object (file name) to return when a viewer requests the root URL (/) instead of a specific object."><Input value={form.root} placeholder="index.html" onChange={({ detail }) => set({ ...form, root: detail.value })} /></FormField>
      <FormField label="Standard logging" description="Get logs of viewer requests delivered to an Amazon S3 bucket.">
        <RadioGroup value={form.logging ? "on" : "off"} onChange={({ detail }) => set({ ...form, logging: detail.value === "on" })} items={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]} />
      </FormField>
      {form.logging && (
        <SpaceBetween size="l">
          <FormField label="S3 bucket"><Input value={form.logBucket} placeholder="bucket-name.s3.amazonaws.com" onChange={({ detail }) => set({ ...form, logBucket: detail.value })} /></FormField>
          <FormField label={<>Log prefix <i>- optional</i></>}><Input value={form.logPrefix} onChange={({ detail }) => set({ ...form, logPrefix: detail.value })} /></FormField>
          <Checkbox checked={form.cookies} onChange={({ detail }) => set({ ...form, cookies: detail.checked })}>Cookie logging</Checkbox>
        </SpaceBetween>
      )}
      <FormField label="IPv6"><RadioGroup value={form.ipv6 ? "on" : "off"} onChange={({ detail }) => set({ ...form, ipv6: detail.value === "on" })} items={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]} /></FormField>
      <FormField label={<>Description <i>- optional</i></>}><Textarea rows={2} value={form.comment} onChange={({ detail }) => set({ ...form, comment: detail.value })} /></FormField>
    </SpaceBetween>
  )
}
const settingsToForm = (c: DistributionConfig): SettingsForm => ({
  priceClass: c.PriceClass ?? "PriceClass_All",
  aliases: items(c.Aliases).join("\n"),
  cert: c.ViewerCertificate?.ACMCertificateArn ?? "",
  http: c.HttpVersion ?? "http2",
  root: c.DefaultRootObject ?? "",
  ipv6: c.IsIPV6Enabled ?? false,
  comment: c.Comment ?? "",
  logging: c.Logging?.Enabled ?? false,
  logBucket: c.Logging?.Bucket ?? "",
  logPrefix: c.Logging?.Prefix ?? "",
  cookies: c.Logging?.IncludeCookies ?? false,
})
function applySettings(c: DistributionConfig, f: SettingsForm): DistributionConfig {
  const aliases = f.aliases.split(/[\s,]+/).filter(Boolean)
  return {
    ...c,
    PriceClass: f.priceClass,
    Aliases: toList(aliases),
    ViewerCertificate: f.cert ? { ACMCertificateArn: f.cert, SSLSupportMethod: "sni-only", MinimumProtocolVersion: "TLSv1.2_2021" } : { CloudFrontDefaultCertificate: true, MinimumProtocolVersion: "TLSv1" },
    HttpVersion: f.http,
    DefaultRootObject: f.root,
    IsIPV6Enabled: f.ipv6,
    Comment: f.comment,
    Logging: { Enabled: f.logging, IncludeCookies: f.logging && f.cookies, Bucket: f.logging ? f.logBucket : "", Prefix: f.logging ? f.logPrefix : "" },
  }
}

export function CreateDistributionPage() {
  const router = useRouter()
  const [origin, setOrigin] = useState<OriginForm>(emptyOrigin())
  const [behavior, setBehavior] = useState<BehaviorForm>({ path: "", origin: "", viewer: "redirect-to-https", methods: "GET,HEAD", cacheMethods: false, compress: true, cache: "658327ea-f89d-4fab-a63d-7e88639e58f6", originReq: "", headers: "" })
  const [settings, setSettings] = useState<SettingsForm>({ priceClass: "PriceClass_All", aliases: "", cert: "", http: "http2", root: "", ipv6: true, comment: "", logging: false, logBucket: "", logPrefix: "", cookies: false })
  const [tags, setTags] = useState<Tag[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const originId = origin.id || origin.domain
  return (
    <CfLayout breadcrumbs={[{ text: "Distributions", href: "/cloudfront/distributions" }, { text: "Create", href: "/cloudfront/distributions/create" }]} contentType="form">
      <Form
        header={<Header variant="h1">Create distribution</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push("/cloudfront/distributions")}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!origin.domain || (origin.access === "oac" && isS3(origin.domain) && !origin.oac)}
              onClick={async () => {
                setBusy(true)
                setError(undefined)
                try {
                  const config = applySettings(
                    {
                      CallerReference: `myaws-${crypto.randomUUID()}`,
                      Comment: "",
                      Enabled: true,
                      Origins: toList([formToOrigin({ ...origin, id: originId })]),
                      DefaultCacheBehavior: formToBehavior({ ...behavior, origin: originId, path: "" }),
                    },
                    settings,
                  )
                  const t = tags.filter((x) => x.Key)
                  const r = t.length
                    ? await callAws<{ Distribution: Distribution }>("cloudfront", "CreateDistributionWithTags", { DistributionConfigWithTags: { DistributionConfig: config, Tags: { Items: t.map((x) => ({ Key: x.Key, Value: x.Value ?? "" })) } } })
                    : await callAws<{ Distribution: Distribution }>("cloudfront", "CreateDistribution", { DistributionConfig: config })
                  flash.success(`Successfully created new distribution ${r.Distribution.Id}.`)
                  router.push(`/cloudfront/distributions/${r.Distribution.Id}`)
                } catch (e) {
                  setError(errorMessage(e))
                  setBusy(false)
                }
              }}
            >
              Create distribution
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Origin</Header>}><OriginFields form={origin} set={setOrigin} /></Container>
          <Container header={<Header variant="h2">Default cache behavior</Header>}><BehaviorFields isDefault form={{ ...behavior, origin: originId }} set={setBehavior} origins={originId ? [originId] : []} /></Container>
          <Container header={<Header variant="h2" description="Associate functions with the default cache behavior after the distribution is created.">Function associations - optional</Header>}><Box color="text-body-secondary">You can add CloudFront Functions on the Behaviors tab after you create the distribution.</Box></Container>
          <Container header={<Header variant="h2">Settings</Header>}><SettingsFields form={settings} set={setSettings} /></Container>
          <Container header={<Header variant="h2">Tags - optional</Header>}><TagEditor tags={tags} onChange={setTags} /></Container>
        </SpaceBetween>
      </Form>
    </CfLayout>
  )
}

function useDistribution(id: string) {
  return useAws<{ Distribution?: Distribution; ETag?: string }>("cloudfront", "GetDistribution", { Id: id })
}

function GeneralTab({ dist, refresh }: { dist: Distribution; refresh: () => Promise<unknown> }) {
  const c = dist.DistributionConfig
  const [edit, setEdit] = useState<SettingsForm>()
  return (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2">Details</Header>}>
        <KeyValuePairs
          columns={3}
          items={[
            { label: "Distribution domain name", value: <Copyable value={dist.DomainName} /> },
            { label: "ARN", value: <Copyable value={dist.ARN} /> },
            { label: "Last modified", value: dist.Status === "InProgress" ? <StatusIndicator type="in-progress">Deploying</StatusIndicator> : consoleDate(dist.LastModifiedTime) },
          ]}
        />
      </Container>
      <Container header={<Header variant="h2" actions={<Button onClick={() => setEdit(settingsToForm(c))}>Edit</Button>}>Settings</Header>}>
        <KeyValuePairs
          columns={3}
          items={[
            { label: "Description", value: c.Comment || "–" },
            { label: "Price class", value: label(priceClasses, c.PriceClass) },
            { label: "Supported HTTP versions", value: label(httpVersions, c.HttpVersion) },
            { label: "Alternate domain names", value: items(c.Aliases).join(", ") || "–" },
            { label: "Standard logging", value: c.Logging?.Enabled ? `On (${c.Logging.Bucket}${c.Logging.Prefix ? `/${c.Logging.Prefix}` : ""})` : "Off" },
            { label: "Cookie logging", value: c.Logging?.IncludeCookies ? "On" : "Off" },
            { label: "Default root object", value: c.DefaultRootObject || "–" },
            { label: "Custom SSL certificate", value: c.ViewerCertificate?.ACMCertificateArn ?? "–" },
            { label: "Security policy", value: c.ViewerCertificate?.MinimumProtocolVersion ?? "–" },
            { label: "IPv6", value: c.IsIPV6Enabled ? "On" : "Off" },
            { label: "AWS WAF", value: c.WebACLId || "–" },
            { label: "Continuous deployment", value: "–" },
          ]}
        />
      </Container>
      <EditModal
        visible={Boolean(edit)}
        size="large"
        title="Edit settings"
        onDismiss={() => setEdit(undefined)}
        success="Successfully updated the distribution settings."
        onSave={async () => {
          if (!edit) return
          await updateConfig(dist.Id, (cfg) => applySettings(cfg, edit))
          await refresh()
        }}
      >
        {edit && <SettingsFields form={edit} set={setEdit} />}
      </EditModal>
    </SpaceBetween>
  )
}

function SecurityTab({ dist }: { dist: Distribution }) {
  const c = dist.DistributionConfig
  return (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2" description="Protect your distribution from common web threats with AWS WAF.">Web Application Firewall (WAF)</Header>}>
        <KeyValuePairs columns={2} items={[{ label: "Web ACL", value: c.WebACLId || "Security protections are not enabled" }, { label: "Status", value: "AWS WAF isn't available in the local emulator." }]} />
      </Container>
      <Container header={<Header variant="h2">Viewer certificate</Header>}>
        <KeyValuePairs columns={3} items={[{ label: "Certificate", value: c.ViewerCertificate?.ACMCertificateArn ?? "Default CloudFront certificate" }, { label: "SSL support method", value: c.ViewerCertificate?.SSLSupportMethod ?? "–" }, { label: "Minimum protocol version", value: c.ViewerCertificate?.MinimumProtocolVersion ?? "–" }]} />
      </Container>
    </SpaceBetween>
  )
}

function OriginsTab({ dist, refresh }: { dist: Distribution; refresh: () => Promise<unknown> }) {
  const origins = items(dist.DistributionConfig.Origins)
  const [selected, setSelected] = useState<Origin[]>([])
  const [form, setForm] = useState<{ edit?: Origin; data: OriginForm }>()
  const used = (id: string) => [dist.DistributionConfig.DefaultCacheBehavior, ...items(dist.DistributionConfig.CacheBehaviors)].some((b) => b.TargetOriginId === id)
  return (
    <>
      <Table
        header={
          <Header
            variant="h2"
            counter={`(${origins.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={selected.length !== 1} onClick={() => setForm({ edit: selected[0], data: originToForm(selected[0]) })}>Edit</Button>
                <Button
                  disabled={selected.length !== 1 || origins.length < 2 || used(selected[0].Id)}
                  onClick={async () => {
                    try {
                      await updateConfig(dist.Id, (c) => { c.Origins = toList(items(c.Origins).filter((o) => o.Id !== selected[0].Id)) })
                      flash.success(`Successfully deleted origin ${selected[0].Id}.`)
                      setSelected([])
                      await refresh()
                    } catch (e) {
                      flash.error(errorMessage(e))
                    }
                  }}
                >
                  Delete
                </Button>
                <Button onClick={() => setForm({ data: emptyOrigin() })}>Create origin</Button>
              </SpaceBetween>
            }
          >
            Origins
          </Header>
        }
        selectionType="single"
        trackBy="Id"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        items={origins}
        columnDefinitions={[
          { id: "name", header: "Origin name", cell: (o) => o.Id },
          { id: "domain", header: "Origin domain", cell: (o) => o.DomainName },
          { id: "path", header: "Origin path", cell: (o) => o.OriginPath || "–" },
          { id: "type", header: "Origin type", cell: (o) => (o.S3OriginConfig ? "S3" : "Custom origin") },
          { id: "access", header: "Origin access", cell: (o) => (o.OriginAccessControlId ? `OAC ${o.OriginAccessControlId}` : o.S3OriginConfig ? "Public" : "–") },
          { id: "shield", header: "Origin Shield region", cell: (o) => (o.OriginShield?.Enabled ? o.OriginShield.OriginShieldRegion : "–") },
          { id: "protocol", header: "Protocol", cell: (o) => o.CustomOriginConfig?.OriginProtocolPolicy ?? "–" },
        ]}
      />
      <EditModal
        visible={Boolean(form)}
        size="large"
        title={form?.edit ? `Edit origin ${form.edit.Id}` : "Create origin"}
        saveLabel={form?.edit ? "Save changes" : "Create origin"}
        saveDisabled={!form?.data.domain}
        onDismiss={() => setForm(undefined)}
        success={form?.edit ? "Successfully updated origin." : "Successfully created origin."}
        onSave={async () => {
          if (!form) return
          await updateConfig(dist.Id, (c) => {
            const list = items(c.Origins)
            const next = formToOrigin({ ...form.data, id: form.data.id || form.data.domain }, form.edit && list.find((o) => o.Id === form.edit?.Id))
            c.Origins = toList(form.edit ? list.map((o) => (o.Id === form.edit?.Id ? next : o)) : [...list, next])
          })
          setSelected([])
          await refresh()
        }}
      >
        {form && <OriginFields form={form.data} set={(data) => setForm({ ...form, data })} idEditable={!form.edit} />}
      </EditModal>
    </>
  )
}

function BehaviorsTab({ dist, refresh }: { dist: Distribution; refresh: () => Promise<unknown> }) {
  const c = dist.DistributionConfig
  const rows = [...items(c.CacheBehaviors).map((b, i) => ({ ...b, _i: i })), { ...c.DefaultCacheBehavior, PathPattern: "Default (*)", _i: -1 }]
  const cache = usePolicies("cache")
  const orp = usePolicies("origin")
  const rhp = usePolicies("headers")
  const name = (list: typeof cache, id?: string) => (id ? policyName(list.data?.find((p) => p.Id === id)?.Name) || id : "–")
  const [selected, setSelected] = useState<(typeof rows)[number][]>([])
  const [form, setForm] = useState<{ index?: number; data: BehaviorForm }>()
  const origins = items(c.Origins).map((o) => o.Id)
  const move = async (delta: number) => {
    const i = selected[0]._i
    try {
      await updateConfig(dist.Id, (cfg) => {
        const list = [...items(cfg.CacheBehaviors)]
        const j = i + delta
        if (j < 0 || j >= list.length) return
        ;[list[i], list[j]] = [list[j], list[i]]
        cfg.CacheBehaviors = toList(list)
      })
      setSelected([])
      await refresh()
    } catch (e) {
      flash.error(errorMessage(e))
    }
  }
  return (
    <>
      <Table
        header={
          <Header
            variant="h2"
            counter={`(${rows.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={selected.length !== 1 || selected[0]._i < 1} onClick={() => void move(-1)}>Move up</Button>
                <Button disabled={selected.length !== 1 || selected[0]._i < 0 || selected[0]._i >= rows.length - 2} onClick={() => void move(1)}>Move down</Button>
                <Button disabled={selected.length !== 1} onClick={() => setForm({ index: selected[0]._i, data: behaviorToForm(selected[0]._i < 0 ? c.DefaultCacheBehavior : selected[0]) })}>Edit</Button>
                <Button
                  disabled={selected.length !== 1 || selected[0]._i < 0}
                  onClick={async () => {
                    try {
                      await updateConfig(dist.Id, (cfg) => { cfg.CacheBehaviors = toList(items(cfg.CacheBehaviors).filter((_, j) => j !== selected[0]._i)) })
                      flash.success("Successfully deleted behavior.")
                      setSelected([])
                      await refresh()
                    } catch (e) {
                      flash.error(errorMessage(e))
                    }
                  }}
                >
                  Delete
                </Button>
                <Button onClick={() => setForm({ data: { path: "", origin: origins[0] ?? "", viewer: "redirect-to-https", methods: "GET,HEAD", cacheMethods: false, compress: true, cache: "658327ea-f89d-4fab-a63d-7e88639e58f6", originReq: "", headers: "" } })}>Create behavior</Button>
              </SpaceBetween>
            }
          >
            Behaviors
          </Header>
        }
        selectionType="single"
        trackBy={(b) => String(b._i)}
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        items={rows}
        columnDefinitions={[
          { id: "precedence", header: "Precedence", cell: (b) => (b._i < 0 ? rows.length - 1 : b._i) },
          { id: "path", header: "Path pattern", cell: (b) => b.PathPattern },
          { id: "origin", header: "Origin or origin group", cell: (b) => b.TargetOriginId },
          { id: "viewer", header: "Viewer protocol policy", cell: (b) => label(viewerProtocols, b.ViewerProtocolPolicy) },
          { id: "cache", header: "Cache policy name", cell: (b) => name(cache, b.CachePolicyId) },
          { id: "orp", header: "Origin request policy name", cell: (b) => name(orp, b.OriginRequestPolicyId) },
          { id: "rhp", header: "Response headers policy name", cell: (b) => name(rhp, b.ResponseHeadersPolicyId) },
          { id: "fn", header: "Functions", cell: (b) => items(b.FunctionAssociations).map((f) => `${f.FunctionARN.split("/").pop()} (${f.EventType})`).join(", ") || "–" },
        ]}
      />
      <EditModal
        visible={Boolean(form)}
        size="large"
        title={form?.index === undefined ? "Create behavior" : form.index < 0 ? "Edit default behavior" : "Edit behavior"}
        saveLabel={form?.index === undefined ? "Create behavior" : "Save changes"}
        saveDisabled={!form?.data.origin || !form.data.cache || (form.index !== -1 && !form.data.path)}
        onDismiss={() => setForm(undefined)}
        success={form?.index === undefined ? "Successfully created behavior." : "Successfully updated behavior."}
        onSave={async () => {
          if (!form) return
          await updateConfig(dist.Id, (cfg) => {
            if (form.index === -1) cfg.DefaultCacheBehavior = formToBehavior({ ...form.data, path: "" }, cfg.DefaultCacheBehavior)
            else {
              const list = items(cfg.CacheBehaviors)
              cfg.CacheBehaviors = toList(form.index === undefined ? [...list, formToBehavior(form.data)] : list.map((b, j) => (j === form.index ? formToBehavior(form.data, b) : b)))
            }
          })
          setSelected([])
          await refresh()
        }}
      >
        {form && <BehaviorFields form={form.data} set={(data) => setForm({ ...form, data })} origins={origins} isDefault={form.index === -1} />}
      </EditModal>
    </>
  )
}

const errorCodes = [400, 403, 404, 405, 414, 416, 500, 501, 502, 503, 504]
function ErrorPagesTab({ dist, refresh }: { dist: Distribution; refresh: () => Promise<unknown> }) {
  const list = items(dist.DistributionConfig.CustomErrorResponses)
  const [selected, setSelected] = useState<(typeof list)[number][]>([])
  const [form, setForm] = useState<{ code: string; ttl: string; custom: boolean; path: string; response: string; edit: boolean }>()
  return (
    <>
      <Table
        header={
          <Header
            variant="h2"
            counter={`(${list.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={selected.length !== 1} onClick={() => { const e = selected[0]; setForm({ code: String(e.ErrorCode), ttl: String(e.ErrorCachingMinTTL ?? 10), custom: Boolean(e.ResponsePagePath), path: e.ResponsePagePath ?? "", response: e.ResponseCode ?? "", edit: true }) }}>Edit</Button>
                <Button
                  disabled={!selected.length}
                  onClick={async () => {
                    try {
                      await updateConfig(dist.Id, (c) => { c.CustomErrorResponses = toList(items(c.CustomErrorResponses).filter((e) => !selected.some((s) => s.ErrorCode === e.ErrorCode))) })
                      flash.success("Successfully deleted the custom error response.")
                      setSelected([])
                      await refresh()
                    } catch (e) {
                      flash.error(errorMessage(e))
                    }
                  }}
                >
                  Delete
                </Button>
                <Button onClick={() => setForm({ code: String(errorCodes.find((c) => !list.some((e) => e.ErrorCode === c)) ?? 404), ttl: "10", custom: false, path: "", response: "", edit: false })}>Create custom error response</Button>
              </SpaceBetween>
            }
          >
            Error pages
          </Header>
        }
        selectionType="multi"
        trackBy="ErrorCode"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        items={list}
        columnDefinitions={[
          { id: "code", header: "HTTP error code", cell: (e) => e.ErrorCode },
          { id: "ttl", header: "Error caching minimum TTL", cell: (e) => e.ErrorCachingMinTTL ?? "–" },
          { id: "path", header: "Response page path", cell: (e) => e.ResponsePagePath || "–" },
          { id: "response", header: "HTTP response code", cell: (e) => e.ResponseCode || "–" },
        ]}
        empty={<Box textAlign="center" color="inherit"><b>No custom error responses</b></Box>}
      />
      <EditModal
        visible={Boolean(form)}
        title={form?.edit ? "Edit custom error response" : "Create custom error response"}
        saveLabel={form?.edit ? "Save changes" : "Create custom error response"}
        onDismiss={() => setForm(undefined)}
        success="Successfully saved the custom error response."
        saveDisabled={Boolean(form?.custom && (!form.path.startsWith("/") || !form.response))}
        onSave={async () => {
          if (!form) return
          const entry = { ErrorCode: Number(form.code), ErrorCachingMinTTL: Number(form.ttl) || 0, ResponsePagePath: form.custom ? form.path : "", ResponseCode: form.custom ? form.response : "" }
          await updateConfig(dist.Id, (c) => { c.CustomErrorResponses = toList([...items(c.CustomErrorResponses).filter((e) => e.ErrorCode !== entry.ErrorCode), entry].sort((a, b) => a.ErrorCode - b.ErrorCode)) })
          setSelected([])
          await refresh()
        }}
      >
        {form && (
          <SpaceBetween size="l">
            <FormField label="HTTP error code"><Select disabled={form.edit} selectedOption={{ value: form.code, label: form.code }} options={errorCodes.map((c) => ({ value: String(c), label: String(c) }))} onChange={({ detail }) => setForm({ ...form, code: detail.selectedOption.value ?? "404" })} /></FormField>
            <FormField label="Error caching minimum TTL" description="Seconds"><Input type="number" value={form.ttl} onChange={({ detail }) => setForm({ ...form, ttl: detail.value })} /></FormField>
            <FormField label="Customize error response"><RadioGroup value={form.custom ? "yes" : "no"} onChange={({ detail }) => setForm({ ...form, custom: detail.value === "yes" })} items={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} /></FormField>
            {form.custom && (
              <>
                <FormField label="Response page path"><Input value={form.path} placeholder="/error.html" onChange={({ detail }) => setForm({ ...form, path: detail.value })} /></FormField>
                <FormField label="HTTP response code"><Select selectedOption={form.response ? { value: form.response, label: form.response } : null} placeholder="Choose response code" options={["200", ...errorCodes.map(String)].map((c) => ({ value: c, label: c }))} onChange={({ detail }) => setForm({ ...form, response: detail.selectedOption.value ?? "" })} /></FormField>
              </>
            )}
          </SpaceBetween>
        )}
      </EditModal>
    </>
  )
}

type Invalidation = { Id: string; Status: string; CreateTime?: string }
function InvalidationsTab({ dist }: { dist: Distribution }) {
  const list = useAws<{ InvalidationList?: { Items?: Invalidation[] } }>("cloudfront", "ListInvalidations", { DistributionId: dist.Id })
  const rows = list.data?.InvalidationList?.Items ?? []
  const [selected, setSelected] = useState<Invalidation[]>([])
  const [paths, setPaths] = useState<string>()
  const [view, setView] = useState<string>()
  const detail = useAws<{ Invalidation?: Invalidation & { InvalidationBatch?: { Paths?: { Items?: string[] }; CallerReference?: string } } }>("cloudfront", "GetInvalidation", { DistributionId: dist.Id, Id: view }, { enabled: Boolean(view) })
  return (
    <>
      <Table
        header={
          <Header
            variant="h2"
            counter={`(${rows.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void list.refetch()} />
                <Button disabled={selected.length !== 1} onClick={() => setView(selected[0].Id)}>View details</Button>
                <Button
                  disabled={selected.length !== 1}
                  onClick={async () => {
                    const r = await callAws<{ Invalidation?: { InvalidationBatch?: { Paths?: { Items?: string[] } } } }>("cloudfront", "GetInvalidation", { DistributionId: dist.Id, Id: selected[0].Id })
                    setPaths((r.Invalidation?.InvalidationBatch?.Paths?.Items ?? []).join("\n"))
                  }}
                >
                  Copy to new
                </Button>
                <Button variant="primary" onClick={() => setPaths("")}>Create invalidation</Button>
              </SpaceBetween>
            }
          >
            Invalidations
          </Header>
        }
        loading={list.isPending}
        selectionType="single"
        trackBy="Id"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        items={rows}
        columnDefinitions={[
          { id: "id", header: "Invalidation ID", cell: (i) => <Link onFollow={(e) => { e.preventDefault(); setView(i.Id) }}>{i.Id}</Link> },
          { id: "status", header: "Status", cell: (i) => <StatusIndicator type={i.Status === "Completed" ? "success" : "in-progress"}>{i.Status}</StatusIndicator> },
          { id: "date", header: "Date created", cell: (i) => consoleDate(i.CreateTime) },
        ]}
        empty={<Box textAlign="center" color="inherit"><b>No invalidations</b></Box>}
      />
      <EditModal
        visible={paths !== undefined}
        size="large"
        title="Create invalidation"
        saveLabel="Create invalidation"
        saveDisabled={!paths?.trim() || (paths ?? "").split("\n").some((p) => p.trim() && !p.trim().startsWith("/"))}
        onDismiss={() => setPaths(undefined)}
        success="Successfully created invalidation."
        onSave={async () => {
          const items = (paths ?? "").split("\n").map((p) => p.trim()).filter(Boolean)
          await callAws("cloudfront", "CreateInvalidation", { DistributionId: dist.Id, InvalidationBatch: { CallerReference: `myaws-${Date.now()}`, Paths: { Quantity: items.length, Items: items } } })
          await list.refetch()
        }}
      >
        <FormField label="Add object paths" description="Add the paths to the objects that you want to invalidate. Each path must start with /. Enter one path per line." stretch>
          <Textarea rows={6} value={paths ?? ""} placeholder={"/images/image1.jpg\n/images/*\n/*"} onChange={({ detail }) => setPaths(detail.value)} />
        </FormField>
      </EditModal>
      <Modal visible={Boolean(view)} size="medium" header={`Invalidation ${view ?? ""}`} onDismiss={() => setView(undefined)} footer={<Box float="right"><Button onClick={() => setView(undefined)}>Close</Button></Box>}>
        {detail.isPending ? (
          <StatusIndicator type="loading">Loading</StatusIndicator>
        ) : (
          <SpaceBetween size="l">
            <KeyValuePairs columns={2} items={[{ label: "Status", value: detail.data?.Invalidation?.Status ?? "–" }, { label: "Date created", value: consoleDate(detail.data?.Invalidation?.CreateTime) }]} />
            <Table variant="embedded" header={<Header variant="h3">Object paths</Header>} items={(detail.data?.Invalidation?.InvalidationBatch?.Paths?.Items ?? []).map((p) => ({ p }))} columnDefinitions={[{ id: "p", header: "Object path", cell: (r) => r.p }]} />
          </SpaceBetween>
        )}
      </Modal>
    </>
  )
}

function TagsTab({ arn }: { arn: string }) {
  const tags = useAws<{ Tags?: { Items?: Tag[] } }>("cloudfront", "ListTagsForResource", { Resource: arn })
  const list = tags.data?.Tags?.Items ?? []
  const [edit, setEdit] = useState<Tag[]>()
  return (
    <>
      <Table
        header={<Header variant="h2" counter={`(${list.length})`} actions={<Button onClick={() => setEdit(list)}>Manage tags</Button>}>Tags</Header>}
        loading={tags.isPending}
        items={list}
        columnDefinitions={[{ id: "k", header: "Key", cell: (t) => t.Key }, { id: "v", header: "Value", cell: (t) => t.Value || "–" }]}
        empty={<Box textAlign="center" color="inherit">No tags</Box>}
      />
      <EditModal
        visible={Boolean(edit)}
        size="large"
        title="Manage tags"
        onDismiss={() => setEdit(undefined)}
        success="Successfully updated tags."
        onSave={async () => {
          const after = (edit ?? []).filter((t) => t.Key)
          const removed = list.filter((t) => !after.some((a) => a.Key === t.Key)).map((t) => t.Key)
          if (removed.length) await callAws("cloudfront", "UntagResource", { Resource: arn, TagKeys: { Items: removed } })
          if (after.length) await callAws("cloudfront", "TagResource", { Resource: arn, Tags: { Items: after.map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) } })
          await tags.refetch()
        }}
      >
        {edit && <TagEditor tags={edit} onChange={setEdit} />}
      </EditModal>
    </>
  )
}

export function DistributionDetailPage({ id, tab }: { id: string; tab: string }) {
  const router = useRouter()
  const dist = useDistribution(id)
  const d = dist.data?.Distribution
  const [deleting, setDeleting] = useState(false)
  const refresh = () => dist.refetch()
  const toggle = async () => {
    if (!d) return
    try {
      await updateConfig(d.Id, (c) => { c.Enabled = !d.DistributionConfig.Enabled })
      flash.success(`Successfully ${d.DistributionConfig.Enabled ? "disabled" : "enabled"} distribution ${d.Id}.`)
      await refresh()
    } catch (e) {
      flash.error(errorMessage(e))
    }
  }
  return (
    <CfLayout breadcrumbs={[{ text: "Distributions", href: "/cloudfront/distributions" }, { text: id, href: `/cloudfront/distributions/${id}` }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            description={d?.DistributionConfig.Comment || undefined}
            actions={
              d && (
                <SpaceBetween direction="horizontal" size="xs">
                  <Button onClick={() => void toggle()}>{d.DistributionConfig.Enabled ? "Disable" : "Enable"}</Button>
                  <Button disabled={d.DistributionConfig.Enabled} onClick={() => setDeleting(true)}>Delete</Button>
                </SpaceBetween>
              )
            }
          >
            {id}
          </Header>
        }
      >
        {dist.isPending ? (
          <StatusIndicator type="loading">Loading</StatusIndicator>
        ) : !d ? (
          <Alert type="error" header="Distribution not found">{id} doesn&apos;t exist in the local emulator.</Alert>
        ) : (
          <SpaceBetween size="l">
            {!d.DistributionConfig.Enabled && <Alert type="info">This distribution is disabled. Viewers can&apos;t access content through it.</Alert>}
            <Tabs
              activeTabId={tab}
              onChange={({ detail }) => router.replace(`/cloudfront/distributions/${id}?tab=${detail.activeTabId}`)}
              tabs={[
                { id: "general", label: "General", content: <GeneralTab dist={d} refresh={refresh} /> },
                { id: "security", label: "Security", content: <SecurityTab dist={d} /> },
                { id: "origins", label: "Origins", content: <OriginsTab dist={d} refresh={refresh} /> },
                { id: "behaviors", label: "Behaviors", content: <BehaviorsTab dist={d} refresh={refresh} /> },
                { id: "error-pages", label: "Error pages", content: <ErrorPagesTab dist={d} refresh={refresh} /> },
                { id: "invalidations", label: "Invalidations", content: <InvalidationsTab dist={d} /> },
                { id: "tags", label: "Tags", content: <TagsTab arn={d.ARN} /> },
              ]}
            />
          </SpaceBetween>
        )}
        {deleting && d && <DeleteDistributionsModal dists={[{ ...d, Enabled: d.DistributionConfig.Enabled }]} onDismiss={() => setDeleting(false)} onDone={() => router.push("/cloudfront/distributions")} />}
      </ContentLayout>
    </CfLayout>
  )
}
