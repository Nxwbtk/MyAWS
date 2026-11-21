"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { z } from "zod"
import { s3SelectClass } from "@/components/s3-operation-form"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { bucketSchema } from "@/lib/contracts"
import { s3Read } from "@/lib/s3-client"

const createActions = {
  s3tables: { action: "CreateTableBucket", name: "table bucket" },
  s3vectors: { action: "CreateVectorBucket", name: "vector bucket" },
  s3files: { action: "CreateFileSystem", name: "file system" },
} as const

type Model = keyof typeof createActions
const formSchema = z
  .object({
    name: z.string().trim(),
    source: z.string().trim(),
    role: z.string().trim(),
    kmsKey: z.string().trim(),
    storageClass: z.enum(["", "STANDARD", "INTELLIGENT_TIERING"]),
    encryption: z.enum(["", "AES256", "aws:kms"]),
    acceptWarning: z.boolean(),
    tags: z
      .array(
        z.object({
          key: z.string().trim().min(1).max(128),
          value: z.string().max(256),
        }),
      )
      .max(50),
  })
  .refine(({ tags }) => new Set(tags.map(({ key }) => key)).size === tags.length, {
    path: ["tags"],
    message: "Use a unique key for each tag.",
  })

function storageInput(model: Model, values: z.infer<typeof formSchema>) {
  if (model === "s3files") {
    const source = values.source.match(/^s3:\/\/([^/]+)(?:\/(.*))?$/)
    if (!source || !bucketSchema.shape.name.safeParse(source[1]).success)
      throw new Error("Enter the bucket or prefix as s3://bucket-name/optional-prefix.")
    if (!/^arn:[^:]+:iam::\d{12}:role\/.+/.test(values.role))
      throw new Error("Enter an IAM role ARN for the local file system.")
    return {
      bucket: `arn:aws:s3:::${source[1]}`,
      prefix: source[2] || undefined,
      roleArn: values.role,
      kmsKeyId: values.kmsKey || undefined,
      acceptBucketWarning: values.acceptWarning,
      tags: values.tags.length ? values.tags : undefined,
    }
  }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(values.name))
    throw new Error(
      "Use 3–63 lowercase letters, digits, or hyphens. Start and end with a letter or digit.",
    )
  if (
    values.encryption === "aws:kms" &&
    !/^arn:[^:]+:kms:[^:]+:\d{12}:key\/.+/.test(values.kmsKey)
  )
    throw new Error("Choose a KMS key ARN for SSE-KMS.")
  const tags = values.tags.length
    ? Object.fromEntries(values.tags.map(({ key, value }) => [key, value]))
    : undefined
  const kmsKeyArn = values.encryption === "aws:kms" ? values.kmsKey : undefined
  if (model === "s3tables")
    return {
      name: values.name,
      tags,
      encryptionConfiguration: values.encryption
        ? { sseAlgorithm: values.encryption, kmsKeyArn }
        : undefined,
      storageClassConfiguration: values.storageClass
        ? { storageClass: values.storageClass }
        : undefined,
    }
  return {
    vectorBucketName: values.name,
    tags,
    encryptionConfiguration: values.encryption
      ? { sseType: values.encryption, kmsKeyArn }
      : undefined,
  }
}

export function S3CreateStorage({ model, close }: { model: Model; close: () => void }) {
  const spec = createActions[model]
  const fileSystem = model === "s3files"
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      source: "",
      role: "",
      kmsKey: "",
      storageClass: "",
      encryption: "",
      acceptWarning: false,
      tags: [],
    },
  })
  const encryption = useWatch({ control: form.control, name: "encryption" })
  const tags = useFieldArray({ control: form.control, name: "tags" })
  const cache = useQueryClient()
  const save = useMutation({
    mutationFn: (values: z.infer<typeof formSchema>) =>
      s3Read(model, spec.action, storageInput(model, values)),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["emulator", "s3"] })
      close()
    },
  })

  return (
    <Card className="rounded-xl border ring-0">
      <CardHeader>
        <h2 className="text-xl font-semibold">Create {spec.name}</h2>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <fieldset disabled={save.isPending} className="grid gap-3">
            <legend className="mb-2 font-medium">General configuration</legend>
            {fileSystem ? (
              <>
                <Label htmlFor="storage-source">General purpose bucket or prefix</Label>
                <Input
                  id="storage-source"
                  placeholder="s3://bucket-name/"
                  {...form.register("source")}
                />
                <Label htmlFor="storage-role">IAM role ARN</Label>
                <Input id="storage-role" {...form.register("role")} />
                <Label>
                  <input type="checkbox" {...form.register("acceptWarning")} />{" "}
                  Acknowledge the bucket connection requirements
                </Label>
              </>
            ) : (
              <>
                <Label htmlFor="storage-name">
                  {model === "s3tables" ? "Table bucket name" : "Vector bucket name"}
                </Label>
                <Input id="storage-name" maxLength={63} {...form.register("name")} />
              </>
            )}
            {model === "s3tables" && (
              <>
                <Label htmlFor="storage-class">Default storage class</Label>
                <select
                  id="storage-class"
                  className={s3SelectClass}
                  {...form.register("storageClass")}
                >
                  <option value="">Don&apos;t specify</option>
                  <option value="STANDARD">Standard</option>
                  <option value="INTELLIGENT_TIERING">Intelligent-Tiering</option>
                </select>
              </>
            )}
            {!fileSystem && (
              <>
                <Label htmlFor="storage-encryption">Default encryption</Label>
                <select
                  id="storage-encryption"
                  className={s3SelectClass}
                  {...form.register("encryption")}
                >
                  <option value="">Don&apos;t specify</option>
                  <option value="AES256">SSE-S3</option>
                  <option value="aws:kms">SSE-KMS</option>
                </select>
              </>
            )}
            {(fileSystem || encryption === "aws:kms") && (
              <>
                <Label htmlFor="storage-kms">
                  {fileSystem ? "KMS key ID (optional)" : "KMS key ARN"}
                </Label>
                <Input id="storage-kms" {...form.register("kmsKey")} />
              </>
            )}
          </fieldset>
          <fieldset disabled={save.isPending} className="grid gap-3">
            <legend className="mb-2 font-medium">Tags (optional)</legend>
            {tags.fields.map(({ id }, index) => (
              <div
                key={id}
                className="grid items-start gap-2 sm:grid-cols-[1fr_1fr_auto]"
              >
                <div>
                  <Input
                    aria-label={`Tag ${index + 1} key`}
                    placeholder="Key"
                    {...form.register(`tags.${index}.key`)}
                  />
                  {form.formState.errors.tags?.[index]?.key && (
                    <p className="text-sm text-destructive">Enter a tag key.</p>
                  )}
                </div>
                <Input
                  aria-label={`Tag ${index + 1} value`}
                  placeholder="Value"
                  {...form.register(`tags.${index}.value`)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => tags.remove(index)}
                >
                  Remove
                </Button>
              </div>
            ))}
            {form.formState.errors.tags?.message && (
              <p role="alert" className="text-destructive">
                {form.formState.errors.tags.message}
              </p>
            )}
            <Button
              className="w-fit"
              type="button"
              variant="outline"
              disabled={tags.fields.length >= 50}
              onClick={() => tags.append({ key: "", value: "" })}
            >
              Add tag
            </Button>
          </fieldset>
          {save.error && (
            <p role="alert" className="text-destructive">
              {save.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button disabled={save.isPending}>
              {save.isPending ? "Creating…" : `Create ${spec.name}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
