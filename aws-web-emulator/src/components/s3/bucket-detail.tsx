"use client"

import Button from "@cloudscape-design/components/button"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import Link from "@cloudscape-design/components/link"
import Tabs from "@cloudscape-design/components/tabs"
import { useRouter } from "next/navigation"
import { flash } from "@/components/console/flash"
import { BucketAccessPointsTab, BucketFileSystemsTab, BucketMetadataTab, BucketMetricsTab } from "@/components/s3/bucket-misc"
import { BucketManagementTab } from "@/components/s3/bucket-management"
import { BucketObjectsTab } from "@/components/s3/bucket-objects"
import { BucketPermissionsTab } from "@/components/s3/bucket-permissions"
import { BucketPropertiesTab } from "@/components/s3/bucket-properties"
import { S3Layout } from "@/components/s3/s3-app"
import { copyText } from "@/lib/format"

const tabs = [
  { id: "objects", label: "Objects" },
  { id: "metadata", label: "Metadata" },
  { id: "properties", label: "Properties" },
  { id: "permissions", label: "Permissions" },
  { id: "metrics", label: "Metrics" },
  { id: "management", label: "Management" },
  { id: "fs", label: "File systems" },
  { id: "accesspoint", label: "Access Points" },
]

export function bucketHref(bucket: string, tab = "objects", prefix = "") {
  const params = new URLSearchParams({ tab })
  if (prefix) params.set("prefix", prefix)
  return `/s3/buckets/${encodeURIComponent(bucket)}?${params}`
}

export function BucketDetailPage({ bucket, tab, prefix }: { bucket: string; tab: string; prefix: string }) {
  const router = useRouter()
  const parts = prefix.split("/").filter(Boolean)
  const folder = tab === "objects" && parts.length > 0
  const crumbs = [
    { text: "Buckets", href: "/s3/buckets" },
    { text: bucket, href: bucketHref(bucket) },
    ...(folder
      ? parts.map((part, index) => ({
          text: `${part}/`,
          href: bucketHref(bucket, "objects", `${parts.slice(0, index + 1).join("/")}/`),
        }))
      : []),
  ]
  const s3Uri = `s3://${bucket}/${prefix}`

  return (
    <S3Layout breadcrumbs={crumbs}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            info={<Link variant="info">Info</Link>}
            actions={
              folder ? (
                <Button
                  iconName="copy"
                  onClick={() => {
                    void copyText(s3Uri)
                    flash.success(`S3 URI copied: ${s3Uri}`)
                  }}
                >
                  Copy S3 URI
                </Button>
              ) : undefined
            }
          >
            {folder ? `${parts.at(-1)}/` : bucket}
          </Header>
        }
      >
        <Tabs
          activeTabId={tab}
          onChange={({ detail }) => router.push(bucketHref(bucket, detail.activeTabId))}
          tabs={tabs.map((item) => ({
            ...item,
            content:
              item.id !== tab ? null : item.id === "objects" ? (
                <BucketObjectsTab bucket={bucket} prefix={prefix} />
              ) : item.id === "metadata" ? (
                <BucketMetadataTab bucket={bucket} />
              ) : item.id === "properties" ? (
                <BucketPropertiesTab bucket={bucket} />
              ) : item.id === "permissions" ? (
                <BucketPermissionsTab bucket={bucket} />
              ) : item.id === "metrics" ? (
                <BucketMetricsTab bucket={bucket} />
              ) : item.id === "management" ? (
                <BucketManagementTab bucket={bucket} />
              ) : item.id === "fs" ? (
                <BucketFileSystemsTab bucket={bucket} />
              ) : (
                <BucketAccessPointsTab bucket={bucket} />
              ),
          }))}
        />
      </ContentLayout>
    </S3Layout>
  )
}
