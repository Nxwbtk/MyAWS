"use client"

import Board, { type BoardProps } from "@cloudscape-design/board-components/board"
import BoardItem from "@cloudscape-design/board-components/board-item"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ButtonDropdown from "@cloudscape-design/components/button-dropdown"
import ColumnLayout from "@cloudscape-design/components/column-layout"
import ContentLayout from "@cloudscape-design/components/content-layout"
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard"
import Header from "@cloudscape-design/components/header"
import HelpPanel from "@cloudscape-design/components/help-panel"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Tabs from "@cloudscape-design/components/tabs"
import { useQueries, useQuery } from "@tanstack/react-query"
import { useEffect, useState, type ReactNode } from "react"
import { ServiceIcon } from "@/components/service-icon"
import { PageLayout, useFollow } from "@/components/shell/page-layout"
import { openServicesMenu } from "@/components/shell/services-menu"
import { healthQuery, resourceQuery, useRecentServices } from "@/lib/console-client"
import { type Service } from "@/lib/contracts"
import { findCatalogService } from "@/lib/service-catalog"
import { serviceShortName } from "@/lib/service-meta"

type WidgetId = "recent" | "started" | "health" | "emulator" | "solutions" | "resources" | "setup"
type Widget = { title: string; description: string; columnSpan: number; rowSpan: number }

const widgets: Record<WidgetId, Widget> = {
  recent: { title: "Recently visited", description: "Services you opened most recently.", columnSpan: 2, rowSpan: 4 },
  started: { title: "Get started", description: "Learn about the AWS Emulator.", columnSpan: 1, rowSpan: 4 },
  health: { title: "AWS Health", description: "Open issues and scheduled changes.", columnSpan: 1, rowSpan: 4 },
  emulator: { title: "Emulator health", description: "Connection to the local emulator API.", columnSpan: 2, rowSpan: 3 },
  solutions: { title: "Solutions", description: "Vetted solutions for business and technical use cases.", columnSpan: 2, rowSpan: 3 },
  resources: { title: "Local resources", description: "Resource counts in the emulator.", columnSpan: 2, rowSpan: 3 },
  setup: { title: "Local setup", description: "Commands to run the emulator and console.", columnSpan: 4, rowSpan: 4 },
}

const defaultLayout: WidgetId[] = ["recent", "started", "health", "emulator", "solutions"]
const layoutKey = "myaws.console-home.layout.v2"

function toItems(ids: WidgetId[]): BoardProps.Item<WidgetId>[] {
  return ids.map((id) => ({
    id,
    data: id,
    columnSpan: widgets[id].columnSpan,
    rowSpan: widgets[id].rowSpan,
  }))
}

function readLayout(): BoardProps.Item<WidgetId>[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(layoutKey) ?? "null")
    if (!Array.isArray(raw)) return null
    return raw
      .filter((item) => item && item.id in widgets)
      .map((item) => ({
        id: item.id,
        data: item.id,
        columnSpan: Number(item.columnSpan) || widgets[item.id as WidgetId].columnSpan,
        rowSpan: Number(item.rowSpan) || widgets[item.id as WidgetId].rowSpan,
      }))
  } catch {
    return null
  }
}

function saveLayout(items: readonly BoardProps.Item<WidgetId>[]) {
  try {
    localStorage.setItem(
      layoutKey,
      JSON.stringify(items.map(({ id, columnSpan, rowSpan }) => ({ id, columnSpan, rowSpan }))),
    )
  } catch {
    // The layout still works for this visit without storage.
  }
}

const boardStrings: BoardProps.I18nStrings<WidgetId> = {
  liveAnnouncementDndStarted: (type) => (type === "resize" ? "Resizing" : "Dragging"),
  liveAnnouncementDndItemReordered: (op) =>
    `Item moved to ${op.direction === "horizontal" ? "column" : "row"} ${
      op.direction === "horizontal" ? op.placement.x + 1 : op.placement.y + 1
    }.`,
  liveAnnouncementDndItemResized: (op) =>
    `Item resized to ${op.direction === "horizontal" ? "columns" : "rows"} ${
      op.direction === "horizontal" ? op.placement.width : op.placement.height
    }.`,
  liveAnnouncementDndItemInserted: (op) =>
    `Item inserted to column ${op.placement.x + 1}, row ${op.placement.y + 1}.`,
  liveAnnouncementDndCommitted: (type) => `${type} committed`,
  liveAnnouncementDndDiscarded: (type) => `${type} discarded`,
  liveAnnouncementItemRemoved: (op) => `Removed item ${widgets[op.item.data].title}.`,
  navigationAriaLabel: "Board navigation",
  navigationAriaDescription: "Click on non-empty item to move focus over",
  navigationItemAriaLabel: (item) => (item ? widgets[item.data].title : "Empty"),
}

