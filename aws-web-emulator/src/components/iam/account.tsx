"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tabs from "@cloudscape-design/components/tabs"
import Textarea from "@cloudscape-design/components/textarea"
import Tiles from "@cloudscape-design/components/tiles"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, Section } from "@/components/console/sections"
import { Copyable } from "@/components/ec2-family/engine"
import { downloadText } from "@/components/ec2/key-pair-modal"
import { useFollow } from "@/components/shell/page-layout"
import { IamLayout } from "@/components/iam/iam-app"
import { TagsSection, errorMessage, flash, type Tag } from "@/components/iam/shared"
import { regions } from "@/lib/service-meta"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

type ProviderRow = { arn: string; name: string; type: "OpenID Connect" | "SAML"; created?: string }

function useProviders() {
  return useQuery({
    queryKey: ["emulator", "iam", "providers"],
    queryFn: async () => {
      const [oidc, saml] = await Promise.all([
        callAws<{ OpenIDConnectProviderList?: { Arn?: string }[] }>("iam", "ListOpenIDConnectProviders", {}),
        callAws<{ SAMLProviderList?: { Arn?: string; CreateDate?: string }[] }>("iam", "ListSAMLProviders", {}),
      ])
      const o = await Promise.all(
        (oidc.OpenIDConnectProviderList ?? []).map(async (p): Promise<ProviderRow> => {
          const d = await callAws<{ CreateDate?: string }>("iam", "GetOpenIDConnectProvider", { OpenIDConnectProviderArn: p.Arn }).catch(() => ({ CreateDate: undefined }))
          return { arn: p.Arn ?? "", name: p.Arn?.split("oidc-provider/").pop() ?? "", type: "OpenID Connect", created: d.CreateDate }
        }),
      )
      const s = (saml.SAMLProviderList ?? []).map((p): ProviderRow => ({ arn: p.Arn ?? "", name: p.Arn?.split("/").pop() ?? "", type: "SAML", created: p.CreateDate }))
      return [...o, ...s]
    },
  })
}

export function IdentityProvidersPage() {
  const follow = useFollow()
  const providers = useProviders()
  const [selected, setSelected] = useState<ProviderRow[]>([])
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({ type: "saml", name: "", metadata: "", url: "", audience: "", thumbprint: "" })
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })
  return (
    <IamLayout breadcrumbs={[{ text: "Identity providers", href: "/iam/identity-providers" }]} contentType="table">
      <SpaceBetween size="l">
        <Alert type="info">Use IAM Identity Center to manage workforce access centrally. Use IAM identity providers for federation with an external identity provider per account.</Alert>
        <ResourceTable<ProviderRow>
          title="Identity providers"
          description="Use an identity provider (IdP) to manage your user identities outside of AWS, but grant the user identities permissions to use AWS resources in your account."
          items={providers.data ?? []}
          loading={providers.isPending}
          loadingText="Loading identity providers"
          error={providers.error}
          selectionType="single"
          selectedItems={selected}
          onSelectionChange={setSelected}
          trackBy="arn"
          filterPlaceholder="Search"
          columns={[
            { id: "name", header: "Provider", value: (p) => p.name, cell: (p) => <Link href={`/iam/identity-providers/details/${encodeURIComponent(p.arn)}`} onFollow={follow}>{p.name}</Link> },
            { id: "type", header: "Type", value: (p) => p.type, cell: (p) => p.type },
            { id: "created", header: "Creation time", value: (p) => p.created, cell: (p) => consoleDate(p.created) },
          ]}
          empty={<EmptyState title="No resources to display" subtitle="" action={<Button onClick={() => setOpen(true)}>Add provider</Button>} />}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Refresh" onClick={() => void providers.refetch()} />
              <Button disabled={!selected[0]} onClick={() => setDeleting(true)}>Delete</Button>
              <Button variant="primary" onClick={() => setOpen(true)}>Add provider</Button>
            </SpaceBetween>
          }
        />
      </SpaceBetween>
      <EditModal
        visible={open}
        size="large"
        title="Add an Identity provider"
        saveLabel="Add provider"
        saveDisabled={form.type === "saml" ? !form.name || !form.metadata : !form.url || !form.audience}
        onDismiss={() => setOpen(false)}
        success="Identity provider added."
        onSave={async () => {
          if (form.type === "saml") await callAws("iam", "CreateSAMLProvider", { Name: form.name, SAMLMetadataDocument: form.metadata })
          else await callAws("iam", "CreateOpenIDConnectProvider", { Url: form.url, ClientIDList: [form.audience], ...(form.thumbprint ? { ThumbprintList: [form.thumbprint] } : {}) })
          await providers.refetch()
        }}
      >
        <FormField label="Provider type">
          <Tiles value={form.type} onChange={({ detail }) => set({ type: detail.value })} items={[{ value: "saml", label: "SAML", description: "Establish trust between your AWS account and a SAML 2.0 compatible Identity Provider such as Shibboleth or Active Directory Federation Services." }, { value: "oidc", label: "OpenID Connect", description: "Establish trust between your AWS account and Identity Provider services, such as Google or Salesforce." }]} />
        </FormField>
        {form.type === "saml" ? (
          <>
            <FormField label="Provider name" constraintText="Maximum 128 characters. Use alphanumeric or '._-' characters."><Input value={form.name} onChange={({ detail }) => set({ name: detail.value })} /></FormField>
            <FormField label="Metadata document" description="Paste the SAML metadata XML from your IdP." stretch><Textarea value={form.metadata} rows={8} onChange={({ detail }) => set({ metadata: detail.value })} /></FormField>
          </>
        ) : (
          <>
            <FormField label="Provider URL" description="Specify the secure OpenID Connect URL for authentication requests."><Input value={form.url} placeholder="https://" onChange={({ detail }) => set({ url: detail.value })} /></FormField>
            <FormField label="Audience" description="Specify the client ID issued by the Identity provider for your app."><Input value={form.audience} onChange={({ detail }) => set({ audience: detail.value })} /></FormField>
            <FormField label="Thumbprint - optional"><Input value={form.thumbprint} onChange={({ detail }) => set({ thumbprint: detail.value })} /></FormField>
          </>
        )}
      </EditModal>
      <EditModal visible={deleting} title={`Delete ${selected[0]?.name}?`} saveLabel="Delete" onDismiss={() => setDeleting(false)} success="Identity provider deleted." onSave={async () => { const p = selected[0]; await callAws("iam", p.type === "SAML" ? "DeleteSAMLProvider" : "DeleteOpenIDConnectProvider", p.type === "SAML" ? { SAMLProviderArn: p.arn } : { OpenIDConnectProviderArn: p.arn }); setSelected([]); await providers.refetch() }}>
        <Box>Roles that trust this provider will no longer be assumable through it.</Box>
      </EditModal>
    </IamLayout>
  )
}

