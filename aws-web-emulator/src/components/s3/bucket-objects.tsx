"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import FormField from "@cloudscape-design/components/form-field"
import Icon from "@cloudscape-design/components/icon"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import Modal from "@cloudscape-design/components/modal"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Alert from "@cloudscape-design/components/alert"
import Toggle from "@cloudscape-design/components/toggle"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { bucketHref } from "@/components/s3/bucket-detail"
import { s3Read, s3Request, unsupported, useInvalidate, useS3, useS3Environment } from "@/components/s3/s3-hooks"
import { consoleBytes, consoleDate, copyText } from "@/lib/format"
import { downloadS3File } from "@/lib/s3-client"

export type S3Entry = {
  key: string
  name: string
  folder: boolean
  size?: number
  modified?: string
  storageClass?: string
  versionId?: string
  latest?: boolean
  deleteMarker?: boolean
}

type ListResult = {
  Contents?: { Key?: string; Size?: number; LastModified?: string; StorageClass?: string }[]
  CommonPrefixes?: { Prefix?: string }[]
  NextContinuationToken?: string
  IsTruncated?: boolean
}

type VersionsResult = {
  Versions?: { Key?: string; VersionId?: string; IsLatest?: boolean; Size?: number; LastModified?: string; StorageClass?: string }[]
  DeleteMarkers?: { Key?: string; VersionId?: string; IsLatest?: boolean; LastModified?: string }[]
  CommonPrefixes?: { Prefix?: string }[]
}

export const storageClasses = [
  { value: "STANDARD", label: "Standard" },
  { value: "INTELLIGENT_TIERING", label: "Intelligent-Tiering" },
  { value: "STANDARD_IA", label: "Standard-IA" },
  { value: "ONEZONE_IA", label: "One Zone-IA" },
  { value: "GLACIER_IR", label: "Glacier Instant Retrieval" },
  { value: "GLACIER", label: "Glacier Flexible Retrieval" },
  { value: "DEEP_ARCHIVE", label: "Glacier Deep Archive" },
  { value: "REDUCED_REDUNDANCY", label: "Reduced redundancy" },
]

export function storageClassLabel(value?: string) {
  return storageClasses.find((item) => item.value === (value ?? "STANDARD"))?.label ?? value ?? "Standard"
}

function objectType(entry: S3Entry) {
  if (entry.folder) return "Folder"
  if (entry.deleteMarker) return "Delete marker"
  const extension = entry.name.includes(".") ? entry.name.split(".").pop() : ""
  return extension || "-"
}

async function listAllObjects(bucket: string, prefix: string) {
  const entries: S3Entry[] = []
  let token: string | undefined
  do {
    const page = await s3Read<ListResult>("s3", "ListObjectsV2", {
      Bucket: bucket,
      Prefix: prefix || undefined,
      Delimiter: "/",
      MaxKeys: 1000,
      ...(token ? { ContinuationToken: token } : {}),
    })
    for (const common of page.CommonPrefixes ?? [])
      if (common.Prefix)
        entries.push({ key: common.Prefix, name: common.Prefix.slice(prefix.length), folder: true })
    for (const object of page.Contents ?? [])
      if (object.Key && object.Key !== prefix)
        entries.push({
          key: object.Key,
          name: object.Key.slice(prefix.length),
          folder: false,
          size: object.Size,
          modified: object.LastModified,
          storageClass: object.StorageClass,
        })
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token && entries.length < 5000)
  return entries
}

