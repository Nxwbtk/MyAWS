import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { verifyBucketFeatures } from "./test-s3-bucket-features.mjs"
import {
  verifyAccessGrantsPolicy,
  verifyAccessPointPolicy,
  verifyBatchJob,
  verifyMultiRegion,
  verifyStorageLens,
} from "./test-s3-control-features.mjs"
import {
  verifyOutposts,
  verifyRecordExpiration,
  verifyTableSettings,
} from "./test-s3-tables-outposts.mjs"

// Run against a disposable emulator. The port is deliberately separate from the
// usual MyAWS instance, and the health check verifies the configured endpoint.
const app = "http://127.0.0.1:13000"
const localApi = `${app}/api/emulator/s3`
const healthResponse = await fetch(`${app}/api/emulator?kind=health`)
const health = await healthResponse.json()
assert.equal(health.endpoint, "https://127.0.0.1:19297")
assert.equal(health.connected, true)
assert.equal(health.region, "us-east-1")

const environment = await (await fetch(localApi)).json()
assert.match(environment.account, /^\d{12}$/)
assert.equal(environment.region, health.region)

const suffix = randomUUID().slice(0, 8)
const bucket = `qa-s3-${suffix}`
const calls = new Set()
const rejected = new Set()
const advancedFailures = []

async function verify(name, test) {
  try {
    await test()
  } catch (error) {
    advancedFailures.push(new Error(`${name}: ${error.message}`, { cause: error }))
  }
}

async function send(model, action, input = {}, { file, status = 200 } = {}) {
  const envelope = JSON.stringify({ model, action, input })
  const body = file ? new FormData() : envelope
  if (file) {
    body.set("request", envelope)
    body.set("file:Body", file)
  }
  const response = await fetch(localApi, {
    method: "POST",
    body,
    headers: file ? undefined : { "Content-Type": "application/json" },
  })
  if (response.headers.get("content-type") === "application/octet-stream") {
    assert.equal(response.status, status, `${model}.${action}`)
    calls.add(`${model}.${action}`)
    return response.text()
  }
  const result = await response.json()
  assert.equal(response.status, status, `${model}.${action} ${result.error ?? ""}`)
  if (status === 200) calls.add(`${model}.${action}`)
  else rejected.add(`${model}.${action} ${status}`)
  return result.data
}

const s3 = (action, input = {}, options) =>
  send("s3", action, { Bucket: bucket, ...input }, options)
const control = (action, input, options) => send("s3control", action, input, options)
const table = (action, input, options) => send("s3tables", action, input, options)
const vector = (action, input) => send("s3vectors", action, input)
const files = (action, input) => send("s3files", action, input)
const has = (rows, field, value) =>
  assert(
    rows.some((row) => row[field] === value),
    `${field} should contain ${value}`,
  )

await s3("CreateBucket", { ObjectOwnership: "BucketOwnerEnforced" })
has((await s3("ListBuckets", { Prefix: bucket })).Buckets, "Name", bucket)
assert.equal((await s3("HeadBucket")).BucketRegion, health.region)
await s3("PutBucketVersioning", { VersioningConfiguration: { Status: "Enabled" } })
assert.equal((await s3("GetBucketVersioning")).Status, "Enabled")

const tagSet = [{ Key: "project", Value: "console-test" }]
await s3("PutBucketTagging", { Tagging: { TagSet: tagSet } })
assert.deepEqual((await s3("GetBucketTagging")).TagSet, tagSet)
await s3("DeleteBucketTagging")
await s3("PutBucketCors", {
  CORSConfiguration: {
    CORSRules: [
      { AllowedOrigins: ["https://example.invalid"], AllowedMethods: ["GET"] },
    ],
  },
})
assert.deepEqual((await s3("GetBucketCors")).CORSRules[0].AllowedMethods, ["GET"])
await s3("DeleteBucketCors")

