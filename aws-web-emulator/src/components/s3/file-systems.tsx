"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ColumnLayout from "@cloudscape-design/components/column-layout"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, LearnMore, Section } from "@/components/console/sections"
import { S3Layout } from "@/components/s3/s3-app"
import { s3Request, useS3 } from "@/components/s3/s3-hooks"
import { consoleDate } from "@/lib/format"

type FileSystem = { fileSystemId?: string; name?: string; status?: string; creationTime?: string; bucket?: string; fileSystemArn?: string; prefix?: string; roleArn?: string }

export function FileSystemsPage({ fsx }: { fsx?: boolean }) {
  const params = useSearchParams()
  const systems = useS3<{ fileSystems?: FileSystem[] }>("s3files", "ListFileSystems", {}, { enabled: !fsx })
  const [selected, setSelected] = useState<FileSystem[]>([])
  const [form, setForm] = useState<{ bucket: string; prefix: string; role: string } | null>(params.get("bucket") ? { bucket: params.get("bucket") ?? "", prefix: "", role: "" } : null)
  const [details, setDetails] = useState(false)
  const current = selected[0]

  if (fsx)
    return (
      <S3Layout breadcrumbs={[{ text: "Access Points for FSx", href: "/s3/fsx-ap" }]}>
        <ContentLayout header={<Header variant="h1" description="Access points attached to Amazon FSx file systems let you access file data with S3 APIs.">Access Points for FSx</Header>}>
          <Alert type="info" header="Amazon FSx is not available in the local emulator">
            Access Points for FSx require an Amazon FSx for OpenZFS file system. <LearnMore href="https://docs.aws.amazon.com/fsx/latest/OpenZFSGuide/s3accesspoints-for-FSx.html" />
          </Alert>
        </ContentLayout>
      </S3Layout>
    )

  return (
    <S3Layout breadcrumbs={[{ text: "File systems", href: "/s3/fs" }]} contentType="table">
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>}>File systems</Header>}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2" description={<>Amazon S3 Files is a high-performance file system that seamlessly connects any AWS compute resource with Amazon S3. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files.html" /></>}>Getting started with S3 Files</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <div><Box variant="h3">Step 1: Create a file system</Box><Box color="text-body-secondary">Create a file system for your S3 bucket or prefix.</Box></div>
              <div><Box variant="h3">Step 2: Mount the file system</Box><Box color="text-body-secondary">Mount your file system to any AWS compute service.</Box></div>
              <div><Box variant="h3">Step 3: Start accessing your S3 data right away as files and directories</Box><Box color="text-body-secondary">S3 Files provides high performance shared file system access, where its files and directories reflect what&apos;s in your S3 bucket.</Box></div>
            </ColumnLayout>
          </Container>
          <ResourceTable<FileSystem>
            title="File systems"
            variant="container"
            info={false}
            description="Amazon S3 Files is a high-performance shared file system to access S3 data from any AWS compute service."
            items={systems.data?.fileSystems ?? []}
            loading={systems.isPending}
            error={systems.error}
            selectionType="single"
            selectedItems={selected}
            onSelectionChange={setSelected}
            trackBy="fileSystemId"
            columns={[
              { id: "id", header: "File system ID", value: (item) => item.fileSystemId, cell: (item) => item.fileSystemId },
              { id: "name", header: "Name", value: (item) => item.name, cell: (item) => item.name ?? "-" },
              { id: "bucket", header: "General purpose bucket", value: (item) => item.bucket, cell: (item) => item.bucket?.replace("arn:aws:s3:::", "") ?? "-" },
              { id: "status", header: "Status", value: (item) => item.status, cell: (item) => <StatusIndicator type={item.status === "available" ? "success" : "pending"}>{item.status}</StatusIndicator> },
              { id: "created", header: "Creation date", value: (item) => item.creationTime, cell: (item) => consoleDate(item.creationTime) },
            ]}
            empty={<EmptyState title="You don't have any file systems." action={<Button onClick={() => setForm({ bucket: "", prefix: "", role: "" })}>Create file system</Button>} />}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={!current} onClick={() => setDetails(true)}>View details</Button>
                <Button
                  disabled={!current}
                  onClick={async () => {
                    await s3Request("s3files", "DeleteFileSystem", { fileSystemId: current?.fileSystemId })
                    setSelected([])
                    await systems.refetch()
                    flash.success(`Successfully deleted file system "${current?.fileSystemId}".`)
                  }}
                >
                  Delete
                </Button>
                <Button variant="primary" onClick={() => setForm({ bucket: "", prefix: "", role: "" })}>Create file system</Button>
              </SpaceBetween>
            }
          />
        </SpaceBetween>
      </ContentLayout>
      <EditModal
        visible={form !== null}
        size="large"
        title="Create file system"
        saveLabel="Create file system"
        onDismiss={() => setForm(null)}
        success="Successfully created file system."
        onSave={async () => {
          if (!form?.bucket || !form.role) throw new Error("Enter a bucket and an IAM role ARN.")
          await s3Request("s3files", "CreateFileSystem", {
            bucket: form.bucket.startsWith("arn:") ? form.bucket : `arn:aws:s3:::${form.bucket}`,
            roleArn: form.role,
            acceptBucketWarning: true,
            ...(form.prefix ? { prefix: form.prefix } : {}),
          })
          await systems.refetch()
        }}
      >
        {form && (
          <SpaceBetween size="m">
            <FormField label="General purpose bucket" description="The bucket that the file system reflects."><Input value={form.bucket} placeholder="amzn-s3-demo-bucket" onChange={({ detail }) => setForm({ ...form, bucket: detail.value })} /></FormField>
            <FormField label={<>Prefix - <i>optional</i></>}><Input value={form.prefix} onChange={({ detail }) => setForm({ ...form, prefix: detail.value })} /></FormField>
            <FormField label="IAM role" description="S3 Files assumes this role to read and write your bucket."><Input value={form.role} placeholder="arn:aws:iam::account-id:role/role-name" onChange={({ detail }) => setForm({ ...form, role: detail.value })} /></FormField>
          </SpaceBetween>
        )}
      </EditModal>
      <EditModal visible={details} title={current?.fileSystemId ?? "File system"} saveLabel="Close" onDismiss={() => setDetails(false)} onSave={async () => undefined}>
        <Section
          title="Details"
          columns={2}
          items={[
            { label: "File system ID", value: current?.fileSystemId ?? "-" },
            { label: "ARN", value: current?.fileSystemArn ?? "-" },
            { label: "Bucket", value: current?.bucket ?? "-" },
            { label: "Status", value: current?.status ?? "-" },
            { label: "Creation date", value: consoleDate(current?.creationTime) },
          ]}
        />
      </EditModal>
    </S3Layout>
  )
}
