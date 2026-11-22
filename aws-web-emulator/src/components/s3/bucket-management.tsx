"use client"

import Alert from "@cloudscape-design/components/alert"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import Checkbox from "@cloudscape-design/components/checkbox"
import Container from "@cloudscape-design/components/container"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import { useState } from "react"
import { flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, LearnMore, notInEmulator } from "@/components/console/sections"
import { storageClasses } from "@/components/s3/bucket-objects"
import { s3Request, useS3 } from "@/components/s3/s3-hooks"

const docs = (path: string) => `https://docs.aws.amazon.com/AmazonS3/latest/userguide/${path}`

type LifecycleRule = {
  ID?: string
  Status?: string
  Filter?: { Prefix?: string }
  Prefix?: string
  Expiration?: { Days?: number; ExpiredObjectDeleteMarker?: boolean }
  Transitions?: { Days?: number; StorageClass?: string }[]
  NoncurrentVersionExpiration?: { NoncurrentDays?: number }
  NoncurrentVersionTransitions?: { NoncurrentDays?: number; StorageClass?: string }[]
  AbortIncompleteMultipartUpload?: { DaysAfterInitiation?: number }
}

export function BucketManagementTab({ bucket }: { bucket: string }) {
  return (
    <SpaceBetween size="l">
      <LifecycleSection bucket={bucket} />
      <ReplicationSection bucket={bucket} />
      <InventorySection bucket={bucket} />
    </SpaceBetween>
  )
}

const ruleScope = (rule: LifecycleRule) => {
  const prefix = rule.Filter?.Prefix ?? rule.Prefix
  return prefix ? `Prefix: ${prefix}` : "Entire bucket"
}

