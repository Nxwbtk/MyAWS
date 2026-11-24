import { notFound } from "next/navigation"
import { Suspense } from "react"
import { AcmApp } from "@/components/acm/acm-app"
import { CloudFrontApp } from "@/components/cloudfront/cf-app"
import { GlobalAcceleratorApp } from "@/components/globalaccelerator/ga-app"
import { CloudMapApp } from "@/components/servicediscovery/cm-app"
import { VpcLatticeApp } from "@/components/vpclattice/lattice-app"
import { DirectConnectApp } from "@/components/directconnect/dx-app"
import { InterconnectApp } from "@/components/interconnect/ic-app"
import { NetworkManagerApp } from "@/components/networkmanager/nm-app"
import { AppMeshApp } from "@/components/appmesh/mesh-app"
import { RtbFabricApp } from "@/components/rtbfabric/rtb-app"
import { CloudTrailApp } from "@/components/cloudtrail/ct-app"
import { CloudWatchApp } from "@/components/cloudwatch/cw-app"
import { DynamoDbApp } from "@/components/dynamodb/ddb-app"
import { Ec2App } from "@/components/ec2/ec2-app"
import { IamApp } from "@/components/iam/iam-app"
import { LambdaApp } from "@/components/lambda/lambda-app"
import { Phase2ServiceConsole } from "@/components/phase-2-service-console"
import { Route53App } from "@/components/route53/r53-app"
import { S3App } from "@/components/s3/s3-app"
import { SqsApp } from "@/components/sqs/sqs-app"
import { StsApp } from "@/components/sts/sts-app"
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
  if (entry.id === "iam") return <Suspense fallback={null}><IamApp path={path} /></Suspense>
  if (entry.id === "elasticloadbalancing") return <Suspense fallback={null}><Ec2App path={path.length ? path : ["load-balancers"]} /></Suspense>
  if (entry.id === "acm") return <Suspense fallback={null}><AcmApp path={path} /></Suspense>
  if (entry.id === "cloudfront") return <Suspense fallback={null}><CloudFrontApp path={path} /></Suspense>
  if (entry.id === "globalaccelerator") return <Suspense fallback={null}><GlobalAcceleratorApp path={path} /></Suspense>
  if (entry.id === "servicediscovery") return <Suspense fallback={null}><CloudMapApp path={path} /></Suspense>
  if (entry.id === "vpclattice") return <Suspense fallback={null}><VpcLatticeApp path={path} /></Suspense>
  if (entry.id === "directconnect") return <Suspense fallback={null}><DirectConnectApp path={path} /></Suspense>
  if (entry.id === "interconnect") return <Suspense fallback={null}><InterconnectApp path={path} /></Suspense>
  if (entry.id === "networkmanager") return <Suspense fallback={null}><NetworkManagerApp path={path} /></Suspense>
  if (entry.id === "appmesh") return <Suspense fallback={null}><AppMeshApp path={path} /></Suspense>
  if (entry.id === "rtbfabric") return <Suspense fallback={null}><RtbFabricApp path={path} /></Suspense>
  if (entry.id === "route53") return <Suspense fallback={null}><Route53App path={path} /></Suspense>
  if (entry.id === "cloudtrail") return <Suspense fallback={null}><CloudTrailApp path={path} /></Suspense>
  if (entry.id === "cloudwatch") return <Suspense fallback={null}><CloudWatchApp path={path} /></Suspense>
  if (entry.id === "lambda") return <Suspense fallback={null}><LambdaApp path={path} /></Suspense>
  if (entry.id === "sts") return <Suspense fallback={null}><StsApp path={path} /></Suspense>
  if (entry.id === "sqs") return <Suspense fallback={null}><SqsApp path={path} /></Suspense>
  if (entry.id === "dynamodb") return <Suspense fallback={null}><DynamoDbApp path={path} /></Suspense>
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