async function listVersions(bucket: string, prefix: string) {
  const page = await s3Read<VersionsResult>("s3", "ListObjectVersions", {
    Bucket: bucket,
    Prefix: prefix || undefined,
    Delimiter: "/",
    MaxKeys: 1000,
  })
  const entries: S3Entry[] = (page.CommonPrefixes ?? []).flatMap((common) =>
    common.Prefix ? [{ key: common.Prefix, name: common.Prefix.slice(prefix.length), folder: true }] : [],
  )
  for (const version of page.Versions ?? [])
    if (version.Key && version.Key !== prefix)
      entries.push({
        key: version.Key,
        name: version.Key.slice(prefix.length),
        folder: false,
        size: version.Size,
        modified: version.LastModified,
        storageClass: version.StorageClass,
        versionId: version.VersionId,
        latest: version.IsLatest,
      })
  for (const marker of page.DeleteMarkers ?? [])
    if (marker.Key)
      entries.push({
        key: marker.Key,
        name: marker.Key.slice(prefix.length),
        folder: false,
        modified: marker.LastModified,
        versionId: marker.VersionId,
        latest: marker.IsLatest,
        deleteMarker: true,
      })
  return entries
}

export async function getObjectFile(bucket: string, key: string, versionId?: string) {
  const result = await s3Request("s3", "GetObject", { Bucket: bucket, Key: key, ...(versionId ? { VersionId: versionId } : {}) })
  if (!("file" in result) || !result.file) throw new Error("The emulator returned no object body.")
  return result.file
}

export async function downloadObject(bucket: string, key: string, versionId?: string) {
  const file = await getObjectFile(bucket, key, versionId)
  downloadS3File(file, key.split("/").filter(Boolean).at(-1) ?? "download")
}

