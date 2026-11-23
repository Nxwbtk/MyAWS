"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Tabs from "@cloudscape-design/components/tabs"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal } from "@/components/console/sections"
import { DdbLayout } from "@/components/dynamodb/ddb-app"
import { bytes, useTableNames } from "@/components/dynamodb/shared"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

function Status({ value }: { value?: string }) {
  if (!value) return <>–</>
  const type = /AVAILABLE|COMPLETED|ACTIVE/.test(value) ? "success" : /FAIL|CANCEL/.test(value) ? "error" : /DELET/.test(value) ? "stopped" : "in-progress"
  return <StatusIndicator type={type}>{value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ")}</StatusIndicator>
}

function TableSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const names = useTableNames()
  return <Select selectedOption={value ? { value, label: value } : null} placeholder="Choose a table" loadingText="Loading tables" statusType={names.isPending ? "loading" : "finished"} onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")} options={(names.data ?? []).map((n) => ({ value: n, label: n }))} />
}

type Backup = { BackupName?: string; BackupArn?: string; BackupStatus?: string; BackupCreationDateTime?: string; BackupSizeBytes?: number; BackupType?: string; TableName?: string; BackupExpiryDateTime?: string }

export function BackupsPage() {
  const backups = useAws<{ BackupSummaries?: Backup[] }>("dynamodb", "ListBackups", {})
  const [selected, setSelected] = useState<Backup[]>([])
  const [modal, setModal] = useState<string>()
  const [table, setTable] = useState("")
  const [name, setName] = useState("")
  const [target, setTarget] = useState("")
  const [confirm, setConfirm] = useState("")
  const current = selected[0]
  return (
    <DdbLayout breadcrumbs={[{ text: "Backups", href: "/dynamodb/backups" }]} contentType="table">
      <Tabs
        tabs={[
          {
            id: "ondemand",
            label: "Backups",
            content: (
              <ResourceTable<Backup>
                title="Backups"
                description="On-demand backups of your DynamoDB tables."
                items={backups.data?.BackupSummaries ?? []}
                loading={backups.isPending}
                loadingText="Loading backups"
                error={backups.error}
                selectionType="single"
                selectedItems={selected}
                onSelectionChange={setSelected}
                trackBy="BackupArn"
                filterPlaceholder="Find backups"
                columns={[
                  { id: "name", header: "Backup name", value: (b) => b.BackupName, cell: (b) => b.BackupName },
                  { id: "table", header: "Table name", value: (b) => b.TableName, cell: (b) => b.TableName },
                  { id: "status", header: "Status", value: (b) => b.BackupStatus, cell: (b) => <Status value={b.BackupStatus} /> },
                  { id: "created", header: "Creation time", value: (b) => b.BackupCreationDateTime, cell: (b) => consoleDate(b.BackupCreationDateTime) },
                  { id: "size", header: "Size", value: (b) => b.BackupSizeBytes, cell: (b) => bytes(b.BackupSizeBytes) },
                  { id: "type", header: "Backup type", value: (b) => b.BackupType, cell: (b) => b.BackupType },
                  { id: "expiry", header: "Expiry date", value: (b) => b.BackupExpiryDateTime, cell: (b) => consoleDate(b.BackupExpiryDateTime) },
                ]}
                empty={<EmptyState title="No backups" subtitle="You have no on-demand backups in this Region." action={<Button onClick={() => setModal("create")}>Create backup</Button>} />}
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button iconName="refresh" ariaLabel="Refresh" loading={backups.isFetching} onClick={() => void backups.refetch()} />
                    <Button disabled={!current} onClick={() => { setConfirm(""); setModal("delete") }}>Delete</Button>
                    <Button disabled={!current} onClick={() => { setTarget(`${current?.TableName}-restored`); setModal("restore") }}>Restore</Button>
                    <Button variant="primary" onClick={() => { setTable(""); setName(""); setModal("create") }}>Create backup</Button>
                  </SpaceBetween>
                }
              />
            ),
          },
          { id: "plans", label: "Backup plans", content: <EmptyState title="AWS Backup plans" subtitle="AWS Backup isn't available in the local emulator." /> },
        ]}
      />
      <EditModal
        visible={modal === "create"}
        title="Create on-demand backup"
        saveLabel="Create backup"
        saveDisabled={!table || !name}
        onDismiss={() => setModal(undefined)}
        success={`Backup ${name} was created.`}
        onSave={async () => { await callAws("dynamodb", "CreateBackup", { TableName: table, BackupName: name }); await backups.refetch() }}
      >
        <FormField label="Source table"><TableSelect value={table} onChange={(v) => { setTable(v); if (!name) setName(`${v}-backup`) }} /></FormField>
        <FormField label="Backup name" constraintText="3 to 255 characters: letters, numbers, underscores, hyphens and periods."><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
      </EditModal>
      <EditModal
        visible={modal === "restore"}
        title={`Restore backup ${current?.BackupName ?? ""}`}
        saveLabel="Restore"
        saveDisabled={!target}
        onDismiss={() => setModal(undefined)}
        success={`Restoring to table ${target}.`}
        onSave={async () => { await callAws("dynamodb", "RestoreTableFromBackup", { BackupArn: current?.BackupArn, TargetTableName: target }) }}
      >
        <FormField label="Name of restored table"><Input value={target} onChange={({ detail }) => setTarget(detail.value)} /></FormField>
      </EditModal>
      <EditModal
        visible={modal === "delete"}
        title="Delete backup"
        saveLabel="Delete"
        saveDisabled={confirm !== "delete"}
        onDismiss={() => setModal(undefined)}
        success={`Backup ${current?.BackupName} was deleted.`}
        onSave={async () => { await callAws("dynamodb", "DeleteBackup", { BackupArn: current?.BackupArn }); setSelected([]); await backups.refetch() }}
      >
        <Box>Delete backup <b>{current?.BackupName}</b>? This action can&apos;t be undone.</Box>
        <FormField label={<>To confirm deletion, type <i>delete</i>.</>}><Input value={confirm} placeholder="delete" onChange={({ detail }) => setConfirm(detail.value)} /></FormField>
      </EditModal>
    </DdbLayout>
  )
}

