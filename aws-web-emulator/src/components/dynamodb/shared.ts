"use client"

import { useQuery } from "@tanstack/react-query"
import { callAws } from "@/lib/aws"

export type Table = {
  TableName?: string
  TableStatus?: string
  KeySchema?: { AttributeName?: string; KeyType?: string }[]
  AttributeDefinitions?: { AttributeName?: string; AttributeType?: string }[]
  GlobalSecondaryIndexes?: Index[]
  LocalSecondaryIndexes?: Index[]
  Replicas?: { RegionName?: string; ReplicaStatus?: string }[]
  DeletionProtectionEnabled?: boolean
  BillingModeSummary?: { BillingMode?: string }
  ProvisionedThroughput?: { ReadCapacityUnits?: number; WriteCapacityUnits?: number }
  TableSizeBytes?: number
  ItemCount?: number
  TableClassSummary?: { TableClass?: string }
  TableArn?: string
  CreationDateTime?: string
  StreamSpecification?: { StreamEnabled?: boolean; StreamViewType?: string }
  LatestStreamArn?: string
  SSEDescription?: { Status?: string; SSEType?: string; KMSMasterKeyArn?: string }
  OnDemandThroughput?: { MaxReadRequestUnits?: number; MaxWriteRequestUnits?: number }
  TableId?: string
}

export type Index = {
  IndexName?: string
  KeySchema?: { AttributeName?: string; KeyType?: string }[]
  Projection?: { ProjectionType?: string; NonKeyAttributes?: string[] }
  IndexStatus?: string
  ItemCount?: number
  IndexSizeBytes?: number
  ProvisionedThroughput?: { ReadCapacityUnits?: number; WriteCapacityUnits?: number }
}

export const keyOf = (table: Table | undefined, type: "HASH" | "RANGE") => table?.KeySchema?.find((key) => key.KeyType === type)?.AttributeName
export const typeOf = (table: Table | undefined, name?: string) => {
  const t = table?.AttributeDefinitions?.find((def) => def.AttributeName === name)?.AttributeType
  return t === "S" ? "String" : t === "N" ? "Number" : t === "B" ? "Binary" : t
}
export const capacityMode = (table?: Table) => (table?.BillingModeSummary?.BillingMode === "PROVISIONED" || (!table?.BillingModeSummary && table?.ProvisionedThroughput?.ReadCapacityUnits) ? "Provisioned" : "On-demand")

export function useTableNames() {
  return useQuery({
    queryKey: ["emulator", "dynamodb", "names"],
    queryFn: async () => {
      const names: string[] = []
      let start: string | undefined
      do {
        const page = await callAws<{ TableNames?: string[]; LastEvaluatedTableName?: string }>("dynamodb", "ListTables", { ...(start ? { ExclusiveStartTableName: start } : {}), Limit: 100 })
        names.push(...(page.TableNames ?? []))
        start = page.LastEvaluatedTableName
      } while (start)
      return names
    },
  })
}

export function useTables() {
  const names = useTableNames()
  const tables = useQuery({
    queryKey: ["emulator", "dynamodb", "tables", names.data],
    enabled: Boolean(names.data),
    refetchInterval: (query) => ((query.state.data ?? []).some((table) => table.TableStatus && table.TableStatus !== "ACTIVE") ? 3000 : false),
    queryFn: async () => Promise.all((names.data ?? []).map(async (name) => (await callAws<{ Table?: Table }>("dynamodb", "DescribeTable", { TableName: name })).Table ?? { TableName: name })),
  })
  return { ...tables, isPending: names.isPending || tables.isPending, error: names.error ?? tables.error, refetchAll: async () => { await names.refetch(); await tables.refetch() } }
}

export function useTable(name: string) {
  return useQuery({
    queryKey: ["emulator", "dynamodb", "table", name],
    enabled: Boolean(name),
    refetchInterval: (query) => (query.state.data?.TableStatus && query.state.data.TableStatus !== "ACTIVE" ? 3000 : false),
    queryFn: async () => (await callAws<{ Table?: Table }>("dynamodb", "DescribeTable", { TableName: name })).Table ?? null,
  })
}

export function bytes(value?: number) {
  if (value === undefined) return "–"
  if (value < 1024) return `${value} bytes`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} kilobytes`
  return `${(value / 1024 / 1024).toFixed(1)} megabytes`
}

const favoritesKey = "myaws.dynamodb.favorites.v1"
export function readFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(favoritesKey) ?? "[]")
  } catch {
    return []
  }
}
export function writeFavorites(names: string[]) {
  try {
    localStorage.setItem(favoritesKey, JSON.stringify(names))
  } catch {
    // Keep favorites in memory.
  }
}
