"use client"

import AttributeEditor from "@cloudscape-design/components/attribute-editor"
import Box from "@cloudscape-design/components/box"
import Button from "@cloudscape-design/components/button"
import Container from "@cloudscape-design/components/container"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Table from "@cloudscape-design/components/table"
import Tiles from "@cloudscape-design/components/tiles"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { DdbLayout } from "@/components/dynamodb/ddb-app"
import { callAws } from "@/lib/aws"

const attrTypes = [{ value: "S", label: "String" }, { value: "N", label: "Number" }, { value: "B", label: "Binary" }]

export function KeyField({ label, description, name, type, onName, onType, optional }: { label: string; description: string; name: string; type: string; onName: (v: string) => void; onType: (v: string) => void; optional?: boolean }) {
  return (
    <FormField label={optional ? <>{label} - <i>optional</i></> : label} description={description} constraintText="1 to 255 characters and case-sensitive." stretch>
      <SpaceBetween direction="horizontal" size="xs">
        <div style={{ minWidth: 320 }}><Input value={name} placeholder={`Enter the ${label.toLowerCase()} name`} onChange={({ detail }) => onName(detail.value)} /></div>
        <Select selectedOption={attrTypes.find((t) => t.value === type) ?? null} onChange={({ detail }) => onType(detail.selectedOption.value ?? "S")} options={attrTypes} />
      </SpaceBetween>
    </FormField>
  )
}

type Gsi = { name: string; pk: string; pkType: string; sk: string; skType: string; projection: string }

