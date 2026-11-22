"use client"

import Alert from "@cloudscape-design/components/alert"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
import FormField from "@cloudscape-design/components/form-field"
import RadioGroup from "@cloudscape-design/components/radio-group"
import SpaceBetween from "@cloudscape-design/components/space-between"
import StatusIndicator from "@cloudscape-design/components/status-indicator"
import Table from "@cloudscape-design/components/table"
import Tiles from "@cloudscape-design/components/tiles"
import { useState } from "react"
import { flash } from "@/components/console/flash"
import { CodeView, EditModal, JsonField, LearnMore, Section, pretty } from "@/components/console/sections"
import { useFollow } from "@/components/shell/page-layout"
import { BlockPublicAccessEditor, blockPublicAccessSettings, type PublicAccessBlock } from "@/components/s3/create-bucket"
import { s3Request, useS3, useS3Environment } from "@/components/s3/s3-hooks"
import { copyText } from "@/lib/format"

const docs = (path: string) => `https://docs.aws.amazon.com/AmazonS3/latest/userguide/${path}`

type Grant = { Grantee?: { Type?: string; ID?: string; URI?: string; DisplayName?: string }; Permission?: string }

const groups = [
  { label: "Everyone (public access)", uri: "http://acs.amazonaws.com/groups/global/AllUsers" },
  { label: "Authenticated users group (anyone with an AWS account)", uri: "http://acs.amazonaws.com/groups/global/AuthenticatedUsers" },
  { label: "S3 log delivery group", uri: "http://acs.amazonaws.com/groups/s3/LogDelivery" },
]

export function BucketPermissionsTab({ bucket }: { bucket: string }) {
  const follow = useFollow()
  const environment = useS3Environment()
  const region = environment.data?.region ?? "ap-southeast-7"
  return (
    <SpaceBetween size="l">
      <Section title="Permissions overview">
        <SpaceBetween size="xs">
          <Box variant="awsui-key-label">Access finding</Box>
          <Box>
            Access findings are provided by IAM external access analyzers. <LearnMore href="https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-findings.html" />
          </Box>
          <Button href="/iam/access-analyzer" onFollow={follow}>
            View analyzer for {region}
          </Button>
        </SpaceBetween>
      </Section>
      <BlockPublicAccessSection bucket={bucket} />
      <PolicySection bucket={bucket} />
      <OwnershipSection bucket={bucket} />
      <AclSection bucket={bucket} />
      <CorsSection bucket={bucket} />
    </SpaceBetween>
  )
}

