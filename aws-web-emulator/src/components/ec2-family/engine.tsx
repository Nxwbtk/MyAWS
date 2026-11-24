"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown, { type ButtonDropdownProps } from "@cloudscape-design/components/button-dropdown"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import SplitPanel from "@cloudscape-design/components/split-panel"
import StatusIndicator, { type StatusIndicatorProps } from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { errorMessage, flash, Notifications } from "@/components/console/flash"
import { EmptyState, ResourceTable, type Column } from "@/components/console/resource-table"
import { EditModal } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { PageLayout, ServiceNavigation, useFollow, type Crumb } from "@/components/shell/page-layout"
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import { callAws, isAvailable, unavailableReason } from "@/lib/aws"
import { copyText } from "@/lib/format"

export type Item = Record<string, unknown>
export type AwsTag = { Key?: string; Value?: string }

export const nameTag = (item: Item) => ((item.Tags as AwsTag[] | undefined) ?? []).find((tag) => tag.Key === "Name")?.Value

export function dash(value: unknown): ReactNode {
  if (value === undefined || value === null || value === "") return "–"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return String(value)
}

const stateTypes: Record<string, StatusIndicatorProps.Type> = {
  available: "success", active: "success", running: "success", attached: "success", associated: "success", completed: "success", "in-use": "success", enabled: "success", ok: "success",
  pending: "pending", "pending-acceptance": "pending", provisioning: "pending", creating: "in-progress", attaching: "in-progress", associating: "in-progress", modifying: "in-progress", "pending-accept": "pending",
  deleting: "in-progress", detaching: "in-progress", "shutting-down": "in-progress", stopping: "in-progress",
  deleted: "stopped", detached: "stopped", stopped: "stopped", terminated: "stopped", rejected: "error", failed: "error", expired: "stopped", blackhole: "error", disabled: "stopped",
}

export function State({ value }: { value?: unknown }) {
  if (!value) return <>–</>
  const text = String(value)
  return <StatusIndicator type={stateTypes[text.toLowerCase()] ?? "info"}>{text.charAt(0).toUpperCase() + text.slice(1)}</StatusIndicator>
}

export function Copyable({ value }: { value?: string }) {
  if (!value) return <>–</>
  return (
    <span className="myaws-object-name">
      <Button variant="inline-icon" iconName="copy" ariaLabel={`Copy ${value}`} onClick={() => { void copyText(value); flash.success(`Copied ${value}`) }} />
      {value}
    </span>
  )
}

export type Ctx = { refresh: () => Promise<unknown>; router: ReturnType<typeof useRouter>; base: string }

export type Field = {
  id?: string
  label: string
  value: (item: Item, ctx: Ctx) => ReactNode
  sort?: (item: Item) => string | number | undefined
}

export type Action = {
  id: string
  text: string
  operation?: string
  /** Whether the action applies to the selection. */
  enabled?: (items: Item[]) => boolean
  /** Runs the action directly. */
  run?: (items: Item[], ctx: Ctx) => Promise<unknown>
  /** Renders a modal; call close() when done. */
  modal?: (props: { items: Item[]; close: () => void; ctx: Ctx }) => ReactNode
  /** Navigates to a page. */
  href?: (items: Item[]) => string
  success?: (items: Item[]) => string
  group?: string
}

export type ResourceDef = {
  path: string
  title: string
  singular: string
  description?: ReactNode
  operation: string
  model?: string
  input?: Record<string, unknown>
  items: (page: Item) => Item[]
  key: (item: Item) => string
  display?: (item: Item) => string
  columns: (Field & { id: string })[]
  details: Field[]
  detailColumns?: number
  tabs?: { id: string; label: string; render: (item: Item, ctx: Ctx) => ReactNode }[]
  actions?: Action[]
  create?: { label: string; href: string }
  deleteAction?: { operation: string; input: (item: Item) => Record<string, unknown>; warning?: ReactNode }
  tagResource?: boolean
  noDetailPage?: boolean
  filterPlaceholder?: string
  empty?: string
  headerExtra?: ReactNode
  readOnlyReason?: string
  /** Extra dropdown menus shown before Actions, such as Instance state. */
  menus?: { label: string; actions: Action[] }[]
  /** Index of the column that links to the details page. */
  linkColumn?: number
}

