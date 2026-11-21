"use client"

import { Command as CommandPrimitive } from "cmdk"
import { Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { ServiceIcon } from "@/components/service-icon"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useRecentServices } from "@/lib/console-client"
import { serviceSchema, services } from "@/lib/contracts"
import {
  findCatalogService,
  searchServices,
  serviceCatalog,
} from "@/lib/service-catalog"

export function ServiceSearch() {
  const router = useRouter()
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const recent = useRecentServices((state) => state.ids)
  const searching = Boolean(query.trim())
  const results = searching
    ? searchServices(query)
    : recent.slice(0, 5).flatMap((id) => findCatalogService(id) ?? [])

  useEffect(() => {
    // cmdk renders its input as expanded. The popover is controlled here.
    input.current?.setAttribute("aria-expanded", String(open))
  }, [open])

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        (!event.altKey || event.code !== "KeyS") &&
        (!(event.metaKey || event.ctrlKey) || event.code !== "KeyK")
      )
        return
      event.preventDefault()
      input.current?.focus()
      setOpen(true)
    }

    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false)
    }

    document.addEventListener("keydown", shortcut)
    document.addEventListener("pointerdown", dismiss)
    return () => {
      document.removeEventListener("keydown", shortcut)
      document.removeEventListener("pointerdown", dismiss)
    }
  }, [])

  function navigate(id: string) {
    setOpen(false)
    setQuery("")
    input.current?.blur()
    router.push(`/${id}`)
  }

  return (
    <div
      ref={root}
      className="relative order-last min-w-0 basis-full sm:order-none sm:max-w-[640px] sm:flex-1"
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <Command
        label="Search services"
        shouldFilter={false}
        className="overflow-visible bg-transparent p-0"
      >
        <div className="flex h-9 items-center gap-2.5 rounded-lg border border-navigation-border bg-navigation-control px-3 text-navigation-foreground focus-within:border-navigation-focus focus-within:ring-1 focus-within:ring-navigation-focus">
          <Search
            aria-hidden
            className="size-4 shrink-0 text-navigation-muted"
          />
          <CommandPrimitive.Input
            data-service-search=""
            ref={input}
            value={query}
            onValueChange={(value) => {
              setQuery(value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            aria-label="Search services"
            aria-keyshortcuts="Alt+S Control+K Meta+K"
            placeholder="Search services"
            autoComplete="off"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent text-sm placeholder:text-navigation-muted focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear service search"
              className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-navigation-hover focus-visible:outline-2 focus-visible:outline-navigation-focus"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ")
                  event.stopPropagation()
              }}
              onClick={() => {
                setQuery("")
                setOpen(true)
                input.current?.focus()
              }}
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : (
            <kbd
              aria-hidden
              className="hidden shrink-0 rounded border border-navigation-border px-1.5 py-0.5 font-sans text-xs text-navigation-muted md:inline"
            >
              Alt S
            </kbd>
          )}
        </div>
        <CommandList
          hidden={!open}
          aria-label={searching ? "Services" : "Recently visited"}
          className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-30 max-h-[min(28rem,60dvh)] rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {open &&
            (results.length ? (
              <CommandGroup
                heading={searching ? "Services" : "Recently visited"}
              >
                {results.map((service) => {
                  const managed = serviceSchema.safeParse(service.id)
                  return (
                    <CommandItem
                      key={service.id}
                      value={service.id}
                      aria-label={service.name}
                      className="min-h-10 gap-2.5 rounded-md border-l-2 border-transparent px-2 py-1.5 data-selected:border-l-primary data-selected:bg-secondary [&_svg]:size-4!"
                      onSelect={() => navigate(service.id)}
                    >
                      <ServiceIcon id={service.id} className="size-7" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {service.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {managed.success
                            ? services[managed.data].category
                            : service.id === "ec2"
                              ? "Compute"
                              : service.id === "vpc"
                                ? "Virtual networks"
                                : "API catalog"}
                        </span>
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : (
              <div
                role="status"
                className="px-3 py-3 text-sm text-muted-foreground"
              >
                {searching
                  ? "No services match your search."
                  : `Search by name or abbreviation across ${serviceCatalog.length} services.`}
              </div>
            ))}
        </CommandList>
      </Command>
    </div>
  )
}
