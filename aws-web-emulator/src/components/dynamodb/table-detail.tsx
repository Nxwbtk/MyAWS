"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Tabs from "@cloudscape-design/components/tabs"
import Table from "@cloudscape-design/components/table"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { CodeView, EditModal, JsonField, Section, pretty } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { DdbLayout } from "@/components/dynamodb/ddb-app"
import { MetricGrid } from "@/components/cloudwatch/metrics"
import { KeyField } from "@/components/dynamodb/create-table"
import { bytes, capacityMode, keyOf, typeOf, useTable, type Index, type Table as TableT } from "@/components/dynamodb/shared"
import { DeleteTablesModal, TableStatus } from "@/components/dynamodb/tables"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

export function TableDetailPage({ name, tab }: { name: string; tab: string }) {
  const router = useRouter()
  const follow = useFollow()
  const table = useTable(name)
  const [modal, setModal] = useState<string>()
  const data = table.data ?? undefined
  const refresh = () => void table.refetch()
  return (
    <DdbLayout breadcrumbs={[{ text: "Tables", href: "/dynamodb/tables" }, { text: name, href: `/dynamodb/table/${encodeURIComponent(name)}` }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <ButtonDropdown
                  items={[
                    { id: "index", text: "Create index" },
                    { id: "replica", text: "Create replica", disabled: true, disabledReason: "Multi-Region replicas are not available in the local emulator." },
                    { id: "capacity", text: "Update capacity settings" },
                    { id: "export", text: "Export to S3" },
                    { id: "protection", text: data?.DeletionProtectionEnabled ? "Turn off deletion protection" : "Turn on deletion protection" },
                    { id: "delete", text: "Delete table" },
                  ]}
                  onItemClick={async ({ detail }) => {
                    if (detail.id === "export") router.push(`/dynamodb/exports?table=${encodeURIComponent(name)}`)
                    else if (detail.id === "protection") {
                      await callAws("dynamodb", "UpdateTable", { TableName: name, DeletionProtectionEnabled: !data?.DeletionProtectionEnabled }).then(
                        () => { flash.success(`Deletion protection updated for ${name}.`); refresh() },
                        (error) => flash.error(errorMessage(error)),
                      )
                    } else setModal(detail.id)
                  }}
                >
                  Actions
                </ButtonDropdown>
                <Button variant="primary" href={`/dynamodb/items?table=${encodeURIComponent(name)}`} onFollow={follow}>Explore table items</Button>
              </SpaceBetween>
            }
          >
            {name}
          </Header>
        }
      >
        {table.error ? (
          <Alert type="error">{errorMessage(table.error)}</Alert>
        ) : (
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => router.push(`/dynamodb/table/${encodeURIComponent(name)}?tab=${detail.activeTabId}`)}
            tabs={[
              { id: "overview", label: "Overview", content: <Overview table={data} /> },
              { id: "indexes", label: "Indexes", content: <Indexes table={data} onCreate={() => setModal("index")} refresh={refresh} /> },
              { id: "monitor", label: "Monitor", content: <MetricGrid namespace="AWS/DynamoDB" dimensions={[{ Name: "TableName", Value: name }]} metrics={[{ name: "ConsumedReadCapacityUnits", stat: "Sum", title: "Read usage (sum)" }, { name: "ConsumedWriteCapacityUnits", stat: "Sum", title: "Write usage (sum)" }, { name: "ReadThrottleEvents", stat: "Sum", title: "Read throttled requests" }, { name: "WriteThrottleEvents", stat: "Sum", title: "Write throttled requests" }]} /> },
              { id: "global", label: "Global tables", content: <Section title="Replicas" counter={`(${data?.Replicas?.length ?? 0})`}><Box color="text-status-inactive">Global table replicas are not available in the local emulator.</Box></Section> },
              { id: "backups", label: "Backups", content: <Backups table={data} /> },
              { id: "streams", label: "Exports and streams", content: <Streams table={data} refresh={refresh} /> },
              { id: "permissions", label: "Permissions", content: <Permissions table={data} /> },
              { id: "settings", label: "Additional settings", content: <AdditionalSettings table={data} refresh={refresh} onCapacity={() => setModal("capacity")} /> },
            ]}
          />
        )}
      </ContentLayout>
      {modal === "delete" && data && <DeleteTablesModal tables={[data]} close={() => setModal(undefined)} onDeleted={() => router.push("/dynamodb/tables")} />}
      {modal === "index" && data && <CreateIndexModal table={data} close={() => setModal(undefined)} onDone={refresh} />}
      {modal === "capacity" && data && <CapacityModal table={data} close={() => setModal(undefined)} onDone={refresh} />}
    </DdbLayout>
  )
}

