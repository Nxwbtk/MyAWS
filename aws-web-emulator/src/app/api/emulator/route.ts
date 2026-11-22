import { Buffer } from "node:buffer"
import * as ACMsdk from "@aws-sdk/client-acm"
import * as AccessAnalyzerSdk from "@aws-sdk/client-accessanalyzer"
import * as AioPsSdk from "@aws-sdk/client-aiops"
import * as AppMeshSdk from "@aws-sdk/client-app-mesh"
import * as ARCRegionSwitchSdk from "@aws-sdk/client-arc-region-switch"
import * as ARCZonalShiftSdk from "@aws-sdk/client-arc-zonal-shift"
import * as ApplicationInsightsSdk from "@aws-sdk/client-application-insights"
import * as ApplicationSignalsSdk from "@aws-sdk/client-application-signals"
import * as CloudFrontSdk from "@aws-sdk/client-cloudfront"
import * as CloudFrontKeyValueStoreSdk from "@aws-sdk/client-cloudfront-keyvaluestore"
import * as CloudTrailSdk from "@aws-sdk/client-cloudtrail"
import * as CloudTrailDataSdk from "@aws-sdk/client-cloudtrail-data"
import * as CloudWatchSdk from "@aws-sdk/client-cloudwatch"
import * as CloudWatchLogsSdk from "@aws-sdk/client-cloudwatch-logs"
import * as CloudWatchOmniSdk from "@aws-sdk/client-cloudwatchomni"
import {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  paginateListBuckets,
  PutObjectCommand,
  S3Client,
  type BucketLocationConstraint,
} from "@aws-sdk/client-s3"
import {
  CreateTableCommand,
  DeleteItemCommand,
  DescribeTableCommand,
  DynamoDBClient,
  paginateListTables,
  PutItemCommand,
  ScanCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb"
import * as DynamoDBSdk from "@aws-sdk/client-dynamodb"
import * as DaxSdk from "@aws-sdk/client-dax"
import * as DynamoDBStreamsSdk from "@aws-sdk/client-dynamodb-streams"
import * as Ec2Sdk from "@aws-sdk/client-ec2"
import * as Ec2InstanceConnectSdk from "@aws-sdk/client-ec2-instance-connect"
import * as DirectConnectSdk from "@aws-sdk/client-direct-connect"
import * as ElasticLoadBalancingSdk from "@aws-sdk/client-elastic-load-balancing"
import * as ElasticLoadBalancingV2Sdk from "@aws-sdk/client-elastic-load-balancing-v2"
import * as GlobalAcceleratorSdk from "@aws-sdk/client-global-accelerator"
import * as IamSdk from "@aws-sdk/client-iam"
import * as IamToolboxSdk from "@aws-sdk/client-iam-toolbox"
import * as InterconnectSdk from "@aws-sdk/client-interconnect"
import * as InternetMonitorSdk from "@aws-sdk/client-internetmonitor"
import * as LambdaSdk from "@aws-sdk/client-lambda"
import * as LambdaCoreSdk from "@aws-sdk/client-lambda-core"
import * as LambdaWebSdk from "@aws-sdk/client-lambda-web"
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  paginateListQueues,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs"
import * as SqsSdk from "@aws-sdk/client-sqs"
import * as NetworkFlowMonitorSdk from "@aws-sdk/client-networkflowmonitor"
import * as NetworkManagerSdk from "@aws-sdk/client-networkmanager"
import * as NetworkMonitorSdk from "@aws-sdk/client-networkmonitor"
import * as OamSdk from "@aws-sdk/client-oam"
import * as ObservabilityAdminSdk from "@aws-sdk/client-observabilityadmin"
import * as Route53Sdk from "@aws-sdk/client-route-53"
import * as Route53DomainsSdk from "@aws-sdk/client-route-53-domains"
import * as Route53RecoveryClusterSdk from "@aws-sdk/client-route53-recovery-cluster"
import * as Route53RecoveryControlConfigSdk from "@aws-sdk/client-route53-recovery-control-config"
import * as Route53RecoveryReadinessSdk from "@aws-sdk/client-route53-recovery-readiness"
import * as Route53GlobalResolverSdk from "@aws-sdk/client-route53globalresolver"
import * as Route53ProfilesSdk from "@aws-sdk/client-route53profiles"
import * as Route53ResolverSdk from "@aws-sdk/client-route53resolver"
import * as RTBFabricSdk from "@aws-sdk/client-rtbfabric"
import * as RumSdk from "@aws-sdk/client-rum"
import * as ServiceDiscoverySdk from "@aws-sdk/client-servicediscovery"
import * as S3ControlSdk from "@aws-sdk/client-s3-control"
import * as S3FilesSdk from "@aws-sdk/client-s3files"
import * as S3OutpostsSdk from "@aws-sdk/client-s3outposts"
import * as S3TablesSdk from "@aws-sdk/client-s3tables"
import * as S3VectorsSdk from "@aws-sdk/client-s3vectors"
import * as S3Sdk from "@aws-sdk/client-s3"
import * as StsSdk from "@aws-sdk/client-sts"
import * as SyntheticsSdk from "@aws-sdk/client-synthetics"
import * as VPCLatticeSdk from "@aws-sdk/client-vpc-lattice"
import phase1OperationData from "@/data/phase-1-operations.json"
import phase2OperationData from "@/data/phase-2-operations.json"
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb"
import { z } from "zod"
import {
  objectKeySchema,
  readSchema,
  resourceNameSchema,
  uploadLimit,
  uploadSchema,
  writeSchema,
  type ItemPage,
  type ObjectPage,
  type QueueDetails,
  type QueueMessage,
  type Resource,
} from "@/lib/contracts"
import { createVpc, listEc2 } from "@/lib/ec2"
import {
  emulatorClientConfig,
  EmulatorError,
  emulatorHealth,
} from "@/lib/emulator"

export const runtime = "nodejs"

type EmulatorConfig = Awaited<ReturnType<typeof emulatorClientConfig>>
type OperationClient = {
  send(command: never): Promise<unknown>
  destroy?: () => void
}
type OperationClientConstructor = new (config: EmulatorConfig) => OperationClient
type OperationCommandConstructor = new (
  input: Record<string, unknown>,
) => never
type SdkModule = {
  Client: OperationClientConstructor
  commands: Record<string, unknown>
  options?: Record<string, unknown>
}

function sdkModule(
  Client: unknown,
  commands: object,
  options?: Record<string, unknown>,
): SdkModule {
  return {
    Client: Client as OperationClientConstructor,
    commands: commands as Record<string, unknown>,
    options,
  }
}

const sdkModules: Record<string, SdkModule> = {
  acm: sdkModule(ACMsdk.ACMClient, ACMsdk),
  accessanalyzer: sdkModule(
    AccessAnalyzerSdk.AccessAnalyzerClient,
    AccessAnalyzerSdk,
  ),
  aiops: sdkModule(AioPsSdk.AIOpsClient, AioPsSdk),
  applicationinsights: sdkModule(
    ApplicationInsightsSdk.ApplicationInsightsClient,
    ApplicationInsightsSdk,
  ),
  applicationsignals: sdkModule(
    ApplicationSignalsSdk.ApplicationSignalsClient,
    ApplicationSignalsSdk,
  ),
  cloudtrail: sdkModule(CloudTrailSdk.CloudTrailClient, CloudTrailSdk),
  cloudtraildata: sdkModule(
    CloudTrailDataSdk.CloudTrailDataClient,
    CloudTrailDataSdk,
  ),
  cloudwatch: sdkModule(CloudWatchSdk.CloudWatchClient, CloudWatchSdk),
  cloudwatchlogs: sdkModule(
    CloudWatchLogsSdk.CloudWatchLogsClient,
    CloudWatchLogsSdk,
  ),
  cloudwatchomni: sdkModule(
    CloudWatchOmniSdk.CloudWatchOmniClient,
    CloudWatchOmniSdk,
  ),
  appmesh: sdkModule(AppMeshSdk.AppMeshClient, AppMeshSdk),
  arcregionswitch: sdkModule(
    ARCRegionSwitchSdk.ARCRegionSwitchClient,
    ARCRegionSwitchSdk,
  ),
  arczonalshift: sdkModule(
    ARCZonalShiftSdk.ARCZonalShiftClient,
    ARCZonalShiftSdk,
  ),
  cloudfront: sdkModule(CloudFrontSdk.CloudFrontClient, CloudFrontSdk),
  cloudfrontkeyvaluestore: sdkModule(
    CloudFrontKeyValueStoreSdk.CloudFrontKeyValueStoreClient,
    CloudFrontKeyValueStoreSdk,
  ),
  dax: sdkModule(DaxSdk.DAXClient, DaxSdk),
  directconnect: sdkModule(
    DirectConnectSdk.DirectConnectClient,
    DirectConnectSdk,
  ),
  dynamodb: sdkModule(DynamoDBSdk.DynamoDBClient, DynamoDBSdk),
  dynamodbstreams: sdkModule(
    DynamoDBStreamsSdk.DynamoDBStreamsClient,
    DynamoDBStreamsSdk,
  ),
  ec2: sdkModule(Ec2Sdk.EC2Client, Ec2Sdk),
  ec2instanceconnect: sdkModule(
    Ec2InstanceConnectSdk.EC2InstanceConnectClient,
    Ec2InstanceConnectSdk,
  ),
  elasticloadbalancing: sdkModule(
    ElasticLoadBalancingSdk.ElasticLoadBalancingClient,
    ElasticLoadBalancingSdk,
  ),
  elasticloadbalancingv2: sdkModule(
    ElasticLoadBalancingV2Sdk.ElasticLoadBalancingV2Client,
    ElasticLoadBalancingV2Sdk,
  ),
  globalaccelerator: sdkModule(
    GlobalAcceleratorSdk.GlobalAcceleratorClient,
    GlobalAcceleratorSdk,
  ),
  iam: sdkModule(IamSdk.IAMClient, IamSdk),
  iamtoolbox: sdkModule(IamToolboxSdk.IAMToolboxClient, IamToolboxSdk),
  interconnect: sdkModule(
    InterconnectSdk.InterconnectClient,
    InterconnectSdk,
  ),
  internetmonitor: sdkModule(
    InternetMonitorSdk.InternetMonitorClient,
    InternetMonitorSdk,
  ),
  lambda: sdkModule(LambdaSdk.LambdaClient, LambdaSdk),
  lambdacore: sdkModule(LambdaCoreSdk.LambdaCoreClient, LambdaCoreSdk),
  lambdaweb: sdkModule(LambdaWebSdk.LambdaWebClient, LambdaWebSdk),
  networkflowmonitor: sdkModule(
    NetworkFlowMonitorSdk.NetworkFlowMonitorClient,
    NetworkFlowMonitorSdk,
  ),
  networkmanager: sdkModule(
    NetworkManagerSdk.NetworkManagerClient,
    NetworkManagerSdk,
  ),
  networkmonitor: sdkModule(
    NetworkMonitorSdk.NetworkMonitorClient,
    NetworkMonitorSdk,
  ),
  oam: sdkModule(OamSdk.OAMClient, OamSdk),
  observabilityadmin: sdkModule(
    ObservabilityAdminSdk.ObservabilityAdminClient,
    ObservabilityAdminSdk,
  ),
  route53: sdkModule(Route53Sdk.Route53Client, Route53Sdk),
  route53domains: sdkModule(
    Route53DomainsSdk.Route53DomainsClient,
    Route53DomainsSdk,
  ),
  route53globalresolver: sdkModule(
    Route53GlobalResolverSdk.Route53GlobalResolverClient,
    Route53GlobalResolverSdk,
  ),
  route53profiles: sdkModule(
    Route53ProfilesSdk.Route53ProfilesClient,
    Route53ProfilesSdk,
  ),
  route53resolver: sdkModule(
    Route53ResolverSdk.Route53ResolverClient,
    Route53ResolverSdk,
  ),
  route53recoverycluster: sdkModule(
    Route53RecoveryClusterSdk.Route53RecoveryClusterClient,
    Route53RecoveryClusterSdk,
  ),
  route53recoverycontrolconfig: sdkModule(
    Route53RecoveryControlConfigSdk.Route53RecoveryControlConfigClient,
    Route53RecoveryControlConfigSdk,
  ),
  route53recoveryreadiness: sdkModule(
    Route53RecoveryReadinessSdk.Route53RecoveryReadinessClient,
    Route53RecoveryReadinessSdk,
  ),
  rtbfabric: sdkModule(RTBFabricSdk.RTBFabricClient, RTBFabricSdk),
  rum: sdkModule(RumSdk.RUMClient, RumSdk),
  s3: sdkModule(S3Sdk.S3Client, S3Sdk, {
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  }),
  s3control: sdkModule(S3ControlSdk.S3ControlClient, S3ControlSdk),
  s3files: sdkModule(S3FilesSdk.S3FilesClient, S3FilesSdk),
  s3outposts: sdkModule(S3OutpostsSdk.S3OutpostsClient, S3OutpostsSdk),
  s3tables: sdkModule(S3TablesSdk.S3TablesClient, S3TablesSdk),
  s3vectors: sdkModule(S3VectorsSdk.S3VectorsClient, S3VectorsSdk),
  sqs: sdkModule(SqsSdk.SQSClient, SqsSdk, { useQueueUrlAsEndpoint: false }),
  sts: sdkModule(StsSdk.STSClient, StsSdk),
  synthetics: sdkModule(SyntheticsSdk.SyntheticsClient, SyntheticsSdk),
  servicediscovery: sdkModule(
    ServiceDiscoverySdk.ServiceDiscoveryClient,
    ServiceDiscoverySdk,
  ),
  vpclattice: sdkModule(VPCLatticeSdk.VPCLatticeClient, VPCLatticeSdk),
}

function localRequest(request: Request, write = false) {
  const host = request.headers.get("host") ?? ""
  const origin = request.headers.get("origin")
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host)) {
    throw new EmulatorError("Open the console using its loopback address.", 403)
  }
  const site = request.headers.get("sec-fetch-site")
  if (
    write &&
    ((origin && origin !== `http://${host}` && origin !== `https://${host}`) ||
      (site && site !== "same-origin" && site !== "none"))
  ) {
    throw new EmulatorError(
      "Cross-origin requests are blocked by the local console.",
      403,
    )
  }
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  })
}

