import { z } from "zod"

export const services = {
  s3: {
    name: "Amazon S3",
    resource: "bucket",
    plural: "buckets",
    category: "Object storage",
    description: "Browse buckets, upload files, and download objects.",
  },
  dynamodb: {
    name: "DynamoDB",
    resource: "table",
    plural: "tables",
    category: "NoSQL database",
    description: "Create tables and inspect or add items as JSON.",
  },
  sqs: {
    name: "Amazon SQS",
    resource: "queue",
    plural: "queues",
    category: "Message queues",
    description: "Inspect queue depth and send test messages.",
  },
} as const

export const serviceSchema = z.enum(["s3", "dynamodb", "sqs"])
export type Service = z.infer<typeof serviceSchema>
export const serviceNames = serviceSchema.options
export const managedServiceNames = [
  ...serviceNames,
  "ec2",
  "vpc",
  "iam",
  "sts",
  "lambda",
  "cloudwatch",
  "cloudtrail",
  "route53",
  "elasticloadbalancing",
  "cloudfront",
  "acm",
  "globalaccelerator",
  "servicediscovery",
  "vpclattice",
  "directconnect",
  "interconnect",
  "networkmanager",
  "appmesh",
  "rtbfabric",
  "arc",
]
export const ec2SectionSchema = z.enum([
  "instances",
  "launch-templates",
  "spot-requests",
  "images",
  "volumes",
  "snapshots",
  "elastic-ips",
  "placement-groups",
  "key-pairs",
  "network-interfaces",
  "vpcs",
  "subnets",
  "route-tables",
  "internet-gateways",
  "egress-only-gateways",
  "dhcp-options",
  "prefix-lists",
  "vpc-endpoints",
  "nat-gateways",
  "peering-connections",
  "network-acls",
  "security-groups",
])
export type Ec2Section = z.infer<typeof ec2SectionSchema>

export const vpcSchema = z.object({
  name: z.string().trim().max(256),
  cidr: z
    .string()
    .trim()
    .pipe(z.cidrv4("Enter a valid IPv4 CIDR block."))
    .refine(
      (cidr) => /\/(1[6-9]|2[0-8])$/.test(cidr),
      "Use a CIDR prefix from /16 to /28.",
    ),
})

export const bucketSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters.")
    .max(63)
    .regex(
      /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/,
      "Use lowercase letters, numbers, periods, or hyphens. Start and end with a letter or number.",
    )
    .refine(
      (name) => !name.includes("..") && !/^\d+\.\d+\.\d+\.\d+$/.test(name),
      "Use a valid bucket name.",
    ),
})

export const tableSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, "Use at least 3 characters.")
      .max(255)
      .regex(
        /^[a-zA-Z0-9_.-]+$/,
        "Use letters, numbers, underscores, periods, or hyphens.",
      ),
    partitionKey: z.string().trim().min(1, "Enter a partition key.").max(255),
    sortKey: z.string().trim().max(255),
  })
  .refine(({ partitionKey, sortKey }) => partitionKey !== sortKey, {
    path: ["sortKey"],
    message: "Choose a different name from the partition key.",
  })

export const queueSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a queue name.")
    .max(80)
    .regex(
      /^[a-zA-Z0-9_-]+(?:\.fifo)?$/,
      "Use letters, numbers, hyphens, or underscores. Add .fifo for a FIFO queue.",
    ),
})

export const uploadLimit = 16 * 1024 * 1024
export const objectKeySchema = z
  .string()
  .min(1)
  .refine(
    (key) => new TextEncoder().encode(key).length <= 1024,
    "Use an object key of at most 1,024 bytes.",
  )
export const uploadSchema = z.object({
  key: z.union([z.literal(""), objectKeySchema]),
  file: z.file().max(uploadLimit, "Choose a file up to 16 MiB."),
})

