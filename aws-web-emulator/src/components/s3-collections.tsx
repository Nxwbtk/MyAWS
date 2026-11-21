"use client"

import { useInfiniteQuery } from "@tanstack/react-query"
import { useState } from "react"
import { S3BatchJob } from "@/components/s3-batch-job"
import { S3CreateStorage } from "@/components/s3-create-storage"
import { S3Status, S3Toolbar } from "@/components/s3-buckets"
import { S3OperationForm } from "@/components/s3-operation-form"
import { S3Operations, S3Settings, type S3Setting } from "@/components/s3-operations"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { s3Operations, s3OperationLabel, type S3Model } from "@/lib/s3-catalog"
import { s3Read } from "@/lib/s3-client"

type Resource = Record<string, unknown>
type Scope = { area: string; model: S3Model; filter?: RegExp; context?: Resource }
type Collection = {
  title: string
  read: string
  resultKey: string
  name: string
  columns: [title: string, property: string][]
  create?: string
  actions?: string[]
  context?: (item: Resource) => Resource
  children?: Collection[]
  settings?: Record<string, S3Setting[]>
}

const tables: Collection = {
  title: "Tables",
  read: "ListTables",
  resultKey: "tables",
  name: "name",
  columns: [
    ["ARN", "tableARN"],
    ["Format", "format"],
    ["Last modified", "modifiedAt"],
  ],
  create: "CreateTable",
  actions: ["GetTable", "RenameTable", "DeleteTable"],
  context: (item) => ({
    name: item.name,
    tableArn: item.tableARN,
    resourceArn: item.tableARN,
  }),
  settings: {
    Properties: [
      {
        title: "Metadata location",
        read: "GetTableMetadataLocation",
        actions: ["UpdateTableMetadataLocation"],
      },
      { title: "Encryption", read: "GetTableEncryption", actions: [] },
      { title: "Storage class", read: "GetTableStorageClass", actions: [] },
    ],
    Management: [
      {
        title: "Table maintenance",
        read: "GetTableMaintenanceConfiguration",
        actions: ["PutTableMaintenanceConfiguration"],
      },
      {
        title: "Maintenance job status",
        read: "GetTableMaintenanceJobStatus",
        actions: [],
      },
      {
        title: "Table replication",
        read: "GetTableReplication",
        actions: ["PutTableReplication", "DeleteTableReplication"],
      },
      { title: "Replication status", read: "GetTableReplicationStatus", actions: [] },
    ],
  },
}

const indexes: Collection = {
  title: "Indexes",
  read: "ListIndexes",
  resultKey: "indexes",
  name: "indexName",
  columns: [
    ["ARN", "indexArn"],
    ["Created", "creationTime"],
  ],
  create: "CreateIndex",
  actions: [
    "GetIndex",
    "UpdateIndexMode",
    "DeleteIndex",
    "PutVectors",
    "GetVectors",
    "QueryVectors",
    "DeleteVectors",
  ],
  context: (item) => ({
    indexName: item.indexName,
    resourceArn: item.indexArn,
  }),
  children: [
    {
      title: "Vectors",
      read: "ListVectors",
      resultKey: "vectors",
      name: "key",
      columns: [["Metadata", "metadata"]],
    },
  ],
}

const tableBuckets: Collection = {
  title: "Table buckets",
  read: "ListTableBuckets",
  resultKey: "tableBuckets",
  name: "name",
  columns: [
    ["ARN", "arn"],
    ["Created", "createdAt"],
  ],
  create: "CreateTableBucket",
  actions: ["GetTableBucket", "DeleteTableBucket"],
  context: (item) => ({ tableBucketARN: item.arn, resourceArn: item.arn }),
  settings: {
    Properties: [
      {
        title: "Default encryption",
        read: "GetTableBucketEncryption",
        actions: ["PutTableBucketEncryption", "DeleteTableBucketEncryption"],
      },
      {
        title: "Default storage class",
        read: "GetTableBucketStorageClass",
        actions: ["PutTableBucketStorageClass"],
      },
    ],
    Permissions: [
      {
        title: "Table bucket policy",
        read: "GetTableBucketPolicy",
        actions: ["PutTableBucketPolicy", "DeleteTableBucketPolicy"],
      },
    ],
    Metrics: [
      {
        title: "Request metrics",
        read: "GetTableBucketMetricsConfiguration",
        actions: [
          "PutTableBucketMetricsConfiguration",
          "DeleteTableBucketMetricsConfiguration",
        ],
      },
    ],
    Management: [
      {
        title: "Table bucket maintenance",
        read: "GetTableBucketMaintenanceConfiguration",
        actions: ["PutTableBucketMaintenanceConfiguration"],
      },
      {
        title: "Table bucket replication configuration",
        read: "GetTableBucketReplication",
        actions: ["PutTableBucketReplication", "DeleteTableBucketReplication"],
      },
    ],
  },
  children: [
    {
      title: "Namespaces",
      read: "ListNamespaces",
      resultKey: "namespaces",
      name: "namespace",
      columns: [
        ["Created", "createdAt"],
        ["Owner", "ownerAccountId"],
      ],
      create: "CreateNamespace",
      actions: ["GetNamespace", "DeleteNamespace"],
      context: (item) => ({
        namespace: Array.isArray(item.namespace)
          ? item.namespace.join(".")
          : item.namespace,
      }),
      children: [tables],
    },
  ],
}

