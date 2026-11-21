import catalog from "@/data/s3-operations.json"

export type S3Model = keyof typeof catalog
export type S3Input = readonly [
  name: string,
  kind: "text" | "number" | "date" | "boolean" | "enum" | "file" | "json",
  required: boolean,
  choices?: readonly string[],
]
export type S3Operation = {
  state: "available" | "stub" | "unwired" | "retired"
  input: readonly S3Input[]
  nestedDates?: readonly (readonly string[])[]
}

// The generator validates the tuple layout before emitting the JSON inventory.
export const s3Operations = catalog as unknown as Record<
  S3Model,
  Record<string, S3Operation>
>

export function findS3Operation(model: string, action: string) {
  if (!Object.hasOwn(s3Operations, model)) return
  const operations = s3Operations[model as S3Model]
  if (!Object.hasOwn(operations, action)) return
  return operations[action]
}

export function s3OperationLabel(action: string) {
  return action
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
}
