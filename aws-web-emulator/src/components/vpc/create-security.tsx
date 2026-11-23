"use client"

import Alert from "@cloudscape-design/components/alert"
import Container from "@cloudscape-design/components/container"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import SpaceBetween from "@cloudscape-design/components/space-between"
import { useState, type ComponentType } from "react"
import { flash } from "@/components/console/flash"
import type { Tag } from "@/components/console/tag-editor"
import { CreatePage } from "@/components/vpc/create-pages"
import { RuleEditor, saveRules, type Rule } from "@/components/vpc/sg-rules"
import { tagSpec, VpcSelect } from "@/components/vpc/shared"
import { callAws } from "@/lib/aws"

function CreateSecurityGroupPage() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [vpcId, setVpcId] = useState("")
  const [inbound, setInbound] = useState<Rule[]>([])
  const [outbound, setOutbound] = useState<Rule[]>([{ type: "all", protocol: "-1", from: "", to: "", source: "0.0.0.0/0", description: "" }])
  const [tags, setTags] = useState<Tag[]>([])
  const open = [...inbound, ...outbound].some((rule) => rule.source === "0.0.0.0/0" || rule.source === "::/0")
  return (
    <CreatePage
      title="Create security group"
      description="A security group acts as a virtual firewall for your instance to control inbound and outbound traffic. To create a new security group, complete the fields below."
      listTitle="Security Groups"
      listHref="/vpc/security-groups"
      submitLabel="Create security group"
      tags={tags}
      onTags={setTags}
      onSubmit={async () => {
        if (!name || !description || !vpcId) throw new Error("Enter a security group name, a description, and choose a VPC.")
        const created = await callAws<{ GroupId?: string }>("ec2", "CreateSecurityGroup", {
          GroupName: name,
          Description: description,
          VpcId: vpcId,
          ...(tagSpec("security-group", undefined, tags) ? { TagSpecifications: tagSpec("security-group", undefined, tags) } : {}),
        })
        const groupId = created.GroupId as string
        if (inbound.length) await saveRules(groupId, false, [], inbound)
        const rules = (await callAws<{ SecurityGroupRules?: Record<string, unknown>[] }>("ec2", "DescribeSecurityGroupRules", { Filters: [{ Name: "group-id", Values: [groupId] }] })).SecurityGroupRules ?? []
        const defaults = rules.filter((rule) => rule.IsEgress).map((rule) => ({ id: rule.SecurityGroupRuleId as string, type: "all", protocol: "-1", from: "", to: "", source: String(rule.CidrIpv4 ?? rule.CidrIpv6 ?? ""), description: "" }))
        await saveRules(groupId, true, defaults, outbound.map((rule) => ({ ...rule, id: defaults.find((d) => d.source === rule.source && rule.type === "all")?.id })))
        flash.success(`Security group (${groupId} | ${name}) was created successfully`)
        return `/vpc/security-groups/${groupId}`
      }}
    >
      <Container header={<Header variant="h2">Basic details</Header>}>
        <SpaceBetween size="m">
          <FormField label="Security group name" constraintText="Name cannot be edited after creation."><Input value={name} placeholder="MyWebServerGroup" onChange={({ detail }) => setName(detail.value)} /></FormField>
          <FormField label="Description"><Input value={description} placeholder="Allows SSH access to developers" onChange={({ detail }) => setDescription(detail.value)} /></FormField>
          <FormField label="VPC"><VpcSelect value={vpcId} onChange={setVpcId} /></FormField>
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">Inbound rules</Header>}>
        <RuleEditor rules={inbound} onChange={setInbound} />
      </Container>
      <Container header={<Header variant="h2">Outbound rules</Header>}>
        <RuleEditor rules={outbound} onChange={setOutbound} egress />
      </Container>
      {open && (
        <Alert type="warning">
          Rules with source or destination of 0.0.0.0/0 or ::/0 allow all IP addresses to access your instance. We recommend setting security group rules to allow access from known IP addresses only.
        </Alert>
      )}
    </CreatePage>
  )
}

function CreateNetworkAclPage() {
  const [name, setName] = useState("")
  const [vpcId, setVpcId] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  return (
    <CreatePage
      title="Create network ACL"
      description="A network ACL is an optional layer of security that acts as a firewall for controlling traffic in and out of a subnet."
      listTitle="Network ACLs"
      listHref="/vpc/acls"
      submitLabel="Create network ACL"
      tags={tags}
      onTags={setTags}
      onSubmit={async () => {
        if (!vpcId) throw new Error("Choose a VPC.")
        const result = await callAws<{ NetworkAcl?: { NetworkAclId?: string } }>("ec2", "CreateNetworkAcl", { VpcId: vpcId, ...(tagSpec("network-acl", name || undefined, tags) ? { TagSpecifications: tagSpec("network-acl", name || undefined, tags) } : {}) })
        const id = result.NetworkAcl?.NetworkAclId as string
        flash.success(`Network ACL ${id} was created successfully.`)
        return `/vpc/acls/${id}`
      }}
    >
      <Container header={<Header variant="h2">Network ACL settings</Header>}>
        <SpaceBetween size="m">
          <FormField label={<>Name - <i>optional</i></>} description="Create a tag with a key of 'Name' and a value that you specify."><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
          <FormField label="VPC" description="The VPC to use for this network ACL."><VpcSelect value={vpcId} onChange={setVpcId} /></FormField>
        </SpaceBetween>
      </Container>
    </CreatePage>
  )
}

export const securityCreatePages: Record<string, ComponentType> = {
  "security-groups": CreateSecurityGroupPage,
  acls: CreateNetworkAclPage,
}
