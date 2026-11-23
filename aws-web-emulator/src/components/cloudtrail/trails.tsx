"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
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
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tiles from "@cloudscape-design/components/tiles"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, Section } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { useCallerIdentity } from "@/components/shell/top-nav"
import { CtLayout } from "@/components/cloudtrail/ct-app"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

export type Trail = { Name?: string; S3BucketName?: string; S3KeyPrefix?: string; IncludeGlobalServiceEvents?: boolean; IsMultiRegionTrail?: boolean; HomeRegion?: string; TrailARN?: string; LogFileValidationEnabled?: boolean; CloudWatchLogsLogGroupArn?: string; CloudWatchLogsRoleArn?: string; KmsKeyId?: string; HasCustomEventSelectors?: boolean; HasInsightSelectors?: boolean; IsOrganizationTrail?: boolean; SnsTopicARN?: string }
type Status = { IsLogging?: boolean; LatestDeliveryTime?: string; StartLoggingTime?: string; StopLoggingTime?: string; LatestDeliveryError?: string }

const trailHref = (name?: string) => `/cloudtrail/trails/${encodeURIComponent(name ?? "")}`

export function useTrails() {
  return useQuery({
    queryKey: ["emulator", "cloudtrail", "trails"],
    queryFn: async () => {
      const trails = (await callAws<{ trailList?: Trail[] }>("cloudtrail", "DescribeTrails", { includeShadowTrails: false })).trailList ?? []
      return Promise.all(trails.map(async (t) => ({ ...t, status: await callAws<Status>("cloudtrail", "GetTrailStatus", { Name: t.TrailARN ?? t.Name }).catch(() => ({}) as Status) })))
    },
  })
}

export function TrailsPage() {
  const follow = useFollow()
  const trails = useTrails()
  const [selected, setSelected] = useState<(Trail & { status: Status })[]>([])
  const [deleting, setDeleting] = useState(false)
  return (
    <CtLayout breadcrumbs={[{ text: "Trails", href: "/cloudtrail/trails" }]} contentType="table">
      <ResourceTable<Trail & { status: Status }>
        title="Trails"
        items={trails.data ?? []}
        loading={trails.isPending}
        loadingText="Loading trails"
        error={trails.error}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="TrailARN"
        filterPlaceholder="Filter trails"
        columns={[
          { id: "name", header: "Name", value: (t) => t.Name, cell: (t) => <Link href={trailHref(t.Name)} onFollow={follow}>{t.Name}</Link> },
          { id: "region", header: "Home region", value: (t) => t.HomeRegion, cell: (t) => t.HomeRegion },
          { id: "multi", header: "Multi-region trail", value: (t) => String(t.IsMultiRegionTrail), cell: (t) => (t.IsMultiRegionTrail ? "Yes" : "No") },
          { id: "insights", header: "Insights", value: (t) => String(t.HasInsightSelectors), cell: (t) => (t.HasInsightSelectors ? "Enabled" : "Disabled") },
          { id: "org", header: "Organization trail", value: (t) => String(t.IsOrganizationTrail), cell: (t) => (t.IsOrganizationTrail ? "Yes" : "No") },
          { id: "bucket", header: "S3 bucket", value: (t) => t.S3BucketName, cell: (t) => t.S3BucketName },
          { id: "prefix", header: "Log file prefix", value: (t) => t.S3KeyPrefix, cell: (t) => t.S3KeyPrefix || "-" },
          { id: "cwl", header: "CloudWatch Logs log group", value: (t) => t.CloudWatchLogsLogGroupArn, cell: (t) => t.CloudWatchLogsLogGroupArn?.split(":log-group:")[1]?.replace(/:\*$/, "") ?? "-" },
          { id: "status", header: "Status", value: (t) => String(t.status.IsLogging), cell: (t) => (t.status.IsLogging ? <StatusIndicator type="success">Logging</StatusIndicator> : <StatusIndicator type="stopped">Off</StatusIndicator>) },
        ]}
        empty={<EmptyState title="No trails" subtitle="No trails to display." action={<Button href="/cloudtrail/trails/create" onFollow={follow}>Create trail</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={trails.isFetching} onClick={() => void trails.refetch()} />
            <Button disabled={!selected[0]} onClick={() => setDeleting(true)}>Delete</Button>
            <Button variant="primary" href="/cloudtrail/trails/create" onFollow={follow}>Create trail</Button>
          </SpaceBetween>
        }
      />
      <EditModal visible={deleting} title={`Delete ${selected[0]?.Name}?`} saveLabel="Delete" onDismiss={() => setDeleting(false)} success={`Trail ${selected[0]?.Name} deleted.`} onSave={async () => { await callAws("cloudtrail", "DeleteTrail", { Name: selected[0].TrailARN }); setSelected([]); await trails.refetch() }}>
        <Box>Deleting a trail stops log delivery to its S3 bucket. The existing log files remain in the bucket.</Box>
      </EditModal>
    </CtLayout>
  )
}

export const bucketPolicy = (bucket: string, account: string, trail: string, prefix?: string) => JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    { Sid: "AWSCloudTrailAclCheck20150319", Effect: "Allow", Principal: { Service: "cloudtrail.amazonaws.com" }, Action: "s3:GetBucketAcl", Resource: `arn:aws:s3:::${bucket}`, Condition: { StringEquals: { "AWS:SourceArn": `arn:aws:cloudtrail:ap-southeast-7:${account}:trail/${trail}` } } },
    { Sid: "AWSCloudTrailWrite20150319", Effect: "Allow", Principal: { Service: "cloudtrail.amazonaws.com" }, Action: "s3:PutObject", Resource: `arn:aws:s3:::${bucket}/${prefix ? `${prefix}/` : ""}AWSLogs/${account}/*`, Condition: { StringEquals: { "s3:x-amz-acl": "bucket-owner-full-control", "AWS:SourceArn": `arn:aws:cloudtrail:ap-southeast-7:${account}:trail/${trail}` } } },
  ],
})

