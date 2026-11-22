"use client"

import Alert from "@cloudscape-design/components/alert"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
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
import { s3Request, useInvalidate, useS3 } from "@/components/s3/s3-hooks"
import { consoleDate, copyText } from "@/lib/format"

type VectorBucket = { vectorBucketName?: string; vectorBucketArn?: string; creationTime?: string; encryptionConfiguration?: { sseType?: string; kmsKeyArn?: string } }
type VectorIndex = { indexName?: string; indexArn?: string; creationTime?: string; dataType?: string; dimension?: number; distanceMetric?: string }

const docs = "https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors.html"

export function VectorBucketsPage() {
  const follow = useFollow()
  const buckets = useS3<{ vectorBuckets?: VectorBucket[] }>("s3vectors", "ListVectorBuckets", {})
  const [selected, setSelected] = useState<VectorBucket[]>([])
  const [deleting, setDeleting] = useState(false)
  const current = selected[0]
  return (
    <S3Layout breadcrumbs={[{ text: "Vector buckets", href: "/s3/vectors" }]} contentType="table">
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>}>Vector buckets</Header>}>
        <ResourceTable<VectorBucket>
          title="Vector buckets"
          variant="container"
          description={<>Vector buckets are optimized for storing and querying vectors. <LearnMore href={docs} /></>}
          items={buckets.data?.vectorBuckets ?? []}
          loading={buckets.isPending}
          error={buckets.error}
          selectionType="single"
          selectedItems={selected}
          onSelectionChange={setSelected}
          trackBy="vectorBucketName"
          filterPlaceholder="Find vector buckets"
          columns={[
            { id: "name", header: "Name", value: (item) => item.vectorBucketName, cell: (item) => <Link href={`/s3/vectors/${encodeURIComponent(item.vectorBucketName ?? "")}`} onFollow={follow}>{item.vectorBucketName}</Link> },
            { id: "created", header: "Creation date", value: (item) => item.creationTime, cell: (item) => consoleDate(item.creationTime) },
            { id: "arn", header: "Amazon Resource Name (ARN)", value: (item) => item.vectorBucketArn, cell: (item) => item.vectorBucketArn },
          ]}
          empty={<EmptyState title="No vector buckets" subtitle="You don’t have any vector buckets in this Region." action={<Button href="/s3/vectors/create-bucket" onFollow={follow}>Create vector bucket</Button>} />}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button disabled={!current} onClick={() => setDeleting(true)}>Delete</Button>
              <Button variant="primary" href="/s3/vectors/create-bucket" onFollow={follow}>Create vector bucket</Button>
            </SpaceBetween>
          }
        />
      </ContentLayout>
      <EditModal
        visible={deleting}
        title={`Delete vector bucket "${current?.vectorBucketName}"?`}
        saveLabel="Delete"
        onDismiss={() => setDeleting(false)}
        success={`Successfully deleted vector bucket "${current?.vectorBucketName}".`}
        onSave={async () => {
          await s3Request("s3vectors", "DeleteVectorBucket", { vectorBucketName: current?.vectorBucketName })
          setSelected([])
          await buckets.refetch()
        }}
      >
        <Alert type="warning">Vector buckets must have no vector indexes before they can be deleted. This can&apos;t be undone.</Alert>
      </EditModal>
    </S3Layout>
  )
}