const owner = `arn:aws:iam::${environment.account}:root`
const bucketArn = `arn:aws:s3:::${bucket}`
const policy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: owner },
      Action: "s3:ListBucket",
      Resource: bucketArn,
    },
  ],
})
await s3("PutBucketPolicy", { Policy: policy })
assert.deepEqual(JSON.parse((await s3("GetBucketPolicy")).Policy), JSON.parse(policy))
assert.equal((await s3("GetBucketPolicyStatus")).PolicyStatus.IsPublic, false)
await s3("DeleteBucketPolicy")

const encryption = {
  Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }],
}
await s3("PutBucketEncryption", { ServerSideEncryptionConfiguration: encryption })
assert.equal(
  (await s3("GetBucketEncryption")).ServerSideEncryptionConfiguration.Rules[0]
    .ApplyServerSideEncryptionByDefault.SSEAlgorithm,
  "AES256",
)
await s3("DeleteBucketEncryption")
const ownership = { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] }
await s3("PutBucketOwnershipControls", { OwnershipControls: ownership })
assert.deepEqual((await s3("GetBucketOwnershipControls")).OwnershipControls, ownership)
await s3("DeleteBucketOwnershipControls")
await s3("PutBucketOwnershipControls", { OwnershipControls: ownership })
const block = {
  BlockPublicAcls: true,
  IgnorePublicAcls: true,
  BlockPublicPolicy: true,
  RestrictPublicBuckets: true,
}
await s3("PutPublicAccessBlock", { PublicAccessBlockConfiguration: block })
assert.deepEqual(
  (await s3("GetPublicAccessBlock")).PublicAccessBlockConfiguration,
  block,
)
await s3("DeletePublicAccessBlock")

await s3("PutBucketAbac", { AbacStatus: { Status: "Enabled" } })
assert.equal((await s3("GetBucketAbac")).AbacStatus.Status, "Enabled")
await s3("PutBucketAbac", { AbacStatus: { Status: "Disabled" } })
await s3("PutBucketAccelerateConfiguration", {
  AccelerateConfiguration: { Status: "Enabled" },
})
assert.equal((await s3("GetBucketAccelerateConfiguration")).Status, "Enabled")
await s3("PutBucketRequestPayment", {
  RequestPaymentConfiguration: { Payer: "Requester" },
})
assert.equal((await s3("GetBucketRequestPayment")).Payer, "Requester")
await s3("PutBucketRequestPayment", {
  RequestPaymentConfiguration: { Payer: "BucketOwner" },
})
await s3("PutBucketLogging", {
  BucketLoggingStatus: {
    LoggingEnabled: { TargetBucket: bucket, TargetPrefix: "access-log/" },
  },
})
assert.equal((await s3("GetBucketLogging")).LoggingEnabled.TargetPrefix, "access-log/")
await s3("PutBucketLogging", { BucketLoggingStatus: {} })
await s3("PutBucketNotificationConfiguration", {
  NotificationConfiguration: { EventBridgeConfiguration: {} },
})
assert.deepEqual(
  (await s3("GetBucketNotificationConfiguration")).EventBridgeConfiguration,
  {},
)
await s3("PutBucketNotificationConfiguration", { NotificationConfiguration: {} })
await s3("PutBucketWebsite", {
  WebsiteConfiguration: { IndexDocument: { Suffix: "index.html" } },
})
assert.equal((await s3("GetBucketWebsite")).IndexDocument.Suffix, "index.html")
await s3("DeleteBucketWebsite")
await s3("PutBucketLifecycleConfiguration", {
  LifecycleConfiguration: {
    Rules: [
      {
        ID: "expire-test",
        Status: "Enabled",
        Filter: { Prefix: "ephemeral/" },
        Expiration: { Days: 7 },
      },
    ],
  },
})
assert.equal((await s3("GetBucketLifecycleConfiguration")).Rules[0].ID, "expire-test")
await s3("DeleteBucketLifecycle")

