"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

// A top-navigation trigger with an anchored panel, matching the console's
// unified navigation menus (region, account, settings, help).
export function NavMenu({
  label,
  trigger,
  align = "end",
  width = 320,
  children,
}: {
  label: string
  trigger: ReactNode
  align?: "start" | "end"
  width?: number
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

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

  return (
    <div className="myaws-nav-menu" ref={root}>
      <button
        type="button"
        className="myaws-nav-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <div
          className="myaws-nav-panel"
          role="dialog"
          aria-label={label}
          style={{ width, [align === "end" ? "right" : "left"]: 0 }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
