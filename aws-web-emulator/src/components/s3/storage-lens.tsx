"use client"

import Button from "@cloudscape-design/components/button"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Tabs from "@cloudscape-design/components/tabs"
import { useState } from "react"
import { flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, notInEmulator } from "@/components/console/sections"
import { S3Layout } from "@/components/s3/s3-app"
import { s3Request, useS3, useS3Environment } from "@/components/s3/s3-hooks"

type Dashboard = { Id?: string; StorageLensArn?: string; HomeRegion?: string; IsEnabled?: boolean }

export function StorageLensPage() {
  const environment = useS3Environment()
  const account = environment.data?.account
  const region = environment.data?.region ?? "ap-southeast-7"
  const dashboards = useS3<{ StorageLensConfigurationList?: Dashboard[] }>("s3control", "ListStorageLensConfigurations", { AccountId: account }, { enabled: Boolean(account) })
  const [selected, setSelected] = useState<Dashboard[]>([])
  const [form, setForm] = useState<{ id: string; enabled: string } | null>(null)
  const current = selected[0]
  return (
    <S3Layout breadcrumbs={[{ text: "Storage Lens", href: "/s3/lens" }]} contentType="table">
      <ContentLayout
        header={
          <Header variant="h1" info={<Link variant="info">Info</Link>} description="Storage Lens provides visibility into storage usage and activity trends at the organization or account level, with drill-downs such as AWS Region, Storage Lens groups, or prefixes.">
            Storage Lens
          </Header>
        }
      >
        <Tabs
          tabs={[
            {
              id: "dashboards",
              label: "Storage Lens dashboards",
              content: (
                <ResourceTable<Dashboard>
                  title="Dashboards"
                  variant="container"
                  items={dashboards.data?.StorageLensConfigurationList ?? []}
                  loading={dashboards.isPending && dashboards.fetchStatus !== "idle"}
                  error={dashboards.error}
                  selectionType="single"
                  selectedItems={selected}
                  onSelectionChange={setSelected}
                  trackBy="Id"
                  columns={[
                    { id: "name", header: "Dashboard name", value: (item) => item.Id, cell: (item) => item.Id },
                    { id: "status", header: "Status", cell: (item) => <StatusIndicator type={item.IsEnabled ? "success" : "stopped"}>{item.IsEnabled ? "Enabled" : "Disabled"}</StatusIndicator> },
                    { id: "region", header: "Home Region", value: (item) => item.HomeRegion, cell: (item) => item.HomeRegion ?? region },
                    { id: "arn", header: "ARN", value: (item) => item.StorageLensArn, cell: (item) => item.StorageLensArn },
                  ]}
                  empty={<EmptyState title="No dashboards" subtitle="You don't have any Storage Lens dashboards." action={<Button onClick={() => setForm({ id: "", enabled: "on" })}>Create dashboard</Button>} />}
                  actions={
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button
                        disabled={!current}
                        onClick={async () => {
                          await s3Request("s3control", "DeleteStorageLensConfiguration", { AccountId: account, ConfigId: current?.Id })
                          setSelected([])
                          await dashboards.refetch()
                          flash.success(`Successfully deleted dashboard "${current?.Id}".`)
                        }}
                      >
                        Delete
                      </Button>
                      <Button variant="primary" onClick={() => setForm({ id: "", enabled: "on" })}>Create dashboard</Button>
                    </SpaceBetween>
                  }
                />
              ),
            },
            { id: "groups", label: "Storage Lens groups", content: <EmptyState title="Storage Lens groups" subtitle={notInEmulator} /> },
          ]}
        />
      </ContentLayout>
      <EditModal
        visible={form !== null}
        title="Create dashboard"
        saveLabel="Create dashboard"
        onDismiss={() => setForm(null)}
        success="Successfully created dashboard."
        onSave={async () => {
          if (!form?.id) throw new Error("Enter a dashboard name.")
          await s3Request("s3control", "PutStorageLensConfiguration", {
            AccountId: account,
            ConfigId: form.id,
            StorageLensConfiguration: { Id: form.id, IsEnabled: form.enabled === "on", AccountLevel: { BucketLevel: {} } },
          })
          await dashboards.refetch()
        }}
      >
        {form && (
          <SpaceBetween size="m">
            <FormField label="Dashboard name"><Input value={form.id} onChange={({ detail }) => setForm({ ...form, id: detail.value })} /></FormField>
            <FormField label="Status"><RadioGroup value={form.enabled} onChange={({ detail }) => setForm({ ...form, enabled: detail.value })} items={[{ value: "on", label: "Enable" }, { value: "off", label: "Disable" }]} /></FormField>
          </SpaceBetween>
        )}
      </EditModal>
    </S3Layout>
  )
}
