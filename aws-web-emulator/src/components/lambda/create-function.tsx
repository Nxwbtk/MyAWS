"use client"

import Alert from "@cloudscape-design/components/alert"
import Button from "@cloudscape-design/components/button"
import Checkbox from "@cloudscape-design/components/checkbox"
import Container from "@cloudscape-design/components/container"
import ContentLayout from "@cloudscape-design/components/content-layout"
import ExpandableSection from "@cloudscape-design/components/expandable-section"
import Form from "@cloudscape-design/components/form"
import FormField from "@cloudscape-design/components/form-field"
import Header from "@cloudscape-design/components/header"
import Input from "@cloudscape-design/components/input"
import Link from "@cloudscape-design/components/link"
import Multiselect from "@cloudscape-design/components/multiselect"
import RadioGroup from "@cloudscape-design/components/radio-group"
import Select from "@cloudscape-design/components/select"
import SpaceBetween from "@cloudscape-design/components/space-between"
import Tiles from "@cloudscape-design/components/tiles"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { errorMessage, flash } from "@/components/console/flash"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { useFollow } from "@/components/shell/page-layout"
import { LambdaLayout } from "@/components/lambda/lambda-app"
import { runtimes, starterCode, zipFiles } from "@/components/lambda/shared"
import { callAws, useAws } from "@/lib/aws"

