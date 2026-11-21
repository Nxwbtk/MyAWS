"use client"

import {
  QueryClient,
  QueryClientProvider,
  useIsFetching,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { ChevronRight, Globe2, RefreshCw } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Popover as PopoverPrimitive } from "radix-ui"
import { useEffect, useState, type ReactNode } from "react"
import { ServiceSearch } from "@/components/service-search"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  healthQuery,
  recentServicesKey,
  useRecentServices,
} from "@/lib/console-client"
import { managedServiceNames } from "@/lib/contracts"
import { findCatalogService } from "@/lib/service-catalog"
import { cn } from "@/lib/utils"

export function ConsoleShell({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5000, retry: false } },
      }),
  )
  return (
    <QueryClientProvider client={client}>
      <Shell>{children}</Shell>
    </QueryClientProvider>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const service = findCatalogService(pathname.replace(/^\/|\/$/g, ""))
  const serviceId = service?.id

  useEffect(() => {
    const { record, restore } = useRecentServices.getState()
    if (serviceId) record(serviceId)
    else restore()

    const sync = (event: StorageEvent) => {
      if (event.key === recentServicesKey || event.key === null) restore()
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [serviceId])

  return (
    <div className="min-h-dvh">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:m-2 focus:rounded-md focus:bg-popover focus:px-4 focus:py-2 focus:text-popover-foreground"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-navigation-border/60 bg-navigation text-navigation-foreground">
        <div className="mx-auto flex min-h-13 max-w-[1680px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:gap-x-5 sm:px-6">
          <Link
            href="/"
            aria-label="MyAWS console home"
            className="flex shrink-0 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-navigation-focus"
          >
            <Image
              src="/aws-cloud-logo.svg"
              alt="AWS"
              width={32}
              height={32}
              unoptimized
              className="size-8 shrink-0 rounded-md"
            />
            <span className="text-lg font-semibold tracking-tight">MyAWS</span>
          </Link>
          <ServiceSearch key={pathname} />
          <ConnectionControls />
        </div>
      </header>

      {service && (
        <div className="border-b bg-card">
          <div className="mx-auto flex min-h-11 max-w-[1440px] items-center justify-between gap-3 px-4 py-1.5 sm:px-7">
            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 items-center gap-2 text-sm"
            >
              <Link
                className="shrink-0 font-medium text-link hover:underline"
                href="/"
              >
                Console home
              </Link>
              <ChevronRight
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span aria-current="page" className="truncate font-medium">
                {service.name}
              </span>
            </nav>
            {managedServiceNames.includes(service.id) && <RefreshButton />}
          </div>
        </div>
      )}
      <main
        id="content"
        className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 sm:px-7 sm:py-6"
      >
        {children}
      </main>
    </div>
  )
}

function ConnectionControls() {
  const health = useQuery(healthQuery)
  const connected = health.data?.connected
  return (
    <div className="ml-auto flex shrink-0 items-center gap-3 text-sm sm:gap-4">
      {health.data && (
        <div
          aria-label={`Region ${health.data.region}`}
          className="hidden items-center gap-2 text-navigation-foreground md:flex"
        >
          <Globe2 className="size-4 text-navigation-muted" aria-hidden />
          <span className="font-mono">{health.data.region}</span>
        </div>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 gap-2 rounded-md border border-navigation-border px-2.5 text-navigation-foreground hover:bg-navigation-hover hover:text-navigation-foreground focus-visible:ring-navigation-focus/50 aria-expanded:bg-navigation-hover aria-expanded:text-navigation-foreground"
            title="Emulator connection"
          >
            <span
              className={cn(
                "size-2 rounded-full",
                connected
                  ? "bg-success"
                  : health.isPending
                    ? "bg-navigation-muted"
                    : "bg-warning",
              )}
              aria-hidden
            />
            {connected
              ? "API online"
              : health.isPending
                ? "Checking API"
                : "API offline"}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={10}
          aria-label="Emulator connection"
          className="w-[min(21rem,calc(100vw-1.5rem))] gap-3 p-4"
        >
          <h2 className="font-semibold">Emulator connection</h2>
          {health.data && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">API endpoint</dt>
                <dd className="font-mono break-all">{health.data.endpoint}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Region</dt>
                <dd className="font-mono">{health.data.region}</dd>
              </div>
            </dl>
          )}
          {!connected && !health.isPending && (
            <div className="space-y-2 rounded-md bg-warning-muted p-3 text-sm text-warning">
              <p>
                {health.error?.message ??
                  health.data?.detail ??
                  "The emulator did not respond."}
              </p>
              <PopoverPrimitive.Close asChild>
                <Link href="/#local-setup" className="font-medium underline">
                  View startup commands
                </Link>
              </PopoverPrimitive.Close>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function RefreshButton() {
  const client = useQueryClient()
  const fetching = useIsFetching({ queryKey: ["emulator"] }) > 0
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void client.invalidateQueries({ queryKey: ["emulator"] })}
      disabled={fetching}
    >
      <RefreshCw
        aria-hidden
        className={cn("size-4", fetching && "motion-safe:animate-spin")}
      />
      Refresh
    </Button>
  )
}
