"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import SegmentedControl from "@cloudscape-design/components/segmented-control"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import Pagination from "@cloudscape-design/components/pagination"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { errorMessage } from "@/components/console/flash"
import { CodeView, pretty } from "@/components/console/sections"
import { downloadText } from "@/components/ec2/key-pair-modal"
import { useFollow } from "@/components/shell/page-layout"
import { CtLayout } from "@/components/cloudtrail/ct-app"
import { callAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

export type TrailEvent = { EventId?: string; EventName?: string; ReadOnly?: string; AccessKeyId?: string; EventTime?: string; EventSource?: string; Username?: string; Resources?: { ResourceType?: string; ResourceName?: string }[]; CloudTrailEvent?: string }

const attributes = [
  { value: "ReadOnly", label: "Read-only" },
  { value: "EventName", label: "Event name" },
  { value: "EventSource", label: "Event source" },
  { value: "Username", label: "User name" },
  { value: "ResourceType", label: "Resource type" },
  { value: "ResourceName", label: "Resource name" },
  { value: "AccessKeyId", label: "AWS access key" },
  { value: "EventId", label: "Event ID" },
]

const ranges = [
  { id: "60", text: "1h" },
  { id: "1440", text: "1d" },
  { id: "10080", text: "7d" },
  { id: "129600", text: "90d" },
]

export const eventHref = (id?: string) => `/cloudtrail/events/${encodeURIComponent(id ?? "")}`

export function useLookup(attribute: string, value: string, minutes: number, category?: string) {
  return useInfiniteQuery({
    queryKey: ["emulator", "cloudtrail", "lookup", attribute, value, minutes, category],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const end = new Date()
      return callAws<{ Events?: TrailEvent[]; NextToken?: string }>("cloudtrail", "LookupEvents", {
        MaxResults: 50,
        StartTime: new Date(end.getTime() - minutes * 60_000).toISOString(),
        EndTime: end.toISOString(),
        ...(value ? { LookupAttributes: [{ AttributeKey: attribute, AttributeValue: value }] } : {}),
        ...(category ? { EventCategory: category } : {}),
        ...(pageParam ? { NextToken: pageParam } : {}),
      })
    },
    getNextPageParam: (last) => last.NextToken,
  })
}

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function EventHistoryPage() {
  const follow = useFollow()
  const [attribute, setAttribute] = useState("ReadOnly")
  const [value, setValue] = useState("false")
  const [applied, setApplied] = useState({ attribute: "ReadOnly", value: "false" })
  const [range, setRange] = useState("1440")
  const [page, setPage] = useState(1)
  const events = useLookup(applied.attribute, applied.value, Number(range))
  const items = (events.data?.pages ?? []).flatMap((p) => p.Events ?? [])
  const pageSize = 50
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const visible = items.slice((page - 1) * pageSize, page * pageSize)
  return (
    <CtLayout breadcrumbs={[{ text: "Event history", href: "/cloudtrail/events" }]} contentType="table">
      <Table<TrailEvent>
        variant="full-page"
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={`(${items.length}${events.hasNextPage ? "+" : ""})`}
            info={<Link variant="info">Info</Link>}
            description="Event history shows you the last 90 days of management events."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh" loading={events.isFetching} onClick={() => void events.refetch()} />
                <ButtonDropdown
                  items={[{ id: "csv", text: "Download as CSV" }, { id: "json", text: "Download as JSON" }]}
                  onItemClick={({ detail }) => {
                    if (detail.id === "json") downloadText("event_history.json", JSON.stringify({ Records: items.map((e) => JSON.parse(e.CloudTrailEvent ?? "{}")) }, null, 2))
                    else downloadText("event_history.csv", ["Event ID,Event time,User name,Event name,Resource type,Resource name,AWS access key,Event source,Read-only", ...items.map((e) => [e.EventId, e.EventTime, e.Username, e.EventName, e.Resources?.[0]?.ResourceType, e.Resources?.[0]?.ResourceName, e.AccessKeyId, e.EventSource, e.ReadOnly].map((v) => csvEscape(String(v ?? ""))).join(","))].join("\n"))
                  }}
                >
                  Download events
                </ButtonDropdown>
                <Button href="/cloudtrail/query" onFollow={follow}>Create Athena table</Button>
              </SpaceBetween>
            }
          >
            Event history
          </Header>
        }
        filter={
          <SpaceBetween direction="horizontal" size="xs">
            <Select selectedOption={attributes.find((a) => a.value === attribute) ?? null} onChange={({ detail }) => { setAttribute(detail.selectedOption.value ?? "EventName"); setValue(detail.selectedOption.value === "ReadOnly" ? "false" : "") }} options={attributes} />
            {attribute === "ReadOnly" ? (
              <Select selectedOption={{ value, label: value }} onChange={({ detail }) => setValue(detail.selectedOption.value ?? "false")} options={[{ value: "false", label: "false" }, { value: "true", label: "true" }]} />
            ) : (
              <Input value={value} placeholder={`Enter ${attributes.find((a) => a.value === attribute)?.label.toLowerCase()}`} onChange={({ detail }) => setValue(detail.value)} onKeyDown={({ detail }) => { if (detail.key === "Enter") { setApplied({ attribute, value }); setPage(1) } }} />
            )}
            <Button onClick={() => { setApplied({ attribute, value }); setPage(1) }}>Apply</Button>
            <Button variant="link" onClick={() => { setAttribute("ReadOnly"); setValue("false"); setApplied({ attribute: "ReadOnly", value: "" }); setPage(1) }}>Clear filter</Button>
            <SegmentedControl selectedId={range} onChange={({ detail }) => { setRange(detail.selectedId); setPage(1) }} options={ranges} />
          </SpaceBetween>
        }
        pagination={<Pagination currentPageIndex={page} pagesCount={pages + (events.hasNextPage ? 1 : 0)} openEnd={events.hasNextPage} onChange={async ({ detail }) => { if (detail.currentPageIndex > pages && events.hasNextPage) await events.fetchNextPage(); setPage(detail.currentPageIndex) }} />}
        loading={events.isPending}
        loadingText="Loading events"
        items={visible}
        wrapLines={false}
        resizableColumns
        columnDefinitions={[
          { id: "name", header: "Event name", cell: (e) => <Link href={eventHref(e.EventId)} onFollow={follow}>{e.EventName}</Link> },
          { id: "time", header: "Event time", cell: (e) => consoleDate(e.EventTime) },
          { id: "user", header: "User name", cell: (e) => e.Username ?? "–" },
          { id: "source", header: "Event source", cell: (e) => e.EventSource },
          { id: "rtype", header: "Resource type", cell: (e) => e.Resources?.[0]?.ResourceType ?? "–" },
          { id: "rname", header: "Resource name", cell: (e) => e.Resources?.[0]?.ResourceName ?? "–" },
        ]}
        empty={<Box textAlign="center" color="inherit"><b>No matches</b><Box variant="p" color="inherit">{events.error ? errorMessage(events.error) : "No events match the filter."}</Box></Box>}
      />
    </CtLayout>
  )
}