function BlockPublicAccessSection({ bucket }: { bucket: string }) {
  const block = useS3<{ PublicAccessBlockConfiguration?: PublicAccessBlock }>("s3", "GetPublicAccessBlock", { Bucket: bucket })
  const config: PublicAccessBlock = {
    BlockPublicAcls: false,
    IgnorePublicAcls: false,
    BlockPublicPolicy: false,
    RestrictPublicBuckets: false,
    ...block.data?.PublicAccessBlockConfiguration,
  }
  const all = blockPublicAccessSettings.every(({ key }) => config[key])
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(config)
  const [confirm, setConfirm] = useState(false)
  return (
    <Section
      title="Block public access (bucket settings)"
      description={
        <>
          Public access is granted to buckets and objects through access control lists (ACLs), bucket policies, access point policies, or all. In order to ensure that public access to all your S3 buckets and objects is blocked, turn on Block all public access. These settings apply only to this bucket and its access points. AWS recommends that you turn on Block all public access, but before applying any of these settings, ensure that your applications will work correctly without public access. If you require some level of public access to your buckets or objects within, you can customize the individual settings below to suit your specific storage use cases. <LearnMore href={docs("access-control-block-public-access.html")} />
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
          {all ? <StatusIndicator type="success">On</StatusIndicator> : <StatusIndicator type="warning">Off</StatusIndicator>}
        </div>
        <Box variant="h4">Individual Block Public Access settings for this bucket</Box>
        {blockPublicAccessSettings.map((setting) => (
          <div key={setting.key}>
            <Box variant="awsui-key-label">{setting.label}</Box>
            <Box variant="small" color="text-body-secondary">{setting.description}</Box>
            <div>{config[setting.key] ? <StatusIndicator type="success">On</StatusIndicator> : <StatusIndicator type="warning">Off</StatusIndicator>}</div>
          </div>
        ))}
      </SpaceBetween>
      <EditModal
        visible={open}
        size="large"
        title="Edit Block public access (bucket settings)"
        onDismiss={() => setOpen(false)}
        success={`Successfully edited Block Public Access settings for this bucket.`}
        saveDisabled={!confirm}
        onSave={() => s3Request("s3", "PutPublicAccessBlock", { Bucket: bucket, PublicAccessBlockConfiguration: value })}
      >
        <BlockPublicAccessEditor value={value} onChange={setValue} />
        <Checkbox checked={confirm} onChange={({ detail }) => setConfirm(detail.checked)}>
          Updating the Block Public Access settings for this bucket will affect this bucket and all objects within. This may result in some objects becoming public. To confirm, check this box.
        </Checkbox>
      </EditModal>
    </Section>
  )
}

function PolicySection({ bucket }: { bucket: string }) {
  const policy = useS3<{ Policy?: string }>("s3", "GetBucketPolicy", { Bucket: bucket })
  const text = pretty(policy.data?.Policy)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [deleting, setDeleting] = useState(false)
  const arn = `arn:aws:s3:::${bucket}`
  return (
    <Section
      title="Bucket policy"
      description={
        <>
          The bucket policy, written in JSON, provides access to the objects stored in the bucket. Bucket policies don&apos;t apply to objects owned by other accounts. <LearnMore href={docs("bucket-policies.html")} />
        </>
      }
      actions={
        <SpaceBetween direction="horizontal" size="xs">
          <Button
            onClick={() => {
              setValue(text || JSON.stringify({ Version: "2012-10-17", Statement: [] }, null, 2))
              setOpen(true)
            }}
          >
            Edit
          </Button>
          <Button disabled={!text} onClick={() => setDeleting(true)}>Delete</Button>
        </SpaceBetween>
      }
    >
      <SpaceBetween size="s">
        <Button
          iconName="copy"
          disabled={!text}
          onClick={() => {
            void copyText(text)
            flash.success("Bucket policy copied.")
          }}
        >
          Copy
        </Button>
        <CodeView value={text} empty="No policy to display." />
      </SpaceBetween>
      <EditModal
        visible={open}
        size="large"
        title="Edit bucket policy"
        onDismiss={() => setOpen(false)}
        success="Successfully edited bucket policy."
        onSave={() => s3Request("s3", "PutBucketPolicy", { Bucket: bucket, Policy: JSON.stringify(JSON.parse(value)) })}
      >
        <SpaceBetween size="xs">
          <Box variant="awsui-key-label">Bucket ARN</Box>
          <Box variant="code">{arn}</Box>
        </SpaceBetween>
        <FormField label="Policy" stretch>
          <JsonField value={value} onChange={setValue} rows={18} />
        </FormField>
      </EditModal>
      <EditModal
        visible={deleting}
        title="Delete bucket policy?"
        saveLabel="Delete"
        onDismiss={() => setDeleting(false)}
        success="Successfully deleted bucket policy."
        onSave={() => s3Request("s3", "DeleteBucketPolicy", { Bucket: bucket })}
      >
        <Alert type="warning">Deleting the bucket policy removes all access it grants. This can&apos;t be undone.</Alert>
      </EditModal>
    </Section>
  )
}

function OwnershipSection({ bucket }: { bucket: string }) {
  const ownership = useS3<{ OwnershipControls?: { Rules?: { ObjectOwnership?: string }[] } }>("s3", "GetBucketOwnershipControls", { Bucket: bucket })
  const value = ownership.data?.OwnershipControls?.Rules?.[0]?.ObjectOwnership ?? "BucketOwnerEnforced"
  const labels: Record<string, string> = {
    BucketOwnerEnforced: "Bucket owner enforced",
    BucketOwnerPreferred: "Bucket owner preferred",
    ObjectWriter: "Object writer",
  }
  const [open, setOpen] = useState(false)
  const [tile, setTile] = useState("BucketOwnerEnforced")
  const [preferred, setPreferred] = useState("BucketOwnerPreferred")
  return (
    <Section
      title="Object Ownership"
      description="Control ownership of objects written to this bucket from other AWS accounts and the use of access control lists (ACLs). Object ownership determines who can specify access to objects."
      onEdit={() => {
        setTile(value === "BucketOwnerEnforced" ? "BucketOwnerEnforced" : "acls")
        if (value !== "BucketOwnerEnforced") setPreferred(value)
        setOpen(true)
      }}
      items={[
        {
          label: "Object Ownership",
          value: (
            <SpaceBetween size="xxs">
              <span>{labels[value] ?? value}</span>
              <Box variant="small" color="text-body-secondary">
                {value === "BucketOwnerEnforced"
                  ? "ACLs are disabled. All objects in this bucket are owned by this account. Access to this bucket and its objects is specified using only policies."
                  : "ACLs are enabled. Objects in this bucket can be owned by other AWS accounts."}
              </Box>
            </SpaceBetween>
          ),
        },
      ]}
    >
      <EditModal
        visible={open}
        size="large"
        title="Edit Object Ownership"
        onDismiss={() => setOpen(false)}
        success="Successfully edited Object Ownership."
        onSave={() =>
          s3Request("s3", "PutBucketOwnershipControls", {
            Bucket: bucket,
            OwnershipControls: { Rules: [{ ObjectOwnership: tile === "BucketOwnerEnforced" ? "BucketOwnerEnforced" : preferred }] },
          })
        }
      >
        <Tiles
          value={tile}
          onChange={({ detail }) => setTile(detail.value)}
          items={[
            { value: "BucketOwnerEnforced", label: "ACLs disabled (recommended)", description: "All objects in this bucket are owned by this account. Access to this bucket and its objects is specified using only policies." },
            { value: "acls", label: "ACLs enabled", description: "Objects in this bucket can be owned by other AWS accounts. Access to this bucket and its objects can be specified using ACLs." },
          ]}
        />
        {tile === "acls" && (
          <FormField label="Object Ownership">
            <RadioGroup
              value={preferred}
              onChange={({ detail }) => setPreferred(detail.value)}
              items={[
                { value: "BucketOwnerPreferred", label: "Bucket owner preferred", description: "If new objects written to this bucket specify the bucket-owner-full-control canned ACL, they are owned by the bucket owner. Otherwise, they are owned by the object writer." },
                { value: "ObjectWriter", label: "Object writer", description: "The object writer remains the object owner." },
              ]}
            />
          </FormField>
        )}
      </EditModal>
    </Section>
  )
}

function permissionsFor(grants: Grant[], match: (grant: Grant) => boolean) {
  const perms = grants.filter(match).map((grant) => grant.Permission ?? "")
  const objects = [perms.includes("FULL_CONTROL") || perms.includes("READ") ? "List" : "", perms.includes("FULL_CONTROL") || perms.includes("WRITE") ? "Write" : ""].filter(Boolean)
  const acl = [perms.includes("FULL_CONTROL") || perms.includes("READ_ACP") ? "Read" : "", perms.includes("FULL_CONTROL") || perms.includes("WRITE_ACP") ? "Write" : ""].filter(Boolean)
  return { objects: objects.join(", ") || "-", acl: acl.join(", ") || "-" }
}

function AclSection({ bucket }: { bucket: string }) {
  const acl = useS3<{ Owner?: { ID?: string }; Grants?: Grant[] }>("s3", "GetBucketAcl", { Bucket: bucket })
  const ownership = useS3<{ OwnershipControls?: { Rules?: { ObjectOwnership?: string }[] } }>("s3", "GetBucketOwnershipControls", { Bucket: bucket })
  const enforced = (ownership.data?.OwnershipControls?.Rules?.[0]?.ObjectOwnership ?? "BucketOwnerEnforced") === "BucketOwnerEnforced"
  const grants = acl.data?.Grants ?? []
  const ownerId = acl.data?.Owner?.ID
  const [open, setOpen] = useState(false)
  const [publicRead, setPublicRead] = useState(false)
  const rows = [
    {
      grantee: "Bucket owner (your AWS account)",
      detail: `Canonical ID: ${ownerId ?? "-"}`,
      ...permissionsFor(grants, (grant) => grant.Grantee?.ID === ownerId),
    },
    ...groups.map((group) => ({
      grantee: group.label,
      detail: `Group: ${group.uri}`,
      ...permissionsFor(grants, (grant) => grant.Grantee?.URI === group.uri),
    })),
  ]
  return (
    <Section
      title="Access control list (ACL)"
      description={<>Grant basic read/write permissions to other AWS accounts. <LearnMore href={docs("acl-overview.html")} /></>}
      onEdit={enforced ? undefined : () => { setPublicRead(grants.some((grant) => grant.Grantee?.URI === groups[0].uri)); setOpen(true) }}
      editDisabledReason={enforced ? "This bucket has the bucket owner enforced setting applied for Object Ownership." : undefined}
    >
      {enforced && (
        <Alert type="info" header="This bucket has the bucket owner enforced setting applied for Object Ownership">
          When bucket owner enforced is applied, use bucket policies to control access. <LearnMore href={docs("about-object-ownership.html")} />
        </Alert>
      )}
      <Table
        variant="embedded"
        items={rows}
        columnDefinitions={[
          { id: "grantee", header: "Grantee", cell: (row) => <SpaceBetween size="xxs"><b>{row.grantee}</b><Box variant="small">{row.detail}</Box></SpaceBetween> },
          { id: "objects", header: "Objects", cell: (row) => row.objects },
          { id: "acl", header: "Bucket ACL", cell: (row) => row.acl },
        ]}
      />
      <EditModal
        visible={open}
        title="Edit access control list (ACL)"
        onDismiss={() => setOpen(false)}
        success="Successfully edited bucket ACL."
        onSave={() => s3Request("s3", "PutBucketAcl", { Bucket: bucket, ACL: publicRead ? "public-read" : "private" })}
      >
        <Checkbox checked={publicRead} onChange={({ detail }) => setPublicRead(detail.checked)}>
          Everyone (public access): List objects
        </Checkbox>
      </EditModal>
    </Section>
  )
}

function CorsSection({ bucket }: { bucket: string }) {
  const cors = useS3<{ CORSRules?: unknown[] }>("s3", "GetBucketCors", { Bucket: bucket })
  const text = cors.data?.CORSRules ? JSON.stringify(cors.data.CORSRules, null, 2) : ""
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  return (
    <Section
      title="Cross-origin resource sharing (CORS)"
      description={
        <>
          The CORS configuration, written in JSON, defines a way for client web applications that are loaded in one domain to interact with resources in a different domain. <LearnMore href={docs("cors.html")} />
        </>
      }
      onEdit={() => {
        setValue(text || JSON.stringify([{ AllowedHeaders: ["*"], AllowedMethods: ["GET"], AllowedOrigins: ["*"], ExposeHeaders: [] }], null, 2))
        setOpen(true)
      }}
    >
      <SpaceBetween size="s">
        <Button iconName="copy" disabled={!text} onClick={() => { void copyText(text); flash.success("CORS configuration copied.") }}>
          Copy
        </Button>
        <CodeView value={text} empty="No configurations to display." />
      </SpaceBetween>
      <EditModal
        visible={open}
        size="large"
        title="Edit cross-origin resource sharing (CORS)"
        onDismiss={() => setOpen(false)}
        success="Successfully edited CORS configuration."
        onSave={async () => {
          const rules = value.trim() ? JSON.parse(value) : []
          if (Array.isArray(rules) && rules.length) await s3Request("s3", "PutBucketCors", { Bucket: bucket, CORSConfiguration: { CORSRules: rules } })
          else await s3Request("s3", "DeleteBucketCors", { Bucket: bucket })
        }}
      >
        <FormField label="Cross-origin resource sharing (CORS)" stretch>
          <JsonField value={value} onChange={setValue} />
        </FormField>
      </EditModal>
    </Section>
  )
}
