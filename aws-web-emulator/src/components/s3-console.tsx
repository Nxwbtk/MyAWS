"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { S3Buckets } from "@/components/s3-buckets"
import { S3Collections } from "@/components/s3-collections"
import { S3Operations, S3Settings, s3Models } from "@/components/s3-operations"
import { Phase1OperationExplorer } from "@/components/phase-1-operation-explorer"
import { s3SelectClass } from "@/components/s3-operation-form"
import { ServiceIcon } from "@/components/service-icon"
import { Button } from "@/components/ui/button"
import { type S3Model } from "@/lib/s3-catalog"
import { cn } from "@/lib/utils"

const groups = [
  {
    label: "Buckets",
    areas: [
      ["general", "General purpose buckets"],
      ["directory", "Directory buckets"],
      ["tables", "Table buckets"],
      ["vectors", "Vector buckets"],
      ["files", "File systems"],
    ],
  },
  {
    label: "Access and administration",
    areas: [
      ["access", "Access Points"],
      ["grants", "Access Grants"],
      ["lens", "Storage Lens"],
      ["batch", "Batch Operations"],
      ["account", "Account and organization settings"],
    ],
  },
  {
    label: "Additional S3 tools",
    areas: [
      ["outposts", "S3 on Outposts"],
      ["operations", "API operations"],
    ],
  },
] as const

const collections = {
  tables: { model: "s3tables" },
  vectors: { model: "s3vectors" },
  files: { model: "s3files" },
  access: { model: "s3control", filter: /AccessPoint/ },
  grants: { model: "s3control", filter: /AccessGrant|GetDataAccess/ },
  lens: { model: "s3control", filter: /StorageLens/ },
  batch: { model: "s3control", filter: /Job/ },
  outposts: { model: "s3outposts" },
} as const satisfies Record<string, { model: S3Model; filter?: RegExp }>

const actionTitles = new Map([
  ["create", "Create bucket"],
  ["empty", "Empty bucket"],
  ["delete", "Delete bucket"],
  ["upload", "Upload"],
  ["folder", "Create folder"],
  ["copy", "Copy object"],
  ["delete-object", "Delete object"],
  ["rename-object", "Rename object"],
])

export function S3Console() {
  const router = useRouter()
  const params = useSearchParams()
  const currentArea = params.get("area") ?? "general"
  const active = groups
    .flatMap(({ areas }) => [...areas])
    .find(([id]) => id === currentArea)
  const [area, label] = active ?? ["general", "General purpose buckets"]
  const bucket = params.get("bucket") ?? undefined
  const object = params.get("object") ?? undefined
  const version = params.get("version") ?? undefined
  const action = params.get("action") ?? undefined
  const tab = params.get("tab") ?? undefined
  const prefix = params.get("prefix") ?? undefined
  const name = params.get("model") ?? "s3"
  const model = Object.hasOwn(s3Models, name) ? (name as S3Model) : "s3"
  const bucketArea = area === "general" || area === "directory"

  function go(change: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(change)) {
      if (!value || (key === "area" && value === "general")) next.delete(key)
      else next.set(key, value)
    }
    router.push(next.size ? `/s3?${next}` : "/s3", { scroll: false })
  }

  function openArea(id: string) {
    go({
      area: id,
      bucket: undefined,
      action: undefined,
      tab: undefined,
      object: undefined,
      version: undefined,
      prefix: undefined,
      model: undefined,
    })
  }

  const bucketTitle = actionTitles.get(action ?? "") ?? object ?? bucket ?? "Buckets"
  const activeCollection = collections[area as keyof typeof collections]
  return (
    <div className="grid min-w-0 gap-5 md:grid-cols-[12.25rem_minmax(0,1fr)] lg:gap-7">
      <aside className="min-w-0 md:border-r md:pr-4">
        <div className="mb-3 flex items-center gap-2.5">
          <ServiceIcon id="s3" className="size-8" />
          <span className="font-semibold">Amazon S3</span>
        </div>
        <nav aria-label="Amazon S3 navigation" className="space-y-3">
          {groups.map(({ label: group, areas }) => (
            <div key={group}>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {group}
              </p>
              <div className="flex flex-wrap gap-1 md:grid">
                {areas.map(([id, title]) => (
                  <Button
                    key={id}
                    type="button"
                    variant={area === id ? "secondary" : "ghost"}
                    aria-current={area === id ? "page" : undefined}
                    className={cn(
                      "h-auto justify-start px-2 py-1.5 text-left whitespace-normal",
                      area === id && "text-foreground",
                    )}
                    onClick={() => openArea(id)}
                  >
                    {title}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 space-y-4">
        {bucketArea && (bucket || action) && (
          <nav
            aria-label="S3 breadcrumbs"
            className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Button
              variant="link"
              className="h-auto px-0 py-0"
              onClick={() => openArea(area)}
            >
              {label}
            </Button>
            {bucket && (
              <>
                <span aria-hidden>/</span>
                <Button
                  variant="link"
                  className="h-auto px-0 py-0"
                  onClick={() =>
                    go({
                      action: undefined,
                      object: undefined,
                      version: undefined,
                      prefix: undefined,
                      tab: undefined,
                    })
                  }
                >
                  {bucket}
                </Button>
              </>
            )}
          </nav>
        )}
        <h1 className="break-all text-[1.75rem] leading-tight font-semibold tracking-tight">
          {bucketArea ? bucketTitle : label}
        </h1>
        {bucketArea && !bucket && !action && (
          <nav aria-label="Bucket types" className="flex flex-wrap gap-2">
            <Button
              variant={area === "general" ? "secondary" : "outline"}
              aria-current={area === "general" ? "page" : undefined}
              onClick={() => openArea("general")}
            >
              General purpose buckets
            </Button>
            <Button
              variant={area === "directory" ? "secondary" : "outline"}
              aria-current={area === "directory" ? "page" : undefined}
              onClick={() => openArea("directory")}
            >
              Directory buckets
            </Button>
          </nav>
        )}
        {bucketArea && (
          <S3Buckets
            directory={area === "directory"}
            bucket={bucket}
            tab={tab}
            action={action}
            objectKey={object}
            versionId={version}
            prefix={prefix}
            go={go}
          />
        )}
        {activeCollection && (
          <S3Collections key={area} area={area} {...activeCollection} />
        )}
        {area === "account" && (
          <S3Settings
            model="s3control"
            context={{}}
            sections={[
              {
                title: "Block Public Access settings for this account",
                read: "GetPublicAccessBlock",
                actions: ["PutPublicAccessBlock", "DeletePublicAccessBlock"],
              },
            ]}
          />
        )}
        {area === "operations" && (
          <div className="space-y-3">
            <select
              className={`${s3SelectClass} max-w-sm`}
              aria-label="S3 API model"
              value={model}
              onChange={(event) => go({ model: event.target.value })}
            >
              {Object.entries(s3Models).map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
            <S3Operations key={model} model={model} />
            <Phase1OperationExplorer service="s3" />
          </div>
        )}
      </div>
    </div>
  )
}
