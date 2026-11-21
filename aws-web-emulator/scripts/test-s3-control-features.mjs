import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { setTimeout as wait } from "node:timers/promises"

const tags = [{ Key: "test", Value: "phase-one" }]

function document(principal, action, resource) {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: principal },
        Action: action,
        Resource: resource,
      },
    ],
  })
}

export async function verifyAccessPointPolicy(control, { access, accessPoint, owner }) {
  const input = { Name: access }
  const ResourceArn = accessPoint.AccessPointArn
  const Policy = document(owner, "s3:GetObject", `${ResourceArn}/object/*`)
  await control("PutAccessPointPolicy", { ...input, Policy })
  assert.deepEqual(
    JSON.parse((await control("GetAccessPointPolicy", input)).Policy),
    JSON.parse(Policy),
  )
  assert.equal(
    (await control("GetAccessPointPolicyStatus", input)).PolicyStatus.IsPublic,
    false,
  )
  await control("DeleteAccessPointPolicy", input)
  await control("TagResource", { ResourceArn, Tags: tags })
  assert(
    (await control("ListTagsForResource", { ResourceArn })).Tags.some(
      (tag) => tag.Key === tags[0].Key,
    ),
  )
  await control("UntagResource", { ResourceArn, TagKeys: [tags[0].Key] })
}

export async function verifyAccessGrantsPolicy(
  control,
  { account, owner, bucket, accessLocation },
) {
  const instance = await control("GetAccessGrantsInstance")
  const Policy = document(owner, "s3:GetDataAccess", instance.AccessGrantsInstanceArn)
  await control("PutAccessGrantsInstanceResourcePolicy", { Policy })
  assert.deepEqual(
    JSON.parse((await control("GetAccessGrantsInstanceResourcePolicy")).Policy),
    JSON.parse(Policy),
  )
  await control("DeleteAccessGrantsInstanceResourcePolicy")
  await control("DissociateAccessGrantsIdentityCenter")

  const grant = await control("CreateAccessGrant", {
    ...accessLocation,
    Grantee: {
      GranteeType: "IAM",
      GranteeIdentifier: `arn:aws:iam::${account}:user/emulator`,
    },
    Permission: "READ",
  })
  try {
    assert(
      (await control("ListCallerAccessGrants")).CallerAccessGrantsList.some(
        (row) => row.Permission === "READ",
      ),
    )
    const issued = await control("GetDataAccess", {
      Permission: "READ",
      Target: `s3://${bucket}/copy.txt`,
    })
    assert.ok(issued.Credentials.AccessKeyId)
    assert.ok(issued.Credentials.SessionToken)
  } finally {
    await control("DeleteAccessGrant", { AccessGrantId: grant.AccessGrantId })
  }
}

export async function verifyBatchJob(control, { bucketArn, accessRole }) {
  const requested = await control("CreateJob", {
    ClientRequestToken: randomUUID(),
    ConfirmationRequired: true,
    Priority: 10,
    RoleArn: accessRole,
    Operation: { S3DeleteObjectTagging: {} },
    Report: { Enabled: false },
    ManifestGenerator: {
      S3JobManifestGenerator: { SourceBucket: bucketArn, EnableManifestOutput: false },
    },
  })
  const input = { JobId: requested.JobId }
  assert.equal((await control("DescribeJob", input)).Job.Status, "Suspended")
  await control("UpdateJobPriority", { ...input, Priority: 25 })
  assert.equal((await control("DescribeJob", input)).Job.Priority, 25)
  await control("PutJobTagging", { ...input, Tags: tags })
  assert.deepEqual((await control("GetJobTagging", input)).Tags, tags)
  await control("DeleteJobTagging", input)
  await control("UpdateJobStatus", { ...input, RequestedJobStatus: "Cancelled" })
  assert.match((await control("DescribeJob", input)).Job.Status, /^Cancel/)
}

export async function verifyStorageLens(control, suffix) {
  const ConfigId = `qa-${suffix}`
  const input = { ConfigId }
  await control("PutStorageLensConfiguration", {
    ...input,
    StorageLensConfiguration: {
      Id: ConfigId,
      AccountLevel: { BucketLevel: {} },
      IsEnabled: true,
    },
  })
  assert.equal(
    (await control("GetStorageLensConfiguration", input)).StorageLensConfiguration.Id,
    ConfigId,
  )
  await control("PutStorageLensConfigurationTagging", { ...input, Tags: tags })
  assert.deepEqual(
    (await control("GetStorageLensConfigurationTagging", input)).Tags,
    tags,
  )
  await control("DeleteStorageLensConfigurationTagging", input)
  await control("DeleteStorageLensConfiguration", input)

  const Name = `qa-group-${suffix}`
  await control("CreateStorageLensGroup", {
    StorageLensGroup: { Name, Filter: { MatchAnyPrefix: ["before/"] } },
  })
  assert.equal(
    (await control("GetStorageLensGroup", { Name })).StorageLensGroup.Name,
    Name,
  )
  await control("UpdateStorageLensGroup", {
    Name,
    StorageLensGroup: { Name, Filter: { MatchAnyPrefix: ["after/"] } },
  })
  assert.deepEqual(
    (await control("GetStorageLensGroup", { Name })).StorageLensGroup.Filter
      .MatchAnyPrefix,
    ["after/"],
  )
  await control("DeleteStorageLensGroup", { Name })
}

export async function verifyMultiRegion(
  control,
  { bucket, account, owner, region, suffix },
) {
  const Name = `qa-mrap-${suffix}`
  const created = await control("CreateMultiRegionAccessPoint", {
    ClientToken: randomUUID(),
    Details: { Name, Regions: [{ Bucket: bucket }] },
  })
  assert.ok(
    (
      await control("DescribeMultiRegionAccessPointOperation", {
        RequestTokenARN: created.RequestTokenARN,
      })
    ).AsyncOperation,
  )
  // Requests expose a pending status while the local control plane settles.
  await wait(650)
  const { AccessPoint } = await control("GetMultiRegionAccessPoint", { Name })
  assert.equal(AccessPoint.Name, Name)
  assert(
    (await control("ListMultiRegionAccessPoints")).AccessPoints.some(
      (row) => row.Name === Name,
    ),
  )
  const Mrap = AccessPoint.Alias
  const Policy = document(
    owner,
    "s3:GetObject",
    `arn:aws:s3::${account}:accesspoint/${Mrap}/object/*`,
  )
  await control("PutMultiRegionAccessPointPolicy", {
    ClientToken: randomUUID(),
    Details: { Name, Policy },
  })
  await wait(650)
  assert.ok((await control("GetMultiRegionAccessPointPolicy", { Name })).Policy)
  assert.equal(
    (await control("GetMultiRegionAccessPointPolicyStatus", { Name })).Established
      .IsPublic,
    false,
  )
  await control("SubmitMultiRegionAccessPointRoutes", {
    Mrap,
    RouteUpdates: [{ Bucket: bucket, Region: region, TrafficDialPercentage: 100 }],
  })
  assert(
    (await control("GetMultiRegionAccessPointRoutes", { Mrap })).Routes.some(
      (route) => route.Bucket === bucket && route.TrafficDialPercentage === 100,
    ),
  )
  await control("DeleteMultiRegionAccessPoint", {
    ClientToken: randomUUID(),
    Details: { Name },
  })
}
