"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import FormField from "@cloudscape-design/components/form-field"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import Wizard from "@cloudscape-design/components/wizard"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, JsonField, Section } from "@/components/console/sections"
import { TagEditor } from "@/components/console/tag-editor"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { IamLayout } from "@/components/iam/iam-app"
import { PolicyDocumentView, TagsSection, decodeDocument, errorMessage, flash, isAwsManaged, policyHref, policyType, useAllPolicies, useList, type Policy, type Tag } from "@/components/iam/shared"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

const usedAs = (p: Policy) => {
  const parts: string[] = []
  if (p.AttachmentCount) parts.push("Permissions policy")
  if (p.PermissionsBoundaryUsageCount) parts.push("Permissions boundary")
  return parts.length ? `${parts.join(", ")} (${(p.AttachmentCount ?? 0) + (p.PermissionsBoundaryUsageCount ?? 0)})` : "–"
}

type Version = { VersionId?: string; IsDefaultVersion?: boolean; CreateDate?: string; Document?: string }

/** Deletes a customer managed policy after detaching it and removing non-default versions. */
export async function deletePolicy(arn: string) {
  const [entities, versions] = await Promise.all([
    callAws<{ PolicyUsers?: { UserName?: string }[]; PolicyGroups?: { GroupName?: string }[]; PolicyRoles?: { RoleName?: string }[] }>("iam", "ListEntitiesForPolicy", { PolicyArn: arn }),
    callAws<{ Versions?: Version[] }>("iam", "ListPolicyVersions", { PolicyArn: arn }),
  ])
  for (const u of entities.PolicyUsers ?? []) await callAws("iam", "DetachUserPolicy", { PolicyArn: arn, UserName: u.UserName })
  for (const g of entities.PolicyGroups ?? []) await callAws("iam", "DetachGroupPolicy", { PolicyArn: arn, GroupName: g.GroupName })
  for (const r of entities.PolicyRoles ?? []) await callAws("iam", "DetachRolePolicy", { PolicyArn: arn, RoleName: r.RoleName })
  for (const v of versions.Versions ?? []) if (!v.IsDefaultVersion) await callAws("iam", "DeletePolicyVersion", { PolicyArn: arn, VersionId: v.VersionId })
  await callAws("iam", "DeletePolicy", { PolicyArn: arn })
}