function Overview({ table }: { table?: TableT }) {
  const count = useQuery({
    queryKey: ["emulator", "dynamodb", "count", table?.TableName],
    enabled: Boolean(table?.TableName),
    queryFn: async () => (await callAws<{ Count?: number; ScannedCount?: number }>("dynamodb", "Scan", { TableName: table?.TableName, Select: "COUNT" })).Count ?? 0,
  })
  const pitr = useAws<{ ContinuousBackupsDescription?: { PointInTimeRecoveryDescription?: { PointInTimeRecoveryStatus?: string } } }>("dynamodb", "DescribeContinuousBackups", { TableName: table?.TableName }, { enabled: Boolean(table?.TableName) })
  return (
    <SpaceBetween size="l">
      <Section
        title="General information"
        columns={4}
        items={[
          { label: "Partition key", value: `${keyOf(table, "HASH") ?? "–"} (${typeOf(table, keyOf(table, "HASH")) ?? ""})` },
          { label: "Sort key", value: keyOf(table, "RANGE") ? `${keyOf(table, "RANGE")} (${typeOf(table, keyOf(table, "RANGE"))})` : "–" },
          { label: "Capacity mode", value: capacityMode(table) },
          { label: "Table status", value: <TableStatus status={table?.TableStatus} /> },
          { label: "Alarms", value: <StatusIndicator type="success">No active alarms</StatusIndicator> },
          { label: "Point-in-time recovery (PITR)", value: pitr.data?.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus === "ENABLED" ? "On" : "Off" },
          { label: "Item count", value: count.isPending ? "…" : String(count.data ?? 0) },
          { label: "Table size", value: bytes(table?.TableSizeBytes) },
          { label: "Resource-based policy", value: "–" },
          { label: "Deletion protection", value: table?.DeletionProtectionEnabled ? "On" : "Off" },
          { label: "Amazon Resource Name (ARN)", value: table?.TableArn ?? "–" },
          { label: "Creation date", value: consoleDate(table?.CreationDateTime) },
        ]}
      />
      <Section title="Table capacity metrics"><MetricGrid namespace="AWS/DynamoDB" dimensions={[{ Name: "TableName", Value: table?.TableName ?? "" }]} metrics={[{ name: "ConsumedReadCapacityUnits", stat: "Sum", title: "Read capacity units" }, { name: "ConsumedWriteCapacityUnits", stat: "Sum", title: "Write capacity units" }]} /></Section>
    </SpaceBetween>
  )
}

function Indexes({ table, onCreate, refresh }: { table?: TableT; onCreate: () => void; refresh: () => void }) {
  const [selected, setSelected] = useState<Index[]>([])
  const items = [...(table?.GlobalSecondaryIndexes ?? [])]
  return (
    <Table
      header={
        <Header
          variant="h2"
          counter={`(${items.length})`}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                disabled={!selected[0]}
                onClick={async () => {
                  await callAws("dynamodb", "UpdateTable", { TableName: table?.TableName, GlobalSecondaryIndexUpdates: [{ Delete: { IndexName: selected[0].IndexName } }] }).then(
                    () => { flash.success(`Deleting index ${selected[0].IndexName}.`); setSelected([]); refresh() },
                    (error) => flash.error(errorMessage(error)),
                  )
                }}
              >
                Delete
              </Button>
              <Button onClick={onCreate}>Create index</Button>
            </SpaceBetween>
          }
        >
          Global secondary indexes
        </Header>
      }
      items={items}
      selectionType="single"
      selectedItems={selected}
      onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
      trackBy="IndexName"
      columnDefinitions={[
        { id: "name", header: "Name", cell: (i) => i.IndexName },
        { id: "status", header: "Status", cell: (i) => <TableStatus status={i.IndexStatus} /> },
        { id: "pk", header: "Partition key", cell: (i) => i.KeySchema?.find((k) => k.KeyType === "HASH")?.AttributeName },
        { id: "sk", header: "Sort key", cell: (i) => i.KeySchema?.find((k) => k.KeyType === "RANGE")?.AttributeName ?? "–" },
        { id: "projection", header: "Projected attributes", cell: (i) => i.Projection?.ProjectionType },
        { id: "size", header: "Size", cell: (i) => bytes(i.IndexSizeBytes) },
        { id: "items", header: "Item count", cell: (i) => i.ItemCount ?? 0 },
      ]}
      empty={<Box textAlign="center" color="inherit"><b>No global indexes</b><Box variant="p" color="inherit">You have not created any global indexes on this table.</Box><Button onClick={onCreate}>Create index</Button></Box>}
    />
  )
}

