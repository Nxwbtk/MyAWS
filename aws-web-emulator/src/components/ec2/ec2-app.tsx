"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import Alert from "@cloudscape-design/components/alert"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import { usePathname } from "next/navigation"
import type { ComponentType, ReactNode } from "react"
import { ConsoleLayout, ResourceDetailPage, ResourceListPage, type ResourceDef } from "@/components/ec2-family/engine"
import type { Crumb } from "@/components/shell/page-layout"
import { Ec2Dashboard } from "@/components/ec2/dashboard"
import { ec2Defs } from "@/components/ec2/defs"
import { ec2CreatePages } from "@/components/ec2/create-pages"

const link = (text: string, href: string): SideNavigationProps.Item => ({ type: "link", text, href })

export const ec2Nav: SideNavigationProps.Item[] = [
  link("Dashboard", "/ec2"),
  link("AWS Global View", "/ec2/global-view"),
  link("Events", "/ec2/events"),
  {
    type: "section",
    text: "Instances",
    items: [
      link("Instances", "/ec2/instances"),
      link("Instance Types", "/ec2/instance-types"),
      link("Launch Templates", "/ec2/launch-templates"),
      link("Spot Requests", "/ec2/spot-requests"),
      link("Savings Plans", "/ec2/savings-plans"),
      link("Reserved Instances", "/ec2/reserved-instances"),
      link("Dedicated Hosts", "/ec2/hosts"),
      link("Capacity Reservations", "/ec2/capacity-reservations"),
    ],
  },
  { type: "section", text: "Images", items: [link("AMIs", "/ec2/images"), link("AMI Catalog", "/ec2/ami-catalog")] },
  { type: "section", text: "Elastic Block Store", items: [link("Volumes", "/ec2/volumes"), link("Snapshots", "/ec2/snapshots"), link("Lifecycle Manager", "/ec2/lifecycle-manager")] },
  {
    type: "section",
    text: "Network & Security",
    items: [link("Security Groups", "/ec2/security-groups"), link("Elastic IPs", "/ec2/addresses"), link("Placement Groups", "/ec2/placement-groups"), link("Key Pairs", "/ec2/key-pairs"), link("Network Interfaces", "/ec2/network-interfaces")],
  },
  { type: "section", text: "Load Balancing", items: [link("Load Balancers", "/ec2/load-balancers"), link("Target Groups", "/ec2/target-groups"), link("Trust Stores", "/ec2/trust-stores")] },
  { type: "section", text: "Auto Scaling", items: [link("Auto Scaling Groups", "/autoscaling")] },
  link("Settings", "/ec2/settings"),
]

export function Ec2Layout({ breadcrumbs, children, splitPanel, contentType }: { breadcrumbs: Crumb[]; children: ReactNode; splitPanel?: ReactNode; contentType?: "default" | "table" | "form" | "wizard" | "dashboard" }) {
  const path = usePathname()
  const active = "/" + path.split("/").filter(Boolean).slice(0, 2).join("/")
  return (
    <ConsoleLayout serviceName="EC2" serviceHref="/ec2" nav={ec2Nav} activeHref={active} breadcrumbs={[{ text: "EC2", href: "/ec2" }, ...breadcrumbs]} splitPanel={splitPanel} contentType={contentType}>
      {children}
    </ConsoleLayout>
  )
}

const listLayout = ({ children, splitPanel, breadcrumbs }: { children: ReactNode; splitPanel?: ReactNode; breadcrumbs: Crumb[] }) => (
  <Ec2Layout breadcrumbs={breadcrumbs} splitPanel={splitPanel} contentType="table">{children}</Ec2Layout>
)
const detailLayout = ({ children, breadcrumbs }: { children: ReactNode; breadcrumbs: Crumb[] }) => <Ec2Layout breadcrumbs={breadcrumbs}>{children}</Ec2Layout>

const unavailable: Record<string, string> = {
  "global-view": "AWS Global View",
  events: "Events",
  "savings-plans": "Savings Plans",
  "lifecycle-manager": "Lifecycle Manager",
  settings: "Settings",
}

export function Ec2App({ path }: { path: string[] }) {
  const [section, id] = path
  if (!section) return <Ec2Dashboard />
  const def: ResourceDef | undefined = ec2Defs[section]
  if (def) {
    const Special: ComponentType | undefined = id ? ec2CreatePages[`${section}/${id}`] : undefined
    if (Special) return <Special />
    if (id === "create") {
      const Create: ComponentType | undefined = ec2CreatePages[section]
      if (Create) return <Create />
    }
    if (id) return <ResourceDetailPage def={def} id={decodeURIComponent(id)} layout={detailLayout} />
    return <ResourceListPage def={def} layout={listLayout} />
  }
  const Page = ec2CreatePages[section]
  if (Page) return <Page />
  const title = unavailable[section] ?? section
  return (
    <Ec2Layout breadcrumbs={[{ text: title, href: `/ec2/${section}` }]}>
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Alert type="info" header={`${title} isn't available in the local emulator`}>This page needs an API that the local AWS Emulator doesn&apos;t provide.</Alert>
      </ContentLayout>
    </Ec2Layout>
  )
}