const itemStrings = {
  dragHandleAriaLabel: "Drag handle",
  dragHandleAriaDescription:
    "Use Space or Enter to activate drag, arrow keys to move, Space or Enter to submit, or Escape to discard.",
  resizeHandleAriaLabel: "Resize handle",
  resizeHandleAriaDescription:
    "Use Space or Enter to activate resize, arrow keys to resize, Space or Enter to submit, or Escape to discard.",
}

export function Overview() {
  const [items, setItems] = useState(() => toItems(defaultLayout))

  useEffect(() => {
    const saved = readLayout()
    // Restore the saved layout after hydration so server and client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setItems(saved)
  }, [])

  function update(next: readonly BoardProps.Item<WidgetId>[]) {
    setItems([...next])
    saveLayout(next)
  }

  const hidden = (Object.keys(widgets) as WidgetId[]).filter(
    (id) => !items.some((item) => item.id === id),
  )

  return (
    <PageLayout
      contentType="dashboard"
      maxContentWidth={1040}
      navigationHide
      tools={
        <HelpPanel header={<h2>Console Home</h2>}>
          <p>
            Console Home shows widgets for the local AWS Emulator. Drag a
            widget by its handle to move it, resize it from the corner, or
            remove it from its settings menu. Your layout is saved in this
            browser.
          </p>
        </HelpPanel>
      }
      content={
        <ContentLayout
          header={
            <Header
              variant="h1"
              info={<Link variant="info">Info</Link>}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button
                    onClick={() => {
                      const next = toItems(defaultLayout)
                      setItems(next)
                      try {
                        localStorage.removeItem(layoutKey)
                      } catch {
                        // Nothing stored.
                      }
                    }}
                  >
                    Reset to default layout
                  </Button>
                  <ButtonDropdown
                    variant="primary"
                    disabled={hidden.length === 0}
                    items={hidden.map((id) => ({ id, text: widgets[id].title }))}
                    onItemClick={({ detail }) => {
                      const id = detail.id as WidgetId
                      update([...items, ...toItems([id])])
                    }}
                  >
                    Add widgets
                  </ButtonDropdown>
                </SpaceBetween>
              }
            >
              Console Home
            </Header>
          }
        >
          <Board
            items={items}
            i18nStrings={boardStrings}
            onItemsChange={({ detail }) => update(detail.items)}
            empty={
              <Box textAlign="center" color="inherit" padding="xxl">
                <SpaceBetween size="xs">
                  <Box variant="strong">No widgets</Box>
                  <Box variant="p">Add widgets to Console Home.</Box>
                </SpaceBetween>
              </Box>
            }
            renderItem={(item, actions) => (
              <BoardItem
                i18nStrings={itemStrings}
                header={<WidgetHeader id={item.data} />}
                footer={<WidgetFooter id={item.data} />}
                settings={
                  <ButtonDropdown
                    variant="icon"
                    ariaLabel={`${widgets[item.data].title} settings`}
                    items={[{ id: "remove", text: "Remove" }]}
                    onItemClick={() => actions.removeItem()}
                  />
                }
              >
                <WidgetContent id={item.data} />
              </BoardItem>
            )}
          />
        </ContentLayout>
      }
    />
  )
}

