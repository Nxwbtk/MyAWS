import {
  CreateVpcCommand,
  DescribeAddressesCommand,
  DescribePlacementGroupsCommand,
  DescribeKeyPairsCommand,
  EC2Client,
  paginateDescribeDhcpOptions,
  paginateDescribeEgressOnlyInternetGateways,
  paginateDescribeImages,
  paginateDescribeInstances,
  paginateDescribeInternetGateways,
  paginateDescribeLaunchTemplates,
  paginateDescribeManagedPrefixLists,
  paginateDescribeNatGateways,
  paginateDescribeNetworkAcls,
  paginateDescribeNetworkInterfaces,
  paginateDescribeSnapshots,
  paginateDescribeSpotInstanceRequests,
  paginateDescribeRouteTables,
  paginateDescribeSecurityGroups,
  paginateDescribeSubnets,
  paginateDescribeVolumes,
  paginateDescribeVpcEndpoints,
  paginateDescribeVpcPeeringConnections,
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
    case "launch-templates":
      for await (const page of paginateDescribeLaunchTemplates(paginator, {})) {
        for (const template of page.LaunchTemplates ?? []) {
          if (!template.LaunchTemplateId) continue
          rows.push({
            id: template.LaunchTemplateId,
            name: template.LaunchTemplateName ?? "",
            fields: {
              createdBy: template.CreatedBy,
              created: template.CreateTime?.toISOString(),
              defaultVersion: template.DefaultVersionNumber?.toString(),
              latestVersion: template.LatestVersionNumber?.toString(),
            },
          })
        }
      }
      break
    case "spot-requests":
      for await (const page of paginateDescribeSpotInstanceRequests(paginator, {})) {
        for (const request of page.SpotInstanceRequests ?? []) {
          if (!request.SpotInstanceRequestId) continue
          rows.push({
            id: request.SpotInstanceRequestId,
            name: request.LaunchGroup ?? "",
            state: request.State,
            fields: {
              type: request.Type,
              instanceId: request.InstanceId,
              status: request.Status?.Code,
              validUntil: request.ValidUntil?.toISOString(),
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
    case "snapshots":
      for await (const page of paginateDescribeSnapshots(paginator, {
        OwnerIds: ["self"],
      })) {
        for (const snapshot of page.Snapshots ?? []) {
          if (!snapshot.SnapshotId) continue
          rows.push({
            id: snapshot.SnapshotId,
            name: snapshot.Description ?? nameTag(snapshot.Tags),
            state: snapshot.State,
            fields: {
              volumeId: snapshot.VolumeId,
              size: snapshot.VolumeSize?.toString(),
              started: snapshot.StartTime?.toISOString(),
              encrypted: snapshot.Encrypted === undefined
                ? undefined
                : snapshot.Encrypted ? "Yes" : "No",
            },
          })
        }
      }
      break
    case "elastic-ips": {
        const page = await paginator.client.send(new DescribeAddressesCommand({}))
        for (const address of page.Addresses ?? []) {
          const id = address.AllocationId ?? address.PublicIp
          if (!id) continue
          rows.push({
            id,
            name: address.PublicIp ?? "",
            fields: {
              allocationId: address.AllocationId,
              domain: address.Domain,
              associationId: address.AssociationId,
              instanceId: address.InstanceId,
              networkInterfaceId: address.NetworkInterfaceId,
              privateIp: address.PrivateIpAddress,
            },
          })
        }
      }
      break
    case "placement-groups":
      {
        const page = await paginator.client.send(new DescribePlacementGroupsCommand({}))
        for (const group of page.PlacementGroups ?? []) {
          if (!group.GroupId) continue
          rows.push({
            id: group.GroupId,
            name: group.GroupName ?? "",
            state: group.State,
            fields: {
              strategy: group.Strategy,
              partitionCount: group.PartitionCount?.toString(),
              zone: group.SpreadLevel,
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
    case "egress-only-gateways":
      for await (const page of paginateDescribeEgressOnlyInternetGateways(paginator, {})) {
        for (const gateway of page.EgressOnlyInternetGateways ?? []) {
          if (!gateway.EgressOnlyInternetGatewayId) continue
          rows.push({
            id: gateway.EgressOnlyInternetGatewayId,
            name: gateway.EgressOnlyInternetGatewayId,
            state: gateway.Attachments?.[0]?.State,
            fields: {
              vpcId: gateway.Attachments?.[0]?.VpcId,
            },
          })
        }
      }
      break
    case "dhcp-options":
      for await (const page of paginateDescribeDhcpOptions(paginator, {})) {
        for (const options of page.DhcpOptions ?? []) {
          if (!options.DhcpOptionsId) continue
          rows.push({
            id: options.DhcpOptionsId,
            name: nameTag(options.Tags),
            fields: {
              ownerId: options.OwnerId,
              configuration: options.DhcpConfigurations?.map((entry) =>
                `${entry.Key}: ${entry.Values?.map(({ Value }) => Value).filter(Boolean).join(", ")}`,
              ).join(" · "),
            },
          })
        }
      }
      break
    case "prefix-lists":
      for await (const page of paginateDescribeManagedPrefixLists(paginator, {})) {
        for (const prefix of page.PrefixLists ?? []) {
          if (!prefix.PrefixListId) continue
          rows.push({
            id: prefix.PrefixListId,
            name: prefix.PrefixListName ?? "",
            state: prefix.State,
            fields: {
              arn: prefix.PrefixListArn,
              addressFamily: prefix.AddressFamily,
              maxEntries: prefix.MaxEntries?.toString(),
              version: prefix.Version?.toString(),
              ownerId: prefix.OwnerId,
            },
          })
        }
      }
      break
    case "vpc-endpoints":
      for await (const page of paginateDescribeVpcEndpoints(paginator, {})) {
        for (const endpoint of page.VpcEndpoints ?? []) {
          if (!endpoint.VpcEndpointId) continue
          rows.push({
            id: endpoint.VpcEndpointId,
            name: endpoint.ServiceName ?? "",
            state: endpoint.State,
            fields: {
              type: endpoint.VpcEndpointType,
              vpcId: endpoint.VpcId,
              routeTables: endpoint.RouteTableIds?.join(", "),
              subnets: endpoint.SubnetIds?.join(", "),
              privateDns: endpoint.PrivateDnsEnabled === undefined
                ? undefined
                : endpoint.PrivateDnsEnabled ? "Enabled" : "Disabled",
            },
          })
        }
      }
      break
    case "nat-gateways":
      for await (const page of paginateDescribeNatGateways(paginator, {})) {
        for (const gateway of page.NatGateways ?? []) {
          if (!gateway.NatGatewayId) continue
          rows.push({
            id: gateway.NatGatewayId,
            name: nameTag(gateway.Tags),
            state: gateway.State,
            fields: {
              vpcId: gateway.VpcId,
              subnetId: gateway.SubnetId,
              connectivityType: gateway.ConnectivityType,
              publicIp: gateway.NatGatewayAddresses?.[0]?.PublicIp,
              privateIp: gateway.NatGatewayAddresses?.[0]?.PrivateIp,
            },
          })
        }
      }
      break
    case "peering-connections":
      for await (const page of paginateDescribeVpcPeeringConnections(paginator, {})) {
        for (const connection of page.VpcPeeringConnections ?? []) {
          if (!connection.VpcPeeringConnectionId) continue
          rows.push({
            id: connection.VpcPeeringConnectionId,
            name: nameTag(connection.Tags),
            state: connection.Status?.Code,
            fields: {
              requesterVpcId: connection.RequesterVpcInfo?.VpcId,
              accepterVpcId: connection.AccepterVpcInfo?.VpcId,
              requesterRegion: connection.RequesterVpcInfo?.Region,
              accepterRegion: connection.AccepterVpcInfo?.Region,
            },
          })
        }
      }
      break
    case "network-acls":
      for await (const page of paginateDescribeNetworkAcls(paginator, {})) {
        for (const acl of page.NetworkAcls ?? []) {
          if (!acl.NetworkAclId) continue
          rows.push({
            id: acl.NetworkAclId,
            name: nameTag(acl.Tags),
            fields: {
              vpcId: acl.VpcId,
              default: acl.IsDefault === undefined ? undefined : acl.IsDefault ? "Yes" : "No",
              entries: acl.Entries?.length.toString(),
              subnetAssociations: acl.Associations?.map(({ SubnetId }) => SubnetId).filter(Boolean).join(", "),
            },
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
