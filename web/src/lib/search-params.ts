/** Preserve literal query text and repeated values for Go's URL bindings. */
export function parseSearchParams(
  search: string,
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = Object.create(null)
  for (const [key, value] of new URLSearchParams(search)) {
    const previous = result[key]
    if (previous === undefined) result[key] = value
    else if (Array.isArray(previous)) previous.push(value)
    else result[key] = [previous, value]
  }
  return result
}

export function stringifySearchParams(search: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue
      const serialized =
        typeof item === 'object' ? JSON.stringify(item) : String(item)
      if (serialized !== undefined) params.append(key, serialized)
    }
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}
