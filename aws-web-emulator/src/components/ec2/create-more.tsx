"use client"

import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import Multiselect from "@cloudscape-design/components/multiselect"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Checkbox from "@cloudscape-design/components/checkbox"
import { useRouter } from "next/navigation"
import { useState, type ComponentType, type ReactNode } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import type { Item } from "@/components/ec2-family/engine"
import { Ec2Layout } from "@/components/ec2/ec2-app"
import { useList } from "@/components/vpc/shared"
import { callAws } from "@/lib/aws"
import { storageCreatePages } from "@/components/ec2/create-storage"

const s = (value: unknown) => (value === undefined || value === null ? undefined : String(value))

export function Ec2CreatePage({
  title,
  description,
  listTitle,
  listHref,
  submitLabel,
  onSubmit,
  children,
}: {
  title: string
  description?: ReactNode
  listTitle: string
  listHref: string
  submitLabel: string
  onSubmit: () => Promise<string>
  children: ReactNode
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <Ec2Layout breadcrumbs={[{ text: listTitle, href: listHref }, { text: title, href: `${listHref}/create` }]} contentType="form">
      <Form
        header={<Header variant="h1" info={<Link variant="info">Info</Link>} description={description}>{title}</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push(listHref)}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={async () => {
                setSaving(true)
                setError(undefined)
                try {
                  router.push(await onSubmit())
                } catch (caught) {
                  setError(errorMessage(caught))
                } finally {
                  setSaving(false)
                }
              }}
            >
              {submitLabel}
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">{children}</SpaceBetween>
      </Form>
    </Ec2Layout>
  )
}

function CreateLaunchTemplatePage() {
  const images = useList<Item>("DescribeImages", "Images", { Owners: ["amazon", "self"], MaxResults: 200 })
  const keys = useList<Item>("DescribeKeyPairs", "KeyPairs")
  const groups = useList<Item>("DescribeSecurityGroups", "SecurityGroups")
  const [form, setForm] = useState({ name: "", description: "", ami: "", type: "", key: "", size: "", autoscaling: false })
  const [sgs, setSgs] = useState<string[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  return (
    <Ec2CreatePage
      title="Create launch template"
      description="Creating a launch template allows you to create a saved instance configuration that can be reused, shared and launched at a later time. Templates can have multiple versions."
      listTitle="Launch templates"
      listHref="/ec2/launch-templates"
      submitLabel="Create launch template"
      onSubmit={async () => {
        const result = await callAws<{ LaunchTemplate?: { LaunchTemplateId?: string } }>("ec2", "CreateLaunchTemplate", {
          LaunchTemplateName: form.name,
          ...(form.description ? { VersionDescription: form.description } : {}),
          LaunchTemplateData: {
            ...(form.ami ? { ImageId: form.ami } : {}),
            ...(form.type ? { InstanceType: form.type } : {}),
            ...(form.key ? { KeyName: form.key } : {}),
            ...(sgs.length ? { SecurityGroupIds: sgs } : {}),
            ...(form.size ? { BlockDeviceMappings: [{ DeviceName: "/dev/xvda", Ebs: { VolumeSize: Number(form.size), VolumeType: "gp3" } }] } : {}),
          },
          ...(tags.filter((t) => t.Key).length ? { TagSpecifications: [{ ResourceType: "launch-template", Tags: tags.filter((t) => t.Key).map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) }] } : {}),
        })
        const id = result.LaunchTemplate?.LaunchTemplateId as string
        flash.success(`Successfully created ${form.name}(${id}).`)
        return `/ec2/launch-templates/${id}`
      }}
    >
      <Container header={<Header variant="h2">Launch template name and description</Header>}>
        <SpaceBetween size="m">
          <FormField label="Launch template name - required" constraintText="Must be unique to this account. Max 128 chars. No spaces or special characters like '&', '*', '@'."><Input value={form.name} placeholder="MyTemplate" onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
          <FormField label="Template version description"><Input value={form.description} placeholder="A prod webserver for MyApp" onChange={({ detail }) => setForm({ ...form, description: detail.value })} /></FormField>
          <FormField label="Auto Scaling guidance"><Checkbox checked={form.autoscaling} onChange={({ detail }) => setForm({ ...form, autoscaling: detail.checked })}>Provide guidance to help me set up a template that I can use with EC2 Auto Scaling</Checkbox></FormField>
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">Launch template contents</Header>}>
        <SpaceBetween size="m">
          <FormField label="Application and OS Images (Amazon Machine Image)">
            <Select filteringType="auto" placeholder="Don't include in launch template" selectedOption={form.ami ? { value: form.ami, label: form.ami } : null} onChange={({ detail }) => setForm({ ...form, ami: detail.selectedOption.value ?? "" })} options={images.items.slice(0, 200).map((img) => ({ value: s(img.ImageId), label: s(img.Name), description: s(img.ImageId) }))} />
          </FormField>
          <FormField label="Instance type"><Input value={form.type} placeholder="Don't include in launch template" onChange={({ detail }) => setForm({ ...form, type: detail.value })} /></FormField>
          <FormField label="Key pair name">
            <Select selectedOption={{ value: form.key, label: form.key || "Don't include in launch template" }} onChange={({ detail }) => setForm({ ...form, key: detail.selectedOption.value ?? "" })} options={[{ value: "", label: "Don't include in launch template" }, ...keys.items.map((k) => ({ value: s(k.KeyName), label: s(k.KeyName) }))]} />
          </FormField>
          <FormField label="Security groups">
            <Multiselect selectedOptions={sgs.map((id) => ({ value: id, label: id }))} onChange={({ detail }) => setSgs(detail.selectedOptions.map((o) => o.value!))} options={groups.items.map((g) => ({ value: s(g.GroupId), label: s(g.GroupName), description: s(g.GroupId) }))} placeholder="Select security groups" />
          </FormField>
          <FormField label="Storage (volumes)" description="Root volume size in GiB"><Input type="number" value={form.size} placeholder="Don't include in launch template" onChange={({ detail }) => setForm({ ...form, size: detail.value })} /></FormField>
        </SpaceBetween>
      </Container>
      <Container header={<Header variant="h2">Template tags</Header>}>
        <TagEditor tags={tags} onChange={setTags} />
      </Container>
    </Ec2CreatePage>
  )
}

export const ec2MoreCreatePages: Record<string, ComponentType> = {
  "launch-templates": CreateLaunchTemplatePage,
  ...storageCreatePages,
}
