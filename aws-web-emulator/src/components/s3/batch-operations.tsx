"use client"

import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Tiles from "@cloudscape-design/components/tiles"
import Wizard from "@cloudscape-design/components/wizard"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { S3Layout } from "@/components/s3/s3-app"
import { s3Request, useInvalidate, useS3, useS3Environment } from "@/components/s3/s3-hooks"
import { consoleDate } from "@/lib/format"
import { regionName } from "@/lib/service-meta"

type Job = {
  JobId?: string
  Status?: string
  Description?: string
  Operation?: string
  CreationTime?: string
  Priority?: number
  ProgressSummary?: { TotalNumberOfTasks?: number; NumberOfTasksSucceeded?: number; NumberOfTasksFailed?: number }
}

const statusFilters = ["Active", "Cancelled", "Cancelling", "Complete", "Completing", "Failed", "Failing", "New", "Paused", "Pausing", "Preparing", "Ready", "Suspended"]

export function BatchOperationsPage() {
  const follow = useFollow()
  const environment = useS3Environment()
  const account = environment.data?.account
  const region = environment.data?.region ?? "ap-southeast-7"
  const [status, setStatus] = useState<string>("all")
  const jobs = useS3<{ Jobs?: Job[] }>("s3control", "ListJobs", { AccountId: account, ...(status !== "all" ? { JobStatuses: [status] } : {}) }, { enabled: Boolean(account) })
  const [selected, setSelected] = useState<Job[]>([])
  const current = selected[0]
  async function update(action: string, input: Record<string, unknown>, message: string) {
    await s3Request("s3control", action, { AccountId: account, JobId: current?.JobId, ...input }).then(
      () => { flash.success(message); void jobs.refetch() },
      (error) => flash.error(errorMessage(error)),
    )
  }
  return (
    <S3Layout breadcrumbs={[{ text: "Batch Operations", href: "/s3/jobs" }]} contentType="table">
      <ContentLayout
        header={
          <Header variant="h1" info={<Link variant="info">Info</Link>} description={<>A job is used to execute batch operations on a list of S3 objects. Job events are published to <Link href="/cloudwatch" onFollow={follow}>CloudWatch Events</Link>.</>}>
            Batch Operations
          </Header>
        }
      >
        <ResourceTable<Job>
          title="Jobs"
          variant="container"
          items={jobs.data?.Jobs ?? []}
          loading={jobs.isPending && jobs.fetchStatus !== "idle"}
          error={jobs.error}
          selectionType="single"
          selectedItems={selected}
          onSelectionChange={setSelected}
          trackBy="JobId"
          filterPlaceholder="Find jobs"
          columns={[
            { id: "id", header: "Job ID", value: (job) => job.JobId, cell: (job) => job.JobId },
            { id: "status", header: "Status", value: (job) => job.Status, cell: (job) => <StatusIndicator type={job.Status === "Complete" ? "success" : job.Status === "Failed" ? "error" : job.Status === "Cancelled" ? "stopped" : "in-progress"}>{job.Status}</StatusIndicator> },
            { id: "description", header: "Description", value: (job) => job.Description, cell: (job) => job.Description || "-" },
            { id: "operation", header: "Operation", value: (job) => job.Operation, cell: (job) => job.Operation },
            { id: "created", header: "Date created", value: (job) => job.CreationTime, cell: (job) => consoleDate(job.CreationTime) },
            { id: "total", header: "Total objects", value: (job) => job.ProgressSummary?.TotalNumberOfTasks, cell: (job) => job.ProgressSummary?.TotalNumberOfTasks ?? "-" },
            {
              id: "complete",
              header: "% Complete",
              cell: (job) => {
                const total = job.ProgressSummary?.TotalNumberOfTasks ?? 0
                const done = (job.ProgressSummary?.NumberOfTasksSucceeded ?? 0) + (job.ProgressSummary?.NumberOfTasksFailed ?? 0)
                return total ? `${Math.round((done / total) * 100)}%` : "-"
              },
            },
            { id: "failed", header: "Total failed (rate)", cell: (job) => job.ProgressSummary?.NumberOfTasksFailed ?? "-" },
            { id: "priority", header: "Priority", value: (job) => job.Priority, cell: (job) => job.Priority ?? "-" },
          ]}
          empty={<EmptyState title={`You don't have any jobs in the ${region} Region`} subtitle="No resources to display" action={<Button href="/s3/jobs/create" onFollow={follow}>Create job</Button>} />}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Select
                selectedOption={{ value: status, label: status === "all" ? "All status types" : status }}
                onChange={({ detail }) => setStatus(detail.selectedOption.value ?? "all")}
                options={[{ value: "all", label: "All status types" }, ...statusFilters.map((value) => ({ value, label: value }))]}
              />
              <Button disabled={current?.Status !== "Suspended"} onClick={() => void update("UpdateJobStatus", { RequestedJobStatus: "Ready" }, "Job is ready to run.")}>Run job</Button>
              <ButtonDropdown
                disabled={!current}
                items={[
                  { id: "cancel", text: "Cancel job" },
                  { id: "priority", text: "Update priority" },
                ]}
                onItemClick={({ detail }) => {
                  if (detail.id === "cancel") void update("UpdateJobStatus", { RequestedJobStatus: "Cancelled" }, "Job cancelled.")
                  else void update("UpdateJobPriority", { Priority: (current?.Priority ?? 10) + 1 }, "Job priority updated.")
                }}
              >
                Actions
              </ButtonDropdown>
              <Button disabled={!current} href="/s3/jobs/create" onFollow={follow}>Clone job</Button>
              <Button variant="primary" href="/s3/jobs/create" onFollow={follow}>Create job</Button>
            </SpaceBetween>
          }
        />
      </ContentLayout>
    </S3Layout>
  )
}

