"use client"

import Alert from "@cloudscape-design/components/alert"
import Checkbox from "@cloudscape-design/components/checkbox"
import Container from "@cloudscape-design/components/container"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Multiselect from "@cloudscape-design/components/multiselect"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Textarea from "@cloudscape-design/components/textarea"
import Tiles from "@cloudscape-design/components/tiles"
import { useQuery } from "@tanstack/react-query"
import { useState, type ComponentType } from "react"
import { flash } from "@/components/console/flash"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import type { Item } from "@/components/ec2-family/engine"
import { Ec2CreatePage } from "@/components/ec2/create-more"
import { KeyPairFields, createKeyPair } from "@/components/ec2/key-pair-modal"
import { SubnetSelect, VpcSelect, useList } from "@/components/vpc/shared"
import { callAws } from "@/lib/aws"

const s = (value: unknown) => (value === undefined || value === null ? undefined : String(value))
const tagSpecs = (type: string, tags: Tag[]) => (tags.filter((t) => t.Key).length ? { TagSpecifications: [{ ResourceType: type, Tags: tags.filter((t) => t.Key).map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) }] } : {})

const volumeTypes = [
  { value: "gp3", label: "General Purpose SSD (gp3)" },
  { value: "gp2", label: "General Purpose SSD (gp2)" },
  { value: "io1", label: "Provisioned IOPS SSD (io1)" },
  { value: "io2", label: "Provisioned IOPS SSD (io2)" },
  { value: "st1", label: "Throughput Optimized HDD (st1)" },
  { value: "sc1", label: "Cold HDD (sc1)" },
  { value: "standard", label: "Magnetic (standard)" },
]

function CreateVolumePage() {
  const zones = useQuery({ queryKey: ["emulator", "aws", "ec2", "DescribeAvailabilityZones", "vol"], queryFn: async () => (await callAws<{ AvailabilityZones?: Item[] }>("ec2", "DescribeAvailabilityZones", {})).AvailabilityZones ?? [] })
  const snapshots = useList<Item>("DescribeSnapshots", "Snapshots", { OwnerIds: ["self"] })
  const [form, setForm] = useState({ type: "gp3", size: "100", iops: "3000", throughput: "125", az: "", snapshot: "", encrypted: false })
  const [tags, setTags] = useState<Tag[]>([])
  const az = form.az || s(zones.data?.[0]?.ZoneName) || ""
  return (
    <Ec2CreatePage
      title="Create volume"
      description="Create an Amazon EBS volume to attach to any EC2 instance in the same Availability Zone."
      listTitle="Volumes"
      listHref="/ec2/volumes"
      submitLabel="Create volume"
      onSubmit={async () => {
        const result = await callAws<{ VolumeId?: string }>("ec2", "CreateVolume", {
          VolumeType: form.type,
          AvailabilityZone: az,
          ...(form.snapshot ? { SnapshotId: form.snapshot } : { Size: Number(form.size) }),
          ...(["gp3", "io1", "io2"].includes(form.type) ? { Iops: Number(form.iops) } : {}),
          ...(form.type === "gp3" ? { Throughput: Number(form.throughput) } : {}),
          Encrypted: form.encrypted,
          ...tagSpecs("volume", tags),
        })
        flash.success(`Successfully created volume ${result.VolumeId}.`)
        return `/ec2/volumes/${result.VolumeId}`
      }}
    >
      <Container header={<Header variant="h2">Volume settings</Header>}>
        <SpaceBetween size="m">
          <FormField label="Volume type"><Select selectedOption={volumeTypes.find((v) => v.value === form.type) ?? null} onChange={({ detail }) => setForm({ ...form, type: detail.selectedOption.value ?? "gp3" })} options={volumeTypes} /></FormField>
          <FormField label="Size (GiB)" constraintText="Min: 1 GiB, Max: 65536 GiB."><Input type="number" value={form.size} disabled={Boolean(form.snapshot)} onChange={({ detail }) => setForm({ ...form, size: detail.value })} /></FormField>
          {["gp3", "io1", "io2"].includes(form.type) && <FormField label="IOPS" constraintText="Min: 3000 IOPS, Max: 80000 IOPS."><Input type="number" value={form.iops} onChange={({ detail }) => setForm({ ...form, iops: detail.value })} /></FormField>}
          {form.type === "gp3" && <FormField label="Throughput (MiB/s)" constraintText="Min: 125 MiB, Max: 2000 MiB. Baseline: 125 MiB/s."><Input type="number" value={form.throughput} onChange={({ detail }) => setForm({ ...form, throughput: detail.value })} /></FormField>}
          <FormField label="Availability Zone">
            <Select selectedOption={{ value: az, label: az }} onChange={({ detail }) => setForm({ ...form, az: detail.selectedOption.value ?? "" })} options={(zones.data ?? []).map((zone) => ({ value: s(zone.ZoneName), label: `${zone.ZoneId} (${zone.ZoneName})` }))} />
          </FormField>
          <FormField label={<>Snapshot ID - <i>optional</i></>}>
            <Select selectedOption={{ value: form.snapshot, label: form.snapshot || "Don't create volume from a snapshot" }} onChange={({ detail }) => setForm({ ...form, snapshot: detail.selectedOption.value ?? "" })} options={[{ value: "", label: "Don't create volume from a snapshot" }, ...snapshots.items.map((snap) => ({ value: s(snap.SnapshotId), label: s(snap.SnapshotId), description: `${snap.VolumeSize} GiB` }))]} />
          </FormField>
          <FormField label="Encryption" description="Use Amazon EBS encryption as an encryption solution for your EBS resources associated with your EC2 instances.">
            <Checkbox checked={form.encrypted} onChange={({ detail }) => setForm({ ...form, encrypted: detail.checked })}>Encrypt this volume</Checkbox>
          </FormField>
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">Tags - <i>optional</i></Header>}><TagEditor tags={tags} onChange={setTags} /></Container>
    </Ec2CreatePage>
  )
}

