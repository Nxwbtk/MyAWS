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
import Table from "@cloudscape-design/components/table"
import { useQuery } from "@tanstack/react-query"
import { useFollow } from "@/components/shell/page-layout"
import { Ec2Layout } from "@/components/ec2/ec2-app"
import { callAws } from "@/lib/aws"
import { healthQuery } from "@/lib/console-client"
import { regionName } from "@/lib/service-meta"

type Count = { label: string; href: string; operation: string; key: string; model?: string; input?: Record<string, unknown>; count?: (page: Record<string, unknown[]>) => number }

const counts: Count[] = [
  { label: "Instances (running)", href: "/ec2/instances", operation: "DescribeInstances", key: "Reservations", input: { Filters: [{ Name: "instance-state-name", Values: ["running"] }] }, count: (page) => (page.Reservations as { Instances?: unknown[] }[]).reduce((t, r) => t + (r.Instances?.length ?? 0), 0) },
  { label: "Auto Scaling Groups", href: "/autoscaling", operation: "DescribeAutoScalingGroups", key: "AutoScalingGroups", model: "autoscaling" },
  { label: "Capacity Reservations", href: "/ec2/capacity-reservations", operation: "DescribeCapacityReservations", key: "CapacityReservations" },
  { label: "Dedicated Hosts", href: "/ec2/hosts", operation: "DescribeHosts", key: "Hosts" },
  { label: "Elastic IPs", href: "/ec2/addresses", operation: "DescribeAddresses", key: "Addresses" },
  { label: "Instances", href: "/ec2/instances", operation: "DescribeInstances", key: "Reservations", count: (page) => (page.Reservations as { Instances?: unknown[] }[]).reduce((t, r) => t + (r.Instances?.length ?? 0), 0) },
  { label: "Key pairs", href: "/ec2/key-pairs", operation: "DescribeKeyPairs", key: "KeyPairs" },
  { label: "Load balancers", href: "/elasticloadbalancing", operation: "DescribeLoadBalancers", key: "LoadBalancers", model: "elasticloadbalancingv2" },
  { label: "Placement groups", href: "/ec2/placement-groups", operation: "DescribePlacementGroups", key: "PlacementGroups" },
  { label: "Security groups", href: "/ec2/security-groups", operation: "DescribeSecurityGroups", key: "SecurityGroups" },
  { label: "Snapshots", href: "/ec2/snapshots", operation: "DescribeSnapshots", key: "Snapshots", input: { OwnerIds: ["self"] } },
  { label: "Volumes", href: "/ec2/volumes", operation: "DescribeVolumes", key: "Volumes" },
]

