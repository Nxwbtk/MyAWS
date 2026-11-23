"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import Grid from "@cloudscape-design/components/grid"
import Header from "@cloudscape-design/components/header"
import Link from "@cloudscape-design/components/link"
import SegmentedControl from "@cloudscape-design/components/segmented-control"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import TextFilter from "@cloudscape-design/components/text-filter"
import { useMemo, useState } from "react"
import { errorMessage } from "@/components/console/flash"
import { CodeView } from "@/components/console/sections"
import { DdbLayout } from "@/components/dynamodb/ddb-app"
import { attrText } from "@/components/dynamodb/items"
import { useTableNames } from "@/components/dynamodb/shared"
import { callAws } from "@/lib/aws"

type Item = Record<string, Record<string, unknown>>
type Query = { id: number; text: string; results?: Item[]; error?: string; next?: string; ran?: string }

export function PartiqlPage() {
  const names = useTableNames()
  const [search, setSearch] = useState("")
  const [queries, setQueries] = useState<Query[]>([{ id: 1, text: "" }])
  const [active, setActive] = useState(1)
  const [view, setView] = useState("table")
  const [running, setRunning] = useState(false)
  const query = queries.find((q) => q.id === active) ?? queries[0]
  const update = (patch: Partial<Query>) => setQueries((all) => all.map((q) => (q.id === query.id ? { ...q, ...patch } : q)))

  const run = async (next?: string) => {
    setRunning(true)
    try {
      const result = await callAws<{ Items?: Item[]; NextToken?: string }>("dynamodb", "ExecuteStatement", { Statement: query.text, ...(next ? { NextToken: next } : {}) })
      update({ results: [...(next ? query.results ?? [] : []), ...(result.Items ?? [])], next: result.NextToken, error: undefined, ran: new Date().toLocaleTimeString() })
    } catch (error) {
      update({ error: errorMessage(error), results: undefined, next: undefined })
    } finally {
      setRunning(false)
    }
  }

  const columns = useMemo(() => {
    const keys = new Set<string>()
    query.results?.forEach((item) => Object.keys(item).forEach((k) => keys.add(k)))
    return [...keys]
  }, [query.results])

  return (
    <DdbLayout breadcrumbs={[{ text: "PartiQL editor", href: "/dynamodb/partiql" }]}>
      <SpaceBetween size="l">
        <Header variant="h1" info={<Link variant="info">Info</Link>} description="Use PartiQL, a SQL-compatible query language, to select, insert, update, and delete items in your tables.">PartiQL editor</Header>
        <Grid gridDefinition={[{ colspan: { default: 12, s: 3 } }, { colspan: { default: 12, s: 9 } }]}>
          <Container header={<Header variant="h2" counter={`(${names.data?.length ?? 0})`}>Tables</Header>}>
            <SpaceBetween size="s">
              <TextFilter filteringText={search} filteringPlaceholder="Find tables" onChange={({ detail }) => setSearch(detail.filteringText)} />
              {(names.data ?? [])
                .filter((n) => n.toLowerCase().includes(search.toLowerCase()))
                .map((name) => (
                  <div key={name}>
                    <Link onFollow={(event) => { event.preventDefault(); update({ text: `SELECT * FROM "${name}"` }) }} href="#">{name}</Link>
                  </div>
                ))}
              {names.data?.length === 0 && <Box color="text-status-inactive">No tables</Box>}
            </SpaceBetween>
          </Container>
          <SpaceBetween size="l">
            <Tabs
              activeTabId={String(active)}
              onChange={({ detail }) => setActive(Number(detail.activeTabId))}
              actions={<Button iconName="add-plus" onClick={() => { const id = Math.max(...queries.map((q) => q.id)) + 1; setQueries([...queries, { id, text: "" }]); setActive(id) }}>New query</Button>}
              tabs={queries.map((q, i) => ({
                id: String(q.id),
                label: `Query ${i + 1}`,
                dismissible: queries.length > 1,
                dismissLabel: "Close query",
                onDismiss: () => { const rest = queries.filter((x) => x.id !== q.id); setQueries(rest); if (active === q.id) setActive(rest[0].id) },
                content: null,
              }))}
            />
            <Container>
              <SpaceBetween size="s">
                <Textarea value={query.text} rows={8} spellcheck={false} placeholder={'SELECT * FROM "table-name" WHERE "pk" = \'value\''} onChange={({ detail }) => update({ text: detail.value })} />
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="primary" loading={running} disabled={!query.text.trim()} onClick={() => void run()}>Run</Button>
                  <Button onClick={() => update({ text: "", results: undefined, error: undefined, next: undefined })}>Clear</Button>
                </SpaceBetween>
              </SpaceBetween>
            </Container>
            {query.error && <Alert type="error" header="Error">{query.error}</Alert>}
            {query.results && <Alert type="success">Completed at {query.ran}. Items returned: {query.results.length}</Alert>}
            {query.results && (
              <Table<Item>
                header={
                  <Header
                    variant="h2"
                    counter={`(${query.results.length}${query.next ? "+" : ""})`}
                    actions={
                      <SpaceBetween direction="horizontal" size="xs">
                        <SegmentedControl selectedId={view} onChange={({ detail }) => setView(detail.selectedId)} options={[{ id: "table", text: "Table view" }, { id: "json", text: "JSON view" }]} />
                        {query.next && <Button onClick={() => void run(query.next)}>Load more</Button>}
                      </SpaceBetween>
                    }
                  >
                    Items returned
                  </Header>
                }
                items={view === "table" ? query.results : []}
                columnDefinitions={columns.map((name) => ({ id: name, header: name, cell: (item: Item) => attrText(item[name]) }))}
                resizableColumns
                empty={view === "json" ? <Box textAlign="left"><CodeView value={JSON.stringify(query.results, null, 2)} /></Box> : <Box textAlign="center" color="inherit"><b>No items</b><Box variant="p" color="inherit">The statement did not return any items.</Box></Box>}
              />
            )}
          </SpaceBetween>
        </Grid>
      </SpaceBetween>
    </DdbLayout>
  )
}
