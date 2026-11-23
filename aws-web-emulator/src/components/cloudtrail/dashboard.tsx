"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Container from "@cloudscape-design/components/container"
import { useFollow } from "@/components/shell/page-layout"
import { CtLayout } from "@/components/cloudtrail/ct-app"
import { eventHref, useLookup } from "@/components/cloudtrail/events"
import { useTrails } from "@/components/cloudtrail/trails"
import { useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

export function CloudTrailDashboard() {
  const follow = useFollow()
  const trails = useTrails()
  const events = useLookup("ReadOnly", "false", 10080)
  const stores = useAws<{ EventDataStores?: { EventDataStoreArn?: string }[] }>("cloudtrail", "ListEventDataStores", {})
  const queries = useAws<{ Queries?: { QueryId?: string; QueryStatus?: string; CreationTime?: string }[] }>("cloudtrail", "ListQueries", { EventDataStore: stores.data?.EventDataStores?.[0]?.EventDataStoreArn }, { enabled: Boolean(stores.data?.EventDataStores?.[0]) })
  const recent = (events.data?.pages ?? []).flatMap((p) => p.Events ?? []).slice(0, 5)
  const insightsOn = (trails.data ?? []).some((t) => t.HasInsightSelectors)
  return (
    <CtLayout breadcrumbs={[{ text: "Dashboard", href: "/cloudtrail" }]} contentType="dashboard">
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>}>Dashboard</Header>}>
        <SpaceBetween size="l">
          <Alert type="info">AWS CloudTrail Lake feature will no longer be open to new customers starting on May 31, 2026. For capabilities similar to CloudTrail Lake, explore Amazon CloudWatch.</Alert>
          <Table
            header={<Header variant="h2" description="Choose a query to view results from the last seven days." actions={<Button href="/cloudtrail/query" onFollow={follow}>Create a new query</Button>}>Query results history</Header>}
            items={queries.data?.Queries ?? []}
            columnDefinitions={[{ id: "id", header: "Query ID", cell: (q) => q.QueryId }, { id: "status", header: "Status", cell: (q) => q.QueryStatus }, { id: "created", header: "Created", cell: (q) => consoleDate(q.CreationTime) }]}
            empty={<Box textAlign="center" color="inherit"><b>No queries</b><Box variant="p" color="inherit">No queries to display</Box></Box>}
          />
          <Table
            header={<Header variant="h2" info={<Link variant="info">Info</Link>} actions={<SpaceBetween direction="horizontal" size="xs"><Button href="/cloudtrail/event-data-stores/create" onFollow={follow}>Copy events to Lake</Button><Button href="/cloudtrail/trails/create" onFollow={follow}>Create trail</Button></SpaceBetween>}>Trails</Header>}
            items={trails.data ?? []}
            loading={trails.isPending}
            columnDefinitions={[
              { id: "name", header: "Name", cell: (t) => <Link href={`/cloudtrail/trails/${encodeURIComponent(t.Name ?? "")}`} onFollow={follow}>{t.Name}</Link> },
              { id: "status", header: "Status", cell: (t) => (t.status.IsLogging ? <StatusIndicator type="success">Logging</StatusIndicator> : <StatusIndicator type="stopped">Off</StatusIndicator>) },
            ]}
            empty={<Box textAlign="center" color="inherit"><b>No trails</b><Box variant="p" color="inherit">No trails to display.</Box><Button href="/cloudtrail/trails/create" onFollow={follow}>Create trail</Button></Box>}
          />
          <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>}>CloudTrail Insights</Header>}>
            {insightsOn ? <StatusIndicator type="success">CloudTrail Insights is enabled</StatusIndicator> : <SpaceBetween size="xs"><Box variant="h4">CloudTrail Insights is not enabled</Box><Box color="text-body-secondary">Insights event collection requires a trail.</Box><Box><Button href="/cloudtrail/trails/create" onFollow={follow}>Create a trail</Button></Box></SpaceBetween>}
          </Container>
          <Table
            header={<Header variant="h2" info={<Link variant="info">Info</Link>} actions={<Button href="/cloudtrail/events" onFollow={follow}>View full Event history</Button>}>Event history</Header>}
            items={recent}
            loading={events.isPending}
            columnDefinitions={[
              { id: "name", header: "Event name", cell: (e) => <Link href={eventHref(e.EventId)} onFollow={follow}>{e.EventName}</Link> },
              { id: "time", header: "Event time", cell: (e) => consoleDate(e.EventTime) },
              { id: "source", header: "Event source", cell: (e) => e.EventSource },
            ]}
            empty={<Box textAlign="center" color="inherit">No events</Box>}
          />
        </SpaceBetween>
      </ContentLayout>
    </CtLayout>
  )
}
