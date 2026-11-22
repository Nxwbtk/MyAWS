"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { CreateVpc } from "@/components/resource-forms"
import { Phase1OperationExplorer } from "@/components/phase-1-operation-explorer"
import { ResourceDetailView } from "@/components/resource-detail-view"
import { ServiceIcon } from "@/components/service-icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { readEmulator, runEmulatorOperation } from "@/lib/console-client"
import {
  ec2SectionSchema,
  type Ec2Resource,
  type Ec2Section,
} from "@/lib/contracts"

const sections = {
  instances: {
    title: "Instances",
    id: "Instance ID",
    state: "Instance state",
    columns: [
      ["type", "Instance type"],
      ["zone", "Availability Zone"],
      ["privateIp", "Private IPv4 address"],
      ["publicIp", "Public IPv4 address"],
      ["vpcId", "VPC ID"],
    ],
  },
  "launch-templates": {
    title: "Launch templates",
    id: "Launch template ID",
    state: null,
    columns: [
      ["createdBy", "Created by"],
      ["created", "Created"],
      ["defaultVersion", "Default version"],
      ["latestVersion", "Latest version"],
    ],
  },
  "spot-requests": {
    title: "Spot requests",
    id: "Spot request ID",
    state: "State",
    columns: [
      ["type", "Request type"],
      ["instanceId", "Instance ID"],
      ["status", "Status"],
      ["validUntil", "Valid until"],
    ],
  },
  images: {
    title: "AMIs",
    id: "AMI ID",
    state: "State",
    columns: [
      ["architecture", "Architecture"],
      ["created", "Creation date"],
    ],
  },
  volumes: {
    title: "Volumes",
    id: "Volume ID",
    state: "State",
    columns: [
      ["type", "Volume type"],
      ["size", "Size (GiB)"],
      ["zone", "Availability Zone"],
      ["instanceIds", "Attached instances"],
    ],
  },
  snapshots: {
    title: "Snapshots",
    id: "Snapshot ID",
    state: "State",
    columns: [
      ["volumeId", "Volume ID"],
      ["size", "Size (GiB)"],
      ["started", "Start time"],
      ["encrypted", "Encrypted"],
    ],
  },
  "elastic-ips": {
    title: "Elastic IP addresses",
    id: "Allocation ID",
    state: null,
    columns: [
      ["domain", "Domain"],
      ["associationId", "Association ID"],
      ["instanceId", "Instance ID"],
      ["networkInterfaceId", "Network interface"],
      ["privateIp", "Private IP"],
    ],
  },
  "placement-groups": {
    title: "Placement groups",
    id: "Placement group ID",
    state: "State",
    columns: [
      ["strategy", "Strategy"],
      ["partitionCount", "Partitions"],
      ["zone", "Spread level"],
    ],
  },
  "key-pairs": {
    title: "Key pairs",
    id: "Key pair ID",
    state: null,
    columns: [
      ["type", "Key type"],
      ["fingerprint", "Fingerprint"],
    ],
  },
  "network-interfaces": {
    title: "Network interfaces",
    id: "Network interface ID",
    state: "Status",
    columns: [
      ["vpcId", "VPC ID"],
      ["subnetId", "Subnet ID"],
      ["privateIp", "Private IPv4 address"],
      ["instanceId", "Instance ID"],
    ],
  },
  vpcs: {
    title: "Your VPCs",
    id: "VPC ID",
    state: "State",
    columns: [
      ["cidr", "IPv4 CIDR"],
      ["defaultVpc", "Default VPC"],
    ],
  },
  subnets: {
    title: "Subnets",
    id: "Subnet ID",
    state: "State",
    columns: [
      ["vpcId", "VPC ID"],
      ["cidr", "IPv4 CIDR"],
      ["zone", "Availability Zone"],
    ],
  },
  "route-tables": {
    title: "Route tables",
    id: "Route table ID",
    state: null,
    columns: [
      ["vpcId", "VPC ID"],
      ["main", "Main"],
      ["routes", "Routes"],
    ],
  },
  "internet-gateways": {
    title: "Internet gateways",
    id: "Internet gateway ID",
    state: "State",
    columns: [["vpcId", "VPC ID"]],
  },
  "egress-only-gateways": {
    title: "Egress-only internet gateways",
    id: "Gateway ID",
    state: "State",
    columns: [["vpcId", "VPC ID"]],
  },
  "dhcp-options": {
    title: "DHCP option sets",
    id: "DHCP options ID",
    state: null,
    columns: [
      ["ownerId", "Owner ID"],
      ["configuration", "Configuration"],
    ],
  },
  "prefix-lists": {
    title: "Managed prefix lists",
    id: "Prefix list ID",
    state: "State",
    columns: [
      ["addressFamily", "Address family"],
      ["maxEntries", "Maximum entries"],
      ["version", "Version"],
      ["ownerId", "Owner ID"],
    ],
  },
  "vpc-endpoints": {
    title: "VPC endpoints",
    id: "Endpoint ID",
    state: "State",
    columns: [
      ["type", "Endpoint type"],
      ["vpcId", "VPC ID"],
      ["routeTables", "Route tables"],
      ["subnets", "Subnets"],
      ["privateDns", "Private DNS"],
    ],
  },
  "nat-gateways": {
    title: "NAT gateways",
    id: "NAT gateway ID",
    state: "State",
    columns: [
      ["vpcId", "VPC ID"],
      ["subnetId", "Subnet ID"],
      ["connectivityType", "Connectivity type"],
      ["publicIp", "Public IP"],
      ["privateIp", "Private IP"],
    ],
  },
  "peering-connections": {
    title: "Peering connections",
    id: "Peering connection ID",
    state: "Status",
    columns: [
      ["requesterVpcId", "Requester VPC"],
      ["accepterVpcId", "Accepter VPC"],
      ["requesterRegion", "Requester region"],
      ["accepterRegion", "Accepter region"],
    ],
  },
  "network-acls": {
    title: "Network ACLs",
    id: "Network ACL ID",
    state: null,
    columns: [
      ["vpcId", "VPC ID"],
      ["default", "Default"],
      ["entries", "Entries"],
      ["subnetAssociations", "Subnet associations"],
    ],
  },
  "security-groups": {
    title: "Security groups",
    id: "Group ID",
    state: null,
    columns: [
      ["groupName", "Group name"],
      ["vpcId", "VPC ID"],
      ["description", "Description"],
    ],
  },
} as const

