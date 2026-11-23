"use client"

import Alert from "@cloudscape-design/components/alert"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import { VpcLayout } from "@/components/vpc/vpc-app"

const titles: Record<string, string> = {
  "global-view": "AWS Global View",
  "route-servers": "Route servers",
  "dns-firewall-rule-groups": "DNS firewall rule groups",
  "dns-firewall-domain-lists": "DNS firewall domain lists",
  "network-firewall": "Firewalls",
  "network-firewall-policies": "Firewall policies",
  "network-firewall-rule-groups": "Network Firewall rule groups",
  "network-firewall-tls": "TLS inspection configurations",
  "network-firewall-resource-groups": "Network Firewall resource groups",
  "network-firewall-endpoint-associations": "VPC endpoint associations",
  "network-firewall-container-associations": "Container associations",
  "vpn-concentrators": "Site-to-Site VPN Concentrators",
  "transit-gateway-policy-tables": "Transit gateway policy tables",
  "transit-gateway-multicast": "Transit gateway multicast",
  "metering-policies": "Metering policies",
  "cost-allocation": "Networking flexible cost allocation",
  ipam: "VPC IP Address Manager",
  settings: "Settings",
}

export function UnavailablePage({ section }: { section: string }) {
  const title = titles[section] ?? section
  return (
    <VpcLayout breadcrumbs={[{ text: title, href: `/vpc/${section}` }]}>
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Alert type="info" header={`${title} isn't available in the local emulator`}>
          This page needs an API that the local AWS Emulator doesn&apos;t provide.
        </Alert>
      </ContentLayout>
    </VpcLayout>
  )
}
