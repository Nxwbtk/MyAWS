"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import Alert from "@cloudscape-design/components/alert"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import { usePathname, useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { ConsoleLayout } from "@/components/ec2-family/engine"
import type { Crumb } from "@/components/shell/page-layout"
import { IamDashboard } from "@/components/iam/dashboard"
import { CreateUserPage, UserDetailPage, UsersPage } from "@/components/iam/users"
import { CreateGroupPage, GroupDetailPage, GroupsPage } from "@/components/iam/groups"
import { CreateRolePage, RoleDetailPage, RolesPage } from "@/components/iam/roles"
import { CreatePolicyPage, PolicyDetailPage, PoliciesPage } from "@/components/iam/policies"
import { AccountSettingsPage, CredentialReportPage, IdentityProvidersPage, ProviderDetailPage } from "@/components/iam/account"

const link = (text: string, href: string): SideNavigationProps.Item => ({ type: "link", text, href })

const nav: SideNavigationProps.Item[] = [
  link("Dashboard", "/iam"),
  {
    type: "section",
    text: "Access management",
    items: [
      link("User groups", "/iam/groups"),
      link("Users", "/iam/users"),
      link("Roles", "/iam/roles"),
      link("Policies", "/iam/policies"),
      link("Identity providers", "/iam/identity-providers"),
      link("Account settings", "/iam/account-settings"),
      link("Root access management", "/iam/root-access-management"),
      link("Temporary delegation requests", "/iam/temporary-delegation"),
    ],
  },
  {
    type: "section",
    text: "Access reports",
    items: [
      link("Resource analysis", "/iam/resource-analysis"),
      link("Unused access", "/iam/unused-access"),
      link("Analyzer settings", "/iam/analyzer-settings"),
      link("Credential report", "/iam/credential-report"),
      link("Organization activity", "/iam/organization-activity"),
      link("Service control policies", "/iam/scp"),
      link("Resource control policies", "/iam/rcp"),
    ],
  },
  { type: "divider" },
  { type: "link", text: "Related consoles", href: "#" },
  { type: "link", text: "IAM Identity Center", href: "https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html", external: true },
  { type: "link", text: "AWS Organizations", href: "https://docs.aws.amazon.com/organizations/latest/userguide/orgs_introduction.html", external: true },
]

export function IamLayout({ breadcrumbs, children, contentType }: { breadcrumbs: Crumb[]; children: ReactNode; contentType?: "default" | "table" | "form" | "wizard" | "dashboard" }) {
  const path = usePathname()
  const parts = path.split("/").filter(Boolean)
  return (
    <ConsoleLayout serviceName="Identity and Access Management (IAM)" serviceHref="/iam" nav={nav} activeHref={parts.length > 1 ? `/iam/${parts[1]}` : "/iam"} breadcrumbs={[{ text: "IAM", href: "/iam" }, ...breadcrumbs]} contentType={contentType}>
      {children}
    </ConsoleLayout>
  )
}

const unavailable: Record<string, string> = {
  "root-access-management": "Root access management",
  "temporary-delegation": "Temporary delegation requests",
  "resource-analysis": "Resource analysis",
  "unused-access": "Unused access",
  "analyzer-settings": "Analyzer settings",
  "organization-activity": "Organization activity",
  scp: "Service control policies",
  rcp: "Resource control policies",
}

function Unavailable({ section }: { section: string }) {
  const title = unavailable[section] ?? "Not found"
  return (
    <IamLayout breadcrumbs={[{ text: title, href: `/iam/${section}` }]}>
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Alert type="info" header={`${title} isn't available in the local emulator`}>
          {section === "root-access-management" ? "Centralized root access needs AWS Organizations APIs that the local emulator doesn't implement." : "This page needs AWS Organizations or IAM Access Analyzer features that the local AWS Emulator doesn't provide."}
        </Alert>
      </ContentLayout>
    </IamLayout>
  )
}

export function IamApp({ path }: { path: string[] }) {
  const params = useSearchParams()
  const [section, a, b] = path
  const tab = params.get("tab") ?? undefined
  switch (section) {
    case undefined:
    case "home":
      return <IamDashboard />
    case "users":
      if (a === "create") return <CreateUserPage />
      if (a === "details" && b) return <UserDetailPage name={decodeURIComponent(b)} tab={tab} />
      return <UsersPage />
    case "groups":
      if (a === "create") return <CreateGroupPage />
      if (a === "details" && b) return <GroupDetailPage name={decodeURIComponent(b)} tab={tab} />
      return <GroupsPage />
    case "roles":
      if (a === "create") return <CreateRolePage />
      if (a === "details" && b) return <RoleDetailPage name={decodeURIComponent(b)} tab={tab} />
      return <RolesPage />
    case "policies":
      if (a === "create") return <CreatePolicyPage />
      if (a === "details" && b) return <PolicyDetailPage arn={decodeURIComponent(b)} tab={tab} />
      return <PoliciesPage />
    case "identity-providers":
      if (a === "details" && b) return <ProviderDetailPage arn={decodeURIComponent(b)} />
      return <IdentityProvidersPage />
    case "account-settings":
      return <AccountSettingsPage />
    case "credential-report":
      return <CredentialReportPage />
    default:
      return <Unavailable section={section} />
  }
}
