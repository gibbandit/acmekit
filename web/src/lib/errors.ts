function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class RequestError extends Error {
  readonly codes: string[]
  readonly status?: number

  constructor(message: string, codes: string[] = [], status?: number) {
    super(message)
    this.name = 'RequestError'
    this.codes = [...new Set(codes)]
    this.status = status
  }
}

export function createRequestError(
  result: unknown,
  fallback: string,
  status?: number,
): RequestError {
  if (result instanceof RequestError) {
    return status === undefined
      ? result
      : new RequestError(result.message, result.codes, status)
  }

  const messages: string[] = []
  const codes: string[] = []
  if (isObject(result)) {
    if (Array.isArray(result.errors)) {
      for (const error of result.errors) {
        if (!isObject(error)) continue
        if (typeof error.message === 'string' && error.message) {
          messages.push(error.message)
        }
        if (
          isObject(error.extensions) &&
          typeof error.extensions.code === 'string'
        ) {
          codes.push(error.extensions.code)
        }
      }
    }
    if (typeof result.code === 'string') codes.push(result.code)
    if (!messages.length) {
      if (typeof result.error === 'string' && result.error) {
        messages.push(result.error)
      } else if (typeof result.message === 'string' && result.message) {
        messages.push(result.message)
      }
    }
  }
  return new RequestError(messages.join(' ') || fallback, codes, status)
}

export function readableError(error: unknown): string {
  // RequestError and explicit UI copy are intended for users. Programming and
  // runtime exceptions retain their original details for developer diagnostics.
  if (error instanceof RequestError && error.message.trim())
    return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (requiresSignIn(error)) return 'Sign in to continue.'
  return 'Something went wrong. Please try again.'
}

// Legacy errors may contain instructions without structured API metadata.
const signInPrompt =
  /(?:^|[.!?]\s+)(?:(?:please\s+)?|you\s+(?:must|need\s+to|have\s+to)\s+)(?:sign\s+in|log\s*in)(?=\s*(?:[.!?]|$)|\s+(?:again|first|to|with|using|before)\b)/i

export function requiresSignIn(error: unknown): boolean {
  if (isObject(error)) {
    const codes = Array.isArray(error.codes)
      ? error.codes.filter((code): code is string => typeof code === 'string')
      : []
    if (typeof error.code === 'string') codes.push(error.code)
    const status = typeof error.status === 'number' ? error.status : undefined
    if (codes.includes('UNAUTHENTICATED') || status === 401) return true
    if (codes.length || status !== undefined) return false
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  return signInPrompt.test(message.trim())
}
