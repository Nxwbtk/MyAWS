"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronUp, Code2, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { readEmulator, runEmulatorOperation } from "@/lib/console-client"

type OperationStatus = "implemented" | "stub" | "retired" | "no_handler"
type OperationField = {
  name: string
  type: string
  target: string
  required: boolean
  documentation: string
}
type ApiOperation = {
  name: string
  sourceFile?: string
  status: OperationStatus
  runnable: boolean
  supportNote: string
  documentation: string
  inputFields: OperationField[]
  outputFields: OperationField[]
}
type ApiModel = {
  id: string
  operationCount: number
  implementedCount: number
  runnableCount: number
  stubCount: number
  missingHandlerCount: number
  operations: ApiOperation[]
}
type ApiCatalogResponse = { sourceCommit: string; model: ApiModel }
type Phase1Service =
  | "s3"
  | "ec2"
  | "vpc"
  | "dynamodb"
  | "sqs"
  | "iam"
  | "sts"
  | "lambda"
  | "cloudwatch"
  | "cloudtrail"

const emptyOperations: ApiOperation[] = []

const modelsByService: Record<Phase1Service, string[]> = {
  s3: ["s3", "s3control", "s3files", "s3outposts", "s3tables", "s3vectors"],
  ec2: ["ec2", "ec2instanceconnect"],
  vpc: ["ec2", "ec2instanceconnect"],
  dynamodb: ["dynamodb", "dynamodbstreams", "dax"],
  sqs: ["sqs"],
  iam: ["iam", "iamtoolbox", "accessanalyzer"],
  sts: ["sts"],
  lambda: ["lambda", "lambdacore", "lambdamicrovms", "lambdaweb"],
  cloudwatch: [
    "aiops",
    "applicationinsights",
    "applicationsignals",
    "cloudwatch",
    "cloudwatchlogs",
    "cloudwatchomni",
    "internetmonitor",
    "networkflowmonitor",
    "networkmonitor",
    "oam",
    "observabilityadmin",
    "rum",
    "synthetics",
  ],
  cloudtrail: ["cloudtrail", "cloudtraildata"],
}

function initialInput(
  operation: ApiOperation,
  initialValues: Record<string, unknown> = {},
) {
  const defaults = operation.inputFields
    .filter((field) => field.required)
    .map((field) => [field.name, exampleValue(field.type)] as const)
  return JSON.stringify(
    { ...Object.fromEntries(defaults), ...initialValues },
    null,
    2,
  )
}

function exampleValue(type: string): unknown {
  if (type === "string" || type === "blob") return ""
  if (type === "boolean") return false
  if (["byte", "short", "integer", "long", "float", "double", "bigInteger", "bigDecimal"].includes(type)) return 0
  if (type === "list" || type === "set") return []
  return {}
}

function statusLabel(operation: ApiOperation) {
  if (operation.status === "stub") return "501 stub"
  if (operation.status === "retired") return "Retired"
  if (operation.status === "no_handler") return "No handler"
  if (!operation.runnable) return "No JS SDK command"
  return "Implemented"
}

function hideSecrets(value: unknown, reveal: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => hideSecrets(item, reveal))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        !reveal && /secret|token|password|credential|authorization/i.test(key)
          ? "••••••••"
          : hideSecrets(item, reveal),
      ]),
    )
  }
  return value
}

