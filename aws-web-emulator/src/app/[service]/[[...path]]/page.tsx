import { notFound } from "next/navigation"
import { Suspense } from "react"
import { DynamoDbApp } from "@/components/dynamodb/ddb-app"
import { Ec2App } from "@/components/ec2/ec2-app"
import { Phase1ServiceConsole } from "@/components/phase-1-service-console"
import { Phase2ServiceConsole } from "@/components/phase-2-service-console"
import { ResourceConsole } from "@/components/resource-console"
import { S3App } from "@/components/s3/s3-app"
import { VpcApp } from "@/components/vpc/vpc-app"
import { ServiceIcon } from "@/components/service-icon"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { serviceSchema } from "@/lib/contracts"
import { catalogCommit, findCatalogService } from "@/lib/service-catalog"

export async function generateMetadata({ params }: PageProps<"/[service]/[[...path]]">) {
  const entry = findCatalogService((await params).service)
  return { title: entry ? `${entry.name} · MyAWS` : "MyAWS" }
}

export default async function ServicePage({ params }: PageProps<"/[service]/[[...path]]">) {
  const { service, path = [] } = await params
  const entry = findCatalogService(service)
  if (!entry) notFound()
  if (entry.id === "s3") return <Suspense fallback={null}><S3App path={path} /></Suspense>
  if (entry.id === "vpc") return <Suspense fallback={null}><VpcApp path={path} /></Suspense>
  if (entry.id === "ec2") return <Suspense fallback={null}><Ec2App path={path} /></Suspense>
  if (entry.id === "dynamodb") return <Suspense fallback={null}><DynamoDbApp path={path} /></Suspense>
  const managed = serviceSchema.safeParse(entry.id)
  if (managed.success)
    return <ResourceConsole key={managed.data} service={managed.data} />
  if (["iam", "sts", "lambda", "cloudwatch", "cloudtrail"].includes(entry.id))
    return <Phase1ServiceConsole key={entry.id} service={entry.id as "iam" | "sts" | "lambda" | "cloudwatch" | "cloudtrail"} />
  if (["route53", "elasticloadbalancing", "cloudfront", "acm", "globalaccelerator", "servicediscovery", "vpclattice", "directconnect", "interconnect", "networkmanager", "appmesh", "rtbfabric", "arc"].includes(entry.id))
    return <Phase2ServiceConsole key={entry.id} service={entry.id as "route53" | "elasticloadbalancing" | "cloudfront" | "acm" | "globalaccelerator" | "servicediscovery" | "vpclattice" | "directconnect" | "interconnect" | "networkmanager" | "appmesh" | "rtbfabric" | "arc"} />

  return (
    <>
      <section className="flex flex-wrap items-center gap-3.5">
        <ServiceIcon id={entry.id} className="size-10" />
        <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
          {entry.name}
        </h1>
        <Badge variant="secondary">API catalog</Badge>
      </section>
      <Card className="gap-0 overflow-hidden rounded-xl border py-0 shadow-xs ring-0">
        <CardHeader className="border-b bg-surface-subtle px-5 py-3.5">
          <h2 className="text-lg font-semibold">Registered API models</h2>
          <p className="text-sm text-muted-foreground">
            Use an AWS SDK or CLI pointed at the local emulator. Support varies
            by API operation.
          </p>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-5">SDK service name</TableHead>
                <TableHead className="px-5">Model namespace</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell className="px-5 py-2.5 font-medium">
                    {model.name}
                  </TableCell>
                  <TableCell className="px-5 py-2.5 font-mono text-sm text-muted-foreground">
                    {model.id}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="border-t px-5 py-3 text-sm text-muted-foreground">
            Catalog source <code>{catalogCommit.slice(0, 7)}</code>
          </p>
        </CardContent>
      </Card>
    </>
  )
}
