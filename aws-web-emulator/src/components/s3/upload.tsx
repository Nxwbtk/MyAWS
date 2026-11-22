"use client"

import Alert from "@cloudscape-design/components/alert"
import AttributeEditor from "@cloudscape-design/components/attribute-editor"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import ExpandableSection from "@cloudscape-design/components/expandable-section"
import FileDropzone from "@cloudscape-design/components/file-dropzone"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import ProgressBar from "@cloudscape-design/components/progress-bar"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { errorMessage } from "@/components/console/flash"
import { ResourceTable } from "@/components/console/resource-table"
import { LearnMore } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { bucketHref } from "@/components/s3/bucket-detail"
import { S3Layout } from "@/components/s3/s3-app"
import { useInvalidate, useS3 } from "@/components/s3/s3-hooks"
import { consoleBytes } from "@/lib/format"
import { uploadS3Object } from "@/lib/s3-client"

type Pending = { id: string; file: File; path: string }
type Result = { name: string; folder: string; type: string; size: number; status: "pending" | "uploading" | "succeeded" | "failed"; error?: string }

const storageRows = [
  { value: "STANDARD", label: "Standard", designed: "Frequently accessed data (more than once a month) with milliseconds access", bucketType: "General purpose", az: "≥ 3", duration: "-", size: "-", monitoring: "-", retrieval: "-" },
  { value: "INTELLIGENT_TIERING", label: "Intelligent-Tiering", designed: "Data with changing or unknown access patterns", bucketType: "General purpose", az: "≥ 3", duration: "-", size: "-", monitoring: "Per-object fees apply for objects >= 128 KB", retrieval: "-" },
  { value: "STANDARD_IA", label: "Standard-IA", designed: "Infrequently accessed data (once a month) with milliseconds access", bucketType: "General purpose", az: "≥ 3", duration: "30 days", size: "128 KB", monitoring: "-", retrieval: "Per-GB fees apply" },
  { value: "ONEZONE_IA", label: "One Zone-IA", designed: "Recreatable, infrequently accessed data (once a month) with milliseconds access", bucketType: "General purpose or directory", az: "1", duration: "30 days", size: "128 KB", monitoring: "-", retrieval: "Per-GB fees apply" },
  { value: "GLACIER_IR", label: "Glacier Instant Retrieval", designed: "Long-lived archive data accessed once a quarter with instant retrieval in milliseconds", bucketType: "General purpose", az: "≥ 3", duration: "90 days", size: "128 KB", monitoring: "-", retrieval: "Per-GB fees apply" },
  { value: "GLACIER", label: "Glacier Flexible Retrieval (formerly Glacier)", designed: "Long-lived archive data accessed once a year with retrieval of minutes to hours", bucketType: "General purpose", az: "≥ 3", duration: "90 days", size: "-", monitoring: "-", retrieval: "Per-GB fees apply" },
  { value: "DEEP_ARCHIVE", label: "Glacier Deep Archive", designed: "Long-lived archive data accessed less than once a year with retrieval of hours", bucketType: "General purpose", az: "≥ 3", duration: "180 days", size: "-", monitoring: "-", retrieval: "Per-GB fees apply" },
  { value: "REDUCED_REDUNDANCY", label: "Reduced redundancy", designed: "Noncritical, frequently accessed data with milliseconds access (not recommended as S3 Standard is more cost effective)", bucketType: "General purpose", az: "≥ 3", duration: "-", size: "-", monitoring: "-", retrieval: "Per-GB fees apply" },
]

const checksums = ["CRC64NVME", "CRC32", "CRC32C", "SHA1", "SHA256"]
type Metadata = { type: "System defined" | "User defined"; key: string; value: string }
const systemKeys = ["Cache-Control", "Content-Disposition", "Content-Encoding", "Content-Language", "Content-Type", "Expires"]

let counter = 0