function LifecycleSection({ bucket }: { bucket: string }) {
  const lifecycle = useS3<{ Rules?: LifecycleRule[] }>("s3", "GetBucketLifecycleConfiguration", { Bucket: bucket })
  const rules = lifecycle.data?.Rules ?? []
  const [selected, setSelected] = useState<LifecycleRule[]>([])
  const [editing, setEditing] = useState<LifecycleForm | null>(null)

  async function save(next: LifecycleRule[]) {
    if (next.length) await s3Request("s3", "PutBucketLifecycleConfiguration", { Bucket: bucket, LifecycleConfiguration: { Rules: next } })
    else await s3Request("s3", "DeleteBucketLifecycle", { Bucket: bucket })
    await lifecycle.refetch()
  }

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="To manage your objects so that they are stored cost effectively throughout their lifecycle, configure their lifecycle. A lifecycle configuration is a set of rules that define actions that Amazon S3 applies to a group of objects. Lifecycle rules run once per day."
        >
          Lifecycle configuration
        </Header>
      }
    >
      <ResourceTable<LifecycleRule>
        title="Lifecycle rules"
        variant="embedded"
        headerVariant="h2"
        info={false}
        description={<>Use lifecycle rules to define actions you want Amazon S3 to take during an object&apos;s lifetime such as transitioning objects to another storage class, archiving them, or deleting them after a specified period of time. <LearnMore href={docs("object-lifecycle-mgmt.html")} /></>}
        items={rules}
        loading={lifecycle.isPending}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="ID"
        columns={[
          { id: "name", header: "Lifecycle rule name", value: (rule) => rule.ID, cell: (rule) => rule.ID },
          { id: "status", header: "Status", value: (rule) => rule.Status, cell: (rule) => <StatusIndicator type={rule.Status === "Enabled" ? "success" : "stopped"}>{rule.Status}</StatusIndicator> },
          { id: "scope", header: "Scope", value: ruleScope, cell: ruleScope },
          {
            id: "current",
            header: "Current version actions",
            cell: (rule) =>
              [
                ...(rule.Transitions ?? []).map((item) => `Transition to ${item.StorageClass} after ${item.Days} days`),
                rule.Expiration?.Days ? `Expire after ${rule.Expiration.Days} days` : "",
              ].filter(Boolean).join("; ") || "-",
          },
          {
            id: "noncurrent",
            header: "Noncurrent versions actions",
            cell: (rule) =>
              [
                ...(rule.NoncurrentVersionTransitions ?? []).map((item) => `Transition to ${item.StorageClass} after ${item.NoncurrentDays} days`),
                rule.NoncurrentVersionExpiration?.NoncurrentDays ? `Delete after ${rule.NoncurrentVersionExpiration.NoncurrentDays} days` : "",
              ].filter(Boolean).join("; ") || "-",
          },
          { id: "markers", header: "Expired object delete markers", cell: (rule) => (rule.Expiration?.ExpiredObjectDeleteMarker ? "Delete" : "-") },
          { id: "multipart", header: "Incomplete multipart uploads", cell: (rule) => (rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation ? `Delete after ${rule.AbortIncompleteMultipartUpload.DaysAfterInitiation} days` : "-") },
        ]}
        empty={<EmptyState title="No lifecycle rules" subtitle="There are no lifecycle rules for this bucket." action={<Button onClick={() => setEditing(emptyLifecycle())}>Create lifecycle rule</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled={!selected[0]} onClick={() => setEditing(lifecycleForm(selected[0]))}>View details</Button>
            <Button disabled={!selected[0]} onClick={() => setEditing(lifecycleForm(selected[0]))}>Edit</Button>
            <Button
              disabled={!selected[0]}
              onClick={async () => {
                await save(rules.filter((rule) => rule.ID !== selected[0].ID))
                setSelected([])
                flash.success("Successfully deleted lifecycle rule.")
              }}
            >
              Delete
            </Button>
            <ButtonDropdown
              disabled={!selected[0]}
              items={[
                { id: "enable", text: "Enable rule", disabled: selected[0]?.Status === "Enabled" },
                { id: "disable", text: "Disable rule", disabled: selected[0]?.Status !== "Enabled" },
              ]}
              onItemClick={async ({ detail }) => {
                await save(rules.map((rule) => (rule.ID === selected[0].ID ? { ...rule, Status: detail.id === "enable" ? "Enabled" : "Disabled" } : rule)))
                flash.success(`Successfully ${detail.id === "enable" ? "enabled" : "disabled"} lifecycle rule.`)
              }}
            >
              Actions
            </ButtonDropdown>
            <Button onClick={() => setEditing(emptyLifecycle())}>Create lifecycle rule</Button>
          </SpaceBetween>
        }
      />
      <LifecycleModal
        form={editing}
        onChange={setEditing}
        onDismiss={() => setEditing(null)}
        onSave={async (rule, original) => {
          await save(original ? rules.map((item) => (item.ID === original ? rule : item)) : [...rules, rule])
        }}
      />
    </Container>
  )
}

type LifecycleForm = {
  original?: string
  id: string
  status: string
  scope: "all" | "prefix"
  prefix: string
  acknowledge: boolean
  transition: boolean
  transitionClass: string
  transitionDays: string
  expire: boolean
  expireDays: string
  noncurrent: boolean
  noncurrentDays: string
  markers: boolean
  multipart: boolean
  multipartDays: string
}

function emptyLifecycle(): LifecycleForm {
  return { id: "", status: "Enabled", scope: "prefix", prefix: "", acknowledge: false, transition: false, transitionClass: "STANDARD_IA", transitionDays: "30", expire: false, expireDays: "365", noncurrent: false, noncurrentDays: "30", markers: false, multipart: false, multipartDays: "7" }
}