export function ProviderDetailPage({ arn }: { arn: string }) {
  const router = useRouter()
  const saml = arn.includes(":saml-provider/")
  const oidc = useAws<{ Url?: string; ClientIDList?: string[]; ThumbprintList?: string[]; CreateDate?: string }>("iam", "GetOpenIDConnectProvider", { OpenIDConnectProviderArn: arn }, { enabled: !saml })
  const samlInfo = useAws<{ SAMLMetadataDocument?: string; CreateDate?: string; ValidUntil?: string }>("iam", "GetSAMLProvider", { SAMLProviderArn: arn }, { enabled: saml })
  const [modal, setModal] = useState<string>()
  const [audience, setAudience] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const name = saml ? arn.split("/").pop() : arn.split("oidc-provider/").pop()
  return (
    <IamLayout breadcrumbs={[{ text: "Identity providers", href: "/iam/identity-providers" }, { text: name ?? arn, href: "#" }]}>
      <ContentLayout header={<Header variant="h1" actions={<Button onClick={() => setModal("delete")}>Delete</Button>}>{name}</Header>}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Summary</Header>}>
            <KeyValuePairs columns={3} items={[{ label: "Provider", value: name }, { label: "Provider type", value: saml ? "SAML" : "OpenID Connect" }, { label: "ARN", value: <Copyable value={arn} /> }, { label: "Creation time", value: consoleDate(saml ? samlInfo.data?.CreateDate : oidc.data?.CreateDate) }, ...(saml ? [{ label: "Valid until", value: consoleDate(samlInfo.data?.ValidUntil) }] : [{ label: "Thumbprints", value: oidc.data?.ThumbprintList?.join(", ") || "–" }])]} />
          </Container>
          <Tabs
            tabs={[
              saml
                ? { id: "metadata", label: "Metadata", content: <Section title="Metadata document"><pre className="myaws-code-view">{samlInfo.data?.SAMLMetadataDocument}</pre></Section> }
                : {
                    id: "audiences",
                    label: "Audiences",
                    content: (
                      <Table<string>
                        header={<Header variant="h2" counter={`(${oidc.data?.ClientIDList?.length ?? 0})`} actions={<SpaceBetween direction="horizontal" size="xs"><Button disabled={selected.length === 0} onClick={async () => { for (const c of selected) await callAws("iam", "RemoveClientIDFromOpenIDConnectProvider", { OpenIDConnectProviderArn: arn, ClientID: c }); setSelected([]); void oidc.refetch() }}>Remove</Button><Button onClick={() => { setAudience(""); setModal("audience") }}>Add audience</Button></SpaceBetween>}>Audiences</Header>}
                        items={oidc.data?.ClientIDList ?? []}
                        selectionType="multi"
                        selectedItems={selected}
                        onSelectionChange={({ detail }) => setSelected(detail.selectedItems)}
                        trackBy={(c) => c}
                        columnDefinitions={[{ id: "c", header: "Audience", cell: (c) => c }]}
                      />
                    ),
                  },
              { id: "tags", label: "Tags", content: saml ? <TagsSection queryKey={["saml", arn]} list={async () => (await callAws<{ Tags?: Tag[] }>("iam", "ListSAMLProviderTags", { SAMLProviderArn: arn })).Tags ?? []} tag={(tags) => callAws("iam", "TagSAMLProvider", { SAMLProviderArn: arn, Tags: tags })} untag={(keys) => callAws("iam", "UntagSAMLProvider", { SAMLProviderArn: arn, TagKeys: keys })} /> : <TagsSection queryKey={["oidc", arn]} list={async () => (await callAws<{ Tags?: Tag[] }>("iam", "ListOpenIDConnectProviderTags", { OpenIDConnectProviderArn: arn })).Tags ?? []} tag={(tags) => callAws("iam", "TagOpenIDConnectProvider", { OpenIDConnectProviderArn: arn, Tags: tags })} untag={(keys) => callAws("iam", "UntagOpenIDConnectProvider", { OpenIDConnectProviderArn: arn, TagKeys: keys })} /> },
            ]}
          />
        </SpaceBetween>
      </ContentLayout>
      <EditModal visible={modal === "audience"} title="Add audience" saveDisabled={!audience} onDismiss={() => setModal(undefined)} success="Audience added." onSave={async () => { await callAws("iam", "AddClientIDToOpenIDConnectProvider", { OpenIDConnectProviderArn: arn, ClientID: audience }); await oidc.refetch() }}>
        <FormField label="Audience"><Input value={audience} onChange={({ detail }) => setAudience(detail.value)} /></FormField>
      </EditModal>
      <EditModal visible={modal === "delete"} title={`Delete ${name}?`} saveLabel="Delete" onDismiss={() => setModal(undefined)} success="Identity provider deleted." onSave={async () => { await callAws("iam", saml ? "DeleteSAMLProvider" : "DeleteOpenIDConnectProvider", saml ? { SAMLProviderArn: arn } : { OpenIDConnectProviderArn: arn }); router.push("/iam/identity-providers") }}>
        <Box>This can&apos;t be undone.</Box>
      </EditModal>
    </IamLayout>
  )
}