function failed(error: unknown) {
  if (error instanceof z.ZodError)
    return json({ error: error.issues[0]?.message ?? "Invalid request." }, 400)
  if (error instanceof EmulatorError)
    return json({ error: error.message }, error.status)
  if (error instanceof SyntaxError)
    return json({ error: "Invalid request body or pagination cursor." }, 400)

  const status = (error as { $metadata?: { httpStatusCode?: number } })
    ?.$metadata?.httpStatusCode
  if (status && status >= 400 && status < 500 && error instanceof Error) {
    return json({ error: error.message || error.name }, status)
  }
  return json(
    {
      error:
        error instanceof Error ? error.message : "The emulator request failed.",
    },
    502,
  )
}

const cursorSchema = z.record(
  z.string(),
  z.union([
    z.object({ S: z.string() }),
    z.object({ N: z.string() }),
    z.object({ B: z.base64() }),
  ]),
)

function scanStart(
  cursor?: string,
): Record<string, AttributeValue> | undefined {
  if (!cursor) return
  const keys = cursorSchema.parse(
    JSON.parse(Buffer.from(cursor, "base64url").toString()),
  )
  return Object.fromEntries(
    Object.entries(keys).map(([key, value]) => [
      key,
      "B" in value ? { B: Buffer.from(value.B, "base64") } : value,
    ]),
  )
}

