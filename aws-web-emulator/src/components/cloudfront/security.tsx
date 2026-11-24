"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Container from "@cloudscape-design/components/container"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Modal from "@cloudscape-design/components/modal"
import Multiselect from "@cloudscape-design/components/multiselect"
import RadioGroup from "@cloudscape-design/components/radio-group"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Textarea from "@cloudscape-design/components/textarea"
import TextFilter from "@cloudscape-design/components/text-filter"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EditModal } from "@/components/console/sections"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { CfLayout, type Obj } from "@/components/cloudfront/shared"
import { callAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type Row = Obj & { _id: string; _name: string }
type Col = { id: string; header: string; cell: (r: Row) => ReactNode }
type Spec = {
  section: string
  title: string
  singular: string
  description: string
  list: () => Promise<Row[]>
  columns: Col[]
  details: (r: Row) => { label: string; value: ReactNode }[]
  remove: (r: Row) => Promise<unknown>
  form: (props: { value: Obj; set: (v: Obj) => void; editing?: Row }) => ReactNode
  initial: (r?: Row) => Obj
  create: (v: Obj) => Promise<unknown>
  update?: (r: Row, v: Obj) => Promise<unknown>
  valid: (v: Obj) => boolean
  extra?: (r: Row) => ReactNode
}

const str = (v: unknown) => (v === undefined || v === null || v === "" ? "–" : String(v))
const s = (v: Obj, k: string) => (v[k] as string | undefined) ?? ""

function useRows(spec: Spec) {
  return useQuery({ queryKey: ["emulator", "cloudfront", spec.section], queryFn: spec.list })
}

function DeleteModal({ spec, rows, onDismiss, onDone }: { spec: Spec; rows: Row[]; onDismiss: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <Modal
      visible
      header={`Delete ${spec.singular}`}
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
                  for (const r of rows) await spec.remove(r)
                  flash.success(`Successfully deleted ${rows.length === 1 ? `${spec.singular} ${rows[0]._name}` : `${rows.length} ${spec.title.toLowerCase()}`}.`)
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
        <Box>Delete {rows.map((r) => r._name).join(", ")}? This action can&apos;t be undone.</Box>
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  )
}

function FormModal({ spec, editing, onDismiss, onDone }: { spec: Spec; editing?: Row; onDismiss: () => void; onDone: () => Promise<unknown> }) {
  const [value, setValue] = useState<Obj>(spec.initial(editing))
  return (
    <EditModal
      visible
      size="large"
      title={editing ? `Edit ${spec.singular}` : `Create ${spec.singular}`}
      saveLabel={editing ? "Save changes" : "Create"}
      saveDisabled={!spec.valid(value)}
      onDismiss={onDismiss}
      success={editing ? `Successfully updated ${spec.singular}.` : `Successfully created ${spec.singular}.`}
      onSave={async () => {
        if (editing && spec.update) await spec.update(editing, value)
        else await spec.create(value)
        await onDone()
      }}
    >
      <SpaceBetween size="l">{spec.form({ value, set: setValue, editing })}</SpaceBetween>
    </EditModal>
  )
}

function ListPage({ spec }: { spec: Spec }) {
  const follow = useFollow()
  const rows = useRows(spec)
  const [selected, setSelected] = useState<Row[]>([])
  const [filter, setFilter] = useState("")
  const [modal, setModal] = useState<"create" | "edit" | "delete">()
  const list = (rows.data ?? []).filter((r) => !filter || `${r._name} ${r._id}`.toLowerCase().includes(filter.toLowerCase()))
  return (
    <CfLayout breadcrumbs={[{ text: spec.title, href: `/cloudfront/${spec.section}` }]} contentType="table">
      <Table
        variant="full-page"
        loading={rows.isPending}
        selectionType="multi"
        trackBy="_id"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        items={list}
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={`(${rows.data?.length ?? 0})`}
            description={spec.description}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void rows.refetch()} />
                {spec.update && <Button disabled={selected.length !== 1} onClick={() => setModal("edit")}>Edit</Button>}
                <Button disabled={!selected.length} onClick={() => setModal("delete")}>Delete</Button>
                <Button variant="primary" onClick={() => setModal("create")}>Create {spec.singular}</Button>
              </SpaceBetween>
            }
          >
            {spec.title}
          </Header>
        }
        filter={<TextFilter filteringText={filter} filteringPlaceholder={`Find ${spec.title.toLowerCase()}`} onChange={({ detail }) => setFilter(detail.filteringText)} />}
        columnDefinitions={[{ id: "name", header: "Name", cell: (r) => <Link href={`/cloudfront/${spec.section}/${encodeURIComponent(r._id)}`} onFollow={follow}>{r._name}</Link> }, ...spec.columns]}
        empty={<Box textAlign="center" color="inherit"><SpaceBetween size="xs"><b>No {spec.title.toLowerCase()}</b><Button onClick={() => setModal("create")}>Create {spec.singular}</Button></SpaceBetween></Box>}
      />
      {modal === "delete" && <DeleteModal spec={spec} rows={selected} onDismiss={() => setModal(undefined)} onDone={() => { setModal(undefined); setSelected([]); void rows.refetch() }} />}
      {(modal === "create" || modal === "edit") && <FormModal spec={spec} editing={modal === "edit" ? selected[0] : undefined} onDismiss={() => setModal(undefined)} onDone={async () => { setSelected([]); await rows.refetch() }} />}
    </CfLayout>
  )
}

