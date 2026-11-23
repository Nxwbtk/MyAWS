"use client"

import Alert from "@cloudscape-design/components/alert"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal } from "@/components/console/sections"
import { useFollow } from "@/components/shell/page-layout"
import { LambdaLayout } from "@/components/lambda/lambda-app"
import { fnHref, lambdaDate, runtimeLabel, useFunctions, type FunctionConfig } from "@/components/lambda/shared"
import { callAws } from "@/lib/aws"

export function DeleteFunctionsModal({ names, close, onDone }: { names: string[]; close: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState("")
  return (
    <EditModal visible title={names.length === 1 ? "Delete function" : `Delete ${names.length} functions`} saveLabel="Delete" saveDisabled={confirm !== "confirm"} onDismiss={close} success={`Successfully deleted ${names.join(", ")}.`} onSave={async () => { for (const n of names) await callAws("lambda", "DeleteFunction", { FunctionName: n }); onDone() }}>
      <Alert type="warning">Deleting a function permanently removes the function code. The related logs and roles are retained in your account.</Alert>
      <FormField label={<>To confirm deletion, type <i>confirm</i> in the field.</>}><Input value={confirm} placeholder="confirm" onChange={({ detail }) => setConfirm(detail.value)} /></FormField>
    </EditModal>
  )
}

export function FunctionsPage() {
  const router = useRouter()
  const follow = useFollow()
  const functions = useFunctions()
  const [selected, setSelected] = useState<FunctionConfig[]>([])
  const [deleting, setDeleting] = useState(false)
  return (
    <LambdaLayout breadcrumbs={[{ text: "Functions", href: "/lambda/functions" }]} contentType="table">
      <ResourceTable<FunctionConfig>
        title="Functions"
        description={`Last fetched ${new Date().toLocaleString()}`}
        items={functions.data ?? []}
        loading={functions.isPending}
        loadingText="Loading functions"
        error={functions.error}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="FunctionName"
        filterPlaceholder="Filter by attributes or search by keyword"
        columns={[
          { id: "name", header: "Function name", value: (f) => f.FunctionName, cell: (f) => <Link href={fnHref(f.FunctionName)} onFollow={follow}>{f.FunctionName}</Link> },
          { id: "description", header: "Description", value: (f) => f.Description, cell: (f) => f.Description || "–" },
          { id: "package", header: "Package type", value: (f) => f.PackageType, cell: (f) => f.PackageType ?? "Zip" },
          { id: "runtime", header: "Runtime", value: (f) => f.Runtime, cell: (f) => runtimeLabel(f.Runtime) },
          { id: "type", header: "Type", value: () => "Standard", cell: () => "Standard" },
          { id: "modified", header: "Last modified", value: (f) => f.LastModified, cell: (f) => lambdaDate(f.LastModified) },
        ]}
        empty={<EmptyState title="No functions" subtitle="You do not have any functions." action={<Button href="/lambda/create/function" onFollow={follow}>Create function</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={functions.isFetching} onClick={() => void functions.refetch()} />
            <ButtonDropdown
              disabled={selected.length === 0}
              items={[
                { id: "view", text: "View details", disabled: selected.length !== 1 },
                { id: "test", text: "Test", disabled: selected.length !== 1 },
                { id: "delete", text: "Delete" },
              ]}
              onItemClick={({ detail }) => {
                if (detail.id === "view") router.push(fnHref(selected[0].FunctionName))
                if (detail.id === "test") router.push(fnHref(selected[0].FunctionName, "test"))
                if (detail.id === "delete") setDeleting(true)
              }}
            >
              Actions
            </ButtonDropdown>
            <Button variant="primary" href="/lambda/create/function" onFollow={follow}>Create function</Button>
          </SpaceBetween>
        }
      />
      {deleting && <DeleteFunctionsModal names={selected.map((f) => f.FunctionName ?? "")} close={() => setDeleting(false)} onDone={() => { setSelected([]); void functions.refetch() }} />}
    </LambdaLayout>
  )
}
