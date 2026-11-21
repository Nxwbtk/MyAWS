"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { FileUp, LoaderCircle, Plus, Send } from "lucide-react"
import { useState, type ReactNode } from "react"
import {
  Controller,
  useForm,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { writeEmulator } from "@/lib/console-client"
import {
  bucketSchema,
  itemSchema,
  messageSchema,
  queueSchema,
  services,
  tableSchema,
  uploadSchema,
  vpcSchema,
  type Service,
} from "@/lib/contracts"

type Saved = (id?: string) => void

function ActionDialog({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string
  description: string
  icon: typeof Plus
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Icon aria-hidden className="size-4" />
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open && children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  name,
  error,
  children,
}: {
  label: string
  name: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error && (
        <p
          id={`${name}-error`}
          className="text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}

function feedback(name: string, error?: string) {
  return {
    id: name,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${name}-error` : undefined,
  }
}

function submit<T extends FieldValues>(
  form: UseFormReturn<T>,
  encode: (values: T) => Record<string, unknown> | FormData,
  done: Saved,
) {
  return form.handleSubmit(async (values) => {
    form.clearErrors("root")
    try {
      const result = await writeEmulator(encode(values))
      done(result.id)
    } catch (error) {
      form.setError("root", {
        message:
          error instanceof Error ? error.message : "The operation failed.",
      })
    }
  })
}

function Actions({
  title,
  busy,
  error,
}: {
  title: string
  busy: boolean
  error?: string
}) {
  return (
    <>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/35 bg-destructive-muted px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={busy}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={busy}>
          {busy && (
            <LoaderCircle
              aria-hidden
              className="size-4 motion-safe:animate-spin"
            />
          )}
          {title}
        </Button>
      </DialogFooter>
    </>
  )
}

const createSchema = z.discriminatedUnion("kind", [
  bucketSchema.extend({ kind: z.literal("s3") }),
  tableSchema.safeExtend({ kind: z.literal("dynamodb") }),
  queueSchema.extend({ kind: z.literal("sqs") }),
])

export function CreateResource({
  service,
  onSaved,
}: {
  service: Service
  onSaved: Saved
}) {
  const title = `Create ${services[service].resource}`
  const description =
    service === "dynamodb"
      ? "Define a partition key and an optional sort key. Both use the string type."
      : service === "sqs"
        ? "Add .fifo to the name to create a FIFO queue."
        : "Choose a name for a bucket in the local emulator."
  return (
    <ActionDialog title={title} description={description} icon={Plus}>
      {(close) => (
        <CreateForm
          service={service}
          title={title}
          done={(id) => {
            onSaved(id)
            close()
          }}
        />
      )}
    </ActionDialog>
  )
}

export function CreateVpc({ onSaved }: { onSaved: Saved }) {
  return (
    <ActionDialog
      title="Create VPC"
      description="Create a VPC in the local emulator with an IPv4 CIDR block."
      icon={Plus}
    >
      {(close) => (
        <VpcForm
          done={(id) => {
            onSaved(id)
            close()
          }}
        />
      )}
    </ActionDialog>
  )
}

function VpcForm({ done }: { done: Saved }) {
  const form = useForm<z.infer<typeof vpcSchema>>({
    resolver: zodResolver(vpcSchema),
    defaultValues: { name: "", cidr: "" },
  })
  const { errors, isSubmitting } = form.formState
  return (
    <form
      onSubmit={submit(form, (values) => ({ kind: "vpc", ...values }), done)}
      className="grid gap-5"
      noValidate
    >
      <Field
        label="Name tag (optional)"
        name="vpc-name"
        error={errors.name?.message}
      >
        <Input
          {...feedback("vpc-name", errors.name?.message)}
          {...form.register("name")}
          placeholder="my-vpc"
        />
      </Field>
      <Field
        label="IPv4 CIDR block"
        name="vpc-cidr"
        error={errors.cidr?.message}
      >
        <Input
          {...feedback("vpc-cidr", errors.cidr?.message)}
          {...form.register("cidr")}
          placeholder="10.0.0.0/16"
          spellCheck={false}
        />
      </Field>
      <Actions
        title="Create VPC"
        busy={isSubmitting}
        error={errors.root?.message}
      />
    </form>
  )
}

function CreateForm({
  service,
  title,
  done,
}: {
  service: Service
  title: string
  done: Saved
}) {
  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues:
      service === "dynamodb"
        ? { kind: service, name: "", partitionKey: "id", sortKey: "" }
        : { kind: service, name: "" },
  })
  const { errors, isSubmitting } = form.formState
  const nameError = errors.name?.message
  const partitionError = form.getFieldState("partitionKey").error?.message
  const sortError = form.getFieldState("sortKey").error?.message
  return (
    <form
      onSubmit={submit(form, (values) => values, done)}
      className="grid gap-5"
      noValidate
    >
      <Field label="Name" name="resource-name" error={nameError}>
        <Input
          {...feedback("resource-name", nameError)}
          {...form.register("name")}
          autoComplete="off"
          placeholder={`my-example-${services[service].resource}`}
        />
      </Field>
      {service === "dynamodb" && (
        <>
          <Field
            label="Partition key"
            name="partition-key"
            error={partitionError}
          >
            <Input
              {...feedback("partition-key", partitionError)}
              {...form.register("partitionKey")}
            />
          </Field>
          <Field label="Sort key (optional)" name="sort-key" error={sortError}>
            <Input
              {...feedback("sort-key", sortError)}
              {...form.register("sortKey")}
            />
          </Field>
        </>
      )}
      <Actions title={title} busy={isSubmitting} error={errors.root?.message} />
    </form>
  )
}

export function UploadObject({
  resource,
  onSaved,
}: {
  resource: string
  onSaved: Saved
}) {
  return (
    <ActionDialog
      title="Upload object"
      description="Choose a file up to 16 MiB. Uploading to an existing key replaces that object."
      icon={FileUp}
    >
      {(close) => (
        <UploadForm
          resource={resource}
          done={(id) => {
            onSaved(id)
            close()
          }}
        />
      )}
    </ActionDialog>
  )
}

function UploadForm({ resource, done }: { resource: string; done: Saved }) {
  const form = useForm<z.infer<typeof uploadSchema>>({
    resolver: zodResolver(uploadSchema),
    defaultValues: { key: "" },
  })
  const { errors, isSubmitting } = form.formState
  return (
    <form
      onSubmit={submit(
        form,
        ({ key, file }) => {
          const data = new FormData()
          data.set("resource", resource)
          data.set("key", key)
          data.set("file", file)
          return data
        },
        done,
      )}
      className="grid gap-5"
      noValidate
    >
      <Field label="File" name="object-file" error={errors.file?.message}>
        <Controller
          control={form.control}
          name="file"
          render={({ field }) => (
            <Input
              type="file"
              {...feedback("object-file", errors.file?.message)}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) field.onChange(file)
                else form.resetField("file")
              }}
            />
          )}
        />
      </Field>
      <Field
        label="Object key (optional)"
        name="object-key"
        error={errors.key?.message}
      >
        <Input
          {...feedback("object-key", errors.key?.message)}
          {...form.register("key")}
          placeholder="Defaults to the file name"
        />
      </Field>
      <Actions
        title="Upload object"
        busy={isSubmitting}
        error={errors.root?.message}
      />
    </form>
  )
}

export function PutItem({
  resource,
  keys,
  onSaved,
}: {
  resource: string
  keys: string[]
  onSaved: Saved
}) {
  return (
    <ActionDialog
      title="Put item"
      description="Enter a JSON object containing the table’s key attributes. An item with the same key is replaced."
      icon={Plus}
    >
      {(close) => (
        <ItemForm
          resource={resource}
          keys={keys}
          done={() => {
            onSaved()
            close()
          }}
        />
      )}
    </ActionDialog>
  )
}

function ItemForm({
  resource,
  keys,
  done,
}: {
  resource: string
  keys: string[]
  done: Saved
}) {
  const example = JSON.stringify(
    Object.fromEntries(keys.map((key) => [key, ""])),
    null,
    2,
  )
  const form = useForm<z.infer<typeof itemSchema>>({
    resolver: zodResolver(itemSchema),
    defaultValues: { json: example },
  })
  const { errors, isSubmitting } = form.formState
  return (
    <form
      onSubmit={submit(
        form,
        (values) => ({ ...values, kind: "item", resource }),
        done,
      )}
      className="grid gap-5"
      noValidate
    >
      <Field label="Item JSON" name="item-json" error={errors.json?.message}>
        <Textarea
          {...feedback("item-json", errors.json?.message)}
          {...form.register("json")}
          rows={7}
          spellCheck={false}
          className="resize-y font-mono"
        />
      </Field>
      <Actions
        title="Put item"
        busy={isSubmitting}
        error={errors.root?.message}
      />
    </form>
  )
}

export function SendMessage({
  resource,
  fifo,
  onSaved,
}: {
  resource: string
  fifo: boolean
  onSaved: Saved
}) {
  return (
    <ActionDialog
      title="Send message"
      description="Send a test message to this queue. The body can be plain text or JSON."
      icon={Send}
    >
      {(close) => (
        <MessageForm
          resource={resource}
          fifo={fifo}
          done={(id) => {
            onSaved(id)
            close()
          }}
        />
      )}
    </ActionDialog>
  )
}

function MessageForm({
  resource,
  fifo,
  done,
}: {
  resource: string
  fifo: boolean
  done: Saved
}) {
  const form = useForm<z.infer<typeof messageSchema>>({
    resolver: zodResolver(
      messageSchema.refine(({ group }) => !fifo || Boolean(group), {
        path: ["group"],
        message: "Enter a message group ID.",
      }),
    ),
    defaultValues: { body: "", group: "" },
  })
  const { errors, isSubmitting } = form.formState
  return (
    <form
      onSubmit={submit(
        form,
        (values) => ({ ...values, kind: "message", resource }),
        done,
      )}
      className="grid gap-5"
      noValidate
    >
      <Field
        label="Message body"
        name="message-body"
        error={errors.body?.message}
      >
        <Textarea
          {...feedback("message-body", errors.body?.message)}
          {...form.register("body")}
          rows={6}
          className="resize-y"
        />
      </Field>
      {fifo && (
        <Field
          label="Message group ID"
          name="message-group"
          error={errors.group?.message}
        >
          <Input
            {...feedback("message-group", errors.group?.message)}
            {...form.register("group")}
          />
        </Field>
      )}
      <Actions
        title="Send message"
        busy={isSubmitting}
        error={errors.root?.message}
      />
    </form>
  )
}
