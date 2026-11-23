"use client"

import type { ResourceDef } from "@/components/ec2-family/engine"
import { instancesDef } from "@/components/ec2/defs-instances"
import { vpcDefs } from "@/components/vpc/defs"
import { ec2MoreDefs } from "@/components/ec2/defs-more"

/** Reuse a VPC console resource under the EC2 console path. */
function underEc2(section: string, vpcSection: string): ResourceDef {
  const def = vpcDefs[vpcSection]
  return {
    ...def,
    path: `/ec2/${section}`,
    create: def.create ? { ...def.create, href: `/ec2/${section}/create` } : undefined,
  }
}

export const ec2Defs: Record<string, ResourceDef> = {
  instances: instancesDef,
  "security-groups": underEc2("security-groups", "security-groups"),
  addresses: underEc2("addresses", "addresses"),
  ...ec2MoreDefs,
}
