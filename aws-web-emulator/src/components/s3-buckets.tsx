"use client"

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { File, Folder, Search } from "lucide-react"
import { useState, type ReactNode } from "react"
import { S3OperationForm } from "@/components/s3-operation-form"
import { S3Upload } from "@/components/s3-upload"
import { S3BucketSettings, bucketTabs } from "@/components/s3-bucket-settings"
import { S3Operations, S3Settings } from "@/components/s3-operations"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { bucketSchema } from "@/lib/contracts"
import { downloadS3File, s3Environment, s3Read, s3Request } from "@/lib/s3-client"
import { s3Operations } from "@/lib/s3-catalog"

type Nav = (change: Record<string, string | undefined>) => void
type Bucket = { Name?: string; CreationDate?: string; BucketRegion?: string }
type ObjectRow = {
  Key?: string
  LastModified?: string
  Size?: number
  StorageClass?: string
  VersionId?: string
  IsLatest?: boolean
  marker?: boolean
}
type BucketPage = { Buckets?: Bucket[]; ContinuationToken?: string }
type ObjectPage = {
  Contents?: ObjectRow[]
  Versions?: ObjectRow[]
  DeleteMarkers?: ObjectRow[]
  CommonPrefixes?: { Prefix?: string }[]
  NextContinuationToken?: string
  NextKeyMarker?: string
  NextVersionIdMarker?: string
  IsTruncated?: boolean
}

const date = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})
const asDate = (value?: string) =>
  value && !Number.isNaN(Date.parse(value)) ? date.format(new Date(value)) : "—"

export function S3Toolbar({
  title,
  children,
  filter,
}: {
  title: ReactNode
  children?: ReactNode
  filter?: { label: string; value: string; set: (value: string) => void }
}) {
  return (
    <CardHeader className="gap-3 border-b bg-surface-subtle px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
      {filter && (
        <div className="relative max-w-md">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={filter.label}
            placeholder={filter.label}
            value={filter.value}
            onChange={(event) => filter.set(event.target.value)}
            className="pl-8"
          />
        </div>
      )}
    </CardHeader>
  )
}

export function S3Status({
  error,
  loading,
  empty,
}: {
  error?: Error | null
  loading?: boolean
  empty: string
}) {
  return error ? (
    <p role="alert" className="px-5 py-6 text-sm text-destructive">
      {error.message}
    </p>
  ) : (
    <p role="status" className="px-5 py-6 text-sm text-muted-foreground">
      {loading ? "Loading…" : empty}
    </p>
  )
}