export function useResources(def: ResourceDef, input?: Record<string, unknown>) {
  const model = def.model ?? "ec2"
  const available = isAvailable(model, def.operation)
  const query = useQuery({
    queryKey: ["emulator", "aws", model, def.operation, "all", input ?? def.input ?? {}],
    enabled: available,
    // Poll while any resource is in a transitional state, as the console does.
    refetchInterval: (query) => (/"(pending|stopping|shutting-down|creating|deleting|attaching|detaching|modifying|associating|provisioning|initiating|enabling|disabling)"/i.test(JSON.stringify(query.state.data ?? [])) ? 4000 : false),
    queryFn: async () => {
      const all: Item[] = []
      let token: string | undefined
      do {
        const page = await callAws<Item>(model, def.operation, { ...(def.input ?? {}), ...(input ?? {}), ...(token ? { NextToken: token } : {}) })
        all.push(...def.items(page))
        token = page.NextToken as string | undefined
      } while (token && all.length < 2000)
      return all
    },
  })
  return { ...query, available, unavailable: unavailableReason(model, def.operation) }
}

function useCtx(base: string): Ctx {
  const client = useQueryClient()
  const router = useRouter()
  return { refresh: () => client.invalidateQueries({ queryKey: ["emulator"] }), router, base }
}

export function ConsoleLayout({
  serviceName,
  serviceHref,
  nav,
  activeHref,
  breadcrumbs,
  children,
  splitPanel,
  contentType,
}: {
  serviceName: string
  serviceHref: string
  nav: SideNavigationProps.Item[]
  activeHref: string
  breadcrumbs: Crumb[]
  children: ReactNode
  splitPanel?: ReactNode
  contentType?: "default" | "table" | "form" | "wizard" | "dashboard" | "cards"
}) {
  return (
    <PageLayout
      breadcrumbs={breadcrumbs}
      contentType={contentType}
      notifications={<Notifications />}
      splitPanel={splitPanel}
      navigation={<ServiceNavigation header={{ text: serviceName, href: serviceHref }} items={nav} activeHref={activeHref} />}
      content={children}
    />
  )
}

function actionItems(def: ResourceDef, selected: Item[], only?: Action[]): ButtonDropdownProps.ItemOrGroup[] {
  const model = def.model ?? "ec2"
  const all: Action[] = only ?? [
    ...(def.actions ?? []),
    ...(def.tagResource !== false ? [{ id: "__tags", text: "Manage tags", enabled: (items: Item[]) => items.length === 1 } as Action] : []),
    ...(def.deleteAction ? [{ id: "__delete", text: `Delete ${def.singular}`, operation: def.deleteAction.operation, enabled: (items: Item[]) => items.length >= 1 } as Action] : []),
  ]
  const toItem = (action: Action): ButtonDropdownProps.Item => {
    const missing = action.operation && !isAvailable(model, action.operation)
    const disabled = Boolean(missing) || !(action.enabled ?? ((items) => items.length === 1))(selected)
    return {
      id: action.id,
      text: action.text,
      disabled,
      disabledReason: missing ? unavailableReason(model, action.operation!) : undefined,
    }
  }
  const groups = new Map<string, Action[]>()
  const flat: ButtonDropdownProps.ItemOrGroup[] = []
  for (const action of all) {
    if (action.group) {
      if (!groups.has(action.group)) {
        groups.set(action.group, [])
        flat.push({ id: `group:${action.group}`, text: action.group, items: [] })
      }
      groups.get(action.group)!.push(action)
    } else flat.push(toItem(action))
  }
  return flat.map((entry) =>
    "items" in entry && entry.id?.startsWith("group:")
      ? { ...entry, items: groups.get(entry.text ?? "")!.map(toItem) }
      : entry,
  )
}

function allActions(def: ResourceDef) {
  return [...(def.actions ?? []), ...(def.menus ?? []).flatMap((menu) => menu.actions)]
}

function ActionHost({
  def,
  active,
  items,
  close,
  ctx,
}: {
  def: ResourceDef
  active?: string
  items: Item[]
  close: () => void
  ctx: Ctx
}) {
  if (!active) return null
  if (active === "__tags") return <ManageTagsModal resourceId={def.key(items[0])} tags={((items[0].Tags as AwsTag[]) ?? []).map((tag) => ({ Key: tag.Key ?? "", Value: tag.Value }))} close={close} ctx={ctx} />
  if (active === "__delete" && def.deleteAction)
    return <DeleteModal def={def} items={items} close={close} ctx={ctx} />
  const action = allActions(def).find((item) => item.id === active)
  if (action?.modal) return <>{action.modal({ items, close, ctx })}</>
  return null
}