function CreateIndexModal({ table, close, onDone }: { table: TableT; close: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ pk: "", pkType: "S", sk: "", skType: "S", name: "", projection: "ALL" })
  return (
    <EditModal
      visible
      size="large"
      title="Create global secondary index"
      saveLabel="Create index"
      onDismiss={close}
      success="Index creation started."
      onSave={async () => {
        const provisioned = capacityMode(table) === "Provisioned"
        await callAws("dynamodb", "UpdateTable", {
          TableName: table.TableName,
          AttributeDefinitions: [{ AttributeName: form.pk, AttributeType: form.pkType }, ...(form.sk ? [{ AttributeName: form.sk, AttributeType: form.skType }] : [])],
          GlobalSecondaryIndexUpdates: [
            {
              Create: {
                IndexName: form.name || `${form.pk}${form.sk ? `-${form.sk}` : ""}-index`,
                KeySchema: [{ AttributeName: form.pk, KeyType: "HASH" }, ...(form.sk ? [{ AttributeName: form.sk, KeyType: "RANGE" }] : [])],
                Projection: { ProjectionType: form.projection },
                ...(provisioned ? { ProvisionedThroughput: table.ProvisionedThroughput } : {}),
              },
            },
          ],
        })
        onDone()
      }}
    >
      <KeyField label="Partition key" description="The partition key for the index." name={form.pk} type={form.pkType} onName={(pk) => setForm({ ...form, pk })} onType={(pkType) => setForm({ ...form, pkType })} />
      <KeyField label="Sort key" optional description="The sort key for the index." name={form.sk} type={form.skType} onName={(sk) => setForm({ ...form, sk })} onType={(skType) => setForm({ ...form, skType })} />
      <FormField label="Index name" constraintText="Leave empty to generate a name."><Input value={form.name} onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
      <FormField label="Attribute projections"><RadioGroup value={form.projection} onChange={({ detail }) => setForm({ ...form, projection: detail.value })} items={[{ value: "ALL", label: "All" }, { value: "KEYS_ONLY", label: "Only keys" }]} /></FormField>
    </EditModal>
  )
}

function CapacityModal({ table, close, onDone }: { table: TableT; close: () => void; onDone: () => void }) {
  const [mode, setMode] = useState(capacityMode(table) === "Provisioned" ? "PROVISIONED" : "PAY_PER_REQUEST")
  const [rcu, setRcu] = useState(String(table.ProvisionedThroughput?.ReadCapacityUnits || 5))
  const [wcu, setWcu] = useState(String(table.ProvisionedThroughput?.WriteCapacityUnits || 5))
  return (
    <EditModal
      visible
      title="Edit read/write capacity"
      onDismiss={close}
      success="Capacity settings updated."
      onSave={async () => {
        await callAws("dynamodb", "UpdateTable", { TableName: table.TableName, BillingMode: mode, ...(mode === "PROVISIONED" ? { ProvisionedThroughput: { ReadCapacityUnits: Number(rcu), WriteCapacityUnits: Number(wcu) } } : {}) })
        onDone()
      }}
    >
      <FormField label="Capacity mode"><RadioGroup value={mode} onChange={({ detail }) => setMode(detail.value)} items={[{ value: "PAY_PER_REQUEST", label: "On-demand" }, { value: "PROVISIONED", label: "Provisioned" }]} /></FormField>
      {mode === "PROVISIONED" && (
        <SpaceBetween direction="horizontal" size="l">
          <FormField label="Read capacity units"><Input type="number" value={rcu} onChange={({ detail }) => setRcu(detail.value)} /></FormField>
          <FormField label="Write capacity units"><Input type="number" value={wcu} onChange={({ detail }) => setWcu(detail.value)} /></FormField>
        </SpaceBetween>
      )}
    </EditModal>
  )
}

