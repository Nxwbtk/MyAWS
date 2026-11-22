"use client"

import Badge from "@cloudscape-design/components/badge"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ContentLayout from "@cloudscape-design/components/content-layout"
import ExpandableSection from "@cloudscape-design/components/expandable-section"
import Grid from "@cloudscape-design/components/grid"
import Header from "@cloudscape-design/components/header"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Tabs from "@cloudscape-design/components/tabs"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { useFollow } from "@/components/shell/page-layout"
import { S3Layout } from "@/components/s3/s3-app"
import { unsupported, useInvalidate, useS3, useS3Environment } from "@/components/s3/s3-hooks"
import { consoleDate, copyText } from "@/lib/format"
import { regionName } from "@/lib/service-meta"

type Bucket = { Name?: string; CreationDate?: string; BucketRegion?: string; BucketArn?: string }
type DirectoryBucket = Bucket

export function bucketRegionLabel(region?: string) {
  if (!region) return "-"
  return `${regionName(region)} ${region}`
}

export function BucketsPage({ type }: { type: "general" | "directory" }) {
  const follow = useFollow()
  const router = useRouter()
  const invalidate = useInvalidate()
  const environment = useS3Environment()
  const [selected, setSelected] = useState<Bucket[]>([])
  const general = useS3<{ Buckets?: Bucket[] }>("s3", "ListBuckets", { MaxBuckets: 1000 }, { enabled: type === "general" })
  const directory = useS3<{ Buckets?: DirectoryBucket[] }>("s3", "ListDirectoryBuckets", {}, { enabled: type === "directory" })
  const query = type === "general" ? general : directory
  const buckets = query.data?.Buckets ?? []
  const current = selected[0]
  const arn = current?.Name ? `arn:aws:s3:::${current.Name}` : ""

  const table =
    type === "general" ? (
      <ResourceTable<Bucket>
        title="General purpose buckets"
        variant="container"
        headerVariant="h2"
        description="Buckets are containers for data stored in S3."
        items={buckets}
        loading={query.isPending && query.fetchStatus !== "idle"}
        loadingText="Loading buckets"
        error={query.error}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="Name"
        filterPlaceholder="Find buckets by name"
        columns={[
          {
            id: "name",
            header: "Name",
            value: (bucket) => bucket.Name,
            cell: (bucket) => (
              <Link href={`/s3/buckets/${encodeURIComponent(bucket.Name ?? "")}?tab=objects`} onFollow={follow}>
                {bucket.Name}
              </Link>
            ),
          },
          {
            id: "region",
            header: "AWS Region",
            value: (bucket) => bucket.BucketRegion ?? environment.data?.region,
            cell: (bucket) => bucketRegionLabel(bucket.BucketRegion ?? environment.data?.region),
          },
          {
            id: "created",
            header: "Creation date",
            value: (bucket) => bucket.CreationDate,
            cell: (bucket) => consoleDate(bucket.CreationDate),
          },
        ]}
        empty={
          <EmptyState
            title="No buckets"
            subtitle="You don't have any buckets."
            action={<Button href="/s3/bucket/create" onFollow={follow}>Create bucket</Button>}
          />
        }
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={query.isFetching} onClick={() => void invalidate()} />
            <Button
              iconName="copy"
              disabled={!current}
              onClick={() => {
                void copyText(arn)
                flash.success(`ARN copied: ${arn}`)
              }}
            >
              Copy ARN
            </Button>
            <Button
              disabled={!current}
              onClick={() => router.push(`/s3/bucket/${encodeURIComponent(current?.Name ?? "")}/empty`)}
            >
              Empty
            </Button>
            <Button
              disabled={!current}
              onClick={() => router.push(`/s3/bucket/${encodeURIComponent(current?.Name ?? "")}/delete`)}
            >
              Delete
            </Button>
            <Button variant="primary" href="/s3/bucket/create" onFollow={follow}>
              Create bucket
            </Button>
          </SpaceBetween>
        }
      />
    ) : (
      <ResourceTable<DirectoryBucket>
        title="Directory buckets"
        variant="container"
        headerVariant="h2"
        description="Directory buckets are optimized for use cases that require consistent single-digit millisecond latency."
        items={buckets}
        loading={query.isPending && query.fetchStatus !== "idle"}
        loadingText="Loading buckets"
        error={query.error}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="Name"
        filterPlaceholder="Find buckets by name"
        columns={[
          {
            id: "name",
            header: "Name",
            value: (bucket) => bucket.Name,
            cell: (bucket) => (
              <Link href={`/s3/buckets/${encodeURIComponent(bucket.Name ?? "")}?tab=objects`} onFollow={follow}>
                {bucket.Name}
              </Link>
            ),
          },
          {
            id: "locationType",
            header: "Bucket location type",
            value: (bucket) => (bucket.Name?.includes("--x-s3") ? "Availability Zone" : "Local Zone"),
            cell: (bucket) => (bucket.Name?.includes("--x-s3") ? "Availability Zone" : "Local Zone"),
          },
          {
            id: "locationName",
            header: "Bucket location name",
            value: (bucket) => bucket.Name?.split("--").at(-2),
            cell: (bucket) => bucket.Name?.split("--").at(-2) ?? "-",
          },
          {
            id: "created",
            header: "Creation date",
            value: (bucket) => bucket.CreationDate,
            cell: (bucket) => consoleDate(bucket.CreationDate),
          },
        ]}
        empty={
          <EmptyState
            title="No directory buckets"
            subtitle="You don't have any directory buckets."
            action={<Button href="/s3/bucket/create?bucketType=directory" onFollow={follow}>Create bucket</Button>}
          />
        }
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" loading={query.isFetching} onClick={() => void invalidate()} />
            <Button iconName="copy" disabled={!current} onClick={() => { void copyText(arn); flash.success(`ARN copied: ${arn}`) }}>
              Copy ARN
            </Button>
            <Button disabled={!current} onClick={() => router.push(`/s3/bucket/${encodeURIComponent(current?.Name ?? "")}/empty`)}>
              Empty
            </Button>
            <Button disabled={!current} onClick={() => router.push(`/s3/bucket/${encodeURIComponent(current?.Name ?? "")}/delete`)}>
              Delete
            </Button>
            <Button disabled disabledReason={unsupported}>Import</Button>
            <Button variant="primary" href="/s3/bucket/create?bucketType=directory" onFollow={follow}>
              Create bucket
            </Button>
          </SpaceBetween>
        }
      />
    )

  return (
    <S3Layout breadcrumbs={[{ text: "Buckets", href: "/s3/buckets" }]} contentType="table">
      <ContentLayout header={<Header variant="h1">Buckets</Header>}>
        <SpaceBetween size="l">
          <Tabs
            activeTabId={type}
            onChange={({ detail }) => router.push(detail.activeTabId === "general" ? "/s3/buckets" : "/s3/directory-buckets")}
            tabs={[
              {
                id: "general",
                label: (
                  <span>
                    General purpose buckets <Badge>All AWS Regions</Badge>
                  </span>
                ),
              },
              { id: "directory", label: "Directory buckets" },
            ]}
          />
          {type === "general" ? (
            <Grid gridDefinition={[{ colspan: { default: 12, s: 8 } }, { colspan: { default: 12, s: 4 } }]}>
              {table}
              <SpaceBetween size="l">
                <InsightPanel
                  title="Account snapshot"
                  description="Storage Lens provides visibility into storage usage and activity trends."
                  action="View dashboard"
                  href="/s3/lens"
                />
                <InsightPanel
                  title="External access summary"
                  description="External access findings help you identify bucket permissions that allow public access or access from other AWS accounts."
                />
              </SpaceBetween>
            </Grid>
          ) : (
            table
          )}
        </SpaceBetween>
      </ContentLayout>
    </S3Layout>
  )
}

function InsightPanel({
  title,
  description,
  action,
  href,
}: {
  title: string
  description: string
  action?: string
  href?: string
}) {
  const follow = useFollow()
  return (
    <ExpandableSection
      variant="container"
      headerText={title}
      headerInfo={<Link variant="info">Info</Link>}
      headerActions={action && href ? <Button href={href} onFollow={follow}>{action}</Button> : undefined}
      headerDescription={description}
    >
      <SpaceBetween size="xs">
        <Badge>Updated daily</Badge>
        <Box color="text-status-inactive">Not available in the local emulator.</Box>
      </SpaceBetween>
    </ExpandableSection>
  )
}