export function CreateVectorBucketPage() {
  const router = useRouter()
  const invalidate = useInvalidate()
  const [name, setName] = useState("")
  const [sse, setSse] = useState("default")
  const [type, setType] = useState("AES256")
  const [kms, setKms] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <S3Layout breadcrumbs={[{ text: "Vector buckets", href: "/s3/vectors" }, { text: "Create vector bucket", href: "/s3/vectors/create-bucket" }]} contentType="form">
      <Form
        header={<Header variant="h1" info={<Link variant="info">Info</Link>} description={<>Vector buckets are optimized for storing and querying vectors. <LearnMore href={docs} /></>}>Create vector bucket</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push("/s3/vectors")}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={async () => {
                setSaving(true)
                setError(undefined)
                try {
                  const validTags = tags.filter((tag) => tag.Key)
                  await s3Request("s3vectors", "CreateVectorBucket", {
                    vectorBucketName: name,
                    ...(sse === "specify" ? { encryptionConfiguration: { sseType: type, ...(type === "aws:kms" ? { kmsKeyArn: kms } : {}) } } : {}),
                    ...(validTags.length ? { tags: Object.fromEntries(validTags.map((tag) => [tag.Key, tag.Value ?? ""])) } : {}),
                  })
                  await invalidate()
                  flash.success(`Successfully created vector bucket "${name}".`)
                  router.push("/s3/vectors")
                } catch (caught) {
                  setError(errorMessage(caught))
                } finally {
                  setSaving(false)
                }
              }}
            >
              Create vector bucket
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">General configuration</Header>}>
            <FormField label="Vector bucket name" constraintText="Vector bucket names must be 3 to 63 characters and unique within the account for this AWS Region." stretch>
              <Input value={name} onChange={({ detail }) => setName(detail.value)} />
            </FormField>
          </Container>
          <Container header={<Header variant="h2" description="Server-side encryption is automatically applied to new vectors stored in this vector bucket.">Encryption</Header>}>
            <SpaceBetween size="m">
              <Alert type="info">Encryption settings can&apos;t be changed after the vector bucket is created.</Alert>
              <FormField label="Server-side encryption">
                <RadioGroup
                  value={sse}
                  onChange={({ detail }) => setSse(detail.value)}
                  items={[
                    { value: "default", label: "Don't specify encryption type", description: "Server-side encryption with Amazon S3 managed keys (SSE-S3) is used by default when encryption type is not specified." },
                    { value: "specify", label: "Specify encryption type" },
                  ]}
                />
              </FormField>
              {sse === "specify" && (
                <>
                  <FormField label="Encryption type">
                    <RadioGroup value={type} onChange={({ detail }) => setType(detail.value)} items={[{ value: "AES256", label: "Server-side encryption with Amazon S3 managed keys (SSE-S3)" }, { value: "aws:kms", label: "Server-side encryption with AWS Key Management Service keys (SSE-KMS)" }]} />
                  </FormField>
                  {type === "aws:kms" && (
                    <FormField label="AWS KMS key ARN" stretch><Input value={kms} onChange={({ detail }) => setKms(detail.value)} /></FormField>
                  )}
                </>
              )}
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2" description="You can organize and specify permissions for your vector buckets with tags.">Tags - <i>optional</i></Header>}>
            <TagEditor tags={tags} onChange={setTags} emptyText="No tags associated with this vector bucket." />
          </Container>
        </SpaceBetween>
      </Form>
    </S3Layout>
  )
}

