"use client"

import { S3Operations, S3Settings } from "@/components/s3-operations"
import { s3Operations } from "@/lib/s3-catalog"

export const bucketTabs = [
  "Objects",
  "Metadata",
  "Properties",
  "Permissions",
  "Metrics",
  "Management",
  "File systems",
  "Access Points",
]

const bucketSettings = {
  Metadata: [
    {
      title: "Metadata configuration",
      read: "GetBucketMetadataConfiguration",
      actions: [
        "CreateBucketMetadataConfiguration",
        "DeleteBucketMetadataConfiguration",
        "UpdateBucketMetadataJournalTableConfiguration",
        "UpdateBucketMetadataInventoryTableConfiguration",
        "UpdateBucketMetadataAnnotationTableConfiguration",
      ],
    },
    {
      title: "Metadata table configuration",
      read: "GetBucketMetadataTableConfiguration",
      actions: [
        "CreateBucketMetadataTableConfiguration",
        "DeleteBucketMetadataTableConfiguration",
      ],
    },
  ],
  Properties: [
    { title: "Bucket overview", read: "HeadBucket", actions: [] },
    {
      title: "Bucket Versioning",
      read: "GetBucketVersioning",
      actions: ["PutBucketVersioning"],
    },
    { title: "Bucket ABAC", read: "GetBucketAbac", actions: ["PutBucketAbac"] },
    {
      title: "Tags",
      read: "GetBucketTagging",
      actions: ["PutBucketTagging", "DeleteBucketTagging"],
    },
    {
      title: "Default encryption",
      read: "GetBucketEncryption",
      actions: ["PutBucketEncryption", "DeleteBucketEncryption"],
    },
    {
      title: "Server access logging",
      read: "GetBucketLogging",
      actions: ["PutBucketLogging"],
    },
    {
      title: "Event notifications",
      read: "GetBucketNotificationConfiguration",
      actions: ["PutBucketNotificationConfiguration"],
    },
    {
      title: "Transfer acceleration",
      read: "GetBucketAccelerateConfiguration",
      actions: ["PutBucketAccelerateConfiguration"],
    },
    {
      title: "Object Lock",
      read: "GetObjectLockConfiguration",
      actions: ["PutObjectLockConfiguration"],
    },
    {
      title: "Requester pays",
      read: "GetBucketRequestPayment",
      actions: ["PutBucketRequestPayment"],
    },
    {
      title: "Static website hosting",
      read: "GetBucketWebsite",
      actions: ["PutBucketWebsite", "DeleteBucketWebsite"],
    },
  ],
  Permissions: [
    {
      title: "Block public access (bucket settings)",
      read: "GetPublicAccessBlock",
      actions: ["PutPublicAccessBlock", "DeletePublicAccessBlock"],
    },
    {
      title: "Bucket policy",
      read: "GetBucketPolicy",
      actions: ["PutBucketPolicy", "DeleteBucketPolicy"],
    },
    { title: "Bucket policy status", read: "GetBucketPolicyStatus", actions: [] },
    {
      title: "Object Ownership",
      read: "GetBucketOwnershipControls",
      actions: ["PutBucketOwnershipControls", "DeleteBucketOwnershipControls"],
    },
    {
      title: "Access control list (ACL)",
      read: "GetBucketAcl",
      actions: ["PutBucketAcl"],
    },
    {
      title: "Cross-origin resource sharing (CORS)",
      read: "GetBucketCors",
      actions: ["PutBucketCors", "DeleteBucketCors"],
    },
  ],
  Metrics: [
    {
      title: "Bucket metrics",
      read: "ListBucketMetricsConfigurations",
      actions: [
        "GetBucketMetricsConfiguration",
        "PutBucketMetricsConfiguration",
        "DeleteBucketMetricsConfiguration",
      ],
    },
    {
      title: "Storage Class Analysis",
      read: "ListBucketAnalyticsConfigurations",
      actions: [
        "GetBucketAnalyticsConfiguration",
        "PutBucketAnalyticsConfiguration",
        "DeleteBucketAnalyticsConfiguration",
      ],
    },
  ],
  Management: [
    {
      title: "Lifecycle rules",
      read: "GetBucketLifecycleConfiguration",
      actions: ["PutBucketLifecycleConfiguration", "DeleteBucketLifecycle"],
    },
    {
      title: "Replication rules",
      read: "GetBucketReplication",
      actions: ["PutBucketReplication", "DeleteBucketReplication"],
    },
    {
      title: "Inventory configurations",
      read: "ListBucketInventoryConfigurations",
      actions: [
        "GetBucketInventoryConfiguration",
        "PutBucketInventoryConfiguration",
        "DeleteBucketInventoryConfiguration",
      ],
    },
    {
      title: "Intelligent-Tiering configurations",
      read: "ListBucketIntelligentTieringConfigurations",
      actions: [
        "GetBucketIntelligentTieringConfiguration",
        "PutBucketIntelligentTieringConfiguration",
        "DeleteBucketIntelligentTieringConfiguration",
      ],
    },
  ],
}

export function S3BucketSettings({
  bucket,
  tab,
  directory,
}: {
  bucket: string
  tab: string
  directory: boolean
}) {
  if (tab === "Access Points") {
    return (
      <S3Operations
        model="s3control"
        title="Access Points for this bucket"
        context={{ Bucket: bucket }}
        actions={Object.keys(s3Operations.s3control).filter(
          (name) => /AccessPoint/.test(name) && !/MultiRegion|Lambda/.test(name),
        )}
      />
    )
  }
  if (tab === "File systems") {
    return (
      <S3Operations
        model="s3files"
        title="File systems for this bucket"
        context={{ bucket: `arn:aws:s3:::${bucket}` }}
      />
    )
  }
  const sections = bucketSettings[tab as keyof typeof bucketSettings]
  if (!sections) return null
  // Directory buckets have a smaller settings surface. Keep other modeled
  // operations accessible in the service-wide API operations panel.
  const supported = directory
    ? sections.filter(({ title }) =>
        [
          "Bucket overview",
          "Default encryption",
          "Tags",
          "Bucket policy",
          "Lifecycle rules",
          "Bucket metrics",
        ].includes(title),
      )
    : sections
  return (
    <div className="space-y-3">
      {supported.length ? (
        <S3Settings model="s3" context={{ Bucket: bucket }} sections={supported} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No settings in this section for directory buckets.
        </p>
      )}
    </div>
  )
}
