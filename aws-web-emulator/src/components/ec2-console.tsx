"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { CreateVpc } from "@/components/resource-forms"
import { ServiceIcon } from "@/components/service-icon"
import { Badge } from "@/components/ui/badge"
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
import { readEmulator } from "@/lib/console-client"
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
      "images",
      "volumes",
      "security-groups",
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
      "security-groups",
    ],
  },
} as const satisfies Record<string, {
  name: string
  description: string
  sections: readonly [Ec2Section, ...Ec2Section[]]
}>

export function Ec2Console({ service }: { service: keyof typeof consoles }) {
  const serviceConsole = consoles[service]
  const [section, setSection] = useState<Ec2Section>(serviceConsole.sections[0])
  const [search, setSearch] = useState("")
  const [createdVpc, setCreatedVpc] = useState<string>()
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
  const colspan = 2 + Number(Boolean(config.state)) + config.columns.length
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
                {section === "vpcs" && (
                  <CreateVpc
                    onSaved={(id) => {
                      setCreatedVpc(id ?? "created")
                      setSearch("")
                      void client.invalidateQueries({
                        queryKey: ["emulator", "ec2"],
                      })
                    }}
                  />
                )}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length && !result.error ? (
                    rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="px-4 font-medium">
                          {row.name || "—"}
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
    </>
  )
}
