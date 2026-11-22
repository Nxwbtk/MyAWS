"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Header from "@cloudscape-design/components/header"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import { useState } from "react"
import { EditModal, LearnMore, Section } from "@/components/console/sections"
import { BlockPublicAccessEditor, blockPublicAccessSettings, type PublicAccessBlock } from "@/components/s3/create-bucket"
import { S3Layout } from "@/components/s3/s3-app"
import { s3Request, useS3, useS3Environment } from "@/components/s3/s3-hooks"

export function AccountSettingsPage() {
  const environment = useS3Environment()
  const account = environment.data?.account
  const block = useS3<{ PublicAccessBlockConfiguration?: PublicAccessBlock }>("s3control", "GetPublicAccessBlock", { AccountId: account }, { enabled: Boolean(account) })
  const config: PublicAccessBlock = { BlockPublicAcls: false, IgnorePublicAcls: false, BlockPublicPolicy: false, RestrictPublicBuckets: false, ...block.data?.PublicAccessBlockConfiguration }
  const all = blockPublicAccessSettings.every(({ key }) => config[key])
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(config)
  const [confirm, setConfirm] = useState(false)
  const status = (on: boolean) => (on ? <StatusIndicator type="success">On</StatusIndicator> : <StatusIndicator type="warning">Off</StatusIndicator>)
  return (
    <S3Layout breadcrumbs={[{ text: "Account and organization settings", href: "/s3/account-settings" }]}>
      <ContentLayout header={<Header variant="h1">Account and organization settings</Header>}>
        <SpaceBetween size="l">
          <Section
            title="Block Public Access settings for this account"
            description={
              <>
                Public access is granted to buckets and objects through access control lists (ACLs), bucket policies, access point policies or all. In order to ensure that public access to all your S3 buckets and objects is blocked, turn on Block all public access. These settings apply account-wide for all current and future buckets and access points. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html" />
              </>
            }
            onEdit={() => {
              setValue(config)
              setConfirm(false)
              setOpen(true)
            }}
          >
            <SpaceBetween size="m">
              <div>
                <Box variant="awsui-key-label">Block all public access</Box>
                {status(all)}
              </div>
              <div style={{ paddingInlineStart: 20 }}>
                <SpaceBetween size="s">
                  {blockPublicAccessSettings.map((setting) => (
                    <div key={setting.key}>
                      <Box variant="awsui-key-label">{setting.label}</Box>
                      {status(config[setting.key])}
                    </div>
                  ))}
                </SpaceBetween>
              </div>
            </SpaceBetween>
          </Section>
          <Section
            title="AWS Organizations settings for Storage Lens"
            description={<>You can authorize Storage Lens to access your organization hierarchy. You can also register member accounts to act as delegated administrators. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage_lens_with_organizations.html" /></>}
            actions={<Button disabled disabledReason="AWS Organizations is not available in the local emulator.">Edit trusted access</Button>}
          >
            <Alert type="error" header="AWS Organizations administrator permissions unavailable">
              You are not able to view this page because you are not an administrator for your AWS organization or because your account is not a member of any AWS organization.
              <Box variant="small">API response: Your account is not a member of an organization.</Box>
            </Alert>
          </Section>
        </SpaceBetween>
      </ContentLayout>
      <EditModal
        visible={open}
        size="large"
        title="Edit Block Public Access settings for this account"
        onDismiss={() => setOpen(false)}
        success="Successfully edited Block Public Access settings for this account."
        saveDisabled={!confirm}
        onSave={async () => {
          await s3Request("s3control", "PutPublicAccessBlock", { AccountId: account, PublicAccessBlockConfiguration: value })
          await block.refetch()
        }}
      >
        <BlockPublicAccessEditor value={value} onChange={setValue} scope="account" />
        <Checkbox checked={confirm} onChange={({ detail }) => setConfirm(detail.checked)}>
          Updating the Block Public Access settings for this account will affect this account and all buckets within it. To confirm, check this box.
        </Checkbox>
      </EditModal>
    </S3Layout>
  )
}
