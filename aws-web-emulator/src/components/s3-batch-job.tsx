"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import { s3SelectClass } from "@/components/s3-operation-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { s3Environment, s3Read } from "@/lib/s3-client"

const steps = [
  "Choose Region and scope",
  "Choose operation",
  "Configure additional options",
  "Review and create",
]
const operations = {
  S3PutObjectCopy: "Copy objects",
  S3PutObjectTagging: "Replace object tags",
  S3DeleteObjectTagging: "Delete object tags",
  S3PutObjectAcl: "Replace access control lists",
  S3InitiateRestoreObject: "Restore archived objects",
  LambdaInvoke: "Invoke Lambda function",
  S3PutObjectLegalHold: "Apply Object Lock legal hold",
  S3PutObjectRetention: "Apply Object Lock retention",
  S3ReplicateObject: "Replicate objects",
  S3ComputeObjectChecksum: "Compute checksums",
  S3UpdateObjectEncryption: "Update object encryption",
} as const

type Scope = "generate" | "replication" | "manifest"
type Fields = {
  scope: Scope
  source: string
  prefix: string
  etag: string
  format: "csv" | "inventory"
  versionColumn: boolean
  operation: keyof typeof operations
  operationSettings: string
  priority: string
  role: string
  description: string
  confirmation: boolean
  report: boolean
  reportBucket: string
  reportScope: "AllTasks" | "FailedTasksOnly"
}
type JobSection = Record<string, unknown>
const arn = z.string().trim().startsWith("arn:")
const priority = z.coerce.number().int().min(0).max(2_147_483_647)

function scopeSettings(fields: Fields): JobSection {
  const source = arn.parse(fields.source)
  if (fields.scope === "manifest") {
    return {
      Manifest: {
        Spec:
          fields.format === "inventory"
            ? { Format: "S3InventoryReport_CSV_20161130" }
            : {
                Format: "S3BatchOperations_CSV_20180820",
                Fields: [
                  "Bucket",
                  "Key",
                  ...(fields.versionColumn ? ["VersionId"] : []),
                ],
              },
        Location: {
          ObjectArn: source,
          ETag: z.string().trim().min(1).parse(fields.etag),
        },
      },
    }
  }
  const KeyNameConstraint = fields.prefix.trim()
    ? { MatchAnyPrefix: [fields.prefix.trim()] }
    : undefined
  return {
    ManifestGenerator: {
      S3JobManifestGenerator: {
        SourceBucket: source,
        EnableManifestOutput: false,
        Filter: {
          ...(KeyNameConstraint && { KeyNameConstraint }),
          ...(fields.scope === "replication" && { EligibleForReplication: true }),
        },
      },
    },
  }
}

function operationSettings(fields: Fields): JobSection {
  return {
    Operation: {
      [fields.operation]: z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(fields.operationSettings || "{}")),
    },
  }
}

function additionalSettings(fields: Fields): JobSection {
  return {
    Priority: priority.parse(fields.priority),
    RoleArn: arn.parse(fields.role),
    Description: z.string().max(256).parse(fields.description) || undefined,
    ConfirmationRequired: fields.confirmation,
    Report: fields.report
      ? {
          Enabled: true,
          Bucket: arn.parse(fields.reportBucket),
          Format: "Report_CSV_20180820",
          ReportScope: fields.reportScope,
        }
      : { Enabled: false },
  }
}

const sections = [scopeSettings, operationSettings, additionalSettings]
const hints = [
  "Enter the source ARN and manifest fields for the selected scope.",
  "Enter a JSON object for the operation settings.",
  "Enter a valid priority, IAM role ARN, and report destination if enabled.",
]

