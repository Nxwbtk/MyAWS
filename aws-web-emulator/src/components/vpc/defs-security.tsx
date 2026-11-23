"use client"

import AttributeEditor from "@cloudscape-design/components/attribute-editor"
import Box from "@cloudscape-design/components/box"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import Multiselect from "@cloudscape-design/components/multiselect"
import Select from "@cloudscape-design/components/select"
import { useState } from "react"
import { Copyable, OperationModal, ResourceTableLite, nameTag, type Ctx, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { AclEntries, portRange, protocolName } from "@/components/vpc/defs-more"
import { RuleEditor, ruleFromSgr, saveRules, type Rule } from "@/components/vpc/sg-rules"
import { ResLink, useList } from "@/components/vpc/shared"
import { callAws } from "@/lib/aws"

const s = (value: unknown) => (value === undefined || value === null ? undefined : String(value))
const arr = (value: unknown) => (value as Item[] | undefined) ?? []
const nameCol = { id: "name", label: "Name", value: (item: Item) => nameTag(item) ?? "–", sort: (item: Item) => nameTag(item) }

/* ---------------- Network ACLs ---------------- */

type Entry = { rule: string; protocol: string; port: string; cidr: string; action: string }
const aclProtocols = [
  { value: "-1", label: "All traffic" },
  { value: "6", label: "TCP (6)" },
  { value: "17", label: "UDP (17)" },
  { value: "1", label: "ICMP (1)" },
]

function EditAclEntries({ item, close, ctx, egress }: { item: Item; close: () => void; ctx: Ctx; egress: boolean }) {
  const existing = arr(item.Entries).filter((entry) => Boolean(entry.Egress) === egress && Number(entry.RuleNumber) !== 32767)
  const toEntry = (entry: Item): Entry => ({
    rule: s(entry.RuleNumber) ?? "",
    protocol: s(entry.Protocol) ?? "-1",
    port: entry.PortRange ? portRange(entry.PortRange as Item) ?? "" : "",
    cidr: s(entry.CidrBlock ?? entry.Ipv6CidrBlock) ?? "",
    action: s(entry.RuleAction) ?? "allow",
  })
  const [entries, setEntries] = useState<Entry[]>(existing.map(toEntry))
  const update = (index: number, patch: Partial<Entry>) => setEntries(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  return (
    <OperationModal
      title={`Edit ${egress ? "outbound" : "inbound"} rules`}
      size="large"
      close={close}
      ctx={ctx}
      saveLabel="Save changes"
      success={`Successfully updated ${egress ? "outbound" : "inbound"} rules for ${item.NetworkAclId}.`}
      run={async () => {
        for (const entry of existing) await callAws("ec2", "DeleteNetworkAclEntry", { NetworkAclId: item.NetworkAclId, RuleNumber: entry.RuleNumber, Egress: egress })
        for (const entry of entries) {
          const [from, to = from] = entry.port.split("-").map((part) => Number(part.trim()))
          await callAws("ec2", "CreateNetworkAclEntry", {
            NetworkAclId: item.NetworkAclId,
            RuleNumber: Number(entry.rule),
            Egress: egress,
            Protocol: entry.protocol,
            RuleAction: entry.action,
            ...(entry.cidr.includes(":") ? { Ipv6CidrBlock: entry.cidr } : { CidrBlock: entry.cidr }),
            ...(entry.protocol === "6" || entry.protocol === "17" ? { PortRange: { From: from, To: to } } : {}),
            ...(entry.protocol === "1" ? { IcmpTypeCode: { Type: -1, Code: -1 } } : {}),
          })
        }
      }}
    >
      <AttributeEditor
        items={entries}
        addButtonText="Add new rule"
        removeButtonText="Remove"
        empty="No rules."
        onAddButtonClick={() => setEntries([...entries, { rule: String((entries.length + 1) * 100), protocol: "-1", port: "", cidr: "0.0.0.0/0", action: "allow" }])}
        onRemoveButtonClick={({ detail }) => setEntries(entries.filter((_, index) => index !== detail.itemIndex))}
        definition={[
          { label: "Rule number", control: (entry, index) => <Input value={entry.rule} type="number" onChange={({ detail }) => update(index, { rule: detail.value })} /> },
          { label: "Type", control: (entry, index) => <Select selectedOption={aclProtocols.find((p) => p.value === entry.protocol) ?? null} onChange={({ detail }) => update(index, { protocol: detail.selectedOption.value ?? "-1" })} options={aclProtocols} /> },
          { label: "Port range", control: (entry, index) => <Input value={entry.protocol === "-1" ? "All" : entry.port} disabled={entry.protocol === "-1" || entry.protocol === "1"} placeholder="80 or 1024-65535" onChange={({ detail }) => update(index, { port: detail.value })} /> },
          { label: egress ? "Destination" : "Source", control: (entry, index) => <Input value={entry.cidr} onChange={({ detail }) => update(index, { cidr: detail.value })} /> },
          { label: "Allow/Deny", control: (entry, index) => <Select selectedOption={{ value: entry.action, label: entry.action === "allow" ? "Allow" : "Deny" }} onChange={({ detail }) => update(index, { action: detail.selectedOption.value ?? "allow" })} options={[{ value: "allow", label: "Allow" }, { value: "deny", label: "Deny" }]} /> },
        ]}
      />
      <Box variant="small">The rule with number * (asterisk) denies all traffic that doesn&apos;t match a numbered rule and can&apos;t be changed.</Box>
    </OperationModal>
  )
}

function EditAclSubnets({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const subnets = useList<Item>("DescribeSubnets", "Subnets", { Filters: [{ Name: "vpc-id", Values: [item.VpcId] }] })
  const current = arr(item.Associations).map((a) => s(a.SubnetId)!)
  const [selected, setSelected] = useState<string[]>(current)
  return (
    <OperationModal
      title="Edit subnet associations"
      size="large"
      close={close}
      ctx={ctx}
      saveLabel="Save changes"
      success={`Successfully updated subnet associations for ${item.NetworkAclId}.`}
      run={async () => {
        const acls = (await callAws<{ NetworkAcls?: Item[] }>("ec2", "DescribeNetworkAcls", { Filters: [{ Name: "vpc-id", Values: [item.VpcId] }] })).NetworkAcls ?? []
        const defaultAcl = acls.find((acl) => acl.IsDefault)
        const allAssocs = acls.flatMap((acl) => arr(acl.Associations))
        for (const subnetId of selected.filter((id) => !current.includes(id))) {
          const assoc = allAssocs.find((a) => a.SubnetId === subnetId)
          await callAws("ec2", "ReplaceNetworkAclAssociation", { AssociationId: assoc?.NetworkAclAssociationId, NetworkAclId: item.NetworkAclId })
        }
        for (const subnetId of current.filter((id) => !selected.includes(id))) {
          const assoc = arr(item.Associations).find((a) => a.SubnetId === subnetId)
          if (defaultAcl && defaultAcl.NetworkAclId !== item.NetworkAclId) await callAws("ec2", "ReplaceNetworkAclAssociation", { AssociationId: assoc?.NetworkAclAssociationId, NetworkAclId: defaultAcl.NetworkAclId })
        }
      }}
    >
      <FormField label="Available subnets" description="Subnets removed from this network ACL are associated with the VPC's default network ACL.">
        <Multiselect
          selectedOptions={selected.map((id) => ({ value: id, label: id }))}
          onChange={({ detail }) => setSelected(detail.selectedOptions.map((o) => o.value!))}
          options={subnets.items.map((subnet) => ({ value: s(subnet.SubnetId), label: s(subnet.SubnetId), description: `${nameTag(subnet) ?? ""} ${subnet.CidrBlock}` }))}
          placeholder="Choose subnets"
        />
      </FormField>
    </OperationModal>
  )
}

const aclsDef: ResourceDef = {
  path: "/vpc/acls",
  title: "Network ACLs",
  singular: "network ACL",
  operation: "DescribeNetworkAcls",
  items: (page) => arr(page.NetworkAcls),
  key: (item) => s(item.NetworkAclId) ?? "",
  create: { label: "Create network ACL", href: "/vpc/acls/create" },
  columns: [
    nameCol,
    { id: "id", label: "Network ACL ID", value: (item) => s(item.NetworkAclId), sort: (item) => s(item.NetworkAclId) },
    { id: "assoc", label: "Associated with", value: (item) => { const n = arr(item.Associations).length; return n === 1 ? s(arr(item.Associations)[0].SubnetId) : n ? `${n} Subnets` : "–" } },
    { id: "default", label: "Default", value: (item) => (item.IsDefault ? "Yes" : "No") },
    { id: "vpc", label: "VPC ID", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" />, sort: (item) => s(item.VpcId) },
    { id: "in", label: "Inbound rules count", value: (item) => `${arr(item.Entries).filter((e) => !e.Egress).length} Inbound rules` },
    { id: "out", label: "Outbound rules count", value: (item) => `${arr(item.Entries).filter((e) => e.Egress).length} Outbound rules` },
    { id: "owner", label: "Owner", value: (item) => s(item.OwnerId) },
  ],
  details: [
    { label: "Network ACL ID", value: (item) => <Copyable value={s(item.NetworkAclId)} /> },
    { label: "Associated with", value: (item) => arr(item.Associations).map((a) => s(a.SubnetId)).join(", ") || "–" },
    { label: "Default", value: (item) => (item.IsDefault ? "Yes" : "No") },
    { label: "VPC ID", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" /> },
    { label: "Owner", value: (item) => s(item.OwnerId) },
  ],
  tabs: [
    { id: "in", label: "Inbound rules", render: (item) => <AclEntries acl={item} /> },
    { id: "out", label: "Outbound rules", render: (item) => <AclEntries acl={item} egress /> },
    {
      id: "subnets",
      label: "Subnet associations",
      render: (item) => (
        <ResourceTableLite
          title="Subnet associations"
          items={arr(item.Associations)}
          empty="No subnet associations"
          columns={[
            { id: "subnet", header: "Subnet ID", cell: (a) => <ResLink id={s(a.SubnetId)} section="subnets" /> },
            { id: "assoc", header: "Association ID", cell: (a) => s(a.NetworkAclAssociationId) },
          ]}
        />
      ),
    },
  ],
  actions: [
    { id: "in", text: "Edit inbound rules", operation: "CreateNetworkAclEntry", modal: ({ items, close, ctx }) => <EditAclEntries item={items[0]} close={close} ctx={ctx} egress={false} /> },
    { id: "out", text: "Edit outbound rules", operation: "CreateNetworkAclEntry", modal: ({ items, close, ctx }) => <EditAclEntries item={items[0]} close={close} ctx={ctx} egress /> },
    { id: "subnets", text: "Edit subnet associations", operation: "ReplaceNetworkAclAssociation", modal: ({ items, close, ctx }) => <EditAclSubnets item={items[0]} close={close} ctx={ctx} /> },
  ],
  deleteAction: { operation: "DeleteNetworkAcl", input: (item) => ({ NetworkAclId: item.NetworkAclId }), warning: "You can't delete the default network ACL or a network ACL that is associated with subnets." },
}

/* ---------------- Security groups ---------------- */

function useRules(groupId: string) {
  return useList<Item>("DescribeSecurityGroupRules", "SecurityGroupRules", { Filters: [{ Name: "group-id", Values: [groupId] }] })
}

function RulesTab({ groupId, egress }: { groupId: string; egress?: boolean }) {
  const rules = useRules(groupId)
  const items = rules.items.filter((rule) => Boolean(rule.IsEgress) === Boolean(egress))
  return (
    <ResourceTableLite
      title={egress ? "Outbound rules" : "Inbound rules"}
      items={items}
      empty={`No ${egress ? "outbound" : "inbound"} rules`}
      columns={[
        { id: "name", header: "Name", cell: (rule) => nameTag(rule) ?? "–" },
        { id: "id", header: "Security group rule ID", cell: (rule) => s(rule.SecurityGroupRuleId) },
        { id: "ipv", header: "IP version", cell: (rule) => (rule.CidrIpv6 ? "IPv6" : rule.CidrIpv4 ? "IPv4" : "–") },
        { id: "type", header: "Type", cell: (rule) => (rule.IpProtocol === "-1" ? "All traffic" : `Custom ${protocolName(s(rule.IpProtocol))}`) },
        { id: "protocol", header: "Protocol", cell: (rule) => (rule.IpProtocol === "-1" ? "All" : protocolName(s(rule.IpProtocol))) },
        { id: "port", header: "Port range", cell: (rule) => (rule.IpProtocol === "-1" ? "All" : rule.FromPort === rule.ToPort ? s(rule.FromPort) : `${rule.FromPort} - ${rule.ToPort}`) },
        { id: "src", header: egress ? "Destination" : "Source", cell: (rule) => s(rule.CidrIpv4 ?? rule.CidrIpv6 ?? rule.PrefixListId ?? (rule.ReferencedGroupInfo as Item | undefined)?.GroupId) },
        { id: "desc", header: "Description", cell: (rule) => s(rule.Description) ?? "–" },
      ]}
    />
  )
}

function EditRules({ item, close, ctx, egress }: { item: Item; close: () => void; ctx: Ctx; egress: boolean }) {
  const groupId = s(item.GroupId)!
  const loaded = useRules(groupId)
  const original = loaded.items.filter((rule) => Boolean(rule.IsEgress) === egress).map(ruleFromSgr)
  const [rules, setRules] = useState<Rule[] | null>(null)
  const value = rules ?? original
  return (
    <OperationModal
      title={`Edit ${egress ? "outbound" : "inbound"} rules`}
      size="max"
      close={close}
      ctx={ctx}
      saveLabel="Save rules"
      success={`${egress ? "Outbound" : "Inbound"} security group rules successfully modified on security group (${groupId} | ${item.GroupName})`}
      run={() => saveRules(groupId, egress, original, value)}
    >
      <Box variant="small">{egress ? "Outbound" : "Inbound"} rules control the {egress ? "outgoing traffic that's allowed to leave" : "incoming traffic that's allowed to reach"} the instance.</Box>
      {loaded.isPending ? <Box>Loading rules…</Box> : <RuleEditor rules={value} onChange={setRules} egress={egress} />}
    </OperationModal>
  )
}

function CopySecurityGroup({ item, close, ctx }: { item: Item; close: () => void; ctx: Ctx }) {
  const [name, setName] = useState(`${item.GroupName}-copy`)
  const rules = useRules(s(item.GroupId)!)
  return (
    <OperationModal
      title="Copy to new security group"
      close={close}
      ctx={ctx}
      saveLabel="Create security group"
      success={`Security group ${name} was created successfully.`}
      run={async () => {
        const created = await callAws<{ GroupId?: string }>("ec2", "CreateSecurityGroup", { GroupName: name, Description: s(item.Description) ?? name, VpcId: item.VpcId })
        const inbound = rules.items.filter((rule) => !rule.IsEgress).map(ruleFromSgr)
        if (inbound.length) await saveRules(created.GroupId!, false, [], inbound)
      }}
    >
      <FormField label="Security group name" constraintText="Name cannot be edited after creation."><Input value={name} onChange={({ detail }) => setName(detail.value)} /></FormField>
    </OperationModal>
  )
}

const sgDef: ResourceDef = {
  path: "/vpc/security-groups",
  title: "Security Groups",
  singular: "security group",
  operation: "DescribeSecurityGroups",
  items: (page) => arr(page.SecurityGroups),
  key: (item) => s(item.GroupId) ?? "",
  create: { label: "Create security group", href: "/vpc/security-groups/create" },
  columns: [
    nameCol,
    { id: "id", label: "Security group ID", value: (item) => s(item.GroupId), sort: (item) => s(item.GroupId) },
    { id: "gname", label: "Security group name", value: (item) => s(item.GroupName), sort: (item) => s(item.GroupName) },
    { id: "vpc", label: "VPC ID", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" />, sort: (item) => s(item.VpcId) },
    { id: "desc", label: "Description", value: (item) => s(item.Description), sort: (item) => s(item.Description) },
    { id: "owner", label: "Owner", value: (item) => s(item.OwnerId) },
    { id: "in", label: "Inbound rules count", value: (item) => `${arr(item.IpPermissions).length} Permission entr${arr(item.IpPermissions).length === 1 ? "y" : "ies"}` },
    { id: "out", label: "Outbound rules count", value: (item) => `${arr(item.IpPermissionsEgress).length} Permission entr${arr(item.IpPermissionsEgress).length === 1 ? "y" : "ies"}` },
  ],
  details: [
    { label: "Security group name", value: (item) => s(item.GroupName) },
    { label: "Security group ID", value: (item) => <Copyable value={s(item.GroupId)} /> },
    { label: "Description", value: (item) => s(item.Description) },
    { label: "VPC ID", value: (item) => <ResLink id={s(item.VpcId)} section="vpcs" /> },
    { label: "Owner", value: (item) => s(item.OwnerId) },
    { label: "Inbound rules count", value: (item) => `${arr(item.IpPermissions).length} Permission entries` },
    { label: "Outbound rules count", value: (item) => `${arr(item.IpPermissionsEgress).length} Permission entries` },
  ],
  tabs: [
    { id: "in", label: "Inbound rules", render: (item) => <RulesTab groupId={s(item.GroupId)!} /> },
    { id: "out", label: "Outbound rules", render: (item) => <RulesTab groupId={s(item.GroupId)!} egress /> },
    { id: "sharing", label: "Sharing", render: () => <Box color="text-status-inactive">Sharing with AWS RAM is not available in the local emulator.</Box> },
    { id: "vpcs", label: "VPC associations", render: (item) => <ResourceTableLite title="VPC associations" items={[item]} columns={[{ id: "vpc", header: "VPC ID", cell: (row) => <ResLink id={s(row.VpcId)} section="vpcs" /> }, { id: "state", header: "State", cell: () => "Associated" }]} /> },
  ],
  actions: [
    { id: "in", text: "Edit inbound rules", operation: "AuthorizeSecurityGroupIngress", modal: ({ items, close, ctx }) => <EditRules item={items[0]} close={close} ctx={ctx} egress={false} /> },
    { id: "out", text: "Edit outbound rules", operation: "AuthorizeSecurityGroupEgress", modal: ({ items, close, ctx }) => <EditRules item={items[0]} close={close} ctx={ctx} egress /> },
    { id: "stale", text: "Manage stale rules", operation: "DescribeStaleSecurityGroups", href: () => "/vpc/security-groups" },
    { id: "copy", text: "Copy to new security group", operation: "CreateSecurityGroup", modal: ({ items, close, ctx }) => <CopySecurityGroup item={items[0]} close={close} ctx={ctx} /> },
    { id: "share", text: "Share security group", operation: "CreateResourceShare" },
  ],
  deleteAction: { operation: "DeleteSecurityGroup", input: (item) => ({ GroupId: item.GroupId }), warning: "You can't delete a default security group or a security group that is referenced by another group or in use by network interfaces." },
}

export const securityDefs: Record<string, ResourceDef> = {
  acls: aclsDef,
  "security-groups": sgDef,
}
