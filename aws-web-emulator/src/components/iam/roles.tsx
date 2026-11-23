"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import Tiles from "@cloudscape-design/components/tiles"
import Wizard from "@cloudscape-design/components/wizard"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { CodeView, EditModal, JsonField, Section } from "@/components/console/sections"
import { TagEditor } from "@/components/console/tag-editor"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { IamLayout } from "@/components/iam/iam-app"
import { PermissionsTable, PolicyDocumentView, PolicyPicker, TagsSection, attachMany, decodeDocument, errorMessage, flash, useAccountId, useList, type Attached, type Policy, type Tag } from "@/components/iam/shared"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type Role = { RoleName?: string; RoleId?: string; Arn?: string; Path?: string; CreateDate?: string; AssumeRolePolicyDocument?: string; Description?: string; MaxSessionDuration?: number; RoleLastUsed?: { LastUsedDate?: string; Region?: string }; PermissionsBoundary?: { PermissionsBoundaryArn?: string } }

const roleHref = (name?: string) => `/iam/roles/details/${encodeURIComponent(name ?? "")}`

/** Summarizes a trust policy the way the Roles list's "Trusted entities" column does. */
export function trustedEntities(doc?: string) {
  try {
    const parsed = JSON.parse(decodeDocument(doc))
    const statements = Array.isArray(parsed.Statement) ? parsed.Statement : [parsed.Statement]
    const out: string[] = []
    for (const s of statements) {
      const p = s?.Principal
      if (!p) continue
      if (p === "*") out.push("All principals")
      const list = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []) as string[]
      list(p.Service).forEach((v) => out.push(`AWS Service: ${v.replace(".amazonaws.com", "")}`))
      list(p.AWS).forEach((v) => out.push(`Account: ${v.match(/\d{12}/)?.[0] ?? v}`))
      list(p.Federated).forEach((v) => out.push(`Identity Provider: ${v.split("/").pop()}`))
    }
    return out.join(", ") || "–"
  } catch {
    return "–"
  }
}

export async function deleteRole(name: string) {
  const r = { RoleName: name }
  const [attached, inline, profiles] = await Promise.all([
    callAws<{ AttachedPolicies?: Attached[] }>("iam", "ListAttachedRolePolicies", r),
    callAws<{ PolicyNames?: string[] }>("iam", "ListRolePolicies", r),
    callAws<{ InstanceProfiles?: { InstanceProfileName?: string }[] }>("iam", "ListInstanceProfilesForRole", r),
  ])
  for (const p of attached.AttachedPolicies ?? []) await callAws("iam", "DetachRolePolicy", { ...r, PolicyArn: p.PolicyArn })
  for (const p of inline.PolicyNames ?? []) await callAws("iam", "DeleteRolePolicy", { ...r, PolicyName: p })
  for (const p of profiles.InstanceProfiles ?? []) await callAws("iam", "RemoveRoleFromInstanceProfile", { ...r, InstanceProfileName: p.InstanceProfileName })
  await callAws("iam", "DeleteRole", r)
}

