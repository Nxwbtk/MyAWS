import { Badge } from "@/components/ui/badge"

function safeDisplay(value: unknown, key: string): string {
  if (/secret|token|password|credential|authorization/i.test(key)) return "••••••••"
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (typeof value === "object") return ""
  return String(value)
}

function ScalarValue({ value, name }: { value: unknown; name: string }) {
  const text = safeDisplay(value, name)
  let formatted: string | undefined
  if (text !== "—" && text !== "••••••••" && typeof value === "string" && /body|document|definition|pattern|policy|template/i.test(name)) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (parsed && typeof parsed === "object") {
        formatted = JSON.stringify(parsed, null, 2)
      }
    } catch {
      // Keep non-JSON strings as ordinary values.
    }
  }
  if (formatted) {
    return <pre className="max-h-80 overflow-auto rounded-md border bg-background p-3 text-xs leading-5 [overflow-wrap:anywhere]">{formatted}</pre>
  }
  return <>{text}</>
}

function PropertyList({
  value,
  depth = 0,
}: {
  value: Record<string, unknown>
  depth?: number
}) {
  if (depth > 6) return <p className="text-xs text-muted-foreground">Additional nested fields omitted.</p>
  const entries = Object.entries(value)
  const scalarEntries = entries.filter(([, item]) =>
    item === null || item === undefined || ["string", "number", "boolean"].includes(typeof item),
  )
  const structuredEntries = entries.filter(([, item]) =>
    item !== null && typeof item === "object",
  )

  return (
    <>
      {scalarEntries.length > 0 && (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {scalarEntries.map(([key, item]) => (
            <div key={key} className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{key}</dt>
              <dd className="mt-1 break-words text-sm"><ScalarValue value={item} name={key} /></dd>
            </div>
          ))}
        </dl>
      )}
      {structuredEntries.map(([key, item]) => (
        <section key={key} className="mt-5 border-t pt-4">
          <h4 className="mb-3 text-sm font-semibold">{key}</h4>
          {Array.isArray(item) ? (
            item.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : item.every((child) => child === null || typeof child !== "object") ? (
              <div className="flex flex-wrap gap-2">
                {item.map((child, index) => (
                  <Badge key={`${String(child)}:${index}`} variant="outline">{safeDisplay(child, key)}</Badge>
                ))}
              </div>
            ) : (
              <div className="grid gap-3">
                {item.map((child, index) => (
                  <div key={index} className="rounded-lg border bg-background p-4">
                    <p className="mb-3 text-xs font-medium text-muted-foreground">{key} {index + 1}</p>
                    {child && typeof child === "object" && !Array.isArray(child) ? (
                      <PropertyList value={child as Record<string, unknown>} depth={depth + 1} />
                    ) : (
                      <p className="text-sm">{safeDisplay(child, key)}</p>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="rounded-lg border bg-background p-4">
              <PropertyList value={item as Record<string, unknown>} depth={depth + 1} />
            </div>
          )}
        </section>
      ))}
    </>
  )
}

export function ResourceDetailView({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-sm text-muted-foreground">No resource details returned.</p>
  }
  if (Array.isArray(value)) {
    return (
      <div className="grid gap-3">
        {value.map((item, index) => (
          <div key={index} className="rounded-lg border bg-surface-subtle p-4">
            {item && typeof item === "object" && !Array.isArray(item)
              ? <PropertyList value={item as Record<string, unknown>} />
              : <p className="text-sm">{safeDisplay(item, "value")}</p>}
          </div>
        ))}
      </div>
    )
  }
  if (typeof value !== "object") return <p className="text-sm">{safeDisplay(value, "value")}</p>
  return (
    <div className="rounded-lg border bg-surface-subtle p-4 sm:p-5">
      <PropertyList value={value as Record<string, unknown>} />
    </div>
  )
}