function scanCursor(keys?: Record<string, AttributeValue>) {
  if (!keys || Object.keys(keys).length === 0) return
  const encoded = Object.fromEntries(
    Object.entries(keys).map(([key, value]) => [
      key,
      value.B ? { B: Buffer.from(value.B).toString("base64") } : value,
    ]),
  )
  return Buffer.from(JSON.stringify(encoded)).toString("base64url")
}

function itemJson(
  item: Record<string, AttributeValue>,
): Record<string, unknown> {
  const document = unmarshall(item, {
    wrapNumbers: (value) => {
      const number = Number(value)
      return Number.isFinite(number) && number.toString() === value
        ? number
        : value
    },
  })
  return JSON.parse(
    JSON.stringify(document, (_key, value: unknown) => {
      if (value instanceof Set) return Array.from(value)
      if (value instanceof Uint8Array)
        return Buffer.from(value).toString("base64")
      return value
    }),
  )
}

function queueUrl(
  resource: string,
  { endpoint, region }: { endpoint: string; region: string },
) {
  const url = new URL(resource)
  // AWS Emulator can return an AWS-shaped identifier. The SQS client always sends to the local endpoint.
  const canonical =
    url.origin === `https://sqs.${region}.amazonaws.com` &&
    /^\/\d{12}\/[\w-]+(?:\.fifo)?$/.test(url.pathname)
  if (
    (!canonical && url.origin !== endpoint) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new EmulatorError("Use a queue URL returned by the emulator.", 400)
  }
  return url.href
}