const vectorBuckets: Collection = {
  title: "Vector buckets",
  read: "ListVectorBuckets",
  resultKey: "vectorBuckets",
  name: "vectorBucketName",
  columns: [
    ["ARN", "vectorBucketArn"],
    ["Created", "creationTime"],
  ],
  create: "CreateVectorBucket",
  actions: [
    "GetVectorBucket",
    "DeleteVectorBucket",
    "GetVectorBucketPolicy",
    "PutVectorBucketPolicy",
    "DeleteVectorBucketPolicy",
    "TagResource",
    "UntagResource",
  ],
  context: (item) => ({
    vectorBucketName: item.vectorBucketName,
    resourceArn: item.vectorBucketArn,
  }),
  children: [indexes],
}

const fileSystems: Collection = {
  title: "File systems",
  read: "ListFileSystems",
  resultKey: "fileSystems",
  name: "fileSystemId",
  columns: [
    ["Name", "name"],
    ["General purpose bucket", "bucket"],
    ["Status", "status"],
    ["Creation date", "creationTime"],
  ],
  create: "CreateFileSystem",
  actions: [
    "GetFileSystem",
    "DeleteFileSystem",
    "GetSynchronizationConfiguration",
    "PutSynchronizationConfiguration",
    "GetFileSystemPolicy",
    "PutFileSystemPolicy",
    "DeleteFileSystemPolicy",
    "ListTagsForResource",
    "TagResource",
    "UntagResource",
  ],
  context: (item) => ({
    fileSystemId: item.fileSystemId,
    resourceId: item.fileSystemId,
  }),
  children: [
    {
      title: "Mount targets",
      read: "ListMountTargets",
      resultKey: "mountTargets",
      name: "mountTargetId",
      columns: [
        ["Subnet", "subnetId"],
        ["Status", "status"],
      ],
      create: "CreateMountTarget",
      actions: ["GetMountTarget", "UpdateMountTarget", "DeleteMountTarget"],
      context: (item) => ({ mountTargetId: item.mountTargetId }),
    },
    {
      title: "File system access points",
      read: "ListAccessPoints",
      resultKey: "accessPoints",
      name: "accessPointId",
      columns: [["Status", "status"]],
      create: "CreateAccessPoint",
      actions: ["GetAccessPoint", "DeleteAccessPoint"],
      context: (item) => ({ accessPointId: item.accessPointId }),
    },
  ],
}

const accessPoints: Collection = {
  title: "Access Points",
  read: "ListAccessPoints",
  resultKey: "AccessPointList",
  name: "Name",
  columns: [
    ["Bucket", "Bucket"],
    ["Network origin", "NetworkOrigin"],
    ["Alias", "Alias"],
  ],
  create: "CreateAccessPoint",
  actions: [
    "GetAccessPoint",
    "GetAccessPointPolicy",
    "PutAccessPointPolicy",
    "DeleteAccessPointPolicy",
    "DeleteAccessPoint",
  ],
  context: (item) => ({ Name: item.Name, ResourceArn: item.AccessPointArn }),
}

