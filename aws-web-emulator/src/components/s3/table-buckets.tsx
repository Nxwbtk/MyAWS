"use client"

import Alert from "@cloudscape-design/components/alert"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import SegmentedControl from "@cloudscape-design/components/segmented-control"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Tabs from "@cloudscape-design/components/tabs"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { CodeView, EditModal, JsonField, LearnMore, Section, pretty } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { S3Layout } from "@/components/s3/s3-app"
import { s3Request, useInvalidate, useS3, useS3Environment } from "@/components/s3/s3-hooks"
import { consoleDate, copyText } from "@/lib/format"
import { regionName } from "@/lib/service-meta"

type TableBucket = { arn?: string; name?: string; createdAt?: string; ownerAccountId?: string; type?: string; tableBucketId?: string }

const tablesDocs = "https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-tables.html"

export function TableBucketsPage() {
  const follow = useFollow()
  const environment = useS3Environment()
  const region = environment.data?.region ?? "ap-southeast-7"
  const buckets = useS3<{ tableBuckets?: TableBucket[] }>("s3tables", "ListTableBuckets", {})
  const [filter, setFilter] = useState("all")
  const items = (buckets.data?.tableBuckets ?? []).filter((item) => filter === "all" || (item.type ?? "customer") === filter)
  return (
    <S3Layout breadcrumbs={[{ text: "Table buckets", href: "/s3/table-buckets" }]} contentType="table">
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>} description="Table buckets provide storage that is optimized for analytics workloads.">Table buckets</Header>}>
        <SpaceBetween size="l">
          <Container
            header={
              <Header
                variant="h2"
                actions={<Button disabled disabledReason="AWS Glue is not available in the local emulator.">Enable integration</Button>}
                description="To grant permission to table buckets from AWS query engines such as Amazon Athena, Amazon Redshift, and Amazon EMR, table buckets must be integrated with AWS analytics services."
              >
                Integration with AWS analytics services
              </Header>
            }
          >
            <KeyValuePairs items={[{ label: `Integration status for the ${regionName(region)} ${region} Region`, value: "Disabled" }]} />
          </Container>
          <ResourceTable<TableBucket>
            title="Table buckets"
            variant="container"
            description={<>Use tables to store, manage, and access structured data in S3. <LearnMore href={tablesDocs} /></>}
            items={items}
            loading={buckets.isPending}
            error={buckets.error}
            trackBy="arn"
            filterPlaceholder="Find table buckets"
            columns={[
              { id: "name", header: "Name", value: (item) => item.name, cell: (item) => <Link href={`/s3/table-buckets/${encodeURIComponent(item.arn ?? "")}`} onFollow={follow}>{item.name}</Link> },
              { id: "type", header: "Type", value: (item) => item.type, cell: (item) => (item.type === "aws" ? "AWS managed" : "Customer managed") },
              { id: "created", header: "Creation date", value: (item) => item.createdAt, cell: (item) => consoleDate(item.createdAt) },
              { id: "arn", header: "Amazon Resource Name (ARN)", value: (item) => item.arn, cell: (item) => item.arn },
            ]}
            empty={<EmptyState title="No table buckets" subtitle={`You don't have any table buckets in the ${regionName(region)} ${region} Region.`} />}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <SegmentedControl
                  selectedId={filter}
                  onChange={({ detail }) => setFilter(detail.selectedId)}
                  options={[{ id: "all", text: "All" }, { id: "customer", text: "Customer managed" }, { id: "aws", text: "AWS managed" }]}
                />
                <Button variant="primary" href="/s3/table-buckets/create" onFollow={follow}>Create table bucket</Button>
              </SpaceBetween>
            }
          />
          <Alert type="info">To delete a table bucket, use the AWS CLI, AWS SDKs, or Amazon S3 REST API, or choose Delete on the table bucket details page.</Alert>
        </SpaceBetween>
      </ContentLayout>
    </S3Layout>
  )
}