const metrics = { Id: "qa", Filter: { Prefix: "data/" } }
await s3("PutBucketMetricsConfiguration", { Id: "qa", MetricsConfiguration: metrics })
assert.deepEqual(
  (await s3("GetBucketMetricsConfiguration", { Id: "qa" })).MetricsConfiguration,
  metrics,
)
has((await s3("ListBucketMetricsConfigurations")).MetricsConfigurationList, "Id", "qa")
await s3("DeleteBucketMetricsConfiguration", { Id: "qa" })

const inventory = {
  Id: "qa",
  IsEnabled: true,
  IncludedObjectVersions: "All",
  Schedule: { Frequency: "Daily" },
  Destination: { S3BucketDestination: { Bucket: bucketArn, Format: "CSV" } },
}
await s3("PutBucketInventoryConfiguration", {
  Id: "qa",
  InventoryConfiguration: inventory,
})
assert.equal(
  (await s3("GetBucketInventoryConfiguration", { Id: "qa" })).InventoryConfiguration
    .Schedule.Frequency,
  "Daily",
)
has(
  (await s3("ListBucketInventoryConfigurations")).InventoryConfigurationList,
  "Id",
  "qa",
)
await s3("DeleteBucketInventoryConfiguration", { Id: "qa" })

const tiering = {
  Id: "qa",
  Status: "Enabled",
  Tierings: [{ AccessTier: "ARCHIVE_ACCESS", Days: 90 }],
}
await s3("PutBucketIntelligentTieringConfiguration", {
  Id: "qa",
  IntelligentTieringConfiguration: tiering,
})
assert.equal(
  (await s3("GetBucketIntelligentTieringConfiguration", { Id: "qa" }))
    .IntelligentTieringConfiguration.Status,
  "Enabled",
)
has(
  (await s3("ListBucketIntelligentTieringConfigurations"))
    .IntelligentTieringConfigurationList,
  "Id",
  "qa",
)
await s3("DeleteBucketIntelligentTieringConfiguration", { Id: "qa" })
assert((await s3("GetBucketAcl")).Owner.ID)

const file = new File(["local test object"], "hello.txt", { type: "text/plain" })
const key = "folder/hello.txt"
const original = await s3(
  "PutObject",
  { Key: key, ContentType: file.type, Metadata: { fixture: "true" } },
  { file },
)
assert.ok(original.VersionId)
has((await s3("ListObjectsV2", { Delimiter: "/" })).CommonPrefixes, "Prefix", "folder/")
has((await s3("ListObjectsV2", { Prefix: "folder/" })).Contents, "Key", key)
assert.equal((await s3("HeadObject", { Key: key })).Metadata.fixture, "true")
assert.equal(
  (await s3("GetObjectAttributes", { Key: key, ObjectAttributes: ["ObjectSize"] }))
    .ObjectSize,
  file.size,
)
has((await s3("ListObjects", { Prefix: "folder/" })).Contents, "Key", key)
assert.equal(await s3("GetObject", { Key: key }), "local test object")
await s3("PutObjectTagging", { Key: key, Tagging: { TagSet: tagSet } })
assert.deepEqual((await s3("GetObjectTagging", { Key: key })).TagSet, tagSet)
await s3("DeleteObjectTagging", { Key: key })
await s3("CopyObject", { Key: "copy.txt", CopySource: `${bucket}/${key}` })
assert.equal(await s3("GetObject", { Key: "copy.txt" }), "local test object")
await s3("DeleteObject", { Key: key })
const versioned = await s3("ListObjectVersions")
has(versioned.DeleteMarkers, "Key", key)
assert.equal(
  await s3("GetObject", { Key: key, VersionId: original.VersionId }),
  "local test object",
)
await s3("DeleteBucket", {}, { status: 409 })

