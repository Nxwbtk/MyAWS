"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import ExpandableSection from "@cloudscape-design/components/expandable-section"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Textarea from "@cloudscape-design/components/textarea"
import { useState, type ReactNode } from "react"
import { errorMessage } from "@/components/console/flash"
import { CodeView, JsonField, pretty } from "@/components/console/sections"
import { ConsoleLayout, Copyable } from "@/components/ec2-family/engine"
import { downloadText } from "@/components/ec2/key-pair-modal"
import { useFollow, type Crumb } from "@/components/shell/page-layout"
import { callAws, useAws } from "@/lib/aws"
import { consoleDate } from "@/lib/format"

const link = (text: string, href: string): SideNavigationProps.Item => ({ type: "link", text, href })
const nav: SideNavigationProps.Item[] = [
  link("Caller identity", "/sts"),
  {
    type: "section",
    text: "Temporary credentials",
    items: [link("Assume role", "/sts/assume-role"), link("Session token", "/sts/session-token"), link("Federation token", "/sts/federation-token"), link("Web identity", "/sts/web-identity")],
  },
  { type: "section", text: "Tools", items: [link("Decode authorization message", "/sts/decode"), link("Access key info", "/sts/access-key")] },
  { type: "divider" },
  { type: "link", text: "STS endpoints (IAM account settings)", href: "/iam/account-settings" },
]

function StsLayout({ breadcrumbs, children, active, contentType }: { breadcrumbs: Crumb[]; children: ReactNode; active: string; contentType?: "default" | "form" }) {
  return (
    <ConsoleLayout serviceName="Security Token Service" serviceHref="/sts" nav={nav} activeHref={active} breadcrumbs={[{ text: "STS", href: "/sts" }, ...breadcrumbs]} contentType={contentType}>
      {children}
    </ConsoleLayout>
  )
}

type Credentials = { AccessKeyId?: string; SecretAccessKey?: string; SessionToken?: string; Expiration?: string }

function CredentialsView({ credentials, extra = [] }: { credentials?: Credentials; extra?: { label: string; value: ReactNode }[] }) {
  if (!credentials) return null
  const env = `export AWS_ACCESS_KEY_ID=${credentials.AccessKeyId}\nexport AWS_SECRET_ACCESS_KEY=${credentials.SecretAccessKey}\nexport AWS_SESSION_TOKEN=${credentials.SessionToken}\n`
  return (
    <Container
      header={
        <Header variant="h2" description="These credentials are shown once. Store them securely." actions={<Button iconName="download" onClick={() => downloadText("credentials.env", env)}>Download as environment variables</Button>}>
          Temporary security credentials
        </Header>
      }
    >
      <SpaceBetween size="l">
        <KeyValuePairs
          columns={2}
          items={[
            { label: "Access key ID", value: <Copyable value={credentials.AccessKeyId} /> },
            { label: "Expiration", value: <StatusIndicator type="pending">{consoleDate(credentials.Expiration)}</StatusIndicator> },
            { label: "Secret access key", value: <Copyable value={credentials.SecretAccessKey} /> },
            ...extra,
          ]}
        />
        <ExpandableSection headerText="Session token">
          <Copyable value={credentials.SessionToken} />
        </ExpandableSection>
        <ExpandableSection headerText="Shell environment variables">
          <CodeView value={env} />
        </ExpandableSection>
      </SpaceBetween>
    </Container>
  )
}

function useRun<T>() {
  const [result, setResult] = useState<T>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const run = async (operation: string, input: Record<string, unknown>) => {
    setLoading(true)
    setError(undefined)
    try {
      setResult(await callAws<T>("sts", operation, input))
    } catch (caught) {
      setError(errorMessage(caught))
      setResult(undefined)
    } finally {
      setLoading(false)
    }
  }
  return { result, error, loading, run }
}

const durations = [900, 1800, 3600, 7200, 14400, 43200].map((s) => ({ value: String(s), label: s < 3600 ? `${s / 60} minutes` : `${s / 3600} hour${s > 3600 ? "s" : ""}` }))