export function RolesPage() {
  const follow = useFollow()
  const roles = useList<Role>("ListRoles", "Roles")
  const [selected, setSelected] = useState<Role[]>([])
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState("")
  return (
    <IamLayout breadcrumbs={[{ text: "Roles", href: "/iam/roles" }]} contentType="table">
      <ResourceTable<Role>
        title="Roles"
        description="An IAM role is an identity you can create that has specific permissions with credentials that are valid for short durations. Roles can be assumed by entities that you trust."
        items={roles.data ?? []}
        loading={roles.isPending}
        loadingText="Loading roles"
        error={roles.error}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="RoleName"
        filterPlaceholder="Search"
        columns={[
          { id: "name", header: "Role name", value: (r) => r.RoleName, cell: (r) => <Link href={roleHref(r.RoleName)} onFollow={follow}>{r.RoleName}</Link> },
          { id: "trusted", header: "Trusted entities", value: (r) => trustedEntities(r.AssumeRolePolicyDocument), cell: (r) => trustedEntities(r.AssumeRolePolicyDocument) },
          { id: "activity", header: "Last activity", value: (r) => r.RoleLastUsed?.LastUsedDate, cell: (r) => (r.RoleLastUsed?.LastUsedDate ? consoleDate(r.RoleLastUsed.LastUsedDate) : "–") },
          { id: "arn", header: "ARN", value: (r) => r.Arn, cell: (r) => r.Arn },
          { id: "created", header: "Creation time", value: (r) => r.CreateDate, cell: (r) => consoleDate(r.CreateDate) },
        ]}
        empty={<EmptyState title="No resources to display" subtitle="" action={<Button href="/iam/roles/create" onFollow={follow}>Create role</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={roles.isFetching} onClick={() => void roles.refetch()} />
            <Button disabled={selected.length === 0} onClick={() => { setConfirm(""); setDeleting(true) }}>Delete</Button>
            <Button variant="primary" href="/iam/roles/create" onFollow={follow}>Create role</Button>
          </SpaceBetween>
        }
      />
      <EditModal visible={deleting} title={`Delete ${selected.length === 1 ? selected[0].RoleName : `${selected.length} roles`}?`} saveLabel="Delete" saveDisabled={confirm !== (selected.length === 1 ? selected[0].RoleName : "delete")} onDismiss={() => setDeleting(false)} success="Roles deleted." onSave={async () => { for (const r of selected) await deleteRole(r.RoleName ?? ""); setSelected([]); await roles.refetch() }}>
        <Alert type="warning">Deleting a role detaches its policies and removes it from instance profiles. Applications using the role lose access.</Alert>
        <FormField label={<>To confirm deletion, enter <i>{selected.length === 1 ? selected[0].RoleName : "delete"}</i>.</>}><Input value={confirm} onChange={({ detail }) => setConfirm(detail.value)} /></FormField>
      </EditModal>
    </IamLayout>
  )
}

const services = [
  { value: "ec2.amazonaws.com", label: "EC2", description: "Allows EC2 instances to call AWS services on your behalf." },
  { value: "lambda.amazonaws.com", label: "Lambda", description: "Allows Lambda functions to call AWS services on your behalf." },
  { value: "ecs-tasks.amazonaws.com", label: "Elastic Container Service Task", description: "Allows ECS tasks to call AWS services on your behalf." },
  { value: "states.amazonaws.com", label: "Step Functions", description: "Allows Step Functions to access AWS resources on your behalf." },
  { value: "apigateway.amazonaws.com", label: "API Gateway", description: "Allows API Gateway to push logs to CloudWatch Logs." },
  { value: "dax.amazonaws.com", label: "DynamoDB Accelerator (DAX)", description: "Allows DAX to access DynamoDB on your behalf." },
  { value: "cloudtrail.amazonaws.com", label: "CloudTrail", description: "Allows CloudTrail to deliver logs on your behalf." },
  { value: "events.amazonaws.com", label: "EventBridge", description: "Allows EventBridge to invoke targets on your behalf." },
  { value: "sqs.amazonaws.com", label: "SQS", description: "Allows SQS to call AWS services on your behalf." },
  { value: "s3.amazonaws.com", label: "S3", description: "Allows S3 to call AWS services on your behalf." },
]

type Provider = { Arn?: string }

export function CreateRolePage() {
  const router = useRouter()
  const account = useAccountId()
  const oidc = useAws<{ OpenIDConnectProviderList?: Provider[] }>("iam", "ListOpenIDConnectProviders", {})
  const saml = useAws<{ SAMLProviderList?: Provider[] }>("iam", "ListSAMLProviders", {})
  const [step, setStep] = useState(0)
  const [type, setType] = useState("service")
  const [service, setService] = useState(services[0].value)
  const [acct, setAcct] = useState({ mode: "this", id: "", externalId: "", requireExternal: false, mfa: false })
  const [web, setWeb] = useState({ provider: "", audience: "" })
  const [samlProvider, setSamlProvider] = useState("")
  const [custom, setCustom] = useState(JSON.stringify({ Version: "2012-10-17", Statement: [{ Sid: "Statement1", Effect: "Allow", Principal: {}, Action: "sts:AssumeRole" }] }, null, 2))
  const [policies, setPolicies] = useState<Policy[]>([])
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const trust = useMemo(() => {
    if (type === "custom") return custom
    let statement: Record<string, unknown>
    if (type === "service") statement = { Effect: "Allow", Principal: { Service: service }, Action: "sts:AssumeRole" }
    else if (type === "account") {
      const conditions: Record<string, unknown> = {}
      if (acct.requireExternal && acct.externalId) conditions.StringEquals = { "sts:ExternalId": acct.externalId }
      if (acct.mfa) conditions.Bool = { "aws:MultiFactorAuthPresent": "true" }
      statement = { Effect: "Allow", Principal: { AWS: `arn:aws:iam::${acct.mode === "this" ? account : acct.id}:root` }, Action: "sts:AssumeRole", ...(Object.keys(conditions).length ? { Condition: conditions } : {}) }
    } else if (type === "web") {
      const host = web.provider.split("oidc-provider/").pop() ?? web.provider
      statement = { Effect: "Allow", Principal: { Federated: web.provider }, Action: "sts:AssumeRoleWithWebIdentity", ...(web.audience ? { Condition: { StringEquals: { [`${host}:aud`]: web.audience } } } : {}) }
    } else statement = { Effect: "Allow", Principal: { Federated: samlProvider }, Action: "sts:AssumeRoleWithSAML", Condition: { StringEquals: { "SAML:aud": "https://signin.aws.amazon.com/saml" } } }
    return JSON.stringify({ Version: "2012-10-17", Statement: [statement] }, null, 2)
  }, [type, custom, service, acct, web, samlProvider, account])

  const create = async () => {
    setSaving(true)
    setError(undefined)
    try {
      const valid = tags.filter((t) => t.Key)
      await callAws("iam", "CreateRole", { RoleName: name, AssumeRolePolicyDocument: JSON.stringify(JSON.parse(trust)), ...(description ? { Description: description } : {}), ...(valid.length ? { Tags: valid.map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) } : {}) })
      await attachMany("Role", name, policies)
      if (type === "service" && service === "ec2.amazonaws.com") {
        await callAws("iam", "CreateInstanceProfile", { InstanceProfileName: name }).catch(() => undefined)
        await callAws("iam", "AddRoleToInstanceProfile", { InstanceProfileName: name, RoleName: name }).catch(() => undefined)
      }
      flash.success(`Role ${name} created.`)
      router.push("/iam/roles")
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <IamLayout breadcrumbs={[{ text: "Roles", href: "/iam/roles" }, { text: "Create role", href: "#" }]} contentType="wizard">
      <Wizard
        activeStepIndex={step}
        isLoadingNextStep={saving}
        onNavigate={({ detail }) => setStep(detail.requestedStepIndex)}
        onCancel={() => router.push("/iam/roles")}
        onSubmit={() => { if (!name) return setError("Role name is required."); void create() }}
        submitButtonText="Create role"
        i18nStrings={{ stepNumberLabel: (n) => `Step ${n}`, collapsedStepsLabel: (n, c) => `Step ${n} of ${c}`, cancelButton: "Cancel", previousButton: "Previous", nextButton: "Next", optional: "optional" }}
        steps={[
          {
            title: "Select trusted entity",
            content: (
              <SpaceBetween size="l">
                <Container header={<Header variant="h2">Trusted entity type</Header>}>
                  <Tiles
                    value={type}
                    onChange={({ detail }) => setType(detail.value)}
                    columns={3}
                    items={[
                      { value: "service", label: "AWS service", description: "Allow AWS services like EC2, Lambda, or others to perform actions in this account." },
                      { value: "account", label: "AWS account", description: "Allow entities in other AWS accounts belonging to you or a 3rd party to perform actions in this account." },
                      { value: "web", label: "Web identity", description: "Allows users federated by the specified external web identity provider to assume this role." },
                      { value: "saml", label: "SAML 2.0 federation", description: "Allow users federated with SAML 2.0 from a corporate directory to perform actions in this account." },
                      { value: "custom", label: "Custom trust policy", description: "Create a custom trust policy to enable others to perform actions in this account." },
                    ]}
                  />
                </Container>
                {type === "service" && (
                  <Container header={<Header variant="h2" description="Allow an AWS service like EC2, Lambda, or others to perform actions in this account.">Use case</Header>}>
                    <FormField label="Service or use case">
                      <Select selectedOption={services.find((s) => s.value === service) ?? null} onChange={({ detail }) => setService(detail.selectedOption.value ?? services[0].value)} options={services} filteringType="auto" />
                    </FormField>
                  </Container>
                )}
                {type === "account" && (
                  <Container header={<Header variant="h2">An AWS account</Header>}>
                    <SpaceBetween size="m">
                      <RadioGroup value={acct.mode} onChange={({ detail }) => setAcct({ ...acct, mode: detail.value })} items={[{ value: "this", label: `This account (${account})` }, { value: "other", label: "Another AWS account" }]} />
                      {acct.mode === "other" && <FormField label="Account ID"><Input value={acct.id} onChange={({ detail }) => setAcct({ ...acct, id: detail.value })} /></FormField>}
                      <Checkbox checked={acct.requireExternal} onChange={({ detail }) => setAcct({ ...acct, requireExternal: detail.checked })}>Require external ID (Best practice when a third party will assume this role)</Checkbox>
                      {acct.requireExternal && <FormField label="External ID"><Input value={acct.externalId} onChange={({ detail }) => setAcct({ ...acct, externalId: detail.value })} /></FormField>}
                      <Checkbox checked={acct.mfa} onChange={({ detail }) => setAcct({ ...acct, mfa: detail.checked })}>Require MFA</Checkbox>
                    </SpaceBetween>
                  </Container>
                )}
                {type === "web" && (
                  <Container header={<Header variant="h2">Web identity</Header>}>
                    <SpaceBetween size="m">
                      <FormField label="Identity provider"><Select selectedOption={web.provider ? { value: web.provider, label: web.provider.split("/").pop() } : null} placeholder="Choose an identity provider" empty="No OpenID Connect providers" onChange={({ detail }) => setWeb({ ...web, provider: detail.selectedOption.value ?? "" })} options={(oidc.data?.OpenIDConnectProviderList ?? []).map((p) => ({ value: p.Arn ?? "", label: p.Arn?.split("oidc-provider/").pop() }))} /></FormField>
                      <FormField label="Audience"><Input value={web.audience} onChange={({ detail }) => setWeb({ ...web, audience: detail.value })} /></FormField>
                    </SpaceBetween>
                  </Container>
                )}
                {type === "saml" && (
                  <Container header={<Header variant="h2">SAML 2.0 federation</Header>}>
                    <FormField label="SAML 2.0-based provider"><Select selectedOption={samlProvider ? { value: samlProvider, label: samlProvider.split("/").pop() } : null} placeholder="Choose a provider" empty="No SAML providers" onChange={({ detail }) => setSamlProvider(detail.selectedOption.value ?? "")} options={(saml.data?.SAMLProviderList ?? []).map((p) => ({ value: p.Arn ?? "", label: p.Arn?.split("/").pop() }))} /></FormField>
                  </Container>
                )}
                {type === "custom" && (
                  <Container header={<Header variant="h2">Custom trust policy</Header>}>
                    <JsonField value={custom} onChange={setCustom} rows={16} />
                  </Container>
                )}
              </SpaceBetween>
            ),
          },
          {
            title: "Add permissions",
            content: <Container><PolicyPicker selected={policies} onChange={setPolicies} /></Container>,
          },
          {
            title: "Name, review, and create",
            errorText: error,
            content: (
              <SpaceBetween size="l">
                <Container header={<Header variant="h2">Role details</Header>}>
                  <SpaceBetween size="l">
                    <FormField label="Role name" description="Enter a meaningful name to identify this role." constraintText="Maximum 64 characters. Use alphanumeric and '+=,.@-_' characters."><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
                    <FormField label="Description" description="Add a short explanation for this role." constraintText="Maximum 1000 characters."><Textarea value={description} onChange={({ detail }) => setDescription(detail.value)} /></FormField>
                  </SpaceBetween>
                </Container>
                <Container header={<Header variant="h2">Step 1: Select trusted entities</Header>}>
                  <FormField label="Trust policy" stretch><CodeView value={trust} /></FormField>
                </Container>
                <Table header={<Header variant="h2">Step 2: Add permissions</Header>} items={policies} columnDefinitions={[{ id: "n", header: "Policy name", cell: (p) => p.PolicyName }, { id: "t", header: "Type", cell: (p) => (p.Arn?.includes(":aws:policy/") ? "AWS managed" : "Customer managed") }, { id: "u", header: "Attached as", cell: () => "Permissions policy" }]} empty={<Box textAlign="center">No permissions policies</Box>} />
                <Container header={<Header variant="h2">Step 3: Add tags - <i>optional</i></Header>}>
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

export function RoleDetailPage({ name, tab = "permissions" }: { name: string; tab?: string }) {
  const router = useRouter()
  const role = useAws<{ Role?: Role }>("iam", "GetRole", { RoleName: name })
  const profiles = useAws<{ InstanceProfiles?: { Arn?: string }[] }>("iam", "ListInstanceProfilesForRole", { RoleName: name })
  const attached = useAws<{ AttachedPolicies?: Attached[] }>("iam", "ListAttachedRolePolicies", { RoleName: name })
  const inline = useAws<{ PolicyNames?: string[] }>("iam", "ListRolePolicies", { RoleName: name })
  const [modal, setModal] = useState<string>()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [trustDraft, setTrustDraft] = useState("")
  const [edit, setEdit] = useState({ description: "", duration: "3600" })
  const r = role.data?.Role
  const base = roleHref(name)
  const refreshPerms = () => { void attached.refetch(); void inline.refetch() }
  return (
    <IamLayout breadcrumbs={[{ text: "Roles", href: "/iam/roles" }, { text: name, href: base }]}>
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>} actions={<Button onClick={() => setModal("delete")}>Delete</Button>}>{name}</Header>}>
        <SpaceBetween size="l">
          {role.error && <Alert type="error">{errorMessage(role.error)}</Alert>}
          <Container header={<Header variant="h2" actions={<Button onClick={() => { setEdit({ description: r?.Description ?? "", duration: String(r?.MaxSessionDuration ?? 3600) }); setModal("edit") }}>Edit</Button>}>Summary</Header>}>
            <KeyValuePairs
              columns={3}
              items={[
                { label: "Creation date", value: consoleDate(r?.CreateDate) },
                { label: "ARN", value: <Copyable value={r?.Arn} /> },
                { label: "Instance profile ARN", value: profiles.data?.InstanceProfiles?.[0]?.Arn ? <Copyable value={profiles.data.InstanceProfiles[0].Arn} /> : "–" },
                { label: "Last activity", value: r?.RoleLastUsed?.LastUsedDate ? consoleDate(r.RoleLastUsed.LastUsedDate) : "–" },
                { label: "Maximum session duration", value: `${Math.round((r?.MaxSessionDuration ?? 3600) / 3600)} hour${(r?.MaxSessionDuration ?? 3600) > 3600 ? "s" : ""}` },
                { label: "Description", value: r?.Description || "–" },
              ]}
            />
          </Container>
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => router.replace(`${base}?tab=${detail.activeTabId}`)}
            tabs={[
              {
                id: "permissions",
                label: "Permissions",
                content: (
                  <SpaceBetween size="l">
                    <PermissionsTable
                      attached={attached.data?.AttachedPolicies ?? []}
                      inline={inline.data?.PolicyNames ?? []}
                      loading={attached.isPending}
                      onAdd={() => { setPolicies([]); setModal("attach") }}
                      onDetach={(arn) => callAws("iam", "DetachRolePolicy", { RoleName: name, PolicyArn: arn })}
                      onDeleteInline={(p) => callAws("iam", "DeleteRolePolicy", { RoleName: name, PolicyName: p })}
                      getInline={async (p) => (await callAws<{ PolicyDocument?: string }>("iam", "GetRolePolicy", { RoleName: name, PolicyName: p })).PolicyDocument}
                      putInline={(p, doc) => callAws("iam", "PutRolePolicy", { RoleName: name, PolicyName: p, PolicyDocument: doc })}
                      refresh={refreshPerms}
                    />
                    <Section title="Permissions boundary" items={[{ label: "Permissions boundary", value: r?.PermissionsBoundary?.PermissionsBoundaryArn ?? "(not set)" }]} actions={r?.PermissionsBoundary ? <Button onClick={async () => { await callAws("iam", "DeleteRolePermissionsBoundary", { RoleName: name }); void role.refetch() }}>Remove boundary</Button> : <Button onClick={() => { setPolicies([]); setModal("boundary") }}>Set permissions boundary</Button>} />
                  </SpaceBetween>
                ),
              },
              {
                id: "trust",
                label: "Trust relationships",
                content: (
                  <Section title="Trusted entities" description="Entities that can assume this role under specified conditions." actions={<Button onClick={() => { setTrustDraft(decodeDocument(r?.AssumeRolePolicyDocument)); setModal("trust") }}>Edit trust policy</Button>}>
                    <PolicyDocumentView document={r?.AssumeRolePolicyDocument} />
                  </Section>
                ),
              },
              { id: "tags", label: "Tags", content: <TagsSection queryKey={["role", name]} list={async () => (await callAws<{ Tags?: Tag[] }>("iam", "ListRoleTags", { RoleName: name })).Tags ?? []} tag={(tags) => callAws("iam", "TagRole", { RoleName: name, Tags: tags })} untag={(keys) => callAws("iam", "UntagRole", { RoleName: name, TagKeys: keys })} /> },
              { id: "access_advisor", label: "Last Accessed", content: <Alert type="info">Service last accessed information is not tracked by the local emulator.</Alert> },
              {
                id: "revoke",
                label: "Revoke sessions",
                content: (
                  <Section title="Revoke active sessions" description="Revoking sessions denies all permissions to anyone who assumed this role before now. It attaches an inline policy named AWSRevokeOlderSessions.">
                    <Button onClick={() => setModal("revoke")}>Revoke active sessions</Button>
                  </Section>
                ),
              },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      <EditModal visible={modal === "attach"} size="max" title="Attach policy" saveLabel="Add permissions" saveDisabled={policies.length === 0} onDismiss={() => setModal(undefined)} success="Policies attached." onSave={async () => { await attachMany("Role", name, policies); refreshPerms() }}>
        <PolicyPicker selected={policies} onChange={setPolicies} exclude={(attached.data?.AttachedPolicies ?? []).map((p) => p.PolicyArn ?? "")} />
      </EditModal>
      <EditModal visible={modal === "boundary"} size="max" title="Set permissions boundary" saveLabel="Set boundary" saveDisabled={policies.length !== 1} onDismiss={() => setModal(undefined)} success="Permissions boundary set." onSave={async () => { await callAws("iam", "PutRolePermissionsBoundary", { RoleName: name, PermissionsBoundary: policies[0].Arn }); await role.refetch() }}>
        <PolicyPicker selected={policies} onChange={(items) => setPolicies(items.slice(-1))} />
      </EditModal>
      <EditModal visible={modal === "trust"} size="large" title="Edit trust policy" saveLabel="Update policy" onDismiss={() => setModal(undefined)} success="Trust policy updated." onSave={async () => { await callAws("iam", "UpdateAssumeRolePolicy", { RoleName: name, PolicyDocument: JSON.stringify(JSON.parse(trustDraft)) }); await role.refetch() }}>
        <JsonField value={trustDraft} onChange={setTrustDraft} rows={18} />
      </EditModal>
      <EditModal visible={modal === "edit"} title="Edit role" onDismiss={() => setModal(undefined)} success="Role updated." onSave={async () => { await callAws("iam", "UpdateRole", { RoleName: name, Description: edit.description, MaxSessionDuration: Number(edit.duration) }); await role.refetch() }}>
        <FormField label="Description"><Textarea value={edit.description} onChange={({ detail }) => setEdit({ ...edit, description: detail.value })} /></FormField>
        <FormField label="Maximum session duration">
          <Select selectedOption={{ value: edit.duration, label: `${Number(edit.duration) / 3600} hour${Number(edit.duration) > 3600 ? "s" : ""}` }} onChange={({ detail }) => setEdit({ ...edit, duration: detail.selectedOption.value ?? "3600" })} options={[1, 2, 4, 8, 12].map((h) => ({ value: String(h * 3600), label: `${h} hour${h > 1 ? "s" : ""}` }))} />
        </FormField>
      </EditModal>
      <EditModal visible={modal === "revoke"} title="Revoke active sessions?" saveLabel="Revoke active sessions" onDismiss={() => setModal(undefined)} success="Active sessions revoked." onSave={async () => { await callAws("iam", "PutRolePolicy", { RoleName: name, PolicyName: "AWSRevokeOlderSessions", PolicyDocument: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Deny", Action: ["*"], Resource: ["*"], Condition: { DateLessThan: { "aws:TokenIssueTime": new Date().toISOString() } } }] }) }); refreshPerms() }}>
        <Box>Anyone who assumed this role before now loses all permissions granted by it.</Box>
      </EditModal>
      <EditModal visible={modal === "delete"} title={`Delete ${name}?`} saveLabel="Delete" onDismiss={() => setModal(undefined)} success={`Role ${name} deleted.`} onSave={async () => { await deleteRole(name); router.push("/iam/roles") }}>
        <Box>Deleting the role detaches all its policies. This can&apos;t be undone.</Box>
      </EditModal>
    </IamLayout>
  )
}