const multipart = await s3("CreateMultipartUpload", { Key: "multipart.txt" })
const part = await s3(
  "UploadPart",
  { Key: "multipart.txt", UploadId: multipart.UploadId, PartNumber: 1 },
  { file },
)
has(
  (await s3("ListParts", { Key: "multipart.txt", UploadId: multipart.UploadId })).Parts,
  "ETag",
  part.ETag,
)
await s3("CompleteMultipartUpload", {
  Key: "multipart.txt",
  UploadId: multipart.UploadId,
  MultipartUpload: { Parts: [{ PartNumber: 1, ETag: part.ETag }] },
})
assert.equal(await s3("GetObject", { Key: "multipart.txt" }), "local test object")
const abandoned = await s3("CreateMultipartUpload", { Key: "abandoned.txt" })
has((await s3("ListMultipartUploads")).Uploads, "UploadId", abandoned.UploadId)
await s3("AbortMultipartUpload", {
  Key: abandoned.Key ?? "abandoned.txt",
  UploadId: abandoned.UploadId,
})

const access = `qa-${suffix}`
const accessPoint = await control("CreateAccessPoint", { Bucket: bucket, Name: access })
has((await control("ListAccessPoints")).AccessPointList, "Name", access)
assert.equal((await control("GetAccessPoint", { Name: access })).Bucket, bucket)
assert.equal(
  await s3("GetObject", { Bucket: accessPoint.Alias, Key: "copy.txt" }),
  "local test object",
)
await verify("access point policies", () =>
  verifyAccessPointPolicy(control, { access, accessPoint, owner }),
)
await control("DeleteAccessPoint", { Name: access })
assert(Array.isArray((await control("ListJobs")).Jobs))
assert(
  Array.isArray(
    (await control("ListStorageLensConfigurations")).StorageLensConfigurationList ?? [],
  ),
)
await control("ListAccessGrantsInstances", {}, { status: 501 })

const accessRole = `arn:aws:iam::${environment.account}:role/ConsoleFixture`
await verify("bucket and object features", () =>
  verifyBucketFeatures(s3, {
    bucket,
    bucketArn,
    accessRole,
    file,
    environment,
    verifyManagedTable: (tableArn) =>
      verify("record expiration", () => verifyRecordExpiration(table, tableArn)),
  }),
)
await control("CreateAccessGrantsInstance")
assert.ok((await control("GetAccessGrantsInstance")).AccessGrantsInstanceArn)
const location = await control("CreateAccessGrantsLocation", {
  IAMRoleArn: accessRole,
  LocationScope: `s3://${bucket}/`,
})
const accessLocation = { AccessGrantsLocationId: location.AccessGrantsLocationId }
has(
  (await control("ListAccessGrantsLocations")).AccessGrantsLocationsList,
  "AccessGrantsLocationId",
  accessLocation.AccessGrantsLocationId,
)
assert.equal(
  (await control("GetAccessGrantsLocation", accessLocation)).IAMRoleArn,
  accessRole,
)
await control("UpdateAccessGrantsLocation", {
  ...accessLocation,
  IAMRoleArn: accessRole,
})
const grant = await control("CreateAccessGrant", {
  ...accessLocation,
  Grantee: { GranteeType: "IAM", GranteeIdentifier: accessRole },
  Permission: "READ",
})
const accessGrant = { AccessGrantId: grant.AccessGrantId }
has(
  (await control("ListAccessGrants")).AccessGrantsList,
  "AccessGrantId",
  accessGrant.AccessGrantId,
)
assert.equal((await control("GetAccessGrant", accessGrant)).Permission, "READ")
await control("DeleteAccessGrant", accessGrant)
await verify("access grants policies", () =>
  verifyAccessGrantsPolicy(control, {
    account: environment.account,
    owner,
    bucket,
    accessLocation,
  }),
)
await control("DeleteAccessGrantsLocation", accessLocation)
await control("DeleteAccessGrantsInstance")

await verify("batch jobs", () => verifyBatchJob(control, { bucketArn, accessRole }))
await verify("storage lens", () => verifyStorageLens(control, suffix))
await verify("multi-region access points", () =>
  verifyMultiRegion(control, {
    bucket,
    account: environment.account,
    owner,
    region: environment.region,
    suffix,
  }),
)

