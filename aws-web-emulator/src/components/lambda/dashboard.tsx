"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ColumnLayout from "@cloudscape-design/components/column-layout"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import Link from "@cloudscape-design/components/link"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import { consoleBytes } from "@/lib/format"
import { useFollow } from "@/components/shell/page-layout"
import { LambdaLayout } from "@/components/lambda/lambda-app"
import { fnHref, lambdaDate, runtimeLabel, useFunctions } from "@/components/lambda/shared"
import { useAws } from "@/lib/aws"

type AccountSettings = { AccountLimit?: { TotalCodeSize?: number; CodeSizeUnzipped?: number; CodeSizeZipped?: number; ConcurrentExecutions?: number; UnreservedConcurrentExecutions?: number }; AccountUsage?: { TotalCodeSize?: number; FunctionCount?: number } }

export function LambdaDashboard() {
  const follow = useFollow()
  const settings = useAws<AccountSettings>("lambda", "GetAccountSettings", {})
  const functions = useFunctions()
  const s = settings.data
  const recent = [...(functions.data ?? [])].sort((a, b) => String(b.LastModified).localeCompare(String(a.LastModified))).slice(0, 5)
  const stat = (label: string, value: string) => (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box variant="awsui-value-large">{value}</Box>
    </div>
  )
  return (
    <LambdaLayout breadcrumbs={[{ text: "Dashboard", href: "/lambda" }]} contentType="dashboard">
      <ContentLayout header={<Header variant="h1" actions={<Button variant="primary" href="/lambda/create/function" onFollow={follow}>Create function</Button>}>Dashboard</Header>}>
        <SpaceBetween size="l">
          <Container header={<Header variant="h2" description="Resources used by Lambda functions in this AWS Region.">Resources for {`ap-southeast-7`}</Header>}>
            <ColumnLayout columns={4} variant="text-grid">
              {stat("Lambda function(s)", String(s?.AccountUsage?.FunctionCount ?? functions.data?.length ?? 0))}
              {stat("Code storage", `${consoleBytes(s?.AccountUsage?.TotalCodeSize ?? 0)} (${(((s?.AccountUsage?.TotalCodeSize ?? 0) / (s?.AccountLimit?.TotalCodeSize || 1)) * 100).toFixed(2)}%) of ${consoleBytes(s?.AccountLimit?.TotalCodeSize ?? 0)}`)}
              {stat("Full account concurrency", String(s?.AccountLimit?.ConcurrentExecutions ?? "–"))}
              {stat("Unreserved account concurrency", String(s?.AccountLimit?.UnreservedConcurrentExecutions ?? "–"))}
            </ColumnLayout>
          </Container>
          <Container header={<Header variant="h2">Account-level metrics</Header>}>
            <Box color="text-status-inactive">CloudWatch metrics (errors, invocations, duration, throttles) are not reported by the local emulator.</Box>
          </Container>
          <Table
            header={<Header variant="h2" actions={<Button href="/lambda/functions" onFollow={follow}>View all functions</Button>}>Recently modified functions</Header>}
            items={recent}
            loading={functions.isPending}
            columnDefinitions={[
              { id: "name", header: "Function name", cell: (f) => <Link href={fnHref(f.FunctionName)} onFollow={follow}>{f.FunctionName}</Link> },
              { id: "runtime", header: "Runtime", cell: (f) => runtimeLabel(f.Runtime) },
              { id: "modified", header: "Last modified", cell: (f) => lambdaDate(f.LastModified) },
            ]}
            empty={<Box textAlign="center" color="inherit"><b>No functions</b><Box variant="p" color="inherit">There are no Lambda functions in this Region.</Box></Box>}
          />
        </SpaceBetween>
      </ContentLayout>
    </LambdaLayout>
  )
}
