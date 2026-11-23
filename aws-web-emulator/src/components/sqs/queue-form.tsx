"use client"

import Alert from "@cloudscape-design/components/alert"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Grid from "@cloudscape-design/components/grid"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Tiles from "@cloudscape-design/components/tiles"
import Textarea from "@cloudscape-design/components/textarea"
import Toggle from "@cloudscape-design/components/toggle"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { CodeView, JsonField } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { useCallerIdentity } from "@/components/shell/top-nav"
import { SqsLayout } from "@/components/sqs/sqs-app"
import { isFifo, redrive, useQueue, useQueues } from "@/components/sqs/shared"
import { callAws } from "@/lib/aws"

type Unit = { value: string; label: string; factor: number }
const units: Record<string, Unit> = {
  s: { value: "s", label: "Seconds", factor: 1 },
  m: { value: "m", label: "Minutes", factor: 60 },
  h: { value: "h", label: "Hours", factor: 3600 },
  d: { value: "d", label: "Days", factor: 86400 },
}

function split(total: number, allowed: string[]): [string, string] {
  for (const key of [...allowed].reverse()) {
    const f = units[key].factor
    if (total >= f && total % f === 0) return [String(total / f), key]
  }
  return [String(total), allowed[0]]
}

function Duration({ label, info, constraint, value, unit, allowed, onChange }: { label: string; info?: boolean; constraint: string; value: string; unit: string; allowed: string[]; onChange: (value: string, unit: string) => void }) {
  return (
    <FormField label={label} info={info ? <Link variant="info">Info</Link> : undefined} constraintText={constraint}>
      <Grid gridDefinition={[{ colspan: 7 }, { colspan: 5 }]}>
        <Input type="number" value={value} onChange={({ detail }) => onChange(detail.value, unit)} />
        <Select selectedOption={units[unit]} onChange={({ detail }) => onChange(value, detail.selectedOption.value ?? unit)} options={allowed.map((u) => units[u])} />
      </Grid>
    </FormField>
  )
}

type Principals = { mode: "owner" | "specified"; ids: string }