await control("PutPublicAccessBlock", { PublicAccessBlockConfiguration: block })
assert.deepEqual(
  (await control("GetPublicAccessBlock")).PublicAccessBlockConfiguration,
  block,
)
await control("DeletePublicAccessBlock")

const fileSystem = await files("CreateFileSystem", {
  bucket: `arn:aws:s3:::${bucket}`,
  roleArn: accessRole,
  acceptBucketWarning: true,
})
const fileSystemId = fileSystem.fileSystemId
has((await files("ListFileSystems")).fileSystems, "fileSystemId", fileSystemId)
assert.equal(
  (await files("GetFileSystem", { fileSystemId })).bucket,
  `arn:aws:s3:::${bucket}`,
)
const fileAccess = await files("CreateAccessPoint", { fileSystemId })
has(
  (await files("ListAccessPoints", { fileSystemId })).accessPoints,
  "accessPointId",
  fileAccess.accessPointId,
)
assert.equal(
  (await files("GetAccessPoint", { accessPointId: fileAccess.accessPointId }))
    .fileSystemId,
  fileSystemId,
)
await files("DeleteAccessPoint", { accessPointId: fileAccess.accessPointId })
const fileArn = fileSystem.fileSystemArn
const filePolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: owner },
      Action: "s3files:GetFileSystem",
      Resource: fileArn,
    },
  ],
})
await files("PutFileSystemPolicy", { fileSystemId, policy: filePolicy })
assert.deepEqual(
  JSON.parse((await files("GetFileSystemPolicy", { fileSystemId })).policy),
  JSON.parse(filePolicy),
)
await files("DeleteFileSystemPolicy", { fileSystemId })
const importDataRules = [
  { prefix: "sample/", trigger: "ON_FILE_ACCESS", sizeLessThan: 1_048_576 },
]
await files("PutSynchronizationConfiguration", {
  fileSystemId,
  importDataRules,
  expirationDataRules: [{ daysAfterLastAccess: 30 }],
})
assert.deepEqual(
  (await files("GetSynchronizationConfiguration", { fileSystemId })).importDataRules,
  importDataRules,
)
await files("TagResource", {
  resourceId: fileSystemId,
  tags: [{ key: "fixture", value: "true" }],
})
has(
  (await files("ListTagsForResource", { resourceId: fileSystemId })).tags,
  "key",
  "fixture",
)
await files("UntagResource", { resourceId: fileSystemId, tagKeys: ["fixture"] })
const subnetsResponse = await fetch(`${app}/api/emulator?kind=ec2&section=subnets`)
const subnet = (await subnetsResponse.json())[0]
assert.ok(subnet?.id, "The disposable emulator needs a default subnet")
const groupsResponse = await fetch(
  `${app}/api/emulator?kind=ec2&section=security-groups`,
)
const group = (await groupsResponse.json()).find(
  (row) => row.fields.vpcId === subnet.fields.vpcId,
)
assert.ok(group?.id, "The disposable emulator needs a default security group")
const { mountTargetId } = await files("CreateMountTarget", {
  fileSystemId,
  subnetId: subnet.id,
  securityGroups: [group.id],
})
assert.equal((await files("GetMountTarget", { mountTargetId })).subnetId, subnet.id)
has(
  (await files("ListMountTargets", { fileSystemId })).mountTargets,
  "mountTargetId",
  mountTargetId,
)
assert.deepEqual(
  (await files("UpdateMountTarget", { mountTargetId, securityGroups: [group.id] }))
    .securityGroups,
  [group.id],
)
await files("DeleteMountTarget", { mountTargetId })
await files("DeleteFileSystem", { fileSystemId })