async function runAction(def: ResourceDef, id: string, items: Item[], ctx: Ctx, open: (id: string) => void) {
  if (id === "__tags" || id === "__delete") return open(id)
  const action = allActions(def).find((item) => item.id === id)
  if (!action) return
  if (action.href) return ctx.router.push(action.href(items))
  if (action.modal) return open(id)
  if (action.run) {
    try {
      await action.run(items, ctx)
      await ctx.refresh()
      flash.success(action.success?.(items) ?? `${action.text} succeeded.`)
    } catch (error) {
      flash.error(errorMessage(error))
    }
  }
}

export function ResourceListPage({
  def,
  layout,
  input,
}: {
  def: ResourceDef
  layout: (props: { children: ReactNode; splitPanel?: ReactNode; breadcrumbs: Crumb[] }) => ReactNode
  input?: Record<string, unknown>
}) {
  const follow = useFollow()
  const base = def.path
  const ctx = useCtx(base)
  const resources = useResources(def, input)
  const [selected, setSelected] = useState<Item[]>([])
  const [active, setActive] = useState<string>()
  const items = resources.data ?? []
  // Selection holds snapshots; act on the latest copy of each selected resource.
  const fresh = selected.map((sel) => items.find((item) => def.key(item) === def.key(sel)) ?? sel)
  const current = fresh.length === 1 ? fresh[0] : undefined

  const columns: Column<Item>[] = def.columns.map((field, index) => ({
    id: field.id,
    header: field.label,
    value: field.sort ?? ((item) => {
      const value = field.value(item, ctx)
      return typeof value === "string" || typeof value === "number" ? value : undefined
    }),
    cell: (item) =>
      index === (def.linkColumn ?? 1) && !def.noDetailPage ? (
        <Link href={`${base}/${encodeURIComponent(def.key(item))}`} onFollow={follow}>
          {field.value(item, ctx)}
        </Link>
      ) : (
        field.value(item, ctx)
      ),
  }))

  const splitPanel = current ? (
    <SplitPanel
      header={`${def.key(current)}${nameTag(current) ? ` / ${nameTag(current)}` : ""}`}
      hidePreferencesButton
      i18nStrings={{
        preferencesTitle: "Split panel preferences",
        preferencesPositionLabel: "Split panel position",
        preferencesPositionDescription: "Choose the default split panel position for the service.",
        preferencesPositionSide: "Side",
        preferencesPositionBottom: "Bottom",
        preferencesConfirm: "Confirm",
        preferencesCancel: "Cancel",
        closeButtonAriaLabel: "Close panel",
        openButtonAriaLabel: "Open panel",
        resizeHandleAriaLabel: "Resize split panel",
      }}
    >
      <DetailTabs def={def} item={current} ctx={ctx} />
    </SplitPanel>
  ) : (
    <SplitPanel header={`Select a ${def.singular} above`} hidePreferencesButton i18nStrings={{ closeButtonAriaLabel: "Close panel", openButtonAriaLabel: "Open panel", resizeHandleAriaLabel: "Resize split panel", preferencesTitle: "", preferencesPositionLabel: "", preferencesPositionDescription: "", preferencesPositionSide: "", preferencesPositionBottom: "", preferencesConfirm: "", preferencesCancel: "" }}>
      <Box textAlign="center" color="text-body-secondary">Select a {def.singular} to see its details.</Box>
    </SplitPanel>
  )

  return layout({
    breadcrumbs: [{ text: def.title, href: base }],
    splitPanel,
    children: (
      <>
        {resources.available ? null : <Alert type="info">{resources.unavailable}</Alert>}
        <ResourceTable<Item>
          title={def.title}
          description={def.description}
          items={items}
          loading={resources.isPending && resources.fetchStatus !== "idle"}
          loadingText={`Loading ${def.title.toLowerCase()}`}
          error={resources.error}
          selectionType="multi"
          selectedItems={selected}
          onSelectionChange={setSelected}
          trackBy={def.key}
          filterPlaceholder={def.filterPlaceholder ?? "Find resources by attribute or tag"}
          columns={columns}
          defaultSort={def.columns[def.linkColumn ?? 1]?.id}
          empty={
            <EmptyState
              title={def.empty ?? `No ${def.title.toLowerCase()} found`}
              subtitle="No items found"
              action={def.create ? <Button href={def.create.href} onFollow={follow}>{def.create.label}</Button> : undefined}
            />
          }
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Refresh" loading={resources.isFetching} onClick={() => void resources.refetch()} />
              {def.headerExtra}
              {def.menus?.map((menu) => (
                <ButtonDropdown key={menu.label} items={actionItems(def, fresh, menu.actions)} onItemClick={({ detail }) => void runAction(def, detail.id, fresh, ctx, setActive)}>
                  {menu.label}
                </ButtonDropdown>
              ))}
              {(def.actions?.length || def.deleteAction || def.tagResource !== false) && (
                <ButtonDropdown items={actionItems(def, fresh)} onItemClick={({ detail }) => void runAction(def, detail.id, fresh, ctx, setActive)}>
                  Actions
                </ButtonDropdown>
              )}
              {def.create && (
                <Button variant="primary" href={def.create.href} onFollow={follow} disabled={Boolean(def.readOnlyReason)} disabledReason={def.readOnlyReason}>
                  {def.create.label}
                </Button>
              )}
            </SpaceBetween>
          }
        />
        <ActionHost def={def} active={active} items={fresh} close={() => { setActive(undefined) }} ctx={ctx} />
      </>
    ),
  }) as React.ReactElement
}

