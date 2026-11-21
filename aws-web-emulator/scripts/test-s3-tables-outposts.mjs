import assert from "node:assert/strict"
import { setTimeout as wait } from "node:timers/promises"

export async function verifyTableSettings(
  table,
  { tableBucketARN, tableId, tableInfo, bucket, owner, accessRole },
) {
  const bucketInput = { tableBucketARN }
  const namespace = { ...bucketInput, namespace: tableId.namespace }
  const tableArn = tableInfo.tableARN
  const tableByArn = { tableArn }
  const namespaceInfo = await table("GetNamespace", namespace)
  assert.deepEqual(namespaceInfo.namespace, [tableId.namespace])
  assert.ok(
    (await table("GetTableEncryption", tableId)).encryptionConfiguration.sseAlgorithm,
  )
  assert.ok(
    (await table("GetTableStorageClass", tableId)).storageClassConfiguration
      .storageClass,
  )

  const maintenanceType = "icebergUnreferencedFileRemoval"
  const bucketMaintenance = {
    status: "disabled",
    settings: {
      icebergUnreferencedFileRemoval: { unreferencedDays: 7, nonCurrentDays: 14 },
    },
  }
  await table("PutTableBucketMaintenanceConfiguration", {
    ...bucketInput,
    type: maintenanceType,
    value: bucketMaintenance,
  })
  const maintenance = await table("GetTableBucketMaintenanceConfiguration", bucketInput)
  assert.equal(maintenance.configuration[maintenanceType].status, "disabled")

  await table("PutTableBucketMetricsConfiguration", bucketInput)
  const metrics = await table("GetTableBucketMetricsConfiguration", bucketInput)
  assert.equal(metrics.id, "EntireBucket")
  await table("DeleteTableBucketMetricsConfiguration", bucketInput)
  await table("GetTableBucketMetricsConfiguration", bucketInput, { status: 404 })

  const resourcePolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: owner },
        Action: "s3tables:GetTableBucket",
        Resource: tableBucketARN,
      },
    ],
  })
  await table("PutTableBucketPolicy", { ...bucketInput, resourcePolicy })
  assert.deepEqual(
    JSON.parse((await table("GetTableBucketPolicy", bucketInput)).resourcePolicy),
    JSON.parse(resourcePolicy),
  )
  await table("DeleteTableBucketPolicy", bucketInput)
  await table("GetTableBucketPolicy", bucketInput, { status: 404 })

  const compaction = {
    status: "disabled",
    settings: { icebergCompaction: { targetFileSizeMB: 128, strategy: "binpack" } },
  }
  await table("PutTableMaintenanceConfiguration", {
    ...tableId,
    type: "icebergCompaction",
    value: compaction,
  })
  assert.equal(
    (await table("GetTableMaintenanceConfiguration", tableId)).configuration
      .icebergCompaction.status,
    "disabled",
  )
  assert.ok((await table("GetTableMaintenanceJobStatus", tableId)).status)

  const before = await table("GetTableMetadataLocation", tableId)
  const nextLocation = `${before.warehouseLocation}/metadata/qa.metadata.json`
  await table("UpdateTableMetadataLocation", {
    ...tableId,
    metadataLocation: nextLocation,
    versionToken: before.versionToken,
  })
  const after = await table("GetTableMetadataLocation", tableId)
  assert.equal(after.metadataLocation, nextLocation)
  assert.equal(after.versionToken, before.versionToken)

  const { arn: destinationTableBucketARN } = await table("CreateTableBucket", {
    name: `${bucket}-replica`,
  })
  const configuration = {
    role: accessRole,
    rules: [{ destinations: [{ destinationTableBucketARN }] }],
  }
  await table("PutTableBucketReplication", { ...bucketInput, configuration })
  assert.deepEqual(
    (await table("GetTableBucketReplication", bucketInput)).configuration,
    configuration,
  )
  await table("DeleteTableBucketReplication", bucketInput)
  await table("GetTableBucketReplication", bucketInput, { status: 404 })
  await table("PutTableReplication", { ...tableByArn, configuration })
  const replication = await table("GetTableReplication", tableByArn)
  assert.deepEqual(replication.configuration, configuration)
  assert.ok(Object.keys(await table("GetTableReplicationStatus", tableByArn)).length)
  await table("DeleteTableReplication", {
    ...tableByArn,
    versionToken: replication.versionToken,
  })
  await table("GetTableReplication", tableByArn, { status: 404 })
  const replicaInput = { ...tableId, tableBucketARN: destinationTableBucketARN }
  const replicas = await table("ListTables", replicaInput)
  assert(replicas.tables.some((row) => row.name === tableId.name))
  await table("DeleteTable", replicaInput)
  await table("DeleteNamespace", {
    ...namespace,
    tableBucketARN: destinationTableBucketARN,
  })
  await table("DeleteTableBucket", { tableBucketARN: destinationTableBucketARN })
}

export async function verifyRecordExpiration(table, tableArn) {
  const input = { tableArn }
  await table("PutTableRecordExpirationConfiguration", {
    ...input,
    value: { status: "enabled", settings: { days: 30 } },
  })
  assert.equal(
    (await table("GetTableRecordExpirationConfiguration", input)).configuration.settings
      .days,
    30,
  )
  assert.ok((await table("GetTableRecordExpirationJobStatus", input)).status)
}

export async function verifyOutposts(send, { subnet, group }) {
  const call = (action, input, options) => send("s3outposts", action, input, options)
  const OutpostId = "op-0a1b2c3d4e5f60718"
  const SharedOutpostId = "op-2c3d4e5f607182930"
  const { Outposts } = await call("ListOutpostsWithS3")
  assert(
    Outposts.some((row) => row.OutpostId === OutpostId),
    "Start the isolated emulator with the documented Outposts fixtures",
  )
  const input = { SubnetId: subnet.id, SecurityGroupId: group.id }
  const { EndpointArn } = await call("CreateEndpoint", { ...input, OutpostId })
  assert(
    (await call("ListEndpoints")).Endpoints.some(
      (row) => row.EndpointArn === EndpointArn,
    ),
  )
  await call("DeleteEndpoint", { OutpostId, EndpointId: EndpointArn.split("/").at(-1) })

  const shared = await call("CreateEndpoint", { ...input, OutpostId: SharedOutpostId })
  const listed = await call("ListSharedEndpoints", { OutpostId: SharedOutpostId })
  assert(listed.Endpoints.some((row) => row.EndpointArn === shared.EndpointArn))
  await call("DeleteEndpoint", {
    OutpostId: SharedOutpostId,
    EndpointId: shared.EndpointArn.split("/").at(-1),
  })
  for (let attempt = 0; attempt < 20; attempt++) {
    const visible = (await call("ListEndpoints")).Endpoints.some(
      (row) => row.EndpointArn === EndpointArn,
    )
    const sharedVisible = (
      await call("ListSharedEndpoints", { OutpostId: SharedOutpostId })
    ).Endpoints.some((row) => row.EndpointArn === shared.EndpointArn)
    if (!visible && !sharedVisible) return
    await wait(100)
  }
  assert.fail("The endpoint deletions did not settle")
}
