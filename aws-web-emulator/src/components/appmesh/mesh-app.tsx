"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import Header from "@cloudscape-design/components/header"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import { useQuery } from "@tanstack/react-query"
import { errorMessage, flash } from "@/components/console/flash"
import { col, copyField, dateCol, dateField, ob, ServiceRouter, Status, SubTable, sv, textField, type FormSpec, type ServiceApp } from "@/components/console/service-app"
import { dash, type Item, type ResourceDef } from "@/components/ec2-family/engine"
import { callAws } from "@/lib/aws"

const M = "appmesh"
const base = { tagResource: false, model: M, linkColumn: 0 } as const

const nodeForm = (mesh: string): FormSpec => ({
  title: "Create virtual node",
  sections: [{ title: "Virtual node configuration", fields: [
    { id: "name", label: "Virtual node name" },
    { id: "discovery", label: "Service discovery method", type: "select", default: "DNS", options: [{ value: "DNS", label: "DNS" }, { value: "CLOUD_MAP", label: "AWS Cloud Map" }, { value: "NONE", label: "None" }] },
    { id: "hostname", label: "DNS hostname", placeholder: "serviceb.simpleapp.local", show: (v) => v.discovery === "DNS" },
    { id: "namespace", label: "Cloud Map namespace", type: "select", show: (v) => v.discovery === "CLOUD_MAP", source: { model: "servicediscovery", operation: "ListNamespaces", items: (p) => (p.Namespaces as Item[]) ?? [], value: (i) => String(i.Name), label: (i) => String(i.Name) } },
    { id: "service", label: "Cloud Map service name", show: (v) => v.discovery === "CLOUD_MAP" },
    { id: "protocol", label: "Listener protocol", type: "select", default: "http", options: ["http", "http2", "grpc", "tcp"].map((p) => ({ value: p, label: p })) },
    { id: "port", label: "Listener port", type: "number", default: "8080" },
    { id: "backends", label: "Backends", optional: true, placeholder: "servicea.simpleapp.local", description: "Virtual service names this node sends outbound traffic to, separated by commas." },
  ] }],
  submit: async (v) => {
    const serviceDiscovery = v.discovery === "DNS" ? { dns: { hostname: v.hostname } } : v.discovery === "CLOUD_MAP" ? { awsCloudMap: { namespaceName: v.namespace, serviceName: v.service } } : undefined
    const backends = String(v.backends ?? "").split(/[\s,]+/).filter(Boolean).map((virtualServiceName) => ({ virtualService: { virtualServiceName } }))
    await callAws(M, "CreateVirtualNode", { meshName: mesh, virtualNodeName: v.name, spec: { listeners: [{ portMapping: { port: Number(v.port), protocol: v.protocol } }], ...(serviceDiscovery ? { serviceDiscovery } : {}), ...(backends.length ? { backends } : {}) } })
    return `Virtual node ${v.name} created.`
  },
})

const stub = (title: string, op: string, key: string, mesh: string, nameKey: string) => (
  <SubTable title={title} model={M} operation={op} input={{ meshName: mesh }} items={(p) => (p[key] as Item[]) ?? []} trackBy={(i) => String(i[nameKey])} columns={[{ id: "name", header: "Name", cell: (i) => dash(i[nameKey]) }]} />
)