function CallerIdentity() {
  const follow = useFollow()
  const identity = useAws<{ Account?: string; Arn?: string; UserId?: string }>("sts", "GetCallerIdentity", {})
  const arn = identity.data?.Arn
  const kind = arn?.includes(":assumed-role/") ? "Assumed role" : arn?.includes(":user/") ? "IAM user" : arn?.endsWith(":root") ? "Root user" : "–"
  return (
    <StsLayout breadcrumbs={[{ text: "Caller identity", href: "/sts" }]} active="/sts">
      <ContentLayout header={<Header variant="h1" description="AWS Security Token Service (STS) issues temporary, limited-privilege credentials for IAM users and roles." info={<Link variant="info">Info</Link>} actions={<Button iconName="refresh" ariaLabel="Refresh" loading={identity.isFetching} onClick={() => void identity.refetch()} />}>Security Token Service</Header>}>
        <SpaceBetween size="l">
          {identity.error && <Alert type="error">{errorMessage(identity.error)}</Alert>}
          <Container header={<Header variant="h2" description="The identity whose credentials are signing requests to the emulator (GetCallerIdentity).">Caller identity</Header>}>
            <KeyValuePairs columns={2} items={[{ label: "Account", value: <Copyable value={identity.data?.Account} /> }, { label: "Identity type", value: kind }, { label: "ARN", value: <Copyable value={arn} /> }, { label: "User ID", value: <Copyable value={identity.data?.UserId} /> }]} />
          </Container>
          <Container header={<Header variant="h2">Get temporary credentials</Header>}>
            <SpaceBetween size="s">
              {[
                ["Assume role", "/sts/assume-role", "Get credentials for an IAM role in this or another account (AssumeRole)."],
                ["Session token", "/sts/session-token", "Get credentials for the current IAM user, optionally with MFA (GetSessionToken)."],
                ["Federation token", "/sts/federation-token", "Get credentials for a federated user scoped by a session policy (GetFederationToken)."],
                ["Web identity", "/sts/web-identity", "Exchange an OIDC token for role credentials (AssumeRoleWithWebIdentity)."],
              ].map(([label, href, desc]) => (
                <div key={href}>
                  <Link href={href} onFollow={follow}>{label}</Link>
                  <Box color="text-body-secondary" fontSize="body-s">{desc}</Box>
                </div>
              ))}
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </ContentLayout>
    </StsLayout>
  )
}

function AssumeRole() {
  const roles = useAws<{ Roles?: { RoleName?: string; Arn?: string }[] }>("iam", "ListRoles", { MaxItems: 1000 })
  const [form, setForm] = useState({ arn: "", session: "console-session", duration: "3600", externalId: "", policy: "", mfa: "", code: "", sourceIdentity: "" })
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch })
  const call = useRun<{ Credentials?: Credentials; AssumedRoleUser?: { Arn?: string; AssumedRoleId?: string } }>()
  return (
    <StsLayout breadcrumbs={[{ text: "Assume role", href: "/sts/assume-role" }]} active="/sts/assume-role" contentType="form">
      <ContentLayout header={<Header variant="h1" description="Returns a set of temporary security credentials that you can use to access AWS resources.">Assume role</Header>}>
        <SpaceBetween size="l">
          <Form
            errorText={call.error}
            actions={<Button variant="primary" loading={call.loading} disabled={!form.arn || !form.session} onClick={() => void call.run("AssumeRole", { RoleArn: form.arn, RoleSessionName: form.session, DurationSeconds: Number(form.duration), ...(form.externalId ? { ExternalId: form.externalId } : {}), ...(form.policy ? { Policy: JSON.stringify(JSON.parse(form.policy)) } : {}), ...(form.mfa ? { SerialNumber: form.mfa, TokenCode: form.code } : {}), ...(form.sourceIdentity ? { SourceIdentity: form.sourceIdentity } : {}) })}>Assume role</Button>}
          >
            <Container header={<Header variant="h2">Role</Header>}>
              <SpaceBetween size="l">
                <FormField label="Role ARN" description="Choose a role in this account or enter the ARN of a role in another account.">
                  <SpaceBetween size="xs">
                    <Select selectedOption={null} placeholder="Choose a role in this account" empty="No roles" onChange={({ detail }) => set({ arn: detail.selectedOption.value ?? "" })} options={(roles.data?.Roles ?? []).map((r) => ({ value: r.Arn ?? "", label: r.RoleName, description: r.Arn }))} filteringType="auto" />
                    <Input value={form.arn} placeholder="arn:aws:iam::123456789012:role/RoleName" onChange={({ detail }) => set({ arn: detail.value })} />
                  </SpaceBetween>
                </FormField>
                <FormField label="Role session name" constraintText="2 to 64 characters: letters, numbers, and =,.@-"><Input value={form.session} onChange={({ detail }) => set({ session: detail.value })} /></FormField>
                <FormField label="Session duration"><Select selectedOption={durations.find((d) => d.value === form.duration) ?? null} onChange={({ detail }) => set({ duration: detail.selectedOption.value ?? "3600" })} options={durations} /></FormField>
                <ExpandableSection headerText="Additional settings - optional">
                  <SpaceBetween size="l">
                    <FormField label="External ID"><Input value={form.externalId} onChange={({ detail }) => set({ externalId: detail.value })} /></FormField>
                    <FormField label="Source identity"><Input value={form.sourceIdentity} onChange={({ detail }) => set({ sourceIdentity: detail.value })} /></FormField>
                    <FormField label="MFA device serial number"><Input value={form.mfa} placeholder="arn:aws:iam::123456789012:mfa/user" onChange={({ detail }) => set({ mfa: detail.value })} /></FormField>
                    {form.mfa && <FormField label="MFA code"><Input value={form.code} onChange={({ detail }) => set({ code: detail.value })} /></FormField>}
                    <FormField label="Session policy" description="An inline policy that further limits the session's permissions." stretch><JsonField value={form.policy} rows={8} onChange={(policy) => set({ policy })} /></FormField>
                  </SpaceBetween>
                </ExpandableSection>
              </SpaceBetween>
            </Container>
          </Form>
          <CredentialsView credentials={call.result?.Credentials} extra={[{ label: "Assumed role user", value: <Copyable value={call.result?.AssumedRoleUser?.Arn} /> }]} />
        </SpaceBetween>
      </ContentLayout>
    </StsLayout>
  )
}

