import { Buffer } from "node:buffer"
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
  DescribeTableCommand,
  DynamoDBClient,
  paginateListTables,
  PutItemCommand,
  ScanCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb"
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  paginateListQueues,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs"
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
          }),
        )
        return json(
          (Messages ?? []).flatMap(({ MessageId, Body }) =>
            MessageId && Body !== undefined
              ? [{ id: MessageId, body: Body } satisfies QueueMessage]
              : [],
          ),
        )
      }
    }
  } catch (error) {
    return failed(error)
  }
}