export async function openObject(bucket: string, key: string, versionId?: string) {
  const file = await getObjectFile(bucket, key, versionId)
  const url = URL.createObjectURL(file)
  window.open(url, "_blank", "noopener")
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function BucketObjectsTab({ bucket, prefix }: { bucket: string; prefix: string }) {
  const follow = useFollow()
  const invalidate = useInvalidate()
  const environment = useS3Environment()
  const [selected, setSelected] = useState<S3Entry[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [modal, setModal] = useState<string>()
  const versioning = useS3<{ Status?: string }>("s3", "GetBucketVersioning", { Bucket: bucket })
  const ownership = useS3<{ OwnershipControls?: { Rules?: { ObjectOwnership?: string }[] } }>("s3", "GetBucketOwnershipControls", { Bucket: bucket })
  const objects = useQuery({
    queryKey: ["emulator", "s3", "objects", bucket, prefix, showVersions],
    queryFn: () => (showVersions ? listVersions(bucket, prefix) : listAllObjects(bucket, prefix)),
  })
  const entries = objects.data ?? []
  const files = selected.filter((entry) => !entry.folder)
  const single = selected.length === 1 ? selected[0] : undefined
  const region = environment.data?.region ?? "ap-southeast-7"
  const aclsDisabled = (ownership.data?.OwnershipControls?.Rules?.[0]?.ObjectOwnership ?? "BucketOwnerEnforced") === "BucketOwnerEnforced"
  const versioned = versioning.data?.Status === "Enabled" || versioning.data?.Status === "Suspended"

  async function run(label: string, action: () => Promise<unknown>) {
    try {
      await action()
      await invalidate()
      flash.success(label)
    } catch (error) {
      flash.error(errorMessage(error))
    }
  }

  return (
    <>
      <ResourceTable<S3Entry>
        title="Objects"
        variant="container"
        headerVariant="h2"
        description={
          <>
            Objects are the fundamental entities stored in Amazon S3. You can use{" "}
            <Link external href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-inventory.html">Amazon S3 inventory</Link> to get a list of all objects in your bucket. For others to access your objects, you&apos;ll need to explicitly grant them permissions.{" "}
            <Link external href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-overview.html">Learn more</Link>
          </>
        }
        items={entries}
        loading={objects.isPending}
        loadingText="Loading objects"
        error={objects.error}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy={(entry) => `${entry.key}:${entry.versionId ?? ""}`}
        filterPlaceholder="Find objects by prefix"
        pageSize={50}
        columns={[
          {
            id: "name",
            header: "Name",
            value: (entry) => entry.name,
            cell: (entry) =>
              entry.folder ? (
                <span className="myaws-object-name">
                  <Icon name="folder" />
                  <Link href={bucketHref(bucket, "objects", entry.key)} onFollow={follow}>
                    {entry.name}
                  </Link>
                </span>
              ) : (
                <span className="myaws-object-name">
                  <Icon name="file" />
                  <Link
                    href={`/s3/object/${encodeURIComponent(bucket)}?prefix=${encodeURIComponent(entry.key)}${entry.versionId ? `&versionId=${encodeURIComponent(entry.versionId)}` : ""}`}
                    onFollow={follow}
                  >
                    {entry.name}
                  </Link>
                </span>
              ),
          },
          ...(showVersions
            ? [
                {
                  id: "version",
                  header: "Version ID",
                  value: (entry: S3Entry) => entry.versionId,
                  cell: (entry: S3Entry) => (entry.folder ? "-" : `${entry.versionId ?? "null"}${entry.latest ? " (Current version)" : ""}`),
                },
              ]
            : []),
          { id: "type", header: "Type", value: objectType, cell: objectType },
          {
            id: "modified",
            header: "Last modified",
            value: (entry) => entry.modified,
            cell: (entry) => consoleDate(entry.modified),
          },
          {
            id: "size",
            header: "Size",
            value: (entry) => entry.size,
            cell: (entry) => (entry.folder || entry.deleteMarker ? "-" : consoleBytes(entry.size)),
          },
          {
            id: "storage",
            header: "Storage class",
            value: (entry) => entry.storageClass,
            cell: (entry) => (entry.folder || entry.deleteMarker ? "-" : storageClassLabel(entry.storageClass)),
          },
        ]}
        empty={
          <EmptyState
            title="No objects"
            subtitle="You don't have any objects in this bucket."
            action={
              <Button iconName="upload" href={`/s3/upload/${encodeURIComponent(bucket)}${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`} onFollow={follow}>
                Upload
              </Button>
            }
          />
        }
        actions={
          <SpaceBetween direction="vertical" size="xs">
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Refresh" loading={objects.isFetching} onClick={() => void objects.refetch()} />
              <Button
                iconName="copy"
                disabled={!single}
                onClick={() => {
                  const uri = `s3://${bucket}/${single?.key ?? ""}`
                  void copyText(uri)
                  flash.success(`S3 URI copied: ${uri}`)
                }}
              >
                Copy S3 URI
              </Button>
              <Button
                iconName="copy"
                disabled={!single || single.folder}
                onClick={() => {
                  const url = `https://${bucket}.s3.${region}.amazonaws.com/${single?.key ?? ""}`
                  void copyText(url)
                  flash.success(`URL copied: ${url}`)
                }}
              >
                Copy URL
              </Button>
              <Button
                iconName="download"
                disabled={!single || single.folder || single.deleteMarker}
                onClick={() => single && void downloadObject(bucket, single.key, single.versionId).catch((error) => flash.error(errorMessage(error)))}
              >
                Download
              </Button>
              <Button
                iconName="external"
                iconAlign="right"
                disabled={!single || single.folder || single.deleteMarker}
                onClick={() => single && void openObject(bucket, single.key, single.versionId).catch((error) => flash.error(errorMessage(error)))}
              >
                Open
              </Button>
              <Button disabled={selected.length === 0} onClick={() => setModal("delete")}>
                Delete
              </Button>
              <ButtonDropdown
                disabled={selected.length === 0}
                items={[
                  { id: "download-as", text: "Download as", disabled: !single || single.folder },
                  { id: "presign", text: "Share with a presigned URL", disabled: true, disabledReason: unsupported },
                  { id: "size", text: "Calculate total size" },
                  { id: "copy", text: "Copy" },
                  { id: "move", text: "Move" },
                  { id: "restore", text: "Initiate restore", disabled: files.length === 0 },
                  { id: "select", text: "Query with S3 Select", disabled: true, disabledReason: unsupported },
                  {
                    id: "edit",
                    text: "Edit actions",
                    items: [
                      { id: "rename", text: "Rename object", disabled: !single || single.folder },
                      { id: "storage", text: "Edit storage class", disabled: files.length === 0 },
                      { id: "sse", text: "Edit server-side encryption", disabled: files.length === 0 },
                      { id: "tags", text: "Edit tags", disabled: files.length === 0 },
                      {
                        id: "public-acl",
                        text: "Make public using ACL",
                        disabled: files.length === 0 || aclsDisabled,
                        disabledReason: aclsDisabled ? "ACLs are disabled for this bucket." : undefined,
                      },
                      { id: "public-tags", text: "Make public with tags", disabled: true, disabledReason: unsupported },
                    ],
                  },
                ]}
                onItemClick={({ detail }) => {
                  if (detail.id === "download-as" && single)
                    void downloadObject(bucket, single.key, single.versionId).catch((error) => flash.error(errorMessage(error)))
                  else setModal(detail.id)
                }}
              >
                Actions
              </ButtonDropdown>
              <Button onClick={() => setModal("folder")}>Create folder</Button>
              <Button
                variant="primary"
                iconName="upload"
                href={`/s3/upload/${encodeURIComponent(bucket)}${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ""}`}
                onFollow={follow}
              >
                Upload
              </Button>
            </SpaceBetween>
            {versioned && (
              <Toggle checked={showVersions} onChange={({ detail }) => { setShowVersions(detail.checked); setSelected([]) }}>
                Show versions
              </Toggle>
            )}
          </SpaceBetween>
        }
      />

      <CreateFolderModal
        visible={modal === "folder"}
        bucket={bucket}
        prefix={prefix}
        onDismiss={() => setModal(undefined)}
        onCreated={(name) => {
          setModal(undefined)
          void invalidate()
          flash.success(`Successfully created folder "${name}".`)
        }}
      />
      <DeleteObjectsModal
        visible={modal === "delete"}
        bucket={bucket}
        entries={selected}
        versioned={versioned}
        onDismiss={() => setModal(undefined)}
        onDeleted={(count) => {
          setModal(undefined)
          setSelected([])
          void invalidate()
          flash.success(`Successfully deleted ${count} object${count === 1 ? "" : "s"}.`)
        }}
      />
      <TotalSizeModal visible={modal === "size"} bucket={bucket} entries={selected} onDismiss={() => setModal(undefined)} />
      <CopyMoveModal
        visible={modal === "copy" || modal === "move"}
        mode={modal === "move" ? "move" : "copy"}
        bucket={bucket}
        entries={selected}
        onDismiss={() => setModal(undefined)}
        onDone={(message) => {
          setModal(undefined)
          setSelected([])
          void invalidate()
          flash.success(message)
        }}
      />
      <RenameModal
        visible={modal === "rename"}
        bucket={bucket}
        entry={single}
        onDismiss={() => setModal(undefined)}
        onDone={(name) => {
          setModal(undefined)
          setSelected([])
          void invalidate()
          flash.success(`Successfully renamed object to "${name}".`)
        }}
      />
      <EditObjectsModal
        visible={modal === "storage" || modal === "sse" || modal === "tags" || modal === "restore"}
        mode={(modal ?? "storage") as "storage" | "sse" | "tags" | "restore"}
        bucket={bucket}
        entries={files}
        onDismiss={() => setModal(undefined)}
        onDone={(message) => {
          setModal(undefined)
          void invalidate()
          flash.success(message)
        }}
      />
      <Modal
        visible={modal === "public-acl"}
        onDismiss={() => setModal(undefined)}
        header="Make public using ACL"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setModal(undefined)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setModal(undefined)
                  void run(`Successfully made ${files.length} object(s) public.`, () =>
                    Promise.all(files.map((file) => s3Request("s3", "PutObjectAcl", { Bucket: bucket, Key: file.key, ACL: "public-read" }))),
                  )
                }}
              >
                Make public
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <Alert type="warning">
          When public read access is enabled and not blocked by Block Public Access settings, anyone in the world can access the specified objects.
        </Alert>
      </Modal>
    </>
  )
}

