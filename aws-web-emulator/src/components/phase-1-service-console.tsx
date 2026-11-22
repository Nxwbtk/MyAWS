"use client"

import { useState } from "react"
import { Phase1OperationExplorer } from "@/components/phase-1-operation-explorer"
import { ResourceDetailView } from "@/components/resource-detail-view"
import { ServiceIcon } from "@/components/service-icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { runEmulatorOperation } from "@/lib/console-client"
import { findCatalogService } from "@/lib/service-catalog"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type GuidedOperation = {
  model: string
  operation: string
  label: string
  input?: Record<string, unknown>
}
type AreaOperation = GuidedOperation & { useRequiredInput?: boolean }
type ConsoleArea = { title: string; description: string; actions: GuidedOperation[] }

const consoles = {
  iam: {
    description:
      "Manage identities, permissions, roles, policies, and access analysis in the local emulator.",
    areas: [
      {
        title: "Identities",
        description: "Inspect users and groups, their metadata, and membership.",
        actions: [
          { model: "iam", operation: "ListUsers", label: "Users" },
          { model: "iam", operation: "ListGroups", label: "Groups" },
          { model: "iam", operation: "ListRoles", label: "Roles" },
        ],
      },
      {
        title: "Permissions",
        description: "Review customer managed policies and account authorization data.",
        actions: [
          { model: "iam", operation: "ListPolicies", label: "Policies" },
          { model: "iam", operation: "GetAccountAuthorizationDetails", label: "Authorization details" },
          { model: "iam", operation: "SimulateCustomPolicy", label: "Policy simulator" },
        ],
      },
      {
        title: "Access analysis",
        description: "Find analyzers and inspect findings for external or unused access.",
        actions: [
          { model: "accessanalyzer", operation: "ListAnalyzers", label: "Analyzers" },
          { model: "accessanalyzer", operation: "ListFindings", label: "Findings" },
        ],
      },
    ],
  },
  sts: {
    description:
      "Inspect the emulator caller identity and exercise AWS Security Token Service session APIs.",
    areas: [
      {
        title: "Caller identity",
        description: "Return the account, user ID, and ARN for the configured emulator credentials.",
        actions: [{ model: "sts", operation: "GetCallerIdentity", label: "Get caller identity" }],
      },
      {
        title: "Temporary credentials",
        description: "Request session credentials or decode an authorization message.",
        actions: [
          { model: "sts", operation: "GetSessionToken", label: "Get session token" },
          { model: "sts", operation: "GetFederationToken", label: "Get federation token" },
          { model: "sts", operation: "DecodeAuthorizationMessage", label: "Decode authorization message" },
        ],
      },
      {
        title: "Assume role",
        description: "Exercise role, web identity, and SAML federation flows.",
        actions: [
          { model: "sts", operation: "AssumeRole", label: "Assume role" },
          { model: "sts", operation: "AssumeRoleWithWebIdentity", label: "Web identity" },
          { model: "sts", operation: "AssumeRoleWithSAML", label: "SAML federation" },
        ],
      },
    ],
  },
  lambda: {
    description:
      "Inspect functions, code configuration, versions, aliases, layers, and event source mappings.",
    areas: [
      {
        title: "Functions",
        description: "List deployed functions, inspect configuration, and invoke a function.",
        actions: [
          { model: "lambda", operation: "ListFunctions", label: "Functions" },
          { model: "lambda", operation: "GetFunction", label: "Function details" },
          { model: "lambda", operation: "Invoke", label: "Invoke function" },
        ],
      },
      {
        title: "Triggers and integrations",
        description: "Inspect event source mappings and function URLs.",
        actions: [
          { model: "lambda", operation: "ListEventSourceMappings", label: "Event source mappings" },
          { model: "lambda", operation: "ListFunctionUrlConfigs", label: "Function URLs" },
        ],
      },
      {
        title: "Versions and layers",
        description: "Browse published versions, aliases, and reusable layers.",
        actions: [
          { model: "lambda", operation: "ListVersionsByFunction", label: "Versions" },
          { model: "lambda", operation: "ListAliases", label: "Aliases" },
          { model: "lambda", operation: "ListLayers", label: "Layers" },
        ],
      },
    ],
  },
  cloudwatch: {
    description:
      "Explore CloudWatch metrics, alarms, dashboards, logs, and application observability APIs.",
    areas: [
      {
        title: "Metrics and alarms",
        description: "Search metric namespaces and inspect alarm state and configuration.",
        actions: [
          { model: "cloudwatch", operation: "ListMetrics", label: "Metrics" },
          { model: "cloudwatch", operation: "DescribeAlarms", label: "Alarms" },
          { model: "cloudwatch", operation: "GetMetricData", label: "Metric data" },
        ],
      },
      {
        title: "Dashboards",
        description: "List dashboard names or retrieve a dashboard body and widgets.",
        actions: [
          { model: "cloudwatch", operation: "ListDashboards", label: "Dashboards" },
          { model: "cloudwatch", operation: "GetDashboard", label: "Dashboard details" },
        ],
      },
      {
        title: "Logs and application monitoring",
        description: "Inspect log groups and events, canaries, and application insights.",
        actions: [
          { model: "cloudwatchlogs", operation: "DescribeLogGroups", label: "Log groups" },
          { model: "cloudwatchlogs", operation: "FilterLogEvents", label: "Filter log events" },
          { model: "synthetics", operation: "DescribeCanaries", label: "Canaries" },
          { model: "applicationinsights", operation: "DescribeApplication", label: "Application insights" },
        ],
      },
    ],
  },
  cloudtrail: {
    description:
      "Review event history, trails, event data stores, queries, and CloudTrail Insights APIs.",
    areas: [
      {
        title: "Event history",
        description: "Search management events by time, identity, resource, or event name.",
        actions: [{ model: "cloudtrail", operation: "LookupEvents", label: "Lookup events" }],
      },
      {
        title: "Trails",
        description: "Inspect trail configuration, delivery status, and logging state.",
        actions: [
          { model: "cloudtrail", operation: "ListTrails", label: "Trails" },
          { model: "cloudtrail", operation: "DescribeTrails", label: "Trail details" },
          { model: "cloudtrail", operation: "GetTrailStatus", label: "Delivery status" },
        ],
      },
      {
        title: "CloudTrail Lake",
        description: "Inspect event data stores, saved queries, and query execution.",
        actions: [
          { model: "cloudtrail", operation: "ListEventDataStores", label: "Event data stores" },
          { model: "cloudtrail", operation: "ListQueries", label: "Saved queries" },
          { model: "cloudtrail", operation: "StartQuery", label: "Run a query" },
        ],
      },
    ],
  },
} as const satisfies Record<string, { description: string; areas: ConsoleArea[] }>

