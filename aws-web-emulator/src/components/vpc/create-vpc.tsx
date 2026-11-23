"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
import ColumnLayout from "@cloudscape-design/components/column-layout"
import Container from "@cloudscape-design/components/container"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import SegmentedControl from "@cloudscape-design/components/segmented-control"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Tiles from "@cloudscape-design/components/tiles"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { tagSpec } from "@/components/vpc/shared"
import { VpcLayout } from "@/components/vpc/vpc-app"
import { callAws } from "@/lib/aws"

function splitCidr(cidr: string, count: number, offset: number) {
  // Splits a /16-/24 block into /20-style subnets by stepping the third octet.
  const [base, bits] = cidr.split("/")
  const prefix = Number(bits)
  const parts = base.split(".").map(Number)
  const subnetBits = Math.min(prefix + 4, 28)
  const size = 2 ** (32 - subnetBits)
  const start = ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
  return Array.from({ length: count }, (_, index) => {
    const value = start + (offset + index) * size
    return `${(value >>> 24) & 255}.${(value >>> 16) & 255}.${(value >>> 8) & 255}.${value & 255}/${subnetBits}`
  })
}

export function CreateVpcPage() {
  const router = useRouter()
  const zones = useQuery({
    queryKey: ["emulator", "aws", "ec2", "DescribeAvailabilityZones"],
    queryFn: async () => ((await callAws<{ AvailabilityZones?: { ZoneName?: string }[] }>("ec2", "DescribeAvailabilityZones", {})).AvailabilityZones ?? []).map((zone) => zone.ZoneName as string),
  })
  const [mode, setMode] = useState("vpc")
  const [name, setName] = useState("")
  const [auto, setAuto] = useState(true)
  const [project, setProject] = useState("project")
  const [cidr, setCidr] = useState("10.0.0.0/16")
  const [ipv6, setIpv6] = useState("none")
  const [tenancy, setTenancy] = useState("default")
  const [azs, setAzs] = useState("2")
  const [publicCount, setPublicCount] = useState("2")
  const [privateCount, setPrivateCount] = useState("2")
  const [nat, setNat] = useState("none")
  const [endpoint, setEndpoint] = useState("s3")
  const [dnsHostnames, setDnsHostnames] = useState(true)
  const [dnsResolution, setDnsResolution] = useState(true)
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const [error, setError] = useState<string>()
  const azNames = (zones.data ?? ["ap-southeast-7a", "ap-southeast-7b", "ap-southeast-7c"]).slice(0, Number(azs))
  const prefix = auto ? project : ""
  const cidrValid = /^(\d{1,3}\.){3}\d{1,3}\/(1[6-9]|2[0-8])$/.test(cidr)
  const pubSubnets = Number(publicCount) ? azNames.map((zone, index) => ({ zone, cidr: splitCidr(cidr, 1, index)[0], name: `${prefix}-subnet-public${index + 1}-${zone}` })) : []
  const privCount = Number(privateCount)
  const privSubnets = Array.from({ length: privCount }, (_, index) => {
    const zone = azNames[index % azNames.length]
    return { zone, cidr: splitCidr(cidr, 1, 8 + index)[0], name: `${prefix}-subnet-private${index + 1}-${zone}` }
  })

  async function create() {
    setError(undefined)
    if (!cidrValid) {
      setError("CIDR block size must be between /16 and /28.")
      return
    }
    setSaving(true)
    const log = (line: string) => setProgress((current) => [...current, line])
    try {
      const vpcName = mode === "vpc" ? name : `${prefix}-vpc`
      const vpc = await callAws<{ Vpc?: { VpcId?: string } }>("ec2", "CreateVpc", {
        CidrBlock: cidr,
        InstanceTenancy: tenancy,
        ...(ipv6 === "amazon" ? { AmazonProvidedIpv6CidrBlock: true } : {}),
        ...(tagSpec("vpc", vpcName || undefined, tags) ? { TagSpecifications: tagSpec("vpc", vpcName || undefined, tags) } : {}),
      })
      const vpcId = vpc.Vpc?.VpcId as string
      log(`Create VPC: ${vpcId}`)
      if (mode === "more") {
        await callAws("ec2", "ModifyVpcAttribute", { VpcId: vpcId, EnableDnsSupport: { Value: dnsResolution } })
        await callAws("ec2", "ModifyVpcAttribute", { VpcId: vpcId, EnableDnsHostnames: { Value: dnsHostnames } })
        log("Enable DNS settings")
        const publicIds: string[] = []
        for (const subnet of pubSubnets) {
          const result = await callAws<{ Subnet?: { SubnetId?: string } }>("ec2", "CreateSubnet", { VpcId: vpcId, CidrBlock: subnet.cidr, AvailabilityZone: subnet.zone, TagSpecifications: tagSpec("subnet", subnet.name) })
          publicIds.push(result.Subnet?.SubnetId as string)
          log(`Create subnet: ${result.Subnet?.SubnetId}`)
        }
        const privateIds: string[] = []
        for (const subnet of privSubnets) {
          const result = await callAws<{ Subnet?: { SubnetId?: string } }>("ec2", "CreateSubnet", { VpcId: vpcId, CidrBlock: subnet.cidr, AvailabilityZone: subnet.zone, TagSpecifications: tagSpec("subnet", subnet.name) })
          privateIds.push(result.Subnet?.SubnetId as string)
          log(`Create subnet: ${result.Subnet?.SubnetId}`)
        }
        let igwId: string | undefined
        if (publicIds.length) {
          const igw = await callAws<{ InternetGateway?: { InternetGatewayId?: string } }>("ec2", "CreateInternetGateway", { TagSpecifications: tagSpec("internet-gateway", `${prefix}-igw`) })
          igwId = igw.InternetGateway?.InternetGatewayId
          await callAws("ec2", "AttachInternetGateway", { InternetGatewayId: igwId, VpcId: vpcId })
          log(`Create internet gateway: ${igwId}`)
          const rtb = await callAws<{ RouteTable?: { RouteTableId?: string } }>("ec2", "CreateRouteTable", { VpcId: vpcId, TagSpecifications: tagSpec("route-table", `${prefix}-rtb-public`) })
          const rtbId = rtb.RouteTable?.RouteTableId
          await callAws("ec2", "CreateRoute", { RouteTableId: rtbId, DestinationCidrBlock: "0.0.0.0/0", GatewayId: igwId })
          for (const subnetId of publicIds) await callAws("ec2", "AssociateRouteTable", { RouteTableId: rtbId, SubnetId: subnetId })
          log(`Create route table: ${rtbId}`)
        }
        let natId: string | undefined
        if (nat !== "none" && publicIds.length && privateIds.length) {
          const eip = await callAws<{ AllocationId?: string }>("ec2", "AllocateAddress", { Domain: "vpc", TagSpecifications: tagSpec("elastic-ip", `${prefix}-eip`) })
          const natResult = await callAws<{ NatGateway?: { NatGatewayId?: string } }>("ec2", "CreateNatGateway", { SubnetId: publicIds[0], AllocationId: eip.AllocationId, TagSpecifications: tagSpec("natgateway", `${prefix}-nat-public1`) })
          natId = natResult.NatGateway?.NatGatewayId
          log(`Create NAT gateway: ${natId}`)
        }
        const privateTables: string[] = []
        for (const [index, subnetId] of privateIds.entries()) {
          const rtb = await callAws<{ RouteTable?: { RouteTableId?: string } }>("ec2", "CreateRouteTable", { VpcId: vpcId, TagSpecifications: tagSpec("route-table", `${prefix}-rtb-private${index + 1}`) })
          const rtbId = rtb.RouteTable?.RouteTableId as string
          privateTables.push(rtbId)
          if (natId) await callAws("ec2", "CreateRoute", { RouteTableId: rtbId, DestinationCidrBlock: "0.0.0.0/0", NatGatewayId: natId })
          await callAws("ec2", "AssociateRouteTable", { RouteTableId: rtbId, SubnetId: subnetId })
          log(`Create route table: ${rtbId}`)
        }
        if (endpoint === "s3") {
          const region = (await callAws<{ AvailabilityZones?: { RegionName?: string }[] }>("ec2", "DescribeAvailabilityZones", {})).AvailabilityZones?.[0]?.RegionName ?? "ap-southeast-7"
          const vpce = await callAws<{ VpcEndpoint?: { VpcEndpointId?: string } }>("ec2", "CreateVpcEndpoint", { VpcId: vpcId, ServiceName: `com.amazonaws.${region}.s3`, VpcEndpointType: "Gateway", RouteTableIds: privateTables, TagSpecifications: tagSpec("vpc-endpoint", `${prefix}-vpce-s3`) })
          log(`Create VPC endpoint: ${vpce.VpcEndpoint?.VpcEndpointId}`)
        }
      }
      flash.success(`You successfully created ${vpcId} / ${vpcName || vpcId}`)
      router.push(`/vpc/vpcs/${vpcId}`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <VpcLayout breadcrumbs={[{ text: "Your VPCs", href: "/vpc/vpcs" }, { text: "Create VPC", href: "/vpc/vpcs/create" }]} contentType="form">
      <Form
        header={<Header variant="h1" info={<Link variant="info">Info</Link>} description="A VPC is an isolated portion of the AWS Cloud populated by AWS objects, such as Amazon EC2 instances.">Create VPC</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push("/vpc/vpcs")}>Cancel</Button>
            <Button disabled disabledReason="Code preview isn't available in the local emulator.">Preview code</Button>
            <Button variant="primary" loading={saving} onClick={() => void create()}>Create VPC</Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">VPC settings</Header>}>
            <SpaceBetween size="l">
              <FormField label="Resources to create" description="Create only the VPC resource or the VPC and other networking resources.">
                <Tiles value={mode} onChange={({ detail }) => setMode(detail.value)} columns={2} items={[{ value: "vpc", label: "VPC only" }, { value: "more", label: "VPC and more" }]} />
              </FormField>
              {mode === "vpc" ? (
                <FormField label={<>Name tag - <i>optional</i></>} description="Creates a tag with a key of 'Name' and a value that you specify." stretch>
                  <Input value={name} placeholder="my-vpc-01" onChange={({ detail }) => setName(detail.value)} />
                </FormField>
              ) : (
                <FormField label="Name tag auto-generation" description="Enter a value for the Name tag. This value will be used to auto-generate Name tags for all resources in the VPC." stretch>
                  <SpaceBetween size="xs">
                    <Checkbox checked={auto} onChange={({ detail }) => setAuto(detail.checked)}>Auto-generate</Checkbox>
                    <Input value={project} disabled={!auto} onChange={({ detail }) => setProject(detail.value)} />
                  </SpaceBetween>
                </FormField>
              )}
              <FormField label="IPv4 CIDR block">
                <RadioGroup value="manual" items={[{ value: "manual", label: "IPv4 CIDR manual input" }, { value: "ipam", label: "IPAM-allocated IPv4 CIDR block", disabled: true }]} />
              </FormField>
              <FormField label="IPv4 CIDR" constraintText="CIDR block size must be between /16 and /28." errorText={!cidrValid && cidr ? "Enter a valid CIDR block." : undefined}>
                <Input value={cidr} onChange={({ detail }) => setCidr(detail.value)} />
              </FormField>
              <FormField label="IPv6 CIDR block">
                <RadioGroup
                  value={ipv6}
                  onChange={({ detail }) => setIpv6(detail.value)}
                  items={[
                    { value: "none", label: "No IPv6 CIDR block" },
                    { value: "ipam", label: "IPAM-allocated IPv6 CIDR block", disabled: true },
                    { value: "amazon", label: "Amazon-provided IPv6 CIDR block" },
                    { value: "owned", label: "IPv6 CIDR owned by me", disabled: true },
                  ]}
                />
              </FormField>
              <FormField label="Tenancy">
                <Select selectedOption={{ value: tenancy, label: tenancy === "default" ? "Default" : "Dedicated" }} onChange={({ detail }) => setTenancy(detail.selectedOption.value ?? "default")} options={[{ value: "default", label: "Default" }, { value: "dedicated", label: "Dedicated" }]} />
              </FormField>
              {mode === "more" && (
                <>
                  <FormField label="Number of Availability Zones (AZs)" description="Choose the number of AZs in which to provision subnets.">
                    <SegmentedControl selectedId={azs} onChange={({ detail }) => setAzs(detail.selectedId)} options={["1", "2", "3"].map((id) => ({ id, text: id }))} />
                  </FormField>
                  <FormField label="Number of public subnets" description="The number of public subnets to add to your VPC.">
                    <SegmentedControl selectedId={publicCount} onChange={({ detail }) => setPublicCount(detail.selectedId)} options={["0", azs].map((id) => ({ id, text: id }))} />
                  </FormField>
                  <FormField label="Number of private subnets" description="The number of private subnets to add to your VPC.">
                    <SegmentedControl selectedId={privateCount} onChange={({ detail }) => setPrivateCount(detail.selectedId)} options={["0", azs, String(Number(azs) * 2)].map((id) => ({ id, text: id }))} />
                  </FormField>
                  <FormField label="NAT gateways ($)" description="Choose the number of Availability Zones in which to create NAT gateways.">
                    <SegmentedControl selectedId={nat} onChange={({ detail }) => setNat(detail.selectedId)} options={[{ id: "none", text: "None" }, { id: "1az", text: "In 1 AZ" }]} />
                  </FormField>
                  <FormField label="VPC endpoints" description="Endpoints can help reduce NAT gateway charges and improve security by accessing S3 directly from the VPC.">
                    <SegmentedControl selectedId={endpoint} onChange={({ detail }) => setEndpoint(detail.selectedId)} options={[{ id: "none", text: "None" }, { id: "s3", text: "S3 Gateway" }]} />
                  </FormField>
                  <FormField label="DNS options">
                    <SpaceBetween size="xs">
                      <Checkbox checked={dnsHostnames} onChange={({ detail }) => setDnsHostnames(detail.checked)}>Enable DNS hostnames</Checkbox>
                      <Checkbox checked={dnsResolution} onChange={({ detail }) => setDnsResolution(detail.checked)}>Enable DNS resolution</Checkbox>
                    </SpaceBetween>
                  </FormField>
                </>
              )}
            </SpaceBetween>
          </Container>
          {mode === "more" && (
            <Container header={<Header variant="h2" description="The resources that will be created in your VPC.">Preview</Header>}>
              <ColumnLayout columns={4} variant="text-grid">
                <div><Box variant="h4">VPC</Box><Box>{prefix}-vpc</Box></div>
                <div>
                  <Box variant="h4">Subnets ({pubSubnets.length + privSubnets.length})</Box>
                  {[...pubSubnets, ...privSubnets].map((subnet) => <Box key={subnet.name} variant="small">{subnet.name} · {subnet.cidr}</Box>)}
                </div>
                <div>
                  <Box variant="h4">Route tables ({(pubSubnets.length ? 1 : 0) + privSubnets.length})</Box>
                  {pubSubnets.length > 0 && <Box variant="small">{prefix}-rtb-public</Box>}
                  {privSubnets.map((_, index) => <Box key={index} variant="small">{prefix}-rtb-private{index + 1}</Box>)}
                </div>
                <div>
                  <Box variant="h4">Network connections</Box>
                  {pubSubnets.length > 0 && <Box variant="small">{prefix}-igw</Box>}
                  {nat !== "none" && <Box variant="small">{prefix}-nat-public1</Box>}
                  {endpoint === "s3" && <Box variant="small">{prefix}-vpce-s3</Box>}
                </div>
              </ColumnLayout>
            </Container>
          )}
          {mode === "vpc" && (
            <Container header={<Header variant="h2" description="A tag is a label that you assign to an AWS resource. Each tag consists of a key and an optional value. You can use tags to search and filter your resources or track your AWS costs.">Tags</Header>}>
              <TagEditor tags={tags} onChange={setTags} emptyText="No tags associated with the resource" />
            </Container>
          )}
          {progress.length > 0 && (
            <Alert type={saving ? "info" : "success"} header="Create VPC workflow">
              {progress.map((line) => <div key={line}>{line}</div>)}
            </Alert>
          )}
        </SpaceBetween>
      </Form>
    </VpcLayout>
  )
}