const multiRegionAccess: Collection = {
  title: "Multi-Region access points",
  read: "ListMultiRegionAccessPoints",
  resultKey: "AccessPoints",
  name: "Name",
  columns: [
    ["Alias", "Alias"],
    ["Status", "Status"],
  ],
  create: "CreateMultiRegionAccessPoint",
  actions: [
    "GetMultiRegionAccessPoint",
    "GetMultiRegionAccessPointPolicy",
    "PutMultiRegionAccessPointPolicy",
    "GetMultiRegionAccessPointRoutes",
    "SubmitMultiRegionAccessPointRoutes",
    "DeleteMultiRegionAccessPoint",
  ],
  context: (item) => ({ Name: item.Name, Mrap: item.Alias }),
}

const directoryAccess: Collection = {
  ...accessPoints,
  title: "Access Points for directory buckets",
  read: "ListAccessPointsForDirectoryBuckets",
  actions: [
    ...(accessPoints.actions ?? []),
    "GetAccessPointScope",
    "PutAccessPointScope",
    "DeleteAccessPointScope",
  ],
}

const lambdaAccess: Collection = {
  title: "Object Lambda access points",
  read: "ListAccessPointsForObjectLambda",
  resultKey: "ObjectLambdaAccessPointList",
  name: "Name",
  columns: [["ARN", "ObjectLambdaAccessPointArn"]],
  create: "CreateAccessPointForObjectLambda",
  actions: [
    "GetAccessPointForObjectLambda",
    "GetAccessPointConfigurationForObjectLambda",
    "PutAccessPointConfigurationForObjectLambda",
    "DeleteAccessPointForObjectLambda",
  ],
  context: (item) => ({ Name: item.Name }),
}

const jobs: Collection = {
  title: "Batch Operations jobs",
  read: "ListJobs",
  resultKey: "Jobs",
  name: "JobId",
  columns: [
    ["Status", "Status"],
    ["Priority", "Priority"],
    ["Created", "CreationTime"],
  ],
  create: "CreateJob",
  actions: [
    "DescribeJob",
    "UpdateJobPriority",
    "UpdateJobStatus",
    "GetJobTagging",
    "PutJobTagging",
    "DeleteJobTagging",
  ],
  context: (item) => ({ JobId: item.JobId }),
}

const lensDashboards: Collection = {
  title: "Storage Lens dashboards",
  read: "ListStorageLensConfigurations",
  resultKey: "StorageLensConfigurationList",
  name: "Id",
  columns: [
    ["Home Region", "HomeRegion"],
    ["Enabled", "IsEnabled"],
  ],
  create: "PutStorageLensConfiguration",
  actions: [
    "GetStorageLensConfiguration",
    "PutStorageLensConfiguration",
    "DeleteStorageLensConfiguration",
    "GetStorageLensConfigurationTagging",
    "PutStorageLensConfigurationTagging",
  ],
  context: (item) => ({ ConfigId: item.Id }),
}

const lensGroups: Collection = {
  title: "Storage Lens groups",
  read: "ListStorageLensGroups",
  resultKey: "StorageLensGroupList",
  name: "Name",
  columns: [
    ["Home Region", "HomeRegion"],
    ["ARN", "StorageLensGroupArn"],
  ],
  create: "CreateStorageLensGroup",
  actions: ["GetStorageLensGroup", "UpdateStorageLensGroup", "DeleteStorageLensGroup"],
  context: (item) => ({ Name: item.Name, ResourceArn: item.StorageLensGroupArn }),
}

const endpoints: Collection = {
  title: "Outposts endpoints",
  read: "ListEndpoints",
  resultKey: "Endpoints",
  name: "EndpointArn",
  columns: [
    ["Outpost ID", "OutpostsId"],
    ["Status", "Status"],
  ],
  create: "CreateEndpoint",
  actions: ["DeleteEndpoint"],
  context: (item) => ({
    EndpointId: String(item.EndpointArn).split("/").at(-1),
    OutpostId: item.OutpostsId,
  }),
}

