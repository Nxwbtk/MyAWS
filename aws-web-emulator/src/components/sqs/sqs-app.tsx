"use client"

import type { SideNavigationProps } from "@cloudscape-design/components/side-navigation"
import { useSearchParams } from "next/navigation"
import type { ReactNode } from "react"
import { ConsoleLayout } from "@/components/ec2-family/engine"
import type { Crumb } from "@/components/shell/page-layout"
import { QueuesPage } from "@/components/sqs/queues"
import { QueueFormPage } from "@/components/sqs/queue-form"
import { QueueDetailPage } from "@/components/sqs/queue-detail"
import { MessagesPage } from "@/components/sqs/messages"
import { RedrivePage } from "@/components/sqs/redrive"

const nav: SideNavigationProps.Item[] = [{ type: "link", text: "Queues", href: "/sqs/queues" }]

export function SqsLayout({ breadcrumbs, children, contentType }: { breadcrumbs: Crumb[]; children: ReactNode; contentType?: "default" | "table" | "form" }) {
  return (
    <ConsoleLayout serviceName="Amazon SQS" serviceHref="/sqs/queues" nav={nav} activeHref="/sqs/queues" breadcrumbs={[{ text: "Amazon SQS", href: "/sqs/queues" }, ...breadcrumbs]} contentType={contentType}>
      {children}
    </ConsoleLayout>
  )
}

export function SqsApp({ path }: { path: string[] }) {
  const params = useSearchParams()
  const [section, name, sub] = path
  if (section === "create-queue") return <QueueFormPage />
  if (section === "queues" && name) {
    const queue = decodeURIComponent(name)
    if (sub === "edit") return <QueueFormPage editName={queue} />
    if (sub === "send-receive") return <MessagesPage name={queue} />
    if (sub === "redrive") return <RedrivePage name={queue} />
    return <QueueDetailPage name={queue} tab={params.get("tab") ?? "sns"} />
  }
  return <QueuesPage />
}
