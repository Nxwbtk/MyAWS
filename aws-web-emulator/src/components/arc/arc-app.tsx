"use client"

import { col, copyField, CountDashboard, dateCol, dateField, ob, ServiceRouter, Status, stateCol, stateField, SubTable, sv, tagMap, textField, type FormSpec, type ServiceApp, type Values } from "@/components/console/service-app"
import { dash, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { callAws } from "@/lib/aws"

const ZS = "arczonalshift"
const RC = "route53recoverycontrolconfig"
const RR = "route53recoveryreadiness"
const RS = "arcregionswitch"
const last = (arn: unknown) => String(arn ?? "").split("/").pop() ?? ""
const tagsOf = (v: Values) => { const t = tagMap((v.tags as { Key: string; Value?: string }[]) ?? []); return Object.keys(t).length ? t : undefined }
const managedSource = { model: ZS, operation: "ListManagedResources", items: (p: Item) => (p.items as Item[]) ?? [], value: (i: Item) => String(i.arn), label: (i: Item) => String(i.name ?? last(i.arn)), description: (i: Item) => String(i.arn) }
const clusterSource = { model: RC, operation: "ListClusters", items: (p: Item) => (p.Clusters as Item[]) ?? [], value: (i: Item) => String(i.ClusterArn), label: (i: Item) => String(i.Name), description: (i: Item) => String(i.Status) }

/* ---------- Region switch ---------- */

const plans: ResourceDef = {
  tagResource: false,
  path: "/arc/plans",
  title: "Region switch plans",
  singular: "plan",
  description: "Region switch plans orchestrate the steps to shift your multi-Region application to another Region.",
  model: RS,
  operation: "ListPlans",
  items: (p) => (p.plans as Item[]) ?? [],
  key: (i) => last(i.arn),
  display: (i) => String(i.name),
  linkColumn: 0,
  columns: [col("name", "Name", (i) => i.name), col("regions", "Regions", (i) => (i.regions as string[] | undefined)?.join(", ")), col("approach", "Recovery approach", (i) => i.recoveryApproach), col("primary", "Primary Region", (i) => i.primaryRegion), col("version", "Version", (i) => i.version), dateCol("updated", "Last updated", "updatedAt")],
  details: [textField("Name", (i) => i.name), copyField("ARN", (i) => i.arn), textField("Regions", (i) => i.regions), textField("Recovery approach", (i) => i.recoveryApproach), textField("Primary Region", (i) => i.primaryRegion), textField("Execution role", (i) => i.executionRole), textField("Description", (i) => i.description)],
}

/* ---------- Zonal shift ---------- */

const zonalShifts: ResourceDef = {
  tagResource: false,
  path: "/arc/zonal-shifts",
  title: "Zonal shifts",
  singular: "zonal shift",
  description: "A zonal shift moves traffic for a supported resource away from an Availability Zone in a Region.",
  model: ZS,
  operation: "ListZonalShifts",
  input: { status: "ACTIVE" },
  items: (p) => (p.items as Item[]) ?? [],
  key: (i) => String(i.zonalShiftId),
  display: (i) => String(i.zonalShiftId),
  linkColumn: 0,
  columns: [col("id", "Zonal shift ID", (i) => i.zonalShiftId), col("resource", "Resource", (i) => last(i.resourceIdentifier)), col("away", "Away from", (i) => i.awayFrom), stateCol("status"), dateCol("start", "Start time", "startTime"), dateCol("expiry", "Expiry time", "expiryTime"), col("comment", "Comment", (i) => i.comment)],
  details: [copyField("Zonal shift ID", (i) => i.zonalShiftId), copyField("Resource", (i) => i.resourceIdentifier), textField("Away from", (i) => i.awayFrom), stateField("Status", "status"), dateField("Start time", "startTime"), dateField("Expiry time", "expiryTime"), textField("Comment", (i) => i.comment), textField("Shift type", (i) => i.shiftType)],
  actions: [
    { id: "cancel", text: "Cancel zonal shift", enabled: (s) => s.length === 1 && s[0].status === "ACTIVE", run: (s) => callAws(ZS, "CancelZonalShift", { zonalShiftId: s[0].zonalShiftId }), success: () => "Zonal shift canceled." },
    { id: "extend", text: "Extend by 1 hour", enabled: (s) => s.length === 1 && s[0].status === "ACTIVE", run: (s) => callAws(ZS, "UpdateZonalShift", { zonalShiftId: s[0].zonalShiftId, expiresIn: "1h" }), success: () => "Zonal shift updated to expire in 1 hour." },
  ],
  create: { label: "Start zonal shift", href: "/arc/zonal-shifts/create" },
}

const managedResources: ResourceDef = {
  tagResource: false,
  path: "/arc/managed-resources",
  title: "Managed resources",
  singular: "resource",
  description: "Resources that are registered with ARC for zonal shift and zonal autoshift.",
  model: ZS,
  operation: "ListManagedResources",
  items: (p) => (p.items as Item[]) ?? [],
  key: (i) => String(i.name ?? last(i.arn)),
  display: (i) => String(i.name),
  linkColumn: 0,
  columns: [col("name", "Name", (i) => i.name), col("type", "Resource type", (i) => String(i.arn ?? "").split(":")[2]), col("azs", "Availability Zones", (i) => (i.availabilityZones as string[] | undefined)?.join(", ")), stateCol("zonalAutoshiftStatus", "Zonal autoshift"), stateCol("practiceRunStatus", "Practice runs"), col("shifts", "Active zonal shifts", (i) => ((i.zonalShifts as Item[] | undefined) ?? []).length)],
  details: [
    textField("Name", (i) => i.name),
    copyField("ARN", (i) => i.arn),
    textField("Availability Zones", (i) => i.availabilityZones),
    textField("Applied weights", (i) => Object.entries(ob(i.appliedWeights)).map(([az, w]) => `${az}: ${w}`)),
    stateField("Zonal autoshift", "zonalAutoshiftStatus"),
    stateField("Practice runs", "practiceRunStatus"),
  ],
  tabs: [
    {
      id: "shifts",
      label: "Zonal shifts",
      render: (i) => (
        <SubTable
          title="Zonal shifts"
          model={ZS}
          operation="ListZonalShifts"
          input={{ resourceIdentifier: i.arn }}
          items={(p) => (p.items as Item[]) ?? []}
          trackBy={(z) => String(z.zonalShiftId)}
          columns={[
            { id: "id", header: "Zonal shift ID", cell: (z) => dash(z.zonalShiftId) },
            { id: "away", header: "Away from", cell: (z) => dash(z.awayFrom) },
            { id: "status", header: "Status", cell: (z) => <Status value={z.status} /> },
            { id: "comment", header: "Comment", cell: (z) => dash(z.comment) },
          ]}
          create={startShift(String(i.arn), (i.availabilityZones as string[] | undefined) ?? [])}
          actions={[{ label: "Cancel zonal shift", enabled: (z) => z.status === "ACTIVE", run: (z) => callAws(ZS, "CancelZonalShift", { zonalShiftId: z.zonalShiftId }) }]}
        />
      ),
    },
  ],
}

const expiry = [{ value: "30m", label: "30 minutes" }, { value: "1h", label: "1 hour" }, { value: "3h", label: "3 hours" }, { value: "12h", label: "12 hours" }, { value: "1d", label: "1 day" }, { value: "3d", label: "3 days" }]
function startShift(resource?: string, azs: string[] = []): FormSpec {
  return {
    title: "Start zonal shift",
    sections: [{ title: "Zonal shift", fields: [
      ...(resource ? [] : [{ id: "resource", label: "Resource", type: "select" as const, source: managedSource }]),
      { id: "away", label: "Availability Zone to shift away from", ...(azs.length ? { type: "select" as const, options: azs.map((a) => ({ value: a, label: a })) } : { placeholder: "use1-az1", description: "Availability Zone ID, such as use1-az1." }) },
      { id: "expires", label: "Zonal shift expiration", type: "select", default: "1h", options: expiry },
      { id: "comment", label: "Comment", placeholder: "Shifting away from an impaired AZ" },
    ] }],
    submit: async (v) => {
      const r = await callAws<Item>(ZS, "StartZonalShift", { resourceIdentifier: resource ?? v.resource, awayFrom: v.away, expiresIn: v.expires, comment: v.comment })
      return `Zonal shift ${r.zonalShiftId} started.`
    },
  }
}

/* ---------- Routing control ---------- */

const clusters: ResourceDef = {
  tagResource: false,
  path: "/arc/clusters",
  title: "Clusters",
  singular: "cluster",
  description: "A cluster is a set of five redundant Regional endpoints that you use to get and update routing control states.",
  model: RC,
  operation: "ListClusters",
  items: (p) => (p.Clusters as Item[]) ?? [],
  key: (i) => last(i.ClusterArn),
  display: (i) => String(i.Name),
  linkColumn: 0,
  columns: [col("name", "Name", (i) => i.Name), stateCol("Status"), col("arn", "ARN", (i) => i.ClusterArn), col("type", "Network type", (i) => i.NetworkType)],
  details: [textField("Name", (i) => i.Name), copyField("ARN", (i) => i.ClusterArn), stateField("Status", "Status"), textField("Network type", (i) => i.NetworkType), textField("Owner", (i) => i.Owner)],
  tabs: [
    {
      id: "endpoints",
      label: "Cluster endpoints",
      render: (i) => (
        <SubTable title="Cluster endpoints" model={RC} operation="DescribeCluster" input={{ ClusterArn: i.ClusterArn }} items={(p) => (ob(p.Cluster).ClusterEndpoints as Item[]) ?? []} trackBy={(e) => String(e.Region)} columns={[{ id: "region", header: "Region", cell: (e) => dash(e.Region) }, { id: "endpoint", header: "Endpoint", cell: (e) => dash(e.Endpoint) }]} />
      ),
    },
  ],
  create: { label: "Create cluster", href: "/arc/clusters/create" },
  deleteAction: { operation: "DeleteCluster", input: (i) => ({ ClusterArn: i.ClusterArn }), warning: "Delete the cluster's control panels first." },
}

const controlPanels: ResourceDef = {
  tagResource: false,
  path: "/arc/control-panels",
  title: "Control panels",
  singular: "control panel",
  description: "Control panels group routing controls and safety rules for an application.",
  model: RC,
  operation: "ListControlPanels",
  items: (p) => (p.ControlPanels as Item[]) ?? [],
  key: (i) => last(i.ControlPanelArn),
  display: (i) => String(i.Name),
  linkColumn: 0,
  columns: [col("name", "Name", (i) => i.Name), stateCol("Status"), col("default", "Default", (i) => (i.DefaultControlPanel ? "Yes" : "No")), col("count", "Routing controls", (i) => i.RoutingControlCount), col("cluster", "Cluster", (i) => last(i.ClusterArn))],
  details: [textField("Name", (i) => i.Name), copyField("ARN", (i) => i.ControlPanelArn), stateField("Status", "Status"), textField("Default control panel", (i) => (i.DefaultControlPanel ? "Yes" : "No")), copyField("Cluster", (i) => i.ClusterArn), textField("Routing controls", (i) => i.RoutingControlCount)],
  tabs: [
    {
      id: "routing-controls",
      label: "Routing controls",
      render: (i) => (
        <SubTable
          title="Routing controls"
          description="Routing controls are simple on/off switches that redirect traffic between cells."
          model={RC}
          operation="ListRoutingControls"
          input={{ ControlPanelArn: i.ControlPanelArn }}
          items={(p) => (p.RoutingControls as Item[]) ?? []}
          trackBy={(r) => String(r.RoutingControlArn)}
          columns={[
            { id: "name", header: "Name", cell: (r) => dash(r.Name) },
            { id: "status", header: "Status", cell: (r) => <Status value={r.Status} /> },
            { id: "arn", header: "ARN", cell: (r) => dash(r.RoutingControlArn) },
          ]}
          create={{ title: "Create routing control", sections: [{ title: "Routing control", fields: [{ id: "name", label: "Routing control name" }] }], submit: async (v) => { await callAws(RC, "CreateRoutingControl", { ClusterArn: i.ClusterArn, ControlPanelArn: i.ControlPanelArn, RoutingControlName: v.name }); return `Routing control ${v.name} created.` } }}
          remove={{ run: (r) => callAws(RC, "DeleteRoutingControl", { RoutingControlArn: r.RoutingControlArn }) }}
        />
      ),
    },
    {
      id: "safety-rules",
      label: "Safety rules",
      render: (i) => (
        <SubTable
          title="Safety rules"
          description="Safety rules prevent routing control state changes that would cause an outage."
          model={RC}
          operation="ListSafetyRules"
          input={{ ControlPanelArn: i.ControlPanelArn }}
          items={(p) => ((p.SafetyRules as Item[]) ?? []).map((r) => ({ ...(ob(r.ASSERTION) ?? {}), ...(ob(r.GATING) ?? {}), _type: r.ASSERTION ? "Assertion" : "Gating" }))}
          trackBy={(r) => String(r.SafetyRuleArn)}
          columns={[
            { id: "name", header: "Name", cell: (r) => dash(r.Name) },
            { id: "type", header: "Type", cell: (r) => dash(r._type) },
            { id: "status", header: "Status", cell: (r) => <Status value={r.Status} /> },
            { id: "rule", header: "Rule", cell: (r) => `${ob(r.RuleConfig).Type ?? ""} ${ob(r.RuleConfig).Threshold ?? ""}${ob(r.RuleConfig).Inverted ? " (inverted)" : ""}` },
          ]}
          create={{
            title: "Add safety rule",
            sections: [{ title: "Assertion rule", fields: [
              { id: "name", label: "Rule name" },
              { id: "controls", label: "Asserted routing controls", type: "multiselect", source: { model: RC, operation: "ListRoutingControls", input: { ControlPanelArn: i.ControlPanelArn }, items: (p) => (p.RoutingControls as Item[]) ?? [], value: (r) => String(r.RoutingControlArn), label: (r) => String(r.Name) } },
              { id: "type", label: "Rule type", type: "select", default: "ATLEAST", options: [{ value: "ATLEAST", label: "At least" }, { value: "AND", label: "And" }, { value: "OR", label: "Or" }] },
              { id: "threshold", label: "Threshold", type: "number", default: "1" },
              { id: "wait", label: "Wait period (ms)", type: "number", default: "5000" },
            ] }],
            submit: async (v) => {
              await callAws(RC, "CreateSafetyRule", { AssertionRule: { Name: v.name, ControlPanelArn: i.ControlPanelArn, AssertedControls: v.controls, RuleConfig: { Type: v.type, Threshold: Number(v.threshold), Inverted: false }, WaitPeriodMs: Number(v.wait) } })
              return `Safety rule ${v.name} created.`
            },
          }}
          remove={{ run: (r) => callAws(RC, "DeleteSafetyRule", { SafetyRuleArn: r.SafetyRuleArn }) }}
        />
      ),
    },
  ],
  create: { label: "Create control panel", href: "/arc/control-panels/create" },
  deleteAction: { operation: "DeleteControlPanel", input: (i) => ({ ControlPanelArn: i.ControlPanelArn }), warning: "Delete the control panel's routing controls and safety rules first. You can't delete the default control panel." },
}

/* ---------- Readiness check ---------- */

const cellSource = { model: RR, operation: "ListCells", items: (p: Item) => (p.Cells as Item[]) ?? [], value: (i: Item) => String(i.CellArn), label: (i: Item) => String(i.CellName) }

const recoveryGroups: ResourceDef = {
  tagResource: false,
  path: "/arc/recovery-groups",
  title: "Recovery groups",
  singular: "recovery group",
  description: "A recovery group represents your application and contains cells, such as Availability Zones or Regions.",
  model: RR,
  operation: "ListRecoveryGroups",
  items: (p) => (p.RecoveryGroups as Item[]) ?? [],
  key: (i) => String(i.RecoveryGroupName),
  display: (i) => String(i.RecoveryGroupName),
  linkColumn: 0,
  columns: [col("name", "Name", (i) => i.RecoveryGroupName), col("cells", "Cells", (i) => ((i.Cells as string[] | undefined) ?? []).map(last).join(", ")), col("arn", "ARN", (i) => i.RecoveryGroupArn)],
  details: [textField("Name", (i) => i.RecoveryGroupName), copyField("ARN", (i) => i.RecoveryGroupArn), textField("Cells", (i) => ((i.Cells as string[] | undefined) ?? []).map(last))],
  tabs: [
    {
      id: "readiness",
      label: "Readiness",
      render: (i) => (
        <SubTable title="Cell readiness" model={RR} operation="GetRecoveryGroupReadinessSummary" input={{ RecoveryGroupName: i.RecoveryGroupName }} items={(p) => (p.ReadinessChecks as Item[]) ?? []} trackBy={(r) => String(r.ReadinessCheckName)} columns={[{ id: "name", header: "Readiness check", cell: (r) => dash(r.ReadinessCheckName) }, { id: "readiness", header: "Readiness", cell: (r) => <Status value={r.Readiness} /> }]} />
      ),
    },
  ],
  create: { label: "Create recovery group", href: "/arc/recovery-groups/create" },
  deleteAction: { operation: "DeleteRecoveryGroup", input: (i) => ({ RecoveryGroupName: i.RecoveryGroupName }) },
}

const cells: ResourceDef = {
  tagResource: false,
  path: "/arc/cells",
  title: "Cells",
  singular: "cell",
  description: "A cell defines your application's replicas or independent units of failover.",
  model: RR,
  operation: "ListCells",
  items: (p) => (p.Cells as Item[]) ?? [],
  key: (i) => String(i.CellName),
  display: (i) => String(i.CellName),
  linkColumn: 0,
  columns: [col("name", "Name", (i) => i.CellName), col("nested", "Nested cells", (i) => ((i.Cells as string[] | undefined) ?? []).map(last).join(", ")), col("scopes", "Readiness scopes", (i) => ((i.ParentReadinessScopes as string[] | undefined) ?? []).map(last).join(", ")), col("arn", "ARN", (i) => i.CellArn)],
  details: [textField("Name", (i) => i.CellName), copyField("ARN", (i) => i.CellArn), textField("Nested cells", (i) => ((i.Cells as string[] | undefined) ?? []).map(last)), textField("Parent readiness scopes", (i) => ((i.ParentReadinessScopes as string[] | undefined) ?? []).map(last))],
  create: { label: "Create cell", href: "/arc/cells/create" },
  deleteAction: { operation: "DeleteCell", input: (i) => ({ CellName: i.CellName }) },
}

const resourceSets: ResourceDef = {
  tagResource: false,
  path: "/arc/resource-sets",
  title: "Resource sets",
  singular: "resource set",
  description: "A resource set is a set of resources of the same type, such as load balancers, that span cells.",
  model: RR,
  operation: "ListResourceSets",
  items: (p) => (p.ResourceSets as Item[]) ?? [],
  key: (i) => String(i.ResourceSetName),
  display: (i) => String(i.ResourceSetName),
  linkColumn: 0,
  columns: [col("name", "Name", (i) => i.ResourceSetName), col("type", "Resource type", (i) => i.ResourceSetType), col("count", "Resources", (i) => ((i.Resources as Item[] | undefined) ?? []).length)],
  details: [textField("Name", (i) => i.ResourceSetName), copyField("ARN", (i) => i.ResourceSetArn), textField("Resource type", (i) => i.ResourceSetType), textField("Resources", (i) => ((i.Resources as Item[] | undefined) ?? []).map((r) => sv(r.ResourceArn) ?? sv(r.ComponentId) ?? ""))],
  create: { label: "Create resource set", href: "/arc/resource-sets/create" },
  deleteAction: { operation: "DeleteResourceSet", input: (i) => ({ ResourceSetName: i.ResourceSetName }) },
}

const readinessChecks: ResourceDef = {
  tagResource: false,
  path: "/arc/readiness-checks",
  title: "Readiness checks",
  singular: "readiness check",
  description: "Readiness checks audit the resources in a resource set to verify that they're ready for failover.",
  model: RR,
  operation: "ListReadinessChecks",
  items: (p) => (p.ReadinessChecks as Item[]) ?? [],
  key: (i) => String(i.ReadinessCheckName),
  display: (i) => String(i.ReadinessCheckName),
  linkColumn: 0,
  columns: [col("name", "Name", (i) => i.ReadinessCheckName), col("set", "Resource set", (i) => i.ResourceSet), col("arn", "ARN", (i) => i.ReadinessCheckArn)],
  details: [textField("Name", (i) => i.ReadinessCheckName), copyField("ARN", (i) => i.ReadinessCheckArn), textField("Resource set", (i) => i.ResourceSet)],
  tabs: [
    {
      id: "status",
      label: "Readiness status",
      render: (i) => (
        <SubTable title="Resource readiness" model={RR} operation="GetReadinessCheckStatus" input={{ ReadinessCheckName: i.ReadinessCheckName }} items={(p) => (p.Resources as Item[]) ?? []} trackBy={(r) => String(r.ResourceArn)} columns={[{ id: "arn", header: "Resource", cell: (r) => dash(r.ResourceArn) }, { id: "readiness", header: "Readiness", cell: (r) => <Status value={r.Readiness} /> }, { id: "checked", header: "Last checked", cell: (r) => dash(r.LastCheckedTimestamp) }]} />
      ),
    },
  ],
  create: { label: "Create readiness check", href: "/arc/readiness-checks/create" },
  deleteAction: { operation: "DeleteReadinessCheck", input: (i) => ({ ReadinessCheckName: i.ReadinessCheckName }) },
}

const nameRule = (v: unknown) => /^[a-zA-Z0-9_]+$/.test(String(v ?? ""))
const resourceTypes = ["AWS::ElasticLoadBalancingV2::LoadBalancer", "AWS::AutoScaling::AutoScalingGroup", "AWS::DynamoDB::Table", "AWS::Lambda::Function", "AWS::SQS::Queue", "AWS::EC2::VPC", "AWS::Route53::HealthCheck"].map((t) => ({ value: t, label: t }))

const creates: Record<string, FormSpec> = {
  "zonal-shifts": startShift(),
  clusters: {
    title: "Create cluster",
    sections: [{ title: "Cluster", fields: [{ id: "name", label: "Cluster name" }, { id: "network", label: "Network type", type: "select", default: "IPV4", options: [{ value: "IPV4", label: "IPv4" }, { value: "DUALSTACK", label: "Dual-stack" }] }, { id: "tags", label: "Tags", type: "tags" }] }],
    submit: async (v) => { await callAws(RC, "CreateCluster", { ClusterName: v.name, NetworkType: v.network, Tags: tagsOf(v) }); return `Cluster ${v.name} is being created.` },
  },
  "control-panels": {
    title: "Create control panel",
    sections: [{ title: "Control panel", fields: [{ id: "name", label: "Control panel name" }, { id: "cluster", label: "Cluster", type: "select", source: clusterSource }, { id: "tags", label: "Tags", type: "tags" }] }],
    submit: async (v) => { await callAws(RC, "CreateControlPanel", { ControlPanelName: v.name, ClusterArn: v.cluster, Tags: tagsOf(v) }); return `Control panel ${v.name} is being created.` },
  },
  "recovery-groups": {
    title: "Create recovery group",
    sections: [{ title: "Recovery group", fields: [{ id: "name", label: "Recovery group name", constraint: "Letters, numbers, and underscores only." }, { id: "cells", label: "Cells", type: "multiselect", optional: true, source: cellSource }, { id: "tags", label: "Tags", type: "tags" }] }],
    valid: (v) => nameRule(v.name),
    submit: async (v) => { await callAws(RR, "CreateRecoveryGroup", { RecoveryGroupName: v.name, Cells: v.cells, Tags: tagsOf(v) }); return `Recovery group ${v.name} created.` },
  },
  cells: {
    title: "Create cell",
    sections: [{ title: "Cell", fields: [{ id: "name", label: "Cell name", constraint: "Letters, numbers, and underscores only." }, { id: "cells", label: "Nested cells", type: "multiselect", optional: true, source: cellSource }, { id: "tags", label: "Tags", type: "tags" }] }],
    valid: (v) => nameRule(v.name),
    submit: async (v) => { await callAws(RR, "CreateCell", { CellName: v.name, Cells: v.cells, Tags: tagsOf(v) }); return `Cell ${v.name} created.` },
  },
  "resource-sets": {
    title: "Create resource set",
    sections: [{ title: "Resource set", fields: [
      { id: "name", label: "Resource set name", constraint: "Letters, numbers, and underscores only." },
      { id: "type", label: "Resource type", type: "select", default: "AWS::ElasticLoadBalancingV2::LoadBalancer", options: resourceTypes },
      { id: "arns", label: "Resource ARNs", type: "textarea", description: "One resource ARN per line." },
      { id: "cell", label: "Readiness scope (cell)", type: "select", optional: true, source: cellSource },
    ] }],
    valid: (v) => nameRule(v.name),
    submit: async (v) => {
      const Resources = String(v.arns).split("\n").map((a) => a.trim()).filter(Boolean).map((ResourceArn) => ({ ResourceArn, ...(sv(v.cell) ? { ReadinessScopes: [v.cell] } : {}) }))
      await callAws(RR, "CreateResourceSet", { ResourceSetName: v.name, ResourceSetType: v.type, Resources })
      return `Resource set ${v.name} created.`
    },
  },
  "readiness-checks": {
    title: "Create readiness check",
    sections: [{ title: "Readiness check", fields: [
      { id: "name", label: "Readiness check name", constraint: "Letters, numbers, and underscores only." },
      { id: "set", label: "Resource set", type: "select", source: { model: RR, operation: "ListResourceSets", items: (p) => (p.ResourceSets as Item[]) ?? [], value: (i) => String(i.ResourceSetName), label: (i) => String(i.ResourceSetName), description: (i) => String(i.ResourceSetType) } },
    ] }],
    valid: (v) => nameRule(v.name),
    submit: async (v) => { await callAws(RR, "CreateReadinessCheck", { ReadinessCheckName: v.name, ResourceSetName: v.set }); return `Readiness check ${v.name} created.` },
  },
}

export const arcApp: ServiceApp = {
  id: "arc",
  name: "Application Recovery Controller",
  home: "/arc",
  nav: [
    { type: "link", text: "Getting started", href: "/arc" },
    { type: "section", text: "Region switch", items: [{ type: "link", text: "Region switch plans", href: "/arc/plans" }] },
    { type: "section", text: "Zonal shift", items: [{ type: "link", text: "Zonal shifts", href: "/arc/zonal-shifts" }, { type: "link", text: "Managed resources", href: "/arc/managed-resources" }] },
    { type: "section", text: "Routing control", items: [{ type: "link", text: "Clusters", href: "/arc/clusters" }, { type: "link", text: "Control panels", href: "/arc/control-panels" }] },
    { type: "section", text: "Readiness check", items: [{ type: "link", text: "Recovery groups", href: "/arc/recovery-groups" }, { type: "link", text: "Cells", href: "/arc/cells" }, { type: "link", text: "Resource sets", href: "/arc/resource-sets" }, { type: "link", text: "Readiness checks", href: "/arc/readiness-checks" }] },
  ],
  defs: { plans, "zonal-shifts": zonalShifts, "managed-resources": managedResources, clusters, "control-panels": controlPanels, "recovery-groups": recoveryGroups, cells, "resource-sets": resourceSets, "readiness-checks": readinessChecks },
  creates,
  dashboard: () => <CountDashboard app={arcApp} title="Application Recovery Controller (ARC)" description="Prepare for and accomplish faster recovery for applications running on AWS." sections={["plans", "managed-resources", "zonal-shifts", "clusters", "control-panels", "recovery-groups", "cells", "readiness-checks"]} />,
}

export function ArcApp({ path }: { path: string[] }) {
  return <ServiceRouter app={arcApp} path={path} />
}
