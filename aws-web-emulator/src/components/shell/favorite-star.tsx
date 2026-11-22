"use client"

import Icon from "@cloudscape-design/components/icon"
import { useFavorites } from "@/lib/favorites"
import { serviceShortName } from "@/lib/service-meta"

export function FavoriteStar({ id }: { id: string }) {
  const favorite = useFavorites((state) => state.ids.includes(id))
  const toggle = useFavorites((state) => state.toggle)
  const name = serviceShortName(id)
  return (
    <button
      type="button"
      className={`myaws-star${favorite ? " is-favorite" : ""}`}
      aria-pressed={favorite}
      aria-label={favorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        toggle(id)
      }}
    >
      <Icon name={favorite ? "star-filled" : "star"} size="small" />
    </button>
  )
}