function DetailTabs({ def, item, ctx }: { def: ResourceDef; item: Item; ctx: Ctx }) {
  return (
    <Tabs
      tabs={[
        {
          id: "details",
          label: "Details",
          content: (
            <KeyValuePairs
              columns={def.detailColumns ?? 4}
              items={def.details.map((field) => ({ label: field.label, value: field.value(item, ctx) }))}
            />
          ),
        },
        ...(def.tabs ?? []).map((tab) => ({ id: tab.id, label: tab.label, content: tab.render(item, ctx) })),
        ...(def.tagResource !== false ? [{ id: "tags", label: "Tags", content: <TagsTab item={item} resourceId={def.key(item)} ctx={ctx} /> }] : []),
      ]}
    />
  )
}

export function ResourceDetailPage({
  def,
  id,
  layout,
}: {
  def: ResourceDef
  id: string
  layout: (props: { children: ReactNode; breadcrumbs: Crumb[] }) => ReactNode
}) {
  const ctx = useCtx(def.path)
  const resources = useResources(def)
  const item = resources.data?.find((entry) => def.key(entry) === id)
  const [active, setActive] = useState<string>()
  const title = item ? (def.display ? def.display(item) || id : `${id}${nameTag(item) ? ` / ${nameTag(item)}` : ""}`) : id
  return layout({
    breadcrumbs: [{ text: def.title, href: def.path }, { text: id, href: `${def.path}/${encodeURIComponent(id)}` }],
    children: (
      <ContentLayout
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            actions={
              item && (
                <SpaceBetween direction="horizontal" size="xs">
                {def.menus?.map((menu) => (
                  <ButtonDropdown key={menu.label} items={actionItems(def, [item], menu.actions)} onItemClick={({ detail }) => void runAction(def, detail.id, [item], ctx, setActive)}>
                    {menu.label}
                  </ButtonDropdown>
                ))}
                <ButtonDropdown items={actionItems(def, [item])} onItemClick={({ detail }) => void runAction(def, detail.id, [item], ctx, setActive)}>
                  Actions
                </ButtonDropdown>
                </SpaceBetween>
              )
            }
          >
            {title}
          </Header>
        }
      >
        {resources.isPending ? (
          <StatusIndicator type="loading">Loading</StatusIndicator>
        ) : !item ? (
          <Alert type="error" header={`${def.singular} not found`}>
            {id} doesn&apos;t exist in the local emulator.
          </Alert>
        ) : (
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Details</Header>}>
              <KeyValuePairs columns={def.detailColumns ?? 4} items={def.details.map((field) => ({ label: field.label, value: field.value(item, ctx) }))} />
            </Container>
            {((def.tabs?.length ?? 0) > 0 || def.tagResource !== false) && (
              <Tabs
                tabs={[
                  ...(def.tabs ?? []).map((tab) => ({ id: tab.id, label: tab.label, content: tab.render(item, ctx) })),
                  ...(def.tagResource !== false ? [{ id: "tags", label: "Tags", content: <TagsTab item={item} resourceId={def.key(item)} ctx={ctx} /> }] : []),
                ]}
              />
            )}
          </SpaceBetween>
        )}
        {item && (
          <ActionHost
            def={def}
            active={active}
            items={[item]}
            close={() => setActive(undefined)}
            ctx={{ ...ctx, refresh: async () => { await ctx.refresh(); if (active === "__delete") ctx.router.push(def.path) } }}
          />
        )}
      </ContentLayout>
    ),
  }) as React.ReactElement
}

