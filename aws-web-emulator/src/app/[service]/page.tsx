import { notFound } from "next/navigation"
import { Suspense } from "react"
import { Ec2Console } from "@/components/ec2-console"
import { ResourceConsole } from "@/components/resource-console"
import { S3Console } from "@/components/s3-console"
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
import { managedServiceNames, serviceSchema } from "@/lib/contracts"
import { catalogCommit, findCatalogService } from "@/lib/service-catalog"

export function generateStaticParams() {
  return managedServiceNames.map((service) => ({ service }))
}

export async function generateMetadata({ params }: PageProps<"/[service]">) {
  const entry = findCatalogService((await params).service)
  return { title: entry ? `${entry.name} · MyAWS` : "MyAWS" }
}

export default async function ServicePage({ params }: PageProps<"/[service]">) {
  const entry = findCatalogService((await params).service)
  if (!entry) notFound()
  if (entry.id === "s3") return <Suspense fallback={<p role="status">Loading Amazon S3…</p>}><S3Console /></Suspense>
  if (entry.id === "ec2" || entry.id === "vpc")
    return <Ec2Console key={entry.id} service={entry.id} />
  const managed = serviceSchema.safeParse(entry.id)
  if (managed.success)
    return <ResourceConsole key={managed.data} service={managed.data} />

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