export function Phase1OperationExplorer({
  service,
  initialModel,
  initialOperation,
  initialValues,
  startExpanded = false,
}: {
  service: Phase1Service
  initialModel?: string
  initialOperation?: string
  initialValues?: Record<string, unknown>
  startExpanded?: boolean
}) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(startExpanded)
  const [modelId, setModelId] = useState(initialModel ?? modelsByService[service][0])
  const [search, setSearch] = useState("")
  const [operationName, setOperationName] = useState(initialOperation ?? "")
  const [requestText, setRequestText] = useState<string>()
  const [confirmOperation, setConfirmOperation] = useState(false)
  const [showSensitive, setShowSensitive] = useState(false)
  const [requestError, setRequestError] = useState("")
  const catalog = useQuery({
    queryKey: ["emulator", "operation-catalog", modelId],
    queryFn: ({ signal }) =>
      readEmulator<ApiCatalogResponse>(
        "operation-catalog",
        { model: modelId },
        signal,
      ),
    enabled: expanded,
    staleTime: Infinity,
  })
  const operations = catalog.data?.model.operations ?? emptyOperations
  const visibleOperations = useMemo(() => {
    const term = search.trim().toLowerCase()
    return operations.filter((operation) =>
      term
        ? `${operation.name} ${operation.documentation}`
            .toLowerCase()
            .includes(term)
        : true,
    )
  }, [operations, search])
  const selected = operations.find(({ name }) => name === operationName)
  const currentRequestText = requestText ?? (selected ? initialInput(selected, initialValues) : "{}")
  const requiresConfirmation = Boolean(
    selected &&
      /^(Delete|Terminate|Stop|Remove|Detach|Disable|Revoke|Deregister|Disassociate|Cancel|Purge|Deactivate|Release)/i.test(selected.name),
  )
  const mutation = useMutation({
    mutationFn: (request: { operation: ApiOperation; input: Record<string, unknown> }) =>
      runEmulatorOperation(modelId, request.operation.name, request.input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["emulator"] })
    },
  })

  function selectOperation(operation: ApiOperation) {
    setOperationName(operation.name)
    setRequestText(initialInput(operation))
    setConfirmOperation(false)
    setRequestError("")
    mutation.reset()
  }

  function run() {
    if (!selected || selected.status !== "implemented") return
    let input: unknown
    try {
      input = JSON.parse(currentRequestText)
    } catch {
      setRequestError("Enter valid JSON for the operation input.")
      return
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      setRequestError("The operation input must be a JSON object.")
      return
    }
    setRequestError("")
    if (requiresConfirmation && !confirmOperation) {
      setConfirmOperation(true)
      return
    }
    setConfirmOperation(false)
    mutation.mutate({ operation: selected, input: input as Record<string, unknown> })
  }

  const model = catalog.data?.model
  const shownResult = mutation.data
    ? hideSecrets(mutation.data, showSensitive)
    : undefined

  return (
    <Card className="gap-0 rounded-xl border py-0 ring-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface-subtle px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Code2 aria-hidden className="size-4 text-muted-foreground" />
            API operations
            {model && (
              <Badge variant="secondary">
                {model.runnableCount}/{model.operationCount} runnable
              </Badge>
            )}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect the Smithy input model and call the local emulator with an AWS SDK command.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Hide operations" : "Browse operations"}
          {expanded ? (
            <ChevronUp aria-hidden className="size-4" />
          ) : (
            <ChevronDown aria-hidden className="size-4" />
          )}
        </Button>
      </CardHeader>
      {expanded && (
        <CardContent className="grid gap-5 p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-56 gap-1.5 text-sm font-medium">
              API model
              <select
                className="h-9 rounded-md border bg-background px-3 font-normal"
                value={modelId}
                onChange={(event) => {
                  setModelId(event.target.value)
                  setOperationName("")
                  setRequestText(undefined)
                  setConfirmOperation(false)
                  setSearch("")
                  mutation.reset()
                }}
              >
                {modelsByService[service].map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            {model && (
              <p className="text-sm text-muted-foreground">
                {model.implementedCount} emulator handlers
                {model.stubCount ? ` · ${model.stubCount} scaffolded stubs` : ""}
                {model.missingHandlerCount
                  ? ` · ${model.missingHandlerCount} operation without a handler`
                  : ""}
                {catalog.data && (
                  <span className="ml-1 font-mono text-xs">
                    · source {catalog.data.sourceCommit.slice(0, 12)}
                  </span>
                )}
              </p>
            )}
          </div>

          {catalog.error && (
            <p role="alert" className="text-sm text-destructive">
              {catalog.error.message}
            </p>
          )}
          {catalog.isPending && <p role="status">Loading operation catalog…</p>}

          {model && (
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.6fr)]">
              <div className="grid min-w-0 content-start gap-2">
                <div className="relative">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    aria-label="Filter API operations"
                    className="pl-8"
                    placeholder="Filter operations"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <div className="max-h-[32rem] overflow-y-auto rounded-lg border">
                  {visibleOperations.map((operation) => (
                    <button
                      type="button"
                      key={operation.name}
                      className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-subtle ${
                        operation.name === operationName
                          ? "bg-surface-subtle font-medium"
                          : ""
                      }`}
                      onClick={() => selectOperation(operation)}
                    >
                      <span className="truncate font-mono">{operation.name}</span>
                      <Badge
                        variant={operation.runnable ? "secondary" : "outline"}
                        className="shrink-0 text-[0.65rem]"
                      >
                        {statusLabel(operation)}
                      </Badge>
                    </button>
                  ))}
                  {!visibleOperations.length && (
                    <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                      No operations match this filter.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid min-w-0 content-start gap-4">
                {selected ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-mono text-base font-semibold">
                          {selected.name}
                        </h3>
                        <Badge variant={selected.runnable ? "secondary" : "outline"}>
                          {statusLabel(selected)}
                        </Badge>
                      </div>
                      {selected.documentation && (
                        <p className="text-sm leading-6 text-muted-foreground">
                          {selected.documentation}
                        </p>
                      )}
                      {selected.sourceFile && (
                        <p className="font-mono text-xs text-muted-foreground">
                          Emulator handler: {selected.sourceFile}
                        </p>
                      )}
                      {selected.status === "stub" && (
                        <p role="status" className="rounded-md bg-warning-muted px-3 py-2 text-sm text-warning">
                          {selected.supportNote || "This operation returns HTTP 501 in the pinned emulator revision."}
                        </p>
                      )}
                      {selected.status === "retired" && (
                        <p role="status" className="rounded-md bg-warning-muted px-3 py-2 text-sm text-warning">
                          {selected.supportNote || "This operation is retired and cannot be called from MyAWS."}
                        </p>
                      )}
                      {selected.status === "no_handler" && (
                        <p role="status" className="rounded-md bg-warning-muted px-3 py-2 text-sm text-warning">
                          This operation is in the AWS model but has no handler in the pinned emulator revision.
                        </p>
                      )}
                      {selected.status === "implemented" && !selected.runnable && (
                        <p role="status" className="rounded-md bg-warning-muted px-3 py-2 text-sm text-warning">
                          The emulator has a handler, but this JavaScript SDK package does not provide the operation command.
                        </p>
                      )}
                      {selected.inputFields.length > 0 && (
                        <div className="overflow-hidden rounded-md border">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-surface-subtle text-muted-foreground">
                              <tr>
                                <th className="px-2.5 py-2 font-medium">Input member</th>
                                <th className="px-2.5 py-2 font-medium">Type</th>
                                <th className="px-2.5 py-2 font-medium">Modeled shape</th>
                                <th className="px-2.5 py-2 font-medium">Required</th>
                                <th className="px-2.5 py-2 font-medium">Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selected.inputFields.map((field) => (
                                <tr key={field.name} className="border-t">
                                  <td className="px-2.5 py-2 font-mono">{field.name}</td>
                                  <td className="px-2.5 py-2 text-muted-foreground">{field.type}</td>
                                  <td className="px-2.5 py-2 font-mono text-muted-foreground">{field.target}</td>
                                  <td className="px-2.5 py-2">{field.required ? "Yes" : "No"}</td>
                                  <td className="px-2.5 py-2 text-muted-foreground">{field.documentation || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {selected.outputFields.length > 0 && (
                      <div className="grid gap-2">
                        <h4 className="text-sm font-semibold">Modeled response fields</h4>
                        <div className="overflow-hidden rounded-md border">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-surface-subtle text-muted-foreground">
                              <tr>
                                <th className="px-2.5 py-2 font-medium">Response member</th>
                                <th className="px-2.5 py-2 font-medium">Type</th>
                                <th className="px-2.5 py-2 font-medium">Modeled shape</th>
                                <th className="px-2.5 py-2 font-medium">Description</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selected.outputFields.map((field) => (
                                <tr key={field.name} className="border-t">
                                  <td className="px-2.5 py-2 font-mono">{field.name}</td>
                                  <td className="px-2.5 py-2 text-muted-foreground">{field.type}</td>
                                  <td className="px-2.5 py-2 font-mono text-muted-foreground">{field.target}</td>
                                  <td className="px-2.5 py-2 text-muted-foreground">{field.documentation || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <label className="grid gap-2 text-sm font-medium">
                      Request JSON
                      <span className="font-normal text-muted-foreground">
                        Use the modeled AWS input fields. Encode top-level blob values as base64 strings.
                      </span>
                      <Textarea
                        className="min-h-44 font-mono text-xs"
                        spellCheck={false}
                        value={currentRequestText}
                        onChange={(event) => {
                          setRequestText(event.target.value)
                          setConfirmOperation(false)
                        }}
                        aria-label="Operation request JSON"
                      />
                    </label>
                    {requestError && (
                      <p role="alert" className="text-sm text-destructive">
                        {requestError}
                      </p>
                    )}
                    {mutation.error && (
                      <p role="alert" className="text-sm text-destructive">
                        {mutation.error.message}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {!confirmOperation && (
                        <Button
                          type="button"
                          onClick={run}
                          disabled={selected.status !== "implemented" || !selected.runnable || mutation.isPending}
                        >
                          {mutation.isPending
                            ? "Calling emulator…"
                            : requiresConfirmation
                              ? "Review destructive action"
                              : "Run operation"}
                        </Button>
                      )}
                      {confirmOperation && (
                        <>
                          <Button type="button" variant="destructive" onClick={run}>
                            Run {selected.name}
                          </Button>
                          <Button type="button" variant="outline" onClick={() => setConfirmOperation(false)}>
                            Cancel
                          </Button>
                        </>
                      )}
                      <p className="text-xs text-muted-foreground">
                        This request is sent to the configured local emulator.
                      </p>
                    </div>
                    {shownResult !== undefined && (
                      <section className="grid gap-2" aria-label="Operation response">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold">Response</h4>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setShowSensitive((value) => !value)}
                          >
                            {showSensitive ? "Mask sensitive fields" : "Reveal sensitive fields"}
                          </Button>
                        </div>
                        <pre className="max-h-96 overflow-auto rounded-md border bg-surface-subtle p-3 text-xs leading-5 [overflow-wrap:anywhere]">
                          {JSON.stringify(shownResult, null, 2)}
                        </pre>
                      </section>
                    )}
                  </>
                ) : (
                  <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                    Choose an operation to inspect its AWS input fields and support status.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
