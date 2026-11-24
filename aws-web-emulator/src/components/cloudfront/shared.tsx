"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import Badge from "@cloudscape-design/components/badge"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import { useQuery } from "@tanstack/react-query"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { ConsoleLayout } from "@/components/ec2-family/engine"
import type { Crumb } from "@/components/shell/page-layout"
import { callAws } from "@/lib/aws"

export type Obj = Record<string, unknown>
export type List<T> = { Quantity?: number; Items?: T[] }
export const items = <T,>(list?: List<T>) => list?.Items ?? []
export const toList = <T,>(values: T[]): List<T> => (values.length ? { Quantity: values.length, Items: values } : { Quantity: 0 })

export type Origin = {
  Id: string
  DomainName: string
  OriginPath?: string
  S3OriginConfig?: { OriginAccessIdentity?: string }
  CustomOriginConfig?: { HTTPPort?: number; HTTPSPort?: number; OriginProtocolPolicy?: string; OriginSslProtocols?: List<string>; OriginReadTimeout?: number; OriginKeepaliveTimeout?: number }
  OriginAccessControlId?: string
  ConnectionAttempts?: number
  ConnectionTimeout?: number
  OriginShield?: { Enabled?: boolean; OriginShieldRegion?: string }
  CustomHeaders?: List<{ HeaderName: string; HeaderValue: string }>
}
export type Behavior = {
  PathPattern?: string
  TargetOriginId: string
  ViewerProtocolPolicy: string
  AllowedMethods?: List<string> & { CachedMethods?: List<string> }
  Compress?: boolean
  CachePolicyId?: string
  OriginRequestPolicyId?: string
  ResponseHeadersPolicyId?: string
  FunctionAssociations?: List<{ FunctionARN: string; EventType: string }>
  LambdaFunctionAssociations?: List<{ LambdaFunctionARN: string; EventType: string; IncludeBody?: boolean }>
  [key: string]: unknown
}
export type DistributionConfig = {
  CallerReference: string
  Comment: string
  Enabled: boolean
  Aliases?: List<string>
  DefaultRootObject?: string
  Origins: List<Origin>
  DefaultCacheBehavior: Behavior
  CacheBehaviors?: List<Behavior>
  CustomErrorResponses?: List<{ ErrorCode: number; ResponsePagePath?: string; ResponseCode?: string; ErrorCachingMinTTL?: number }>
  Logging?: { Enabled: boolean; IncludeCookies: boolean; Bucket: string; Prefix: string }
  PriceClass?: string
  ViewerCertificate?: { CloudFrontDefaultCertificate?: boolean; ACMCertificateArn?: string; SSLSupportMethod?: string; MinimumProtocolVersion?: string; Certificate?: string; CertificateSource?: string }
  HttpVersion?: string
  IsIPV6Enabled?: boolean
  WebACLId?: string
  [key: string]: unknown
}
export type Distribution = { Id: string; ARN: string; Status: string; LastModifiedTime?: string; DomainName: string; InProgressInvalidationBatches?: number; DistributionConfig: DistributionConfig }
export type DistributionSummary = Omit<Distribution, "DistributionConfig"> & { Comment?: string; Enabled?: boolean; Aliases?: List<string>; Origins?: List<Origin>; PriceClass?: string; HttpVersion?: string }

export const cfNav: SideNavigationProps.Item[] = [
  { type: "link", text: "Distributions", href: "/cloudfront/distributions" },
  { type: "link", text: "Policies", href: "/cloudfront/policies" },
  { type: "link", text: "Functions", href: "/cloudfront/functions" },
  { type: "link", text: "Static IPs", href: "/cloudfront/static-ips" },
  { type: "link", text: "VPC origins", href: "/cloudfront/vpc-origins" },
  { type: "link", text: "SaaS", href: "/cloudfront/saas", info: <Badge color="blue">New</Badge> },
  { type: "section", text: "Telemetry", items: [{ type: "link", text: "Monitoring", href: "/cloudfront/monitoring" }, { type: "link", text: "Alarms", href: "/cloudfront/alarms" }, { type: "link", text: "Logs", href: "/cloudfront/logs" }] },
  { type: "section", text: "Reports & analytics", items: [{ type: "link", text: "Cache statistics", href: "/cloudfront/cache-statistics" }, { type: "link", text: "Popular objects", href: "/cloudfront/popular-objects" }, { type: "link", text: "Top referrers", href: "/cloudfront/top-referrers" }, { type: "link", text: "Usage", href: "/cloudfront/usage" }, { type: "link", text: "Viewers", href: "/cloudfront/viewers" }] },
  { type: "section", text: "Security", items: [{ type: "link", text: "Origin access", href: "/cloudfront/origin-access" }, { type: "link", text: "Field-level encryption", href: "/cloudfront/field-level-encryption" }, { type: "link", text: "Public keys", href: "/cloudfront/public-keys" }, { type: "link", text: "Key groups", href: "/cloudfront/key-groups" }, { type: "link", text: "Trust stores", href: "/cloudfront/trust-stores" }] },
  { type: "section", text: "Key value stores", items: [{ type: "link", text: "Key value stores", href: "/cloudfront/key-value-stores" }] },
  { type: "section", text: "Savings Bundle", items: [{ type: "link", text: "Overview", href: "/cloudfront/savings-bundle" }] },
]

