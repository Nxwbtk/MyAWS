"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ColumnLayout from "@cloudscape-design/components/column-layout"
import Container from "@cloudscape-design/components/container"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import RadioGroup from "@cloudscape-design/components/radio-group"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import { useState } from "react"
import { flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, JsonField, LearnMore, Section, pretty } from "@/components/console/sections"
import { useFollow } from "@/components/shell/page-layout"
import { s3Request, useS3, useS3Environment } from "@/components/s3/s3-hooks"
import { consoleDate, copyText } from "@/lib/format"
import { regionName } from "@/lib/service-meta"

const docs = (path: string) => `https://docs.aws.amazon.com/AmazonS3/latest/userguide/${path}`

function Steps({ title, intro, steps }: { title: string; intro: React.ReactNode; steps: { title: string; body: React.ReactNode }[] }) {
  return (
    <Container header={<Header variant="h2" description={intro}>{title}</Header>}>
      <ColumnLayout columns={steps.length} variant="text-grid">
        {steps.map((step) => (
          <div key={step.title}>
            <Box variant="h3">{step.title}</Box>
            <Box variant="p" color="text-body-secondary">{step.body}</Box>
          </div>
        ))}
      </ColumnLayout>
    </Container>
  )
}

type MetadataConfig = {
  MetadataConfigurationResult?: {
    DestinationResult?: { TableBucketArn?: string; TableNamespace?: string }
    JournalTableConfigurationResult?: { TableStatus?: string; TableName?: string; TableArn?: string; RecordExpiration?: { Expiration?: string; Days?: number } }
    InventoryTableConfigurationResult?: { ConfigurationState?: string; TableStatus?: string; TableName?: string; TableArn?: string }
  }
}

