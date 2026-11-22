"use client"

import AttributeEditor from "@cloudscape-design/components/attribute-editor"
import Input from "@cloudscape-design/components/input"

export type Tag = { Key: string; Value?: string }

export function TagEditor({
  tags,
  onChange,
  limit = 50,
  emptyText = "No tags associated with the resource.",
  valueOptional = true,
}: {
  tags: Tag[]
  onChange: (tags: Tag[]) => void
  limit?: number
  emptyText?: string
  valueOptional?: boolean
}) {
  return (
    <AttributeEditor
      items={tags}
      addButtonText="Add new tag"
      removeButtonText="Remove"
      empty={emptyText}
      disableAddButton={tags.length >= limit}
      additionalInfo={`You can add up to ${limit - tags.length} more tags.`}
      onAddButtonClick={() => onChange([...tags, { Key: "", Value: "" }])}
      onRemoveButtonClick={({ detail }) => onChange(tags.filter((_, index) => index !== detail.itemIndex))}
      definition={[
        {
          label: "Key",
          control: (tag, index) => (
            <Input
              value={tag.Key}
              placeholder="Enter key"
              onChange={({ detail }) => onChange(tags.map((item, i) => (i === index ? { ...item, Key: detail.value } : item)))}
            />
          ),
          errorText: (tag) =>
            tag.Key.length > 128 ? "Tag keys can be up to 128 characters." : undefined,
        },
        {
          label: valueOptional ? (
            <>
              Value - <i>optional</i>
            </>
          ) : (
            "Value"
          ),
          control: (tag, index) => (
            <Input
              value={tag.Value ?? ""}
              placeholder="Enter value"
              onChange={({ detail }) => onChange(tags.map((item, i) => (i === index ? { ...item, Value: detail.value } : item)))}
            />
          ),
          errorText: (tag) =>
            (tag.Value ?? "").length > 256 ? "Tag values can be up to 256 characters." : undefined,
        },
      ]}
    />
  )
}