export function EventDetailPage({ id }: { id: string }) {
  const follow = useFollow()
  const event = useQuery({
    queryKey: ["emulator", "cloudtrail", "event", id],
    queryFn: async () => (await callAws<{ Events?: TrailEvent[] }>("cloudtrail", "LookupEvents", { LookupAttributes: [{ AttributeKey: "EventId", AttributeValue: id }], MaxResults: 1 })).Events?.[0] ?? null,
  })
  const e = event.data
  let record: Record<string, unknown> = {}
  try {
    record = JSON.parse(e?.CloudTrailEvent ?? "{}")
  } catch {
    record = {}
  }
  const identity = record.userIdentity as { type?: string; arn?: string } | undefined
  return (
    <CtLayout breadcrumbs={[{ text: "Event history", href: "/cloudtrail/events" }, { text: e?.EventName ?? id, href: "#" }]}>
      <ContentLayout header={<Header variant="h1">{e?.EventName ?? "Event"}</Header>}>
        <SpaceBetween size="l">
          {event.error && <Alert type="error">{errorMessage(event.error)}</Alert>}
          {event.data === null && <Alert type="warning">The event {id} wasn&apos;t found in the last 90 days of event history.</Alert>}
          <Container header={<Header variant="h2">Details</Header>}>
            <KeyValuePairs
              columns={3}
              items={[
                { label: "Event time", value: consoleDate(e?.EventTime) },
                { label: "User name", value: e?.Username ?? "–" },
                { label: "Event name", value: e?.EventName ?? "–" },
                { label: "Event source", value: e?.EventSource ?? "–" },
                { label: "AWS access key", value: e?.AccessKeyId ?? "–" },
                { label: "Source IP address", value: String(record.sourceIPAddress ?? "–") },
                { label: "Event ID", value: e?.EventId ?? id },
                { label: "Request ID", value: String(record.requestID ?? "–") },
                { label: "AWS region", value: String(record.awsRegion ?? "–") },
                { label: "Error code", value: String(record.errorCode ?? "–") },
                { label: "Read-only", value: e?.ReadOnly ?? "–" },
                { label: "Identity", value: identity?.arn ?? identity?.type ?? "–" },
              ]}
            />
          </Container>
          <Table
            header={<Header variant="h2" counter={`(${e?.Resources?.length ?? 0})`}>Resources referenced</Header>}
            items={e?.Resources ?? []}
            columnDefinitions={[{ id: "type", header: "Resource type", cell: (r) => r.ResourceType }, { id: "name", header: "Resource name", cell: (r) => r.ResourceName }]}
            empty={<Box textAlign="center" color="inherit">No resources referenced</Box>}
          />
          <Container header={<Header variant="h2" actions={<Button iconName="copy" onClick={() => { void navigator.clipboard.writeText(pretty(e?.CloudTrailEvent)) }}>Copy</Button>}>Event record</Header>}>
            <CodeView value={pretty(e?.CloudTrailEvent)} />
          </Container>
          <Box><Link href="/cloudtrail/events" onFollow={follow}>Back to event history</Link></Box>
        </SpaceBetween>
      </ContentLayout>
    </CtLayout>
  )
}

