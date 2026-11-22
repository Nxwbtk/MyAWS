// Formatting helpers that match how the AWS Console renders values.

function offset(date: Date) {
  const minutes = -date.getTimezoneOffset()
  const sign = minutes >= 0 ? "+" : "-"
  const abs = Math.abs(minutes)
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`
}

/** "February 4, 2026, 10:47:02 (UTC+07:00)" */
export function consoleDate(value?: string | number | Date | null) {
  if (value === undefined || value === null || value === "") return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const day = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
  return `${day}, ${time} (${offset(date)})`
}

/** "1.2 MB", "512.0 B" in the console's decimal-with-binary-units style. */
export function consoleBytes(bytes?: number | null) {
  if (bytes === undefined || bytes === null) return "-"
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${units[unit]}`
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`
}

export function copyText(text: string) {
  return navigator.clipboard?.writeText(text).catch(() => undefined)
}
