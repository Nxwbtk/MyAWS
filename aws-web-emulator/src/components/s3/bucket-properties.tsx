"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import Multiselect from "@cloudscape-design/components/multiselect"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Tabs from "@cloudscape-design/components/tabs"
import { useState } from "react"
import { flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, Enabled, LearnMore, Section, notInEmulator } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { bucketRegionLabel } from "@/components/s3/buckets"
import { s3Request, useS3, useS3Environment } from "@/components/s3/s3-hooks"
import { consoleDate } from "@/lib/format"

const docs = (path: string) => `https://docs.aws.amazon.com/AmazonS3/latest/userguide/${path}`

type EncryptionConfig = {
  ServerSideEncryptionConfiguration?: {
    Rules?: {
      ApplyServerSideEncryptionByDefault?: { SSEAlgorithm?: string; KMSMasterKeyID?: string }
      BucketKeyEnabled?: boolean
      BlockedEncryptionTypes?: { EncryptionType?: string[] }
    }[]
  }
}

const encryptionLabels: Record<string, string> = {
  AES256: "Server-side encryption with Amazon S3 managed keys (SSE-S3)",
  "aws:kms": "Server-side encryption with AWS Key Management Service keys (SSE-KMS)",
  "aws:kms:dsse": "Dual-layer server-side encryption with AWS Key Management Service keys (DSSE-KMS)",
}

export function BucketPropertiesTab({ bucket }: { bucket: string }) {
  const environment = useS3Environment()
  const buckets = useS3<{ Buckets?: { Name?: string; CreationDate?: string; BucketRegion?: string }[] }>("s3", "ListBuckets", { MaxBuckets: 1000 })
  const info = buckets.data?.Buckets?.find((item) => item.Name === bucket)
  const region = info?.BucketRegion ?? environment.data?.region
  return (
    <SpaceBetween size="l">
      <Section
        title="Bucket overview"
        columns={3}
        items={[
          { label: "AWS Region", value: bucketRegionLabel(region) },
          { label: "Amazon Resource Name (ARN)", value: `arn:aws:s3:::${bucket}` },
          { label: "Creation date", value: consoleDate(info?.CreationDate) },
        ]}
      />
      <VersioningSection bucket={bucket} />
      <AbacSection bucket={bucket} />
      <TagsSection bucket={bucket} />
      <EncryptionSection bucket={bucket} />
      <IntelligentTieringSection bucket={bucket} />
      <Section
        title="Log delivery to CloudWatch"
        counter="(0)"
        info
        description="Configure log delivery to multiple destinations."
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled disabledReason={notInEmulator}>Edit</Button>
            <Button disabled disabledReason={notInEmulator}>Delete</Button>
            <Button disabled disabledReason={notInEmulator}>Add</Button>
          </SpaceBetween>
        }
      >
        <Box textAlign="center" color="text-status-inactive">No log deliveries configured.</Box>
      </Section>
      <LoggingSection bucket={bucket} />
      <CloudTrailSection />
      <NotificationsSection bucket={bucket} />
      <EventBridgeSection bucket={bucket} />
      <AccelerationSection bucket={bucket} region={region} />
      <ObjectLockSection bucket={bucket} />
      <RequesterPaysSection bucket={bucket} />
      <WebsiteSection bucket={bucket} region={region} />
    </SpaceBetween>
  )
}

function VersioningSection({ bucket }: { bucket: string }) {
  const versioning = useS3<{ Status?: string; MFADelete?: string }>("s3", "GetBucketVersioning", { Bucket: bucket })
  const [open, setOpen] = useState(false)
  const status = versioning.data?.Status ?? "Disabled"
  const [value, setValue] = useState("Enabled")
  return (
    <Section
      title="Bucket Versioning"
      description={
        <>
          Versioning is a means of keeping multiple variants of an object in the same bucket. You can use versioning to preserve, retrieve, and restore every version of every object stored in your Amazon S3 bucket. With versioning, you can easily recover from both unintended user actions and application failures. <LearnMore href={docs("Versioning.html")} />
        </>
      }
      onEdit={() => {
        setValue(status === "Enabled" ? "Enabled" : status === "Suspended" ? "Suspended" : "Enabled")
        setOpen(true)
      }}
      items={[
        { label: "Bucket Versioning", value: status },
        {
          label: "Multi-factor authentication (MFA) delete",
          value: (
            <SpaceBetween size="xxs">
              <Box variant="small">
                An additional layer of security that requires multi-factor authentication for changing Bucket Versioning settings and permanently deleting object versions. To modify MFA delete settings, use the AWS CLI, AWS SDK, or the Amazon S3 REST API.
              </Box>
              <span>{versioning.data?.MFADelete ?? "Disabled"}</span>
            </SpaceBetween>
          ),
        },
      ]}
    >
      <EditModal
        visible={open}
        title="Edit Bucket Versioning"
        onDismiss={() => setOpen(false)}
        success={`Successfully edited Bucket Versioning for "${bucket}".`}
        onSave={() => s3Request("s3", "PutBucketVersioning", { Bucket: bucket, VersioningConfiguration: { Status: value } })}
      >
        <FormField label="Bucket Versioning">
          <RadioGroup
            value={value}
            onChange={({ detail }) => setValue(detail.value)}
            items={[
              { value: "Suspended", label: "Suspend", description: "This suspends the creation of object versions for all operations but preserves any existing object versions." },
              { value: "Enabled", label: "Enable" },
            ]}
          />
        </FormField>
        {value === "Suspended" && (
          <Alert type="info">After suspending Bucket Versioning, existing versions are kept. Lifecycle rules can expire noncurrent versions.</Alert>
        )}
      </EditModal>
    </Section>
  )
}