export const itemSchema = z.object({
  json: z
    .string()
    .min(1, "Enter an item as a JSON object.")
    .max(400_000)
    .refine((input) => {
      try {
        const value: unknown = JSON.parse(input)
        return (
          typeof value === "object" && value !== null && !Array.isArray(value)
        )
      } catch {
        return false
      }
    }, 'Enter a valid JSON object, for example {"id": "example"}.'),
})

export const messageSchema = z.object({
  body: z
    .string()
    .min(1, "Enter a message.")
    .refine(
      (body) => new TextEncoder().encode(body).length <= 1024 * 1024,
      "Keep the message within 1 MiB.",
    ),
  group: z.string().trim().max(128),
})

export const resourceNameSchema = z.string().min(1).max(2048)
const cursor = z.string().min(1).max(32_768).optional()
const modelIdSchema = z.string().regex(/^[a-z0-9]+$/)

export const readSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("health") }),
  z.object({ kind: z.literal("operation-catalog"), model: modelIdSchema }),
  z.object({ kind: serviceSchema }),
  z.object({ kind: z.literal("ec2"), section: ec2SectionSchema }),
  z.object({
    kind: z.literal("objects"),
    resource: resourceNameSchema,
    cursor,
  }),
  z.object({
    kind: z.literal("download"),
    resource: resourceNameSchema,
    key: objectKeySchema,
  }),
  z.object({ kind: z.literal("items"), resource: resourceNameSchema, cursor }),
  z.object({ kind: z.literal("queue"), resource: z.url() }),
])

export const writeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("operation"),
    model: modelIdSchema,
    operation: z.string().regex(/^[A-Z][A-Za-z0-9]+$/),
    input: z.record(z.string(), z.unknown()).default({}),
  }),
  bucketSchema.extend({ kind: z.literal("s3") }),
  tableSchema.safeExtend({ kind: z.literal("dynamodb") }),
  queueSchema.extend({ kind: z.literal("sqs") }),
  vpcSchema.extend({ kind: z.literal("vpc") }),
  itemSchema.extend({ kind: z.literal("item"), resource: resourceNameSchema }),
  z.object({
    kind: z.literal("delete-item"),
    resource: resourceNameSchema,
    key: z.record(z.string(), z.unknown()).refine(
      (value) => Object.keys(value).length > 0,
      "The item key must not be empty.",
    ),
  }),
  messageSchema.extend({ kind: z.literal("message"), resource: z.url() }),
  z.object({ kind: z.literal("receive"), resource: z.url() }),
])

export type Health = {
  endpoint: string
  region: string
  connected: boolean
  detail?: string
}
export type Resource = {
  name: string
  id: string
  region?: string
  created?: string
}
export type ObjectPage = {
  objects: {
    key: string
    bytes: number
    modified?: string
    storageClass?: string
  }[]
  cursor?: string
}
export type ItemPage = {
  items: Record<string, unknown>[]
  cursor?: string
  status?: string
  tableArn?: string
  createdAt?: string
  tableClass?: string
  deletionProtection?: boolean
  streamEnabled?: boolean
  streamViewType?: string
  encryption?: string
  indexes?: {
    name: string
    type: "global" | "local"
    status?: string
    keys: string[]
    projection?: string
    itemCount?: number
    bytes?: number
  }[]
  keys: string[]
  partitionKey?: string
  sortKey?: string
  billingMode?: string
  reportedItems?: number
  bytes?: number
}
export type QueueDetails = {
  available: number
  inFlight: number
  delayed: number
  fifo: boolean
  visibilitySeconds?: string
  retentionSeconds?: string
  delaySeconds?: string
  attributes: Record<string, string>
}
export type QueueMessage = {
  id: string
  body: string
  receiptHandle?: string
  attributes?: Record<string, unknown>
  systemAttributes?: Record<string, string>
}
export type Ec2Resource = {
  id: string
  name: string
  state?: string
  fields: Record<string, string | undefined>
}