function BucketCreate({ directory, go }: { directory: boolean; go: Nav }) {
  const [name, setName] = useState("")
  const [zone, setZone] = useState("")
  const [namespace, setNamespace] = useState(false)
  const [allowAcl, setAllowAcl] = useState(false)
  const [publicBlock, setPublicBlock] = useState(true)
  const [versioning, setVersioning] = useState(false)
  const [lock, setLock] = useState(false)
  const [encryption, setEncryption] = useState("AES256")
  const [key, setKey] = useState("")
  const [bucketKey, setBucketKey] = useState(true)
  const [tags, setTags] = useState<{ id: string; key: string; value: string }[]>([])
  const cache = useQueryClient()
  const environment = useQuery({
    queryKey: ["emulator", "s3", "environment"],
    queryFn: ({ signal }) => s3Environment(signal),
  })
  const suffix =
    namespace && environment.data
      ? `-${environment.data.account}-${environment.data.region}-an`
      : ""
  const namedBucket = `${name.trim()}${suffix}`
  const create = useMutation({
    mutationFn: async () => {
      const bucket = namedBucket
      if (directory) {
        if (!zone.trim()) throw new Error("Enter an Availability Zone ID.")
        if (!bucket.endsWith(`--${zone.trim()}--x-s3`))
          throw new Error("End the bucket name in --zone-id--x-s3.")
      } else if (!bucketSchema.shape.name.safeParse(bucket).success) {
        throw new Error(
          "Enter a valid bucket name using lowercase letters, numbers, periods or hyphens.",
        )
      }
      if (namespace && !environment.data)
        throw new Error("The local account details could not be loaded.")
      const tagSet = tags.map(({ key: tagKey, value }) => ({
        Key: tagKey.trim(),
        Value: value,
      }))
      if (
        tagSet.some(({ Key }) => !Key) ||
        new Set(tagSet.map(({ Key }) => Key)).size !== tagSet.length
      ) {
        throw new Error("Enter a unique key for each tag.")
      }
      await s3Read(
        "s3",
        "CreateBucket",
        directory
          ? {
              Bucket: bucket,
              CreateBucketConfiguration: {
                Location: { Type: "AvailabilityZone", Name: zone.trim() },
                Bucket: { Type: "Directory", DataRedundancy: "SingleAvailabilityZone" },
              },
            }
          : {
              Bucket: bucket,
              ...(namespace && { BucketNamespace: "account-regional" }),
              ObjectOwnership: allowAcl
                ? "BucketOwnerPreferred"
                : "BucketOwnerEnforced",
              ObjectLockEnabledForBucket: lock,
            },
      )
      if (directory) return { bucket, issues: [] }
      const issues: string[] = []
      const configure = async (
        title: string,
        action: string,
        options: Record<string, unknown>,
      ) => {
        try {
          await s3Read("s3", action, { Bucket: bucket, ...options })
        } catch (error) {
          issues.push(
            `${title}. ${error instanceof Error ? error.message : "Request failed."}`,
          )
        }
      }
      if (!publicBlock) {
        await configure(
          "Block Public Access could not be changed",
          "PutPublicAccessBlock",
          {
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: false,
              IgnorePublicAcls: false,
              BlockPublicPolicy: false,
              RestrictPublicBuckets: false,
            },
          },
        )
      }
      if (versioning || lock)
        await configure("Versioning could not be enabled", "PutBucketVersioning", {
          VersioningConfiguration: { Status: "Enabled" },
        })
      if (tagSet.length)
        await configure("Tags could not be saved", "PutBucketTagging", {
          Tagging: { TagSet: tagSet },
        })
      if (encryption !== "AES256") {
        await configure(
          "Default encryption could not be changed",
          "PutBucketEncryption",
          {
            ServerSideEncryptionConfiguration: {
              Rules: [
                {
                  ApplyServerSideEncryptionByDefault: {
                    SSEAlgorithm: encryption,
                    ...(key.trim() && { KMSMasterKeyID: key.trim() }),
                  },
                  ...(encryption === "aws:kms" && { BucketKeyEnabled: bucketKey }),
                },
              ],
            },
          },
        )
      }
      return { bucket, issues }
    },
    onSuccess: ({ bucket, issues }) => {
      void cache.invalidateQueries({ queryKey: ["emulator", "s3"] })
      if (!issues.length) go({ action: undefined, bucket })
    },
  })
  const issues = create.data?.issues ?? []
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        create.mutate()
      }}
    >
      <Card className="rounded-xl border ring-0">
        <CardHeader>
          <h2 className="text-lg font-semibold">General configuration</h2>
        </CardHeader>
        <CardContent className="grid gap-4">
          <fieldset
            className="flex flex-wrap gap-4"
            disabled={create.isPending || !!create.data}
          >
            <legend className="mb-2 text-sm font-medium">Bucket type</legend>
            <Label>
              <input
                type="radio"
                name="bucket-type"
                checked={!directory}
                onChange={() => go({ area: "general" })}
              />{" "}
              General purpose
            </Label>
            <Label>
              <input
                type="radio"
                name="bucket-type"
                checked={directory}
                onChange={() => go({ area: "directory" })}
              />{" "}
              Directory
            </Label>
          </fieldset>
          {!directory && (
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-2 text-sm font-medium">Bucket namespace</legend>
              <Label>
                <input
                  type="radio"
                  name="namespace"
                  checked={!namespace}
                  onChange={() => setNamespace(false)}
                />{" "}
                Global namespace
              </Label>
              <Label>
                <input
                  type="radio"
                  name="namespace"
                  checked={namespace}
                  onChange={() => setNamespace(true)}
                />{" "}
                Account Regional namespace
              </Label>
            </fieldset>
          )}
          {directory && (
            <div className="grid max-w-md gap-2">
              <Label htmlFor="bucket-zone">Availability Zone ID</Label>
              <Input
                id="bucket-zone"
                placeholder="use1-az1"
                required
                value={zone}
                onChange={(event) => setZone(event.target.value)}
              />
            </div>
          )}
          <div className="grid max-w-md gap-2">
            <Label htmlFor="new-bucket-name">
              {namespace ? "Bucket name prefix" : "Bucket name"}
            </Label>
            <Input
              id="new-bucket-name"
              required
              maxLength={63 - suffix.length}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {suffix && (
              <p className="text-xs text-muted-foreground">Bucket name {namedBucket}</p>
            )}
          </div>
        </CardContent>
      </Card>
      {!directory && (
        <>
          <Card className="rounded-xl border ring-0">
            <CardHeader>
              <h2 className="text-lg font-semibold">
                Object Ownership and public access
              </h2>
            </CardHeader>
            <CardContent className="grid gap-4">
              <fieldset className="flex flex-wrap gap-4">
                <legend className="mb-2 text-sm font-medium">Object Ownership</legend>
                <Label>
                  <input
                    type="radio"
                    name="ownership"
                    checked={!allowAcl}
                    onChange={() => setAllowAcl(false)}
                  />{" "}
                  ACLs disabled
                </Label>
                <Label>
                  <input
                    type="radio"
                    name="ownership"
                    checked={allowAcl}
                    onChange={() => setAllowAcl(true)}
                  />{" "}
                  ACLs enabled
                </Label>
              </fieldset>
              <Label>
                <input
                  type="checkbox"
                  checked={publicBlock}
                  onChange={(event) => setPublicBlock(event.target.checked)}
                />{" "}
                Block all public access
              </Label>
            </CardContent>
          </Card>
          <Card className="rounded-xl border ring-0">
            <CardHeader>
              <h2 className="text-lg font-semibold">
                Tags{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  Optional
                </span>
              </h2>
            </CardHeader>
            <CardContent className="grid gap-3">
              {tags.map((tag) => (
                <div key={tag.id} className="flex flex-wrap items-end gap-2">
                  <div className="grid gap-2">
                    <Label htmlFor={`tag-key-${tag.id}`}>Key</Label>
                    <Input
                      id={`tag-key-${tag.id}`}
                      maxLength={128}
                      required
                      value={tag.key}
                      onChange={(event) =>
                        setTags((current) =>
                          current.map((item) =>
                            item.id === tag.id
                              ? { ...item, key: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`tag-value-${tag.id}`}>Value</Label>
                    <Input
                      id={`tag-value-${tag.id}`}
                      maxLength={256}
                      value={tag.value}
                      onChange={(event) =>
                        setTags((current) =>
                          current.map((item) =>
                            item.id === tag.id
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setTags((current) => current.filter((item) => item.id !== tag.id))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                className="w-fit"
                type="button"
                variant="outline"
                disabled={tags.length >= 50}
                onClick={() =>
                  setTags((current) => [
                    ...current,
                    { id: crypto.randomUUID(), key: "", value: "" },
                  ])
                }
              >
                Add tag
              </Button>
            </CardContent>
          </Card>
          <Card className="rounded-xl border ring-0">
            <CardHeader>
              <h2 className="text-lg font-semibold">Versioning and encryption</h2>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Label>
                <input
                  type="checkbox"
                  checked={versioning || lock}
                  disabled={lock}
                  onChange={(event) => setVersioning(event.target.checked)}
                />{" "}
                Enable Bucket Versioning
              </Label>
              <fieldset className="grid gap-3">
                <legend className="mb-2 text-sm font-medium">Default encryption</legend>
                {[
                  ["AES256", "SSE-S3"],
                  ["aws:kms", "SSE-KMS"],
                  ["aws:kms:dsse", "DSSE-KMS"],
                ].map(([value, label]) => (
                  <Label key={value}>
                    <input
                      type="radio"
                      name="encryption"
                      checked={encryption === value}
                      onChange={() => setEncryption(value)}
                    />{" "}
                    {label}
                  </Label>
                ))}
              </fieldset>
              {encryption !== "AES256" && (
                <div className="grid max-w-md gap-2">
                  <Label htmlFor="bucket-kms">KMS key ID or ARN (optional)</Label>
                  <Input
                    id="bucket-kms"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                  />
                </div>
              )}
              {encryption === "aws:kms" && (
                <Label>
                  <input
                    type="checkbox"
                    checked={bucketKey}
                    onChange={(event) => setBucketKey(event.target.checked)}
                  />{" "}
                  Enable Bucket Key
                </Label>
              )}
              <Label>
                <input
                  type="checkbox"
                  checked={lock}
                  onChange={(event) => setLock(event.target.checked)}
                />{" "}
                Enable Object Lock
              </Label>
            </CardContent>
          </Card>
        </>
      )}
      {create.error && (
        <p role="alert" className="text-sm text-destructive">
          {create.error.message}
        </p>
      )}
      {!!issues.length && (
        <div role="status" className="rounded-xl border p-4 text-sm">
          <strong>Bucket created. Some settings could not be applied.</strong>
          <ul className="mt-2 list-inside list-disc">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={create.isPending}
          onClick={() => go({ action: undefined })}
        >
          Cancel
        </Button>
        {create.data ? (
          <Button
            type="button"
            onClick={() => go({ bucket: create.data.bucket, action: undefined })}
          >
            Open bucket
          </Button>
        ) : (
          <Button disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create bucket"}
          </Button>
        )}
      </div>
    </form>
  )
}

function BucketEmpty({
  bucket,
  directory,
  go,
}: {
  bucket: string
  directory: boolean
  go: Nav
}) {
  const [confirm, setConfirm] = useState("")
  const cache = useQueryClient()
  const empty = useMutation({
    mutationFn: async () => {
      const action = directory ? "ListObjectsV2" : "ListObjectVersions"
      let deleted = 0
      for (;;) {
        const page = await s3Read<ObjectPage>("s3", action, {
          Bucket: bucket,
          MaxKeys: 1000,
        })
        const rows = [
          ...(page.Versions ?? []),
          ...(page.DeleteMarkers ?? []),
          ...(page.Contents ?? []),
        ]
        if (!rows.length) return deleted
        const response = await s3Read<{
          Errors?: { Key?: string; Message?: string }[]
        }>("s3", "DeleteObjects", {
          Bucket: bucket,
          Delete: {
            Objects: rows.map(({ Key, VersionId }) => ({ Key, VersionId })),
            Quiet: true,
          },
        })
        if (response.Errors?.length)
          throw new Error(
            response.Errors.map(
              ({ Key, Message }) =>
                `${Key ?? "Object"} ${Message ?? "could not be removed"}`,
            ).join(". "),
          )
        deleted += rows.length
      }
    },
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: ["emulator", "s3"] })
    },
  })
  return (
    <Card className="rounded-xl border ring-0">
      <CardHeader>
        <h2 className="text-lg font-semibold">Empty {bucket}?</h2>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (confirm === "permanently delete") empty.mutate()
          }}
        >
          <p className="text-sm text-muted-foreground">
            This deletes all objects{!directory && ", versions, and delete markers"} in
            the bucket.
          </p>
          {empty.isSuccess ? (
            <p role="status" className="text-success">
              Bucket emptied. Removed {empty.data} entries.
            </p>
          ) : (
            <div className="grid max-w-md gap-2">
              <Label htmlFor="empty-confirm">Enter permanently delete to confirm</Label>
              <Input
                id="empty-confirm"
                autoComplete="off"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </div>
          )}
          {empty.error && (
            <p role="alert" className="text-destructive">
              {empty.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={empty.isPending}
              onClick={() => go({ action: undefined, bucket: undefined })}
            >
              {empty.isSuccess ? "Back to buckets" : "Cancel"}
            </Button>
            {!empty.isSuccess && (
              <Button
                variant="destructive"
                disabled={confirm !== "permanently delete" || empty.isPending}
              >
                {empty.isPending ? "Emptying…" : "Empty bucket"}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function S3Buckets({
  directory,
  bucket,
  action,
  tab,
  objectKey,
  prefix,
  versionId,
  go,
}: {
  directory: boolean
  bucket?: string
  action?: string
  tab?: string
  objectKey?: string
  prefix?: string
  versionId?: string
  go: Nav
}) {
  const [search, setSearch] = useState("")
  const [selection, setSelection] = useState("")
  const title = directory ? "Directory buckets" : "General purpose buckets"
  const result = useInfiniteQuery({
    queryKey: ["emulator", "s3", "buckets", directory],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      s3Read<BucketPage>(
        "s3",
        directory ? "ListDirectoryBuckets" : "ListBuckets",
        {
          ContinuationToken: pageParam,
          ...(directory ? { MaxDirectoryBuckets: 100 } : { MaxBuckets: 100 }),
        },
        signal,
      ),
    getNextPageParam: (page) => page.ContinuationToken,
    enabled: !bucket && !action,
  })
  const rows =
    result.data?.pages
      .flatMap(({ Buckets }) => Buckets ?? [])
      .filter(({ Name }) => Name?.toLowerCase().includes(search.toLowerCase())) ?? []
  const selected = rows.some(({ Name }) => Name === selection) ? selection : ""
  const close = () =>
    go({ action: undefined, bucket: undefined, tab: undefined, object: undefined })

  if (action === "create") return <BucketCreate directory={directory} go={go} />
  if (action === "empty" && bucket)
    return <BucketEmpty bucket={bucket} directory={directory} go={go} />
  if (action === "delete" && bucket)
    return (
      <S3OperationForm
        key={bucket}
        model="s3"
        action="DeleteBucket"
        title="Delete bucket"
        fixed={{ Bucket: bucket }}
        preferred={[]}
        confirm={bucket}
        cancel={close}
        afterSuccess={close}
      />
    )
  if (bucket)
    return (
      <BucketWorkspace
        key={bucket}
        bucket={bucket}
        directory={directory}
        tab={tab}
        objectKey={objectKey}
        prefix={prefix}
        versionId={versionId}
        action={action}
        go={go}
      />
    )
  return (
    <>
      <Card className="gap-0 overflow-hidden rounded-xl border py-0 ring-0">
        <S3Toolbar
          title={title}
          filter={{ label: "Find buckets by name", value: search, set: setSearch }}
        >
          {!directory && (
            <Button
              variant="outline"
              disabled={!selected}
              onClick={() => go({ action: "empty", bucket: selected })}
            >
              Empty
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!selected}
            onClick={() => go({ action: "delete", bucket: selected })}
          >
            Delete
          </Button>
          <Button onClick={() => go({ action: "create" })}>Create bucket</Button>
        </S3Toolbar>
        {!rows.length && (
          <S3Status
            error={result.error}
            loading={result.isPending}
            empty="No buckets found."
          />
        )}
        {!!rows.length && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <span className="sr-only">Select</span>
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>AWS Region</TableHead>
                <TableHead>Creation date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(
                ({ Name, BucketRegion, CreationDate }) =>
                  Name && (
                    <TableRow
                      key={Name}
                      data-state={selected === Name ? "selected" : undefined}
                    >
                      <TableCell className="text-center">
                        <input
                          type="radio"
                          aria-label={`Select ${Name}`}
                          name="selected-bucket"
                          checked={selected === Name}
                          onChange={() => setSelection(Name)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="link"
                          className="px-0"
                          onClick={() => go({ bucket: Name, action: undefined })}
                        >
                          {Name}
                        </Button>
                      </TableCell>
                      <TableCell>{BucketRegion ?? "—"}</TableCell>
                      <TableCell>{asDate(CreationDate)}</TableCell>
                    </TableRow>
                  ),
              )}
            </TableBody>
          </Table>
        )}
        {result.hasNextPage && (
          <CardContent className="border-t p-3">
            <Button
              variant="outline"
              disabled={result.isFetching}
              onClick={() => void result.fetchNextPage()}
            >
              Load more buckets
            </Button>
          </CardContent>
        )}
      </Card>
      {directory && (
        <S3Operations
          model="s3"
          actions={[
            "ListDirectoryBuckets",
            "CreateSession",
            "HeadBucket",
            "GetBucketLocation",
          ]}
          title="Directory bucket operations"
        />
      )}
    </>
  )
}

function BucketWorkspace({
  bucket,
  directory,
  tab,
  objectKey,
  prefix,
  versionId,
  action,
  go,
}: {
  bucket: string
  directory: boolean
  tab?: string
  objectKey?: string
  prefix?: string
  versionId?: string
  action?: string
  go: Nav
}) {
  const availableTabs = directory
    ? bucketTabs.filter((name) => !["Metadata", "File systems"].includes(name))
    : bucketTabs
  const section = availableTabs.includes(tab ?? "") ? tab! : "Objects"
  const [versions, setVersions] = useState(false)
  const close = () => go({ action: undefined })
  if (action === "upload")
    return (
      <S3Upload
        bucket={bucket}
        prefix={prefix ?? ""}
        directory={directory}
        close={close}
      />
    )
  if (action === "folder")
    return <FolderCreate bucket={bucket} prefix={prefix ?? ""} close={close} />
  if (objectKey)
    return (
      <ObjectWorkspace
        key={`${objectKey}:${versionId ?? ""}`}
        bucket={bucket}
        directory={directory}
        objectKey={objectKey}
        versionId={versionId}
        action={action}
        go={go}
      />
    )
  return (
    <Tabs
      value={section}
      onValueChange={(value) =>
        go({ tab: value === "Objects" ? undefined : value, action: undefined })
      }
    >
      <TabsList
        className="group-data-horizontal/tabs:h-auto max-w-full justify-start overflow-x-auto overflow-y-hidden"
        aria-label="Bucket details"
      >
        {availableTabs.map((name) => (
          <TabsTrigger key={name} value={name}>
            {name}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value={section}>
        {section === "Objects" ? (
          <BucketObjects
            bucket={bucket}
            directory={directory}
            prefix={prefix ?? ""}
            versions={versions}
            setVersions={setVersions}
            go={go}
          />
        ) : (
          <S3BucketSettings
            key={section}
            bucket={bucket}
            tab={section}
            directory={directory}
          />
        )}
      </TabsContent>
    </Tabs>
  )
}

function FolderCreate({
  bucket,
  prefix,
  close,
}: {
  bucket: string
  prefix: string
  close: () => void
}) {
  const [name, setName] = useState("")
  const cache = useQueryClient()
  const create = useMutation({
    mutationFn: () =>
      s3Read("s3", "PutObject", { Bucket: bucket, Key: `${prefix}${name.trim()}/` }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["emulator", "s3"] })
      close()
    },
  })
  return (
    <Card className="rounded-xl border ring-0">
      <CardHeader>
        <h2 className="text-lg font-semibold">Create folder</h2>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim() && !name.includes("/")) create.mutate()
          }}
        >
          <div className="grid max-w-md gap-2">
            <Label htmlFor="new-folder">Folder name</Label>
            <Input
              id="new-folder"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          {create.error && (
            <p role="alert" className="text-destructive">
              {create.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button disabled={!name.trim() || name.includes("/") || create.isPending}>
              Create folder
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function BucketObjects({
  bucket,
  directory,
  prefix,
  versions,
  setVersions,
  go,
}: {
  bucket: string
  directory: boolean
  prefix: string
  versions: boolean
  setVersions: (value: boolean) => void
  go: Nav
}) {
  const cache = useQueryClient()
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<ObjectRow | undefined>()
  const [confirm, setConfirm] = useState(false)
  const result = useInfiniteQuery({
    queryKey: ["emulator", "s3", "objects", bucket, prefix, versions],
    initialPageParam: {} as Record<string, unknown>,
    queryFn: ({ pageParam, signal }) =>
      s3Read<ObjectPage>(
        "s3",
        versions ? "ListObjectVersions" : "ListObjectsV2",
        {
          Bucket: bucket,
          Prefix: prefix || undefined,
          Delimiter: versions ? undefined : "/",
          MaxKeys: 100,
          ...pageParam,
        },
        signal,
      ),
    getNextPageParam: (page) => {
      if (!page.IsTruncated) return
      if (page.NextContinuationToken)
        return { ContinuationToken: page.NextContinuationToken }
      if (page.NextKeyMarker)
        return {
          KeyMarker: page.NextKeyMarker,
          VersionIdMarker: page.NextVersionIdMarker,
        }
    },
  })
  const rows =
    result.data?.pages
      .flatMap((page) =>
        versions
          ? [
              ...(page.Versions ?? []),
              ...(page.DeleteMarkers ?? []).map((row) => ({ ...row, marker: true })),
            ]
          : (page.Contents ?? []),
      )
      .filter(
        ({ Key }) =>
          Key !== prefix && Key?.toLowerCase().includes(search.toLowerCase()),
      ) ?? []
  const folders =
    result.data?.pages
      .flatMap((page) => page.CommonPrefixes ?? [])
      .filter(({ Prefix }) => Prefix?.toLowerCase().includes(search.toLowerCase())) ??
    []
  const active = rows.find(
    ({ Key, VersionId }) => Key === selected?.Key && VersionId === selected?.VersionId,
  )
  const deleteObject = useMutation({
    mutationFn: (object: ObjectRow) =>
      s3Read("s3", "DeleteObject", {
        Bucket: bucket,
        Key: object.Key,
        VersionId: object.VersionId,
      }),
    onSuccess: () => {
      setSelected(undefined)
      setConfirm(false)
      void cache.invalidateQueries({ queryKey: ["emulator", "s3"] })
    },
  })
  const download = useMutation({
    mutationFn: async (file: ObjectRow) => {
      const response = await s3Request("s3", "GetObject", {
        Bucket: bucket,
        Key: file.Key,
        VersionId: file.VersionId,
      })
      if (response.file)
        downloadS3File(response.file, file.Key?.split("/").at(-1) || "object")
    },
  })
  return (
    <div className="space-y-3">
      <Card className="gap-0 overflow-hidden rounded-xl border py-0 ring-0">
        <S3Toolbar
          title={prefix ? `Objects in ${prefix}` : "Objects"}
          filter={{ label: "Find objects by name", value: search, set: setSearch }}
        >
          {prefix && (
            <Button
              variant="outline"
              onClick={() =>
                go({
                  prefix: prefix.split("/").slice(0, -2).join("/")
                    ? `${prefix.split("/").slice(0, -2).join("/")}/`
                    : undefined,
                })
              }
            >
              Parent folder
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!active || active.marker || download.isPending}
            onClick={() => {
              if (active) download.mutate(active)
            }}
          >
            Download
          </Button>
          <Button
            variant="outline"
            disabled={!active}
            onClick={() => setConfirm(!confirm)}
          >
            Delete
          </Button>
          <Button variant="outline" onClick={() => go({ action: "folder" })}>
            Create folder
          </Button>
          <Button onClick={() => go({ action: "upload" })}>Upload</Button>
        </S3Toolbar>
        {!directory && (
          <div className="border-b px-4 py-3">
            <Label>
              <input
                type="checkbox"
                checked={versions}
                onChange={(event) => {
                  setVersions(event.target.checked)
                  setConfirm(false)
                  setSelected(undefined)
                }}
              />{" "}
              Show versions
            </Label>
          </div>
        )}
        {confirm && active && (
          <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm">
            <span>
              Delete <strong>{active.Key}</strong>
              {active.VersionId ? ` (${active.VersionId})` : ""}?
            </span>
            <Button
              variant="destructive"
              disabled={deleteObject.isPending}
              onClick={() => deleteObject.mutate(active)}
            >
              Delete object
            </Button>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        )}
        {(deleteObject.error || download.error) && (
          <S3Status error={deleteObject.error ?? download.error} empty="" />
        )}
        {!rows.length && !folders.length && (
          <S3Status
            error={result.error}
            loading={result.isPending}
            empty="No objects found."
          />
        )}
        {!!(rows.length || folders.length) && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <span className="sr-only">Select</span>
                </TableHead>
                <TableHead>Name</TableHead>
                {versions && <TableHead>Version ID</TableHead>}
                <TableHead>Last modified</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Storage class</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {folders.map(({ Prefix }) => (
                <TableRow key={Prefix}>
                  <TableCell />
                  <TableCell>
                    <Button
                      variant="link"
                      className="px-0"
                      onClick={() => go({ prefix: Prefix })}
                    >
                      <Folder aria-hidden />
                      {Prefix?.slice(prefix.length)}
                    </Button>
                  </TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>—</TableCell>
                </TableRow>
              ))}
              {rows.map((row) => (
                <TableRow
                  key={`${row.Key}:${row.VersionId ?? ""}`}
                  data-state={active === row ? "selected" : undefined}
                >
                  <TableCell className="text-center">
                    <input
                      name="selected-object"
                      type="radio"
                      aria-label={`Select ${row.Key}${row.VersionId ? ` version ${row.VersionId}` : ""}`}
                      checked={active === row}
                      onChange={() => {
                        setSelected(row)
                        setConfirm(false)
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="link"
                      className="px-0"
                      disabled={row.marker}
                      onClick={() => go({ object: row.Key, version: row.VersionId })}
                    >
                      <File aria-hidden />
                      {row.Key?.slice(prefix.length)}
                    </Button>
                  </TableCell>
                  {versions && (
                    <TableCell className="font-mono text-xs">
                      {row.VersionId ?? "—"}
                      {row.marker && " · Delete marker"}
                    </TableCell>
                  )}
                  <TableCell>{asDate(row.LastModified)}</TableCell>
                  <TableCell>
                    {row.Size === undefined ? "—" : `${row.Size.toLocaleString()} B`}
                  </TableCell>
                  <TableCell>{row.StorageClass ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {result.hasNextPage && (
          <CardContent className="border-t p-3">
            <Button
              variant="outline"
              disabled={result.isFetching}
              onClick={() => void result.fetchNextPage()}
            >
              Load more objects
            </Button>
          </CardContent>
        )}
      </Card>
      <S3Operations
        model="s3"
        actions={[
          "ListMultipartUploads",
          "CreateMultipartUpload",
          "ListParts",
          "UploadPart",
          "UploadPartCopy",
          "CompleteMultipartUpload",
          "AbortMultipartUpload",
          "DeleteObjects",
        ]}
        context={{ Bucket: bucket }}
        title="Multipart and bulk operations"
      />
    </div>
  )
}

function ObjectWorkspace({
  bucket,
  directory,
  objectKey,
  versionId,
  action,
  go,
}: {
  bucket: string
  directory: boolean
  objectKey: string
  versionId?: string
  action?: string
  go: Nav
}) {
  const key = {
    Bucket: bucket,
    Key: objectKey,
    ...(versionId && { VersionId: versionId }),
  }
  const close = () => go({ action: undefined })
  const back = () => go({ object: undefined, version: undefined, action: undefined })
  const actions = Object.keys(s3Operations.s3).filter((name) =>
    s3Operations.s3[name].input.some(([field]) => field === "Key"),
  )
  const download = useMutation({
    mutationFn: async () => {
      const response = await s3Request("s3", "GetObject", key)
      if (response.file)
        downloadS3File(response.file, objectKey.split("/").at(-1) || "object")
    },
  })
  if (action === "delete-object") {
    return (
      <S3OperationForm
        model="s3"
        action="DeleteObject"
        title="Delete object"
        fixed={key}
        preferred={[]}
        confirm={versionId || directory ? "permanently delete" : "delete"}
        cancel={close}
        afterSuccess={back}
      />
    )
  }
  if (action === "rename-object" && directory) {
    return (
      <S3OperationForm
        model="s3"
        action="RenameObject"
        title="Rename object"
        fixed={{ Bucket: bucket, RenameSource: objectKey, DestinationIfNoneMatch: "*" }}
        initial={{ Key: objectKey }}
        preferred={["Key"]}
        cancel={close}
        afterSuccess={back}
      />
    )
  }
  if (action === "copy")
    return (
      <S3OperationForm
        model="s3"
        action="CopyObject"
        title="Copy object"
        fixed={{
          CopySource: `${bucket}/${objectKey.split("/").map(encodeURIComponent).join("/")}${versionId ? `?versionId=${encodeURIComponent(versionId)}` : ""}`,
        }}
        initial={{ Bucket: bucket, Key: objectKey }}
        preferred={[
          "Bucket",
          "Key",
          "StorageClass",
          "MetadataDirective",
          "Metadata",
          "TaggingDirective",
          "Tagging",
          "ServerSideEncryption",
        ]}
        cancel={close}
      />
    )
  return (
    <div className="space-y-3">
      <Card className="gap-0 overflow-hidden rounded-xl border py-0 ring-0">
        <S3Toolbar title="Object overview">
          <Button variant="outline" onClick={back}>
            Back to objects
          </Button>
          <Button variant="outline" onClick={() => go({ action: "copy" })}>
            Copy
          </Button>
          {directory && (
            <Button variant="outline" onClick={() => go({ action: "rename-object" })}>
              Rename
            </Button>
          )}
          <Button variant="outline" onClick={() => go({ action: "delete-object" })}>
            Delete
          </Button>
          <Button disabled={download.isPending} onClick={() => download.mutate()}>
            Download
          </Button>
        </S3Toolbar>
        <CardContent className="grid gap-2 p-4">
          <p className="break-all font-mono text-sm">
            s3://{bucket}/{objectKey}
          </p>
          {download.error && (
            <p role="alert" className="text-destructive">
              {download.error.message}
            </p>
          )}
        </CardContent>
      </Card>
      <S3Settings
        model="s3"
        context={key}
        sections={[
          {
            title: "Properties",
            read: "HeadObject",
            actions: ["GetObjectAttributes", "UpdateObjectEncryption"],
          },
          {
            title: "Tags",
            read: "GetObjectTagging",
            actions: ["PutObjectTagging", "DeleteObjectTagging"],
          },
          { title: "Permissions", read: "GetObjectAcl", actions: ["PutObjectAcl"] },
          {
            title: "Object Lock retention",
            read: "GetObjectRetention",
            actions: ["PutObjectRetention"],
          },
          {
            title: "Legal hold",
            read: "GetObjectLegalHold",
            actions: ["PutObjectLegalHold"],
          },
        ]}
      />
      <S3Operations
        model="s3"
        context={key}
        actions={actions}
        title="Object operations"
      />
    </div>
  )
}