function DetailPage({ spec, id }: { spec: Spec; id: string }) {
  const router = useRouter()
  const rows = useRows(spec)
  const r = rows.data?.find((x) => x._id === id)
  const [modal, setModal] = useState<"edit" | "delete">()
  return (
    <CfLayout breadcrumbs={[{ text: spec.title, href: `/cloudfront/${spec.section}` }, { text: r?._name ?? id, href: "#" }]}>
      <ContentLayout
        header={
          <Header variant="h1" actions={r && <SpaceBetween direction="horizontal" size="xs"><Button onClick={() => setModal("delete")}>Delete</Button>{spec.update && <Button onClick={() => setModal("edit")}>Edit</Button>}</SpaceBetween>}>
            {r?._name ?? id}
          </Header>
        }
      >
        {rows.isPending ? (
          <StatusIndicator type="loading">Loading</StatusIndicator>
        ) : !r ? (
          <Alert type="error" header={`${spec.singular} not found`}>{id} doesn&apos;t exist in the local emulator.</Alert>
        ) : (
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Details</Header>}><KeyValuePairs columns={3} items={spec.details(r)} /></Container>
            {spec.extra?.(r)}
          </SpaceBetween>
        )}
        {r && modal === "delete" && <DeleteModal spec={spec} rows={[r]} onDismiss={() => setModal(undefined)} onDone={() => { void rows.refetch(); router.push(`/cloudfront/${spec.section}`) }} />}
        {r && modal === "edit" && <FormModal spec={spec} editing={r} onDismiss={() => setModal(undefined)} onDone={() => rows.refetch()} />}
      </ContentLayout>
    </CfLayout>
  )
}

async function listOf(op: string, listKey: string, map: (o: Obj) => Row) {
  const r = await callAws("cloudfront", op, {})
  return (((r[listKey] as Obj | undefined)?.Items as Obj[] | undefined) ?? []).map(map)
}
async function etagDelete(get: string, del: string, id: string, key = "Id") {
  const g = await callAws<{ ETag: string }>("cloudfront", get, { [key]: id })
  return callAws("cloudfront", del, { [key]: id, IfMatch: g.ETag })
}