type GuidedService = keyof typeof consoles

type RowAction = {
  label: string
  operation: string
  input: (row: Record<string, unknown>, selectedValue?: string) => Record<string, unknown>
  detailView?: boolean
  useRequiredInput?: boolean
}
type ResourceInspection = GuidedOperation & { model: string }
type ResourceArea = {
  id: string
  title: string
  description: string
  model: string
  listOperation: string
  responseKeys: string[]
  pagination?: { inputToken: string; outputToken: string }
  requiredInput?: {
    field: string
    label: string
    placeholder?: string
    selectMessage?: string
    emptyMessage?: string
    sourceModel: string
    sourceOperation: string
    responseKey: string
    valueField: string
    labelField: string
    pagination?: { inputToken: string; outputToken: string }
  }
  columns: [string, string][]
  rowActions?: RowAction[]
  actions?: AreaOperation[]
}

const resourceAreas: Record<GuidedService, ResourceArea[]> = {
  iam: [
    {
      id: "users", title: "Users", description: "Users in the emulator account.", model: "iam", listOperation: "ListUsers", responseKeys: ["Users"], pagination: { inputToken: "Marker", outputToken: "Marker" },
      columns: [["UserName", "User name"], ["UserId", "User ID"], ["Arn", "ARN"], ["Path", "Path"], ["CreateDate", "Created"]],
      rowActions: [
        { label: "Details", operation: "GetUser", input: (row) => ({ UserName: row.UserName }), detailView: true },
        { label: "Managed policies", operation: "ListAttachedUserPolicies", input: (row) => ({ UserName: row.UserName }), detailView: true },
        { label: "Inline policies", operation: "ListUserPolicies", input: (row) => ({ UserName: row.UserName }), detailView: true },
        { label: "Access keys", operation: "ListAccessKeys", input: (row) => ({ UserName: row.UserName }), detailView: true },
        { label: "Delete", operation: "DeleteUser", input: (row) => ({ UserName: row.UserName }) },
      ],
      actions: [{ model: "iam", operation: "CreateUser", label: "Create user" }],
    },
    {
      id: "groups", title: "Groups", description: "Groups and their membership metadata.", model: "iam", listOperation: "ListGroups", responseKeys: ["Groups"], pagination: { inputToken: "Marker", outputToken: "Marker" },
      columns: [["GroupName", "Group name"], ["GroupId", "Group ID"], ["Arn", "ARN"], ["Path", "Path"]],
      rowActions: [
        { label: "Details", operation: "GetGroup", input: (row) => ({ GroupName: row.GroupName }), detailView: true },
        { label: "Managed policies", operation: "ListAttachedGroupPolicies", input: (row) => ({ GroupName: row.GroupName }), detailView: true },
        { label: "Inline policies", operation: "ListGroupPolicies", input: (row) => ({ GroupName: row.GroupName }), detailView: true },
        { label: "Delete", operation: "DeleteGroup", input: (row) => ({ GroupName: row.GroupName }) },
      ],
      actions: [{ model: "iam", operation: "CreateGroup", label: "Create group" }],
    },
    {
      id: "roles", title: "Roles", description: "Roles, trust policy, and attached permission metadata.", model: "iam", listOperation: "ListRoles", responseKeys: ["Roles"], pagination: { inputToken: "Marker", outputToken: "Marker" },
      columns: [["RoleName", "Role name"], ["RoleId", "Role ID"], ["Arn", "ARN"], ["Description", "Description"], ["MaxSessionDuration", "Session duration"]],
      rowActions: [
        { label: "Details", operation: "GetRole", input: (row) => ({ RoleName: row.RoleName }), detailView: true },
        { label: "Managed policies", operation: "ListAttachedRolePolicies", input: (row) => ({ RoleName: row.RoleName }), detailView: true },
        { label: "Inline policies", operation: "ListRolePolicies", input: (row) => ({ RoleName: row.RoleName }), detailView: true },
        { label: "Delete", operation: "DeleteRole", input: (row) => ({ RoleName: row.RoleName }) },
      ],
      actions: [{ model: "iam", operation: "CreateRole", label: "Create role" }],
    },
    {
      id: "policies", title: "Policies", description: "Managed policies, default versions, and attachment counts.", model: "iam", listOperation: "ListPolicies", responseKeys: ["Policies"], pagination: { inputToken: "Marker", outputToken: "Marker" },
      columns: [["PolicyName", "Policy name"], ["Arn", "ARN"], ["PolicyId", "Policy ID"], ["DefaultVersionId", "Default version"], ["AttachmentCount", "Attachments"]],
      rowActions: [
        { label: "Details", operation: "GetPolicy", input: (row) => ({ PolicyArn: row.Arn }), detailView: true },
        { label: "Versions", operation: "ListPolicyVersions", input: (row) => ({ PolicyArn: row.Arn }), detailView: true },
        { label: "Attached identities", operation: "ListEntitiesForPolicy", input: (row) => ({ PolicyArn: row.Arn }), detailView: true },
        { label: "Delete", operation: "DeletePolicy", input: (row) => ({ PolicyArn: row.Arn }) },
      ],
      actions: [{ model: "iam", operation: "CreatePolicy", label: "Create policy" }],
    },
    {
      id: "analyzers", title: "Access Analyzer", description: "Analyzers and their status in the current region.", model: "accessanalyzer", listOperation: "ListAnalyzers", responseKeys: ["analyzers"], pagination: { inputToken: "nextToken", outputToken: "nextToken" },
      columns: [["name", "Analyzer name"], ["arn", "ARN"], ["type", "Type"], ["status", "Status"]],
      rowActions: [
        { label: "Details", operation: "GetAnalyzer", input: (row) => ({ analyzerArn: row.arn }), detailView: true },
        { label: "Findings", operation: "ListFindings", input: (row) => ({ analyzerArn: row.arn }), detailView: true },
        { label: "Delete", operation: "DeleteAnalyzer", input: (row) => ({ analyzerArn: row.arn }) },
      ],
      actions: [{ model: "accessanalyzer", operation: "CreateAnalyzer", label: "Create analyzer" }],
    },
  ],
  sts: [],
  lambda: [
    {
      id: "functions", title: "Functions", description: "Deployed Lambda functions and configuration.", model: "lambda", listOperation: "ListFunctions", responseKeys: ["Functions"], pagination: { inputToken: "Marker", outputToken: "NextMarker" },
      columns: [["FunctionName", "Function name"], ["FunctionArn", "Function ARN"], ["Runtime", "Runtime"], ["Handler", "Handler"], ["State", "State"], ["MemorySize", "Memory (MB)"], ["Timeout", "Timeout (s)"], ["LastModified", "Last modified"]],
      rowActions: [
        { label: "Configuration", operation: "GetFunctionConfiguration", input: (row) => ({ FunctionName: row.FunctionName }), detailView: true },
        { label: "Invoke", operation: "Invoke", input: (row) => ({ FunctionName: row.FunctionName, InvocationType: "RequestResponse", Payload: "{}" }) },
        { label: "Delete", operation: "DeleteFunction", input: (row) => ({ FunctionName: row.FunctionName }) },
      ],
      actions: [{ model: "lambda", operation: "CreateFunction", label: "Create function" }],
    },
    {
      id: "event-sources", title: "Event source mappings", description: "Mappings that connect event sources to Lambda functions.", model: "lambda", listOperation: "ListEventSourceMappings", responseKeys: ["EventSourceMappings"], pagination: { inputToken: "Marker", outputToken: "NextMarker" },
      columns: [["UUID", "UUID"], ["EventSourceArn", "Event source ARN"], ["FunctionArn", "Function ARN"], ["State", "State"], ["BatchSize", "Batch size"]],
      rowActions: [
        { label: "Details", operation: "GetEventSourceMapping", input: (row) => ({ UUID: row.UUID }), detailView: true },
        { label: "Delete", operation: "DeleteEventSourceMapping", input: (row) => ({ UUID: row.UUID }) },
      ],
      actions: [{ model: "lambda", operation: "CreateEventSourceMapping", label: "Create mapping" }],
    },
    {
      id: "layers", title: "Layers", description: "Reusable Lambda layers and latest published versions.", model: "lambda", listOperation: "ListLayers", responseKeys: ["Layers"], pagination: { inputToken: "Marker", outputToken: "NextMarker" },
      columns: [["LayerName", "Layer name"], ["LatestMatchingVersion.Version", "Version"], ["LatestMatchingVersion.CompatibleRuntimes", "Compatible runtimes"]],
      rowActions: [
        { label: "Versions", operation: "ListLayerVersions", input: (row) => ({ LayerName: row.LayerName }), detailView: true },
        { label: "Publish layer version", operation: "PublishLayerVersion", input: (row) => ({ LayerName: row.LayerName }) },
      ],
      actions: [{ model: "lambda", operation: "PublishLayerVersion", label: "Publish layer" }],
    },
    {
      id: "versions", title: "Versions", description: "Published versions for the selected Lambda function.", model: "lambda", listOperation: "ListVersionsByFunction", responseKeys: ["Versions"], pagination: { inputToken: "Marker", outputToken: "NextMarker" },
      requiredInput: { field: "FunctionName", label: "Function", placeholder: "Select a function", selectMessage: "Select a function to view its published versions.", emptyMessage: "No Lambda functions are available in this emulator.", sourceModel: "lambda", sourceOperation: "ListFunctions", responseKey: "Functions", valueField: "FunctionName", labelField: "FunctionName", pagination: { inputToken: "Marker", outputToken: "NextMarker" } },
      columns: [["Version", "Version"], ["FunctionArn", "Function ARN"], ["Description", "Description"], ["Runtime", "Runtime"], ["LastModified", "Last modified"], ["MemorySize", "Memory (MB)"], ["Timeout", "Timeout (s)"]],
      rowActions: [{ label: "Configuration", operation: "GetFunctionConfiguration", input: (row) => ({ Qualifier: row.Version }), useRequiredInput: true, detailView: true }],
      actions: [{ model: "lambda", operation: "PublishVersion", label: "Publish version", useRequiredInput: true }],
    },
    {
      id: "aliases", title: "Aliases", description: "Traffic aliases and version routing for the selected function.", model: "lambda", listOperation: "ListAliases", responseKeys: ["Aliases"], pagination: { inputToken: "Marker", outputToken: "NextMarker" },
      requiredInput: { field: "FunctionName", label: "Function", placeholder: "Select a function", selectMessage: "Select a function to view its aliases.", emptyMessage: "No Lambda functions are available in this emulator.", sourceModel: "lambda", sourceOperation: "ListFunctions", responseKey: "Functions", valueField: "FunctionName", labelField: "FunctionName", pagination: { inputToken: "Marker", outputToken: "NextMarker" } },
      columns: [["Name", "Alias"], ["FunctionVersion", "Version"], ["Description", "Description"], ["AliasArn", "Alias ARN"], ["RoutingConfig.AdditionalVersionWeights", "Additional versions"]],
      rowActions: [
        { label: "Details", operation: "GetAlias", input: (row) => ({ Name: row.Name }), useRequiredInput: true, detailView: true },
        { label: "Delete", operation: "DeleteAlias", input: (row) => ({ Name: row.Name }), useRequiredInput: true },
      ],
      actions: [{ model: "lambda", operation: "CreateAlias", label: "Create alias", input: { FunctionVersion: "$LATEST" }, useRequiredInput: true }],
    },
    {
      id: "function-urls", title: "Function URLs", description: "HTTPS endpoints and authentication settings for the selected function.", model: "lambda", listOperation: "ListFunctionUrlConfigs", responseKeys: ["FunctionUrlConfigs"], pagination: { inputToken: "Marker", outputToken: "NextMarker" },
      requiredInput: { field: "FunctionName", label: "Function", placeholder: "Select a function", selectMessage: "Select a function to view its function URLs.", emptyMessage: "No Lambda functions are available in this emulator.", sourceModel: "lambda", sourceOperation: "ListFunctions", responseKey: "Functions", valueField: "FunctionName", labelField: "FunctionName", pagination: { inputToken: "Marker", outputToken: "NextMarker" } },
      columns: [["FunctionArn", "Function ARN"], ["FunctionUrl", "Function URL"], ["AuthType", "Authentication"], ["InvokeMode", "Invoke mode"], ["CreationTime", "Created"], ["LastModifiedTime", "Last modified"]],
      rowActions: [
        { label: "Details", operation: "GetFunctionUrlConfig", input: (row) => {
          const arnParts = String(row.FunctionArn ?? "").split(":")
          return arnParts.length > 7 ? { Qualifier: arnParts.slice(7).join(":") } : {}
        }, useRequiredInput: true, detailView: true },
        { label: "Delete", operation: "DeleteFunctionUrlConfig", input: (row) => {
          const arnParts = String(row.FunctionArn ?? "").split(":")
          return arnParts.length > 7 ? { Qualifier: arnParts.slice(7).join(":") } : {}
        }, useRequiredInput: true },
      ],
      actions: [{ model: "lambda", operation: "CreateFunctionUrlConfig", label: "Create function URL", input: { AuthType: "AWS_IAM" }, useRequiredInput: true }],
    },
  ],
  cloudwatch: [
    {
      id: "alarms", title: "Alarms", description: "Metric and composite alarms with current state.", model: "cloudwatch", listOperation: "DescribeAlarms", responseKeys: ["MetricAlarms", "CompositeAlarms"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["AlarmName", "Alarm name"], ["AlarmArn", "ARN"], ["StateValue", "State"], ["MetricName", "Metric"], ["Namespace", "Namespace"], ["StateUpdatedTimestamp", "Last updated"]],
      rowActions: [
        { label: "Details", operation: "DescribeAlarms", input: (row) => ({ AlarmNames: [row.AlarmName] }), detailView: true },
        { label: "Delete", operation: "DeleteAlarms", input: (row) => ({ AlarmNames: [row.AlarmName] }) },
      ],
      actions: [{ model: "cloudwatch", operation: "PutMetricAlarm", label: "Create or update alarm" }],
    },
    {
      id: "dashboards", title: "Dashboards", description: "Dashboard inventory and last modification details.", model: "cloudwatch", listOperation: "ListDashboards", responseKeys: ["DashboardEntries"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["DashboardName", "Dashboard name"], ["DashboardArn", "ARN"], ["LastModified", "Last modified"], ["Size", "Size (bytes)"]],
      rowActions: [
        { label: "Open dashboard", operation: "GetDashboard", input: (row) => ({ DashboardName: row.DashboardName }), detailView: true },
        { label: "Delete", operation: "DeleteDashboards", input: (row) => ({ DashboardNames: [row.DashboardName] }) },
      ],
      actions: [{ model: "cloudwatch", operation: "PutDashboard", label: "Create or update dashboard" }],
    },
    {
      id: "metrics", title: "Metrics", description: "Metrics published in the selected region.", model: "cloudwatch", listOperation: "ListMetrics", responseKeys: ["Metrics"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["Namespace", "Namespace"], ["MetricName", "Metric name"], ["Dimensions", "Dimensions"]],
      rowActions: [{ label: "Query metric data", operation: "GetMetricData", input: (row) => ({ MetricDataQueries: [{ Id: "m1", MetricStat: { Metric: row, Period: 60, Stat: "Average" }, ReturnData: true }], StartTime: new Date(Date.now() - 3600000).toISOString(), EndTime: new Date().toISOString() }), detailView: true }],
      actions: [{ model: "cloudwatch", operation: "PutMetricData", label: "Publish metric data" }],
    },
    {
      id: "logs", title: "Log groups", description: "CloudWatch Logs groups, retention, storage, and streams.", model: "cloudwatchlogs", listOperation: "DescribeLogGroups", responseKeys: ["logGroups"], pagination: { inputToken: "nextToken", outputToken: "nextToken" },
      columns: [["logGroupName", "Log group"], ["logGroupArn", "ARN"], ["retentionInDays", "Retention (days)"], ["storedBytes", "Stored bytes"], ["creationTime", "Created"]],
      rowActions: [
        { label: "Log streams", operation: "DescribeLogStreams", input: (row) => ({ logGroupName: row.logGroupName }), detailView: true },
        { label: "Delete", operation: "DeleteLogGroup", input: (row) => ({ logGroupName: row.logGroupName }) },
      ],
      actions: [{ model: "cloudwatchlogs", operation: "CreateLogGroup", label: "Create log group" }],
    },
    {
      id: "canaries", title: "Synthetics canaries", description: "Canary status, schedule, and artifact locations.", model: "synthetics", listOperation: "DescribeCanaries", responseKeys: ["Canaries"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["Name", "Canary name"], ["Id", "ID"], ["Status.State", "State"], ["RuntimeVersion", "Runtime"], ["Schedule.Expression", "Schedule"]],
      rowActions: [
        { label: "Details", operation: "DescribeCanariesLastRun", input: (row) => ({ Name: row.Name }), detailView: true },
        { label: "Delete", operation: "DeleteCanary", input: (row) => ({ Name: row.Name }) },
      ],
    },
    {
      id: "application-insights", title: "Application Insights", description: "Applications monitored by CloudWatch Application Insights.", model: "applicationinsights", listOperation: "ListApplications", responseKeys: ["ApplicationInfoList"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["ResourceGroupName", "Resource group"], ["AccountId", "Account ID"], ["LifeCycle", "Lifecycle"], ["AutoConfigurationEnabled", "Auto configuration"], ["OpsCenterEnabled", "OpsCenter"]],
      rowActions: [{ label: "Details", operation: "DescribeApplication", input: (row) => ({ ResourceGroupName: row.ResourceGroupName, AccountId: row.AccountId }), detailView: true }],
      actions: [{ model: "applicationinsights", operation: "CreateApplication", label: "Add application" }],
    },
    {
      id: "rum-applications", title: "CloudWatch RUM applications", description: "Real User Monitoring applications and CloudWatch Logs settings.", model: "rum", listOperation: "ListAppMonitors", responseKeys: ["AppMonitorSummaries"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["Name", "Application name"], ["Id", "ID"], ["Domain", "Domain"], ["CwLogEnabled", "CloudWatch Logs"], ["Created", "Created"], ["Updated", "Updated"]],
      rowActions: [
        { label: "Details", operation: "GetAppMonitor", input: (row) => ({ Name: row.Name }), detailView: true },
        { label: "Delete", operation: "DeleteAppMonitor", input: (row) => ({ Name: row.Name }) },
      ],
      actions: [{ model: "rum", operation: "CreateAppMonitor", label: "Create RUM application" }],
    },
    {
      id: "internet-monitors", title: "Internet Monitors", description: "Internet Monitor status and monitored resources.", model: "internetmonitor", listOperation: "ListMonitors", responseKeys: ["Monitors"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["MonitorName", "Monitor name"], ["MonitorArn", "ARN"], ["Status", "Status"], ["ProcessingStatus", "Processing"], ["CreatedAt", "Created"], ["ModifiedAt", "Modified"]],
      rowActions: [
        { label: "Details", operation: "GetMonitor", input: (row) => ({ MonitorName: row.MonitorName }), detailView: true },
        { label: "Delete", operation: "DeleteMonitor", input: (row) => ({ MonitorName: row.MonitorName }) },
      ],
      actions: [{ model: "internetmonitor", operation: "CreateMonitor", label: "Create monitor" }],
    },
    {
      id: "network-monitors", title: "Network Monitors", description: "Network Monitor state, probes, and aggregation settings.", model: "networkmonitor", listOperation: "ListMonitors", responseKeys: ["monitors"], pagination: { inputToken: "nextToken", outputToken: "nextToken" },
      columns: [["monitorName", "Monitor name"], ["monitorArn", "ARN"], ["state", "State"], ["aggregationPeriod", "Aggregation (s)"], ["createdAt", "Created"], ["modifiedAt", "Modified"]],
      rowActions: [
        { label: "Details", operation: "GetMonitor", input: (row) => ({ monitorName: row.monitorName }), detailView: true },
        { label: "Delete", operation: "DeleteMonitor", input: (row) => ({ monitorName: row.monitorName }) },
      ],
      actions: [{ model: "networkmonitor", operation: "CreateMonitor", label: "Create network monitor" }],
    },
    {
      id: "network-flow-monitors", title: "Network Flow Monitors", description: "Network Flow Monitor resources and their monitoring status.", model: "networkflowmonitor", listOperation: "ListMonitors", responseKeys: ["monitors"], pagination: { inputToken: "nextToken", outputToken: "nextToken" },
      columns: [["monitorName", "Monitor name"], ["monitorArn", "ARN"], ["monitorStatus", "Status"], ["createdAt", "Created"], ["modifiedAt", "Modified"]],
      rowActions: [
        { label: "Details", operation: "GetMonitor", input: (row) => ({ monitorName: row.monitorName }), detailView: true },
        { label: "Delete", operation: "DeleteMonitor", input: (row) => ({ monitorName: row.monitorName }) },
      ],
      actions: [{ model: "networkflowmonitor", operation: "CreateMonitor", label: "Create flow monitor" }],
    },
    {
      id: "metric-streams", title: "Metric Streams", description: "CloudWatch metric streams and their Firehose destinations.", model: "cloudwatch", listOperation: "ListMetricStreams", responseKeys: ["Entries"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["Name", "Stream name"], ["Arn", "ARN"], ["State", "State"], ["FirehoseArn", "Firehose ARN"], ["RoleArn", "Role ARN"], ["OutputFormat", "Output format"]],
      rowActions: [
        { label: "Details", operation: "GetMetricStream", input: (row) => ({ Name: row.Name }), detailView: true },
        { label: "Delete", operation: "DeleteMetricStream", input: (row) => ({ Name: row.Name }) },
      ],
      actions: [{ model: "cloudwatch", operation: "PutMetricStream", label: "Create or update stream" }],
    },
    {
      id: "oam-sinks", title: "Observability sinks", description: "Cross-account observability sinks and allowed source services.", model: "oam", listOperation: "ListSinks", responseKeys: ["Items"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["Name", "Sink name"], ["Arn", "ARN"], ["Id", "ID"], ["ResourceTypes", "Resource types"], ["AllowedSourceTypes", "Allowed sources"]],
      rowActions: [
        { label: "Details", operation: "GetSink", input: (row) => ({ Identifier: row.Arn }), detailView: true },
        { label: "Delete", operation: "DeleteSink", input: (row) => ({ Identifier: row.Arn }) },
      ],
      actions: [{ model: "oam", operation: "CreateSink", label: "Create sink" }],
    },
    {
      id: "oam-links", title: "Observability links", description: "Links from source accounts to observability sinks.", model: "oam", listOperation: "ListLinks", responseKeys: ["Items"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["Label", "Link label"], ["Arn", "ARN"], ["SinkArn", "Sink ARN"], ["ResourceTypes", "Resource types"], ["LinkStatus", "Status"]],
      rowActions: [{ label: "Details", operation: "GetLink", input: (row) => ({ Identifier: row.Arn }), detailView: true }],
      actions: [{ model: "oam", operation: "CreateLink", label: "Create link" }],
    },
  ],
  cloudtrail: [
    {
      id: "trails", title: "Trails", description: "Trail configuration and delivery status.", model: "cloudtrail", listOperation: "ListTrails", responseKeys: ["Trails"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["Name", "Trail name"], ["TrailARN", "ARN"], ["HomeRegion", "Home region"], ["S3BucketName", "S3 bucket"], ["IsOrganizationTrail", "Organization trail"]],
      rowActions: [
        { label: "Details", operation: "GetTrail", input: (row) => ({ Name: row.TrailARN ?? row.Name }), detailView: true },
        { label: "Delivery status", operation: "GetTrailStatus", input: (row) => ({ Name: row.TrailARN ?? row.Name }), detailView: true },
        { label: "Start logging", operation: "StartLogging", input: (row) => ({ Name: row.TrailARN ?? row.Name }) },
        { label: "Stop logging", operation: "StopLogging", input: (row) => ({ Name: row.TrailARN ?? row.Name }) },
        { label: "Delete", operation: "DeleteTrail", input: (row) => ({ Name: row.TrailARN ?? row.Name }) },
      ],
      actions: [{ model: "cloudtrail", operation: "CreateTrail", label: "Create trail" }],
    },
    {
      id: "event-data-stores", title: "Event data stores", description: "CloudTrail Lake stores and retention configuration.", model: "cloudtrail", listOperation: "ListEventDataStores", responseKeys: ["EventDataStores"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["Name", "Name"], ["EventDataStoreArn", "ARN"], ["Status", "Status"], ["RetentionPeriod", "Retention (days)"], ["MultiRegionEnabled", "Multi-region"]],
      rowActions: [
        { label: "Details", operation: "GetEventDataStore", input: (row) => ({ EventDataStore: row.EventDataStoreArn }), detailView: true },
        { label: "Delete", operation: "DeleteEventDataStore", input: (row) => ({ EventDataStore: row.EventDataStoreArn, TerminationProtectionEnabled: false }) },
      ],
      actions: [{ model: "cloudtrail", operation: "CreateEventDataStore", label: "Create event data store" }],
    },
    {
      id: "event-history", title: "Event history", description: "Recent management events in the current region.", model: "cloudtrail", listOperation: "LookupEvents", responseKeys: ["Events"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      columns: [["EventTime", "Event time"], ["EventName", "Event name"], ["EventSource", "Event source"], ["Username", "User name"], ["EventId", "Event ID"]],
      rowActions: [{ label: "Event details", operation: "LookupEvents", input: (row) => ({ LookupAttributes: [{ AttributeKey: "EventId", AttributeValue: row.EventId }], MaxResults: 1 }), detailView: true }],
    },
    {
      id: "queries", title: "Saved queries", description: "CloudTrail Lake saved query definitions. Select an event data store before listing queries.", model: "cloudtrail", listOperation: "ListQueries", responseKeys: ["Queries"], pagination: { inputToken: "NextToken", outputToken: "NextToken" },
      requiredInput: { field: "EventDataStore", label: "Event data store", placeholder: "Select an event data store", selectMessage: "Select an event data store to view its saved queries.", emptyMessage: "No event data stores are available in this emulator.", sourceModel: "cloudtrail", sourceOperation: "ListEventDataStores", responseKey: "EventDataStores", valueField: "EventDataStoreArn", labelField: "Name", pagination: { inputToken: "NextToken", outputToken: "NextToken" } },
      columns: [["QueryId", "Query ID"], ["Name", "Name"], ["Description", "Description"], ["CreationTime", "Created"]],
      rowActions: [
        { label: "Query results", operation: "GetQueryResults", input: (row) => ({ QueryId: row.QueryId }), detailView: true },
        { label: "Cancel query", operation: "CancelQuery", input: (row) => ({ QueryId: row.QueryId }) },
      ],
    },
  ],
}

function nestedValue(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined
    return (value as Record<string, unknown>)[key]
  }, row)
}

function displayValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function ServiceResourceBrowser({
  service,
  onOperation,
  onInspect,
}: {
  service: GuidedService
  onOperation: (operation: GuidedOperation) => void
  onInspect: (inspection: ResourceInspection) => void
}) {
  const areas = resourceAreas[service]
  const [activeArea, setActiveArea] = useState(areas[0]?.id ?? "")
  if (!areas.length) return null
  const active = areas.find(({ id }) => id === activeArea) ?? areas[0]
  return (
    <Card className="gap-0 rounded-xl border py-0 ring-0">
      <CardHeader className="border-b bg-surface-subtle px-4 py-3.5 sm:px-5">
        <h2 className="text-lg font-semibold">Local resources</h2>
        <p className="text-sm text-muted-foreground">Resource lists and details come from the configured emulator.</p>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">
        <Tabs value={active.id} onValueChange={setActiveArea}>
          <TabsList className="h-auto w-full max-w-full flex-wrap justify-start overflow-visible">
            {areas.map((area) => <TabsTrigger key={area.id} value={area.id} className="flex-none">{area.title}</TabsTrigger>)}
          </TabsList>
          {areas.map((area) => (
            <TabsContent key={area.id} value={area.id}>
              <ResourceListPanel area={area} onOperation={onOperation} onInspect={onInspect} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

function ResourceListPanel({
  area,
  onOperation,
  onInspect,
}: {
  area: ResourceArea
  onOperation: (operation: GuidedOperation) => void
  onInspect: (inspection: ResourceInspection) => void
}) {
  const [requiredInputValue, setRequiredInputValue] = useState("")
  const optionQuery = useInfiniteQuery({
    queryKey: [
      "emulator",
      "phase-1-resource-options",
      area.requiredInput?.sourceModel,
      area.requiredInput?.sourceOperation,
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      runEmulatorOperation<Record<string, unknown>>(
        area.requiredInput!.sourceModel,
        area.requiredInput!.sourceOperation,
        pageParam && area.requiredInput!.pagination
          ? { [area.requiredInput!.pagination.inputToken]: pageParam }
          : {},
        signal,
      ),
    enabled: Boolean(area.requiredInput),
    getNextPageParam: (page) => {
      const pagination = area.requiredInput?.pagination
      const token = pagination ? page[pagination.outputToken] : undefined
      return typeof token === "string" && token ? token : undefined
    },
  })
  const inputOptions = (() => {
    if (!area.requiredInput) return []
    return optionQuery.data?.pages.flatMap((page) => {
      const values = page[area.requiredInput!.responseKey]
      if (!Array.isArray(values)) return []
      return values.flatMap((value) => {
        if (!value || typeof value !== "object") return []
        const record = value as Record<string, unknown>
        const id = record[area.requiredInput!.valueField]
        const label = record[area.requiredInput!.labelField]
        return typeof id === "string" && id
          ? [{ id, label: typeof label === "string" && label ? label : id }]
          : []
      })
    }) ?? []
  })()
  const query = useInfiniteQuery({
    queryKey: ["emulator", "phase-1-resources", area.model, area.listOperation, requiredInputValue],
    initialPageParam: undefined as string | undefined,
    enabled: !area.requiredInput || Boolean(requiredInputValue),
    queryFn: ({ signal, pageParam }) => runEmulatorOperation<Record<string, unknown>>(
      area.model,
      area.listOperation,
      {
        ...(pageParam && area.pagination
          ? { [area.pagination.inputToken]: pageParam }
          : {}),
        ...(area.requiredInput
          ? { [area.requiredInput.field]: requiredInputValue }
          : {}),
      },
      signal,
    ),
    getNextPageParam: (page) => {
      const token = area.pagination
        ? page[area.pagination.outputToken]
        : undefined
      return typeof token === "string" && token ? token : undefined
    },
  })
  const rows = area.responseKeys.flatMap((key) => {
    return query.data?.pages.flatMap((page) => {
      const values = page[key]
      return Array.isArray(values) ? values.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : []
    }) ?? []
  })
  return (
    <div className="mt-3 overflow-hidden rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface-subtle px-4 py-3">
        <div>
          <h3 className="font-semibold">{area.title}<Badge className="ml-2" variant="secondary">{query.isSuccess ? rows.length : "—"}</Badge></h3>
          <p className="mt-1 text-sm text-muted-foreground">{area.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {area.actions?.map((action) => <Button key={`${action.model}.${action.operation}`} size="sm" variant="outline" onClick={() => onOperation({ ...action, input: { ...action.input, ...(action.useRequiredInput && area.requiredInput ? { [area.requiredInput.field]: requiredInputValue } : {}) } })}>{action.label}</Button>)}
          <Button size="sm" variant="outline" disabled={query.isFetching || Boolean(area.requiredInput && !requiredInputValue)} onClick={() => void query.refetch()}>{query.isFetching ? "Refreshing…" : "Refresh"}</Button>
        </div>
      </div>
      {area.requiredInput && (
        <div className="border-b bg-background px-4 py-3">
          <label className="grid max-w-xl gap-1.5 text-sm font-medium">
            {area.requiredInput.label}
            <select
              className="h-9 rounded-md border bg-background px-3 font-normal"
              value={requiredInputValue}
              onChange={(event) => setRequiredInputValue(event.target.value)}
            >
              <option value="">{area.requiredInput.placeholder ?? `Select ${area.requiredInput.label.toLowerCase()}`}</option>
              {inputOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {optionQuery.hasNextPage && (
            <Button className="mt-2" size="sm" variant="outline" disabled={optionQuery.isFetching} onClick={() => void optionQuery.fetchNextPage()}>
              {optionQuery.isFetchingNextPage ? "Loading more…" : `Load more ${area.requiredInput.label.toLowerCase()}s`}
            </Button>
          )}
          {optionQuery.error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {optionQuery.error.message}
            </p>
          )}
        </div>
      )}
      {query.error ? (
        <p role="alert" className="p-4 text-sm text-destructive">{query.error.message}</p>
      ) : area.requiredInput && !requiredInputValue ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          {optionQuery.isPending
            ? `Loading ${area.requiredInput.label.toLowerCase()}s…`
            : inputOptions.length
              ? area.requiredInput.selectMessage ?? `Select a ${area.requiredInput.label.toLowerCase()} to view ${area.title.toLowerCase()}.`
              : area.requiredInput.emptyMessage ?? `No ${area.requiredInput.label.toLowerCase()}s are available in this emulator.`}
        </p>
      ) : query.isPending ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">Loading {area.title.toLowerCase()}…</p>
      ) : rows.length === 0 ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">No {area.title.toLowerCase()} found.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-surface-subtle"><TableRow>{area.columns.map(([, label]) => <TableHead key={label}>{label}</TableHead>)}{area.rowActions?.length ? <TableHead>Actions</TableHead> : null}</TableRow></TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const key = displayValue(row.UserName ?? row.GroupName ?? row.RoleName ?? row.PolicyId ?? row.arn ?? row.FunctionName ?? row.UUID ?? row.LayerName ?? row.AlarmName ?? row.DashboardName ?? row.logGroupName ?? row.Name ?? row.TrailARN ?? row.EventDataStoreArn ?? row.EventId ?? index)
                return (
                  <TableRow key={`${key}:${index}`}>
                    {area.columns.map(([field]) => <TableCell key={field} className="max-w-72 truncate">{displayValue(nestedValue(row, field))}</TableCell>)}
                    {area.rowActions?.length ? (
                      <TableCell><div className="flex flex-wrap gap-1">{area.rowActions.map((action) => <Button key={action.label} size="xs" variant={/^(Delete|Stop|Disable|Revoke)/.test(action.operation) ? "destructive" : "outline"} onClick={() => {
                        const request = { model: area.model, operation: action.operation, label: action.label, input: { ...action.input(row, requiredInputValue), ...(action.useRequiredInput && area.requiredInput ? { [area.requiredInput.field]: requiredInputValue } : {}) } }
                        if (action.detailView) onInspect(request)
                        else onOperation(request)
                      }}>{action.label}</Button>)}</div></TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {query.hasNextPage && (
        <div className="border-t p-3">
          <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>
            {query.isFetchingNextPage ? "Loading more…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  )
}

export function Phase1ServiceConsole({ service }: { service: GuidedService }) {
  const [selection, setSelection] = useState<GuidedOperation>()
  const [inspection, setInspection] = useState<ResourceInspection>()
  const entry = findCatalogService(service)
  const definition = consoles[service]
  const inspectionQuery = useQuery({
    queryKey: ["emulator", "phase-1-resource-detail", inspection?.model, inspection?.operation, JSON.stringify(inspection?.input ?? {})],
    queryFn: ({ signal }) => {
      if (!inspection) throw new Error("Select a resource first.")
      return runEmulatorOperation(inspection.model, inspection.operation, inspection.input ?? {}, signal)
    },
    enabled: Boolean(inspection),
  })
  if (!entry) return null

  function runOperation(operation: GuidedOperation) {
    setInspection(undefined)
    setSelection(operation)
  }

  function inspectResource(resource: ResourceInspection) {
    setSelection(undefined)
    setInspection(resource)
  }

  return (
    <>
      <section className="flex flex-wrap items-center gap-3.5">
        <ServiceIcon id={service} className="size-10" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
              {entry.name}
            </h1>
            <Badge variant="secondary">Local emulator</Badge>
          </div>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            {definition.description}
          </p>
        </div>
      </section>

      {service === "sts" ? (
        <StsIdentityPanel onOperation={runOperation} />
      ) : (
        <ServiceResourceBrowser service={service} onOperation={runOperation} onInspect={inspectResource} />
      )}

      {inspection && (
        <Card className="gap-0 rounded-xl border py-0 ring-0">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface-subtle px-4 py-3.5 sm:px-5">
            <div>
              <h2 className="text-lg font-semibold">{inspection.label}</h2>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{inspection.model}.{inspection.operation}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={inspectionQuery.isFetching} onClick={() => void inspectionQuery.refetch()}>
                {inspectionQuery.isFetching ? "Refreshing…" : "Refresh details"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setInspection(undefined)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            {inspectionQuery.error ? (
              <p role="alert" className="text-sm text-destructive">{inspectionQuery.error.message}</p>
            ) : inspectionQuery.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">Loading {inspection.label.toLowerCase()}…</p>
            ) : (
              <ResourceDetailView value={inspectionQuery.data} />
            )}
          </CardContent>
        </Card>
      )}

      <section aria-label={`${entry.name} console sections`} className="grid gap-4 lg:grid-cols-3">
        {definition.areas.map((area) => (
          <Card key={area.title} className="gap-0 rounded-xl border py-0 ring-0">
            <CardHeader className="border-b bg-surface-subtle px-4 py-3.5">
              <h2 className="text-base font-semibold">{area.title}</h2>
              <p className="text-sm leading-5 text-muted-foreground">{area.description}</p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 p-4">
              {area.actions.map((action) => (
                <Button
                  key={`${action.model}.${action.operation}`}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => runOperation(action)}
                >
                  {action.label}
                </Button>
              ))}
            </CardContent>
          </Card>
        ))}
      </section>

      <Phase1OperationExplorer
        key={`${service}:${selection?.model ?? "all"}:${selection?.operation ?? ""}:${JSON.stringify(selection?.input ?? {})}`}
        service={service}
        initialModel={selection?.model}
        initialOperation={selection?.operation}
        initialValues={selection?.input}
        startExpanded={Boolean(selection)}
      />
      <p className="text-xs text-muted-foreground">
        API requests run against the configured local emulator. Operations marked as stubs or missing SDK commands are not sent.
      </p>
    </>
  )
}

function StsIdentityPanel({
  onOperation,
}: {
  onOperation: (operation: GuidedOperation) => void
}) {
  const identity = useQuery({
    queryKey: ["emulator", "sts", "identity"],
    queryFn: ({ signal }) => runEmulatorOperation<Record<string, unknown>>("sts", "GetCallerIdentity", {}, signal),
  })
  const fields = identity.data ? Object.entries(identity.data) : []
  return (
    <Card className="gap-0 rounded-xl border py-0 ring-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface-subtle px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="text-lg font-semibold">Caller identity</h2>
          <p className="text-sm text-muted-foreground">Identity returned by the configured local emulator credentials.</p>
        </div>
        <Button size="sm" variant="outline" disabled={identity.isFetching} onClick={() => void identity.refetch()}>
          {identity.isFetching ? "Refreshing…" : "Refresh identity"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 sm:p-5">
        {identity.error ? (
          <p role="alert" className="text-sm text-destructive">{identity.error.message}</p>
        ) : identity.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">Loading caller identity…</p>
        ) : (
          <dl className="grid gap-3 rounded-lg border bg-surface-subtle p-4 sm:grid-cols-3">
            {fields.map(([name, value]) => <div key={name} className="min-w-0"><dt className="text-sm text-muted-foreground">{name}</dt><dd className="mt-1 break-all font-mono text-sm">{displayValue(value)}</dd></div>)}
          </dl>
        )}
        <div className="flex flex-wrap gap-2">
          {[
            { model: "sts", operation: "GetSessionToken", label: "Get session token" },
            { model: "sts", operation: "AssumeRole", label: "Assume role" },
            { model: "sts", operation: "AssumeRoleWithWebIdentity", label: "Web identity" },
            { model: "sts", operation: "AssumeRoleWithSAML", label: "SAML federation" },
          ].map((action) => <Button key={action.operation} size="sm" variant="outline" onClick={() => onOperation(action)}>{action.label}</Button>)}
        </div>
      </CardContent>
    </Card>
  )
}
