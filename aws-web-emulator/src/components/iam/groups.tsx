"use client"

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
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal } from "@/components/console/sections"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { IamLayout } from "@/components/iam/iam-app"
import { PermissionsTable, PolicyPicker, age, attachMany, errorMessage, flash, useList, type Attached, type Policy } from "@/components/iam/shared"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type Group = { GroupName?: string; GroupId?: string; Arn?: string; Path?: string; CreateDate?: string }
type User = { UserName?: string; Arn?: string; CreateDate?: string }
type Row = Group & { users: number; permissions: number }

const groupHref = (name?: string) => `/iam/groups/details/${encodeURIComponent(name ?? "")}`

export async function deleteGroup(name: string) {
  const g = { GroupName: name }
  const [info, attached, inline] = await Promise.all([
    callAws<{ Users?: User[] }>("iam", "GetGroup", g),
    callAws<{ AttachedPolicies?: Attached[] }>("iam", "ListAttachedGroupPolicies", g),
    callAws<{ PolicyNames?: string[] }>("iam", "ListGroupPolicies", g),
  ])
  for (const u of info.Users ?? []) await callAws("iam", "RemoveUserFromGroup", { ...g, UserName: u.UserName })
  for (const p of attached.AttachedPolicies ?? []) await callAws("iam", "DetachGroupPolicy", { ...g, PolicyArn: p.PolicyArn })
  for (const p of inline.PolicyNames ?? []) await callAws("iam", "DeleteGroupPolicy", { ...g, PolicyName: p })
  await callAws("iam", "DeleteGroup", g)
}