export function CreateFolderModal({
  visible,
  bucket,
  prefix,
  onDismiss,
  onCreated,
}: {
  visible: boolean
  bucket: string
  prefix: string
  onDismiss: () => void
  onCreated: (name: string) => void
}) {
  const [name, setName] = useState("")
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  async function submit() {
    if (!name || name.includes("/")) {
      setError("Folder names can't contain \"/\" and can't be empty.")
      return
    }
    setSaving(true)
    try {
      await s3Request("s3", "PutObject", { Bucket: bucket, Key: `${prefix}${name}/` }, { uploads: { Body: new File([], name) } })
      setName("")
      setError(undefined)
      onCreated(`${name}/`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Create folder"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={() => void submit()}>Create folder</Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box>
          Use folders to group objects in buckets. When you create a folder, S3 creates an object using the name that you specify followed by a slash (/). This object then appears as a folder on the console.
        </Box>
        <FormField
          label="Folder name"
          errorText={error}
          constraintText={<>Folder names can&apos;t contain &quot;/&quot;. Destination: s3://{bucket}/{prefix}{name ? `${name}/` : ""}</>}
        >
          <Input value={name} onChange={({ detail }) => setName(detail.value)} placeholder="Enter folder name" />
        </FormField>
      </SpaceBetween>
    </Modal>
  )
}

async function expandEntries(bucket: string, entries: S3Entry[]) {
  const keys: { Key: string; VersionId?: string; size?: number }[] = []
  for (const entry of entries) {
    if (!entry.folder) {
      keys.push({ Key: entry.key, VersionId: entry.versionId, size: entry.size })
      continue
    }
    let token: string | undefined
    do {
      const page = await s3Read<ListResult>("s3", "ListObjectsV2", { Bucket: bucket, Prefix: entry.key, MaxKeys: 1000, ...(token ? { ContinuationToken: token } : {}) })
      for (const object of page.Contents ?? []) if (object.Key) keys.push({ Key: object.Key, size: object.Size })
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
  }
  return keys
}

export function DeleteObjectsModal({
  visible,
  bucket,
  entries,
  versioned,
  onDismiss,
  onDeleted,
}: {
  visible: boolean
  bucket: string
  entries: S3Entry[]
  versioned: boolean
  onDismiss: () => void
  onDeleted: (count: number) => void
}) {
  const permanent = !versioned || entries.some((entry) => entry.versionId)
  const phrase = permanent ? "permanently delete" : "delete"
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  async function submit() {
    setSaving(true)
    setError(undefined)
    try {
      const keys = await expandEntries(bucket, entries)
      for (let index = 0; index < keys.length; index += 1000) {
        const chunk = keys.slice(index, index + 1000)
        await s3Request("s3", "DeleteObjects", {
          Bucket: bucket,
          Delete: { Objects: chunk.map(({ Key, VersionId }) => ({ Key, ...(VersionId ? { VersionId } : {}) })), Quiet: true },
        })
      }
      setConfirm("")
      onDeleted(keys.length)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      size="large"
      header="Delete objects"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button variant="primary" disabled={confirm !== phrase} loading={saving} onClick={() => void submit()}>
              Delete objects
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Alert type="warning">
          {permanent
            ? "Deleting the specified objects can't be undone."
            : "Deleting the specified objects adds delete markers to them. If you need to undo the delete action, you can delete the delete markers."}
        </Alert>
        <Box variant="h3">Specified objects ({entries.length})</Box>
        <ul>
          {entries.slice(0, 20).map((entry) => (
            <li key={`${entry.key}:${entry.versionId ?? ""}`}>
              {entry.key}
              {entry.versionId ? ` (${entry.versionId})` : ""}
            </li>
          ))}
        </ul>
        <FormField label={<>To confirm deletion, type <i>{phrase}</i> in the text input field.</>} errorText={error}>
          <Input value={confirm} placeholder={phrase} onChange={({ detail }) => setConfirm(detail.value)} />
        </FormField>
      </SpaceBetween>
    </Modal>
  )
}

export function TotalSizeModal({ visible, bucket, entries, onDismiss }: { visible: boolean; bucket: string; entries: S3Entry[]; onDismiss: () => void }) {
  const summary = useQuery({
    queryKey: ["emulator", "s3", "total-size", bucket, entries.map((entry) => entry.key)],
    enabled: visible,
    queryFn: async () => {
      const keys = await expandEntries(bucket, entries)
      return { objects: keys.length, bytes: keys.reduce((total, key) => total + (key.size ?? 0), 0) }
    },
  })
  return (
    <Modal visible={visible} onDismiss={onDismiss} header="Calculate total size" footer={<Box float="right"><Button variant="primary" onClick={onDismiss}>Close</Button></Box>}>
      {summary.isPending ? (
        <Box>Calculating…</Box>
      ) : summary.error ? (
        <Box color="text-status-error">{errorMessage(summary.error)}</Box>
      ) : (
        <SpaceBetween size="s">
          <div><Box variant="awsui-key-label">Total number of objects</Box>{summary.data?.objects}</div>
          <div><Box variant="awsui-key-label">Total size</Box>{consoleBytes(summary.data?.bytes)}</div>
        </SpaceBetween>
      )}
    </Modal>
  )
}

function parseDestination(value: string) {
  const match = /^s3:\/\/([^/]+)\/?(.*)$/.exec(value.trim())
  if (!match) return undefined
  const prefix = match[2] && !match[2].endsWith("/") ? `${match[2]}/` : match[2]
  return { bucket: match[1], prefix }
}

export function CopyMoveModal({
  visible,
  mode,
  bucket,
  entries,
  onDismiss,
  onDone,
}: {
  visible: boolean
  mode: "copy" | "move"
  bucket: string
  entries: S3Entry[]
  onDismiss: () => void
  onDone: (message: string) => void
}) {
  const [destination, setDestination] = useState(`s3://${bucket}/`)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  async function submit() {
    const target = parseDestination(destination)
    if (!target) {
      setError("Enter a destination in the format s3://bucket/prefix/.")
      return
    }
    setSaving(true)
    setError(undefined)
    try {
      let count = 0
      for (const entry of entries) {
        const base = entry.key.slice(0, entry.key.length - entry.name.length)
        const keys = await expandEntries(bucket, [entry])
        for (const key of keys) {
          const relative = key.Key.slice(base.length)
          await s3Request("s3", "CopyObject", {
            Bucket: target.bucket,
            Key: `${target.prefix}${relative}`,
            CopySource: `${bucket}/${key.Key.split("/").map(encodeURIComponent).join("/")}${key.VersionId ? `?versionId=${key.VersionId}` : ""}`,
          })
          if (mode === "move") await s3Request("s3", "DeleteObject", { Bucket: bucket, Key: key.Key })
          count++
        }
      }
      onDone(`Successfully ${mode === "move" ? "moved" : "copied"} ${count} object${count === 1 ? "" : "s"} to ${destination}.`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      size="medium"
      header={mode === "move" ? "Move" : "Copy"}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={() => void submit()}>{mode === "move" ? "Move" : "Copy"}</Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box>Specified objects: {entries.map((entry) => entry.name).join(", ")}</Box>
        <FormField label="Destination" description="Specify a destination in the same or another bucket." constraintText="Format: s3://bucket/prefix/" errorText={error} stretch>
          <Input value={destination} onChange={({ detail }) => setDestination(detail.value)} />
        </FormField>
        {mode === "move" && (
          <Alert type="info">Moving objects copies them to the destination and then deletes the source objects.</Alert>
        )}
      </SpaceBetween>
    </Modal>
  )
}

export function RenameModal({
  visible,
  bucket,
  entry,
  onDismiss,
  onDone,
}: {
  visible: boolean
  bucket: string
  entry?: S3Entry
  onDismiss: () => void
  onDone: (name: string) => void
}) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const current = entry?.name ?? ""
  async function submit() {
    if (!entry || !name) return
    setSaving(true)
    try {
      const base = entry.key.slice(0, entry.key.length - entry.name.length)
      await s3Request("s3", "RenameObject", { Bucket: bucket, Key: `${base}${name}`, RenameSource: `${bucket}/${entry.key}` }).catch(async () => {
        await s3Request("s3", "CopyObject", { Bucket: bucket, Key: `${base}${name}`, CopySource: `${bucket}/${entry.key.split("/").map(encodeURIComponent).join("/")}` })
        await s3Request("s3", "DeleteObject", { Bucket: bucket, Key: entry.key })
      })
      setName("")
      onDone(name)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Rename object"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button variant="primary" disabled={!name || name === current} loading={saving} onClick={() => void submit()}>Save changes</Button>
          </SpaceBetween>
        </Box>
      }
    >
      <FormField label="New object name" errorText={error} constraintText={`Current name: ${current}`} stretch>
        <Input value={name || current} onChange={({ detail }) => setName(detail.value)} />
      </FormField>
    </Modal>
  )
}

export function EditObjectsModal({
  visible,
  mode,
  bucket,
  entries,
  onDismiss,
  onDone,
}: {
  visible: boolean
  mode: "storage" | "sse" | "tags" | "restore"
  bucket: string
  entries: S3Entry[]
  onDismiss: () => void
  onDone: (message: string) => void
}) {
  const [storageClass, setStorageClass] = useState("STANDARD")
  const [sse, setSse] = useState("AES256")
  const [tags, setTags] = useState<Tag[]>([])
  const [days, setDays] = useState("1")
  const [tier, setTier] = useState("Standard")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const titles = {
    storage: "Edit storage class",
    sse: "Edit server-side encryption",
    tags: "Edit tags",
    restore: "Initiate restore",
  }
  async function submit() {
    setSaving(true)
    setError(undefined)
    try {
      for (const entry of entries) {
        const source = `${bucket}/${entry.key.split("/").map(encodeURIComponent).join("/")}`
        if (mode === "storage")
          await s3Request("s3", "CopyObject", { Bucket: bucket, Key: entry.key, CopySource: source, StorageClass: storageClass, MetadataDirective: "COPY" })
        else if (mode === "sse")
          await s3Request("s3", "CopyObject", { Bucket: bucket, Key: entry.key, CopySource: source, ServerSideEncryption: sse, MetadataDirective: "COPY" })
        else if (mode === "tags")
          await s3Request("s3", "PutObjectTagging", { Bucket: bucket, Key: entry.key, Tagging: { TagSet: tags.filter((tag) => tag.Key) } })
        else
          await s3Request("s3", "RestoreObject", { Bucket: bucket, Key: entry.key, RestoreRequest: { Days: Number(days), GlacierJobParameters: { Tier: tier } } })
      }
      onDone(`${titles[mode]}: updated ${entries.length} object${entries.length === 1 ? "" : "s"}.`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      size="medium"
      header={titles[mode]}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={() => void submit()}>
              {mode === "restore" ? "Initiate restore" : "Save changes"}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box>Specified objects: {entries.map((entry) => entry.name).join(", ")}</Box>
        {mode === "storage" && (
          <FormField label="Storage class">
            <RadioGroup value={storageClass} onChange={({ detail }) => setStorageClass(detail.value)} items={storageClasses} />
          </FormField>
        )}
        {mode === "sse" && (
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
        {mode === "tags" && <TagEditor tags={tags} onChange={setTags} limit={10} emptyText="No tags associated with the objects." />}
        {mode === "restore" && (
          <SpaceBetween size="m">
            <FormField label="Number of days that the restored copy is available">
              <Input type="number" value={days} onChange={({ detail }) => setDays(detail.value)} />
            </FormField>
            <FormField label="Retrieval tier">
              <Select
                selectedOption={{ value: tier, label: tier }}
                onChange={({ detail }) => setTier(detail.selectedOption.value ?? "Standard")}
                options={["Bulk", "Standard", "Expedited"].map((value) => ({ value, label: value }))}
              />
            </FormField>
          </SpaceBetween>
        )}
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  )
}
