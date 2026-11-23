"use client"

import Box from "@cloudscape-design/components/box"
import Checkbox from "@cloudscape-design/components/checkbox"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import Multiselect from "@cloudscape-design/components/multiselect"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import Textarea from "@cloudscape-design/components/textarea"
import Link from "@cloudscape-design/components/link"
import { useState } from "react"
import { Copyable, OperationModal, ResourceTableLite, State, dash, nameTag, type Ctx, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { useList } from "@/components/vpc/shared"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

const s = (value: unknown) => (value === undefined || value === null ? undefined : String(value))
const arr = (value: unknown) => (value as Item[] | undefined) ?? []
const stateName = (item: Item) => s((item.State as Item | undefined)?.Name)

export function Ec2Link({ id, section, service = "ec2" }: { id?: string; section: string; service?: string }) {
  const follow = useFollow()
  if (!id) return <>–</>
  return <Link href={`/${service}/${section}/${encodeURIComponent(id)}`} onFollow={follow}>{id}</Link>
}

function StatusCheck({ id }: { id: string }) {
  const status = useAws<{ InstanceStatuses?: Item[] }>("ec2", "DescribeInstanceStatus", { InstanceIds: [id], IncludeAllInstances: true }, { staleTime: 10_000 })
  const st = status.data?.InstanceStatuses?.[0]
  if (!st) return <>–</>
  const ok = (st.InstanceStatus as Item | undefined)?.Status === "ok" && (st.SystemStatus as Item | undefined)?.Status === "ok"
  const checks = [(st.SystemStatus as Item | undefined)?.Status, (st.InstanceStatus as Item | undefined)?.Status, (st.AttachedEbsStatus as Item | undefined)?.Status].filter(Boolean)
  if ((st.InstanceState as Item | undefined)?.Name !== "running") return <>–</>
  return <State value={ok ? `${checks.filter((c) => c === "ok").length}/${checks.length} checks passed` : "Initializing"} />
}

function ChangeType({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const types = useList<Item>("DescribeInstanceTypes", "InstanceTypes", { MaxResults: 100 })
  const [type, setType] = useState(s(item.InstanceType) ?? "")
  return (
    <OperationModal title="Change instance type" close={close} ctx={ctx} success={`Successfully changed instance type of ${item.InstanceId} to ${type}.`} run={() => callAws("ec2", "ModifyInstanceAttribute", { InstanceId: item.InstanceId, InstanceType: { Value: type } })}>
      {stateName(item) !== "stopped" && <Box color="text-status-warning">To change the instance type, the instance must be in the stopped state.</Box>}
      <FormField label="Current instance type"><Box>{s(item.InstanceType)}</Box></FormField>
      <FormField label="New instance type">
        <Select filteringType="auto" selectedOption={{ value: type, label: type }} onChange={({ detail }) => setType(detail.selectedOption.value ?? "")} options={types.items.map((t) => ({ value: s(t.InstanceType), label: s(t.InstanceType), description: `${(t.VCpuInfo as Item | undefined)?.DefaultVCpus} vCPU · ${Number((t.MemoryInfo as Item | undefined)?.SizeInMiB ?? 0) / 1024} GiB` }))} />
      </FormField>
    </OperationModal>
  )
}

function ToggleAttribute({ item, close, ctx, attribute, title, label }: { item: Item; close: () => void; ctx: Ctx; attribute: "disableApiTermination" | "disableApiStop"; title: string; label: string }) {
  const current = useAws<Record<string, { Value?: boolean }>>("ec2", "DescribeInstanceAttribute", { InstanceId: item.InstanceId, Attribute: attribute })
  const key = attribute.charAt(0).toUpperCase() + attribute.slice(1)
  const [value, setValue] = useState<boolean>()
  const enabled = value ?? current.data?.[key]?.Value ?? false
  return (
    <OperationModal title={title} close={close} ctx={ctx} success={`${title} updated for ${item.InstanceId}.`} run={() => callAws("ec2", "ModifyInstanceAttribute", { InstanceId: item.InstanceId, [key]: { Value: enabled } })}>
      <FormField label="Instance ID"><Box>{s(item.InstanceId)}</Box></FormField>
      <Checkbox checked={enabled} onChange={({ detail }) => setValue(detail.checked)}>{label}</Checkbox>
    </OperationModal>
  )
}

function ShutdownBehavior({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const current = useAws<{ InstanceInitiatedShutdownBehavior?: { Value?: string } }>("ec2", "DescribeInstanceAttribute", { InstanceId: item.InstanceId, Attribute: "instanceInitiatedShutdownBehavior" })
  const [value, setValue] = useState<string>()
  const chosen = value ?? current.data?.InstanceInitiatedShutdownBehavior?.Value ?? "stop"
  return (
    <OperationModal title="Change shutdown behavior" close={close} ctx={ctx} success="Shutdown behavior updated." run={() => callAws("ec2", "ModifyInstanceAttribute", { InstanceId: item.InstanceId, InstanceInitiatedShutdownBehavior: { Value: chosen } })}>
      <FormField label="Shutdown behavior"><RadioGroup value={chosen} onChange={({ detail }) => setValue(detail.value)} items={[{ value: "stop", label: "Stop" }, { value: "terminate", label: "Terminate" }]} /></FormField>
    </OperationModal>
  )
}

function UserData({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const current = useAws<{ UserData?: { Value?: string } }>("ec2", "DescribeInstanceAttribute", { InstanceId: item.InstanceId, Attribute: "userData" })
  const decoded = current.data?.UserData?.Value ? atob(current.data.UserData.Value) : ""
  const [value, setValue] = useState<string>()
  return (
    <OperationModal title="Edit user data" size="large" close={close} ctx={ctx} success="User data updated." run={() => callAws("ec2", "ModifyInstanceAttribute", { InstanceId: item.InstanceId, UserData: { Value: btoa(value ?? decoded) } })}>
      {stateName(item) !== "stopped" && <Box color="text-status-warning">You can only modify user data of a stopped instance.</Box>}
      <FormField label="User data" stretch><Textarea rows={12} value={value ?? decoded} onChange={({ detail }) => setValue(detail.value)} /></FormField>
    </OperationModal>
  )
}

function MetadataOptions({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const options = (item.MetadataOptions as Item | undefined) ?? {}
  const [form, setForm] = useState({ endpoint: s(options.HttpEndpoint) ?? "enabled", tokens: s(options.HttpTokens) ?? "required", hop: s(options.HttpPutResponseHopLimit) ?? "2", tags: s(options.InstanceMetadataTags) ?? "disabled" })
  return (
    <OperationModal
      title="Modify instance metadata options"
      close={close}
      ctx={ctx}
      success="Instance metadata options updated."
      run={() => callAws("ec2", "ModifyInstanceMetadataOptions", { InstanceId: item.InstanceId, HttpEndpoint: form.endpoint, HttpTokens: form.tokens, HttpPutResponseHopLimit: Number(form.hop), InstanceMetadataTags: form.tags })}
    >
      <FormField label="Instance metadata service"><RadioGroup value={form.endpoint} onChange={({ detail }) => setForm({ ...form, endpoint: detail.value })} items={[{ value: "enabled", label: "Enable" }, { value: "disabled", label: "Disable" }]} /></FormField>
      <FormField label="IMDSv2"><RadioGroup value={form.tokens} onChange={({ detail }) => setForm({ ...form, tokens: detail.value })} items={[{ value: "optional", label: "Optional" }, { value: "required", label: "Required" }]} /></FormField>
      <FormField label="Metadata response hop limit"><Input type="number" value={form.hop} onChange={({ detail }) => setForm({ ...form, hop: detail.value })} /></FormField>
      <FormField label="Allow tags in instance metadata"><RadioGroup value={form.tags} onChange={({ detail }) => setForm({ ...form, tags: detail.value })} items={[{ value: "enabled", label: "Enable" }, { value: "disabled", label: "Disable" }]} /></FormField>
    </OperationModal>
  )
}

function ChangeSecurityGroups({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const groups = useList<Item>("DescribeSecurityGroups", "SecurityGroups", { Filters: [{ Name: "vpc-id", Values: [item.VpcId] }] })
  const [selected, setSelected] = useState<string[]>(arr(item.SecurityGroups).map((g) => s(g.GroupId)!))
  return (
    <OperationModal title="Change security groups" size="medium" close={close} ctx={ctx} success={`Security groups updated for ${item.InstanceId}.`} run={() => callAws("ec2", "ModifyInstanceAttribute", { InstanceId: item.InstanceId, Groups: selected })}>
      <FormField label="Associated security groups">
        <Multiselect selectedOptions={selected.map((id) => ({ value: id, label: id }))} onChange={({ detail }) => setSelected(detail.selectedOptions.map((o) => o.value!))} options={groups.items.map((g) => ({ value: s(g.GroupId), label: s(g.GroupId), description: s(g.GroupName) }))} />
      </FormField>
    </OperationModal>
  )
}

function ModifyIamRole({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const profiles = useAws<{ InstanceProfiles?: Item[] }>("iam", "ListInstanceProfiles", {})
  const associations = useList<Item>("DescribeIamInstanceProfileAssociations", "IamInstanceProfileAssociations", { Filters: [{ Name: "instance-id", Values: [item.InstanceId] }] })
  const current = associations.items.find((a) => a.State === "associated")
  const [arn, setArn] = useState<string>()
  const chosen = arn ?? s((item.IamInstanceProfile as Item | undefined)?.Arn) ?? ""
  return (
    <OperationModal
      title="Modify IAM role"
      close={close}
      ctx={ctx}
      saveLabel="Update IAM role"
      success={`IAM role updated for ${item.InstanceId}.`}
      run={async () => {
        if (!chosen && current) await callAws("ec2", "DisassociateIamInstanceProfile", { AssociationId: current.AssociationId })
        else if (current) await callAws("ec2", "ReplaceIamInstanceProfileAssociation", { AssociationId: current.AssociationId, IamInstanceProfile: { Arn: chosen } })
        else if (chosen) await callAws("ec2", "AssociateIamInstanceProfile", { InstanceId: item.InstanceId, IamInstanceProfile: { Arn: chosen } })
      }}
    >
      <FormField label="IAM role" description="Select an IAM instance profile to attach to your instance.">
        <Select
          selectedOption={{ value: chosen, label: chosen ? chosen.split("/").pop() : "No IAM role" }}
          onChange={({ detail }) => setArn(detail.selectedOption.value ?? "")}
          options={[{ value: "", label: "No IAM role" }, ...(profiles.data?.InstanceProfiles ?? []).map((p) => ({ value: s(p.Arn), label: s(p.InstanceProfileName) }))]}
        />
      </FormField>
    </OperationModal>
  )
}

function ConsoleOutput({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const output = useAws<{ Output?: string }>("ec2", "GetConsoleOutput", { InstanceId: item.InstanceId, Latest: true })
  return (
    <OperationModal title={`Get system log - ${item.InstanceId}`} size="large" close={close} ctx={ctx} saveLabel="Close" run={async () => undefined}>
      <pre className="myaws-code-view" style={{ maxHeight: 400, overflow: "auto" }}>{output.data?.Output ? atob(output.data.Output) : output.isPending ? "Loading…" : "No system log output is available for this instance."}</pre>
    </OperationModal>
  )
}

function AttachVolume({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const volumes = useList<Item>("DescribeVolumes", "Volumes", { Filters: [{ Name: "status", Values: ["available"] }] })
  const [volume, setVolume] = useState("")
  const [device, setDevice] = useState("/dev/sdf")
  const zone = s((item.Placement as Item | undefined)?.AvailabilityZone)
  return (
    <OperationModal title="Attach volume" close={close} ctx={ctx} saveLabel="Attach volume" success={`Volume ${volume} attached to ${item.InstanceId}.`} run={() => callAws("ec2", "AttachVolume", { InstanceId: item.InstanceId, VolumeId: volume, Device: device })}>
      <FormField label="Volume" description={`Only volumes in ${zone} are listed.`}>
        <Select selectedOption={volume ? { value: volume, label: volume } : null} placeholder="Choose a volume" onChange={({ detail }) => setVolume(detail.selectedOption.value ?? "")} options={volumes.items.filter((v) => v.AvailabilityZone === zone).map((v) => ({ value: s(v.VolumeId), label: s(v.VolumeId), description: `${v.Size} GiB ${v.VolumeType}` }))} />
      </FormField>
      <FormField label="Device name"><Input value={device} onChange={({ detail }) => setDevice(detail.value)} /></FormField>
    </OperationModal>
  )
}

const instanceAction = (id: string, text: string, operation: string, enabled: (state?: string) => boolean, extra: Record<string, unknown> = {}) => ({
  id,
  text,
  operation,
  enabled: (items: Item[]) => items.length >= 1 && items.every((item) => enabled(stateName(item))),
  run: (items: Item[]) => callAws("ec2", operation, { InstanceIds: items.map((item) => item.InstanceId), ...extra }),
  success: (items: Item[]) => `Successfully ${text.toLowerCase().replace(/ instance.*$/, "")}${text.startsWith("Stop") ? "ped" : text.startsWith("Start") ? "ed" : "ed"} ${items.map((item) => item.InstanceId).join(", ")}`,
})

export const instancesDef: ResourceDef = {
  path: "/ec2/instances",
  title: "Instances",
  singular: "instance",
  operation: "DescribeInstances",
  items: (page) => arr(page.Reservations).flatMap((reservation) => arr(reservation.Instances)),
  key: (item) => s(item.InstanceId) ?? "",
  create: { label: "Launch instances", href: "/ec2/launch-instance" },
  filterPlaceholder: "Find Instance by attribute or tag (case-sensitive)",
  columns: [
    { id: "name", label: "Name", value: (item) => nameTag(item) ?? "–", sort: (item) => nameTag(item) },
    { id: "id", label: "Instance ID", value: (item) => s(item.InstanceId), sort: (item) => s(item.InstanceId) },
    { id: "state", label: "Instance state", value: (item) => <State value={stateName(item)} />, sort: stateName },
    { id: "type", label: "Instance type", value: (item) => s(item.InstanceType), sort: (item) => s(item.InstanceType) },
    { id: "check", label: "Status check", value: (item) => <StatusCheck id={s(item.InstanceId)!} /> },
    { id: "alarm", label: "Alarm status", value: () => "View alarms +" },
    { id: "az", label: "Availability Zone", value: (item) => s((item.Placement as Item | undefined)?.AvailabilityZone), sort: (item) => s((item.Placement as Item | undefined)?.AvailabilityZone) },
    { id: "dns", label: "Public IPv4 DNS", value: (item) => dash(item.PublicDnsName) },
    { id: "ip", label: "Public IPv4 address", value: (item) => dash(item.PublicIpAddress), sort: (item) => s(item.PublicIpAddress) },
    { id: "eip", label: "Elastic IP", value: () => "–" },
    { id: "ipv6", label: "IPv6 IPs", value: (item) => dash(item.Ipv6Address) },
    { id: "monitoring", label: "Monitoring", value: (item) => s((item.Monitoring as Item | undefined)?.State) },
    { id: "sg", label: "Security group name", value: (item) => arr(item.SecurityGroups).map((g) => s(g.GroupName)).join(", ") || "–" },
    { id: "key", label: "Key name", value: (item) => dash(item.KeyName), sort: (item) => s(item.KeyName) },
    { id: "launch", label: "Launch time", value: (item) => consoleDate(item.LaunchTime as string), sort: (item) => s(item.LaunchTime) },
    { id: "platform", label: "Platform details", value: (item) => dash(item.PlatformDetails) },
  ],
  details: [
    { label: "Instance ID", value: (item) => <Copyable value={s(item.InstanceId)} /> },
    { label: "Public IPv4 address", value: (item) => dash(item.PublicIpAddress) },
    { label: "Private IPv4 addresses", value: (item) => dash(item.PrivateIpAddress) },
    { label: "IPv6 address", value: (item) => dash(item.Ipv6Address) },
    { label: "Instance state", value: (item) => <State value={stateName(item)} /> },
    { label: "Public DNS", value: (item) => dash(item.PublicDnsName) },
    { label: "Private IP DNS name (IPv4 only)", value: (item) => dash(item.PrivateDnsName) },
    { label: "Hostname type", value: (item) => `IP name: ${dash(item.PrivateDnsName)}` },
    { label: "Instance type", value: (item) => s(item.InstanceType) },
    { label: "Elastic IP addresses", value: () => "–" },
    { label: "VPC ID", value: (item) => <Ec2Link id={s(item.VpcId)} section="vpcs" service="vpc" /> },
    { label: "Subnet ID", value: (item) => <Ec2Link id={s(item.SubnetId)} section="subnets" service="vpc" /> },
    { label: "IAM Role", value: (item) => dash(s((item.IamInstanceProfile as Item | undefined)?.Arn)?.split("/").pop()) },
    { label: "AMI ID", value: (item) => <Ec2Link id={s(item.ImageId)} section="images" /> },
    { label: "Platform", value: (item) => dash(item.PlatformDetails) },
    { label: "Key pair assigned at launch", value: (item) => dash(item.KeyName) },
    { label: "Launch time", value: (item) => consoleDate(item.LaunchTime as string) },
    { label: "Availability Zone", value: (item) => s((item.Placement as Item | undefined)?.AvailabilityZone) },
    { label: "Tenancy", value: (item) => s((item.Placement as Item | undefined)?.Tenancy) },
    { label: "Monitoring", value: (item) => s((item.Monitoring as Item | undefined)?.State) },
    { label: "Lifecycle", value: (item) => (item.InstanceLifecycle ? s(item.InstanceLifecycle) : "normal") },
    { label: "Owner", value: (item) => s(item.OwnerId ?? "–") },
  ],
  tabs: [
    {
      id: "status",
      label: "Status and alarms",
      render: (item) => <ResourceTableLite title="Status checks" items={[item]} columns={[{ id: "check", header: "Status checks", cell: (row) => <StatusCheck id={s(row.InstanceId)!} /> }, { id: "alarms", header: "Alarms", cell: () => "No alarms" }]} />,
    },
    { id: "monitoring", label: "Monitoring", render: () => <Box color="text-status-inactive">CloudWatch metrics are not reported by the local emulator.</Box> },
    {
      id: "security",
      label: "Security",
      render: (item) => (
        <ResourceTableLite
          title="Security groups"
          items={arr(item.SecurityGroups)}
          columns={[
            { id: "id", header: "Security group ID", cell: (g) => <Ec2Link id={s(g.GroupId)} section="security-groups" /> },
            { id: "name", header: "Security group name", cell: (g) => s(g.GroupName) },
          ]}
        />
      ),
    },
    {
      id: "networking",
      label: "Networking",
      render: (item) => (
        <ResourceTableLite
          title="Network interfaces"
          items={arr(item.NetworkInterfaces)}
          columns={[
            { id: "id", header: "Interface ID", cell: (n) => <Ec2Link id={s(n.NetworkInterfaceId)} section="network-interfaces" /> },
            { id: "private", header: "Private IPv4 address", cell: (n) => dash(n.PrivateIpAddress) },
            { id: "public", header: "Public IPv4 address", cell: (n) => dash((n.Association as Item | undefined)?.PublicIp) },
            { id: "subnet", header: "Subnet ID", cell: (n) => s(n.SubnetId) },
            { id: "mac", header: "MAC address", cell: (n) => dash(n.MacAddress) },
          ]}
        />
      ),
    },
    {
      id: "storage",
      label: "Storage",
      render: (item) => (
        <ResourceTableLite
          title="Block devices"
          items={arr(item.BlockDeviceMappings)}
          columns={[
            { id: "volume", header: "Volume ID", cell: (b) => <Ec2Link id={s((b.Ebs as Item | undefined)?.VolumeId)} section="volumes" /> },
            { id: "device", header: "Device name", cell: (b) => s(b.DeviceName) },
            { id: "status", header: "Attachment status", cell: (b) => <State value={(b.Ebs as Item | undefined)?.Status} /> },
            { id: "time", header: "Attachment time", cell: (b) => consoleDate((b.Ebs as Item | undefined)?.AttachTime as string) },
            { id: "delete", header: "Delete on termination", cell: (b) => ((b.Ebs as Item | undefined)?.DeleteOnTermination ? "Yes" : "No") },
          ]}
        />
      ),
    },
  ],
  menus: [
    {
      label: "Instance state",
      actions: [
        instanceAction("stop", "Stop instance", "StopInstances", (st) => st === "running"),
        instanceAction("start", "Start instance", "StartInstances", (st) => st === "stopped"),
        instanceAction("reboot", "Reboot instance", "RebootInstances", (st) => st === "running"),
        instanceAction("hibernate", "Hibernate instance", "StopInstances", (st) => st === "running", { Hibernate: true }),
        instanceAction("terminate", "Terminate (delete) instance", "TerminateInstances", (st) => st !== "terminated" && st !== "shutting-down"),
      ],
    },
  ],
  actions: [
    { id: "connect", text: "Connect", group: "Instance diagnostics", operation: "SendSSHPublicKey" },
    { id: "type", text: "Change instance type", group: "Instance settings", operation: "ModifyInstanceAttribute", modal: ({ items, close, ctx }) => <ChangeType item={items[0]} close={close} ctx={ctx} /> },
    { id: "stop-protect", text: "Change stop protection", group: "Instance settings", operation: "ModifyInstanceAttribute", modal: ({ items, close, ctx }) => <ToggleAttribute item={items[0]} close={close} ctx={ctx} attribute="disableApiStop" title="Change stop protection" label="Enable stop protection" /> },
    { id: "term-protect", text: "Change termination protection", group: "Instance settings", operation: "ModifyInstanceAttribute", modal: ({ items, close, ctx }) => <ToggleAttribute item={items[0]} close={close} ctx={ctx} attribute="disableApiTermination" title="Change termination protection" label="Enable termination protection" /> },
    { id: "shutdown", text: "Change shutdown behavior", group: "Instance settings", operation: "ModifyInstanceAttribute", modal: ({ items, close, ctx }) => <ShutdownBehavior item={items[0]} close={close} ctx={ctx} /> },
    { id: "userdata", text: "Edit user data", group: "Instance settings", operation: "ModifyInstanceAttribute", modal: ({ items, close, ctx }) => <UserData item={items[0]} close={close} ctx={ctx} /> },
    { id: "metadata", text: "Modify instance metadata options", group: "Instance settings", operation: "ModifyInstanceMetadataOptions", modal: ({ items, close, ctx }) => <MetadataOptions item={items[0]} close={close} ctx={ctx} /> },
    { id: "cpu", text: "Change CPU options", group: "Instance settings", operation: "ModifyInstanceCpuOptions" },
    {
      id: "srcdst",
      text: "Change source/destination check",
      group: "Networking",
      operation: "ModifyInstanceAttribute",
      run: (items) => callAws("ec2", "ModifyInstanceAttribute", { InstanceId: items[0].InstanceId, SourceDestCheck: { Value: !items[0].SourceDestCheck } }),
      success: () => "Source/destination check updated.",
    },
    { id: "sg", text: "Change security groups", group: "Security", operation: "ModifyInstanceAttribute", modal: ({ items, close, ctx }) => <ChangeSecurityGroups item={items[0]} close={close} ctx={ctx} /> },
    { id: "iam", text: "Modify IAM role", group: "Security", operation: "AssociateIamInstanceProfile", modal: ({ items, close, ctx }) => <ModifyIamRole item={items[0]} close={close} ctx={ctx} /> },
    { id: "password", text: "Get Windows password", group: "Security", operation: "GetPasswordData", enabled: (items) => items.length === 1 && items[0].Platform === "windows" },
    { id: "image", text: "Create image", group: "Image and templates", operation: "CreateImage" },
    {
      id: "template",
      text: "Create template from instance",
      group: "Image and templates",
      operation: "CreateLaunchTemplate",
      run: (items) => callAws("ec2", "CreateLaunchTemplate", { LaunchTemplateName: `${items[0].InstanceId}-template`, LaunchTemplateData: { ImageId: items[0].ImageId, InstanceType: items[0].InstanceType, ...(items[0].KeyName ? { KeyName: items[0].KeyName } : {}), SecurityGroupIds: arr(items[0].SecurityGroups).map((g) => g.GroupId) } }),
      success: (items) => `Created launch template ${items[0].InstanceId}-template.`,
    },
    { id: "more", text: "Launch more like this", group: "Image and templates", href: (items) => `/ec2/launch-instance?from=${items[0].InstanceId}` },
    { id: "attach", text: "Attach volume", group: "Storage", operation: "AttachVolume", modal: ({ items, close, ctx }) => <AttachVolume item={items[0]} close={close} ctx={ctx} /> },
    { id: "root", text: "Replace root volume", group: "Storage", operation: "CreateReplaceRootVolumeTask", run: (items) => callAws("ec2", "CreateReplaceRootVolumeTask", { InstanceId: items[0].InstanceId }), success: () => "Root volume replacement task created." },
    { id: "monitoring", text: "Manage detailed monitoring", group: "Monitor and troubleshoot", operation: "MonitorInstances", run: (items) => callAws("ec2", (items[0].Monitoring as Item | undefined)?.State === "enabled" ? "UnmonitorInstances" : "MonitorInstances", { InstanceIds: [items[0].InstanceId] }), success: () => "Detailed monitoring updated." },
    { id: "log", text: "Get system log", group: "Monitor and troubleshoot", operation: "GetConsoleOutput", modal: ({ items, close, ctx }) => <ConsoleOutput item={items[0]} close={close} ctx={ctx} /> },
    { id: "screenshot", text: "Get instance screenshot", group: "Monitor and troubleshoot", operation: "GetConsoleScreenshot", run: (items) => callAws("ec2", "GetConsoleScreenshot", { InstanceId: items[0].InstanceId }), success: () => "The emulator returned an instance screenshot." },
  ],
}
