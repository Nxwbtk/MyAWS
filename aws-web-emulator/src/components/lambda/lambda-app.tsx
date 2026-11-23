"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import Alert from "@cloudscape-design/components/alert"
import Badge from "@cloudscape-design/components/badge"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import { usePathname, useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { ConsoleLayout } from "@/components/ec2-family/engine"
import type { Crumb } from "@/components/shell/page-layout"
import { LambdaDashboard } from "@/components/lambda/dashboard"
import { FunctionsPage } from "@/components/lambda/functions"
import { CreateFunctionPage } from "@/components/lambda/create-function"
import { FunctionDetailPage } from "@/components/lambda/function-detail"
import { CodeSigningPage, EventSourceMappingsPage, LayerDetailPage, LayersPage } from "@/components/lambda/resources"

const link = (text: string, href: string, info?: ReactNode): SideNavigationProps.Item => ({ type: "link", text, href, info })

const nav: SideNavigationProps.Item[] = [
  link("Dashboard", "/lambda"),
  link("Applications", "/lambda/applications"),
  link("Functions", "/lambda/functions"),
  {
    type: "section",
    text: "Additional resources",
    items: [link("Code signing configurations", "/lambda/code-signing"), link("Event source mappings", "/lambda/event-source-mappings"), link("Layers", "/lambda/layers"), link("Replicas", "/lambda/replicas"), link("Capacity providers", "/lambda/capacity-providers")],
  },
  { type: "section", text: "MicroVMs", items: [link("MicroVM Images", "/lambda/microvm-images", <Badge color="blue">New</Badge>), link("MicroVMs", "/lambda/microvms")] },
  link("Runtimes", "/lambda/runtimes", <Badge color="blue">New</Badge>),
  link("Network connectors", "/lambda/network-connectors"),
  { type: "section", text: "Related AWS resources", items: [{ type: "link", text: "Step Functions state machines", href: "https://docs.aws.amazon.com/step-functions/", external: true }] },
]

export function LambdaLayout({ breadcrumbs, children, contentType }: { breadcrumbs: Crumb[]; children: ReactNode; contentType?: "default" | "table" | "form" | "dashboard" }) {
  const parts = usePathname().split("/").filter(Boolean)
  return (
    <ConsoleLayout serviceName="Lambda" serviceHref="/lambda" nav={nav} activeHref={parts.length > 1 ? `/lambda/${parts[1]}` : "/lambda"} breadcrumbs={[{ text: "Lambda", href: "/lambda" }, ...breadcrumbs]} contentType={contentType}>
      {children}
    </ConsoleLayout>
  )
}

const titles: Record<string, string> = {
  applications: "Applications",
  replicas: "Replicas",
  "capacity-providers": "Capacity providers",
  "microvm-images": "MicroVM Images",
  microvms: "MicroVMs",
  runtimes: "Runtimes",
  "network-connectors": "Network connectors",
}

function Unavailable({ section }: { section: string }) {
  const title = titles[section] ?? "Not found"
  return (
    <LambdaLayout breadcrumbs={[{ text: title, href: `/lambda/${section}` }]}>
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Alert type="info" header={`${title} isn't available in the local emulator`}>This page needs Lambda features that the local AWS Emulator doesn&apos;t provide.</Alert>
      </ContentLayout>
    </LambdaLayout>
  )
}

export function LambdaApp({ path }: { path: string[] }) {
  const params = useSearchParams()
  const [section, id, sub] = path
  switch (section) {
    case undefined:
    case "home":
      return <LambdaDashboard />
    case "functions":
      if (id) return <FunctionDetailPage name={decodeURIComponent(id)} tab={params.get("tab") ?? "code"} sub={params.get("section") ?? undefined} />
      return <FunctionsPage />
    case "create":
      return <CreateFunctionPage />
    case "layers":
      if (id) return <LayerDetailPage name={decodeURIComponent(id)} version={sub} />
      return <LayersPage />
    case "event-source-mappings":
      return <EventSourceMappingsPage />
    case "code-signing":
      return <CodeSigningPage />
    default:
      return <Unavailable section={section} />
  }
}