function findOperationModel(modelId: string) {
  for (const inventory of [phase1OperationData, phase2OperationData]) {
    for (const service of inventory.services) {
      const model = service.models.find(({ id }) => id === modelId)
      if (model) return model
    }
  }
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array)
    return { encoding: "base64", bytes: value.byteLength, data: Buffer.from(value).toString("base64") }
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value && typeof value === "object") {
    if (
      "transformToByteArray" in value &&
      typeof value.transformToByteArray === "function"
    ) {
      return { kind: "stream", message: "Use the service console download action for this response body." }
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, jsonSafe(entry)]),
    )
  }
  return value
}

async function runOperation(
  config: EmulatorConfig,
  modelId: string,
  operationName: string,
  input: Record<string, unknown>,
) {
  const model = findOperationModel(modelId)
  const operation = model?.operations.find(({ name }) => name === operationName)
  if (!operation)
    throw new EmulatorError("That operation is not in the Phase 1 or Phase 2 API catalog.", 404)
  if (operation.status === "retired")
    throw new EmulatorError(
      `${modelId}.${operationName} is retired in the MyAWS console.`,
      410,
    )
  if (operation.status === "stub")
    throw new EmulatorError(
      `${modelId}.${operationName} is scaffolded as HTTP 501 in this emulator revision.`,
      501,
    )
  if (operation.status === "no_handler")
    throw new EmulatorError(
      `${modelId}.${operationName} has no handler in this emulator revision.`,
      501,
    )

  const sdk = sdkModules[modelId]
  if (!sdk)
    throw new EmulatorError(
      `The AWS SDK does not publish a JavaScript client for ${modelId}.`,
      501,
    )
  const Command = sdk.commands[`${operationName}Command`]
  if (typeof Command !== "function")
    throw new EmulatorError(
      `The JavaScript SDK has no ${operationName} command for ${modelId}.`,
      501,
    )

  const client = new sdk.Client({ ...config, ...sdk.options } as EmulatorConfig)
  try {
    const sdkInput = { ...input }
    for (const field of operation.inputFields) {
      if (field.type === "blob" && typeof sdkInput[field.name] === "string") {
        sdkInput[field.name] = Buffer.from(sdkInput[field.name] as string, "base64")
      } else if (
        field.type === "timestamp" &&
        typeof sdkInput[field.name] === "string"
      ) {
        const timestamp = new Date(sdkInput[field.name] as string)
        if (Number.isFinite(timestamp.getTime())) sdkInput[field.name] = timestamp
      }
    }
    normalizeNestedSdkValues(sdkInput)
    if (modelId === "lambda" && operationName === "CreateFunction")
      decodeNestedBlob(sdkInput, ["Code", "ZipFile"])
    if (modelId === "lambda" && operationName === "PublishLayerVersion")
      decodeNestedBlob(sdkInput, ["Content", "ZipFile"])
    const command = new (Command as OperationCommandConstructor)(sdkInput)
    return jsonSafe(await client.send(command))
  } finally {
    client.destroy?.()
  }
}