const directory = `${bucket}--use1-az4--x-s3`
await s3("CreateBucket", {
  Bucket: directory,
  CreateBucketConfiguration: {
    Location: { Type: "AvailabilityZone", Name: "use1-az4" },
    Bucket: { Type: "Directory", DataRedundancy: "SingleAvailabilityZone" },
  },
})
has((await s3("ListDirectoryBuckets")).Buckets, "Name", directory)
assert.ok((await s3("CreateSession", { Bucket: directory })).Credentials.SessionToken)
await s3("PutObject", { Bucket: directory, Key: "before.txt" }, { file })
has((await s3("ListObjectsV2", { Bucket: directory })).Contents, "Key", "before.txt")
await s3("RenameObject", {
  Bucket: directory,
  Key: "after.txt",
  RenameSource: "before.txt",
})
assert.equal(
  await s3("GetObject", { Bucket: directory, Key: "after.txt" }),
  "local test object",
)
await s3("DeleteObject", { Bucket: directory, Key: "after.txt" })
await s3("DeleteBucket", { Bucket: directory })

const tableBucket = await table("CreateTableBucket", { name: bucket })
const tableBucketARN = tableBucket.arn
has((await table("ListTableBuckets", {})).tableBuckets, "name", bucket)
await table("CreateNamespace", { tableBucketARN, namespace: ["qa"] })
assert(
  (await table("ListNamespaces", { tableBucketARN })).namespaces.some(
    (row) => row.namespace[0] === "qa",
  ),
)
const tableId = { tableBucketARN, namespace: "qa", name: "events" }
await table("CreateTable", { ...tableId, format: "ICEBERG" })
has((await table("ListTables", tableId)).tables, "name", tableId.name)
const tableInfo = await table("GetTable", tableId)
assert.equal(tableInfo.name, tableId.name)
assert.equal((await table("GetTableBucket", { tableBucketARN })).name, bucket)
await table("PutTableBucketEncryption", {
  tableBucketARN,
  encryptionConfiguration: { sseAlgorithm: "AES256" },
})
assert.equal(
  (await table("GetTableBucketEncryption", { tableBucketARN })).encryptionConfiguration
    .sseAlgorithm,
  "AES256",
)
await table("DeleteTableBucketEncryption", { tableBucketARN })
await table("PutTableBucketStorageClass", {
  tableBucketARN,
  storageClassConfiguration: { storageClass: "STANDARD" },
})
assert.equal(
  (await table("GetTableBucketStorageClass", { tableBucketARN }))
    .storageClassConfiguration.storageClass,
  "STANDARD",
)
const tableArn = tableInfo.tableARN
await table("TagResource", { resourceArn: tableArn, tags: { project: "test" } })
assert.equal(
  (await table("ListTagsForResource", { resourceArn: tableArn })).tags.project,
  "test",
)
await table("UntagResource", { resourceArn: tableArn, tagKeys: ["project"] })
await verify("table settings", () =>
  verifyTableSettings(table, {
    tableBucketARN,
    tableId,
    tableInfo,
    bucket,
    owner,
    accessRole,
  }),
)
await table("RenameTable", { ...tableId, newName: "events_renamed" })
const renamed = { ...tableId, name: "events_renamed" }
assert.equal((await table("GetTable", renamed)).name, renamed.name)
await table("DeleteTable", renamed)
await table("DeleteNamespace", { tableBucketARN, namespace: "qa" })
await table("DeleteTableBucket", { tableBucketARN })

