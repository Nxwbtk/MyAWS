"use client"

import Button from "@cloudscape-design/components/button"
import {
  QueryClient,
  QueryClientProvider,
  useIsFetching,
  useQueryClient,
} from "@tanstack/react-query"
import { usePathname } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { FooterBar } from "@/components/shell/footer-bar"
import { TopNav } from "@/components/shell/top-nav"
import { recentServicesKey, useRecentServices } from "@/lib/console-client"
import { favoritesKey, useFavorites } from "@/lib/favorites"
import { findCatalogService } from "@/lib/service-catalog"
import { useVisualMode, watchBrowserMode } from "@/lib/visual-mode"

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
  const serviceId = findCatalogService(pathname.split("/")[1] ?? "")?.id

  useEffect(() => {
    useVisualMode.getState().restore()
    useFavorites.getState().restore()
    const sync = (event: StorageEvent) => {
      if (event.key === favoritesKey || event.key === null) useFavorites.getState().restore()
    }
    window.addEventListener("storage", sync)
    const unwatch = watchBrowserMode()
    return () => {
      window.removeEventListener("storage", sync)
      unwatch()
    }
  }, [])

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
    <>
      <TopNav />
      {children}
      <FooterBar />
    </>
  )
}

export function RefreshButton() {
  const client = useQueryClient()
  const fetching = useIsFetching({ queryKey: ["emulator"] }) > 0
  return (
    <Button
      iconName="refresh"
      ariaLabel="Refresh"
      loading={fetching}
      onClick={() => void client.invalidateQueries({ queryKey: ["emulator"] })}
    />
  )
}
