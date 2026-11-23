"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal } from "@/components/console/sections"
import { useFollow } from "@/components/shell/page-layout"
import { SqsLayout } from "@/components/sqs/sqs-app"
import { encryption, epoch, isFifo, useQueues, type Queue } from "@/components/sqs/shared"
import { callAws } from "@/lib/aws"

export function DeleteQueueModal({ queue, close, onDone }: { queue: { name: string; url: string }; close: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState("")
  return (
    <EditModal visible title="Delete queue" saveLabel="Delete" saveDisabled={confirm !== "confirm"} onDismiss={close} success={`Successfully deleted queue ${queue.name}.`} onSave={async () => { await callAws("sqs", "DeleteQueue", { QueueUrl: queue.url }); onDone() }}>
      <Alert type="warning">Deleting the queue <b>{queue.name}</b> deletes all of the messages in the queue. This action can&apos;t be undone.</Alert>
      <FormField label={<>To confirm deletion, enter <i>confirm</i> in the text input field.</>}><Input value={confirm} placeholder="confirm" onChange={({ detail }) => setConfirm(detail.value)} /></FormField>
    </EditModal>
  )
}

export function PurgeQueueModal({ queue, close, onDone }: { queue: { name: string; url: string }; close: () => void; onDone?: () => void }) {
  const [confirm, setConfirm] = useState("")
  return (
    <EditModal visible title="Purge queue" saveLabel="Purge" saveDisabled={confirm !== "purge"} onDismiss={close} success={`Successfully purged queue ${queue.name}.`} onSave={async () => { await callAws("sqs", "PurgeQueue", { QueueUrl: queue.url }); onDone?.() }}>
      <Box>Are you sure you want to purge all messages in <b>{queue.name}</b>? This action can&apos;t be undone and the deletion process can take up to 60 seconds.</Box>
      <FormField label={<>To confirm, enter <i>purge</i> in the text input field.</>}><Input value={confirm} placeholder="purge" onChange={({ detail }) => setConfirm(detail.value)} /></FormField>
    </EditModal>
  )
}

export function QueuesPage() {
  const router = useRouter()
  const follow = useFollow()
  const queues = useQueues()
  const [selected, setSelected] = useState<Queue[]>([])
  const [modal, setModal] = useState<string>()
  const current = selected[0]
  const href = (q: Queue, sub = "") => `/sqs/queues/${encodeURIComponent(q.name)}${sub}`
  return (
    <SqsLayout breadcrumbs={[{ text: "Queues", href: "/sqs/queues" }]} contentType="table">
      <SpaceBetween size="m">
        <Alert type="info" header="SQS fair queues is now available for standard queues.">Automatically manage noisy neighbors in your queues with fair queues, a new feature that limits noisy neighbor impact across all message groups.</Alert>
        <ResourceTable<Queue>
          title="Queues"
          items={queues.data ?? []}
          loading={queues.isPending}
          loadingText="Loading queues"
          error={queues.error}
          selectionType="single"
          selectedItems={selected}
          onSelectionChange={setSelected}
          trackBy="url"
          filterPlaceholder="Search queues by prefix"
          columns={[
            { id: "name", header: "Name", value: (q) => q.name, cell: (q) => <Link href={href(q)} onFollow={follow}>{q.name}</Link> },
            { id: "type", header: "Type", value: (q) => (isFifo(q.name) ? "FIFO" : "Standard"), cell: (q) => (isFifo(q.name) ? "FIFO" : "Standard") },
            { id: "created", header: "Created", value: (q) => Number(q.attributes.CreatedTimestamp ?? 0), cell: (q) => epoch(q.attributes.CreatedTimestamp) },
            { id: "available", header: "Messages available", value: (q) => Number(q.attributes.ApproximateNumberOfMessages ?? 0), cell: (q) => q.attributes.ApproximateNumberOfMessages ?? "0" },
            { id: "flight", header: "Messages in flight", value: (q) => Number(q.attributes.ApproximateNumberOfMessagesNotVisible ?? 0), cell: (q) => q.attributes.ApproximateNumberOfMessagesNotVisible ?? "0" },
            { id: "encryption", header: "Encryption", value: (q) => encryption(q.attributes), cell: (q) => encryption(q.attributes) },
            { id: "dedup", header: "Content-based deduplication", value: (q) => q.attributes.ContentBasedDeduplication, cell: (q) => (isFifo(q.name) ? (q.attributes.ContentBasedDeduplication === "true" ? "Enabled" : "Disabled") : "–") },
          ]}
          empty={<EmptyState title="No queues" subtitle="No queues available." action={<Button href="/sqs/create-queue" onFollow={follow}>Create queue</Button>} />}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Refresh" loading={queues.isFetching} onClick={() => void queues.refetch()} />
              <Button disabled={!current} onClick={() => current && router.push(href(current, "/edit"))}>Edit</Button>
              <Button disabled={!current} onClick={() => setModal("delete")}>Delete</Button>
              <Button disabled={!current} onClick={() => current && router.push(href(current, "/send-receive"))}>Send and receive messages</Button>
              <ButtonDropdown
                disabled={!current}
                items={[
                  { id: "view", text: "View/Delete messages" },
                  { id: "purge", text: "Purge" },
                  { id: "redrive", text: "Start DLQ redrive" },
                  { id: "sns", text: "Subscribe to Amazon SNS topic" },
                  { id: "lambda", text: "Configure Lambda function trigger" },
                  { id: "pipe", text: "Create EventBridge Pipe", disabled: true, disabledReason: "EventBridge Pipes are not available in the local emulator." },
                ]}
                onItemClick={({ detail }) => {
                  if (!current) return
                  if (detail.id === "view") router.push(href(current, "/send-receive"))
                  if (detail.id === "purge") setModal("purge")
                  if (detail.id === "redrive") router.push(href(current, "/redrive"))
                  if (detail.id === "sns") router.push(href(current, "?tab=sns"))
                  if (detail.id === "lambda") router.push(href(current, "?tab=lambda"))
                }}
              >
                Actions
              </ButtonDropdown>
              <Button variant="primary" href="/sqs/create-queue" onFollow={follow}>Create queue</Button>
            </SpaceBetween>
          }
        />
      </SpaceBetween>
      {modal === "delete" && current && <DeleteQueueModal queue={current} close={() => setModal(undefined)} onDone={() => { setSelected([]); void queues.refetch() }} />}
      {modal === "purge" && current && <PurgeQueueModal queue={current} close={() => setModal(undefined)} onDone={() => void queues.refetch()} />}
    </SqsLayout>
  )
}