function AbacSection({ bucket }: { bucket: string }) {
  const abac = useS3<{ AbacStatus?: { Status?: string } }>("s3", "GetBucketAbac", { Bucket: bucket })
  const [open, setOpen] = useState(false)
  const status = abac.data?.AbacStatus?.Status ?? "Disabled"
  const [value, setValue] = useState(status)
  return (
    <Section
      title="Bucket ABAC"
      description={
        <>
          Attribute-based access control (ABAC) is an authorization strategy that defines permissions based on attributes. With ABAC, you can attach tags to your general purpose buckets and AWS Identity and Access Management (IAM) entities (users or roles), then scale access to objects in your S3 general purpose buckets using tag-based policies. <LearnMore href={docs("buckets-tagging-enable-abac.html")} />
        </>
      }
      onEdit={() => {
        setValue(status)
        setOpen(true)
      }}
      items={[{ label: "ABAC status", value: status }]}
    >
      <EditModal
        visible={open}
        title="Edit bucket ABAC"
        onDismiss={() => setOpen(false)}
        success="Successfully edited bucket ABAC."
        onSave={() => s3Request("s3", "PutBucketAbac", { Bucket: bucket, AbacStatus: { Status: value } })}
      >
        <FormField label="ABAC status">
          <RadioGroup
            value={value}
            onChange={({ detail }) => setValue(detail.value)}
            items={[{ value: "Disabled", label: "Disable" }, { value: "Enabled", label: "Enable" }]}
          />
        </FormField>
      </EditModal>
    </Section>
  )
}

function TagsSection({ bucket }: { bucket: string }) {
  const tagging = useS3<{ TagSet?: Tag[] }>("s3", "GetBucketTagging", { Bucket: bucket })
  const tags = tagging.data?.TagSet ?? []
  const user = tags.filter((tag) => !tag.Key.startsWith("aws:"))
  const generated = tags.filter((tag) => tag.Key.startsWith("aws:"))
  const [selected, setSelected] = useState<Tag[]>([])
  const [editing, setEditing] = useState<Tag[] | null>(null)
  async function save(next: Tag[]) {
    const all = [...generated, ...next.filter((tag) => tag.Key)]
    if (all.length) await s3Request("s3", "PutBucketTagging", { Bucket: bucket, Tagging: { TagSet: all } })
    else await s3Request("s3", "DeleteBucketTagging", { Bucket: bucket })
    await tagging.refetch()
  }
  return (
    <Section
      title="Tags"
      description={
        <>
          You can use tags to track storage costs, organize general purpose buckets, and specify permissions for a general purpose bucket. AWS-generated tags are created by AWS and are read-only. <LearnMore href={docs("CostAllocTagging.html")} />
        </>
      }
    >
      <Tabs
        variant="default"
        tabs={[
          {
            id: "user",
            label: "User-defined tags",
            content: (
              <ResourceTable<Tag>
                title="User-defined tags"
                info={false}
                variant="embedded"
                items={user}
                selectionType="multi"
                selectedItems={selected}
                onSelectionChange={setSelected}
                trackBy="Key"
                filterPlaceholder="Find tags"
                columns={[
                  { id: "key", header: "Key", value: (tag) => tag.Key, cell: (tag) => tag.Key },
                  { id: "value", header: "Value - optional", value: (tag) => tag.Value, cell: (tag) => tag.Value || "-" },
                ]}
                empty={
                  <EmptyState
                    title="There are no user-defined tags associated with this bucket."
                    action={<Button onClick={() => setEditing([...user, { Key: "", Value: "" }])}>Add new tag</Button>}
                  />
                }
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button
                      disabled={selected.length === 0}
                      onClick={async () => {
                        await save(user.filter((tag) => !selected.some((item) => item.Key === tag.Key)))
                        setSelected([])
                        flash.success("Successfully deleted tags.")
                      }}
                    >
                      Delete
                    </Button>
                    <Button onClick={() => setEditing(user.length ? [...user] : [{ Key: "", Value: "" }])}>
                      {user.length ? "Edit" : "Add new tag"}
                    </Button>
                  </SpaceBetween>
                }
              />
            ),
          },
          {
            id: "aws",
            label: "AWS-generated tags",
            content: (
              <ResourceTable<Tag>
                title="AWS-generated tags"
                info={false}
                variant="embedded"
                items={generated}
                trackBy="Key"
                filterPlaceholder="Find tags"
                columns={[
                  { id: "key", header: "Key", value: (tag) => tag.Key, cell: (tag) => tag.Key },
                  { id: "value", header: "Value", value: (tag) => tag.Value, cell: (tag) => tag.Value || "-" },
                ]}
                empty={<EmptyState title="There are no AWS-generated tags associated with this bucket." />}
              />
            ),
          },
        ]}
      />
      <EditModal
        visible={editing !== null}
        title="Edit bucket tags"
        size="large"
        onDismiss={() => setEditing(null)}
        success="Successfully edited bucket tags."
        onSave={() => save(editing ?? [])}
      >
        <TagEditor tags={editing ?? []} onChange={setEditing} limit={50} emptyText="No tags associated with this bucket." />
      </EditModal>
    </Section>
  )
}

