import { afterEach, expect, test, vi } from 'vitest'
import {
  createRequestError,
  readableError,
  RequestError,
  requiresSignIn,
} from './errors'
import { postJSON } from './utils'

afterEach(() => vi.unstubAllGlobals())

test('GraphQL errors retain all messages and codes regardless of their wording', () => {
  const error = createRequestError(
    {
      errors: [
        {
          message: 'This action is forbidden.',
          extensions: { code: 'FORBIDDEN' },
        },
        {
          message: 'Your credentials have expired.',
          extensions: { code: 'UNAUTHENTICATED' },
        },
      ],
    },
    'The request failed.',
  )

  expect(error).toBeInstanceOf(RequestError)
  expect(error.message).toBe(
    'This action is forbidden. Your credentials have expired.',
  )
  expect(error.codes).toEqual(['FORBIDDEN', 'UNAUTHENTICATED'])
  expect(requiresSignIn(error)).toBe(true)
})

test('REST errors retain their code and HTTP status', () => {
  const error = createRequestError(
    {
      error: 'Your credentials have expired.',
      code: 'UNAUTHENTICATED',
    },
    'The request failed.',
    401,
  )

  expect(error.message).toBe('Your credentials have expired.')
  expect(error.codes).toEqual(['UNAUTHENTICATED'])
  expect(error.status).toBe(401)
  expect(requiresSignIn(error)).toBe(true)
  expect(createRequestError(error, 'Another fallback.')).toBe(error)
})

test('REST message responses and missing bodies use their provided fallbacks', () => {
  expect(
    createRequestError({ message: 'Please try later.' }, 'The request failed.')
      .message,
  ).toBe('Please try later.')
  expect(createRequestError(undefined, 'The request failed.').message).toBe(
    'The request failed.',
  )
})

test('forbidden and unavailable-provider errors do not offer sign-in recovery', () => {
  for (const error of [
    new RequestError('Sign in to continue.', ['FORBIDDEN']),
    new RequestError('Sign in to continue.', [], 403),
    new RequestError(
      'Sign-in is not available on this server.',
      ['DEMO_DISABLED'],
      404,
    ),
    'Sign-in is not available on this server. Please contact your administrator.',
    new Error('Sign-in has not been configured for this workspace.'),
    new Error('Sign in is unavailable.'),
    new Error('Sign in is not configured.'),
    new Error('Could not sign in. Please try again.'),
    new Error('Unable to log in with this provider.'),
    new Error('Your role can view projects, but cannot change them.'),
  ]) {
    expect(requiresSignIn(error)).toBe(false)
  }
})

test('clear legacy sign-in instructions are recognized without metadata', () => {
  for (const message of [
    'Sign in to continue.',
    'Please sign in.',
    'Sign in again.',
    'Your session expired. Please log in to continue.',
    'You must sign in first.',
    'You need to log in before continuing.',
    'Login to continue.',
  ]) {
    expect(requiresSignIn(message), message).toBe(true)
    expect(requiresSignIn(new Error(message)), message).toBe(true)
    expect(requiresSignIn(new RequestError(message)), message).toBe(true)
    expect(readableError(new Error(message)), message).toBe(
      'Sign in to continue.',
    )
    expect(readableError(message), message).toBe(message)
    expect(readableError(new RequestError(message)), message).toBe(message)
  }
})

test('readable errors keep user-facing text without exposing unknown values', () => {
  expect(
    readableError(
      new RequestError('Your credentials have expired.', ['UNAUTHENTICATED']),
    ),
  ).toBe('Your credentials have expired.')
  expect(readableError(new RequestError('Invalid value for first.'))).toBe(
    'Invalid value for first.',
  )
  expect(readableError('Please try again.')).toBe('Please try again.')
  expect(readableError({ private: 'details' })).toBe(
    'Something went wrong. Please try again.',
  )
})

test.each([
  {
    name: 'reference error',
    error: new ReferenceError('viewer is not defined'),
  },
  {
    name: 'type error',
    error: new TypeError(
      "Cannot read properties of undefined (reading 'name')",
    ),
  },
  {
    name: 'native error containing a source path',
    error: new Error('Failed to load /workspace/example/web/src/App.tsx'),
  },
])(
  'unexpected $name uses safe copy without changing diagnostic details',
  ({ error }) => {
    const message = error.message
    const stack = error.stack

    expect(readableError(error)).toBe('Something went wrong. Please try again.')
    expect(requiresSignIn(error)).toBe(false)
    expect(error.message).toBe(message)
    expect(error.stack).toBe(stack)
  },
)

test.each([
  {
    name: 'JSON HTTP 401',
    status: 401,
    body: JSON.stringify({
      error: 'Your credentials have expired.',
      code: 'UNAUTHENTICATED',
    }),
    contentType: 'application/json',
    codes: ['UNAUTHENTICATED'],
    signIn: true,
  },
  {
    name: 'non-JSON HTTP 401',
    status: 401,
    body: '<h1>Unauthorized</h1>',
    contentType: 'text/html',
    codes: [],
    signIn: true,
  },
  {
    name: 'JSON HTTP 403',
    status: 403,
    body: JSON.stringify({
      error: 'Your role cannot perform this action.',
      code: 'FORBIDDEN',
    }),
    contentType: 'application/json',
    codes: ['FORBIDDEN'],
    signIn: false,
  },
  {
    name: 'unavailable provider',
    status: 404,
    body: JSON.stringify({
      error: 'Sign-in is not available on this server.',
      code: 'DEMO_DISABLED',
    }),
    contentType: 'application/json',
    codes: ['DEMO_DISABLED'],
    signIn: false,
  },
])(
  'REST requests preserve recovery metadata for $name',
  async ({ status, body, contentType, codes, signIn }) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(body, {
        status,
        headers: { 'Content-Type': contentType },
      }),
    )
    vi.stubGlobal('fetch', fetch)

    const error = await postJSON('/auth/logout').catch(
      (cause: unknown) => cause,
    )
    expect(error).toBeInstanceOf(RequestError)
    expect(error).toMatchObject({ status, codes })
    expect(requiresSignIn(error)).toBe(signIn)
    expect(fetch).toHaveBeenCalledWith(
      '/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      }),
    )
  },
)
