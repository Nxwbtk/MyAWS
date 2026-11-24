"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import Alert from "@cloudscape-design/components/alert"
import Badge from "@cloudscape-design/components/badge"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import { usePathname, useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { ConsoleLayout, ResourceDetailPage, ResourceListPage } from "@/components/ec2-family/engine"
import type { Crumb } from "@/components/shell/page-layout"
import { Route53Dashboard } from "@/components/route53/dashboard"
import { CreateHostedZonePage, HostedZoneDetailPage, HostedZonesPage } from "@/components/route53/hosted-zones"
import { r53CreatePages, r53Defs } from "@/components/route53/defs"

const link = (text: string, href: string, info?: ReactNode): SideNavigationProps.Item => ({ type: "link", text, href, info })

const nav: SideNavigationProps.Item[] = [
  link("Dashboard", "/route53"),
  link("Hosted zones", "/route53/hosted-zones"),
  link("Health checks", "/route53/health-checks"),
  link("Profiles", "/route53/profiles"),
  { type: "section", text: "Global Resolver", items: [link("Global resolvers", "/route53/global-resolvers", <Badge color="blue">New</Badge>), link("Shared DNS views", "/route53/shared-dns-views", <Badge color="blue">New</Badge>)] },
  { type: "section", text: "VPC Resolver", items: [link("VPCs", "/route53/resolver-vpcs"), link("Inbound endpoints", "/route53/inbound-endpoints"), link("Outbound endpoints", "/route53/outbound-endpoints"), link("Rules", "/route53/rules"), link("Query logging", "/route53/query-logging"), link("Outposts", "/route53/outposts")] },
  { type: "section", text: "Domains", items: [link("Registered domains", "/route53/registered-domains"), link("Requests", "/route53/requests")] },
  { type: "section", text: "IP-based routing", items: [link("CIDR collections", "/route53/cidr-collections")] },
  { type: "section", text: "Traffic flow", items: [link("Traffic policies", "/route53/traffic-policies"), link("Policy records", "/route53/policy-records")] },
  { type: "divider" },
  { type: "link", text: "DNS Firewall", href: "/vpc", external: true },
  { type: "link", text: "Application Recovery Controller", href: "/arc", external: true },
]

export function R53Layout({ breadcrumbs, children, splitPanel, contentType }: { breadcrumbs: Crumb[]; children: ReactNode; splitPanel?: ReactNode; contentType?: "default" | "table" | "form" | "dashboard" }) {
  const parts = usePathname().split("/").filter(Boolean)
  return (
    <ConsoleLayout serviceName="Route 53" serviceHref="/route53" nav={nav} activeHref={parts.length > 1 ? `/route53/${parts[1]}` : "/route53"} breadcrumbs={[{ text: "Route 53", href: "/route53" }, ...breadcrumbs]} splitPanel={splitPanel} contentType={contentType}>
      {children}
    </ConsoleLayout>
  )
}

const layout = (props: { children: ReactNode; splitPanel?: ReactNode; breadcrumbs: Crumb[] }) => <R53Layout {...props} />

const titles: Record<string, string> = { "shared-dns-views": "Shared DNS views", outposts: "Outposts" }

function Unavailable({ section }: { section: string }) {
  const title = titles[section] ?? "Not found"
  return (
    <R53Layout breadcrumbs={[{ text: title, href: `/route53/${section}` }]}>
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Alert type="info" header={`${title} isn't available in the local emulator`}>This Route 53 feature needs APIs that the local AWS Emulator doesn&apos;t implement.</Alert>
      </ContentLayout>
    </R53Layout>
  )
}

export function Route53App({ path }: { path: string[] }) {
  const params = useSearchParams()
  const [section, id] = path
  if (!section) return <Route53Dashboard />
  if (section === "hosted-zones") {
    if (id === "create") return <CreateHostedZonePage />
    if (id) return <HostedZoneDetailPage id={decodeURIComponent(id)} tab={params.get("tab") ?? "records"} />
    return <HostedZonesPage />
  }
  const create = r53CreatePages[`${section}/${id}`]
  if (create) return create()
  const def = r53Defs[section]
  if (def) return id ? <ResourceDetailPage def={def} id={decodeURIComponent(id)} layout={layout} /> : <ResourceListPage def={def} layout={layout} />
  return <Unavailable section={section} />
}