function CreateSnapshotPage() {
  const volumes = useList<Item>("DescribeVolumes", "Volumes")
  const reservations = useList<Item>("DescribeInstances", "Reservations")
  const [type, setType] = useState("volume")
  const [target, setTarget] = useState("")
  const [description, setDescription] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  const instances = reservations.items.flatMap((r) => (r.Instances as Item[] | undefined) ?? [])
  return (
    <Ec2CreatePage
      title="Create snapshot"
      description="Create a point-in-time snapshot of an EBS volume and use it as a baseline for new volumes or for data backup."
      listTitle="Snapshots"
      listHref="/ec2/snapshots"
      submitLabel="Create snapshot"
      onSubmit={async () => {
        if (!target) throw new Error(`Select a ${type}.`)
        if (type === "volume") {
          const result = await callAws<{ SnapshotId?: string }>("ec2", "CreateSnapshot", { VolumeId: target, ...(description ? { Description: description } : {}), ...tagSpecs("snapshot", tags) })
          flash.success(`Successfully created snapshot ${result.SnapshotId}.`)
        } else {
          await callAws("ec2", "CreateSnapshots", { InstanceSpecification: { InstanceId: target }, ...(description ? { Description: description } : {}), ...tagSpecs("snapshot", tags) })
          flash.success(`Successfully created snapshots of ${target}.`)
        }
        return "/ec2/snapshots"
      }}
    >
      <Container header={<Header variant="h2">Source</Header>}>
        <SpaceBetween size="m">
          <FormField label="Resource type"><Tiles value={type} onChange={({ detail }) => { setType(detail.value); setTarget("") }} items={[{ value: "volume", label: "Volume", description: "Create a snapshot from a specific volume." }, { value: "instance", label: "Instance", description: "Create multi-volume snapshots from an instance." }]} /></FormField>
          <FormField label={type === "volume" ? "Volume ID" : "Instance ID"}>
            <Select selectedOption={target ? { value: target, label: target } : null} placeholder={`Select a ${type}`} onChange={({ detail }) => setTarget(detail.selectedOption.value ?? "")} options={(type === "volume" ? volumes.items.map((v) => ({ value: s(v.VolumeId), label: s(v.VolumeId), description: `${v.Size} GiB ${v.VolumeType}` })) : instances.map((i) => ({ value: s(i.InstanceId), label: s(i.InstanceId) })))} />
          </FormField>
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">Snapshot details</Header>}>
        <FormField label="Description" description="Add a description for your snapshot." constraintText="255 characters maximum"><Input value={description} onChange={({ detail }) => setDescription(detail.value)} /></FormField>
      </Container>
      <Container header={<Header variant="h2">Tags</Header>}><TagEditor tags={tags} onChange={setTags} /></Container>
    </Ec2CreatePage>
  )
}