const oacTypes = [
  { value: "s3", label: "S3" },
  { value: "mediastore", label: "MediaStore" },
  { value: "lambda", label: "Lambda" },
  { value: "mediapackagev2", label: "MediaPackage V2" },
]
const oacConfig = (v: Obj) => ({ Name: s(v, "Name"), Description: s(v, "Description"), SigningProtocol: "sigv4", SigningBehavior: s(v, "SigningBehavior") || "always", OriginAccessControlOriginType: s(v, "OriginAccessControlOriginType") || "s3" })
const oac: Spec = {
  section: "origin-access",
  title: "Origin access",
  singular: "origin access control",
  description: "Origin access control (OAC) lets CloudFront send authenticated requests to your origin so that only CloudFront can access it.",
  list: () => listOf("ListOriginAccessControls", "OriginAccessControlList", (o) => ({ ...o, _id: o.Id as string, _name: o.Name as string })),
  columns: [
    { id: "id", header: "ID", cell: (r) => str(r.Id) },
    { id: "type", header: "Origin type", cell: (r) => oacTypes.find((t) => t.value === r.OriginAccessControlOriginType)?.label ?? str(r.OriginAccessControlOriginType) },
    { id: "signing", header: "Signing behavior", cell: (r) => str(r.SigningBehavior) },
    { id: "desc", header: "Description", cell: (r) => str(r.Description) },
  ],
  details: (r) => [
    { label: "ID", value: <Copyable value={r.Id as string} /> },
    { label: "Origin type", value: str(r.OriginAccessControlOriginType) },
    { label: "Signing protocol", value: str(r.SigningProtocol) },
    { label: "Signing behavior", value: str(r.SigningBehavior) },
    { label: "Description", value: str(r.Description) },
  ],
  remove: (r) => etagDelete("GetOriginAccessControl", "DeleteOriginAccessControl", r._id),
  initial: (r) => ({ Name: r?.Name ?? "", Description: r?.Description ?? "", SigningBehavior: r?.SigningBehavior ?? "always", OriginAccessControlOriginType: r?.OriginAccessControlOriginType ?? "s3" }),
  valid: (v) => Boolean(s(v, "Name")),
  create: (v) => callAws("cloudfront", "CreateOriginAccessControl", { OriginAccessControlConfig: oacConfig(v) }),
  update: async (r, v) => {
    const g = await callAws<{ ETag: string }>("cloudfront", "GetOriginAccessControl", { Id: r._id })
    return callAws("cloudfront", "UpdateOriginAccessControl", { Id: r._id, IfMatch: g.ETag, OriginAccessControlConfig: oacConfig(v) })
  },
  form: ({ value, set }) => (
    <>
      <FormField label="Name"><Input value={s(value, "Name")} onChange={({ detail }) => set({ ...value, Name: detail.value })} /></FormField>
      <FormField label={<>Description <i>- optional</i></>}><Input value={s(value, "Description")} onChange={({ detail }) => set({ ...value, Description: detail.value })} /></FormField>
      <FormField label="Origin type"><RadioGroup value={s(value, "OriginAccessControlOriginType")} onChange={({ detail }) => set({ ...value, OriginAccessControlOriginType: detail.value })} items={oacTypes} /></FormField>
      <FormField label="Signing behavior">
        <RadioGroup
          value={s(value, "SigningBehavior")}
          onChange={({ detail }) => set({ ...value, SigningBehavior: detail.value })}
          items={[
            { value: "always", label: "Sign requests (recommended)", description: "CloudFront signs all origin requests, overwriting the Authorization header from the viewer request if present." },
            { value: "no-override", label: "Do not override authorization header", description: "If the viewer request doesn't contain the Authorization header, CloudFront signs the origin request." },
            { value: "never", label: "Do not sign requests", description: "CloudFront doesn't sign origin requests." },
          ]}
        />
      </FormField>
    </>
  ),
}