export function CreateTableBucketPage() {
  const router = useRouter()
  const invalidate = useInvalidate()
  const [name, setName] = useState("")
  const [storageClass, setStorageClass] = useState("none")
  const [sse, setSse] = useState("disable")
  const [kms, setKms] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [submitted, setSubmitted] = useState(false)
  const nameError = submitted && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name) ? "Table bucket names must be 3 to 63 characters. Valid characters are a-z, 0-9, and hyphens (-)." : undefined
  return (
    <S3Layout breadcrumbs={[{ text: "Table buckets", href: "/s3/table-buckets" }, { text: "Create table bucket", href: "/s3/table-buckets/create" }]} contentType="form">
      <Form
        header={<Header variant="h1" info={<Link variant="info">Info</Link>} description="Create a new table bucket to store your S3 Tables data.">Create table bucket</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push("/s3/table-buckets")}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={async () => {
                setSubmitted(true)
                if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name)) return
                setSaving(true)
                setError(undefined)
                try {
                  const validTags = tags.filter((tag) => tag.Key)
                  await s3Request("s3tables", "CreateTableBucket", {
                    name,
                    ...(sse === "enable" ? { encryptionConfiguration: { sseAlgorithm: "aws:kms", kmsKeyArn: kms } } : {}),
                    ...(storageClass !== "none" ? { storageClassConfiguration: { storageClass } } : {}),
                    ...(validTags.length ? { tags: Object.fromEntries(validTags.map((tag) => [tag.Key, tag.Value ?? ""])) } : {}),
                  })
                  await invalidate()
                  flash.success(`Successfully created table bucket "${name}".`)
                  router.push("/s3/table-buckets")
                } catch (caught) {
                  setError(errorMessage(caught))
                } finally {
                  setSaving(false)
                }
              }}
            >
              Create table bucket
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">General configuration</Header>}>
            <FormField label="Table bucket name" errorText={nameError} constraintText="Table bucket names must be 3 to 63 characters and unique within the account for this AWS Region. Valid characters are a-z, 0-9, and hyphens (-)." stretch>
              <Input value={name} placeholder="amzn-s3-demo-table-bucket" onChange={({ detail }) => setName(detail.value)} />
            </FormField>
          </Container>
          <Container header={<Header variant="h2" description="To access table buckets from AWS query engines, table buckets must be integrated with AWS analytics services. This integration uses the AWS Glue service and might incur Glue request costs.">Integration with AWS analytics services</Header>}>
            <SpaceBetween size="s">
              <KeyValuePairs items={[{ label: "Integration status", value: "Disabled" }]} />
              <Button disabled disabledReason="AWS Glue is not available in the local emulator.">Enable integration</Button>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2" description="S3 offers multiple storage classes designed for different use cases. The default storage class applies to all new tables created in the table bucket unless otherwise specified.">Default storage class</Header>}>
            <FormField label="Storage class">
              <RadioGroup
                value={storageClass}
                onChange={({ detail }) => setStorageClass(detail.value)}
                items={[
                  { value: "none", label: "Don't specify", description: "The standard storage class is used by default by the API when storage class is not specified." },
                  { value: "STANDARD", label: "Standard", description: "Used for frequently accessed data (more than once a month) with millisecond access." },
                  { value: "INTELLIGENT_TIERING", label: "Intelligent-Tiering", description: "Used for data with changing or unknown access patterns. Continuously monitors access to optimize costs." },
                ]}
              />
            </FormField>
          </Container>
          <Container header={<Header variant="h2" description="Server-side encryption is automatically applied to new tables created in this table bucket.">Default encryption</Header>}>
            <SpaceBetween size="m">
              <FormField label="Server-side encryption">
                <RadioGroup
                  value={sse}
                  onChange={({ detail }) => setSse(detail.value)}
                  items={[
                    { value: "disable", label: "Disable", description: "Server-side encryption with Amazon S3 managed keys (SSE-S3) is used by default." },
                    { value: "enable", label: "Enable", description: "The specified AWS KMS key is used to encrypt tables before storing them in Amazon S3." },
                  ]}
                />
              </FormField>
              {sse === "enable" && (
                <FormField label="AWS KMS key ARN" stretch>
                  <Input value={kms} placeholder="arn:aws:kms:region:account-id:key/key-id" onChange={({ detail }) => setKms(detail.value)} />
                </FormField>
              )}
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2" description="You can organize and specify permissions for your table bucket with tags.">Tags - <i>optional</i></Header>}>
            <TagEditor tags={tags} onChange={setTags} emptyText="No tags associated with this table bucket." />
          </Container>
        </SpaceBetween>
      </Form>
    </S3Layout>
  )
}

type Namespace = { namespace?: string[]; createdAt?: string; createdBy?: string; namespaceId?: string }
type Table = { name?: string; namespace?: string[]; type?: string; tableARN?: string; createdAt?: string; modifiedAt?: string }