function WidgetHeader({ id }: { id: WidgetId }) {
  const follow = useFollow()
  if (id === "recent")
    return (
      <Header
        info={<Link variant="info">Info</Link>}
        actions={
          <Button
            href="/?services=all"
            onFollow={(event) => {
              event.preventDefault()
              openServicesMenu("all")
            }}
          >
            All services
          </Button>
        }
      >
        Recently visited
      </Header>
    )
  if (id === "resources")
    return (
      <Header
        actions={
          <Button href="/s3" onFollow={follow}>
            Go to S3
          </Button>
        }
      >
        Local resources
      </Header>
    )
  if (id === "solutions")
    return (
      <Header
        counter="(13)"
        info={<Link variant="info">Info</Link>}
        description="Vetted solutions from AWS for popular business and technical use cases."
      >
        Solutions
      </Header>
    )
  if (id === "emulator")
    return (
      <Header
        info={<Link variant="info">Info</Link>}
        actions={<Button href="#local-setup">Local setup</Button>}
      >
        Emulator health
      </Header>
    )
  return (
    <Header info={id === "health" ? <Link variant="info">Info</Link> : undefined}>
      {widgets[id].title}
    </Header>
  )
}

function WidgetFooter({ id }: { id: WidgetId }) {
  if (id !== "health") return null
  return (
    <Box textAlign="center" color="text-status-inactive">
      <span title="AWS Health is not available in the local emulator">Go to AWS Health</span>
    </Box>
  )
}

function WidgetContent({ id }: { id: WidgetId }) {
  switch (id) {
    case "recent":
      return <RecentServices />
    case "started":
      return <GetStarted />
    case "health":
      return <AwsHealth />
    case "emulator":
      return <EmulatorHealth />
    case "solutions":
      return <Solutions />
    case "resources":
      return <ResourceInventory />
    case "setup":
      return <LocalSetup />
  }
}

function RecentServices() {
  const follow = useFollow()
  const recent = useRecentServices((state) => state.ids)
  const services = recent.flatMap((id) => findCatalogService(id) ?? [])
  if (services.length === 0)
    return (
      <Box textAlign="center" color="text-body-secondary" padding={{ top: "l" }}>
        <SpaceBetween size="xxs">
          <Box variant="strong" color="inherit">
            No recently visited services
          </Box>
          <Box variant="p" color="inherit">
            Open a service from Search to find it here next time.
          </Box>
        </SpaceBetween>
      </Box>
    )
  return (
    <ul className="myaws-recent-list">
      {services.map((service) => (
        <li key={service.id}>
          <ServiceIcon id={service.id} className="myaws-recent-icon" />
          <Link href={`/${service.id}`} onFollow={follow}>
            {serviceShortName(service.id)}
          </Link>
        </li>
      ))}
    </ul>
  )
}

const startedLinks: { title: string; href: string; description: string }[] = [
  {
    title: "Getting started with the AWS Emulator",
    href: "https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html",
    description: "Install the emulator and point AWS SDKs and the CLI at it.",
  },
  {
    title: "AWS documentation",
    href: "https://docs.aws.amazon.com/",
    description: "Service guides and API references for every AWS service.",
  },
  {
    title: "Training and certification",
    href: "https://aws.amazon.com/training/",
    description: "Learn from AWS experts and advance your skills and knowledge.",
  },
]

function GetStarted() {
  return (
    <SpaceBetween size="m">
      {startedLinks.map((link) => (
        <div key={link.href}>
          <Box variant="h3" padding="n">
            <Link href={link.href} external fontSize="heading-s">
              {link.title}
            </Link>
          </Box>
          <Box variant="p" color="text-body-secondary">
            {link.description}
          </Box>
        </div>
      ))}
    </SpaceBetween>
  )
}

function AwsHealth() {
  const rows: [string, string][] = [
    ["Open issues", "Past 7 days"],
    ["Scheduled changes", "Upcoming and past 7 days"],
    ["Other notifications", "Past 7 days"],
  ]
  return (
    <SpaceBetween size="l">
      {rows.map(([label, period]) => (
        <div key={label} className="myaws-health-row">
          <Box variant="awsui-key-label">{label}</Box>
          <div className="myaws-health-value">
            <Box fontSize="heading-xl">0</Box>
            <Box color="text-body-secondary">{period}</Box>
          </div>
        </div>
      ))}
    </SpaceBetween>
  )
}