const publicKeys: Spec = {
  section: "public-keys",
  title: "Public keys",
  singular: "public key",
  description: "Public keys that CloudFront uses to verify signed URLs and signed cookies.",
  list: () => listOf("ListPublicKeys", "PublicKeyList", (o) => ({ ...o, _id: o.Id as string, _name: o.Name as string })),
  columns: [
    { id: "id", header: "ID", cell: (r) => str(r.Id) },
    { id: "comment", header: "Description", cell: (r) => str(r.Comment) },
    { id: "created", header: "Date created", cell: (r) => consoleDate(r.CreatedTime as string) },
  ],
  details: (r) => [
    { label: "ID", value: <Copyable value={r.Id as string} /> },
    { label: "Description", value: str(r.Comment) },
    { label: "Date created", value: consoleDate(r.CreatedTime as string) },
  ],
  extra: (r) => <Container header={<Header variant="h2">Key</Header>}><Box variant="code"><pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{str(r.EncodedKey)}</pre></Box></Container>,
  remove: (r) => etagDelete("GetPublicKey", "DeletePublicKey", r._id),
  initial: () => ({ Name: "", Comment: "", EncodedKey: "" }),
  valid: (v) => Boolean(s(v, "Name") && s(v, "EncodedKey").includes("BEGIN PUBLIC KEY")),
  create: (v) => callAws("cloudfront", "CreatePublicKey", { PublicKeyConfig: { CallerReference: `myaws-${crypto.randomUUID()}`, Name: s(v, "Name"), Comment: s(v, "Comment"), EncodedKey: s(v, "EncodedKey").trim() + "\n" } }),
  form: ({ value, set }) => (
    <>
      <FormField label="Name"><Input value={s(value, "Name")} onChange={({ detail }) => set({ ...value, Name: detail.value })} /></FormField>
      <FormField label="Key" description="Paste the PEM-encoded RSA public key (2048 bits)." stretch><Textarea rows={8} value={s(value, "EncodedKey")} placeholder="-----BEGIN PUBLIC KEY-----" onChange={({ detail }) => set({ ...value, EncodedKey: detail.value })} /></FormField>
      <FormField label={<>Description <i>- optional</i></>}><Input value={s(value, "Comment")} onChange={({ detail }) => set({ ...value, Comment: detail.value })} /></FormField>
    </>
  ),
}

function KeyPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const keys = useQuery({ queryKey: ["emulator", "cloudfront", "public-keys"], queryFn: publicKeys.list })
  const options = (keys.data ?? []).map((k) => ({ value: k._id, label: k._name, description: k._id }))
  return <Multiselect expandToViewport selectedOptions={options.filter((o) => value.includes(o.value))} options={options} placeholder="Choose public keys" statusType={keys.isPending ? "loading" : "finished"} empty="No public keys" onChange={({ detail }) => onChange(detail.selectedOptions.map((o) => o.value ?? ""))} />
}
const keyGroupConfig = (v: Obj) => ({ Name: s(v, "Name"), Comment: s(v, "Comment"), Items: (v.Items as string[]) ?? [] })
const keyGroups: Spec = {
  section: "key-groups",
  title: "Key groups",
  singular: "key group",
  description: "Key groups contain the public keys that CloudFront uses to verify signed URLs and signed cookies for a cache behavior.",
  list: async () => {
    const r = await callAws("cloudfront", "ListKeyGroups", {})
    return (((r.KeyGroupList as Obj | undefined)?.Items as { KeyGroup: Obj }[] | undefined) ?? []).map(({ KeyGroup }) => {
      const c = KeyGroup.KeyGroupConfig as Obj
      return { ...c, Id: KeyGroup.Id, LastModifiedTime: KeyGroup.LastModifiedTime, _id: KeyGroup.Id as string, _name: c.Name as string }
    })
  },
  columns: [
    { id: "id", header: "ID", cell: (r) => str(r.Id) },
    { id: "keys", header: "Public keys", cell: (r) => ((r.Items as string[] | undefined) ?? []).length },
    { id: "comment", header: "Description", cell: (r) => str(r.Comment) },
    { id: "modified", header: "Last modified", cell: (r) => consoleDate(r.LastModifiedTime as string) },
  ],
  details: (r) => [
    { label: "ID", value: <Copyable value={r.Id as string} /> },
    { label: "Description", value: str(r.Comment) },
    { label: "Public keys", value: ((r.Items as string[] | undefined) ?? []).join(", ") || "–" },
    { label: "Last modified", value: consoleDate(r.LastModifiedTime as string) },
  ],
  remove: (r) => etagDelete("GetKeyGroup", "DeleteKeyGroup", r._id),
  initial: (r) => ({ Name: r?.Name ?? "", Comment: r?.Comment ?? "", Items: (r?.Items as string[] | undefined) ?? [] }),
  valid: (v) => Boolean(s(v, "Name") && ((v.Items as string[]) ?? []).length),
  create: (v) => callAws("cloudfront", "CreateKeyGroup", { KeyGroupConfig: keyGroupConfig(v) }),
  update: async (r, v) => {
    const g = await callAws<{ ETag: string }>("cloudfront", "GetKeyGroup", { Id: r._id })
    return callAws("cloudfront", "UpdateKeyGroup", { Id: r._id, IfMatch: g.ETag, KeyGroupConfig: keyGroupConfig(v) })
  },
  form: ({ value, set }) => (
    <>
      <FormField label="Name"><Input value={s(value, "Name")} onChange={({ detail }) => set({ ...value, Name: detail.value })} /></FormField>
      <FormField label={<>Description <i>- optional</i></>}><Input value={s(value, "Comment")} onChange={({ detail }) => set({ ...value, Comment: detail.value })} /></FormField>
      <FormField label="Public keys" description="Add up to five public keys."><KeyPicker value={(value.Items as string[]) ?? []} onChange={(Items) => set({ ...value, Items })} /></FormField>
    </>
  ),
}

