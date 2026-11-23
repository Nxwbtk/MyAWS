"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import SegmentedControl from "@cloudscape-design/components/segmented-control"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import TextFilter from "@cloudscape-design/components/text-filter"
import Pagination from "@cloudscape-design/components/pagination"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { CodeView, EditModal, JsonField, pretty } from "@/components/console/sections"
import { TagEditor } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { callAws, listAll, useAws } from "@/lib/aws"

export type Policy = { PolicyName?: string; PolicyId?: string; Arn?: string; Path?: string; DefaultVersionId?: string; AttachmentCount?: number; PermissionsBoundaryUsageCount?: number; IsAttachable?: boolean; Description?: string; CreateDate?: string; UpdateDate?: string }
export type Attached = { PolicyName?: string; PolicyArn?: string }
export type Tag = { Key: string; Value?: string }

export const isAwsManaged = (arn?: string) => Boolean(arn?.startsWith("arn:aws:iam::aws:policy/"))
export const policyType = (arn?: string) => (isAwsManaged(arn) ? (arn?.includes("/job-function/") ? "AWS managed - job function" : "AWS managed") : "Customer managed")

/** IAM returns policy documents URL-encoded; this decodes and pretty-prints them. */
export function decodeDocument(doc?: string) {
  if (!doc) return ""
  let text = doc
  try {
    text = decodeURIComponent(doc)
  } catch {
    // Already decoded.
  }
  return pretty(text) || text
}

export function age(date?: string) {
  if (!date) return "–"
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days < 1) return "Today"
  if (days === 1) return "Yesterday"
  return `${days} days`
}

export function useAllPolicies(scope: "All" | "AWS" | "Local" = "All", enabled = true) {
  return useQuery({
    queryKey: ["emulator", "iam", "policies", scope],
    enabled,
    queryFn: () => listAll<Policy>("iam", "ListPolicies", { Scope: scope, MaxItems: 1000 }, (page) => page.Policies as Policy[], { input: "Marker", output: "Marker" }, 5000),
  })
}

export function useList<T>(operation: string, key: string, input: Record<string, unknown> = {}, enabled = true) {
  return useQuery({
    queryKey: ["emulator", "iam", operation, input],
    enabled,
    queryFn: () => listAll<T>("iam", operation, { ...input, MaxItems: 1000 }, (page) => page[key] as T[], { input: "Marker", output: "Marker" }, 5000),
  })
}

export const policyHref = (arn?: string) => `/iam/policies/details/${encodeURIComponent(arn ?? "")}`

/** Policy picker used when attaching permissions to users, groups, and roles. */
export function PolicyPicker({ selected, onChange, exclude = [] }: { selected: Policy[]; onChange: (items: Policy[]) => void; exclude?: string[] }) {
  const follow = useFollow()
  const [filter, setFilter] = useState("")
  const [type, setType] = useState("all")
  const [page, setPage] = useState(1)
  const policies = useAllPolicies()
  const items = (policies.data ?? [])
    .filter((p) => !exclude.includes(p.Arn ?? ""))
    .filter((p) => type === "all" || (type === "aws" ? isAwsManaged(p.Arn) : !isAwsManaged(p.Arn)))
    .filter((p) => !filter || p.PolicyName?.toLowerCase().includes(filter.toLowerCase()))
  const pageSize = 10
  return (
    <Table<Policy>
      variant="embedded"
      header={<Header counter={`(${selected.length}/${items.length})`}>Permissions policies</Header>}
      loading={policies.isPending}
      loadingText="Loading policies"
      items={items.slice((page - 1) * pageSize, page * pageSize)}
      selectionType="multi"
      selectedItems={selected}
      onSelectionChange={({ detail }) => onChange(detail.selectedItems)}
      trackBy="Arn"
      filter={
        <SpaceBetween direction="horizontal" size="xs">
          <TextFilter filteringText={filter} filteringPlaceholder="Search" onChange={({ detail }) => { setFilter(detail.filteringText); setPage(1) }} />
          <Select selectedOption={{ value: type, label: type === "all" ? "All types" : type === "aws" ? "AWS managed" : "Customer managed" }} onChange={({ detail }) => { setType(detail.selectedOption.value ?? "all"); setPage(1) }} options={[{ value: "all", label: "All types" }, { value: "aws", label: "AWS managed" }, { value: "customer", label: "Customer managed" }]} />
        </SpaceBetween>
      }
      pagination={<Pagination currentPageIndex={page} pagesCount={Math.max(1, Math.ceil(items.length / pageSize))} onChange={({ detail }) => setPage(detail.currentPageIndex)} />}
      columnDefinitions={[
        { id: "name", header: "Policy name", cell: (p) => <Link href={policyHref(p.Arn)} onFollow={follow}>{p.PolicyName}</Link> },
        { id: "type", header: "Type", cell: (p) => policyType(p.Arn) },
        { id: "attached", header: "Attached entities", cell: (p) => p.AttachmentCount ?? 0 },
      ]}
      empty={<Box textAlign="center">No policies</Box>}
    />
  )
}