const consoles = {
  ec2: {
    name: "Amazon EC2",
    description: "View compute resources in the local emulator.",
    sections: [
      "instances",
      "launch-templates",
      "spot-requests",
      "images",
      "volumes",
      "snapshots",
      "elastic-ips",
      "security-groups",
      "placement-groups",
      "key-pairs",
      "network-interfaces",
    ],
  },
  vpc: {
    name: "Amazon VPC",
    description: "View your virtual networks and their resources in the local emulator.",
    sections: [
      "vpcs",
      "subnets",
      "route-tables",
      "internet-gateways",
      "egress-only-gateways",
      "dhcp-options",
      "elastic-ips",
      "prefix-lists",
      "vpc-endpoints",
      "nat-gateways",
      "peering-connections",
      "network-acls",
      "security-groups",
    ],
  },
} as const satisfies Record<string, {
  name: string
  description: string
  sections: readonly [Ec2Section, ...Ec2Section[]]
}>

type Ec2ApiOperation = {
  operation: string
  label: string
  input: Record<string, unknown>
}

const detailOperations: Record<
  Ec2Section,
  { operation: string; input: (resource: Ec2Resource) => Record<string, unknown> }
> = {
  instances: { operation: "DescribeInstances", input: (row) => ({ InstanceIds: [row.id] }) },
  "launch-templates": { operation: "DescribeLaunchTemplates", input: (row) => ({ LaunchTemplateIds: [row.id] }) },
  "spot-requests": { operation: "DescribeSpotInstanceRequests", input: (row) => ({ SpotInstanceRequestIds: [row.id] }) },
  images: { operation: "DescribeImages", input: (row) => ({ ImageIds: [row.id] }) },
  volumes: { operation: "DescribeVolumes", input: (row) => ({ VolumeIds: [row.id] }) },
  snapshots: { operation: "DescribeSnapshots", input: (row) => ({ SnapshotIds: [row.id] }) },
  "elastic-ips": { operation: "DescribeAddresses", input: (row) => row.fields.allocationId ? { AllocationIds: [row.fields.allocationId] } : { PublicIps: [row.id] } },
  "placement-groups": { operation: "DescribePlacementGroups", input: (row) => ({ GroupIds: [row.id] }) },
  "key-pairs": { operation: "DescribeKeyPairs", input: (row) => ({ KeyPairIds: [row.id] }) },
  "network-interfaces": { operation: "DescribeNetworkInterfaces", input: (row) => ({ NetworkInterfaceIds: [row.id] }) },
  vpcs: { operation: "DescribeVpcs", input: (row) => ({ VpcIds: [row.id] }) },
  subnets: { operation: "DescribeSubnets", input: (row) => ({ SubnetIds: [row.id] }) },
  "route-tables": { operation: "DescribeRouteTables", input: (row) => ({ RouteTableIds: [row.id] }) },
  "internet-gateways": { operation: "DescribeInternetGateways", input: (row) => ({ InternetGatewayIds: [row.id] }) },
  "egress-only-gateways": { operation: "DescribeEgressOnlyInternetGateways", input: (row) => ({ EgressOnlyInternetGatewayIds: [row.id] }) },
  "dhcp-options": { operation: "DescribeDhcpOptions", input: (row) => ({ DhcpOptionsIds: [row.id] }) },
  "prefix-lists": { operation: "DescribeManagedPrefixLists", input: (row) => ({ PrefixListIds: [row.id] }) },
  "vpc-endpoints": { operation: "DescribeVpcEndpoints", input: (row) => ({ VpcEndpointIds: [row.id] }) },
  "nat-gateways": { operation: "DescribeNatGateways", input: (row) => ({ NatGatewayIds: [row.id] }) },
  "peering-connections": { operation: "DescribeVpcPeeringConnections", input: (row) => ({ VpcPeeringConnectionIds: [row.id] }) },
  "network-acls": { operation: "DescribeNetworkAcls", input: (row) => ({ NetworkAclIds: [row.id] }) },
  "security-groups": { operation: "DescribeSecurityGroups", input: (row) => ({ GroupIds: [row.id] }) },
}