export function CreateTablePage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [pk, setPk] = useState("")
  const [pkType, setPkType] = useState("S")
  const [sk, setSk] = useState("")
  const [skType, setSkType] = useState("S")
  const [settings, setSettings] = useState("default")
  const [tableClass, setTableClass] = useState("STANDARD")
  const [mode, setMode] = useState("PAY_PER_REQUEST")
  const [rcu, setRcu] = useState("5")
  const [wcu, setWcu] = useState("5")
  const [gsis, setGsis] = useState<Gsi[]>([])
  const [encryption, setEncryption] = useState("owned")
  const [kms, setKms] = useState("")
  const [protection, setProtection] = useState("off")
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const nameError = name && !/^[A-Za-z0-9_.-]{3,255}$/.test(name) ? "Between 3 and 255 characters, containing only letters, numbers, underscores (_), hyphens (-), and periods (.)." : undefined

  async function create() {
    setSaving(true)
    setError(undefined)
    try {
      if (!name || !pk) throw new Error("Enter a table name and a partition key.")
      const attributes = new Map<string, string>([[pk, pkType]])
      if (sk) attributes.set(sk, skType)
      for (const gsi of gsis) {
        attributes.set(gsi.pk, gsi.pkType)
        if (gsi.sk) attributes.set(gsi.sk, gsi.skType)
      }
      const provisioned = settings === "custom" && mode === "PROVISIONED"
      await callAws("dynamodb", "CreateTable", {
        TableName: name,
        AttributeDefinitions: [...attributes].map(([AttributeName, AttributeType]) => ({ AttributeName, AttributeType })),
        KeySchema: [{ AttributeName: pk, KeyType: "HASH" }, ...(sk ? [{ AttributeName: sk, KeyType: "RANGE" }] : [])],
        BillingMode: provisioned ? "PROVISIONED" : "PAY_PER_REQUEST",
        ...(provisioned ? { ProvisionedThroughput: { ReadCapacityUnits: Number(rcu), WriteCapacityUnits: Number(wcu) } } : {}),
        ...(settings === "custom" ? { TableClass: tableClass, DeletionProtectionEnabled: protection === "on" } : {}),
        ...(settings === "custom" && gsis.length
          ? {
              GlobalSecondaryIndexes: gsis.map((gsi) => ({
                IndexName: gsi.name,
                KeySchema: [{ AttributeName: gsi.pk, KeyType: "HASH" }, ...(gsi.sk ? [{ AttributeName: gsi.sk, KeyType: "RANGE" }] : [])],
                Projection: { ProjectionType: gsi.projection },
                ...(provisioned ? { ProvisionedThroughput: { ReadCapacityUnits: Number(rcu), WriteCapacityUnits: Number(wcu) } } : {}),
              })),
            }
          : {}),
        ...(settings === "custom" && encryption !== "owned" ? { SSESpecification: { Enabled: true, SSEType: "KMS", ...(encryption === "cmk" ? { KMSMasterKeyId: kms } : {}) } } : {}),
        ...(tags.filter((t) => t.Key).length ? { Tags: tags.filter((t) => t.Key).map((t) => ({ Key: t.Key, Value: t.Value ?? "" })) } : {}),
      })
      flash.success(`The ${name} table was created successfully.`)
      router.push("/dynamodb/tables")
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <DdbLayout breadcrumbs={[{ text: "Tables", href: "/dynamodb/tables" }, { text: "Create table", href: "/dynamodb/tables/create" }]} contentType="form">
      <Form
        header={<Header variant="h1" info={<Link variant="info">Info</Link>}>Create table</Header>}
        errorText={error}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={() => router.push("/dynamodb/tables")}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={() => void create()}>Create table</Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          <Container header={<Header variant="h2" description="DynamoDB is a schemaless database that requires only a table name and a primary key when you create the table.">Table details</Header>}>
            <SpaceBetween size="l">
              <FormField label="Table name" description="This is used to identify your table." constraintText="Between 3 and 255 characters, containing only letters, numbers, underscores (_), hyphens (-), and periods (.)." errorText={nameError} stretch>
                <Input value={name} placeholder="Enter a table name" onChange={({ detail }) => setName(detail.value)} />
              </FormField>
              <KeyField label="Partition key" description="The partition key is part of the table's primary key. It is a hash value that is used to retrieve items from your table and allocate data across hosts for scalability and availability." name={pk} type={pkType} onName={setPk} onType={setPkType} />
              <KeyField label="Sort key" optional description="You can use a sort key as the second part of a table's primary key. The sort key allows you to sort or search among all items sharing the same partition key." name={sk} type={skType} onName={setSk} onType={setSkType} />
            </SpaceBetween>
          </Container>
          <Container header={<Header variant="h2">Table settings</Header>}>
            <Tiles
              value={settings}
              onChange={({ detail }) => setSettings(detail.value)}
              columns={2}
              items={[
                { value: "default", label: "Default settings", description: "The fastest way to create your table. You can modify most of these settings after your table has been created. To modify these settings now, choose 'Customize settings'." },
                { value: "custom", label: "Customize settings", description: "Use these advanced features to make DynamoDB work better for your needs." },
              ]}
            />
          </Container>
          {settings === "default" ? (
            <Table
              header={<Header variant="h2" description="These are the default settings for your new table. You can change some of these settings after creating the table.">Default table settings</Header>}
              items={[
                ["Table class", "DynamoDB Standard", "Yes"],
                ["Capacity mode", "On-demand", "Yes"],
                ["Maximum read capacity units (RCU)", "-", "Yes"],
                ["Maximum write capacity units (WCU)", "-", "Yes"],
                ["Local secondary indexes (LSI)", "-", "No"],
                ["Global secondary indexes (GSI)", "-", "Yes"],
                ["Encryption key management", "AWS-owned key", "Yes"],
                ["Deletion protection", "Off", "Yes"],
                ["Resource-based policy", "Not active", "Yes"],
              ]}
              columnDefinitions={[{ id: "setting", header: "Setting", cell: (row) => row[0] }, { id: "value", header: "Value", cell: (row) => row[1] }, { id: "editable", header: "Editable after creation", cell: (row) => row[2] }]}
            />
          ) : (
            <>
              <Container header={<Header variant="h2">Table class</Header>}>
                <Tiles value={tableClass} onChange={({ detail }) => setTableClass(detail.value)} columns={2} items={[{ value: "STANDARD", label: "DynamoDB Standard", description: "The default general-purpose table class. Recommended for the vast majority of tables that store frequently accessed data." }, { value: "STANDARD_INFREQUENT_ACCESS", label: "DynamoDB Standard-IA", description: "Helps you reduce your DynamoDB total costs for tables that store infrequently accessed data." }]} />
              </Container>
              <Container header={<Header variant="h2" description="Read/write capacity mode determines how you are charged for read and write throughput and how you manage capacity.">Read/write capacity settings</Header>}>
                <SpaceBetween size="m">
                  <Tiles value={mode} onChange={({ detail }) => setMode(detail.value)} columns={2} items={[{ value: "PAY_PER_REQUEST", label: "On-demand", description: "Simplify billing by paying for the actual reads and writes your application performs." }, { value: "PROVISIONED", label: "Provisioned", description: "Manage and optimize your costs by allocating read/write capacity in advance." }]} />
                  {mode === "PROVISIONED" && (
                    <SpaceBetween direction="horizontal" size="l">
                      <FormField label="Read capacity units"><Input type="number" value={rcu} onChange={({ detail }) => setRcu(detail.value)} /></FormField>
                      <FormField label="Write capacity units"><Input type="number" value={wcu} onChange={({ detail }) => setWcu(detail.value)} /></FormField>
                    </SpaceBetween>
                  )}
                </SpaceBetween>
              </Container>
              <Container header={<Header variant="h2" counter={`(${gsis.length})`} description="Global secondary indexes allow you to perform queries on attributes that are not part of your table's primary key.">Secondary indexes</Header>}>
                <AttributeEditor
                  items={gsis}
                  addButtonText="Create global index"
                  removeButtonText="Delete"
                  empty="No secondary indexes"
                  onAddButtonClick={() => setGsis([...gsis, { name: "", pk: "", pkType: "S", sk: "", skType: "S", projection: "ALL" }])}
                  onRemoveButtonClick={({ detail }) => setGsis(gsis.filter((_, i) => i !== detail.itemIndex))}
                  definition={[
                    { label: "Index name", control: (g, i) => <Input value={g.name} onChange={({ detail }) => setGsis(gsis.map((x, j) => (j === i ? { ...x, name: detail.value } : x)))} /> },
                    { label: "Partition key", control: (g, i) => <Input value={g.pk} onChange={({ detail }) => setGsis(gsis.map((x, j) => (j === i ? { ...x, pk: detail.value } : x)))} /> },
                    { label: "Type", control: (g, i) => <Select selectedOption={attrTypes.find((t) => t.value === g.pkType) ?? null} onChange={({ detail }) => setGsis(gsis.map((x, j) => (j === i ? { ...x, pkType: detail.selectedOption.value ?? "S" } : x)))} options={attrTypes} /> },
                    { label: <>Sort key - <i>optional</i></>, control: (g, i) => <Input value={g.sk} onChange={({ detail }) => setGsis(gsis.map((x, j) => (j === i ? { ...x, sk: detail.value } : x)))} /> },
                    { label: "Attribute projections", control: (g, i) => <Select selectedOption={{ value: g.projection, label: g.projection === "ALL" ? "All" : g.projection === "KEYS_ONLY" ? "Only keys" : "Include" }} onChange={({ detail }) => setGsis(gsis.map((x, j) => (j === i ? { ...x, projection: detail.selectedOption.value ?? "ALL" } : x)))} options={[{ value: "ALL", label: "All" }, { value: "KEYS_ONLY", label: "Only keys" }]} /> },
                  ]}
                />
              </Container>
              <Container header={<Header variant="h2" description="All user data stored in Amazon DynamoDB is fully encrypted at rest.">Encryption at rest</Header>}>
                <SpaceBetween size="m">
                  <Tiles value={encryption} onChange={({ detail }) => setEncryption(detail.value)} columns={3} items={[{ value: "owned", label: "Owned by Amazon DynamoDB" }, { value: "managed", label: "AWS managed key", description: "Key alias: aws/dynamodb" }, { value: "cmk", label: "Stored in your account, and owned and managed by you" }]} />
                  {encryption === "cmk" && <FormField label="KMS key ARN"><Input value={kms} onChange={({ detail }) => setKms(detail.value)} /></FormField>}
                </SpaceBetween>
              </Container>
              <Container header={<Header variant="h2" description="Protects the table from being deleted unintentionally.">Deletion protection</Header>}>
                <RadioGroup value={protection} onChange={({ detail }) => setProtection(detail.value)} items={[{ value: "on", label: "Turn on deletion protection" }, { value: "off", label: "Off" }]} />
              </Container>
            </>
          )}
          <Container header={<Header variant="h2" description="Tags are pairs of keys and optional values, that you can assign to AWS resources. You can use tags to control access to your resources or track your AWS spending.">Tags</Header>}>
            <TagEditor tags={tags} onChange={setTags} emptyText="No tags are associated with the resource." />
          </Container>
          <Box />
        </SpaceBetween>
      </Form>
    </DdbLayout>
  )
}
