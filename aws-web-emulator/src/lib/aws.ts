"use client"

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query"
import operationStatus from "@/data/operation-status.json"
import { runEmulatorOperation } from "@/lib/console-client"

type Status = "stub" | "no_handler" | "retired" | "implemented"
const statuses = operationStatus as Record<string, Record<string, Status>>

/** Whether the emulator implements `model.operation`. */
export function isAvailable(model: string, operation: string) {
  const known = statuses[model]
  if (!known) return false
  return !known[operation]
}

export function unavailableReason(model: string, operation: string) {
  const status = statuses[model]?.[operation]
  if (!statuses[model]) return `${model} is not available in the local emulator.`
  if (status === "stub") return `${operation} is not implemented by the local emulator.`
  if (status === "no_handler") return `${operation} has no handler in the local emulator.`
  if (status === "retired") return `${operation} is retired.`
  return undefined
}

export class AwsError extends Error {}

export function awsKey(model: string, operation: string, input?: unknown) {
  return ["emulator", "aws", model, operation, input ?? {}] as const
}

export function callAws<T = Record<string, unknown>>(
  model: string,
  operation: string,
  input: Record<string, unknown> = {},
  signal?: AbortSignal,
) {
  if (!isAvailable(model, operation))
    return Promise.reject(new AwsError(unavailableReason(model, operation)))
  return runEmulatorOperation<T>(model, operation, input, signal)
}

/** Runs a read operation. Disabled automatically when the emulator lacks it. */
export function useAws<T = Record<string, unknown>>(
  model: string,
  operation: string,
  input: Record<string, unknown> = {},
  options: Omit<UseQueryOptions<T>, "queryKey" | "queryFn"> = {},
) {
  const available = isAvailable(model, operation)
  const query = useQuery<T>({
    queryKey: awsKey(model, operation, input),
    queryFn: ({ signal }) => callAws<T>(model, operation, input, signal),
    ...options,
    enabled: available && (options.enabled ?? true),
  })
  return { ...query, available, unavailable: unavailableReason(model, operation) }
}

/** Runs a write operation and refreshes the emulator queries afterwards. */
export function useAwsMutation<T = Record<string, unknown>>(
  model: string,
  operation: string,
) {
  const client = useQueryClient()
  const mutation = useMutation<T, Error, Record<string, unknown>>({
    mutationFn: (input) => callAws<T>(model, operation, input),
    onSettled: () => client.invalidateQueries({ queryKey: ["emulator"] }),
  })
  return {
    ...mutation,
    available: isAvailable(model, operation),
    unavailable: unavailableReason(model, operation),
  }
}

/** Follows a paginated list operation until it ends or `limit` items load. */
export async function listAll<T>(
  model: string,
  operation: string,
  input: Record<string, unknown>,
  items: (page: Record<string, unknown>) => T[] | undefined,
  next: { input: string; output: string },
  limit = 1000,
) {
  const all: T[] = []
  let token: unknown
  do {
    const page = await callAws(model, operation, {
      ...input,
      ...(token ? { [next.input]: token } : {}),
    })
    all.push(...(items(page) ?? []))
    token = page[next.output]
  } while (token && all.length < limit)
  return all
}