function normalizeNestedSdkValues(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(normalizeNestedSdkValues)
    return
  }
  if (!value || typeof value !== "object" || value instanceof Date || value instanceof Uint8Array)
    return
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry === "string" &&
      /(?:time|date|timestamp)$/i.test(key) &&
      /^\d{4}-\d\d-\d\dT/.test(entry)
    ) {
      const timestamp = new Date(entry)
      if (Number.isFinite(timestamp.getTime())) {
        ;(value as Record<string, unknown>)[key] = timestamp
        continue
      }
    }
    if (key === "B" && typeof entry === "string") {
      ;(value as Record<string, unknown>)[key] = Buffer.from(entry, "base64")
      continue
    }
    if (key === "BS" && Array.isArray(entry)) {
      ;(value as Record<string, unknown>)[key] = entry.map((part) =>
        typeof part === "string" ? Buffer.from(part, "base64") : part,
      )
      continue
    }
    normalizeNestedSdkValues(entry)
  }
}

function decodeNestedBlob(value: unknown, path: string[]): void {
  if (!value || typeof value !== "object") return
  const [key, ...rest] = path
  const child = (value as Record<string, unknown>)[key]
  if (rest.length) {
    decodeNestedBlob(child, rest)
  } else if (typeof child === "string") {
    ;(value as Record<string, unknown>)[key] = Buffer.from(child, "base64")
  }
}