export function CreateTrailPage() {
  const router = useRouter()
  const follow = useFollow()
  const { account } = useCallerIdentity()
  const buckets = useAws<{ Buckets?: { Name?: string }[] }>("s3", "ListBuckets", {})
  const groups = useAws<{ logGroups?: { logGroupName?: string; arn?: string }[] }>("cloudwatchlogs", "DescribeLogGroups", {})
  const roles = useAws<{ Roles?: { RoleName?: string; Arn?: string }[] }>("iam", "ListRoles", { MaxItems: 1000 })
  const [stamp] = useState(() => new Date().toISOString().slice(0, 10).replace(/-/g, ""))
  const [form, setForm] = useState({ name: "management-events", bucketMode: "new", bucket: "", existing: "", prefix: "", sse: false, kms: "", validation: true, cwl: false, group: "", role: "", management: true, data: false, insights: false, readWrite: "All" })
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })
  const acct = account ?? "000000000000"
  const bucket = form.bucketMode === "new" ? form.bucket || `aws-cloudtrail-logs-${acct}-${stamp}` : form.existing
  const create = async () => {
    setSaving(true)
    setError(undefined)
    try {
      if (form.bucketMode === "new") {
        await callAws("s3", "CreateBucket", { Bucket: bucket })
        await callAws("s3", "PutBucketPolicy", { Bucket: bucket, Policy: bucketPolicy(bucket, acct, form.name, form.prefix) })
      }
      const valid = tags.filter((t) => t.Key)
      await callAws("cloudtrail", "CreateTrail", {
        Name: form.name,
        S3BucketName: bucket,
        ...(form.prefix ? { S3KeyPrefix: form.prefix } : {}),
        IsMultiRegionTrail: true,
        IncludeGlobalServiceEvents: true,
        EnableLogFileValidation: form.validation,
        ...(form.sse && form.kms ? { KmsKeyId: form.kms } : {}),
        ...(form.cwl && form.group ? { CloudWatchLogsLogGroupArn: form.group, CloudWatchLogsRoleArn: form.role } : {}),
        ...(valid.length ? { TagsList: valid.map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) } : {}),
      })
      await callAws("cloudtrail", "PutEventSelectors", { TrailName: form.name, EventSelectors: [{ ReadWriteType: form.readWrite, IncludeManagementEvents: form.management, ...(form.data ? { DataResources: [{ Type: "AWS::S3::Object", Values: ["arn:aws:s3"] }] } : {}) }] })
      if (form.insights) await callAws("cloudtrail", "PutInsightSelectors", { TrailName: form.name, InsightSelectors: [{ InsightType: "ApiCallRateInsight" }, { InsightType: "ApiErrorRateInsight" }] })
      await callAws("cloudtrail", "StartLogging", { Name: form.name })
      flash.success(`Trail ${form.name} successfully created.`)
      router.push(trailHref(form.name))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  return (
    <CtLayout breadcrumbs={[{ text: "Trails", href: "/cloudtrail/trails" }, { text: "Create trail", href: "#" }]} contentType="form">
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>}>Create trail</Header>}>
        <Form
          errorText={error}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" href="/cloudtrail/trails" onFollow={follow}>Cancel</Button>
              <Button variant="primary" loading={saving} disabled={!form.name || !bucket} onClick={() => void create()}>Create trail</Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">General details</Header>} footer={<Box fontSize="body-s" color="text-body-secondary">A trail created in the console is a multi-region trail.</Box>}>
              <SpaceBetween size="l">
                <FormField label="Trail name" constraintText="3-128 characters. Only letters, numbers, periods, underscores, and dashes are allowed."><Input value={form.name} onChange={({ detail }) => set({ name: detail.value })} /></FormField>
                <FormField label="Storage location">
                  <Tiles value={form.bucketMode} onChange={({ detail }) => set({ bucketMode: detail.value })} items={[{ value: "new", label: "Create new S3 bucket", description: "Create a bucket to store logs for the trail." }, { value: "existing", label: "Use existing S3 bucket", description: "Choose an existing bucket to store logs for this trail." }]} />
                </FormField>
                {form.bucketMode === "new" ? (
                  <FormField label="Trail log bucket and folder" description="Enter a new S3 bucket name and folder (prefix) to store your logs. Bucket names must be globally unique."><Input value={bucket} onChange={({ detail }) => set({ bucket: detail.value })} /></FormField>
                ) : (
                  <FormField label="Trail log bucket name" description="The bucket policy must grant CloudTrail permission to write to it."><Select selectedOption={form.existing ? { value: form.existing, label: form.existing } : null} placeholder="Choose a bucket" empty="No buckets" onChange={({ detail }) => set({ existing: detail.selectedOption.value ?? "" })} options={(buckets.data?.Buckets ?? []).map((b) => ({ value: b.Name ?? "", label: b.Name }))} /></FormField>
                )}
                <FormField label="Prefix - optional"><Input value={form.prefix} onChange={({ detail }) => set({ prefix: detail.value })} /></FormField>
                <Checkbox checked={form.sse} onChange={({ detail }) => set({ sse: detail.checked })}>Log file SSE-KMS encryption</Checkbox>
                {form.sse && <FormField label="AWS KMS key ARN"><Input value={form.kms} onChange={({ detail }) => set({ kms: detail.value })} /></FormField>}
                <Checkbox checked={form.validation} onChange={({ detail }) => set({ validation: detail.checked })}>Log file validation</Checkbox>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2" description="Configure CloudWatch Logs to monitor your trail logs and notify you when specific activity occurs.">CloudWatch Logs - <i>optional</i></Header>}>
              <SpaceBetween size="l">
                <Checkbox checked={form.cwl} onChange={({ detail }) => set({ cwl: detail.checked })}>Enabled</Checkbox>
                {form.cwl && (
                  <>
                    <FormField label="Log group"><Select selectedOption={form.group ? { value: form.group, label: form.group.split(":log-group:")[1]?.replace(/:\*$/, "") } : null} placeholder="Choose a log group" onChange={({ detail }) => set({ group: detail.selectedOption.value ?? "" })} options={(groups.data?.logGroups ?? []).map((g) => ({ value: g.arn ?? "", label: g.logGroupName }))} /></FormField>
                    <FormField label="IAM role"><Select selectedOption={form.role ? { value: form.role, label: form.role.split("/").pop() } : null} placeholder="Choose a role" onChange={({ detail }) => set({ role: detail.selectedOption.value ?? "" })} options={(roles.data?.Roles ?? []).map((r) => ({ value: r.Arn ?? "", label: r.RoleName }))} /></FormField>
                  </>
                )}
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2" description="Record API activity for individual resources, or for all current and future resources in your AWS account.">Events</Header>}>
              <SpaceBetween size="l">
                <FormField label="Event type">
                  <SpaceBetween size="xs">
                    <Checkbox checked={form.management} onChange={({ detail }) => set({ management: detail.checked })} description="Capture management operations performed on your AWS resources.">Management events</Checkbox>
                    <Checkbox checked={form.data} onChange={({ detail }) => set({ data: detail.checked })} description="Log the resource operations performed on or within a resource.">Data events</Checkbox>
                    <Checkbox checked={form.insights} onChange={({ detail }) => set({ insights: detail.checked })} description="Identify unusual activity, errors, or user behavior in your account.">Insights events</Checkbox>
                  </SpaceBetween>
                </FormField>
                {form.management && <FormField label="API activity"><RadioGroup value={form.readWrite} onChange={({ detail }) => set({ readWrite: detail.value })} items={[{ value: "All", label: "Read and Write" }, { value: "ReadOnly", label: "Read" }, { value: "WriteOnly", label: "Write" }]} /></FormField>}
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">Tags - <i>optional</i></Header>}><TagEditor tags={tags} onChange={setTags} /></Container>
          </SpaceBetween>
        </Form>
      </ContentLayout>
    </CtLayout>
  )
}

