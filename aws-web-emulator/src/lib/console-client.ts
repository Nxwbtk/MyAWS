"use client"

import { queryOptions } from "@tanstack/react-query"
import { create } from "zustand"
import type { Health, Resource, Service } from "@/lib/contracts"
import { findCatalogService } from "@/lib/service-catalog"

export function emulatorUrl(
  kind: string,
  params: Record<string, string | undefined> = {},
) {
  const search = new URLSearchParams({ kind })
  for (const [name, value] of Object.entries(params))
    if (value !== undefined) search.set(name, value)
  return `/api/emulator?${search}`
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(body?.error ?? `Request failed (HTTP ${response.status}).`)
  return body
}

export async function readEmulator<T>(
  kind: string,
  params: Record<string, string | undefined> = {},
  signal?: AbortSignal,
) {
  return readResponse<T>(
    await fetch(emulatorUrl(kind, params), { signal, cache: "no-store" }),
  )
}

export async function writeEmulator<T = { id?: string }>(
  input: Record<string, unknown> | FormData,
) {
  return readResponse<T>(
    await fetch("/api/emulator", {
      method: "POST",
      ...(input instanceof FormData
        ? { body: input }
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }),
    }),
  )
}

export const healthQuery = queryOptions({
  queryKey: ["emulator", "health"],
  queryFn: ({ signal }) => readEmulator<Health>("health", {}, signal),
  refetchInterval: 8000,
})

export const resourceQuery = (service: Service) =>
  queryOptions({
    queryKey: ["emulator", service, "resources"],
    queryFn: ({ signal }) => readEmulator<Resource[]>(service, {}, signal),
  })

export const detailKey = (service: Service, resource: string) => [
  "emulator",
  service,
  "detail",
  resource,
]

export const useConsoleStore = create<{
  selected: Partial<Record<Service, string>>
  filters: Partial<Record<Service, string>>
  select: (service: Service, value: string) => void
  filter: (service: Service, value: string) => void
}>((set) => ({
  selected: {},
  filters: {},
  select: (service, value) =>
    set((state) => ({ selected: { ...state.selected, [service]: value } })),
  filter: (service, value) =>
    set((state) => ({ filters: { ...state.filters, [service]: value } })),
}))

export const recentServicesKey = "myaws.recent-services.v1"
const recentLimit = 12

function readRecentServices(): string[] | undefined {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(recentServicesKey) ?? "[]",
    )
    if (!Array.isArray(value)) return []
    const valid = value.filter(
      (id): id is string =>
        typeof id === "string" && Boolean(findCatalogService(id)),
    )
    return [...new Set(valid)].slice(0, recentLimit)
  } catch {
    return undefined
  }
}

export const useRecentServices = create<{
  ids: string[]
  restore: () => void
  record: (id: string) => void
}>((set, get) => ({
  ids: [],
  restore: () => {
    const ids = readRecentServices()
    if (ids) set({ ids })
  },
  record: (id) => {
    if (!findCatalogService(id)) return
    const previous = readRecentServices() ?? get().ids
    const ids = [
      id,
      ...previous.filter((previousId) => previousId !== id),
    ].slice(0, recentLimit)
    set({ ids })
    try {
      localStorage.setItem(recentServicesKey, JSON.stringify(ids))
    } catch {
      // Keep the in-memory history available if the browser disables storage.
    }
  },
}))
