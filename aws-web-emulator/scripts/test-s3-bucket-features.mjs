import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { Agent } from "node:https"
import { join } from "node:path"
import { setTimeout as wait } from "node:timers/promises"
import { CreateKeyCommand, KMSClient } from "@aws-sdk/client-kms"
import { fromIni } from "@aws-sdk/credential-providers"
import { NodeHttpHandler } from "@smithy/node-http-handler"

async function createKey(region) {
  const state = process.env.MYAWS_S3_QA_STATE_DIR
  assert.ok(
    state,
    "Set MYAWS_S3_QA_STATE_DIR to the isolated emulator's 19297 directory",
  )
  const ca = await readFile(join(state, "ca.pem"))
  const client = new KMSClient({
    endpoint: "https://127.0.0.1:19297",
    region,
    maxAttempts: 1,
    credentials: fromIni({
      filepath: join(state, "emulator_credentials"),
      configFilepath: join(state, "config"),
    }),
    requestHandler: new NodeHttpHandler({ httpsAgent: new Agent({ ca }) }),
  })
  try {
    const { KeyMetadata } = await client.send(
      new CreateKeyCommand({ Description: "S3 console encryption fixture" }),
    )
    assert.ok(KeyMetadata?.Arn)
    return KeyMetadata.Arn
  } finally {
    client.destroy()
  }
}