const collections: Record<string, Collection[]> = {
  tables: [tableBuckets],
  vectors: [vectorBuckets],
  files: [fileSystems],
  batch: [jobs],
  outposts: [
    endpoints,
    {
      title: "Outposts with S3",
      read: "ListOutpostsWithS3",
      resultKey: "Outposts",
      name: "OutpostId",
      columns: [
        ["ARN", "OutpostArn"],
        ["Owner", "OwnerId"],
      ],
      actions: ["ListSharedEndpoints"],
      context: (item) => ({ OutpostId: item.OutpostId }),
    },
  ],
  grants: [
    {
      title: "Grants",
      read: "ListAccessGrants",
      resultKey: "AccessGrantsList",
      name: "AccessGrantId",
      columns: [
        ["Permission", "Permission"],
        ["Grantee", "Grantee"],
      ],
      create: "CreateAccessGrant",
      actions: ["GetAccessGrant", "DeleteAccessGrant"],
      context: (item) => ({ AccessGrantId: item.AccessGrantId }),
    },
    {
      title: "Access Grants locations",
      read: "ListAccessGrantsLocations",
      resultKey: "AccessGrantsLocationsList",
      name: "AccessGrantsLocationId",
      columns: [["Location scope", "LocationScope"]],
      create: "CreateAccessGrantsLocation",
      actions: [
        "GetAccessGrantsLocation",
        "UpdateAccessGrantsLocation",
        "DeleteAccessGrantsLocation",
      ],
      context: (item) => ({ AccessGrantsLocationId: item.AccessGrantsLocationId }),
    },
  ],
}

const categories: Record<string, [string, Collection][]> = {
  access: [
    ["General purpose buckets", accessPoints],
    ["Directory buckets", directoryAccess],
    ["Multi-Region", multiRegionAccess],
    ["Object Lambda", lambdaAccess],
  ],
  lens: [
    [lensDashboards.title, lensDashboards],
    [lensGroups.title, lensGroups],
  ],
}

const createLabels: Record<string, string> = {
  CreateJob: "Create job",
  CreateTableBucket: "Create table bucket",
  CreateVectorBucket: "Create vector bucket",
  CreateFileSystem: "Create file system",
}

const text = (value: unknown): string =>
  value === undefined || value === null
    ? "—"
    : Array.isArray(value)
      ? value.join(".")
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value)

