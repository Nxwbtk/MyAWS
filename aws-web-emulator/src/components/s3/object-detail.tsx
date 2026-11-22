"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, LearnMore, Section } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { bucketHref } from "@/components/s3/bucket-detail"
import {
  CopyMoveModal,
  DeleteObjectsModal,
  EditObjectsModal,
  RenameModal,
  TotalSizeModal,
  downloadObject,
  openObject,
  storageClassLabel,
  type S3Entry,
} from "@/components/s3/bucket-objects"
import { bucketRegionLabel } from "@/components/s3/buckets"
import { S3Layout } from "@/components/s3/s3-app"
import { s3Read, s3Request, unsupported, useInvalidate, useS3, useS3Environment } from "@/components/s3/s3-hooks"
import { consoleBytes, consoleDate, copyText } from "@/lib/format"

type Head = {
  ContentLength?: number
  LastModified?: string
  ETag?: string
  ContentType?: string
  StorageClass?: string
  ServerSideEncryption?: string
  SSEKMSKeyId?: string
  Metadata?: Record<string, string>
  ReplicationStatus?: string
  Expiration?: string
  VersionId?: string
  ChecksumCRC64NVME?: string
  ChecksumCRC32?: string
  ChecksumCRC32C?: string
  ChecksumSHA1?: string
  ChecksumSHA256?: string
  ChecksumType?: string
  CacheControl?: string
  ContentDisposition?: string
  ContentEncoding?: string
  ContentLanguage?: string
  ObjectLockMode?: string
  ObjectLockRetainUntilDate?: string
  ObjectLockLegalHoldStatus?: string
}

const encryptionLabels: Record<string, string> = {
  AES256: "Server-side encryption with Amazon S3 managed keys (SSE-S3)",
  "aws:kms": "Server-side encryption with AWS Key Management Service keys (SSE-KMS)",
  "aws:kms:dsse": "Dual-layer server-side encryption with AWS Key Management Service keys (DSSE-KMS)",
}