export function Ec2Dashboard() {
  const follow = useFollow()
  const health = useQuery(healthQuery)
  const region = health.data?.region ?? "ap-southeast-7"
  const resources = useQuery({
    queryKey: ["emulator", "ec2", "dashboard"],
    enabled: health.data?.connected === true,
    queryFn: () =>
      Promise.all(
        counts.map(async (entry) => {
          try {
            const page = await callAws<Record<string, unknown[]>>(entry.model ?? "ec2", entry.operation, entry.input ?? {})
            return entry.count ? entry.count(page) : (page[entry.key] ?? []).length
          } catch {
            return undefined
          }
        }),
      ),
  })
  const zones = useQuery({
    queryKey: ["emulator", "aws", "ec2", "DescribeAvailabilityZones", "dash"],
    queryFn: async () => (await callAws<{ AvailabilityZones?: { ZoneName?: string; ZoneId?: string }[] }>("ec2", "DescribeAvailabilityZones", {})).AvailabilityZones ?? [],
  })
  const vpc = useQuery({
    queryKey: ["emulator", "aws", "ec2", "DescribeAccountAttributes"],
    queryFn: async () => (await callAws<{ AccountAttributes?: { AttributeName?: string; AttributeValues?: { AttributeValue?: string }[] }[] }>("ec2", "DescribeAccountAttributes", {})).AccountAttributes ?? [],
  })
  const defaultVpc = vpc.data?.find((attr) => attr.AttributeName === "default-vpc")?.AttributeValues?.[0]?.AttributeValue
  const regionShort = regionName(region).replace(/^.*\((.*)\)$/, "$1")
  return (
    <Ec2Layout breadcrumbs={[{ text: "Dashboard", href: "/ec2" }]} contentType="dashboard">
      <ContentLayout header={<Header variant="h1">Dashboard</Header>}>
        <Grid gridDefinition={[{ colspan: { default: 12, m: 8 } }, { colspan: { default: 12, m: 4 } }]}>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2" description={`You are using the following Amazon EC2 resources in the ${regionName(region).replace(/ \(.*\)$/, "")} (${regionShort}) Region:`} actions={<Button iconName="refresh" ariaLabel="Refresh" loading={resources.isFetching} onClick={() => void resources.refetch()} />}>Resources</Header>}>
              <ColumnLayout columns={3} variant="text-grid">
                {counts.map((entry, index) => (
                  <div key={entry.label}>
                    <Link href={entry.href} onFollow={follow}>{entry.label}</Link>
                    <Box fontSize="heading-l" fontWeight="bold">{resources.isPending ? "…" : (resources.data?.[index] ?? "–")}</Box>
                  </div>
                ))}
              </ColumnLayout>
            </Container>
            <Grid gridDefinition={[{ colspan: 6 }, { colspan: 6 }]}>
              <Container header={<Header variant="h2">Launch instance</Header>}>
                <SpaceBetween size="s">
                  <Box>To get started, launch an Amazon EC2 instance, which is a virtual server in the cloud.</Box>
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button variant="primary" href="/ec2/launch-instance" onFollow={follow}>Launch instance</Button>
                    <Button disabled disabledReason="AWS Application Migration Service is not available in the local emulator.">Migrate a server</Button>
                  </SpaceBetween>
                  <Box variant="small">Note: Your instances will launch in the {regionName(region).replace(/ \(.*\)$/, "")} ({regionShort}) Region</Box>
                </SpaceBetween>
              </Container>
              <Container header={<Header variant="h2" actions={<Button href="/cloudwatch" onFollow={follow}>View in CloudWatch</Button>}>Instance alarms</Header>}>
                <ColumnLayout columns={3} variant="text-grid">
                  <div><Box variant="awsui-key-label">In alarm</Box><Box fontSize="heading-l">0</Box></div>
                  <div><Box variant="awsui-key-label">OK</Box><Box fontSize="heading-l">0</Box></div>
                  <div><Box variant="awsui-key-label">Insufficient data</Box><Box fontSize="heading-l">0</Box></div>
                </ColumnLayout>
              </Container>
            </Grid>
            <Container header={<Header variant="h2">Service health</Header>}>
              <Table
                variant="embedded"
                items={[{ region: regionName(region) }]}
                columnDefinitions={[
                  { id: "region", header: "Region", cell: (row) => row.region },
                  { id: "status", header: "Status", cell: () => <StatusIndicator type={health.data?.connected ? "success" : "warning"}>{health.data?.connected ? "This service is operating normally." : "Local emulator API is offline."}</StatusIndicator> },
                ]}
              />
              <Box margin={{ top: "m" }}>
                <Table
                  variant="embedded"
                  header={<Header variant="h3" actions={<Button disabled disabledReason="Not available in the local emulator.">Enable additional Zones</Button>}>Zones</Header>}
                  items={zones.data ?? []}
                  columnDefinitions={[
                    { id: "name", header: "Zone name", cell: (zone) => zone.ZoneName },
                    { id: "id", header: "Zone ID", cell: (zone) => zone.ZoneId },
                  ]}
                />
              </Box>
            </Container>
          </SpaceBetween>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Account attributes</Header>}>
              <SpaceBetween size="xs">
                <Box variant="awsui-key-label">Default VPC</Box>
                {defaultVpc ? <Link href={`/vpc/vpcs/${defaultVpc}`} onFollow={follow}>{defaultVpc}</Link> : <Box>–</Box>}
                <Box variant="h4">Settings</Box>
                {["Data protection and security", "Allowed AMIs", "Zones", "EC2 Serial Console", "Default credit specification", "Managed resources", "EC2 console preferences"].map((label) => (
                  <Link key={label} href="/ec2/settings" onFollow={follow}>{label}</Link>
                ))}
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">EC2 cost</Header>}>
              <Box color="text-status-inactive">Cost data is not available in the local emulator.</Box>
            </Container>
            <Container header={<Header variant="h2">Additional information</Header>}>
              <SpaceBetween size="xs">
                <Link external href="https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html">Getting started guide</Link>
                <Link external href="https://docs.aws.amazon.com/ec2/">Documentation</Link>
                <Link href="/ec2/instances" onFollow={follow}>All EC2 resources</Link>
                <Link external href="https://aws.amazon.com/ec2/pricing/">Pricing</Link>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Grid>
      </ContentLayout>
    </Ec2Layout>
  )
}
