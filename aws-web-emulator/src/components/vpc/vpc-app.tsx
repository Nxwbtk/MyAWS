"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { ConsoleLayout, ResourceDetailPage, ResourceListPage, type ResourceDef } from "@/components/ec2-family/engine"
import type { Crumb } from "@/components/shell/page-layout"
import { VpcDashboard } from "@/components/vpc/dashboard"
import { vpcDefs } from "@/components/vpc/defs"
import { CreateVpcPage } from "@/components/vpc/create-vpc"
import { vpcCreatePages } from "@/components/vpc/create-pages"
import { UnavailablePage } from "@/components/vpc/unavailable"

const link = (text: string, href: string): SideNavigationProps.Item => ({ type: "link", text, href })

export const vpcNav: SideNavigationProps.Item[] = [
  link("VPC dashboard", "/vpc"),
  link("AWS Global View", "/vpc/global-view"),
  {
    type: "section",
    text: "Virtual private cloud",
    items: [
      link("Your VPCs", "/vpc/vpcs"),
      link("Subnets", "/vpc/subnets"),
      link("Route tables", "/vpc/route-tables"),
      link("Internet gateways", "/vpc/igws"),
      link("Egress-only internet gateways", "/vpc/egress-only-igws"),
      link("DHCP option sets", "/vpc/dhcp-options"),
      link("Elastic IPs", "/vpc/addresses"),
      link("Managed prefix lists", "/vpc/prefix-lists"),
      link("Endpoints", "/vpc/endpoints"),
      link("Endpoint services", "/vpc/endpoint-services"),
      link("NAT gateways", "/vpc/nat-gateways"),
      link("Peering connections", "/vpc/peering"),
      link("Route servers", "/vpc/route-servers"),
    ],
  },
  {
    type: "section",
    text: "Security",
    items: [link("Network ACLs", "/vpc/acls"), link("Security groups", "/vpc/security-groups")],
  },
  {
    type: "section",
    text: "DNS firewall",
    items: [link("Rule groups", "/vpc/dns-firewall-rule-groups"), link("Domain lists", "/vpc/dns-firewall-domain-lists")],
  },
  {
    type: "section",
    text: "Network Firewall",
    items: [
      link("Firewalls", "/vpc/network-firewall"),
      link("Firewall policies", "/vpc/network-firewall-policies"),
      link("Network Firewall rule groups", "/vpc/network-firewall-rule-groups"),
      link("TLS inspection configurations", "/vpc/network-firewall-tls"),
      link("Network Firewall resource groups", "/vpc/network-firewall-resource-groups"),
      link("VPC endpoint associations", "/vpc/network-firewall-endpoint-associations"),
      link("Container associations", "/vpc/network-firewall-container-associations"),
    ],
  },
  {
    type: "section",
    text: "Virtual private network (VPN)",
    items: [
      link("Customer gateways", "/vpc/customer-gateways"),
      link("Virtual private gateways", "/vpc/vpn-gateways"),
      link("Site-to-Site VPN Concentrators", "/vpc/vpn-concentrators"),
      link("Site-to-Site VPN connections", "/vpc/vpn-connections"),
      link("Client VPN endpoints", "/vpc/client-vpn"),
    ],
  },
  {
    type: "section",
    text: "Transit gateways",
    items: [
      link("Transit gateways", "/vpc/transit-gateways"),
      link("Transit gateway attachments", "/vpc/transit-gateway-attachments"),
      link("Transit gateway policy tables", "/vpc/transit-gateway-policy-tables"),
      link("Transit gateway route tables", "/vpc/transit-gateway-route-tables"),
      link("Transit gateway multicast", "/vpc/transit-gateway-multicast"),
      link("Metering policies", "/vpc/metering-policies"),
    ],
  },
  {
    type: "section",
    text: "Traffic Mirroring",
    items: [link("Mirror sessions", "/vpc/mirror-sessions"), link("Mirror targets", "/vpc/mirror-targets"), link("Mirror filters", "/vpc/mirror-filters")],
  },
  link("Networking flexible cost allocation", "/vpc/cost-allocation"),
  { type: "divider" },
  link("Network Manager", "/networkmanager"),
  link("Cloud WAN", "/networkmanager"),
  link("VPC IP Address Manager", "/vpc/ipam"),
  link("Settings", "/vpc/settings"),
]

export function VpcLayout({
  breadcrumbs,
  children,
  splitPanel,
  contentType,
}: {
  breadcrumbs: Crumb[]
  children: ReactNode
  splitPanel?: ReactNode
  contentType?: "default" | "table" | "form" | "wizard" | "dashboard"
}) {
  const path = usePathname()
  const active = "/" + path.split("/").filter(Boolean).slice(0, 2).join("/")
  return (
    <ConsoleLayout
      serviceName="VPC"
      serviceHref="/vpc"
      nav={vpcNav}
      activeHref={active === "/vpc/" ? "/vpc" : active}
      breadcrumbs={[{ text: "VPC", href: "/vpc" }, ...breadcrumbs]}
      splitPanel={splitPanel}
      contentType={contentType}
    >
      {children}
    </ConsoleLayout>
  )
}

const listLayout = ({ children, splitPanel, breadcrumbs }: { children: ReactNode; splitPanel?: ReactNode; breadcrumbs: Crumb[] }) => (
  <VpcLayout breadcrumbs={breadcrumbs} splitPanel={splitPanel} contentType="table">
    {children}
  </VpcLayout>
)

const detailLayout = ({ children, breadcrumbs }: { children: ReactNode; breadcrumbs: Crumb[] }) => <VpcLayout breadcrumbs={breadcrumbs}>{children}</VpcLayout>

export function VpcApp({ path }: { path: string[] }) {
  const [section, id] = path
  if (!section) return <VpcDashboard />
  if (section === "vpcs" && id === "create") return <CreateVpcPage />
  const def: ResourceDef | undefined = vpcDefs[section]
  if (def) {
    if (id === "create") {
      const Create = vpcCreatePages[section]
      if (Create) return <Create />
    }
    if (id) return <ResourceDetailPage def={def} id={decodeURIComponent(id)} layout={detailLayout} />
    return <ResourceListPage def={def} layout={listLayout} />
  }
  return <UnavailablePage section={section} />
}