const vectorBucketName = bucket
const index = { vectorBucketName, indexName: "vectors" }
const { vectorBucketArn } = await vector("CreateVectorBucket", { vectorBucketName })
has(
  (await vector("ListVectorBuckets", {})).vectorBuckets,
  "vectorBucketName",
  vectorBucketName,
)
assert.equal(
  (await vector("GetVectorBucket", { vectorBucketName })).vectorBucket.vectorBucketName,
  vectorBucketName,
)
await vector("TagResource", { resourceArn: vectorBucketArn, tags: { project: "test" } })
assert.equal(
  (await vector("ListTagsForResource", { resourceArn: vectorBucketArn })).tags.project,
  "test",
)
await vector("UntagResource", { resourceArn: vectorBucketArn, tagKeys: ["project"] })
await vector("PutVectorBucketDefaultIndexMode", {
  vectorBucketName,
  defaultIndexMode: "CLASSIC",
})
const vectorPolicy = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { AWS: owner },
      Action: "s3vectors:ListIndexes",
      Resource: vectorBucketArn,
    },
  ],
})
await vector("PutVectorBucketPolicy", { vectorBucketName, policy: vectorPolicy })
assert.deepEqual(
  JSON.parse((await vector("GetVectorBucketPolicy", { vectorBucketName })).policy),
  JSON.parse(vectorPolicy),
)
await vector("DeleteVectorBucketPolicy", { vectorBucketName })
await vector("CreateIndex", {
  ...index,
  dataType: "float32",
  dimension: 2,
  distanceMetric: "euclidean",
})
has(
  (await vector("ListIndexes", { vectorBucketName })).indexes,
  "indexName",
  index.indexName,
)
assert.equal((await vector("GetIndex", index)).index.indexName, index.indexName)
const data = { float32: [0.25, 0.5] }
await vector("PutVectors", {
  ...index,
  vectors: [{ key: "sample", data, metadata: { category: "test" } }],
})
has((await vector("ListVectors", index)).vectors, "key", "sample")
has(
  (await vector("GetVectors", { ...index, keys: ["sample"], returnData: true }))
    .vectors,
  "key",
  "sample",
)
has(
  (await vector("QueryVectors", { ...index, queryVector: data, topK: 1 })).vectors,
  "key",
  "sample",
)
await vector("DeleteVectors", { ...index, keys: ["sample"] })
await vector("DeleteIndex", index)
await vector("DeleteVectorBucket", { vectorBucketName })

assert(Array.isArray((await send("s3outposts", "ListOutpostsWithS3")).Outposts))
assert(Array.isArray((await send("s3outposts", "ListEndpoints")).Endpoints))
await verify("outposts", () => verifyOutposts(send, { subnet, group }))
await send(
  "s3outposts",
  "CreateEndpoint",
  {
    OutpostId: "op-12345678901234567",
    SubnetId: "subnet-12345678901234567",
    SecurityGroupId: "sg-12345678901234567",
  },
  { status: 404 },
)

const allVersions = await s3("ListObjectVersions")
const remove = [...allVersions.Versions, ...allVersions.DeleteMarkers].map(
  ({ Key, VersionId }) => ({ Key, VersionId }),
)
const deleted = await s3("DeleteObjects", { Delete: { Objects: remove } })
assert(!deleted.Errors?.length)
await s3("DeleteBucket")
assert(
  !(await s3("ListBuckets", { Prefix: bucket })).Buckets.some(
    ({ Name }) => Name === bucket,
  ),
)

const crossOrigin = await fetch(localApi, {
  method: "POST",
  headers: { Origin: "https://example.invalid", "Content-Type": "application/json" },
  body: JSON.stringify({ model: "s3", action: "ListBuckets", input: {} }),
})
assert.equal(crossOrigin.status, 403)
await send("s3", "UnknownAction", {}, { status: 404 })
await send("s3", "SelectObjectContent", {}, { status: 501 })

console.log(`${calls.size} unique operation successes across six S3 models`)
for (const name of [...calls].sort()) console.log(name)
console.log(`${rejected.size} expected refusals`)
for (const item of [...rejected].sort()) console.log(item)
if (advancedFailures.length) {
  for (const failure of advancedFailures) console.error(failure.message)
  process.exitCode = 1
}
const operationInventory = JSON.parse(
  await readFile(new URL("../src/data/s3-operations.json", import.meta.url), "utf8"),
)
const supported = Object.entries(operationInventory).flatMap(([model, entries]) =>
  Object.entries(entries)
    .filter(([, entry]) => entry.state === "available")
    .map(([name]) => `${model}.${name}`),
)
const missing = supported.filter((operation) => !calls.has(operation))
assert.deepEqual(
  missing,
  [],
  "Some catalogued S3 operations have no successful emulator scenario",
)