const byName = (left: Resource, right: Resource) =>
  left.name.localeCompare(right.name)

function s3Client(config: Awaited<ReturnType<typeof emulatorClientConfig>>) {
  return new S3Client({
    ...config,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })
}

export async function GET(request: Request) {
  try {
    localRequest(request)
    const input = readSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    )
    if (input.kind === "health") return json(await emulatorHealth())
    if (input.kind === "operation-catalog") {
      const model = findOperationModel(input.model)
      if (!model)
        throw new EmulatorError("That API model is not in Phase 1 or Phase 2.", 404)
      const sdk = sdkModules[input.model]
      const operations = model.operations.map((operation) => ({
        ...operation,
        runnable:
          operation.status === "implemented" &&
          Boolean(sdk && typeof sdk.commands[`${operation.name}Command`] === "function"),
      }))
      return json({
        sourceCommit: phase1OperationData.sourceCommit,
        model: {
          ...model,
          runnableCount: operations.filter(({ runnable }) => runnable).length,
          operations,
        },
      })
    }
    const config = await emulatorClientConfig()

    switch (input.kind) {
      case "ec2":
        return json(await listEc2(config, input.section))
      case "s3": {
        const buckets: Resource[] = []
        for await (const page of paginateListBuckets(
          { client: s3Client(config), pageSize: 100 },
          {},
        )) {
          for (const { Name, CreationDate, BucketRegion } of page.Buckets ?? [])
            if (Name)
              buckets.push({
                id: Name,
                name: Name,
                created: CreationDate?.toISOString(),
                region: BucketRegion,
              })
        }
        return json(buckets.sort(byName))
      }
      case "objects": {
        const data = await s3Client(config).send(
          new ListObjectsV2Command({
            Bucket: input.resource,
            ContinuationToken: input.cursor,
            MaxKeys: 100,
          }),
        )
        return json({
          objects: (data.Contents ?? []).flatMap(
            ({ Key, Size, LastModified, StorageClass }) =>
              Key
                ? [
                    {
                      key: Key,
                      bytes: Size ?? 0,
                      modified: LastModified?.toISOString(),
                      storageClass: StorageClass,
                    },
                  ]
                : [],
          ),
          cursor: data.NextContinuationToken,
        } satisfies ObjectPage)
      }
      case "download": {
        const data = await s3Client(config).send(
          new GetObjectCommand({ Bucket: input.resource, Key: input.key }),
        )
        if (!data.Body)
          throw new EmulatorError("The emulator returned no object body.", 502)
        const name = input.key.split("/").filter(Boolean).at(-1) ?? "download"
        const encodedName = encodeURIComponent(name).replace(
          /['()*]/g,
          (value) => `%${value.charCodeAt(0).toString(16)}`,
        )
        return new Response(data.Body.transformToWebStream(), {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
          },
        })
      }
      case "dynamodb": {
        const tables: Resource[] = []
        for await (const page of paginateListTables(
          { client: new DynamoDBClient(config), pageSize: 100 },
          {},
        )) {
          for (const name of page.TableNames ?? [])
            tables.push({ id: name, name })
        }
        return json(tables.sort(byName))
      }
      case "items": {
        const client = new DynamoDBClient(config)
        const { Table } = await client.send(
          new DescribeTableCommand({ TableName: input.resource }),
        )
        const metadata = {
          status: Table?.TableStatus,
          tableArn: Table?.TableArn,
          createdAt: Table?.CreationDateTime?.toISOString(),
          tableClass: Table?.TableClassSummary?.TableClass,
          deletionProtection: Table?.DeletionProtectionEnabled,
          streamEnabled: Table?.StreamSpecification?.StreamEnabled,
          streamViewType: Table?.StreamSpecification?.StreamViewType,
          encryption: Table?.SSEDescription
            ? `${Table.SSEDescription.SSEType ?? "Encryption"} (${Table.SSEDescription.Status ?? "unknown"})`
            : undefined,
          indexes: [
            ...(Table?.GlobalSecondaryIndexes ?? []).map((index) => ({
              name: index.IndexName ?? "",
              type: "global" as const,
              status: index.IndexStatus,
              keys: (index.KeySchema ?? []).flatMap(({ AttributeName }) =>
                AttributeName ? [AttributeName] : [],
              ),
              projection: index.Projection?.ProjectionType,
              itemCount: index.ItemCount,
              bytes: index.IndexSizeBytes,
            })),
            ...(Table?.LocalSecondaryIndexes ?? []).map((index) => ({
              name: index.IndexName ?? "",
              type: "local" as const,
              keys: (index.KeySchema ?? []).flatMap(({ AttributeName }) =>
                AttributeName ? [AttributeName] : [],
              ),
              projection: index.Projection?.ProjectionType,
              itemCount: index.ItemCount,
              bytes: index.IndexSizeBytes,
            })),
          ],
          partitionKey: Table?.KeySchema?.find(
            ({ KeyType }) => KeyType === "HASH",
          )?.AttributeName,
          sortKey: Table?.KeySchema?.find(({ KeyType }) => KeyType === "RANGE")
            ?.AttributeName,
          billingMode: Table?.BillingModeSummary?.BillingMode,
          reportedItems: Table?.ItemCount,
          bytes: Table?.TableSizeBytes,
          keys: (Table?.KeySchema ?? []).flatMap(({ AttributeName }) =>
            AttributeName ? [AttributeName] : [],
          ),
        }
        if (metadata.status !== "ACTIVE" && metadata.status !== "UPDATING") {
          return json({ ...metadata, items: [] } satisfies ItemPage)
        }
        const page = await client.send(
          new ScanCommand({
            TableName: input.resource,
            Limit: 25,
            ExclusiveStartKey: scanStart(input.cursor),
          }),
        )
        return json({
          ...metadata,
          items: (page.Items ?? []).map(itemJson),
          cursor: scanCursor(page.LastEvaluatedKey),
        } satisfies ItemPage)
      }
      case "sqs": {
        const queues: Resource[] = []
        const client = new SQSClient({
          ...config,
          useQueueUrlAsEndpoint: false,
        })
        for await (const page of paginateListQueues(
          { client, pageSize: 100 },
          {},
        )) {
          for (const id of page.QueueUrls ?? [])
            queues.push({
              id,
              name: new URL(id).pathname.split("/").at(-1) ?? id,
            })
        }
        return json(queues.sort(byName))
      }
      case "queue": {
        const client = new SQSClient({
          ...config,
          useQueueUrlAsEndpoint: false,
        })
        const { Attributes } = await client.send(
          new GetQueueAttributesCommand({
            QueueUrl: queueUrl(input.resource, config),
            AttributeNames: [
              "ApproximateNumberOfMessages",
              "ApproximateNumberOfMessagesNotVisible",
              "ApproximateNumberOfMessagesDelayed",
              "FifoQueue",
              "VisibilityTimeout",
              "MessageRetentionPeriod",
              "DelaySeconds",
              "All",
            ],
          }),
        )
        return json({
          available: Number(Attributes?.ApproximateNumberOfMessages ?? 0),
          inFlight: Number(
            Attributes?.ApproximateNumberOfMessagesNotVisible ?? 0,
          ),
          delayed: Number(Attributes?.ApproximateNumberOfMessagesDelayed ?? 0),
          fifo:
            Attributes?.FifoQueue === "true" ||
            input.resource.endsWith(".fifo"),
          visibilitySeconds: Attributes?.VisibilityTimeout,
          retentionSeconds: Attributes?.MessageRetentionPeriod,
          delaySeconds: Attributes?.DelaySeconds,
          attributes: Attributes ?? {},
        } satisfies QueueDetails)
      }
    }
  } catch (error) {
    return failed(error)
  }
}

