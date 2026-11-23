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
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Tiles from "@cloudscape-design/components/tiles"
import Wizard from "@cloudscape-design/components/wizard"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, Section } from "@/components/console/sections"
import { TagEditor } from "@/components/console/tag-editor"
import { Copyable } from "@/components/ec2-family/engine"
import { downloadText } from "@/components/ec2/key-pair-modal"
import { useFollow } from "@/components/shell/page-layout"
import { IamLayout } from "@/components/iam/iam-app"
import { PermissionsTable, PolicyPicker, TagsSection, age, attachMany, errorMessage, flash, useList, type Attached, type Policy, type Tag } from "@/components/iam/shared"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type User = { UserName?: string; UserId?: string; Arn?: string; Path?: string; CreateDate?: string; PasswordLastUsed?: string; PermissionsBoundary?: { PermissionsBoundaryArn?: string } }
type Group = { GroupName?: string; Arn?: string; CreateDate?: string }
type AccessKey = { AccessKeyId?: string; Status?: string; CreateDate?: string }
type Row = User & { groups: number; keys: AccessKey[]; mfa: number; login?: { CreateDate?: string } }

const userHref = (name?: string, tab?: string) => `/iam/users/details/${encodeURIComponent(name ?? "")}${tab ? `?tab=${tab}` : ""}`

function useUserRows() {
  const users = useList<User>("ListUsers", "Users")
  const rows = useQuery({
    queryKey: ["emulator", "iam", "user-rows", users.data?.map((u) => u.UserName)],
    enabled: Boolean(users.data),
    queryFn: () =>
      Promise.all(
        (users.data ?? []).map(async (u): Promise<Row> => {
          const [groups, keys, mfa, login] = await Promise.all([
            callAws<{ Groups?: Group[] }>("iam", "ListGroupsForUser", { UserName: u.UserName }).catch(() => ({ Groups: [] })),
            callAws<{ AccessKeyMetadata?: AccessKey[] }>("iam", "ListAccessKeys", { UserName: u.UserName }).catch(() => ({ AccessKeyMetadata: [] })),
            callAws<{ MFADevices?: unknown[] }>("iam", "ListMFADevices", { UserName: u.UserName }).catch(() => ({ MFADevices: [] })),
            callAws<{ LoginProfile?: { CreateDate?: string } }>("iam", "GetLoginProfile", { UserName: u.UserName }).catch(() => ({ LoginProfile: undefined })),
          ])
          return { ...u, groups: groups.Groups?.length ?? 0, keys: keys.AccessKeyMetadata ?? [], mfa: mfa.MFADevices?.length ?? 0, login: login.LoginProfile }
        }),
      ),
  })
  return { ...rows, isPending: users.isPending || rows.isPending, error: users.error ?? rows.error, refetchAll: async () => { await users.refetch(); await rows.refetch() } }
}