const createOperations: Partial<Record<Ec2Section, { label: string; operation: string }>> = {
  instances: { label: "Launch instance", operation: "RunInstances" },
  "launch-templates": { label: "Create launch template", operation: "CreateLaunchTemplate" },
  "spot-requests": { label: "Request Spot instances", operation: "RequestSpotInstances" },
  images: { label: "Register AMI", operation: "RegisterImage" },
  volumes: { label: "Create volume", operation: "CreateVolume" },
  snapshots: { label: "Create snapshot", operation: "CreateSnapshot" },
  "elastic-ips": { label: "Allocate Elastic IP", operation: "AllocateAddress" },
  "placement-groups": { label: "Create placement group", operation: "CreatePlacementGroup" },
  "key-pairs": { label: "Create key pair", operation: "CreateKeyPair" },
  "network-interfaces": { label: "Create network interface", operation: "CreateNetworkInterface" },
  vpcs: { label: "Create VPC", operation: "CreateVpc" },
  subnets: { label: "Create subnet", operation: "CreateSubnet" },
  "route-tables": { label: "Create route table", operation: "CreateRouteTable" },
  "internet-gateways": { label: "Create internet gateway", operation: "CreateInternetGateway" },
  "egress-only-gateways": { label: "Create egress-only gateway", operation: "CreateEgressOnlyInternetGateway" },
  "dhcp-options": { label: "Create DHCP option set", operation: "CreateDhcpOptions" },
  "prefix-lists": { label: "Create managed prefix list", operation: "CreateManagedPrefixList" },
  "vpc-endpoints": { label: "Create VPC endpoint", operation: "CreateVpcEndpoint" },
  "nat-gateways": { label: "Create NAT gateway", operation: "CreateNatGateway" },
  "peering-connections": { label: "Create peering connection", operation: "CreateVpcPeeringConnection" },
  "network-acls": { label: "Create network ACL", operation: "CreateNetworkAcl" },
  "security-groups": { label: "Create security group", operation: "CreateSecurityGroup" },
}