export function TagsTab({ item, resourceId, ctx }: { item: Item; resourceId: string; ctx: Ctx }) {
  const [open, setOpen] = useState(false)
  const tags = ((item.Tags as AwsTag[]) ?? []).map((tag) => ({ Key: tag.Key ?? "", Value: tag.Value }))
  return (
    <ResourceTableLite
      title="Tags"
      items={tags}
      columns={[
        { id: "key", header: "Key", cell: (tag: Tag) => tag.Key },
        { id: "value", header: "Value", cell: (tag: Tag) => tag.Value || "–" },
      ]}
      actions={<Button onClick={() => setOpen(true)}>Manage tags</Button>}
      empty="No tags"
      footer={open && <ManageTagsModal resourceId={resourceId} tags={tags} close={() => setOpen(false)} ctx={ctx} />}
    />
  )
}


export function ResourceTableLite<T>({
  title,
  items,
  columns,
  actions,
  empty = "No items",
  footer,
  description,
}: {
  title: string
  items: T[]
  columns: { id: string; header: string; cell: (item: T) => ReactNode }[]
  actions?: ReactNode
  empty?: string
  footer?: ReactNode
  description?: ReactNode
}) {
  return (
    <>
      <Table
        variant="container"
        header={<Header variant="h2" counter={`(${items.length})`} actions={actions} description={description}>{title}</Header>}
        items={items}
        columnDefinitions={columns}
        empty={<Box textAlign="center" color="inherit"><b>{empty}</b></Box>}
      />
      {footer}
    </>
  )
}

export function ManageTagsModal({ resourceId, tags, close, ctx }: { resourceId: string; tags: Tag[]; close: () => void; ctx: Ctx }) {
  const [value, setValue] = useState<Tag[]>(tags.filter((tag) => !tag.Key.startsWith("aws:")))
  return (
    <EditModal
      visible
      size="large"
      title="Manage tags"
      onDismiss={close}
      success={`Successfully updated tags for ${resourceId}.`}
      onSave={async () => {
        const next = value.filter((tag) => tag.Key)
        const removed = tags.filter((tag) => !tag.Key.startsWith("aws:") && !next.some((item) => item.Key === tag.Key))
        if (removed.length) await callAws("ec2", "DeleteTags", { Resources: [resourceId], Tags: removed.map((tag) => ({ Key: tag.Key })) })
        if (next.length) await callAws("ec2", "CreateTags", { Resources: [resourceId], Tags: next.map((tag) => ({ Key: tag.Key, Value: tag.Value ?? "" })) })
        await ctx.refresh()
      }}
    >
      <Box variant="small">A tag is a label that you assign to an AWS resource. Each tag consists of a key and an optional value.</Box>
      <TagEditor tags={value} onChange={setValue} />
    </EditModal>
  )
}

function DeleteModal({ def, items, close, ctx }: { def: ResourceDef; items: Item[]; close: () => void; ctx: Ctx }) {
  const [confirm, setConfirm] = useState("")
  return (
    <EditModal
      visible
      title={`Delete ${def.singular}`}
      saveLabel="Delete"
      saveDisabled={confirm !== "delete"}
      onDismiss={close}
      success={`Successfully deleted ${items.map(def.key).join(", ")}.`}
      onSave={async () => {
        for (const item of items) await callAws(def.model ?? "ec2", def.deleteAction!.operation, def.deleteAction!.input(item))
        await ctx.refresh()
      }}
    >
      <Box>Are you sure that you want to delete {items.length === 1 ? <b>{def.key(items[0])}</b> : `${items.length} ${def.title.toLowerCase()}`}?</Box>
      {def.deleteAction?.warning && <Alert type="warning">{def.deleteAction.warning}</Alert>}
      <FormField label={<>To confirm deletion, type <i>delete</i> in the field.</>}>
        <Input value={confirm} placeholder="delete" onChange={({ detail }) => setConfirm(detail.value)} />
      </FormField>
    </EditModal>
  )
}

/** A modal that runs one AWS call built from a small form. */
export function OperationModal({
  title,
  close,
  ctx,
  run,
  saveLabel = "Save",
  success,
  children,
  size,
}: {
  title: string
  close: () => void
  ctx: Ctx
  run: () => Promise<unknown>
  saveLabel?: string
  success?: string
  children: ReactNode
  size?: "small" | "medium" | "large" | "max"
}) {
  return (
    <EditModal visible title={title} size={size} saveLabel={saveLabel} success={success} onDismiss={close} onSave={async () => { await run(); await ctx.refresh() }}>
      {children}
    </EditModal>
  )
}
