"use client"

import Icon from "@cloudscape-design/components/icon"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { ServiceIcon } from "@/components/service-icon"
import { FavoriteStar } from "@/components/shell/favorite-star"
import { callAws, isAvailable } from "@/lib/aws"
import { healthQuery, readEmulator, useRecentServices } from "@/lib/console-client"
import type { Resource } from "@/lib/contracts"
import {
  findCatalogService,
  searchServices,
  serviceCatalog,
} from "@/lib/service-catalog"
import { serviceDescription, serviceShortName } from "@/lib/service-meta"

type Feature = { name: string; serviceId: string }

function normalize(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}

// Catalog aliases such as "Amazon S3 Tables" are console features.
const features: Feature[] = serviceCatalog.flatMap((service) =>
  service.aliases
    .filter(
      (alias) =>
        /\s/.test(alias) &&
        /^[A-Z]/.test(alias) &&
        alias !== service.name &&
        !/^(Amazon|AWS) [A-Z][\w-]*$/.test(alias),
    )
    .map((alias) => ({
      name: alias.replace(/^(Amazon|AWS) /, ""),
      serviceId: service.id,
    })),
)

type ResourceHit = { name: string; serviceId: string; type: string; href: string; global?: boolean }

type Source = { serviceId: string; type: string; load: () => Promise<ResourceHit[]> }

const tagName = (tags?: { Key?: string; Value?: string }[]) =>
  tags?.find((tag) => tag.Key === "Name")?.Value

// Resource types the console search indexes, read from the local emulator.
const sources: Source[] = [
  {
    serviceId: "s3", type: "Bucket",
    load: async () => (await readEmulator<Resource[]>("s3")).map((bucket) => ({
      name: bucket.name, serviceId: "s3", type: "Bucket", global: true,
      href: `/s3/buckets/${encodeURIComponent(bucket.name)}`,
    })),
  },
  {
    serviceId: "dynamodb", type: "Table",
    load: async () => (await readEmulator<Resource[]>("dynamodb")).map((table) => ({
      name: table.name, serviceId: "dynamodb", type: "Table",
      href: `/dynamodb/tables/${encodeURIComponent(table.name)}`,
    })),
  },
  {
    serviceId: "sqs", type: "Queue",
    load: async () => (await readEmulator<Resource[]>("sqs")).map((queue) => ({
      name: queue.name, serviceId: "sqs", type: "Queue",
      href: `/sqs/queues/${encodeURIComponent(queue.id)}`,
    })),
  },
  {
    serviceId: "lambda", type: "Function",
    load: async () => {
      const page = await callAws<{ Functions?: { FunctionName?: string }[] }>("lambda", "ListFunctions", { MaxItems: 50 })
      return (page.Functions ?? []).flatMap(({ FunctionName }) => FunctionName ? [{
        name: FunctionName, serviceId: "lambda", type: "Function",
        href: `/lambda/functions/${encodeURIComponent(FunctionName)}`,
      }] : [])
    },
  },
  {
    serviceId: "ec2", type: "Instance",
    load: async () => {
      const page = await callAws<{ Reservations?: { Instances?: { InstanceId?: string; Tags?: { Key?: string; Value?: string }[] }[] }[] }>("ec2", "DescribeInstances", { MaxResults: 100 })
      return (page.Reservations ?? []).flatMap((reservation) => reservation.Instances ?? []).flatMap((instance) => instance.InstanceId ? [{
        name: tagName(instance.Tags) ? `${tagName(instance.Tags)} (${instance.InstanceId})` : instance.InstanceId,
        serviceId: "ec2", type: "Instance", href: `/ec2/instances/${instance.InstanceId}`,
      }] : [])
    },
  },
  {
    serviceId: "vpc", type: "VPC",
    load: async () => {
      const page = await callAws<{ Vpcs?: { VpcId?: string; Tags?: { Key?: string; Value?: string }[] }[] }>("ec2", "DescribeVpcs", { MaxResults: 100 })
      return (page.Vpcs ?? []).flatMap((vpc) => vpc.VpcId ? [{
        name: tagName(vpc.Tags) ? `${tagName(vpc.Tags)} (${vpc.VpcId})` : vpc.VpcId,
        serviceId: "vpc", type: "VPC", href: `/vpc/vpcs/${vpc.VpcId}`,
      }] : [])
    },
  },
  {
    serviceId: "iam", type: "Role",
    load: async () => {
      const page = await callAws<{ Roles?: { RoleName?: string }[] }>("iam", "ListRoles", { MaxItems: 200 })
      return (page.Roles ?? []).flatMap(({ RoleName }) => RoleName ? [{
        name: RoleName, serviceId: "iam", type: "Role", global: true,
        href: `/iam/roles/${encodeURIComponent(RoleName)}`,
      }] : [])
    },
  },
  {
    serviceId: "iam", type: "User",
    load: async () => {
      const page = await callAws<{ Users?: { UserName?: string }[] }>("iam", "ListUsers", { MaxItems: 200 })
      return (page.Users ?? []).flatMap(({ UserName }) => UserName ? [{
        name: UserName, serviceId: "iam", type: "User", global: true,
        href: `/iam/users/${encodeURIComponent(UserName)}`,
      }] : [])
    },
  },
]