function rowOperations(section: Ec2Section, row: Ec2Resource): Ec2ApiOperation[] {
  const id = row.id
  switch (section) {
    case "instances":
      return ["Start", "Stop", "Reboot", "Terminate"].map((verb) => ({
        label: `${verb} instance`,
        operation: `${verb}Instances`,
        input: { InstanceIds: [id] },
      }))
    case "spot-requests": return [{ label: "Cancel request", operation: "CancelSpotInstanceRequests", input: { SpotInstanceRequestIds: [id] } }]
    case "images": return [{ label: "Deregister AMI", operation: "DeregisterImage", input: { ImageId: id } }]
    case "volumes": return [
      { label: "Create snapshot", operation: "CreateSnapshot", input: { VolumeId: id } },
      { label: "Delete volume", operation: "DeleteVolume", input: { VolumeId: id } },
    ]
    case "snapshots": return [{ label: "Delete snapshot", operation: "DeleteSnapshot", input: { SnapshotId: id } }]
    case "elastic-ips": return [{ label: "Release address", operation: "ReleaseAddress", input: row.fields.allocationId ? { AllocationId: row.fields.allocationId } : { PublicIp: id } }]
    case "placement-groups": return [{ label: "Delete placement group", operation: "DeletePlacementGroup", input: { GroupName: row.name } }]
    case "key-pairs": return [{ label: "Delete key pair", operation: "DeleteKeyPair", input: { KeyPairId: id } }]
    case "network-interfaces": return [{ label: "Delete interface", operation: "DeleteNetworkInterface", input: { NetworkInterfaceId: id } }]
    case "vpcs": return [{ label: "Delete VPC", operation: "DeleteVpc", input: { VpcId: id } }]
    case "subnets": return [{ label: "Delete subnet", operation: "DeleteSubnet", input: { SubnetId: id } }]
    case "route-tables": return [{ label: "Delete route table", operation: "DeleteRouteTable", input: { RouteTableId: id } }]
    case "internet-gateways": return [
      { label: "Detach gateway", operation: "DetachInternetGateway", input: { InternetGatewayId: id, VpcId: row.fields.vpcId ?? "" } },
      { label: "Delete gateway", operation: "DeleteInternetGateway", input: { InternetGatewayId: id } },
    ]
    case "egress-only-gateways": return [{ label: "Delete gateway", operation: "DeleteEgressOnlyInternetGateway", input: { EgressOnlyInternetGatewayId: id } }]
    case "dhcp-options": return [{ label: "Delete option set", operation: "DeleteDhcpOptions", input: { DhcpOptionsId: id } }]
    case "prefix-lists": return [{ label: "Delete prefix list", operation: "DeleteManagedPrefixList", input: { PrefixListId: id } }]
    case "vpc-endpoints": return [{ label: "Delete endpoint", operation: "DeleteVpcEndpoints", input: { VpcEndpointIds: [id] } }]
    case "nat-gateways": return [{ label: "Delete NAT gateway", operation: "DeleteNatGateway", input: { NatGatewayId: id } }]
    case "peering-connections": return [
      { label: "Accept request", operation: "AcceptVpcPeeringConnection", input: { VpcPeeringConnectionId: id } },
      { label: "Reject request", operation: "RejectVpcPeeringConnection", input: { VpcPeeringConnectionId: id } },
      { label: "Delete connection", operation: "DeleteVpcPeeringConnection", input: { VpcPeeringConnectionId: id } },
    ]
    case "network-acls": return [{ label: "Delete network ACL", operation: "DeleteNetworkAcl", input: { NetworkAclId: id } }]
    case "security-groups": return [{ label: "Delete security group", operation: "DeleteSecurityGroup", input: { GroupId: id } }]
  }
  return []
}

