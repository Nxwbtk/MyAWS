import {
  CreateVpcCommand,
  DescribeKeyPairsCommand,
  EC2Client,
  paginateDescribeImages,
  paginateDescribeInstances,
  paginateDescribeInternetGateways,
  paginateDescribeNetworkInterfaces,
  paginateDescribeRouteTables,
  paginateDescribeSecurityGroups,
  paginateDescribeSubnets,
  paginateDescribeVolumes,
  paginateDescribeVpcs,
  type Tag,
} from "@aws-sdk/client-ec2"
import type { Ec2Resource, Ec2Section } from "@/lib/contracts"
import type { emulatorClientConfig } from "@/lib/emulator"

type EmulatorConfig = Awaited<ReturnType<typeof emulatorClientConfig>>

const nameTag = (tags: Tag[] | undefined) =>
  tags?.find(({ Key }) => Key === "Name")?.Value ?? ""

export async function listEc2(config: EmulatorConfig, section: Ec2Section) {
  const paginator = {
    client: new EC2Client(config),
    pageSize: 100,
    stopOnSameToken: true,
  }
  const rows: Ec2Resource[] = []
  switch (section) {
    case "instances":
      for await (const page of paginateDescribeInstances(paginator, {})) {
        for (const reservation of page.Reservations ?? []) {
          for (const instance of reservation.Instances ?? []) {
            if (!instance.InstanceId) continue
            rows.push({
              id: instance.InstanceId,
              name: nameTag(instance.Tags),
              state: instance.State?.Name,
              fields: {
                type: instance.InstanceType,
                zone: instance.Placement?.AvailabilityZone,
                privateIp: instance.PrivateIpAddress,
                publicIp: instance.PublicIpAddress,
                vpcId: instance.VpcId,
              },
            })
          }
        }
      }
      break
    case "images":
      for await (const page of paginateDescribeImages(paginator, {
        Owners: ["self"],
      })) {
        for (const image of page.Images ?? []) {
          if (!image.ImageId) continue
          rows.push({
            id: image.ImageId,
            name: image.Name ?? nameTag(image.Tags),
            state: image.State,
            fields: {
              architecture: image.Architecture,
              created: image.CreationDate,
            },
          })
        }
      }
      break
    case "volumes":
      for await (const page of paginateDescribeVolumes(paginator, {})) {
        for (const volume of page.Volumes ?? []) {
          if (!volume.VolumeId) continue
          rows.push({
            id: volume.VolumeId,
            name: nameTag(volume.Tags),
            state: volume.State,
            fields: {
              type: volume.VolumeType,
              size: volume.Size?.toString(),
              zone: volume.AvailabilityZone,
              instanceIds:
                volume.Attachments?.map(({ InstanceId }) => InstanceId)
                  .filter(Boolean)
                  .join(", ") || undefined,
            },
          })
        }
      }
      break
    case "key-pairs": {
      const page = await paginator.client.send(new DescribeKeyPairsCommand({}))
      for (const key of page.KeyPairs ?? []) {
        if (!key.KeyPairId) continue
        rows.push({
          id: key.KeyPairId,
          name: key.KeyName ?? "",
          fields: { type: key.KeyType, fingerprint: key.KeyFingerprint },
        })
      }
      break
    }
    case "network-interfaces":
      for await (const page of paginateDescribeNetworkInterfaces(paginator, {})) {
        for (const iface of page.NetworkInterfaces ?? []) {
          if (!iface.NetworkInterfaceId) continue
          rows.push({
            id: iface.NetworkInterfaceId,
            name: nameTag(iface.TagSet),
            state: iface.Status,
            fields: {
              subnetId: iface.SubnetId,
              vpcId: iface.VpcId,
              privateIp: iface.PrivateIpAddress,
              instanceId: iface.Attachment?.InstanceId,
            },
          })
        }
      }
      break
    case "vpcs":
      for await (const page of paginateDescribeVpcs(paginator, {})) {
        for (const vpc of page.Vpcs ?? []) {
          if (!vpc.VpcId) continue
          rows.push({
            id: vpc.VpcId,
            name: nameTag(vpc.Tags),
            state: vpc.State,
            fields: {
              cidr: vpc.CidrBlock,
              defaultVpc:
                vpc.IsDefault === undefined
                  ? undefined
                  : vpc.IsDefault
                    ? "Yes"
                    : "No",
            },
          })
        }
      }
      break
    case "subnets":
      for await (const page of paginateDescribeSubnets(paginator, {})) {
        for (const subnet of page.Subnets ?? []) {
          if (!subnet.SubnetId) continue
          rows.push({
            id: subnet.SubnetId,
            name: nameTag(subnet.Tags),
            state: subnet.State,
            fields: {
              vpcId: subnet.VpcId,
              cidr: subnet.CidrBlock,
              zone: subnet.AvailabilityZone,
            },
          })
        }
      }
      break
    case "route-tables":
      for await (const page of paginateDescribeRouteTables(paginator, {})) {
        for (const table of page.RouteTables ?? []) {
          if (!table.RouteTableId) continue
          rows.push({
            id: table.RouteTableId,
            name: nameTag(table.Tags),
            fields: {
              vpcId: table.VpcId,
              main: table.Associations?.some(({ Main }) => Main) ? "Yes" : "No",
              routes: table.Routes?.length.toString(),
            },
          })
        }
      }
      break
    case "internet-gateways":
      for await (const page of paginateDescribeInternetGateways(paginator, {})) {
        for (const gateway of page.InternetGateways ?? []) {
          if (!gateway.InternetGatewayId) continue
          const attachment = gateway.Attachments?.[0]
          rows.push({
            id: gateway.InternetGatewayId,
            name: nameTag(gateway.Tags),
            state: attachment?.State ?? (attachment ? undefined : "Detached"),
            fields: { vpcId: attachment?.VpcId },
          })
        }
      }
      break
    case "security-groups":
      for await (const page of paginateDescribeSecurityGroups(paginator, {})) {
        for (const group of page.SecurityGroups ?? []) {
          if (!group.GroupId) continue
          rows.push({
            id: group.GroupId,
            name: nameTag(group.Tags) || group.GroupName || "",
            fields: {
              groupName: group.GroupName,
              vpcId: group.VpcId,
              description: group.Description,
            },
          })
        }
      }
      break
  }
  return rows.sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
  )
}

export async function createVpc(
  config: EmulatorConfig,
  input: { name: string; cidr: string },
) {
  const { Vpc } = await new EC2Client(config).send(
    new CreateVpcCommand({
      CidrBlock: input.cidr,
      TagSpecifications: input.name
        ? [{ ResourceType: "vpc", Tags: [{ Key: "Name", Value: input.name }] }]
        : undefined,
    }),
  )
  return { id: Vpc?.VpcId }
}