export function ObjectDetailPage({ bucket, objectKey, tab, versionId }: { bucket: string; objectKey: string; tab: string; versionId?: string }) {
  const router = useRouter()
  const invalidate = useInvalidate()
  const name = objectKey.split("/").filter(Boolean).at(-1) ?? objectKey
  const folder = objectKey.includes("/") ? objectKey.slice(0, objectKey.lastIndexOf("/") + 1) : ""
  const [modal, setModal] = useState<string>()
  const entry: S3Entry = { key: objectKey, name, folder: false, versionId }
  const uri = `s3://${bucket}/${objectKey}`
  const base = `/s3/object/${encodeURIComponent(bucket)}?prefix=${encodeURIComponent(objectKey)}${versionId ? `&versionId=${encodeURIComponent(versionId)}` : ""}`
  const parts = folder.split("/").filter(Boolean)

  return (
    <S3Layout
      breadcrumbs={[
        { text: "Buckets", href: "/s3/buckets" },
        { text: bucket, href: bucketHref(bucket) },
        ...parts.map((part, index) => ({ text: `${part}/`, href: bucketHref(bucket, "objects", `${parts.slice(0, index + 1).join("/")}/`) })),
        { text: name, href: base },
      ]}
    >
      <ContentLayout
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="copy" onClick={() => { void copyText(uri); flash.success(`S3 URI copied: ${uri}`) }}>Copy S3 URI</Button>
                <Button iconName="download" onClick={() => void downloadObject(bucket, objectKey, versionId).catch((error) => flash.error(errorMessage(error)))}>Download</Button>
                <Button iconName="external" iconAlign="right" onClick={() => void openObject(bucket, objectKey, versionId).catch((error) => flash.error(errorMessage(error)))}>Open</Button>
                <ButtonDropdown
                  items={[
                    { id: "download-as", text: "Download as" },
                    { id: "presign", text: "Share with a presigned URL", disabled: true, disabledReason: unsupported },
                    { id: "size", text: "Calculate total size" },
                    { id: "copy", text: "Copy" },
                    { id: "move", text: "Move" },
                    { id: "restore", text: "Initiate restore" },
                    { id: "select", text: "Query with S3 Select", disabled: true, disabledReason: unsupported },
                    { id: "delete", text: "Delete" },
                    {
                      id: "edit",
                      text: "Edit actions",
                      items: [
                        { id: "rename", text: "Rename object" },
                        { id: "storage", text: "Edit storage class" },
                        { id: "sse", text: "Edit server-side encryption" },
                        { id: "tags", text: "Edit tags" },
                        { id: "public-acl", text: "Make public using ACL", disabled: true, disabledReason: "Use the Permissions tab to edit the object ACL." },
                        { id: "public-tags", text: "Make public with tags", disabled: true, disabledReason: unsupported },
                      ],
                    },
                  ]}
                  onItemClick={({ detail }) => {
                    if (detail.id === "download-as") void downloadObject(bucket, objectKey, versionId).catch((error) => flash.error(errorMessage(error)))
                    else setModal(detail.id)
                  }}
                >
                  Object actions
                </ButtonDropdown>
              </SpaceBetween>
            }
          >
            {name}
          </Header>
        }
      >
        <Tabs
          activeTabId={tab}
          onChange={({ detail }) => router.push(`${base}&tab=${detail.activeTabId}`)}
          tabs={[
            { id: "properties", label: "Properties", content: tab === "properties" ? <ObjectProperties bucket={bucket} objectKey={objectKey} versionId={versionId} /> : null },
            { id: "permissions", label: "Permissions", content: tab === "permissions" ? <ObjectPermissions bucket={bucket} objectKey={objectKey} /> : null },
            { id: "versions", label: "Versions", content: tab === "versions" ? <ObjectVersions bucket={bucket} objectKey={objectKey} /> : null },
          ]}
        />
      </ContentLayout>
      <DeleteObjectsModal visible={modal === "delete"} bucket={bucket} entries={[entry]} versioned={Boolean(versionId)} onDismiss={() => setModal(undefined)} onDeleted={() => { setModal(undefined); void invalidate(); flash.success(`Successfully deleted "${name}".`); router.push(bucketHref(bucket, "objects", folder)) }} />
      <TotalSizeModal visible={modal === "size"} bucket={bucket} entries={[entry]} onDismiss={() => setModal(undefined)} />
      <CopyMoveModal visible={modal === "copy" || modal === "move"} mode={modal === "move" ? "move" : "copy"} bucket={bucket} entries={[entry]} onDismiss={() => setModal(undefined)} onDone={(message) => { setModal(undefined); void invalidate(); flash.success(message); if (modal === "move") router.push(bucketHref(bucket, "objects", folder)) }} />
      <RenameModal visible={modal === "rename"} bucket={bucket} entry={entry} onDismiss={() => setModal(undefined)} onDone={(next) => { setModal(undefined); void invalidate(); flash.success(`Successfully renamed object to "${next}".`); router.push(`/s3/object/${encodeURIComponent(bucket)}?prefix=${encodeURIComponent(folder + next)}`) }} />
      <EditObjectsModal visible={modal === "storage" || modal === "sse" || modal === "tags" || modal === "restore"} mode={(modal ?? "storage") as "storage" | "sse" | "tags" | "restore"} bucket={bucket} entries={[entry]} onDismiss={() => setModal(undefined)} onDone={(message) => { setModal(undefined); void invalidate(); flash.success(message) }} />
    </S3Layout>
  )
}