type PermissionsProps = {
  attached: Attached[]
  inline: string[]
  loading?: boolean
  onAdd: () => void
  onDetach: (arn: string) => Promise<unknown>
  onDeleteInline: (name: string) => Promise<unknown>
  getInline: (name: string) => Promise<string | undefined>
  putInline: (name: string, document: string) => Promise<unknown>
  refresh: () => void
  boundary?: string
}

/** The "Permissions policies" table shared by users, groups, and roles. */
export function PermissionsTable({ attached, inline, loading, onAdd, onDetach, onDeleteInline, getInline, putInline, refresh }: PermissionsProps) {
  const follow = useFollow()
  type Row = { name: string; arn?: string; type: string }
  const rows: Row[] = [...attached.map((a) => ({ name: a.PolicyName ?? "", arn: a.PolicyArn, type: policyType(a.PolicyArn) })), ...inline.map((name) => ({ name, type: "Customer inline" }))]
  const [selected, setSelected] = useState<Row[]>([])
  const [filter, setFilter] = useState("")
  const [editing, setEditing] = useState<{ name: string; doc: string; isNew: boolean }>()
  const [viewing, setViewing] = useState<{ name: string; doc: string }>()
  const [remove, setRemove] = useState(false)
  const visible = rows.filter((r) => !filter || r.name.toLowerCase().includes(filter.toLowerCase()))
  return (
    <>
      <Table<Row>
        header={
          <Header
            variant="h2"
            counter={`(${rows.length})`}
            description="You can attach up to 10 managed policies."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={refresh} />
                <Button disabled={selected.length === 0} onClick={() => setRemove(true)}>Remove</Button>
                <Button onClick={() => setEditing({ name: "", doc: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: [], Resource: [] }] }, null, 2), isNew: true })}>Create inline policy</Button>
                <Button variant="primary" onClick={onAdd}>Add permissions</Button>
              </SpaceBetween>
            }
          >
            Permissions policies
          </Header>
        }
        loading={loading}
        items={visible}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        trackBy={(r) => r.arn ?? `inline:${r.name}`}
        filter={<TextFilter filteringText={filter} filteringPlaceholder="Search" onChange={({ detail }) => setFilter(detail.filteringText)} />}
        columnDefinitions={[
          {
            id: "name",
            header: "Policy name",
            cell: (r) =>
              r.arn ? (
                <Link href={policyHref(r.arn)} onFollow={follow}>{r.name}</Link>
              ) : (
                <Link onFollow={async (e) => { e.preventDefault(); setViewing({ name: r.name, doc: decodeDocument(await getInline(r.name)) }) }} href="#">{r.name}</Link>
              ),
          },
          { id: "type", header: "Type", cell: (r) => r.type },
          { id: "attached", header: "Attached via", cell: (r) => (r.arn ? "Directly" : "Inline") },
        ]}
        empty={<Box textAlign="center" color="inherit"><b>No resources to display</b><Box variant="p" color="inherit">No permissions policies attached.</Box><Button onClick={onAdd}>Add permissions</Button></Box>}
      />
      <EditModal
        visible={remove}
        title="Remove policies?"
        saveLabel="Remove policies"
        onDismiss={() => setRemove(false)}
        success="Policies removed."
        onSave={async () => {
          for (const r of selected) {
            if (r.arn) await onDetach(r.arn)
            else await onDeleteInline(r.name)
          }
          setSelected([])
          refresh()
        }}
      >
        <Box>Remove {selected.map((r) => r.name).join(", ")}?</Box>
      </EditModal>
      <EditModal visible={Boolean(viewing)} size="large" title={viewing?.name ?? ""} saveLabel="Edit" onDismiss={() => setViewing(undefined)} onSave={async () => { if (viewing) setEditing({ name: viewing.name, doc: viewing.doc, isNew: false }) }}>
        <CodeView value={viewing?.doc} />
      </EditModal>
      <EditModal
        visible={Boolean(editing)}
        size="large"
        title={editing?.isNew ? "Create inline policy" : `Edit ${editing?.name}`}
        saveLabel={editing?.isNew ? "Create policy" : "Save changes"}
        saveDisabled={!editing?.name}
        onDismiss={() => setEditing(undefined)}
        success="Inline policy saved."
        onSave={async () => {
          if (!editing) return
          await putInline(editing.name, JSON.stringify(JSON.parse(editing.doc)))
          refresh()
        }}
      >
        {editing?.isNew && <FormField label="Policy name" constraintText="Maximum 128 characters. Use alphanumeric and '+=,.@-_' characters."><Input value={editing.name} onChange={({ detail }) => setEditing({ ...editing, name: detail.value })} /></FormField>}
        <FormField label="Policy editor" stretch>{editing && <JsonField value={editing.doc} rows={18} onChange={(doc) => setEditing({ ...editing, doc })} />}</FormField>
      </EditModal>
    </>
  )
}

