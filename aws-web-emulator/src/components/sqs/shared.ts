"use client"

import { useQuery } from "@tanstack/react-query"
import { callAws } from "@/lib/aws"

export type Attributes = Record<string, string | undefined>
export type Queue = { url: string; name: string; attributes: Attributes; tags?: Record<string, string> }

export const queueName = (url: string) => decodeURIComponent(url.split("/").pop() ?? url)
export const isFifo = (name: string) => name.endsWith(".fifo")

export async function getAttributes(url: string) {
  return (await callAws<{ Attributes?: Attributes }>("sqs", "GetQueueAttributes", { QueueUrl: url, AttributeNames: ["All"] })).Attributes ?? {}
}

export function useQueues() {
  return useQuery({
    queryKey: ["emulator", "sqs", "queues"],
    queryFn: async () => {
      const urls: string[] = []
      let token: string | undefined
      do {
        const page = await callAws<{ QueueUrls?: string[]; NextToken?: string }>("sqs", "ListQueues", { MaxResults: 1000, ...(token ? { NextToken: token } : {}) })
        urls.push(...(page.QueueUrls ?? []))
        token = page.NextToken
      } while (token)
      return Promise.all(urls.map(async (url): Promise<Queue> => ({ url, name: queueName(url), attributes: await getAttributes(url).catch(() => ({})) })))
    },
  })
}

export function useQueueUrl(name: string) {
  return useQuery({
    queryKey: ["emulator", "sqs", "url", name],
    enabled: Boolean(name),
    queryFn: async () => (await callAws<{ QueueUrl?: string }>("sqs", "GetQueueUrl", { QueueName: name })).QueueUrl ?? "",
  })
}

export function useQueue(name: string) {
  const url = useQueueUrl(name)
  const attrs = useQuery({
    queryKey: ["emulator", "sqs", "attributes", url.data],
    enabled: Boolean(url.data),
    queryFn: () => getAttributes(url.data ?? ""),
  })
  return { url: url.data, attributes: attrs.data, isPending: url.isPending || attrs.isPending, error: url.error ?? attrs.error, refetch: () => attrs.refetch() }
}

export function seconds(value?: string) {
  if (value === undefined) return "–"
  const n = Number(value)
  if (n % 86400 === 0 && n >= 86400) return `${n / 86400} Day${n === 86400 ? "" : "s"}`
  if (n % 3600 === 0 && n >= 3600) return `${n / 3600} Hour${n === 3600 ? "" : "s"}`
  if (n % 60 === 0 && n >= 60) return `${n / 60} Minute${n === 60 ? "" : "s"}`
  return `${n} Second${n === 1 ? "" : "s"}`
}

export function epoch(value?: string) {
  if (!value) return "–"
  const date = new Date(Number(value) * 1000)
  return date.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "short" })
}

export function encryption(attributes?: Attributes) {
  if (attributes?.KmsMasterKeyId) return "Amazon SQS key (SSE-KMS)"
  if (attributes?.SqsManagedSseEnabled === "true") return "Amazon SQS key (SSE-SQS)"
  return "–"
}

export function redrive(attributes?: Attributes): { deadLetterTargetArn?: string; maxReceiveCount?: number } | undefined {
  try {
    return attributes?.RedrivePolicy ? JSON.parse(attributes.RedrivePolicy) : undefined
  } catch {
    return undefined
  }
}

export const arnName = (arn?: string) => arn?.split(":").pop() ?? ""
