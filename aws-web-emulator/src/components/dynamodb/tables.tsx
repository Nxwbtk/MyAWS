"use client"

import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Alert from "@cloudscape-design/components/alert"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal } from "@/components/console/sections"
import { useFollow } from "@/components/shell/page-layout"
import { DdbLayout } from "@/components/dynamodb/ddb-app"
import { bytes, capacityMode, keyOf, readFavorites, useTables, writeFavorites, type Table } from "@/components/dynamodb/shared"
import { callAws } from "@/lib/aws"

export function TableStatus({ status }: { status?: string }) {
  if (!status) return <>–</>
  const label = status.charAt(0) + status.slice(1).toLowerCase()
  return <StatusIndicator type={status === "ACTIVE" ? "success" : status === "DELETING" ? "in-progress" : status === "CREATING" || status === "UPDATING" ? "in-progress" : "info"}>{label}</StatusIndicator>
}

export function DeleteTablesModal({ tables, close, onDeleted }: { tables: Table[]; close: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState("")
  const [backup, setBackup] = useState(false)
  return (
    <EditModal
      visible
      title={`Delete table${tables.length === 1 ? "" : "s"}`}
      saveLabel="Delete"
      saveDisabled={confirm !== "confirm"}
      onDismiss={close}
      success={`The request to delete the "${tables.map((t) => t.TableName).join(", ")}" table has been submitted successfully.`}
      onSave={async () => {
        for (const table of tables) {
          if (backup) await callAws("dynamodb", "CreateBackup", { TableName: table.TableName, BackupName: `${table.TableName}-final-backup` })
          await callAws("dynamodb", "DeleteTable", { TableName: table.TableName })
        }
        onDeleted()
      }}
    >
      <Alert type="warning">Deleting {tables.length === 1 ? `the table "${tables[0].TableName}"` : `${tables.length} tables`} will permanently remove all items and indexes. This action can&apos;t be undone.</Alert>
      <ButtonToggle checked={backup} onChange={setBackup} />
      <FormField label={<>To confirm the deletion, type <i>confirm</i> in the field.</>}>
        <Input value={confirm} placeholder="confirm" onChange={({ detail }) => setConfirm(detail.value)} />
      </FormField>
    </EditModal>
  )
}

function ButtonToggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <Checkbox checked={checked} onChange={({ detail }) => onChange(detail.checked)}>Create an on-demand backup of the table before deletion.</Checkbox>
}