function KvsKeys({ arn }: { arn: string }) {
  const keys = useQuery({
    queryKey: ["emulator", "cloudfront", "kvs-keys", arn],
    queryFn: async () => {
      const r = await callAws<{ Items?: { Key: string; Value: string }[] }>("cloudfrontkeyvaluestore", "ListKeys", { KvsARN: arn })
      return r.Items ?? []
    },
    retry: false,
  })
  const [selected, setSelected] = useState<{ Key: string; Value: string }[]>([])
  const [form, setForm] = useState<{ Key: string; Value: string; edit: boolean }>()
  const etag = async () => (await callAws<{ ETag: string }>("cloudfrontkeyvaluestore", "DescribeKeyValueStore", { KvsARN: arn })).ETag
  if (keys.isError)
    return (
      <Container header={<Header variant="h2">Key value pairs</Header>}>
        <Alert type="info" header="Key value pairs aren't available in the local emulator">The CloudFront KeyValueStore data API couldn&apos;t be reached: {errorMessage(keys.error)}</Alert>
      </Container>
    )
  return (
    <>
      <Table
        header={
          <Header
            variant="h2"
            counter={`(${keys.data?.length ?? 0})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void keys.refetch()} />
                <Button disabled={selected.length !== 1} onClick={() => setForm({ ...selected[0], edit: true })}>Edit</Button>
                <Button
                  disabled={!selected.length}
                  onClick={async () => {
                    try {
                      for (const k of selected) await callAws("cloudfrontkeyvaluestore", "DeleteKey", { KvsARN: arn, Key: k.Key, IfMatch: await etag() })
                      flash.success(`Deleted ${selected.length} key${selected.length === 1 ? "" : "s"}.`)
                      setSelected([])
                      await keys.refetch()
                    } catch (e) {
                      flash.error(errorMessage(e))
                    }
                  }}
                >
                  Delete
                </Button>
                <Button onClick={() => setForm({ Key: "", Value: "", edit: false })}>Add key value pair</Button>
              </SpaceBetween>
            }
          >
            Key value pairs
          </Header>
        }
        loading={keys.isPending}
        selectionType="multi"
        trackBy="Key"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        items={keys.data ?? []}
        columnDefinitions={[{ id: "k", header: "Key", cell: (k) => k.Key }, { id: "v", header: "Value", cell: (k) => k.Value }]}
        empty={<Box textAlign="center" color="inherit">No key value pairs</Box>}
      />
      <EditModal
        visible={Boolean(form)}
        title={form?.edit ? "Edit key value pair" : "Add key value pair"}
        saveDisabled={!form?.Key}
        onDismiss={() => setForm(undefined)}
        success="Successfully saved the key value pair."
        onSave={async () => {
          if (!form) return
          await callAws("cloudfrontkeyvaluestore", "PutKey", { KvsARN: arn, Key: form.Key, Value: form.Value, IfMatch: await etag() })
          setSelected([])
          await keys.refetch()
        }}
      >
        {form && (
          <SpaceBetween size="l">
            <FormField label="Key"><Input value={form.Key} disabled={form.edit} onChange={({ detail }) => setForm({ ...form, Key: detail.value })} /></FormField>
            <FormField label="Value" stretch><Textarea rows={3} value={form.Value} onChange={({ detail }) => setForm({ ...form, Value: detail.value })} /></FormField>
          </SpaceBetween>
        )}
      </EditModal>
    </>
  )
}

const kvs: Spec = {
  section: "key-value-stores",
  title: "Key value stores",
  singular: "key value store",
  description: "Global, low-latency data stores that CloudFront Functions can read from.",
  list: () => listOf("ListKeyValueStores", "KeyValueStoreList", (o) => ({ ...o, _id: o.Name as string, _name: o.Name as string })),
  columns: [
    { id: "status", header: "Status", cell: (r) => <StatusIndicator type={r.Status === "READY" ? "success" : r.Status === "PROVISIONING" ? "pending" : "error"}>{str(r.Status)}</StatusIndicator> },
    { id: "comment", header: "Description", cell: (r) => str(r.Comment) },
    { id: "modified", header: "Last modified", cell: (r) => consoleDate(r.LastModifiedTime as string) },
  ],
  details: (r) => [
    { label: "ID", value: <Copyable value={r.Id as string} /> },
    { label: "ARN", value: <Copyable value={r.ARN as string} /> },
    { label: "Status", value: str(r.Status) },
    { label: "Description", value: str(r.Comment) },
    { label: "Last modified", value: consoleDate(r.LastModifiedTime as string) },
  ],
  extra: (r) => <KvsKeys arn={r.ARN as string} />,
  remove: async (r) => {
    const g = await callAws<{ ETag: string }>("cloudfront", "DescribeKeyValueStore", { Name: r._id })
    return callAws("cloudfront", "DeleteKeyValueStore", { Name: r._id, IfMatch: g.ETag })
  },
  initial: (r) => ({ Name: r?.Name ?? "", Comment: r?.Comment ?? "" }),
  valid: (v) => /^[A-Za-z0-9_-]{1,64}$/.test(s(v, "Name")),
  create: (v) => callAws("cloudfront", "CreateKeyValueStore", { Name: s(v, "Name"), Comment: s(v, "Comment") }),
  update: async (r, v) => {
    const g = await callAws<{ ETag: string }>("cloudfront", "DescribeKeyValueStore", { Name: r._id })
    return callAws("cloudfront", "UpdateKeyValueStore", { Name: r._id, Comment: s(v, "Comment"), IfMatch: g.ETag })
  },
  form: ({ value, set, editing }) => (
    <>
      <FormField label="Name" constraintText="Up to 64 characters: letters, numbers, hyphens (-), and underscores (_)."><Input value={s(value, "Name")} disabled={Boolean(editing)} onChange={({ detail }) => set({ ...value, Name: detail.value })} /></FormField>
      <FormField label={<>Description <i>- optional</i></>}><Input value={s(value, "Comment")} onChange={({ detail }) => set({ ...value, Comment: detail.value })} /></FormField>
    </>
  ),
}

export const cfSpecs: Record<string, Spec> = { "origin-access": oac, "public-keys": publicKeys, "key-groups": keyGroups, "key-value-stores": kvs }

export function SpecPage({ section, id }: { section: string; id?: string }) {
  const spec = cfSpecs[section]
  return id ? <DetailPage spec={spec} id={id} /> : <ListPage spec={spec} />
}
