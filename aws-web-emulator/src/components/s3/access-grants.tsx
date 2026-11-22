"use client"

import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import ColumnLayout from "@cloudscape-design/components/column-layout"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import { useState } from "react"
import { flash } from "@/components/console/flash"
import { EmptyState, ResourceTable } from "@/components/console/resource-table"
import { EditModal, Section } from "@/components/console/sections"
import { S3Layout } from "@/components/s3/s3-app"
import { s3Request, useS3, useS3Environment } from "@/components/s3/s3-hooks"
import { consoleDate } from "@/lib/format"

type Instance = { AccessGrantsInstanceArn?: string; AccessGrantsInstanceId?: string; CreatedAt?: string; IdentityCenterArn?: string }
type Location = { AccessGrantsLocationId?: string; LocationScope?: string; IAMRoleArn?: string; CreatedAt?: string }
type Grant = { AccessGrantId?: string; Grantee?: { GranteeType?: string; GranteeIdentifier?: string }; Permission?: string; GrantScope?: string; CreatedAt?: string; AccessGrantsLocationId?: string }

export function AccessGrantsPage() {
  const environment = useS3Environment()
  const account = environment.data?.account
  const instance = useS3<Instance>("s3control", "GetAccessGrantsInstance", { AccountId: account }, { enabled: Boolean(account) })
  const exists = Boolean(instance.data?.AccessGrantsInstanceArn)
  const locations = useS3<{ AccessGrantsLocationsList?: Location[] }>("s3control", "ListAccessGrantsLocations", { AccountId: account }, { enabled: exists })
  const grants = useS3<{ AccessGrantsList?: Grant[] }>("s3control", "ListAccessGrants", { AccountId: account }, { enabled: exists })
  const [modal, setModal] = useState<string>()
  const [locationForm, setLocationForm] = useState({ scope: "s3://", role: "" })
  const [grantForm, setGrantForm] = useState({ location: "", subprefix: "", type: "IAM", identifier: "", permission: "READ" })
  const [selectedLocations, setSelectedLocations] = useState<Location[]>([])
  const [selectedGrants, setSelectedGrants] = useState<Grant[]>([])
  return (
    <S3Layout breadcrumbs={[{ text: "Access Grants", href: "/s3/access-grants" }]}>
      <ContentLayout
        header={
          <Header variant="h1" info={<Link variant="info">Info</Link>} description="Control access to data sets within S3 by using identities from your corporate directory or AWS Identity and Access Management (IAM). You can create only one Access Grants instance per AWS Region per account.">
            S3 Access Grants
          </Header>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2" description="S3 Access Grants provides scalable access control to data sets in your buckets. With S3 Access Grants, you can use identities from your corporate directory or from AWS Identity and Access Management (IAM) to control access.">Getting started with Access Grants</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <div><Box variant="h3">Step 1 - Create S3 Access Grants instance</Box><Box color="text-body-secondary">When you create your S3 Access Grants instance, you can use identities from your corporate directory or you can use IAM users and roles.</Box></div>
              <div><Box variant="h3">Step 2 - Register S3 buckets or prefixes as locations</Box><Box color="text-body-secondary">When registering a location, you specify the bucket or prefix URI of the data set that you want to grant access to and the IAM role that S3 Access Grants assumes.</Box></div>
              <div><Box variant="h3">Step 3 - Create grants</Box><Box color="text-body-secondary">When you define individual access grants, you specify the identity that can access the data, the access level (Read, Write, or Read/Write), and the location.</Box></div>
            </ColumnLayout>
          </Container>
          <Section
            title="Instance in this account"
            description="To share this instance in your account with external accounts by using the AWS Resource Access Manager console, choose Share instance."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled disabledReason="AWS RAM is not available in the local emulator.">Share instance</Button>
                {exists ? (
                  <Button
                    onClick={async () => {
                      await s3Request("s3control", "DeleteAccessGrantsInstance", { AccountId: account }).then(
                        () => { flash.success("Successfully deleted S3 Access Grants instance."); void instance.refetch() },
                        (error) => flash.error(error instanceof Error ? error.message : String(error)),
                      )
                    }}
                  >
                    Delete instance
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onClick={async () => {
                      await s3Request("s3control", "CreateAccessGrantsInstance", { AccountId: account })
                      await instance.refetch()
                      flash.success("Successfully created S3 Access Grants instance.")
                    }}
                  >
                    Create S3 Access Grants instance
                  </Button>
                )}
              </SpaceBetween>
            }
            columns={4}
            items={[
              { label: "Amazon Resource Name (ARN)", value: instance.data?.AccessGrantsInstanceArn ?? "-" },
              { label: "Creation date", value: consoleDate(instance.data?.CreatedAt) },
              { label: "Account ID", value: exists ? account : "-" },
              { label: "IAM Identity Center instance ARN", value: instance.data?.IdentityCenterArn ?? "-" },
            ]}
          />
          {exists && (
            <>
              <ResourceTable<Location>
                title="Locations"
                variant="container"
                items={locations.data?.AccessGrantsLocationsList ?? []}
                loading={locations.isPending}
                selectionType="single"
                selectedItems={selectedLocations}
                onSelectionChange={setSelectedLocations}
                trackBy="AccessGrantsLocationId"
                columns={[
                  { id: "id", header: "Location ID", value: (item) => item.AccessGrantsLocationId, cell: (item) => item.AccessGrantsLocationId },
                  { id: "scope", header: "Location scope", value: (item) => item.LocationScope, cell: (item) => item.LocationScope },
                  { id: "role", header: "IAM role", value: (item) => item.IAMRoleArn, cell: (item) => item.IAMRoleArn },
                  { id: "created", header: "Creation date", value: (item) => item.CreatedAt, cell: (item) => consoleDate(item.CreatedAt) },
                ]}
                empty={<EmptyState title="No locations" action={<Button onClick={() => setModal("location")}>Register location</Button>} />}
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button
                      disabled={!selectedLocations[0]}
                      onClick={async () => {
                        await s3Request("s3control", "DeleteAccessGrantsLocation", { AccountId: account, AccessGrantsLocationId: selectedLocations[0].AccessGrantsLocationId })
                        setSelectedLocations([])
                        await locations.refetch()
                        flash.success("Successfully deleted location.")
                      }}
                    >
                      Delete
                    </Button>
                    <Button onClick={() => setModal("location")}>Register location</Button>
                  </SpaceBetween>
                }
              />
              <ResourceTable<Grant>
                title="Grants"
                variant="container"
                items={grants.data?.AccessGrantsList ?? []}
                loading={grants.isPending}
                selectionType="single"
                selectedItems={selectedGrants}
                onSelectionChange={setSelectedGrants}
                trackBy="AccessGrantId"
                columns={[
                  { id: "id", header: "Grant ID", value: (item) => item.AccessGrantId, cell: (item) => item.AccessGrantId },
                  { id: "scope", header: "Grant scope", value: (item) => item.GrantScope, cell: (item) => item.GrantScope },
                  { id: "grantee", header: "Grantee", value: (item) => item.Grantee?.GranteeIdentifier, cell: (item) => `${item.Grantee?.GranteeType}: ${item.Grantee?.GranteeIdentifier}` },
                  { id: "permission", header: "Permission", value: (item) => item.Permission, cell: (item) => item.Permission },
                  { id: "created", header: "Creation date", value: (item) => item.CreatedAt, cell: (item) => consoleDate(item.CreatedAt) },
                ]}
                empty={<EmptyState title="No grants" action={<Button onClick={() => setModal("grant")}>Create grant</Button>} />}
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button
                      disabled={!selectedGrants[0]}
                      onClick={async () => {
                        await s3Request("s3control", "DeleteAccessGrant", { AccountId: account, AccessGrantId: selectedGrants[0].AccessGrantId })
                        setSelectedGrants([])
                        await grants.refetch()
                        flash.success("Successfully deleted grant.")
                      }}
                    >
                      Delete
                    </Button>
                    <Button onClick={() => setModal("grant")}>Create grant</Button>
                  </SpaceBetween>
                }
              />
            </>
          )}
        </SpaceBetween>
      </ContentLayout>
      <EditModal
        visible={modal === "location"}
        title="Register location"
        saveLabel="Register location"
        onDismiss={() => setModal(undefined)}
        success="Successfully registered location."
        onSave={async () => {
          await s3Request("s3control", "CreateAccessGrantsLocation", { AccountId: account, LocationScope: locationForm.scope, IAMRoleArn: locationForm.role })
          await locations.refetch()
        }}
      >
        <FormField label="Location scope" constraintText="s3:// registers the default location for all buckets."><Input value={locationForm.scope} onChange={({ detail }) => setLocationForm({ ...locationForm, scope: detail.value })} /></FormField>
        <FormField label="IAM role"><Input value={locationForm.role} placeholder="arn:aws:iam::account-id:role/role-name" onChange={({ detail }) => setLocationForm({ ...locationForm, role: detail.value })} /></FormField>
      </EditModal>
      <EditModal
        visible={modal === "grant"}
        title="Create grant"
        saveLabel="Create grant"
        onDismiss={() => setModal(undefined)}
        success="Successfully created grant."
        onSave={async () => {
          await s3Request("s3control", "CreateAccessGrant", {
            AccountId: account,
            AccessGrantsLocationId: grantForm.location,
            ...(grantForm.subprefix ? { AccessGrantsLocationConfiguration: { S3SubPrefix: grantForm.subprefix } } : {}),
            Grantee: { GranteeType: grantForm.type, GranteeIdentifier: grantForm.identifier },
            Permission: grantForm.permission,
          })
          await grants.refetch()
        }}
      >
        <FormField label="Location">
          <Select
            selectedOption={grantForm.location ? { value: grantForm.location, label: grantForm.location } : null}
            placeholder="Choose a location"
            onChange={({ detail }) => setGrantForm({ ...grantForm, location: detail.selectedOption.value ?? "" })}
            options={(locations.data?.AccessGrantsLocationsList ?? []).map((item) => ({ value: item.AccessGrantsLocationId, label: item.AccessGrantsLocationId, description: item.LocationScope }))}
          />
        </FormField>
        <FormField label={<>Subprefix - <i>optional</i></>}><Input value={grantForm.subprefix} onChange={({ detail }) => setGrantForm({ ...grantForm, subprefix: detail.value })} /></FormField>
        <FormField label="Grantee type">
          <RadioGroup value={grantForm.type} onChange={({ detail }) => setGrantForm({ ...grantForm, type: detail.value })} items={[{ value: "IAM", label: "IAM principal" }, { value: "DIRECTORY_USER", label: "Directory user" }, { value: "DIRECTORY_GROUP", label: "Directory group" }]} />
        </FormField>
        <FormField label="Grantee identifier"><Input value={grantForm.identifier} onChange={({ detail }) => setGrantForm({ ...grantForm, identifier: detail.value })} /></FormField>
        <FormField label="Permission">
          <RadioGroup value={grantForm.permission} onChange={({ detail }) => setGrantForm({ ...grantForm, permission: detail.value })} items={[{ value: "READ", label: "Read" }, { value: "WRITE", label: "Write" }, { value: "READWRITE", label: "Read and write" }]} />
        </FormField>
      </EditModal>
    </S3Layout>
  )
}
