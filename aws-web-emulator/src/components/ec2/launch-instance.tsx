"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import ExpandableSection from "@cloudscape-design/components/expandable-section"
import FormField from "@cloudscape-design/components/form-field"
import Grid from "@cloudscape-design/components/grid"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Multiselect from "@cloudscape-design/components/multiselect"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Textarea from "@cloudscape-design/components/textarea"
import Tiles from "@cloudscape-design/components/tiles"
import Alert from "@cloudscape-design/components/alert"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import type { Item } from "@/components/ec2-family/engine"
import { Ec2Layout } from "@/components/ec2/ec2-app"
import { CreateKeyPairModal } from "@/components/ec2/key-pair-modal"
import { SubnetSelect, VpcSelect, useList } from "@/components/vpc/shared"
import { callAws, useAws } from "@/lib/aws"

const s = (value: unknown) => (value === undefined || value === null ? undefined : String(value))
const families = [
  { id: "amazon", label: "Amazon Linux", match: /amzn|al20|amazon/i },
  { id: "ubuntu", label: "Ubuntu", match: /ubuntu/i },
  { id: "windows", label: "Windows", match: /windows/i },
  { id: "redhat", label: "Red Hat", match: /rhel|red ?hat/i },
  { id: "suse", label: "SUSE Linux", match: /suse|sles/i },
  { id: "debian", label: "Debian", match: /debian/i },
]

