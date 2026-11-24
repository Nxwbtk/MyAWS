"use client"

import Alert from "@cloudscape-design/components/alert"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import { useSearchParams } from "next/navigation"
import { CreateDistributionPage, DistributionDetailPage, DistributionsPage } from "@/components/cloudfront/distributions"
import { CfLayout } from "@/components/cloudfront/shared"

const titles: Record<string, string> = {
  "static-ips": "Static IPs", "vpc-origins": "VPC origins", saas: "SaaS", monitoring: "Monitoring", alarms: "Alarms", logs: "Logs",
  "cache-statistics": "Cache statistics", "popular-objects": "Popular objects", "top-referrers": "Top referrers", usage: "Usage", viewers: "Viewers",
  "field-level-encryption": "Field-level encryption", "trust-stores": "Trust stores", "savings-bundle": "Savings Bundle",
}

function Unavailable({ section }: { section: string }) {
  const title = titles[section] ?? "Not found"
  return (
    <CfLayout breadcrumbs={[{ text: title, href: `/cloudfront/${section}` }]}>
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Alert type="info" header={`${title} isn't available in the local emulator`}>This CloudFront feature needs APIs or data that the local AWS Emulator doesn&apos;t provide.</Alert>
      </ContentLayout>
    </CfLayout>
  )
}

export function CloudFrontApp({ path }: { path: string[] }) {
  const params = useSearchParams()
  const [section = "distributions", id] = path
  if (section === "distributions") {
    if (id === "create") return <CreateDistributionPage />
    if (id) return <DistributionDetailPage id={decodeURIComponent(id)} tab={params.get("tab") ?? "general"} />
    return <DistributionsPage />
  }
  return <Unavailable section={section} />
}
