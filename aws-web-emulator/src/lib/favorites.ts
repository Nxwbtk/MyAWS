"use client"

import { create } from "zustand"
import { findCatalogService } from "@/lib/service-catalog"

const storageKey = "myaws.favorites.v1"

function read(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]")
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string" && Boolean(findCatalogService(id)))
      : []
  } catch {
    return []
  }
}

function write(ids: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(ids))
  } catch {
    // Favorites stay in memory when storage is unavailable.
  }
}

export const useFavorites = create<{
  ids: string[]
  restore: () => void
  toggle: (id: string) => void
}>((set, get) => ({
  ids: [],
  restore: () => set({ ids: read() }),
  toggle: (id) => {
    const ids = get().ids.includes(id)
      ? get().ids.filter((value) => value !== id)
      : [...get().ids, id]
    write(ids)
    set({ ids })
  },
}))

export const favoritesKey = storageKey
