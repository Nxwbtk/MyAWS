"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { LearnMore } from "@/components/console/sections"
import { bucketHref } from "@/components/s3/bucket-detail"
import { S3Layout } from "@/components/s3/s3-app"
import { s3Read, s3Request, useInvalidate } from "@/components/s3/s3-hooks"

type VersionPage = {
  Versions?: { Key?: string; VersionId?: string }[]
  DeleteMarkers?: { Key?: string; VersionId?: string }[]
  IsTruncated?: boolean
  NextKeyMarker?: string
  NextVersionIdMarker?: string
}

async function emptyBucket(bucket: string) {
  let deleted = 0
  for (;;) {
    const page = await s3Read<VersionPage>("s3", "ListObjectVersions", { Bucket: bucket, MaxKeys: 1000 })
    const objects = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])].flatMap((item) =>
      item.Key ? [{ Key: item.Key, ...(item.VersionId && item.VersionId !== "null" ? { VersionId: item.VersionId } : {}) }] : [],
    )
    if (objects.length === 0) break
    await s3Request("s3", "DeleteObjects", { Bucket: bucket, Delete: { Objects: objects, Quiet: true } })
    deleted += objects.length
    if (!page.IsTruncated && objects.length < 1000) {
      const check = await s3Read<VersionPage>("s3", "ListObjectVersions", { Bucket: bucket, MaxKeys: 1 })
      if (!check.Versions?.length && !check.DeleteMarkers?.length) break
    }
  }
  return deleted
}

function useObjectCount(bucket: string) {
  return useQuery({
    queryKey: ["emulator", "s3", "has-objects", bucket],
    queryFn: async () => {
      const page = await s3Read<VersionPage>("s3", "ListObjectVersions", { Bucket: bucket, MaxKeys: 1 })
      return (page.Versions?.length ?? 0) + (page.DeleteMarkers?.length ?? 0)
    },
  })
}

export function EmptyBucketPage({ bucket }: { bucket: string }) {
  const router = useRouter()
  const invalidate = useInvalidate()
  const count = useObjectCount(bucket)
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <S3Layout
      breadcrumbs={[
        { text: "Buckets", href: "/s3/buckets" },
        { text: bucket, href: bucketHref(bucket) },
        { text: "Empty bucket", href: `/s3/bucket/${encodeURIComponent(bucket)}/empty` },
      ]}
      contentType="form"
    >
      <Form
        header={<Header variant="h1" info={<Link variant="info">Info</Link>}>Empty bucket</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.back()}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={confirm !== "permanently delete"}
              onClick={async () => {
                setSaving(true)
                setError(undefined)
                try {
                  const deleted = await emptyBucket(bucket)
                  await invalidate()
                  flash.success(`Successfully emptied bucket "${bucket}". Deleted ${deleted} object${deleted === 1 ? "" : "s"}.`)
                  router.push("/s3/buckets")
                } catch (caught) {
                  setError(errorMessage(caught))
                } finally {
                  setSaving(false)
                }
              }}
            >
              Empty
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          {count.data === 0 ? (
            <Alert type="info">No objects found in bucket {bucket}.</Alert>
          ) : (
            <Alert type="warning">
              <ul>
                <li>Emptying the bucket deletes all objects in the bucket and cannot be undone.</li>
                <li>Objects added to the bucket while the empty bucket action is in progress might be deleted.</li>
                <li>To prevent new objects from being added to this bucket while the empty bucket action is in progress, you might need to update your bucket policy to stop objects from being added to the bucket.</li>
              </ul>
              <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/empty-bucket.html" />
            </Alert>
          )}
          <Container header={<Header variant="h2">Permanently delete all objects in bucket &quot;{bucket}&quot;?</Header>}>
            <FormField label={<>To confirm this action, enter &quot;<i>permanently delete</i>&quot;.</>}>
              <Input value={confirm} placeholder="permanently delete" onChange={({ detail }) => setConfirm(detail.value)} />
            </FormField>
          </Container>
        </SpaceBetween>
      </Form>
    </S3Layout>
  )
}

export function DeleteBucketPage({ bucket }: { bucket: string }) {
  const router = useRouter()
  const invalidate = useInvalidate()
  const count = useObjectCount(bucket)
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const notEmpty = (count.data ?? 0) > 0
  return (
    <S3Layout
      breadcrumbs={[
        { text: "Buckets", href: "/s3/buckets" },
        { text: bucket, href: bucketHref(bucket) },
        { text: "Delete bucket", href: `/s3/bucket/${encodeURIComponent(bucket)}/delete` },
      ]}
      contentType="form"
    >
      <Form
        header={<Header variant="h1" info={<Link variant="info">Info</Link>}>Delete bucket</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.back()}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={confirm !== bucket || notEmpty}
              onClick={async () => {
                setSaving(true)
                setError(undefined)
                try {
                  await s3Request("s3", "DeleteBucket", { Bucket: bucket })
                  await invalidate()
                  flash.success(`Successfully deleted bucket "${bucket}".`)
                  router.push("/s3/buckets")
                } catch (caught) {
                  setError(errorMessage(caught))
                } finally {
                  setSaving(false)
                }
              }}
            >
              Delete bucket
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          {notEmpty ? (
            <Alert
              type="error"
              header="This bucket is not empty"
              action={<Button onClick={() => router.push(`/s3/bucket/${encodeURIComponent(bucket)}/empty`)}>Empty bucket</Button>}
            >
              Buckets must be empty before they can be deleted. To delete all objects in the bucket, use the empty bucket configuration.
            </Alert>
          ) : null}
          <Alert type="warning">
            <ul>
              <li>Deleting a bucket cannot be undone.</li>
              <li>Bucket names are unique. If you delete a bucket, another AWS user can use the name.</li>
              <li>If this bucket is used with a Multi-Region Access Point in an external account, initiate failover before deleting the bucket.</li>
              <li>If this bucket is used with an access point in an external account, the requests made through those access points will fail after you delete this bucket.</li>
            </ul>
            <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/delete-bucket.html" />
          </Alert>
          <Container header={<Header variant="h2">Delete bucket &quot;{bucket}&quot;?</Header>}>
            <FormField label={<>To confirm this action, enter &quot;<i>{bucket}</i>&quot;.</>}>
              <Input value={confirm} placeholder={bucket} disabled={notEmpty} onChange={({ detail }) => setConfirm(detail.value)} />
            </FormField>
          </Container>
          <Box />
        </SpaceBetween>
      </Form>
    </S3Layout>
  )
}
