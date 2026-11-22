"use client"

import AppLayoutToolbar, {
  type AppLayoutToolbarProps,
} from "@cloudscape-design/components/app-layout-toolbar"
import BreadcrumbGroup, {
  type BreadcrumbGroupProps,
} from "@cloudscape-design/components/breadcrumb-group"
import SideNavigation, {
  type SideNavigationProps,
} from "@cloudscape-design/components/side-navigation"
import { useRouter } from "next/navigation"
import { useState, type ReactNode } from "react"

export type Crumb = BreadcrumbGroupProps.Item

export function useFollow() {
  const router = useRouter()
  return (event: CustomEvent<{ href?: string; external?: boolean }>) => {
    if (event.detail.external || !event.detail.href) return
    event.preventDefault()
    router.push(event.detail.href)
  }
}

export function ServiceNavigation({
  header,
  items,
  activeHref,
  onFollow,
}: {
  header: SideNavigationProps.Header
  items: SideNavigationProps.Item[]
  activeHref?: string
  onFollow?: SideNavigationProps["onFollow"]
}) {
  const follow = useFollow()
  return (
    <SideNavigation
      header={header}
      items={items}
      activeHref={activeHref}
      onFollow={onFollow ?? follow}
    />
  )
}

export function PageLayout({
  breadcrumbs,
  navigation,
  content,
  tools,
  notifications,
  contentType = "default",
  navigationHide,
  splitPanel,
  maxContentWidth,
}: {
  breadcrumbs?: Crumb[]
  navigation?: ReactNode
  content: ReactNode
  tools?: ReactNode
  notifications?: ReactNode
  contentType?: AppLayoutToolbarProps["contentType"]
  navigationHide?: boolean
  splitPanel?: ReactNode
  maxContentWidth?: number
}) {
  const follow = useFollow()
  // The console collapses service navigation on create and wizard pages.
  const [navigationOpen, setNavigationOpen] = useState(contentType !== "form" && contentType !== "wizard")
  const [toolsOpen, setToolsOpen] = useState(false)
  return (
    <AppLayoutToolbar
      headerSelector="#myaws-top-nav"
      footerSelector="#myaws-footer"
      contentType={contentType}
      maxContentWidth={maxContentWidth}
      breadcrumbs={
        breadcrumbs?.length ? (
          <BreadcrumbGroup items={breadcrumbs} onFollow={follow} />
        ) : undefined
      }
      navigation={navigation}
      navigationHide={navigationHide ?? !navigation}
      navigationOpen={navigationOpen}
      onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
      tools={tools}
      toolsHide={!tools}
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      notifications={notifications}
      splitPanel={splitPanel}
      content={<div id="main-content">{content}</div>}
    />
  )
}
