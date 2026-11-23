"use client"


import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState, type ComponentType, type ReactNode } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { tagSpec, VpcSelect, useList } from "@/components/vpc/shared"
import { VpcLayout } from "@/components/vpc/vpc-app"
import { securityCreatePages } from "@/components/vpc/create-security"
import { networkCreatePages } from "@/components/vpc/create-network"
import { callAws } from "@/lib/aws"

export function CreatePage({
  title,
  description,
  listTitle,
  listHref,
  submitLabel,
  onSubmit,
  children,
  tags,
  onTags,
  tagsDescription = "A tag is a label that you assign to an AWS resource. Each tag consists of a key and an optional value. You can use tags to search and filter your resources or track your AWS costs.",
}: {
  title: string
  description?: ReactNode
  listTitle: string
  listHref: string
  submitLabel: string
  onSubmit: () => Promise<string>
  children: ReactNode
  tags?: Tag[]
  onTags?: (tags: Tag[]) => void
  tagsDescription?: string
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <VpcLayout breadcrumbs={[{ text: listTitle, href: listHref }, { text: title, href: `${listHref}/create` }]} contentType="form">
      <Form
        header={<Header variant="h1" info={<Link variant="info">Info</Link>} description={description}>{title}</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push(listHref)}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={async () => {
                setSaving(true)
                setError(undefined)
                try {
                  const target = await onSubmit()
                  router.push(target)
                } catch (caught) {
                  setError(errorMessage(caught))
                } finally {
                  setSaving(false)
                }
              }}
            >
              {submitLabel}
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          {children}
          {tags && onTags && (
            <Container header={<Header variant="h2" description={tagsDescription}>Tags - <i>optional</i></Header>}>
              <TagEditor tags={tags} onChange={onTags} emptyText="No tags associated with the resource." />
            </Container>
          )}
        </SpaceBetween>
      </Form>
    </VpcLayout>
  )
}

function useZones() {
  return useQuery({
    queryKey: ["emulator", "aws", "ec2", "DescribeAvailabilityZones", "names"],
    queryFn: async () => ((await callAws<{ AvailabilityZones?: { ZoneName?: string; ZoneId?: string }[] }>("ec2", "DescribeAvailabilityZones", {})).AvailabilityZones ?? []),
  })
}

type SubnetForm = { name: string; zone: string; cidr: string; tags: Tag[] }