function CreatePlacementGroupPage() {
  const [name, setName] = useState("")
  const [strategy, setStrategy] = useState("cluster")
  const [partitions, setPartitions] = useState("2")
  const [spread, setSpread] = useState("rack")
  const [tags, setTags] = useState<Tag[]>([])
  return (
    <Ec2CreatePage
      title="Create placement group"
      listTitle="Placement groups"
      listHref="/ec2/placement-groups"
      submitLabel="Create group"
      onSubmit={async () => {
        await callAws("ec2", "CreatePlacementGroup", { GroupName: name, Strategy: strategy, ...(strategy === "partition" ? { PartitionCount: Number(partitions) } : {}), ...(strategy === "spread" ? { SpreadLevel: spread } : {}), ...tagSpecs("placement-group", tags) })
        flash.success(`Successfully created placement group ${name}.`)
        return "/ec2/placement-groups"
      }}
    >
      <Container header={<Header variant="h2">Placement group settings</Header>}>
        <SpaceBetween size="m">
          <FormField label="Name"><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
          <FormField label="Placement strategy" description="Determines how the instances are placed on the underlying hardware.">
            <RadioGroup
              value={strategy}
              onChange={({ detail }) => setStrategy(detail.value)}
              items={[
                { value: "cluster", label: "Cluster", description: "Packs instances close together inside an Availability Zone for low-latency, high-throughput node-to-node communication." },
                { value: "spread", label: "Spread", description: "Strictly places a small group of instances across distinct underlying hardware to reduce correlated failures." },
                { value: "partition", label: "Partition", description: "Spreads instances across logical partitions so that groups in one partition do not share hardware with groups in another." },
              ]}
            />
          </FormField>
          {strategy === "partition" && <FormField label="Number of partitions"><Input type="number" value={partitions} onChange={({ detail }) => setPartitions(detail.value)} /></FormField>}
          {strategy === "spread" && <FormField label="Spread level"><RadioGroup value={spread} onChange={({ detail }) => setSpread(detail.value)} items={[{ value: "rack", label: "Rack" }, { value: "host", label: "Host" }]} /></FormField>}
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">Tags - <i>optional</i></Header>}><TagEditor tags={tags} onChange={setTags} /></Container>
    </Ec2CreatePage>
  )
}

function CreateKeyPairPage() {
  const [form, setForm] = useState({ name: "", type: "rsa", format: "pem", tags: [] as Tag[] })
  return (
    <Ec2CreatePage
      title="Create key pair"
      description="A key pair, consisting of a private key and a public key, is a set of security credentials that you use to prove your identity when connecting to an instance."
      listTitle="Key pairs"
      listHref="/ec2/key-pairs"
      submitLabel="Create key pair"
      onSubmit={async () => {
        const name = await createKeyPair(form)
        flash.success(`Successfully created key pair ${name}.`)
        return "/ec2/key-pairs"
      }}
    >
      <Container header={<Header variant="h2">Key pair</Header>}>
        <SpaceBetween size="m"><KeyPairFields form={form} onChange={setForm} /></SpaceBetween>
      </Container>
    </Ec2CreatePage>
  )
}