function EncryptionSection({ bucket }: { bucket: string }) {
  const encryption = useS3<EncryptionConfig>("s3", "GetBucketEncryption", { Bucket: bucket })
  const rule = encryption.data?.ServerSideEncryptionConfiguration?.Rules?.[0]
  const algorithm = rule?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm ?? "AES256"
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(algorithm)
  const [key, setKey] = useState("")
  const [bucketKey, setBucketKey] = useState("Enabled")
  const [blockSsec, setBlockSsec] = useState(true)
  return (
    <Section
      title="Default encryption"
      info
      description="Server-side encryption is automatically applied to new objects stored in this bucket."
      onEdit={() => {
        setType(algorithm)
        setKey(rule?.ApplyServerSideEncryptionByDefault?.KMSMasterKeyID ?? "")
        setBucketKey(rule?.BucketKeyEnabled === false ? "Disabled" : "Enabled")
        setBlockSsec((rule?.BlockedEncryptionTypes?.EncryptionType ?? ["SSE-C"]).includes("SSE-C"))
        setOpen(true)
      }}
      items={[
        { label: "Encryption type", info: <Link variant="info">Info</Link>, value: encryptionLabels[algorithm] ?? algorithm },
        ...(algorithm !== "AES256" && rule?.ApplyServerSideEncryptionByDefault?.KMSMasterKeyID
          ? [{ label: "Encryption key ARN", value: rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID }]
          : []),
        {
          label: "Bucket Key",
          value: (
            <SpaceBetween size="xxs">
              <Box variant="small">
                When KMS encryption is used to encrypt new objects in this bucket, the bucket key reduces encryption costs by lowering calls to AWS KMS. <LearnMore href={docs("bucket-key.html")} />
              </Box>
              <span>{rule?.BucketKeyEnabled === false ? "Disabled" : "Enabled"}</span>
            </SpaceBetween>
          ),
        },
        {
          label: "Blocked encryption types",
          info: <Link variant="info">Info</Link>,
          value: (rule?.BlockedEncryptionTypes?.EncryptionType ?? ["SSE-C"]).includes("SSE-C")
            ? "Server-Side Encryption with Customer-Provided Keys (SSE-C)"
            : "-",
        },
      ]}
    >
      <EditModal
        visible={open}
        title="Edit default encryption"
        onDismiss={() => setOpen(false)}
        success={`Successfully edited default encryption for "${bucket}".`}
        onSave={() =>
          s3Request("s3", "PutBucketEncryption", {
            Bucket: bucket,
            ServerSideEncryptionConfiguration: {
              Rules: [
                {
                  ApplyServerSideEncryptionByDefault: { SSEAlgorithm: type, ...(type !== "AES256" && key ? { KMSMasterKeyID: key } : {}) },
                  ...(type === "aws:kms" ? { BucketKeyEnabled: bucketKey === "Enabled" } : {}),
                  BlockedEncryptionTypes: { EncryptionType: blockSsec ? ["SSE-C"] : ["NONE"] },
                },
              ],
            },
          })
        }
      >
        <FormField label="Encryption type">
          <RadioGroup
            value={type}
            onChange={({ detail }) => setType(detail.value)}
            items={Object.entries(encryptionLabels).map(([value, label]) => ({ value, label }))}
          />
        </FormField>
        {type !== "AES256" && (
          <FormField label="AWS KMS key ARN" description="Leave empty to use the AWS managed key (aws/s3)." stretch>
            <Input value={key} placeholder="arn:aws:kms:region:account-id:key/key-id" onChange={({ detail }) => setKey(detail.value)} />
          </FormField>
        )}
        <FormField label="Bucket Key">
          <RadioGroup
            value={type === "aws:kms" ? bucketKey : "Disabled"}
            onChange={({ detail }) => setBucketKey(detail.value)}
            items={[
              { value: "Disabled", label: "Disable", disabled: type !== "aws:kms" },
              { value: "Enabled", label: "Enable", disabled: type !== "aws:kms" },
            ]}
          />
        </FormField>
        <FormField label="Blocked encryption types">
          <Checkbox checked={blockSsec} onChange={({ detail }) => setBlockSsec(detail.checked)}>
            Server-Side Encryption with Customer-Provided Keys (SSE-C)
          </Checkbox>
        </FormField>
      </EditModal>
    </Section>
  )
}

type TieringConfig = {
  Id?: string
  Status?: string
  Filter?: { Prefix?: string }
  Tierings?: { Days?: number; AccessTier?: string }[]
}