function CreateSubnetPage() {
  const zones = useZones()
  const [vpcId, setVpcId] = useState("")
  const vpcs = useList<{ VpcId?: string; CidrBlock?: string }>("DescribeVpcs", "Vpcs")
  const vpc = vpcs.items.find((item) => item.VpcId === vpcId)
  const [subnets, setSubnets] = useState<SubnetForm[]>([{ name: "", zone: "", cidr: "", tags: [] }])
  return (
    <CreatePage
      title="Create subnet"
      listTitle="Subnets"
      listHref="/vpc/subnets"
      submitLabel="Create subnet"
      onSubmit={async () => {
        if (!vpcId) throw new Error("Select a VPC first to create new subnets.")
        const ids: string[] = []
        for (const subnet of subnets) {
          const result = await callAws<{ Subnet?: { SubnetId?: string } }>("ec2", "CreateSubnet", {
            VpcId: vpcId,
            CidrBlock: subnet.cidr,
            ...(subnet.zone ? { AvailabilityZone: subnet.zone } : {}),
            ...(tagSpec("subnet", subnet.name || undefined, subnet.tags) ? { TagSpecifications: tagSpec("subnet", subnet.name || undefined, subnet.tags) } : {}),
          })
          ids.push(result.Subnet?.SubnetId as string)
        }
        flash.success(`You have successfully created ${ids.length} subnet${ids.length === 1 ? "" : "s"}: ${ids.join(", ")}`)
        return "/vpc/subnets"
      }}
    >
      <Container header={<Header variant="h2">VPC</Header>}>
        <FormField label="VPC ID" description="Create subnets in this VPC.">
          <VpcSelect value={vpcId} onChange={setVpcId} />
        </FormField>
      </Container>
      <Container header={<Header variant="h2" description="Specify the CIDR blocks and Availability Zone for the subnet.">Subnet settings</Header>}>
        {!vpcId ? (
          <span>Select a VPC first to create new subnets.</span>
        ) : (
          <SpaceBetween size="l">
            {subnets.map((subnet, index) => {
              const update = (patch: Partial<SubnetForm>) => setSubnets(subnets.map((item, i) => (i === index ? { ...item, ...patch } : item)))
              return (
                <Container key={index} header={<Header variant="h3" actions={subnets.length > 1 ? <Button onClick={() => setSubnets(subnets.filter((_, i) => i !== index))}>Remove</Button> : undefined}>Subnet {index + 1} of {subnets.length}</Header>}>
                  <SpaceBetween size="m">
                    <FormField label="Subnet name" description="Create a tag with a key of 'Name' and a value that you specify." constraintText="The name can be up to 256 characters long.">
                      <Input value={subnet.name} placeholder="my-subnet-01" onChange={({ detail }) => update({ name: detail.value })} />
                    </FormField>
                    <FormField label="Availability Zone" description="Choose the zone in which your subnet will reside, or let Amazon choose one for you.">
                      <Select
                        selectedOption={{ value: subnet.zone, label: subnet.zone || "No preference" }}
                        onChange={({ detail }) => update({ zone: detail.selectedOption.value ?? "" })}
                        options={[{ value: "", label: "No preference" }, ...(zones.data ?? []).map((zone) => ({ value: zone.ZoneName, label: `${zone.ZoneName} (${zone.ZoneId})` }))]}
                      />
                    </FormField>
                    <FormField label="IPv4 VPC CIDR block"><span>{vpc?.CidrBlock}</span></FormField>
                    <FormField label="IPv4 subnet CIDR block" constraintText="Subnet CIDR blocks must be between /16 and /28 and within the VPC CIDR block.">
                      <Input value={subnet.cidr} placeholder="10.0.0.0/24" onChange={({ detail }) => update({ cidr: detail.value })} />
                    </FormField>
                    <FormField label={<>Tags - <i>optional</i></>} stretch>
                      <TagEditor tags={subnet.tags} onChange={(tags) => update({ tags })} />
                    </FormField>
                  </SpaceBetween>
                </Container>
              )
            })}
            <Button onClick={() => setSubnets([...subnets, { name: "", zone: "", cidr: "", tags: [] }])}>Add new subnet</Button>
          </SpaceBetween>
        )}
      </Container>
    </CreatePage>
  )
}

function SimpleNamedCreate({
  title,
  description,
  listTitle,
  listHref,
  submitLabel,
  resourceType,
  withVpc,
  create,
  settingsTitle,
}: {
  title: string
  description: string
  listTitle: string
  listHref: string
  submitLabel: string
  resourceType: string
  withVpc?: boolean
  settingsTitle: string
  create: (input: { name: string; vpcId: string; tagSpecifications?: unknown }) => Promise<string>
}) {
  const [name, setName] = useState("")
  const [vpcId, setVpcId] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  return (
    <CreatePage
      title={title}
      description={description}
      listTitle={listTitle}
      listHref={listHref}
      submitLabel={submitLabel}
      tags={tags}
      onTags={setTags}
      onSubmit={async () => {
        if (withVpc && !vpcId) throw new Error("Select a VPC.")
        const id = await create({ name, vpcId, tagSpecifications: tagSpec(resourceType, name || undefined, tags) })
        flash.success(`${title.replace("Create ", "").replace(/^./, (c) => c.toUpperCase())} ${id} was created successfully.`)
        return `${listHref}/${id}`
      }}
    >
      <Container header={<Header variant="h2">{settingsTitle}</Header>}>
        <SpaceBetween size="m">
          <FormField label={<>Name {withVpc ? "" : "tag "}- <i>optional</i></>} description="Create a tag with a key of 'Name' and a value that you specify." stretch>
            <Input value={name} onChange={({ detail }) => setName(detail.value)} />
          </FormField>
          {withVpc && (
            <FormField label="VPC" description={`The VPC to use for this ${resourceType.replaceAll("-", " ")}.`}>
              <VpcSelect value={vpcId} onChange={setVpcId} />
            </FormField>
          )}
        </SpaceBetween>
      </Container>
    </CreatePage>
  )
}

