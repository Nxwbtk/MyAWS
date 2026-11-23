"use client"

import Alert from "@cloudscape-design/components/alert"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Tiles from "@cloudscape-design/components/tiles"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { useFollow } from "@/components/shell/page-layout"
import { SqsLayout } from "@/components/sqs/sqs-app"
import { useQueue, useQueues } from "@/components/sqs/shared"
import { callAws, useAws } from "@/lib/aws"

export function RedrivePage({ name }: { name: string }) {
  const router = useRouter()
  const follow = useFollow()
  const queue = useQueue(name)
  const queues = useQueues()
  const sources = useAws<{ queueUrls?: string[] }>("sqs", "ListDeadLetterSourceQueues", { QueueUrl: queue.url }, { enabled: Boolean(queue.url) })
  const [destination, setDestination] = useState("source")
  const [custom, setCustom] = useState("")
  const [velocity, setVelocity] = useState("system")
  const [rate, setRate] = useState("50")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const base = `/sqs/queues/${encodeURIComponent(name)}`
  const isDlq = (sources.data?.queueUrls?.length ?? 0) > 0

  const start = async () => {
    setSaving(true)
    setError(undefined)
    try {
      await callAws("sqs", "StartMessageMoveTask", {
        SourceArn: queue.attributes?.QueueArn,
        ...(destination === "custom" ? { DestinationArn: custom } : {}),
        ...(velocity === "custom" ? { MaxNumberOfMessagesPerSecond: Number(rate) } : {}),
      })
      flash.success(`Dead-letter queue redrive started for ${name}.`)
      router.push(`${base}?tab=redrive`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SqsLayout breadcrumbs={[{ text: "Queues", href: "/sqs/queues" }, { text: name, href: base }, { text: "Start DLQ redrive", href: "#" }]} contentType="form">
      <ContentLayout header={<Header variant="h1" description="Move unconsumed messages out of a dead-letter queue.">Start DLQ redrive</Header>}>
        <Form
          errorText={error}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" href={base} onFollow={follow}>Cancel</Button>
              <Button variant="primary" loading={saving} disabled={!queue.attributes?.QueueArn || (destination === "custom" && !custom)} onClick={() => void start()}>DLQ redrive</Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            {sources.data && !isDlq && <Alert type="warning">{name} isn&apos;t configured as a dead-letter queue for any source queue. Redrive to source queues requires a source queue.</Alert>}
            <Container header={<Header variant="h2">Dead-letter queue</Header>}>
              <KeyValuePairs columns={3} items={[{ label: "Queue", value: name }, { label: "Messages available", value: queue.attributes?.ApproximateNumberOfMessages ?? "0" }, { label: "Source queues", value: sources.data?.queueUrls?.map((u) => u.split("/").pop()).join(", ") || "–" }]} />
            </Container>
            <Container header={<Header variant="h2">Redrive configuration</Header>}>
              <SpaceBetween size="l">
                <FormField label="Message destination">
                  <Tiles
                    value={destination}
                    onChange={({ detail }) => setDestination(detail.value)}
                    items={[
                      { value: "source", label: "Redrive to source queue(s)", description: "Move messages back to the source queues they came from." },
                      { value: "custom", label: "Redrive to a custom destination", description: "Move messages to a queue you choose." },
                    ]}
                  />
                </FormField>
                {destination === "custom" && (
                  <FormField label="Destination queue">
                    <Select
                      selectedOption={custom ? { value: custom, label: custom.split(":").pop() } : null}
                      placeholder="Choose a queue"
                      onChange={({ detail }) => setCustom(detail.selectedOption.value ?? "")}
                      options={(queues.data ?? []).filter((q) => q.name !== name).map((q) => ({ value: q.attributes.QueueArn ?? "", label: q.name }))}
                    />
                  </FormField>
                )}
                <FormField label="Velocity control settings">
                  <Tiles
                    value={velocity}
                    onChange={({ detail }) => setVelocity(detail.value)}
                    items={[
                      { value: "system", label: "System optimized", description: "Redrive messages at the maximum number of messages per second." },
                      { value: "custom", label: "Custom max velocity", description: "Redrive messages at a custom maximum number of messages per second." },
                    ]}
                  />
                </FormField>
                {velocity === "custom" && <FormField label="Maximum messages per second" constraintText="Should be between 1 and 500."><Input type="number" value={rate} onChange={({ detail }) => setRate(detail.value)} /></FormField>}
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Form>
      </ContentLayout>
    </SqsLayout>
  )
}