function SessionToken() {
  const [form, setForm] = useState({ duration: "43200", mfa: "", code: "" })
  const call = useRun<{ Credentials?: Credentials }>()
  return (
    <StsLayout breadcrumbs={[{ text: "Session token", href: "/sts/session-token" }]} active="/sts/session-token" contentType="form">
      <ContentLayout header={<Header variant="h1" description="Returns temporary credentials for the IAM user that calls the operation.">Get session token</Header>}>
        <SpaceBetween size="l">
          <Form errorText={call.error} actions={<Button variant="primary" loading={call.loading} onClick={() => void call.run("GetSessionToken", { DurationSeconds: Number(form.duration), ...(form.mfa ? { SerialNumber: form.mfa, TokenCode: form.code } : {}) })}>Get session token</Button>}>
            <Container>
              <SpaceBetween size="l">
                <FormField label="Session duration"><Select selectedOption={durations.find((d) => d.value === form.duration) ?? null} onChange={({ detail }) => setForm({ ...form, duration: detail.selectedOption.value ?? "43200" })} options={durations} /></FormField>
                <FormField label="MFA device serial number - optional"><Input value={form.mfa} onChange={({ detail }) => setForm({ ...form, mfa: detail.value })} /></FormField>
                {form.mfa && <FormField label="MFA code"><Input value={form.code} onChange={({ detail }) => setForm({ ...form, code: detail.value })} /></FormField>}
              </SpaceBetween>
            </Container>
          </Form>
          <CredentialsView credentials={call.result?.Credentials} />
        </SpaceBetween>
      </ContentLayout>
    </StsLayout>
  )
}

function FederationToken() {
  const [form, setForm] = useState({ name: "federated-user", duration: "43200", policy: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "s3:ListAllMyBuckets", Resource: "*" }] }, null, 2) })
  const call = useRun<{ Credentials?: Credentials; FederatedUser?: { Arn?: string } }>()
  return (
    <StsLayout breadcrumbs={[{ text: "Federation token", href: "/sts/federation-token" }]} active="/sts/federation-token" contentType="form">
      <ContentLayout header={<Header variant="h1" description="Returns temporary credentials for a federated user. A session policy limits the user's permissions.">Get federation token</Header>}>
        <SpaceBetween size="l">
          <Form errorText={call.error} actions={<Button variant="primary" loading={call.loading} disabled={!form.name} onClick={() => void call.run("GetFederationToken", { Name: form.name, DurationSeconds: Number(form.duration), ...(form.policy.trim() ? { Policy: JSON.stringify(JSON.parse(form.policy)) } : {}) })}>Get federation token</Button>}>
            <Container>
              <SpaceBetween size="l">
                <FormField label="Federated user name" constraintText="2 to 32 characters."><Input value={form.name} onChange={({ detail }) => setForm({ ...form, name: detail.value })} /></FormField>
                <FormField label="Session duration"><Select selectedOption={durations.find((d) => d.value === form.duration) ?? null} onChange={({ detail }) => setForm({ ...form, duration: detail.selectedOption.value ?? "43200" })} options={durations} /></FormField>
                <FormField label="Session policy" stretch><JsonField value={form.policy} rows={10} onChange={(policy) => setForm({ ...form, policy })} /></FormField>
              </SpaceBetween>
            </Container>
          </Form>
          <CredentialsView credentials={call.result?.Credentials} extra={[{ label: "Federated user", value: <Copyable value={call.result?.FederatedUser?.Arn} /> }]} />
        </SpaceBetween>
      </ContentLayout>
    </StsLayout>
  )
}

