"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ColumnLayout from "@cloudscape-design/components/column-layout"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Grid from "@cloudscape-design/components/grid"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import { useState } from "react"
import { EditModal } from "@/components/console/sections"
import { Copyable } from "@/components/ec2-family/engine"
import { useFollow } from "@/components/shell/page-layout"
import { IamLayout } from "@/components/iam/iam-app"
import { useAccountId } from "@/components/iam/shared"
import { callAws, useAws } from "@/lib/aws"

export function IamDashboard() {
  const follow = useFollow()
  const account = useAccountId()
  const summary = useAws<{ SummaryMap?: Record<string, number> }>("iam", "GetAccountSummary", {})
  const aliases = useAws<{ AccountAliases?: string[] }>("iam", "ListAccountAliases", {})
  const identity = useAws<{ Arn?: string }>("sts", "GetCallerIdentity", {})
  const policies = useAws<{ Policies?: unknown[] }>("iam", "ListPolicies", { Scope: "Local", MaxItems: 1000 })
  const providers = useAws<{ OpenIDConnectProviderList?: unknown[] }>("iam", "ListOpenIDConnectProviders", {})
  const saml = useAws<{ SAMLProviderList?: unknown[] }>("iam", "ListSAMLProviders", {})
  const [aliasOpen, setAliasOpen] = useState(false)
  const [alias, setAlias] = useState("")
  const s = summary.data?.SummaryMap ?? {}
  const currentAlias = aliases.data?.AccountAliases?.[0]
  const user = identity.data?.Arn?.split("/").pop() ?? "emulator"
  const counts: [string, number | undefined, string][] = [
    ["User groups", s.Groups, "/iam/groups"],
    ["Users", s.Users, "/iam/users"],
    ["Roles", s.Roles, "/iam/roles"],
    ["Policies", policies.data?.Policies?.length, "/iam/policies"],
    ["Identity providers", (providers.data?.OpenIDConnectProviderList?.length ?? 0) + (saml.data?.SAMLProviderList?.length ?? 0), "/iam/identity-providers"],
  ]
  return (
    <IamLayout breadcrumbs={[{ text: "Dashboard", href: "/iam" }]} contentType="dashboard">
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>}>IAM Dashboard</Header>}>
        <Grid gridDefinition={[{ colspan: { default: 12, m: 8 } }, { colspan: { default: 12, m: 4 } }]}>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2" counter="(2)">Security recommendations</Header>}>
              <SpaceBetween size="m">
                <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                  <StatusIndicator type={s.AccountMFAEnabled ? "success" : "warning"}>{s.AccountMFAEnabled ? "Root user has MFA" : "Add MFA for root user"}</StatusIndicator>
                </SpaceBetween>
                <Box color="text-body-secondary">Having multi-factor authentication (MFA) for the root user improves security for this account.</Box>
                <StatusIndicator type="warning">Add MFA for yourself</StatusIndicator>
                <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                  <Box color="text-body-secondary">Add multi-factor authentication (MFA) for yourself to improve security for this account.</Box>
                  <Button href={`/iam/users/details/${encodeURIComponent(user)}?tab=security_credentials`} onFollow={follow}>Add MFA</Button>
                </SpaceBetween>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2" description="Resources in this AWS Account">IAM resources</Header>}>
              <ColumnLayout columns={5} variant="text-grid">
                {counts.map(([label, value, href]) => (
                  <div key={label}>
                    <Box variant="awsui-key-label">{label}</Box>
                    <Link variant="awsui-value-large" href={href} onFollow={follow}>{value ?? "–"}</Link>
                  </div>
                ))}
              </ColumnLayout>
            </Container>
            <Container header={<Header variant="h2" description="Updates for features in IAM" actions={<Link external href="https://aws.amazon.com/iam/whats-new/">View all</Link>}>What&apos;s new</Header>}>
              <SpaceBetween size="xs">
                <Box>AWS IAM now provides higher maximum quotas for roles, role trust policies, instance profiles, managed policies, and identity providers.</Box>
                <Box>IAM Roles Anywhere now enforces VPC endpoint policies for the CreateSession API.</Box>
                <Box>IAM Roles Anywhere now supports post-quantum digital certificates.</Box>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">AWS Account</Header>}>
              <KeyValuePairs
                items={[
                  { label: "Account ID", value: <Copyable value={account} /> },
                  { label: "Account Alias", value: <SpaceBetween direction="horizontal" size="xs"><span>{currentAlias ?? "–"}</span><Button variant="inline-link" onClick={() => { setAlias(currentAlias ?? ""); setAliasOpen(true) }}>{currentAlias ? "Edit" : "Create"}</Button></SpaceBetween> },
                  { label: "Sign-in URL for IAM users in this account", value: <Copyable value={`https://${currentAlias ?? account}.signin.aws.amazon.com/console`} /> },
                ]}
              />
            </Container>
            <Container header={<Header variant="h2">Quick Links</Header>}>
              <SpaceBetween size="xs">
                <Link href={`/iam/users/details/${encodeURIComponent(user)}?tab=security_credentials`} onFollow={follow}>My security credentials</Link>
                <Box color="text-body-secondary">Manage your access keys, multi-factor authentication (MFA) and other credentials.</Box>
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2">Tools</Header>}>
              <SpaceBetween size="xs">
                <Link external href="https://policysim.aws.amazon.com/">Policy simulator</Link>
                <Box color="text-body-secondary">The simulator evaluates the policies that you choose and determines the effective permissions for each of the actions that you specify.</Box>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Grid>
      </ContentLayout>
      <EditModal
        visible={aliasOpen}
        title={currentAlias ? "Edit account alias" : "Create alias"}
        saveDisabled={!alias}
        onDismiss={() => setAliasOpen(false)}
        success="Account alias saved."
        onSave={async () => {
          if (currentAlias) await callAws("iam", "DeleteAccountAlias", { AccountAlias: currentAlias })
          await callAws("iam", "CreateAccountAlias", { AccountAlias: alias })
          await aliases.refetch()
        }}
      >
        <FormField label="Preferred alias" constraintText="Must be between 3 and 63 characters. Lowercase letters, digits and hyphens."><Input value={alias} onChange={({ detail }) => setAlias(detail.value)} /></FormField>
      </EditModal>
    </IamLayout>
  )
}
