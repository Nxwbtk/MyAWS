"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Modal from "@cloudscape-design/components/modal"
import ProgressBar from "@cloudscape-design/components/progress-bar"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import TextFilter from "@cloudscape-design/components/text-filter"
import { useRef, useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { CodeView, EditModal, pretty } from "@/components/console/sections"
import { useFollow } from "@/components/shell/page-layout"
import { PurgeQueueModal } from "@/components/sqs/queues"
import { SqsLayout } from "@/components/sqs/sqs-app"
import { isFifo, useQueue } from "@/components/sqs/shared"
import { callAws } from "@/lib/aws"

type MessageAttribute = { DataType?: string; StringValue?: string; BinaryValue?: string }
type Message = { MessageId?: string; ReceiptHandle?: string; Body?: string; MD5OfBody?: string; Attributes?: Record<string, string>; MessageAttributes?: Record<string, MessageAttribute> }
type AttrRow = { name: string; type: string; value: string }

export function MessagesPage({ name }: { name: string }) {
  const follow = useFollow()
  const queue = useQueue(name)
  const fifo = isFifo(name)
  const base = `/sqs/queues/${encodeURIComponent(name)}`
  const [body, setBody] = useState("")
  const [delay, setDelay] = useState("0")
  const [group, setGroup] = useState("")
  const [dedup, setDedup] = useState("")
  const [attrs, setAttrs] = useState<AttrRow[]>([])
  const [sending, setSending] = useState(false)
  const [duration, setDuration] = useState(20)
  const [maxCount, setMaxCount] = useState(10)
  const [pollSettings, setPollSettings] = useState(false)
  const [draft, setDraft] = useState({ duration: "20", max: "10" })
  const [polling, setPolling] = useState(false)
  const [progress, setProgress] = useState(0)
  const [messages, setMessages] = useState<Message[]>([])
  const [selected, setSelected] = useState<Message[]>([])
  const [details, setDetails] = useState<Message>()
  const [filter, setFilter] = useState("")
  const [modal, setModal] = useState<string>()
  const stop = useRef(false)

  const send = async () => {
    setSending(true)
    try {
      const messageAttributes = Object.fromEntries(attrs.filter((a) => a.name).map((a) => [a.name, { DataType: a.type, StringValue: a.value }]))
      await callAws("sqs", "SendMessage", {
        QueueUrl: queue.url,
        MessageBody: body,
        ...(fifo ? { MessageGroupId: group, ...(dedup ? { MessageDeduplicationId: dedup } : {}) } : { DelaySeconds: Number(delay) }),
        ...(Object.keys(messageAttributes).length ? { MessageAttributes: messageAttributes } : {}),
      })
      flash.success(`Your message has been sent and is ready to be received.`)
      void queue.refetch()
    } catch (error) {
      flash.error(errorMessage(error))
    } finally {
      setSending(false)
    }
  }

  const poll = async () => {
    stop.current = false
    setPolling(true)
    setProgress(0)
    const started = Date.now()
    const received: Message[] = []
    try {
      while (!stop.current && received.length < maxCount && Date.now() - started < duration * 1000) {
        const remaining = Math.max(0, duration - Math.floor((Date.now() - started) / 1000))
        const result = await callAws<{ Messages?: Message[] }>("sqs", "ReceiveMessage", {
          QueueUrl: queue.url,
          MaxNumberOfMessages: Math.min(10, maxCount - received.length),
          WaitTimeSeconds: Math.min(2, remaining),
          MessageSystemAttributeNames: ["All"],
          MessageAttributeNames: ["All"],
        })
        received.push(...(result.Messages ?? []))
        setMessages([...received])
        setProgress(Math.min(100, Math.round(((Date.now() - started) / (duration * 1000)) * 100)))
      }
    } catch (error) {
      flash.error(errorMessage(error))
    } finally {
      setPolling(false)
      setProgress(100)
      void queue.refetch()
    }
  }

  const deleteSelected = async () => {
    const entries = selected.map((m, i) => ({ Id: String(i), ReceiptHandle: m.ReceiptHandle }))
    const result = await callAws<{ Failed?: { Id?: string; Message?: string }[] }>("sqs", "DeleteMessageBatch", { QueueUrl: queue.url, Entries: entries })
    if (result.Failed?.length) throw new Error(result.Failed.map((f) => f.Message).join("; "))
    const ids = new Set(selected.map((m) => m.MessageId))
    setMessages(messages.filter((m) => !ids.has(m.MessageId)))
    setSelected([])
    void queue.refetch()
  }

  const visible = messages.filter((m) => !filter || m.MessageId?.includes(filter) || m.Body?.includes(filter))
  return (
    <SqsLayout breadcrumbs={[{ text: "Queues", href: "/sqs/queues" }, { text: name, href: base }, { text: "Send and receive messages", href: "#" }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            description={`Send messages to and receive messages from a queue.`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={() => setModal("purge")}>Purge</Button>
                <Button href={base} onFollow={follow}>View queue details</Button>
              </SpaceBetween>
            }
          >
            Send and receive messages
          </Header>
        }
      >
        <SpaceBetween size="l">
          <Container
            header={
              <Header
                variant="h2"
                description={`Send a message to ${name}.`}
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button onClick={() => { setBody(""); setAttrs([]); setGroup(""); setDedup("") }}>Clear content</Button>
                    <Button variant="primary" loading={sending} disabled={!body || !queue.url || (fifo && !group)} onClick={() => void send()}>Send message</Button>
                  </SpaceBetween>
                }
              >
                Send message
              </Header>
            }
          >
            <SpaceBetween size="l">
              <FormField label="Message body" description="Enter the message to send to the queue." stretch>
                <Textarea value={body} rows={6} placeholder="Enter message" onChange={({ detail }) => setBody(detail.value)} />
              </FormField>
              {fifo ? (
                <>
                  <FormField label="Message group ID" description="The tag that specifies that a message belongs to a specific message group." constraintText="Required. Up to 128 characters."><Input value={group} onChange={({ detail }) => setGroup(detail.value)} /></FormField>
                  <FormField label="Message deduplication ID - optional" description="The token used for deduplication of sent messages. Required unless content-based deduplication is turned on."><Input value={dedup} onChange={({ detail }) => setDedup(detail.value)} /></FormField>
                </>
              ) : (
                <FormField label="Delivery delay" constraintText="Should be between 0 and 900 seconds."><Input type="number" value={delay} onChange={({ detail }) => setDelay(detail.value)} /></FormField>
              )}
              <FormField label="Message attributes - optional" description="Use structured metadata (such as timestamps, geospatial data, signatures, and identifiers) with messages." stretch>
                <SpaceBetween size="xs">
                  {attrs.map((row, i) => (
                    <SpaceBetween key={i} direction="horizontal" size="xs">
                      <Input value={row.name} placeholder="Name" onChange={({ detail }) => setAttrs(attrs.map((r, j) => (j === i ? { ...r, name: detail.value } : r)))} />
                      <Select selectedOption={{ value: row.type, label: row.type }} onChange={({ detail }) => setAttrs(attrs.map((r, j) => (j === i ? { ...r, type: detail.selectedOption.value ?? "String" } : r)))} options={["String", "Number"].map((t) => ({ value: t, label: t }))} />
                      <Input value={row.value} placeholder="Value" onChange={({ detail }) => setAttrs(attrs.map((r, j) => (j === i ? { ...r, value: detail.value } : r)))} />
                      <Button onClick={() => setAttrs(attrs.filter((_, j) => j !== i))}>Remove</Button>
                    </SpaceBetween>
                  ))}
                  <Button disabled={attrs.length >= 10} onClick={() => setAttrs([...attrs, { name: "", type: "String", value: "" }])}>Add new attribute</Button>
                </SpaceBetween>
              </FormField>
            </SpaceBetween>
          </Container>
          <Container
            header={
              <Header
                variant="h2"
                description="Receive and delete messages from the queue."
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button disabled={polling} onClick={() => { setDraft({ duration: String(duration), max: String(maxCount) }); setPollSettings(true) }}>Edit poll settings</Button>
                    <Button disabled={!polling} onClick={() => { stop.current = true }}>Stop polling</Button>
                    <Button variant="primary" loading={polling} disabled={!queue.url} onClick={() => void poll()}>Poll for messages</Button>
                  </SpaceBetween>
                }
              >
                Receive messages
              </Header>
            }
          >
            <SpaceBetween size="m">
              <KeyValuePairs
                columns={4}
                items={[
                  { label: "Messages available", value: queue.attributes?.ApproximateNumberOfMessages ?? "0" },
                  { label: "Polling duration", value: String(duration) },
                  { label: "Maximum message count", value: String(maxCount) },
                  { label: "Polling progress", value: <ProgressBar value={progress} additionalInfo={polling ? `Receiving messages… ${messages.length} received` : undefined} /> },
                ]}
              />
            </SpaceBetween>
          </Container>
          <Table<Message>
            header={
              <Header
                variant="h2"
                counter={`(${messages.length})`}
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button disabled={selected.length !== 1} onClick={() => setDetails(selected[0])}>View details</Button>
                    <Button disabled={selected.length === 0} onClick={() => setModal("delete")}>Delete</Button>
                  </SpaceBetween>
                }
              >
                Messages
              </Header>
            }
            items={visible}
            selectionType="multi"
            selectedItems={selected}
            onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
            trackBy={(m) => m.ReceiptHandle ?? m.MessageId ?? ""}
            filter={<TextFilter filteringText={filter} filteringPlaceholder="Search messages" onChange={({ detail }) => setFilter(detail.filteringText)} />}
            columnDefinitions={[
              { id: "id", header: "ID", cell: (m) => <Button variant="inline-link" onClick={() => setDetails(m)}>{m.MessageId}</Button> },
              { id: "sent", header: "Sent", cell: (m) => (m.Attributes?.SentTimestamp ? new Date(Number(m.Attributes.SentTimestamp)).toLocaleString() : "–") },
              { id: "size", header: "Size", cell: (m) => `${new Blob([m.Body ?? ""]).size} bytes` },
              { id: "count", header: "Receive count", cell: (m) => m.Attributes?.ApproximateReceiveCount ?? "1" },
            ]}
            empty={<Box textAlign="center" color="inherit"><b>No messages</b><Box variant="p" color="inherit">To view messages, poll for messages.</Box></Box>}
          />
        </SpaceBetween>
      </ContentLayout>
      <EditModal
        visible={pollSettings}
        title="Edit poll settings"
        onDismiss={() => setPollSettings(false)}
        onSave={async () => { setDuration(Math.max(1, Number(draft.duration))); setMaxCount(Math.max(1, Number(draft.max))) }}
      >
        <FormField label="Polling duration" constraintText="Should be between 1 and 60 seconds."><Input type="number" value={draft.duration} onChange={({ detail }) => setDraft({ ...draft, duration: detail.value })} /></FormField>
        <FormField label="Maximum message count" constraintText="Should be between 1 and 100."><Input type="number" value={draft.max} onChange={({ detail }) => setDraft({ ...draft, max: detail.value })} /></FormField>
      </EditModal>
      <EditModal visible={modal === "delete"} title="Delete messages" saveLabel="Delete" onDismiss={() => setModal(undefined)} success={`${selected.length} message${selected.length === 1 ? " was" : "s were"} deleted.`} onSave={deleteSelected}>
        <Box>Delete {selected.length} message{selected.length === 1 ? "" : "s"}? Deleted messages can&apos;t be recovered.</Box>
      </EditModal>
      {modal === "purge" && queue.url && <PurgeQueueModal queue={{ name, url: queue.url }} close={() => setModal(undefined)} onDone={() => { setMessages([]); void queue.refetch() }} />}
      <Modal visible={Boolean(details)} size="large" header={`Message: ${details?.MessageId ?? ""}`} onDismiss={() => setDetails(undefined)} footer={<Box float="right"><Button variant="primary" onClick={() => setDetails(undefined)}>Done</Button></Box>}>
        <Tabs
          tabs={[
            { id: "body", label: "Body", content: <CodeView value={pretty(details?.Body) || details?.Body} /> },
            { id: "attributes", label: "Attributes", content: <KeyValuePairs columns={2} items={Object.entries(details?.Attributes ?? {}).map(([label, value]) => ({ label, value: /Timestamp$/.test(label) ? new Date(Number(value)).toLocaleString() : value })).concat([{ label: "MD5 of message body", value: details?.MD5OfBody ?? "–" }])} /> },
            {
              id: "message-attributes",
              label: "Message attributes",
              content: (
                <Table
                  variant="embedded"
                  items={Object.entries(details?.MessageAttributes ?? {}).map(([n, v]) => ({ n, ...v }))}
                  columnDefinitions={[{ id: "n", header: "Name", cell: (r) => r.n }, { id: "t", header: "Type", cell: (r) => r.DataType }, { id: "v", header: "Value", cell: (r) => r.StringValue ?? r.BinaryValue }]}
                  empty={<Box textAlign="center">No message attributes</Box>}
                />
              ),
            },
          ]}
        />
      </Modal>
    </SqsLayout>
  )
}
