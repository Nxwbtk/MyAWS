import { Box } from "lucide-react"
import Image from "next/image"
import serviceIcons from "@/data/service-icons.json"
import { cn } from "@/lib/utils"

const iconsByService = new Map(Object.entries(serviceIcons))

export function ServiceIcon({
  id,
  className,
}: {
  id: string
  className?: string
}) {
  const icon = iconsByService.get(id)
  if (icon) {
    return (
      <Image
        alt=""
        src={`/service-icons/${icon}`}
        width={48}
        height={48}
        unoptimized
        className={cn("size-9 shrink-0 object-contain", className)}
      />
    )
  }

  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground",
        className,
      )}
    >
      <Box aria-hidden className="size-4.5" />
    </span>
  )
}