export function CfLayout({ breadcrumbs, children, contentType, splitPanel }: { breadcrumbs: Crumb[]; children: ReactNode; contentType?: "default" | "table" | "form" | "dashboard"; splitPanel?: ReactNode }) {
  const parts = usePathname().split("/").filter(Boolean)
  return (
    <ConsoleLayout serviceName="CloudFront" serviceHref="/cloudfront" nav={cfNav} activeHref={`/cloudfront/${parts[1] ?? "distributions"}`} breadcrumbs={[{ text: "CloudFront", href: "/cloudfront" }, ...breadcrumbs]} contentType={contentType} splitPanel={splitPanel}>
      {children}
    </ConsoleLayout>
  )
}

export type Policy = { Type?: string; Id: string; Name: string; Comment?: string; Config: Obj; LastModifiedTime?: string }
const policyKinds = {
  cache: { op: "ListCachePolicies", list: "CachePolicyList", item: "CachePolicy", config: "CachePolicyConfig" },
  origin: { op: "ListOriginRequestPolicies", list: "OriginRequestPolicyList", item: "OriginRequestPolicy", config: "OriginRequestPolicyConfig" },
  headers: { op: "ListResponseHeadersPolicies", list: "ResponseHeadersPolicyList", item: "ResponseHeadersPolicy", config: "ResponseHeadersPolicyConfig" },
} as const
export type PolicyKind = keyof typeof policyKinds
export const policyName = (name?: string) => name?.replace(/^Managed-/, "") ?? "–"

export function usePolicies(kind: PolicyKind) {
  const k = policyKinds[kind]
  return useQuery({
    queryKey: ["emulator", "cloudfront", "policies", kind],
    queryFn: async () => {
      const out = await callAws("cloudfront", k.op, {})
      const list = (out[k.list] as { Items?: Obj[] } | undefined)?.Items ?? []
      return list.map((entry): Policy => {
        const p = entry[k.item] as Obj
        const config = p[k.config] as Obj
        return { Type: entry.Type as string, Id: p.Id as string, Name: config.Name as string, Comment: config.Comment as string | undefined, Config: config, LastModifiedTime: p.LastModifiedTime as string | undefined }
      })
    },
  })
}

export function DistStatus({ status, enabled }: { status?: string; enabled?: boolean }) {
  if (status === "InProgress") return <StatusIndicator type="in-progress">Deploying</StatusIndicator>
  if (enabled === false) return <StatusIndicator type="stopped">Disabled</StatusIndicator>
  return <StatusIndicator type="success">Enabled</StatusIndicator>
}

export async function getConfig(id: string) {
  return callAws<{ DistributionConfig: DistributionConfig; ETag: string }>("cloudfront", "GetDistributionConfig", { Id: id })
}

export async function updateConfig(id: string, mutate: (config: DistributionConfig) => DistributionConfig | void) {
  const { DistributionConfig: config, ETag } = await getConfig(id)
  const next = mutate(config) ?? config
  return callAws("cloudfront", "UpdateDistribution", { Id: id, IfMatch: ETag, DistributionConfig: next })
}

export const viewerProtocols = [
  { value: "allow-all", label: "HTTP and HTTPS" },
  { value: "redirect-to-https", label: "Redirect HTTP to HTTPS" },
  { value: "https-only", label: "HTTPS only" },
]
export const methodSets = [
  { value: "GET,HEAD", label: "GET, HEAD" },
  { value: "GET,HEAD,OPTIONS", label: "GET, HEAD, OPTIONS" },
  { value: "GET,HEAD,OPTIONS,PUT,POST,PATCH,DELETE", label: "GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE" },
]
export const priceClasses = [
  { value: "PriceClass_All", label: "Use all edge locations (best performance)" },
  { value: "PriceClass_200", label: "Use North America, Europe, Asia, Middle East, and Africa" },
  { value: "PriceClass_100", label: "Use only North America and Europe" },
]
export const httpVersions = [
  { value: "http2", label: "HTTP/2" },
  { value: "http2and3", label: "HTTP/2 and HTTP/3" },
  { value: "http1.1", label: "HTTP/1.1 only" },
  { value: "http3", label: "HTTP/3" },
]
export const label = (options: { value: string; label: string }[], value?: string) => options.find((o) => o.value === value)?.label ?? value ?? "–"