function lifecycleForm(rule: LifecycleRule): LifecycleForm {
  const prefix = rule.Filter?.Prefix ?? rule.Prefix ?? ""
  return {
    original: rule.ID,
    id: rule.ID ?? "",
    status: rule.Status ?? "Enabled",
    scope: prefix ? "prefix" : "all",
    prefix,
    acknowledge: true,
    transition: Boolean(rule.Transitions?.length),
    transitionClass: rule.Transitions?.[0]?.StorageClass ?? "STANDARD_IA",
    transitionDays: String(rule.Transitions?.[0]?.Days ?? 30),
    expire: Boolean(rule.Expiration?.Days),
    expireDays: String(rule.Expiration?.Days ?? 365),
    noncurrent: Boolean(rule.NoncurrentVersionExpiration),
    noncurrentDays: String(rule.NoncurrentVersionExpiration?.NoncurrentDays ?? 30),
    markers: Boolean(rule.Expiration?.ExpiredObjectDeleteMarker),
    multipart: Boolean(rule.AbortIncompleteMultipartUpload),
    multipartDays: String(rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation ?? 7),
  }
}

function LifecycleModal({
  form,
  onChange,
  onDismiss,
  onSave,
}: {
  form: LifecycleForm | null
  onChange: (form: LifecycleForm) => void
  onDismiss: () => void
  onSave: (rule: LifecycleRule, original?: string) => Promise<void>
}) {
  const set = (patch: Partial<LifecycleForm>) => form && onChange({ ...form, ...patch })
  return (
    <EditModal
      visible={form !== null}
      size="large"
      title={form?.original ? "Edit lifecycle rule" : "Create lifecycle rule"}
      saveLabel={form?.original ? "Save changes" : "Create rule"}
      onDismiss={onDismiss}
      success={form?.original ? "Successfully edited lifecycle rule." : "Successfully created lifecycle rule."}
      onSave={async () => {
        if (!form?.id) throw new Error("Enter a lifecycle rule name.")
        if (form.scope === "all" && !form.acknowledge) throw new Error("Acknowledge that this rule applies to all objects in the bucket.")
        const markers = form.markers && !form.expire
        await onSave(
          {
            ID: form.id,
            Status: form.status,
            Filter: { Prefix: form.scope === "prefix" ? form.prefix : "" },
            ...(form.transition ? { Transitions: [{ Days: Number(form.transitionDays), StorageClass: form.transitionClass }] } : {}),
            ...(form.expire ? { Expiration: { Days: Number(form.expireDays) } } : markers ? { Expiration: { ExpiredObjectDeleteMarker: true } } : {}),
            ...(form.noncurrent ? { NoncurrentVersionExpiration: { NoncurrentDays: Number(form.noncurrentDays) } } : {}),
            ...(form.multipart ? { AbortIncompleteMultipartUpload: { DaysAfterInitiation: Number(form.multipartDays) } } : {}),
          },
          form.original,
        )
      }}
    >
      {form && (
        <SpaceBetween size="m">
          <FormField label="Lifecycle rule name" constraintText="Up to 255 characters">
            <Input value={form.id} onChange={({ detail }) => set({ id: detail.value })} />
          </FormField>
          <FormField label="Status">
            <RadioGroup value={form.status} onChange={({ detail }) => set({ status: detail.value })} items={[{ value: "Enabled", label: "Enabled" }, { value: "Disabled", label: "Disabled" }]} />
          </FormField>
          <FormField label="Choose a rule scope">
            <RadioGroup
              value={form.scope}
              onChange={({ detail }) => set({ scope: detail.value as LifecycleForm["scope"] })}
              items={[
                { value: "prefix", label: "Limit the scope of this rule using one or more filters" },
                { value: "all", label: "Apply to all objects in the bucket" },
              ]}
            />
          </FormField>
          {form.scope === "prefix" ? (
            <FormField label="Prefix" description="Add filter to limit the scope of this rule to a single prefix.">
              <Input value={form.prefix} placeholder="Enter prefix" onChange={({ detail }) => set({ prefix: detail.value })} />
            </FormField>
          ) : (
            <Alert type="warning">
              <Checkbox checked={form.acknowledge} onChange={({ detail }) => set({ acknowledge: detail.checked })}>
                I acknowledge that this rule will apply to all objects in the bucket.
              </Checkbox>
            </Alert>
          )}
          <FormField label="Lifecycle rule actions" description="Choose the actions you want this rule to perform.">
            <SpaceBetween size="xs">
              <Checkbox checked={form.transition} onChange={({ detail }) => set({ transition: detail.checked })}>Transition current versions of objects between storage classes</Checkbox>
              <Checkbox checked={form.expire} onChange={({ detail }) => set({ expire: detail.checked })}>Expire current versions of objects</Checkbox>
              <Checkbox checked={form.noncurrent} onChange={({ detail }) => set({ noncurrent: detail.checked })}>Permanently delete noncurrent versions of objects</Checkbox>
              <Checkbox checked={form.markers} disabled={form.expire} onChange={({ detail }) => set({ markers: detail.checked })}>Delete expired object delete markers or incomplete multipart uploads</Checkbox>
              <Checkbox checked={form.multipart} onChange={({ detail }) => set({ multipart: detail.checked })}>Delete incomplete multipart uploads</Checkbox>
            </SpaceBetween>
          </FormField>
          {form.transition && (
            <SpaceBetween direction="horizontal" size="xs">
              <FormField label="Choose storage class transitions">
                <Select
                  selectedOption={storageClasses.find((item) => item.value === form.transitionClass) ?? null}
                  onChange={({ detail }) => set({ transitionClass: detail.selectedOption.value ?? "STANDARD_IA" })}
                  options={storageClasses.filter((item) => item.value !== "STANDARD" && item.value !== "REDUCED_REDUNDANCY")}
                />
              </FormField>
              <FormField label="Days after object creation">
                <Input type="number" value={form.transitionDays} onChange={({ detail }) => set({ transitionDays: detail.value })} />
              </FormField>
            </SpaceBetween>
          )}
          {form.expire && (
            <FormField label="Days after object creation">
              <Input type="number" value={form.expireDays} onChange={({ detail }) => set({ expireDays: detail.value })} />
            </FormField>
          )}
          {form.noncurrent && (
            <FormField label="Days after objects become noncurrent">
              <Input type="number" value={form.noncurrentDays} onChange={({ detail }) => set({ noncurrentDays: detail.value })} />
            </FormField>
          )}
          {form.multipart && (
            <FormField label="Number of days">
              <Input type="number" value={form.multipartDays} onChange={({ detail }) => set({ multipartDays: detail.value })} />
            </FormField>
          )}
        </SpaceBetween>
      )}
    </EditModal>
  )
}

