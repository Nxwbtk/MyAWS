"use client"

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query"
import { findS3Operation, type S3Model } from "@/lib/s3-catalog"
import { s3Environment, s3Read, s3Request, S3RequestError } from "@/lib/s3-client"

export const unsupported = "Not available in the local emulator."

export function s3Available(model: S3Model, action: string) {
  return findS3Operation(model, action)?.state === "available"
}

export function useS3Environment() {
  return useQuery({
    queryKey: ["emulator", "s3", "environment"],
    queryFn: ({ signal }) => s3Environment(signal),
    staleTime: Infinity,
  })
}

/** Reads an S3 operation. Missing configuration (HTTP 404) resolves to null. */
export function useS3<T extends object = Record<string, unknown>>(
  model: S3Model,
  action: string,
  input: Record<string, unknown> = {},
  options: Omit<UseQueryOptions<T | null>, "queryKey" | "queryFn"> & { missingIsNull?: boolean } = {},
) {
  const { missingIsNull = true, ...rest } = options
  const available = s3Available(model, action)
  const query = useQuery<T | null>({
    queryKey: ["emulator", "s3", model, action, input],
    queryFn: async ({ signal }) => {
      try {
        return await s3Read<T>(model, action, input, signal)
      } catch (error) {
        if (missingIsNull && error instanceof S3RequestError && error.status === 404) return null
        throw error
      }
    },
    ...rest,
    enabled: available && (rest.enabled ?? true),
  })
  return { ...query, available }
}

export function useS3Action<T extends object = Record<string, unknown>>(model: S3Model, action: string) {
  const client = useQueryClient()
  const mutation = useMutation<T | undefined, Error, Record<string, unknown>>({
    mutationFn: async (input) => (await s3Request<T>(model, action, input)).data,
    onSettled: () => client.invalidateQueries({ queryKey: ["emulator"] }),
  })
  return { ...mutation, available: s3Available(model, action) }
}

export function useInvalidate() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ["emulator"] })
}

export { s3Read, s3Request }
