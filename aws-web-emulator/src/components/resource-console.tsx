"use client"

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { CircleAlert, Download, File, Search } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ServiceIcon } from "@/components/service-icon"
import { Phase1OperationExplorer } from "@/components/phase-1-operation-explorer"
import {
  CreateResource,
  PutItem,
  SendMessage,
  UploadObject,
} from "@/components/resource-forms"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  detailKey,
  emulatorUrl,
  readEmulator,
  resourceQuery,
  useConsoleStore,
  writeEmulator,
} from "@/lib/console-client"
import {
  services,
  type ItemPage,
  type ObjectPage,
  type QueueDetails,
  type QueueMessage,
  type Resource,
  type Service,
} from "@/lib/contracts"

export function ResourceConsole({ service }: { service: Service }) {
  const info = services[service]
  const query = useQuery(resourceQuery(service))
  const client = useQueryClient()
  const selected = useConsoleStore((state) => state.selected[service])
  const search = useConsoleStore((state) => state.filters[service] ?? "")
  const select = useConsoleStore((state) => state.select)
  const filter = useConsoleStore((state) => state.filter)
  const [notice, setNotice] = useState("")
  const resources = query.data ?? []
  const visible = resources.filter(({ name }) =>
    name.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const active = resources.find(({ id }) => id === selected)
  const listName = service === "s3" ? "General purpose buckets" : info.plural
  const extraColumns =
    service === "s3"
      ? ["AWS Region", "Creation date"]
      : service === "sqs"
        ? ["Type"]
        : []
  const empty = query.isPending
    ? `Loading ${info.plural}…`
    : search.trim()
      ? `No ${info.plural} match this filter.`
      : `No ${info.plural} yet.`

  function created(id?: string) {
    if (id) select(service, id)
    filter(service, "")
    setNotice(
      `${info.resource[0].toUpperCase()}${info.resource.slice(1)} created.`,
    )
    void client.invalidateQueries({ queryKey: resourceQuery(service).queryKey })
  }

  return (
    <>
      <section className="flex min-w-0 items-center gap-3.5">
        <ServiceIcon id={service} className="size-10" />
        <div>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
            {info.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {info.description}
          </p>
        </div>
      </section>

      <Card className="gap-0 rounded-xl border py-0 ring-0">
        <CardHeader className="gap-3 border-b bg-surface-subtle px-4 py-3.5 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold capitalize">
              {listName}
              {query.data && (
                <Badge variant="secondary">{resources.length}</Badge>
              )}
            </h2>
            <CreateResource service={service} onSaved={created} />
          </div>
          <div className="relative max-w-md">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              className="pl-8"
              aria-label={`Filter ${info.plural}`}
              placeholder={`Filter ${info.plural}`}
              value={search}
              onChange={(event) => filter(service, event.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {notice && (
            <p
              role="status"
              className="m-3 rounded-lg bg-success-muted px-3 py-2 font-medium text-success"
            >
              {notice}
            </p>
          )}
          {query.error ? (
            <div className="p-4">
              <Problem message={query.error.message} />
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-surface-subtle">
                <TableRow>
                  <TableHead className="px-4">
                    {service === "dynamodb" ? "Table name" : "Name"}
                  </TableHead>
                  {extraColumns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!visible.length && (
                  <TableRow>
                    <TableCell
                      colSpan={extraColumns.length + 1}
                      className="py-7 text-center text-muted-foreground"
                    >
                      <span role="status">{empty}</span>
                    </TableCell>
                  </TableRow>
                )}
                {visible.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={active?.id === row.id ? "selected" : undefined}
                  >
                    <TableCell className="px-4">
                      <Button
                        variant="link"
                        className="h-auto px-0 py-1 text-link"
                        aria-pressed={active?.id === row.id}
                        onClick={() => {
                          select(service, row.id)
                          setNotice("")
                        }}
                      >
                        {row.name}
                      </Button>
                    </TableCell>
                    {service === "s3" && (
                      <>
                        <TableCell>{row.region ?? "—"}</TableCell>
                        <TableCell>
                          {row.created
                            ? dateFormat.format(new Date(row.created))
                            : "—"}
                        </TableCell>
                      </>
                    )}
                    {service === "sqs" && (
                      <TableCell>
                        {row.name.endsWith(".fifo") ? "FIFO" : "Standard"}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {active && (
        <ResourceDetail key={active.id} service={service} resource={active} />
      )}
      <Phase1OperationExplorer service={service} />
    </>
  )
}

function ResourceDetail({
  service,
  resource,
}: {
  service: Service
  resource: Resource
}) {
  const props = { resource }
  if (service === "s3") return <BucketDetail {...props} />
  if (service === "dynamodb") return <TableDetail {...props} />
  return <QueueDetail {...props} />
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="px-1 py-2 text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function Problem({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-destructive-muted px-3 py-2 text-sm break-words text-destructive"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">{message}</span>
    </p>
  )
}

function DetailCard({
  resource,
  type,
  action,
  notice,
  children,
}: {
  resource: Resource
  type: string
  action: ReactNode
  notice: string
  children: ReactNode
}) {
  return (
    <Card className="min-w-0 gap-0 overflow-hidden rounded-xl border py-0 shadow-xs ring-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface-subtle px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{type}</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight break-all">
            {resource.name}
          </h2>
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-3 px-5 py-3.5">
        {notice && (
          <p
            role="status"
            className="rounded-lg bg-success-muted px-3 py-2 text-sm font-medium text-success"
          >
            {notice}
          </p>
        )}
        {children}
      </CardContent>
    </Card>
  )
}

function LoadMore({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={busy}>
      {busy ? "Loading…" : "Load more"}
    </Button>
  )
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
}

function BucketDetail({ resource }: { resource: Resource }) {
  const [notice, setNotice] = useState("")
  const client = useQueryClient()
  const queryKey = detailKey("s3", resource.id)
  const result = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      readEmulator<ObjectPage>(
        "objects",
        { resource: resource.id, cursor: pageParam },
        signal,
      ),
    getNextPageParam: (page) => page.cursor,
  })
  const objects = result.data?.pages.flatMap((page) => page.objects) ?? []
  return (
    <DetailCard
      resource={resource}
      type="S3 bucket"
      notice={notice}
      action={
        <UploadObject
          resource={resource.id}
          onSaved={() => {
            setNotice("Object uploaded.")
            void client.invalidateQueries({ queryKey })
          }}
        />
      }
    >
      {result.error && <Problem message={result.error.message} />}
      {result.isPending ? (
        <Hint>Loading objects…</Hint>
      ) : !objects.length ? (
        !result.error && <Hint>This bucket is empty.</Hint>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-surface-subtle">
              <TableRow>
                <TableHead>Object key</TableHead>
                <TableHead>Last modified</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Storage class</TableHead>
                <TableHead>
                  <span className="sr-only">Download</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {objects.map(({ key, bytes, modified, storageClass }) => (
                <TableRow key={key}>
                  <TableCell className="max-w-72 whitespace-normal">
                    <span className="flex items-start gap-2 break-all">
                      <File
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      />
                      {key}
                    </span>
                  </TableCell>
                  <TableCell>
                    {modified ? dateFormat.format(new Date(modified)) : "—"}
                  </TableCell>
                  <TableCell>{sizeLabel(bytes)}</TableCell>
                  <TableCell>{storageClass ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="icon-sm" variant="ghost">
                      <a
                        href={emulatorUrl("download", {
                          resource: resource.id,
                          key,
                        })}
                        download
                        aria-label={`Download ${key}`}
                      >
                        <Download aria-hidden className="size-4" />
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {result.hasNextPage && (
        <LoadMore
          busy={result.isFetching}
          onClick={() => void result.fetchNextPage()}
        />
      )}
    </DetailCard>
  )
}

function TableDetail({ resource }: { resource: Resource }) {
  const [notice, setNotice] = useState("")
  const [selectedAction, setSelectedAction] = useState<{
    operation: string
    input: Record<string, unknown>
  }>()
  const [confirmItemKey, setConfirmItemKey] = useState<string>()
  const client = useQueryClient()
  const queryKey = detailKey("dynamodb", resource.id)
  const result = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      readEmulator<ItemPage>(
        "items",
        { resource: resource.id, cursor: pageParam },
        signal,
      ),
    getNextPageParam: (page) => page.cursor,
    refetchInterval: (query) =>
      query.state.data?.pages[0]?.status === "CREATING" ? 1200 : false,
  })
  const table = result.data?.pages[0]
  const ready = table?.status === "ACTIVE" || table?.status === "UPDATING"
  const items = result.data?.pages.flatMap((page) => page.items) ?? []
  const keys = table?.keys ?? []
  const columns = [...new Set([...keys, ...items.flatMap(Object.keys)])].slice(
    0,
    6,
  )

  const deleteItem = useMutation({
    mutationFn: (key: Record<string, unknown>) =>
      writeEmulator({ kind: "delete-item", resource: resource.id, key }),
    onSuccess: () => {
      setNotice("Item deleted.")
      setConfirmItemKey(undefined)
    },
    onSettled: () => void client.invalidateQueries({ queryKey }),
  })

  return (
    <>
    <DetailCard
      resource={resource}
      type="DynamoDB table"
      notice={notice}
      action={
        table?.status && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{table.status}</Badge>
            {ready && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSelectedAction({
                      operation: "UpdateTable",
                      input: { TableName: resource.id },
                    })
                  }
                >
                  Edit settings
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    setSelectedAction({
                      operation: "DeleteTable",
                      input: { TableName: resource.id },
                    })
                  }
                >
                  Delete table
                </Button>
              </>
            )}
          </div>
        )
      }
    >
      {result.error && <Problem message={result.error.message} />}
      {result.isPending && <Hint>Loading table…</Hint>}
      {table && (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="indexes">
              Indexes ({table.indexes?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="items">Explore items</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Properties
              entries={[
                ["Partition key", table.partitionKey],
                ["Sort key", table.sortKey],
                ["Table ARN", table.tableArn],
                [
                  "Created",
                  table.createdAt
                    ? dateFormat.format(new Date(table.createdAt))
                    : undefined,
                ],
                ["Table class", table.tableClass],
                [
                  "Deletion protection",
                  table.deletionProtection === undefined
                    ? undefined
                    : table.deletionProtection
                      ? "Enabled"
                      : "Disabled",
                ],
                [
                  "Capacity mode",
                  table.billingMode === "PAY_PER_REQUEST"
                    ? "On-demand"
                    : table.billingMode,
                ],
                ["Reported item count", table.reportedItems],
                [
                  "Table size",
                  table.bytes === undefined
                    ? undefined
                    : sizeLabel(table.bytes),
                ],
                [
                  "DynamoDB Streams",
                  table.streamEnabled === undefined
                    ? undefined
                    : table.streamEnabled
                      ? table.streamViewType
                        ? `Enabled · ${table.streamViewType}`
                        : "Enabled"
                      : "Disabled",
                ],
                ["Encryption", table.encryption],
              ]}
            />
          </TabsContent>
          <TabsContent value="indexes" className="space-y-3">
            {table.indexes?.length ? (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="bg-surface-subtle">
                    <TableRow>
                      <TableHead>Index name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Key attributes</TableHead>
                      <TableHead>Projection</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Size</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {table.indexes.map((index) => (
                      <TableRow key={`${index.type}:${index.name}`}>
                        <TableCell className="font-mono text-xs">
                          {index.name || "—"}
                        </TableCell>
                        <TableCell>
                          {index.type === "global"
                            ? "Global secondary"
                            : "Local secondary"}
                        </TableCell>
                        <TableCell>{index.status ?? "—"}</TableCell>
                        <TableCell>{index.keys.join(", ") || "—"}</TableCell>
                        <TableCell>{index.projection ?? "—"}</TableCell>
                        <TableCell>{index.itemCount ?? "—"}</TableCell>
                        <TableCell>
                          {index.bytes === undefined
                            ? "—"
                            : sizeLabel(index.bytes)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Hint>This table has no secondary indexes.</Hint>
            )}
          </TabsContent>
          <TabsContent value="items" className="space-y-3">
            {deleteItem.error && <Problem message={deleteItem.error.message} />}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">
                Items returned ({items.length})
              </h3>
              {ready && (
                <PutItem
                  resource={resource.id}
                  keys={keys}
                  onSaved={() => {
                    setNotice("Item saved.")
                    void client.invalidateQueries({ queryKey })
                  }}
                />
              )}
            </div>
            {items.length ? (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="bg-surface-subtle">
                    <TableRow>
                      {columns.map((column) => (
                        <TableHead key={column}>{column}</TableHead>
                      ))}
                      <TableHead>Item</TableHead>
                      {ready && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const itemKey = Object.fromEntries(
                        keys
                          .filter((name) => item[name] !== undefined)
                          .map((name) => [name, item[name]]),
                      )
                      const encodedKey = JSON.stringify(itemKey)
                      const confirming = confirmItemKey === encodedKey
                      return (
                        <TableRow
                          key={JSON.stringify(keys.map((key) => item[key]))}
                        >
                          {columns.map((column) => (
                            <TableCell key={column} className="max-w-40 truncate">
                              {item[column] === undefined
                                ? "—"
                                : typeof item[column] === "string"
                                  ? item[column]
                                  : JSON.stringify(item[column])}
                            </TableCell>
                          ))}
                          <TableCell>
                            <details>
                              <summary className="cursor-pointer text-link">
                                View JSON
                              </summary>
                              <pre className="max-w-xs overflow-auto whitespace-pre-wrap py-2 text-xs">
                                {JSON.stringify(item, null, 2)}
                              </pre>
                            </details>
                          </TableCell>
                          {ready && (
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  size="xs"
                                  variant="destructive"
                                  disabled={deleteItem.isPending || !keys.length}
                                  onClick={() => {
                                    if (Object.keys(itemKey).length !== keys.length)
                                      return
                                    if (confirming) deleteItem.mutate(itemKey)
                                    else setConfirmItemKey(encodedKey)
                                  }}
                                >
                                  {confirming ? "Confirm delete" : "Delete item"}
                                </Button>
                                {confirming && (
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    onClick={() => setConfirmItemKey(undefined)}
                                  >
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Hint>
                {ready
                  ? "This table is empty."
                  : "Items will appear when this table is active."}
              </Hint>
            )}
            {result.hasNextPage && (
              <LoadMore
                busy={result.isFetching}
                onClick={() => void result.fetchNextPage()}
              />
            )}
          </TabsContent>
        </Tabs>
      )}
    </DetailCard>
    {selectedAction && (
      <Phase1OperationExplorer
        key={`${selectedAction.operation}:${JSON.stringify(selectedAction.input)}`}
        service="dynamodb"
        initialModel="dynamodb"
        initialOperation={selectedAction.operation}
        initialValues={selectedAction.input}
        startExpanded
      />
    )}
    </>
  )
}

function QueueDetail({ resource }: { resource: Resource }) {
  const [notice, setNotice] = useState("")
  const [selectedAction, setSelectedAction] = useState<{
    operation: string
    input: Record<string, unknown>
  }>()
  const queryKey = detailKey("sqs", resource.id)
  const client = useQueryClient()
  const result = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      readEmulator<QueueDetails>("queue", { resource: resource.id }, signal),
  })
  const receive = useMutation({
    mutationFn: () =>
      writeEmulator<QueueMessage[]>({ kind: "receive", resource: resource.id }),
    onSettled: () => void client.invalidateQueries({ queryKey }),
  })
  const queue = result.data
  return (
    <>
    <DetailCard
      resource={resource}
      type="SQS queue"
      notice={notice}
      action={
        queue && <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{queue.fifo ? "FIFO" : "Standard"}</Badge>
          <Button size="sm" variant="outline" onClick={() => setSelectedAction({ operation: "SetQueueAttributes", input: { QueueUrl: resource.id, Attributes: editableQueueAttributes(queue.attributes) } })}>Edit attributes</Button>
          <Button size="sm" variant="outline" onClick={() => setSelectedAction({ operation: "PurgeQueue", input: { QueueUrl: resource.id } })}>Purge messages</Button>
          <Button size="sm" variant="destructive" onClick={() => setSelectedAction({ operation: "DeleteQueue", input: { QueueUrl: resource.id } })}>Delete queue</Button>
        </div>
      }
    >
      {result.error && <Problem message={result.error.message} />}
      {result.isPending && <Hint>Loading queue attributes…</Hint>}
      {queue && (
        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="messages">
              Send and receive messages
            </TabsTrigger>
          </TabsList>
          <TabsContent value="details">
            <Properties
              entries={[
                ["Messages available", queue.available],
                ["Messages in flight", queue.inFlight],
                ["Messages delayed", queue.delayed],
                ["Visibility timeout", seconds(queue.visibilitySeconds)],
                ["Message retention", seconds(queue.retentionSeconds)],
                ["Delivery delay", seconds(queue.delaySeconds)],
                ["Queue URL", resource.id],
                ...Object.entries(queue.attributes).map(([name, value]) => [name, queueAttributeValue(name, value)] as [string, string]),
              ]}
            />
          </TabsContent>
          <TabsContent value="messages" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SendMessage
                resource={resource.id}
                fifo={queue.fifo}
                onSaved={(id) => {
                  setNotice(id ? `Message sent (${id}).` : "Message sent.")
                  void client.invalidateQueries({ queryKey })
                }}
              />
              <Button
                variant="outline"
                disabled={receive.isPending}
                onClick={() => receive.mutate()}
              >
                {receive.isPending ? "Polling…" : "Poll for messages"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Received messages are hidden until the queue’s visibility timeout
              expires.
            </p>
            {receive.error && <Problem message={receive.error.message} />}
            {receive.data &&
              (receive.data.length ? (
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader className="bg-surface-subtle">
                      <TableRow>
                        <TableHead>Message ID</TableHead>
                        <TableHead>Body</TableHead>
                        <TableHead>Attributes</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receive.data.map(({ id, body, receiptHandle, attributes, systemAttributes }) => (
                        <TableRow key={id}>
                          <TableCell className="font-mono text-xs">
                            {id}
                          </TableCell>
                          <TableCell>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
                              {body}
                            </pre>
                          </TableCell>
                          <TableCell>
                            {attributes || systemAttributes ? (
                              <details>
                                <summary className="cursor-pointer text-link">
                                  View attributes
                                </summary>
                                <pre className="max-w-64 overflow-auto whitespace-pre-wrap py-2 text-xs">
                                  {JSON.stringify(
                                    { system: systemAttributes, message: attributes },
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="xs"
                              variant="destructive"
                              disabled={!receiptHandle}
                              onClick={() => {
                                if (!receiptHandle) return
                                receive.reset()
                                setSelectedAction({ operation: "DeleteMessage", input: { QueueUrl: resource.id, ReceiptHandle: receiptHandle } })
                              }}
                            >
                              Delete message
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <Hint>No messages were returned.</Hint>
              ))}
          </TabsContent>
        </Tabs>
      )}
    </DetailCard>
    {selectedAction && (
      <Phase1OperationExplorer
        key={`${selectedAction.operation}:${JSON.stringify(selectedAction.input)}`}
        service="sqs"
        initialModel="sqs"
        initialOperation={selectedAction.operation}
        initialValues={selectedAction.input}
        startExpanded
      />
    )}
    </>
  )
}

function seconds(value: string | undefined) {
  return value === undefined ? undefined : `${value} s`
}

const settableQueueAttributes = new Set([
  "VisibilityTimeout",
  "MessageRetentionPeriod",
  "DelaySeconds",
  "MaximumMessageSize",
  "ReceiveMessageWaitTimeSeconds",
  "KmsMasterKeyId",
  "KmsDataKeyReusePeriodSeconds",
  "ContentBasedDeduplication",
  "DeduplicationScope",
  "FifoThroughputLimit",
  "RedrivePolicy",
  "RedriveAllowPolicy",
])

function editableQueueAttributes(attributes: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(attributes).filter(([name]) =>
      settableQueueAttributes.has(name),
    ),
  )
}

function queueAttributeValue(name: string, value: string) {
  if (
    (name === "CreatedTimestamp" || name === "LastModifiedTimestamp") &&
    /^\d+$/.test(value)
  ) {
    return dateFormat.format(new Date(Number(value) * 1000))
  }
  return value
}

function Properties({
  entries,
}: {
  entries: [string, string | number | undefined][]
}) {
  return (
    <dl className="grid gap-3 rounded-lg border bg-surface-subtle p-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([label, value]) => (
        <div
          key={label}
          className={label === "Queue URL" ? "sm:col-span-full" : "min-w-0"}
        >
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-1 font-medium [overflow-wrap:anywhere]">
            {value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  )
}