export async function POST(request: Request) {
  try {
    localRequest(request, true)
    const contentType = request.headers.get("content-type") ?? ""
    const length = Number(request.headers.get("content-length") ?? "0")
    if (contentType.startsWith("multipart/form-data")) {
      if (length > uploadLimit + 64 * 1024)
        throw new EmulatorError("Choose a file up to 16 MiB.", 413)
      const form = await request.formData()
      const { resource, key, file } = uploadSchema
        .extend({ resource: resourceNameSchema })
        .parse(Object.fromEntries(form))
      const objectKey = objectKeySchema.parse(key || file.name)
      await s3Client(await emulatorClientConfig()).send(
        new PutObjectCommand({
          Bucket: resource,
          Key: objectKey,
          Body: Buffer.from(await file.arrayBuffer()),
          ContentType: file.type || "application/octet-stream",
        }),
      )
      return json({ ok: true, id: objectKey }, 201)
    }
    if (!contentType.startsWith("application/json"))
      throw new EmulatorError("Send JSON or a multipart upload.", 415)
    if (length > 7 * 1024 * 1024)
      throw new EmulatorError("Request body is too large.", 413)
    const input = writeSchema.parse(await request.json())
    const config = await emulatorClientConfig()
    switch (input.kind) {
      case "operation":
        return json(
          await runOperation(
            config,
            input.model,
            input.operation,
            input.input,
          ),
        )
      case "vpc":
        return json(await createVpc(config, input), 201)
      case "s3":
        await s3Client(config).send(
          new CreateBucketCommand({
            Bucket: input.name,
            CreateBucketConfiguration:
              config.region === "us-east-1"
                ? undefined
                : {
                    LocationConstraint:
                      config.region as BucketLocationConstraint,
                  },
          }),
        )
        return json({ id: input.name }, 201)
      case "dynamodb": {
        const keys = [input.partitionKey, input.sortKey].filter(Boolean)
        await new DynamoDBClient(config).send(
          new CreateTableCommand({
            TableName: input.name,
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: keys.map((name) => ({
              AttributeName: name,
              AttributeType: "S",
            })),
            KeySchema: keys.map((name, index) => ({
              AttributeName: name,
              KeyType: index === 0 ? "HASH" : "RANGE",
            })),
          }),
        )
        return json({ id: input.name }, 201)
      }
      case "sqs": {
        const client = new SQSClient({
          ...config,
          useQueueUrlAsEndpoint: false,
        })
        const { QueueUrl } = await client.send(
          new CreateQueueCommand({
            QueueName: input.name,
            Attributes: input.name.endsWith(".fifo")
              ? { FifoQueue: "true", ContentBasedDeduplication: "true" }
              : undefined,
          }),
        )
        return json({ id: QueueUrl }, 201)
      }
      case "item":
        await new DynamoDBClient(config).send(
          new PutItemCommand({
            TableName: input.resource,
            Item: marshall(JSON.parse(input.json)),
          }),
        )
        return json({ ok: true }, 201)
      case "delete-item":
        await new DynamoDBClient(config).send(
          new DeleteItemCommand({
            TableName: input.resource,
            Key: marshall(input.key),
          }),
        )
        return json({ ok: true })
      case "message": {
        const url = queueUrl(input.resource, config)
        const fifo = url.endsWith(".fifo")
        if (fifo && !input.group)
          throw new EmulatorError(
            "Enter a message group ID for this FIFO queue.",
            400,
          )
        const client = new SQSClient({
          ...config,
          useQueueUrlAsEndpoint: false,
        })
        const { MessageId } = await client.send(
          new SendMessageCommand({
            QueueUrl: url,
            MessageBody: input.body,
            MessageGroupId: fifo ? input.group : undefined,
            MessageDeduplicationId: fifo ? crypto.randomUUID() : undefined,
          }),
        )
        return json({ id: MessageId }, 201)
      }
      case "receive": {
        const client = new SQSClient({
          ...config,
          useQueueUrlAsEndpoint: false,
        })
        const { Messages } = await client.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl(input.resource, config),
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 0,
            MessageAttributeNames: ["All"],
            MessageSystemAttributeNames: ["All"],
          }),
        )
        return json(
          (Messages ?? []).flatMap(({ MessageId, Body, ReceiptHandle, Attributes, MessageAttributes }) =>
            MessageId && Body !== undefined
              ? [{ id: MessageId, body: Body, receiptHandle: ReceiptHandle, attributes: MessageAttributes, systemAttributes: Attributes } satisfies QueueMessage]
              : [],
          ),
        )
      }
    }
  } catch (error) {
    return failed(error)
  }
}
