import type { RequestParameters, Variables } from 'relay-runtime'

export const bootstrapElementId = 'route-bootstrap'

// Preserve the exact JSON text that Go wrote so the document hydrates unchanged.
export function readBootstrapText(): string {
  if (typeof document === 'undefined') return '[]'
  return document.getElementById(bootstrapElementId)?.textContent ?? '[]'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBootstrapResponse(value: unknown): boolean {
  if (!isObject(value) || (value.data != null && !isObject(value.data))) {
    return false
  }
  if (value.errors === undefined) return isObject(value.data)
  return (
    Array.isArray(value.errors) &&
    value.errors.length > 0 &&
    value.errors.every(
      (error) => isObject(error) && typeof error.message === 'string',
    )
  )
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (!isObject(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  )
}

function responseKey(id: string, variables: Variables): string {
  return JSON.stringify([id, stable(variables)])
}

function documentURL(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.href
}

/** One-use responses for this document, never a cross-route or shared cache. */
export function createBootstrapReplay(
  text = readBootstrapText(),
  currentURL = documentURL,
) {
  const initialURL = currentURL()
  const responses = new Map<string, unknown>()
  try {
    const entries: unknown = JSON.parse(text)
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (
          isObject(entry) &&
          typeof entry.id === 'string' &&
          isObject(entry.variables) &&
          isBootstrapResponse(entry.response)
        ) {
          responses.set(responseKey(entry.id, entry.variables), entry.response)
        }
      }
    }
  } catch {
    // A missing or malformed bootstrap falls back to the ordinary API request.
  }

  return {
    clear: () => responses.clear(),
    take(operation: RequestParameters, variables: Variables): unknown {
      if (currentURL() !== initialURL || operation.operationKind !== 'query') {
        responses.clear()
        return undefined
      }
      if (operation.id == null) return undefined
      const key = responseKey(operation.id, variables)
      const response = responses.get(key)
      responses.delete(key)
      return response
    },
  }
}