export function TableBucketDetailPage({ arn }: { arn: string }) {
  const router = useRouter()
  const bucket = useS3<TableBucket>("s3tables", "GetTableBucket", { tableBucketARN: arn })
  const namespaces = useS3<{ namespaces?: Namespace[] }>("s3tables", "ListNamespaces", { tableBucketARN: arn })
  const tables = useS3<{ tables?: Table[] }>("s3tables", "ListTables", { tableBucketARN: arn })
  const encryption = useS3<{ encryptionConfiguration?: { sseAlgorithm?: string; kmsKeyArn?: string } }>("s3tables", "GetTableBucketEncryption", { tableBucketARN: arn })
  const maintenance = useS3<{ configuration?: Record<string, { status?: string }> }>("s3tables", "GetTableBucketMaintenanceConfiguration", { tableBucketARN: arn })
  const policy = useS3<{ resourcePolicy?: string }>("s3tables", "GetTableBucketPolicy", { tableBucketARN: arn })
  const name = bucket.data?.name ?? arn.split("/").pop() ?? arn
  const [tab, setTab] = useState("tables")
  const [modal, setModal] = useState<string>()
  const [form, setForm] = useState({ namespace: "", table: "", newNamespace: "", policy: "" })
  const [selectedTables, setSelectedTables] = useState<Table[]>([])
  const [selectedNamespaces, setSelectedNamespaces] = useState<Namespace[]>([])

  return (
    <S3Layout breadcrumbs={[{ text: "Table buckets", href: "/s3/table-buckets" }, { text: name, href: `/s3/table-buckets/${encodeURIComponent(arn)}` }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="copy" onClick={() => { void copyText(arn); flash.success(`ARN copied: ${arn}`) }}>Copy ARN</Button>
                <Button onClick={() => setModal("delete")}>Delete</Button>
              </SpaceBetween>
            }
          >
            {name}
          </Header>
        }
      >
        <SpaceBetween size="l">
          <Section
            title="Table bucket overview"
            columns={3}
            items={[
              { label: "AWS Region", value: arn.split(":")[3] ?? "-" },
              { label: "Amazon Resource Name (ARN)", value: arn },
              { label: "Creation date", value: consoleDate(bucket.data?.createdAt) },
            ]}
          />
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => setTab(detail.activeTabId)}
            tabs={[
              {
                id: "tables",
                label: "Tables",
                content: (
                  <ResourceTable<Table>
                    title="Tables"
                    variant="container"
                    items={tables.data?.tables ?? []}
                    loading={tables.isPending}
                    selectionType="single"
                    selectedItems={selectedTables}
                    onSelectionChange={setSelectedTables}
                    trackBy="tableARN"
                    filterPlaceholder="Find tables"
                    columns={[
                      { id: "name", header: "Name", value: (item) => item.name, cell: (item) => item.name },
                      { id: "namespace", header: "Namespace", value: (item) => item.namespace?.join("."), cell: (item) => item.namespace?.join(".") },
                      { id: "type", header: "Type", value: (item) => item.type, cell: (item) => item.type ?? "customer" },
                      { id: "created", header: "Creation date", value: (item) => item.createdAt, cell: (item) => consoleDate(item.createdAt) },
                      { id: "arn", header: "Table ARN", value: (item) => item.tableARN, cell: (item) => item.tableARN },
                    ]}
                    empty={<EmptyState title="No tables" subtitle="You don't have any tables in this table bucket." />}
                    actions={
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button
                          disabled={!selectedTables[0]}
                          onClick={async () => {
                            const table = selectedTables[0]
                            await s3Request("s3tables", "DeleteTable", { tableBucketARN: arn, namespace: table.namespace?.[0], name: table.name }).then(
                              () => { flash.success(`Successfully deleted table "${table.name}".`); void tables.refetch(); setSelectedTables([]) },
                              (error) => flash.error(errorMessage(error)),
                            )
                          }}
                        >
                          Delete
                        </Button>
                        <Button disabled disabledReason="Athena is not available in the local emulator.">Query table with Athena</Button>
                        <Button variant="primary" onClick={() => setModal("table")}>Create table</Button>
                      </SpaceBetween>
                    }
                  />
                ),
              },
              {
                id: "namespaces",
                label: "Namespaces",
                content: (
                  <ResourceTable<Namespace>
                    title="Namespaces"
                    variant="container"
                    items={namespaces.data?.namespaces ?? []}
                    loading={namespaces.isPending}
                    selectionType="single"
                    selectedItems={selectedNamespaces}
                    onSelectionChange={setSelectedNamespaces}
                    trackBy={(item) => item.namespace?.join(".") ?? ""}
                    columns={[
                      { id: "name", header: "Name", value: (item) => item.namespace?.join("."), cell: (item) => item.namespace?.join(".") },
                      { id: "created", header: "Creation date", value: (item) => item.createdAt, cell: (item) => consoleDate(item.createdAt) },
                      { id: "by", header: "Created by", value: (item) => item.createdBy, cell: (item) => item.createdBy ?? "-" },
                    ]}
                    empty={<EmptyState title="No namespaces" />}
                    actions={
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button
                          disabled={!selectedNamespaces[0]}
                          onClick={async () => {
                            const ns = selectedNamespaces[0].namespace?.[0]
                            await s3Request("s3tables", "DeleteNamespace", { tableBucketARN: arn, namespace: ns }).then(
                              () => { flash.success(`Successfully deleted namespace "${ns}".`); void namespaces.refetch(); setSelectedNamespaces([]) },
                              (error) => flash.error(errorMessage(error)),
                            )
                          }}
                        >
                          Delete
                        </Button>
                        <Button variant="primary" onClick={() => setModal("namespace")}>Create namespace</Button>
                      </SpaceBetween>
                    }
                  />
                ),
              },
              {
                id: "properties",
                label: "Properties",
                content: (
                  <SpaceBetween size="l">
                    <Section title="Default encryption" items={[{ label: "Server-side encryption", value: encryption.data?.encryptionConfiguration?.sseAlgorithm === "aws:kms" ? `SSE-KMS (${encryption.data.encryptionConfiguration.kmsKeyArn})` : "Server-side encryption with Amazon S3 managed keys (SSE-S3)" }]} />
                    <Section
                      title="Maintenance"
                      description="Unreferenced file removal deletes files that are no longer referenced by any table snapshot."
                      items={Object.entries(maintenance.data?.configuration ?? {}).map(([key, value]) => ({ label: key, value: value.status ?? "-" }))}
                    />
                  </SpaceBetween>
                ),
              },
              {
                id: "permissions",
                label: "Permissions",
                content: (
                  <Section
                    title="Table bucket policy"
                    actions={
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button onClick={() => { setForm({ ...form, policy: pretty(policy.data?.resourcePolicy) || JSON.stringify({ Version: "2012-10-17", Statement: [] }, null, 2) }); setModal("policy") }}>Edit</Button>
                        <Button disabled={!policy.data?.resourcePolicy} onClick={async () => { await s3Request("s3tables", "DeleteTableBucketPolicy", { tableBucketARN: arn }); await policy.refetch(); flash.success("Successfully deleted table bucket policy.") }}>Delete</Button>
                      </SpaceBetween>
                    }
                  >
                    <CodeView value={pretty(policy.data?.resourcePolicy)} empty="No policy to display." />
                  </Section>
                ),
              },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      <EditModal visible={modal === "namespace"} title="Create namespace" saveLabel="Create namespace" onDismiss={() => setModal(undefined)} success="Successfully created namespace." onSave={async () => { await s3Request("s3tables", "CreateNamespace", { tableBucketARN: arn, namespace: [form.newNamespace] }); await namespaces.refetch() }}>
        <FormField label="Namespace name" constraintText="1 to 255 characters. Valid characters are a-z, 0-9, and underscores (_).">
          <Input value={form.newNamespace} onChange={({ detail }) => setForm({ ...form, newNamespace: detail.value })} />
        </FormField>
      </EditModal>
      <EditModal visible={modal === "table"} title="Create table" saveLabel="Create table" onDismiss={() => setModal(undefined)} success="Successfully created table." onSave={async () => { await s3Request("s3tables", "CreateTable", { tableBucketARN: arn, namespace: form.namespace, name: form.table, format: "ICEBERG" }); await tables.refetch() }}>
        <FormField label="Namespace">
          <Select
            selectedOption={form.namespace ? { value: form.namespace, label: form.namespace } : null}
            placeholder="Choose a namespace"
            onChange={({ detail }) => setForm({ ...form, namespace: detail.selectedOption.value ?? "" })}
            options={(namespaces.data?.namespaces ?? []).map((item) => ({ value: item.namespace?.[0], label: item.namespace?.join(".") }))}
          />
        </FormField>
        <FormField label="Table name"><Input value={form.table} onChange={({ detail }) => setForm({ ...form, table: detail.value })} /></FormField>
        <KeyValuePairs items={[{ label: "Format", value: "Apache Iceberg" }]} />
      </EditModal>
      <EditModal visible={modal === "policy"} size="large" title="Edit table bucket policy" onDismiss={() => setModal(undefined)} success="Successfully edited table bucket policy." onSave={async () => { await s3Request("s3tables", "PutTableBucketPolicy", { tableBucketARN: arn, resourcePolicy: JSON.stringify(JSON.parse(form.policy)) }); await policy.refetch() }}>
        <JsonField value={form.policy} onChange={(value) => setForm({ ...form, policy: value })} />
      </EditModal>
      <EditModal
        visible={modal === "delete"}
        title={`Delete table bucket "${name}"?`}
        saveLabel="Delete"
        onDismiss={() => setModal(undefined)}
        success={`Successfully deleted table bucket "${name}".`}
        onSave={async () => {
          await s3Request("s3tables", "DeleteTableBucket", { tableBucketARN: arn })
          router.push("/s3/table-buckets")
        }}
      >
        <Alert type="warning">Table buckets must be empty before they can be deleted. Deleting a table bucket can&apos;t be undone.</Alert>
      </EditModal>
    </S3Layout>
  )
}