const operations = [
  { value: "S3PutObjectCopy", label: "Copy", description: "Copy each object to the destination bucket." },
  { value: "LambdaInvoke", label: "Invoke AWS Lambda function", description: "Invoke a Lambda function for each object." },
  { value: "S3PutObjectTagging", label: "Replace all object tags", description: "Replace the tag set of each object." },
  { value: "S3DeleteObjectTagging", label: "Delete all object tags", description: "Remove all tags from each object." },
  { value: "S3PutObjectAcl", label: "Replace access control list (ACL)", description: "Replace the ACL of each object." },
  { value: "S3InitiateRestoreObject", label: "Restore", description: "Restore archived objects." },
  { value: "S3PutObjectRetention", label: "Object Lock retention", description: "Apply Object Lock retention to each object." },
  { value: "S3PutObjectLegalHold", label: "Object Lock legal hold", description: "Apply a legal hold to each object." },
  { value: "S3ReplicateObject", label: "Replicate", description: "Replicate each object using the bucket replication configuration." },
  { value: "S3ComputeObjectChecksum", label: "Compute checksum", description: "Compute a checksum for each object." },
]

export function CreateBatchJobPage() {
  const router = useRouter()
  const invalidate = useInvalidate()
  const environment = useS3Environment()
  const account = environment.data?.account
  const region = environment.data?.region ?? "ap-southeast-7"
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    scope: "manifest",
    manifest: "",
    etag: "",
    operation: "S3PutObjectCopy",
    destination: "",
    lambda: "",
    description: "",
    priority: "10",
    report: "enabled",
    reportPath: "",
    role: "",
    confirm: "yes",
  })
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const op = operations.find((item) => item.value === form.operation)

  function operationInput() {
    switch (form.operation) {
      case "S3PutObjectCopy":
        return { S3PutObjectCopy: { TargetResource: form.destination.startsWith("arn:") ? form.destination : `arn:aws:s3:::${form.destination.replace(/^s3:\/\//, "").split("/")[0]}` } }
      case "LambdaInvoke":
        return { LambdaInvoke: { FunctionArn: form.lambda } }
      case "S3PutObjectTagging":
        return { S3PutObjectTagging: { TagSet: tags.filter((tag) => tag.Key) } }
      case "S3DeleteObjectTagging":
        return { S3DeleteObjectTagging: {} }
      case "S3PutObjectAcl":
        return { S3PutObjectAcl: { AccessControlPolicy: { CannedAccessControlList: "private" } } }
      case "S3InitiateRestoreObject":
        return { S3InitiateRestoreObject: { ExpirationInDays: 1, GlacierJobTier: "STANDARD" } }
      case "S3PutObjectRetention":
        return { S3PutObjectRetention: { Retention: { Mode: "GOVERNANCE", RetainUntilDate: new Date(Date.now() + 86400000).toISOString() } } }
      case "S3PutObjectLegalHold":
        return { S3PutObjectLegalHold: { LegalHold: { Status: "ON" } } }
      case "S3ReplicateObject":
        return { S3ReplicateObject: {} }
      default:
        return { S3ComputeObjectChecksum: { ChecksumAlgorithm: "CRC64NVME", ChecksumType: "FULL_OBJECT" } }
    }
  }

  async function submit() {
    setSaving(true)
    setError(undefined)
    try {
      const manifest = /^s3:\/\/([^/]+)\/(.+)$/.exec(form.manifest)
      if (!manifest) throw new Error("Enter the manifest object as s3://bucket/key.")
      const report = /^s3:\/\/([^/]+)\/?(.*)$/.exec(form.reportPath)
      await s3Request("s3control", "CreateJob", {
        AccountId: account,
        ConfirmationRequired: form.confirm === "yes",
        Priority: Number(form.priority),
        RoleArn: form.role,
        ...(form.description ? { Description: form.description } : {}),
        Operation: operationInput(),
        Manifest: {
          Spec: { Format: "S3BatchOperations_CSV_20180820", Fields: ["Bucket", "Key"] },
          Location: { ObjectArn: `arn:aws:s3:::${manifest[1]}/${manifest[2]}`, ETag: form.etag || "etag" },
        },
        Report:
          form.report === "enabled" && report
            ? { Enabled: true, Bucket: `arn:aws:s3:::${report[1]}`, Prefix: report[2] || undefined, Format: "Report_CSV_20180820", ReportScope: "AllTasks" }
            : { Enabled: false },
      })
      await invalidate()
      flash.success("Successfully created job.")
      router.push("/s3/jobs")
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <S3Layout breadcrumbs={[{ text: "Batch Operations", href: "/s3/jobs" }, { text: "Create job", href: "/s3/jobs/create" }]} contentType="wizard">
      <Wizard
        activeStepIndex={step}
        onNavigate={({ detail }) => setStep(detail.requestedStepIndex)}
        onCancel={() => router.push("/s3/jobs")}
        onSubmit={() => void submit()}
        isLoadingNextStep={saving}
        submitButtonText="Create job"
        i18nStrings={{
          stepNumberLabel: (number) => `Step ${number}`,
          collapsedStepsLabel: (number, total) => `Step ${number} of ${total}`,
          cancelButton: "Cancel",
          previousButton: "Previous",
          nextButton: "Next",
          optional: "optional",
        }}
        steps={[
          {
            title: "Choose Region and scope",
            content: (
              <SpaceBetween size="l">
                <Container header={<Header variant="h2" description="The AWS Region where the job will be created.">AWS Region</Header>}>
                  <KeyValuePairs items={[{ label: "AWS Region", value: `${regionName(region)} ${region}` }]} />
                </Container>
                <Container header={<Header variant="h2" description="Specify the list of objects that your Batch operations job will act upon.">Scope</Header>}>
                  <SpaceBetween size="m">
                    <Tiles
                      value={form.scope}
                      onChange={({ detail }) => setForm({ ...form, scope: detail.value })}
                      items={[
                        { value: "generate", label: "Generate an object list by specifying filters", description: "Generate an object list based on the source location and filter criteria that you specify.", disabled: true },
                        { value: "replication", label: "Generate an object list based on a replication configuration", description: "Generate an object list based on an existing replication configuration.", disabled: true },
                        { value: "manifest", label: "Use an existing manifest file", description: "Import an object list from an existing manifest file. A manifest file is an S3 Inventory report or a CSV file." },
                      ]}
                    />
                    <FormField label="Manifest object" constraintText="Format: s3://bucket/key.csv" stretch>
                      <Input value={form.manifest} placeholder="s3://bucket/manifest.csv" onChange={({ detail }) => setForm({ ...form, manifest: detail.value })} />
                    </FormField>
                    <FormField label={<>Manifest object ETag - <i>optional</i></>}>
                      <Input value={form.etag} onChange={({ detail }) => setForm({ ...form, etag: detail.value })} />
                    </FormField>
                  </SpaceBetween>
                </Container>
              </SpaceBetween>
            ),
          },
          {
            title: "Choose operation",
            content: (
              <Container header={<Header variant="h2">Operation</Header>}>
                <SpaceBetween size="m">
                  <FormField label="Operation type">
                    <RadioGroup value={form.operation} onChange={({ detail }) => setForm({ ...form, operation: detail.value })} items={operations} />
                  </FormField>
                  {form.operation === "S3PutObjectCopy" && (
                    <FormField label="Destination" constraintText="Format: s3://bucket"><Input value={form.destination} onChange={({ detail }) => setForm({ ...form, destination: detail.value })} /></FormField>
                  )}
                  {form.operation === "LambdaInvoke" && (
                    <FormField label="Lambda function ARN"><Input value={form.lambda} onChange={({ detail }) => setForm({ ...form, lambda: detail.value })} /></FormField>
                  )}
                  {form.operation === "S3PutObjectTagging" && <TagEditor tags={tags} onChange={setTags} limit={10} />}
                </SpaceBetween>
              </Container>
            ),
          },
          {
            title: "Configure additional options",
            content: (
              <SpaceBetween size="l">
                <Container header={<Header variant="h2">Additional options</Header>}>
                  <SpaceBetween size="m">
                    <FormField label={<>Description - <i>optional</i></>}><Input value={form.description} onChange={({ detail }) => setForm({ ...form, description: detail.value })} /></FormField>
                    <FormField label="Priority"><Input type="number" value={form.priority} onChange={({ detail }) => setForm({ ...form, priority: detail.value })} /></FormField>
                    <FormField label="Run job automatically">
                      <RadioGroup value={form.confirm} onChange={({ detail }) => setForm({ ...form, confirm: detail.value })} items={[{ value: "yes", label: "Wait to run the job when it's ready" }, { value: "no", label: "Run automatically when it's ready" }]} />
                    </FormField>
                  </SpaceBetween>
                </Container>
                <Container header={<Header variant="h2">Completion report</Header>}>
                  <SpaceBetween size="m">
                    <RadioGroup value={form.report} onChange={({ detail }) => setForm({ ...form, report: detail.value })} items={[{ value: "enabled", label: "Generate completion report" }, { value: "disabled", label: "Don't generate a completion report" }]} />
                    {form.report === "enabled" && (
                      <FormField label="Completion report destination" constraintText="Format: s3://bucket/prefix"><Input value={form.reportPath} onChange={({ detail }) => setForm({ ...form, reportPath: detail.value })} /></FormField>
                    )}
                  </SpaceBetween>
                </Container>
                <Container header={<Header variant="h2" description="Batch Operations assumes this role to perform the operation.">Permissions</Header>}>
                  <FormField label="IAM role ARN"><Input value={form.role} placeholder="arn:aws:iam::account-id:role/role-name" onChange={({ detail }) => setForm({ ...form, role: detail.value })} /></FormField>
                </Container>
              </SpaceBetween>
            ),
          },
          {
            title: "Review and create",
            errorText: error,
            content: (
              <Container header={<Header variant="h2">Review</Header>}>
                <KeyValuePairs
                  columns={2}
                  items={[
                    { label: "AWS Region", value: region },
                    { label: "Manifest", value: form.manifest || "-" },
                    { label: "Operation", value: op?.label },
                    { label: "Priority", value: form.priority },
                    { label: "Completion report", value: form.report === "enabled" ? form.reportPath || "-" : "Disabled" },
                    { label: "IAM role", value: form.role || "-" },
                  ]}
                />
              </Container>
            ),
          },
        ]}
      />
    </S3Layout>
  )
}