export function LaunchInstancePage() {
  const router = useRouter()
  const images = useList<Item>("DescribeImages", "Images", { Owners: ["amazon", "self"], MaxResults: 1000 })
  const types = useList<Item>("DescribeInstanceTypes", "InstanceTypes", { MaxResults: 100, Filters: [{ Name: "current-generation", Values: ["true"] }] })
  const keys = useList<Item>("DescribeKeyPairs", "KeyPairs")
  const groups = useList<Item>("DescribeSecurityGroups", "SecurityGroups")
  const vpcs = useList<Item>("DescribeVpcs", "Vpcs")
  const profiles = useAws<{ InstanceProfiles?: Item[] }>("iam", "ListInstanceProfiles", {})
  const [name, setName] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  const [family, setFamily] = useState("amazon")
  const [image, setImage] = useState("")
  const [type, setType] = useState("t3.micro")
  const [keyName, setKeyName] = useState("")
  const [keyModal, setKeyModal] = useState(false)
  const [vpcId, setVpcId] = useState("")
  const [subnetId, setSubnetId] = useState("")
  const [publicIp, setPublicIp] = useState("enable")
  const [firewall, setFirewall] = useState("create")
  const [existing, setExisting] = useState<string[]>([])
  const [ssh, setSsh] = useState(true)
  const [https, setHttps] = useState(false)
  const [http, setHttp] = useState(false)
  const [size, setSize] = useState("8")
  const [volumeType, setVolumeType] = useState("gp3")
  const [count, setCount] = useState("1")
  const [profile, setProfile] = useState("")
  const [shutdown, setShutdown] = useState("stop")
  const [termination, setTermination] = useState(false)
  const [monitoring, setMonitoring] = useState(false)
  const [userData, setUserData] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()

  const pattern = families.find((f) => f.id === family)?.match
  const familyImages = images.items.filter((img) => pattern?.test(`${img.Name} ${img.Description}`))
  const chosenImage = images.items.find((img) => img.ImageId === image) ?? familyImages[0]
  const defaultVpc = vpcs.items.find((vpc) => vpc.IsDefault)
  const effectiveVpc = vpcId || s(defaultVpc?.VpcId) || ""
  const chosenType = types.items.find((t) => t.InstanceType === type)

  async function launch() {
    setSaving(true)
    setError(undefined)
    try {
      if (!chosenImage) throw new Error("Choose an Amazon Machine Image (AMI).")
      let groupIds = existing
      if (firewall === "create") {
        const existingNames = groups.items.map((g) => g.GroupName)
        let index = 1
        while (existingNames.includes(`launch-wizard-${index}`)) index++
        const groupName = `launch-wizard-${index}`
        const created = await callAws<{ GroupId?: string }>("ec2", "CreateSecurityGroup", { GroupName: groupName, Description: `${groupName} created ${new Date().toISOString()}`, VpcId: effectiveVpc })
        const permissions = [ssh && 22, https && 443, http && 80].filter(Boolean).map((port) => ({ IpProtocol: "tcp", FromPort: port, ToPort: port, IpRanges: [{ CidrIp: "0.0.0.0/0" }] }))
        if (permissions.length) await callAws("ec2", "AuthorizeSecurityGroupIngress", { GroupId: created.GroupId, IpPermissions: permissions })
        groupIds = [created.GroupId as string]
      }
      const allTags = [...(name ? [{ Key: "Name", Value: name }] : []), ...tags.filter((tag) => tag.Key && tag.Key !== "Name").map((tag) => ({ Key: tag.Key, Value: tag.Value ?? "" }))]
      const result = await callAws<{ Instances?: Item[] }>("ec2", "RunInstances", {
        ImageId: chosenImage.ImageId,
        InstanceType: type,
        MinCount: Number(count),
        MaxCount: Number(count),
        ...(keyName ? { KeyName: keyName } : {}),
        NetworkInterfaces: [{ DeviceIndex: 0, AssociatePublicIpAddress: publicIp === "enable", ...(subnetId ? { SubnetId: subnetId } : {}), Groups: groupIds }],
        BlockDeviceMappings: [{ DeviceName: s(chosenImage.RootDeviceName) ?? "/dev/xvda", Ebs: { VolumeSize: Number(size), VolumeType: volumeType, DeleteOnTermination: true } }],
        ...(profile ? { IamInstanceProfile: { Arn: profile } } : {}),
        InstanceInitiatedShutdownBehavior: shutdown,
        DisableApiTermination: termination,
        Monitoring: { Enabled: monitoring },
        ...(userData ? { UserData: btoa(userData) } : {}),
        ...(allTags.length ? { TagSpecifications: [{ ResourceType: "instance", Tags: allTags }] } : {}),
      })
      const ids = (result.Instances ?? []).map((instance) => instance.InstanceId).join(", ")
      flash.success(`Successfully initiated launch of instance (${ids})`)
      router.push("/ec2/instances")
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Ec2Layout breadcrumbs={[{ text: "Instances", href: "/ec2/instances" }, { text: "Launch an instance", href: "/ec2/launch-instance" }]} contentType="form">
      <ContentLayout
        header={<Header variant="h1" info={<Link variant="info">Info</Link>} description="Amazon EC2 allows you to create virtual machines, or instances, that run on the AWS Cloud. Quickly get started by following the simple steps below.">Launch an instance</Header>}
      >
        <Grid gridDefinition={[{ colspan: { default: 12, m: 8 } }, { colspan: { default: 12, m: 4 } }]}>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>}>Name and tags</Header>}>
              <SpaceBetween size="m">
                <FormField label="Name" stretch><Input value={name} placeholder="e.g. My Web Server" onChange={({ detail }) => setName(detail.value)} /></FormField>
                <ExpandableSection headerText="Add additional tags">
                  <TagEditor tags={tags} onChange={setTags} />
                </ExpandableSection>
              </SpaceBetween>
            </Container>

            <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>} description="An AMI contains the operating system, application server, and applications for your instance. If you don't see a suitable AMI below, use the search field or choose Browse more AMIs.">Application and OS Images (Amazon Machine Image)</Header>}>
              <SpaceBetween size="m">
                <FormField label="Quick Start" stretch>
                  <Tiles value={family} onChange={({ detail }) => { setFamily(detail.value); setImage("") }} columns={6} items={families.map((f) => ({ value: f.id, label: f.label }))} />
                </FormField>
                <FormField label="Amazon Machine Image (AMI)" stretch>
                  <Select
                    filteringType="auto"
                    statusType={images.isPending ? "loading" : "finished"}
                    selectedOption={chosenImage ? { value: s(chosenImage.ImageId), label: s(chosenImage.Name), description: `${chosenImage.ImageId} (${chosenImage.Architecture})` } : null}
                    placeholder="Choose an AMI"
                    onChange={({ detail }) => setImage(detail.selectedOption.value ?? "")}
                    options={(familyImages.length ? familyImages : images.items).slice(0, 200).map((img) => ({ value: s(img.ImageId), label: s(img.Name), description: `${img.ImageId} (${img.Architecture}) · ${img.RootDeviceType}` }))}
                    empty="No AMIs found"
                  />
                </FormField>
                {chosenImage && (
                  <KeyValuePairs
                    columns={4}
                    items={[
                      { label: "Description", value: s(chosenImage.Description) ?? "–" },
                      { label: "Architecture", value: s(chosenImage.Architecture) },
                      { label: "AMI ID", value: s(chosenImage.ImageId) },
                      { label: "Boot mode", value: s(chosenImage.BootMode) ?? "–" },
                    ]}
                  />
                )}
              </SpaceBetween>
            </Container>

            <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>}>Instance type</Header>}>
              <FormField label="Instance type" stretch>
                <Select
                  filteringType="auto"
                  selectedOption={{ value: type, label: type, description: chosenType ? `Family: ${s(chosenType.InstanceType)?.split(".")[0]} · ${(chosenType.VCpuInfo as Item | undefined)?.DefaultVCpus} vCPU · ${Number((chosenType.MemoryInfo as Item | undefined)?.SizeInMiB ?? 0) / 1024} GiB Memory` : undefined }}
                  onChange={({ detail }) => setType(detail.selectedOption.value ?? "t3.micro")}
                  options={types.items.map((t) => ({ value: s(t.InstanceType), label: s(t.InstanceType), description: `${(t.VCpuInfo as Item | undefined)?.DefaultVCpus} vCPU · ${Number((t.MemoryInfo as Item | undefined)?.SizeInMiB ?? 0) / 1024} GiB Memory` }))}
                />
              </FormField>
            </Container>

            <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>} description="You can use a key pair to securely connect to your instance. Ensure that you have access to the selected key pair before you launch the instance.">Key pair (login)</Header>}>
              <FormField label="Key pair name - required" secondaryControl={<Button onClick={() => setKeyModal(true)}>Create new key pair</Button>} stretch>
                <Select
                  selectedOption={keyName ? { value: keyName, label: keyName } : { value: "", label: "Proceed without a key pair (Not recommended)" }}
                  onChange={({ detail }) => setKeyName(detail.selectedOption.value ?? "")}
                  options={[{ value: "", label: "Proceed without a key pair (Not recommended)" }, ...keys.items.map((k) => ({ value: s(k.KeyName), label: s(k.KeyName), description: s(k.KeyType) }))]}
                />
              </FormField>
            </Container>

            <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>}>Network settings</Header>}>
              <SpaceBetween size="m">
                <FormField label="VPC"><VpcSelect value={effectiveVpc} onChange={(id) => { setVpcId(id); setSubnetId("") }} /></FormField>
                <FormField label="Subnet">
                  <SubnetSelect vpcId={effectiveVpc} value={subnetId} onChange={setSubnetId} />
                </FormField>
                <FormField label="Auto-assign public IP"><Select selectedOption={{ value: publicIp, label: publicIp === "enable" ? "Enable" : "Disable" }} onChange={({ detail }) => setPublicIp(detail.selectedOption.value ?? "enable")} options={[{ value: "enable", label: "Enable" }, { value: "disable", label: "Disable" }]} /></FormField>
                <FormField label="Firewall (security groups)" description="A security group is a set of firewall rules that control the traffic for your instance. Add rules to allow specific traffic to reach your instance.">
                  <Tiles value={firewall} onChange={({ detail }) => setFirewall(detail.value)} columns={2} items={[{ value: "create", label: "Create security group" }, { value: "existing", label: "Select existing security group" }]} />
                </FormField>
                {firewall === "create" ? (
                  <SpaceBetween size="xs">
                    <Box>We&apos;ll create a new security group called &apos;launch-wizard&apos; with the following rules:</Box>
                    <Checkbox checked={ssh} onChange={({ detail }) => setSsh(detail.checked)} description="Helps you connect to your instance">Allow SSH traffic from Anywhere (0.0.0.0/0)</Checkbox>
                    <Checkbox checked={https} onChange={({ detail }) => setHttps(detail.checked)} description="To set up an endpoint, for example when creating a web server">Allow HTTPS traffic from the internet</Checkbox>
                    <Checkbox checked={http} onChange={({ detail }) => setHttp(detail.checked)} description="To set up an endpoint, for example when creating a web server">Allow HTTP traffic from the internet</Checkbox>
                    {(ssh || https || http) && <Alert type="warning">Rules with source of 0.0.0.0/0 allow all IP addresses to access your instance. We recommend setting security group rules to allow access from known IP addresses only.</Alert>}
                  </SpaceBetween>
                ) : (
                  <FormField label="Common security groups">
                    <Multiselect selectedOptions={existing.map((id) => ({ value: id, label: id }))} onChange={({ detail }) => setExisting(detail.selectedOptions.map((o) => o.value!))} options={groups.items.filter((g) => g.VpcId === effectiveVpc).map((g) => ({ value: s(g.GroupId), label: s(g.GroupName), description: s(g.GroupId) }))} placeholder="Select security groups" />
                  </FormField>
                )}
              </SpaceBetween>
            </Container>

            <Container header={<Header variant="h2" info={<Link variant="info">Info</Link>}>Configure storage</Header>}>
              <SpaceBetween direction="horizontal" size="xs">
                <Box padding={{ top: "xs" }}>1x</Box>
                <Input type="number" value={size} onChange={({ detail }) => setSize(detail.value)} />
                <Box padding={{ top: "xs" }}>GiB</Box>
                <Select selectedOption={{ value: volumeType, label: volumeType }} onChange={({ detail }) => setVolumeType(detail.selectedOption.value ?? "gp3")} options={["gp3", "gp2", "io1", "io2", "st1", "sc1", "standard"].map((value) => ({ value, label: value }))} />
                <Box padding={{ top: "xs" }}>Root volume, Not encrypted</Box>
              </SpaceBetween>
            </Container>

            <Container>
              <ExpandableSection headerText="Advanced details" variant="footer">
                <SpaceBetween size="m">
                  <FormField label="IAM instance profile">
                    <Select selectedOption={{ value: profile, label: profile ? profile.split("/").pop() : "Select" }} onChange={({ detail }) => setProfile(detail.selectedOption.value ?? "")} options={[{ value: "", label: "None" }, ...(profiles.data?.InstanceProfiles ?? []).map((p) => ({ value: s(p.Arn), label: s(p.InstanceProfileName) }))]} />
                  </FormField>
                  <FormField label="Shutdown behavior"><Select selectedOption={{ value: shutdown, label: shutdown === "stop" ? "Stop" : "Terminate" }} onChange={({ detail }) => setShutdown(detail.selectedOption.value ?? "stop")} options={[{ value: "stop", label: "Stop" }, { value: "terminate", label: "Terminate" }]} /></FormField>
                  <FormField label="Termination protection"><RadioGroup value={termination ? "on" : "off"} onChange={({ detail }) => setTermination(detail.value === "on")} items={[{ value: "on", label: "Enable" }, { value: "off", label: "Disable" }]} /></FormField>
                  <FormField label="Detailed CloudWatch monitoring"><RadioGroup value={monitoring ? "on" : "off"} onChange={({ detail }) => setMonitoring(detail.value === "on")} items={[{ value: "on", label: "Enable" }, { value: "off", label: "Disable" }]} /></FormField>
                  <FormField label={<>User data - <i>optional</i></>} stretch><Textarea rows={6} value={userData} onChange={({ detail }) => setUserData(detail.value)} /></FormField>
                </SpaceBetween>
              </ExpandableSection>
            </Container>
          </SpaceBetween>

          <div className="myaws-sticky-summary">
            <Container header={<Header variant="h2">Summary</Header>}>
              <SpaceBetween size="m">
                <FormField label="Number of instances"><Input type="number" value={count} onChange={({ detail }) => setCount(detail.value)} /></FormField>
                <KeyValuePairs
                  items={[
                    { label: "Software Image (AMI)", value: chosenImage ? `${chosenImage.Name} (${chosenImage.ImageId})` : "–" },
                    { label: "Virtual server type (instance type)", value: type },
                    { label: "Firewall (security group)", value: firewall === "create" ? "New security group" : existing.join(", ") || "–" },
                    { label: "Storage (volumes)", value: `1 volume(s) - ${size} GiB` },
                  ]}
                />
                {error && <Alert type="error">{error}</Alert>}
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => router.push("/ec2/instances")}>Cancel</Button>
                  <Button variant="primary" loading={saving} onClick={() => void launch()}>Launch instance</Button>
                </SpaceBetween>
              </SpaceBetween>
            </Container>
          </div>
        </Grid>
      </ContentLayout>
      {keyModal && <CreateKeyPairModal close={() => setKeyModal(false)} onCreated={(created) => { setKeyName(created); void keys.refetch() }} />}
    </Ec2Layout>
  )
}