export function TagsSection({ queryKey, list, tag, untag }: { queryKey: unknown[]; list: () => Promise<Tag[]>; tag: (tags: Tag[]) => Promise<unknown>; untag: (keys: string[]) => Promise<unknown> }) {
  const tags = useQuery({ queryKey: ["emulator", "iam", "tags", ...queryKey], queryFn: list })
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Tag[]>([])
  const items = tags.data ?? []
  return (
    <>
      <Table<Tag>
        header={<Header variant="h2" counter={`(${items.length})`} actions={<Button onClick={() => { setEdit(items.map((t) => ({ ...t }))); setOpen(true) }}>Manage tags</Button>}>Tags</Header>}
        loading={tags.isPending}
        items={items}
        columnDefinitions={[{ id: "key", header: "Key", cell: (t) => t.Key }, { id: "value", header: "Value", cell: (t) => t.Value || "–" }]}
        empty={<Box textAlign="center" color="inherit"><b>No tags associated with the resource.</b></Box>}
      />
      <TagsModal
        visible={open}
        tags={edit}
        onChange={setEdit}
        close={() => setOpen(false)}
        save={async () => {
          const after = edit.filter((t) => t.Key)
          const removed = items.filter((t) => !after.some((a) => a.Key === t.Key)).map((t) => t.Key)
          if (removed.length) await untag(removed)
          if (after.length) await tag(after.map((t) => ({ Key: t.Key, Value: t.Value ?? "" })))
          await tags.refetch()
        }}
      />
    </>
  )
}


function TagsModal({ visible, tags, onChange, close, save }: { visible: boolean; tags: Tag[]; onChange: (tags: Tag[]) => void; close: () => void; save: () => Promise<void> }) {
  return (
    <EditModal visible={visible} size="large" title="Manage tags" onDismiss={close} success="Tags updated." onSave={save}>
      <TagEditor tags={tags} onChange={onChange} />
    </EditModal>
  )
}

/** Visual/JSON toggle around a policy document, as on the policy details page. */
export function PolicyDocumentView({ document }: { document?: string }) {
  const [mode, setMode] = useState("json")
  const doc = decodeDocument(document)
  let statements: { Sid?: string; Effect?: string; Action?: string | string[]; Resource?: string | string[]; Principal?: unknown }[] = []
  try {
    const parsed = JSON.parse(doc)
    statements = Array.isArray(parsed.Statement) ? parsed.Statement : parsed.Statement ? [parsed.Statement] : []
  } catch {
    statements = []
  }
  const list = (v?: string | string[]) => (Array.isArray(v) ? v.join(", ") : v ?? "–")
  return (
    <SpaceBetween size="s">
      <SegmentedControl selectedId={mode} onChange={({ detail }) => setMode(detail.selectedId)} options={[{ id: "visual", text: "Visual" }, { id: "json", text: "JSON" }]} />
      {mode === "json" ? (
        <CodeView value={doc} />
      ) : (
        <Table
          variant="embedded"
          items={statements}
          columnDefinitions={[
            { id: "sid", header: "Sid", cell: (s) => s.Sid ?? "–" },
            { id: "effect", header: "Effect", cell: (s) => s.Effect },
            { id: "action", header: "Action", cell: (s) => list(s.Action) },
            { id: "resource", header: "Resource", cell: (s) => (s.Principal ? JSON.stringify(s.Principal) : list(s.Resource)) },
          ]}
          empty={<Box textAlign="center">No statements</Box>}
        />
      )}
    </SpaceBetween>
  )
}

export async function attachMany(kind: "User" | "Group" | "Role", name: string, policies: Policy[]) {
  for (const p of policies) await callAws("iam", `Attach${kind}Policy`, { [`${kind}Name`]: name, PolicyArn: p.Arn })
}

export function useAccountId() {
  const identity = useAws<{ Account?: string }>("sts", "GetCallerIdentity", {})
  return identity.data?.Account ?? "000000000000"
}

export { errorMessage, flash }
