"use client"

import AttributeEditor from "@cloudscape-design/components/attribute-editor"
import Input from "@cloudscape-design/components/input"
import Select from "@cloudscape-design/components/select"
import type { Item } from "@/components/ec2-family/engine"
import { callAws } from "@/lib/aws"

export type Rule = { id?: string; type: string; protocol: string; from: string; to: string; source: string; description: string }

export const ruleTypes: { value: string; label: string; protocol: string; port?: string }[] = [
  { value: "custom-tcp", label: "Custom TCP", protocol: "tcp" },
  { value: "custom-udp", label: "Custom UDP", protocol: "udp" },
  { value: "custom-icmp", label: "Custom ICMP - IPv4", protocol: "icmp" },
  { value: "all-tcp", label: "All TCP", protocol: "tcp", port: "0-65535" },
  { value: "all-udp", label: "All UDP", protocol: "udp", port: "0-65535" },
  { value: "all-icmp", label: "All ICMP - IPv4", protocol: "icmp", port: "-1" },
  { value: "all", label: "All traffic", protocol: "-1", port: "" },
  { value: "ssh", label: "SSH", protocol: "tcp", port: "22" },
  { value: "smtp", label: "SMTP", protocol: "tcp", port: "25" },
  { value: "dns-udp", label: "DNS (UDP)", protocol: "udp", port: "53" },
  { value: "dns-tcp", label: "DNS (TCP)", protocol: "tcp", port: "53" },
  { value: "http", label: "HTTP", protocol: "tcp", port: "80" },
  { value: "https", label: "HTTPS", protocol: "tcp", port: "443" },
  { value: "mysql", label: "MYSQL/Aurora", protocol: "tcp", port: "3306" },
  { value: "rdp", label: "RDP", protocol: "tcp", port: "3389" },
  { value: "postgres", label: "PostgreSQL", protocol: "tcp", port: "5432" },
  { value: "redis", label: "Redis", protocol: "tcp", port: "6379" },
  { value: "nfs", label: "NFS", protocol: "tcp", port: "2049" },
]

export function typeFor(protocol: string, from?: number, to?: number) {
  if (protocol === "-1") return "all"
  const port = from === to ? String(from) : `${from}-${to}`
  return ruleTypes.find((type) => type.protocol === protocol && type.port === port)?.value ?? (protocol === "udp" ? "custom-udp" : protocol === "icmp" ? "custom-icmp" : "custom-tcp")
}

export function ruleFromSgr(rule: Item): Rule {
  const protocol = String(rule.IpProtocol ?? "-1")
  const from = rule.FromPort as number | undefined
  const to = rule.ToPort as number | undefined
  return {
    id: rule.SecurityGroupRuleId as string,
    type: typeFor(protocol, from, to),
    protocol,
    from: from === undefined || from === -1 ? "" : String(from),
    to: to === undefined || to === -1 ? "" : String(to),
    source: String(rule.CidrIpv4 ?? rule.CidrIpv6 ?? rule.PrefixListId ?? (rule.ReferencedGroupInfo as Item | undefined)?.GroupId ?? ""),
    description: String(rule.Description ?? ""),
  }
}

export function permissionFor(rule: Rule) {
  const preset = ruleTypes.find((type) => type.value === rule.type)
  const protocol = preset?.protocol ?? rule.protocol
  let from: number | undefined
  let to: number | undefined
  if (preset?.port !== undefined && !rule.type.startsWith("custom")) {
    if (preset.port === "-1") [from, to] = [-1, -1]
    else if (preset.port) [from, to] = preset.port.includes("-") ? preset.port.split("-").map(Number) : [Number(preset.port), Number(preset.port)]
  } else {
    from = Number(rule.from === "" ? -1 : rule.from)
    to = Number(rule.to === "" ? from : rule.to)
  }
  const source = rule.source.trim()
  return {
    IpProtocol: protocol,
    ...(protocol !== "-1" ? { FromPort: from, ToPort: to } : {}),
    ...(source.startsWith("sg-")
      ? { UserIdGroupPairs: [{ GroupId: source, ...(rule.description ? { Description: rule.description } : {}) }] }
      : source.startsWith("pl-")
        ? { PrefixListIds: [{ PrefixListId: source, ...(rule.description ? { Description: rule.description } : {}) }] }
        : source.includes(":")
          ? { Ipv6Ranges: [{ CidrIpv6: source, ...(rule.description ? { Description: rule.description } : {}) }] }
          : { IpRanges: [{ CidrIp: source, ...(rule.description ? { Description: rule.description } : {}) }] }),
  }
}