function WebIdentity() {
  const [form, setForm] = useState({ arn: "", session: "web-session", token: "", provider: "" })
  const call = useRun<{ Credentials?: Credentials; AssumedRoleUser?: { Arn?: string }; SubjectFromWebIdentityToken?: string }>()
  return (
    <StsLayout breadcrumbs={[{ text: "Web identity", href: "/sts/web-identity" }]} active="/sts/web-identity" contentType="form">
      <ContentLayout header={<Header variant="h1" description="Returns credentials for users authenticated by an OpenID Connect identity provider.">Assume role with web identity</Header>}>
        <SpaceBetween size="l">
          <Form errorText={call.error} actions={<Button variant="primary" loading={call.loading} disabled={!form.arn || !form.token} onClick={() => void call.run("AssumeRoleWithWebIdentity", { RoleArn: form.arn, RoleSessionName: form.session, WebIdentityToken: form.token, ...(form.provider ? { ProviderId: form.provider } : {}) })}>Assume role</Button>}>
            <Container>
              <SpaceBetween size="l">
                <FormField label="Role ARN"><Input value={form.arn} onChange={({ detail }) => setForm({ ...form, arn: detail.value })} /></FormField>
                <FormField label="Role session name"><Input value={form.session} onChange={({ detail }) => setForm({ ...form, session: detail.value })} /></FormField>
                <FormField label="Web identity token" description="The OAuth 2.0 access token or OpenID Connect ID token." stretch><Textarea value={form.token} rows={5} onChange={({ detail }) => setForm({ ...form, token: detail.value })} /></FormField>
                <FormField label="Provider ID - optional" description="Only for OAuth 2.0 access tokens such as www.amazon.com or graph.facebook.com."><Input value={form.provider} onChange={({ detail }) => setForm({ ...form, provider: detail.value })} /></FormField>
              </SpaceBetween>
            </Container>
          </Form>
          <CredentialsView credentials={call.result?.Credentials} extra={[{ label: "Assumed role user", value: <Copyable value={call.result?.AssumedRoleUser?.Arn} /> }, { label: "Subject", value: call.result?.SubjectFromWebIdentityToken ?? "–" }]} />
        </SpaceBetween>
      </ContentLayout>
    </StsLayout>
  )
}

function Decode() {
  const [message, setMessage] = useState("")
  const call = useRun<{ DecodedMessage?: string }>()
  return (
    <StsLayout breadcrumbs={[{ text: "Decode authorization message", href: "/sts/decode" }]} active="/sts/decode" contentType="form">
      <ContentLayout header={<Header variant="h1" description="Decodes additional information about the authorization status of a request from an encoded message returned with an access denied error.">Decode authorization message</Header>}>
        <SpaceBetween size="l">
          <Form errorText={call.error} actions={<Button variant="primary" loading={call.loading} disabled={!message} onClick={() => void call.run("DecodeAuthorizationMessage", { EncodedMessage: message.trim() })}>Decode</Button>}>
            <Container><FormField label="Encoded message" stretch><Textarea value={message} rows={6} onChange={({ detail }) => setMessage(detail.value)} /></FormField></Container>
          </Form>
          {call.result && <Container header={<Header variant="h2">Decoded message</Header>}><CodeView value={pretty(call.result.DecodedMessage) || call.result.DecodedMessage} /></Container>}
        </SpaceBetween>
      </ContentLayout>
    </StsLayout>
  )
}

function AccessKeyInfo() {
  const [key, setKey] = useState("")
  const call = useRun<{ Account?: string }>()
  return (
    <StsLayout breadcrumbs={[{ text: "Access key info", href: "/sts/access-key" }]} active="/sts/access-key" contentType="form">
      <ContentLayout header={<Header variant="h1" description="Returns the account identifier for the specified access key ID.">Access key info</Header>}>
        <SpaceBetween size="l">
          <Form errorText={call.error} actions={<Button variant="primary" loading={call.loading} disabled={!key} onClick={() => void call.run("GetAccessKeyInfo", { AccessKeyId: key.trim() })}>Look up</Button>}>
            <Container><FormField label="Access key ID"><Input value={key} placeholder="AKIA..." onChange={({ detail }) => setKey(detail.value)} /></FormField></Container>
          </Form>
          {call.result && <Container header={<Header variant="h2">Result</Header>}><KeyValuePairs items={[{ label: "Account", value: <Copyable value={call.result.Account} /> }]} /></Container>}
        </SpaceBetween>
      </ContentLayout>
    </StsLayout>
  )
}

export function StsApp({ path }: { path: string[] }) {
  switch (path[0]) {
    case "assume-role":
      return <AssumeRole />
    case "session-token":
      return <SessionToken />
    case "federation-token":
      return <FederationToken />
    case "web-identity":
      return <WebIdentity />
    case "decode":
      return <Decode />
    case "access-key":
      return <AccessKeyInfo />
    default:
      return <CallerIdentity />
  }
}