export function UsersPage() {
  const follow = useFollow()
  const users = useUserRows()
  const [selected, setSelected] = useState<Row[]>([])
  const [deleting, setDeleting] = useState(false)
  return (
    <IamLayout breadcrumbs={[{ text: "Users", href: "/iam/users" }]} contentType="table">
      <ResourceTable<Row>
        title="Users"
        description="An IAM user is an identity with long-term credentials that is used to interact with AWS in an account."
        items={users.data ?? []}
        loading={users.isPending}
        loadingText="Loading users"
        error={users.error}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="UserName"
        filterPlaceholder="Search"
        columns={[
          { id: "name", header: "User name", value: (u) => u.UserName, cell: (u) => <Link href={userHref(u.UserName)} onFollow={follow}>{u.UserName}</Link> },
          { id: "path", header: "Path", value: (u) => u.Path, cell: (u) => u.Path },
          { id: "groups", header: "Groups", value: (u) => u.groups, cell: (u) => String(u.groups) },
          { id: "activity", header: "Last activity", value: (u) => u.PasswordLastUsed, cell: (u) => (u.PasswordLastUsed ? age(u.PasswordLastUsed) : "–") },
          { id: "mfa", header: "MFA", value: (u) => u.mfa, cell: (u) => (u.mfa ? "Virtual" : "–") },
          { id: "password", header: "Password age", value: (u) => u.login?.CreateDate, cell: (u) => (u.login ? age(u.login.CreateDate) : "–") },
          { id: "signin", header: "Console last sign-in", value: (u) => u.PasswordLastUsed, cell: (u) => (u.login ? (u.PasswordLastUsed ? consoleDate(u.PasswordLastUsed) : "Never") : "–") },
          { id: "key", header: "Access key ID", value: (u) => u.keys[0]?.AccessKeyId, cell: (u) => (u.keys.length ? u.keys.map((k) => `${k.Status === "Active" ? "Active" : "Inactive"} - ${k.AccessKeyId}`).join(", ") : "–") },
          { id: "keyage", header: "Active key age", value: (u) => u.keys.find((k) => k.Status === "Active")?.CreateDate, cell: (u) => age(u.keys.find((k) => k.Status === "Active")?.CreateDate) },
          { id: "arn", header: "ARN", value: (u) => u.Arn, cell: (u) => u.Arn },
          { id: "created", header: "Creation time", value: (u) => u.CreateDate, cell: (u) => age(u.CreateDate) },
        ]}
        empty={<EmptyState title="No resources to display" subtitle="" action={<Button href="/iam/users/create" onFollow={follow}>Create user</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={users.isFetching} onClick={() => void users.refetchAll()} />
            <Button disabled={selected.length === 0} onClick={() => setDeleting(true)}>Delete</Button>
            <Button variant="primary" href="/iam/users/create" onFollow={follow}>Create user</Button>
          </SpaceBetween>
        }
      />
      {deleting && <DeleteUsersModal users={selected.map((u) => u.UserName ?? "")} close={() => setDeleting(false)} onDone={() => { setSelected([]); void users.refetchAll() }} />}
    </IamLayout>
  )
}

/** Deletes users the way the console does: removes credentials, group memberships and policies first. */
export async function deleteUser(name: string) {
  const user = { UserName: name }
  const [keys, groups, attached, inline, mfa, ssh, certs, creds] = await Promise.all([
    callAws<{ AccessKeyMetadata?: AccessKey[] }>("iam", "ListAccessKeys", user),
    callAws<{ Groups?: Group[] }>("iam", "ListGroupsForUser", user),
    callAws<{ AttachedPolicies?: Attached[] }>("iam", "ListAttachedUserPolicies", user),
    callAws<{ PolicyNames?: string[] }>("iam", "ListUserPolicies", user),
    callAws<{ MFADevices?: { SerialNumber?: string }[] }>("iam", "ListMFADevices", user),
    callAws<{ SSHPublicKeys?: { SSHPublicKeyId?: string }[] }>("iam", "ListSSHPublicKeys", user).catch(() => ({ SSHPublicKeys: [] })),
    callAws<{ Certificates?: { CertificateId?: string }[] }>("iam", "ListSigningCertificates", user).catch(() => ({ Certificates: [] })),
    callAws<{ ServiceSpecificCredentials?: { ServiceSpecificCredentialId?: string }[] }>("iam", "ListServiceSpecificCredentials", user).catch(() => ({ ServiceSpecificCredentials: [] })),
  ])
  await callAws("iam", "DeleteLoginProfile", user).catch(() => undefined)
  for (const k of keys.AccessKeyMetadata ?? []) await callAws("iam", "DeleteAccessKey", { ...user, AccessKeyId: k.AccessKeyId })
  for (const g of groups.Groups ?? []) await callAws("iam", "RemoveUserFromGroup", { ...user, GroupName: g.GroupName })
  for (const p of attached.AttachedPolicies ?? []) await callAws("iam", "DetachUserPolicy", { ...user, PolicyArn: p.PolicyArn })
  for (const p of inline.PolicyNames ?? []) await callAws("iam", "DeleteUserPolicy", { ...user, PolicyName: p })
  for (const d of mfa.MFADevices ?? []) await callAws("iam", "DeactivateMFADevice", { ...user, SerialNumber: d.SerialNumber })
  for (const s of ssh.SSHPublicKeys ?? []) await callAws("iam", "DeleteSSHPublicKey", { ...user, SSHPublicKeyId: s.SSHPublicKeyId })
  for (const c of certs.Certificates ?? []) await callAws("iam", "DeleteSigningCertificate", { ...user, CertificateId: c.CertificateId })
  for (const c of creds.ServiceSpecificCredentials ?? []) await callAws("iam", "DeleteServiceSpecificCredential", { ...user, ServiceSpecificCredentialId: c.ServiceSpecificCredentialId })
  await callAws("iam", "DeleteUser", user)
}

function DeleteUsersModal({ users, close, onDone }: { users: string[]; close: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState("")
  return (
    <EditModal visible title={`Delete ${users.length === 1 ? users[0] : `${users.length} users`}?`} saveLabel="Delete user" saveDisabled={confirm !== (users.length === 1 ? users[0] : "confirm")} onDismiss={close} success={`${users.join(", ")} deleted.`} onSave={async () => { for (const u of users) await deleteUser(u); onDone() }}>
      <Alert type="warning">Deleting a user permanently removes the user, their credentials, and their group memberships. This can&apos;t be undone.</Alert>
      <FormField label={<>To confirm deletion, enter <i>{users.length === 1 ? users[0] : "confirm"}</i> in the text input field.</>}><Input value={confirm} onChange={({ detail }) => setConfirm(detail.value)} /></FormField>
    </EditModal>
  )
}

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()_+-="
  const values = crypto.getRandomValues(new Uint32Array(16))
  return Array.from(values, (v) => chars[v % chars.length]).join("")
}

export function CreateUserPage() {
  const router = useRouter()
  const follow = useFollow()
  const groups = useList<Group>("ListGroups", "Groups")
  const users = useList<User>("ListUsers", "Users")
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [console_, setConsole] = useState(false)
  const [pwMode, setPwMode] = useState("auto")
  const [custom, setCustom] = useState("")
  const [reset, setReset] = useState(true)
  const [mode, setMode] = useState("group")
  const [selectedGroups, setSelectedGroups] = useState<Group[]>([])
  const [copyFrom, setCopyFrom] = useState<User[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [created, setCreated] = useState<{ password?: string }>()

  const create = async () => {
    setSaving(true)
    setError(undefined)
    try {
      const valid = tags.filter((t) => t.Key)
      await callAws("iam", "CreateUser", { UserName: name, ...(valid.length ? { Tags: valid.map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) } : {}) })
      let password: string | undefined
      if (console_) {
        password = pwMode === "auto" ? randomPassword() : custom
        await callAws("iam", "CreateLoginProfile", { UserName: name, Password: password, PasswordResetRequired: reset })
      }
      if (mode === "group") for (const g of selectedGroups) await callAws("iam", "AddUserToGroup", { UserName: name, GroupName: g.GroupName })
      if (mode === "copy" && copyFrom[0]) {
        const src = { UserName: copyFrom[0].UserName }
        const [g, a] = await Promise.all([callAws<{ Groups?: Group[] }>("iam", "ListGroupsForUser", src), callAws<{ AttachedPolicies?: Attached[] }>("iam", "ListAttachedUserPolicies", src)])
        for (const x of g.Groups ?? []) await callAws("iam", "AddUserToGroup", { UserName: name, GroupName: x.GroupName })
        for (const x of a.AttachedPolicies ?? []) await callAws("iam", "AttachUserPolicy", { UserName: name, PolicyArn: x.PolicyArn })
      }
      if (mode === "attach") await attachMany("User", name, policies)
      if (console_) setCreated({ password })
      else {
        flash.success(`User ${name} created successfully.`)
        router.push(userHref(name))
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  if (created) {
    const url = "https://000000000000.signin.aws.amazon.com/console"
    return (
      <IamLayout breadcrumbs={[{ text: "Users", href: "/iam/users" }, { text: "Create user", href: "#" }]} contentType="form">
        <ContentLayout header={<Header variant="h1">Retrieve password</Header>}>
          <SpaceBetween size="l">
            <Alert type="success" header="User created successfully">You can view and download the user&apos;s password and email instructions for signing in to the AWS Management Console.</Alert>
            <Container header={<Header variant="h2">Console sign-in details</Header>}>
              <KeyValuePairs columns={3} items={[{ label: "Console sign-in URL", value: <Copyable value={url} /> }, { label: "User name", value: <Copyable value={name} /> }, { label: "Console password", value: <Copyable value={created.password} /> }]} />
            </Container>
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="download" onClick={() => downloadText(`${name}_credentials.csv`, `User name,Password,Console sign-in URL\n${name},${created.password},${url}\n`)}>Download .csv file</Button>
              <Button variant="primary" href="/iam/users" onFollow={follow}>Return to users list</Button>
            </SpaceBetween>
          </SpaceBetween>
        </ContentLayout>
      </IamLayout>
    )
  }

  return (
    <IamLayout breadcrumbs={[{ text: "Users", href: "/iam/users" }, { text: "Create user", href: "#" }]} contentType="wizard">
      <Wizard
        activeStepIndex={step}
        isLoadingNextStep={saving}
        onNavigate={({ detail }) => { if (detail.requestedStepIndex > 0 && !name) return setError("User name is required."); setError(undefined); setStep(detail.requestedStepIndex) }}
        onCancel={() => router.push("/iam/users")}
        onSubmit={() => void create()}
        submitButtonText="Create user"
        i18nStrings={{ stepNumberLabel: (n) => `Step ${n}`, collapsedStepsLabel: (n, c) => `Step ${n} of ${c}`, cancelButton: "Cancel", previousButton: "Previous", nextButton: "Next", optional: "optional" }}
        steps={[
          {
            title: "Specify user details",
            errorText: error,
            content: (
              <Container header={<Header variant="h2">User details</Header>}>
                <SpaceBetween size="l">
                  <FormField label="User name" constraintText="The user name can have up to 64 characters. Valid characters: A-Z, a-z, 0-9, and + = , . @ _ - (hyphen)"><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
                  <Checkbox checked={console_} onChange={({ detail }) => setConsole(detail.checked)} description="If you're providing console access to a person, it's a best practice to manage their access in IAM Identity Center.">Provide user access to the AWS Management Console - <i>optional</i></Checkbox>
                  {console_ && (
                    <>
                      <FormField label="Console password">
                        <RadioGroup value={pwMode} onChange={({ detail }) => setPwMode(detail.value)} items={[{ value: "auto", label: "Autogenerated password", description: "You can view the password after you create the user." }, { value: "custom", label: "Custom password", description: "Enter a custom password for the user." }]} />
                      </FormField>
                      {pwMode === "custom" && <Input type="password" value={custom} onChange={({ detail }) => setCustom(detail.value)} />}
                      <Checkbox checked={reset} onChange={({ detail }) => setReset(detail.checked)} description="Users automatically get the IAMUserChangePassword policy to allow them to change their own password.">Users must create a new password at next sign-in - Recommended</Checkbox>
                    </>
                  )}
                </SpaceBetween>
              </Container>
            ),
          },
          {
            title: "Set permissions",
            description: "Add user to an existing group or create a new one. Using groups is a best-practice way to manage user's permissions by job functions.",
            content: (
              <SpaceBetween size="l">
                <Container header={<Header variant="h2">Permissions options</Header>}>
                  <Tiles
                    value={mode}
                    onChange={({ detail }) => setMode(detail.value)}
                    columns={3}
                    items={[
                      { value: "group", label: "Add user to group", description: "Add user to an existing group, or create a new group. We recommend using groups to manage user permissions by job function." },
                      { value: "copy", label: "Copy permissions", description: "Copy all group memberships, attached managed policies, and inline policies from an existing user." },
                      { value: "attach", label: "Attach policies directly", description: "Attach a managed policy directly to a user. As a best practice, we recommend attaching policies to a group instead." },
                    ]}
                  />
                </Container>
                {mode === "group" && (
                  <Table<Group>
                    header={<Header counter={`(${groups.data?.length ?? 0})`} actions={<Button href="/iam/groups/create" onFollow={follow}>Create group</Button>}>User groups</Header>}
                    items={groups.data ?? []}
                    loading={groups.isPending}
                    selectionType="multi"
                    selectedItems={selectedGroups}
                    onSelectionChange={({ detail }) => setSelectedGroups(detail.selectedItems)}
                    trackBy="GroupName"
                    columnDefinitions={[{ id: "name", header: "Group name", cell: (g) => g.GroupName }, { id: "created", header: "Creation time", cell: (g) => age(g.CreateDate) }]}
                    empty={<Box textAlign="center" color="inherit"><b>No groups</b><Box variant="p" color="inherit">No user groups exist.</Box></Box>}
                  />
                )}
                {mode === "copy" && (
                  <Table<User>
                    header={<Header counter={`(${users.data?.length ?? 0})`}>Users</Header>}
                    items={users.data ?? []}
                    selectionType="single"
                    selectedItems={copyFrom}
                    onSelectionChange={({ detail }) => setCopyFrom(detail.selectedItems)}
                    trackBy="UserName"
                    columnDefinitions={[{ id: "name", header: "User name", cell: (u) => u.UserName }, { id: "created", header: "Creation time", cell: (u) => age(u.CreateDate) }]}
                  />
                )}
                {mode === "attach" && <Container><PolicyPicker selected={policies} onChange={setPolicies} /></Container>}
              </SpaceBetween>
            ),
          },
          {
            title: "Review and create",
            errorText: error,
            content: (
              <SpaceBetween size="l">
                <Container header={<Header variant="h2">User details</Header>}>
                  <KeyValuePairs columns={3} items={[{ label: "User name", value: name }, { label: "Console password type", value: console_ ? (pwMode === "auto" ? "Autogenerated" : "Custom password") : "None" }, { label: "Require password reset", value: console_ && reset ? "Yes" : "No" }]} />
                </Container>
                <Table
                  header={<Header variant="h2">Permissions summary</Header>}
                  items={mode === "group" ? selectedGroups.map((g) => ({ n: g.GroupName, t: "Group" })) : mode === "copy" ? copyFrom.map((u) => ({ n: u.UserName, t: "Copied from user" })) : policies.map((p) => ({ n: p.PolicyName, t: "Permissions policy" }))}
                  columnDefinitions={[{ id: "n", header: "Name", cell: (r) => r.n }, { id: "t", header: "Used as", cell: (r) => r.t }]}
                  empty={<Box textAlign="center">No permissions</Box>}
                />
                <Container header={<Header variant="h2" description="Tags are key-value pairs you can add to AWS resources to help identify, organize, or search for resources.">Tags - <i>optional</i></Header>}>
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

export function UserDetailPage({ name, tab = "permissions" }: { name: string; tab?: string }) {
  const router = useRouter()
  const user = useAws<{ User?: User }>("iam", "GetUser", { UserName: name })
  const login = useAws<{ LoginProfile?: { CreateDate?: string; PasswordResetRequired?: boolean } }>("iam", "GetLoginProfile", { UserName: name }, { retry: false })
  const keys = useAws<{ AccessKeyMetadata?: AccessKey[] }>("iam", "ListAccessKeys", { UserName: name })
  const [deleting, setDeleting] = useState(false)
  const u = user.data?.User
  const base = userHref(name)
  return (
    <IamLayout breadcrumbs={[{ text: "Users", href: "/iam/users" }, { text: name, href: base }]}>
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>} actions={<Button onClick={() => setDeleting(true)}>Delete</Button>}>{name}</Header>}>
        <SpaceBetween size="l">
          {user.error && <Alert type="error">{errorMessage(user.error)}</Alert>}
          <Container header={<Header variant="h2">Summary</Header>}>
            <KeyValuePairs
              columns={3}
              items={[
                { label: "ARN", value: <Copyable value={u?.Arn} /> },
                { label: "Console access", value: login.data?.LoginProfile ? <StatusIndicator type="success">Enabled without MFA</StatusIndicator> : "Disabled" },
                { label: "Access key 1", value: keys.data?.AccessKeyMetadata?.[0] ? `${keys.data.AccessKeyMetadata[0].AccessKeyId} - ${keys.data.AccessKeyMetadata[0].Status}` : <Link href={`${base}?tab=security_credentials`} onFollow={(e) => { e.preventDefault(); router.replace(`${base}?tab=security_credentials`) }}>Create access key</Link> },
                { label: "Created", value: consoleDate(u?.CreateDate) },
                { label: "Last console sign-in", value: u?.PasswordLastUsed ? consoleDate(u.PasswordLastUsed) : login.data?.LoginProfile ? "Never" : "–" },
                { label: "Access key 2", value: keys.data?.AccessKeyMetadata?.[1] ? `${keys.data.AccessKeyMetadata[1].AccessKeyId} - ${keys.data.AccessKeyMetadata[1].Status}` : "–" },
              ]}
            />
          </Container>
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => router.replace(`${base}?tab=${detail.activeTabId}`)}
            tabs={[
              { id: "permissions", label: "Permissions", content: <UserPermissions name={name} boundary={u?.PermissionsBoundary?.PermissionsBoundaryArn} refreshUser={() => void user.refetch()} /> },
              { id: "groups", label: "Groups", content: <UserGroups name={name} /> },
              { id: "tags", label: "Tags", content: <TagsSection queryKey={["user", name]} list={async () => (await callAws<{ Tags?: Tag[] }>("iam", "ListUserTags", { UserName: name })).Tags ?? []} tag={(tags) => callAws("iam", "TagUser", { UserName: name, Tags: tags })} untag={(keys) => callAws("iam", "UntagUser", { UserName: name, TagKeys: keys })} /> },
              { id: "security_credentials", label: "Security credentials", content: <SecurityCredentials name={name} login={login.data?.LoginProfile} refreshLogin={() => void login.refetch()} keys={keys.data?.AccessKeyMetadata ?? []} refreshKeys={() => void keys.refetch()} /> },
              { id: "access_advisor", label: "Last Accessed", content: <Alert type="info">Service last accessed information is not tracked by the local emulator.</Alert> },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      {deleting && <DeleteUsersModal users={[name]} close={() => setDeleting(false)} onDone={() => router.push("/iam/users")} />}
    </IamLayout>
  )
}

function UserPermissions({ name, boundary, refreshUser }: { name: string; boundary?: string; refreshUser: () => void }) {
  const attached = useAws<{ AttachedPolicies?: Attached[] }>("iam", "ListAttachedUserPolicies", { UserName: name })
  const inline = useAws<{ PolicyNames?: string[] }>("iam", "ListUserPolicies", { UserName: name })
  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState<Policy[]>([])
  const [boundaryOpen, setBoundaryOpen] = useState(false)
  const [boundaryPick, setBoundaryPick] = useState<Policy[]>([])
  const refresh = () => { void attached.refetch(); void inline.refetch() }
  return (
    <SpaceBetween size="l">
      <PermissionsTable
        attached={attached.data?.AttachedPolicies ?? []}
        inline={inline.data?.PolicyNames ?? []}
        loading={attached.isPending}
        onAdd={() => { setPicked([]); setAdding(true) }}
        onDetach={(arn) => callAws("iam", "DetachUserPolicy", { UserName: name, PolicyArn: arn })}
        onDeleteInline={(p) => callAws("iam", "DeleteUserPolicy", { UserName: name, PolicyName: p })}
        getInline={async (p) => (await callAws<{ PolicyDocument?: string }>("iam", "GetUserPolicy", { UserName: name, PolicyName: p })).PolicyDocument}
        putInline={(p, doc) => callAws("iam", "PutUserPolicy", { UserName: name, PolicyName: p, PolicyDocument: doc })}
        refresh={refresh}
      />
      <Section
        title="Permissions boundary"
        description="Set a permissions boundary to control the maximum permissions for this user."
        actions={boundary ? <Button onClick={async () => { await callAws("iam", "DeleteUserPermissionsBoundary", { UserName: name }); flash.success("Permissions boundary removed."); refreshUser() }}>Remove boundary</Button> : <Button onClick={() => setBoundaryOpen(true)}>Set permissions boundary</Button>}
        items={[{ label: "Permissions boundary", value: boundary ?? "(not set)" }]}
      />
      <EditModal visible={adding} size="max" title="Add permissions" saveLabel="Add permissions" saveDisabled={picked.length === 0} onDismiss={() => setAdding(false)} success="Policies attached." onSave={async () => { await attachMany("User", name, picked); refresh() }}>
        <PolicyPicker selected={picked} onChange={setPicked} exclude={(attached.data?.AttachedPolicies ?? []).map((p) => p.PolicyArn ?? "")} />
      </EditModal>
      <EditModal visible={boundaryOpen} size="max" title="Set permissions boundary" saveLabel="Set boundary" saveDisabled={boundaryPick.length !== 1} onDismiss={() => setBoundaryOpen(false)} success="Permissions boundary set." onSave={async () => { await callAws("iam", "PutUserPermissionsBoundary", { UserName: name, PermissionsBoundary: boundaryPick[0].Arn }); refreshUser() }}>
        <PolicyPicker selected={boundaryPick} onChange={(items) => setBoundaryPick(items.slice(-1))} />
      </EditModal>
    </SpaceBetween>
  )
}

function UserGroups({ name }: { name: string }) {
  const follow = useFollow()
  const groups = useAws<{ Groups?: Group[] }>("iam", "ListGroupsForUser", { UserName: name })
  const all = useList<Group>("ListGroups", "Groups")
  const [selected, setSelected] = useState<Group[]>([])
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<Group[]>([])
  const mine = groups.data?.Groups ?? []
  return (
    <>
      <Table<Group>
        header={
          <Header
            variant="h2"
            counter={`(${mine.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={selected.length === 0} onClick={async () => { for (const g of selected) await callAws("iam", "RemoveUserFromGroup", { UserName: name, GroupName: g.GroupName }); flash.success("Removed from groups."); setSelected([]); void groups.refetch() }}>Remove</Button>
                <Button variant="primary" onClick={() => { setPick([]); setOpen(true) }}>Add user to groups</Button>
              </SpaceBetween>
            }
          >
            User groups membership
          </Header>
        }
        items={mine}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        trackBy="GroupName"
        columnDefinitions={[{ id: "name", header: "Group name", cell: (g) => <Link href={`/iam/groups/details/${encodeURIComponent(g.GroupName ?? "")}`} onFollow={follow}>{g.GroupName}</Link> }, { id: "attached", header: "Attached policies", cell: () => "–" }]}
        empty={<Box textAlign="center" color="inherit"><b>No groups</b><Box variant="p" color="inherit">This user is not a member of any groups.</Box></Box>}
      />
      <EditModal visible={open} size="large" title="Add user to groups" saveLabel="Add user to group(s)" saveDisabled={pick.length === 0} onDismiss={() => setOpen(false)} success="User added to groups." onSave={async () => { for (const g of pick) await callAws("iam", "AddUserToGroup", { UserName: name, GroupName: g.GroupName }); await groups.refetch() }}>
        <Table<Group>
          variant="embedded"
          items={(all.data ?? []).filter((g) => !mine.some((m) => m.GroupName === g.GroupName))}
          selectionType="multi"
          selectedItems={pick}
          onSelectionChange={({ detail }) => setPick(detail.selectedItems)}
          trackBy="GroupName"
          columnDefinitions={[{ id: "name", header: "Group name", cell: (g) => g.GroupName }, { id: "created", header: "Creation time", cell: (g) => age(g.CreateDate) }]}
          empty={<Box textAlign="center">No other groups</Box>}
        />
      </EditModal>
    </>
  )
}

function SecurityCredentials({ name, login, refreshLogin, keys, refreshKeys }: { name: string; login?: { CreateDate?: string; PasswordResetRequired?: boolean }; refreshLogin: () => void; keys: AccessKey[]; refreshKeys: () => void }) {
  const mfa = useAws<{ MFADevices?: { SerialNumber?: string; EnableDate?: string }[] }>("iam", "ListMFADevices", { UserName: name })
  const ssh = useAws<{ SSHPublicKeys?: { SSHPublicKeyId?: string; Status?: string; UploadDate?: string }[] }>("iam", "ListSSHPublicKeys", { UserName: name })
  const certs = useAws<{ Certificates?: { CertificateId?: string; Status?: string; UploadDate?: string }[] }>("iam", "ListSigningCertificates", { UserName: name })
  const creds = useAws<{ ServiceSpecificCredentials?: { ServiceSpecificCredentialId?: string; ServiceName?: string; ServiceUserName?: string; Status?: string; CreateDate?: string }[] }>("iam", "ListServiceSpecificCredentials", { UserName: name })
  const [modal, setModal] = useState<string>()
  const [password, setPassword] = useState({ mode: "auto", value: "", reset: true })
  const [newKey, setNewKey] = useState<{ AccessKeyId?: string; SecretAccessKey?: string }>()
  const [sshBody, setSshBody] = useState("")
  const [certBody, setCertBody] = useState("")
  const [shownPassword, setShownPassword] = useState<string>()
  const [newCred, setNewCred] = useState<{ ServiceUserName?: string; ServicePassword?: string }>()

  return (
    <SpaceBetween size="l">
      <Section
        title="Console sign-in"
        actions={
          login ? (
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={async () => { await callAws("iam", "DeleteLoginProfile", { UserName: name }); flash.success("Console access disabled."); refreshLogin() }}>Disable console access</Button>
              <Button onClick={() => setModal("password")}>Manage console access</Button>
            </SpaceBetween>
          ) : (
            <Button onClick={() => setModal("password")}>Enable console access</Button>
          )
        }
        columns={2}
        items={[
          { label: "Console sign-in link", value: <Copyable value="https://000000000000.signin.aws.amazon.com/console" /> },
          { label: "Console password", value: login ? `Set ${consoleDate(login.CreateDate)}${login.PasswordResetRequired ? " (reset required)" : ""}` : "Not enabled" },
        ]}
      />
      <Table
        header={<Header variant="h2" counter={`(${mfa.data?.MFADevices?.length ?? 0})`} description="Use MFA to increase the security of your AWS environment. Signing in with MFA requires an authentication code from an MFA device." actions={<SpaceBetween direction="horizontal" size="xs"><Button disabled={!mfa.data?.MFADevices?.length} onClick={async () => { const d = mfa.data?.MFADevices?.[0]; await callAws("iam", "DeactivateMFADevice", { UserName: name, SerialNumber: d?.SerialNumber }); flash.success("MFA device removed."); void mfa.refetch() }}>Remove</Button><Button disabled disabledReason="Assigning an MFA device requires codes from a physical or authenticator device.">Assign MFA device</Button></SpaceBetween>}>Multi-factor authentication (MFA)</Header>}
        items={mfa.data?.MFADevices ?? []}
        columnDefinitions={[{ id: "type", header: "Type", cell: () => "Virtual" }, { id: "id", header: "Identifier", cell: (d) => d.SerialNumber }, { id: "created", header: "Created on", cell: (d) => consoleDate(d.EnableDate) }]}
        empty={<Box textAlign="center" color="inherit"><b>No MFA devices.</b><Box variant="p" color="inherit">Assign an MFA device to improve the security of your AWS environment.</Box></Box>}
      />
      <Table<AccessKey>
        header={
          <Header variant="h2" counter={`(${keys.length})`} description="Use access keys to send programmatic calls to AWS from the AWS CLI, AWS Tools for PowerShell, AWS SDKs, or direct AWS API calls. You can have a maximum of two access keys (active or inactive) at a time." actions={<Button disabled={keys.length >= 2} onClick={async () => { try { const r = await callAws<{ AccessKey?: { AccessKeyId?: string; SecretAccessKey?: string } }>("iam", "CreateAccessKey", { UserName: name }); setNewKey(r.AccessKey); refreshKeys() } catch (e) { flash.error(errorMessage(e)) } }}>Create access key</Button>}>
            Access keys
          </Header>
        }
        items={keys}
        columnDefinitions={[
          { id: "id", header: "Access key ID", cell: (k) => k.AccessKeyId },
          { id: "status", header: "Status", cell: (k) => (k.Status === "Active" ? <StatusIndicator type="success">Active</StatusIndicator> : <StatusIndicator type="stopped">Inactive</StatusIndicator>) },
          { id: "created", header: "Created", cell: (k) => age(k.CreateDate) },
          {
            id: "actions",
            header: "Actions",
            cell: (k) => (
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="inline-link" onClick={async () => { await callAws("iam", "UpdateAccessKey", { UserName: name, AccessKeyId: k.AccessKeyId, Status: k.Status === "Active" ? "Inactive" : "Active" }); refreshKeys() }}>{k.Status === "Active" ? "Deactivate" : "Activate"}</Button>
                <Button variant="inline-link" disabled={k.Status === "Active"} onClick={async () => { await callAws("iam", "DeleteAccessKey", { UserName: name, AccessKeyId: k.AccessKeyId }); flash.success(`Access key ${k.AccessKeyId} deleted.`); refreshKeys() }}>Delete</Button>
              </SpaceBetween>
            ),
          },
        ]}
        empty={<Box textAlign="center" color="inherit"><b>No access keys.</b><Box variant="p" color="inherit">As a best practice, avoid using long-term credentials like access keys.</Box></Box>}
      />
      <Table
        header={<Header variant="h2" counter={`(${ssh.data?.SSHPublicKeys?.length ?? 0})`} description="Use SSH public keys to authenticate access to AWS CodeCommit repositories." actions={<Button onClick={() => setModal("ssh")}>Upload SSH public key</Button>}>SSH public keys for AWS CodeCommit</Header>}
        items={ssh.data?.SSHPublicKeys ?? []}
        columnDefinitions={[{ id: "id", header: "SSH key ID", cell: (k) => k.SSHPublicKeyId }, { id: "status", header: "Status", cell: (k) => k.Status }, { id: "uploaded", header: "Uploaded", cell: (k) => consoleDate(k.UploadDate) }, { id: "a", header: "Actions", cell: (k) => <Button variant="inline-link" onClick={async () => { await callAws("iam", "DeleteSSHPublicKey", { UserName: name, SSHPublicKeyId: k.SSHPublicKeyId }); void ssh.refetch() }}>Delete</Button> }]}
        empty={<Box textAlign="center" color="inherit">No SSH public keys</Box>}
      />
      <Table
        header={<Header variant="h2" counter={`(${creds.data?.ServiceSpecificCredentials?.length ?? 0})`} description="Generate a user name and password you can use to authenticate HTTPS connections to AWS CodeCommit repositories." actions={<Button onClick={async () => { try { const r = await callAws<{ ServiceSpecificCredential?: { ServiceUserName?: string; ServicePassword?: string } }>("iam", "CreateServiceSpecificCredential", { UserName: name, ServiceName: "codecommit.amazonaws.com" }); setNewCred(r.ServiceSpecificCredential); void creds.refetch() } catch (e) { flash.error(errorMessage(e)) } }}>Generate credentials</Button>}>HTTPS Git credentials for AWS CodeCommit</Header>}
        items={creds.data?.ServiceSpecificCredentials ?? []}
        columnDefinitions={[{ id: "user", header: "User name", cell: (c) => c.ServiceUserName }, { id: "status", header: "Status", cell: (c) => c.Status }, { id: "created", header: "Created", cell: (c) => consoleDate(c.CreateDate) }, { id: "a", header: "Actions", cell: (c) => <Button variant="inline-link" onClick={async () => { await callAws("iam", "DeleteServiceSpecificCredential", { UserName: name, ServiceSpecificCredentialId: c.ServiceSpecificCredentialId }); void creds.refetch() }}>Delete</Button> }]}
        empty={<Box textAlign="center" color="inherit">No HTTPS Git credentials</Box>}
      />
      <Table
        header={<Header variant="h2" counter={`(${certs.data?.Certificates?.length ?? 0})`} description="Use X.509 certificates to make secure SOAP-protocol requests to some AWS services." actions={<Button onClick={() => setModal("cert")}>Upload X.509 certificate</Button>}>X.509 Signing certificates</Header>}
        items={certs.data?.Certificates ?? []}
        columnDefinitions={[{ id: "id", header: "Certificate ID", cell: (c) => c.CertificateId }, { id: "status", header: "Status", cell: (c) => c.Status }, { id: "uploaded", header: "Uploaded", cell: (c) => consoleDate(c.UploadDate) }, { id: "a", header: "Actions", cell: (c) => <Button variant="inline-link" onClick={async () => { await callAws("iam", "DeleteSigningCertificate", { UserName: name, CertificateId: c.CertificateId }); void certs.refetch() }}>Delete</Button> }]}
        empty={<Box textAlign="center" color="inherit">No X.509 signing certificates</Box>}
      />
      <EditModal
        visible={modal === "password"}
        title={login ? "Manage console access" : "Enable console access"}
        saveLabel="Apply"
        onDismiss={() => setModal(undefined)}
        success="Console access updated."
        onSave={async () => {
          const value = password.mode === "auto" ? randomPassword() : password.value
          await callAws("iam", login ? "UpdateLoginProfile" : "CreateLoginProfile", { UserName: name, Password: value, PasswordResetRequired: password.reset })
          if (password.mode === "auto") setShownPassword(value)
          refreshLogin()
        }}
      >
        <FormField label="Set password"><RadioGroup value={password.mode} onChange={({ detail }) => setPassword({ ...password, mode: detail.value })} items={[{ value: "auto", label: "Autogenerated password" }, { value: "custom", label: "Custom password" }]} /></FormField>
        {password.mode === "custom" && <Input type="password" value={password.value} onChange={({ detail }) => setPassword({ ...password, value: detail.value })} />}
        <Checkbox checked={password.reset} onChange={({ detail }) => setPassword({ ...password, reset: detail.checked })}>User must create a new password at next sign-in</Checkbox>
      </EditModal>
      <EditModal visible={modal === "ssh"} size="large" title="Upload SSH public key" saveLabel="Upload SSH public key" saveDisabled={!sshBody} onDismiss={() => setModal(undefined)} success="SSH public key uploaded." onSave={async () => { await callAws("iam", "UploadSSHPublicKey", { UserName: name, SSHPublicKeyBody: sshBody }); await ssh.refetch() }}>
        <FormField label="SSH public key" stretch><Input value={sshBody} placeholder="ssh-rsa AAAA..." onChange={({ detail }) => setSshBody(detail.value)} /></FormField>
      </EditModal>
      <EditModal visible={modal === "cert"} size="large" title="Upload X.509 certificate" saveLabel="Upload" saveDisabled={!certBody} onDismiss={() => setModal(undefined)} success="Certificate uploaded." onSave={async () => { await callAws("iam", "UploadSigningCertificate", { UserName: name, CertificateBody: certBody }); await certs.refetch() }}>
        <FormField label="Certificate body" stretch><Input value={certBody} placeholder="-----BEGIN CERTIFICATE-----" onChange={({ detail }) => setCertBody(detail.value)} /></FormField>
      </EditModal>
      <EditModal visible={Boolean(newKey)} size="large" title="Retrieve access keys" saveLabel="Done" onDismiss={() => setNewKey(undefined)} onSave={async () => undefined}>
        <Alert type="warning">This is the only time that the secret access key can be viewed or downloaded. You cannot recover it later.</Alert>
        <KeyValuePairs columns={2} items={[{ label: "Access key", value: <Copyable value={newKey?.AccessKeyId} /> }, { label: "Secret access key", value: <Copyable value={newKey?.SecretAccessKey} /> }]} />
        <Button iconName="download" onClick={() => downloadText(`${name}_accessKeys.csv`, `Access key ID,Secret access key\n${newKey?.AccessKeyId},${newKey?.SecretAccessKey}\n`)}>Download .csv file</Button>
      </EditModal>
      <EditModal visible={Boolean(shownPassword)} title="Console password" saveLabel="Close" onDismiss={() => setShownPassword(undefined)} onSave={async () => undefined}>
        <KeyValuePairs items={[{ label: "Console password", value: <Copyable value={shownPassword} /> }]} />
      </EditModal>
      <EditModal visible={Boolean(newCred)} title="Generated credentials" saveLabel="Close" onDismiss={() => setNewCred(undefined)} onSave={async () => undefined}>
        <KeyValuePairs columns={2} items={[{ label: "User name", value: <Copyable value={newCred?.ServiceUserName} /> }, { label: "Password", value: <Copyable value={newCred?.ServicePassword} /> }]} />
      </EditModal>
    </SpaceBetween>
  )
}
