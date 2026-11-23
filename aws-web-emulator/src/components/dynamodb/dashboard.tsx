"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Grid from "@cloudscape-design/components/grid"
import Header from "@cloudscape-design/components/header"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import { useEffect, useState } from "react"
import { useFollow } from "@/components/shell/page-layout"
import { DdbLayout } from "@/components/dynamodb/ddb-app"
import { readFavorites, useTables } from "@/components/dynamodb/shared"
import { useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

export function DdbDashboard() {
  const follow = useFollow()
  const tables = useTables()
  const clusters = useAws<{ Clusters?: { ClusterName?: string; Status?: string }[] }>("dax", "DescribeClusters", {})
  const [favorites, setFavorites] = useState<string[]>([])
  useEffect(() => {
    // Favorites live in browser storage, which is only readable after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavorites(readFavorites())
  }, [])
  const favoriteTables = (tables.data ?? []).filter((table) => favorites.includes(table.TableName ?? ""))
  return (
    <DdbLayout breadcrumbs={[{ text: "Dashboard", href: "/dynamodb" }]} contentType="dashboard">
      <ContentLayout header={<Header variant="h1">Dashboard</Header>}>
        <Grid gridDefinition={[{ colspan: { default: 12, m: 8 } }, { colspan: { default: 12, m: 4 } }]}>
          <SpaceBetween size="l">
            <Table
              header={<Header variant="h2" counter="(0)" actions={<Button href="/cloudwatch" onFollow={follow} iconName="external" iconAlign="right">Manage in CloudWatch</Button>}>Alarms</Header>}
              items={[]}
              columnDefinitions={[{ id: "name", header: "Alarm name", cell: () => "" }, { id: "status", header: "Status", cell: () => "" }]}
              empty={<Box textAlign="center" color="inherit"><b>No custom alarms</b></Box>}
            />
            <Table
              header={<Header variant="h2" actions={<Button href="/dynamodb/tables" onFollow={follow}>View all tables</Button>}>Favorite tables</Header>}
              items={favoriteTables}
              columnDefinitions={[
                { id: "name", header: "Table name", cell: (table) => <Link href={`/dynamodb/table/${encodeURIComponent(table.TableName ?? "")}`} onFollow={follow}>{table.TableName}</Link> },
                { id: "created", header: "Created at (UTC)", cell: (table) => consoleDate(table.CreationDateTime) },
              ]}
              empty={<Box textAlign="center" color="inherit"><b>No favorite tables</b><Box variant="p" color="inherit">To get started, click the star icon on the tables page or table details page to favorite a table.</Box></Box>}
            />
            <Table
              header={<Header variant="h2" counter={`(${clusters.data?.Clusters?.length ?? 0})`} actions={<Button href="/dynamodb/dax/clusters" onFollow={follow}>View details</Button>}>DAX clusters</Header>}
              items={clusters.data?.Clusters ?? []}
              columnDefinitions={[{ id: "name", header: "Cluster name", cell: (cluster) => cluster.ClusterName }, { id: "status", header: "Status", cell: (cluster) => cluster.Status }]}
              empty={<Box textAlign="center" color="inherit"><b>No clusters</b><Box variant="p" color="inherit">No clusters to display</Box><Button href="/dynamodb/dax/clusters" onFollow={follow}>Create cluster</Button></Box>}
            />
          </SpaceBetween>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Create resources</Header>}>
              <SpaceBetween size="m">
                <Box>Create an Amazon DynamoDB table for fast and predictable database performance at any scale.</Box>
                <Button variant="primary" href="/dynamodb/tables/create" onFollow={follow}>Create table</Button>
                <Box>Amazon DynamoDB Accelerator (DAX) is a fully-managed, highly-available, in-memory caching service for DynamoDB.</Box>
                <Button href="/dynamodb/dax/clusters" onFollow={follow}>Create DAX cluster</Button>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">Additional resources</Header>}>
              <SpaceBetween size="xs">
                {[
                  ["Getting started guide", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GettingStartedDynamoDB.html"],
                  ["Working with tables", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithTables.html"],
                  ["Developer guide", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/"],
                  ["FAQ", "https://aws.amazon.com/dynamodb/faqs/"],
                  ["DAX developer guide", "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.html"],
                ].map(([label, href]) => <Link key={label} external href={href}>{label}</Link>)}
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Grid>
      </ContentLayout>
    </DdbLayout>
  )
}