function Backups({ table }: { table?: TableT }) {
  const name = table?.TableName
  const pitr = useAws<{ ContinuousBackupsDescription?: { PointInTimeRecoveryDescription?: { PointInTimeRecoveryStatus?: string; EarliestRestorableDateTime?: string; LatestRestorableDateTime?: string } } }>("dynamodb", "DescribeContinuousBackups", { TableName: name }, { enabled: Boolean(name) })
  const backups = useAws<{ BackupSummaries?: { BackupName?: string; BackupArn?: string; BackupStatus?: string; BackupCreationDateTime?: string; BackupSizeBytes?: number; BackupType?: string }[] }>("dynamodb", "ListBackups", { TableName: name }, { enabled: Boolean(name) })
  const status = pitr.data?.ContinuousBackupsDescription?.PointInTimeRecoveryDescription
  const [open, setOpen] = useState(false)
  return (
    <SpaceBetween size="l">
      <Section
        title="Point-in-time recovery (PITR)"
        description="Point-in-time recovery provides continuous backups of your DynamoDB data for 35 days to help you protect against accidental write or deletes."
        onEdit={() => setOpen(true)}
        columns={3}
        items={[
          { label: "Status", value: status?.PointInTimeRecoveryStatus === "ENABLED" ? <StatusIndicator type="success">On</StatusIndicator> : "Off" },
          { label: "Earliest restore date", value: consoleDate(status?.EarliestRestorableDateTime) },
          { label: "Latest restore date", value: consoleDate(status?.LatestRestorableDateTime) },
        ]}
      />
      <Table
        header={
          <Header
            variant="h2"
            counter={`(${backups.data?.BackupSummaries?.length ?? 0})`}
            actions={
              <Button
                onClick={async () => {
                  await callAws("dynamodb", "CreateBackup", { TableName: name, BackupName: `${name}-${Date.now()}` }).then(
                    () => { flash.success(`Backup of ${name} was created.`); void backups.refetch() },
                    (error) => flash.error(errorMessage(error)),
                  )
                }}
              >
                Create backup
              </Button>
            }
          >
            Backups
          </Header>
        }
        items={backups.data?.BackupSummaries ?? []}
        columnDefinitions={[
          { id: "name", header: "Backup name", cell: (b) => b.BackupName },
          { id: "status", header: "Status", cell: (b) => <TableStatus status={b.BackupStatus} /> },
          { id: "created", header: "Creation time", cell: (b) => consoleDate(b.BackupCreationDateTime) },
          { id: "size", header: "Size", cell: (b) => bytes(b.BackupSizeBytes) },
          { id: "type", header: "Backup type", cell: (b) => b.BackupType },
        ]}
        empty={<Box textAlign="center" color="inherit"><b>No backups</b></Box>}
      />
      <EditModal
        visible={open}
        title="Edit point-in-time recovery"
        onDismiss={() => setOpen(false)}
        success="Point-in-time recovery updated."
        onSave={async () => {
          await callAws("dynamodb", "UpdateContinuousBackups", { TableName: name, PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: status?.PointInTimeRecoveryStatus !== "ENABLED" } })
          await pitr.refetch()
        }}
      >
        <Box>{status?.PointInTimeRecoveryStatus === "ENABLED" ? "Turn off point-in-time recovery?" : "Turn on point-in-time recovery to keep continuous backups for 35 days."}</Box>
      </EditModal>
    </SpaceBetween>
  )
}

function Streams({ table, refresh }: { table?: TableT; refresh: () => void }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState("NEW_AND_OLD_IMAGES")
  const enabled = table?.StreamSpecification?.StreamEnabled
  const kinesis = useAws<{ KinesisDataStreamDestinations?: { StreamArn?: string; DestinationStatus?: string }[] }>("dynamodb", "DescribeKinesisStreamingDestination", { TableName: table?.TableName }, { enabled: Boolean(table?.TableName) })
  return (
    <SpaceBetween size="l">
      <Section
        title="DynamoDB stream details"
        description="Capture item-level changes in your table, and push the changes to a DynamoDB stream."
        actions={
          enabled ? (
            <Button
              onClick={async () => {
                await callAws("dynamodb", "UpdateTable", { TableName: table?.TableName, StreamSpecification: { StreamEnabled: false } }).then(() => { flash.success("DynamoDB stream turned off."); refresh() }, (error) => flash.error(errorMessage(error)))
              }}
            >
              Turn off
            </Button>
          ) : (
            <Button onClick={() => setOpen(true)}>Turn on</Button>
          )
        }
        columns={3}
        items={[
          { label: "Status", value: enabled ? <StatusIndicator type="success">On</StatusIndicator> : "Off" },
          { label: "View type", value: table?.StreamSpecification?.StreamViewType ?? "–" },
          { label: "Latest stream ARN", value: table?.LatestStreamArn ?? "–" },
        ]}
      />
      <Section title="Amazon Kinesis data stream details" description="Capture item-level changes in your table, and replicate the changes to a Kinesis data stream." items={[{ label: "Destinations", value: kinesis.data?.KinesisDataStreamDestinations?.map((d) => `${d.StreamArn} (${d.DestinationStatus})`).join(", ") || "Off" }]} />
      <EditModal
        visible={open}
        title="Turn on DynamoDB stream"
        saveLabel="Turn on stream"
        onDismiss={() => setOpen(false)}
        success="DynamoDB stream turned on."
        onSave={async () => {
          await callAws("dynamodb", "UpdateTable", { TableName: table?.TableName, StreamSpecification: { StreamEnabled: true, StreamViewType: view } })
          refresh()
        }}
      >
        <FormField label="View type">
          <RadioGroup value={view} onChange={({ detail }) => setView(detail.value)} items={[{ value: "KEYS_ONLY", label: "Key attributes only" }, { value: "NEW_IMAGE", label: "New image" }, { value: "OLD_IMAGE", label: "Old image" }, { value: "NEW_AND_OLD_IMAGES", label: "New and old images" }]} />
        </FormField>
      </EditModal>
    </SpaceBetween>
  )
}