type ReplicationRule = {
  ID?: string
  Status?: string
  Priority?: number
  Filter?: { Prefix?: string }
  Destination?: { Bucket?: string; StorageClass?: string; Account?: string; ReplicationTime?: { Status?: string } }
  DeleteMarkerReplication?: { Status?: string }
}

function ReplicationSection({ bucket }: { bucket: string }) {
  const replication = useS3<{ ReplicationConfiguration?: { Role?: string; Rules?: ReplicationRule[] } }>("s3", "GetBucketReplication", { Bucket: bucket })
  const config = replication.data?.ReplicationConfiguration
  const rules = config?.Rules ?? []
  const versioning = useS3<{ Status?: string }>("s3", "GetBucketVersioning", { Bucket: bucket })
  const [selected, setSelected] = useState<ReplicationRule[]>([])
  const [form, setForm] = useState<{ id: string; prefix: string; destination: string; role: string; storageClass: string; priority: string } | null>(null)

  async function save(next: ReplicationRule[], role = config?.Role) {
    if (next.length) await s3Request("s3", "PutBucketReplication", { Bucket: bucket, ReplicationConfiguration: { Role: role, Rules: next } })
    else await s3Request("s3", "DeleteBucketReplication", { Bucket: bucket })
    await replication.refetch()
  }

  return (
    <>
      <ResourceTable<ReplicationRule>
        title="Replication rules"
        variant="container"
        info={false}
        description={<>Use replication rules to define options you want Amazon S3 to apply during replication such as server-side encryption, replica ownership, transitioning replicas to another storage class, and more. <LearnMore href={docs("replication.html")} /></>}
        items={rules}
        loading={replication.isPending}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="ID"
        columns={[
          { id: "name", header: "Replication rule name", value: (rule) => rule.ID, cell: (rule) => rule.ID },
          { id: "status", header: "Status", value: (rule) => rule.Status, cell: (rule) => <StatusIndicator type={rule.Status === "Enabled" ? "success" : "stopped"}>{rule.Status}</StatusIndicator> },
          { id: "destination", header: "Destination bucket", value: (rule) => rule.Destination?.Bucket, cell: (rule) => rule.Destination?.Bucket?.replace("arn:aws:s3:::", "") ?? "-" },
          { id: "region", header: "Destination Region", cell: () => "-" },
          { id: "priority", header: "Priority", value: (rule) => rule.Priority, cell: (rule) => rule.Priority ?? "-" },
          { id: "scope", header: "Scope", cell: (rule) => (rule.Filter?.Prefix ? `Prefix: ${rule.Filter.Prefix}` : "Entire bucket") },
          { id: "storage", header: "Storage class", cell: (rule) => rule.Destination?.StorageClass ?? "Same as source" },
          { id: "owner", header: "Replica owner", cell: (rule) => (rule.Destination?.Account ? rule.Destination.Account : "Same as source") },
          { id: "rtc", header: "Replication Time Control", cell: (rule) => rule.Destination?.ReplicationTime?.Status ?? "Disabled" },
          { id: "kms", header: "KMS-encrypted objects (SSE-KMS or DSSE-KMS)", cell: () => "Do not replicate" },
          { id: "keys", header: "Specified KMS keys", cell: () => "-" },
          { id: "sync", header: "Replica modification sync", cell: () => "Disabled" },
        ]}
        empty={<EmptyState title="No replication rules" subtitle="You don't have any rules in the replication configuration." action={<Button onClick={() => setForm({ id: "", prefix: "", destination: "", role: config?.Role ?? "", storageClass: "", priority: "0" })}>Create replication rule</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled={!selected[0]}>View details</Button>
            <Button disabled disabledReason="Delete the rule and create it again to change it.">Edit rule</Button>
            <Button
              disabled={!selected[0]}
              onClick={async () => {
                await save(rules.filter((rule) => rule.ID !== selected[0].ID))
                setSelected([])
                flash.success("Successfully deleted replication rule.")
              }}
            >
              Delete
            </Button>
            <ButtonDropdown disabled items={[{ id: "batch", text: "Replicate existing objects", disabledReason: notInEmulator }]}>Actions</ButtonDropdown>
            <Button onClick={() => setForm({ id: "", prefix: "", destination: "", role: config?.Role ?? "", storageClass: "", priority: "0" })}>Create replication rule</Button>
          </SpaceBetween>
        }
      />
      <EditModal
        visible={form !== null}
        size="large"
        title="Create replication rule"
        saveLabel="Save"
        onDismiss={() => setForm(null)}
        success="Successfully created replication rule."
        onSave={async () => {
          if (!form) return
          if (versioning.data?.Status !== "Enabled") throw new Error("Replication requires versioning to be enabled for the source bucket.")
          if (!form.id || !form.destination || !form.role) throw new Error("Enter a rule name, destination bucket, and IAM role ARN.")
          await save(
            [
              ...rules,
              {
                ID: form.id,
                Status: "Enabled",
                Priority: Number(form.priority),
                Filter: { Prefix: form.prefix },
                DeleteMarkerReplication: { Status: "Disabled" },
                Destination: { Bucket: form.destination.startsWith("arn:") ? form.destination : `arn:aws:s3:::${form.destination}`, ...(form.storageClass ? { StorageClass: form.storageClass } : {}) },
              },
            ],
            form.role,
          )
        }}
      >
        {versioning.data?.Status !== "Enabled" && <Alert type="warning">Replication requires versioning to be enabled for the source bucket.</Alert>}
        {form && (
          <SpaceBetween size="m">
            <FormField label="Replication rule name"><Input value={form.id} onChange={({ detail }) => setForm({ ...form, id: detail.value })} /></FormField>
            <FormField label="Priority"><Input type="number" value={form.priority} onChange={({ detail }) => setForm({ ...form, priority: detail.value })} /></FormField>
            <FormField label={<>Prefix - <i>optional</i></>}><Input value={form.prefix} onChange={({ detail }) => setForm({ ...form, prefix: detail.value })} /></FormField>
            <FormField label="Destination bucket" constraintText="Bucket name or ARN"><Input value={form.destination} onChange={({ detail }) => setForm({ ...form, destination: detail.value })} /></FormField>
            <FormField label="IAM role ARN"><Input value={form.role} placeholder="arn:aws:iam::account-id:role/role-name" onChange={({ detail }) => setForm({ ...form, role: detail.value })} /></FormField>
            <FormField label={<>Destination storage class - <i>optional</i></>}>
              <Select
                selectedOption={form.storageClass ? storageClasses.find((item) => item.value === form.storageClass) ?? null : { value: "", label: "Same as source" }}
                onChange={({ detail }) => setForm({ ...form, storageClass: detail.selectedOption.value ?? "" })}
                options={[{ value: "", label: "Same as source" }, ...storageClasses]}
              />
            </FormField>
          </SpaceBetween>
        )}
      </EditModal>
    </>
  )
}

type Inventory = {
  Id?: string
  IsEnabled?: boolean
  Filter?: { Prefix?: string }
  Destination?: { S3BucketDestination?: { Bucket?: string; Prefix?: string; Format?: string } }
  Schedule?: { Frequency?: string }
  IncludedObjectVersions?: string
}

function InventorySection({ bucket }: { bucket: string }) {
  const inventory = useS3<{ InventoryConfigurationList?: Inventory[] }>("s3", "ListBucketInventoryConfigurations", { Bucket: bucket })
  const items = inventory.data?.InventoryConfigurationList ?? []
  const [selected, setSelected] = useState<Inventory[]>([])
  const [form, setForm] = useState<{ id: string; prefix: string; destination: string; frequency: string; format: string; versions: string; enabled: boolean } | null>(null)
  const empty = { id: "", prefix: "", destination: `s3://${bucket}/`, frequency: "Daily", format: "CSV", versions: "Current", enabled: true }
  return (
    <>
      <ResourceTable<Inventory>
        title="Inventory configurations"
        variant="container"
        info={false}
        description={<>You can create inventory configurations on a bucket to generate a flat file list of your objects and metadata. These scheduled reports can include all objects in the bucket or be limited to a shared prefix. <LearnMore href={docs("storage-inventory.html")} /></>}
        items={items}
        loading={inventory.isPending}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="Id"
        columns={[
          { id: "name", header: "Name", value: (item) => item.Id, cell: (item) => item.Id },
          { id: "status", header: "Status", cell: (item) => <StatusIndicator type={item.IsEnabled ? "success" : "stopped"}>{item.IsEnabled ? "Enabled" : "Disabled"}</StatusIndicator> },
          { id: "scope", header: "Scope", cell: (item) => (item.Filter?.Prefix ? `Prefix: ${item.Filter.Prefix}` : "Entire bucket") },
          { id: "destination", header: "Destination", cell: (item) => `s3://${item.Destination?.S3BucketDestination?.Bucket?.replace("arn:aws:s3:::", "")}/${item.Destination?.S3BucketDestination?.Prefix ?? ""}` },
          { id: "frequency", header: "Frequency", cell: (item) => item.Schedule?.Frequency ?? "-" },
          { id: "export", header: "Last export", cell: () => "-" },
          { id: "format", header: "Format", cell: (item) => item.Destination?.S3BucketDestination?.Format ?? "-" },
        ]}
        empty={<EmptyState title="No configurations" subtitle="No configurations to display" action={<Button onClick={() => setForm(empty)}>Create inventory configuration</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button disabled disabledReason="Delete the configuration and create it again to change it.">Edit</Button>
            <Button
              disabled={!selected[0]}
              onClick={async () => {
                await s3Request("s3", "DeleteBucketInventoryConfiguration", { Bucket: bucket, Id: selected[0].Id })
                setSelected([])
                await inventory.refetch()
                flash.success("Successfully deleted inventory configuration.")
              }}
            >
              Delete
            </Button>
            <Button disabled={!selected[0]} href="/s3/jobs/create">Create job from manifest</Button>
            <Button onClick={() => setForm(empty)}>Create inventory configuration</Button>
          </SpaceBetween>
        }
      />
      <EditModal
        visible={form !== null}
        size="large"
        title="Create inventory configuration"
        saveLabel="Create"
        onDismiss={() => setForm(null)}
        success="Successfully created inventory configuration."
        onSave={async () => {
          if (!form) return
          const match = /^s3:\/\/([^/]+)\/?(.*)$/.exec(form.destination)
          if (!form.id || !match) throw new Error("Enter a configuration name and a destination in the format s3://bucket/prefix.")
          await s3Request("s3", "PutBucketInventoryConfiguration", {
            Bucket: bucket,
            Id: form.id,
            InventoryConfiguration: {
              Id: form.id,
              IsEnabled: form.enabled,
              IncludedObjectVersions: form.versions,
              Schedule: { Frequency: form.frequency },
              ...(form.prefix ? { Filter: { Prefix: form.prefix } } : {}),
              Destination: { S3BucketDestination: { Bucket: `arn:aws:s3:::${match[1]}`, Prefix: match[2] || undefined, Format: form.format } },
            },
          })
          await inventory.refetch()
        }}
      >
        {form && (
          <SpaceBetween size="m">
            <FormField label="Inventory configuration name"><Input value={form.id} onChange={({ detail }) => setForm({ ...form, id: detail.value })} /></FormField>
            <FormField label={<>Prefix - <i>optional</i></>}><Input value={form.prefix} onChange={({ detail }) => setForm({ ...form, prefix: detail.value })} /></FormField>
            <FormField label="Object versions">
              <RadioGroup value={form.versions} onChange={({ detail }) => setForm({ ...form, versions: detail.value })} items={[{ value: "Current", label: "Include current version only" }, { value: "All", label: "Include all versions" }]} />
            </FormField>
            <FormField label="Destination" constraintText="Format: s3://bucket/prefix"><Input value={form.destination} onChange={({ detail }) => setForm({ ...form, destination: detail.value })} /></FormField>
            <FormField label="Frequency">
              <RadioGroup value={form.frequency} onChange={({ detail }) => setForm({ ...form, frequency: detail.value })} items={[{ value: "Daily", label: "Daily" }, { value: "Weekly", label: "Weekly" }]} />
            </FormField>
            <FormField label="Output format">
              <RadioGroup value={form.format} onChange={({ detail }) => setForm({ ...form, format: detail.value })} items={[{ value: "CSV", label: "CSV" }, { value: "ORC", label: "Apache ORC" }, { value: "Parquet", label: "Apache Parquet" }]} />
            </FormField>
            <FormField label="Status">
              <RadioGroup value={form.enabled ? "on" : "off"} onChange={({ detail }) => setForm({ ...form, enabled: detail.value === "on" })} items={[{ value: "on", label: "Enable" }, { value: "off", label: "Disable" }]} />
            </FormField>
          </SpaceBetween>
        )}
      </EditModal>
    </>
  )
}