export function BucketMetadataTab({ bucket }: { bucket: string }) {
  const config = useS3<MetadataConfig>("s3", "GetBucketMetadataConfiguration", { Bucket: bucket })
  const result = config.data?.MetadataConfigurationResult
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({ expiration: "DISABLED", days: "30", inventory: "DISABLED" })
  return (
    <SpaceBetween size="l">
      <Steps
        title="Getting started with metadata"
        intro="Accelerate data discovery with automatically generated, near real-time metadata for objects in this bucket, stored in fully managed Apache Iceberg tables. You can query metadata tables to identify and prepare data for use in business analytics and machine learning, identify AI-generated data, retrieve content, and more."
        steps={[
          { title: "Step 1 - Create a metadata configuration for your bucket", body: "Create a configuration to generate and store object metadata in S3 managed metadata tables. As long as the configuration is active on the bucket, S3 continuously updates the tables to reflect the latest changes to your bucket." },
          { title: "Step 2 - Analyze and build with your metadata tables", body: "Your metadata tables are instantly queryable by any AWS query engine that supports Apache Iceberg, such as Amazon Athena, Amazon QuickSight, and Apache Spark. Use the wide range of AWS services to analyze and build with your metadata." },
        ]}
      />
      <Section
        title="Metadata configuration"
        info
        description={<>You can interact with your metadata tables by using Amazon Athena or any AWS query engine that supports Apache Iceberg. <LearnMore href={docs("metadata-tables-overview.html")} /></>}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled={!result} onClick={() => setDeleting(true)}>Delete</Button>
            <Button disabled={!result} disabledReason={result ? undefined : "Create a metadata configuration first."} onClick={() => setOpen(true)}>Edit</Button>
            <Button disabled disabledReason="Previewing tables requires a query engine.">Preview</Button>
            <Button disabled disabledReason="Athena is not available in the local emulator.">Query table with Athena</Button>
          </SpaceBetween>
        }
      >
        {result ? (
          <SpaceBetween size="m">
            <ColumnLayout columns={2} variant="text-grid">
              <div>
                <Box variant="awsui-key-label">Table bucket</Box>
                <div>{result.DestinationResult?.TableBucketArn ?? "-"}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">Namespace</Box>
                <div>{result.DestinationResult?.TableNamespace ?? "-"}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">Journal table</Box>
                <div>{result.JournalTableConfigurationResult?.TableName ?? "-"} <StatusIndicator type="success">{result.JournalTableConfigurationResult?.TableStatus ?? "ACTIVE"}</StatusIndicator></div>
              </div>
              <div>
                <Box variant="awsui-key-label">Live inventory table</Box>
                <div>{result.InventoryTableConfigurationResult?.ConfigurationState ?? "DISABLED"}</div>
              </div>
            </ColumnLayout>
          </SpaceBetween>
        ) : (
          <EmptyState
            title="No metadata configuration for this bucket"
            action={<Button onClick={() => setOpen(true)}>Create metadata configuration</Button>}
          />
        )}
      </Section>
      <EditModal
        visible={open}
        size="large"
        title={result ? "Edit metadata configuration" : "Create metadata configuration"}
        saveLabel={result ? "Save changes" : "Create metadata configuration"}
        onDismiss={() => setOpen(false)}
        success="Successfully saved metadata configuration."
        onSave={async () => {
          if (result) {
            await s3Request("s3", "UpdateBucketMetadataJournalTableConfiguration", {
              Bucket: bucket,
              JournalTableConfiguration: { RecordExpiration: { Expiration: form.expiration, ...(form.expiration === "ENABLED" ? { Days: Number(form.days) } : {}) } },
            })
            await s3Request("s3", "UpdateBucketMetadataInventoryTableConfiguration", {
              Bucket: bucket,
              InventoryTableConfiguration: { ConfigurationState: form.inventory },
            })
          } else {
            await s3Request("s3", "CreateBucketMetadataConfiguration", {
              Bucket: bucket,
              MetadataConfiguration: {
                JournalTableConfiguration: { RecordExpiration: { Expiration: form.expiration, ...(form.expiration === "ENABLED" ? { Days: Number(form.days) } : {}) } },
                InventoryTableConfiguration: { ConfigurationState: form.inventory },
              },
            })
          }
          await config.refetch()
        }}
      >
        <FormField label="Journal table record expiration">
          <RadioGroup value={form.expiration} onChange={({ detail }) => setForm({ ...form, expiration: detail.value })} items={[{ value: "DISABLED", label: "Don't expire records" }, { value: "ENABLED", label: "Expire records" }]} />
        </FormField>
        {form.expiration === "ENABLED" && (
          <FormField label="Days after which records expire" constraintText="7 to 2,147,483,647 days">
            <Input type="number" value={form.days} onChange={({ detail }) => setForm({ ...form, days: detail.value })} />
          </FormField>
        )}
        <FormField label="Live inventory table">
          <RadioGroup value={form.inventory} onChange={({ detail }) => setForm({ ...form, inventory: detail.value })} items={[{ value: "DISABLED", label: "Disabled" }, { value: "ENABLED", label: "Enabled" }]} />
        </FormField>
      </EditModal>
      <EditModal
        visible={deleting}
        title="Delete metadata configuration?"
        saveLabel="Delete"
        onDismiss={() => setDeleting(false)}
        success="Successfully deleted metadata configuration."
        onSave={async () => {
          await s3Request("s3", "DeleteBucketMetadataConfiguration", { Bucket: bucket })
          await config.refetch()
        }}
      >
        <Alert type="warning">S3 stops updating the metadata tables. The tables remain in the table bucket.</Alert>
      </EditModal>
    </SpaceBetween>
  )
}

type Analytics = { Id?: string; Filter?: { Prefix?: string }; StorageClassAnalysis?: { DataExport?: { Destination?: { S3BucketDestination?: { Bucket?: string; Prefix?: string } } } } }

