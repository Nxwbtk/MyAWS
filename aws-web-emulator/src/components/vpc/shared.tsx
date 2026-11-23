"use client"

import Box from "@cloudscape-design/components/box"
import Link from "@cloudscape-design/components/link"
import Select from "@cloudscape-design/components/select"
import { useFollow } from "@/components/shell/page-layout"
import { nameTag, type Item } from "@/components/ec2-family/engine"
import { useAws } from "@/lib/aws"

/** Links a resource id to its VPC console page. */
export function ResLink({ id, section }: { id?: string; section: string }) {
  const follow = useFollow()
  if (!id) return <>–</>
  return (
    <Link href={`/vpc/${section}/${encodeURIComponent(id)}`} onFollow={follow}>
      {id}
    </Link>
  )
}

export function useList<T = Item>(operation: string, key: string, input: Record<string, unknown> = {}) {
  const query = useAws<Record<string, T[]>>("ec2", operation, input, { staleTime: 10_000 })
  return { ...query, items: (query.data?.[key] ?? []) as T[] }
}

export function MainRouteTable({ vpcId }: { vpcId?: string }) {
  const tables = useList<Item>("DescribeRouteTables", "RouteTables")
  const main = tables.items.find((table) => table.VpcId === vpcId && ((table.Associations as Item[] | undefined) ?? []).some((assoc) => assoc.Main))
  return <ResLink id={main?.RouteTableId as string | undefined} section="route-tables" />
}

export function MainNetworkAcl({ vpcId }: { vpcId?: string }) {
  const acls = useList<Item>("DescribeNetworkAcls", "NetworkAcls")
  const main = acls.items.find((acl) => acl.VpcId === vpcId && acl.IsDefault)
  return <ResLink id={main?.NetworkAclId as string | undefined} section="acls" />
}

export function VpcSelect({
  value,
  onChange,
  placeholder = "Select a VPC",
}: {
  value?: string
  onChange: (vpcId: string) => void
  placeholder?: string
}) {
  const vpcs = useList<Item>("DescribeVpcs", "Vpcs")
  const label = (vpc: Item) => `${vpc.VpcId}${nameTag(vpc) ? ` (${nameTag(vpc)})` : ""}`
  const selected = vpcs.items.find((vpc) => vpc.VpcId === value)
  return (
    <Select
      filteringType="auto"
      placeholder={placeholder}
      statusType={vpcs.isPending ? "loading" : "finished"}
      selectedOption={selected ? { value: value, label: label(selected), description: String(selected.CidrBlock ?? "") } : null}
      onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")}
      options={vpcs.items.map((vpc) => ({ value: vpc.VpcId as string, label: label(vpc), description: String(vpc.CidrBlock ?? "") }))}
    />
  )
}

export function SubnetSelect({ vpcId, value, onChange }: { vpcId?: string; value?: string; onChange: (id: string) => void }) {
  const subnets = useList<Item>("DescribeSubnets", "Subnets")
  const options = subnets.items
    .filter((subnet) => !vpcId || subnet.VpcId === vpcId)
    .map((subnet) => ({
      value: subnet.SubnetId as string,
      label: `${subnet.SubnetId}${nameTag(subnet) ? ` (${nameTag(subnet)})` : ""}`,
      description: `${subnet.AvailabilityZone} · ${subnet.CidrBlock}`,
    }))
  return (
    <Select
      filteringType="auto"
      placeholder="Select a subnet"
      selectedOption={options.find((option) => option.value === value) ?? null}
      onChange={({ detail }) => onChange(detail.selectedOption.value ?? "")}
      options={options}
    />
  )
}

export function tagSpec(resourceType: string, name?: string, tags: { Key: string; Value?: string }[] = []) {
  const all = [...(name ? [{ Key: "Name", Value: name }] : []), ...tags.filter((tag) => tag.Key && tag.Key !== "Name")]
  return all.length ? [{ ResourceType: resourceType, Tags: all.map((tag) => ({ Key: tag.Key, Value: tag.Value ?? "" })) }] : undefined
}

export function Note({ children }: { children: React.ReactNode }) {
  return <Box variant="small" color="text-body-secondary">{children}</Box>
}