function IntelligentTieringSection({ bucket }: { bucket: string }) {
  const configs = useS3<{ IntelligentTieringConfigurationList?: TieringConfig[] }>("s3", "ListBucketIntelligentTieringConfigurations", { Bucket: bucket })
  const items = configs.data?.IntelligentTieringConfigurationList ?? []
  const [selected, setSelected] = useState<TieringConfig[]>([])
  const [editing, setEditing] = useState<{ id: string; prefix: string; archive: string; deep: string; status: string; existing: boolean } | null>(null)
  const days = (config: TieringConfig, tier: string) => config.Tierings?.find((item) => item.AccessTier === tier)?.Days
  return (
    <>
      <ResourceTable<TieringConfig>
        title="Intelligent-Tiering Archive configurations"
        variant="container"
        description={
          <>
            Enable objects stored in the Intelligent-Tiering storage class to tier-down to the Archive Access tier or the Deep Archive Access tier which are optimized for objects that will be rarely accessed for long periods of time. <LearnMore href={docs("intelligent-tiering-overview.html")} />
          </>
        }
        items={items}
        loading={configs.isPending}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="Id"
        columns={[
          { id: "name", header: "Name", value: (item) => item.Id, cell: (item) => item.Id },
          { id: "status", header: "Status", value: (item) => item.Status, cell: (item) => item.Status },
          { id: "scope", header: "Scope", value: (item) => item.Filter?.Prefix, cell: (item) => (item.Filter?.Prefix ? `Prefix: ${item.Filter.Prefix}` : "Entire bucket") },
          { id: "archive", header: "Days until transition to Archive Access tier", value: (item) => days(item, "ARCHIVE_ACCESS"), cell: (item) => days(item, "ARCHIVE_ACCESS") ?? "-" },
          { id: "deep", header: "Days until transition to Deep Archive Access tier", value: (item) => days(item, "DEEP_ARCHIVE_ACCESS"), cell: (item) => days(item, "DEEP_ARCHIVE_ACCESS") ?? "-" },
        ]}
        empty={<EmptyState title="No archive configurations" subtitle="No configurations to display." action={<Button onClick={() => setEditing({ id: "", prefix: "", archive: "90", deep: "", status: "Enabled", existing: false })}>Create configuration</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              disabled={!selected[0]}
              onClick={() => {
                const config = selected[0]
                setEditing({
                  id: config.Id ?? "",
                  prefix: config.Filter?.Prefix ?? "",
                  archive: String(days(config, "ARCHIVE_ACCESS") ?? ""),
                  deep: String(days(config, "DEEP_ARCHIVE_ACCESS") ?? ""),
                  status: config.Status ?? "Enabled",
                  existing: true,
                })
              }}
            >
              Edit
            </Button>
            <Button
              disabled={!selected[0]}
              onClick={async () => {
                await s3Request("s3", "DeleteBucketIntelligentTieringConfiguration", { Bucket: bucket, Id: selected[0].Id })
                setSelected([])
                await configs.refetch()
                flash.success("Successfully deleted Intelligent-Tiering Archive configuration.")
              }}
            >
              Delete
            </Button>
            <Button onClick={() => setEditing({ id: "", prefix: "", archive: "90", deep: "", status: "Enabled", existing: false })}>Create configuration</Button>
          </SpaceBetween>
        }
      />
      <EditModal
        visible={editing !== null}
        title={editing?.existing ? "Edit Intelligent-Tiering Archive configuration" : "Create Intelligent-Tiering Archive configuration"}
        size="large"
        onDismiss={() => setEditing(null)}
        saveLabel={editing?.existing ? "Save changes" : "Create"}
        success="Successfully saved Intelligent-Tiering Archive configuration."
        onSave={async () => {
          if (!editing) return
          const tierings = [
            ...(editing.archive ? [{ Days: Number(editing.archive), AccessTier: "ARCHIVE_ACCESS" }] : []),
            ...(editing.deep ? [{ Days: Number(editing.deep), AccessTier: "DEEP_ARCHIVE_ACCESS" }] : []),
          ]
          await s3Request("s3", "PutBucketIntelligentTieringConfiguration", {
            Bucket: bucket,
            Id: editing.id,
            IntelligentTieringConfiguration: {
              Id: editing.id,
              Status: editing.status,
              ...(editing.prefix ? { Filter: { Prefix: editing.prefix } } : {}),
              Tierings: tierings,
            },
          })
          await configs.refetch()
        }}
      >
        {editing && (
          <SpaceBetween size="m">
            <FormField label="Configuration name">
              <Input value={editing.id} disabled={editing.existing} onChange={({ detail }) => setEditing({ ...editing, id: detail.value })} />
            </FormField>
            <FormField label={<>Prefix - <i>optional</i></>} description="Limit the scope of this configuration to objects with a prefix.">
              <Input value={editing.prefix} onChange={({ detail }) => setEditing({ ...editing, prefix: detail.value })} />
            </FormField>
            <FormField label="Status">
              <RadioGroup value={editing.status} onChange={({ detail }) => setEditing({ ...editing, status: detail.value })} items={[{ value: "Enabled", label: "Enable" }, { value: "Disabled", label: "Disable" }]} />
            </FormField>
            <FormField label="Days until transition to Archive Access tier" constraintText="Between 90 and 730 days.">
              <Input type="number" value={editing.archive} onChange={({ detail }) => setEditing({ ...editing, archive: detail.value })} />
            </FormField>
            <FormField label="Days until transition to Deep Archive Access tier" constraintText="Between 180 and 730 days.">
              <Input type="number" value={editing.deep} onChange={({ detail }) => setEditing({ ...editing, deep: detail.value })} />
            </FormField>
          </SpaceBetween>
        )}
      </EditModal>
    </>
  )
}

function LoggingSection({ bucket }: { bucket: string }) {
  const logging = useS3<{ LoggingEnabled?: { TargetBucket?: string; TargetPrefix?: string } }>("s3", "GetBucketLogging", { Bucket: bucket })
  const enabled = logging.data?.LoggingEnabled
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState("Disabled")
  const [target, setTarget] = useState("")
  return (
    <Section
      title="Server access logging"
      description={
        <>
          Log requests for access to your bucket. Use <Link href="/cloudwatch">CloudWatch</Link> to check the health of your server access logging. <LearnMore href={docs("ServerLogs.html")} />
        </>
      }
      onEdit={() => {
        setStatus(enabled ? "Enabled" : "Disabled")
        setTarget(enabled ? `s3://${enabled.TargetBucket}/${enabled.TargetPrefix ?? ""}` : "")
        setOpen(true)
      }}
      items={[
        { label: "Server access logging", value: enabled ? "Enabled" : "Disabled" },
        ...(enabled ? [{ label: "Destination", value: `s3://${enabled.TargetBucket}/${enabled.TargetPrefix ?? ""}` }] : []),
      ]}
    >
      <EditModal
        visible={open}
        title="Edit server access logging"
        onDismiss={() => setOpen(false)}
        success="Successfully edited server access logging."
        onSave={async () => {
          const match = /^s3:\/\/([^/]+)\/?(.*)$/.exec(target)
          if (status === "Enabled" && !match) throw new Error("Enter a destination in the format s3://bucket/prefix.")
          await s3Request("s3", "PutBucketLogging", {
            Bucket: bucket,
            BucketLoggingStatus: status === "Enabled" && match ? { LoggingEnabled: { TargetBucket: match[1], TargetPrefix: match[2] } } : {},
          })
        }}
      >
        <FormField label="Server access logging">
          <RadioGroup value={status} onChange={({ detail }) => setStatus(detail.value)} items={[{ value: "Disabled", label: "Disable" }, { value: "Enabled", label: "Enable" }]} />
        </FormField>
        {status === "Enabled" && (
          <FormField label="Destination" constraintText="Format: s3://bucket/prefix" stretch>
            <Input value={target} placeholder="s3://bucket/prefix" onChange={({ detail }) => setTarget(detail.value)} />
          </FormField>
        )}
      </EditModal>
    </Section>
  )
}

function CloudTrailSection() {
  const follow = useFollow()
  return (
    <Section
      title="AWS CloudTrail data events"
      description="You can view and configure CloudTrail data events for Amazon S3 bucket object-level operations in the AWS CloudTrail console."
      actions={<Button href="/cloudtrail" onFollow={follow} iconName="external" iconAlign="right">Configure in CloudTrail</Button>}
    />
  )
}

type NotificationConfig = {
  TopicConfigurations?: { Id?: string; TopicArn?: string; Events?: string[]; Filter?: unknown }[]
  QueueConfigurations?: { Id?: string; QueueArn?: string; Events?: string[]; Filter?: unknown }[]
  LambdaFunctionConfigurations?: { Id?: string; LambdaFunctionArn?: string; Events?: string[]; Filter?: unknown }[]
  EventBridgeConfiguration?: Record<string, unknown>
}

type NotificationRow = { id: string; events: string[]; type: string; destination: string; filter: string; kind: "Topic" | "Queue" | "LambdaFunction" }

function filterText(filter: unknown) {
  const rules = (filter as { Key?: { FilterRules?: { Name?: string; Value?: string }[] } } | undefined)?.Key?.FilterRules ?? []
  return rules.map((rule) => `${rule.Name}: ${rule.Value}`).join(", ") || "-"
}

const eventOptions = [
  "s3:ObjectCreated:*", "s3:ObjectCreated:Put", "s3:ObjectCreated:Post", "s3:ObjectCreated:Copy", "s3:ObjectCreated:CompleteMultipartUpload",
  "s3:ObjectRemoved:*", "s3:ObjectRemoved:Delete", "s3:ObjectRemoved:DeleteMarkerCreated",
  "s3:ObjectRestore:*", "s3:ObjectRestore:Post", "s3:ObjectRestore:Completed", "s3:ObjectRestore:Delete",
  "s3:ReducedRedundancyLostObject", "s3:Replication:*", "s3:LifecycleExpiration:*", "s3:LifecycleTransition",
  "s3:IntelligentTiering", "s3:ObjectTagging:*", "s3:ObjectAcl:Put",
]

function NotificationsSection({ bucket }: { bucket: string }) {
  const config = useS3<NotificationConfig>("s3", "GetBucketNotificationConfiguration", { Bucket: bucket })
  const data = config.data ?? {}
  const rows: NotificationRow[] = [
    ...(data.TopicConfigurations ?? []).map((item) => ({ id: item.Id ?? "", events: item.Events ?? [], type: "SNS topic", destination: item.TopicArn ?? "", filter: filterText(item.Filter), kind: "Topic" as const })),
    ...(data.QueueConfigurations ?? []).map((item) => ({ id: item.Id ?? "", events: item.Events ?? [], type: "SQS queue", destination: item.QueueArn ?? "", filter: filterText(item.Filter), kind: "Queue" as const })),
    ...(data.LambdaFunctionConfigurations ?? []).map((item) => ({ id: item.Id ?? "", events: item.Events ?? [], type: "Lambda function", destination: item.LambdaFunctionArn ?? "", filter: filterText(item.Filter), kind: "LambdaFunction" as const })),
  ]
  const [selected, setSelected] = useState<NotificationRow[]>([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: "", prefix: "", suffix: "", events: [] as string[], kind: "Queue", destination: "" })

  async function put(next: NotificationRow[], extra?: NotificationRow) {
    const all = extra ? [...next, extra] : next
    const filter = (row: NotificationRow & { prefix?: string; suffix?: string }) =>
      row.prefix || row.suffix
        ? { Key: { FilterRules: [...(row.prefix ? [{ Name: "prefix", Value: row.prefix }] : []), ...(row.suffix ? [{ Name: "suffix", Value: row.suffix }] : [])] } }
        : undefined
    const original = (row: NotificationRow) =>
      [...(data.TopicConfigurations ?? []), ...(data.QueueConfigurations ?? []), ...(data.LambdaFunctionConfigurations ?? [])].find((item) => item.Id === row.id)?.Filter
    const build = (kind: string, arnKey: string) =>
      all
        .filter((row) => row.kind === kind)
        .map((row) => ({ Id: row.id, [arnKey]: row.destination, Events: row.events, ...((row === extra ? filter(row as never) : original(row)) ? { Filter: row === extra ? filter(row as never) : original(row) } : {}) }))
    await s3Request("s3", "PutBucketNotificationConfiguration", {
      Bucket: bucket,
      NotificationConfiguration: {
        TopicConfigurations: build("Topic", "TopicArn"),
        QueueConfigurations: build("Queue", "QueueArn"),
        LambdaFunctionConfigurations: build("LambdaFunction", "LambdaFunctionArn"),
        ...(data.EventBridgeConfiguration ? { EventBridgeConfiguration: {} } : {}),
      },
    })
    await config.refetch()
  }

  return (
    <>
      <ResourceTable<NotificationRow>
        title="Event notifications"
        variant="container"
        info={false}
        description={<>Send a notification when specific events occur in your bucket. <LearnMore href={docs("EventNotifications.html")} /></>}
        items={rows}
        loading={config.isPending}
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="id"
        columns={[
          { id: "name", header: "Name", value: (row) => row.id, cell: (row) => row.id },
          { id: "events", header: "Event types", value: (row) => row.events.join(", "), cell: (row) => row.events.join(", ") },
          { id: "filters", header: "Filters", value: (row) => row.filter, cell: (row) => row.filter },
          { id: "type", header: "Destination type", value: (row) => row.type, cell: (row) => row.type },
          { id: "destination", header: "Destination", value: (row) => row.destination, cell: (row) => row.destination },
        ]}
        empty={<EmptyState title="No event notifications" subtitle="Choose Create event notification to be notified when a specific event occurs." action={<Button onClick={() => setCreating(true)}>Create event notification</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled disabledReason="Delete the notification and create it again to change it.">Edit</Button>
            <Button
              disabled={selected.length === 0}
              onClick={async () => {
                await put(rows.filter((row) => !selected.some((item) => item.id === row.id)))
                setSelected([])
                flash.success("Successfully deleted event notifications.")
              }}
            >
              Delete
            </Button>
            <Button onClick={() => setCreating(true)}>Create event notification</Button>
          </SpaceBetween>
        }
      />
      <EditModal
        visible={creating}
        title="Create event notification"
        size="large"
        saveLabel="Save changes"
        onDismiss={() => setCreating(false)}
        success="Successfully created event notification."
        onSave={async () => {
          if (!form.name || form.events.length === 0 || !form.destination) throw new Error("Enter a name, at least one event type, and a destination ARN.")
          await put(rows, { id: form.name, events: form.events, type: "", destination: form.destination, filter: "", kind: form.kind as NotificationRow["kind"], ...({ prefix: form.prefix, suffix: form.suffix } as object) } as NotificationRow)
          setForm({ name: "", prefix: "", suffix: "", events: [], kind: "Queue", destination: "" })
        }}
      >
        <FormField label="Event name" constraintText="Event name can contain up to 255 characters.">
          <Input value={form.name} onChange={({ detail }) => setForm({ ...form, name: detail.value })} />
        </FormField>
        <FormField label={<>Prefix - <i>optional</i></>}>
          <Input value={form.prefix} placeholder="images/" onChange={({ detail }) => setForm({ ...form, prefix: detail.value })} />
        </FormField>
        <FormField label={<>Suffix - <i>optional</i></>}>
          <Input value={form.suffix} placeholder=".jpg" onChange={({ detail }) => setForm({ ...form, suffix: detail.value })} />
        </FormField>
        <FormField label="Event types">
          <Multiselect
            selectedOptions={form.events.map((value) => ({ value, label: value }))}
            onChange={({ detail }) => setForm({ ...form, events: detail.selectedOptions.flatMap((option) => (option.value ? [option.value] : [])) })}
            options={eventOptions.map((value) => ({ value, label: value }))}
            placeholder="Choose event types"
          />
        </FormField>
        <FormField label="Destination">
          <RadioGroup
            value={form.kind}
            onChange={({ detail }) => setForm({ ...form, kind: detail.value })}
            items={[
              { value: "LambdaFunction", label: "Lambda function" },
              { value: "Topic", label: "SNS topic" },
              { value: "Queue", label: "SQS queue" },
            ]}
          />
        </FormField>
        <FormField label="Destination ARN" stretch>
          <Input value={form.destination} placeholder="arn:aws:sqs:region:account-id:queue-name" onChange={({ detail }) => setForm({ ...form, destination: detail.value })} />
        </FormField>
      </EditModal>
    </>
  )
}

function EventBridgeSection({ bucket }: { bucket: string }) {
  const config = useS3<NotificationConfig>("s3", "GetBucketNotificationConfiguration", { Bucket: bucket })
  const on = Boolean(config.data?.EventBridgeConfiguration)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("Off")
  return (
    <Section
      title="Amazon EventBridge"
      description={
        <>
          For additional capabilities, use Amazon EventBridge to build event-driven applications at scale using S3 event notifications. <LearnMore href={docs("EventBridge.html")} />
        </>
      }
      onEdit={() => {
        setValue(on ? "On" : "Off")
        setOpen(true)
      }}
      items={[{ label: "Send notifications to Amazon EventBridge for all events in this bucket", value: on ? "On" : "Off" }]}
    >
      <EditModal
        visible={open}
        title="Edit Amazon EventBridge"
        onDismiss={() => setOpen(false)}
        success="Successfully edited Amazon EventBridge."
        onSave={async () => {
          const data = config.data ?? {}
          await s3Request("s3", "PutBucketNotificationConfiguration", {
            Bucket: bucket,
            NotificationConfiguration: {
              TopicConfigurations: data.TopicConfigurations ?? [],
              QueueConfigurations: data.QueueConfigurations ?? [],
              LambdaFunctionConfigurations: data.LambdaFunctionConfigurations ?? [],
              ...(value === "On" ? { EventBridgeConfiguration: {} } : {}),
            },
          })
          await config.refetch()
        }}
      >
        <FormField label="Send notifications to Amazon EventBridge for all events in this bucket">
          <RadioGroup value={value} onChange={({ detail }) => setValue(detail.value)} items={[{ value: "Off", label: "Off" }, { value: "On", label: "On" }]} />
        </FormField>
      </EditModal>
    </Section>
  )
}

const accelerationRegions = new Set(["us-east-1", "us-east-2", "us-west-1", "us-west-2", "ap-south-1", "ap-northeast-1", "ap-northeast-2", "ap-southeast-1", "ap-southeast-2", "ca-central-1", "eu-central-1", "eu-west-1", "eu-west-2", "eu-west-3", "eu-north-1", "sa-east-1"])

function AccelerationSection({ bucket, region }: { bucket: string; region?: string }) {
  const supported = !region || accelerationRegions.has(region)
  const acceleration = useS3<{ Status?: string }>("s3", "GetBucketAccelerateConfiguration", { Bucket: bucket }, { enabled: supported })
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("Suspended")
  const status = acceleration.data?.Status ?? "Suspended"
  return (
    <Section
      title="Transfer acceleration"
      description={<>Use an accelerated endpoint for faster data transfers. <LearnMore href={docs("transfer-acceleration.html")} /></>}
      onEdit={supported ? () => { setValue(status); setOpen(true) } : undefined}
      editDisabledReason={supported ? undefined : "Transfer acceleration is not available in this Region."}
    >
      {supported ? (
        <Box>
          <Box variant="awsui-key-label">Transfer acceleration</Box>
          <Enabled value={status === "Enabled"} off="Suspended" />
        </Box>
      ) : (
        <Alert type="info" header="Transfer acceleration is not available for this bucket">
          Amazon S3 Transfer acceleration is not available for your bucket because it is located in an unsupported Region. <LearnMore href={docs("transfer-acceleration.html")} />
        </Alert>
      )}
      <EditModal
        visible={open}
        title="Edit transfer acceleration"
        onDismiss={() => setOpen(false)}
        success="Successfully edited transfer acceleration."
        onSave={() => s3Request("s3", "PutBucketAccelerateConfiguration", { Bucket: bucket, AccelerateConfiguration: { Status: value } })}
      >
        <FormField label="Transfer acceleration">
          <RadioGroup value={value} onChange={({ detail }) => setValue(detail.value)} items={[{ value: "Suspended", label: "Disable" }, { value: "Enabled", label: "Enable" }]} />
        </FormField>
      </EditModal>
    </Section>
  )
}

function ObjectLockSection({ bucket }: { bucket: string }) {
  const lock = useS3<{ ObjectLockConfiguration?: { ObjectLockEnabled?: string; Rule?: { DefaultRetention?: { Mode?: string; Days?: number; Years?: number } } } }>("s3", "GetObjectLockConfiguration", { Bucket: bucket })
  const config = lock.data?.ObjectLockConfiguration
  const enabled = config?.ObjectLockEnabled === "Enabled"
  const retention = config?.Rule?.DefaultRetention
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState("Disabled")
  const [period, setPeriod] = useState("1")
  const [unit, setUnit] = useState("Days")
  return (
    <Section
      title="Object Lock"
      description={
        <>
          Store objects using a write-once-read-many (WORM) model to help you prevent objects from being deleted or overwritten for a fixed amount of time or indefinitely. Object Lock works only in versioned buckets. <LearnMore href={docs("object-lock.html")} />
        </>
      }
      onEdit={enabled ? () => {
        setMode(retention?.Mode ?? "Disabled")
        setPeriod(String(retention?.Days ?? retention?.Years ?? 1))
        setUnit(retention?.Years ? "Years" : "Days")
        setOpen(true)
      } : undefined}
      editDisabledReason={enabled ? undefined : "Object Lock can only be enabled when you create a bucket."}
      items={[
        { label: "Object Lock", value: enabled ? "Enabled" : "Disabled" },
        ...(enabled
          ? [
              { label: "Default retention", value: retention?.Mode ? "Enabled" : "Disabled" },
              ...(retention?.Mode ? [{ label: "Default retention mode", value: retention.Mode === "GOVERNANCE" ? "Governance" : "Compliance" }, { label: "Default retention period", value: retention.Days ? `${retention.Days} days` : `${retention.Years} years` }] : []),
            ]
          : []),
      ]}
    >
      <EditModal
        visible={open}
        title="Edit Object Lock"
        onDismiss={() => setOpen(false)}
        success="Successfully edited Object Lock."
        onSave={() =>
          s3Request("s3", "PutObjectLockConfiguration", {
            Bucket: bucket,
            ObjectLockConfiguration: {
              ObjectLockEnabled: "Enabled",
              ...(mode !== "Disabled" ? { Rule: { DefaultRetention: { Mode: mode, [unit]: Number(period) } } } : {}),
            },
          })
        }
      >
        <FormField label="Default retention">
          <RadioGroup
            value={mode}
            onChange={({ detail }) => setMode(detail.value)}
            items={[
              { value: "Disabled", label: "Disable" },
              { value: "GOVERNANCE", label: "Governance", description: "Users with specific IAM permissions can overwrite or delete protected object versions during the retention period." },
              { value: "COMPLIANCE", label: "Compliance", description: "No users can overwrite or delete protected object versions during the retention period." },
            ]}
          />
        </FormField>
        {mode !== "Disabled" && (
          <SpaceBetween direction="horizontal" size="xs">
            <FormField label="Default retention period">
              <Input type="number" value={period} onChange={({ detail }) => setPeriod(detail.value)} />
            </FormField>
            <FormField label="Unit">
              <Select selectedOption={{ value: unit, label: unit }} onChange={({ detail }) => setUnit(detail.selectedOption.value ?? "Days")} options={[{ value: "Days", label: "Days" }, { value: "Years", label: "Years" }]} />
            </FormField>
          </SpaceBetween>
        )}
      </EditModal>
    </Section>
  )
}

function RequesterPaysSection({ bucket }: { bucket: string }) {
  const payment = useS3<{ Payer?: string }>("s3", "GetBucketRequestPayment", { Bucket: bucket })
  const enabled = payment.data?.Payer === "Requester"
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("Disabled")
  return (
    <Section
      title="Requester pays"
      description={<>When enabled, the requester pays for requests and data transfer costs, and anonymous access to this bucket is disabled. <LearnMore href={docs("RequesterPaysBuckets.html")} /></>}
      onEdit={() => { setValue(enabled ? "Enabled" : "Disabled"); setOpen(true) }}
      items={[{ label: "Requester pays", value: enabled ? "Enabled" : "Disabled" }]}
    >
      <EditModal
        visible={open}
        title="Edit requester pays"
        onDismiss={() => setOpen(false)}
        success="Successfully edited requester pays."
        onSave={() => s3Request("s3", "PutBucketRequestPayment", { Bucket: bucket, RequestPaymentConfiguration: { Payer: value === "Enabled" ? "Requester" : "BucketOwner" } })}
      >
        <FormField label="Requester pays">
          <RadioGroup value={value} onChange={({ detail }) => setValue(detail.value)} items={[{ value: "Disabled", label: "Disable" }, { value: "Enabled", label: "Enable" }]} />
        </FormField>
      </EditModal>
    </Section>
  )
}

type Website = {
  IndexDocument?: { Suffix?: string }
  ErrorDocument?: { Key?: string }
  RedirectAllRequestsTo?: { HostName?: string; Protocol?: string }
  RoutingRules?: unknown[]
}

function WebsiteSection({ bucket, region }: { bucket: string; region?: string }) {
  const website = useS3<Website>("s3", "GetBucketWebsite", { Bucket: bucket })
  const config = website.data
  const enabled = Boolean(config)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ status: "Disabled", type: "host", index: "index.html", error: "", host: "", protocol: "none", rules: "" })
  const endpoint = `http://${bucket}.s3-website.${region ?? "ap-southeast-7"}.amazonaws.com`
  return (
    <Section
      title="Static website hosting"
      description={<>Use this bucket to host a website or redirect requests. <LearnMore href={docs("WebsiteHosting.html")} /></>}
      onEdit={() => {
        setForm({
          status: enabled ? "Enabled" : "Disabled",
          type: config?.RedirectAllRequestsTo ? "redirect" : "host",
          index: config?.IndexDocument?.Suffix ?? "index.html",
          error: config?.ErrorDocument?.Key ?? "",
          host: config?.RedirectAllRequestsTo?.HostName ?? "",
          protocol: config?.RedirectAllRequestsTo?.Protocol ?? "none",
          rules: config?.RoutingRules ? JSON.stringify(config.RoutingRules, null, 2) : "",
        })
        setOpen(true)
      }}
      items={[
        { label: "S3 static website hosting", value: enabled ? "Enabled" : "Disabled" },
        ...(enabled
          ? [
              { label: "Hosting type", value: config?.RedirectAllRequestsTo ? "Redirect requests for an object" : "Bucket hosting" },
              { label: "Bucket website endpoint", value: endpoint },
            ]
          : []),
      ]}
    >
      <EditModal
        visible={open}
        size="large"
        title="Edit static website hosting"
        onDismiss={() => setOpen(false)}
        success="Successfully edited static website hosting."
        onSave={async () => {
          if (form.status === "Disabled") {
            await s3Request("s3", "DeleteBucketWebsite", { Bucket: bucket })
            return
          }
          await s3Request("s3", "PutBucketWebsite", {
            Bucket: bucket,
            WebsiteConfiguration:
              form.type === "redirect"
                ? { RedirectAllRequestsTo: { HostName: form.host, ...(form.protocol !== "none" ? { Protocol: form.protocol } : {}) } }
                : {
                    IndexDocument: { Suffix: form.index },
                    ...(form.error ? { ErrorDocument: { Key: form.error } } : {}),
                    ...(form.rules.trim() ? { RoutingRules: JSON.parse(form.rules) } : {}),
                  },
          })
        }}
      >
        <FormField label="Static website hosting">
          <RadioGroup value={form.status} onChange={({ detail }) => setForm({ ...form, status: detail.value })} items={[{ value: "Disabled", label: "Disable" }, { value: "Enabled", label: "Enable" }]} />
        </FormField>
        {form.status === "Enabled" && (
          <>
            <FormField label="Hosting type">
              <RadioGroup
                value={form.type}
                onChange={({ detail }) => setForm({ ...form, type: detail.value })}
                items={[
                  { value: "host", label: "Host a static website", description: "Use the bucket endpoint as the web address." },
                  { value: "redirect", label: "Redirect requests for an object", description: "Redirect requests to another bucket or domain." },
                ]}
              />
            </FormField>
            {form.type === "host" ? (
              <>
                <FormField label="Index document" description="Specify the home or default page of the website.">
                  <Input value={form.index} onChange={({ detail }) => setForm({ ...form, index: detail.value })} />
                </FormField>
                <FormField label={<>Error document - <i>optional</i></>} description="This is returned when an error occurs.">
                  <Input value={form.error} placeholder="error.html" onChange={({ detail }) => setForm({ ...form, error: detail.value })} />
                </FormField>
                <FormField label={<>Redirection rules - <i>optional</i></>} description="Redirection rules, written in JSON, automatically redirect webpage requests for specific content.">
                  <Input value={form.rules} onChange={({ detail }) => setForm({ ...form, rules: detail.value })} />
                </FormField>
              </>
            ) : (
              <>
                <FormField label="Host name">
                  <Input value={form.host} onChange={({ detail }) => setForm({ ...form, host: detail.value })} />
                </FormField>
                <FormField label="Protocol">
                  <RadioGroup value={form.protocol} onChange={({ detail }) => setForm({ ...form, protocol: detail.value })} items={[{ value: "none", label: "none" }, { value: "http", label: "http" }, { value: "https", label: "https" }]} />
                </FormField>
              </>
            )}
          </>
        )}
      </EditModal>
    </Section>
  )
}
