"use client"

import Icon from "@cloudscape-design/components/icon"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { FavoriteStar } from "@/components/shell/favorite-star"
import { useRecentServices } from "@/lib/console-client"
import { useFavorites } from "@/lib/favorites"
import { findCatalogService, serviceCatalog } from "@/lib/service-catalog"
import {
  serviceCategories,
  serviceDescription,
  servicesInCategory,
  serviceShortName,
} from "@/lib/service-meta"

const allServices = [...serviceCatalog].sort((a, b) =>
  serviceShortName(a.id).localeCompare(serviceShortName(b.id)),
)

export function openServicesMenu(view = "all") {
  window.dispatchEvent(new CustomEvent("myaws:services-menu", { detail: view }))
}

export function ServicesMenu() {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState("recent")
  const root = useRef<HTMLDivElement>(null)
  const recent = useRecentServices((state) => state.ids)
  const favorites = useFavorites((state) => state.ids)

  useEffect(() => {
    function show(event: Event) {
      setView((event as CustomEvent<string>).detail)
      setOpen(true)
    }
    window.addEventListener("myaws:services-menu", show)
    return () => window.removeEventListener("myaws:services-menu", show)
  }, [])

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", dismiss)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", dismiss)
      document.removeEventListener("keydown", escape)
    }
  }, [open])

  const close = () => setOpen(false)
  const items =
    view === "recent"
      ? recent.flatMap((id) => findCatalogService(id) ?? [])
      : view === "favorites"
        ? favorites.flatMap((id) => findCatalogService(id) ?? [])
        : view === "all"
          ? allServices
          : servicesInCategory(view)
  const title =
    view === "recent"
      ? "Recently visited"
      : view === "favorites"
        ? "Favorites"
        : view === "all"
          ? "All services"
          : view

  const navItem = (id: string, label: string) => (
    <button
      type="button"
      key={id}
      className={view === id ? "is-active" : ""}
      onClick={() => setView(id)}
    >
      {label}
    </button>
  )

  return (
    <div className="myaws-nav-menu" ref={root}>
      <button
        type="button"
        className="myaws-nav-trigger"
        aria-label="Services"
        title="Services"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="grid-view" />
      </button>
      {open && (
        <div className="myaws-services-panel" role="dialog" aria-label="Services">
          <nav className="myaws-services-nav" aria-label="Service lists">
            {navItem("recent", "Recently visited")}
            {navItem("favorites", "Favorites")}
            <button type="button" disabled title="Applications are not available in the local emulator">
              All applications
            </button>
            {navItem("all", "All services")}
            <hr />
            {serviceCategories.map((category) => navItem(category, category))}
          </nav>
          <div className="myaws-services-list">
            <header>
              <h2>{title}</h2>
              <button type="button" aria-label="Close" onClick={close}>
                <Icon name="close" />
              </button>
            </header>
            <ul>
              {view === "recent" && (
                <li>
                  <Link href="/" onClick={close}>
                    <span className="myaws-services-name">Console Home</span>
                    <span className="myaws-services-description">
                      View resource insights, service shortcuts, and feature updates
                    </span>
                  </Link>
                </li>
              )}
              {view === "favorites" && items.length === 0 && (
                <li className="myaws-services-empty">
                  Choose the star next to a service to add it to your favorites.
                </li>
              )}
              {items.map((service) => (
                <li key={service.id}>
                  <Link href={`/${service.id}`} onClick={close}>
                    <span className="myaws-services-name">
                      {serviceShortName(service.id)}
                    </span>
                    <span className="myaws-services-description">
                      {serviceDescription(service.id)}
                    </span>
                  </Link>
                  <FavoriteStar id={service.id} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
