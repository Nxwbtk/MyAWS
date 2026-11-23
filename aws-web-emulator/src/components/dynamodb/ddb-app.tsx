"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import Alert from "@cloudscape-design/components/alert"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import Badge from "@cloudscape-design/components/badge"
import { usePathname, useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { ConsoleLayout } from "@/components/ec2-family/engine"
import type { Crumb } from "@/components/shell/page-layout"
import { DdbDashboard } from "@/components/dynamodb/dashboard"
import { TablesPage } from "@/components/dynamodb/tables"
import { CreateTablePage } from "@/components/dynamodb/create-table"
import { TableDetailPage } from "@/components/dynamodb/table-detail"
import { ExploreItemsPage, ItemEditorPage } from "@/components/dynamodb/items"
import { PartiqlPage } from "@/components/dynamodb/partiql"
import { BackupsPage, ExportsPage, ImportsPage } from "@/components/dynamodb/data-movement"
import { DaxPage } from "@/components/dynamodb/dax"

const link = (text: string, href: string, info?: ReactNode): SideNavigationProps.Item => ({ type: "link", text, href, info })

export const ddbNav: SideNavigationProps.Item[] = [
  link("Dashboard", "/dynamodb"),
  link("Tables", "/dynamodb/tables"),
  link("Explore items", "/dynamodb/items"),
  link("PartiQL editor", "/dynamodb/partiql"),
  link("Backups", "/dynamodb/backups"),
  link("Exports to S3", "/dynamodb/exports"),
  link("Imports from S3", "/dynamodb/imports"),
  link("Bulk put items", "/dynamodb/bulk-put", <Badge color="blue">New</Badge>),
  link("Integrations", "/dynamodb/integrations"),
  link("Reserved capacity", "/dynamodb/reserved-capacity"),
  link("Settings", "/dynamodb/settings"),
  { type: "section", text: "Caches", items: [] },
  {
    type: "section",
    text: "DAX",
    items: [link("Clusters", "/dynamodb/dax/clusters"), link("Subnet groups", "/dynamodb/dax/subnet-groups"), link("Parameter groups", "/dynamodb/dax/parameter-groups"), link("Events", "/dynamodb/dax/events")],
  },
  link("ElastiCache integration", "/dynamodb/elasticache", <Badge color="blue">New</Badge>),
]

export function DdbLayout({ breadcrumbs, children, contentType, splitPanel }: { breadcrumbs: Crumb[]; children: ReactNode; contentType?: "default" | "table" | "form" | "wizard" | "dashboard"; splitPanel?: ReactNode }) {
  const path = usePathname()
  const parts = path.split("/").filter(Boolean)
  const active = parts[1] === "dax" ? `/${parts.slice(0, 3).join("/")}` : parts[1] === "table" ? "/dynamodb/tables" : `/${parts.slice(0, 2).join("/")}`
  return (
    <ConsoleLayout serviceName="DynamoDB" serviceHref="/dynamodb" nav={ddbNav} activeHref={active} breadcrumbs={[{ text: "DynamoDB", href: "/dynamodb" }, ...breadcrumbs]} contentType={contentType} splitPanel={splitPanel}>
      {children}
    </ConsoleLayout>
  )
}

function Unavailable({ title, path }: { title: string; path: string }) {
  return (
    <DdbLayout breadcrumbs={[{ text: title, href: path }]}>
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Alert type="info" header={`${title} isn't available in the local emulator`}>This page needs an API that the local AWS Emulator doesn&apos;t provide.</Alert>
      </ContentLayout>
    </DdbLayout>
  )
}

export function DynamoDbApp({ path }: { path: string[] }) {
  const params = useSearchParams()
  const [section, id, sub] = path
  switch (section) {
    case undefined:
      return <DdbDashboard />
    case "tables":
      if (id === "create") return <CreateTablePage />
      return <TablesPage />
    case "table":
      return <TableDetailPage name={decodeURIComponent(id ?? "")} tab={params.get("tab") ?? "overview"} />
    case "items":
      if (id === "create" || id === "edit") return <ItemEditorPage table={params.get("table") ?? ""} mode={id} itemKey={params.get("key") ?? undefined} />
      return <ExploreItemsPage initialTable={params.get("table") ?? undefined} />
    case "partiql":
      return <PartiqlPage />
    case "backups":
      return <BackupsPage />
    case "exports":
      return <ExportsPage />
    case "imports":
      return <ImportsPage />
    case "dax":
      return <DaxPage section={id ?? "clusters"} sub={sub} />
    case "bulk-put":
      return <Unavailable title="Bulk put items" path="/dynamodb/bulk-put" />
    case "integrations":
      return <Unavailable title="Integrations" path="/dynamodb/integrations" />
    case "reserved-capacity":
      return <Unavailable title="Reserved capacity" path="/dynamodb/reserved-capacity" />
    case "settings":
      return <Unavailable title="Settings" path="/dynamodb/settings" />
    default:
      return <Unavailable title="ElastiCache integration" path={`/dynamodb/${section}`} />
  }
}
