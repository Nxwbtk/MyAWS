"use client"

import Alert from "@cloudscape-design/components/alert"
import FormField from "@cloudscape-design/components/form-field"
import Input from "@cloudscape-design/components/input"
import RadioGroup from "@cloudscape-design/components/radio-group"
import { useState } from "react"
import { EditModal } from "@/components/console/sections"
import { TagEditor, type Tag } from "@/components/console/tag-editor"
import { callAws } from "@/lib/aws"

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-pem-file" }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function KeyPairFields({
  form,
  onChange,
}: {
  form: { name: string; type: string; format: string; tags: Tag[] }
  onChange: (form: { name: string; type: string; format: string; tags: Tag[] }) => void
}) {
  return (
    <>
      <FormField label="Key pair name" description="Key pairs allow you to connect to your instance securely." constraintText="The name can include up to 255 ASCII characters. It can't include leading or trailing spaces.">
        <Input value={form.name} onChange={({ detail }) => onChange({ ...form, name: detail.value })} />
      </FormField>
      <FormField label="Key pair type">
        <RadioGroup value={form.type} onChange={({ detail }) => onChange({ ...form, type: detail.value })} items={[{ value: "rsa", label: "RSA", description: "RSA encrypted private and public key pair" }, { value: "ed25519", label: "ED25519", description: "ED25519 encrypted private and public key pair" }]} />
      </FormField>
      <FormField label="Private key file format">
        <RadioGroup value={form.format} onChange={({ detail }) => onChange({ ...form, format: detail.value })} items={[{ value: "pem", label: ".pem", description: "For use with OpenSSH" }, { value: "ppk", label: ".ppk", description: "For use with PuTTY" }]} />
      </FormField>
      <FormField label={<>Tags - <i>optional</i></>} stretch>
        <TagEditor tags={form.tags} onChange={(tags) => onChange({ ...form, tags })} />
      </FormField>
    </>
  )
}

export async function createKeyPair(form: { name: string; type: string; format: string; tags: Tag[] }) {
  const result = await callAws<{ KeyMaterial?: string; KeyName?: string }>("ec2", "CreateKeyPair", {
    KeyName: form.name,
    KeyType: form.type,
    KeyFormat: form.format,
    ...(form.tags.filter((tag) => tag.Key).length ? { TagSpecifications: [{ ResourceType: "key-pair", Tags: form.tags.filter((tag) => tag.Key).map((tag) => ({ Key: tag.Key, Value: tag.Value ?? "" })) }] } : {}),
  })
  if (result.KeyMaterial) downloadText(`${form.name}.${form.format}`, result.KeyMaterial)
  return result.KeyName ?? form.name
}

export function CreateKeyPairModal({ close, onCreated }: { close: () => void; onCreated: (name: string) => void }) {
  const [form, setForm] = useState({ name: "", type: "rsa", format: "pem", tags: [] as Tag[] })
  return (
    <EditModal visible title="Create key pair" size="medium" saveLabel="Create key pair" onDismiss={close} success={`Successfully created key pair ${form.name}.`} onSave={async () => onCreated(await createKeyPair(form))}>
      <KeyPairFields form={form} onChange={setForm} />
      <Alert type="info">When prompted, store the private key in a secure and accessible location on your computer. You will need it later to connect to your instance.</Alert>
    </EditModal>
  )
}
