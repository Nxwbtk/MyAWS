import type { S3Model } from "@/lib/s3-catalog"
import { uploadLimit } from "@/lib/contracts"

export class S3RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

export async function s3Environment(signal?: AbortSignal) {
  const response = await fetch("/api/emulator/s3", { signal })
  const result = await response.json()
  if (!response.ok)
    throw new S3RequestError(
      result.error ?? "Could not read the emulator region.",
      response.status,
    )
  return result as { account: string; region: string }
}

export async function s3Request<T extends object = Record<string, unknown>>(
  model: S3Model,
  action: string,
  input: Record<string, unknown> = {},
  options: { signal?: AbortSignal; uploads?: Record<string, File> } = {},
) {
  const request = JSON.stringify({ model, action, input })
  const uploads = Object.entries(options.uploads ?? {})
  let body: string | FormData = request
  if (uploads.length) {
    body = new FormData()
    body.set("request", request)
    for (const [name, file] of uploads) body.set(`file:${name}`, file)
  }
  const response = await fetch("/api/emulator/s3", {
    method: "POST",
    body,
    signal: options.signal,
    headers:
      typeof body === "string" ? { "Content-Type": "application/json" } : undefined,
  })
  if (
    response.ok &&
    response.headers.get("content-type") === "application/octet-stream"
  ) {
    return { file: await response.blob(), status: response.status }
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new S3RequestError(
      result.error ?? `Request failed (HTTP ${response.status}).`,
      response.status,
    )
  }
  return { data: result.data as T, status: Number(result.status ?? response.status) }
}

export async function s3Read<T extends object = Record<string, unknown>>(
  model: S3Model,
  action: string,
  input?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const result = await s3Request<T>(model, action, input, { signal })
  if (!result.data)
    throw new S3RequestError(
      "The emulator returned a file instead of resource details.",
      502,
    )
  return result.data
}

export function downloadS3File(file: Blob, name: string) {
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const multipartPartLimit = 10_000

export async function uploadS3Object(
  input: { Bucket: string; Key: string } & Record<string, unknown>,
  file: File,
) {
  if (file.size <= uploadLimit) {
    return s3Request("s3", "PutObject", input, { uploads: { Body: file } })
  }
  const partCount = Math.ceil(file.size / uploadLimit)
  if (partCount > multipartPartLimit)
    throw new S3RequestError("The file requires more than 10,000 upload parts.", 413)
  const { Bucket, Key } = input
  const { UploadId } = await s3Read<{ UploadId?: string }>(
    "s3",
    "CreateMultipartUpload",
    input,
  )
  if (!UploadId)
    throw new S3RequestError("The emulator returned no multipart upload ID.", 502)
  const Parts: { PartNumber: number; ETag: string }[] = []
  try {
    for (let index = 0; index < partCount; index++) {
      const PartNumber = index + 1
      const Body = new File(
        [file.slice(index * uploadLimit, PartNumber * uploadLimit)],
        file.name,
      )
      const result = await s3Request<{ ETag?: string }>(
        "s3",
        "UploadPart",
        { Bucket, Key, UploadId, PartNumber },
        { uploads: { Body } },
      )
      if (!result.data?.ETag)
        throw new S3RequestError(
          `The emulator returned no ETag for part ${PartNumber}.`,
          502,
        )
      Parts.push({ PartNumber, ETag: result.data.ETag })
    }
    return await s3Request("s3", "CompleteMultipartUpload", {
      Bucket,
      Key,
      UploadId,
      MultipartUpload: { Parts },
    })
  } catch (error) {
    try {
      await s3Request("s3", "AbortMultipartUpload", { Bucket, Key, UploadId })
    } catch (cleanup) {
      if (!(cleanup instanceof S3RequestError && cleanup.status === 404)) {
        const reason = error instanceof Error ? error.message : "Upload failed."
        throw new Error(
          `${reason} The emulator could not abort multipart upload ${UploadId}.`,
          { cause: error },
        )
      }
    }
    throw error
  }
}
