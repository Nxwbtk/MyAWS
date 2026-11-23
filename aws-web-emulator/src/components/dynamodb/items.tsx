"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import ExpandableSection from "@cloudscape-design/components/expandable-section"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Grid from "@cloudscape-design/components/grid"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import Pagination from "@cloudscape-design/components/pagination"
import SegmentedControl from "@cloudscape-design/components/segmented-control"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import TextFilter from "@cloudscape-design/components/text-filter"
import Toggle from "@cloudscape-design/components/toggle"
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { EditModal, JsonField } from "@/components/console/sections"
import { useFollow } from "@/components/shell/page-layout"
import { DdbLayout } from "@/components/dynamodb/ddb-app"
import { keyOf, useTable, useTableNames, type Table as TableT } from "@/components/dynamodb/shared"
import { callAws } from "@/lib/aws"

type AttrValue = Record<string, unknown>
type Item = Record<string, AttrValue>

/** Renders a DynamoDB attribute value as the console shows it in the item list. */
export function attrText(value?: AttrValue): string {
  if (!value) return ""
  const [type, raw] = Object.entries(value)[0] ?? []
  if (type === "S" || type === "N") return String(raw)
  if (type === "BOOL") return raw ? "true" : "false"
  if (type === "NULL") return "null"
  if (type === "SS" || type === "NS") return `[${(raw as string[]).map((v) => JSON.stringify(v)).join(", ")}]`
  if (type === "B") return typeof raw === "string" ? raw : "Binary"
  try {
    return JSON.stringify(unmarshall({ v: value as never }).v)
  } catch {
    return JSON.stringify(raw)
  }
}

const operators = [
  { value: "=", label: "Equal to" },
  { value: "<", label: "Less than" },
  { value: "<=", label: "Less than or equal to" },
  { value: ">", label: "Greater than" },
  { value: ">=", label: "Greater than or equal to" },
  { value: "between", label: "Between" },
  { value: "begins_with", label: "Begins with" },
]

const filterOperators = [...operators, { value: "<>", label: "Not equal to" }, { value: "exists", label: "Exists" }, { value: "not_exists", label: "Not exists" }, { value: "contains", label: "Contains" }]

type Filter = { name: string; type: string; op: string; value: string; value2: string }

function typed(type: string, value: string): AttrValue {
  if (type === "N") return { N: value }
  if (type === "BOOL") return { BOOL: value === "true" }
  return { S: value }
}