function ImportKeyPairPage() {
  const [name, setName] = useState("")
  const [material, setMaterial] = useState("")
  return (
    <Ec2CreatePage
      title="Import key pair"
      description="Import a public key that you created with a third-party tool."
      listTitle="Key pairs"
      listHref="/ec2/key-pairs"
      submitLabel="Import key pair"
      onSubmit={async () => {
        await callAws("ec2", "ImportKeyPair", { KeyName: name, PublicKeyMaterial: btoa(material.trim()) })
        flash.success(`Successfully imported key pair ${name}.`)
        return "/ec2/key-pairs"
      }}
    >
      <Container header={<Header variant="h2">Key pair</Header>}>
        <SpaceBetween size="m">
          <FormField label="Name"><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
          <FormField label="Public key contents" stretch><Textarea rows={6} value={material} placeholder="ssh-rsa AAAA..." onChange={({ detail }) => setMaterial(detail.value)} /></FormField>
        </SpaceBetween>
      </Container>
    </Ec2CreatePage>
  )
}

function CreateNetworkInterfacePage() {
  const [description, setDescription] = useState("")
  const [vpcId, setVpcId] = useState("")
  const [subnetId, setSubnetId] = useState("")
  const [privateIp, setPrivateIp] = useState("")
  const [groups, setGroups] = useState<string[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const sgs = useList<Item>("DescribeSecurityGroups", "SecurityGroups")
  return (
    <Ec2CreatePage
      title="Create network interface"
      description="An elastic network interface is a logical networking component in a VPC that represents a virtual network card."
      listTitle="Network interfaces"
      listHref="/ec2/network-interfaces"
      submitLabel="Create network interface"
      onSubmit={async () => {
        if (!subnetId) throw new Error("Select a subnet.")
        const result = await callAws<{ NetworkInterface?: { NetworkInterfaceId?: string } }>("ec2", "CreateNetworkInterface", { SubnetId: subnetId, ...(description ? { Description: description } : {}), ...(privateIp ? { PrivateIpAddress: privateIp } : {}), ...(groups.length ? { Groups: groups } : {}), ...tagSpecs("network-interface", tags) })
        const id = result.NetworkInterface?.NetworkInterfaceId as string
        flash.success(`Successfully created network interface ${id}.`)
        return `/ec2/network-interfaces/${id}`
      }}
    >
      <Container header={<Header variant="h2">Details</Header>}>
        <SpaceBetween size="m">
          <FormField label={<>Description - <i>optional</i></>}><Input value={description} onChange={({ detail }) => setDescription(detail.value)} /></FormField>
          <FormField label="VPC"><VpcSelect value={vpcId} onChange={(id) => { setVpcId(id); setSubnetId("") }} /></FormField>
          <FormField label="Subnet"><SubnetSelect vpcId={vpcId} value={subnetId} onChange={setSubnetId} /></FormField>
          <FormField label="Private IPv4 address" description="Leave empty to auto-assign."><Input value={privateIp} onChange={({ detail }) => setPrivateIp(detail.value)} /></FormField>
          <FormField label="Security groups"><Multiselect selectedOptions={groups.map((id) => ({ value: id, label: id }))} onChange={({ detail }) => setGroups(detail.selectedOptions.map((o) => o.value!))} options={sgs.items.filter((g) => !vpcId || g.VpcId === vpcId).map((g) => ({ value: s(g.GroupId), label: s(g.GroupName), description: s(g.GroupId) }))} /></FormField>
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">Tags - <i>optional</i></Header>}><TagEditor tags={tags} onChange={setTags} /></Container>
      <Alert type="info">Network interfaces created here can be attached to instances in the same Availability Zone.</Alert>
    </Ec2CreatePage>
  )
}

export const storageCreatePages: Record<string, ComponentType> = {
  volumes: CreateVolumePage,
  snapshots: CreateSnapshotPage,
  "placement-groups": CreatePlacementGroupPage,
  "key-pairs": CreateKeyPairPage,
  "network-interfaces": CreateNetworkInterfacePage,
  "key-pairs/import": ImportKeyPairPage,
}
