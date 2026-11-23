"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ColumnLayout from "@cloudscape-design/components/column-layout"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Grid from "@cloudscape-design/components/grid"
import Header from "@cloudscape-design/components/header"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import { useQuery } from "@tanstack/react-query"
import { useFollow } from "@/components/shell/page-layout"
import { VpcLayout } from "@/components/vpc/vpc-app"
import { callAws, isAvailable } from "@/lib/aws"
import { healthQuery } from "@/lib/console-client"
import { regionName } from "@/lib/service-meta"

const counts: { label: string; href: string; operation: string; key: string; input?: Record<string, unknown> }[] = [
  { label: "VPCs", href: "/vpc/vpcs", operation: "DescribeVpcs", key: "Vpcs" },
  { label: "Subnets", href: "/vpc/subnets", operation: "DescribeSubnets", key: "Subnets" },
  { label: "Route Tables", href: "/vpc/route-tables", operation: "DescribeRouteTables", key: "RouteTables" },
  { label: "Internet Gateways", href: "/vpc/igws", operation: "DescribeInternetGateways", key: "InternetGateways" },
  { label: "Egress-only Internet Gateways", href: "/vpc/egress-only-igws", operation: "DescribeEgressOnlyInternetGateways", key: "EgressOnlyInternetGateways" },
  { label: "DHCP option sets", href: "/vpc/dhcp-options", operation: "DescribeDhcpOptions", key: "DhcpOptions" },
  { label: "Elastic IPs", href: "/vpc/addresses", operation: "DescribeAddresses", key: "Addresses" },
  { label: "Endpoints", href: "/vpc/endpoints", operation: "DescribeVpcEndpoints", key: "VpcEndpoints" },
  { label: "Instance Connect Endpoints", href: "/vpc/endpoints", operation: "DescribeInstanceConnectEndpoints", key: "InstanceConnectEndpoints" },
  { label: "Endpoint Services", href: "/vpc/endpoint-services", operation: "DescribeVpcEndpointServiceConfigurations", key: "ServiceConfigurations" },
  { label: "NAT Gateways", href: "/vpc/nat-gateways", operation: "DescribeNatGateways", key: "NatGateways" },
  { label: "VPC Peering Connections", href: "/vpc/peering", operation: "DescribeVpcPeeringConnections", key: "VpcPeeringConnections" },
  { label: "Network ACLs", href: "/vpc/acls", operation: "DescribeNetworkAcls", key: "NetworkAcls" },
  { label: "Security Groups", href: "/vpc/security-groups", operation: "DescribeSecurityGroups", key: "SecurityGroups" },
  { label: "Customer Gateways", href: "/vpc/customer-gateways", operation: "DescribeCustomerGateways", key: "CustomerGateways" },
  { label: "Site-to-Site VPN Connections", href: "/vpc/vpn-connections", operation: "DescribeVpnConnections", key: "VpnConnections" },
  { label: "Running Instances", href: "/ec2/instances", operation: "DescribeInstances", key: "Reservations", input: { Filters: [{ Name: "instance-state-name", Values: ["running"] }] } },
]

export function VpcDashboard() {
  const follow = useFollow()
  const health = useQuery(healthQuery)
  const region = health.data?.region ?? "ap-southeast-7"
  const data = useQuery({
    queryKey: ["emulator", "vpc", "dashboard"],
    enabled: health.data?.connected === true,
    queryFn: async () => {
      const results = await Promise.all(
        counts.map(async (entry) => {
          if (!isAvailable("ec2", entry.operation)) return undefined
          try {
            const page = await callAws<Record<string, unknown[]>>("ec2", entry.operation, entry.input ?? {})
            const items = page[entry.key] ?? []
            return entry.key === "Reservations"
              ? (items as { Instances?: unknown[] }[]).reduce((total, reservation) => total + (reservation.Instances?.length ?? 0), 0)
              : items.length
          } catch {
            return undefined
          }
        }),
      )
      return results
    },
  })
  return (
    <VpcLayout breadcrumbs={[{ text: "VPC dashboard", href: "/vpc" }]} contentType="dashboard">
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button href="/ec2/instances" onFollow={follow}>Launch EC2 Instances</Button>
                <Button variant="primary" href="/vpc/vpcs/create" onFollow={follow}>Create VPC</Button>
              </SpaceBetween>
            }
            description={`Note: Your Instances will launch in the ${regionName(region).split(" (")[0]} region.`}
          >
            VPC dashboard
          </Header>
        }
      >
        <Grid gridDefinition={[{ colspan: { default: 12, m: 8 } }, { colspan: { default: 12, m: 4 } }]}>
          <Container
            header={
              <Header
                variant="h2"
                description="You are using the following Amazon VPC resources"
                actions={<Button iconName="refresh" onClick={() => void data.refetch()} loading={data.isFetching}>Refresh Resources</Button>}
              >
                Resources by Region
              </Header>
            }
          >
            <ColumnLayout columns={3} variant="text-grid">
              {counts.map((entry, index) => (
                <div key={entry.label}>
                  <Link href={entry.href} onFollow={follow} fontSize="heading-s">{entry.label}</Link>
                  <Box>
                    {regionName(region).replace(/^.*\((.*)\)$/, "$1")}{" "}
                    <b>{data.isPending ? "…" : (data.data?.[index] ?? "–")}</b>
                  </Box>
                </div>
              ))}
            </ColumnLayout>
          </Container>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Service Health</Header>}>
              <SpaceBetween size="xs">
                <StatusIndicator type={health.data?.connected ? "success" : "warning"}>
                  {health.data?.connected ? "Amazon VPC - local emulator is operating normally" : "Local emulator API is offline"}
                </StatusIndicator>
                <Link href="/" onFollow={follow}>View complete service health details</Link>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">Settings</Header>}>
              <SpaceBetween size="xs">
                <Link href="/vpc/settings" onFollow={follow}>Block Public Access</Link>
                <Link href="/vpc/settings" onFollow={follow}>Zones</Link>
                <Link href="/vpc/settings" onFollow={follow}>Console Experiments</Link>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">Additional Information</Header>}>
              <SpaceBetween size="xs">
                <Link external href="https://docs.aws.amazon.com/vpc/">VPC Documentation</Link>
                <Link href="/vpc/vpcs" onFollow={follow}>All VPC Resources</Link>
                <Link external href="https://repost.aws/topics/TA3fhvXy1gTKa4ztcb5jVtsA/amazon-vpc">Forums</Link>
                <Link external href="https://github.com/aws/aws-emulator/issues">Report an Issue</Link>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Grid>
      </ContentLayout>
    </VpcLayout>
  )
}