export function GroupsPage() {
  const follow = useFollow()
  const groups = useList<Group>("ListGroups", "Groups")
  const rows = useQuery({
    queryKey: ["emulator", "iam", "group-rows", groups.data?.map((g) => g.GroupName)],
    enabled: Boolean(groups.data),
    queryFn: () =>
      Promise.all(
        (groups.data ?? []).map(async (g): Promise<Row> => {
          const [info, attached, inline] = await Promise.all([
            callAws<{ Users?: User[] }>("iam", "GetGroup", { GroupName: g.GroupName }),
            callAws<{ AttachedPolicies?: Attached[] }>("iam", "ListAttachedGroupPolicies", { GroupName: g.GroupName }),
            callAws<{ PolicyNames?: string[] }>("iam", "ListGroupPolicies", { GroupName: g.GroupName }),
          ])
          return { ...g, users: info.Users?.length ?? 0, permissions: (attached.AttachedPolicies?.length ?? 0) + (inline.PolicyNames?.length ?? 0) }
        }),
      ),
  })
  const [selected, setSelected] = useState<Row[]>([])
  const [deleting, setDeleting] = useState(false)
  const [confirm, setConfirm] = useState("")
  const refresh = async () => { await groups.refetch(); await rows.refetch() }
  return (
    <IamLayout breadcrumbs={[{ text: "User groups", href: "/iam/groups" }]} contentType="table">
      <ResourceTable<Row>
        title="User groups"
        description="A user group is a collection of IAM users. Use groups to specify permissions for a collection of users."
        items={rows.data ?? []}
        loading={groups.isPending || rows.isPending}
        loadingText="Loading user groups"
        error={groups.error ?? rows.error}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="GroupName"
        filterPlaceholder="Search"
        columns={[
          { id: "name", header: "Group name", value: (g) => g.GroupName, cell: (g) => <Link href={groupHref(g.GroupName)} onFollow={follow}>{g.GroupName}</Link> },
          { id: "users", header: "Users", value: (g) => g.users, cell: (g) => String(g.users) },
          { id: "permissions", header: "Permissions", value: (g) => g.permissions, cell: (g) => (g.permissions ? "Defined" : "Not defined") },
          { id: "created", header: "Creation time", value: (g) => g.CreateDate, cell: (g) => age(g.CreateDate) },
        ]}
        empty={<EmptyState title="No resources to display" subtitle="" action={<Button href="/iam/groups/create" onFollow={follow}>Create group</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={rows.isFetching} onClick={() => void refresh()} />
            <Button disabled={selected.length === 0} onClick={() => { setConfirm(""); setDeleting(true) }}>Delete</Button>
            <Button variant="primary" href="/iam/groups/create" onFollow={follow}>Create group</Button>
          </SpaceBetween>
        }
      />
      <EditModal visible={deleting} title={`Delete ${selected.length === 1 ? selected[0].GroupName : `${selected.length} groups`}?`} saveLabel="Delete" saveDisabled={confirm !== (selected.length === 1 ? selected[0].GroupName : "delete")} onDismiss={() => setDeleting(false)} success="User groups deleted." onSave={async () => { for (const g of selected) await deleteGroup(g.GroupName ?? ""); setSelected([]); await refresh() }}>
        <Alert type="warning">Deleting a user group removes its users and detaches its policies. Users in the group lose the permissions granted by the group.</Alert>
        <FormField label={<>To confirm deletion, enter <i>{selected.length === 1 ? selected[0].GroupName : "delete"}</i>.</>}><Input value={confirm} onChange={({ detail }) => setConfirm(detail.value)} /></FormField>
      </EditModal>
    </IamLayout>
  )
}

export function CreateGroupPage() {
  const router = useRouter()
  const follow = useFollow()
  const users = useList<User>("ListUsers", "Users")
  const [name, setName] = useState("")
  const [members, setMembers] = useState<User[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const create = async () => {
    setSaving(true)
    setError(undefined)
    try {
      await callAws("iam", "CreateGroup", { GroupName: name })
      for (const u of members) await callAws("iam", "AddUserToGroup", { GroupName: name, UserName: u.UserName })
      await attachMany("Group", name, policies)
      flash.success(`${name} user group created.`)
      router.push("/iam/groups")
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  return (
    <IamLayout breadcrumbs={[{ text: "User groups", href: "/iam/groups" }, { text: "Create user group", href: "#" }]} contentType="form">
      <ContentLayout header={<Header variant="h1">Create user group</Header>}>
        <Form
          errorText={error}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" href="/iam/groups" onFollow={follow}>Cancel</Button>
              <Button variant="primary" loading={saving} disabled={!name} onClick={() => void create()}>Create user group</Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Name the group</Header>}>
              <FormField label="User group name" description="Enter a meaningful name to identify this group." constraintText="Maximum 128 characters. Use alphanumeric and '+=,.@-_' characters."><Input value={name} placeholder="Enter a meaningful name to identify this group" onChange={({ detail }) => setName(detail.value)} /></FormField>
            </Container>
            <Table<User>
              header={<Header variant="h2" counter={`(${members.length}/${users.data?.length ?? 0})`} description="An IAM user is an entity that you create in AWS to represent the person or application that uses it to interact with AWS.">Add users to the group - <i>Optional</i></Header>}
              items={users.data ?? []}
              loading={users.isPending}
              selectionType="multi"
              selectedItems={members}
              onSelectionChange={({ detail }) => setMembers(detail.selectedItems)}
              trackBy="UserName"
              columnDefinitions={[{ id: "name", header: "User name", cell: (u) => u.UserName }, { id: "created", header: "Creation time", cell: (u) => age(u.CreateDate) }]}
              empty={<Box textAlign="center">No users</Box>}
            />
            <Container header={<Header variant="h2" description="You can attach up to 10 policies to this user group. All the users in this group will have permissions that are defined in the selected policies.">Attach permissions policies - <i>Optional</i></Header>}>
              <PolicyPicker selected={policies} onChange={setPolicies} />
            </Container>
          </SpaceBetween>
        </Form>
      </ContentLayout>
    </IamLayout>
  )
}

export function GroupDetailPage({ name, tab = "users" }: { name: string; tab?: string }) {
  const router = useRouter()
  const follow = useFollow()
  const group = useAws<{ Group?: Group; Users?: User[] }>("iam", "GetGroup", { GroupName: name })
  const attached = useAws<{ AttachedPolicies?: Attached[] }>("iam", "ListAttachedGroupPolicies", { GroupName: name })
  const inline = useAws<{ PolicyNames?: string[] }>("iam", "ListGroupPolicies", { GroupName: name })
  const allUsers = useList<User>("ListUsers", "Users")
  const [modal, setModal] = useState<string>()
  const [selected, setSelected] = useState<User[]>([])
  const [pick, setPick] = useState<User[]>([])
  const [policies, setPolicies] = useState<Policy[]>([])
  const [newName, setNewName] = useState(name)
  const g = group.data?.Group
  const members = group.data?.Users ?? []
  return (
    <IamLayout breadcrumbs={[{ text: "User groups", href: "/iam/groups" }, { text: name, href: groupHref(name) }]}>
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>} actions={<Button onClick={() => setModal("delete")}>Delete</Button>}>{name}</Header>}>
        <SpaceBetween size="l">
          {group.error && <Alert type="error">{errorMessage(group.error)}</Alert>}
          <Container header={<Header variant="h2" actions={<Button onClick={() => { setNewName(name); setModal("edit") }}>Edit</Button>}>Summary</Header>}>
            <KeyValuePairs columns={3} items={[{ label: "User group name", value: name }, { label: "Creation time", value: consoleDate(g?.CreateDate) }, { label: "ARN", value: <Copyable value={g?.Arn} /> }]} />
          </Container>
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => router.replace(`${groupHref(name)}?tab=${detail.activeTabId}`)}
            tabs={[
              {
                id: "users",
                label: `Users (${members.length})`,
                content: (
                  <Table<User>
                    header={
                      <Header
                        variant="h2"
                        counter={`(${members.length})`}
                        description="An IAM user is an entity that you create in AWS to represent the person or application that uses it to interact with AWS."
                        actions={
                          <SpaceBetween direction="horizontal" size="xs">
                            <Button disabled={selected.length === 0} onClick={async () => { for (const u of selected) await callAws("iam", "RemoveUserFromGroup", { GroupName: name, UserName: u.UserName }); flash.success("Users removed from group."); setSelected([]); void group.refetch() }}>Remove users</Button>
                            <Button variant="primary" onClick={() => { setPick([]); setModal("add") }}>Add users</Button>
                          </SpaceBetween>
                        }
                      >
                        Users in this group
                      </Header>
                    }
                    items={members}
                    selectionType="multi"
                    selectedItems={selected}
                    onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
                    trackBy="UserName"
                    columnDefinitions={[{ id: "name", header: "User name", cell: (u) => <Link href={`/iam/users/details/${encodeURIComponent(u.UserName ?? "")}`} onFollow={follow}>{u.UserName}</Link> }, { id: "created", header: "Creation time", cell: (u) => age(u.CreateDate) }]}
                    empty={<Box textAlign="center" color="inherit"><b>No resources to display</b><Box variant="p" color="inherit">No users in this group.</Box></Box>}
                  />
                ),
              },
              {
                id: "permissions",
                label: "Permissions",
                content: (
                  <PermissionsTable
                    attached={attached.data?.AttachedPolicies ?? []}
                    inline={inline.data?.PolicyNames ?? []}
                    loading={attached.isPending}
                    onAdd={() => { setPolicies([]); setModal("attach") }}
                    onDetach={(arn) => callAws("iam", "DetachGroupPolicy", { GroupName: name, PolicyArn: arn })}
                    onDeleteInline={(p) => callAws("iam", "DeleteGroupPolicy", { GroupName: name, PolicyName: p })}
                    getInline={async (p) => (await callAws<{ PolicyDocument?: string }>("iam", "GetGroupPolicy", { GroupName: name, PolicyName: p })).PolicyDocument}
                    putInline={(p, doc) => callAws("iam", "PutGroupPolicy", { GroupName: name, PolicyName: p, PolicyDocument: doc })}
                    refresh={() => { void attached.refetch(); void inline.refetch() }}
                  />
                ),
              },
              { id: "access_advisor", label: "Access Advisor", content: <Alert type="info">Service last accessed information is not tracked by the local emulator.</Alert> },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      <EditModal visible={modal === "add"} size="large" title="Add users to group" saveLabel="Add users" saveDisabled={pick.length === 0} onDismiss={() => setModal(undefined)} success="Users added to group." onSave={async () => { for (const u of pick) await callAws("iam", "AddUserToGroup", { GroupName: name, UserName: u.UserName }); await group.refetch() }}>
        <Table<User> variant="embedded" items={(allUsers.data ?? []).filter((u) => !members.some((m) => m.UserName === u.UserName))} selectionType="multi" selectedItems={pick} onSelectionChange={({ detail }) => setPick(detail.selectedItems)} trackBy="UserName" columnDefinitions={[{ id: "name", header: "User name", cell: (u) => u.UserName }, { id: "created", header: "Creation time", cell: (u) => age(u.CreateDate) }]} empty={<Box textAlign="center">No other users</Box>} />
      </EditModal>
      <EditModal visible={modal === "attach"} size="max" title="Attach permission policies" saveLabel="Attach policies" saveDisabled={policies.length === 0} onDismiss={() => setModal(undefined)} success="Policies attached." onSave={async () => { await attachMany("Group", name, policies); await attached.refetch() }}>
        <PolicyPicker selected={policies} onChange={setPolicies} exclude={(attached.data?.AttachedPolicies ?? []).map((p) => p.PolicyArn ?? "")} />
      </EditModal>
      <EditModal visible={modal === "edit"} title="Edit user group name" saveDisabled={!newName || newName === name} onDismiss={() => setModal(undefined)} success="User group renamed." onSave={async () => { await callAws("iam", "UpdateGroup", { GroupName: name, NewGroupName: newName }); router.push(groupHref(newName)) }}>
        <FormField label="User group name"><Input value={newName} onChange={({ detail }) => setNewName(detail.value)} /></FormField>
      </EditModal>
      <EditModal visible={modal === "delete"} title={`Delete ${name}?`} saveLabel="Delete" onDismiss={() => setModal(undefined)} success={`${name} deleted.`} onSave={async () => { await deleteGroup(name); router.push("/iam/groups") }}>
        <Box>Deleting the group removes its {members.length} user(s) from the group and detaches its policies.</Box>
      </EditModal>
    </IamLayout>
  )
}
