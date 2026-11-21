import data from "@/data/service-catalog.json"

export type CatalogService = (typeof data.services)[number]
export const serviceCatalog: CatalogService[] = [...data.services]
if (!serviceCatalog.some(({ id }) => id === "vpc")) {
  // VPC has a separate console, backed by operations in the EC2 API model.
  serviceCatalog.push({
    id: "vpc",
    name: "Amazon VPC",
    aliases: [
      "Virtual Private Cloud", "subnets", "route tables", "internet gateways",
    ],
    models: [],
  })
}
export const catalogCommit = data.commit
const servicesById = new Map(
  serviceCatalog.map((service) => [service.id, service]),
)

export function findCatalogService(id: string) {
  return servicesById.get(id)
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function forms(value: string): [string, string] {
  const text = normalize(value)
  return [text, text.replaceAll(" ", "")]
}

const searchIndex = serviceCatalog.map((service) => ({
  service,
  primary: [
    service.id,
    service.name,
    service.name.replace(/^(Amazon|AWS) /, ""),
  ].flatMap(forms),
  aliases: service.aliases.flatMap(forms),
}))

function matchRank(
  values: string[],
  text: string,
  compact: string,
  terms: string[],
) {
  if (values.includes(text) || values.includes(compact)) return 0
  if (
    values.some((value) => value.startsWith(text) || value.startsWith(compact))
  )
    return 1
  if (values.some((value) => value.includes(text) || value.includes(compact)))
    return 2
  if (values.some((value) => terms.every((term) => value.includes(term))))
    return 3
  return Infinity
}

export function searchServices(query: string) {
  const [text, compact] = forms(query.trim().replace(/^(Amazon|AWS)\s+/i, ""))
  if (!text) return []
  const terms = text.split(" ")

  return searchIndex
    .flatMap(({ service, primary, aliases }) => {
      const score = Math.min(
        2 * matchRank(primary, text, compact, terms),
        2 * matchRank(aliases, text, compact, terms) + 1,
      )

      return Number.isFinite(score) ? [{ service, score }] : []
    })
    .sort((first, second) => first.score - second.score)
    .map(({ service }) => service)
}
