"use client"

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"
import { useQuery } from "@tanstack/react-query"
import { callAws, listAll } from "@/lib/aws"

export type FunctionConfig = {
  FunctionName?: string
  FunctionArn?: string
  Runtime?: string
  Role?: string
  Handler?: string
  CodeSize?: number
  Description?: string
  Timeout?: number
  MemorySize?: number
  LastModified?: string
  CodeSha256?: string
  Version?: string
  Environment?: { Variables?: Record<string, string> }
  TracingConfig?: { Mode?: string }
  State?: string
  StateReason?: string
  LastUpdateStatus?: string
  PackageType?: string
  Architectures?: string[]
  EphemeralStorage?: { Size?: number }
  Layers?: { Arn?: string; CodeSize?: number }[]
  VpcConfig?: { SubnetIds?: string[]; SecurityGroupIds?: string[]; VpcId?: string }
  DeadLetterConfig?: { TargetArn?: string }
  LoggingConfig?: { LogFormat?: string; LogGroup?: string; ApplicationLogLevel?: string; SystemLogLevel?: string }
  SnapStart?: { ApplyOn?: string; OptimizationStatus?: string }
  RuntimeVersionConfig?: { RuntimeVersionArn?: string }
}

export const runtimes = [
  { value: "nodejs24.x", label: "Node.js 24.x" },
  { value: "nodejs22.x", label: "Node.js 22.x" },
  { value: "nodejs20.x", label: "Node.js 20.x" },
  { value: "python3.14", label: "Python 3.14" },
  { value: "python3.13", label: "Python 3.13" },
  { value: "python3.12", label: "Python 3.12" },
  { value: "ruby3.4", label: "Ruby 3.4" },
  { value: "java21", label: "Java 21" },
  { value: "dotnet8", label: ".NET 8" },
  { value: "provided.al2023", label: "Amazon Linux 2023" },
]

export const runtimeLabel = (value?: string) => runtimes.find((r) => r.value === value)?.label ?? value ?? "–"

export function starterCode(runtime: string): { file: string; handler: string; code: string } {
  if (runtime.startsWith("python")) return { file: "lambda_function.py", handler: "lambda_function.lambda_handler", code: "import json\n\ndef lambda_handler(event, context):\n    # TODO implement\n    return {\n        'statusCode': 200,\n        'body': json.dumps('Hello from Lambda!')\n    }\n" }
  if (runtime.startsWith("ruby")) return { file: "lambda_function.rb", handler: "lambda_function.lambda_handler", code: "require 'json'\n\ndef lambda_handler(event:, context:)\n  # TODO implement\n  { statusCode: 200, body: JSON.generate('Hello from Lambda!') }\nend\n" }
  return { file: "index.mjs", handler: "index.handler", code: "export const handler = async (event) => {\n  // TODO implement\n  const response = {\n    statusCode: 200,\n    body: JSON.stringify('Hello from Lambda!'),\n  };\n  return response;\n};\n" }
}

export function zipFiles(files: Record<string, string>) {
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])))
  let binary = ""
  zip.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary)
}

export function unzipBase64(data: string): Record<string, string> {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  const entries = unzipSync(bytes)
  return Object.fromEntries(Object.entries(entries).filter(([name]) => !name.endsWith("/")).map(([name, content]) => [name, content.length > 512 * 1024 ? "// File is too large to display in the editor." : strFromU8(content)]))
}

export function decodePayload(payload: unknown) {
  const blob = payload as { encoding?: string; data?: string } | string | undefined
  if (!blob) return ""
  if (typeof blob === "string") return blob
  if (blob.encoding === "base64" && blob.data) {
    const bytes = Uint8Array.from(atob(blob.data), (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }
  return JSON.stringify(blob)
}

export function encodeText(text: string) {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary)
}

export function useFunctions() {
  return useQuery({
    queryKey: ["emulator", "lambda", "functions"],
    queryFn: () => listAll<FunctionConfig>("lambda", "ListFunctions", { MaxItems: 50 }, (page) => page.Functions as FunctionConfig[], { input: "Marker", output: "NextMarker" }, 2000),
  })
}

export async function fetchCode(functionName: string, qualifier?: string) {
  const response = await fetch("/api/emulator/lambda-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ functionName, qualifier }) })
  const body = (await response.json()) as { zip?: string; error?: string; imageUri?: string }
  if (!response.ok) throw new Error(body.error ?? "Couldn't load the function code.")
  return body
}

export async function waitForUpdate(name: string) {
  for (let i = 0; i < 20; i++) {
    const c = await callAws<FunctionConfig>("lambda", "GetFunctionConfiguration", { FunctionName: name })
    if (c.LastUpdateStatus !== "InProgress" && c.State !== "Pending") return c
    await new Promise((r) => setTimeout(r, 500))
  }
}

export const fnHref = (name?: string, tab?: string) => `/lambda/functions/${encodeURIComponent(name ?? "")}${tab ? `?tab=${tab}` : ""}`

export function lambdaDate(value?: string) {
  if (!value) return "–"
  const date = new Date(value.replace(/\+0000$/, "Z"))
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds} seconds ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}
