"use client"

import Box from "@cloudscape-design/components/box"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import RadioGroup from "@cloudscape-design/components/radio-group"
import { useState } from "react"
import { OperationModal, ResourceTableLite, State, dash, nameTag, type Ctx, type Item } from "@/components/ec2-family/engine"
import { useList } from "@/components/vpc/shared"
import { callAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

const s = (value: unknown) => (value === undefined || value === null ? undefined : String(value))

export function CreateFlowLog({ items, close, ctx, resourceType }: { items: Item[]; close: () => void; ctx: Ctx; resourceType: "VPC" | "Subnet" | "NetworkInterface" }) {
  const [form, setForm] = useState({ name: "", filter: "ALL", destinationType: "cloud-watch-logs", destination: "", role: "", interval: "600" })
  const ids = items.map((item) => (item.VpcId ?? item.SubnetId ?? item.NetworkInterfaceId) as string)
  return (
    <OperationModal
      title="Create flow log"
      size="large"
      close={close}
      ctx={ctx}
      saveLabel="Create flow log"
      success="Successfully created flow log."
      run={() =>
        callAws("ec2", "CreateFlowLogs", {
          ResourceIds: ids,
          ResourceType: resourceType,
          TrafficType: form.filter,
          LogDestinationType: form.destinationType,
          MaxAggregationInterval: Number(form.interval),
          ...(form.destinationType === "cloud-watch-logs" ? { LogGroupName: form.destination, DeliverLogsPermissionArn: form.role } : { LogDestination: form.destination }),
          ...(form.name ? { TagSpecifications: [{ ResourceType: "vpc-flow-log", Tags: [{ Key: "Name", Value: form.name }] }] } : {}),
        })
      }
    >
      <Box variant="small">Flow logs can capture IP traffic flow information for the network interfaces associated with your resources.</Box>
      <FormField label={<>Name - <i>optional</i></>}><Input value={form.name} onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
      <FormField label="Filter"><RadioGroup value={form.filter} onChange={({ detail }) => setForm({ ...form, filter: detail.value })} items={[{ value: "ACCEPT", label: "Accept" }, { value: "REJECT", label: "Reject" }, { value: "ALL", label: "All" }]} /></FormField>
      <FormField label="Maximum aggregation interval"><RadioGroup value={form.interval} onChange={({ detail }) => setForm({ ...form, interval: detail.value })} items={[{ value: "600", label: "10 minutes" }, { value: "60", label: "1 minute" }]} /></FormField>
      <FormField label="Destination">
        <RadioGroup
          value={form.destinationType}
          onChange={({ detail }) => setForm({ ...form, destinationType: detail.value })}
          items={[
            { value: "cloud-watch-logs", label: "Send to CloudWatch Logs" },
            { value: "s3", label: "Send to an Amazon S3 bucket" },
            { value: "kinesis-data-firehose", label: "Send to Amazon Data Firehose in the same account" },
          ]}
        />
      </FormField>
      <FormField label={form.destinationType === "cloud-watch-logs" ? "Destination log group" : "Destination ARN"}>
        <Input value={form.destination} placeholder={form.destinationType === "s3" ? "arn:aws:s3:::bucket/prefix" : ""} onChange={({ detail }) => setForm({ ...form, destination: detail.value })} />
      </FormField>
      {form.destinationType === "cloud-watch-logs" && (
        <FormField label="IAM role"><Input value={form.role} placeholder="arn:aws:iam::account-id:role/role-name" onChange={({ detail }) => setForm({ ...form, role: detail.value })} /></FormField>
      )}
    </OperationModal>
  )
}

export function FlowLogsTab({ resourceId }: { resourceId: string }) {
  const logs = useList<Item>("DescribeFlowLogs", "FlowLogs", { Filter: [{ Name: "resource-id", Values: [resourceId] }] })
  return (
    <ResourceTableLite
      title="Flow logs"
      items={logs.items}
      empty="No flow logs found"
      columns={[
        { id: "name", header: "Name", cell: (log) => nameTag(log) ?? "–" },
        { id: "id", header: "Flow log ID", cell: (log) => s(log.FlowLogId) },
        { id: "filter", header: "Traffic type", cell: (log) => s(log.TrafficType) },
        { id: "type", header: "Destination type", cell: (log) => s(log.LogDestinationType) },
        { id: "dest", header: "Destination name", cell: (log) => s(log.LogGroupName ?? log.LogDestination) },
        { id: "role", header: "IAM role ARN", cell: (log) => dash(log.DeliverLogsPermissionArn) },
        { id: "interval", header: "Maximum aggregation interval", cell: (log) => dash(log.MaxAggregationInterval) },
        { id: "created", header: "Creation time", cell: (log) => consoleDate(log.CreationTime as string) },
        { id: "status", header: "Status", cell: (log) => <State value={log.FlowLogStatus} /> },
      ]}
    />
  )
}

