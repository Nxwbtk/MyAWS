"use client"

import Badge from "@cloudscape-design/components/badge"
import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import { usePathname, useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { Notifications } from "@/components/console/flash"
import { PageLayout, ServiceNavigation, type Crumb } from "@/components/shell/page-layout"
import { AccessGrantsPage } from "@/components/s3/access-grants"
import { AccessPointsPage, CreateAccessPointPage } from "@/components/s3/access-points"
import { AccountSettingsPage } from "@/components/s3/account-settings"
import { BatchOperationsPage, CreateBatchJobPage } from "@/components/s3/batch-operations"
import { BucketDetailPage } from "@/components/s3/bucket-detail"
import { BucketsPage } from "@/components/s3/buckets"
import { CreateBucketPage } from "@/components/s3/create-bucket"
import { DeleteBucketPage, EmptyBucketPage } from "@/components/s3/empty-delete"
import { FileSystemsPage } from "@/components/s3/file-systems"
import { ObjectDetailPage } from "@/components/s3/object-detail"
import { StorageLensPage } from "@/components/s3/storage-lens"
import { CreateTableBucketPage, TableBucketDetailPage, TableBucketsPage } from "@/components/s3/table-buckets"
import { UploadPage } from "@/components/s3/upload"
import { CreateVectorBucketPage, VectorBucketDetailPage, VectorBucketsPage } from "@/components/s3/vector-buckets"

const navItems: SideNavigationProps.Item[] = [
  {
    type: "section",
    text: "Buckets",
    items: [
      { type: "link", text: "General purpose buckets", href: "/s3/buckets" },
      { type: "link", text: "Directory buckets", href: "/s3/directory-buckets" },
      { type: "link", text: "Table buckets", href: "/s3/table-buckets" },
      { type: "link", text: "Vector buckets", href: "/s3/vectors", info: <Badge color="blue">Updated</Badge> },
    ],
  },
  {
    type: "section",
    text: "Files",
    items: [{ type: "link", text: "File systems", href: "/s3/fs" }],
  },
  {
    type: "section",
    text: "Access management and security",
    items: [
      { type: "link", text: "Access Points", href: "/s3/ap" },
      { type: "link", text: "Access Points for FSx", href: "/s3/fsx-ap" },
      { type: "link", text: "Access Grants", href: "/s3/access-grants" },
      { type: "link", text: "IAM Access Analyzer", href: "/iam/access-analyzer" },
    ],
  },
  {
    type: "section",
    text: "Storage management and insights",
    items: [
      { type: "link", text: "Storage Lens", href: "/s3/lens" },
      { type: "link", text: "Batch Operations", href: "/s3/jobs" },
    ],
  },
  { type: "divider" },
  { type: "link", text: "Account and organization settings", href: "/s3/account-settings" },
  {
    type: "expandable-link-group",
    text: "AWS Marketplace for S3",
    href: "/s3/marketplace",
    items: [],
  },
]

function activeHref(path: string) {
  if (path.startsWith("/s3/buckets") || path.startsWith("/s3/bucket") || path.startsWith("/s3/upload") || path.startsWith("/s3/object") || path === "/s3")
    return "/s3/buckets"
  if (path.startsWith("/s3/table-buckets")) return "/s3/table-buckets"
  if (path.startsWith("/s3/vectors")) return "/s3/vectors"
  if (path.startsWith("/s3/ap")) return "/s3/ap"
  if (path.startsWith("/s3/jobs")) return "/s3/jobs"
  return path
}

export const s3Crumb: Crumb = { text: "Amazon S3", href: "/s3" }

export function S3Layout({
  breadcrumbs,
  children,
  contentType,
  navigationHide,
}: {
  breadcrumbs: Crumb[]
  children: ReactNode
  contentType?: "default" | "table" | "form" | "wizard" | "dashboard" | "cards"
  navigationHide?: boolean
}) {
  const path = usePathname()
  return (
    <PageLayout
      breadcrumbs={[s3Crumb, ...breadcrumbs]}
      navigationHide={navigationHide}
      contentType={contentType}
      notifications={<Notifications />}
      navigation={
        <ServiceNavigation
          header={{ text: "Amazon S3", href: "/s3" }}
          items={navItems}
          activeHref={activeHref(path)}
        />
      }
      content={children}
    />
  )
}

export function S3App({ path }: { path: string[] }) {
  const params = useSearchParams()
  const [section, id, sub] = path
  const name = id ? decodeURIComponent(id) : ""

  switch (section) {
    case undefined:
    case "home":
    case "buckets":
      if (name) return <BucketDetailPage bucket={name} tab={params.get("tab") ?? "objects"} prefix={params.get("prefix") ?? ""} />
      return <BucketsPage type="general" />
    case "directory-buckets":
      return <BucketsPage type="directory" />
    case "bucket":
      if (name === "create") return <CreateBucketPage />
      if (sub === "empty") return <EmptyBucketPage bucket={name} />
      if (sub === "delete") return <DeleteBucketPage bucket={name} />
      return <BucketDetailPage bucket={name} tab="objects" prefix="" />
    case "upload":
      return <UploadPage bucket={name} prefix={params.get("prefix") ?? ""} />
    case "object":
      return <ObjectDetailPage bucket={name} objectKey={params.get("prefix") ?? ""} tab={params.get("tab") ?? "properties"} versionId={params.get("versionId") ?? undefined} />
    case "table-buckets":
      if (name === "create") return <CreateTableBucketPage />
      if (name) return <TableBucketDetailPage arn={name} />
      return <TableBucketsPage />
    case "vectors":
      if (name === "create-bucket") return <CreateVectorBucketPage />
      if (name) return <VectorBucketDetailPage name={name} />
      return <VectorBucketsPage />
    case "fs":
    case "fsx-ap":
      return <FileSystemsPage fsx={section === "fsx-ap"} />
    case "ap":
      if (name === "create") return <CreateAccessPointPage />
      return <AccessPointsPage />
    case "access-grants":
      return <AccessGrantsPage />
    case "lens":
      return <StorageLensPage />
    case "jobs":
      if (name === "create") return <CreateBatchJobPage />
      return <BatchOperationsPage />
    case "account-settings":
      return <AccountSettingsPage />
    default:
      return <BucketsPage type="general" />
  }
}