export function BucketMetricsTab({ bucket }: { bucket: string }) {
  const follow = useFollow()
  const analytics = useS3<{ AnalyticsConfigurationList?: Analytics[] }>("s3", "ListBucketAnalyticsConfigurations", { Bucket: bucket })
  const items = analytics.data?.AnalyticsConfigurationList ?? []
  const [selected, setSelected] = useState<Analytics[]>([])
  const [form, setForm] = useState<{ id: string; prefix: string; destination: string } | null>(null)
  return (
    <SpaceBetween size="l">
      <Section
        title="Bucket metrics"
        description={<>Explore metrics for usage, request, and data transfer activity within your bucket. Metrics are also available in Amazon CloudWatch. <LearnMore href={docs("cloudwatch-monitoring.html")} /></>}
        actions={<Button href="/cloudwatch" onFollow={follow} iconName="external" iconAlign="right">View additional charts</Button>}
      >
        <ColumnLayout columns={2} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">Total bucket size</Box>
            <Box color="text-status-inactive">No data available. Storage metrics are reported once per day.</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Total number of objects</Box>
            <Box color="text-status-inactive">No data available. Storage metrics are reported once per day.</Box>
          </div>
        </ColumnLayout>
      </Section>
      <ResourceTable<Analytics>
        title="Storage Class Analysis"
        variant="container"
        info={false}
        description={<>Analyze storage access patterns to help you decide when to transition objects to the appropriate storage class. <LearnMore href={docs("analytics-storage-class.html")} /></>}
        items={items}
        loading={analytics.isPending}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="Id"
        columns={[
          { id: "name", header: "Name", value: (item) => item.Id, cell: (item) => item.Id },
          { id: "filters", header: "Filters", cell: (item) => (item.Filter?.Prefix ? `Prefix: ${item.Filter.Prefix}` : "Entire bucket") },
          { id: "destination", header: "Destination", cell: (item) => { const dest = item.StorageClassAnalysis?.DataExport?.Destination?.S3BucketDestination; return dest ? `s3://${dest.Bucket?.replace("arn:aws:s3:::", "")}/${dest.Prefix ?? ""}` : "-" } },
        ]}
        empty={<EmptyState title="There are no analytics configurations." action={<Button onClick={() => setForm({ id: "", prefix: "", destination: "" })}>Create configuration</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled disabledReason="Delete the configuration and create it again to change it.">Edit</Button>
            <Button
              disabled={!selected[0]}
              onClick={async () => {
                await s3Request("s3", "DeleteBucketAnalyticsConfiguration", { Bucket: bucket, Id: selected[0].Id })
                setSelected([])
                await analytics.refetch()
                flash.success("Successfully deleted analytics configuration.")
              }}
            >
              Delete
            </Button>
            <Button onClick={() => setForm({ id: "", prefix: "", destination: "" })}>Create analytics configuration</Button>
          </SpaceBetween>
        }
      />
      <Section
        title="Replication metrics"
        description={<>You can monitor the total number and size of objects pending replication, the maximum replication time to the destination Region, and replication failures. <LearnMore href={docs("repl-metrics.html")} /></>}
      >
        <Alert type="info" header="Replication metrics are not available for this bucket" action={<Button href={`/s3/buckets/${encodeURIComponent(bucket)}?tab=management`} onFollow={follow}>View replication rules</Button>}>
          To receive replication metrics, choose View replication rules and enable replication metrics for at least 1 rule in your replication configuration.
        </Alert>
      </Section>
      <EditModal
        visible={form !== null}
        title="Create analytics configuration"
        saveLabel="Create configuration"
        onDismiss={() => setForm(null)}
        success="Successfully created analytics configuration."
        onSave={async () => {
          if (!form?.id) throw new Error("Enter a configuration name.")
          const match = /^s3:\/\/([^/]+)\/?(.*)$/.exec(form.destination)
          await s3Request("s3", "PutBucketAnalyticsConfiguration", {
            Bucket: bucket,
            Id: form.id,
            AnalyticsConfiguration: {
              Id: form.id,
              ...(form.prefix ? { Filter: { Prefix: form.prefix } } : {}),
              StorageClassAnalysis: match ? { DataExport: { OutputSchemaVersion: "V_1", Destination: { S3BucketDestination: { Format: "CSV", Bucket: `arn:aws:s3:::${match[1]}`, Prefix: match[2] || undefined } } } } : {},
            },
          })
          await analytics.refetch()
        }}
      >
        {form && (
          <SpaceBetween size="m">
            <FormField label="Name"><Input value={form.id} onChange={({ detail }) => setForm({ ...form, id: detail.value })} /></FormField>
            <FormField label={<>Prefix - <i>optional</i></>}><Input value={form.prefix} onChange={({ detail }) => setForm({ ...form, prefix: detail.value })} /></FormField>
            <FormField label={<>Export destination - <i>optional</i></>} constraintText="Format: s3://bucket/prefix"><Input value={form.destination} onChange={({ detail }) => setForm({ ...form, destination: detail.value })} /></FormField>
          </SpaceBetween>
        )}
      </EditModal>
    </SpaceBetween>
  )
}

type FileSystem = { fileSystemId?: string; name?: string; status?: string; creationTime?: string; bucket?: string; fileSystemArn?: string }

export function BucketFileSystemsTab({ bucket }: { bucket: string }) {
  const follow = useFollow()
  const systems = useS3<{ fileSystems?: FileSystem[] }>("s3files", "ListFileSystems", { bucket: `arn:aws:s3:::${bucket}` })
  const items = systems.data?.fileSystems ?? []
  const [selected, setSelected] = useState<FileSystem[]>([])
  return (
    <SpaceBetween size="l">
      <Steps
        title="Getting started with S3 Files"
        intro={<>Amazon S3 Files is a high-performance file system that seamlessly connects any AWS compute resource with Amazon S3. <LearnMore href={docs("s3-files.html")} /></>}
        steps={[
          { title: "Step 1: Create a file system", body: "Create a file system for your S3 bucket or prefix." },
          { title: "Step 2: Mount the file system", body: "Mount your file system to any AWS compute service." },
          { title: "Step 3: Start accessing your S3 data right away as files and directories", body: "S3 Files provides high performance shared file system access, where its files and directories reflect what's in your S3 bucket." },
        ]}
      />
      <ResourceTable<FileSystem>
        title="File systems"
        variant="container"
        info={false}
        description="Amazon S3 Files is a high-performance shared file system to access S3 data from any AWS compute service."
        items={items}
        loading={systems.isPending}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="fileSystemId"
        columns={[
          { id: "id", header: "File system ID", value: (item) => item.fileSystemId, cell: (item) => item.fileSystemId },
          { id: "name", header: "Name", value: (item) => item.name, cell: (item) => item.name ?? "-" },
          { id: "status", header: "Status", value: (item) => item.status, cell: (item) => <StatusIndicator type={item.status === "available" ? "success" : "pending"}>{item.status}</StatusIndicator> },
          { id: "created", header: "Creation date", value: (item) => item.creationTime, cell: (item) => consoleDate(item.creationTime) },
        ]}
        empty={<EmptyState title="You don't have any file systems." action={<Button href={`/s3/fs?bucket=${encodeURIComponent(bucket)}`} onFollow={follow}>Create file system</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled={!selected[0]} href="/s3/fs" onFollow={follow}>View details</Button>
            <Button
              disabled={!selected[0]}
              onClick={async () => {
                await s3Request("s3files", "DeleteFileSystem", { fileSystemId: selected[0].fileSystemId })
                setSelected([])
                await systems.refetch()
                flash.success("Successfully deleted file system.")
              }}
            >
              Delete
            </Button>
            <Button href={`/s3/fs?bucket=${encodeURIComponent(bucket)}`} onFollow={follow}>Create file system</Button>
          </SpaceBetween>
        }
      />
    </SpaceBetween>
  )
}

export type AccessPoint = {
  Name?: string
  Alias?: string
  NetworkOrigin?: string
  VpcConfiguration?: { VpcId?: string }
  BucketAccountId?: string
  Bucket?: string
  AccessPointArn?: string
}

export function useAccessPoints(bucket?: string) {
  const environment = useS3Environment()
  const account = environment.data?.account
  const query = useS3<{ AccessPointList?: AccessPoint[] }>("s3control", "ListAccessPoints", { AccountId: account, ...(bucket ? { Bucket: bucket } : {}) }, { enabled: Boolean(account) })
  return { ...query, account }
}

export function AccessPointsTable({ bucket, variant = "container" }: { bucket?: string; variant?: "container" | "full-page" }) {
  const follow = useFollow()
  const environment = useS3Environment()
  const region = environment.data?.region ?? "ap-southeast-7"
  const points = useAccessPoints(bucket)
  const items = points.data?.AccessPointList ?? []
  const [selected, setSelected] = useState<AccessPoint[]>([])
  const [policy, setPolicy] = useState<string | null>(null)
  const current = selected[0]
  const createHref = `/s3/ap/create${bucket ? `?bucket=${encodeURIComponent(bucket)}` : ""}`
  return (
    <>
      <ResourceTable<AccessPoint>
        title={bucket ? "Access Points for general purpose buckets" : "Access Points"}
        variant={variant}
        info={false}
        items={items}
        loading={points.isPending && points.fetchStatus !== "idle"}
        error={points.error}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="Name"
        filterPlaceholder="Find access points by name"
        columns={[
          { id: "name", header: "Name", value: (item) => item.Name, cell: (item) => item.Name },
          ...(bucket ? [] : [{ id: "bucket", header: "Data source", value: (item: AccessPoint) => item.Bucket, cell: (item: AccessPoint) => item.Bucket }]),
          { id: "alias", header: "Access Point alias", value: (item) => item.Alias, cell: (item) => item.Alias ?? "-" },
          { id: "origin", header: "Network origin", value: (item) => item.NetworkOrigin, cell: (item) => item.NetworkOrigin ?? "-" },
          { id: "vpc", header: "VPC ID", value: (item) => item.VpcConfiguration?.VpcId, cell: (item) => item.VpcConfiguration?.VpcId ?? "-" },
          { id: "owner", header: "Bucket owner account ID", value: (item) => item.BucketAccountId, cell: (item) => item.BucketAccountId ?? points.account ?? "-" },
        ]}
        empty={
          <EmptyState
            title={`You don't have any access points in the ${regionName(region)} ${region} Region`}
            action={<Button href={createHref} onFollow={follow}>Create access point</Button>}
          />
        }
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              iconName="copy"
              disabled={!current}
              onClick={() => {
                const arn = current?.AccessPointArn ?? `arn:aws:s3:${region}:${points.account}:accesspoint/${current?.Name}`
                void copyText(arn)
                flash.success(`ARN copied: ${arn}`)
              }}
            >
              Copy ARN
            </Button>
            <Button
              disabled={!current}
              onClick={async () => {
                const result = await s3Request<{ Policy?: string }>("s3control", "GetAccessPointPolicy", { AccountId: points.account, Name: current?.Name }).catch(() => ({ data: undefined }))
                setPolicy(pretty(result.data?.Policy) || JSON.stringify({ Version: "2012-10-17", Statement: [] }, null, 2))
              }}
            >
              Edit policy
            </Button>
            <Button
              disabled={!current}
              onClick={async () => {
                await s3Request("s3control", "DeleteAccessPoint", { AccountId: points.account, Name: current?.Name })
                setSelected([])
                await points.refetch()
                flash.success(`Successfully deleted access point "${current?.Name}".`)
              }}
            >
              Delete
            </Button>
            <Button variant={variant === "full-page" ? "primary" : "normal"} href={createHref} onFollow={follow}>
              Create access point
            </Button>
          </SpaceBetween>
        }
      />
      <EditModal
        visible={policy !== null}
        size="large"
        title={`Edit access point policy: ${current?.Name ?? ""}`}
        onDismiss={() => setPolicy(null)}
        success="Successfully edited access point policy."
        onSave={() => s3Request("s3control", "PutAccessPointPolicy", { AccountId: points.account, Name: current?.Name, Policy: JSON.stringify(JSON.parse(policy ?? "{}")) })}
      >
        <JsonField value={policy ?? ""} onChange={setPolicy} />
      </EditModal>
    </>
  )
}

export function BucketAccessPointsTab({ bucket }: { bucket: string }) {
  return <AccessPointsTable bucket={bucket} />
}
