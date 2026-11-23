"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import ExpandableSection from "@cloudscape-design/components/expandable-section"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { CodeView, EditModal, Section, pretty } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { Copyable } from "@/components/ec2-family/engine"
import { DeleteQueueModal, PurgeQueueModal } from "@/components/sqs/queues"
import { SqsLayout } from "@/components/sqs/sqs-app"
import { arnName, encryption, epoch, isFifo, redrive, seconds, useQueue, type Attributes } from "@/components/sqs/shared"
import { callAws, unavailableReason, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

export function QueueDetailPage({ name, tab }: { name: string; tab: string }) {
  const router = useRouter()
  const follow = useFollow()
  const queue = useQueue(name)
  const [modal, setModal] = useState<string>()
  const a = queue.attributes
  const base = `/sqs/queues/${encodeURIComponent(name)}`
  const dlq = redrive(a)
  return (
    <SqsLayout breadcrumbs={[{ text: "Queues", href: "/sqs/queues" }, { text: name, href: base }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button href={`${base}/edit`} onFollow={follow}>Edit</Button>
                <Button onClick={() => setModal("delete")}>Delete</Button>
                <Button onClick={() => setModal("purge")}>Purge</Button>
                <Button onClick={() => router.push(`${base}/redrive`)}>Start DLQ redrive</Button>
                <Button variant="primary" href={`${base}/send-receive`} onFollow={follow}>Send and receive messages</Button>
              </SpaceBetween>
            }
          >
            {name}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {queue.error && <Alert type="error">{errorMessage(queue.error)}</Alert>}
          <Container header={<Header variant="h2" actions={<Button iconName="refresh" ariaLabel="Refresh" onClick={() => void queue.refetch()} />}>Details</Header>}>
            <SpaceBetween size="l">
              <KeyValuePairs
                columns={3}
                items={[
                  { label: "Name", value: name },
                  { label: "Type", value: isFifo(name) ? "FIFO" : "Standard" },
                  { label: "ARN", value: a?.QueueArn ? <Copyable value={a.QueueArn} /> : "–" },
                  { label: "Encryption", value: encryption(a) },
                  { label: "URL", value: queue.url ? <Copyable value={queue.url} /> : "–" },
                  { label: "Dead-letter queue", value: dlq?.deadLetterTargetArn ? <Link href={`/sqs/queues/${encodeURIComponent(arnName(dlq.deadLetterTargetArn))}`} onFollow={follow}>{arnName(dlq.deadLetterTargetArn)}</Link> : "–" },
                ]}
              />
              <ExpandableSection headerText="More">
                <KeyValuePairs
                  columns={3}
                  items={[
                    { label: "Maximum message size", value: a?.MaximumMessageSize ? `${Math.round(Number(a.MaximumMessageSize) / 1024)} KiB` : "–" },
                    { label: "Message retention period", value: seconds(a?.MessageRetentionPeriod) },
                    { label: "Created", value: epoch(a?.CreatedTimestamp) },
                    { label: "Last updated", value: epoch(a?.LastModifiedTimestamp) },
                    { label: "Delivery delay", value: seconds(a?.DelaySeconds) },
                    { label: "Visibility timeout", value: seconds(a?.VisibilityTimeout) },
                    { label: "Receive message wait time", value: seconds(a?.ReceiveMessageWaitTimeSeconds) },
                    { label: "Messages available", value: a?.ApproximateNumberOfMessages ?? "0" },
                    { label: "Messages delayed", value: a?.ApproximateNumberOfMessagesDelayed ?? "0" },
                    { label: "Messages in flight (not available to other consumers)", value: a?.ApproximateNumberOfMessagesNotVisible ?? "0" },
                    ...(isFifo(name)
                      ? [
                          { label: "Content-based deduplication", value: a?.ContentBasedDeduplication === "true" ? "Enabled" : "Disabled" },
                          { label: "High throughput FIFO", value: a?.FifoThroughputLimit === "perMessageGroupId" ? "Enabled" : "Disabled" },
                          { label: "Deduplication scope", value: a?.DeduplicationScope === "messageGroup" ? "Message group" : "Queue" },
                          { label: "FIFO throughput limit", value: a?.FifoThroughputLimit === "perMessageGroupId" ? "Per message group ID" : "Per queue" },
                        ]
                      : []),
                    { label: "Redrive allow policy", value: a?.RedriveAllowPolicy ? JSON.parse(a.RedriveAllowPolicy).redrivePermission : "–" },
                  ]}
                />
              </ExpandableSection>
            </SpaceBetween>
          </Container>
          <Tabs
            activeTabId={tab}
            onChange={({ detail }) => router.replace(`${base}?tab=${detail.activeTabId}`)}
            tabs={[
              { id: "sns", label: "SNS subscriptions", content: <Section title="SNS subscriptions" counter="(0)" actions={<Button disabled disabledReason={unavailableReason("sns", "Subscribe")}>Subscribe to Amazon SNS topic</Button>}><Box color="text-status-inactive">Amazon SNS is not available in the local emulator.</Box></Section> },
              { id: "lambda", label: "Lambda triggers", content: <LambdaTriggers arn={a?.QueueArn} /> },
              { id: "pipes", label: "EventBridge Pipes", content: <Section title="EventBridge Pipes" counter="(0)" actions={<Button disabled disabledReason="EventBridge Pipes are not available in the local emulator.">Connect queue to pipe</Button>}><Box color="text-status-inactive">EventBridge Pipes are not available in the local emulator.</Box></Section> },
              { id: "dlq", label: "Dead-letter queue", content: <DeadLetter url={queue.url} attributes={a} /> },
              { id: "monitoring", label: "Monitoring", content: <Alert type="info">CloudWatch metrics for Amazon SQS are not reported by the local emulator.</Alert> },
              { id: "tagging", label: "Tagging", content: <Tagging url={queue.url} /> },
              { id: "policy", label: "Access policy", content: <Section title="Access policy (Permissions)" info actions={<Button href={`${base}/edit`} onFollow={follow}>Edit</Button>}><CodeView value={pretty(a?.Policy)} empty="No access policy" /></Section> },
              { id: "encryption", label: "Encryption", content: <Section title="Encryption" info actions={<Button href={`${base}/edit`} onFollow={follow}>Edit</Button>} columns={2} items={[{ label: "Server-side encryption", value: encryption(a) === "–" ? "Disabled" : <StatusIndicator type="success">Enabled</StatusIndicator> }, { label: "Encryption key type", value: encryption(a) }, ...(a?.KmsMasterKeyId ? [{ label: "Customer master key", value: a.KmsMasterKeyId }, { label: "Data key reuse period", value: seconds(a.KmsDataKeyReusePeriodSeconds) }] : [])]} /> },
              { id: "redrive", label: "Dead-letter queue redrive tasks", content: <RedriveTasks arn={a?.QueueArn} /> },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      {modal === "delete" && queue.url && <DeleteQueueModal queue={{ name, url: queue.url }} close={() => setModal(undefined)} onDone={() => router.push("/sqs/queues")} />}
      {modal === "purge" && queue.url && <PurgeQueueModal queue={{ name, url: queue.url }} close={() => setModal(undefined)} onDone={() => void queue.refetch()} />}
    </SqsLayout>
  )
}

type Mapping = { UUID?: string; FunctionArn?: string; State?: string; LastModified?: string; BatchSize?: number }

function LambdaTriggers({ arn }: { arn?: string }) {
  const mappings = useAws<{ EventSourceMappings?: Mapping[] }>("lambda", "ListEventSourceMappings", { EventSourceArn: arn }, { enabled: Boolean(arn) })
  const functions = useAws<{ Functions?: { FunctionName?: string; FunctionArn?: string }[] }>("lambda", "ListFunctions", {})
  const [open, setOpen] = useState(false)
  const [fn, setFn] = useState("")
  const [selected, setSelected] = useState<Mapping[]>([])
  return (
    <>
      <Table<Mapping>
        header={
          <Header
            variant="h2"
            counter={`(${mappings.data?.EventSourceMappings?.length ?? 0})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void mappings.refetch()} />
                <Button disabled={!selected[0]} onClick={async () => { await callAws("lambda", "DeleteEventSourceMapping", { UUID: selected[0].UUID }).then(() => { flash.success("Lambda trigger deleted."); setSelected([]); void mappings.refetch() }, (e) => flash.error(errorMessage(e))) }}>Delete</Button>
                <Button onClick={() => setOpen(true)}>Configure Lambda function trigger</Button>
              </SpaceBetween>
            }
          >
            Lambda triggers
          </Header>
        }
        items={mappings.data?.EventSourceMappings ?? []}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
        trackBy="UUID"
        columnDefinitions={[
          { id: "uuid", header: "UUID", cell: (m) => m.UUID },
          { id: "arn", header: "ARN", cell: (m) => m.FunctionArn },
          { id: "status", header: "Status", cell: (m) => (m.State === "Enabled" ? <StatusIndicator type="success">Enabled</StatusIndicator> : m.State) },
          { id: "modified", header: "Last modified", cell: (m) => consoleDate(m.LastModified) },
        ]}
        empty={<Box textAlign="center" color="inherit"><b>No Lambda triggers</b><Box variant="p" color="inherit">There are no Lambda triggers for this queue.</Box></Box>}
      />
      <EditModal visible={open} title="Configure Lambda function trigger" saveLabel="Save" saveDisabled={!fn} onDismiss={() => setOpen(false)} success="Lambda trigger created." onSave={async () => { await callAws("lambda", "CreateEventSourceMapping", { EventSourceArn: arn, FunctionName: fn }); await mappings.refetch() }}>
        <FormField label="Specify a Lambda function" description="The function must have permission to read messages from this queue.">
          <Select selectedOption={fn ? { value: fn, label: arnName(fn) } : null} placeholder="Choose a function" empty="No functions" onChange={({ detail }) => setFn(detail.selectedOption.value ?? "")} options={(functions.data?.Functions ?? []).map((f) => ({ value: f.FunctionArn ?? "", label: f.FunctionName ?? "" }))} />
        </FormField>
      </EditModal>
    </>
  )
}

function DeadLetter({ url, attributes }: { url?: string; attributes?: Attributes }) {
  const follow = useFollow()
  const sources = useAws<{ queueUrls?: string[] }>("sqs", "ListDeadLetterSourceQueues", { QueueUrl: url }, { enabled: Boolean(url) })
  const dlq = redrive(attributes)
  return (
    <SpaceBetween size="l">
      <Section title="Dead-letter queue" info columns={2} items={[{ label: "Queue ARN", value: dlq?.deadLetterTargetArn ?? "–" }, { label: "Maximum receives", value: dlq?.maxReceiveCount ? String(dlq.maxReceiveCount) : "–" }]} />
      <Table<string>
        header={<Header variant="h2" counter={`(${sources.data?.queueUrls?.length ?? 0})`} description="Source queues that use this queue as their dead-letter queue.">Source queues</Header>}
        items={sources.data?.queueUrls ?? []}
        columnDefinitions={[{ id: "url", header: "Queue", cell: (u) => <Link href={`/sqs/queues/${encodeURIComponent(u.split("/").pop() ?? "")}`} onFollow={follow}>{u.split("/").pop()}</Link> }, { id: "u", header: "URL", cell: (u) => u }]}
        empty={<Box textAlign="center" color="inherit">No source queues</Box>}
      />
    </SpaceBetween>
  )
}

function Tagging({ url }: { url?: string }) {
  const tags = useAws<{ Tags?: Record<string, string> }>("sqs", "ListQueueTags", { QueueUrl: url }, { enabled: Boolean(url) })
  const list = Object.entries(tags.data?.Tags ?? {}).map(([Key, Value]) => ({ Key, Value }))
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<Tag[]>([])
  return (
    <>
      <Table
        header={<Header variant="h2" counter={`(${list.length})`} actions={<Button onClick={() => { setEdit(list); setOpen(true) }}>Edit</Button>}>Tags</Header>}
        items={list}
        columnDefinitions={[{ id: "key", header: "Key", cell: (t) => t.Key }, { id: "value", header: "Value", cell: (t) => t.Value || "–" }]}
        empty={<Box textAlign="center" color="inherit"><b>No tags</b><Box variant="p" color="inherit">No tags associated with the queue.</Box></Box>}
      />
      <EditModal
        visible={open}
        size="large"
        title="Edit tags"
        onDismiss={() => setOpen(false)}
        success="Tags updated."
        onSave={async () => {
          const after = edit.filter((t) => t.Key)
          const removed = list.filter((t) => !after.some((x) => x.Key === t.Key)).map((t) => t.Key)
          if (removed.length) await callAws("sqs", "UntagQueue", { QueueUrl: url, TagKeys: removed })
          if (after.length) await callAws("sqs", "TagQueue", { QueueUrl: url, Tags: Object.fromEntries(after.map((t) => [t.Key, t.Value ?? ""])) })
          await tags.refetch()
        }}
      >
        <TagEditor tags={edit} onChange={setEdit} />
      </EditModal>
    </>
  )
}

type Task = { TaskHandle?: string; Status?: string; SourceArn?: string; DestinationArn?: string; ApproximateNumberOfMessagesMoved?: number; ApproximateNumberOfMessagesToMove?: number; StartedTimestamp?: number; FailureReason?: string }

function RedriveTasks({ arn }: { arn?: string }) {
  const tasks = useAws<{ Results?: Task[] }>("sqs", "ListMessageMoveTasks", { SourceArn: arn, MaxResults: 10 }, { enabled: Boolean(arn) })
  return (
    <Table<Task>
      header={<Header variant="h2" counter={`(${tasks.data?.Results?.length ?? 0})`} actions={<Button iconName="refresh" ariaLabel="Refresh" onClick={() => void tasks.refetch()} />}>Dead-letter queue redrive status</Header>}
      items={tasks.data?.Results ?? []}
      columnDefinitions={[
        { id: "status", header: "Status", cell: (t) => <StatusIndicator type={t.Status === "COMPLETED" ? "success" : t.Status === "FAILED" ? "error" : t.Status === "CANCELLED" ? "stopped" : "in-progress"}>{t.Status}</StatusIndicator> },
        { id: "dest", header: "Destination", cell: (t) => (t.DestinationArn ? arnName(t.DestinationArn) : "Source queues") },
        { id: "moved", header: "Messages moved", cell: (t) => `${t.ApproximateNumberOfMessagesMoved ?? 0} of ${t.ApproximateNumberOfMessagesToMove ?? "?"}` },
        { id: "started", header: "Started", cell: (t) => (t.StartedTimestamp ? new Date(t.StartedTimestamp).toLocaleString() : "–") },
        { id: "reason", header: "Failure reason", cell: (t) => t.FailureReason ?? "–" },
      ]}
      empty={<Box textAlign="center" color="inherit"><b>No redrive tasks</b><Box variant="p" color="inherit">This queue has no dead-letter queue redrive tasks.</Box></Box>}
    />
  )
}
