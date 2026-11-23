"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ColumnLayout from "@cloudscape-design/components/column-layout"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import { useFollow } from "@/components/shell/page-layout"
import { CwLayout } from "@/components/cloudwatch/cw-app"
import { groupHref, useLogGroups } from "@/components/cloudwatch/logs"
import { useAws } from "@/lib/aws"
import { consoleBytes } from "@/lib/format"

type Alarm = { AlarmName?: string; StateValue?: string; StateUpdatedTimestamp?: string }

export function CloudWatchOverview() {
  const follow = useFollow()
  const alarms = useAws<{ MetricAlarms?: Alarm[]; CompositeAlarms?: Alarm[] }>("cloudwatch", "DescribeAlarms", { MaxRecords: 100 })
  const dashboards = useAws<{ DashboardEntries?: { DashboardName?: string; LastModified?: string }[] }>("cloudwatch", "ListDashboards", {})
  const groups = useLogGroups()
  const all = [...(alarms.data?.MetricAlarms ?? []), ...(alarms.data?.CompositeAlarms ?? [])]
  const count = (state: string) => all.filter((a) => a.StateValue === state).length
  const recentGroups = [...(groups.data ?? [])].sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0)).slice(0, 5)
  return (
    <CwLayout breadcrumbs={[{ text: "Overview", href: "/cloudwatch" }]} contentType="dashboard">
      <ContentLayout header={<Header variant="h1" description="Monitor your resources and applications with metrics, alarms, logs, and dashboards." actions={<Button href="/cloudwatch/dashboards" onFollow={follow}>View dashboards</Button>}>CloudWatch</Header>}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2" actions={<Button href="/cloudwatch/alarms" onFollow={follow}>View all alarms</Button>}>Alarms summary</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <div><Box variant="awsui-key-label"><StatusIndicator type="error">In alarm</StatusIndicator></Box><Link variant="awsui-value-large" href="/cloudwatch/alarms?state=ALARM" onFollow={follow}>{count("ALARM")}</Link></div>
              <div><Box variant="awsui-key-label"><StatusIndicator type="info">Insufficient data</StatusIndicator></Box><Box variant="awsui-value-large">{count("INSUFFICIENT_DATA")}</Box></div>
              <div><Box variant="awsui-key-label"><StatusIndicator type="success">OK</StatusIndicator></Box><Box variant="awsui-value-large">{count("OK")}</Box></div>
            </ColumnLayout>
          </Container>
          <ColumnLayout columns={2}>
            <Table
              header={<Header variant="h2" counter={`(${dashboards.data?.DashboardEntries?.length ?? 0})`} actions={<Button href="/cloudwatch/dashboards" onFollow={follow}>Dashboards</Button>}>Recent dashboards</Header>}
              items={(dashboards.data?.DashboardEntries ?? []).slice(0, 5)}
              columnDefinitions={[{ id: "name", header: "Name", cell: (d) => <Link href={`/cloudwatch/dashboards/${encodeURIComponent(d.DashboardName ?? "")}`} onFollow={follow}>{d.DashboardName}</Link> }]}
              empty={<Box textAlign="center" color="inherit"><b>No dashboards</b><Box variant="p" color="inherit">Create a dashboard to monitor your resources in one view.</Box></Box>}
            />
            <Table
              header={<Header variant="h2" counter={`(${groups.data?.length ?? 0})`} actions={<Button href="/cloudwatch/log-groups" onFollow={follow}>Log groups</Button>}>Recent log groups</Header>}
              items={recentGroups}
              loading={groups.isPending}
              columnDefinitions={[{ id: "name", header: "Log group", cell: (g) => <Link href={groupHref(g.logGroupName)} onFollow={follow}>{g.logGroupName}</Link> }, { id: "bytes", header: "Stored bytes", cell: (g) => consoleBytes(g.storedBytes ?? 0) }]}
              empty={<Box textAlign="center" color="inherit"><b>No log groups</b></Box>}
            />
          </ColumnLayout>
        </SpaceBetween>
      </ContentLayout>
    </CwLayout>
  )
}