export function PoliciesPage() {
  const follow = useFollow()
  const policies = useAllPolicies()
  const [type, setType] = useState("all")
  const [selected, setSelected] = useState<Policy[]>([])
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState("")
  const items = (policies.data ?? []).filter((p) => type === "all" || (type === "aws" ? isAwsManaged(p.Arn) : type === "customer" ? !isAwsManaged(p.Arn) : type === "job" ? p.Arn?.includes("/job-function/") : (p.AttachmentCount ?? 0) > 0))
  const current = selected[0]
  return (
    <IamLayout breadcrumbs={[{ text: "Policies", href: "/iam/policies" }]} contentType="table">
      <ResourceTable<Policy>
        title="Policies"
        description="A policy is an object in AWS that defines permissions."
        items={items}
        loading={policies.isPending}
        loadingText="Loading policies"
        error={policies.error}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="Arn"
        filterPlaceholder="Search"
        columns={[
          { id: "name", header: "Policy name", value: (p) => p.PolicyName, cell: (p) => <Link href={policyHref(p.Arn)} onFollow={follow}>{p.PolicyName}</Link> },
          { id: "type", header: "Type", value: (p) => policyType(p.Arn), cell: (p) => policyType(p.Arn) },
          { id: "used", header: "Used as", value: (p) => usedAs(p), cell: (p) => usedAs(p) },
          { id: "description", header: "Description", value: (p) => p.Description, cell: (p) => p.Description || "–" },
        ]}
        empty={<EmptyState title="No policies" subtitle="No policies to display." />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Select
              selectedOption={{ value: type, label: { all: "Filter by Type", aws: "AWS managed", customer: "Customer managed", job: "AWS managed - job function", used: "Used as permissions policy" }[type] }}
              onChange={({ detail }) => setType(detail.selectedOption.value ?? "all")}
              options={[{ value: "all", label: "All types" }, { value: "aws", label: "AWS managed" }, { value: "customer", label: "Customer managed" }, { value: "job", label: "AWS managed - job function" }, { value: "used", label: "Used as permissions policy" }]}
            />
            <Button iconName="refresh" ariaLabel="Refresh" loading={policies.isFetching} onClick={() => void policies.refetch()} />
            <Button disabled={!current || isAwsManaged(current.Arn)} onClick={() => { setConfirm(""); setDeleting(true) }}>Delete</Button>
            <Button disabled={!current} href={current ? policyHref(current.Arn) : undefined} onFollow={follow}>Actions</Button>
            <Button variant="primary" href="/iam/policies/create" onFollow={follow}>Create policy</Button>
          </SpaceBetween>
        }
      />
      <EditModal visible={deleting} title={`Delete ${current?.PolicyName}?`} saveLabel="Delete" saveDisabled={confirm !== current?.PolicyName} onDismiss={() => setDeleting(false)} success={`Policy ${current?.PolicyName} deleted.`} onSave={async () => { await deletePolicy(current?.Arn ?? ""); setSelected([]); await policies.refetch() }}>
        <Alert type="warning">Deleting the policy detaches it from all users, groups, and roles. This can&apos;t be undone.</Alert>
        <FormField label={<>To confirm deletion, enter the policy name <i>{current?.PolicyName}</i>.</>}><Input value={confirm} onChange={({ detail }) => setConfirm(detail.value)} /></FormField>
      </EditModal>
    </IamLayout>
  )
}

const starter = JSON.stringify({ Version: "2012-10-17", Statement: [{ Sid: "Statement1", Effect: "Allow", Action: [], Resource: [] }] }, null, 2)

export function CreatePolicyPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [doc, setDoc] = useState(starter)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  let statements: unknown[] = []
  try {
    statements = JSON.parse(doc).Statement ?? []
  } catch {
    statements = []
  }
  return (
    <IamLayout breadcrumbs={[{ text: "Policies", href: "/iam/policies" }, { text: "Create policy", href: "#" }]} contentType="wizard">
      <Wizard
        activeStepIndex={step}
        isLoadingNextStep={saving}
        onNavigate={({ detail }) => {
          try {
            JSON.parse(doc)
            setError(undefined)
            setStep(detail.requestedStepIndex)
          } catch (e) {
            setError(errorMessage(e))
          }
        }}
        onCancel={() => router.push("/iam/policies")}
        onSubmit={async () => {
          setSaving(true)
          setError(undefined)
          try {
            const valid = tags.filter((t) => t.Key)
            await callAws("iam", "CreatePolicy", { PolicyName: name, PolicyDocument: JSON.stringify(JSON.parse(doc)), ...(description ? { Description: description } : {}), ...(valid.length ? { Tags: valid.map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) } : {}) })
            flash.success(`Policy ${name} created.`)
            router.push("/iam/policies")
          } catch (e) {
            setError(errorMessage(e))
          } finally {
            setSaving(false)
          }
        }}
        submitButtonText="Create policy"
        i18nStrings={{ stepNumberLabel: (n) => `Step ${n}`, collapsedStepsLabel: (n, c) => `Step ${n} of ${c}`, cancelButton: "Cancel", previousButton: "Previous", nextButton: "Next", optional: "optional" }}
        steps={[
          {
            title: "Specify permissions",
            description: "Add permissions by selecting services, actions, resources, and conditions. Build permission statements using the JSON editor.",
            errorText: error,
            content: (
              <Container header={<Header variant="h2" actions={<Button disabled>Visual</Button>}>Policy editor</Header>}>
                <JsonField value={doc} onChange={setDoc} rows={22} />
              </Container>
            ),
          },
          {
            title: "Review and create",
            errorText: error,
            content: (
              <SpaceBetween size="l">
                <Container header={<Header variant="h2">Policy details</Header>}>
                  <SpaceBetween size="l">
                    <FormField label="Policy name" description="Enter a meaningful name to identify this policy." constraintText="Maximum 128 characters. Use alphanumeric and '+=,.@-_' characters."><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
                    <FormField label="Description - optional" constraintText="Maximum 1,000 characters."><Textarea value={description} onChange={({ detail }) => setDescription(detail.value)} /></FormField>
                  </SpaceBetween>
                </Container>
                <Container header={<Header variant="h2" counter={`(${statements.length} statement${statements.length === 1 ? "" : "s"})`}>Permissions defined in this policy</Header>}>
                  <PolicyDocumentView document={doc} />
                </Container>
                <Container header={<Header variant="h2">Add tags - <i>optional</i></Header>}>
                  <TagEditor tags={tags} onChange={setTags} />
                </Container>
              </SpaceBetween>
            ),
          },
        ]}
      />
    </IamLayout>
  )
}