type PasswordPolicy = { MinimumPasswordLength?: number; RequireSymbols?: boolean; RequireNumbers?: boolean; RequireUppercaseCharacters?: boolean; RequireLowercaseCharacters?: boolean; AllowUsersToChangePassword?: boolean; ExpirePasswords?: boolean; MaxPasswordAge?: number; PasswordReusePrevention?: number; HardExpiry?: boolean }

export function AccountSettingsPage() {
  const policy = useAws<{ PasswordPolicy?: PasswordPolicy }>("iam", "GetAccountPasswordPolicy", {}, { retry: false })
  const summary = useAws<{ SummaryMap?: Record<string, number> }>("iam", "GetAccountSummary", {})
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const [form, setForm] = useState<PasswordPolicy>({})
  const p = policy.data?.PasswordPolicy
  const set = (patch: Partial<PasswordPolicy>) => setForm({ ...form, ...patch })
  const tokenVersion = summary.data?.SummaryMap?.GlobalEndpointTokenVersion ?? 1
  return (
    <IamLayout breadcrumbs={[{ text: "Account settings", href: "/iam/account-settings" }]}>
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>}>Account settings</Header>}>
        <SpaceBetween size="l">
          <Section
            title="Password policy"
            description="Configure the password requirements for the IAM users."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                {p && <Button onClick={async () => { await callAws("iam", "DeleteAccountPasswordPolicy", {}); flash.success("Password policy reset to the IAM default."); void policy.refetch() }}>Reset to IAM default</Button>}
                <Button onClick={() => { setCustom(Boolean(p)); setForm(p ?? { MinimumPasswordLength: 8, RequireSymbols: true, RequireNumbers: true, RequireUppercaseCharacters: true, RequireLowercaseCharacters: true, AllowUsersToChangePassword: true, MaxPasswordAge: 90 }); setOpen(true) }}>Edit</Button>
              </SpaceBetween>
            }
          >
            {p ? (
              <KeyValuePairs
                columns={2}
                items={[
                  { label: "Password minimum length", value: `${p.MinimumPasswordLength} characters` },
                  { label: "Password strength", value: [p.RequireUppercaseCharacters && "Require at least one uppercase letter", p.RequireLowercaseCharacters && "Require at least one lowercase letter", p.RequireNumbers && "Require at least one number", p.RequireSymbols && "Require at least one non-alphanumeric character"].filter(Boolean).join(" · ") || "None" },
                  { label: "Other requirements", value: [p.ExpirePasswords && `Expire passwords in ${p.MaxPasswordAge} day(s)`, p.HardExpiry && "Password expiration requires administrator reset", p.AllowUsersToChangePassword && "Allow users to change their own password", p.PasswordReusePrevention && `Remember last ${p.PasswordReusePrevention} password(s)`].filter(Boolean).join(" · ") || "None" },
                ]}
              />
            ) : (
              <Box>This AWS account uses the default IAM password policy: minimum 8 characters, at least three of uppercase, lowercase, numbers and symbols, and must not be identical to the account name or email.</Box>
            )}
          </Section>
          <Section title="Security Token Service (STS)" description="Session tokens from the global endpoint and the regional endpoints.">
            <SpaceBetween size="l">
              <KeyValuePairs
                columns={2}
                items={[
                  { label: "Global endpoint", value: "https://sts.amazonaws.com" },
                  { label: "Session tokens from the STS endpoints", value: <SpaceBetween direction="horizontal" size="xs"><span>{tokenVersion === 2 ? "Valid in all AWS Regions" : "Valid only in AWS Regions enabled by default"}</span><Button variant="inline-link" onClick={async () => { await callAws("iam", "SetSecurityTokenServicePreferences", { GlobalEndpointTokenVersion: tokenVersion === 2 ? "v1Token" : "v2Token" }).then(() => { flash.success("STS preferences updated."); void summary.refetch() }, (e) => flash.error(errorMessage(e))) }}>Edit</Button></SpaceBetween> },
                ]}
              />
              <Table
                variant="embedded"
                header={<Header variant="h3" counter={`(${regions.length})`}>Endpoints</Header>}
                items={regions}
                columnDefinitions={[
                  { id: "region", header: "Region name", cell: (r) => `${r.group} (${r.name})` },
                  { id: "endpoint", header: "Endpoint", cell: (r) => `sts.${r.code}.amazonaws.com` },
                  { id: "status", header: "Status", cell: () => <StatusIndicator type="success">Active</StatusIndicator> },
                ]}
              />
            </SpaceBetween>
          </Section>
        </SpaceBetween>
      </ContentLayout>
      <EditModal
        visible={open}
        size="large"
        title="Edit password policy"
        onDismiss={() => setOpen(false)}
        success="Password policy updated."
        onSave={async () => {
          if (!custom) await callAws("iam", "DeleteAccountPasswordPolicy", {}).catch(() => undefined)
          else
            await callAws("iam", "UpdateAccountPasswordPolicy", {
              MinimumPasswordLength: Number(form.MinimumPasswordLength ?? 8),
              RequireSymbols: Boolean(form.RequireSymbols),
              RequireNumbers: Boolean(form.RequireNumbers),
              RequireUppercaseCharacters: Boolean(form.RequireUppercaseCharacters),
              RequireLowercaseCharacters: Boolean(form.RequireLowercaseCharacters),
              AllowUsersToChangePassword: Boolean(form.AllowUsersToChangePassword),
              HardExpiry: Boolean(form.HardExpiry),
              ...(form.ExpirePasswords || form.MaxPasswordAge ? { MaxPasswordAge: Number(form.MaxPasswordAge ?? 90) } : {}),
              ...(form.PasswordReusePrevention ? { PasswordReusePrevention: Number(form.PasswordReusePrevention) } : {}),
            })
          await policy.refetch()
        }}
      >
        <RadioGroup value={custom ? "custom" : "default"} onChange={({ detail }) => setCustom(detail.value === "custom")} items={[{ value: "default", label: "IAM default" }, { value: "custom", label: "Custom" }]} />
        {custom && (
          <SpaceBetween size="s">
            <FormField label="Password minimum length" constraintText="Needs to be between 6 and 128."><Input type="number" value={String(form.MinimumPasswordLength ?? 8)} onChange={({ detail }) => set({ MinimumPasswordLength: Number(detail.value) })} /></FormField>
            <Checkbox checked={Boolean(form.RequireUppercaseCharacters)} onChange={({ detail }) => set({ RequireUppercaseCharacters: detail.checked })}>Require at least one uppercase letter from the Latin alphabet (A-Z)</Checkbox>
            <Checkbox checked={Boolean(form.RequireLowercaseCharacters)} onChange={({ detail }) => set({ RequireLowercaseCharacters: detail.checked })}>Require at least one lowercase letter from the Latin alphabet (a-z)</Checkbox>
            <Checkbox checked={Boolean(form.RequireNumbers)} onChange={({ detail }) => set({ RequireNumbers: detail.checked })}>Require at least one number</Checkbox>
            <Checkbox checked={Boolean(form.RequireSymbols)} onChange={({ detail }) => set({ RequireSymbols: detail.checked })}>Require at least one non-alphanumeric character</Checkbox>
            <Checkbox checked={Boolean(form.ExpirePasswords || form.MaxPasswordAge)} onChange={({ detail }) => set({ ExpirePasswords: detail.checked, MaxPasswordAge: detail.checked ? form.MaxPasswordAge ?? 90 : undefined })}>Turn on password expiration</Checkbox>
            {(form.ExpirePasswords || form.MaxPasswordAge) && <FormField label="Expire passwords in day(s)"><Input type="number" value={String(form.MaxPasswordAge ?? 90)} onChange={({ detail }) => set({ MaxPasswordAge: Number(detail.value) })} /></FormField>}
            <Checkbox checked={Boolean(form.HardExpiry)} onChange={({ detail }) => set({ HardExpiry: detail.checked })}>Password expiration requires administrator reset</Checkbox>
            <Checkbox checked={Boolean(form.AllowUsersToChangePassword)} onChange={({ detail }) => set({ AllowUsersToChangePassword: detail.checked })}>Allow users to change their own password</Checkbox>
            <Checkbox checked={Boolean(form.PasswordReusePrevention)} onChange={({ detail }) => set({ PasswordReusePrevention: detail.checked ? 5 : undefined })}>Prevent password reuse</Checkbox>
            {Boolean(form.PasswordReusePrevention) && <FormField label="Remember password(s)"><Input type="number" value={String(form.PasswordReusePrevention)} onChange={({ detail }) => set({ PasswordReusePrevention: Number(detail.value) })} /></FormField>}
          </SpaceBetween>
        )}
      </EditModal>
    </IamLayout>
  )
}

