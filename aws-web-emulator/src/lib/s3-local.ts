import * as s3 from "@aws-sdk/client-s3"
import * as s3control from "@aws-sdk/client-s3-control"
import * as s3files from "@aws-sdk/client-s3files"
import * as s3outposts from "@aws-sdk/client-s3outposts"
import * as s3tables from "@aws-sdk/client-s3tables"
import * as s3vectors from "@aws-sdk/client-s3vectors"
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts"
import { emulatorClientConfig, EmulatorError } from "@/lib/emulator"
import { findS3Operation, type S3Model } from "@/lib/s3-catalog"

const models = { s3, s3control, s3files, s3outposts, s3tables, s3vectors }
type Settings = Awaited<ReturnType<typeof emulatorClientConfig>>

function clientFor(
  model: S3Model,
  settings: Settings,
  action: string,
  input: OperationInput,
) {
  switch (model) {
    case "s3": {
      const directoryBucket =
        typeof input.Bucket === "string" && input.Bucket.endsWith("--x-s3")
          ? input.Bucket
          : undefined
      const client = new s3.S3Client({
        ...settings,
        forcePathStyle: true,
        disableS3ExpressSessionAuth: [
          "CreateBucket",
          "DeleteBucket",
          "CreateSession",
        ].includes(action),
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      })
      if (directoryBucket) {
        client.middlewareStack.add(
          (next) => async (args) => {
            const request = args.request as { path?: string }
            const prefix = `/${directoryBucket}//`
            // The SDK combines a bucket-prefixed custom endpoint with a serializer
            // path beginning in a slash. Preserve leading slashes in object keys.
            if (request.path?.startsWith(prefix)) {
              request.path = `/${directoryBucket}/${request.path.slice(prefix.length)}`
            }
            return next(args)
          },
          { step: "build", name: "localDirectoryBucketPath" },
        )
      }
      return client
    }
    case "s3control":
      return new s3control.S3ControlClient({
        ...settings,
        // S3 Control adds the account as a hostname prefix on AWS. Its local
        // route uses the account header and the loopback authority.
        endpointProvider: () => ({ url: new URL(settings.endpoint) }),
      })
    case "s3files":
      return new s3files.S3FilesClient(settings)
    case "s3outposts":
      return new s3outposts.S3OutpostsClient(settings)
    case "s3tables":
      return new s3tables.S3TablesClient(settings)
    case "s3vectors":
      return new s3vectors.S3VectorsClient(settings)
  }
}

function localTransport(settings: Settings) {
  const endpoint = new URL(settings.endpoint)
  const handler = settings.requestHandler
  const send = handler.handle.bind(handler)
  handler.handle = (request, options) => {
    if (
      request.protocol !== endpoint.protocol ||
      request.hostname !== endpoint.hostname ||
      (request.port ?? 443) !== Number(endpoint.port || 443)
    ) {
      throw new EmulatorError("The operation requires a non-local S3 endpoint.", 422)
    }
    return send(request, options)
  }
}

type OperationInput = Record<string, unknown>

function coerceNestedDate(
  value: unknown,
  path: readonly string[],
  label: string,
): unknown {
  if (value == null) return value
  if (!path.length) {
    if (value instanceof Date) return value
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      throw new EmulatorError(`Enter a valid date for ${label}.`, 400)
    }
    return new Date(value)
  }
  const [key, ...rest] = path
  if (typeof value !== "object") return value
  if (key === "*") {
    if (Array.isArray(value))
      return value.map((entry) => coerceNestedDate(entry, rest, label))
    return Object.fromEntries(
      Object.entries(value).map(([name, entry]) => [
        name,
        coerceNestedDate(entry, rest, label),
      ]),
    )
  }
  if (!Object.hasOwn(value, key)) return value
  return {
    ...value,
    [key]: coerceNestedDate((value as OperationInput)[key], rest, label),
  }
}
type OperationOutput = Record<string, unknown> & {
  $metadata?: { httpStatusCode?: number }
}
type DynamicClient = {
  send(
    command: unknown,
    options: { abortSignal: AbortSignal },
  ): Promise<OperationOutput>
}

async function localAccount(settings: Settings, abortSignal: AbortSignal) {
  const identity = await new STSClient(settings).send(
    new GetCallerIdentityCommand({}),
    { abortSignal },
  )
  if (!identity.Account)
    throw new EmulatorError("The emulator returned no account ID.", 502)
  return identity.Account
}

export async function s3Environment(abortSignal: AbortSignal) {
  const settings = await emulatorClientConfig()
  localTransport(settings)
  return { account: await localAccount(settings, abortSignal), region: settings.region }
}

export async function runS3Operation(
  model: S3Model,
  action: string,
  input: OperationInput,
  useLocalAccount: boolean,
  abortSignal: AbortSignal,
) {
  const commands = models[model] as Record<string, unknown>
  const Command = commands[`${action}Command`] as
    | (new (input: OperationInput) => unknown)
    | undefined
  if (!Command)
    throw new EmulatorError("This action is absent from the installed AWS SDK.", 501)

  for (const [key, ...path] of findS3Operation(model, action)?.nestedDates ?? []) {
    if (Object.hasOwn(input, key))
      input[key] = coerceNestedDate(input[key], path, [key, ...path].join("."))
  }

  const settings = await emulatorClientConfig()
  localTransport(settings)
  if (useLocalAccount && !input.AccountId) {
    input.AccountId = await localAccount(settings, abortSignal)
  }
  if (
    model === "s3" &&
    action === "CreateBucket" &&
    settings.region !== "us-east-1" &&
    !input.CreateBucketConfiguration
  ) {
    input.CreateBucketConfiguration = { LocationConstraint: settings.region }
  }
  const client = clientFor(model, settings, action, input) as unknown as DynamicClient
  return client.send(new Command(input), { abortSignal })
}