export function Ec2Console({ service }: { service: keyof typeof consoles }) {
  const serviceConsole = consoles[service]
  const [section, setSection] = useState<Ec2Section>(serviceConsole.sections[0])
  const [search, setSearch] = useState("")
  const [createdVpc, setCreatedVpc] = useState<string>()
  const [selectedResource, setSelectedResource] = useState<{ section: Ec2Section; resource: Ec2Resource }>()
  const [selectedAction, setSelectedAction] = useState<Ec2ApiOperation>()
  const client = useQueryClient()
  const config = sections[section]
  const result = useQuery({
    queryKey: ["emulator", "ec2", section],
    queryFn: ({ signal }) =>
      readEmulator<Ec2Resource[]>("ec2", { section }, signal),
  })
  const term = search.trim().toLowerCase()
  const rows =
    result.data?.filter(({ name, id, state, fields }) =>
      [name, id, state, ...Object.values(fields)].some((value) =>
        value?.toLowerCase().includes(term),
      ),
    ) ?? []
  const notice = section === "vpcs" && createdVpc
  const selected = selectedResource?.section === section ? selectedResource.resource : undefined
  const detailSpec = selected ? detailOperations[section] : undefined
  const detailQuery = useQuery({
    queryKey: ["emulator", "ec2-detail", section, selected?.id],
    queryFn: ({ signal }) => {
      if (!selected || !detailSpec) throw new Error("Select a resource first.")
      return runEmulatorOperation("ec2", detailSpec.operation, detailSpec.input(selected), signal)
    },
    enabled: Boolean(selected && detailSpec),
  })
  const createAction = createOperations[section]
  const colspan = 3 + Number(Boolean(config.state)) + config.columns.length
  const resourceLabel =
    section === "vpcs" ? "VPCs" : section === "images" ? "AMIs" : config.title.toLowerCase()
  const feedback = result.isPending
    ? "Loading resources…"
    : (result.error?.message ??
      (term
        ? "No matching resources."
        : section === "images"
          ? "No AMIs owned by this account."
          : `No ${resourceLabel} found.`))
  const filterLabel = `Filter ${resourceLabel}`

  return (
    <>
      <section className="flex flex-wrap items-center gap-3.5">
        <ServiceIcon id={service} className="size-10" />
        <div>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
            {serviceConsole.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {serviceConsole.description}
          </p>
        </div>
        {service === "ec2" && (
          <Link
            href="/vpc"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline sm:ml-auto"
          >
            Open Amazon VPC
          </Link>
        )}
      </section>

      <Tabs
        value={section}
        onValueChange={(value) => {
          setSection(ec2SectionSchema.parse(value))
          setSearch("")
          setSelectedResource(undefined)
          setSelectedAction(undefined)
        }}
      >
        <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
          {serviceConsole.sections.map((id) => (
            <TabsTrigger key={id} value={id}>
              {sections[id].title}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={section}>
          <Card className="gap-0 rounded-xl border py-0 ring-0">
            <CardHeader className="gap-3 border-b bg-surface-subtle px-4 py-3.5 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  {config.title}
                  {result.data && (
                    <Badge variant="secondary">{result.data.length}</Badge>
                  )}
                </h2>
                {section === "images" && <Badge variant="outline">Owned by me</Badge>}
                {section === "vpcs" ? (
                  <CreateVpc
                    onSaved={(id) => {
                      setCreatedVpc(id ?? "created")
                      setSearch("")
                      void client.invalidateQueries({ queryKey: ["emulator", "ec2"] })
                    }}
                  />
                ) : createAction ? (
                  <Button
                    size="sm"
                    onClick={() => setSelectedAction({ operation: createAction.operation, label: createAction.label, input: {} })}
                  >
                    {createAction.label}
                  </Button>
                ) : null}
              </div>
              <div className="relative max-w-md">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  className="pl-8"
                  placeholder={filterLabel}
                  aria-label={filterLabel}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {notice && (
                <p
                  role="status"
                  className="m-3 rounded-lg bg-success-muted px-3 py-2 font-medium text-success"
                >
                  {createdVpc === "created"
                    ? "VPC created."
                    : `VPC ${createdVpc} created.`}
                </p>
              )}
              <Table>
                <TableHeader className="bg-surface-subtle">
                  <TableRow>
                    <TableHead className="px-4">Name</TableHead>
                    <TableHead>{config.id}</TableHead>
                    {config.state && <TableHead>{config.state}</TableHead>}
                    {config.columns.map(([key, label]) => (
                      <TableHead key={key}>{label}</TableHead>
                    ))}
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length && !result.error ? (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="px-4 font-medium">
                          <Button
                            variant="link"
                            className="h-auto px-0 py-1 text-link"
                            aria-pressed={selected?.id === row.id}
                            onClick={() => setSelectedResource({ section, resource: row })}
                          >
                            {row.name || row.id}
                          </Button>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.id}
                        </TableCell>
                        {config.state && (
                          <TableCell>
                            {row.state ? (
                              <Badge
                                variant="secondary"
                                className={
                                  ["running", "available"].includes(row.state)
                                    ? "bg-success-muted text-success"
                                    : undefined
                                }
                              >
                                {row.state}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        )}
                        {config.columns.map(([key]) => (
                          <TableCell key={key}>
                            {row.fields[key] ?? "—"}
                          </TableCell>
                        ))}
                        <TableCell>
                          <div className="flex max-w-64 flex-wrap gap-1">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setSelectedResource({ section, resource: row })}
                            >
                              Details
                            </Button>
                            {rowOperations(section, row).map((action) => (
                              <Button
                                key={action.operation}
                                size="xs"
                                variant={/^(Delete|Terminate|Stop|Cancel|Release|Deregister|Reject)/.test(action.operation) ? "destructive" : "outline"}
                                onClick={() => setSelectedAction(action)}
                              >
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={colspan}
                        className="px-4 py-7 text-center text-muted-foreground"
                      >
                        <span
                          role={result.error ? "alert" : "status"}
                          className={result.error ? "text-destructive" : ""}
                        >
                          {feedback}
                        </span>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {selected && (
        <Card className="gap-0 rounded-xl border py-0 ring-0">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface-subtle px-4 py-3.5 sm:px-5">
            <div>
              <h2 className="font-semibold">{config.title} details</h2>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{selected.id}</p>
            </div>
            <Button variant="outline" size="sm" disabled={detailQuery.isFetching} onClick={() => void detailQuery.refetch()}>
              {detailQuery.isFetching ? "Refreshing…" : "Refresh details"}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 sm:p-5">
            {detailQuery.error ? (
              <p role="alert" className="text-sm text-destructive">{detailQuery.error.message}</p>
            ) : detailQuery.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">Loading full resource details…</p>
            ) : (
              <ResourceDetailView value={detailQuery.data} />
            )}
          </CardContent>
        </Card>
      )}
      <Phase1OperationExplorer
        key={`${service}:${selectedAction?.operation ?? "all"}:${JSON.stringify(selectedAction?.input ?? {})}`}
        service={service}
        initialModel="ec2"
        initialOperation={selectedAction?.operation}
        initialValues={selectedAction?.input}
        startExpanded={Boolean(selectedAction)}
      />
    </>
  )
}
