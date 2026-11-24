"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Modal from "@cloudscape-design/components/modal"
import Pagination from "@cloudscape-design/components/pagination"
import RadioGroup from "@cloudscape-design/components/radio-group"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Textarea from "@cloudscape-design/components/textarea"
import TextFilter from "@cloudscape-design/components/text-filter"
import Tiles from "@cloudscape-design/components/tiles"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState, type ReactNode } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EditModal } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { ConsoleLayout, Copyable } from "@/components/ec2-family/engine"
import { useFollow, type Crumb } from "@/components/shell/page-layout"
import { useZones } from "@/components/route53/hosted-zones"
import { callAws, listAll, useAws } from "@/lib/aws"
import { consoleDate, copyText } from "@/lib/format"

type Summary = {
  CertificateArn: string
  DomainName?: string
  SubjectAlternativeNameSummaries?: string[]
  Status?: string
  Type?: string
  KeyAlgorithm?: string
  InUse?: boolean
  RenewalEligibility?: string
  ExportOption?: string
  Exported?: boolean
  CreatedAt?: string
  NotAfter?: string
}
type Validation = { DomainName: string; ValidationStatus?: string; ValidationMethod?: string; ValidationEmails?: string[]; ResourceRecord?: { Name: string; Type: string; Value: string } }
type Certificate = Summary & {
  SubjectAlternativeNames?: string[]
  DomainValidationOptions?: Validation[]
  Serial?: string
  Subject?: string
  Issuer?: string
  IssuedAt?: string
  ImportedAt?: string
  NotBefore?: string
  SignatureAlgorithm?: string
  InUseBy?: string[]
  FailureReason?: string
  RenewalSummary?: { RenewalStatus?: string }
  Options?: { CertificateTransparencyLoggingPreference?: string; Export?: string }
  CertificateAuthorityArn?: string
}

const certId = (arn: string) => arn.split("/").pop() ?? arn
const typeLabel: Record<string, string> = { AMAZON_ISSUED: "Amazon issued", IMPORTED: "Imported", PRIVATE: "Private" }
const statusMap: Record<string, [StatusIndicatorProps.Type, string]> = {
  ISSUED: ["success", "Issued"],
  PENDING_VALIDATION: ["pending", "Pending validation"],
  INACTIVE: ["stopped", "Inactive"],
  EXPIRED: ["error", "Expired"],
  VALIDATION_TIMED_OUT: ["error", "Validation timed out"],
  REVOKED: ["error", "Revoked"],
  FAILED: ["error", "Failed"],
  SUCCESS: ["success", "Success"],
}
function CertStatus({ value }: { value?: string }) {
  if (!value) return <>–</>
  const [type, text] = statusMap[value] ?? ["info", value]
  return <StatusIndicator type={type}>{text}</StatusIndicator>
}
const words = (v?: string) => (v ? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " ") : "–")

const nav: SideNavigationProps.Item[] = [
  { type: "link", text: "List certificates", href: "/acm/certificates" },
  { type: "link", text: "Request certificate", href: "/acm/request" },
  { type: "link", text: "Import certificate", href: "/acm/import" },
  { type: "divider" },
  { type: "link", text: "AWS Private CA", href: "/acm/private-ca" },
]

function AcmLayout({ breadcrumbs, children, contentType }: { breadcrumbs: Crumb[]; children: ReactNode; contentType?: "default" | "table" | "form" }) {
  const parts = usePathname().split("/").filter(Boolean)
  const active = parts[1] === "request" || parts[1] === "import" || parts[1] === "private-ca" ? `/acm/${parts[1]}` : "/acm/certificates"
  return (
    <ConsoleLayout serviceName="AWS Certificate Manager" serviceHref="/acm/certificates" nav={nav} activeHref={active} breadcrumbs={[{ text: "AWS Certificate Manager", href: "/acm/certificates" }, ...breadcrumbs]} contentType={contentType}>
      {children}
    </ConsoleLayout>
  )
}

