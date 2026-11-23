"use client"

import Container from "@cloudscape-design/components/container"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Multiselect from "@cloudscape-design/components/multiselect"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Tiles from "@cloudscape-design/components/tiles"
import { useState, type ComponentType, type ReactNode } from "react"
import { flash } from "@/components/console/flash"
import type { Tag } from "@/components/console/tag-editor"
import { nameTag, type Item } from "@/components/ec2-family/engine"
import { CreatePage } from "@/components/vpc/create-pages"
import { PrefixEntryEditor } from "@/components/vpc/defs-network"
import { SubnetSelect, tagSpec, useList, VpcSelect } from "@/components/vpc/shared"
import { callAws } from "@/lib/aws"

type Spec = { title: string; description: string; listTitle: string; listHref: string; resourceType: string; settings: string }

function NamedCreate({ spec, valid, submit, children }: { spec: Spec; valid?: () => string | undefined; submit: (tags: unknown) => Promise<string>; children: (name: string) => ReactNode }) {
  const [name, setName] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  return (
    <CreatePage
      title={spec.title}
      description={spec.description}
      listTitle={spec.listTitle}
      listHref={spec.listHref}
      submitLabel={spec.title}
      tags={tags}
      onTags={setTags}
      onSubmit={async () => {
        const problem = valid?.()
        if (problem) throw new Error(problem)
        const id = await submit(tagSpec(spec.resourceType, name || undefined, tags))
        flash.success(`${spec.title.replace(/^Create /, "").replace(/^./, (c) => c.toUpperCase())} ${id} was created successfully.`)
        return `${spec.listHref}/${id}`
      }}
    >
      <Container header={<Header variant="h2">{spec.settings}</Header>}>
        <SpaceBetween size="m">
          <FormField label={<>Name - <i>optional</i></>} description="Create a tag with a key of 'Name' and a value that you specify." stretch>
            <Input value={name} onChange={({ detail }) => setName(detail.value)} />
          </FormField>
          {children(name)}
        </SpaceBetween>
      </Container>
    </CreatePage>
  )
}

const withTags = (tags: unknown) => (tags ? { TagSpecifications: tags } : {})

function CreateNatPage() {
  const [vpcId, setVpcId] = useState("")
  const [subnetId, setSubnetId] = useState("")
  const [type, setType] = useState("public")
  const [eip, setEip] = useState("auto")
  const addresses = useList<Item>("DescribeAddresses", "Addresses")
  return (
    <NamedCreate
      spec={{ title: "Create NAT gateway", description: "A highly available, managed Network Address Translation (NAT) service that instances in private subnets can use to connect to services in other VPCs, on-premises networks, or the internet.", listTitle: "NAT gateways", listHref: "/vpc/nat-gateways", resourceType: "natgateway", settings: "NAT gateway settings" }}
      valid={() => (!subnetId ? "Choose a subnet." : undefined)}
      submit={async (tags) => {
        let allocation = eip === "auto" ? undefined : eip
        if (type === "public" && !allocation) allocation = (await callAws<{ AllocationId?: string }>("ec2", "AllocateAddress", { Domain: "vpc" })).AllocationId
        const result = await callAws<{ NatGateway?: { NatGatewayId?: string } }>("ec2", "CreateNatGateway", { SubnetId: subnetId, ConnectivityType: type, ...(type === "public" ? { AllocationId: allocation } : {}), ...withTags(tags) })
        return result.NatGateway?.NatGatewayId as string
      }}
    >
      {() => (
        <>
          <FormField label="Availability mode" description="Choose whether to deploy across all zones in the region or restrict to a single availability zone.">
            <Tiles value="zonal" items={[{ value: "regional", label: "Regional - new", description: "Scales automatically across all regional AZs, simplifying management for multi AZ deployments.", disabled: true }, { value: "zonal", label: "Zonal", description: "Provides granular control within a specific availability zone, adhering to subnet level settings." }]} />
          </FormField>
          <FormField label="VPC"><VpcSelect value={vpcId} onChange={(id) => { setVpcId(id); setSubnetId("") }} /></FormField>
          <FormField label="Subnet" description="Select a subnet in which to create the NAT gateway."><SubnetSelect vpcId={vpcId} value={subnetId} onChange={setSubnetId} /></FormField>
          <FormField label="Connectivity type" description="Select a connectivity type for the NAT gateway.">
            <RadioGroup value={type} onChange={({ detail }) => setType(detail.value)} items={[{ value: "public", label: "Public" }, { value: "private", label: "Private" }]} />
          </FormField>
          {type === "public" && (
            <FormField label="Elastic IP allocation ID" description="Assign an Elastic IP address to the NAT gateway.">
              <Select
                selectedOption={{ value: eip, label: eip === "auto" ? "Allocate Elastic IP" : eip }}
                onChange={({ detail }) => setEip(detail.selectedOption.value ?? "auto")}
                options={[{ value: "auto", label: "Allocate Elastic IP" }, ...addresses.items.filter((a) => !a.AssociationId).map((a) => ({ value: String(a.AllocationId), label: String(a.AllocationId), description: String(a.PublicIp) }))]}
              />
            </FormField>
          )}
        </>
      )}
    </NamedCreate>
  )
}