function EmulatorHealth() {
  const health = useQuery(healthQuery)
  const connected = health.data?.connected === true
  return (
    <KeyValuePairs
      columns={2}
      items={[
        {
          label: "API status",
          value: (
            <StatusIndicator type={connected ? "success" : health.isPending ? "loading" : "warning"}>
              {connected ? "Online" : health.isPending ? "Checking" : "Offline"}
            </StatusIndicator>
          ),
        },
        { label: "Region", value: health.data?.region ?? "—" },
        { label: "Endpoint", value: <Box variant="code">{health.data?.endpoint ?? "—"}</Box> },
        {
          label: "Details",
          value: connected
            ? "Requests go to the local emulator only."
            : (health.error?.message ?? health.data?.detail ?? "The emulator did not respond."),
        },
      ]}
    />
  )
}

const solutionTabs: { id: string; label: string; items: string[] }[] = [
  { id: "experiment", label: "Experiment (2)", items: ["Provision temporary, recyclable AWS sandbox accounts with guardrails", "Train autonomous racing models with reinforcement learning"] },
  { id: "build", label: "Build (4)", items: ["Deploy a serverless web application", "Build a data lake on Amazon S3", "Run containers on Amazon ECS", "Set up a CI/CD pipeline"] },
  { id: "operate", label: "Operate (3)", items: ["Centralize logging with CloudWatch", "Automate backups across accounts", "Monitor costs and usage"] },
  { id: "data", label: "Data and AI (4)", items: ["Build a generative AI chatbot", "Stream analytics with Kinesis", "Query data with Athena", "Train models with SageMaker AI"] },
]

function Solutions() {
  return (
    <Tabs
      variant="default"
      tabs={solutionTabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        content: (
          <SpaceBetween size="s">
            {tab.items.map((item) => (
              <div key={item} className="myaws-solution">
                <Box>{item}</Box>
                <Box fontSize="body-s" color="text-status-inactive">
                  Not available in the local emulator
                </Box>
              </div>
            ))}
          </SpaceBetween>
        ),
      }))}
    />
  )
}

const inventory: { service: Service; label: string }[] = [
  { service: "s3", label: "Buckets" },
  { service: "dynamodb", label: "Tables" },
  { service: "sqs", label: "Queues" },
]

function ResourceInventory() {
  const follow = useFollow()
  const health = useQuery(healthQuery)
  const connected = health.data?.connected === true
  const snapshots = useQueries({
    queries: inventory.map(({ service }) => ({
      ...resourceQuery(service),
      enabled: connected,
    })),
  })
  return (
    <ColumnLayout columns={3} variant="text-grid">
      {inventory.map(({ service, label }, index) => {
        const snapshot = snapshots[index]
        return (
          <div key={service}>
            <Box variant="awsui-key-label">{label}</Box>
            {!connected ? (
              <Box fontSize="display-l" fontWeight="light" color="text-body-secondary">
                —
              </Box>
            ) : snapshot.isPending ? (
              <StatusIndicator type="loading">Loading</StatusIndicator>
            ) : snapshot.isError ? (
              <StatusIndicator type="error">Error</StatusIndicator>
            ) : (
              <Link href={`/${service}`} onFollow={follow} fontSize="display-l">
                {snapshot.data.length}
              </Link>
            )}
          </div>
        )
      })}
    </ColumnLayout>
  )
}

function LocalSetup() {
  return (
    <div id="local-setup">
      <SpaceBetween size="m">
        <Box color="text-body-secondary">
          Run from <Box variant="code">aws-web-emulator</Box> in separate terminals.
        </Box>
        <ColumnLayout columns={2}>
          <Command
            title="Start the emulator API"
            command={[
              'mkdir -p "$HOME/.aws/emulator"',
              'EMULATOR_UID="$(id -u)" EMULATOR_GID="$(id -g)" \\',
              "  docker compose up --build -d",
            ].join("\n")}
          />
          <Command title="Run the web console" command={"npm ci\nnpm run dev"} />
        </ColumnLayout>
      </SpaceBetween>
    </div>
  )
}

function Command({ title, command }: { title: string; command: string }): ReactNode {
  return (
    <SpaceBetween size="xs">
      <Box variant="awsui-key-label">{title}</Box>
      <div className="myaws-code-block">
        <pre>{command}</pre>
        <CopyToClipboard
          variant="icon"
          textToCopy={command}
          copyButtonAriaLabel={`Copy ${title}`}
          copySuccessText="Command copied"
          copyErrorText="Command failed to copy"
        />
      </div>
    </SpaceBetween>
  )
}
