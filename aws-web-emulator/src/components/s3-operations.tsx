"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { S3OperationForm, s3SelectClass } from "@/components/s3-operation-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  findS3Operation,
  s3OperationLabel,
  s3Operations,
  type S3Model,
} from "@/lib/s3-catalog"
import { s3Read, S3RequestError } from "@/lib/s3-client"

export const s3Models: Record<S3Model, string> = {
  s3: "S3 buckets and objects",
  s3control: "S3 Control",
  s3tables: "S3 Tables",
  s3vectors: "S3 Vectors",
  s3files: "S3 Files",
  s3outposts: "S3 on Outposts",
}

export function S3Operations({
  model,
  actions,
  context,
  title = "API operations",
}: {
  model: S3Model
  actions?: string[]
  context?: Record<string, unknown>
  title?: string
}) {
  const [search, setSearch] = useState("")
  const [selected, select] = useState("")
  const all = actions ?? Object.keys(s3Operations[model])
  const term = search.trim().toLowerCase().replace(/\s/g, "")
  const options = all.filter((name) => name.toLowerCase().includes(term))
  const operation = findS3Operation(model, selected)
  const fixed = Object.fromEntries(
    (operation?.input ?? [])
      .filter(([name]) => context && Object.hasOwn(context, name))
      .map(([name]) => [name, context?.[name]]),
  )

  return (
    <div className="space-y-3">
      <Card className="rounded-xl border ring-0">
        <CardHeader>
          <h2 className="text-lg font-semibold">{title}</h2>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Input
            aria-label={`Filter ${title.toLowerCase()}`}
            placeholder="Filter operations"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label={`Select ${title.toLowerCase()}`}
            className={s3SelectClass}
            value={selected}
            onChange={(event) => select(event.target.value)}
          >
            <option value="">Select an operation</option>
            {selected && !options.includes(selected) && (
              <option value={selected}>{s3OperationLabel(selected)}</option>
            )}
            {options.map((name) => (
              <option key={name} value={name}>
                {s3OperationLabel(name)}
              </option>
            ))}
          </select>
          {options.length === 0 && (
            <p className="text-sm text-muted-foreground" role="status">
              No matching operations.
            </p>
          )}
        </CardContent>
      </Card>
      {operation && (
        <S3OperationForm key={selected} model={model} action={selected} fixed={fixed} />
      )}
    </div>
  )
}

export type S3Setting = { title: string; read?: string; actions: string[] }

const settingChoices: Record<
  string,
  { parameter: string; key: string; labels: Record<string, string> }
> = {
  PutBucketVersioning: {
    parameter: "VersioningConfiguration",
    key: "Status",
    labels: { Suspended: "Suspend", Enabled: "Enable" },
  },
  PutBucketAbac: {
    parameter: "AbacStatus",
    key: "Status",
    labels: { Disabled: "Disable", Enabled: "Enable" },
  },
  PutBucketAccelerateConfiguration: {
    parameter: "AccelerateConfiguration",
    key: "Status",
    labels: { Suspended: "Suspend", Enabled: "Enable" },
  },
  PutBucketRequestPayment: {
    parameter: "RequestPaymentConfiguration",
    key: "Payer",
    labels: { BucketOwner: "Bucket owner pays", Requester: "Requester pays" },
  },
}

const settingPayloads: Record<string, string> = {
  PutBucketTagging: "Tagging",
  PutObjectTagging: "Tagging",
  PutBucketLogging: "BucketLoggingStatus",
  PutBucketNotificationConfiguration: "NotificationConfiguration",
  PutBucketWebsite: "WebsiteConfiguration",
  PutBucketLifecycleConfiguration: "LifecycleConfiguration",
}

