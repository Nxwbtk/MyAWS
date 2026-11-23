"use client"

import Box from "@cloudscape-design/components/box"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import Select from "@cloudscape-design/components/select"
import Checkbox from "@cloudscape-design/components/checkbox"
import { useState } from "react"
import { Copyable, OperationModal, ResourceTableLite, State, dash, nameTag, type Ctx, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { Ec2Link } from "@/components/ec2/defs-instances"
import { useList } from "@/components/vpc/shared"
import { callAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

const s = (value: unknown) => (value === undefined || value === null ? undefined : String(value))
const arr = (value: unknown) => (value as Item[] | undefined) ?? []
const nameCol = { id: "name", label: "Name", value: (item: Item) => nameTag(item) ?? "–", sort: (item: Item) => nameTag(item) }

/* ---------------- AMIs ---------------- */

function CopyImage({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [name, setName] = useState(`${item.Name}-copy`)
  const [encrypted, setEncrypted] = useState(false)
  return (
    <OperationModal title="Copy AMI" close={close} ctx={ctx} saveLabel="Copy AMI" success="AMI copy initiated." run={() => callAws("ec2", "CopyImage", { SourceImageId: item.ImageId, SourceRegion: s(item.ImageLocation)?.split("/")[0]?.match(/^[a-z]{2}-[a-z]+-\d$/) ? undefined : "ap-southeast-1", Name: name, Encrypted: encrypted })}>
      <FormField label="AMI copy name"><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
      <Checkbox checked={encrypted} onChange={({ detail }) => setEncrypted(detail.checked)}>Encrypt EBS snapshots of AMI copy</Checkbox>
    </OperationModal>
  )
}

const imagesDef: ResourceDef = {
  path: "/ec2/images",
  title: "Amazon Machine Images (AMIs)",
  singular: "AMI",
  operation: "DescribeImages",
  input: { Owners: ["self"] },
  items: (page) => arr(page.Images),
  key: (item) => s(item.ImageId) ?? "",
  create: { label: "Launch instance from AMI", href: "/ec2/launch-instance" },
  empty: "No AMIs owned by you",
  columns: [
    nameCol,
    { id: "id", label: "AMI ID", value: (item) => s(item.ImageId), sort: (item) => s(item.ImageId) },
    { id: "aname", label: "AMI name", value: (item) => s(item.Name), sort: (item) => s(item.Name) },
    { id: "source", label: "Source", value: (item) => dash(item.ImageLocation) },
    { id: "owner", label: "Owner", value: (item) => s(item.OwnerId) },
    { id: "visibility", label: "Visibility", value: (item) => (item.Public ? "Public" : "Private") },
    { id: "status", label: "Status", value: (item) => <State value={item.State} /> },
    { id: "created", label: "Creation date", value: (item) => consoleDate(item.CreationDate as string), sort: (item) => s(item.CreationDate) },
    { id: "platform", label: "Platform", value: (item) => dash(item.PlatformDetails) },
    { id: "root", label: "Root device type", value: (item) => s(item.RootDeviceType) },
  ],
  details: [
    { label: "AMI ID", value: (item) => <Copyable value={s(item.ImageId)} /> },
    { label: "AMI name", value: (item) => s(item.Name) },
    { label: "Owner account ID", value: (item) => s(item.OwnerId) },
    { label: "Status", value: (item) => <State value={item.State} /> },
    { label: "Platform details", value: (item) => dash(item.PlatformDetails) },
    { label: "Architecture", value: (item) => s(item.Architecture) },
    { label: "Root device name", value: (item) => s(item.RootDeviceName) },
    { label: "Root device type", value: (item) => s(item.RootDeviceType) },
    { label: "Virtualization type", value: (item) => s(item.VirtualizationType) },
    { label: "Boot mode", value: (item) => dash(item.BootMode) },
    { label: "Creation date", value: (item) => consoleDate(item.CreationDate as string) },
    { label: "Description", value: (item) => dash(item.Description) },
  ],
  tabs: [
    {
      id: "storage",
      label: "Storage",
      render: (item) => (
        <ResourceTableLite
          title="Block devices"
          items={arr(item.BlockDeviceMappings)}
          columns={[
            { id: "device", header: "Device name", cell: (b) => s(b.DeviceName) },
            { id: "snap", header: "Snapshot ID", cell: (b) => dash((b.Ebs as Item | undefined)?.SnapshotId) },
            { id: "size", header: "Size (GiB)", cell: (b) => dash((b.Ebs as Item | undefined)?.VolumeSize) },
            { id: "type", header: "Volume type", cell: (b) => dash((b.Ebs as Item | undefined)?.VolumeType) },
          ]}
        />
      ),
    },
  ],
  actions: [
    { id: "copy", text: "Copy AMI", operation: "CopyImage", modal: ({ items, close, ctx }) => <CopyImage item={items[0]} close={close} ctx={ctx} /> },
    { id: "deregister", text: "Deregister AMI", operation: "DeregisterImage" },
    { id: "permissions", text: "Edit AMI permissions", operation: "ModifyImageAttribute" },
    { id: "disable", text: "Disable AMI", operation: "DisableImage" },
  ],
}

const catalogDef: ResourceDef = {
  path: "/ec2/ami-catalog",
  title: "AMI Catalog",
  singular: "AMI",
  operation: "DescribeImages",
  input: { Owners: ["amazon"], MaxResults: 1000 },
  items: (page) => arr(page.Images),
  key: (item) => s(item.ImageId) ?? "",
  tagResource: false,
  linkColumn: 1,
  description: "Quickstart AMIs, AWS Marketplace AMIs, and Community AMIs available in this Region.",
  columns: [
    { id: "name", label: "AMI name", value: (item) => s(item.Name), sort: (item) => s(item.Name) },
    { id: "id", label: "AMI ID", value: (item) => s(item.ImageId), sort: (item) => s(item.ImageId) },
    { id: "desc", label: "Description", value: (item) => dash(item.Description) },
    { id: "arch", label: "Architecture", value: (item) => s(item.Architecture) },
    { id: "platform", label: "Platform", value: (item) => dash(item.PlatformDetails) },
    { id: "owner", label: "Owner alias", value: (item) => dash(item.ImageOwnerAlias) },
  ],
  details: imagesDef.details,
  actions: [{ id: "launch", text: "Launch instance with AMI", href: () => "/ec2/launch-instance" }],
}

/* ---------------- Volumes ---------------- */

function ModifyVolume({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [form, setForm] = useState({ type: s(item.VolumeType) ?? "gp3", size: s(item.Size) ?? "8", iops: s(item.Iops) ?? "", throughput: s(item.Throughput) ?? "" })
  return (
    <OperationModal
      title="Modify volume"
      close={close}
      ctx={ctx}
      saveLabel="Modify"
      success={`Successfully modified volume ${item.VolumeId}.`}
      run={() => callAws("ec2", "ModifyVolume", { VolumeId: item.VolumeId, VolumeType: form.type, Size: Number(form.size), ...(form.iops && ["gp3", "io1", "io2"].includes(form.type) ? { Iops: Number(form.iops) } : {}), ...(form.throughput && form.type === "gp3" ? { Throughput: Number(form.throughput) } : {}) })}
    >
      <FormField label="Volume type"><Select selectedOption={{ value: form.type, label: form.type }} onChange={({ detail }) => setForm({ ...form, type: detail.selectedOption.value ?? "gp3" })} options={["gp3", "gp2", "io1", "io2", "st1", "sc1", "standard"].map((v) => ({ value: v, label: v }))} /></FormField>
      <FormField label="Size (GiB)"><Input type="number" value={form.size} onChange={({ detail }) => setForm({ ...form, size: detail.value })} /></FormField>
      <FormField label="IOPS"><Input type="number" value={form.iops} onChange={({ detail }) => setForm({ ...form, iops: detail.value })} /></FormField>
      <FormField label="Throughput (MiB/s)"><Input type="number" value={form.throughput} onChange={({ detail }) => setForm({ ...form, throughput: detail.value })} /></FormField>
    </OperationModal>
  )
}

function AttachToInstance({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const reservations = useList<Item>("DescribeInstances", "Reservations")
  const instances = reservations.items.flatMap((r) => arr(r.Instances)).filter((i) => (i.Placement as Item | undefined)?.AvailabilityZone === item.AvailabilityZone)
  const [instance, setInstance] = useState("")
  const [device, setDevice] = useState("/dev/sdf")
  return (
    <OperationModal title="Attach volume" close={close} ctx={ctx} saveLabel="Attach volume" success={`Volume ${item.VolumeId} attached.`} run={() => callAws("ec2", "AttachVolume", { VolumeId: item.VolumeId, InstanceId: instance, Device: device })}>
      <FormField label="Instance" description={`Only instances in the same Availability Zone (${item.AvailabilityZone}) are listed.`}>
        <Select selectedOption={instance ? { value: instance, label: instance } : null} placeholder="Choose an instance" onChange={({ detail }) => setInstance(detail.selectedOption.value ?? "")} options={instances.map((i) => ({ value: s(i.InstanceId), label: s(i.InstanceId), description: nameTag(i) }))} />
      </FormField>
      <FormField label="Device name"><Input value={device} onChange={({ detail }) => setDevice(detail.value)} /></FormField>
    </OperationModal>
  )
}

function CreateSnapshotFromVolume({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [description, setDescription] = useState("")
  return (
    <OperationModal title="Create snapshot" close={close} ctx={ctx} saveLabel="Create snapshot" success="Snapshot creation started." run={() => callAws("ec2", "CreateSnapshot", { VolumeId: item.VolumeId, ...(description ? { Description: description } : {}) })}>
      <FormField label="Volume ID"><Box>{s(item.VolumeId)}</Box></FormField>
      <FormField label="Description" constraintText="255 characters maximum"><Input value={description} onChange={({ detail }) => setDescription(detail.value)} /></FormField>
    </OperationModal>
  )
}

const volumesDef: ResourceDef = {
  path: "/ec2/volumes",
  title: "Volumes",
  singular: "volume",
  operation: "DescribeVolumes",
  items: (page) => arr(page.Volumes),
  key: (item) => s(item.VolumeId) ?? "",
  create: { label: "Create volume", href: "/ec2/volumes/create" },
  columns: [
    nameCol,
    { id: "id", label: "Volume ID", value: (item) => s(item.VolumeId), sort: (item) => s(item.VolumeId) },
    { id: "type", label: "Type", value: (item) => s(item.VolumeType) },
    { id: "size", label: "Size", value: (item) => `${item.Size} GiB`, sort: (item) => Number(item.Size) },
    { id: "iops", label: "IOPS", value: (item) => dash(item.Iops) },
    { id: "throughput", label: "Throughput", value: (item) => dash(item.Throughput) },
    { id: "snapshot", label: "Snapshot ID", value: (item) => dash(item.SnapshotId) },
    { id: "created", label: "Created", value: (item) => consoleDate(item.CreateTime as string), sort: (item) => s(item.CreateTime) },
    { id: "az", label: "Availability Zone", value: (item) => s(item.AvailabilityZone) },
    { id: "state", label: "Volume state", value: (item) => <State value={item.State} /> },
    { id: "attached", label: "Attached resources", value: (item) => arr(item.Attachments).map((a) => `${a.InstanceId} (${a.Device})`).join(", ") || "–" },
    { id: "encryption", label: "Encryption", value: (item) => (item.Encrypted ? "Encrypted" : "Not encrypted") },
  ],
  details: [
    { label: "Volume ID", value: (item) => <Copyable value={s(item.VolumeId)} /> },
    { label: "Size", value: (item) => `${item.Size} GiB` },
    { label: "Type", value: (item) => s(item.VolumeType) },
    { label: "Volume state", value: (item) => <State value={item.State} /> },
    { label: "IOPS", value: (item) => dash(item.Iops) },
    { label: "Throughput", value: (item) => dash(item.Throughput) },
    { label: "Encryption", value: (item) => (item.Encrypted ? "Encrypted" : "Not encrypted") },
    { label: "KMS key ID", value: (item) => dash(item.KmsKeyId) },
    { label: "Snapshot", value: (item) => <Ec2Link id={s(item.SnapshotId) || undefined} section="snapshots" /> },
    { label: "Availability Zone", value: (item) => s(item.AvailabilityZone) },
    { label: "Created", value: (item) => consoleDate(item.CreateTime as string) },
    { label: "Multi-Attach enabled", value: (item) => (item.MultiAttachEnabled ? "Yes" : "No") },
    { label: "Attached resources", value: (item) => arr(item.Attachments).map((a) => `${a.InstanceId} (${a.Device}): ${a.State}`).join(", ") || "–" },
  ],
  actions: [
    { id: "modify", text: "Modify volume", operation: "ModifyVolume", modal: ({ items, close, ctx }) => <ModifyVolume item={items[0]} close={close} ctx={ctx} /> },
    { id: "snapshot", text: "Create snapshot", operation: "CreateSnapshot", modal: ({ items, close, ctx }) => <CreateSnapshotFromVolume item={items[0]} close={close} ctx={ctx} /> },
    { id: "attach", text: "Attach volume", operation: "AttachVolume", enabled: (items) => items.length === 1 && items[0].State === "available", modal: ({ items, close, ctx }) => <AttachToInstance item={items[0]} close={close} ctx={ctx} /> },
    { id: "detach", text: "Detach volume", operation: "DetachVolume", enabled: (items) => items.length === 1 && items[0].State === "in-use", run: (items) => callAws("ec2", "DetachVolume", { VolumeId: items[0].VolumeId }), success: (items) => `Detaching ${items[0].VolumeId}.` },
    { id: "force", text: "Force detach volume", operation: "DetachVolume", enabled: (items) => items.length === 1 && items[0].State === "in-use", run: (items) => callAws("ec2", "DetachVolume", { VolumeId: items[0].VolumeId, Force: true }), success: (items) => `Force detaching ${items[0].VolumeId}.` },
    { id: "autoio", text: "Manage auto-enabled I/O", operation: "ModifyVolumeAttribute", run: (items) => callAws("ec2", "ModifyVolumeAttribute", { VolumeId: items[0].VolumeId, AutoEnableIO: { Value: true } }), success: () => "Auto-enabled I/O turned on." },
  ],
  deleteAction: { operation: "DeleteVolume", input: (item) => ({ VolumeId: item.VolumeId }), warning: "The volume must be in the available state (not attached to an instance)." },
}

/* ---------------- Snapshots ---------------- */

function CreateVolumeFromSnapshot({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [az, setAz] = useState("ap-southeast-1a")
  const [type, setType] = useState("gp3")
  return (
    <OperationModal title="Create volume from snapshot" close={close} ctx={ctx} saveLabel="Create volume" success="Volume creation started." run={() => callAws("ec2", "CreateVolume", { SnapshotId: item.SnapshotId, AvailabilityZone: az, VolumeType: type })}>
      <FormField label="Snapshot ID"><Box>{s(item.SnapshotId)}</Box></FormField>
      <FormField label="Volume type"><Select selectedOption={{ value: type, label: type }} onChange={({ detail }) => setType(detail.selectedOption.value ?? "gp3")} options={["gp3", "gp2", "io1", "io2", "st1", "sc1", "standard"].map((v) => ({ value: v, label: v }))} /></FormField>
      <FormField label="Availability Zone"><Input value={az} onChange={({ detail }) => setAz(detail.value)} /></FormField>
    </OperationModal>
  )
}

function CopySnapshot({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [description, setDescription] = useState(`[Copied ${item.SnapshotId}]`)
  return (
    <OperationModal title="Copy snapshot" close={close} ctx={ctx} saveLabel="Copy snapshot" success="Snapshot copy started." run={() => callAws("ec2", "CopySnapshot", { SourceSnapshotId: item.SnapshotId, SourceRegion: "ap-southeast-1", Description: description })}>
      <FormField label="Description"><Input value={description} onChange={({ detail }) => setDescription(detail.value)} /></FormField>
    </OperationModal>
  )
}

const snapshotsDef: ResourceDef = {
  path: "/ec2/snapshots",
  title: "Snapshots",
  singular: "snapshot",
  operation: "DescribeSnapshots",
  input: { OwnerIds: ["self"] },
  items: (page) => arr(page.Snapshots),
  key: (item) => s(item.SnapshotId) ?? "",
  create: { label: "Create snapshot", href: "/ec2/snapshots/create" },
  columns: [
    nameCol,
    { id: "id", label: "Snapshot ID", value: (item) => s(item.SnapshotId), sort: (item) => s(item.SnapshotId) },
    { id: "full", label: "Full snapshot size", value: (item) => dash(item.FullSnapshotSizeInBytes) },
    { id: "size", label: "Volume size", value: (item) => `${item.VolumeSize} GiB` },
    { id: "desc", label: "Description", value: (item) => dash(item.Description) },
    { id: "tier", label: "Storage tier", value: (item) => (s(item.StorageTier) === "archive" ? "Archive" : "Standard") },
    { id: "status", label: "Snapshot status", value: (item) => <State value={item.State} /> },
    { id: "started", label: "Started", value: (item) => consoleDate(item.StartTime as string), sort: (item) => s(item.StartTime) },
    { id: "progress", label: "Progress", value: (item) => dash(item.Progress) },
    { id: "encryption", label: "Encryption", value: (item) => (item.Encrypted ? "Encrypted" : "Not encrypted") },
    { id: "volume", label: "Volume ID", value: (item) => dash(item.VolumeId) },
  ],
  details: [
    { label: "Snapshot ID", value: (item) => <Copyable value={s(item.SnapshotId)} /> },
    { label: "Status", value: (item) => <State value={item.State} /> },
    { label: "Volume", value: (item) => <Ec2Link id={s(item.VolumeId)} section="volumes" /> },
    { label: "Volume size", value: (item) => `${item.VolumeSize} GiB` },
    { label: "Progress", value: (item) => dash(item.Progress) },
    { label: "Started", value: (item) => consoleDate(item.StartTime as string) },
    { label: "Encryption", value: (item) => (item.Encrypted ? "Encrypted" : "Not encrypted") },
    { label: "Description", value: (item) => dash(item.Description) },
    { label: "Owner", value: (item) => s(item.OwnerId) },
  ],
  actions: [
    { id: "volume", text: "Create volume from snapshot", operation: "CreateVolume", modal: ({ items, close, ctx }) => <CreateVolumeFromSnapshot item={items[0]} close={close} ctx={ctx} /> },
    { id: "image", text: "Create image from snapshot", operation: "RegisterImage", run: (items) => callAws("ec2", "RegisterImage", { Name: `image-from-${items[0].SnapshotId}`, RootDeviceName: "/dev/xvda", VirtualizationType: "hvm", Architecture: "x86_64", BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { SnapshotId: items[0].SnapshotId } }] }), success: (items) => `Registered image-from-${items[0].SnapshotId}.` },
    { id: "copy", text: "Copy snapshot", operation: "CopySnapshot", modal: ({ items, close, ctx }) => <CopySnapshot item={items[0]} close={close} ctx={ctx} /> },
    { id: "archive", text: "Archive snapshot", operation: "ModifySnapshotTier", run: (items) => callAws("ec2", "ModifySnapshotTier", { SnapshotId: items[0].SnapshotId, StorageTier: "archive" }), success: () => "Snapshot archiving started." },
    { id: "restore", text: "Restore snapshot from archive", operation: "RestoreSnapshotTier" },
    { id: "lock", text: "Manage snapshot lock", operation: "LockSnapshot" },
  ],
  deleteAction: { operation: "DeleteSnapshot", input: (item) => ({ SnapshotId: item.SnapshotId }) },
}

/* ---------------- Placement groups, key pairs, network interfaces ---------------- */

const placementDef: ResourceDef = {
  path: "/ec2/placement-groups",
  title: "Placement groups",
  singular: "placement group",
  operation: "DescribePlacementGroups",
  items: (page) => arr(page.PlacementGroups),
  key: (item) => s(item.GroupName) ?? "",
  create: { label: "Create placement group", href: "/ec2/placement-groups/create" },
  linkColumn: 0,
  columns: [
    { id: "name", label: "Group name", value: (item) => s(item.GroupName), sort: (item) => s(item.GroupName) },
    { id: "gid", label: "Group Id", value: (item) => s(item.GroupId) },
    { id: "strategy", label: "Strategy", value: (item) => s(item.Strategy) },
    { id: "state", label: "State", value: (item) => <State value={item.State} /> },
    { id: "partition", label: "Partition", value: (item) => dash(item.PartitionCount) },
    { id: "spread", label: "Spread level", value: (item) => dash(item.SpreadLevel) },
  ],
  details: [
    { label: "Group name", value: (item) => s(item.GroupName) },
    { label: "Group Id", value: (item) => <Copyable value={s(item.GroupId)} /> },
    { label: "Strategy", value: (item) => s(item.Strategy) },
    { label: "State", value: (item) => <State value={item.State} /> },
    { label: "Group ARN", value: (item) => <Copyable value={s(item.GroupArn)} /> },
  ],
  tagResource: false,
  deleteAction: { operation: "DeletePlacementGroup", input: (item) => ({ GroupName: item.GroupName }) },
}

const keyPairsDef: ResourceDef = {
  path: "/ec2/key-pairs",
  title: "Key pairs",
  singular: "key pair",
  operation: "DescribeKeyPairs",
  items: (page) => arr(page.KeyPairs),
  key: (item) => s(item.KeyPairId) ?? "",
  create: { label: "Create key pair", href: "/ec2/key-pairs/create" },
  noDetailPage: true,
  columns: [
    { id: "name", label: "Name", value: (item) => s(item.KeyName), sort: (item) => s(item.KeyName) },
    { id: "type", label: "Type", value: (item) => s(item.KeyType) },
    { id: "created", label: "Created", value: (item) => consoleDate(item.CreateTime as string), sort: (item) => s(item.CreateTime) },
    { id: "fingerprint", label: "Fingerprint", value: (item) => s(item.KeyFingerprint) },
    { id: "id", label: "ID", value: (item) => s(item.KeyPairId) },
  ],
  details: [
    { label: "Name", value: (item) => s(item.KeyName) },
    { label: "Type", value: (item) => s(item.KeyType) },
    { label: "ID", value: (item) => <Copyable value={s(item.KeyPairId)} /> },
    { label: "Fingerprint", value: (item) => s(item.KeyFingerprint) },
    { label: "Created", value: (item) => consoleDate(item.CreateTime as string) },
  ],
  actions: [{ id: "import", text: "Import key pair", enabled: () => true, href: () => "/ec2/key-pairs/import" }],
  deleteAction: { operation: "DeleteKeyPair", input: (item) => ({ KeyPairId: item.KeyPairId }) },
}

function ChangeEniSgs({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const groups = useList<Item>("DescribeSecurityGroups", "SecurityGroups", { Filters: [{ Name: "vpc-id", Values: [item.VpcId] }] })
  const [selected, setSelected] = useState<string[]>(arr(item.Groups).map((g) => s(g.GroupId)!))
  return (
    <OperationModal title="Change security groups" close={close} ctx={ctx} success="Security groups updated." run={() => callAws("ec2", "ModifyNetworkInterfaceAttribute", { NetworkInterfaceId: item.NetworkInterfaceId, Groups: selected })}>
      <FormField label="Security groups">
        <Select selectedOption={null} placeholder="Add security group" onChange={({ detail }) => detail.selectedOption.value && !selected.includes(detail.selectedOption.value) && setSelected([...selected, detail.selectedOption.value])} options={groups.items.map((g) => ({ value: s(g.GroupId), label: s(g.GroupName), description: s(g.GroupId) }))} />
      </FormField>
      {selected.map((id) => <Checkbox key={id} checked onChange={() => setSelected(selected.filter((v) => v !== id))}>{id}</Checkbox>)}
    </OperationModal>
  )
}

const eniDef: ResourceDef = {
  path: "/ec2/network-interfaces",
  title: "Network interfaces",
  singular: "network interface",
  operation: "DescribeNetworkInterfaces",
  items: (page) => arr(page.NetworkInterfaces),
  key: (item) => s(item.NetworkInterfaceId) ?? "",
  create: { label: "Create network interface", href: "/ec2/network-interfaces/create" },
  columns: [
    nameCol,
    { id: "id", label: "Network interface ID", value: (item) => s(item.NetworkInterfaceId), sort: (item) => s(item.NetworkInterfaceId) },
    { id: "subnet", label: "Subnet ID", value: (item) => s(item.SubnetId) },
    { id: "vpc", label: "VPC ID", value: (item) => s(item.VpcId) },
    { id: "az", label: "Availability Zone", value: (item) => s(item.AvailabilityZone) },
    { id: "sgnames", label: "Security group names", value: (item) => arr(item.Groups).map((g) => s(g.GroupName)).join(", ") || "–" },
    { id: "sgids", label: "Security group IDs", value: (item) => arr(item.Groups).map((g) => s(g.GroupId)).join(", ") || "–" },
    { id: "type", label: "Interface Type", value: (item) => s(item.InterfaceType) },
    { id: "desc", label: "Description", value: (item) => dash(item.Description) },
    { id: "instance", label: "Instance ID", value: (item) => dash((item.Attachment as Item | undefined)?.InstanceId) },
    { id: "status", label: "Status", value: (item) => <State value={item.Status} /> },
    { id: "public", label: "Public IPv4 address", value: (item) => dash((item.Association as Item | undefined)?.PublicIp) },
    { id: "private", label: "Primary private IPv4 address", value: (item) => dash(item.PrivateIpAddress) },
  ],
  details: [
    { label: "Network interface ID", value: (item) => <Copyable value={s(item.NetworkInterfaceId)} /> },
    { label: "Status", value: (item) => <State value={item.Status} /> },
    { label: "Interface type", value: (item) => s(item.InterfaceType) },
    { label: "Subnet ID", value: (item) => s(item.SubnetId) },
    { label: "VPC ID", value: (item) => s(item.VpcId) },
    { label: "Availability Zone", value: (item) => s(item.AvailabilityZone) },
    { label: "Primary private IPv4 address", value: (item) => dash(item.PrivateIpAddress) },
    { label: "Private IPv4 DNS", value: (item) => dash(item.PrivateDnsName) },
    { label: "Public IPv4 address", value: (item) => dash((item.Association as Item | undefined)?.PublicIp) },
    { label: "MAC address", value: (item) => dash(item.MacAddress) },
    { label: "Source/dest. check", value: (item) => (item.SourceDestCheck ? "true" : "false") },
    { label: "Instance ID", value: (item) => <Ec2Link id={s((item.Attachment as Item | undefined)?.InstanceId)} section="instances" /> },
    { label: "Description", value: (item) => dash(item.Description) },
  ],
  actions: [
    { id: "sg", text: "Change security groups", operation: "ModifyNetworkInterfaceAttribute", modal: ({ items, close, ctx }) => <ChangeEniSgs item={items[0]} close={close} ctx={ctx} /> },
    { id: "srcdst", text: "Change source/dest. check", operation: "ModifyNetworkInterfaceAttribute", run: (items) => callAws("ec2", "ModifyNetworkInterfaceAttribute", { NetworkInterfaceId: items[0].NetworkInterfaceId, SourceDestCheck: { Value: !items[0].SourceDestCheck } }), success: () => "Source/destination check updated." },
    { id: "detach", text: "Detach", operation: "DetachNetworkInterface", enabled: (items) => items.length === 1 && Boolean((items[0].Attachment as Item | undefined)?.AttachmentId), run: (items) => callAws("ec2", "DetachNetworkInterface", { AttachmentId: (items[0].Attachment as Item).AttachmentId }), success: () => "Network interface detached." },
  ],
  deleteAction: { operation: "DeleteNetworkInterface", input: (item) => ({ NetworkInterfaceId: item.NetworkInterfaceId }), warning: "You can't delete a network interface that is attached to an instance." },
}

export const ec2StorageDefs: Record<string, ResourceDef> = {
  images: imagesDef,
  "ami-catalog": catalogDef,
  volumes: volumesDef,
  snapshots: snapshotsDef,
  "placement-groups": placementDef,
  "key-pairs": keyPairsDef,
  "network-interfaces": eniDef,
}