function useResources(enabled: boolean) {
  const health = useQuery(healthQuery)
  return useQuery({
    queryKey: ["emulator", "search-resources"],
    enabled: enabled && health.data?.connected === true,
    staleTime: 30_000,
    queryFn: async () => {
      const results = await Promise.allSettled(
        sources
          .filter((source) => source.serviceId !== "lambda" || isAvailable("lambda", "ListFunctions"))
          .map((source) => source.load()),
      )
      return results.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    },
  })
}

function searchFeatures(query: string) {
  const text = normalize(query)
  if (!text) return []
  const seen = new Set<string>()
  return features
    .filter((feature) => normalize(feature.name).includes(text))
    .filter((feature) => {
      const key = feature.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function GlobalSearch() {
  const router = useRouter()
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [showAll, setShowAll] = useState<"services" | "features" | "resources" | null>(null)
  const recent = useRecentServices((state) => state.ids)
  const health = useQuery(healthQuery)

  const searching = Boolean(query.trim())
  const services = useMemo(
    () =>
      searching
        ? searchServices(query)
        : recent.slice(0, 5).flatMap((id) => findCatalogService(id) ?? []),
    [query, recent, searching],
  )
  const featureResults = useMemo(() => searchFeatures(query), [query])
  const resources = useResources(open && searching)
  const resourceResults = useMemo(() => {
    const text = normalize(query)
    return text ? (resources.data ?? []).filter((hit) => normalize(hit.name).includes(text)) : []
  }, [query, resources.data])
  const visibleResources = showAll === "resources" ? resourceResults : resourceResults.slice(0, 3)
  const visibleServices = showAll === "services" ? services : services.slice(0, 3)
  const visibleFeatures =
    showAll === "features" ? featureResults : featureResults.slice(0, 3)
  const targets = [
    ...visibleServices.map((service) => `/${service.id}`),
    ...visibleFeatures.map((feature) => `/${feature.serviceId}`),
    ...visibleResources.map((hit) => hit.href),
  ]

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!event.altKey || event.code !== "KeyS") return
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

  function go(href: string) {
    setOpen(false)
    setQuery("")
    setShowAll(null)
    input.current?.blur()
    router.push(href)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false)
      input.current?.blur()
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
      setActive((value) => Math.min(value + 1, targets.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((value) => Math.max(value - 1, 0))
    } else if (event.key === "Enter" && targets[active]) {
      event.preventDefault()
      go(targets[active])
    }
  }

  const panelOpen = open && (searching || services.length > 0)

  return (
    <div className="myaws-search" ref={root}>
      <div className={`myaws-search-box${open ? " is-open" : ""}`}>
        <Icon name="search" size="small" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={panelOpen}
          aria-controls="myaws-search-panel"
          aria-label="Search"
          placeholder="Search"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setShowAll(null)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="myaws-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setQuery("")
              input.current?.focus()
            }}
          >
            <Icon name="close" size="small" />
          </button>
        ) : (
          <span className="myaws-search-hint" aria-hidden>
            [Option+S]
          </span>
        )}
      </div>

      {panelOpen && (
        <div className="myaws-search-panel" id="myaws-search-panel" role="listbox">
          <nav className="myaws-search-sections" aria-label="Result types">
            <a className="is-active" href="#search-services">
              Services
            </a>
            {searching && <a href="#search-features">Features</a>}
            {searching && <a href="#search-resources">Resources</a>}
            <span className="is-disabled">Documentation</span>
            <span className="is-disabled">Knowledge articles</span>
            <span className="is-disabled">Marketplace</span>
            <span className="is-disabled">Blog posts</span>
            <span className="is-disabled">Events</span>
            <span className="is-disabled">Tutorials</span>
          </nav>
          <div className="myaws-search-results">
            <section id="search-services">
              <header>
                <h2>{searching ? "Services" : "Recently visited"}</h2>
                {searching && services.length > 3 && (
                  <button
                    type="button"
                    onClick={() =>
                      setShowAll(showAll === "services" ? null : "services")
                    }
                  >
                    {showAll === "services" ? "Show less" : "Show more"}
                  </button>
                )}
              </header>
              {visibleServices.length === 0 ? (
                <p className="myaws-search-empty">No services match “{query}”.</p>
              ) : (
                visibleServices.map((service, index) => (
                  <div className="myaws-search-row" key={service.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active === index}
                      className={`myaws-search-card${active === index ? " is-active" : ""}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(`/${service.id}`)}
                    >
                      <ServiceIcon id={service.id} className="myaws-search-icon" />
                      <span>
                        <span className="myaws-search-title">
                          {serviceShortName(service.id)}
                        </span>
                        <span className="myaws-search-description">
                          {serviceDescription(service.id)}
                        </span>
                      </span>
                    </button>
                    <FavoriteStar id={service.id} />
                  </div>
                ))
              )}
            </section>

            {searching && (
              <section id="search-features">
                <header>
                  <h2>Features</h2>
                  {featureResults.length > 3 && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowAll(showAll === "features" ? null : "features")
                      }
                    >
                      {showAll === "features" ? "Show less" : "Show more"}
                    </button>
                  )}
                </header>
                {visibleFeatures.length === 0 ? (
                  <p className="myaws-search-empty">No features match “{query}”.</p>
                ) : (
                  visibleFeatures.map((feature, offset) => {
                    const index = visibleServices.length + offset
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={active === index}
                        key={`${feature.serviceId}-${feature.name}`}
                        className={`myaws-search-card${active === index ? " is-active" : ""}`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(`/${feature.serviceId}`)}
                      >
                        <span>
                          <span className="myaws-search-title">{feature.name}</span>
                          <span className="myaws-search-feature">
                            <span aria-hidden className="myaws-search-dot" />
                            {serviceShortName(feature.serviceId)} feature
                          </span>
                        </span>
                      </button>
                    )
                  })
                )}
              </section>
            )}

            {searching && (
              <section id="search-resources">
                <header>
                  <h2>
                    Resources in {health.data?.region ?? "ap-southeast-7"}
                  </h2>
                  {resourceResults.length > 3 && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowAll(showAll === "resources" ? null : "resources")
                      }
                    >
                      {showAll === "resources" ? "Show less" : "Show more"}
                    </button>
                  )}
                </header>
                {resources.isFetching && !resources.data ? (
                  <p className="myaws-search-empty">Searching resources…</p>
                ) : visibleResources.length === 0 ? (
                  <p className="myaws-search-empty">
                    {health.data?.connected
                      ? `No resources match “${query}”.`
                      : "Resource search needs the local emulator API."}
                  </p>
                ) : (
                  visibleResources.map((hit, offset) => {
                    const index = visibleServices.length + visibleFeatures.length + offset
                    return (
                      <button
                        type="button"
                        role="option"
                        aria-selected={active === index}
                        key={hit.href}
                        className={`myaws-search-card${active === index ? " is-active" : ""}`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(hit.href)}
                      >
                        <span className="myaws-search-grow">
                          <span className="myaws-search-title">{hit.name}</span>
                          <span className="myaws-search-feature">
                            <span aria-hidden className="myaws-search-dot" />
                            {serviceShortName(hit.serviceId)} · {hit.type}
                          </span>
                        </span>
                        {hit.global && <span className="myaws-search-badge">Global</span>}
                      </button>
                    )
                  })
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