export function VectorBucketDetailPage({ name }: { name: string }) {
  const bucket = useS3<{ vectorBucket?: VectorBucket }>("s3vectors", "GetVectorBucket", { vectorBucketName: name })
  const indexes = useS3<{ indexes?: VectorIndex[] }>("s3vectors", "ListIndexes", { vectorBucketName: name })
  const policy = useS3<{ policy?: string }>("s3vectors", "GetVectorBucketPolicy", { vectorBucketName: name })
  const info = bucket.data?.vectorBucket
  const [selected, setSelected] = useState<VectorIndex[]>([])
  const [modal, setModal] = useState<string>()
  const [form, setForm] = useState({ index: "", dimension: "1024", metric: "cosine", policy: "" })
  return (
    <S3Layout breadcrumbs={[{ text: "Vector buckets", href: "/s3/vectors" }, { text: name, href: `/s3/vectors/${encodeURIComponent(name)}` }]}>
      <ContentLayout
        header={
          <Header variant="h1" info={<Link variant="info">Info</Link>} actions={<Button iconName="copy" onClick={() => { const arn = info?.vectorBucketArn ?? ""; void copyText(arn); flash.success(`ARN copied: ${arn}`) }}>Copy ARN</Button>}>
            {name}
          </Header>
        }
      >
        <SpaceBetween size="l">
          <Section
            title="Vector bucket overview"
            columns={3}
            items={[
              { label: "Amazon Resource Name (ARN)", value: info?.vectorBucketArn ?? "-" },
              { label: "Creation date", value: consoleDate(info?.creationTime) },
              { label: "Encryption type", value: info?.encryptionConfiguration?.sseType === "aws:kms" ? "SSE-KMS" : "SSE-S3" },
            ]}
          />
          <Tabs
            tabs={[
              {
                id: "indexes",
                label: "Vector indexes",
                content: (
                  <ResourceTable<VectorIndex>
                    title="Vector indexes"
                    variant="container"
                    items={indexes.data?.indexes ?? []}
                    loading={indexes.isPending}
                    selectionType="single"
                    selectedItems={selected}
                    onSelectionChange={setSelected}
                    trackBy="indexName"
                    columns={[
                      { id: "name", header: "Name", value: (item) => item.indexName, cell: (item) => item.indexName },
                      { id: "created", header: "Creation date", value: (item) => item.creationTime, cell: (item) => consoleDate(item.creationTime) },
                      { id: "arn", header: "Amazon Resource Name (ARN)", value: (item) => item.indexArn, cell: (item) => item.indexArn },
                    ]}
                    empty={<EmptyState title="No vector indexes" action={<Button onClick={() => setModal("index")}>Create vector index</Button>} />}
                    actions={
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button
                          disabled={!selected[0]}
                          onClick={async () => {
                            await s3Request("s3vectors", "DeleteIndex", { vectorBucketName: name, indexName: selected[0].indexName }).then(
                              () => { flash.success(`Successfully deleted vector index "${selected[0].indexName}".`); setSelected([]); void indexes.refetch() },
                              (error) => flash.error(errorMessage(error)),
                            )
                          }}
                        >
                          Delete
                        </Button>
                        <Button variant="primary" onClick={() => setModal("index")}>Create vector index</Button>
                      </SpaceBetween>
                    }
                  />
                ),
              },
              {
                id: "permissions",
                label: "Permissions",
                content: (
                  <Section
                    title="Vector bucket policy"
                    actions={
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button onClick={() => { setForm({ ...form, policy: pretty(policy.data?.policy) || JSON.stringify({ Version: "2012-10-17", Statement: [] }, null, 2) }); setModal("policy") }}>Edit</Button>
                        <Button disabled={!policy.data?.policy} onClick={async () => { await s3Request("s3vectors", "DeleteVectorBucketPolicy", { vectorBucketName: name }); await policy.refetch(); flash.success("Successfully deleted vector bucket policy.") }}>Delete</Button>
                      </SpaceBetween>
                    }
                  >
                    <CodeView value={pretty(policy.data?.policy)} empty="No policy to display." />
                  </Section>
                ),
              },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      <EditModal
        visible={modal === "index"}
        title="Create vector index"
        saveLabel="Create vector index"
        onDismiss={() => setModal(undefined)}
        success="Successfully created vector index."
        onSave={async () => {
          await s3Request("s3vectors", "CreateIndex", { vectorBucketName: name, indexName: form.index, dataType: "float32", dimension: Number(form.dimension), distanceMetric: form.metric })
          await indexes.refetch()
        }}
      >
        <FormField label="Vector index name"><Input value={form.index} onChange={({ detail }) => setForm({ ...form, index: detail.value })} /></FormField>
        <FormField label="Dimension" constraintText="1 to 4,096"><Input type="number" value={form.dimension} onChange={({ detail }) => setForm({ ...form, dimension: detail.value })} /></FormField>
        <FormField label="Distance metric">
          <Select selectedOption={{ value: form.metric, label: form.metric === "cosine" ? "Cosine" : "Euclidean" }} onChange={({ detail }) => setForm({ ...form, metric: detail.selectedOption.value ?? "cosine" })} options={[{ value: "cosine", label: "Cosine" }, { value: "euclidean", label: "Euclidean" }]} />
        </FormField>
      </EditModal>
      <EditModal visible={modal === "policy"} size="large" title="Edit vector bucket policy" onDismiss={() => setModal(undefined)} success="Successfully edited vector bucket policy." onSave={async () => { await s3Request("s3vectors", "PutVectorBucketPolicy", { vectorBucketName: name, policy: JSON.stringify(JSON.parse(form.policy)) }); await policy.refetch() }}>
        <JsonField value={form.policy} onChange={(value) => setForm({ ...form, policy: value })} />
      </EditModal>
    </S3Layout>
  )
}
