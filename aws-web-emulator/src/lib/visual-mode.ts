"use client"

import { applyDensity, applyMode, Density, Mode } from "@cloudscape-design/global-styles"
import { create } from "zustand"

export type VisualMode = "light" | "dark" | "browser"

const storageKey = "myaws.visual-mode.v1"
const defaultMode: VisualMode = "dark"

function readMode(): VisualMode {
  try {
    const value = localStorage.getItem(storageKey)
    if (value === "light" || value === "dark" || value === "browser") return value
  } catch {
    // Storage can be unavailable in private windows.
  }
  return defaultMode
}

function resolve(mode: VisualMode) {
  if (mode !== "browser") return mode
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function apply(mode: VisualMode) {
  const resolved = resolve(mode)
  applyMode(resolved === "dark" ? Mode.Dark : Mode.Light)
  applyDensity(Density.Comfortable)
  document.documentElement.classList.toggle("dark", resolved === "dark")
  document.documentElement.style.colorScheme = resolved
}

export const useVisualMode = create<{
  mode: VisualMode
  restore: () => void
  setMode: (mode: VisualMode) => void
}>((set) => ({
  mode: defaultMode,
  restore: () => {
    const mode = readMode()
    apply(mode)
    set({ mode })
  },
  setMode: (mode) => {
    try {
      localStorage.setItem(storageKey, mode)
    } catch {
      // Keep the in-memory choice when storage is unavailable.
    }
    apply(mode)
    set({ mode })
  },
}))

export function watchBrowserMode() {
  const query = window.matchMedia("(prefers-color-scheme: dark)")
  const onChange = () => {
    if (useVisualMode.getState().mode === "browser") apply("browser")
  }
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
