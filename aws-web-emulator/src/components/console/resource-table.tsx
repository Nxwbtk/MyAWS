"use client"

import { useCollection } from "@cloudscape-design/collection-hooks"
import Box from "@cloudscape-design/components/box"
import CollectionPreferences, {
  type CollectionPreferencesProps,
} from "@cloudscape-design/components/collection-preferences"
import Header from "@cloudscape-design/components/header"
import Link from "@cloudscape-design/components/link"
import Pagination from "@cloudscape-design/components/pagination"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table, { type TableProps } from "@cloudscape-design/components/table"
import TextFilter from "@cloudscape-design/components/text-filter"
import { useState, type ReactNode } from "react"

export type Column<T> = TableProps.ColumnDefinition<T> & {
  id: string
  header: string
  /** Value used for sorting and filtering. */
  value?: (item: T) => string | number | undefined
}

export function ResourceTable<T>({
  title,
  description,
  info = true,
  items,
  columns,
  actions,
  loading,
  loadingText = "Loading resources",
  error,
  selectionType,
  selectedItems,
  onSelectionChange,
  trackBy,
  filterPlaceholder = "Find resources",
  empty,
  variant = "full-page",
  pageSize = 10,
  counter,
  headerVariant,
  defaultSort,
  stickyHeader,
}: {
  title: string
  description?: ReactNode
  info?: boolean
  items: readonly T[]
  columns: Column<T>[]
  actions?: ReactNode
  loading?: boolean
  loadingText?: string
  error?: unknown
  selectionType?: TableProps.SelectionType
  selectedItems?: T[]
  onSelectionChange?: (items: T[]) => void
  trackBy?: TableProps.TrackBy<T>
  filterPlaceholder?: string
  empty?: ReactNode
  variant?: TableProps.Variant
  pageSize?: number
  counter?: string
  headerVariant?: "h1" | "h2" | "awsui-h1-sticky"
  defaultSort?: string
  stickyHeader?: boolean
}) {
  const [preferences, setPreferences] = useState<CollectionPreferencesProps.Preferences>({
    pageSize,
    wrapLines: false,
    stripedRows: false,
    contentDensity: "comfortable",
    visibleContent: columns.map((column) => column.id),
  })
  const sortColumn = columns.find((column) => column.id === (defaultSort ?? columns[0]?.id))
  const { items: visible, collectionProps, filterProps, paginationProps, filteredItemsCount } =
    useCollection(items as T[], {
      filtering: {
        filteringFunction: (item, text) => {
          const query = text.toLowerCase()
          return columns.some((column) =>
            String(column.value?.(item) ?? "").toLowerCase().includes(query),
          )
        },
        empty: empty ?? (
          <Box textAlign="center" color="inherit">
            <b>No {title.toLowerCase()}</b>
            <Box variant="p" color="inherit">
              You don&apos;t have any {title.toLowerCase()}.
            </Box>
          </Box>
        ),
        noMatch: (
          <Box textAlign="center" color="inherit">
            <b>No matches</b>
            <Box variant="p" color="inherit">
              No {title.toLowerCase()} match the filter.
            </Box>
          </Box>
        ),
      },
      pagination: { pageSize: preferences.pageSize ?? pageSize },
      sorting: sortColumn
        ? { defaultState: { sortingColumn: { sortingField: sortColumn.id } } }
        : {},
      selection: {},
    })

  const errorText = error ? (error instanceof Error ? error.message : String(error)) : undefined
  const columnDefinitions = columns.map((column) => ({
    ...column,
    sortingField: column.value ? column.id : undefined,
    sortingComparator: column.value
      ? (a: T, b: T) => {
          const left = column.value!(a) ?? ""
          const right = column.value!(b) ?? ""
          return typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right))
        }
      : undefined,
  }))

  return (
    <Table
      {...collectionProps}
      variant={variant}
      stickyHeader={stickyHeader ?? variant === "full-page"}
      items={visible}
      trackBy={trackBy}
      columnDefinitions={columnDefinitions}
      visibleColumns={preferences.visibleContent}
      wrapLines={preferences.wrapLines}
      stripedRows={preferences.stripedRows}
      contentDensity={preferences.contentDensity}
      loading={loading}
      loadingText={loadingText}
      selectionType={selectionType}
      selectedItems={selectedItems}
      onSelectionChange={({ detail }) => onSelectionChange?.(detail.selectedItems)}
      ariaLabels={{
        selectionGroupLabel: "Items selection",
        allItemsSelectionLabel: () => "select all",
        itemSelectionLabel: (_data, item) => `Select ${String(columns[0]?.value?.(item) ?? "item")}`,
      }}
      empty={
        errorText ? (
          <Box textAlign="center" color="text-status-error">
            {errorText}
          </Box>
        ) : (
          collectionProps.empty
        )
      }
      header={
        <Header
          variant={headerVariant ?? (variant === "full-page" ? "awsui-h1-sticky" : "h2")}
          counter={
            counter ??
            (loading
              ? undefined
              : selectedItems?.length && selectionType === "multi"
                ? `(${selectedItems.length}/${items.length})`
                : `(${items.length})`)
          }
          info={info ? <Link variant="info">Info</Link> : undefined}
          description={description}
          actions={actions}
        >
          {title}
        </Header>
      }
      filter={
        <TextFilter
          {...filterProps}
          filteringPlaceholder={filterPlaceholder}
          countText={filterProps.filteringText ? `${filteredItemsCount} matches` : undefined}
        />
      }
      pagination={<Pagination {...paginationProps} />}
      preferences={
        <CollectionPreferences
          title="Preferences"
          confirmLabel="Confirm"
          cancelLabel="Cancel"
          preferences={preferences}
          onConfirm={({ detail }) => setPreferences(detail)}
          pageSizePreference={{
            title: "Page size",
            options: [
              { value: 10, label: "10 resources" },
              { value: 25, label: "25 resources" },
              { value: 50, label: "50 resources" },
              { value: 100, label: "100 resources" },
            ],
          }}
          wrapLinesPreference={{ label: "Wrap lines", description: "Select to see all the text and wrap the lines" }}
          stripedRowsPreference={{ label: "Striped rows", description: "Select to add alternating shaded rows" }}
          contentDensityPreference={{ label: "Compact mode", description: "Select to display content in a denser, more compact mode" }}
          visibleContentPreference={{
            title: "Select visible columns",
            options: [
              {
                label: "Properties",
                options: columns.map((column) => ({
                  id: column.id,
                  label: column.header,
                  editable: column.id !== columns[0]?.id,
                })),
              },
            ],
          }}
        />
      }
    />
  )
}

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <Box textAlign="center" color="inherit">
      <SpaceBetween size="xxs">
        <b>{title}</b>
        {subtitle && (
          <Box variant="p" color="inherit">
            {subtitle}
          </Box>
        )}
      </SpaceBetween>
      {action && <Box margin={{ top: "s" }}>{action}</Box>}
    </Box>
  )
}