function useCertificates() {
  return useQuery({
    queryKey: ["emulator", "acm", "certificates"],
    queryFn: () => listAll<Summary>("acm", "ListCertificates", { Includes: { keyTypes: ["RSA_1024", "RSA_2048", "RSA_3072", "RSA_4096", "EC_prime256v1", "EC_secp384r1", "EC_secp521r1"] } }, (p) => p.CertificateSummaryList as Summary[] | undefined, { input: "NextToken", output: "NextToken" }),
  })
}

function DeleteModal({ certs, onDismiss, onDone }: { certs: Summary[]; onDismiss: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <Modal
      visible
      header="Delete certificate"
      onDismiss={onDismiss}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={confirm !== "delete"}
              onClick={async () => {
                setBusy(true)
                setError(undefined)
                try {
                  for (const c of certs) await callAws("acm", "DeleteCertificate", { CertificateArn: c.CertificateArn })
                  flash.success(`Successfully deleted ${certs.length === 1 ? "certificate" : `${certs.length} certificates`}.`)
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
        <Box>Are you sure you want to delete the following certificate{certs.length > 1 ? "s" : ""}? You can&apos;t delete a certificate that is in use by another AWS resource.</Box>
        <ul>{certs.map((c) => <li key={c.CertificateArn}><Box variant="code">{c.CertificateArn}</Box></li>)}</ul>
        <FormField label={<>To confirm deletion, type <i>delete</i> in the field.</>}><Input value={confirm} placeholder="delete" onChange={({ detail }) => setConfirm(detail.value)} /></FormField>
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  )
}

function CertificatesPage() {
  const follow = useFollow()
  const router = useRouter()
  const certs = useCertificates()
  const [selected, setSelected] = useState<Summary[]>([])
  const [filter, setFilter] = useState("")
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState(false)
  const items = useMemo(() => (certs.data ?? []).filter((c) => !filter || [certId(c.CertificateArn), c.DomainName, c.Status, c.Type, ...(c.SubjectAlternativeNameSummaries ?? [])].some((v) => v?.toLowerCase().includes(filter.toLowerCase()))), [certs.data, filter])
  const pageSize = 10
  return (
    <AcmLayout breadcrumbs={[{ text: "Certificates", href: "/acm/certificates" }]} contentType="table">
      <Table
        variant="full-page"
        loading={certs.isPending}
        loadingText="Loading certificates"
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        trackBy="CertificateArn"
        items={items.slice((page - 1) * pageSize, page * pageSize)}
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={`(${certs.data?.length ?? 0})`}
            description="Certificates that you request or import into ACM in this Region."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void certs.refetch()} />
                <Button disabled={!selected.length} onClick={() => setDeleting(true)}>Delete</Button>
                <Button href="/acm/import" onFollow={follow}>Import</Button>
                <Button variant="primary" href="/acm/request" onFollow={follow}>Request</Button>
              </SpaceBetween>
            }
          >
            Certificates
          </Header>
        }
        filter={<TextFilter filteringText={filter} filteringPlaceholder="Search certificates" onChange={({ detail }) => { setFilter(detail.filteringText); setPage(1) }} countText={`${items.length} matches`} />}
        pagination={<Pagination currentPageIndex={page} pagesCount={Math.max(1, Math.ceil(items.length / pageSize))} onChange={({ detail }) => setPage(detail.currentPageIndex)} />}
        columnDefinitions={[
          { id: "id", header: "Certificate ID", cell: (c) => <Link href={`/acm/certificates/${certId(c.CertificateArn)}`} onFollow={follow}>{certId(c.CertificateArn)}</Link>, sortingField: "CertificateArn" },
          { id: "domain", header: "Domain name", cell: (c) => c.DomainName ?? "–", sortingField: "DomainName" },
          { id: "type", header: "Type", cell: (c) => typeLabel[c.Type ?? ""] ?? c.Type ?? "–" },
          { id: "status", header: "Status", cell: (c) => <CertStatus value={c.Status} /> },
          { id: "inuse", header: "In use", cell: (c) => (c.InUse ? "Yes" : "No") },
          { id: "renewal", header: "Renewal eligibility", cell: (c) => words(c.RenewalEligibility) },
          { id: "key", header: "Key algorithm", cell: (c) => c.KeyAlgorithm ?? "–" },
          { id: "export", header: "Exportable", cell: (c) => (c.ExportOption === "ENABLED" ? "Yes" : "No") },
          { id: "expires", header: "Expires", cell: (c) => consoleDate(c.NotAfter) },
        ]}
        empty={
          <Box textAlign="center" color="inherit">
            <SpaceBetween size="xs">
              <b>No certificates</b>
              <Box color="inherit">You don&apos;t have any certificates in this Region.</Box>
              <Button onClick={() => router.push("/acm/request")}>Request certificate</Button>
            </SpaceBetween>
          </Box>
        }
      />
      {deleting && <DeleteModal certs={selected} onDismiss={() => setDeleting(false)} onDone={() => { setDeleting(false); setSelected([]); void certs.refetch() }} />}
    </AcmLayout>
  )
}