const basicPolicy = (name: string) => ({
  Version: "2012-10-17",
  Statement: [
    { Effect: "Allow", Action: "logs:CreateLogGroup", Resource: "arn:aws:logs:ap-southeast-7:*:*" },
    { Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents"], Resource: [`arn:aws:logs:ap-southeast-7:*:log-group:/aws/lambda/${name}:*`] },
  ],
})

export function CreateFunctionPage() {
  const router = useRouter()
  const follow = useFollow()
  const roles = useAws<{ Roles?: { RoleName?: string; Arn?: string }[] }>("iam", "ListRoles", { MaxItems: 1000 })
  const vpcs = useAws<{ Vpcs?: { VpcId?: string }[] }>("ec2", "DescribeVpcs", {})
  const [mode, setMode] = useState("scratch")
  const [name, setName] = useState("")
  const [runtime, setRuntime] = useState("nodejs24.x")
  const [arm, setArm] = useState(false)
  const [customRole, setCustomRole] = useState(false)
  const [roleMode, setRoleMode] = useState("existing")
  const [role, setRole] = useState("")
  const [vpc, setVpc] = useState("")
  const [subnets, setSubnets] = useState<string[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [useVpc, setUseVpc] = useState(false)
  const [image, setImage] = useState("")
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const subnetList = useAws<{ Subnets?: { SubnetId?: string; AvailabilityZone?: string }[] }>("ec2", "DescribeSubnets", { Filters: [{ Name: "vpc-id", Values: [vpc] }] }, { enabled: Boolean(vpc) })
  const sgList = useAws<{ SecurityGroups?: { GroupId?: string; GroupName?: string }[] }>("ec2", "DescribeSecurityGroups", { Filters: [{ Name: "vpc-id", Values: [vpc] }] }, { enabled: Boolean(vpc) })

  const create = async () => {
    setSaving(true)
    setError(undefined)
    try {
      let roleArn = role
      if (!customRole || roleMode === "new") {
        const roleName = `${name}-role-${Math.random().toString(36).slice(2, 10)}`
        const created = await callAws<{ Role?: { Arn?: string } }>("iam", "CreateRole", { RoleName: roleName, Path: "/service-role/", AssumeRolePolicyDocument: JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }] }) })
        const policyName = `AWSLambdaBasicExecutionRole-${crypto.randomUUID()}`
        const policy = await callAws<{ Policy?: { Arn?: string } }>("iam", "CreatePolicy", { PolicyName: policyName, Path: "/service-role/", PolicyDocument: JSON.stringify(basicPolicy(name)) })
        await callAws("iam", "AttachRolePolicy", { RoleName: roleName, PolicyArn: policy.Policy?.Arn })
        roleArn = created.Role?.Arn ?? ""
      }
      const valid = tags.filter((t) => t.Key)
      const common = {
        FunctionName: name,
        Role: roleArn,
        Architectures: [arm ? "arm64" : "x86_64"],
        ...(useVpc && vpc ? { VpcConfig: { SubnetIds: subnets, SecurityGroupIds: groups } } : {}),
        ...(valid.length ? { Tags: Object.fromEntries(valid.map((t) => [t.Key, t.Value ?? ""])) } : {}),
      }
      if (mode === "image") await callAws("lambda", "CreateFunction", { ...common, PackageType: "Image", Code: { ImageUri: image } })
      else {
        const starter = starterCode(runtime)
        await callAws("lambda", "CreateFunction", { ...common, Runtime: runtime, Handler: starter.handler, Code: { ZipFile: zipFiles({ [starter.file]: starter.code }) } })
      }
      flash.success(`Successfully created the function ${name}. You can now change its code and configuration. To invoke your function with a test event, choose "Test".`)
      router.push(`/lambda/functions/${encodeURIComponent(name)}`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <LambdaLayout breadcrumbs={[{ text: "Functions", href: "/lambda/functions" }, { text: "Create function", href: "#" }]} contentType="form">
      <ContentLayout header={<Header variant="h1" info={<Link variant="info">Info</Link>} description="Choose one of the following options to create your function.">Create function</Header>}>
        <Form
          errorText={error}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" href="/lambda/functions" onFollow={follow}>Cancel</Button>
              <Button variant="primary" loading={saving} disabled={!name || (customRole && roleMode === "existing" && !role) || (mode === "image" && !image)} onClick={() => void create()}>Create function</Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Tiles
              value={mode}
              onChange={({ detail }) => setMode(detail.value)}
              columns={3}
              items={[
                { value: "scratch", label: "Author from scratch", description: "Start with a simple Hello World example." },
                { value: "blueprint", label: "Use a blueprint", description: "Build a Lambda application from sample code and configuration presets for common use cases.", disabled: true },
                { value: "image", label: "Container image", description: "Select a container image to deploy for your function." },
              ]}
            />
            <Container header={<Header variant="h2">Basic information</Header>}>
              <SpaceBetween size="l">
                <FormField label="Function name" description="Enter a name that describes the purpose of your function." constraintText="Function name must be 1 to 64 characters, must be unique to the Region, and can't include spaces. Valid characters are a-z, A-Z, 0-9, hyphens (-), and underscores (_).">
                  <Input value={name} placeholder="myFunctionName" onChange={({ detail }) => setName(detail.value)} />
                </FormField>
                {mode === "image" ? (
                  <FormField label="Container image URI" description="Requires a valid Amazon ECR image URI."><Input value={image} placeholder="123456789012.dkr.ecr.ap-southeast-7.amazonaws.com/repo:tag" onChange={({ detail }) => setImage(detail.value)} /></FormField>
                ) : (
                  <FormField label="Runtime" info={<Link variant="info">Info</Link>} description="Choose the language to use to write your function. Note that the console code editor supports only Node.js, Python, and Ruby.">
                    <Select selectedOption={runtimes.find((r) => r.value === runtime) ?? null} onChange={({ detail }) => setRuntime(detail.selectedOption.value ?? "nodejs24.x")} options={runtimes} />
                  </FormField>
                )}
                <FormField label="Permissions" description="By default, Lambda will create an execution role with permissions to upload logs to Amazon CloudWatch Logs. To use a different role, choose Custom execution role under Additional settings." />
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h2" description="Customize your function architecture, execution role, VPC, and tags.">Additional settings</Header>}>
              <SpaceBetween size="l">
                <Checkbox checked={arm} onChange={({ detail }) => setArm(detail.checked)} description="Use ARM64 instead of x86_64 (default).">ARM64 architecture</Checkbox>
                <Checkbox checked={customRole} onChange={({ detail }) => setCustomRole(detail.checked)} description="Use custom execution role instead of new role with basic Lambda permissions (default).">Custom execution role</Checkbox>
                {customRole && (
                  <SpaceBetween size="m">
                    <RadioGroup value={roleMode} onChange={({ detail }) => setRoleMode(detail.value)} items={[{ value: "new", label: "Create a new role with basic Lambda permissions" }, { value: "existing", label: "Use an existing role" }]} />
                    {roleMode === "existing" && (
                      <FormField label="Existing role" description="Choose an existing role that you've created to be used with this Lambda function.">
                        <Select selectedOption={role ? { value: role, label: role.split("/").pop() } : null} placeholder="Choose a role" filteringType="auto" empty="No roles" onChange={({ detail }) => setRole(detail.selectedOption.value ?? "")} options={(roles.data?.Roles ?? []).map((r) => ({ value: r.Arn ?? "", label: r.RoleName }))} />
                      </FormField>
                    )}
                  </SpaceBetween>
                )}
                <Checkbox checked={useVpc} onChange={({ detail }) => setUseVpc(detail.checked)} description="Connect to a VPC to securely access private resources.">VPC</Checkbox>
                {useVpc && (
                  <SpaceBetween size="m">
                    <FormField label="VPC"><Select selectedOption={vpc ? { value: vpc, label: vpc } : null} placeholder="Choose a VPC" onChange={({ detail }) => { setVpc(detail.selectedOption.value ?? ""); setSubnets([]); setGroups([]) }} options={(vpcs.data?.Vpcs ?? []).map((v) => ({ value: v.VpcId ?? "", label: v.VpcId }))} /></FormField>
                    <FormField label="Subnets"><Multiselect selectedOptions={subnets.map((s) => ({ value: s, label: s }))} placeholder="Choose subnets" onChange={({ detail }) => setSubnets(detail.selectedOptions.map((o) => o.value ?? ""))} options={(subnetList.data?.Subnets ?? []).map((s) => ({ value: s.SubnetId ?? "", label: s.SubnetId, description: s.AvailabilityZone }))} /></FormField>
                    <FormField label="Security groups"><Multiselect selectedOptions={groups.map((g) => ({ value: g, label: g }))} placeholder="Choose security groups" onChange={({ detail }) => setGroups(detail.selectedOptions.map((o) => o.value ?? ""))} options={(sgList.data?.SecurityGroups ?? []).map((g) => ({ value: g.GroupId ?? "", label: g.GroupId, description: g.GroupName }))} /></FormField>
                  </SpaceBetween>
                )}
                <ExpandableSection headerText="Tags - optional">
                  <TagEditor tags={tags} onChange={setTags} />
                </ExpandableSection>
                <Alert type="info">Durable execution, EC2 capacity providers, tenant isolation, and code signing are not available in the local emulator.</Alert>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Form>
      </ContentLayout>
    </LambdaLayout>
  )
}