export function QueueFormPage({ editName }: { editName?: string }) {
  const router = useRouter()
  const follow = useFollow()
  const { account } = useCallerIdentity()
  const existing = useQueue(editName ?? "")
  const queues = useQueues()
  const editing = Boolean(editName)
  const [type, setType] = useState("standard")
  const [name, setName] = useState("")
  const [visibility, setVisibility] = useState<[string, string]>(["30", "s"])
  const [retention, setRetention] = useState<[string, string]>(["4", "d"])
  const [delay, setDelay] = useState<[string, string]>(["0", "s"])
  const [maxSize, setMaxSize] = useState("1024")
  const [wait, setWait] = useState("0")
  const [sse, setSse] = useState(true)
  const [keyType, setKeyType] = useState("sqs")
  const [kmsKey, setKmsKey] = useState("alias/aws/sqs")
  const [reuse, setReuse] = useState("300")
  const [policyMode, setPolicyMode] = useState("basic")
  const [senders, setSenders] = useState<Principals>({ mode: "owner", ids: "" })
  const [receivers, setReceivers] = useState<Principals>({ mode: "owner", ids: "" })
  const [advanced, setAdvanced] = useState("")
  const [allowEnabled, setAllowEnabled] = useState(false)
  const [allowMode, setAllowMode] = useState("allowAll")
  const [allowArns, setAllowArns] = useState("")
  const [dlqEnabled, setDlqEnabled] = useState(false)
  const [dlqArn, setDlqArn] = useState("")
  const [maxReceives, setMaxReceives] = useState("10")
  const [dedup, setDedup] = useState(false)
  const [highThroughput, setHighThroughput] = useState(false)
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [loaded, setLoaded] = useState(false)

  const fullName = type === "fifo" && name && !name.endsWith(".fifo") ? `${name}.fifo` : name
  const arn = `arn:aws:sqs:ap-southeast-7:${account ?? "000000000000"}:${editName ?? fullName}`
  const principals = (p: Principals) => (p.mode === "owner" ? account ?? "000000000000" : p.ids.split(/[\s,]+/).filter(Boolean))
  const basicPolicy = useMemo(
    () =>
      JSON.stringify(
        {
          Version: "2012-10-17",
          Id: "__default_policy_ID",
          Statement: [
            { Sid: "__owner_statement", Effect: "Allow", Principal: { AWS: account ?? "000000000000" }, Action: ["SQS:*"], Resource: arn },
            ...(senders.mode === "specified" ? [{ Sid: "__sender_statement", Effect: "Allow", Principal: { AWS: principals(senders) }, Action: ["SQS:SendMessage"], Resource: arn }] : []),
            ...(receivers.mode === "specified" ? [{ Sid: "__receiver_statement", Effect: "Allow", Principal: { AWS: principals(receivers) }, Action: ["SQS:ChangeMessageVisibility", "SQS:DeleteMessage", "SQS:ReceiveMessage"], Resource: arn }] : []),
          ],
        },
        null,
        2,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account, arn, senders, receivers],
  )

  useEffect(() => {
    const a = existing.attributes
    if (!editing || !a || loaded) return
    // Fill the form from the queue's current attributes once they load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(true)
    setType(isFifo(editName ?? "") ? "fifo" : "standard")
    setName(editName ?? "")
    setVisibility(split(Number(a.VisibilityTimeout ?? 30), ["s", "m", "h"]))
    setRetention(split(Number(a.MessageRetentionPeriod ?? 345600), ["m", "h", "d"]))
    setDelay(split(Number(a.DelaySeconds ?? 0), ["s", "m"]))
    setMaxSize(String(Math.round(Number(a.MaximumMessageSize ?? 1048576) / 1024)))
    setWait(a.ReceiveMessageWaitTimeSeconds ?? "0")
    setSse(Boolean(a.KmsMasterKeyId) || a.SqsManagedSseEnabled === "true")
    setKeyType(a.KmsMasterKeyId ? "kms" : "sqs")
    if (a.KmsMasterKeyId) setKmsKey(a.KmsMasterKeyId)
    if (a.KmsDataKeyReusePeriodSeconds) setReuse(a.KmsDataKeyReusePeriodSeconds)
    if (a.Policy) {
      setPolicyMode("advanced")
      setAdvanced(JSON.stringify(JSON.parse(a.Policy), null, 2))
    }
    const rp = redrive(a)
    if (rp?.deadLetterTargetArn) {
      setDlqEnabled(true)
      setDlqArn(rp.deadLetterTargetArn)
      setMaxReceives(String(rp.maxReceiveCount ?? 10))
    }
    if (a.RedriveAllowPolicy) {
      try {
        const allow = JSON.parse(a.RedriveAllowPolicy)
        setAllowEnabled(true)
        setAllowMode(allow.redrivePermission ?? "allowAll")
        setAllowArns((allow.sourceQueueArns ?? []).join("\n"))
      } catch {
        // Ignore malformed redrive allow policies.
      }
    }
    setDedup(a.ContentBasedDeduplication === "true")
    setHighThroughput(a.DeduplicationScope === "messageGroup" && a.FifoThroughputLimit === "perMessageGroupId")
  }, [existing.attributes, editing, editName, loaded])

  const toSeconds = ([value, unit]: [string, string]) => String(Number(value) * units[unit].factor)

  const submit = async () => {
    setSaving(true)
    setError(undefined)
    try {
      const attributes: Record<string, string> = {
        VisibilityTimeout: toSeconds(visibility),
        MessageRetentionPeriod: toSeconds(retention),
        DelaySeconds: toSeconds(delay),
        MaximumMessageSize: String(Number(maxSize) * 1024),
        ReceiveMessageWaitTimeSeconds: wait,
        Policy: policyMode === "basic" ? basicPolicy : JSON.stringify(JSON.parse(advanced)),
        RedrivePolicy: dlqEnabled ? JSON.stringify({ deadLetterTargetArn: dlqArn, maxReceiveCount: Number(maxReceives) }) : "",
        RedriveAllowPolicy: allowEnabled ? JSON.stringify({ redrivePermission: allowMode, ...(allowMode === "byQueue" ? { sourceQueueArns: allowArns.split(/\s+/).filter(Boolean) } : {}) }) : "",
      }
      if (sse && keyType === "kms") {
        attributes.KmsMasterKeyId = kmsKey
        attributes.KmsDataKeyReusePeriodSeconds = reuse
        attributes.SqsManagedSseEnabled = "false"
      } else {
        attributes.SqsManagedSseEnabled = String(sse)
        if (editing && existing.attributes?.KmsMasterKeyId) attributes.KmsMasterKeyId = ""
      }
      if (type === "fifo") {
        attributes.ContentBasedDeduplication = String(dedup)
        attributes.DeduplicationScope = highThroughput ? "messageGroup" : "queue"
        attributes.FifoThroughputLimit = highThroughput ? "perMessageGroupId" : "perQueue"
      }
      if (editing) {
        if (!attributes.RedrivePolicy) delete attributes.RedrivePolicy
        if (!attributes.RedriveAllowPolicy) delete attributes.RedriveAllowPolicy
        await callAws("sqs", "SetQueueAttributes", { QueueUrl: existing.url, Attributes: attributes })
        flash.success(`Queue ${editName} updated successfully.`)
        router.push(`/sqs/queues/${encodeURIComponent(editName ?? "")}`)
      } else {
        if (type === "fifo") attributes.FifoQueue = "true"
        if (!attributes.RedrivePolicy) delete attributes.RedrivePolicy
        if (!attributes.RedriveAllowPolicy) delete attributes.RedriveAllowPolicy
        const validTags = tags.filter((t) => t.Key)
        await callAws("sqs", "CreateQueue", { QueueName: fullName, Attributes: attributes, ...(validTags.length ? { tags: Object.fromEntries(validTags.map((t) => [t.Key, t.Value ?? ""])) } : {}) })
        flash.success(`Queue ${fullName} created successfully.`)
        router.push(`/sqs/queues/${encodeURIComponent(fullName)}`)
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const dlqOptions = (queues.data ?? []).filter((q) => q.name !== (editName ?? fullName) && isFifo(q.name) === (type === "fifo")).map((q) => ({ value: q.attributes.QueueArn ?? "", label: q.name, description: q.attributes.QueueArn }))
  const title = editing ? `Edit ${editName}` : "Create queue"
  const principalField = (label: string, value: Principals, set: (p: Principals) => void, verb: string) => (
    <FormField label={label}>
      <SpaceBetween size="xs">
        <RadioGroup
          value={value.mode}
          onChange={({ detail }) => set({ ...value, mode: detail.value as Principals["mode"] })}
          items={[
            { value: "owner", label: "Only the queue owner", description: `Only the owner of the queue can ${verb} messages ${verb === "send" ? "to" : "from"} the queue.` },
            { value: "specified", label: "Only the specified AWS accounts, IAM users and roles", description: `Only the specified AWS account IDs, IAM users and roles can ${verb} messages ${verb === "send" ? "to" : "from"} the queue.` },
          ]}
        />
        {value.mode === "specified" && <Input value={value.ids} placeholder="Enter AWS account IDs or IAM ARNs, separated by commas" onChange={({ detail }) => set({ ...value, ids: detail.value })} />}
      </SpaceBetween>
    </FormField>
  )

  return (
    <SqsLayout breadcrumbs={editing ? [{ text: "Queues", href: "/sqs/queues" }, { text: editName ?? "", href: `/sqs/queues/${encodeURIComponent(editName ?? "")}` }, { text: "Edit", href: "#" }] : [{ text: "Queues", href: "/sqs/queues" }, { text: "Create queue", href: "/sqs/create-queue" }]} contentType="form">
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Form
          errorText={error}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" href={editing ? `/sqs/queues/${encodeURIComponent(editName ?? "")}` : "/sqs/queues"} onFollow={follow}>Cancel</Button>
              <Button variant="primary" loading={saving} disabled={!name} onClick={() => void submit()}>{editing ? "Save" : "Create queue"}</Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Details</Header>}>
              <SpaceBetween size="l">
                <FormField label="Type" description="Choose the queue type for your application or cloud infrastructure." constraintText="You can't change the queue type after you create a queue.">
                  <Tiles
                    value={type}
                    onChange={({ detail }) => setType(detail.value)}
                    items={[
                      { value: "standard", label: "Standard", description: "At-least-once delivery, message ordering isn't preserved. At-least once delivery · Best-effort ordering", disabled: editing },
                      { value: "fifo", label: "FIFO", description: "First-in-first-out delivery, message ordering is preserved. First-in-first-out delivery · Exactly-once processing", disabled: editing },
                    ]}
                  />
                </FormField>
                <FormField label="Name" constraintText={`A queue name is case-sensitive and can have up to 80 characters. You can use alphanumeric characters, hyphens (-), and underscores ( _ ).${type === "fifo" ? " A FIFO queue name must end with the .fifo suffix." : ""}`}>
                  <Input value={name} disabled={editing} placeholder={type === "fifo" ? "MyQueue.fifo" : "MyQueue"} onChange={({ detail }) => setName(detail.value)} />
                </FormField>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>} description="Set the maximum message size, visibility to other consumers, and message retention.">Configuration</Header>}>
              <Grid gridDefinition={[{ colspan: { default: 12, s: 6 } }, { colspan: { default: 12, s: 6 } }, { colspan: { default: 12, s: 6 } }, { colspan: { default: 12, s: 6 } }, { colspan: { default: 12, s: 6 } }]}>
                <Duration label="Visibility timeout" info constraint="Should be between 0 seconds and 12 hours." value={visibility[0]} unit={visibility[1]} allowed={["s", "m", "h"]} onChange={(v, u) => setVisibility([v, u])} />
                <Duration label="Message retention period" info constraint="Should be between 1 minute and 14 days." value={retention[0]} unit={retention[1]} allowed={["m", "h", "d"]} onChange={(v, u) => setRetention([v, u])} />
                <Duration label="Delivery delay" info constraint="Should be between 0 seconds and 15 minutes." value={delay[0]} unit={delay[1]} allowed={["s", "m"]} onChange={(v, u) => setDelay([v, u])} />
                <FormField label="Maximum message size" info={<Link variant="info">Info</Link>} constraintText="Should be between 1 KiB and 1024 KiB."><Input type="number" value={maxSize} onChange={({ detail }) => setMaxSize(detail.value)} /></FormField>
                <FormField label="Receive message wait time" info={<Link variant="info">Info</Link>} constraintText="Should be between 0 and 20 seconds."><Input type="number" value={wait} onChange={({ detail }) => setWait(detail.value)} /></FormField>
              </Grid>
              {type === "fifo" && (
                <SpaceBetween size="m">
                  <Toggle checked={dedup} onChange={({ detail }) => setDedup(detail.checked)}>Content-based deduplication</Toggle>
                  <Toggle checked={highThroughput} onChange={({ detail }) => setHighThroughput(detail.checked)}>Enable high throughput FIFO</Toggle>
                </SpaceBetween>
              )}
            </Container>
            <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>} description="Amazon SQS provides in-transit encryption by default. To add at-rest encryption to your queue, enable server-side encryption.">Encryption</Header>}>
              <SpaceBetween size="l">
                <FormField label="Server-side encryption"><RadioGroup value={sse ? "on" : "off"} onChange={({ detail }) => setSse(detail.value === "on")} items={[{ value: "off", label: "Disabled" }, { value: "on", label: "Enabled" }]} /></FormField>
                {sse && (
                  <FormField label="Encryption key type">
                    <RadioGroup
                      value={keyType}
                      onChange={({ detail }) => setKeyType(detail.value)}
                      items={[
                        { value: "sqs", label: "Amazon SQS key (SSE-SQS)", description: "An encryption key that Amazon SQS creates, manages, and uses for you." },
                        { value: "kms", label: "AWS Key Management Service key (SSE-KMS)", description: "An encryption key protected by AWS Key Management Service (AWS KMS)." },
                      ]}
                    />
                  </FormField>
                )}
                {sse && keyType === "kms" && (
                  <SpaceBetween size="m">
                    <FormField label="Customer master key"><Input value={kmsKey} onChange={({ detail }) => setKmsKey(detail.value)} /></FormField>
                    <FormField label="Data key reuse period" constraintText="Should be between 1 minute and 24 hours (in seconds)."><Input type="number" value={reuse} onChange={({ detail }) => setReuse(detail.value)} /></FormField>
                  </SpaceBetween>
                )}
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>} description="Define who can access your queue.">Access policy</Header>}>
              <SpaceBetween size="l">
                <FormField label="Choose method">
                  <Tiles
                    value={policyMode}
                    onChange={({ detail }) => { if (detail.value === "advanced" && !advanced) setAdvanced(basicPolicy); setPolicyMode(detail.value) }}
                    items={[
                      { value: "basic", label: "Basic", description: "Use simple criteria to define a basic access policy." },
                      { value: "advanced", label: "Advanced", description: "Use a JSON object to define an advanced access policy." },
                    ]}
                  />
                </FormField>
                {policyMode === "basic" ? (
                  <>
                    {principalField("Define who can send messages to the queue", senders, setSenders, "send")}
                    {principalField("Define who can receive messages from the queue", receivers, setReceivers, "receive")}
                    <FormField label="JSON (read-only)" stretch><CodeView value={basicPolicy} /></FormField>
                  </>
                ) : (
                  <JsonField value={advanced} onChange={setAdvanced} rows={18} />
                )}
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>} description="Identify which source queues can use this queue as the dead-letter queue.">Redrive allow policy - <i>Optional</i></Header>}>
              <SpaceBetween size="l">
                <FormField label="Select which source queues can use this queue as the dead-letter queue."><RadioGroup value={allowEnabled ? "on" : "off"} onChange={({ detail }) => setAllowEnabled(detail.value === "on")} items={[{ value: "off", label: "Disabled" }, { value: "on", label: "Enabled" }]} /></FormField>
                {allowEnabled && (
                  <RadioGroup
                    value={allowMode}
                    onChange={({ detail }) => setAllowMode(detail.value)}
                    items={[
                      { value: "allowAll", label: "Allow all", description: "Allow all source queues to use this queue as the dead-letter queue." },
                      { value: "byQueue", label: "By queue", description: "Allow up to 10 specified source queues." },
                      { value: "denyAll", label: "Deny all", description: "No source queues can use this queue as the dead-letter queue." },
                    ]}
                  />
                )}
                {allowEnabled && allowMode === "byQueue" && <FormField label="Source queue ARNs" constraintText="One ARN per line."><Textarea value={allowArns} onChange={({ detail }) => setAllowArns(detail.value)} /></FormField>}
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>} description="Send undeliverable messages to a dead-letter queue.">Dead-letter queue - <i>Optional</i></Header>}>
              <SpaceBetween size="l">
                <FormField label="Set this queue to receive undeliverable messages."><RadioGroup value={dlqEnabled ? "on" : "off"} onChange={({ detail }) => setDlqEnabled(detail.value === "on")} items={[{ value: "off", label: "Disabled" }, { value: "on", label: "Enabled" }]} /></FormField>
                {dlqEnabled && (
                  <>
                    <FormField label="Choose queue" description={`The dead-letter queue must be the same type as the source queue (${type === "fifo" ? "FIFO" : "Standard"}).`}>
                      <Select selectedOption={dlqOptions.find((o) => o.value === dlqArn) ?? (dlqArn ? { value: dlqArn, label: dlqArn } : null)} placeholder="Choose a queue" empty="No queues of the same type" onChange={({ detail }) => setDlqArn(detail.selectedOption.value ?? "")} options={dlqOptions} />
                    </FormField>
                    <FormField label="Maximum receives" constraintText="Should be between 1 and 1000."><Input type="number" value={maxReceives} onChange={({ detail }) => setMaxReceives(detail.value)} /></FormField>
                  </>
                )}
              </SpaceBetween>
            </Container>
            {!editing && (
              <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>} description="A tag is a label assigned to an AWS resource. Use tags to search and filter your resources or track your AWS costs.">Tags - <i>Optional</i></Header>}>
                <TagEditor tags={tags} onChange={setTags} />
              </Container>
            )}
            {editing && existing.error && <Alert type="error">{errorMessage(existing.error)}</Alert>}
          </SpaceBetween>
        </Form>
      </ContentLayout>
    </SqsLayout>
  )
}