function zoneFor(domain: string, zones: { Id: string; Name: string }[]) {
  const name = domain.replace(/^\*\./, "").replace(/\.$/, "") + "."
  return zones.filter((z) => name === z.Name || name.endsWith(`.${z.Name}`)).sort((a, b) => b.Name.length - a.Name.length)[0]
}

function CreateRecordsModal({ cert, onDismiss }: { cert: Certificate; onDismiss: () => void }) {
  const zones = useZones()
  const rows = (cert.DomainValidationOptions ?? []).filter((d) => d.ResourceRecord)
  const all = (zones.data ?? []).map((z) => ({ Id: z.Id ?? "", Name: z.Name ?? "" }))
  const [selected, setSelected] = useState<Validation[]>(rows.filter((r) => r.ValidationStatus !== "SUCCESS"))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <Modal
      visible
      size="large"
      header="Create DNS records in Amazon Route 53"
      onDismiss={onDismiss}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!selected.some((r) => zoneFor(r.DomainName, all))}
              onClick={async () => {
                setBusy(true)
                setError(undefined)
                try {
                  let count = 0
                  for (const r of selected) {
                    const zone = zoneFor(r.DomainName, all)
                    if (!zone || !r.ResourceRecord) continue
                    await callAws("route53", "ChangeResourceRecordSets", { HostedZoneId: zone.Id.replace("/hostedzone/", ""), ChangeBatch: { Changes: [{ Action: "UPSERT", ResourceRecordSet: { Name: r.ResourceRecord.Name, Type: r.ResourceRecord.Type, TTL: 300, ResourceRecords: [{ Value: r.ResourceRecord.Value }] } }] } })
                    count++
                  }
                  flash.success(`Successfully created DNS records in ${count} domain${count === 1 ? "" : "s"}.`)
                  onDismiss()
                } catch (e) {
                  setError(errorMessage(e))
                } finally {
                  setBusy(false)
                }
              }}
            >
              Create records
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Table
          variant="embedded"
          selectionType="multi"
          trackBy="DomainName"
          selectedItems={selected}
          onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
          isItemDisabled={(r) => !zoneFor(r.DomainName, all)}
          loading={zones.isPending}
          items={rows}
          header={<Header variant="h3" counter={`(${rows.length})`}>Domains</Header>}
          columnDefinitions={[
            { id: "domain", header: "Domain", cell: (r) => r.DomainName },
            { id: "status", header: "Validation status", cell: (r) => <CertStatus value={r.ValidationStatus} /> },
            { id: "zone", header: "Hosted zone", cell: (r) => zoneFor(r.DomainName, all)?.Name ?? <Box color="text-status-inactive">No matching hosted zone</Box> },
          ]}
        />
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  )
}