function CreatePrefixListPage() {
  const [name, setName] = useState("")
  const [max, setMax] = useState("10")
  const [family, setFamily] = useState("IPv4")
  const [entries, setEntries] = useState<{ cidr: string; description: string }[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  return (
    <CreatePage
      title="Create prefix list"
      description="Create a prefix list to easily refer to CIDR blocks."
      listTitle="Managed prefix lists"
      listHref="/vpc/prefix-lists"
      submitLabel="Create prefix list"
      tags={tags}
      onTags={setTags}
      onSubmit={async () => {
        const result = await callAws<{ PrefixList?: { PrefixListId?: string } }>("ec2", "CreateManagedPrefixList", {
          PrefixListName: name,
          MaxEntries: Number(max),
          AddressFamily: family,
          Entries: entries.filter((e) => e.cidr).map((e) => ({ Cidr: e.cidr, ...(e.description ? { Description: e.description } : {}) })),
          ...withTags(tagSpec("prefix-list", undefined, tags)),
        })
        const id = result.PrefixList?.PrefixListId as string
        flash.success(`Prefix list ${id} was created successfully.`)
        return `/vpc/prefix-lists/${id}`
      }}
    >
      <Container header={<Header variant="h2">Prefix list settings</Header>}>
        <SpaceBetween size="m">
          <FormField label="Prefix list name"><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
          <FormField label="Max entries"><Input type="number" value={max} onChange={({ detail }) => setMax(detail.value)} /></FormField>
          <FormField label="Address family" constraintText="Address family cannot be changed after the prefix list is created.">
            <RadioGroup value={family} onChange={({ detail }) => setFamily(detail.value)} items={[{ value: "IPv4", label: "IPv4" }, { value: "IPv6", label: "IPv6" }]} />
          </FormField>
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2" description="Each entry consists of a CIDR block and, optionally, a description for the CIDR block.">Prefix list entries</Header>}>
        <PrefixEntryEditor entries={entries} onChange={setEntries} />
      </Container>
    </CreatePage>
  )
}

function CreateEndpointPage() {
  const [type, setType] = useState("aws")
  const [service, setService] = useState("")
  const [vpcId, setVpcId] = useState("")
  const [subnets, setSubnets] = useState<string[]>([])
  const [tables, setTables] = useState<string[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const services = useList<Item>("DescribeVpcEndpointServices", "ServiceDetails")
  const subnetList = useList<Item>("DescribeSubnets", "Subnets")
  const tableList = useList<Item>("DescribeRouteTables", "RouteTables")
  const groupList = useList<Item>("DescribeSecurityGroups", "SecurityGroups")
  const selected = services.items.find((detail) => detail.ServiceName === service)
  const gateway = (selected?.ServiceType as { ServiceType?: string }[] | undefined)?.[0]?.ServiceType === "Gateway"
  const inVpc = <T extends Item>(items: T[]) => items.filter((item) => item.VpcId === vpcId)
  return (
    <NamedCreate
      spec={{ title: "Create endpoint", description: "There are three types of VPC endpoints – Interface endpoints, Gateway Load Balancer endpoints, and Gateway endpoints.", listTitle: "Endpoints", listHref: "/vpc/endpoints", resourceType: "vpc-endpoint", settings: "Endpoint settings" }}
      valid={() => (!service || !vpcId ? "Choose a service and a VPC." : undefined)}
      submit={async (tags) => {
        const result = await callAws<{ VpcEndpoint?: { VpcEndpointId?: string } }>("ec2", "CreateVpcEndpoint", {
          VpcId: vpcId,
          ServiceName: service,
          VpcEndpointType: gateway ? "Gateway" : "Interface",
          ...(gateway ? { RouteTableIds: tables } : { SubnetIds: subnets, SecurityGroupIds: groups }),
          ...withTags(tags),
        })
        return result.VpcEndpoint?.VpcEndpointId as string
      }}
    >
      {() => (
        <>
          <FormField label="Type">
            <Tiles value={type} onChange={({ detail }) => setType(detail.value)} columns={3} items={[{ value: "aws", label: "AWS services", description: "Services provided by Amazon" }, { value: "partner", label: "PrivateLink Ready partner services", disabled: true }, { value: "marketplace", label: "AWS Marketplace services", disabled: true }]} />
          </FormField>
          <FormField label="Services">
            <Select
              filteringType="auto"
              placeholder="Choose a service"
              selectedOption={service ? { value: service, label: service } : null}
              onChange={({ detail }) => setService(detail.selectedOption.value ?? "")}
              options={services.items.map((detail) => ({ value: String(detail.ServiceName), label: String(detail.ServiceName), tags: [(detail.ServiceType as { ServiceType?: string }[] | undefined)?.[0]?.ServiceType ?? ""] }))}
            />
          </FormField>
          <FormField label="VPC"><VpcSelect value={vpcId} onChange={setVpcId} /></FormField>
          {vpcId && gateway && (
            <FormField label="Route tables">
              <Multiselect selectedOptions={tables.map((id) => ({ value: id, label: id }))} onChange={({ detail }) => setTables(detail.selectedOptions.map((o) => o.value!))} options={inVpc(tableList.items).map((t) => ({ value: String(t.RouteTableId), label: String(t.RouteTableId), description: nameTag(t) }))} placeholder="Choose route tables" />
            </FormField>
          )}
          {vpcId && !gateway && (
            <>
              <FormField label="Subnets">
                <Multiselect selectedOptions={subnets.map((id) => ({ value: id, label: id }))} onChange={({ detail }) => setSubnets(detail.selectedOptions.map((o) => o.value!))} options={inVpc(subnetList.items).map((t) => ({ value: String(t.SubnetId), label: String(t.SubnetId), description: String(t.AvailabilityZone) }))} placeholder="Choose subnets" />
              </FormField>
              <FormField label="Security groups">
                <Multiselect selectedOptions={groups.map((id) => ({ value: id, label: id }))} onChange={({ detail }) => setGroups(detail.selectedOptions.map((o) => o.value!))} options={inVpc(groupList.items).map((t) => ({ value: String(t.GroupId), label: String(t.GroupId), description: String(t.GroupName) }))} placeholder="Choose security groups" />
              </FormField>
            </>
          )}
        </>
      )}
    </NamedCreate>
  )
}

function CreatePeeringPage() {
  const [requester, setRequester] = useState("")
  const [accepter, setAccepter] = useState("")
  return (
    <NamedCreate
      spec={{ title: "Create peering connection", description: "A VPC peering connection is a networking connection between two VPCs that enables you to route traffic between them privately.", listTitle: "Peering connections", listHref: "/vpc/peering", resourceType: "vpc-peering-connection", settings: "Peering connection settings" }}
      valid={() => (!requester || !accepter ? "Choose a requester and an accepter VPC." : undefined)}
      submit={async (tags) => (await callAws<{ VpcPeeringConnection?: { VpcPeeringConnectionId?: string } }>("ec2", "CreateVpcPeeringConnection", { VpcId: requester, PeerVpcId: accepter, ...withTags(tags) })).VpcPeeringConnection?.VpcPeeringConnectionId as string}
    >
      {() => (
        <>
          <FormField label="VPC ID (Requester)" description="Select a local VPC to peer with."><VpcSelect value={requester} onChange={setRequester} /></FormField>
          <FormField label="Account"><RadioGroup value="mine" items={[{ value: "mine", label: "My account" }, { value: "other", label: "Another account", disabled: true }]} /></FormField>
          <FormField label="Region"><RadioGroup value="this" items={[{ value: "this", label: "This Region" }, { value: "other", label: "Another Region", disabled: true }]} /></FormField>
          <FormField label="VPC ID (Accepter)"><VpcSelect value={accepter} onChange={setAccepter} /></FormField>
        </>
      )}
    </NamedCreate>
  )
}

function CreateCustomerGatewayPage() {
  const [ip, setIp] = useState("")
  const [asn, setAsn] = useState("65000")
  const [device, setDevice] = useState("")
  return (
    <NamedCreate
      spec={{ title: "Create customer gateway", description: "A customer gateway is a resource that you create in AWS that represents the customer gateway device in your on-premises network.", listTitle: "Customer gateways", listHref: "/vpc/customer-gateways", resourceType: "customer-gateway", settings: "Details" }}
      submit={async (tags) => (await callAws<{ CustomerGateway?: { CustomerGatewayId?: string } }>("ec2", "CreateCustomerGateway", { Type: "ipsec.1", BgpAsn: Number(asn), IpAddress: ip, ...(device ? { DeviceName: device } : {}), ...withTags(tags) })).CustomerGateway?.CustomerGatewayId as string}
    >
      {() => (
        <>
          <FormField label="BGP ASN" constraintText="The ASN of your customer gateway device."><Input value={asn} onChange={({ detail }) => setAsn(detail.value)} /></FormField>
          <FormField label="IP address" description="Specify the IP address for your customer gateway device's external interface."><Input value={ip} onChange={({ detail }) => setIp(detail.value)} /></FormField>
          <FormField label={<>Device - <i>optional</i></>}><Input value={device} onChange={({ detail }) => setDevice(detail.value)} /></FormField>
        </>
      )}
    </NamedCreate>
  )
}

function CreateVgwPage() {
  const [asn, setAsn] = useState("")
  return (
    <NamedCreate
      spec={{ title: "Create virtual private gateway", description: "A virtual private gateway is the VPN concentrator on the Amazon side of the Site-to-Site VPN connection.", listTitle: "Virtual private gateways", listHref: "/vpc/vpn-gateways", resourceType: "vpn-gateway", settings: "Details" }}
      submit={async (tags) => (await callAws<{ VpnGateway?: { VpnGatewayId?: string } }>("ec2", "CreateVpnGateway", { Type: "ipsec.1", ...(asn ? { AmazonSideAsn: Number(asn) } : {}), ...withTags(tags) })).VpnGateway?.VpnGatewayId as string}
    >
      {() => (
        <FormField label="Autonomous System Number (ASN)" description="Leave empty to use the Amazon default ASN."><Input value={asn} placeholder="64512" onChange={({ detail }) => setAsn(detail.value)} /></FormField>
      )}
    </NamedCreate>
  )
}

function CreateVpnConnectionPage() {
  const [cgw, setCgw] = useState("")
  const [vgw, setVgw] = useState("")
  const [routing, setRouting] = useState("static")
  const cgws = useList<Item>("DescribeCustomerGateways", "CustomerGateways")
  const vgws = useList<Item>("DescribeVpnGateways", "VpnGateways")
  return (
    <NamedCreate
      spec={{ title: "Create VPN connection", description: "Select the target gateway and customer gateway that you would like to connect via a VPN connection.", listTitle: "VPN connections", listHref: "/vpc/vpn-connections", resourceType: "vpn-connection", settings: "Details" }}
      valid={() => (!cgw || !vgw ? "Choose a virtual private gateway and a customer gateway." : undefined)}
      submit={async (tags) => (await callAws<{ VpnConnection?: { VpnConnectionId?: string } }>("ec2", "CreateVpnConnection", { Type: "ipsec.1", CustomerGatewayId: cgw, VpnGatewayId: vgw, Options: { StaticRoutesOnly: routing === "static" }, ...withTags(tags) })).VpnConnection?.VpnConnectionId as string}
    >
      {() => (
        <>
          <FormField label="Virtual private gateway"><Select selectedOption={vgw ? { value: vgw, label: vgw } : null} placeholder="Select" onChange={({ detail }) => setVgw(detail.selectedOption.value ?? "")} options={vgws.items.map((g) => ({ value: String(g.VpnGatewayId), label: String(g.VpnGatewayId) }))} /></FormField>
          <FormField label="Customer gateway ID"><Select selectedOption={cgw ? { value: cgw, label: cgw } : null} placeholder="Select" onChange={({ detail }) => setCgw(detail.selectedOption.value ?? "")} options={cgws.items.map((g) => ({ value: String(g.CustomerGatewayId), label: String(g.CustomerGatewayId), description: String(g.IpAddress) }))} /></FormField>
          <FormField label="Routing options"><RadioGroup value={routing} onChange={({ detail }) => setRouting(detail.value)} items={[{ value: "dynamic", label: "Dynamic (requires BGP)" }, { value: "static", label: "Static" }]} /></FormField>
        </>
      )}
    </NamedCreate>
  )
}

function CreateTgwPage() {
  const [description, setDescription] = useState("")
  const [asn, setAsn] = useState("")
  return (
    <NamedCreate
      spec={{ title: "Create transit gateway", description: "A transit gateway (TGW) is a network transit hub that interconnects attachments (VPCs and VPNs) within the same AWS account or across AWS accounts.", listTitle: "Transit gateways", listHref: "/vpc/transit-gateways", resourceType: "transit-gateway", settings: "Details - optional" }}
      submit={async (tags) => (await callAws<{ TransitGateway?: { TransitGatewayId?: string } }>("ec2", "CreateTransitGateway", { ...(description ? { Description: description } : {}), ...(asn ? { Options: { AmazonSideAsn: Number(asn) } } : {}), ...withTags(tags) })).TransitGateway?.TransitGatewayId as string}
    >
      {() => (
        <>
          <FormField label="Description"><Input value={description} onChange={({ detail }) => setDescription(detail.value)} /></FormField>
          <FormField label="Amazon side Autonomous System Number (ASN)"><Input value={asn} placeholder="64512" onChange={({ detail }) => setAsn(detail.value)} /></FormField>
        </>
      )}
    </NamedCreate>
  )
}

function CreateTgwAttachmentPage() {
  const [tgw, setTgw] = useState("")
  const [vpcId, setVpcId] = useState("")
  const [subnets, setSubnets] = useState<string[]>([])
  const tgws = useList<Item>("DescribeTransitGateways", "TransitGateways")
  const subnetList = useList<Item>("DescribeSubnets", "Subnets")
  return (
    <NamedCreate
      spec={{ title: "Create transit gateway attachment", description: "Attach a VPC to a transit gateway.", listTitle: "Transit gateway attachments", listHref: "/vpc/transit-gateway-attachments", resourceType: "transit-gateway-attachment", settings: "Details" }}
      valid={() => (!tgw || !vpcId || !subnets.length ? "Choose a transit gateway, a VPC, and subnets." : undefined)}
      submit={async (tags) => (await callAws<{ TransitGatewayVpcAttachment?: { TransitGatewayAttachmentId?: string } }>("ec2", "CreateTransitGatewayVpcAttachment", { TransitGatewayId: tgw, VpcId: vpcId, SubnetIds: subnets, ...withTags(tags) })).TransitGatewayVpcAttachment?.TransitGatewayAttachmentId as string}
    >
      {() => (
        <>
          <FormField label="Transit gateway ID"><Select selectedOption={tgw ? { value: tgw, label: tgw } : null} placeholder="Select" onChange={({ detail }) => setTgw(detail.selectedOption.value ?? "")} options={tgws.items.map((g) => ({ value: String(g.TransitGatewayId), label: String(g.TransitGatewayId) }))} /></FormField>
          <FormField label="Attachment type"><RadioGroup value="vpc" items={[{ value: "vpc", label: "VPC" }]} /></FormField>
          <FormField label="VPC ID"><VpcSelect value={vpcId} onChange={setVpcId} /></FormField>
          <FormField label="Subnet IDs"><Multiselect selectedOptions={subnets.map((id) => ({ value: id, label: id }))} onChange={({ detail }) => setSubnets(detail.selectedOptions.map((o) => o.value!))} options={subnetList.items.filter((s) => s.VpcId === vpcId).map((s) => ({ value: String(s.SubnetId), label: String(s.SubnetId), description: String(s.AvailabilityZone) }))} placeholder="Choose subnets" /></FormField>
        </>
      )}
    </NamedCreate>
  )
}

function CreateEndpointServicePage() {
  const [nlb, setNlb] = useState("")
  const [accept, setAccept] = useState(true)
  return (
    <NamedCreate
      spec={{ title: "Create endpoint service", description: "Create a VPC endpoint service powered by AWS PrivateLink.", listTitle: "Endpoint services", listHref: "/vpc/endpoint-services", resourceType: "vpc-endpoint-service", settings: "Endpoint service settings" }}
      valid={() => (!nlb ? "Enter a Network Load Balancer ARN." : undefined)}
      submit={async (tags) => (await callAws<{ ServiceConfiguration?: { ServiceId?: string } }>("ec2", "CreateVpcEndpointServiceConfiguration", { NetworkLoadBalancerArns: [nlb], AcceptanceRequired: accept, ...withTags(tags) })).ServiceConfiguration?.ServiceId as string}
    >
      {() => (
        <>
          <FormField label="Load balancer ARN" description="Network Load Balancer to associate with the service."><Input value={nlb} onChange={({ detail }) => setNlb(detail.value)} /></FormField>
          <FormField label="Require acceptance for endpoint"><RadioGroup value={accept ? "yes" : "no"} onChange={({ detail }) => setAccept(detail.value === "yes")} items={[{ value: "yes", label: "Acceptance required" }, { value: "no", label: "Acceptance not required" }]} /></FormField>
        </>
      )}
    </NamedCreate>
  )
}

export const networkCreatePages: Record<string, ComponentType> = {
  "nat-gateways": CreateNatPage,
  "prefix-lists": CreatePrefixListPage,
  endpoints: CreateEndpointPage,
  "endpoint-services": CreateEndpointServicePage,
  peering: CreatePeeringPage,
  "customer-gateways": CreateCustomerGatewayPage,
  "vpn-gateways": CreateVgwPage,
  "vpn-connections": CreateVpnConnectionPage,
  "transit-gateways": CreateTgwPage,
  "transit-gateway-attachments": CreateTgwAttachmentPage,
}
