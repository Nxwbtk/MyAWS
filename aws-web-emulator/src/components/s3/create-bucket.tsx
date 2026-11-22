"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
import Container from "@cloudscape-design/components/container"
import ExpandableSection from "@cloudscape-design/components/expandable-section"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs"
import Link from "@cloudscape-design/components/link"
import Modal from "@cloudscape-design/components/modal"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Tiles from "@cloudscape-design/components/tiles"
import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { S3Layout } from "@/components/s3/s3-app"
import { s3Read, s3Request, useInvalidate, useS3, useS3Environment } from "@/components/s3/s3-hooks"
import { regionName } from "@/lib/service-meta"

export type PublicAccessBlock = {
  BlockPublicAcls: boolean
  IgnorePublicAcls: boolean
  BlockPublicPolicy: boolean
  RestrictPublicBuckets: boolean
}

export const blockPublicAccessSettings: { key: keyof PublicAccessBlock; label: string; description: string }[] = [
  {
    key: "BlockPublicAcls",
    label: "Block public access to buckets and objects granted through new access control lists (ACLs)",
    description:
      "S3 will block public access permissions applied to newly added buckets or objects, and prevent the creation of new public access ACLs for existing buckets and objects. This setting doesn't change any existing permissions that allow public access to S3 resources using ACLs.",
  },
  {
    key: "IgnorePublicAcls",
    label: "Block public access to buckets and objects granted through any access control lists (ACLs)",
    description: "S3 will ignore all ACLs that grant public access to buckets and objects.",
  },
  {
    key: "BlockPublicPolicy",
    label: "Block public access to buckets and objects granted through new public bucket or access point policies",
    description:
      "S3 will block new bucket and access point policies that grant public access to buckets and objects. This setting doesn't change any existing policies that allow public access to S3 resources.",
  },
  {
    key: "RestrictPublicBuckets",
    label: "Block public and cross-account access to buckets and objects through any public bucket or access point policies",
    description:
      "S3 will ignore public and cross-account access for buckets or access points with policies that grant public access to buckets and objects.",
  },
]

export function BlockPublicAccessEditor({
  value,
  onChange,
  scope = "bucket",
}: {
  value: PublicAccessBlock
  onChange: (value: PublicAccessBlock) => void
  scope?: "bucket" | "account"
}) {
  const all = blockPublicAccessSettings.every(({ key }) => value[key])
  const some = blockPublicAccessSettings.some(({ key }) => value[key])
  return (
    <SpaceBetween size="s">
      <Checkbox
        checked={all}
        indeterminate={!all && some}
        description="Turning this setting on is the same as turning on all four settings below. Each of the following settings are independent of one another."
        onChange={({ detail }) =>
          onChange({
            BlockPublicAcls: detail.checked,
            IgnorePublicAcls: detail.checked,
            BlockPublicPolicy: detail.checked,
            RestrictPublicBuckets: detail.checked,
          })
        }
      >
        <b>Block all public access</b>
      </Checkbox>
      <div style={{ paddingInlineStart: 24 }}>
        <SpaceBetween size="s">
          {blockPublicAccessSettings.map((setting) => (
            <Checkbox
              key={setting.key}
              checked={value[setting.key]}
              description={setting.description.replace("this bucket", scope === "account" ? "this account" : "this bucket")}
              onChange={({ detail }) => onChange({ ...value, [setting.key]: detail.checked })}
            >
              {setting.label}
            </Checkbox>
          ))}
        </SpaceBetween>
      </div>
    </SpaceBetween>
  )
}

type Encryption = "AES256" | "aws:kms" | "aws:kms:dsse"

export function validateBucketName(name: string) {
  if (!name) return "Bucket name is required."
  if (name.length < 3 || name.length > 63) return "Bucket name must be between 3 and 63 characters long."
  if (!/^[a-z0-9.-]+$/.test(name)) return "Bucket name must not contain uppercase characters or invalid characters."
  if (!/^[a-z0-9].*[a-z0-9]$/.test(name)) return "Bucket name must start and end with a lowercase letter or number."
  if (/\.\./.test(name)) return "Bucket name must not contain two adjacent periods."
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return "Bucket name must not be formatted as an IP address."
  if (/^(xn--|sthree-|amzn-s3-demo-)/.test(name) || /(-s3alias|--ol-s3|--x-s3|--table-s3)$/.test(name))
    return "Bucket name must not use a reserved prefix or suffix."
  return undefined
}

