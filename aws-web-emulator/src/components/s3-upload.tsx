"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { S3OperationForm, s3SelectClass } from "@/components/s3-operation-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { objectKeySchema, uploadLimit } from "@/lib/contracts"
import { multipartPartLimit, uploadS3Object } from "@/lib/s3-client"

const options = z.object({
  storageClass: z.string(),
  encryption: z.enum(["", "AES256", "aws:kms", "aws:kms:dsse"]),
  kmsKey: z.string().trim(),
  tagging: z.string().trim(),
})
type QueueItem = { key: string; file: File; saved?: boolean; error?: string }

export function S3Upload({
  bucket,
  prefix,
  directory,
  close,
}: {
  bucket: string
  prefix: string
  directory: boolean
  close: () => void
}) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [advanced, setAdvanced] = useState(false)
  const filesInput = useRef<HTMLInputElement>(null)
  const foldersInput = useRef<HTMLInputElement>(null)
  const cache = useQueryClient()
  const form = useForm<z.infer<typeof options>>({
    resolver: zodResolver(options),
    defaultValues: {
      storageClass: directory ? "EXPRESS_ONEZONE" : "STANDARD",
      encryption: "",
      kmsKey: "",
      tagging: "",
    },
  })
  const upload = useMutation({
    mutationFn: async (settings: z.infer<typeof options>) => {
      for (const entry of queue.filter(
        ({ saved, file, key }) =>
          !saved &&
          file.size <= uploadLimit * multipartPartLimit &&
          objectKeySchema.safeParse(key).success,
      )) {
        let result: Partial<QueueItem>
        try {
          await uploadS3Object(
            {
              Bucket: bucket,
              Key: entry.key,
              ContentType: entry.file.type || undefined,
              StorageClass: settings.storageClass || undefined,
              ServerSideEncryption: settings.encryption || undefined,
              SSEKMSKeyId: settings.kmsKey || undefined,
              Tagging: settings.tagging || undefined,
            },
            entry.file,
          )
          result = { saved: true, error: undefined }
        } catch (error) {
          result = { error: error instanceof Error ? error.message : "Upload failed." }
        }
        setQueue((items) =>
          items.map((item) => (item.key === entry.key ? { ...item, ...result } : item)),
        )
      }
    },
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: ["emulator", "s3"] })
    },
  })

  function addFiles(files: FileList | null) {
    if (!files) return
    const mapped = Array.from(files, (file) => {
      const key = `${prefix}${file.webkitRelativePath || file.name}`
      const error =
        file.size > uploadLimit * multipartPartLimit
          ? "The file requires more than 10,000 upload parts."
          : !objectKeySchema.safeParse(key).success
            ? "The key exceeds the S3 length limit."
            : undefined
      return { key, file, error }
    })
    setQueue((current) => [
      ...new Map([...current, ...mapped].map((item) => [item.key, item])).values(),
    ])
  }
  const uploadable = queue.some(
    ({ saved, file, key }) =>
      !saved &&
      file.size <= uploadLimit * multipartPartLimit &&
      objectKeySchema.safeParse(key).success,
  )
  const finished = queue.length > 0 && queue.every(({ saved }) => saved)
  if (advanced)
    return (
      <S3OperationForm
        model="s3"
        action="PutObject"
        title="Upload with custom options"
        fixed={{ Bucket: bucket }}
        initial={{ Key: prefix }}
        cancel={() => setAdvanced(false)}
      />
    )

  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit((input) => upload.mutate(input))}
    >
      <Card className="rounded-xl border ring-0">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Files and folders ({queue.length})</h2>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={upload.isPending}
              onClick={() => filesInput.current?.click()}
            >
              Add files
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={upload.isPending}
              onClick={() => foldersInput.current?.click()}
            >
              Add folder
            </Button>
          </div>
          <input
            aria-label="Choose files to upload"
            ref={filesInput}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ""
            }}
          />
          <input
            aria-label="Choose a folder to upload"
            ref={(node) => {
              foldersInput.current = node
              node?.setAttribute("webkitdirectory", "")
            }}
            type="file"
            className="sr-only"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ""
            }}
          />
        </CardHeader>
        <CardContent>
          {queue.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Object key</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map(({ key, file, saved, error }) => (
                  <TableRow key={key}>
                    <TableCell className="max-w-96 whitespace-normal break-all">
                      {key}
                    </TableCell>
                    <TableCell>{file.size.toLocaleString()} B</TableCell>
                    <TableCell
                      className={
                        error ? "text-destructive" : saved ? "text-success" : undefined
                      }
                    >
                      {error ?? (saved ? "Uploaded" : "Ready")}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={upload.isPending}
                        onClick={() =>
                          setQueue((items) => items.filter((item) => item.key !== key))
                        }
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add the files or folders to upload.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="rounded-xl border ring-0">
        <CardHeader>
          <h2 className="text-lg font-semibold">Destination</h2>
        </CardHeader>
        <CardContent>
          <p className="break-all font-mono text-sm">
            s3://{bucket}/{prefix}
          </p>
        </CardContent>
      </Card>
      <Card className="rounded-xl border ring-0">
        <CardHeader>
          <h2 className="text-lg font-semibold">Properties</h2>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="object-storage-class">Storage class</Label>
            <select
              id="object-storage-class"
              className={s3SelectClass}
              {...form.register("storageClass")}
            >
              {(directory
                ? ["EXPRESS_ONEZONE", "ONEZONE_IA"]
                : [
                    "STANDARD",
                    "STANDARD_IA",
                    "ONEZONE_IA",
                    "INTELLIGENT_TIERING",
                    "GLACIER_IR",
                    "GLACIER",
                    "DEEP_ARCHIVE",
                  ]
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="object-encryption">Server-side encryption</Label>
            <select
              id="object-encryption"
              className={s3SelectClass}
              {...form.register("encryption")}
            >
              <option value="">Use bucket settings</option>
              <option value="AES256">SSE-S3</option>
              <option value="aws:kms">SSE-KMS</option>
              {!directory && <option value="aws:kms:dsse">DSSE-KMS</option>}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="object-kms-key">KMS key ID or ARN (optional)</Label>
            <Input id="object-kms-key" {...form.register("kmsKey")} />
          </div>
          {!directory && (
            <div className="grid gap-2">
              <Label htmlFor="object-tags">Tags (optional)</Label>
              <Input
                id="object-tags"
                placeholder="project=example&environment=local"
                {...form.register("tagging")}
              />
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={upload.isPending}
          onClick={() => setAdvanced(true)}
        >
          Advanced upload
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={upload.isPending}
          onClick={close}
        >
          {finished ? "Back to objects" : "Cancel"}
        </Button>
        <Button disabled={!uploadable || upload.isPending}>
          {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </form>
  )
}