function safeAtob(value: string) {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)))
  } catch {
    return value
  }
}

export function CredentialReportPage() {
  const [generating, setGenerating] = useState(false)
  const report = useAws<{ Content?: string; GeneratedTime?: string }>("iam", "GetCredentialReport", {}, { retry: false })
  const download = async () => {
    setGenerating(true)
    try {
      let state = ""
      for (let i = 0; i < 10 && state !== "COMPLETE"; i++) {
        state = (await callAws<{ State?: string }>("iam", "GenerateCredentialReport", {})).State ?? ""
        if (state !== "COMPLETE") await new Promise((r) => setTimeout(r, 1000))
      }
      const result = await callAws<{ Content?: unknown; GeneratedTime?: string }>("iam", "GetCredentialReport", {})
      const content = result.Content
      const blob = content as { encoding?: string; data?: string } | string | undefined
      const text = typeof blob === "string" ? safeAtob(blob) : blob?.encoding === "base64" && blob.data ? safeAtob(blob.data) : ""
      downloadText(`status_reports_${new Date().toISOString().slice(0, 19)}.csv`, text)
      void report.refetch()
    } catch (e) {
      flash.error(errorMessage(e))
    } finally {
      setGenerating(false)
    }
  }
  return (
    <IamLayout breadcrumbs={[{ text: "Credential report", href: "/iam/credential-report" }]}>
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>} description="The credential report lists all users in your account and the status of their various credentials, including passwords, access keys, and MFA devices. You can get a credential report every four hours.">Credential report</Header>}>
        <Container>
          <SpaceBetween size="m">
            <KeyValuePairs items={[{ label: "Last generated", value: report.data?.GeneratedTime ? consoleDate(report.data.GeneratedTime) : "Never" }]} />
            <Box><Button variant="primary" iconName="download" loading={generating} onClick={() => void download()}>Download credentials report</Button></Box>
          </SpaceBetween>
        </Container>
      </ContentLayout>
    </IamLayout>
  )
}
