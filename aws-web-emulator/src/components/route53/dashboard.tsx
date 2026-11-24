"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ColumnLayout from "@cloudscape-design/components/column-layout"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import { useFollow } from "@/components/shell/page-layout"
import { R53Layout } from "@/components/route53/r53-app"
import { useZones } from "@/components/route53/hosted-zones"
import { useAws } from "@/lib/aws"

export function Route53Dashboard() {
  const follow = useFollow()
  const zones = useZones()
  const checks = useAws<{ HealthChecks?: unknown[] }>("route53", "ListHealthChecks", {})
  const domains = useAws<{ Domains?: unknown[] }>("route53domains", "ListDomains", {})
  const policies = useAws<{ TrafficPolicySummaries?: unknown[] }>("route53", "ListTrafficPolicies", {})
  const stat = (label: string, value: number | undefined, href: string) => (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Link variant="awsui-value-large" href={href} onFollow={follow}>{value ?? "–"}</Link>
    </div>
  )
  return (
    <R53Layout breadcrumbs={[{ text: "Dashboard", href: "/route53" }]} contentType="dashboard">
      <ContentLayout header={<Header variant="h1" description="Amazon Route 53 is a highly available and scalable cloud Domain Name System (DNS) web service.">Route 53 Dashboard</Header>}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">DNS management</Header>} footer={<Button href="/route53/hosted-zones/create" onFollow={follow}>Create hosted zone</Button>}>
            <ColumnLayout columns={4} variant="text-grid">
              {stat("Hosted zones", zones.data?.length, "/route53/hosted-zones")}
              {stat("Health checks", checks.data?.HealthChecks?.length, "/route53/health-checks")}
              {stat("Traffic policies", policies.data?.TrafficPolicySummaries?.length, "/route53/traffic-policies")}
              {stat("Registered domains", domains.data?.Domains?.length, "/route53/registered-domains")}
            </ColumnLayout>
          </Container>
          <ColumnLayout columns={2}>
            <Container header={<Header variant="h2">Register domain</Header>}>
              <SpaceBetween size="s"><Box>Find and register an available domain, or transfer your existing domains to Route 53.</Box><Button href="/route53/registered-domains/create" onFollow={follow}>Register domains</Button></SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">VPC Resolver</Header>}>
              <SpaceBetween size="s"><Box>Forward DNS queries between your VPCs and your network with Resolver endpoints and rules.</Box><Button href="/route53/rules" onFollow={follow}>View rules</Button></SpaceBetween>
            </Container>
          </ColumnLayout>
        </SpaceBetween>
      </ContentLayout>
    </R53Layout>
  )
}
