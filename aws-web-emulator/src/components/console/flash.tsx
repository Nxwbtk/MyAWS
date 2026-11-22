"use client"

import Flashbar, { type FlashbarProps } from "@cloudscape-design/components/flashbar"
import type { ReactNode } from "react"
import { create } from "zustand"

type Flash = {
  id: string
  type: FlashbarProps.Type
  header?: ReactNode
  content?: ReactNode
  loading?: boolean
}

let counter = 0

export const useFlash = create<{
  items: Flash[]
  push: (flash: Omit<Flash, "id">) => string
  dismiss: (id: string) => void
  clear: () => void
}>((set) => ({
  items: [],
  push: (flash) => {
    const id = `flash-${++counter}`
    set((state) => ({ items: [{ ...flash, id }, ...state.items].slice(0, 5) }))
    return id
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
  clear: () => set({ items: [] }),
}))

export const flash = {
  success: (content: ReactNode, header?: ReactNode) =>
    useFlash.getState().push({ type: "success", content, header }),
  error: (content: ReactNode, header?: ReactNode) =>
    useFlash.getState().push({ type: "error", content, header }),
  info: (content: ReactNode, header?: ReactNode) =>
    useFlash.getState().push({ type: "info", content, header }),
}

export function Notifications() {
  const items = useFlash((state) => state.items)
  const dismiss = useFlash((state) => state.dismiss)
  if (items.length === 0) return null
  return (
    <Flashbar
      stackItems={items.length > 2}
      items={items.map((item) => ({
        ...item,
        dismissible: true,
        dismissLabel: "Dismiss message",
        onDismiss: () => dismiss(item.id),
      }))}
    />
  )
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