export function ExploreItemsPage({ initialTable }: { initialTable?: string }) {
  const router = useRouter()
  const follow = useFollow()
  const names = useTableNames()
  const [tableName, setTableName] = useState(initialTable ?? "")
  const [search, setSearch] = useState("")
  const current = tableName || names.data?.[0] || ""
  const table = useTable(current)
  const [mode, setMode] = useState("scan")
  const [index, setIndex] = useState("")
  const [pkValue, setPkValue] = useState("")
  const [skOp, setSkOp] = useState("=")
  const [skValue, setSkValue] = useState("")
  const [skValue2, setSkValue2] = useState("")
  const [desc, setDesc] = useState(false)
  const [filters, setFilters] = useState<Filter[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [meta, setMeta] = useState<{ count: number; scanned: number; next?: Item }>()
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string>()
  const [selected, setSelected] = useState<Item[]>([])
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [textFilter, setTextFilter] = useState("")

  const t = table.data ?? undefined
  const indexes = useMemo(() => [{ name: "", keys: t?.KeySchema }, ...[...(t?.GlobalSecondaryIndexes ?? []), ...(t?.LocalSecondaryIndexes ?? [])].map((i) => ({ name: i.IndexName ?? "", keys: i.KeySchema }))], [t])
  const keys = indexes.find((i) => i.name === index)?.keys ?? t?.KeySchema
  const pk = keys?.find((k) => k.KeyType === "HASH")?.AttributeName ?? ""
  const sk = keys?.find((k) => k.KeyType === "RANGE")?.AttributeName
  const attrType = (name?: string) => t?.AttributeDefinitions?.find((a) => a.AttributeName === name)?.AttributeType ?? "S"

  const run = async (startKey?: Item) => {
    if (!current) return
    setRunning(true)
    setError(undefined)
    const names: Record<string, string> = {}
    const values: Record<string, AttrValue> = {}
    const filterParts: string[] = []
    filters.forEach((f, i) => {
      if (!f.name) return
      names[`#f${i}`] = f.name
      if (f.op === "exists") filterParts.push(`attribute_exists(#f${i})`)
      else if (f.op === "not_exists") filterParts.push(`attribute_not_exists(#f${i})`)
      else {
        values[`:f${i}`] = typed(f.type, f.value)
        if (f.op === "between") {
          values[`:f${i}b`] = typed(f.type, f.value2)
          filterParts.push(`#f${i} BETWEEN :f${i} AND :f${i}b`)
        } else if (f.op === "begins_with" || f.op === "contains") filterParts.push(`${f.op}(#f${i}, :f${i})`)
        else filterParts.push(`#f${i} ${f.op} :f${i}`)
      }
    })
    const input: Record<string, unknown> = { TableName: current, ...(index ? { IndexName: index } : {}), Limit: 50, ...(startKey ? { ExclusiveStartKey: startKey } : {}) }
    if (mode === "query") {
      names["#pk"] = pk
      values[":pk"] = typed(attrType(pk), pkValue)
      let condition = "#pk = :pk"
      if (sk && skValue) {
        names["#sk"] = sk
        values[":sk"] = typed(attrType(sk), skValue)
        if (skOp === "between") {
          values[":sk2"] = typed(attrType(sk), skValue2)
          condition += " AND #sk BETWEEN :sk AND :sk2"
        } else if (skOp === "begins_with") condition += " AND begins_with(#sk, :sk)"
        else condition += ` AND #sk ${skOp} :sk`
      }
      input.KeyConditionExpression = condition
      input.ScanIndexForward = !desc
    }
    if (filterParts.length) input.FilterExpression = filterParts.join(" AND ")
    if (Object.keys(names).length) input.ExpressionAttributeNames = names
    if (Object.keys(values).length) input.ExpressionAttributeValues = values
    try {
      const result = await callAws<{ Items?: Item[]; Count?: number; ScannedCount?: number; LastEvaluatedKey?: Item }>("dynamodb", mode === "query" ? "Query" : "Scan", input)
      setItems((prev) => (startKey ? [...prev, ...(result.Items ?? [])] : result.Items ?? []))
      setMeta((prev) => ({ count: (startKey ? prev?.count ?? 0 : 0) + (result.Count ?? 0), scanned: (startKey ? prev?.scanned ?? 0 : 0) + (result.ScannedCount ?? 0), next: result.LastEvaluatedKey }))
      if (!startKey) {
        setSelected([])
        setPage(1)
      }
    } catch (caught) {
      setError(errorMessage(caught))
      setItems([])
      setMeta(undefined)
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    // Load the first page of items whenever the selected table changes, like the console does.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (table.data) void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.data?.TableName])

  const tableKeys = [keyOf(t, "HASH"), keyOf(t, "RANGE")].filter(Boolean) as string[]
  const columns = useMemo(() => {
    const seen = new Set<string>(tableKeys)
    items.forEach((item) => Object.keys(item).forEach((k) => seen.add(k)))
    return [...seen]
  }, [items, tableKeys])
  const visible = items.filter((item) => !textFilter || Object.values(item).some((v) => attrText(v).toLowerCase().includes(textFilter.toLowerCase())))
  const pageSize = 50
  const pageItems = visible.slice((page - 1) * pageSize, page * pageSize)
  const keyParam = (item: Item) => encodeURIComponent(JSON.stringify(Object.fromEntries(tableKeys.map((k) => [k, item[k]]))))
  const tableList = (names.data ?? []).filter((n) => n.toLowerCase().includes(search.toLowerCase()))

  return (
    <DdbLayout breadcrumbs={[{ text: "Explore items", href: "/dynamodb/items" }, ...(current ? [{ text: current, href: `/dynamodb/items?table=${encodeURIComponent(current)}` }] : [])]}>
      <Grid gridDefinition={[{ colspan: { default: 12, s: 3 } }, { colspan: { default: 12, s: 9 } }]}>
        <Container header={<Header variant="h2" counter={`(${names.data?.length ?? 0})`}>Tables</Header>}>
          <SpaceBetween size="s">
            <TextFilter filteringText={search} filteringPlaceholder="Find tables by table name" onChange={({ detail }) => setSearch(detail.filteringText)} />
            {tableList.length === 0 && <Box color="text-status-inactive">No tables</Box>}
            {tableList.map((name) => (
              <div key={name} className={`myaws-ddb-table-pick${name === current ? " active" : ""}`}>
                <Link onFollow={(event) => { event.preventDefault(); setTableName(name); setIndex(""); setFilters([]); router.replace(`/dynamodb/items?table=${encodeURIComponent(name)}`) }} href={`/dynamodb/items?table=${encodeURIComponent(name)}`}>
                  {name === current ? <b>{name}</b> : name}
                </Link>
              </div>
            ))}
          </SpaceBetween>
        </Container>
        <SpaceBetween size="l">
          {!current ? (
            <Container><Box textAlign="center" color="inherit"><b>No tables</b><Box variant="p" color="inherit">Create a table to explore its items.</Box><Button href="/dynamodb/tables/create" onFollow={follow}>Create table</Button></Box></Container>
          ) : (
            <>
              <Header variant="h1" actions={<Button iconName="refresh" ariaLabel="Refresh" onClick={() => void run()} />}>{current}</Header>
              <Container>
                <ExpandableSection headerText="Scan or query items" defaultExpanded variant="footer">
                  <SpaceBetween size="m">
                    <SegmentedControl selectedId={mode} onChange={({ detail }) => setMode(detail.selectedId)} options={[{ id: "scan", text: "Scan" }, { id: "query", text: "Query" }]} />
                    <FormField label="Select a table or index">
                      <Select
                        selectedOption={{ value: index, label: index ? `Index - ${index}` : `Table - ${current}` }}
                        onChange={({ detail }) => setIndex(detail.selectedOption.value ?? "")}
                        options={indexes.map((i) => ({ value: i.name, label: i.name ? `Index - ${i.name}` : `Table - ${current}` }))}
                      />
                    </FormField>
                    {mode === "query" && (
                      <SpaceBetween size="s">
                        <FormField label={`${pk} (Partition key)`}><Input value={pkValue} placeholder="Enter partition key value" onChange={({ detail }) => setPkValue(detail.value)} /></FormField>
                        {sk && (
                          <FormField label={`${sk} (Sort key)`}>
                            <SpaceBetween direction="horizontal" size="xs">
                              <Select selectedOption={operators.find((o) => o.value === skOp) ?? null} onChange={({ detail }) => setSkOp(detail.selectedOption.value ?? "=")} options={operators} />
                              <Input value={skValue} placeholder="Enter sort key value" onChange={({ detail }) => setSkValue(detail.value)} />
                              {skOp === "between" && <Input value={skValue2} placeholder="And" onChange={({ detail }) => setSkValue2(detail.value)} />}
                            </SpaceBetween>
                          </FormField>
                        )}
                        <Toggle checked={desc} onChange={({ detail }) => setDesc(detail.checked)}>Sort descending</Toggle>
                      </SpaceBetween>
                    )}
                    <ExpandableSection headerText="Filters - optional" defaultExpanded={filters.length > 0}>
                      <SpaceBetween size="s">
                        {filters.map((f, i) => (
                          <SpaceBetween key={i} direction="horizontal" size="xs">
                            <FormField label={i === 0 ? "Attribute name" : undefined}><Input value={f.name} placeholder="Enter attribute name" onChange={({ detail }) => setFilters(filters.map((x, j) => (j === i ? { ...x, name: detail.value } : x)))} /></FormField>
                            <FormField label={i === 0 ? "Type" : undefined}><Select selectedOption={{ value: f.type, label: f.type === "N" ? "Number" : f.type === "BOOL" ? "Boolean" : "String" }} onChange={({ detail }) => setFilters(filters.map((x, j) => (j === i ? { ...x, type: detail.selectedOption.value ?? "S" } : x)))} options={[{ value: "S", label: "String" }, { value: "N", label: "Number" }, { value: "BOOL", label: "Boolean" }]} /></FormField>
                            <FormField label={i === 0 ? "Condition" : undefined}><Select selectedOption={filterOperators.find((o) => o.value === f.op) ?? null} onChange={({ detail }) => setFilters(filters.map((x, j) => (j === i ? { ...x, op: detail.selectedOption.value ?? "=" } : x)))} options={filterOperators} /></FormField>
                            <FormField label={i === 0 ? "Value" : undefined}><Input value={f.value} disabled={f.op === "exists" || f.op === "not_exists"} placeholder="Enter attribute value" onChange={({ detail }) => setFilters(filters.map((x, j) => (j === i ? { ...x, value: detail.value } : x)))} /></FormField>
                            <FormField label={i === 0 ? " " : undefined}><Button onClick={() => setFilters(filters.filter((_, j) => j !== i))}>Remove</Button></FormField>
                          </SpaceBetween>
                        ))}
                        <Button onClick={() => setFilters([...filters, { name: "", type: "S", op: "=", value: "", value2: "" }])}>Add filter</Button>
                      </SpaceBetween>
                    </ExpandableSection>
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button variant="primary" loading={running} disabled={mode === "query" && !pkValue} onClick={() => void run()}>Run</Button>
                      <Button onClick={() => { setFilters([]); setPkValue(""); setSkValue(""); setIndex("") }}>Reset</Button>
                    </SpaceBetween>
                  </SpaceBetween>
                </ExpandableSection>
              </Container>
              {error && <Alert type="error" header="Error">{error}</Alert>}
              {meta && <Alert type="success">Completed · Items returned: {meta.count} · Items scanned: {meta.scanned}{meta.next ? " · More items available" : ""}</Alert>}
              <Table<Item>
                header={
                  <Header
                    variant="h2"
                    counter={`(${visible.length}${meta?.next ? "+" : ""})`}
                    actions={
                      <SpaceBetween direction="horizontal" size="xs">
                        <ButtonDropdown
                          items={[
                            { id: "edit", text: "Edit item", disabled: selected.length !== 1 },
                            { id: "duplicate", text: "Duplicate item", disabled: selected.length !== 1 },
                            { id: "delete", text: "Delete items", disabled: selected.length === 0 },
                            { id: "csv", text: "Download selected items to CSV", disabled: selected.length === 0 },
                            { id: "csv-all", text: "Download results to CSV", disabled: items.length === 0 },
                          ]}
                          onItemClick={({ detail }) => {
                            if (detail.id === "edit") router.push(`/dynamodb/items/edit?table=${encodeURIComponent(current)}&key=${keyParam(selected[0])}`)
                            if (detail.id === "duplicate") router.push(`/dynamodb/items/create?table=${encodeURIComponent(current)}&key=${keyParam(selected[0])}`)
                            if (detail.id === "delete") setDeleting(true)
                            if (detail.id === "csv" || detail.id === "csv-all") downloadCsv(`results.csv`, columns, detail.id === "csv" ? selected : items)
                          }}
                        >
                          Actions
                        </ButtonDropdown>
                        <Button variant="primary" href={`/dynamodb/items/create?table=${encodeURIComponent(current)}`} onFollow={follow}>Create item</Button>
                      </SpaceBetween>
                    }
                  >
                    Items returned
                  </Header>
                }
                loading={running && items.length === 0}
                loadingText="Loading items"
                items={pageItems}
                selectionType="multi"
                selectedItems={selected}
                onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
                trackBy={(item) => JSON.stringify(tableKeys.map((k) => item[k]))}
                filter={<TextFilter filteringText={textFilter} filteringPlaceholder="Find items" onChange={({ detail }) => { setTextFilter(detail.filteringText); setPage(1) }} />}
                pagination={
                  <Pagination
                    currentPageIndex={page}
                    pagesCount={Math.max(1, Math.ceil(visible.length / pageSize)) + (meta?.next ? 1 : 0)}
                    openEnd={Boolean(meta?.next)}
                    onChange={async ({ detail }) => {
                      if (detail.currentPageIndex > Math.ceil(visible.length / pageSize) && meta?.next) await run(meta.next)
                      setPage(detail.currentPageIndex)
                    }}
                  />
                }
                resizableColumns
                wrapLines={false}
                columnDefinitions={columns.map((name, i) => ({
                  id: name,
                  header: tableKeys.includes(name) ? `${name} (${attrType(name) === "N" ? "Number" : attrType(name) === "B" ? "Binary" : "String"})` : name,
                  cell: (item: Item) =>
                    i === 0 ? (
                      <Link href={`/dynamodb/items/edit?table=${encodeURIComponent(current)}&key=${keyParam(item)}`} onFollow={follow}>{attrText(item[name])}</Link>
                    ) : (
                      attrText(item[name])
                    ),
                }))}
                empty={<Box textAlign="center" color="inherit"><b>No items</b><Box variant="p" color="inherit">The query did not return any results.</Box></Box>}
              />
            </>
          )}
        </SpaceBetween>
      </Grid>
      {deleting && t && (
        <EditModal
          visible
          title="Delete items?"
          saveLabel="Delete"
          onDismiss={() => setDeleting(false)}
          success={`${selected.length} item${selected.length === 1 ? " was" : "s were"} deleted.`}
          onSave={async () => {
            for (const item of selected) await callAws("dynamodb", "DeleteItem", { TableName: current, Key: Object.fromEntries(tableKeys.map((k) => [k, item[k]])) })
            await run()
          }}
        >
          <Box>Are you sure you want to delete {selected.length} item{selected.length === 1 ? "" : "s"}? This action can&apos;t be undone.</Box>
        </EditModal>
      )}
    </DdbLayout>
  )
}

function downloadCsv(name: string, columns: string[], rows: Item[]) {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const text = [columns.map(escape).join(","), ...rows.map((row) => columns.map((c) => escape(attrText(row[c]))).join(","))].join("\n")
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function toPlainJson(item: Item) {
  try {
    return JSON.stringify(unmarshall(item as never, { wrapNumbers: false }), (_k, v) => (v instanceof Set ? [...v] : v), 2)
  } catch {
    return JSON.stringify(item, null, 2)
  }
}

export function ItemEditorPage({ table: tableName, mode, itemKey }: { table: string; mode: "create" | "edit"; itemKey?: string }) {
  const router = useRouter()
  const follow = useFollow()
  const table = useTable(tableName)
  const [ddbJson, setDdbJson] = useState(true)
  const [text, setText] = useState<string>()
  const [loadError, setLoadError] = useState<string>()
  const [saveError, setSaveError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const t: TableT | undefined = table.data ?? undefined

  useEffect(() => {
    if (!t || text !== undefined) return
    const pk = keyOf(t, "HASH")
    const sk = keyOf(t, "RANGE")
    const type = (n?: string) => t.AttributeDefinitions?.find((a) => a.AttributeName === n)?.AttributeType ?? "S"
    if (!itemKey) {
      const blank: Item = {}
      if (pk) blank[pk] = { [type(pk)]: "" }
      if (sk) blank[sk] = { [type(sk)]: "" }
      // Seeds the editor from the table's key schema once it loads.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(JSON.stringify(blank, null, 2))
      return
    }
    callAws<{ Item?: Item }>("dynamodb", "GetItem", { TableName: tableName, Key: JSON.parse(itemKey) }).then(
      (result) => setText(JSON.stringify(result.Item ?? {}, null, 2)),
      (error) => setLoadError(errorMessage(error)),
    )
  }, [t, itemKey, tableName, text])

  const switchFormat = (next: boolean) => {
    if (text === undefined) return setDdbJson(next)
    try {
      const parsed = JSON.parse(text)
      setText(next ? JSON.stringify(marshall(parsed, { removeUndefinedValues: true, convertEmptyValues: false }), null, 2) : toPlainJson(parsed))
      setDdbJson(next)
      setSaveError(undefined)
    } catch (error) {
      setSaveError(errorMessage(error))
    }
  }

  const save = async () => {
    setSaving(true)
    setSaveError(undefined)
    try {
      const parsed = JSON.parse(text ?? "{}")
      const item = ddbJson ? parsed : marshall(parsed, { removeUndefinedValues: true })
      const keys = [keyOf(t, "HASH"), keyOf(t, "RANGE")].filter(Boolean) as string[]
      if (mode === "edit" && itemKey) {
        const original = JSON.parse(itemKey) as Item
        const changedKey = keys.some((k) => JSON.stringify(original[k]) !== JSON.stringify(item[k]))
        await callAws("dynamodb", "PutItem", { TableName: tableName, Item: item })
        if (changedKey) await callAws("dynamodb", "DeleteItem", { TableName: tableName, Key: original })
      } else {
        await callAws("dynamodb", "PutItem", { TableName: tableName, Item: item, ConditionExpression: keys.map((_, i) => `attribute_not_exists(#k${i})`).join(" AND "), ExpressionAttributeNames: Object.fromEntries(keys.map((k, i) => [`#k${i}`, k])) })
      }
      flash.success(mode === "edit" ? "The item has been saved successfully." : "The item has been created successfully.")
      router.push(`/dynamodb/items?table=${encodeURIComponent(tableName)}`)
    } catch (error) {
      setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const title = mode === "edit" ? "Edit item" : "Create item"
  return (
    <DdbLayout breadcrumbs={[{ text: "Explore items", href: "/dynamodb/items" }, { text: tableName, href: `/dynamodb/items?table=${encodeURIComponent(tableName)}` }, { text: title, href: "#" }]} contentType="form">
      <ContentLayout header={<Header variant="h1" description="You can add, remove, or edit the attributes of an item. You can nest attributes inside other attributes up to 32 levels deep.">{title}</Header>}>
        <Form
          errorText={saveError ?? loadError}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" href={`/dynamodb/items?table=${encodeURIComponent(tableName)}`} onFollow={follow}>Cancel</Button>
              <Button variant="primary" loading={saving} disabled={text === undefined} onClick={() => void save()}>{mode === "edit" ? "Save" : "Create item"}</Button>
            </SpaceBetween>
          }
        >
          <Container
            header={
              <Header variant="h2" actions={<Toggle checked={ddbJson} onChange={({ detail }) => switchFormat(detail.checked)}>View DynamoDB JSON</Toggle>}>
                Attributes
              </Header>
            }
          >
            {text === undefined ? <Box color="text-status-inactive">Loading item…</Box> : <JsonField value={text} rows={22} onChange={setText} />}
          </Container>
        </Form>
      </ContentLayout>
    </DdbLayout>
  )
}