type Selector = { ReadWriteType?: string; IncludeManagementEvents?: boolean; DataResources?: { Type?: string; Values?: string[] }[] }

export function TrailDetailPage({ name }: { name: string }) {
  const router = useRouter()
  const trail = useAws<{ trailList?: Trail[] }>("cloudtrail", "DescribeTrails", { trailNameList: [name] })
  const t = trail.data?.trailList?.[0]
  const status = useAws<Status>("cloudtrail", "GetTrailStatus", { Name: name })
  const selectors = useAws<{ EventSelectors?: Selector[]; AdvancedEventSelectors?: { Name?: string }[] }>("cloudtrail", "GetEventSelectors", { TrailName: name })
  const insights = useAws<{ InsightSelectors?: { InsightType?: string }[] }>("cloudtrail", "GetInsightSelectors", { TrailName: name }, { retry: false })
  const tags = useAws<{ ResourceTagList?: { TagsList?: Tag[] }[] }>("cloudtrail", "ListTags", { ResourceIdList: [t?.TrailARN] }, { enabled: Boolean(t?.TrailARN) })
  const [modal, setModal] = useState<string>()
  const [mgmt, setMgmt] = useState({ include: true, rw: "All" })
  const [ins, setIns] = useState({ rate: false, error: false })
  const [editTags, setEditTags] = useState<Tag[]>([])
  const [general, setGeneral] = useState({ prefix: "", validation: true })
  const sel = selectors.data?.EventSelectors?.[0]
  const tagList = tags.data?.ResourceTagList?.[0]?.TagsList ?? []
  const toggleLogging = async () => {
    await callAws("cloudtrail", status.data?.IsLogging ? "StopLogging" : "StartLogging", { Name: name }).then(() => { flash.success(status.data?.IsLogging ? "Logging stopped." : "Logging started."); void status.refetch() }, (e) => flash.error(errorMessage(e)))
  }
  return (
    <CtLayout breadcrumbs={[{ text: "Trails", href: "/cloudtrail/trails" }, { text: name, href: trailHref(name) }]}>
      <ContentLayout header={<Header variant="h1" actions={<SpaceBetween direction="horizontal" size="xs"><Button onClick={() => setModal("delete")}>Delete</Button><Button onClick={() => void toggleLogging()}>{status.data?.IsLogging ? "Stop logging" : "Start logging"}</Button></SpaceBetween>}>{name}</Header>}>
        <SpaceBetween size="l">
          {trail.error && <Alert type="error">{errorMessage(trail.error)}</Alert>}
          <Section
            title="General details"
            onEdit={() => { setGeneral({ prefix: t?.S3KeyPrefix ?? "", validation: Boolean(t?.LogFileValidationEnabled) }); setModal("general") }}
            columns={3}
            items={[
              { label: "Trail logging", value: status.data?.IsLogging ? <StatusIndicator type="success">Logging</StatusIndicator> : <StatusIndicator type="stopped">Off</StatusIndicator> },
              { label: "Trail name", value: name },
              { label: "Multi-region trail", value: t?.IsMultiRegionTrail ? "Yes" : "No" },
              { label: "Apply trail to my organization", value: t?.IsOrganizationTrail ? "Enabled" : "Not enabled" },
              { label: "Trail log location", value: `${t?.S3BucketName ?? ""}/${t?.S3KeyPrefix ? `${t.S3KeyPrefix}/` : ""}AWSLogs/` },
              { label: "Log file SSE-KMS encryption", value: t?.KmsKeyId ? "Enabled" : "Not enabled" },
              { label: "Log file validation", value: t?.LogFileValidationEnabled ? "Enabled" : "Disabled" },
              { label: "Last log file delivered", value: consoleDate(status.data?.LatestDeliveryTime) },
              { label: "Trail ARN", value: <Copyable value={t?.TrailARN} /> },
            ]}
          />
          <Section title="CloudWatch Logs" columns={2} items={[{ label: "Log group", value: t?.CloudWatchLogsLogGroupArn ?? "-" }, { label: "IAM Role", value: t?.CloudWatchLogsRoleArn ?? "-" }]} />
          <Section title="Management events" onEdit={() => { setMgmt({ include: sel?.IncludeManagementEvents ?? true, rw: sel?.ReadWriteType ?? "All" }); setModal("management") }} columns={2} items={[{ label: "API activity", value: sel?.IncludeManagementEvents === false ? "None" : sel?.ReadWriteType === "ReadOnly" ? "Read" : sel?.ReadWriteType === "WriteOnly" ? "Write" : "All" }, { label: "Exclude AWS KMS events", value: "No" }]} />
          <Table header={<Header variant="h2" counter={`(${sel?.DataResources?.length ?? 0})`}>Data events</Header>} items={sel?.DataResources ?? []} columnDefinitions={[{ id: "type", header: "Resource type", cell: (d) => d.Type }, { id: "values", header: "Selector", cell: (d) => d.Values?.join(", ") }]} empty={<Box textAlign="center" color="inherit">No data events configured</Box>} />
          <Section title="Insights events" onEdit={() => { const list = insights.data?.InsightSelectors ?? []; setIns({ rate: list.some((x) => x.InsightType === "ApiCallRateInsight"), error: list.some((x) => x.InsightType === "ApiErrorRateInsight") }); setModal("insights") }} items={[{ label: "Insights types", value: insights.data?.InsightSelectors?.map((x) => (x.InsightType === "ApiCallRateInsight" ? "API call rate" : "API error rate")).join(", ") || "Not enabled" }]} />
          <Table header={<Header variant="h2" counter={`(${tagList.length})`} actions={<Button onClick={() => { setEditTags(tagList); setModal("tags") }}>Edit</Button>}>Tags</Header>} items={tagList} columnDefinitions={[{ id: "k", header: "Key", cell: (x) => x.Key }, { id: "v", header: "Value", cell: (x) => x.Value || "–" }]} empty={<Box textAlign="center" color="inherit">No tags</Box>} />
        </SpaceBetween>
      </ContentLayout>
      <EditModal visible={modal === "general"} title="Edit general details" onDismiss={() => setModal(undefined)} success="Trail updated." onSave={async () => { await callAws("cloudtrail", "UpdateTrail", { Name: name, S3KeyPrefix: general.prefix, EnableLogFileValidation: general.validation }); await trail.refetch() }}>
        <FormField label="Prefix - optional"><Input value={general.prefix} onChange={({ detail }) => setGeneral({ ...general, prefix: detail.value })} /></FormField>
        <Checkbox checked={general.validation} onChange={({ detail }) => setGeneral({ ...general, validation: detail.checked })}>Log file validation</Checkbox>
      </EditModal>
      <EditModal visible={modal === "management"} title="Edit management events" onDismiss={() => setModal(undefined)} success="Management events updated." onSave={async () => { await callAws("cloudtrail", "PutEventSelectors", { TrailName: name, EventSelectors: [{ ...sel, IncludeManagementEvents: mgmt.include, ReadWriteType: mgmt.rw }] }); await selectors.refetch() }}>
        <Checkbox checked={mgmt.include} onChange={({ detail }) => setMgmt({ ...mgmt, include: detail.checked })}>Management events</Checkbox>
        <FormField label="API activity"><RadioGroup value={mgmt.rw} onChange={({ detail }) => setMgmt({ ...mgmt, rw: detail.value })} items={[{ value: "All", label: "Read and Write" }, { value: "ReadOnly", label: "Read" }, { value: "WriteOnly", label: "Write" }]} /></FormField>
      </EditModal>
      <EditModal visible={modal === "insights"} title="Edit Insights events" onDismiss={() => setModal(undefined)} success="Insights events updated." onSave={async () => { await callAws("cloudtrail", "PutInsightSelectors", { TrailName: name, InsightSelectors: [...(ins.rate ? [{ InsightType: "ApiCallRateInsight" }] : []), ...(ins.error ? [{ InsightType: "ApiErrorRateInsight" }] : [])] }); await insights.refetch(); await trail.refetch() }}>
        <Checkbox checked={ins.rate} onChange={({ detail }) => setIns({ ...ins, rate: detail.checked })}>API call rate</Checkbox>
        <Checkbox checked={ins.error} onChange={({ detail }) => setIns({ ...ins, error: detail.checked })}>API error rate</Checkbox>
      </EditModal>
      <EditModal visible={modal === "tags"} size="large" title="Edit tags" onDismiss={() => setModal(undefined)} success="Tags updated." onSave={async () => { const after = editTags.filter((x) => x.Key); const removed = tagList.filter((x) => !after.some((a) => a.Key === x.Key)); if (removed.length) await callAws("cloudtrail", "RemoveTags", { ResourceId: t?.TrailARN, TagsList: removed }); if (after.length) await callAws("cloudtrail", "AddTags", { ResourceId: t?.TrailARN, TagsList: after.map((x) => ({ Key: x.Key, Value: x.Value ?? "" })) }); await tags.refetch() }}>
        <TagEditor tags={editTags} onChange={setEditTags} />
      </EditModal>
      <EditModal visible={modal === "delete"} title={`Delete ${name}?`} saveLabel="Delete" onDismiss={() => setModal(undefined)} success={`Trail ${name} deleted.`} onSave={async () => { await callAws("cloudtrail", "DeleteTrail", { Name: t?.TrailARN ?? name }); router.push("/cloudtrail/trails") }}>
        <Box>Deleting a trail stops log delivery. Existing log files remain in the S3 bucket.</Box>
      </EditModal>
    </CtLayout>
  )
}

