"use client"

import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import { useState } from "react"
import { Copyable, OperationModal, ResourceTableLite, State, dash, nameTag, type Ctx, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { Ec2Link } from "@/components/ec2/defs-instances"
import { ec2StorageDefs } from "@/components/ec2/defs-storage"
import { useList } from "@/components/vpc/shared"
import { callAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

const s = (value: unknown) => (value === undefined || value === null ? undefined : String(value))
const arr = (value: unknown) => (value as Item[] | undefined) ?? []
const nameCol = { id: "name", label: "Name", value: (item: Item) => nameTag(item) ?? "–", sort: (item: Item) => nameTag(item) }
const gib = (mib: unknown) => (mib ? String(Number(mib) / 1024) : "–")

const instanceTypesDef: ResourceDef = {
  path: "/ec2/instance-types",
  title: "Instance types",
  singular: "instance type",
  operation: "DescribeInstanceTypes",
  input: { MaxResults: 100 },
  items: (page) => arr(page.InstanceTypes),
  key: (item) => s(item.InstanceType) ?? "",
  tagResource: false,
  linkColumn: 0,
  filterPlaceholder: "Filter instance types",
  columns: [
    { id: "id", label: "Instance type", value: (item) => s(item.InstanceType), sort: (item) => s(item.InstanceType) },
    { id: "free", label: "Free tier eligible", value: (item) => (item.FreeTierEligible ? "Yes" : "No") },
    { id: "vcpu", label: "vCPUs", value: (item) => s((item.VCpuInfo as Item | undefined)?.DefaultVCpus), sort: (item) => Number((item.VCpuInfo as Item | undefined)?.DefaultVCpus) },
    { id: "arch", label: "Architecture", value: (item) => arr((item.ProcessorInfo as Item | undefined)?.SupportedArchitectures).join(", ") },
    { id: "memory", label: "Memory (GiB)", value: (item) => gib((item.MemoryInfo as Item | undefined)?.SizeInMiB), sort: (item) => Number((item.MemoryInfo as Item | undefined)?.SizeInMiB) },
    { id: "storage", label: "Storage (GB)", value: (item) => dash((item.InstanceStorageInfo as Item | undefined)?.TotalSizeInGB) },
    { id: "stype", label: "Storage type", value: (item) => (item.InstanceStorageSupported ? "Instance store" : "EBS only") },
    { id: "network", label: "Network performance", value: (item) => dash((item.NetworkInfo as Item | undefined)?.NetworkPerformance) },
    { id: "gen", label: "Current generation", value: (item) => (item.CurrentGeneration ? "true" : "false") },
  ],
  details: [
    { label: "Instance type", value: (item) => s(item.InstanceType) },
    { label: "vCPUs", value: (item) => s((item.VCpuInfo as Item | undefined)?.DefaultVCpus) },
    { label: "Memory (GiB)", value: (item) => gib((item.MemoryInfo as Item | undefined)?.SizeInMiB) },
    { label: "Architecture", value: (item) => arr((item.ProcessorInfo as Item | undefined)?.SupportedArchitectures).join(", ") },
    { label: "Hypervisor", value: (item) => dash(item.Hypervisor) },
    { label: "Bare metal", value: (item) => (item.BareMetal ? "true" : "false") },
    { label: "Network performance", value: (item) => dash((item.NetworkInfo as Item | undefined)?.NetworkPerformance) },
    { label: "Maximum network interfaces", value: (item) => dash((item.NetworkInfo as Item | undefined)?.MaximumNetworkInterfaces) },
    { label: "EBS optimized support", value: (item) => dash((item.EbsInfo as Item | undefined)?.EbsOptimizedSupport) },
    { label: "Supported usage classes", value: (item) => arr(item.SupportedUsageClasses).join(", ") },
    { label: "Supported root device types", value: (item) => arr(item.SupportedRootDeviceTypes).join(", ") },
    { label: "Burstable performance", value: (item) => (item.BurstablePerformanceSupported ? "true" : "false") },
  ],
}

function NewTemplateVersion({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [description, setDescription] = useState("")
  const [type, setType] = useState("")
  return (
    <OperationModal
      title="Modify template (Create new version)"
      close={close}
      ctx={ctx}
      saveLabel="Create template version"
      success={`Created a new version of ${item.LaunchTemplateName}.`}
      run={() => callAws("ec2", "CreateLaunchTemplateVersion", { LaunchTemplateId: item.LaunchTemplateId, SourceVersion: String(item.LatestVersionNumber), ...(description ? { VersionDescription: description } : {}), LaunchTemplateData: type ? { InstanceType: type } : {} })}
    >
      <FormField label="Template version description"><Input value={description} onChange={({ detail }) => setDescription(detail.value)} /></FormField>
      <FormField label={<>Instance type - <i>optional</i></>} description="Leave empty to keep the source version's instance type."><Input value={type} placeholder="t3.micro" onChange={({ detail }) => setType(detail.value)} /></FormField>
    </OperationModal>
  )
}

function TemplateVersions({ id }: { id: string }) {
  const versions = useList<Item>("DescribeLaunchTemplateVersions", "LaunchTemplateVersions", { LaunchTemplateId: id })
  return (
    <ResourceTableLite
      title="Versions"
      items={versions.items}
      columns={[
        { id: "version", header: "Version", cell: (v) => `${v.VersionNumber}${v.DefaultVersion ? " (Default)" : ""}` },
        { id: "desc", header: "Description", cell: (v) => dash(v.VersionDescription) },
        { id: "ami", header: "AMI ID", cell: (v) => dash((v.LaunchTemplateData as Item | undefined)?.ImageId) },
        { id: "type", header: "Instance type", cell: (v) => dash((v.LaunchTemplateData as Item | undefined)?.InstanceType) },
        { id: "key", header: "Key pair name", cell: (v) => dash((v.LaunchTemplateData as Item | undefined)?.KeyName) },
        { id: "created", header: "Created", cell: (v) => consoleDate(v.CreateTime as string) },
      ]}
    />
  )
}

function SetDefaultVersion({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [version, setVersion] = useState(String(item.LatestVersionNumber ?? 1))
  return (
    <OperationModal title="Set default version" close={close} ctx={ctx} success="Default version updated." run={() => callAws("ec2", "ModifyLaunchTemplate", { LaunchTemplateId: item.LaunchTemplateId, DefaultVersion: version })}>
      <FormField label="Template version" constraintText={`Latest version: ${item.LatestVersionNumber}`}><Input type="number" value={version} onChange={({ detail }) => setVersion(detail.value)} /></FormField>
    </OperationModal>
  )
}

const launchTemplatesDef: ResourceDef = {
  path: "/ec2/launch-templates",
  title: "Launch templates",
  singular: "launch template",
  operation: "DescribeLaunchTemplates",
  items: (page) => arr(page.LaunchTemplates),
  key: (item) => s(item.LaunchTemplateId) ?? "",
  create: { label: "Create launch template", href: "/ec2/launch-templates/create" },
  description: "Streamline, simplify and standardize instance launches.",
  linkColumn: 1,
  columns: [
    { id: "name", label: "Launch template name", value: (item) => s(item.LaunchTemplateName), sort: (item) => s(item.LaunchTemplateName) },
    { id: "id", label: "Launch template ID", value: (item) => s(item.LaunchTemplateId), sort: (item) => s(item.LaunchTemplateId) },
    { id: "default", label: "Default version", value: (item) => s(item.DefaultVersionNumber) },
    { id: "latest", label: "Latest version", value: (item) => s(item.LatestVersionNumber) },
    { id: "created", label: "Create time", value: (item) => consoleDate(item.CreateTime as string), sort: (item) => s(item.CreateTime) },
    { id: "owner", label: "Owner", value: (item) => s(item.CreatedBy) },
  ],
  details: [
    { label: "Launch template ID", value: (item) => <Copyable value={s(item.LaunchTemplateId)} /> },
    { label: "Launch template name", value: (item) => s(item.LaunchTemplateName) },
    { label: "Default version", value: (item) => s(item.DefaultVersionNumber) },
    { label: "Latest version", value: (item) => s(item.LatestVersionNumber) },
    { label: "Owner", value: (item) => s(item.CreatedBy) },
    { label: "Create time", value: (item) => consoleDate(item.CreateTime as string) },
  ],
  tabs: [{ id: "versions", label: "Versions", render: (item) => <TemplateVersions id={s(item.LaunchTemplateId)!} /> }],
  actions: [
    { id: "launch", text: "Launch instance from template", operation: "RunInstances", run: (items) => callAws("ec2", "RunInstances", { LaunchTemplate: { LaunchTemplateId: items[0].LaunchTemplateId }, MinCount: 1, MaxCount: 1 }), success: () => "Successfully initiated launch of an instance from the template." },
    { id: "modify", text: "Modify template (Create new version)", operation: "CreateLaunchTemplateVersion", modal: ({ items, close, ctx }) => <NewTemplateVersion item={items[0]} close={close} ctx={ctx} /> },
    { id: "default", text: "Set default version", operation: "ModifyLaunchTemplate", modal: ({ items, close, ctx }) => <SetDefaultVersion item={items[0]} close={close} ctx={ctx} /> },
  ],
  deleteAction: { operation: "DeleteLaunchTemplate", input: (item) => ({ LaunchTemplateId: item.LaunchTemplateId }), warning: "Deleting a launch template deletes all of its versions." },
}

const spotDef: ResourceDef = {
  path: "/ec2/spot-requests",
  title: "Spot Requests",
  singular: "Spot request",
  operation: "DescribeSpotInstanceRequests",
  items: (page) => arr(page.SpotInstanceRequests),
  key: (item) => s(item.SpotInstanceRequestId) ?? "",
  columns: [
    nameCol,
    { id: "id", label: "Request ID", value: (item) => s(item.SpotInstanceRequestId), sort: (item) => s(item.SpotInstanceRequestId) },
    { id: "type", label: "Request type", value: (item) => s(item.Type) },
    { id: "state", label: "State", value: (item) => <State value={item.State} /> },
    { id: "capacity", label: "Capacity", value: (item) => dash(item.InstanceId) },
    { id: "status", label: "Status", value: (item) => dash((item.Status as Item | undefined)?.Code) },
    { id: "persistence", label: "Persistence", value: (item) => dash(item.Type) },
    { id: "created", label: "Created", value: (item) => consoleDate(item.CreateTime as string) },
  ],
  details: [
    { label: "Request ID", value: (item) => <Copyable value={s(item.SpotInstanceRequestId)} /> },
    { label: "State", value: (item) => <State value={item.State} /> },
    { label: "Instance", value: (item) => <Ec2Link id={s(item.InstanceId)} section="instances" /> },
    { label: "Max price", value: (item) => dash(item.SpotPrice) },
    { label: "Instance type", value: (item) => dash((item.LaunchSpecification as Item | undefined)?.InstanceType) },
    { label: "Created", value: (item) => consoleDate(item.CreateTime as string) },
  ],
  actions: [
    { id: "request", text: "Request Spot Instances", operation: "RequestSpotInstances", enabled: () => true, modal: ({ close, ctx }) => <RequestSpot close={close} ctx={ctx} /> },
    { id: "cancel", text: "Cancel request", operation: "CancelSpotInstanceRequests", enabled: (items) => items.length >= 1, run: (items) => callAws("ec2", "CancelSpotInstanceRequests", { SpotInstanceRequestIds: items.map((item) => item.SpotInstanceRequestId) }), success: () => "Spot request cancelled." },
  ],
}

function RequestSpot({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const [form, setForm] = useState({ ami: "", type: "t3.micro", count: "1" })
  return (
    <OperationModal title="Request Spot Instances" close={close} ctx={ctx} saveLabel="Launch" success="Spot Instance request submitted." run={() => callAws("ec2", "RequestSpotInstances", { InstanceCount: Number(form.count), LaunchSpecification: { ImageId: form.ami, InstanceType: form.type } })}>
      <FormField label="AMI ID"><Input value={form.ami} placeholder="ami-..." onChange={({ detail }) => setForm({ ...form, ami: detail.value })} /></FormField>
      <FormField label="Instance type"><Input value={form.type} onChange={({ detail }) => setForm({ ...form, type: detail.value })} /></FormField>
      <FormField label="Target capacity"><Input type="number" value={form.count} onChange={({ detail }) => setForm({ ...form, count: detail.value })} /></FormField>
    </OperationModal>
  )
}

const reservedDef: ResourceDef = {
  path: "/ec2/reserved-instances",
  title: "Reserved Instances",
  singular: "Reserved Instance",
  operation: "DescribeReservedInstances",
  items: (page) => arr(page.ReservedInstances),
  key: (item) => s(item.ReservedInstancesId) ?? "",
  readOnlyReason: "Purchasing is not available in the local emulator.",
  create: { label: "Purchase Reserved Instances", href: "/ec2/reserved-instances" },
  description: "We recommend Savings Plans over Reserved Instances. Savings Plans are the easiest and most flexible way to save money on your AWS compute costs.",
  columns: [
    nameCol,
    { id: "id", label: "ID", value: (item) => s(item.ReservedInstancesId) },
    { id: "type", label: "Instance type", value: (item) => s(item.InstanceType) },
    { id: "scope", label: "Scope", value: (item) => s(item.Scope) },
    { id: "az", label: "Availability Zone", value: (item) => dash(item.AvailabilityZone) },
    { id: "count", label: "Instance count", value: (item) => s(item.InstanceCount) },
    { id: "start", label: "Start", value: (item) => consoleDate(item.Start as string) },
    { id: "end", label: "Expires", value: (item) => consoleDate(item.End as string) },
    { id: "term", label: "Term", value: (item) => `${Math.round(Number(item.Duration ?? 0) / 31536000)} year` },
    { id: "state", label: "State", value: (item) => <State value={item.State} /> },
  ],
  details: [
    { label: "ID", value: (item) => <Copyable value={s(item.ReservedInstancesId)} /> },
    { label: "Instance type", value: (item) => s(item.InstanceType) },
    { label: "State", value: (item) => <State value={item.State} /> },
    { label: "Offering class", value: (item) => dash(item.OfferingClass) },
  ],
}

function AllocateHost({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const [form, setForm] = useState({ family: "m5", az: "", qty: "1" })
  return (
    <OperationModal title="Allocate Dedicated Host" close={close} ctx={ctx} saveLabel="Allocate" success="Dedicated Host allocated." run={() => callAws("ec2", "AllocateHosts", { InstanceFamily: form.family, AvailabilityZone: form.az, Quantity: Number(form.qty) })}>
      <FormField label="Instance family"><Input value={form.family} onChange={({ detail }) => setForm({ ...form, family: detail.value })} /></FormField>
      <FormField label="Availability Zone"><Input value={form.az} placeholder="ap-southeast-1a" onChange={({ detail }) => setForm({ ...form, az: detail.value })} /></FormField>
      <FormField label="Quantity"><Input type="number" value={form.qty} onChange={({ detail }) => setForm({ ...form, qty: detail.value })} /></FormField>
    </OperationModal>
  )
}

const hostsDef: ResourceDef = {
  path: "/ec2/hosts",
  title: "Dedicated Hosts",
  singular: "Dedicated Host",
  operation: "DescribeHosts",
  items: (page) => arr(page.Hosts),
  key: (item) => s(item.HostId) ?? "",
  columns: [
    nameCol,
    { id: "id", label: "Host ID", value: (item) => s(item.HostId), sort: (item) => s(item.HostId) },
    { id: "state", label: "State", value: (item) => <State value={item.State} /> },
    { id: "family", label: "Instance family", value: (item) => dash((item.HostProperties as Item | undefined)?.InstanceFamily) },
    { id: "az", label: "Availability Zone", value: (item) => s(item.AvailabilityZone) },
    { id: "instances", label: "Instances", value: (item) => String(arr(item.Instances).length) },
    { id: "auto", label: "Auto placement", value: (item) => s(item.AutoPlacement) },
  ],
  details: [
    { label: "Host ID", value: (item) => <Copyable value={s(item.HostId)} /> },
    { label: "State", value: (item) => <State value={item.State} /> },
    { label: "Availability Zone", value: (item) => s(item.AvailabilityZone) },
    { label: "Instance family", value: (item) => dash((item.HostProperties as Item | undefined)?.InstanceFamily) },
    { label: "Sockets", value: (item) => dash((item.HostProperties as Item | undefined)?.Sockets) },
    { label: "Total vCPUs", value: (item) => dash((item.HostProperties as Item | undefined)?.TotalVCpus) },
  ],
  actions: [
    { id: "allocate", text: "Allocate Dedicated Host", operation: "AllocateHosts", enabled: () => true, modal: ({ close, ctx }) => <AllocateHost close={close} ctx={ctx} /> },
    { id: "release", text: "Release host", operation: "ReleaseHosts", enabled: (items) => items.length >= 1, run: (items) => callAws("ec2", "ReleaseHosts", { HostIds: items.map((item) => item.HostId) }), success: () => "Dedicated Hosts released." },
  ],
}

function CreateCapacityReservation({ close, ctx }: { close: () => void; ctx: Ctx }) {
  const [form, setForm] = useState({ type: "t3.micro", platform: "Linux/UNIX", az: "", count: "1" })
  return (
    <OperationModal title="Create a Capacity Reservation" close={close} ctx={ctx} saveLabel="Create" success="Capacity Reservation created." run={() => callAws("ec2", "CreateCapacityReservation", { InstanceType: form.type, InstancePlatform: form.platform, AvailabilityZone: form.az, InstanceCount: Number(form.count) })}>
      <FormField label="Instance type"><Input value={form.type} onChange={({ detail }) => setForm({ ...form, type: detail.value })} /></FormField>
      <FormField label="Platform"><Input value={form.platform} onChange={({ detail }) => setForm({ ...form, platform: detail.value })} /></FormField>
      <FormField label="Availability Zone"><Input value={form.az} placeholder="ap-southeast-1a" onChange={({ detail }) => setForm({ ...form, az: detail.value })} /></FormField>
      <FormField label="Total capacity"><Input type="number" value={form.count} onChange={({ detail }) => setForm({ ...form, count: detail.value })} /></FormField>
    </OperationModal>
  )
}

const capacityDef: ResourceDef = {
  path: "/ec2/capacity-reservations",
  title: "Capacity Reservations",
  singular: "Capacity Reservation",
  operation: "DescribeCapacityReservations",
  items: (page) => arr(page.CapacityReservations),
  key: (item) => s(item.CapacityReservationId) ?? "",
  columns: [
    nameCol,
    { id: "id", label: "Capacity Reservation ID", value: (item) => s(item.CapacityReservationId), sort: (item) => s(item.CapacityReservationId) },
    { id: "type", label: "Instance type", value: (item) => s(item.InstanceType) },
    { id: "state", label: "State", value: (item) => <State value={item.State} /> },
    { id: "az", label: "Availability Zone", value: (item) => s(item.AvailabilityZone) },
    { id: "total", label: "Total instance count", value: (item) => s(item.TotalInstanceCount) },
    { id: "available", label: "Available instance count", value: (item) => s(item.AvailableInstanceCount) },
    { id: "util", label: "Utilization", value: (item) => `${Math.round(((Number(item.TotalInstanceCount) - Number(item.AvailableInstanceCount)) / Math.max(1, Number(item.TotalInstanceCount))) * 100)}%` },
    { id: "platform", label: "Platform", value: (item) => s(item.InstancePlatform) },
  ],
  details: [
    { label: "Capacity Reservation ID", value: (item) => <Copyable value={s(item.CapacityReservationId)} /> },
    { label: "State", value: (item) => <State value={item.State} /> },
    { label: "Instance type", value: (item) => s(item.InstanceType) },
    { label: "Platform", value: (item) => s(item.InstancePlatform) },
    { label: "Availability Zone", value: (item) => s(item.AvailabilityZone) },
    { label: "Total capacity", value: (item) => s(item.TotalInstanceCount) },
    { label: "Instance eligibility", value: (item) => dash(item.InstanceMatchCriteria) },
    { label: "End date", value: (item) => (item.EndDate ? consoleDate(item.EndDate as string) : "Manually") },
  ],
  actions: [
    { id: "create", text: "Create On-Demand Capacity Reservation", operation: "CreateCapacityReservation", enabled: () => true, modal: ({ close, ctx }) => <CreateCapacityReservation close={close} ctx={ctx} /> },
    { id: "cancel", text: "Cancel Capacity Reservation", operation: "CancelCapacityReservation", run: (items) => callAws("ec2", "CancelCapacityReservation", { CapacityReservationId: items[0].CapacityReservationId }), success: () => "Capacity Reservation cancelled." },
  ],
}

export const ec2MoreDefs: Record<string, ResourceDef> = {
  "instance-types": instanceTypesDef,
  "launch-templates": launchTemplatesDef,
  "spot-requests": spotDef,
  "reserved-instances": reservedDef,
  hosts: hostsDef,
  "capacity-reservations": capacityDef,
  ...ec2StorageDefs,
}