export function S3BatchJob({ close }: { close: () => void }) {
  const [step, setStep] = useState(0)
  const [error, setError] = useState("")
  const [review, setReview] = useState<JobSection>()
  const [clientToken] = useState(() => crypto.randomUUID())
  const form = useForm<Fields>({
    defaultValues: {
      scope: "generate",
      source: "",
      prefix: "",
      etag: "",
      format: "csv",
      versionColumn: false,
      operation: "S3DeleteObjectTagging",
      operationSettings: "{}",
      priority: "10",
      role: "",
      description: "",
      confirmation: true,
      report: false,
      reportBucket: "",
      reportScope: "AllTasks",
    },
  })
  const [scope, format, report] = useWatch({
    control: form.control,
    name: ["scope", "format", "report"],
  })
  const cache = useQueryClient()
  const env = useQuery({
    queryKey: ["emulator", "s3", "environment"],
    queryFn: ({ signal }) => s3Environment(signal),
  })
  const save = useMutation({
    mutationFn: (input: JobSection) =>
      s3Read<{ JobId: string }>("s3control", "CreateJob", {
        ClientRequestToken: clientToken,
        ...input,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["emulator", "s3"] })
    },
  })

  function advance(fields: Fields) {
    setError("")
    if (step === 3) {
      if (review) save.mutate(review)
      return
    }
    try {
      sections[step](fields)
      if (step === 2)
        setReview(Object.assign({}, ...sections.map((section) => section(fields))))
      setStep(step + 1)
    } catch {
      setError(hints[step])
    }
  }

  return (
    <Card className="rounded-xl border ring-0">
      <CardHeader>
        <p className="text-sm text-muted-foreground">
          Create job · Step {step + 1} of 4
        </p>
        <h2 className="text-xl font-semibold">{steps[step]}</h2>
      </CardHeader>
      <CardContent>
        {save.data ? (
          <div className="space-y-4">
            <p role="status" className="text-success">
              Job {save.data.JobId} created.
            </p>
            <Button onClick={close}>Back to jobs</Button>
          </div>
        ) : (
          <form className="grid gap-4" noValidate onSubmit={form.handleSubmit(advance)}>
            {step === 0 && (
              <>
                <p className="text-sm">
                  AWS Region <strong>{env.data?.region ?? "—"}</strong>
                </p>
                {env.error && (
                  <p role="alert" className="text-destructive">
                    {env.error.message}
                  </p>
                )}
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-medium">Object list</legend>
                  <Label>
                    <input type="radio" value="generate" {...form.register("scope")} />{" "}
                    Generate an object list by specifying filters
                  </Label>
                  <Label>
                    <input
                      type="radio"
                      value="replication"
                      {...form.register("scope")}
                    />{" "}
                    Generate an object list based on a replication configuration
                  </Label>
                  <Label>
                    <input type="radio" value="manifest" {...form.register("scope")} />{" "}
                    Use an existing manifest file
                  </Label>
                </fieldset>
                <Label htmlFor="batch-source">
                  {scope === "manifest" ? "Manifest object ARN" : "Source bucket ARN"}
                </Label>
                <Input id="batch-source" {...form.register("source")} />
                {scope !== "manifest" ? (
                  <>
                    <Label htmlFor="batch-prefix">Object key prefix (optional)</Label>
                    <Input id="batch-prefix" {...form.register("prefix")} />
                  </>
                ) : (
                  <>
                    <Label htmlFor="batch-format">Manifest format</Label>
                    <select
                      id="batch-format"
                      className={s3SelectClass}
                      {...form.register("format")}
                    >
                      <option value="csv">CSV</option>
                      <option value="inventory">Amazon S3 Inventory report</option>
                    </select>
                    <Label htmlFor="batch-etag">Manifest ETag</Label>
                    <Input id="batch-etag" {...form.register("etag")} />
                    {format === "csv" && (
                      <Label>
                        <input type="checkbox" {...form.register("versionColumn")} />{" "}
                        Version ID column
                      </Label>
                    )}
                  </>
                )}
              </>
            )}
            {step === 1 && (
              <>
                <Label htmlFor="batch-operation">Operation</Label>
                <select
                  id="batch-operation"
                  className={s3SelectClass}
                  {...form.register("operation")}
                >
                  {Object.entries(operations).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <Label htmlFor="batch-settings">Operation settings (JSON)</Label>
                <Textarea
                  id="batch-settings"
                  className="font-mono"
                  {...form.register("operationSettings")}
                />
              </>
            )}
            {step === 2 && (
              <>
                <Label htmlFor="batch-priority">Priority</Label>
                <Input
                  id="batch-priority"
                  type="number"
                  min="0"
                  {...form.register("priority")}
                />
                <Label htmlFor="batch-role">IAM role ARN</Label>
                <Input id="batch-role" {...form.register("role")} />
                <Label htmlFor="batch-description">Description (optional)</Label>
                <Input
                  id="batch-description"
                  maxLength={256}
                  {...form.register("description")}
                />
                <Label>
                  <input type="checkbox" {...form.register("confirmation")} /> Require
                  confirmation before running
                </Label>
                <Label>
                  <input type="checkbox" {...form.register("report")} /> Generate
                  completion report
                </Label>
                {report && (
                  <>
                    <Label htmlFor="batch-report-bucket">Report bucket ARN</Label>
                    <Input
                      id="batch-report-bucket"
                      {...form.register("reportBucket")}
                    />
                    <Label htmlFor="batch-report-scope">Report scope</Label>
                    <select
                      id="batch-report-scope"
                      className={s3SelectClass}
                      {...form.register("reportScope")}
                    >
                      <option value="AllTasks">All tasks</option>
                      <option value="FailedTasksOnly">Failed tasks only</option>
                    </select>
                  </>
                )}
              </>
            )}
            {step === 3 && (
              <pre className="max-h-80 overflow-auto rounded-lg border bg-muted p-3 text-xs">
                {JSON.stringify(review, null, 2)}
              </pre>
            )}
            {(save.error || error) && (
              <p role="alert" className="text-destructive">
                {save.error?.message ?? error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={close}
              >
                Cancel
              </Button>
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => {
                    setError("")
                    setStep(step - 1)
                  }}
                >
                  Previous
                </Button>
              )}
              <Button disabled={save.isPending}>
                {step < 3 ? "Next" : save.isPending ? "Creating…" : "Create job"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