function CreateRouteTablePage() {
  return (
    <SimpleNamedCreate
      title="Create route table"
      description="A route table specifies how packets are forwarded between the subnets within your VPC, the internet, and your VPN connection."
      listTitle="Route tables"
      listHref="/vpc/route-tables"
      submitLabel="Create route table"
      settingsTitle="Route table settings"
      resourceType="route-table"
      withVpc
      create={async ({ vpcId, tagSpecifications }) => (await callAws<{ RouteTable?: { RouteTableId?: string } }>("ec2", "CreateRouteTable", { VpcId: vpcId, ...(tagSpecifications ? { TagSpecifications: tagSpecifications } : {}) })).RouteTable?.RouteTableId as string}
    />
  )
}

function CreateIgwPage() {
  return (
    <SimpleNamedCreate
      title="Create internet gateway"
      description="An internet gateway is a virtual router that connects a VPC to the internet. To create a new internet gateway specify the name for the gateway below."
      listTitle="Internet gateways"
      listHref="/vpc/igws"
      submitLabel="Create internet gateway"
      settingsTitle="Internet gateway settings"
      resourceType="internet-gateway"
      create={async ({ tagSpecifications }) => (await callAws<{ InternetGateway?: { InternetGatewayId?: string } }>("ec2", "CreateInternetGateway", tagSpecifications ? { TagSpecifications: tagSpecifications } : {})).InternetGateway?.InternetGatewayId as string}
    />
  )
}

function CreateEigwPage() {
  return (
    <SimpleNamedCreate
      title="Create egress only internet gateway"
      description="An egress-only internet gateway is a horizontally scaled, redundant, and highly available VPC component that allows outbound communication over IPv6 from instances in your VPC to the internet."
      listTitle="Egress-only internet gateways"
      listHref="/vpc/egress-only-igws"
      submitLabel="Create egress only internet gateway"
      settingsTitle="Egress only internet gateway settings"
      resourceType="egress-only-internet-gateway"
      withVpc
      create={async ({ vpcId, tagSpecifications }) => (await callAws<{ EgressOnlyInternetGateway?: { EgressOnlyInternetGatewayId?: string } }>("ec2", "CreateEgressOnlyInternetGateway", { VpcId: vpcId, ...(tagSpecifications ? { TagSpecifications: tagSpecifications } : {}) })).EgressOnlyInternetGateway?.EgressOnlyInternetGatewayId as string}
    />
  )
}

function CreateDhcpPage() {
  const [name, setName] = useState("")
  const [form, setForm] = useState({ domain: "", servers: "AmazonProvidedDNS", ntp: "", netbios: "", nodeType: "", lease: "" })
  const [tags, setTags] = useState<Tag[]>([])
  const list = (value: string) => value.split(",").map((part) => part.trim()).filter(Boolean)
  return (
    <CreatePage
      title="Create DHCP option set"
      description="DHCP option sets give you control over the following aspects of routing in your virtual network."
      listTitle="DHCP option sets"
      listHref="/vpc/dhcp-options"
      submitLabel="Create DHCP option set"
      tags={tags}
      onTags={setTags}
      onSubmit={async () => {
        const configurations = [
          ["domain-name", list(form.domain)],
          ["domain-name-servers", list(form.servers)],
          ["ntp-servers", list(form.ntp)],
          ["netbios-name-servers", list(form.netbios)],
          ["netbios-node-type", list(form.nodeType)],
          ["ipv6-address-preferred-lease-time", list(form.lease)],
        ].filter(([, values]) => values.length).map(([Key, Values]) => ({ Key, Values }))
        const result = await callAws<{ DhcpOptions?: { DhcpOptionsId?: string } }>("ec2", "CreateDhcpOptions", { DhcpConfigurations: configurations, ...(tagSpec("dhcp-options", name || undefined, tags) ? { TagSpecifications: tagSpec("dhcp-options", name || undefined, tags) } : {}) })
        const id = result.DhcpOptions?.DhcpOptionsId as string
        flash.success(`DHCP option set ${id} was created successfully.`)
        return `/vpc/dhcp-options/${id}`
      }}
    >
      <Container header={<Header variant="h2">DHCP option set settings</Header>}>
        <SpaceBetween size="m">
          <FormField label={<>Name - <i>optional</i></>}><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">DHCP options</Header>}>
        <SpaceBetween size="m">
          <FormField label="Domain name" description="Specify the domain name for your option set."><Input value={form.domain} placeholder="example.com" onChange={({ detail }) => setForm({ ...form, domain: detail.value })} /></FormField>
          <FormField label="Domain name servers" constraintText="Enter up to four IPv4 addresses separated by commas, or AmazonProvidedDNS."><Input value={form.servers} onChange={({ detail }) => setForm({ ...form, servers: detail.value })} /></FormField>
          <FormField label="NTP servers" constraintText="Enter up to four IPv4 addresses separated by commas."><Input value={form.ntp} onChange={({ detail }) => setForm({ ...form, ntp: detail.value })} /></FormField>
          <FormField label="NetBIOS name servers"><Input value={form.netbios} onChange={({ detail }) => setForm({ ...form, netbios: detail.value })} /></FormField>
          <FormField label="NetBIOS node type">
            <Select selectedOption={{ value: form.nodeType, label: form.nodeType || "Select a NetBIOS node type" }} onChange={({ detail }) => setForm({ ...form, nodeType: detail.selectedOption.value ?? "" })} options={["", "1", "2", "4", "8"].map((value) => ({ value, label: value || "None" }))} />
          </FormField>
          <FormField label="IPv6 preferred lease time" constraintText="140 to 2147483647 seconds."><Input value={form.lease} onChange={({ detail }) => setForm({ ...form, lease: detail.value })} /></FormField>
        </SpaceBetween>
      </Container>
    </CreatePage>
  )
}