type Export = { ExportArn?: string; ExportStatus?: string; ExportType?: string }

export function ExportsPage() {
  const params = useSearchParams()
  const exports = useAws<{ ExportSummaries?: Export[] }>("dynamodb", "ListExports", {})
  const names = useTableNames()
  const [open, setOpen] = useState(Boolean(params.get("table")))
  const [table, setTable] = useState(params.get("table") ?? "")
  const [bucket, setBucket] = useState("")
  const [prefix, setPrefix] = useState("")
  const [format, setFormat] = useState("DYNAMODB_JSON")
  const [type, setType] = useState("FULL_EXPORT")
  return (
    <DdbLayout breadcrumbs={[{ text: "Exports to S3", href: "/dynamodb/exports" }]} contentType="table">
      <ResourceTable<Export>
        title="Exports to S3"
        description="Export table data to an Amazon S3 bucket from any point in time in the point-in-time recovery window."
        items={exports.data?.ExportSummaries ?? []}
        loading={exports.isPending}
        loadingText="Loading exports"
        error={exports.error}
        trackBy="ExportArn"
        filterPlaceholder="Find exports"
        columns={[
          { id: "arn", header: "Export ARN", value: (e) => e.ExportArn, cell: (e) => e.ExportArn },
          { id: "table", header: "Table name", value: (e) => tableFromArn(e.ExportArn), cell: (e) => tableFromArn(e.ExportArn) },
          { id: "status", header: "Status", value: (e) => e.ExportStatus, cell: (e) => <Status value={e.ExportStatus} /> },
          { id: "type", header: "Export type", value: (e) => e.ExportType, cell: (e) => (e.ExportType === "INCREMENTAL_EXPORT" ? "Incremental export" : "Full export") },
        ]}
        empty={<EmptyState title="No exports" subtitle="You have not exported any tables to Amazon S3." action={<Button onClick={() => setOpen(true)}>Export to S3</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={exports.isFetching} onClick={() => void exports.refetch()} />
            <Button variant="primary" onClick={() => setOpen(true)}>Export to S3</Button>
          </SpaceBetween>
        }
      />
      <EditModal
        visible={open}
        size="large"
        title="Export table to Amazon S3"
        saveLabel="Export"
        saveDisabled={!table || !bucket}
        onDismiss={() => setOpen(false)}
        success="The export request was submitted."
        onSave={async () => {
          const describe = await callAws<{ Table?: { TableArn?: string } }>("dynamodb", "DescribeTable", { TableName: table })
          await callAws("dynamodb", "ExportTableToPointInTime", { TableArn: describe.Table?.TableArn, S3Bucket: bucket.replace(/^s3:\/\//, "").split("/")[0], ...(prefix ? { S3Prefix: prefix } : {}), ExportFormat: format, ExportType: type, ...(type === "INCREMENTAL_EXPORT" ? { IncrementalExportSpecification: { ExportFromTime: new Date(Date.now() - 3600_000).toISOString(), ExportToTime: new Date().toISOString() } } : {}) })
          await exports.refetch()
        }}
      >
        <FormField label="Source table" description="Point-in-time recovery must be turned on for the table.">
          <Select selectedOption={table ? { value: table, label: table } : null} placeholder="Choose a table" onChange={({ detail }) => setTable(detail.selectedOption.value ?? "")} options={(names.data ?? []).map((n) => ({ value: n, label: n }))} />
        </FormField>
        <FormField label="Destination S3 bucket" description="Enter an S3 bucket in the format s3://bucket-name."><Input value={bucket} placeholder="s3://bucket" onChange={({ detail }) => setBucket(detail.value)} /></FormField>
        <FormField label="S3 prefix - optional"><Input value={prefix} onChange={({ detail }) => setPrefix(detail.value)} /></FormField>
        <FormField label="Export type"><RadioGroup value={type} onChange={({ detail }) => setType(detail.value)} items={[{ value: "FULL_EXPORT", label: "Full export", description: "Export the full table from a point in time." }, { value: "INCREMENTAL_EXPORT", label: "Incremental export", description: "Export changes made in the last hour." }]} /></FormField>
        <FormField label="Exported file format"><RadioGroup value={format} onChange={({ detail }) => setFormat(detail.value)} items={[{ value: "DYNAMODB_JSON", label: "DynamoDB JSON" }, { value: "ION", label: "Amazon Ion" }]} /></FormField>
      </EditModal>
    </DdbLayout>
  )
}

function tableFromArn(arn?: string) {
  return arn?.match(/table\/([^/]+)/)?.[1] ?? "–"
}

type Import = { ImportArn?: string; ImportStatus?: string; TableArn?: string; S3BucketSource?: { S3Bucket?: string; S3KeyPrefix?: string }; InputFormat?: string; StartTime?: string; EndTime?: string }

export function ImportsPage() {
  const imports = useAws<{ ImportSummaryList?: Import[] }>("dynamodb", "ListImports", {})
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ bucket: "", prefix: "", format: "DYNAMODB_JSON", compression: "NONE", table: "", pk: "", pkType: "S", sk: "", skType: "S" })
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })
  return (
    <DdbLayout breadcrumbs={[{ text: "Imports from S3", href: "/dynamodb/imports" }]} contentType="table">
      <ResourceTable<Import>
        title="Imports from S3"
        description="Import data from Amazon S3 into a new DynamoDB table."
        items={imports.data?.ImportSummaryList ?? []}
        loading={imports.isPending}
        loadingText="Loading imports"
        error={imports.error}
        trackBy="ImportArn"
        filterPlaceholder="Find imports"
        columns={[
          { id: "arn", header: "Import ARN", value: (i) => i.ImportArn, cell: (i) => i.ImportArn },
          { id: "table", header: "Destination table", value: (i) => tableFromArn(i.TableArn), cell: (i) => tableFromArn(i.TableArn) },
          { id: "status", header: "Status", value: (i) => i.ImportStatus, cell: (i) => <Status value={i.ImportStatus} /> },
          { id: "source", header: "Source S3 URL", value: (i) => i.S3BucketSource?.S3Bucket, cell: (i) => `s3://${i.S3BucketSource?.S3Bucket ?? ""}/${i.S3BucketSource?.S3KeyPrefix ?? ""}` },
          { id: "format", header: "Input format", value: (i) => i.InputFormat, cell: (i) => i.InputFormat },
          { id: "start", header: "Start time", value: (i) => i.StartTime, cell: (i) => consoleDate(i.StartTime) },
        ]}
        empty={<EmptyState title="No imports" subtitle="You have not imported any data from Amazon S3." action={<Button onClick={() => setOpen(true)}>Import from S3</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={imports.isFetching} onClick={() => void imports.refetch()} />
            <Button variant="primary" onClick={() => setOpen(true)}>Import from S3</Button>
          </SpaceBetween>
        }
      />
      <EditModal
        visible={open}
        size="large"
        title="Import from S3"
        saveLabel="Import"
        saveDisabled={!form.bucket || !form.table || !form.pk}
        onDismiss={() => setOpen(false)}
        success="The import request was submitted."
        onSave={async () => {
          await callAws("dynamodb", "ImportTable", {
            S3BucketSource: { S3Bucket: form.bucket.replace(/^s3:\/\//, "").split("/")[0], ...(form.prefix ? { S3KeyPrefix: form.prefix } : {}) },
            InputFormat: form.format,
            InputCompressionType: form.compression,
            TableCreationParameters: {
              TableName: form.table,
              BillingMode: "PAY_PER_REQUEST",
              AttributeDefinitions: [{ AttributeName: form.pk, AttributeType: form.pkType }, ...(form.sk ? [{ AttributeName: form.sk, AttributeType: form.skType }] : [])],
              KeySchema: [{ AttributeName: form.pk, KeyType: "HASH" }, ...(form.sk ? [{ AttributeName: form.sk, KeyType: "RANGE" }] : [])],
            },
          })
          await imports.refetch()
        }}
      >
        <FormField label="Source S3 URL"><Input value={form.bucket} placeholder="s3://bucket" onChange={({ detail }) => set({ bucket: detail.value })} /></FormField>
        <FormField label="S3 key prefix - optional"><Input value={form.prefix} onChange={({ detail }) => set({ prefix: detail.value })} /></FormField>
        <FormField label="Import file compression"><Select selectedOption={{ value: form.compression, label: form.compression === "NONE" ? "No compression" : form.compression }} onChange={({ detail }) => set({ compression: detail.selectedOption.value ?? "NONE" })} options={[{ value: "NONE", label: "No compression" }, { value: "GZIP", label: "GZIP" }, { value: "ZSTD", label: "ZSTD" }]} /></FormField>
        <FormField label="Import file format"><RadioGroup value={form.format} onChange={({ detail }) => set({ format: detail.value })} items={[{ value: "DYNAMODB_JSON", label: "DynamoDB JSON" }, { value: "ION", label: "Amazon Ion" }, { value: "CSV", label: "CSV" }]} /></FormField>
        <FormField label="Table name"><Input value={form.table} onChange={({ detail }) => set({ table: detail.value })} /></FormField>
        <SpaceBetween direction="horizontal" size="xs">
          <FormField label="Partition key"><Input value={form.pk} onChange={({ detail }) => set({ pk: detail.value })} /></FormField>
          <FormField label="Type"><Select selectedOption={{ value: form.pkType, label: form.pkType === "N" ? "Number" : form.pkType === "B" ? "Binary" : "String" }} onChange={({ detail }) => set({ pkType: detail.selectedOption.value ?? "S" })} options={[{ value: "S", label: "String" }, { value: "N", label: "Number" }, { value: "B", label: "Binary" }]} /></FormField>
          <FormField label="Sort key - optional"><Input value={form.sk} onChange={({ detail }) => set({ sk: detail.value })} /></FormField>
        </SpaceBetween>
      </EditModal>
    </DdbLayout>
  )
}
