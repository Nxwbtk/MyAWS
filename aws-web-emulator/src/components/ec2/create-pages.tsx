"use client"

import type { ComponentType } from "react"
import { LaunchInstancePage } from "@/components/ec2/launch-instance"
import { vpcCreatePages } from "@/components/vpc/create-pages"
import { ec2MoreCreatePages } from "@/components/ec2/create-more"
import { elbCreatePages } from "@/components/ec2/defs-elb"

export const ec2CreatePages: Record<string, ComponentType> = {
  "launch-instance": LaunchInstancePage,
  instances: LaunchInstancePage,
  "security-groups": vpcCreatePages["security-groups"],
  addresses: vpcCreatePages.addresses,
  ...ec2MoreCreatePages,
  ...elbCreatePages,
}