export function CreateBucketPage() {
  const router = useRouter()
  const params = useSearchParams()
  const invalidate = useInvalidate()
  const environment = useS3Environment()
  const region = environment.data?.region ?? "ap-southeast-7"
  const [type, setType] = useState(params.get("bucketType") === "directory" ? "directory" : "general")
  const [namespace, setNamespace] = useState("global")
  const [name, setName] = useState("")
  const [zone, setZone] = useState(`${region.replace(/-/g, "").slice(0, 6)}-az1`)
  const [ownership, setOwnership] = useState("BucketOwnerEnforced")
  const [preferred, setPreferred] = useState("BucketOwnerPreferred")
  const [blockAccess, setBlockAccess] = useState<PublicAccessBlock>({
    BlockPublicAcls: true,
    IgnorePublicAcls: true,
    BlockPublicPolicy: true,
    RestrictPublicBuckets: true,
  })
  const [acknowledged, setAcknowledged] = useState(false)
  const [versioning, setVersioning] = useState("Disabled")
  const [tags, setTags] = useState<Tag[]>([])
  const [encryption, setEncryption] = useState<Encryption>("AES256")
  const [kmsKey, setKmsKey] = useState("")
  const [bucketKey, setBucketKey] = useState("Enabled")
  const [objectLock, setObjectLock] = useState("Disabled")
  const [lockAck, setLockAck] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [copyOpen, setCopyOpen] = useState(false)
  const [copySource, setCopySource] = useState<string>()

  const fullName = type === "directory" ? `${name}--${zone}--x-s3` : name
  const nameError = submitted ? validateBucketName(type === "directory" ? name : fullName) : undefined
  const publicOpen = !blockPublicAccessSettings.every(({ key }) => blockAccess[key])

  async function copySettings(source: string) {
    setCopySource(source)
    const read = async <T extends object>(action: string) => {
      try {
        return await s3Read<T>("s3", action, { Bucket: source })
      } catch {
        return undefined
      }
    }
    const [own, pab, ver, enc] = await Promise.all([
      read<{ OwnershipControls?: { Rules?: { ObjectOwnership?: string }[] } }>("GetBucketOwnershipControls"),
      read<{ PublicAccessBlockConfiguration?: PublicAccessBlock }>("GetPublicAccessBlock"),
      read<{ Status?: string }>("GetBucketVersioning"),
      read<{ ServerSideEncryptionConfiguration?: { Rules?: { ApplyServerSideEncryptionByDefault?: { SSEAlgorithm?: Encryption; KMSMasterKeyID?: string }; BucketKeyEnabled?: boolean }[] } }>("GetBucketEncryption"),
    ])
    const rule = own?.OwnershipControls?.Rules?.[0]?.ObjectOwnership
    if (rule) {
      setOwnership(rule === "BucketOwnerEnforced" ? "BucketOwnerEnforced" : "acls")
      if (rule !== "BucketOwnerEnforced") setPreferred(rule)
    }
    if (pab?.PublicAccessBlockConfiguration) setBlockAccess({ ...blockAccess, ...pab.PublicAccessBlockConfiguration })
    setVersioning(ver?.Status === "Enabled" ? "Enabled" : "Disabled")
    const sse = enc?.ServerSideEncryptionConfiguration?.Rules?.[0]
    if (sse?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm) {
      setEncryption(sse.ApplyServerSideEncryptionByDefault.SSEAlgorithm)
      setKmsKey(sse.ApplyServerSideEncryptionByDefault.KMSMasterKeyID ?? "")
      setBucketKey(sse.BucketKeyEnabled ? "Enabled" : "Disabled")
    }
  }

  async function submit() {
    setSubmitted(true)
    setError(undefined)
    if (validateBucketName(type === "directory" ? name : fullName)) return
    if (publicOpen && !acknowledged) return
    if (objectLock === "Enabled" && !lockAck) return
    setSaving(true)
    try {
      const configuration: Record<string, unknown> =
        type === "directory"
          ? {
              Location: { Type: "AvailabilityZone", Name: zone },
              Bucket: { DataRedundancy: "SingleAvailabilityZone", Type: "Directory" },
            }
          : region === "us-east-1"
            ? {}
            : { LocationConstraint: region }
      await s3Request("s3", "CreateBucket", {
        Bucket: fullName,
        ...(type === "general" ? { BucketNamespace: namespace } : {}),
        ...(Object.keys(configuration).length ? { CreateBucketConfiguration: configuration } : {}),
        ...(type === "general"
          ? {
              ObjectOwnership: ownership === "BucketOwnerEnforced" ? "BucketOwnerEnforced" : preferred,
              ObjectLockEnabledForBucket: objectLock === "Enabled",
            }
          : {}),
      })
      if (type === "general") {
        await s3Request("s3", "PutPublicAccessBlock", {
          Bucket: fullName,
          PublicAccessBlockConfiguration: blockAccess,
        })
        if (versioning === "Enabled" && objectLock !== "Enabled")
          await s3Request("s3", "PutBucketVersioning", {
            Bucket: fullName,
            VersioningConfiguration: { Status: "Enabled" },
          })
        const validTags = tags.filter((tag) => tag.Key)
        if (validTags.length)
          await s3Request("s3", "PutBucketTagging", { Bucket: fullName, Tagging: { TagSet: validTags } })
        await s3Request("s3", "PutBucketEncryption", {
          Bucket: fullName,
          ServerSideEncryptionConfiguration: {
            Rules: [
              {
                ApplyServerSideEncryptionByDefault: {
                  SSEAlgorithm: encryption,
                  ...(encryption !== "AES256" && kmsKey ? { KMSMasterKeyID: kmsKey } : {}),
                },
                BucketKeyEnabled: encryption === "aws:kms" ? bucketKey === "Enabled" : undefined,
              },
            ],
          },
        })
      }
      await invalidate()
      flash.success(
        <>
          Successfully created bucket &quot;{fullName}&quot;. To upload files and folders, or to configure additional bucket
          settings, choose <b>View details</b>.
        </>,
      )
      router.push(type === "directory" ? "/s3/directory-buckets" : "/s3/buckets")
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <S3Layout
      breadcrumbs={[{ text: "Buckets", href: "/s3/buckets" }, { text: "Create bucket", href: "/s3/bucket/create" }]}
      contentType="form"
    >
      <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <Form
          header={
            <Header variant="h1" info={<Link variant="info">Info</Link>} description="Buckets are containers for data stored in S3.">
              Create bucket
            </Header>
          }
          errorText={error}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button formAction="none" variant="link" onClick={() => router.push("/s3/buckets")}>
                Cancel
              </Button>
              <Button variant="primary" loading={saving}>
                Create bucket
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">General configuration</Header>}>
              <SpaceBetween size="l">
                <KeyValuePairs items={[{ label: "AWS Region", value: `${regionName(region)} ${region}` }]} />
                <FormField label="Bucket type" info={<Link variant="info">Info</Link>} stretch>
                  <Tiles
                    value={type}
                    onChange={({ detail }) => setType(detail.value)}
                    columns={2}
                    items={[
                      {
                        value: "general",
                        label: "General purpose",
                        description:
                          "Recommended for most use cases and access patterns. General purpose buckets are the original S3 bucket type. They allow a mix of storage classes that redundantly store objects across multiple Availability Zones.",
                      },
                      {
                        value: "directory",
                        label: "Directory",
                        description:
                          "Recommended for specialized low-latency use cases supported by AWS Availability Zones or data residency use cases supported by AWS Local Zones.",
                      },
                    ]}
                  />
                </FormField>
                {type === "general" ? (
                  <FormField label="Bucket namespace" description={<>Choose the namespace where you want to create your bucket. <Link external href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html">Learn more</Link></>}>
                    <RadioGroup
                      value={namespace}
                      onChange={({ detail }) => setNamespace(detail.value)}
                      items={[
                        { value: "global", label: "Global namespace", description: "By default, S3 creates general purpose buckets in the global namespace." },
                        {
                          value: "account-regional",
                          label: "Account Regional namespace (recommended)",
                          description:
                            "General purpose buckets created in your account Regional namespace are unique to your account. These buckets can never be created by another AWS account.",
                        },
                      ]}
                    />
                  </FormField>
                ) : (
                  <FormField label="Availability Zone" description="Directory buckets store data in a single Availability Zone.">
                    <Select
                      selectedOption={{ value: zone, label: zone }}
                      onChange={({ detail }) => setZone(detail.selectedOption.value ?? zone)}
                      options={["az1", "az2", "az3"].map((suffix) => {
                        const id = `${region.replace(/-/g, "").slice(0, 6)}-${suffix}`
                        return { value: id, label: id }
                      })}
                    />
                  </FormField>
                )}
                <FormField
                  label="Bucket name"
                  info={<Link variant="info">Info</Link>}
                  errorText={nameError}
                  constraintText={
                    type === "directory" ? (
                      <>Full bucket name: <b>{fullName}</b>. Base names must be 3 to 63 characters, contain only lowercase letters, numbers, and hyphens.</>
                    ) : (
                      <>
                        Bucket names must be 3 to 63 characters and unique within the global namespace. Bucket names must also begin and end with a letter or number. Valid characters are a-z, 0-9, periods (.), and hyphens (-).{" "}
                        <Link external href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucketnamingrules.html">Learn more</Link>
                      </>
                    )
                  }
                  stretch
                >
                  <Input value={name} placeholder="amzn-s3-demo-bucket" onChange={({ detail }) => setName(detail.value)} />
                </FormField>
                {type === "general" && (
                  <FormField
                    label={<>Copy settings from existing bucket - <i>optional</i></>}
                    description="Only the bucket settings in the following configuration are copied."
                    constraintText={copySource ? `Copied from s3://${copySource}` : "Format: s3://bucket/prefix"}
                  >
                    <Button formAction="none" onClick={() => setCopyOpen(true)}>
                      Choose bucket
                    </Button>
                  </FormField>
                )}
              </SpaceBetween>
            </Container>

            {type === "general" && (
              <>
                <Container
                  header={
                    <Header
                      variant="h2"
                      info={<Link variant="info">Info</Link>}
                      description="Control ownership of objects written to this bucket from other AWS accounts and the use of access control lists (ACLs). Object ownership determines who can specify access to objects."
                    >
                      Object Ownership
                    </Header>
                  }
                >
                  <SpaceBetween size="l">
                    <FormField label="Object Ownership" stretch>
                      <Tiles
                        value={ownership}
                        onChange={({ detail }) => setOwnership(detail.value)}
                        columns={2}
                        items={[
                          {
                            value: "BucketOwnerEnforced",
                            label: "ACLs disabled (recommended)",
                            description: "All objects in this bucket are owned by this account. Access to this bucket and its objects is specified using only policies.",
                          },
                          {
                            value: "acls",
                            label: "ACLs enabled",
                            description: "Objects in this bucket can be owned by other AWS accounts. Access to this bucket and its objects can be specified using ACLs.",
                          },
                        ]}
                      />
                    </FormField>
                    {ownership === "BucketOwnerEnforced" ? (
                      <KeyValuePairs items={[{ label: "Object Ownership", value: "Bucket owner enforced" }]} />
                    ) : (
                      <SpaceBetween size="m">
                        <Alert type="warning">
                          We recommend disabling ACLs, unless you need to control access for each object individually or to have the object writer own the data they upload. Using a bucket policy instead of ACLs to share data with users outside of your account simplifies permissions management and auditing.
                        </Alert>
                        <FormField label="Object Ownership">
                          <RadioGroup
                            value={preferred}
                            onChange={({ detail }) => setPreferred(detail.value)}
                            items={[
                              {
                                value: "BucketOwnerPreferred",
                                label: "Bucket owner preferred",
                                description: "If new objects written to this bucket specify the bucket-owner-full-control canned ACL, they are owned by the bucket owner. Otherwise, they are owned by the object writer.",
                              },
                              {
                                value: "ObjectWriter",
                                label: "Object writer",
                                description: "The object writer remains the object owner.",
                              },
                            ]}
                          />
                        </FormField>
                      </SpaceBetween>
                    )}
                  </SpaceBetween>
                </Container>

                <Container
                  header={
                    <Header
                      variant="h2"
                      description={
                        <>
                          Public access is granted to buckets and objects through access control lists (ACLs), bucket policies, access point policies, or all. In order to ensure that public access to this bucket and its objects is blocked, turn on Block all public access. These settings apply only to this bucket and its access points. AWS recommends that you turn on Block all public access, but before applying any of these settings, ensure that your applications will work correctly without public access. If you require some level of public access to this bucket or objects within, you can customize the individual settings below to suit your specific storage use cases.{" "}
                          <Link external href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html">Learn more</Link>
                        </>
                      }
                    >
                      Block Public Access settings for this bucket
                    </Header>
                  }
                >
                  <SpaceBetween size="m">
                    <BlockPublicAccessEditor value={blockAccess} onChange={setBlockAccess} />
                    {publicOpen && (
                      <Alert type="warning" header="Turning off block all public access might result in this bucket and the objects within becoming public">
                        <SpaceBetween size="s">
                          <span>AWS recommends that you turn on block all public access, unless public access is required for specific and verified use cases such as static website hosting.</span>
                          <Checkbox
                            checked={acknowledged}
                            onChange={({ detail }) => setAcknowledged(detail.checked)}
                          >
                            I acknowledge that the current settings might result in this bucket and the objects within becoming public.
                          </Checkbox>
                          {submitted && !acknowledged && (
                            <Box color="text-status-error">You must acknowledge the public access warning.</Box>
                          )}
                        </SpaceBetween>
                      </Alert>
                    )}
                  </SpaceBetween>
                </Container>

                <Container
                  header={
                    <Header
                      variant="h2"
                      description={
                        <>
                          Versioning is a means of keeping multiple variants of an object in the same bucket. You can use versioning to preserve, retrieve, and restore every version of every object stored in your Amazon S3 bucket. With versioning, you can easily recover from both unintended user actions and application failures.{" "}
                          <Link external href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html">Learn more</Link>
                        </>
                      }
                    >
                      Bucket Versioning
                    </Header>
                  }
                >
                  <FormField label="Bucket Versioning">
                    <RadioGroup
                      value={objectLock === "Enabled" ? "Enabled" : versioning}
                      onChange={({ detail }) => setVersioning(detail.value)}
                      items={[
                        { value: "Disabled", label: "Disable", disabled: objectLock === "Enabled" },
                        { value: "Enabled", label: "Enable" },
                      ]}
                    />
                  </FormField>
                </Container>

                <Container
                  header={
                    <Header
                      variant="h2"
                      description={
                        <>
                          You can use bucket tags to analyze, manage and specify permissions for a bucket.{" "}
                          <Link external href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/CostAllocTagging.html">Learn more</Link>
                        </>
                      }
                    >
                      Tags - <i>optional</i>
                    </Header>
                  }
                >
                  <TagEditor tags={tags} onChange={setTags} limit={50} emptyText="No tags associated with this bucket." />
                </Container>

                <Container
                  header={
                    <Header variant="h2" info={<Link variant="info">Info</Link>} description="Server-side encryption is automatically applied to new objects stored in this bucket.">
                      Default encryption
                    </Header>
                  }
                >
                  <SpaceBetween size="l">
                    <FormField label="Encryption type" info={<Link variant="info">Info</Link>}>
                      <RadioGroup
                        value={encryption}
                        onChange={({ detail }) => setEncryption(detail.value as Encryption)}
                        items={[
                          { value: "AES256", label: "Server-side encryption with Amazon S3 managed keys (SSE-S3)" },
                          { value: "aws:kms", label: "Server-side encryption with AWS Key Management Service keys (SSE-KMS)" },
                          {
                            value: "aws:kms:dsse",
                            label: "Dual-layer server-side encryption with AWS Key Management Service keys (DSSE-KMS)",
                            description: "Secure your objects with two separate layers of encryption. For details on pricing, see DSSE-KMS pricing on the Storage tab of the Amazon S3 pricing page.",
                          },
                        ]}
                      />
                    </FormField>
                    {encryption !== "AES256" && (
                      <FormField label="AWS KMS key" description="Enter the ARN of an AWS KMS key. Leave empty to use the AWS managed key (aws/s3)." stretch>
                        <Input value={kmsKey} placeholder="arn:aws:kms:region:account-id:key/key-id" onChange={({ detail }) => setKmsKey(detail.value)} />
                      </FormField>
                    )}
                    <FormField
                      label="Bucket Key"
                      description={
                        <>
                          Using an S3 Bucket Key for SSE-KMS reduces encryption costs by lowering calls to AWS KMS. S3 Bucket Keys aren&apos;t supported for DSSE-KMS.{" "}
                          <Link external href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html">Learn more</Link>
                        </>
                      }
                    >
                      <RadioGroup
                        value={encryption === "aws:kms" ? bucketKey : "Disabled"}
                        onChange={({ detail }) => setBucketKey(detail.value)}
                        items={[
                          { value: "Disabled", label: "Disable", disabled: encryption !== "aws:kms" },
                          { value: "Enabled", label: "Enable", disabled: encryption !== "aws:kms" },
                        ]}
                      />
                    </FormField>
                  </SpaceBetween>
                </Container>

                <Container>
                  <ExpandableSection headerText="Advanced settings" variant="footer">
                    <SpaceBetween size="m">
                      <FormField
                        label="Object Lock"
                        description={
                          <>
                            Store objects using a write-once-read-many (WORM) model to help you prevent objects from being deleted or overwritten for a fixed amount of time or indefinitely. Object Lock works only in versioned buckets.{" "}
                            <Link external href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html">Learn more</Link>
                          </>
                        }
                      >
                        <RadioGroup
                          value={objectLock}
                          onChange={({ detail }) => setObjectLock(detail.value)}
                          items={[
                            { value: "Disabled", label: "Disable" },
                            {
                              value: "Enabled",
                              label: "Enable",
                              description: "Permanently allows objects in this bucket to be locked. Additional Object Lock configuration is required in bucket details after bucket creation to protect objects in this bucket from being deleted or overwritten.",
                            },
                          ]}
                        />
                      </FormField>
                      {objectLock === "Enabled" ? (
                        <Alert type="warning">
                          <SpaceBetween size="xs">
                            <span>Enabling Object Lock will permanently allow objects in this bucket to be locked.</span>
                            <Checkbox checked={lockAck} onChange={({ detail }) => setLockAck(detail.checked)}>
                              I acknowledge that enabling Object Lock will permanently allow objects in this bucket to be locked.
                            </Checkbox>
                          </SpaceBetween>
                        </Alert>
                      ) : (
                        <Box color="text-body-secondary">
                          Object Lock works only in versioned buckets. Enabling Object Lock automatically enables Versioning.
                        </Box>
                      )}
                    </SpaceBetween>
                  </ExpandableSection>
                </Container>
              </>
            )}

            <Alert type="info">
              After creating the bucket, you can upload files and folders to the bucket, and configure additional bucket settings.
            </Alert>
          </SpaceBetween>
        </Form>
      </form>
      <ChooseBucketModal
        visible={copyOpen}
        onDismiss={() => setCopyOpen(false)}
        onChoose={(bucket) => {
          setCopyOpen(false)
          void copySettings(bucket)
        }}
      />
    </S3Layout>
  )
}

export function ChooseBucketModal({
  visible,
  onDismiss,
  onChoose,
  title = "Choose bucket",
}: {
  visible: boolean
  onDismiss: () => void
  onChoose: (bucket: string) => void
  title?: string
}) {
  const buckets = useS3<{ Buckets?: { Name?: string }[] }>("s3", "ListBuckets", { MaxBuckets: 1000 }, { enabled: visible })
  const [choice, setChoice] = useState<string>()
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header={title}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>Cancel</Button>
            <Button variant="primary" disabled={!choice} onClick={() => choice && onChoose(choice)}>
              Choose bucket
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <FormField label="Bucket">
        <Select
          filteringType="auto"
          placeholder="Choose a bucket"
          statusType={buckets.isPending ? "loading" : "finished"}
          selectedOption={choice ? { value: choice, label: choice } : null}
          onChange={({ detail }) => setChoice(detail.selectedOption.value)}
          options={(buckets.data?.Buckets ?? []).map((bucket) => ({ value: bucket.Name, label: bucket.Name }))}
        />
      </FormField>
    </Modal>
  )
}
