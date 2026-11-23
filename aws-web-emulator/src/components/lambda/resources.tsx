"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import Multiselect from "@cloudscape-design/components/multiselect"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Textarea from "@cloudscape-design/components/textarea"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, Section } from "@/components/console/sections"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { LambdaLayout } from "@/components/lambda/lambda-app"
import { fnHref, runtimes, zipFiles } from "@/components/lambda/shared"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type Layer = { LayerName?: string; LayerArn?: string; LatestMatchingVersion?: { LayerVersionArn?: string; Version?: number; Description?: string; CreatedDate?: string; CompatibleRuntimes?: string[]; CompatibleArchitectures?: string[] } }
type LayerVersion = { LayerVersionArn?: string; Version?: number; Description?: string; CreatedDate?: string; CompatibleRuntimes?: string[]; CompatibleArchitectures?: string[]; LicenseInfo?: string }

function CreateLayerModal({ visible, close, onDone, name: fixedName }: { visible: boolean; close: () => void; onDone: () => void; name?: string }) {
  const [form, setForm] = useState({ name: fixedName ?? "", description: "", path: "nodejs/node_modules/helper/index.js", content: "module.exports = { hello: () => 'hello from layer' }\n", runtimes: [] as string[], license: "" })
  return (
    <EditModal
      visible={visible}
      size="large"
      title={fixedName ? "Create version" : "Create layer"}
      saveLabel="Create"
      saveDisabled={!form.name || !form.path}
      onDismiss={close}
      success={`Successfully created layer ${form.name}.`}
      onSave={async () => {
        await callAws("lambda", "PublishLayerVersion", { LayerName: form.name, ...(form.description ? { Description: form.description } : {}), Content: { ZipFile: zipFiles({ [form.path]: form.content }) }, ...(form.runtimes.length ? { CompatibleRuntimes: form.runtimes } : {}), ...(form.license ? { LicenseInfo: form.license } : {}) })
        onDone()
      }}
    >
      <FormField label="Name"><Input value={form.name} disabled={Boolean(fixedName)} onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
      <FormField label="Description - optional"><Input value={form.description} onChange={({ detail }) => setForm({ ...form, description: detail.value })} /></FormField>
      <FormField label="Layer content" description="The local console builds the .zip file from this file. Use the runtime folder layout (for example nodejs/ or python/)." stretch>
        <SpaceBetween size="xs">
          <Input value={form.path} onChange={({ detail }) => setForm({ ...form, path: detail.value })} />
          <Textarea value={form.content} rows={8} spellcheck={false} onChange={({ detail }) => setForm({ ...form, content: detail.value })} />
        </SpaceBetween>
      </FormField>
      <FormField label="Compatible runtimes - optional"><Multiselect selectedOptions={runtimes.filter((r) => form.runtimes.includes(r.value))} onChange={({ detail }) => setForm({ ...form, runtimes: detail.selectedOptions.map((o) => o.value ?? "") })} options={runtimes} placeholder="Runtimes" /></FormField>
      <FormField label="License - optional"><Input value={form.license} onChange={({ detail }) => setForm({ ...form, license: detail.value })} /></FormField>
    </EditModal>
  )
}

export function LayersPage() {
  const follow = useFollow()
  const layers = useAws<{ Layers?: Layer[] }>("lambda", "ListLayers", {})
  const [open, setOpen] = useState(false)
  return (
    <LambdaLayout breadcrumbs={[{ text: "Layers", href: "/lambda/layers" }]} contentType="table">
      <ResourceTable<Layer>
        title="Layers"
        items={layers.data?.Layers ?? []}
        loading={layers.isPending}
        loadingText="Loading layers"
        error={layers.error}
        trackBy="LayerArn"
        filterPlaceholder="Filter layers"
        columns={[
          { id: "name", header: "Name", value: (l) => l.LayerName, cell: (l) => <Link href={`/lambda/layers/${encodeURIComponent(l.LayerName ?? "")}`} onFollow={follow}>{l.LayerName}</Link> },
          { id: "version", header: "Version", value: (l) => l.LatestMatchingVersion?.Version, cell: (l) => l.LatestMatchingVersion?.Version },
          { id: "description", header: "Description", value: (l) => l.LatestMatchingVersion?.Description, cell: (l) => l.LatestMatchingVersion?.Description || "-" },
          { id: "runtimes", header: "Compatible runtimes", value: (l) => l.LatestMatchingVersion?.CompatibleRuntimes?.join(", "), cell: (l) => l.LatestMatchingVersion?.CompatibleRuntimes?.join(", ") || "-" },
          { id: "arch", header: "Compatible architectures", value: (l) => l.LatestMatchingVersion?.CompatibleArchitectures?.join(", "), cell: (l) => l.LatestMatchingVersion?.CompatibleArchitectures?.join(", ") || "-" },
          { id: "arn", header: "Version ARN", value: (l) => l.LatestMatchingVersion?.LayerVersionArn, cell: (l) => l.LatestMatchingVersion?.LayerVersionArn },
        ]}
        empty={<EmptyState title="No layers" subtitle="There are no layers in this Region." action={<Button onClick={() => setOpen(true)}>Create layer</Button>} />}
        actions={<SpaceBetween direction="horizontal" size="xs"><Button iconName="refresh" ariaLabel="Refresh" onClick={() => void layers.refetch()} /><Button variant="primary" onClick={() => setOpen(true)}>Create layer</Button></SpaceBetween>}
      />
      <CreateLayerModal visible={open} close={() => setOpen(false)} onDone={() => void layers.refetch()} />
    </LambdaLayout>
  )
}