export async function verifyBucketFeatures(
  s3,
  { bucket, bucketArn, accessRole, file, environment, verifyManagedTable },
) {
  const object = { Key: "copy.txt" }
  assert.ok(
    Object.hasOwn(await s3("GetBucketLocation"), "LocationConstraint") ||
      environment.region === "us-east-1",
  )

  const analytics = {
    Id: "qa-report",
    Filter: { Prefix: "folder/" },
    StorageClassAnalysis: {},
  }
  await s3("PutBucketAnalyticsConfiguration", {
    Id: analytics.Id,
    AnalyticsConfiguration: analytics,
  })
  assert.equal(
    (await s3("GetBucketAnalyticsConfiguration", { Id: analytics.Id }))
      .AnalyticsConfiguration.Id,
    analytics.Id,
  )
  assert(
    (await s3("ListBucketAnalyticsConfigurations")).AnalyticsConfigurationList.some(
      (row) => row.Id === analytics.Id,
    ),
  )
  await s3("DeleteBucketAnalyticsConfiguration", { Id: analytics.Id })

  const replica = `${bucket}-replica`
  await s3("CreateBucket", { Bucket: replica })
  await s3("PutBucketVersioning", {
    Bucket: replica,
    VersioningConfiguration: { Status: "Enabled" },
  })
  const ReplicationConfiguration = {
    Role: accessRole,
    Rules: [
      {
        ID: "fixture",
        Status: "Enabled",
        Priority: 1,
        Filter: { Prefix: "folder/" },
        DeleteMarkerReplication: { Status: "Disabled" },
        Destination: { Bucket: `arn:aws:s3:::${replica}` },
      },
    ],
  }
  await s3("PutBucketReplication", { ReplicationConfiguration })
  assert.equal(
    (await s3("GetBucketReplication")).ReplicationConfiguration.Rules[0].Destination
      .Bucket,
    `arn:aws:s3:::${replica}`,
  )
  await s3("DeleteBucketReplication")
  await s3("DeleteBucket", { Bucket: replica })

  const aclBucket = `${bucket}-acl`
  await s3("CreateBucket", {
    Bucket: aclBucket,
    ObjectOwnership: "BucketOwnerPreferred",
  })
  await s3("PutBucketAcl", { Bucket: aclBucket, ACL: "private" })
  const aclObject = { Bucket: aclBucket, Key: "owned.txt" }
  await s3("PutObject", aclObject, { file })
  await s3("PutObjectAcl", { ...aclObject, ACL: "private" })
  assert(
    (await s3("GetObjectAcl", aclObject)).Grants.some(
      (grant) => grant.Permission === "FULL_CONTROL",
    ),
  )
  await s3("DeleteObject", aclObject)
  await s3("DeleteBucket", { Bucket: aclBucket })

  const annotation = { ...object, AnnotationName: "fixture" }
  const payload = Buffer.from("myaws annotation").toString("base64")
  await s3("PutObjectAnnotation", { ...annotation, AnnotationPayload: payload })
  const stored = await s3("GetObjectAnnotation", annotation)
  const body =
    typeof stored === "string"
      ? stored
      : Buffer.from(Object.values(stored.AnnotationPayload)).toString()
  assert.equal(body, "myaws annotation")
  assert(
    (await s3("ListObjectAnnotations", object)).Annotations.some(
      (row) => row.AnnotationName === annotation.AnnotationName,
    ),
  )
  await s3("DeleteObjectAnnotation", annotation)

  const lockBucket = `${bucket}-lock`
  await s3("CreateBucket", { Bucket: lockBucket, ObjectLockEnabledForBucket: true })
  const lock = { Bucket: lockBucket }
  await s3("PutObjectLockConfiguration", {
    ...lock,
    ObjectLockConfiguration: {
      ObjectLockEnabled: "Enabled",
      Rule: { DefaultRetention: { Mode: "GOVERNANCE", Days: 1 } },
    },
  })
  assert.equal(
    (await s3("GetObjectLockConfiguration", lock)).ObjectLockConfiguration.Rule
      .DefaultRetention.Days,
    1,
  )
  const lockedObject = { ...lock, Key: "locked.txt" }
  const { VersionId } = await s3("PutObject", lockedObject, { file })
  const version = { ...lockedObject, VersionId }
  const until = new Date(Date.now() + 86_400_000).toISOString()
  await s3("PutObjectRetention", {
    ...version,
    BypassGovernanceRetention: true,
    Retention: { Mode: "GOVERNANCE", RetainUntilDate: until },
  })
  assert.equal((await s3("GetObjectRetention", version)).Retention.Mode, "GOVERNANCE")
  await s3("PutObjectLegalHold", { ...version, LegalHold: { Status: "ON" } })
  assert.equal((await s3("GetObjectLegalHold", version)).LegalHold.Status, "ON")
  await s3("PutObjectLegalHold", { ...version, LegalHold: { Status: "OFF" } })
  await s3("DeleteObject", { ...version, BypassGovernanceRetention: true })
  await s3("DeleteBucket", lock)

  const archived = { Key: "archive.txt" }
  await s3("PutObject", { ...archived, StorageClass: "GLACIER" }, { file })
  await s3("RestoreObject", {
    ...archived,
    RestoreRequest: { Days: 1, GlacierJobParameters: { Tier: "Standard" } },
  })
  assert.match((await s3("HeadObject", archived)).Restore, /ongoing-request=/)

  const dest = { Key: "multipart-copy.txt" }
  const { UploadId } = await s3("CreateMultipartUpload", dest)
  const copy = await s3("UploadPartCopy", {
    ...dest,
    CopySource: `${bucket}/${object.Key}`,
    UploadId,
    PartNumber: 1,
  })
  await s3("CompleteMultipartUpload", {
    ...dest,
    UploadId,
    MultipartUpload: { Parts: [{ PartNumber: 1, ETag: copy.CopyPartResult.ETag }] },
  })
  assert.equal(await s3("GetObject", dest), "local test object")

  const journal = { RecordExpiration: { Expiration: "ENABLED", Days: 7 } }
  await s3("CreateBucketMetadataConfiguration", {
    MetadataConfiguration: { JournalTableConfiguration: journal },
  })
  let journalTable
  for (let attempt = 0; attempt < 60; attempt++) {
    const { GetBucketMetadataConfigurationResult: metadata } = await s3(
      "GetBucketMetadataConfiguration",
    )
    journalTable =
      metadata?.MetadataConfigurationResult?.JournalTableConfigurationResult
    if (
      journalTable?.TableStatus === "ACTIVE" ||
      journalTable?.TableStatus === "FAILED"
    )
      break
    await wait(100)
  }
  assert.equal(journalTable?.TableStatus, "ACTIVE")
  await verifyManagedTable(journalTable.TableArn)
  await s3("UpdateBucketMetadataJournalTableConfiguration", {
    JournalTableConfiguration: {
      RecordExpiration: { Expiration: "ENABLED", Days: 14 },
    },
  })
  await s3("UpdateBucketMetadataInventoryTableConfiguration", {
    InventoryTableConfiguration: { ConfigurationState: "ENABLED" },
  })
  await s3("UpdateBucketMetadataAnnotationTableConfiguration", {
    AnnotationTableConfiguration: { ConfigurationState: "ENABLED", Role: accessRole },
  })
  await s3("DeleteBucketMetadataConfiguration")

  const KMSKeyArn = await createKey(environment.region)
  await s3("UpdateObjectEncryption", {
    ...object,
    ObjectEncryption: { SSEKMS: { KMSKeyArn } },
  })
  assert.equal((await s3("HeadObject", object)).ServerSideEncryption, "aws:kms")
  assert.equal(bucketArn, `arn:aws:s3:::${bucket}`)
}