function CertTags({ arn }: { arn: string }) {
  const tags = useAws<{ Tags?: Tag[] }>("acm", "ListTagsForCertificate", { CertificateArn: arn })
  const list = tags.data?.Tags ?? []
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Tag[]>([])
  return (
    <>
      <Table
        header={<Header variant="h2" counter={`(${list.length})`} actions={<Button onClick={() => { setEdit(list); setOpen(true) }}>Manage tags</Button>}>Tags</Header>}
        items={list}
        loading={tags.isPending}
        columnDefinitions={[{ id: "k", header: "Key", cell: (t) => t.Key }, { id: "v", header: "Value", cell: (t) => t.Value || "–" }]}
        empty={<Box textAlign="center" color="inherit">No tags associated with this certificate.</Box>}
      />
      <EditModal
        visible={open}
        size="large"
        title="Manage tags"
        onDismiss={() => setOpen(false)}
        success="Tags updated."
        onSave={async () => {
          const after = edit.filter((t) => t.Key)
          const removed = list.filter((t) => !after.some((a) => a.Key === t.Key && (a.Value ?? "") === (t.Value ?? "")))
          if (removed.length) await callAws("acm", "RemoveTagsFromCertificate", { CertificateArn: arn, Tags: removed })
          const added = after.filter((t) => !list.some((l) => l.Key === t.Key && (l.Value ?? "") === (t.Value ?? "")))
          if (added.length) await callAws("acm", "AddTagsToCertificate", { CertificateArn: arn, Tags: added.map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) })
          await tags.refetch()
        }}
      >
        <TagEditor tags={edit} onChange={setEdit} />
      </EditModal>
    </>
  )
}

