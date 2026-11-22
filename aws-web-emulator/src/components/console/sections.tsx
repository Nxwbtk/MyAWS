"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import Header from "@cloudscape-design/components/header"
import KeyValuePairs, { type KeyValuePairsProps } from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Modal from "@cloudscape-design/components/modal"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Textarea from "@cloudscape-design/components/textarea"
import { useState, type ReactNode } from "react"
import { errorMessage, flash } from "@/components/console/flash"

export function LearnMore({ href }: { href: string }) {
  return (
    <Link external href={href}>
      Learn more
    </Link>
  )
}

/** A console detail section: titled container with an optional Edit action. */
export function Section({
  title,
  description,
  info,
  actions,
  onEdit,
  editDisabledReason,
  items,
  columns = 1,
  children,
  counter,
}: {
  title: ReactNode
  description?: ReactNode
  info?: boolean
  actions?: ReactNode
  onEdit?: () => void
  editDisabledReason?: string
  items?: KeyValuePairsProps.Item[]
  columns?: number
  children?: ReactNode
  counter?: string
}) {
  return (
    <Container
      header={
        <Header
          variant="h2"
          counter={counter}
          info={info ? <Link variant="info">Info</Link> : undefined}
          description={description}
          actions={
            actions ??
            (onEdit || editDisabledReason ? (
              <Button onClick={onEdit} disabled={Boolean(editDisabledReason)} disabledReason={editDisabledReason}>
                Edit
              </Button>
            ) : undefined)
          }
        >
          {title}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {items && <KeyValuePairs columns={columns} items={items} />}
        {children}
      </SpaceBetween>
    </Container>
  )
}

export function Enabled({ value, on = "Enabled", off = "Disabled" }: { value?: boolean; on?: string; off?: string }) {
  return value ? <StatusIndicator type="success">{on}</StatusIndicator> : <>{off}</>
}

/** Modal with Cancel / Save changes that reports errors inline. */
export function EditModal({
  visible,
  title,
  onDismiss,
  onSave,
  children,
  size = "medium",
  saveLabel = "Save changes",
  success,
  saveDisabled,
}: {
  visible: boolean
  title: string
  onDismiss: () => void
  onSave: () => Promise<unknown>
  children: ReactNode
  size?: "small" | "medium" | "large" | "max"
  saveLabel?: string
  success?: string
  saveDisabled?: boolean
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <Modal
      visible={visible}
      size={size}
      onDismiss={() => {
        setError(undefined)
        onDismiss()
      }}
      header={title}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saving}
              disabled={saveDisabled}
              onClick={async () => {
                setSaving(true)
                setError(undefined)
                try {
                  await onSave()
                  if (success) flash.success(success)
                  onDismiss()
                } catch (caught) {
                  setError(errorMessage(caught))
                } finally {
                  setSaving(false)
                }
              }}
            >
              {saveLabel}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {children}
        {error && <Alert type="error">{error}</Alert>}
      </SpaceBetween>
    </Modal>
  )
}

/** JSON document editor used for policies, CORS, and similar configuration. */
export function JsonField({
  value,
  onChange,
  rows = 16,
}: {
  value: string
  onChange: (value: string) => void
  rows?: number
}) {
  let invalid: string | undefined
  try {
    if (value.trim()) JSON.parse(value)
  } catch (error) {
    invalid = errorMessage(error)
  }
  return (
    <SpaceBetween size="xs">
      <Textarea value={value} rows={rows} spellcheck={false} onChange={({ detail }) => onChange(detail.value)} />
      {invalid && <Box color="text-status-error" fontSize="body-s">{invalid}</Box>}
    </SpaceBetween>
  )
}

export function CodeView({ value, empty = "-" }: { value?: string; empty?: string }) {
  if (!value) return <Box color="text-body-secondary">{empty}</Box>
  return <pre className="myaws-code-view">{value}</pre>
}

export function pretty(json?: string | object | null) {
  if (!json) return ""
  try {
    return JSON.stringify(typeof json === "string" ? JSON.parse(json) : json, null, 2)
  } catch {
    return String(json)
  }
}

export const notInEmulator = "Not available in the local emulator."