export function S3Collections({ area, model, filter }: Scope) {
  const actions = Object.keys(s3Operations[model]).filter(
    (action) => !filter || filter.test(action),
  )
  const tabs = categories[area]
  return (
    <div className="space-y-4">
      {tabs && (
        <Tabs defaultValue={tabs[0][0]}>
          <TabsList className="group-data-horizontal/tabs:h-auto max-w-full justify-start overflow-x-auto overflow-y-hidden">
            {tabs.map(([name]) => (
              <TabsTrigger key={name} value={name}>
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map(([name, spec]) => (
            <TabsContent key={name} value={name}>
              <S3Collection spec={spec} model={model} />
            </TabsContent>
          ))}
        </Tabs>
      )}
      {area === "grants" && (
        <S3Settings
          model="s3control"
          context={{}}
          sections={[
            {
              title: "Access Grants instance",
              read: "GetAccessGrantsInstance",
              actions: ["CreateAccessGrantsInstance", "DeleteAccessGrantsInstance"],
            },
          ]}
        />
      )}
      {collections[area]?.map((collection) => (
        <S3Collection key={collection.read} spec={collection} model={model} />
      ))}
      <S3Operations model={model} actions={actions} />
    </div>
  )
}

function S3Collection({
  spec,
  model,
  context = {},
}: {
  spec: Collection
  model: S3Model
  context?: Resource
}) {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState("")
  const [intent, setIntent] = useState<{ action: string; creating?: boolean }>()
  const action = intent?.action ?? ""
  const result = useInfiniteQuery({
    queryKey: ["emulator", "s3", model, spec.read, context],
    initialPageParam: {} as Resource,
    queryFn: ({ signal, pageParam }) =>
      s3Read(model, spec.read, { ...context, ...pageParam }, signal),
    getNextPageParam: (page) => {
      if (page.NextToken) return { NextToken: page.NextToken }
      if (page.nextToken) return { nextToken: page.nextToken }
      if (page.continuationToken) return { continuationToken: page.continuationToken }
    },
  })
  const records =
    result.data?.pages.flatMap((page) => {
      const entries = page[spec.resultKey]
      return Array.isArray(entries) ? (entries as Resource[]) : []
    }) ?? []
  const rows = records.filter((row) =>
    text(row[spec.name]).toLowerCase().includes(search.toLowerCase()),
  )
  const active = records.find((row) => text(row[spec.name]) === selected)
  const rowContext = active ? { ...context, ...spec.context?.(active) } : context
  const formContext = intent?.creating ? context : rowContext
  const fields = s3Operations[model][action]?.input ?? []
  const fixed = Object.fromEntries(
    fields
      .filter(
        ([field]) =>
          formContext[field] !== undefined &&
          !(action === "GetTable" && field === "tableArn"),
      )
      .map(([field]) => [field, formContext[field]]),
  )
  const settings = active && spec.settings ? Object.entries(spec.settings) : undefined
  const createStorage =
    action === "CreateTableBucket"
      ? "s3tables"
      : action === "CreateVectorBucket"
        ? "s3vectors"
        : action === "CreateFileSystem"
          ? "s3files"
          : undefined

  return (
    <section className="space-y-3">
      <Card className="gap-0 overflow-hidden rounded-xl border py-0 ring-0">
        <S3Toolbar
          title={spec.title}
          filter={{
            label: `Filter ${spec.title.toLowerCase()}`,
            value: search,
            set: setSearch,
          }}
        >
          {spec.create && (
            <Button onClick={() => setIntent({ action: spec.create!, creating: true })}>
              {createLabels[spec.create] ?? s3OperationLabel(spec.create)}
            </Button>
          )}
        </S3Toolbar>
        {!rows.length ? (
          <S3Status
            error={result.error}
            loading={result.isPending}
            empty={`No ${spec.title.toLowerCase()} found.`}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {spec.columns.map(([label]) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const name = text(row[spec.name])
                return (
                  <TableRow
                    key={name}
                    data-state={selected === name ? "selected" : undefined}
                  >
                    <TableCell>
                      {spec.actions?.length || spec.children?.length ? (
                        <Button
                          variant="link"
                          className="px-0"
                          onClick={() => {
                            setSelected(name === selected ? "" : name)
                            setIntent(undefined)
                          }}
                        >
                          {name}
                        </Button>
                      ) : (
                        name
                      )}
                    </TableCell>
                    {spec.columns.map(([label, key]) => (
                      <TableCell
                        key={label}
                        className="max-w-sm truncate"
                        title={text(row[key])}
                      >
                        {text(row[key])}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
        {result.hasNextPage && (
          <CardContent className="border-t p-3">
            <Button
              variant="outline"
              disabled={result.isFetching}
              onClick={() => void result.fetchNextPage()}
            >
              Load more
            </Button>
          </CardContent>
        )}
      </Card>
      {active && spec.actions && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <strong className="text-sm">{selected}</strong>
          {spec.actions.map((name) => (
            <Button
              key={name}
              variant="outline"
              onClick={() => setIntent({ action: name })}
            >
              {name === "UpdateJobPriority"
                ? "Edit priority"
                : name === "UpdateJobStatus"
                  ? "Manage job status"
                  : s3OperationLabel(name)}
            </Button>
          ))}
        </div>
      )}
      {action === "CreateJob" ? (
        <S3BatchJob close={() => setIntent(undefined)} />
      ) : createStorage ? (
        <S3CreateStorage model={createStorage} close={() => setIntent(undefined)} />
      ) : (
        action && (
          <S3OperationForm
            key={`${selected}:${action}:${intent?.creating === true}`}
            model={model}
            action={action}
            title={
              action === "DeleteFileSystem"
                ? "Delete file system"
                : action === "UpdateJobPriority"
                  ? "Edit priority"
                  : undefined
            }
            fixed={fixed}
            confirm={action === "DeleteFileSystem" ? "confirm" : undefined}
            initial={
              action === "UpdateJobPriority"
                ? { Priority: active?.Priority }
                : undefined
            }
            cancel={() => setIntent(undefined)}
            afterSuccess={
              !/^(Get|Describe|Query|List)/.test(action)
                ? () => setIntent(undefined)
                : undefined
            }
          />
        )
      )}
      {settings && (
        <Tabs key={selected} defaultValue={settings[0][0]}>
          <TabsList aria-label={`${selected} settings`}>
            {settings.map(([title]) => (
              <TabsTrigger key={title} value={title}>
                {title}
              </TabsTrigger>
            ))}
          </TabsList>
          {settings.map(([title, sections]) => (
            <TabsContent key={title} value={title} className="space-y-3">
              <S3Settings model={model} context={rowContext} sections={sections} />
            </TabsContent>
          ))}
        </Tabs>
      )}
      {active &&
        spec.children?.map((child) => (
          <div key={`${selected}:${child.read}`} className="border-l-2 pl-3 sm:pl-4">
            <S3Collection spec={child} model={model} context={rowContext} />
          </div>
        ))}
    </section>
  )
}