export function UploadPage({ bucket, prefix }: { bucket: string; prefix: string }) {
  const router = useRouter()
  const follow = useFollow()
  const invalidate = useInvalidate()
  const folderInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const versioning = useS3<{ Status?: string }>("s3", "GetBucketVersioning", { Bucket: bucket })
  const encryption = useS3<{ ServerSideEncryptionConfiguration?: { Rules?: { ApplyServerSideEncryptionByDefault?: { SSEAlgorithm?: string } }[] } }>("s3", "GetBucketEncryption", { Bucket: bucket })
  const lock = useS3<{ ObjectLockConfiguration?: { ObjectLockEnabled?: string } }>("s3", "GetObjectLockConfiguration", { Bucket: bucket })
  const [files, setFiles] = useState<Pending[]>([])
  const [selected, setSelected] = useState<Pending[]>([])
  const [storageClass, setStorageClass] = useState("STANDARD")
  const [sseMode, setSseMode] = useState("default")
  const [sse, setSse] = useState("AES256")
  const [checksum, setChecksum] = useState("CRC64NVME")
  const [tags, setTags] = useState<Tag[]>([])
  const [metadata, setMetadata] = useState<Metadata[]>([])
  const [results, setResults] = useState<Result[] | null>(null)
  const destination = `s3://${bucket}/${prefix}`
  const algorithm = encryption.data?.ServerSideEncryptionConfiguration?.Rules?.[0]?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm ?? "AES256"

  function add(list: FileList | File[]) {
    const next = Array.from(list).map((file) => ({
      id: `file-${++counter}`,
      file,
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    }))
    setFiles((current) => [...current, ...next])
  }

  async function upload() {
    const initial: Result[] = files.map(({ file, path }) => ({
      name: file.name,
      folder: path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "-",
      type: file.type || "-",
      size: file.size,
      status: "pending",
    }))
    setResults(initial)
    const tagging = tags.filter((tag) => tag.Key).map((tag) => `${encodeURIComponent(tag.Key)}=${encodeURIComponent(tag.Value ?? "")}`).join("&")
    const user = Object.fromEntries(metadata.filter((item) => item.type === "User defined" && item.key).map((item) => [item.key.replace(/^x-amz-meta-/i, ""), item.value]))
    const system = Object.fromEntries(
      metadata
        .filter((item) => item.type === "System defined" && item.key)
        .map((item) => [item.key.replace(/-([a-z])/gi, (_, letter: string) => letter.toUpperCase()).replace(/^./, (letter) => letter.toUpperCase()), item.value]),
    )
    for (let index = 0; index < files.length; index++) {
      const { file, path } = files[index]
      setResults((current) => current?.map((item, i) => (i === index ? { ...item, status: "uploading" } : item)) ?? null)
      try {
        await uploadS3Object(
          {
            Bucket: bucket,
            Key: `${prefix}${path}`,
            StorageClass: storageClass,
            ContentType: file.type || "application/octet-stream",
            ChecksumAlgorithm: checksum,
            ...(sseMode === "specify" ? { ServerSideEncryption: sse } : {}),
            ...(tagging ? { Tagging: tagging } : {}),
            ...(Object.keys(user).length ? { Metadata: user } : {}),
            ...system,
          },
          file,
        )
        setResults((current) => current?.map((item, i) => (i === index ? { ...item, status: "succeeded" } : item)) ?? null)
      } catch (error) {
        setResults((current) => current?.map((item, i) => (i === index ? { ...item, status: "failed", error: errorMessage(error) } : item)) ?? null)
      }
    }
    await invalidate()
  }

  const crumbs = [
    { text: "Buckets", href: "/s3/buckets" },
    { text: bucket, href: bucketHref(bucket, "objects", prefix) },
    { text: "Upload", href: `/s3/upload/${encodeURIComponent(bucket)}` },
  ]

  if (results) {
    const done = results.filter((item) => item.status === "succeeded")
    const failed = results.filter((item) => item.status === "failed")
    const finished = done.length + failed.length === results.length
    const totalBytes = results.reduce((sum, item) => sum + item.size, 0)
    const doneBytes = done.reduce((sum, item) => sum + item.size, 0)
    return (
      <S3Layout breadcrumbs={[...crumbs.slice(0, 2), { text: "Upload: status", href: "#" }]}>
        <ContentLayout
          header={
            <Header
              variant="h1"
              description="The information below will no longer be available after you navigate away from this page."
              actions={<Button variant="primary" href={bucketHref(bucket, "objects", prefix)} onFollow={follow}>Close</Button>}
            >
              Upload: status
            </Header>
          }
        >
          <SpaceBetween size="l">
            {finished ? (
              failed.length ? (
                <Alert type="error" header={`Upload failed`}>{failed.length} of {results.length} files failed to upload.</Alert>
              ) : (
                <Alert type="success" header="Upload succeeded">
                  For more information, see the <b>Files and folders</b> table.
                </Alert>
              )
            ) : (
              <Container>
                <ProgressBar value={totalBytes ? Math.round((doneBytes / totalBytes) * 100) : 0} label="Total upload progress" description={`${done.length} of ${results.length} files uploaded`} />
              </Container>
            )}
            <Container header={<Header variant="h2">Summary</Header>}>
              <KeyValuePairs
                columns={3}
                items={[
                  { label: "Destination", value: <Link href={bucketHref(bucket, "objects", prefix)} onFollow={follow}>{destination}</Link> },
                  { label: "Succeeded", value: <StatusIndicator type="success">{done.length} files, {consoleBytes(doneBytes)} ({totalBytes ? ((doneBytes / totalBytes) * 100).toFixed(2) : "0.00"}%)</StatusIndicator> },
                  { label: "Failed", value: <StatusIndicator type={failed.length ? "error" : "stopped"}>{failed.length} files, {consoleBytes(failed.reduce((sum, item) => sum + item.size, 0))}</StatusIndicator> },
                ]}
              />
            </Container>
            <Table
              header={<Header variant="h2" counter={`(${results.length})`}>Files and folders</Header>}
              items={results}
              columnDefinitions={[
                { id: "name", header: "Name", cell: (item) => item.name },
                { id: "folder", header: "Folder", cell: (item) => item.folder },
                { id: "type", header: "Type", cell: (item) => item.type },
                { id: "size", header: "Size", cell: (item) => consoleBytes(item.size) },
                {
                  id: "status",
                  header: "Status",
                  cell: (item) => (
                    <StatusIndicator type={item.status === "succeeded" ? "success" : item.status === "failed" ? "error" : item.status === "uploading" ? "in-progress" : "pending"}>
                      {item.status === "succeeded" ? "Succeeded" : item.status === "failed" ? "Failed" : item.status === "uploading" ? "In progress" : "Pending"}
                    </StatusIndicator>
                  ),
                },
                { id: "error", header: "Error", cell: (item) => item.error ?? "-" },
              ]}
            />
          </SpaceBetween>
        </ContentLayout>
      </S3Layout>
    )
  }

  const totalSize = files.reduce((sum, item) => sum + item.file.size, 0)

  return (
    <S3Layout breadcrumbs={crumbs}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            description={<>Add the files and folders you want to upload to S3. To upload a file larger than 160GB, use the AWS CLI, AWS SDKs or Amazon S3 REST API. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html" /></>}
          >
            Upload
          </Header>
        }
      >
        <SpaceBetween size="l">
          <FileDropzone onChange={({ detail }) => add(detail.value)}>
            <Box textAlign="center" color="text-body-secondary">
              Drag and drop files and folders you want to upload here, or choose <b>Add files</b> or <b>Add folder</b>.
            </Box>
          </FileDropzone>
          <input ref={fileInput} type="file" multiple hidden onChange={(event) => { if (event.target.files) add(event.target.files); event.target.value = "" }} />
          <input
            ref={(element) => {
              folderInput.current = element
              element?.setAttribute("webkitdirectory", "")
            }}
            type="file"
            multiple
            hidden
            onChange={(event) => { if (event.target.files) add(event.target.files); event.target.value = "" }}
          />
          <ResourceTable<Pending>
            title="Files and folders"
            variant="container"
            info={false}
            counter={`(${files.length} Total, ${consoleBytes(totalSize)})`}
            description="All files and folders in this table will be uploaded."
            items={files}
            selectionType="multi"
            selectedItems={selected}
            onSelectionChange={setSelected}
            trackBy="id"
            filterPlaceholder="Find by name"
            columns={[
              { id: "name", header: "Name", value: (item) => item.file.name, cell: (item) => item.file.name },
              { id: "folder", header: "Folder", value: (item) => item.path, cell: (item) => (item.path.includes("/") ? item.path.slice(0, item.path.lastIndexOf("/") + 1) : "-") },
              { id: "type", header: "Type", value: (item) => item.file.type, cell: (item) => item.file.type || "-" },
              { id: "size", header: "Size", value: (item) => item.file.size, cell: (item) => consoleBytes(item.file.size) },
            ]}
            empty={<Box textAlign="center" color="inherit"><b>No files or folders</b><Box variant="p" color="inherit">You have not chosen any files or folders to upload.</Box></Box>}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled={selected.length === 0} onClick={() => { setFiles(files.filter((item) => !selected.includes(item))); setSelected([]) }}>Remove</Button>
                <Button iconName="upload" onClick={() => fileInput.current?.click()}>Add files</Button>
                <Button iconName="folder" onClick={() => folderInput.current?.click()}>Add folder</Button>
              </SpaceBetween>
            }
          />
          <Container header={<Header variant="h2">Destination</Header>}>
            <SpaceBetween size="m">
              <KeyValuePairs items={[{ label: "Destination", value: <Link href={bucketHref(bucket, "objects", prefix)} onFollow={follow}>{destination}</Link> }]} />
              <ExpandableSection headerText="Destination details" headerDescription="Bucket settings that impact new objects stored in the specified destination.">
                <SpaceBetween size="m">
                  <KeyValuePairs
                    columns={3}
                    items={[
                      { label: "Bucket Versioning", value: versioning.data?.Status ?? "Disabled" },
                      { label: "Default encryption type", value: algorithm === "AES256" ? "Server-side encryption with Amazon S3 managed keys (SSE-S3)" : algorithm },
                      { label: "Object Lock", value: lock.data?.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled" ? "Enabled" : "Disabled" },
                    ]}
                  />
                  {versioning.data?.Status !== "Enabled" && (
                    <Alert type="info" action={<Button href={bucketHref(bucket, "properties")} onFollow={follow}>Enable Bucket Versioning</Button>}>
                      We recommend that you enable Bucket Versioning to help protect against unintentionally overwriting or deleting objects. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html" />
                    </Alert>
                  )}
                </SpaceBetween>
              </ExpandableSection>
            </SpaceBetween>
          </Container>
          <Container>
            <ExpandableSection variant="footer" headerText="Permissions" headerDescription="Grant public access and access to other AWS accounts.">
              <Alert type="info">This bucket has the bucket owner enforced setting applied for Object Ownership. Use bucket policies to control access.</Alert>
            </ExpandableSection>
          </Container>
          <Container>
            <ExpandableSection variant="footer" headerText="Properties" headerDescription="Specify storage class, encryption settings, tags, and more.">
              <SpaceBetween size="l">
                <FormField label="Storage class" description={<>Amazon S3 offers a range of storage classes designed for different use cases. <LearnMore href="https://aws.amazon.com/s3/storage-classes/" /></>} stretch>
                  <Table
                    variant="embedded"
                    selectionType="single"
                    trackBy="value"
                    items={storageRows}
                    selectedItems={storageRows.filter((row) => row.value === storageClass)}
                    onSelectionChange={({ detail }) => setStorageClass(detail.selectedItems[0]?.value ?? "STANDARD")}
                    ariaLabels={{ selectionGroupLabel: "Storage class selection", itemSelectionLabel: (_, row) => row.label }}
                    columnDefinitions={[
                      { id: "class", header: "Storage class", cell: (row) => row.label },
                      { id: "designed", header: "Designed for", cell: (row) => row.designed },
                      { id: "type", header: "Bucket type", cell: (row) => row.bucketType },
                      { id: "az", header: "Availability Zones", cell: (row) => row.az },
                      { id: "duration", header: "Min storage duration", cell: (row) => row.duration },
                      { id: "size", header: "Min billable object size", cell: (row) => row.size },
                      { id: "monitoring", header: "Monitoring and auto-tiering fees", cell: (row) => row.monitoring },
                      { id: "retrieval", header: "Retrieval fees", cell: (row) => row.retrieval },
                    ]}
                    wrapLines
                  />
                </FormField>
                <FormField label="Server-side encryption" description="Server-side encryption protects data at rest.">
                  <RadioGroup
                    value={sseMode}
                    onChange={({ detail }) => setSseMode(detail.value)}
                    items={[
                      { value: "default", label: "Don't specify an encryption key", description: "The bucket settings for default encryption are used to encrypt objects when storing them in Amazon S3." },
                      { value: "specify", label: "Specify an encryption key", description: "The specified encryption key is used to encrypt objects before storing them in Amazon S3." },
                    ]}
                  />
                </FormField>
                {sseMode === "specify" && (
                  <FormField label="Encryption type">
                    <RadioGroup
                      value={sse}
                      onChange={({ detail }) => setSse(detail.value)}
                      items={[
                        { value: "AES256", label: "Server-side encryption with Amazon S3 managed keys (SSE-S3)" },
                        { value: "aws:kms", label: "Server-side encryption with AWS Key Management Service keys (SSE-KMS)" },
                        { value: "aws:kms:dsse", label: "Dual-layer server-side encryption with AWS Key Management Service keys (DSSE-KMS)" },
                      ]}
                    />
                  </FormField>
                )}
                <Alert type="info">If your bucket policy requires objects to be encrypted with a specific encryption key, you must specify the same encryption key when you upload objects. Otherwise, uploads will fail.</Alert>
                <FormField
                  label="Checksum function"
                  description="Checksum functions are used to calculate the checksum value. For objects smaller than 16 MB, only the full object checksum type is supported, for all checksum algorithms."
                >
                  <Select
                    selectedOption={{ value: checksum, label: checksum === "CRC64NVME" ? "CRC64NVME (recommended)" : checksum }}
                    onChange={({ detail }) => setChecksum(detail.selectedOption.value ?? "CRC64NVME")}
                    options={checksums.map((value) => ({ value, label: value === "CRC64NVME" ? "CRC64NVME (recommended)" : value }))}
                  />
                </FormField>
                <FormField label={<>Tags - <i>optional</i></>} description="You can use object tags to analyze, manage, and specify permissions for objects." stretch>
                  <TagEditor tags={tags} onChange={setTags} limit={10} emptyText="No tags associated with this resource." />
                </FormField>
                <FormField label={<>Metadata - <i>optional</i></>} description="Metadata is optional information provided as a name-value (key-value) pair." stretch>
                  <AttributeEditor
                    items={metadata}
                    addButtonText="Add metadata"
                    removeButtonText="Remove"
                    empty="No metadata associated with this resource."
                    onAddButtonClick={() => setMetadata([...metadata, { type: "User defined", key: "", value: "" }])}
                    onRemoveButtonClick={({ detail }) => setMetadata(metadata.filter((_, index) => index !== detail.itemIndex))}
                    definition={[
                      {
                        label: "Type",
                        control: (item, index) => (
                          <Select
                            selectedOption={{ value: item.type, label: item.type }}
                            onChange={({ detail }) => setMetadata(metadata.map((entry, i) => (i === index ? { ...entry, type: detail.selectedOption.value as Metadata["type"] } : entry)))}
                            options={[{ value: "System defined", label: "System defined" }, { value: "User defined", label: "User defined" }]}
                          />
                        ),
                      },
                      {
                        label: "Key",
                        control: (item, index) =>
                          item.type === "System defined" ? (
                            <Select
                              selectedOption={item.key ? { value: item.key, label: item.key } : null}
                              placeholder="Choose key"
                              onChange={({ detail }) => setMetadata(metadata.map((entry, i) => (i === index ? { ...entry, key: detail.selectedOption.value ?? "" } : entry)))}
                              options={systemKeys.map((value) => ({ value, label: value }))}
                            />
                          ) : (
                            <Input value={item.key} placeholder="x-amz-meta-" onChange={({ detail }) => setMetadata(metadata.map((entry, i) => (i === index ? { ...entry, key: detail.value } : entry)))} />
                          ),
                      },
                      {
                        label: "Value",
                        control: (item, index) => (
                          <Input value={item.value} onChange={({ detail }) => setMetadata(metadata.map((entry, i) => (i === index ? { ...entry, value: detail.value } : entry)))} />
                        ),
                      },
                    ]}
                  />
                </FormField>
              </SpaceBetween>
            </ExpandableSection>
          </Container>
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => router.push(bucketHref(bucket, "objects", prefix))}>Cancel</Button>
              <Button variant="primary" disabled={files.length === 0} onClick={() => void upload()}>Upload</Button>
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </ContentLayout>
    </S3Layout>
  )
}