function AllocateAddressPage() {
  const [border, setBorder] = useState("")
  const [pool, setPool] = useState("amazon")
  const [tags, setTags] = useState<Tag[]>([])
  const zones = useZones()
  return (
    <CreatePage
      title="Allocate Elastic IP address"
      description="Allocate an Elastic IP address by selecting the public IPv4 pool from which the public IP address is to be allocated."
      listTitle="Elastic IP addresses"
      listHref="/vpc/addresses"
      submitLabel="Allocate"
      tags={tags}
      onTags={setTags}
      onSubmit={async () => {
        const result = await callAws<{ AllocationId?: string; PublicIp?: string }>("ec2", "AllocateAddress", { Domain: "vpc", ...(border ? { NetworkBorderGroup: border } : {}), ...(tagSpec("elastic-ip", undefined, tags) ? { TagSpecifications: tagSpec("elastic-ip", undefined, tags) } : {}) })
        flash.success(`Elastic IP address allocated successfully. Elastic IP address ${result.PublicIp}`)
        return "/vpc/addresses"
      }}
    >
      <Container header={<Header variant="h2">Elastic IP address settings</Header>}>
        <SpaceBetween size="m">
          <FormField label="Network border group">
            <Select
              selectedOption={{ value: border, label: border || zones.data?.[0]?.ZoneName?.slice(0, -1) || "Default" }}
              onChange={({ detail }) => setBorder(detail.selectedOption.value ?? "")}
              options={[{ value: "", label: zones.data?.[0]?.ZoneName?.slice(0, -1) ?? "Default" }]}
            />
          </FormField>
          <FormField label="Public IPv4 address pool">
            <RadioGroup
              value={pool}
              onChange={({ detail }) => setPool(detail.value)}
              items={[
                { value: "amazon", label: "Amazon's pool of IPv4 addresses" },
                { value: "ipam", label: "Public IPv4 address that you bring to your AWS account with IPAM", disabled: true },
                { value: "byoip", label: "Public IPv4 address that you bring to your AWS account", disabled: true },
                { value: "coip", label: "Customer-owned pool of IPv4 addresses", disabled: true },
              ]}
            />
          </FormField>
        </SpaceBetween>
      </Container>
    </CreatePage>
  )
}

export const vpcCreatePages: Record<string, ComponentType> = {
  subnets: CreateSubnetPage,
  "route-tables": CreateRouteTablePage,
  igws: CreateIgwPage,
  "egress-only-igws": CreateEigwPage,
  "dhcp-options": CreateDhcpPage,
  addresses: AllocateAddressPage,
  ...securityCreatePages,
  ...networkCreatePages,
}


