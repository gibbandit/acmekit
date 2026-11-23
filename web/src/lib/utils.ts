import { createRequestError } from './errors'

export { cn } from '../components/ui/cn'

export function formatDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(
    'en',
    options ?? { month: 'short', day: 'numeric', year: 'numeric' },
  ).format(date)
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export async function postJSON(path: string, data?: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(data ?? {}),
  })
  const isJSON = response.headers
    .get('content-type')
    ?.includes('application/json')
  let result: unknown = null
  if (isJSON) {
    try {
      result = await response.json()
    } catch {
      throw createRequestError(
        undefined,
        'The server returned an unexpected response. Please try again.',
        response.status,
      )
    }
  }
  if (!response.ok) {
    throw createRequestError(
      result,
      `The request could not be completed (${response.status}).`,
      response.status,
    )
  }
  if (!isJSON)
    throw createRequestError(
      undefined,
      'The server returned an unexpected response. Please try again.',
      response.status,
    )
  return result
}