export function TablesPage() {
  const router = useRouter()
  const follow = useFollow()
  const tables = useTables()
  const [selected, setSelected] = useState<Table[]>([])
  const [deleting, setDeleting] = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])
  useEffect(() => {
    // Favorites live in browser storage, which is only readable after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(readFavorites())
  }, [])
  const toggleFavorite = (name: string) => {
    const next = favorites.includes(name) ? favorites.filter((f) => f !== name) : [...favorites, name]
    setFavorites(next)
    writeFavorites(next)
  }
  const current = selected[0]
  return (
    <DdbLayout breadcrumbs={[{ text: "Tables", href: "/dynamodb/tables" }]} contentType="table">
      <ResourceTable<Table>
        title="Tables"
        items={tables.data ?? []}
        loading={tables.isPending}
        loadingText="Loading tables"
        error={tables.error}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="TableName"
        filterPlaceholder="Find tables by table name"
        columns={[
          { id: "name", header: "Name", value: (t) => t.TableName, cell: (t) => <Link href={`/dynamodb/table/${encodeURIComponent(t.TableName ?? "")}`} onFollow={follow}>{t.TableName}</Link> },
          { id: "status", header: "Status", value: (t) => t.TableStatus, cell: (t) => <TableStatus status={t.TableStatus} /> },
          { id: "pk", header: "Partition key", value: (t) => keyOf(t, "HASH"), cell: (t) => `${keyOf(t, "HASH") ?? "–"} (${t.AttributeDefinitions?.find((a) => a.AttributeName === keyOf(t, "HASH"))?.AttributeType ?? ""})` },
          { id: "sk", header: "Sort key", value: (t) => keyOf(t, "RANGE"), cell: (t) => (keyOf(t, "RANGE") ? `${keyOf(t, "RANGE")} (${t.AttributeDefinitions?.find((a) => a.AttributeName === keyOf(t, "RANGE"))?.AttributeType})` : "–") },
          { id: "indexes", header: "Indexes", value: (t) => (t.GlobalSecondaryIndexes?.length ?? 0) + (t.LocalSecondaryIndexes?.length ?? 0), cell: (t) => String((t.GlobalSecondaryIndexes?.length ?? 0) + (t.LocalSecondaryIndexes?.length ?? 0)) },
          { id: "replicas", header: "Replication Regions", value: (t) => t.Replicas?.length ?? 0, cell: (t) => String(t.Replicas?.length ?? 0) },
          { id: "protection", header: "Deletion protection", value: (t) => (t.DeletionProtectionEnabled ? "On" : "Off"), cell: (t) => (t.DeletionProtectionEnabled ? <StatusIndicator type="success">On</StatusIndicator> : <StatusIndicator type="stopped">Off</StatusIndicator>) },
          { id: "favorite", header: "Favorite", cell: (t) => <Button variant="inline-icon" iconName={favorites.includes(t.TableName ?? "") ? "star-filled" : "star"} ariaLabel="Favorite" onClick={() => toggleFavorite(t.TableName ?? "")} /> },
          { id: "read", header: "Read capacity mode", value: capacityMode, cell: capacityMode },
          { id: "write", header: "Write capacity mode", value: capacityMode, cell: capacityMode },
          { id: "size", header: "Total size", value: (t) => t.TableSizeBytes, cell: (t) => bytes(t.TableSizeBytes) },
          { id: "class", header: "Table class", value: (t) => t.TableClassSummary?.TableClass, cell: (t) => (t.TableClassSummary?.TableClass === "STANDARD_INFREQUENT_ACCESS" ? "DynamoDB Standard-IA" : "DynamoDB Standard") },
        ]}
        empty={<EmptyState title="No tables" subtitle="You have no tables in this account in this AWS Region." action={<Button href="/dynamodb/tables/create" onFollow={follow}>Create table</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={tables.isFetching} onClick={() => void tables.refetchAll()} />
            <ButtonDropdown
              disabled={!current}
              items={[
                { id: "explore", text: "Explore items", disabled: selected.length !== 1 },
                { id: "settings", text: "Update settings", disabled: selected.length !== 1 },
                { id: "backup", text: "Create backup", disabled: selected.length !== 1 },
                { id: "export", text: "Export to S3", disabled: selected.length !== 1 },
                { id: "replica", text: "Create global table replica", disabled: true, disabledReason: "Multi-Region replicas are not available in the local emulator." },
              ]}
              onItemClick={async ({ detail }) => {
                const name = encodeURIComponent(current?.TableName ?? "")
                if (detail.id === "explore") router.push(`/dynamodb/items?table=${name}`)
                if (detail.id === "settings") router.push(`/dynamodb/table/${name}?tab=settings`)
                if (detail.id === "export") router.push(`/dynamodb/exports?table=${name}`)
                if (detail.id === "backup") {
                  await callAws("dynamodb", "CreateBackup", { TableName: current?.TableName, BackupName: `${current?.TableName}-${Date.now()}` }).then(
                    () => flash.success(`Backup of ${current?.TableName} was created.`),
                    (error) => flash.error(errorMessage(error)),
                  )
                }
              }}
            >
              Actions
            </ButtonDropdown>
            <Button disabled={selected.length === 0} onClick={() => setDeleting(true)}>Delete</Button>
            <Button variant="primary" href="/dynamodb/tables/create" onFollow={follow}>Create table</Button>
          </SpaceBetween>
        }
      />
      {deleting && <DeleteTablesModal tables={selected} close={() => setDeleting(false)} onDeleted={() => { setSelected([]); void tables.refetchAll() }} />}
    </DdbLayout>
  )
}