function EditSetting({
  action,
  title,
  current,
  context,
  close,
}: {
  action: string
  title: string
  current?: Record<string, unknown>
  context: Record<string, unknown>
  close: () => void
}) {
  const spec = settingChoices[action]
  const value = current?.[spec.parameter] as Record<string, unknown> | undefined
  const initial = current?.[spec.key] ?? value?.[spec.key]
  const [choice, setChoice] = useState(typeof initial === "string" ? initial : "")
  const cache = useQueryClient()
  const save = useMutation({
    mutationFn: () =>
      s3Read("s3", action, { ...context, [spec.parameter]: { [spec.key]: choice } }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["emulator", "s3"] })
      close()
    },
  })
  return (
    <Card className="rounded-xl border ring-0">
      <CardHeader>
        <h2 className="text-lg font-semibold">Edit {title}</h2>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (choice) save.mutate()
          }}
        >
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">{title}</legend>
            {Object.entries(spec.labels).map(([value, label]) => (
              <Label key={value}>
                <input
                  type="radio"
                  name={action}
                  checked={choice === value}
                  onChange={() => setChoice(value)}
                />
                {label}
              </Label>
            ))}
          </fieldset>
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button disabled={!choice || save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function S3Settings({
  model,
  context,
  sections,
}: {
  model: S3Model
  context: Record<string, unknown>
  sections: S3Setting[]
}) {
  return sections.map((spec) => (
    <SettingCard key={spec.title} model={model} context={context} spec={spec} />
  ))
}

function EditRequestMetrics({
  context,
  enabled,
  close,
}: {
  context: Record<string, unknown>
  enabled: boolean
  close: () => void
}) {
  const [choice, setChoice] = useState(enabled)
  const cache = useQueryClient()
  const save = useMutation({
    mutationFn: () =>
      s3Read(
        "s3tables",
        choice
          ? "PutTableBucketMetricsConfiguration"
          : "DeleteTableBucketMetricsConfiguration",
        context,
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["emulator", "s3"] })
      close()
    },
  })
  return (
    <Card className="rounded-xl border ring-0">
      <CardHeader>
        <h2 className="text-lg font-semibold">Edit request metrics</h2>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            if (choice === enabled) close()
            else save.mutate()
          }}
        >
          <fieldset className="grid gap-2" disabled={save.isPending}>
            <legend className="mb-2 font-medium">Request metrics</legend>
            <Label>
              <input
                type="radio"
                name="request-metrics"
                checked={choice}
                onChange={() => setChoice(true)}
              />{" "}
              Enabled
            </Label>
            <Label>
              <input
                type="radio"
                name="request-metrics"
                checked={!choice}
                onChange={() => setChoice(false)}
              />{" "}
              Disabled
            </Label>
          </fieldset>
          {save.error && (
            <p role="alert" className="text-destructive">
              {save.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button disabled={save.isPending}>Save changes</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function SettingCard({
  model,
  context,
  spec,
}: {
  model: S3Model
  context: Record<string, unknown>
  spec: S3Setting
}) {
  const [edit, setEdit] = useState("")
  const result = useQuery({
    queryKey: ["emulator", "s3", model, spec.read, context],
    queryFn: ({ signal }) => s3Read(model, spec.read!, context, signal),
    enabled: Boolean(spec.read),
  })
  const operation = findS3Operation(model, edit)
  const fixed = Object.fromEntries(
    (operation?.input ?? [])
      .filter(([name]) => Object.hasOwn(context, name))
      .map(([name]) => [name, context[name]]),
  )
  const missing = result.error instanceof S3RequestError && result.error.status === 404
  const isRequestMetrics =
    model === "s3tables" && spec.read === "GetTableBucketMetricsConfiguration"
  const editActions = isRequestMetrics
    ? ["PutTableBucketMetricsConfiguration"]
    : spec.actions
  const components = result.data && Object.entries(result.data)
  const payload = settingPayloads[edit]
  const initial = payload && result.data ? { [payload]: result.data } : result.data

  return (
    <div className="space-y-3">
      <Card className="rounded-xl border ring-0">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{spec.title}</h2>
          <div className="flex flex-wrap gap-2">
            {editActions.map((action) => (
              <Button
                type="button"
                key={action}
                variant="outline"
                aria-expanded={edit === action}
                disabled={
                  isRequestMetrics &&
                  (result.isPending || Boolean(result.error && !missing))
                }
                onClick={() => setEdit(edit === action ? "" : action)}
              >
                {editActions.length === 1 && action.startsWith("Put")
                  ? "Edit"
                  : s3OperationLabel(action)}
              </Button>
            ))}
          </div>
        </CardHeader>
        {spec.read && (
          <CardContent>
            {result.isPending && (
              <p role="status" className="text-sm text-muted-foreground">
                Loading settings…
              </p>
            )}
            {missing && (
              <p className="text-sm text-muted-foreground">
                {isRequestMetrics ? "Disabled" : "No configuration."}
              </p>
            )}
            {result.error && !missing && (
              <p role="alert" className="text-sm text-destructive">
                {result.error.message}
              </p>
            )}
            {components &&
              (components.length ? (
                <dl className="grid gap-3">
                  {isRequestMetrics && (
                    <div>
                      <dt className="text-sm font-medium">Status</dt>
                      <dd className="text-sm text-muted-foreground">Enabled</dd>
                    </div>
                  )}
                  {components.map(([name, value]) => (
                    <div key={name}>
                      <dt className="text-sm font-medium">{s3OperationLabel(name)}</dt>
                      <dd>
                        {value && typeof value === "object" ? (
                          <pre className="mt-1 max-h-64 overflow-auto rounded-lg border bg-surface-subtle p-3 text-xs">
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {String(value)}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No configuration.</p>
              ))}
          </CardContent>
        )}
      </Card>
      {operation &&
        (isRequestMetrics ? (
          <EditRequestMetrics
            context={fixed}
            enabled={Boolean(result.data?.id)}
            close={() => setEdit("")}
          />
        ) : model === "s3" && Object.hasOwn(settingChoices, edit) ? (
          <EditSetting
            key={edit}
            action={edit}
            title={spec.title}
            current={result.data}
            context={fixed}
            close={() => setEdit("")}
          />
        ) : (
          <S3OperationForm
            key={edit}
            model={model}
            action={edit}
            fixed={fixed}
            initial={initial}
            cancel={() => setEdit("")}
            afterSuccess={
              /^(Get|List|Describe)/.test(edit) ? undefined : () => setEdit("")
            }
          />
        ))}
    </div>
  )
}