function Permissions({ table }: { table?: TableT }) {
  const policy = useAws<{ Policy?: string }>("dynamodb", "GetResourcePolicy", { ResourceArn: table?.TableArn }, { enabled: Boolean(table?.TableArn), retry: false })
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  return (
    <Section
      title="Resource-based policy for table"
      description="Use resource-based policies to grant access to the table to other principals."
      actions={
        <SpaceBetween direction="horizontal" size="xs">
          <Button disabled={!policy.data?.Policy} onClick={async () => { await callAws("dynamodb", "DeleteResourcePolicy", { ResourceArn: table?.TableArn }); await policy.refetch(); flash.success("Policy deleted.") }}>Delete</Button>
          <Button onClick={() => { setValue(pretty(policy.data?.Policy) || JSON.stringify({ Version: "2012-10-17", Statement: [] }, null, 2)); setOpen(true) }}>{policy.data?.Policy ? "Edit" : "Create table policy"}</Button>
        </SpaceBetween>
      }
    >
      <CodeView value={pretty(policy.data?.Policy)} empty="No resource-based policy" />
      <EditModal visible={open} size="large" title="Edit resource-based policy" onDismiss={() => setOpen(false)} success="Policy saved." onSave={async () => { await callAws("dynamodb", "PutResourcePolicy", { ResourceArn: table?.TableArn, Policy: JSON.stringify(JSON.parse(value)) }); await policy.refetch() }}>
        <JsonField value={value} onChange={setValue} />
      </EditModal>
    </Section>
  )
}