function ExportModal({ cert, onDismiss }: { cert: Certificate; onDismiss: () => void }) {
  const [pass, setPass] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<{ Certificate?: string; CertificateChain?: string; PrivateKey?: string }>()
  return (
    <Modal
      visible
      size="large"
      header="Export certificate"
      onDismiss={onDismiss}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>{result ? "Close" : "Cancel"}</Button>
            {!result && (
              <Button
                variant="primary"
                loading={busy}
                disabled={pass.length < 4}
                onClick={async () => {
                  setBusy(true)
                  setError(undefined)
                  try {
                    const enc = btoa(pass)
                    setResult(await callAws("acm", "ExportCertificate", { CertificateArn: cert.CertificateArn, Passphrase: enc }))
                  } catch (e) {
                    setError(errorMessage(e))
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Generate PEM encoding
              </Button>
            )}
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {!result ? (
          <FormField label="Passphrase" description="The private key is encrypted with this passphrase. You need it to decrypt the private key.">
            <Input type="password" value={pass} onChange={({ detail }) => setPass(detail.value)} />
          </FormField>
        ) : (
          (["Certificate", "CertificateChain", "PrivateKey"] as const).map((k) => (
            <FormField key={k} label={k === "CertificateChain" ? "Certificate chain" : k === "PrivateKey" ? "Encrypted private key" : "Certificate body"} stretch secondaryControl={<Button iconName="copy" variant="icon" ariaLabel="Copy" onClick={() => copyText(result[k] ?? "")} />}>
              <Textarea readOnly rows={6} value={result[k] ?? ""} />
            </FormField>
          ))
        )}
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  )
}

function CertificateDetailPage({ id }: { id: string }) {
  const follow = useFollow()
  const router = useRouter()
  const certs = useCertificates()
  const arn = certs.data?.find((c) => certId(c.CertificateArn) === id)?.CertificateArn
  const detail = useAws<{ Certificate?: Certificate }>("acm", "DescribeCertificate", { CertificateArn: arn }, { enabled: Boolean(arn) })
  const cert = detail.data?.Certificate
  const [modal, setModal] = useState<"delete" | "records" | "export">()
  const domains = cert?.DomainValidationOptions ?? (cert?.SubjectAlternativeNames ?? []).map((d) => ({ DomainName: d }) as Validation)
  const pendingDns = domains.some((d) => d.ResourceRecord && d.ValidationStatus !== "SUCCESS")
  return (
    <AcmLayout breadcrumbs={[{ text: "Certificates", href: "/acm/certificates" }, { text: id, href: `/acm/certificates/${id}` }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              cert && (
                <SpaceBetween direction="horizontal" size="xs">
                  <Button onClick={() => setModal("delete")}>Delete</Button>
                  {cert.Type === "IMPORTED" && <Button href={`/acm/import?arn=${encodeURIComponent(cert.CertificateArn)}`} onFollow={follow}>Reimport</Button>}
                  {cert.Options?.Export === "ENABLED" && <Button onClick={() => setModal("export")}>Export</Button>}
                  {cert.Type === "PRIVATE" && (
                    <Button onClick={async () => { try { await callAws("acm", "RenewCertificate", { CertificateArn: cert.CertificateArn }); flash.success("Renewal requested."); void detail.refetch() } catch (e) { flash.error(errorMessage(e)) } }}>Renew now</Button>
                  )}
                </SpaceBetween>
              )
            }
          >
            {id}
          </Header>
        }
      >
        {certs.isPending || (arn && detail.isPending) ? (
          <StatusIndicator type="loading">Loading</StatusIndicator>
        ) : !cert ? (
          <Alert type="error" header="Certificate not found">{id} doesn&apos;t exist in this Region of the local emulator.</Alert>
        ) : (
          <SpaceBetween size="l">
            {cert.Status === "PENDING_VALIDATION" && cert.DomainValidationOptions?.some((d) => d.ValidationMethod === "DNS") && (
              <Alert type="info" header="Further action needed">To validate the domains, add the CNAME records listed under Domains to the DNS configuration for each domain.</Alert>
            )}
            {cert.FailureReason && <Alert type="error" header="Certificate request failed">Failure reason: {words(cert.FailureReason)}</Alert>}
            <Container header={<Header variant="h2">Certificate status</Header>}>
              <KeyValuePairs
                columns={3}
                items={[
                  { label: "Identifier", value: <Copyable value={certId(cert.CertificateArn)} /> },
                  { label: "ARN", value: <Copyable value={cert.CertificateArn} /> },
                  { label: "Type", value: typeLabel[cert.Type ?? ""] ?? cert.Type },
                  { label: "Status", value: <CertStatus value={cert.Status} /> },
                  { label: "Detailed status", value: cert.FailureReason ? words(cert.FailureReason) : cert.Status === "PENDING_VALIDATION" ? "The certificate is pending validation." : "–" },
                ]}
              />
            </Container>
            <Table
              header={
                <Header
                  variant="h2"
                  counter={`(${domains.length})`}
                  actions={
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button disabled={!pendingDns} onClick={() => setModal("records")}>Create records in Route 53</Button>
                      <Button
                        iconName="download"
                        onClick={() => {
                          const csv = ["Domain Name,Record Name,Record Type,Record Value", ...domains.map((d) => [d.DomainName, d.ResourceRecord?.Name ?? "", d.ResourceRecord?.Type ?? "", d.ResourceRecord?.Value ?? ""].join(","))].join("\n")
                          const a = document.createElement("a")
                          a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
                          a.download = `${id}.csv`
                          a.click()
                        }}
                      >
                        Export to CSV
                      </Button>
                    </SpaceBetween>
                  }
                >
                  Domains
                </Header>
              }
              items={domains}
              columnDefinitions={[
                { id: "domain", header: "Domain", cell: (d) => d.DomainName },
                { id: "status", header: "Status", cell: (d) => <CertStatus value={d.ValidationStatus ?? cert.Status} /> },
                { id: "renewal", header: "Renewal status", cell: () => words(cert.RenewalSummary?.RenewalStatus) },
                { id: "type", header: "Type", cell: (d) => (d.ResourceRecord ? d.ResourceRecord.Type : d.ValidationMethod ? words(d.ValidationMethod) : "–") },
                { id: "name", header: "CNAME name", cell: (d) => (d.ResourceRecord ? <Copyable value={d.ResourceRecord.Name} /> : "–") },
                { id: "value", header: "CNAME value", cell: (d) => (d.ResourceRecord ? <Copyable value={d.ResourceRecord.Value} /> : "–") },
              ]}
              empty={<Box textAlign="center" color="inherit">No domains</Box>}
            />
            <Container header={<Header variant="h2">Details</Header>}>
              <KeyValuePairs
                columns={3}
                items={[
                  { label: "In use", value: cert.InUseBy?.length ? "Yes" : "No" },
                  { label: "Domain name", value: cert.DomainName },
                  { label: "Number of additional names", value: String(Math.max(0, (cert.SubjectAlternativeNames?.length ?? 1) - 1)) },
                  { label: "Serial number", value: cert.Serial || "–" },
                  { label: "Public key info", value: cert.KeyAlgorithm ?? "–" },
                  { label: "Signature algorithm", value: cert.SignatureAlgorithm ?? "–" },
                  { label: "Can be used with", value: "Amazon CloudFront, Elastic Load Balancing, AWS Elastic Beanstalk, Amazon API Gateway, AWS Nitro Enclaves, AWS App Runner, AWS Amplify" },
                  { label: cert.Type === "IMPORTED" ? "Imported at" : "Requested at", value: consoleDate(cert.ImportedAt ?? cert.CreatedAt) },
                  { label: "Issued at", value: consoleDate(cert.IssuedAt) },
                  { label: "Not before", value: consoleDate(cert.NotBefore) },
                  { label: "Not after", value: consoleDate(cert.NotAfter) },
                  { label: "Renewal eligibility", value: words(cert.RenewalEligibility) },
                  { label: "Certificate transparency logging", value: words(cert.Options?.CertificateTransparencyLoggingPreference) },
                  { label: "Exportable", value: cert.Options?.Export === "ENABLED" ? "Enabled" : "Disabled" },
                  { label: "Associated resources", value: cert.InUseBy?.length ? cert.InUseBy.join(", ") : "–" },
                ]}
              />
            </Container>
            <CertTags arn={cert.CertificateArn} />
          </SpaceBetween>
        )}
        {cert && modal === "delete" && <DeleteModal certs={[cert]} onDismiss={() => setModal(undefined)} onDone={() => { void certs.refetch(); router.push("/acm/certificates") }} />}
        {cert && modal === "records" && <CreateRecordsModal cert={cert} onDismiss={() => { setModal(undefined); void detail.refetch() }} />}
        {cert && modal === "export" && <ExportModal cert={cert} onDismiss={() => setModal(undefined)} />}
      </ContentLayout>
    </AcmLayout>
  )
}

function RequestTypePage() {
  const router = useRouter()
  const [type, setType] = useState("public")
  return (
    <AcmLayout breadcrumbs={[{ text: "Certificates", href: "/acm/certificates" }, { text: "Request certificate", href: "/acm/request" }]} contentType="form">
      <Form
        header={<Header variant="h1">Request certificate</Header>}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push("/acm/certificates")}>Cancel</Button>
            <Button variant="primary" onClick={() => router.push("/acm/request/public")}>Next</Button>
          </SpaceBetween>
        }
      >
        <Container header={<Header variant="h2">Certificate type</Header>}>
          <FormField label="Certificate type" stretch>
            <Tiles
              value={type}
              onChange={({ detail }) => setType(detail.value)}
              items={[
                { value: "public", label: "Request a public certificate", description: "Request a public SSL/TLS certificate from Amazon. By default, public certificates are trusted by browsers and operating systems." },
                { value: "private", label: "Request a private certificate", description: "No private CAs available for issuance. Requesting a private certificate requires the creation of a private certificate authority (CA).", disabled: true },
              ]}
            />
          </FormField>
        </Container>
      </Form>
    </AcmLayout>
  )
}

function RequestPublicPage() {
  const client = useQueryClient()
  const router = useRouter()
  const [names, setNames] = useState<string[]>([""])
  const [exportable, setExportable] = useState("DISABLED")
  const [method, setMethod] = useState("DNS")
  const [key, setKey] = useState("RSA_2048")
  const [tags, setTags] = useState<Tag[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const valid = names.filter((n) => n.trim())
  const bad = valid.find((n) => !/^(\*\.)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\.?$/.test(n.trim()))
  return (
    <AcmLayout breadcrumbs={[{ text: "Certificates", href: "/acm/certificates" }, { text: "Request certificate", href: "/acm/request" }]} contentType="form">
      <Form
        header={<Header variant="h1">Request public certificate</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push("/acm/certificates")}>Cancel</Button>
            <Button onClick={() => router.push("/acm/request")}>Previous</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!valid.length || Boolean(bad)}
              onClick={async () => {
                setBusy(true)
                setError(undefined)
                try {
                  const [first, ...rest] = valid.map((n) => n.trim())
                  const r = await callAws<{ CertificateArn: string }>("acm", "RequestCertificate", {
                    DomainName: first,
                    ...(rest.length ? { SubjectAlternativeNames: [first, ...rest] } : {}),
                    ValidationMethod: method,
                    KeyAlgorithm: key,
                    Options: { Export: exportable },
                    ...(tags.filter((t) => t.Key).length ? { Tags: tags.filter((t) => t.Key).map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) } : {}),
                  })
                  await client.invalidateQueries({ queryKey: ["emulator", "acm"] })
                  flash.success(`Successfully requested certificate with ID ${certId(r.CertificateArn)}. A certificate request with a status of pending validation has been created. Further action is needed to complete the validation and approval of the certificate.`)
                  router.push(`/acm/certificates/${certId(r.CertificateArn)}`)
                } catch (e) {
                  setError(errorMessage(e))
                  setBusy(false)
                }
              }}
            >
              Request
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2" description="Provide one or more domain names for your certificate.">Domain names</Header>}>
            <SpaceBetween size="s">
              {names.map((n, i) => (
                <FormField
                  key={i}
                  label={i === 0 ? "Fully qualified domain name" : undefined}
                  errorText={n.trim() && n === bad ? "Enter a valid domain name." : undefined}
                  secondaryControl={names.length > 1 ? <Button onClick={() => setNames(names.filter((_, j) => j !== i))}>Remove</Button> : undefined}
                >
                  <Input value={n} placeholder="example.com" onChange={({ detail }) => setNames(names.map((v, j) => (j === i ? detail.value : v)))} />
                </FormField>
              ))}
              <Box fontSize="body-s" color="text-body-secondary">You can use an asterisk (*) to request a wildcard certificate to protect several sites in the same domain. For example, *.example.com protects www.example.com, site.example.com, and images.example.com.</Box>
              <Button onClick={() => setNames([...names, ""])} disabled={names.length >= 100}>Add another name to this certificate</Button>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2" description="Allow certificate to be exported. Export functionality cannot be updated after issuance.">Allow export</Header>}>
            <RadioGroup value={exportable} onChange={({ detail }) => setExportable(detail.value)} items={[{ value: "DISABLED", label: "Disable export", description: "The certificate can't be exported. It can only be used with integrated AWS services." }, { value: "ENABLED", label: "Enable export", description: "The certificate can be exported and used anywhere. Additional charges apply." }]} />
          </Container>
          <Container header={<Header variant="h2" description="Select a method for validating domain ownership.">Validation method</Header>}>
            <RadioGroup value={method} onChange={({ detail }) => setMethod(detail.value)} items={[{ value: "DNS", label: "DNS validation - recommended", description: "Choose this option if you are authorized to modify the DNS configuration for the domains in your certificate request." }, { value: "EMAIL", label: "Email validation", description: "Choose this option if you do not have permission or cannot obtain permission to modify the DNS configuration for the domains in your certificate request." }]} />
          </Container>
          <Container header={<Header variant="h2" description="Select an encryption algorithm. Some algorithms may not be supported by all AWS services.">Key algorithm</Header>}>
            <RadioGroup value={key} onChange={({ detail }) => setKey(detail.value)} items={[{ value: "RSA_2048", label: "RSA 2048", description: "RSA is the most widely used key type." }, { value: "EC_prime256v1", label: "ECDSA P 256", description: "Equivalent in cryptographic strength to RSA 3072." }, { value: "EC_secp384r1", label: "ECDSA P 384", description: "Equivalent in cryptographic strength to RSA 7680." }]} />
          </Container>
          <Container header={<Header variant="h2" description="To help you manage your certificates you can optionally assign your own metadata to each resource in the form of tags.">Tags</Header>}>
            <TagEditor tags={tags} onChange={setTags} />
          </Container>
        </SpaceBetween>
      </Form>
    </AcmLayout>
  )
}