export function RuleEditor({ rules, onChange, egress }: { rules: Rule[]; onChange: (rules: Rule[]) => void; egress?: boolean }) {
  const update = (index: number, patch: Partial<Rule>) => onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))
  return (
    <AttributeEditor
      items={rules}
      addButtonText="Add rule"
      removeButtonText="Delete"
      empty={`This security group has no ${egress ? "outbound" : "inbound"} rules.`}
      onAddButtonClick={() => onChange([...rules, { type: "custom-tcp", protocol: "tcp", from: "", to: "", source: egress ? "0.0.0.0/0" : "", description: "" }])}
      onRemoveButtonClick={({ detail }) => onChange(rules.filter((_, index) => index !== detail.itemIndex))}
      definition={[
        {
          label: "Type",
          control: (rule, index) => (
            <Select
              selectedOption={ruleTypes.find((type) => type.value === rule.type) ?? null}
              filteringType="auto"
              onChange={({ detail }) => {
                const preset = ruleTypes.find((type) => type.value === detail.selectedOption.value)
                const [from = "", to = from] = (preset?.port ?? "").split("-")
                update(index, { type: preset?.value ?? "custom-tcp", protocol: preset?.protocol ?? "tcp", from: preset?.port === "-1" ? "" : from, to: preset?.port === "-1" ? "" : to })
              }}
              options={ruleTypes}
            />
          ),
        },
        { label: "Protocol", control: (rule) => <Input value={rule.protocol === "-1" ? "All" : rule.protocol.toUpperCase()} disabled /> },
        {
          label: "Port range",
          control: (rule, index) => (
            <Input
              value={rule.protocol === "-1" ? "All" : rule.from === rule.to || !rule.to ? rule.from : `${rule.from}-${rule.to}`}
              disabled={!rule.type.startsWith("custom")}
              placeholder="0 - 65535"
              onChange={({ detail }) => {
                const [from, to = from] = detail.value.split("-").map((part) => part.trim())
                update(index, { from, to })
              }}
            />
          ),
        },
        {
          label: egress ? "Destination" : "Source",
          control: (rule, index) => <Input value={rule.source} placeholder="CIDR, IP, security group, or prefix list" onChange={({ detail }) => update(index, { source: detail.value })} />,
        },
        { label: <>Description - <i>optional</i></>, control: (rule, index) => <Input value={rule.description} onChange={({ detail }) => update(index, { description: detail.value })} /> },
      ]}
    />
  )
}

export async function saveRules(groupId: string, egress: boolean, original: Rule[], next: Rule[]) {
  const key = (rule: Rule) => JSON.stringify(permissionFor({ ...rule, id: undefined }))
  const removed = original.filter((rule) => !next.some((item) => item.id === rule.id && key(item) === key(rule)))
  const added = next.filter((rule) => !rule.id || !original.some((item) => item.id === rule.id && key(item) === key(rule)))
  if (removed.length)
    await callAws("ec2", egress ? "RevokeSecurityGroupEgress" : "RevokeSecurityGroupIngress", { GroupId: groupId, SecurityGroupRuleIds: removed.map((rule) => rule.id) })
  if (added.length)
    await callAws("ec2", egress ? "AuthorizeSecurityGroupEgress" : "AuthorizeSecurityGroupIngress", { GroupId: groupId, IpPermissions: added.map(permissionFor) })
}
