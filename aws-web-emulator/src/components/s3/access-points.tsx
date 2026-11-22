"use client"

import Alert from "@cloudscape-design/components/alert"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Tabs from "@cloudscape-design/components/tabs"
import Tiles from "@cloudscape-design/components/tiles"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { JsonField, LearnMore } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { AccessPointsTable } from "@/components/s3/bucket-misc"
import { ChooseBucketModal, BlockPublicAccessEditor, type PublicAccessBlock } from "@/components/s3/create-bucket"
import { S3Layout } from "@/components/s3/s3-app"
import { s3Request, useInvalidate, useS3Environment } from "@/components/s3/s3-hooks"
import { regionName } from "@/lib/service-meta"

export function AccessPointsPage() {
  const [tab, setTab] = useState("general")
  return (
    <S3Layout breadcrumbs={[{ text: "Access Points", href: "/s3/ap" }]} contentType="table">
      <ContentLayout
        header={
          <Header variant="h1" info={<Link variant="info">Info</Link>} description="Access points are named network endpoints that are attached to buckets which simplify managing data access at scale in S3.">
            Access Points
          </Header>
        }
      >
        <Tabs
          activeTabId={tab}
          onChange={({ detail }) => setTab(detail.activeTabId)}
          tabs={[
            { id: "general", label: "General purpose buckets", content: <AccessPointsTable /> },
            { id: "directory", label: "Directory buckets", content: <Alert type="info">Access points for directory buckets are not available in the local emulator.</Alert> },
            { id: "mrap", label: "Multi-Region", content: <Alert type="info">Multi-Region Access Points are not available in the local emulator.</Alert> },
            { id: "olap", label: "Object Lambda", content: <Alert type="info">Object Lambda Access Points are not available in the local emulator.</Alert> },
          ]}
        />
      </ContentLayout>
    </S3Layout>
  )
}

export function CreateAccessPointPage() {
  const router = useRouter()
  const params = useSearchParams()
  const invalidate = useInvalidate()
  const environment = useS3Environment()
  const region = environment.data?.region ?? "ap-southeast-7"
  const account = environment.data?.account
  const [name, setName] = useState("")
  const [source, setSource] = useState("this")
  const [bucket, setBucket] = useState(params.get("bucket") ?? "")
  const [bucketAccount, setBucketAccount] = useState("")
  const [origin, setOrigin] = useState("Internet")
  const [vpc, setVpc] = useState("")
  const [block, setBlock] = useState<PublicAccessBlock>({ BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true })
  const [policy, setPolicy] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  const [choose, setChoose] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const arn = name && account ? `arn:aws:s3:${region}:${account}:accesspoint/${name}` : "-"
  return (
    <S3Layout breadcrumbs={[{ text: "Access Points", href: "/s3/ap" }, { text: "Create access point", href: "/s3/ap/create" }]} contentType="form">
      <Form
        header={
          <Header variant="h1" info={<Link variant="info">Info</Link>} description="Amazon S3 Access Points simplify managing data access at scale for shared datasets in S3. Access points are named network endpoints that are attached to buckets that you can use to perform S3 object operations.">
            Create access point for general purpose bucket
          </Header>
        }
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push("/s3/ap")}>Cancel</Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={async () => {
                setSaving(true)
                setError(undefined)
                try {
                  const validTags = tags.filter((tag) => tag.Key)
                  await s3Request("s3control", "CreateAccessPoint", {
                    AccountId: account,
                    Name: name,
                    Bucket: bucket,
                    ...(source === "other" && bucketAccount ? { BucketAccountId: bucketAccount } : {}),
                    ...(origin === "VPC" ? { VpcConfiguration: { VpcId: vpc } } : {}),
                    PublicAccessBlockConfiguration: block,
                    ...(validTags.length ? { Tags: validTags } : {}),
                  })
                  if (policy.trim()) await s3Request("s3control", "PutAccessPointPolicy", { AccountId: account, Name: name, Policy: JSON.stringify(JSON.parse(policy)) })
                  await invalidate()
                  flash.success(`Successfully created access point "${name}".`)
                  router.push("/s3/ap")
                } catch (caught) {
                  setError(errorMessage(caught))
                } finally {
                  setSaving(false)
                }
              }}
            >
              Create access point
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2">Properties</Header>}>
            <SpaceBetween size="l">
              <KeyValuePairs items={[{ label: "AWS Region", value: `${regionName(region)} ${region}` }]} />
              <FormField label="Access point name" constraintText="Access point names must be unique within the account for this Region and comply with the rules for access point naming." stretch>
                <Input value={name} onChange={({ detail }) => setName(detail.value)} />
              </FormField>
              <FormField label="Data source" description="Specify the S3 bucket you want to use with this Access Point. This setting can't be edited after the Access Point is created.">
                <RadioGroup value={source} onChange={({ detail }) => setSource(detail.value)} items={[{ value: "this", label: "Choose a bucket in this account" }, { value: "other", label: "Specify a bucket in another account" }]} />
              </FormField>
              <FormField label="Bucket name" description={`Specify a general purpose bucket that is in your account in the ${regionName(region)} ${region} Region.`} secondaryControl={<Button onClick={() => setChoose(true)}>Browse S3</Button>} stretch>
                <Input value={bucket} onChange={({ detail }) => setBucket(detail.value)} />
              </FormField>
              {source === "other" && (
                <FormField label="Bucket owner account ID"><Input value={bucketAccount} onChange={({ detail }) => setBucketAccount(detail.value)} /></FormField>
              )}
              <FormField label="Network origin">
                <Tiles
                  value={origin}
                  onChange={({ detail }) => setOrigin(detail.value)}
                  items={[
                    { value: "VPC", label: "Virtual private cloud (VPC)", description: "No internet access. Requests are made over a specified VPC only." },
                    { value: "Internet", label: "Internet" },
                  ]}
                />
              </FormField>
              {origin === "VPC" && (
                <>
                  <Alert type="info">The S3 console doesn&apos;t support accessing bucket resources using a virtual private cloud (VPC) access point. To access bucket resources from a VPC access point, use the AWS CLI, AWS SDKs, or Amazon S3 REST API.</Alert>
                  <FormField label="VPC ID" constraintText="VPC ID must start with vpc-"><Input value={vpc} onChange={({ detail }) => setVpc(detail.value)} /></FormField>
                </>
              )}
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2" description="Public access is granted to buckets and objects through access control lists (ACLs), bucket policies, access point policies, or all. These settings apply only to this Access Point.">Block Public Access settings for this Access Point</Header>}>
            <BlockPublicAccessEditor value={block} onChange={setBlock} />
          </Container>
          <Container header={<Header variant="h2" description="The Access Point policy, written in JSON, provides access to the objects stored in the bucket from this Access Point. Access Point policies don't apply to objects owned by other accounts.">Access Point policy - <i>optional</i></Header>}>
            <SpaceBetween size="m">
              <KeyValuePairs items={[{ label: "Access Point ARN", value: arn }]} />
              <FormField label="Policy" stretch><JsonField value={policy} onChange={setPolicy} rows={10} /></FormField>
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2" description={<>You can use access point tags to analyze, manage, and specify permissions for an access point. <LearnMore href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-points-tagging.html" /></>}>Tags - <i>optional</i></Header>}>
            <TagEditor tags={tags} onChange={setTags} emptyText="No tags associated with this access point." />
          </Container>
        </SpaceBetween>
      </Form>
      <ChooseBucketModal visible={choose} onDismiss={() => setChoose(false)} onChoose={(value) => { setBucket(value); setChoose(false) }} />
    </S3Layout>
  )
}