export function LayerDetailPage({ name }: { name: string; version?: string }) {
  const router = useRouter()
  const versions = useAws<{ LayerVersions?: LayerVersion[] }>("lambda", "ListLayerVersions", { LayerName: name })
  const [selected, setSelected] = useState<LayerVersion[]>([])
  const [open, setOpen] = useState(false)
  const latest = versions.data?.LayerVersions?.[0]
  return (
    <LambdaLayout breadcrumbs={[{ text: "Layers", href: "/lambda/layers" }, { text: name, href: "#" }]}>
      <ContentLayout header={<Header variant="h1" actions={<Button onClick={() => setOpen(true)}>Create version</Button>}>{name}</Header>}>
        <SpaceBetween size="l">
          <Section title="Version details" columns={3} items={[{ label: "Version", value: String(latest?.Version ?? "–") }, { label: "Version ARN", value: <Copyable value={latest?.LayerVersionArn} /> }, { label: "Created", value: consoleDate(latest?.CreatedDate) }, { label: "Description", value: latest?.Description || "-" }, { label: "Compatible runtimes", value: latest?.CompatibleRuntimes?.join(", ") || "-" }, { label: "License", value: latest?.LicenseInfo || "-" }]} />
          <Table<LayerVersion>
            header={
              <Header
                variant="h2"
                counter={`(${versions.data?.LayerVersions?.length ?? 0})`}
                actions={<Button disabled={!selected[0]} onClick={async () => { await callAws("lambda", "DeleteLayerVersion", { LayerName: name, VersionNumber: selected[0].Version }); flash.success(`Version ${selected[0].Version} deleted.`); setSelected([]); const r = await versions.refetch(); if (!r.data?.LayerVersions?.length) router.push("/lambda/layers") }}>Delete</Button>}
              >
                All versions
              </Header>
            }
            items={versions.data?.LayerVersions ?? []}
            selectionType="single"
            selectedItems={selected}
            onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
            trackBy="LayerVersionArn"
            columnDefinitions={[{ id: "v", header: "Version", cell: (v) => v.Version }, { id: "d", header: "Description", cell: (v) => v.Description || "-" }, { id: "r", header: "Compatible runtimes", cell: (v) => v.CompatibleRuntimes?.join(", ") || "-" }, { id: "c", header: "Created", cell: (v) => consoleDate(v.CreatedDate) }, { id: "a", header: "Version ARN", cell: (v) => v.LayerVersionArn }]}
            empty={<Box textAlign="center">No versions</Box>}
          />
        </SpaceBetween>
      </ContentLayout>
      <CreateLayerModal visible={open} name={name} close={() => setOpen(false)} onDone={() => void versions.refetch()} />
    </LambdaLayout>
  )
}

type Mapping = { UUID?: string; EventSourceArn?: string; FunctionArn?: string; State?: string; BatchSize?: number; LastModified?: string }

export function EventSourceMappingsPage() {
  const follow = useFollow()
  const mappings = useAws<{ EventSourceMappings?: Mapping[] }>("lambda", "ListEventSourceMappings", {})
  const [selected, setSelected] = useState<Mapping[]>([])
  return (
    <LambdaLayout breadcrumbs={[{ text: "Event source mappings", href: "/lambda/event-source-mappings" }]} contentType="table">
      <ResourceTable<Mapping>
        title="Event source mappings"
        items={mappings.data?.EventSourceMappings ?? []}
        loading={mappings.isPending}
        loadingText="Loading event source mappings"
        error={mappings.error}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="UUID"
        filterPlaceholder="Filter event source mappings"
        columns={[
          { id: "uuid", header: "UUID", value: (m) => m.UUID, cell: (m) => m.UUID },
          { id: "fn", header: "Function", value: (m) => m.FunctionArn, cell: (m) => <Link href={fnHref(m.FunctionArn?.split(":")[6])} onFollow={follow}>{m.FunctionArn?.split(":")[6]}</Link> },
          { id: "source", header: "Event source", value: (m) => m.EventSourceArn, cell: (m) => m.EventSourceArn },
          { id: "state", header: "State", value: (m) => m.State, cell: (m) => (m.State === "Enabled" ? <StatusIndicator type="success">Enabled</StatusIndicator> : <StatusIndicator type="stopped">{m.State}</StatusIndicator>) },
          { id: "batch", header: "Batch size", value: (m) => m.BatchSize, cell: (m) => m.BatchSize },
          { id: "modified", header: "Last modified", value: (m) => m.LastModified, cell: (m) => consoleDate(m.LastModified) },
        ]}
        empty={<EmptyState title="No event source mappings" subtitle="Add a trigger to a function to create one." />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void mappings.refetch()} />
            <Button disabled={!selected[0]} onClick={async () => { await callAws("lambda", "UpdateEventSourceMapping", { UUID: selected[0].UUID, Enabled: selected[0].State !== "Enabled" }); void mappings.refetch() }}>{selected[0]?.State === "Enabled" ? "Disable" : "Enable"}</Button>
            <Button disabled={!selected[0]} onClick={async () => { await callAws("lambda", "DeleteEventSourceMapping", { UUID: selected[0].UUID }); flash.success("Event source mapping deleted."); setSelected([]); void mappings.refetch() }}>Delete</Button>
          </SpaceBetween>
        }
      />
    </LambdaLayout>
  )
}