function AdditionalSettings({ table, refresh, onCapacity }: { table?: TableT; refresh: () => void; onCapacity: () => void }) {
  const ttl = useAws<{ TimeToLiveDescription?: { TimeToLiveStatus?: string; AttributeName?: string } }>("dynamodb", "DescribeTimeToLive", { TableName: table?.TableName }, { enabled: Boolean(table?.TableName) })
  const tags = useAws<{ Tags?: Tag[] }>("dynamodb", "ListTagsOfResource", { ResourceArn: table?.TableArn }, { enabled: Boolean(table?.TableArn) })
  const [modal, setModal] = useState<string>()
  const [ttlAttr, setTtlAttr] = useState("")
  const [editTags, setEditTags] = useState<Tag[]>([])
  const [tableClass, setTableClass] = useState(table?.TableClassSummary?.TableClass ?? "STANDARD")
  return (
    <SpaceBetween size="l">
      <Section
        title="Read/write capacity"
        onEdit={onCapacity}
        columns={3}
        items={[
          { label: "Capacity mode", value: capacityMode(table) },
          { label: "Read capacity", value: capacityMode(table) === "Provisioned" ? `${table?.ProvisionedThroughput?.ReadCapacityUnits} RCU` : "On-demand" },
          { label: "Write capacity", value: capacityMode(table) === "Provisioned" ? `${table?.ProvisionedThroughput?.WriteCapacityUnits} WCU` : "On-demand" },
        ]}
      />
      <Section
        title="Time to Live (TTL)"
        description="Automatically delete expired items from your table."
        actions={
          ttl.data?.TimeToLiveDescription?.TimeToLiveStatus === "ENABLED" ? (
            <Button onClick={async () => { await callAws("dynamodb", "UpdateTimeToLive", { TableName: table?.TableName, TimeToLiveSpecification: { Enabled: false, AttributeName: ttl.data?.TimeToLiveDescription?.AttributeName } }); await ttl.refetch(); flash.success("TTL turned off.") }}>Turn off</Button>
          ) : (
            <Button onClick={() => setModal("ttl")}>Turn on</Button>
          )
        }
        columns={2}
        items={[
          { label: "TTL status", value: ttl.data?.TimeToLiveDescription?.TimeToLiveStatus === "ENABLED" ? <StatusIndicator type="success">On</StatusIndicator> : "Off" },
          { label: "TTL attribute", value: ttl.data?.TimeToLiveDescription?.AttributeName ?? "–" },
        ]}
      />
      <Section title="Encryption" columns={2} items={[{ label: "Key management", value: table?.SSEDescription?.SSEType === "KMS" ? (table.SSEDescription.KMSMasterKeyArn?.includes("alias/aws/dynamodb") ? "AWS managed key" : "Customer managed key") : "Owned by Amazon DynamoDB" }, { label: "Status", value: table?.SSEDescription?.Status ?? "Enabled" }]} />
      <Section title="Table class" onEdit={() => setModal("class")} items={[{ label: "Table class", value: table?.TableClassSummary?.TableClass === "STANDARD_INFREQUENT_ACCESS" ? "DynamoDB Standard-IA" : "DynamoDB Standard" }]} />
      <Section title="Deletion protection" items={[{ label: "Deletion protection", value: table?.DeletionProtectionEnabled ? "On" : "Off" }]} />
      <Section title="Tags" counter={`(${tags.data?.Tags?.length ?? 0})`} actions={<Button onClick={() => { setEditTags((tags.data?.Tags ?? []).map((t) => ({ Key: t.Key, Value: t.Value }))); setModal("tags") }}>Manage tags</Button>}>
        <Table variant="embedded" items={tags.data?.Tags ?? []} columnDefinitions={[{ id: "key", header: "Key", cell: (t) => t.Key }, { id: "value", header: "Value", cell: (t) => t.Value || "–" }]} empty={<Box textAlign="center">No tags</Box>} />
      </Section>
      <EditModal visible={modal === "ttl"} title="Turn on Time to Live (TTL)" saveLabel="Turn on TTL" onDismiss={() => setModal(undefined)} success="TTL turned on." onSave={async () => { await callAws("dynamodb", "UpdateTimeToLive", { TableName: table?.TableName, TimeToLiveSpecification: { Enabled: true, AttributeName: ttlAttr } }); await ttl.refetch() }}>
        <FormField label="TTL attribute name" description="The attribute that holds the expiration time as a Unix epoch timestamp in seconds."><Input value={ttlAttr} placeholder="expireAt" onChange={({ detail }) => setTtlAttr(detail.value)} /></FormField>
      </EditModal>
      <EditModal visible={modal === "class"} title="Edit table class" onDismiss={() => setModal(undefined)} success="Table class updated." onSave={async () => { await callAws("dynamodb", "UpdateTable", { TableName: table?.TableName, TableClass: tableClass }); refresh() }}>
        <Select selectedOption={{ value: tableClass, label: tableClass === "STANDARD" ? "DynamoDB Standard" : "DynamoDB Standard-IA" }} onChange={({ detail }) => setTableClass(detail.selectedOption.value ?? "STANDARD")} options={[{ value: "STANDARD", label: "DynamoDB Standard" }, { value: "STANDARD_INFREQUENT_ACCESS", label: "DynamoDB Standard-IA" }]} />
      </EditModal>
      <EditModal
        visible={modal === "tags"}
        size="large"
        title="Manage tags"
        onDismiss={() => setModal(undefined)}
        success="Tags updated."
        onSave={async () => {
          const before = tags.data?.Tags ?? []
          const after = editTags.filter((t) => t.Key)
          const removed = before.filter((t) => !after.some((a) => a.Key === t.Key)).map((t) => t.Key)
          if (removed.length) await callAws("dynamodb", "UntagResource", { ResourceArn: table?.TableArn, TagKeys: removed })
          if (after.length) await callAws("dynamodb", "TagResource", { ResourceArn: table?.TableArn, Tags: after.map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) })
          await tags.refetch()
        }}
      >
        <TagEditor tags={editTags} onChange={setEditTags} />
      </EditModal>
    </SpaceBetween>
  )
}