const meshes: ResourceDef = {
  ...base,
  path: "/appmesh/meshes",
  title: "Meshes",
  singular: "mesh",
  description: "A service mesh is a logical boundary for network traffic between the services that reside within it.",
  operation: "ListMeshes",
  items: (p) => (p.meshes as Item[]) ?? [],
  key: (i) => String(i.meshName),
  display: (i) => String(i.meshName),
  columns: [col("name", "Mesh name", (i) => i.meshName), col("arn", "ARN", (i) => i.arn), col("owner", "Mesh owner", (i) => i.meshOwner), col("version", "Version", (i) => i.version), dateCol("created", "Created", "createdAt"), dateCol("updated", "Last updated", "lastUpdatedAt")],
  details: [
    textField("Mesh name", (i) => i.meshName),
    copyField("ARN", (i) => i.arn),
    textField("Mesh owner", (i) => i.meshOwner),
    textField("Resource owner", (i) => i.resourceOwner),
    textField("Version", (i) => i.version),
    dateField("Created", "createdAt"),
    dateField("Last updated", "lastUpdatedAt"),
  ],
  tabs: [
    {
      id: "nodes",
      label: "Virtual nodes",
      render: (i) => (
        <SubTable
          title="Virtual nodes"
          description="A virtual node acts as a logical pointer to a particular task group, such as an Amazon ECS service or a Kubernetes deployment."
          model={M}
          operation="ListVirtualNodes"
          input={{ meshName: i.meshName }}
          items={(p) => (p.virtualNodes as Item[]) ?? []}
          trackBy={(n) => String(n.virtualNodeName)}
          columns={[
            { id: "name", header: "Virtual node name", cell: (n) => dash(n.virtualNodeName) },
            { id: "arn", header: "ARN", cell: (n) => dash(n.arn) },
            { id: "version", header: "Version", cell: (n) => dash(n.version) },
            { id: "updated", header: "Last updated", cell: (n) => dash(n.lastUpdatedAt) },
          ]}
          create={nodeForm(String(i.meshName))}
          remove={{ run: (n) => callAws(M, "DeleteVirtualNode", { meshName: i.meshName, virtualNodeName: n.virtualNodeName }) }}
        />
      ),
    },
    { id: "services", label: "Virtual services", render: (i) => stub("Virtual services", "ListVirtualServices", "virtualServices", String(i.meshName), "virtualServiceName") },
    { id: "routers", label: "Virtual routers", render: (i) => stub("Virtual routers", "ListVirtualRouters", "virtualRouters", String(i.meshName), "virtualRouterName") },
    { id: "gateways", label: "Virtual gateways", render: (i) => stub("Virtual gateways", "ListVirtualGateways", "virtualGateways", String(i.meshName), "virtualGatewayName") },
    { id: "egress", label: "Egress filter", render: (i) => <MeshSpec mesh={String(i.meshName)} /> },
  ],
  create: { label: "Create mesh", href: "/appmesh/meshes/create" },
  deleteAction: { operation: "DeleteMesh", input: (i) => ({ meshName: i.meshName }), warning: "Delete all virtual nodes, services, routers, and gateways in the mesh first." },
}


function MeshSpec({ mesh }: { mesh: string }) {
  const q = useQuery({ queryKey: ["emulator", "aws", M, "DescribeMesh", mesh], queryFn: () => callAws<Item>(M, "DescribeMesh", { meshName: mesh }) })
  const m = ob(q.data?.mesh)
  const egress = sv(ob(ob(m.spec).egressFilter).type) ?? "DROP_ALL"
  const toggle = async () => {
    try {
      await callAws(M, "UpdateMesh", { meshName: mesh, spec: { ...ob(m.spec), egressFilter: { type: egress === "ALLOW_ALL" ? "DROP_ALL" : "ALLOW_ALL" } } })
      flash.success("Egress filter updated.")
      await q.refetch()
    } catch (e) {
      flash.error(errorMessage(e))
    }
  }
  return (
    <Container header={<Header variant="h2" description="Choose whether services in the mesh can send traffic to destinations outside the mesh." actions={<Button onClick={() => void toggle()}>{egress === "ALLOW_ALL" ? "Deny external traffic" : "Allow external traffic"}</Button>}>Egress filter</Header>}>
      {q.isPending ? <Box>Loading</Box> : <KeyValuePairs columns={2} items={[{ label: "Egress filter", value: egress === "ALLOW_ALL" ? "Allow external traffic" : "Deny external traffic (DROP_ALL)" }, { label: "Status", value: <Status value={ob(m.status).status} /> }]} />}
    </Container>
  )
}

const createMesh: FormSpec = {
  title: "Create mesh",
  sections: [{ title: "Mesh configuration", fields: [
    { id: "name", label: "Mesh name", constraint: "1-255 characters." },
    { id: "egress", label: "Egress filter", type: "select", default: "DROP_ALL", options: [{ value: "DROP_ALL", label: "Deny external traffic" }, { value: "ALLOW_ALL", label: "Allow external traffic" }] },
    { id: "ip", label: "IP version preference", type: "select", default: "", optional: true, options: [{ value: "", label: "Default" }, { value: "IPv4_ONLY", label: "IPv4 only" }, { value: "IPv6_ONLY", label: "IPv6 only" }, { value: "IPv4_PREFERRED", label: "IPv4 preferred" }, { value: "IPv6_PREFERRED", label: "IPv6 preferred" }] },
  ] }],
  submit: async (v) => {
    await callAws(M, "CreateMesh", { meshName: v.name, spec: { egressFilter: { type: v.egress }, ...(sv(v.ip) ? { serviceDiscovery: { ipPreference: v.ip } } : {}) } })
    return `Mesh ${v.name} created.`
  },
  after: (v) => `/appmesh/meshes/${encodeURIComponent(String(v.name))}`,
}

export const meshApp: ServiceApp = {
  id: "appmesh",
  name: "AWS App Mesh",
  home: "/appmesh/meshes",
  nav: [{ type: "link", text: "Meshes", href: "/appmesh/meshes" }],
  defs: { meshes },
  creates: { meshes: createMesh },
}

export function AppMeshApp({ path }: { path: string[] }) {
  return <ServiceRouter app={meshApp} path={path.length ? path : ["meshes"]} />
}