type SigningConfig = { CodeSigningConfigId?: string; CodeSigningConfigArn?: string; Description?: string; AllowedPublishers?: { SigningProfileVersionArns?: string[] }; CodeSigningPolicies?: { UntrustedArtifactOnDeployment?: string }; LastModified?: string }

export function CodeSigningPage() {
  const configs = useAws<{ CodeSigningConfigs?: SigningConfig[] }>("lambda", "ListCodeSigningConfigs", {})
  const [selected, setSelected] = useState<SigningConfig[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ description: "", profiles: "", policy: "Warn" })
  return (
    <LambdaLayout breadcrumbs={[{ text: "Code signing configurations", href: "/lambda/code-signing" }]} contentType="table">
      <ResourceTable<SigningConfig>
        title="Code signing configurations"
        items={configs.data?.CodeSigningConfigs ?? []}
        loading={configs.isPending}
        loadingText="Loading configurations"
        error={configs.error}
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={setSelected}
        trackBy="CodeSigningConfigId"
        filterPlaceholder="Filter configurations"
        columns={[
          { id: "id", header: "ID", value: (c) => c.CodeSigningConfigId, cell: (c) => c.CodeSigningConfigId },
          { id: "description", header: "Description", value: (c) => c.Description, cell: (c) => c.Description || "-" },
          { id: "policy", header: "Signature validation policy", value: (c) => c.CodeSigningPolicies?.UntrustedArtifactOnDeployment, cell: (c) => c.CodeSigningPolicies?.UntrustedArtifactOnDeployment },
          { id: "profiles", header: "Signing profiles", value: (c) => c.AllowedPublishers?.SigningProfileVersionArns?.length, cell: (c) => String(c.AllowedPublishers?.SigningProfileVersionArns?.length ?? 0) },
          { id: "modified", header: "Last modified", value: (c) => c.LastModified, cell: (c) => consoleDate(c.LastModified) },
        ]}
        empty={<EmptyState title="No code signing configurations" subtitle="" action={<Button onClick={() => setOpen(true)}>Create configuration</Button>} />}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void configs.refetch()} />
            <Button disabled={!selected[0]} onClick={async () => { await callAws("lambda", "DeleteCodeSigningConfig", { CodeSigningConfigArn: selected[0].CodeSigningConfigArn }); setSelected([]); void configs.refetch() }}>Delete</Button>
            <Button variant="primary" onClick={() => setOpen(true)}>Create configuration</Button>
          </SpaceBetween>
        }
      />
      <EditModal visible={open} size="large" title="Create code signing configuration" saveLabel="Create configuration" saveDisabled={!form.profiles.trim()} onDismiss={() => setOpen(false)} success="Code signing configuration created." onSave={async () => { await callAws("lambda", "CreateCodeSigningConfig", { Description: form.description, AllowedPublishers: { SigningProfileVersionArns: form.profiles.split(/\s+/).filter(Boolean) }, CodeSigningPolicies: { UntrustedArtifactOnDeployment: form.policy } }); await configs.refetch() }}>
        <FormField label="Description - optional"><Input value={form.description} onChange={({ detail }) => setForm({ ...form, description: detail.value })} /></FormField>
        <FormField label="Signing profile version ARNs" description="One ARN per line." stretch><Textarea value={form.profiles} onChange={({ detail }) => setForm({ ...form, profiles: detail.value })} /></FormField>
        <FormField label="Signature validation policy"><Input value={form.policy} onChange={({ detail }) => setForm({ ...form, policy: detail.value === "Enforce" ? "Enforce" : detail.value })} /></FormField>
      </EditModal>
    </LambdaLayout>
  )
}