function ImportPage({ arn }: { arn?: string }) {
  const client = useQueryClient()
  const router = useRouter()
  const [body, setBody] = useState("")
  const [key, setKey] = useState("")
  const [chain, setChain] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const enc = (text: string) => btoa(unescape(encodeURIComponent(text.trim() + "\n")))
  const title = arn ? "Reimport certificate" : "Import certificate"
  return (
    <AcmLayout breadcrumbs={[{ text: "Certificates", href: "/acm/certificates" }, { text: title, href: "/acm/import" }]} contentType="form">
      <Form
        header={<Header variant="h1" description={arn ? <>Replace the certificate <Box variant="code">{certId(arn)}</Box> with a new certificate and private key.</> : undefined}>{title}</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push(arn ? `/acm/certificates/${certId(arn)}` : "/acm/certificates")}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={!body.trim() || !key.trim()}
              onClick={async () => {
                setBusy(true)
                setError(undefined)
                try {
                  const r = await callAws<{ CertificateArn: string }>("acm", "ImportCertificate", {
                    ...(arn ? { CertificateArn: arn } : {}),
                    Certificate: enc(body),
                    PrivateKey: enc(key),
                    ...(chain.trim() ? { CertificateChain: enc(chain) } : {}),
                    ...(!arn && tags.filter((t) => t.Key).length ? { Tags: tags.filter((t) => t.Key).map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) } : {}),
                  })
                  await client.invalidateQueries({ queryKey: ["emulator", "acm"] })
                  flash.success(`Successfully ${arn ? "reimported" : "imported"} certificate with ID ${certId(r.CertificateArn)}.`)
                  router.push(`/acm/certificates/${certId(r.CertificateArn)}`)
                } catch (e) {
                  setError(errorMessage(e))
                  setBusy(false)
                }
              }}
            >
              {arn ? "Reimport" : "Import"}
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2" description="Paste the PEM-encoded certificate body, private key, and certificate chain below.">Certificate details</Header>}>
            <SpaceBetween size="l">
              <FormField label="Certificate body" description="PEM-encoded certificate body" stretch><Textarea rows={8} value={body} placeholder="-----BEGIN CERTIFICATE-----" onChange={({ detail }) => setBody(detail.value)} /></FormField>
              <FormField label="Certificate private key" description="PEM-encoded, unencrypted private key that matches the SSL/TLS certificate public key." stretch><Textarea rows={8} value={key} placeholder="-----BEGIN PRIVATE KEY-----" onChange={({ detail }) => setKey(detail.value)} /></FormField>
              <FormField label={<>Certificate chain <i>- optional</i></>} description="PEM-encoded certificate chain" stretch><Textarea rows={6} value={chain} placeholder="-----BEGIN CERTIFICATE-----" onChange={({ detail }) => setChain(detail.value)} /></FormField>
            </SpaceBetween>
          </Container>
          {!arn && (
            <Container header={<Header variant="h2" description="To help you manage your certificates you can optionally assign your own metadata to each resource in the form of tags.">Tags</Header>}>
              <TagEditor tags={tags} onChange={setTags} />
            </Container>
          )}
        </SpaceBetween>
      </Form>
    </AcmLayout>
  )
}

function PrivateCaPage() {
  return (
    <AcmLayout breadcrumbs={[{ text: "AWS Private CA", href: "/acm/private-ca" }]}>
      <ContentLayout header={<Header variant="h1">AWS Private CA</Header>}>
        <Alert type="info" header="AWS Private CA isn't available in the local emulator">Private certificate authorities need the AWS Private CA APIs, which the local AWS Emulator doesn&apos;t implement.</Alert>
      </ContentLayout>
    </AcmLayout>
  )
}

export function AcmApp({ path }: { path: string[] }) {
  const arn = useSearchParams().get("arn") ?? undefined
  const [section, id] = path
  if (section === "request") return id === "public" ? <RequestPublicPage /> : <RequestTypePage />
  if (section === "import") return <ImportPage key={arn ?? "new"} arn={arn} />
  if (section === "private-ca") return <PrivateCaPage />
  if (section === "certificates" && id) return <CertificateDetailPage id={decodeURIComponent(id)} />
  return <CertificatesPage />
}
