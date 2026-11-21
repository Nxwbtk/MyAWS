import { Buffer } from "node:buffer"
import { z } from "zod"
import { uploadLimit } from "@/lib/contracts"
import { EmulatorError } from "@/lib/emulator"
import { findS3Operation, type S3Model } from "@/lib/s3-catalog"
import { runS3Operation, s3Environment } from "@/lib/s3-local"

export const runtime = "nodejs"

const requestSchema = z.object({
  model: z.string(),
  action: z.string(),
  input: z.record(z.string(), z.unknown()),
})

const noCache = { "Cache-Control": "no-store" }
const noSniff = { "X-Content-Type-Options": "nosniff" }

function verifyLocalRequest(request: Request) {
  const host = request.headers.get("host") ?? ""
  const origin = request.headers.get("origin")
  const site = request.headers.get("sec-fetch-site")
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(host)) {
    throw new EmulatorError("Open the console using its loopback address.", 403)
  }
  if (
    (origin && origin !== `http://${host}` && origin !== `https://${host}`) ||
    (site && site !== "same-origin" && site !== "none")
  ) {
    throw new EmulatorError("Cross-origin calls to the local console are blocked.", 403)
  }
}

async function boundedRequest(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) {
    throw new EmulatorError("The request is too large.", 413)
  }
  const reader = request.body?.getReader()
  if (!reader) throw new EmulatorError("Enter an operation request.", 400)
  const parts: Uint8Array[] = []
  let length = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    length += value.length
    if (length > limit) {
      await reader.cancel()
      throw new EmulatorError("The request is too large.", 413)
    }
    parts.push(value)
  }
  return new Response(Buffer.concat(parts), { headers: request.headers })
}

function failure(error: unknown) {
  const sdkStatus = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode
  const validStatus =
    sdkStatus && sdkStatus >= 400 && sdkStatus <= 599 ? sdkStatus : 502
  const status =
    error instanceof EmulatorError
      ? error.status
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? 400
        : validStatus
  const message =
    error instanceof z.ZodError
      ? "The operation input is invalid."
      : error instanceof Error
        ? error.message
        : "The emulator request failed."
  return Response.json({ error: message }, { status, headers: noCache })
}

export async function GET(request: Request) {
  try {
    verifyLocalRequest(request)
    return Response.json(await s3Environment(request.signal), { headers: noCache })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: Request) {
  try {
    verifyLocalRequest(request)
    const type = request.headers.get("content-type") ?? ""
    if (
      !type.startsWith("application/json") &&
      !type.startsWith("multipart/form-data;")
    ) {
      throw new EmulatorError("Use JSON or multipart form data.", 415)
    }
    const hasFiles = type.startsWith("multipart/form-data;")
    const body = await boundedRequest(
      request,
      hasFiles ? uploadLimit + 256_000 : 1_048_576,
    )
    const files = hasFiles ? await body.formData() : null
    const envelope: unknown = files
      ? JSON.parse(String(files.get("request") ?? ""))
      : await body.json()
    const { model, action, input } = requestSchema.parse(envelope)
    const operation = findS3Operation(model, action)
    if (!operation) throw new EmulatorError("Unknown Amazon S3 operation.", 404)
    if (operation.state === "unwired") {
      throw new EmulatorError(
        "The model defines this operation, but the emulator has no handler for it.",
        501,
      )
    }
    const parameters: Record<string, unknown> = Object.create(null)
    for (const [name, kind, required] of operation.input) {
      const value = input[name]
      if (kind === "file") {
        const file = files?.get(`file:${name}`)
        if (file instanceof File) {
          if (file.size > uploadLimit)
            throw new EmulatorError("Choose a file up to 16 MiB.", 413)
          parameters[name] = Buffer.from(await file.arrayBuffer())
        } else if (typeof value === "string") {
          parameters[name] = Buffer.from(value, "base64")
        }
      } else if (kind === "date" && value !== undefined) {
        const date = new Date(z.string().parse(value))
        if (Number.isNaN(date.valueOf()))
          throw new EmulatorError(`Enter a valid value for ${name}.`, 400)
        parameters[name] = date
      } else if (value !== undefined) {
        parameters[name] = value
      } else if (required && name !== "AccountId") {
        throw new EmulatorError(`Enter a value for ${name}.`, 400)
      }
    }
    const { $metadata, ...data } = await runS3Operation(
      model as S3Model,
      action,
      parameters,
      operation.input.some(([name, , required]) => required && name === "AccountId"),
      request.signal,
    )
    for (const value of Object.values(data)) {
      if (
        value &&
        typeof value === "object" &&
        "transformToWebStream" in value &&
        typeof value.transformToWebStream === "function"
      ) {
        return new Response(value.transformToWebStream(), {
          headers: {
            ...noCache,
            ...noSniff,
            "Content-Type": "application/octet-stream",
            "Content-Disposition": "attachment",
          },
        })
      }
    }
    return Response.json(
      { data, status: $metadata?.httpStatusCode },
      { headers: noCache },
    )
  } catch (error) {
    return failure(error)
  }
}
