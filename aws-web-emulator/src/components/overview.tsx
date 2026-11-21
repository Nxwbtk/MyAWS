"use client"

import { useQueries, useQuery } from "@tanstack/react-query"
import {
  Activity,
  Boxes,
  Check,
  Copy,
  History,
  Search,
  Terminal,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useId, useState, type ReactNode } from "react"
import { RefreshButton } from "@/components/console-shell"
import { ServiceIcon } from "@/components/service-icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  healthQuery,
  resourceQuery,
  useRecentServices,
} from "@/lib/console-client"
import { type Service } from "@/lib/contracts"
import { findCatalogService } from "@/lib/service-catalog"
import { cn } from "@/lib/utils"

const inventory: { service: Service; label: string }[] = [
  { service: "s3", label: "Buckets" },
  { service: "dynamodb", label: "Tables" },
  { service: "sqs", label: "Queues" },
]

export function Overview() {
  const health = useQuery(healthQuery)
  const connected = health.data?.connected === true
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
            Console Home
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Local AWS Emulator
          </p>
        </div>
        <RefreshButton />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <RecentServices />
        <DashboardPanel
          title="Emulator status"
          icon={Activity}
          action={
            <Badge
              variant="secondary"
              className={cn(
                "gap-1.5 rounded-md px-2 font-medium",
                connected
                  ? "bg-success-muted text-success"
                  : health.isPending
                    ? "bg-muted text-muted-foreground"
                    : "bg-warning-muted text-warning",
              )}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {connected ? "Online" : health.isPending ? "Checking" : "Offline"}
            </Badge>
          }
        >
          <dl className="divide-y px-4 text-sm">
            <div className="grid gap-1 py-3 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-3">
              <dt className="text-muted-foreground">Endpoint</dt>
              <dd className="font-mono break-all">
                {health.data?.endpoint ?? "—"}
              </dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-3">
              <dt className="text-muted-foreground">Region</dt>
              <dd className="font-mono">{health.data?.region ?? "—"}</dd>
            </div>
          </dl>
          {!connected && !health.isPending && (
            <div className="mx-4 mb-4 space-y-2 rounded-lg bg-warning-muted px-3 py-2 text-sm text-warning">
              <p>
                {health.error?.message ??
                  health.data?.detail ??
                  "The emulator did not respond."}
              </p>
              <a href="#local-setup" className="font-medium underline">
                View startup commands
              </a>
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel
          id="local-setup"
          title="Local setup"
          icon={Terminal}
          className="scroll-mt-28 sm:scroll-mt-18"
        >
          <div className="space-y-3 px-4 py-4">
            <p className="text-sm text-muted-foreground">
              Run from <code>aws-web-emulator</code> in separate terminals.
            </p>
            <CommandSnippet
              title="Start the emulator API"
              command={[
                'mkdir -p "$HOME/.aws/emulator"',
                'EMULATOR_UID="$(id -u)" EMULATOR_GID="$(id -g)" \\',
                "  docker compose up --build -d",
              ].join("\n")}
            />
            <CommandSnippet
              title="Run the web console"
              command={"npm ci\nnpm run dev"}
            />
          </div>
        </DashboardPanel>

        <ResourceInventory connected={connected} />
      </div>
    </>
  )
}

function DashboardPanel({
  id,
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  id?: string
  title: string
  icon: LucideIcon
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const headingId = useId()
  return (
    <Card
      id={id}
      role="region"
      aria-labelledby={headingId}
      className={cn("min-w-0 gap-0 rounded-xl border py-0 ring-0", className)}
    >
      <CardHeader className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b bg-surface-subtle px-4 py-2.5 [.border-b]:pb-2.5">
        <h2
          id={headingId}
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
        >
          <Icon aria-hidden className="size-4 shrink-0 text-link" />
          {title}
        </h2>
        {action}
      </CardHeader>
      <CardContent className="min-w-0 p-0">{children}</CardContent>
    </Card>
  )
}

function RecentServices() {
  const ids = useRecentServices((state) => state.ids)
  const recent = ids.flatMap((id) => findCatalogService(id) ?? [])
  return (
    <DashboardPanel
      title="Recently visited"
      icon={History}
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            document
              .querySelector<HTMLInputElement>("[data-service-search]")
              ?.focus()
          }
        >
          <Search aria-hidden /> Find a service
        </Button>
      }
    >
      {recent.length ? (
        <ul
          aria-label="Recently visited services"
          className="max-h-[21rem] divide-y overflow-y-auto px-3 py-1"
        >
          {recent.map((service) => (
            <li key={service.id}>
              <Link
                href={`/${service.id}`}
                className="flex min-h-11 items-center gap-3 px-1 py-2 text-sm font-medium text-link transition-colors hover:bg-accent hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2"
              >
                <ServiceIcon id={service.id} className="size-6" />
                <span>{service.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 py-7 text-sm">
          <p className="font-medium">No recently visited services</p>
          <p className="mt-1 text-muted-foreground">
            Open a service from Search to find it here next time.
          </p>
        </div>
      )}
    </DashboardPanel>
  )
}

function ResourceInventory({ connected }: { connected: boolean }) {
  const snapshots = useQueries({
    queries: inventory.map(({ service }) => ({
      ...resourceQuery(service),
      enabled: connected,
    })),
  })
  const failed = snapshots.some((snapshot) => snapshot.isError)
  return (
    <DashboardPanel title="Local resources" icon={Boxes}>
      <div className="space-y-3 p-4">
        <dl className="grid grid-cols-3 divide-x overflow-hidden rounded-lg border bg-background/45">
          {inventory.map(({ service, label }, index) => (
            <div key={service} className="min-w-0 px-2 py-3 sm:px-3">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">
                {connected && !snapshots[index].isError
                  ? (snapshots[index].data?.length ?? "—")
                  : "—"}
              </dd>
            </div>
          ))}
        </dl>
        <p
          className={cn(
            "text-sm",
            connected && failed ? "text-warning" : "text-muted-foreground",
          )}
        >
          {connected
            ? failed
              ? "Some resource counts are unavailable."
              : "Counts from the local emulator."
            : "Counts appear when the API is online."}
        </p>
      </div>
    </DashboardPanel>
  )
}

function CommandSnippet({
  title,
  command,
}: {
  title: string
  command: string
}) {
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed">()
  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopyStatus("copied")
    } catch {
      setCopyStatus("failed")
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background/55">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copy()}
          aria-label={`Copy commands to ${title.toLowerCase()}`}
        >
          {copyStatus === "copied" ? (
            <>
              <Check aria-hidden /> Copied
            </>
          ) : (
            <>
              <Copy aria-hidden /> Copy
            </>
          )}
        </Button>
      </div>
      <pre className="px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
        <code>{command}</code>
      </pre>
      {copyStatus === "failed" && (
        <p role="status" className="px-3 pb-2 text-xs text-warning">
          Clipboard unavailable. Select the command to copy it.
        </p>
      )}
      {copyStatus === "copied" && (
        <p role="status" className="sr-only">
          Commands copied.
        </p>
      )}
    </div>
  )
}
