"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useId } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { downloadS3File, s3Request } from "@/lib/s3-client"
import {
  findS3Operation,
  s3OperationLabel,
  type S3Input,
  type S3Model,
} from "@/lib/s3-catalog"
import { uploadLimit } from "@/lib/contracts"

export const s3SelectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"

type Fields = { values: Record<string, string | FileList>; confirmation: string }
type Parameters = Record<string, unknown>

function initialValue(value: unknown) {
  if (value === undefined) return ""
  if (typeof value === "object") return JSON.stringify(value, null, 2)
  return String(value)
}

function readValue(
  [name, kind, required, choices]: S3Input,
  value: string | FileList | undefined,
) {
  if (kind === "file") {
    const file = value instanceof FileList ? value.item(0) : null
    if (file && file.size > uploadLimit) throw new Error("Choose a file up to 16 MiB.")
    return file ?? undefined
  }
  if (typeof value !== "string" || (!value && !required)) return undefined
  if (name === "AccountId" && !value) return undefined
  switch (kind) {
    case "text":
      return required ? z.string().min(1).parse(value) : value
    case "boolean":
      return z.enum(["true", "false"]).parse(value) === "true"
    case "enum":
      return z.enum(choices ?? []).parse(value)
    case "number":
      return z.number().parse(Number(value))
    case "date":
      return z.string().min(1).parse(value)
    case "json":
      return JSON.parse(value) as unknown
  }
}

const stateLabels = {
  available: "Emulator handler present",
  stub: "Emulator stub",
  unwired: "Emulator handler missing",
  retired: "Retired operation",
}

export function S3OperationForm({
  model,
  action,
  title,
  initial = {},
  fixed = {},
  preferred,
  confirm,
  cancel,
  afterSuccess,
}: {
  model: S3Model
  action: string
  title?: string
  initial?: Parameters
  fixed?: Parameters
  preferred?: string[]
  confirm?: string
  cancel?: () => void
  afterSuccess?: (data: Parameters) => void
}) {
  const formId = useId()
  const operation = findS3Operation(model, action)
  const inputs = operation?.input.filter(([name]) => !Object.hasOwn(fixed, name)) ?? []
  const shown = preferred
    ? inputs.filter(([name, , required]) => required || preferred.includes(name))
    : inputs
  const advanced = preferred ? inputs.filter((entry) => !shown.includes(entry)) : []
  const form = useForm<Fields>({
    defaultValues: {
      confirmation: "",
      values: Object.fromEntries(
        inputs
          .filter(([, kind]) => kind !== "file")
          .map(([name]) => [name, initialValue(initial[name])]),
      ),
    },
  })
  const client = useQueryClient()
  const execute = useMutation({
    mutationFn: ({
      input,
      uploads,
    }: {
      input: Parameters
      uploads: Record<string, File>
    }) => s3Request(model, action, input, { uploads }),
    onSuccess: ({ data, file }) => {
      if (file)
        downloadS3File(
          file,
          String(fixed.Key ?? form.getValues("values.Key") ?? "response")
            .split("/")
            .at(-1) || "response",
        )
      if (!action.match(/^(Get|List|Head|Describe|Query)/)) {
        void client.invalidateQueries({ queryKey: ["emulator", "s3"] })
      }
      afterSuccess?.(data ?? {})
    },
  })

  function submit(values: Fields) {
    const input = { ...fixed }
    const uploads: Record<string, File> = {}
    let valid = true
    for (const entry of inputs) {
      const [name, kind, required] = entry
      try {
        const value = readValue(entry, values.values[name])
        if (value instanceof File) uploads[name] = value
        else if (value !== undefined) input[name] = value
        else if (required && name !== "AccountId") throw new Error("Required.")
      } catch (error) {
        const detail =
          error instanceof Error &&
          !(error instanceof z.ZodError) &&
          !(error instanceof SyntaxError)
            ? error.message
            : `Enter a valid ${kind === "json" ? "JSON value" : "value"}.`
        form.setError(`values.${name}`, { message: detail })
        valid = false
      }
    }
    if (valid) execute.mutate({ input, uploads })
  }

  function field([name, kind, required, choices]: S3Input) {
    const id = `${formId}-${name}`
    const registration = form.register(`values.${name}`)
    const error = form.formState.errors.values?.[name]?.message
    const label = name === "Bucket" ? "Bucket name" : s3OperationLabel(name)
    return (
      <div key={name} className="grid gap-1.5">
        <Label htmlFor={id}>
          {label}
          {required && name !== "AccountId" && " *"}
        </Label>
        {kind === "enum" || kind === "boolean" ? (
          <select
            id={id}
            className={s3SelectClass}
            aria-invalid={Boolean(error)}
            {...registration}
          >
            <option value="">Select an option</option>
            {(choices ?? ["true", "false"]).map((choice) => (
              <option key={choice}>{choice}</option>
            ))}
          </select>
        ) : kind === "json" ? (
          <Textarea
            id={id}
            className="font-mono text-xs"
            placeholder="Enter JSON"
            aria-invalid={Boolean(error)}
            {...registration}
          />
        ) : (
          <Input
            id={id}
            type={kind === "date" ? "datetime-local" : kind}
            step={kind === "number" ? "any" : undefined}
            aria-invalid={Boolean(error)}
            placeholder={
              name === "AccountId" ? "Use the local emulator account" : undefined
            }
            {...registration}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    )
  }

  if (!operation)
    return (
      <p role="alert" className="text-destructive">
        Unknown S3 operation.
      </p>
    )
  const confirmation =
    confirm ?? (action.match(/^(Delete|Abort)/) ? "delete" : undefined)
  return (
    <Card className="overflow-hidden rounded-xl border ring-0">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{title ?? s3OperationLabel(action)}</h2>
          {operation.state !== "available" && (
            <Badge variant="outline">{stateLabels[operation.state]}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" noValidate onSubmit={form.handleSubmit(submit)}>
          {shown.map(field)}
          {advanced.length > 0 && (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Additional settings
              </summary>
              <div className="mt-3 grid gap-3">{advanced.map(field)}</div>
            </details>
          )}
          {confirmation && (
            <div className="grid gap-1.5">
              <Label htmlFor={`${formId}-confirmation`}>
                Enter {confirmation} to confirm
              </Label>
              <Input
                id={`${formId}-confirmation`}
                autoComplete="off"
                {...form.register("confirmation", {
                  validate: (value) =>
                    value === confirmation || `Enter ${confirmation} to continue.`,
                })}
              />
              {form.formState.errors.confirmation && (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.confirmation.message}
                </p>
              )}
            </div>
          )}
          {execute.error && (
            <p role="alert" className="text-sm text-destructive">
              {execute.error.message}
            </p>
          )}
          {execute.data && (
            <div className="space-y-2" role="status">
              <p className="text-sm text-success">
                Request completed (HTTP {execute.data.status}).
              </p>
              {execute.data.data && Object.keys(execute.data.data).length > 0 && (
                <pre className="max-h-72 overflow-auto rounded-lg border bg-surface-subtle p-3 text-xs">
                  {JSON.stringify(execute.data.data, null, 2)}
                </pre>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            {cancel && (
              <Button
                type="button"
                variant="outline"
                disabled={execute.isPending}
                onClick={cancel}
              >
                Cancel
              </Button>
            )}
            <Button
              disabled={execute.isPending || operation.state === "unwired"}
              variant={confirmation ? "destructive" : "default"}
            >
              {execute.isPending ? "Working…" : (title ?? s3OperationLabel(action))}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
