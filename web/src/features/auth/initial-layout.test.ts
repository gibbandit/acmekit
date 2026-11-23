import { afterEach, expect, test, vi } from 'vitest'

const headers = vi.hoisted(() => ({
  getRequestHeader: vi.fn(() => 'session=demo'),
  setResponseHeader: vi.fn(),
}))

vi.mock('@tanstack/react-start', () => ({
  createIsomorphicFn: () => ({
    server: (handler: () => unknown) => ({ client: () => handler }),
  }),
  getRouterInstance: vi.fn(),
}))
vi.mock('@tanstack/react-start/server', () => headers)
vi.mock('@relay/WorkspaceQuery.graphql', () => ({
  default: { params: { text: 'query WorkspaceQuery { viewer { id } }' } },
}))

import { getInitialLayout } from './initial-layout'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

test('a stalled development layout probe times out and permits the sign-in fallback', async () => {
  vi.stubEnv('DEV', true)
  const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => {
    const signal = init?.signal
    return new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      })
    })
  })
  vi.stubGlobal('fetch', fetch)

  await expect(getInitialLayout()).resolves.toEqual({ kind: 'signin' })
  const request = fetch.mock.calls[0]![1]!
  expect(request.signal?.aborted).toBe(true)
  expect(request.signal?.reason.name).toBe('TimeoutError')
  expect(headers.setResponseHeader).toHaveBeenCalledWith(
    'Cache-Control',
    'private, no-store',
  )
})

test.each([
  { data: { viewer: { id: 'viewer:demo' } }, expected: { kind: 'workspace' } },
  {
    data: {
      viewer: null,
      serverInfo: { demoEnabled: true, githubEnabled: false },
    },
    expected: {
      kind: 'signin',
      serverInfo: { demoEnabled: true, githubEnabled: false },
    },
  },
])(
  'a responsive development API retains its layout choice: $expected.kind',
  async ({ data, expected }) => {
    vi.stubEnv('DEV', true)
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetch)

    await expect(getInitialLayout()).resolves.toEqual(expected)
    expect(fetch.mock.calls[0]![1]!.headers).toMatchObject({
      Cookie: 'session=demo',
    })
    expect(fetch.mock.calls[0]![1]!.signal?.aborted).toBe(false)
  },
)