type Entities = { PolicyUsers?: { UserName?: string }[]; PolicyGroups?: { GroupName?: string }[]; PolicyRoles?: { RoleName?: string }[] }
type Entity = { name: string; type: "User" | "Group" | "Role" }

export function PolicyDetailPage({ arn, tab = "permissions" }: { arn: string; tab?: string }) {
  const router = useRouter()
  const follow = useFollow()
  const policy = useAws<{ Policy?: Policy }>("iam", "GetPolicy", { PolicyArn: arn })
  const p = policy.data?.Policy
  const version = useAws<{ PolicyVersion?: Version }>("iam", "GetPolicyVersion", { PolicyArn: arn, VersionId: p?.DefaultVersionId }, { enabled: Boolean(p?.DefaultVersionId) })
  const versions = useAws<{ Versions?: Version[] }>("iam", "ListPolicyVersions", { PolicyArn: arn })
  const entities = useAws<Entities>("iam", "ListEntitiesForPolicy", { PolicyArn: arn })
  const users = useList<{ UserName?: string }>("ListUsers", "Users")
  const groups = useList<{ GroupName?: string }>("ListGroups", "Groups")
  const roles = useList<{ RoleName?: string }>("ListRoles", "Roles")
  const [modal, setModal] = useState<string>()
  const [draft, setDraft] = useState("")
  const [selectedEntities, setSelectedEntities] = useState<Entity[]>([])
  const [pick, setPick] = useState<Entity[]>([])
  const [selectedVersion, setSelectedVersion] = useState<Version[]>([])
  const aws = isAwsManaged(arn)
  const name = p?.PolicyName ?? arn.split("/").pop() ?? arn
  const attachedList: Entity[] = [...(entities.data?.PolicyUsers ?? []).map((u) => ({ name: u.UserName ?? "", type: "User" as const })), ...(entities.data?.PolicyGroups ?? []).map((g) => ({ name: g.GroupName ?? "", type: "Group" as const })), ...(entities.data?.PolicyRoles ?? []).map((r) => ({ name: r.RoleName ?? "", type: "Role" as const }))]
  const candidates: Entity[] = [...(users.data ?? []).map((u) => ({ name: u.UserName ?? "", type: "User" as const })), ...(groups.data ?? []).map((g) => ({ name: g.GroupName ?? "", type: "Group" as const })), ...(roles.data ?? []).map((r) => ({ name: r.RoleName ?? "", type: "Role" as const }))].filter((c) => !attachedList.some((a) => a.name === c.name && a.type === c.type))
  const entityHref = (e: Entity) => `/iam/${e.type === "User" ? "users" : e.type === "Group" ? "groups" : "roles"}/details/${encodeURIComponent(e.name)}`
  const refreshAll = () => { void policy.refetch(); void versions.refetch(); void version.refetch() }

  return (
    <IamLayout breadcrumbs={[{ text: "Policies", href: "/iam/policies" }, { text: name, href: policyHref(arn) }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            description={p?.Description}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={aws} disabledReason="AWS managed policies can't be deleted." onClick={() => setModal("delete")}>Delete</Button>
                <Button disabled={aws} disabledReason="AWS managed policies can't be edited." onClick={() => { setDraft(decodeDocument(version.data?.PolicyVersion?.Document)); setModal("edit") }}>Edit</Button>
              </SpaceBetween>
            }
          >
            {name}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {policy.error && <Alert type="error">{errorMessage(policy.error)}</Alert>}
          <Container header={<Header variant="h2">Policy details</Header>}>
            <KeyValuePairs columns={4} items={[{ label: "Type", value: policyType(arn) }, { label: "Creation time", value: consoleDate(p?.CreateDate) }, { label: "Edited time", value: consoleDate(p?.UpdateDate) }, { label: "ARN", value: <Copyable value={arn} /> }]} />
          </Container>
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => router.replace(`${policyHref(arn)}?tab=${detail.activeTabId}`)}
            tabs={[
              {
                id: "permissions",
                label: "Permissions",
                content: (
                  <Section title="Permissions defined in this policy" description="Permissions defined in this policy document specify which actions are allowed or denied." actions={<Button disabled={aws} onClick={() => { setDraft(decodeDocument(version.data?.PolicyVersion?.Document)); setModal("edit") }}>Edit</Button>}>
                    {version.isPending ? <Box color="text-status-inactive">Loading…</Box> : <PolicyDocumentView document={version.data?.PolicyVersion?.Document} />}
                  </Section>
                ),
              },
              {
                id: "entities",
                label: "Entities attached",
                content: (
                  <Table<Entity>
                    header={
                      <Header
                        variant="h2"
                        counter={`(${attachedList.length})`}
                        description="An entity is a user, group, or role that this policy is attached to."
                        actions={
                          <SpaceBetween direction="horizontal" size="xs">
                            <Button disabled={selectedEntities.length === 0} onClick={async () => { for (const e of selectedEntities) await callAws("iam", `Detach${e.type}Policy`, { [`${e.type}Name`]: e.name, PolicyArn: arn }); flash.success("Policy detached."); setSelectedEntities([]); void entities.refetch() }}>Detach</Button>
                            <Button onClick={() => { setPick([]); setModal("attach") }}>Attach</Button>
                          </SpaceBetween>
                        }
                      >
                        Entities attached
                      </Header>
                    }
                    items={attachedList}
                    selectionType="multi"
                    selectedItems={selectedEntities}
                    onSelectionChange={({ detail }) => setSelectedEntities(detail.selectedItems)}
                    trackBy={(e) => `${e.type}:${e.name}`}
                    columnDefinitions={[{ id: "name", header: "Entity name", cell: (e) => <Link href={entityHref(e)} onFollow={follow}>{e.name}</Link> }, { id: "type", header: "Entity type", cell: (e) => e.type }, { id: "as", header: "Attached as", cell: () => "Permissions policy" }]}
                    empty={<Box textAlign="center" color="inherit"><b>No entities attached</b><Box variant="p" color="inherit">This policy isn&apos;t attached to any users, groups, or roles.</Box></Box>}
                  />
                ),
              },
              { id: "tags", label: "Tags", content: aws ? <Box color="text-status-inactive">AWS managed policies can&apos;t be tagged.</Box> : <TagsSection queryKey={["policy", arn]} list={async () => (await callAws<{ Tags?: Tag[] }>("iam", "ListPolicyTags", { PolicyArn: arn })).Tags ?? []} tag={(tags) => callAws("iam", "TagPolicy", { PolicyArn: arn, Tags: tags })} untag={(keys) => callAws("iam", "UntagPolicy", { PolicyArn: arn, TagKeys: keys })} /> },
              {
                id: "versions",
                label: "Policy versions",
                content: (
                  <Table<Version>
                    header={
                      <Header
                        variant="h2"
                        counter={`(${versions.data?.Versions?.length ?? 0})`}
                        description="You can have up to five versions of a customer managed policy."
                        actions={
                          <SpaceBetween direction="horizontal" size="xs">
                            <Button disabled={aws || !selectedVersion[0] || selectedVersion[0].IsDefaultVersion} onClick={async () => { await callAws("iam", "DeletePolicyVersion", { PolicyArn: arn, VersionId: selectedVersion[0].VersionId }); flash.success("Version deleted."); setSelectedVersion([]); refreshAll() }}>Delete</Button>
                            <Button disabled={aws || !selectedVersion[0] || selectedVersion[0].IsDefaultVersion} onClick={async () => { await callAws("iam", "SetDefaultPolicyVersion", { PolicyArn: arn, VersionId: selectedVersion[0].VersionId }); flash.success(`Version ${selectedVersion[0].VersionId} set as default.`); setSelectedVersion([]); refreshAll() }}>Set as default</Button>
                          </SpaceBetween>
                        }
                      >
                        Policy versions
                      </Header>
                    }
                    items={versions.data?.Versions ?? []}
                    selectionType="single"
                    selectedItems={selectedVersion}
                    onSelectionChange={({ detail }) => setSelectedVersion(detail.selectedItems)}
                    trackBy="VersionId"
                    columnDefinitions={[{ id: "v", header: "Version", cell: (v) => `${v.VersionId}${v.IsDefaultVersion ? " (Default)" : ""}` }, { id: "created", header: "Creation time", cell: (v) => consoleDate(v.CreateDate) }]}
                    empty={<Box textAlign="center">No versions</Box>}
                  />
                ),
              },
              { id: "access_advisor", label: "Access Advisor", content: <Alert type="info">Service last accessed information is not tracked by the local emulator.</Alert> },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      <EditModal
        visible={modal === "edit"}
        size="large"
        title={`Modify permissions in ${name}`}
        saveLabel="Save changes"
        onDismiss={() => setModal(undefined)}
        success="Policy updated."
        onSave={async () => {
          const list = versions.data?.Versions ?? []
          if (list.length >= 5) {
            const oldest = [...list].filter((v) => !v.IsDefaultVersion).sort((a, b) => String(a.CreateDate).localeCompare(String(b.CreateDate)))[0]
            if (oldest) await callAws("iam", "DeletePolicyVersion", { PolicyArn: arn, VersionId: oldest.VersionId })
          }
          await callAws("iam", "CreatePolicyVersion", { PolicyArn: arn, PolicyDocument: JSON.stringify(JSON.parse(draft)), SetAsDefault: true })
          refreshAll()
        }}
      >
        <JsonField value={draft} onChange={setDraft} rows={20} />
      </EditModal>
      <EditModal visible={modal === "attach"} size="large" title={`Attach ${name}`} saveLabel="Attach policy" saveDisabled={pick.length === 0} onDismiss={() => setModal(undefined)} success="Policy attached." onSave={async () => { for (const e of pick) await callAws("iam", `Attach${e.type}Policy`, { [`${e.type}Name`]: e.name, PolicyArn: arn }); await entities.refetch() }}>
        <Table<Entity> variant="embedded" items={candidates} selectionType="multi" selectedItems={pick} onSelectionChange={({ detail }) => setPick(detail.selectedItems)} trackBy={(e) => `${e.type}:${e.name}`} columnDefinitions={[{ id: "n", header: "Name", cell: (e) => e.name }, { id: "t", header: "Type", cell: (e) => e.type }]} empty={<Box textAlign="center">No users, groups, or roles</Box>} />
      </EditModal>
      <EditModal visible={modal === "delete"} title={`Delete ${name}?`} saveLabel="Delete" onDismiss={() => setModal(undefined)} success={`Policy ${name} deleted.`} onSave={async () => { await deletePolicy(arn); router.push("/iam/policies") }}>
        <Box>Deleting the policy detaches it from {attachedList.length} entit{attachedList.length === 1 ? "y" : "ies"}. This can&apos;t be undone.</Box>
      </EditModal>
    </IamLayout>
  )
}