function ObjectProperties({ bucket, objectKey, versionId }: { bucket: string; objectKey: string; versionId?: string }) {
  const follow = useFollow()
  const environment = useS3Environment()
  const region = environment.data?.region ?? "ap-southeast-7"
  const version = versionId ? { VersionId: versionId } : {}
  const head = useS3<Head>("s3", "HeadObject", { Bucket: bucket, Key: objectKey, ChecksumMode: "ENABLED", ...version })
  const acl = useS3<{ Owner?: { ID?: string } }>("s3", "GetObjectAcl", { Bucket: bucket, Key: objectKey, ...version })
  const tagging = useS3<{ TagSet?: Tag[] }>("s3", "GetObjectTagging", { Bucket: bucket, Key: objectKey, ...version })
  const versioning = useS3<{ Status?: string }>("s3", "GetBucketVersioning", { Bucket: bucket })
  const lock = useS3<{ ObjectLockConfiguration?: { ObjectLockEnabled?: string } }>("s3", "GetObjectLockConfiguration", { Bucket: bucket })
  const data = head.data
  const [modal, setModal] = useState<string>()
  const [tags, setTags] = useState<Tag[]>([])
  const checksum = data?.ChecksumCRC64NVME ? ["CRC64NVME", data.ChecksumCRC64NVME] : data?.ChecksumCRC32 ? ["CRC32", data.ChecksumCRC32] : data?.ChecksumCRC32C ? ["CRC32C", data.ChecksumCRC32C] : data?.ChecksumSHA256 ? ["SHA256", data.ChecksumSHA256] : data?.ChecksumSHA1 ? ["SHA1", data.ChecksumSHA1] : undefined
  const type = objectKey.includes(".") ? objectKey.split(".").pop() : "-"
  const metadataRows = [
    ...(data?.ContentType ? [{ type: "System defined", key: "Content-Type", value: data.ContentType }] : []),
    ...(data?.CacheControl ? [{ type: "System defined", key: "Cache-Control", value: data.CacheControl }] : []),
    ...(data?.ContentDisposition ? [{ type: "System defined", key: "Content-Disposition", value: data.ContentDisposition }] : []),
    ...(data?.ContentEncoding ? [{ type: "System defined", key: "Content-Encoding", value: data.ContentEncoding }] : []),
    ...(data?.ContentLanguage ? [{ type: "System defined", key: "Content-Language", value: data.ContentLanguage }] : []),
    ...Object.entries(data?.Metadata ?? {}).map(([key, value]) => ({ type: "User defined", key: `x-amz-meta-${key}`, value })),
  ]
  if (head.error) return <Alert type="error">{errorMessage(head.error)}</Alert>
  return (
    <SpaceBetween size="l">
      <Section
        title="Object overview"
        columns={3}
        items={[
          { label: "Owner", value: acl.data?.Owner?.ID ?? "-" },
          { label: "AWS Region", value: bucketRegionLabel(region) },
          { label: "Last modified", value: consoleDate(data?.LastModified) },
          { label: "Size", value: consoleBytes(data?.ContentLength) },
          { label: "Type", value: type },
          { label: "Key", value: <SpaceBetween direction="horizontal" size="xxs"><Button variant="inline-icon" iconName="copy" ariaLabel="Copy key" onClick={() => void copyText(objectKey)} />{objectKey}</SpaceBetween> },
          { label: "S3 URI", value: `s3://${bucket}/${objectKey}` },
          { label: "Amazon Resource Name (ARN)", value: `arn:aws:s3:::${bucket}/${objectKey}` },
          { label: "Entity tag (Etag)", value: data?.ETag?.replaceAll('"', "") ?? "-" },
          { label: "Object URL", value: `https://${bucket}.s3.${region}.amazonaws.com/${objectKey}` },
          ...(versionId ? [{ label: "Version ID", value: versionId }] : []),
        ]}
      />
      <Section title="Object management overview" description="The following bucket properties and object management configurations impact the behavior of this object.">
        <SpaceBetween size="m">
          <Box variant="h3">Bucket properties</Box>
          <KeyValuePairs items={[{ label: "Bucket Versioning", value: versioning.data?.Status ?? "Disabled" }]} />
          {versioning.data?.Status !== "Enabled" && (
            <Alert type="info" header={`Bucket "${bucket}" doesn't have Bucket Versioning enabled`} action={<Button href={bucketHref(bucket, "properties")} onFollow={follow}>Enable Bucket Versioning</Button>}>
              We recommend that you enable Bucket Versioning to help protect against unintentionally overwriting or deleting objects. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html" />
            </Alert>
          )}
          <Box variant="h3">Management configurations</Box>
          <KeyValuePairs
            columns={3}
            items={[
              { label: "Replication status", value: <SpaceBetween size="xxs"><span>{data?.ReplicationStatus ?? "-"}</span><Link href={bucketHref(bucket, "management")} onFollow={follow}>View replication rules</Link></SpaceBetween> },
              { label: "Expiration rule", value: data?.Expiration ? /rule-id="([^"]+)"/.exec(data.Expiration)?.[1] ?? "-" : "-" },
              { label: "Expiration date", value: data?.Expiration ? consoleDate(/expiry-date="([^"]+)"/.exec(data.Expiration)?.[1]) : "-" },
            ]}
          />
        </SpaceBetween>
      </Section>
      <Section
        title="Storage class"
        description={<>Amazon S3 offers a range of storage classes designed for different use cases. <LearnMore href="https://aws.amazon.com/s3/storage-classes/" /></>}
        onEdit={() => setModal("storage")}
        items={[{ label: "Storage class", value: storageClassLabel(data?.StorageClass) }]}
      />
      <Section
        title="Server-side encryption settings"
        info
        description="Server-side encryption protects data at rest."
        onEdit={() => setModal("sse")}
        items={[
          { label: "Encryption type", value: encryptionLabels[data?.ServerSideEncryption ?? "AES256"] ?? data?.ServerSideEncryption },
          ...(data?.SSEKMSKeyId ? [{ label: "Encryption key ARN", value: data.SSEKMSKeyId }] : []),
        ]}
      />
      <Section
        title="Checksums"
        description={<>Checksums are used for data integrity verification of new objects. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html" /></>}
        columns={3}
        items={[
          { label: "Checksum function", value: checksum?.[0] ?? "-" },
          { label: "Checksum type", value: data?.ChecksumType === "COMPOSITE" ? "Composite" : checksum ? "Full object" : "-" },
          { label: "Checksum value", value: checksum?.[1] ?? "-" },
        ]}
      />
      <Container header={<Header variant="h2">Metadata - <i>optional</i></Header>}>
        <SpaceBetween size="l">
          <Table
            variant="embedded"
            header={
              <Header
                variant="h3"
                counter={`(${tagging.data?.TagSet?.length ?? 0})`}
                description={<>Track storage cost of other criteria by tagging your objects. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-tagging.html" /></>}
                actions={<Button onClick={() => { setTags(tagging.data?.TagSet ?? []); setModal("tags") }}>Edit</Button>}
              >
                Tags
              </Header>
            }
            items={tagging.data?.TagSet ?? []}
            columnDefinitions={[
              { id: "key", header: "Key", cell: (tag) => tag.Key },
              { id: "value", header: "Value", cell: (tag) => tag.Value || "-" },
            ]}
            empty={<Box textAlign="center" color="inherit">No tags associated with this resource.</Box>}
          />
          <Annotations bucket={bucket} objectKey={objectKey} />
          <Table
            variant="embedded"
            header={<Header variant="h3" counter={`(${metadataRows.length})`} description={<>System and user-defined metadata is optional information provided as a name-value (key-value) pair. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingMetadata.html" /></>}>System and user-defined</Header>}
            items={metadataRows}
            columnDefinitions={[
              { id: "type", header: "Type", cell: (row) => row.type },
              { id: "key", header: "Key", cell: (row) => row.key },
              { id: "value", header: "Value", cell: (row) => row.value },
            ]}
            empty={<Box textAlign="center" color="inherit">No metadata associated with this resource.</Box>}
          />
        </SpaceBetween>
      </Container>
      <Section
        title="Object Lock"
        description={<>Store objects using a write-once-read-many (WORM) model to help you prevent objects from being deleted or overwritten for a fixed amount of time or indefinitely. Object Lock works only in versioned buckets. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html" /></>}
        items={[
          { label: "Object Lock", value: lock.data?.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled" ? "Enabled" : "Disabled" },
          ...(data?.ObjectLockMode ? [{ label: "Retention mode", value: data.ObjectLockMode }, { label: "Retain until date", value: consoleDate(data.ObjectLockRetainUntilDate) }] : []),
          ...(data?.ObjectLockLegalHoldStatus ? [{ label: "Legal hold", value: data.ObjectLockLegalHoldStatus }] : []),
        ]}
      >
        {lock.data?.ObjectLockConfiguration?.ObjectLockEnabled !== "Enabled" && (
          <Alert type="info" action={<Button href={bucketHref(bucket, "properties")} onFollow={follow}>Edit Object Lock</Button>}>
            This bucket doesn&apos;t have Object Lock enabled. You can enable Object Lock for a versioned bucket under the bucket&apos;s properties tab.
          </Alert>
        )}
      </Section>
      <EditObjectsModal
        visible={modal === "storage" || modal === "sse"}
        mode={(modal === "sse" ? "sse" : "storage") as "storage" | "sse"}
        bucket={bucket}
        entries={[{ key: objectKey, name: objectKey, folder: false }]}
        onDismiss={() => setModal(undefined)}
        onDone={(message) => { setModal(undefined); void head.refetch(); flash.success(message) }}
      />
      <EditModal
        visible={modal === "tags"}
        size="large"
        title="Edit tags"
        onDismiss={() => setModal(undefined)}
        success="Successfully edited tags."
        onSave={async () => {
          const set = tags.filter((tag) => tag.Key)
          if (set.length) await s3Request("s3", "PutObjectTagging", { Bucket: bucket, Key: objectKey, ...version, Tagging: { TagSet: set } })
          else await s3Request("s3", "DeleteObjectTagging", { Bucket: bucket, Key: objectKey, ...version })
          await tagging.refetch()
        }}
      >
        <TagEditor tags={tags} onChange={setTags} limit={10} emptyText="No tags associated with this resource." />
      </EditModal>
    </SpaceBetween>
  )
}

type Annotation = { AnnotationName?: string; CreationDate?: string; LastModified?: string; Size?: number; ETag?: string; ChecksumAlgorithm?: string; ReplicationStatus?: string }

function Annotations({ bucket, objectKey }: { bucket: string; objectKey: string }) {
  const list = useS3<{ Annotations?: Annotation[] }>("s3", "ListObjectAnnotations", { Bucket: bucket, Key: objectKey })
  const items = list.data?.Annotations ?? []
  const [selected, setSelected] = useState<Annotation[]>([])
  const [form, setForm] = useState<{ name: string; body: string } | null>(null)
  return (
    <>
      <ResourceTable<Annotation>
        title="Annotations"
        variant="embedded"
        info={false}
        description={<>With annotations, you can define and query rich context about your S3 objects. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-annotations.html" /></>}
        items={items}
        loading={list.isPending}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="AnnotationName"
        columns={[
          { id: "name", header: "Annotation name", value: (item) => item.AnnotationName, cell: (item) => item.AnnotationName },
          { id: "created", header: "Creation date", value: (item) => item.CreationDate ?? item.LastModified, cell: (item) => consoleDate(item.CreationDate ?? item.LastModified) },
          { id: "size", header: "Size", value: (item) => item.Size, cell: (item) => consoleBytes(item.Size) },
          { id: "etag", header: "ETag", cell: (item) => item.ETag?.replaceAll('"', "") ?? "-" },
          { id: "checksum", header: "Checksum function", cell: (item) => item.ChecksumAlgorithm ?? "-" },
          { id: "replication", header: "Replication status", cell: (item) => item.ReplicationStatus ?? "-" },
          {
            id: "download",
            header: "Download",
            cell: (item) => (
              <Button
                variant="inline-link"
                onClick={async () => {
                  const result = await s3Read<{ Body?: string }>("s3", "GetObjectAnnotation", { Bucket: bucket, Key: objectKey, AnnotationName: item.AnnotationName }).catch((error) => {
                    flash.error(errorMessage(error))
                    return undefined
                  })
                  if (result) flash.info(<pre className="myaws-code-view">{JSON.stringify(result, null, 2)}</pre>, `Annotation ${item.AnnotationName}`)
                }}
              >
                Download
              </Button>
            ),
          },
        ]}
        empty={<EmptyState title="No annotations" action={<Button onClick={() => setForm({ name: "", body: "" })}>Add annotation</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              disabled={!selected[0]}
              onClick={async () => {
                await s3Request("s3", "DeleteObjectAnnotation", { Bucket: bucket, Key: objectKey, AnnotationName: selected[0].AnnotationName })
                setSelected([])
                await list.refetch()
                flash.success("Successfully deleted annotation.")
              }}
            >
              Delete
            </Button>
            <Button onClick={() => setForm({ name: "", body: "" })}>Add annotation</Button>
          </SpaceBetween>
        }
      />
      <EditModal
        visible={form !== null}
        size="large"
        title="Add annotation"
        saveLabel="Add annotation"
        onDismiss={() => setForm(null)}
        success="Successfully added annotation."
        onSave={async () => {
          if (!form?.name) throw new Error("Enter an annotation name.")
          await s3Request("s3", "PutObjectAnnotation", { Bucket: bucket, Key: objectKey, AnnotationName: form.name }, { uploads: { Body: new File([form.body], `${form.name}.json`, { type: "application/json" }) } })
          await list.refetch()
        }}
      >
        {form && (
          <SpaceBetween size="m">
            <FormField label="Annotation name"><Input value={form.name} onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
            <FormField label="Annotation content" stretch><Textarea rows={10} value={form.body} onChange={({ detail }) => setForm({ ...form, body: detail.value })} /></FormField>
          </SpaceBetween>
        )}
      </EditModal>
    </>
  )
}

function ObjectPermissions({ bucket, objectKey }: { bucket: string; objectKey: string }) {
  const acl = useS3<{ Owner?: { ID?: string }; Grants?: { Grantee?: { ID?: string; URI?: string }; Permission?: string }[] }>("s3", "GetObjectAcl", { Bucket: bucket, Key: objectKey })
  const ownership = useS3<{ OwnershipControls?: { Rules?: { ObjectOwnership?: string }[] } }>("s3", "GetBucketOwnershipControls", { Bucket: bucket })
  const enforced = (ownership.data?.OwnershipControls?.Rules?.[0]?.ObjectOwnership ?? "BucketOwnerEnforced") === "BucketOwnerEnforced"
  const grants = acl.data?.Grants ?? []
  const [open, setOpen] = useState(false)
  const [publicRead, setPublicRead] = useState(false)
  const perms = (match: (grant: (typeof grants)[number]) => boolean) => {
    const list = grants.filter(match).map((grant) => grant.Permission)
    return {
      object: list.includes("FULL_CONTROL") || list.includes("READ") ? "Read" : "-",
      acl: [list.includes("FULL_CONTROL") || list.includes("READ_ACP") ? "Read" : "", list.includes("FULL_CONTROL") || list.includes("WRITE_ACP") ? "Write" : ""].filter(Boolean).join(", ") || "-",
    }
  }
  const rows = [
    { grantee: "Object owner (your AWS account)", detail: `Canonical ID: ${acl.data?.Owner?.ID ?? "-"}`, ...perms((grant) => grant.Grantee?.ID === acl.data?.Owner?.ID) },
    { grantee: "Everyone (public access)", detail: "Group: http://acs.amazonaws.com/groups/global/AllUsers", ...perms((grant) => grant.Grantee?.URI?.endsWith("/AllUsers") ?? false) },
    { grantee: "Authenticated users group (anyone with an AWS account)", detail: "Group: http://acs.amazonaws.com/groups/global/AuthenticatedUsers", ...perms((grant) => grant.Grantee?.URI?.endsWith("/AuthenticatedUsers") ?? false) },
  ]
  return (
    <Section
      title="Access control list (ACL)"
      description={<>Grant basic read/write permissions to AWS accounts. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/acl-overview.html" /></>}
      onEdit={enforced ? undefined : () => { setPublicRead(rows[1].object === "Read"); setOpen(true) }}
      editDisabledReason={enforced ? "This bucket has the bucket owner enforced setting applied for Object Ownership." : undefined}
    >
      {enforced && (
        <Alert type="info" header="This bucket has the bucket owner enforced setting applied for Object Ownership">
          When bucket owner enforced is applied, use bucket policies to control access.
        </Alert>
      )}
      <Table
        variant="embedded"
        items={rows}
        columnDefinitions={[
          { id: "grantee", header: "Grantee", cell: (row) => <SpaceBetween size="xxs"><b>{row.grantee}</b><Box variant="small">{row.detail}</Box></SpaceBetween> },
          { id: "object", header: "Object", cell: (row) => row.object },
          { id: "acl", header: "Object ACL", cell: (row) => row.acl },
        ]}
      />
      <EditModal
        visible={open}
        title="Edit access control list (ACL)"
        onDismiss={() => setOpen(false)}
        success="Successfully edited object ACL."
        onSave={async () => {
          await s3Request("s3", "PutObjectAcl", { Bucket: bucket, Key: objectKey, ACL: publicRead ? "public-read" : "private" })
          await acl.refetch()
        }}
      >
        <FormField label="Everyone (public access)">
          <Button onClick={() => setPublicRead(!publicRead)}>{publicRead ? "Remove public read" : "Grant public read"}</Button>
        </FormField>
      </EditModal>
    </Section>
  )
}

function ObjectVersions({ bucket, objectKey }: { bucket: string; objectKey: string }) {
  const follow = useFollow()
  const invalidate = useInvalidate()
  const versioning = useS3<{ Status?: string }>("s3", "GetBucketVersioning", { Bucket: bucket })
  const versions = useQuery({
    queryKey: ["emulator", "s3", "object-versions", bucket, objectKey],
    queryFn: async () => {
      const page = await s3Read<{ Versions?: { Key?: string; VersionId?: string; IsLatest?: boolean; LastModified?: string; Size?: number; StorageClass?: string }[]; DeleteMarkers?: { Key?: string; VersionId?: string; IsLatest?: boolean; LastModified?: string }[] }>("s3", "ListObjectVersions", { Bucket: bucket, Prefix: objectKey })
      return [
        ...(page.Versions ?? []).filter((item) => item.Key === objectKey).map((item) => ({ ...item, marker: false })),
        ...(page.DeleteMarkers ?? []).filter((item) => item.Key === objectKey).map((item) => ({ ...item, Size: undefined, StorageClass: undefined, marker: true })),
      ]
    },
    enabled: versioning.data?.Status === "Enabled" || versioning.data?.Status === "Suspended",
  })
  type Row = NonNullable<typeof versions.data>[number]
  const [selected, setSelected] = useState<Row[]>([])
  const [deleting, setDeleting] = useState(false)
  const enabled = versioning.data?.Status === "Enabled" || versioning.data?.Status === "Suspended"
  const current = selected[0]
  return (
    <SpaceBetween size="l">
      {!enabled && (
        <Alert type="info" header={`Bucket "${bucket}" doesn't have Bucket Versioning enabled`} action={<Button href={bucketHref(bucket, "properties")} onFollow={follow}>Enable Bucket Versioning</Button>}>
          We recommend that you enable Bucket Versioning to help protect against unintentionally overwriting or deleting objects. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html" />
        </Alert>
      )}
      <ResourceTable<Row>
        title="Versions"
        variant="container"
        info={false}
        items={versions.data ?? []}
        loading={enabled && versions.isPending}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy={(row) => row.VersionId ?? "null"}
        columns={[
          {
            id: "version",
            header: "Version ID",
            value: (row) => row.VersionId,
            cell: (row) => (
              <Link href={`/s3/object/${encodeURIComponent(bucket)}?prefix=${encodeURIComponent(objectKey)}&versionId=${encodeURIComponent(row.VersionId ?? "null")}`} onFollow={follow}>
                {row.VersionId ?? "null"}{row.IsLatest ? " (Current version)" : ""}
              </Link>
            ),
          },
          { id: "type", header: "Type", cell: (row) => (row.marker ? "Delete marker" : objectKey.split(".").pop() ?? "-") },
          { id: "modified", header: "Last modified", value: (row) => row.LastModified, cell: (row) => consoleDate(row.LastModified) },
          { id: "size", header: "Size", value: (row) => row.Size, cell: (row) => (row.marker ? "-" : consoleBytes(row.Size)) },
          { id: "storage", header: "Storage class", cell: (row) => (row.marker ? "-" : storageClassLabel(row.StorageClass)) },
        ]}
        empty={<EmptyState title="No versions" subtitle={enabled ? "This object has no versions." : "This object has no versions to display because Bucket Versioning has not been enabled for this bucket."} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="download" disabled={!current || current.marker} onClick={() => current && void downloadObject(bucket, objectKey, current.VersionId).catch((error) => flash.error(errorMessage(error)))}>Download</Button>
            <Button iconName="external" iconAlign="right" disabled={!current || current.marker} onClick={() => current && void openObject(bucket, objectKey, current.VersionId).catch((error) => flash.error(errorMessage(error)))}>Open</Button>
            <Button disabled={!current} onClick={() => setDeleting(true)}>Delete</Button>
            <ButtonDropdown disabled items={[{ id: "restore", text: "Restore", disabledReason: unsupported }]}>Actions</ButtonDropdown>
          </SpaceBetween>
        }
      />
      <DeleteObjectsModal
        visible={deleting}
        bucket={bucket}
        entries={current ? [{ key: objectKey, name: objectKey, folder: false, versionId: current.VersionId }] : []}
        versioned
        onDismiss={() => setDeleting(false)}
        onDeleted={() => { setDeleting(false); setSelected([]); void invalidate(); void versions.refetch(); flash.success("Successfully deleted the object version.") }}
      />
    </SpaceBetween>
  )
}