export function InsightsPage() {
  const follow = useFollow()
  const [range, setRange] = useState("10080")
  const events = useLookup("EventName", "", Number(range), "insight")
  const items = (events.data?.pages ?? []).flatMap((p) => p.Events ?? [])
  return (
    <CtLayout breadcrumbs={[{ text: "Insights", href: "/cloudtrail/insights" }]} contentType="table">
      <Table<TrailEvent>
        variant="full-page"
        header={<Header variant="awsui-h1-sticky" counter={`(${items.length})`} description="CloudTrail Insights identifies unusual API call rate and error rate activity in your AWS account." actions={<SegmentedControl selectedId={range} onChange={({ detail }) => setRange(detail.selectedId)} options={ranges} />}>Insights</Header>}
        loading={events.isPending}
        items={items}
        columnDefinitions={[
          { id: "name", header: "Event name", cell: (e) => <Link href={eventHref(e.EventId)} onFollow={follow}>{e.EventName}</Link> },
          { id: "time", header: "Event time", cell: (e) => consoleDate(e.EventTime) },
          { id: "source", header: "Event source", cell: (e) => e.EventSource },
        ]}
        empty={<Box textAlign="center" color="inherit"><b>No Insights events</b><Box variant="p" color="inherit">{events.error ? errorMessage(events.error) : "Turn on Insights events on a trail to detect unusual activity."}</Box><Button href="/cloudtrail/trails" onFollow={follow}>View trails</Button></Box>}
      />
    </CtLayout>
  )
}
