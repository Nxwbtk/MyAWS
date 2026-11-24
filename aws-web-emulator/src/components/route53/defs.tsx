"use client"

import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Multiselect from "@cloudscape-design/components/multiselect"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Textarea from "@cloudscape-design/components/textarea"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { CodeView, pretty } from "@/components/console/sections"
import { Copyable, State, dash, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { R53Layout } from "@/components/route53/r53-app"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

const s = (v: unknown) => (v === undefined || v === null ? undefined : String(v))
const o = (v: unknown) => (v as Item | undefined) ?? {}
const col = (id: string, label: string, get: (i: Item) => unknown) => ({ id, label, value: (i: Item) => dash(get(i)), sort: (i: Item) => s(get(i)) })
const state = (key: string) => ({ id: "state", label: "Status", value: (i: Item) => <State value={i[key]} />, sort: (i: Item) => s(i[key]) })
const base = { tagResource: false } as const

const healthChecks: ResourceDef = {
  ...base,
  path: "/route53/health-checks",
  title: "Health checks",
  singular: "health check",
  model: "route53",
  operation: "ListHealthChecks",
  items: (p) => (p.HealthChecks as Item[]) ?? [],
  key: (i) => s(i.Id) ?? "",
  columns: [
    col("id", "ID", (i) => i.Id),
    col("name", "Name", (i) => o(i.HealthCheckConfig).FullyQualifiedDomainName ?? o(i.HealthCheckConfig).IPAddress),
    col("type", "Type", (i) => o(i.HealthCheckConfig).Type),
    col("port", "Port", (i) => o(i.HealthCheckConfig).Port),
    col("path", "Path", (i) => o(i.HealthCheckConfig).ResourcePath),
    col("interval", "Request interval", (i) => o(i.HealthCheckConfig).RequestInterval),
  ],
  details: [
    { label: "Health check ID", value: (i) => <Copyable value={s(i.Id)} /> },
    { label: "Endpoint", value: (i) => dash(o(i.HealthCheckConfig).FullyQualifiedDomainName ?? o(i.HealthCheckConfig).IPAddress) },
    { label: "Protocol", value: (i) => dash(o(i.HealthCheckConfig).Type) },
    { label: "Port", value: (i) => dash(o(i.HealthCheckConfig).Port) },
    { label: "Path", value: (i) => dash(o(i.HealthCheckConfig).ResourcePath) },
    { label: "Request interval", value: (i) => `${o(i.HealthCheckConfig).RequestInterval ?? 30} seconds` },
    { label: "Failure threshold", value: (i) => dash(o(i.HealthCheckConfig).FailureThreshold) },
    { label: "Version", value: (i) => dash(i.HealthCheckVersion) },
  ],
  create: { label: "Create health check", href: "/route53/health-checks/create" },
  deleteAction: { operation: "DeleteHealthCheck", input: (i) => ({ HealthCheckId: i.Id }) },
}

const resolverEndpoint = (direction: "INBOUND" | "OUTBOUND", path: string, title: string): ResourceDef => ({
  ...base,
  path,
  title,
  singular: "endpoint",
  model: "route53resolver",
  operation: "ListResolverEndpoints",
  input: { Filters: [{ Name: "Direction", Values: [direction] }] },
  items: (p) => (p.ResolverEndpoints as Item[]) ?? [],
  key: (i) => s(i.Id) ?? "",
  display: (i) => s(i.Name) ?? s(i.Id) ?? "",
  columns: [col("name", "Name", (i) => i.Name), col("id", "ID", (i) => i.Id), state("Status"), col("vpc", "VPC", (i) => i.HostVPCId), col("ips", "IP addresses", (i) => i.IpAddressCount), col("type", "Endpoint type", (i) => i.ResolverEndpointType), col("created", "Creation time", (i) => consoleDate(s(i.CreationTime)))],
  details: [
    { label: "ID", value: (i) => <Copyable value={s(i.Id)} /> },
    { label: "ARN", value: (i) => <Copyable value={s(i.Arn)} /> },
    { label: "Status", value: (i) => <State value={i.Status} /> },
    { label: "Status message", value: (i) => dash(i.StatusMessage) },
    { label: "VPC", value: (i) => dash(i.HostVPCId) },
    { label: "Security groups", value: (i) => dash((i.SecurityGroupIds as string[] | undefined)?.join(", ")) },
    { label: "Protocols", value: (i) => dash((i.Protocols as string[] | undefined)?.join(", ")) },
  ],
  tabs: [{ id: "ips", label: "IP addresses", render: (i) => <EndpointIps id={s(i.Id) ?? ""} /> }],
  create: { label: "Create endpoint", href: `${path}/create` },
  deleteAction: { operation: "DeleteResolverEndpoint", input: (i) => ({ ResolverEndpointId: i.Id }) },
})

function EndpointIps({ id }: { id: string }) {
  const ips = useAws<{ IpAddresses?: Item[] }>("route53resolver", "ListResolverEndpointIpAddresses", { ResolverEndpointId: id })
  return <CodeView value={pretty(ips.data?.IpAddresses ?? [])} />
}

const rules: ResourceDef = {
  ...base,
  path: "/route53/rules",
  title: "Rules",
  singular: "rule",
  model: "route53resolver",
  operation: "ListResolverRules",
  items: (p) => (p.ResolverRules as Item[]) ?? [],
  key: (i) => s(i.Id) ?? "",
  display: (i) => s(i.Name) ?? s(i.Id) ?? "",
  columns: [col("name", "Name", (i) => i.Name), col("id", "ID", (i) => i.Id), state("Status"), col("domain", "Domain name", (i) => i.DomainName), col("type", "Type", (i) => i.RuleType), col("endpoint", "Outbound endpoint", (i) => i.ResolverEndpointId), col("owner", "Owner", (i) => i.OwnerId)],
  details: [
    { label: "ID", value: (i) => <Copyable value={s(i.Id)} /> },
    { label: "ARN", value: (i) => <Copyable value={s(i.Arn)} /> },
    { label: "Domain name", value: (i) => dash(i.DomainName) },
    { label: "Rule type", value: (i) => dash(i.RuleType) },
    { label: "Outbound endpoint", value: (i) => dash(i.ResolverEndpointId) },
    { label: "Target IP addresses", value: (i) => dash((i.TargetIps as Item[] | undefined)?.map((t) => `${t.Ip}:${t.Port ?? 53}`).join(", ")) },
    { label: "Sharing status", value: (i) => dash(i.ShareStatus) },
  ],
  tabs: [{ id: "vpcs", label: "Associated VPCs", render: (i) => <RuleVpcs id={s(i.Id) ?? ""} /> }],
  create: { label: "Create rule", href: "/route53/rules/create" },
  deleteAction: { operation: "DeleteResolverRule", input: (i) => ({ ResolverRuleId: i.Id }) },
}

function RuleVpcs({ id }: { id: string }) {
  const assoc = useAws<{ ResolverRuleAssociations?: Item[] }>("route53resolver", "ListResolverRuleAssociations", { Filters: [{ Name: "ResolverRuleId", Values: [id] }] })
  const vpcs = useAws<{ Vpcs?: { VpcId?: string }[] }>("ec2", "DescribeVpcs", {})
  const [vpc, setVpc] = useState("")
  return (
    <SpaceBetween size="m">
      <CodeView value={pretty(assoc.data?.ResolverRuleAssociations ?? [])} empty="No associated VPCs" />
      <SpaceBetween direction="horizontal" size="xs">
        <Select selectedOption={vpc ? { value: vpc, label: vpc } : null} placeholder="Choose VPC" onChange={({ detail }) => setVpc(detail.selectedOption.value ?? "")} options={(vpcs.data?.Vpcs ?? []).map((v) => ({ value: v.VpcId ?? "", label: v.VpcId }))} />
        <Button disabled={!vpc} onClick={async () => { await callAws("route53resolver", "AssociateResolverRule", { ResolverRuleId: id, VPCId: vpc }).then(() => { flash.success("VPC associated."); void assoc.refetch() }, (e) => flash.error(errorMessage(e))) }}>Associate VPC</Button>
      </SpaceBetween>
    </SpaceBetween>
  )
}

const queryLogging: ResourceDef = {
  ...base,
  path: "/route53/query-logging",
  title: "Query logging configurations",
  singular: "query logging configuration",
  model: "route53resolver",
  operation: "ListResolverQueryLogConfigs",
  items: (p) => (p.ResolverQueryLogConfigs as Item[]) ?? [],
  key: (i) => s(i.Id) ?? "",
  display: (i) => s(i.Name) ?? "",
  columns: [col("name", "Name", (i) => i.Name), col("id", "ID", (i) => i.Id), state("Status"), col("dest", "Destination", (i) => i.DestinationArn), col("vpcs", "VPCs", (i) => i.AssociationCount), col("created", "Creation time", (i) => consoleDate(s(i.CreationTime)))],
  details: [
    { label: "ID", value: (i) => <Copyable value={s(i.Id)} /> },
    { label: "ARN", value: (i) => <Copyable value={s(i.Arn)} /> },
    { label: "Destination", value: (i) => dash(i.DestinationArn) },
    { label: "Associated VPCs", value: (i) => dash(i.AssociationCount) },
  ],
  create: { label: "Configure query logging", href: "/route53/query-logging/create" },
  deleteAction: { operation: "DeleteResolverQueryLogConfig", input: (i) => ({ ResolverQueryLogConfigId: i.Id }) },
}

const resolverVpcs: ResourceDef = {
  ...base,
  path: "/route53/resolver-vpcs",
  title: "VPCs",
  singular: "VPC",
  model: "route53resolver",
  operation: "ListResolverConfigs",
  items: (p) => (p.ResolverConfigs as Item[]) ?? [],
  key: (i) => s(i.ResourceId) ?? "",
  noDetailPage: true,
  columns: [col("vpc", "VPC ID", (i) => i.ResourceId), col("autodefined", "Autodefined reverse DNS rules", (i) => i.AutodefinedReverse), col("owner", "Owner", (i) => i.OwnerId)],
  details: [],
}

const profiles: ResourceDef = {
  ...base,
  path: "/route53/profiles",
  title: "Profiles",
  singular: "profile",
  model: "route53profiles",
  operation: "ListProfiles",
  items: (p) => (p.ProfileSummaries as Item[]) ?? [],
  key: (i) => s(i.Id) ?? "",
  display: (i) => s(i.Name) ?? "",
  columns: [col("name", "Name", (i) => i.Name), col("id", "ID", (i) => i.Id), col("share", "Sharing status", (i) => i.ShareStatus), col("arn", "ARN", (i) => i.Arn)],
  details: [{ label: "ID", value: (i) => <Copyable value={s(i.Id)} /> }, { label: "ARN", value: (i) => <Copyable value={s(i.Arn)} /> }, { label: "Sharing status", value: (i) => dash(i.ShareStatus) }],
  create: { label: "Create profile", href: "/route53/profiles/create" },
  deleteAction: { operation: "DeleteProfile", input: (i) => ({ ProfileId: i.Id }) },
}

const globalResolvers: ResourceDef = {
  ...base,
  path: "/route53/global-resolvers",
  title: "Global resolvers",
  singular: "global resolver",
  model: "route53globalresolver",
  operation: "ListGlobalResolvers",
  items: (p) => (p.globalResolvers as Item[]) ?? (p.GlobalResolvers as Item[]) ?? [],
  key: (i) => s(i.id ?? i.Id) ?? "",
  display: (i) => s(i.name ?? i.Name) ?? "",
  noDetailPage: true,
  columns: [col("name", "Name", (i) => i.name ?? i.Name), col("id", "ID", (i) => i.id ?? i.Id), col("status", "Status", (i) => i.status ?? i.Status)],
  details: [],
}

const domains: ResourceDef = {
  ...base,
  path: "/route53/registered-domains",
  title: "Registered domains",
  singular: "domain",
  model: "route53domains",
  operation: "ListDomains",
  items: (p) => (p.Domains as Item[]) ?? [],
  key: (i) => s(i.DomainName) ?? "",
  columns: [col("name", "Domain name", (i) => i.DomainName), col("renew", "Auto-renew", (i) => (i.AutoRenew ? "On" : "Off")), col("lock", "Transfer lock", (i) => (i.TransferLock ? "On" : "Off")), col("expiry", "Expiration date", (i) => consoleDate(s(i.Expiry)))],
  details: [{ label: "Domain name", value: (i) => dash(i.DomainName) }, { label: "Auto-renew", value: (i) => (i.AutoRenew ? "On" : "Off") }, { label: "Transfer lock", value: (i) => (i.TransferLock ? "On" : "Off") }, { label: "Expiration date", value: (i) => consoleDate(s(i.Expiry)) }],
  create: { label: "Register domains", href: "/route53/registered-domains/create" },
}

const requests: ResourceDef = {
  ...base,
  path: "/route53/requests",
  title: "Requests",
  singular: "request",
  model: "route53domains",
  operation: "ListOperations",
  items: (p) => (p.Operations as Item[]) ?? [],
  key: (i) => s(i.OperationId) ?? "",
  noDetailPage: true,
  columns: [col("domain", "Domain name", (i) => i.DomainName), col("type", "Type", (i) => i.Type), state("Status"), col("submitted", "Submitted", (i) => consoleDate(s(i.SubmittedDate)))],
  details: [],
}

const cidrCollections: ResourceDef = {
  ...base,
  path: "/route53/cidr-collections",
  title: "CIDR collections",
  singular: "CIDR collection",
  model: "route53",
  operation: "ListCidrCollections",
  items: (p) => (p.CidrCollections as Item[]) ?? [],
  key: (i) => s(i.Id) ?? "",
  display: (i) => s(i.Name) ?? "",
  columns: [col("name", "Name", (i) => i.Name), col("id", "ID", (i) => i.Id), col("version", "Version", (i) => i.Version)],
  details: [{ label: "ID", value: (i) => <Copyable value={s(i.Id)} /> }, { label: "ARN", value: (i) => <Copyable value={s(i.Arn)} /> }, { label: "Version", value: (i) => dash(i.Version) }],
  tabs: [{ id: "locations", label: "Locations", render: (i) => <CidrLocations id={s(i.Id) ?? ""} /> }],
  create: { label: "Create CIDR collection", href: "/route53/cidr-collections/create" },
  deleteAction: { operation: "DeleteCidrCollection", input: (i) => ({ Id: i.Id }) },
}

function CidrLocations({ id }: { id: string }) {
  const locations = useAws<{ CidrLocations?: { LocationName?: string }[] }>("route53", "ListCidrLocations", { CollectionId: id })
  const [loc, setLoc] = useState({ name: "", cidrs: "" })
  return (
    <SpaceBetween size="m">
      <CodeView value={(locations.data?.CidrLocations ?? []).map((l) => l.LocationName).join("\n")} empty="No locations" />
      <SpaceBetween direction="horizontal" size="xs">
        <Input value={loc.name} placeholder="Location name" onChange={({ detail }) => setLoc({ ...loc, name: detail.value })} />
        <Input value={loc.cidrs} placeholder="10.0.0.0/24, 10.1.0.0/24" onChange={({ detail }) => setLoc({ ...loc, cidrs: detail.value })} />
        <Button
          disabled={!loc.name || !loc.cidrs}
          onClick={async () => {
            const current = await callAws<{ Version?: number }>("route53", "ListCidrCollections", {}).then((r) => ((r as Item).CidrCollections as Item[] | undefined)?.find((c) => c.Id === id))
            await callAws("route53", "ChangeCidrCollection", { Id: id, CollectionVersion: (current as Item | undefined)?.Version, Changes: [{ LocationName: loc.name, Action: "PUT", CidrList: loc.cidrs.split(/[\s,]+/).filter(Boolean) }] }).then(() => { flash.success("Location added."); setLoc({ name: "", cidrs: "" }); void locations.refetch() }, (e) => flash.error(errorMessage(e)))
          }}
        >
          Add location
        </Button>
      </SpaceBetween>
    </SpaceBetween>
  )
}

const trafficPolicies: ResourceDef = {
  ...base,
  path: "/route53/traffic-policies",
  title: "Traffic policies",
  singular: "traffic policy",
  model: "route53",
  operation: "ListTrafficPolicies",
  items: (p) => (p.TrafficPolicySummaries as Item[]) ?? [],
  key: (i) => s(i.Id) ?? "",
  display: (i) => s(i.Name) ?? "",
  columns: [col("name", "Policy name", (i) => i.Name), col("type", "DNS type", (i) => i.Type), col("latest", "Latest version", (i) => i.LatestVersion), col("count", "Version count", (i) => i.TrafficPolicyCount)],
  details: [{ label: "ID", value: (i) => <Copyable value={s(i.Id)} /> }, { label: "DNS type", value: (i) => dash(i.Type) }, { label: "Latest version", value: (i) => dash(i.LatestVersion) }],
  tabs: [{ id: "document", label: "Policy document", render: (i) => <TrafficDocument id={s(i.Id) ?? ""} version={Number(i.LatestVersion ?? 1)} /> }],
  create: { label: "Create traffic policy", href: "/route53/traffic-policies/create" },
  deleteAction: { operation: "DeleteTrafficPolicy", input: (i) => ({ Id: i.Id, Version: i.LatestVersion }) },
}

function TrafficDocument({ id, version }: { id: string; version: number }) {
  const policy = useAws<{ TrafficPolicy?: { Document?: string } }>("route53", "GetTrafficPolicy", { Id: id, Version: version })
  return <CodeView value={pretty(policy.data?.TrafficPolicy?.Document)} />
}

const policyRecords: ResourceDef = {
  ...base,
  path: "/route53/policy-records",
  title: "Policy records",
  singular: "policy record",
  model: "route53",
  operation: "ListTrafficPolicyInstances",
  items: (p) => (p.TrafficPolicyInstances as Item[]) ?? [],
  key: (i) => s(i.Id) ?? "",
  display: (i) => s(i.Name) ?? "",
  noDetailPage: true,
  columns: [col("name", "DNS name", (i) => i.Name), col("policy", "Traffic policy", (i) => i.TrafficPolicyId), col("version", "Version", (i) => i.TrafficPolicyVersion), state("State"), col("ttl", "TTL", (i) => i.TTL)],
  details: [],
  deleteAction: { operation: "DeleteTrafficPolicyInstance", input: (i) => ({ Id: i.Id }) },
}

export const r53Defs: Record<string, ResourceDef> = {
  "health-checks": healthChecks,
  "inbound-endpoints": resolverEndpoint("INBOUND", "/route53/inbound-endpoints", "Inbound endpoints"),
  "outbound-endpoints": resolverEndpoint("OUTBOUND", "/route53/outbound-endpoints", "Outbound endpoints"),
  rules,
  "query-logging": queryLogging,
  "resolver-vpcs": resolverVpcs,
  profiles,
  "global-resolvers": globalResolvers,
  "registered-domains": domains,
  requests,
  "cidr-collections": cidrCollections,
  "traffic-policies": trafficPolicies,
  "policy-records": policyRecords,
}

/* ---------------- Create pages ---------------- */

function CreatePage({ title, back, crumb, submit, valid, children, description }: { title: string; back: string; crumb: string; submit: () => Promise<string | void>; valid: boolean; children: ReactNode; description?: string }) {
  const router = useRouter()
  const follow = useFollow()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <R53Layout breadcrumbs={[{ text: crumb, href: back }, { text: title, href: "#" }]} contentType="form">
      <ContentLayout header={<Header variant="h1" description={description}>{title}</Header>}>
        <Form
          errorText={error}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" href={back} onFollow={follow}>Cancel</Button>
              <Button
                variant="primary"
                loading={saving}
                disabled={!valid}
                onClick={async () => {
                  setSaving(true)
                  setError(undefined)
                  try {
                    const message = await submit()
                    flash.success(message || `${title} succeeded.`)
                    router.push(back)
                  } catch (e) {
                    setError(errorMessage(e))
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                {title}
              </Button>
            </SpaceBetween>
          }
        >
          <Container><SpaceBetween size="l">{children}</SpaceBetween></Container>
        </Form>
      </ContentLayout>
    </R53Layout>
  )
}

function CreateHealthCheck() {
  const [f, setF] = useState({ name: "", mode: "domain", target: "", protocol: "HTTP", port: "80", path: "/", interval: "30", threshold: "3" })
  return (
    <CreatePage title="Create health check" crumb="Health checks" back="/route53/health-checks" valid={Boolean(f.target)} submit={async () => {
      const r = await callAws<{ HealthCheck?: { Id?: string } }>("route53", "CreateHealthCheck", { CallerReference: `${Date.now()}`, HealthCheckConfig: { Type: f.protocol, ...(f.mode === "domain" ? { FullyQualifiedDomainName: f.target } : { IPAddress: f.target }), Port: Number(f.port), ...(f.protocol !== "TCP" ? { ResourcePath: f.path } : {}), RequestInterval: Number(f.interval), FailureThreshold: Number(f.threshold) } })
      if (f.name) await callAws("route53", "ChangeTagsForResource", { ResourceType: "healthcheck", ResourceId: r.HealthCheck?.Id, AddTags: [{ Key: "Name", Value: f.name }] })
      return "Health check created."
    }}>
      <FormField label="Name"><Input value={f.name} onChange={({ detail }) => setF({ ...f, name: detail.value })} /></FormField>
      <FormField label="Specify endpoint by"><Select selectedOption={{ value: f.mode, label: f.mode === "domain" ? "Domain name" : "IP address" }} onChange={({ detail }) => setF({ ...f, mode: detail.selectedOption.value ?? "domain" })} options={[{ value: "ip", label: "IP address" }, { value: "domain", label: "Domain name" }]} /></FormField>
      <FormField label={f.mode === "domain" ? "Domain name" : "IP address"}><Input value={f.target} placeholder={f.mode === "domain" ? "www.example.com" : "192.0.2.44"} onChange={({ detail }) => setF({ ...f, target: detail.value })} /></FormField>
      <FormField label="Protocol"><Select selectedOption={{ value: f.protocol, label: f.protocol }} onChange={({ detail }) => setF({ ...f, protocol: detail.selectedOption.value ?? "HTTP", port: detail.selectedOption.value === "HTTPS" ? "443" : f.port })} options={["HTTP", "HTTPS", "TCP"].map((p) => ({ value: p, label: p }))} /></FormField>
      <FormField label="Port"><Input type="number" value={f.port} onChange={({ detail }) => setF({ ...f, port: detail.value })} /></FormField>
      {f.protocol !== "TCP" && <FormField label="Path"><Input value={f.path} onChange={({ detail }) => setF({ ...f, path: detail.value })} /></FormField>}
      <FormField label="Request interval"><Select selectedOption={{ value: f.interval, label: f.interval === "10" ? "Fast (10 seconds)" : "Standard (30 seconds)" }} onChange={({ detail }) => setF({ ...f, interval: detail.selectedOption.value ?? "30" })} options={[{ value: "30", label: "Standard (30 seconds)" }, { value: "10", label: "Fast (10 seconds)" }]} /></FormField>
      <FormField label="Failure threshold"><Input type="number" value={f.threshold} onChange={({ detail }) => setF({ ...f, threshold: detail.value })} /></FormField>
    </CreatePage>
  )
}

function EndpointCreate({ direction }: { direction: "INBOUND" | "OUTBOUND" }) {
  const vpcs = useAws<{ Vpcs?: { VpcId?: string }[] }>("ec2", "DescribeVpcs", {})
  const [f, setF] = useState({ name: "", vpc: "", groups: [] as string[], subnets: [] as string[] })
  const subnets = useAws<{ Subnets?: { SubnetId?: string; AvailabilityZone?: string }[] }>("ec2", "DescribeSubnets", { Filters: [{ Name: "vpc-id", Values: [f.vpc] }] }, { enabled: Boolean(f.vpc) })
  const sgs = useAws<{ SecurityGroups?: { GroupId?: string; GroupName?: string }[] }>("ec2", "DescribeSecurityGroups", { Filters: [{ Name: "vpc-id", Values: [f.vpc] }] }, { enabled: Boolean(f.vpc) })
  const path = direction === "INBOUND" ? "/route53/inbound-endpoints" : "/route53/outbound-endpoints"
  return (
    <CreatePage title={`Create ${direction.toLowerCase()} endpoint`} crumb={direction === "INBOUND" ? "Inbound endpoints" : "Outbound endpoints"} back={path} valid={Boolean(f.name && f.vpc && f.groups.length && f.subnets.length >= 2)} description="Specify at least two IP addresses in different subnets for high availability." submit={async () => {
      await callAws("route53resolver", "CreateResolverEndpoint", { CreatorRequestId: `${Date.now()}`, Name: f.name, Direction: direction, SecurityGroupIds: f.groups, IpAddresses: f.subnets.map((SubnetId) => ({ SubnetId })) })
      return `Endpoint ${f.name} is being created.`
    }}>
      <FormField label="Endpoint name"><Input value={f.name} onChange={({ detail }) => setF({ ...f, name: detail.value })} /></FormField>
      <FormField label="VPC in the Region"><Select selectedOption={f.vpc ? { value: f.vpc, label: f.vpc } : null} placeholder="Choose VPC" onChange={({ detail }) => setF({ ...f, vpc: detail.selectedOption.value ?? "", subnets: [], groups: [] })} options={(vpcs.data?.Vpcs ?? []).map((v) => ({ value: v.VpcId ?? "", label: v.VpcId }))} /></FormField>
      <FormField label="Security group for this endpoint"><Multiselect selectedOptions={f.groups.map((g) => ({ value: g, label: g }))} onChange={({ detail }) => setF({ ...f, groups: detail.selectedOptions.map((x) => x.value ?? "") })} options={(sgs.data?.SecurityGroups ?? []).map((g) => ({ value: g.GroupId ?? "", label: g.GroupId, description: g.GroupName }))} placeholder="Choose security groups" /></FormField>
      <FormField label="IP addresses (one per subnet)"><Multiselect selectedOptions={f.subnets.map((x) => ({ value: x, label: x }))} onChange={({ detail }) => setF({ ...f, subnets: detail.selectedOptions.map((x) => x.value ?? "") })} options={(subnets.data?.Subnets ?? []).map((x) => ({ value: x.SubnetId ?? "", label: x.SubnetId, description: x.AvailabilityZone }))} placeholder="Choose subnets" /></FormField>
    </CreatePage>
  )
}

function CreateRule() {
  const endpoints = useAws<{ ResolverEndpoints?: Item[] }>("route53resolver", "ListResolverEndpoints", { Filters: [{ Name: "Direction", Values: ["OUTBOUND"] }] })
  const [f, setF] = useState({ name: "", type: "FORWARD", domain: "", endpoint: "", targets: "" })
  return (
    <CreatePage title="Create rule" crumb="Rules" back="/route53/rules" valid={Boolean(f.name && f.domain && (f.type === "SYSTEM" || (f.endpoint && f.targets)))} submit={async () => {
      await callAws("route53resolver", "CreateResolverRule", { CreatorRequestId: `${Date.now()}`, Name: f.name, RuleType: f.type, DomainName: f.domain, ...(f.type === "FORWARD" ? { ResolverEndpointId: f.endpoint, TargetIps: f.targets.split(/[\s,]+/).filter(Boolean).map((t) => { const [Ip, Port] = t.split(":"); return { Ip, Port: Number(Port ?? 53) } }) } : {}) })
      return `Rule ${f.name} created.`
    }}>
      <FormField label="Name"><Input value={f.name} onChange={({ detail }) => setF({ ...f, name: detail.value })} /></FormField>
      <FormField label="Rule type"><Select selectedOption={{ value: f.type, label: f.type === "FORWARD" ? "Forward" : "System" }} onChange={({ detail }) => setF({ ...f, type: detail.selectedOption.value ?? "FORWARD" })} options={[{ value: "FORWARD", label: "Forward" }, { value: "SYSTEM", label: "System" }]} /></FormField>
      <FormField label="Domain name"><Input value={f.domain} placeholder="example.com" onChange={({ detail }) => setF({ ...f, domain: detail.value })} /></FormField>
      {f.type === "FORWARD" && (
        <>
          <FormField label="Outbound endpoint"><Select selectedOption={f.endpoint ? { value: f.endpoint, label: f.endpoint } : null} placeholder="Choose endpoint" empty="No outbound endpoints" onChange={({ detail }) => setF({ ...f, endpoint: detail.selectedOption.value ?? "" })} options={(endpoints.data?.ResolverEndpoints ?? []).map((e) => ({ value: s(e.Id) ?? "", label: s(e.Name) ?? s(e.Id) }))} /></FormField>
          <FormField label="Target IP addresses" description="Comma-separated, optionally with :port."><Input value={f.targets} placeholder="10.0.0.10, 10.0.1.10:53" onChange={({ detail }) => setF({ ...f, targets: detail.value })} /></FormField>
        </>
      )}
    </CreatePage>
  )
}

function CreateQueryLogging() {
  const groups = useAws<{ logGroups?: { logGroupName?: string; arn?: string }[] }>("cloudwatchlogs", "DescribeLogGroups", {})
  const [f, setF] = useState({ name: "", dest: "" })
  return (
    <CreatePage title="Configure query logging" crumb="Query logging" back="/route53/query-logging" valid={Boolean(f.name && f.dest)} submit={async () => {
      await callAws("route53resolver", "CreateResolverQueryLogConfig", { CreatorRequestId: `${Date.now()}`, Name: f.name, DestinationArn: f.dest.replace(/:\*$/, "") })
      return `Query logging configuration ${f.name} created.`
    }}>
      <FormField label="Name"><Input value={f.name} onChange={({ detail }) => setF({ ...f, name: detail.value })} /></FormField>
      <FormField label="Query logs destination" description="CloudWatch Logs log group"><Select selectedOption={f.dest ? { value: f.dest, label: f.dest.split(":log-group:")[1]?.replace(/:\*$/, "") } : null} placeholder="Choose log group" onChange={({ detail }) => setF({ ...f, dest: detail.selectedOption.value ?? "" })} options={(groups.data?.logGroups ?? []).map((g) => ({ value: g.arn ?? "", label: g.logGroupName }))} /></FormField>
    </CreatePage>
  )
}

function CreateProfile() {
  const [name, setName] = useState("")
  return (
    <CreatePage title="Create profile" crumb="Profiles" back="/route53/profiles" valid={Boolean(name)} submit={async () => { await callAws("route53profiles", "CreateProfile", { Name: name, ClientToken: `${Date.now()}` }); return `Profile ${name} created.` }}>
      <FormField label="Profile name"><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
    </CreatePage>
  )
}

function CreateCidrCollection() {
  const [name, setName] = useState("")
  return (
    <CreatePage title="Create CIDR collection" crumb="CIDR collections" back="/route53/cidr-collections" valid={Boolean(name)} submit={async () => { await callAws("route53", "CreateCidrCollection", { Name: name, CallerReference: `${Date.now()}` }); return `CIDR collection ${name} created.` }}>
      <FormField label="CIDR collection name"><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
    </CreatePage>
  )
}

function CreateTrafficPolicy() {
  const [f, setF] = useState({ name: "", comment: "", doc: JSON.stringify({ AWSPolicyFormatVersion: "2015-10-01", RecordType: "A", Endpoints: { e1: { Type: "value", Value: "192.0.2.1" } }, StartEndpoint: "e1" }, null, 2) })
  return (
    <CreatePage title="Create traffic policy" crumb="Traffic policies" back="/route53/traffic-policies" valid={Boolean(f.name && f.doc)} submit={async () => { await callAws("route53", "CreateTrafficPolicy", { Name: f.name, Document: JSON.stringify(JSON.parse(f.doc)), Comment: f.comment }); return `Traffic policy ${f.name} created.` }}>
      <FormField label="Policy name"><Input value={f.name} onChange={({ detail }) => setF({ ...f, name: detail.value })} /></FormField>
      <FormField label="Version description - optional"><Input value={f.comment} onChange={({ detail }) => setF({ ...f, comment: detail.value })} /></FormField>
      <FormField label="Policy document (JSON)" stretch><Textarea value={f.doc} rows={14} spellcheck={false} onChange={({ detail }) => setF({ ...f, doc: detail.value })} /></FormField>
    </CreatePage>
  )
}

function RegisterDomain() {
  const [domain, setDomain] = useState("")
  const [result, setResult] = useState<string>()
  return (
    <CreatePage title="Register domains" crumb="Registered domains" back="/route53/registered-domains" valid={result === "AVAILABLE"} description="Search for a domain, then register it. The local emulator doesn't charge for registration." submit={async () => {
      const contact = { FirstName: "Local", LastName: "User", ContactType: "PERSON", AddressLine1: "1 Example Street", City: "Bangkok", CountryCode: "TH", ZipCode: "10110", PhoneNumber: "+66.20000000", Email: "domains@example.com" }
      await callAws("route53domains", "RegisterDomain", { DomainName: domain, DurationInYears: 1, AutoRenew: true, AdminContact: contact, RegistrantContact: contact, TechContact: contact, PrivacyProtectAdminContact: true, PrivacyProtectRegistrantContact: true, PrivacyProtectTechContact: true })
      return `Registration of ${domain} was submitted.`
    }}>
      <FormField label="Domain name" secondaryControl={<Button onClick={async () => { await callAws<{ Availability?: string }>("route53domains", "CheckDomainAvailability", { DomainName: domain }).then((r) => setResult(r.Availability), (e) => setResult(errorMessage(e))) }}>Search</Button>}>
        <Input value={domain} placeholder="example.com" onChange={({ detail }) => { setDomain(detail.value); setResult(undefined) }} />
      </FormField>
      {result && <FormField label="Availability">{result === "AVAILABLE" ? `${domain} is available.` : result}</FormField>}
    </CreatePage>
  )
}

export const r53CreatePages: Record<string, () => ReactNode> = {
  "health-checks/create": () => <CreateHealthCheck />,
  "inbound-endpoints/create": () => <EndpointCreate direction="INBOUND" />,
  "outbound-endpoints/create": () => <EndpointCreate direction="OUTBOUND" />,
  "rules/create": () => <CreateRule />,
  "query-logging/create": () => <CreateQueryLogging />,
  "profiles/create": () => <CreateProfile />,
  "cidr-collections/create": () => <CreateCidrCollection />,
  "traffic-policies/create": () => <CreateTrafficPolicy />,
  "registered-domains/create": () => <RegisterDomain />,
}
