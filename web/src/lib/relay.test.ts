import { afterEach, expect, onTestFinished, test, vi } from 'vitest'
import { loadQuery } from 'react-relay'
import {
  createOperationDescriptor,
  commitMutation,
  fetchQuery,
  getSingularSelector,
  type Environment,
  type ConcreteRequest,
} from 'relay-runtime'
import WorkspaceQueryArtifact, {
  type WorkspaceQuery as WorkspaceQueryType,
} from '../__generated__/WorkspaceQuery.graphql'
import AccountMenuViewer from '../__generated__/accountMenu_viewer.graphql'
import AppSidebarViewer from '../__generated__/AppSidebar_viewer.graphql'
import DeleteProjectMutationArtifact, {
  type DeleteProjectDialogMutation,
} from '../__generated__/DeleteProjectDialogMutation.graphql'
import ProjectsPageQueryArtifact from '../__generated__/ProjectsPageQuery.graphql'
import {
  createBootstrapReplay,
  readBootstrapText,
} from '@acmekit/route-adapter/runtime'
import { createRelayEnvironment } from './relay'
import { fetchRouteQuery } from '@acmekit/route-adapter/runtime'
import { projectVariables } from '../features/projects/project-variables'
import { RequestError, requiresSignIn } from './errors'

function persistedRequest(request: ConcreteRequest): ConcreteRequest {
  return {
    ...request,
    params: {
      ...request.params,
      id: `test:${request.params.name}`,
      text: null,
    },
  }
}

const WorkspaceQuery = persistedRequest(WorkspaceQueryArtifact)
const DeleteProjectMutation = persistedRequest(DeleteProjectMutationArtifact)
const ProjectsPageQuery = persistedRequest(ProjectsPageQueryArtifact)

function readAccount(environment: Environment) {
  const operation = createOperationDescriptor(WorkspaceQuery, {})
  const { viewer } = environment.lookup(operation.fragment).data
  const sidebar = environment.lookup(
    getSingularSelector(AppSidebarViewer, viewer),
  ).data
  return environment.lookup(getSingularSelector(AccountMenuViewer, sidebar))
    .data
}

const response = {
  data: {
    viewer: {
      id: 'viewer:maintainer',
      name: 'Maintainer',
      role: 'MAINTAINER',
      avatarUrl: null,
      canManageProjects: true,
    },
    serverInfo: {
      name: 'Acme',
      version: 'test',
      demoEnabled: true,
      githubEnabled: false,
      storage: 'memory',
    },
  },
}

function bootstrap(
  query: ConcreteRequest,
  variables: Record<string, unknown> = {},
  result: unknown = response,
) {
  expect(query.params.id).toBeTruthy()
  return JSON.stringify([{ id: query.params.id, variables, response: result }])
}

function mockAPI(result: unknown = response) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    async () =>
      new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => vi.unstubAllGlobals())

test('aborting a loader during subscription start cancels before its response normalizes', async () => {
  const controller = new AbortController()
  const pendingResponse = new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' },
  })
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => {
      controller.abort()
      return pendingResponse
    })
  vi.stubGlobal('fetch', fetch)
  const environment = createRelayEnvironment(createBootstrapReplay('[]'))

  await expect(
    fetchRouteQuery<WorkspaceQueryType>(
      environment,
      WorkspaceQuery,
      {},
      controller.signal,
    ),
  ).resolves.toBeUndefined()
  await new Promise<void>((resolve) => setImmediate(resolve))

  expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  expect(
    environment.check(createOperationDescriptor(WorkspaceQuery, {})).status,
  ).toBe('missing')
})

test('an aborted HTTP rejection stays silent after the loader unsubscribes', async (t) => {
  const report = vi.spyOn(console, 'error').mockImplementation(() => {})
  t.onTestFinished(() => report.mockRestore())
  const controller = new AbortController()
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
    (_url, options) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener(
          'abort',
          () =>
            reject(new DOMException('The request was aborted.', 'AbortError')),
          { once: true },
        )
      }),
  )
  vi.stubGlobal('fetch', fetch)
  const environment = createRelayEnvironment(createBootstrapReplay('[]'))
  const loading = fetchRouteQuery<WorkspaceQueryType>(
    environment,
    WorkspaceQuery,
    {},
    controller.signal,
  )

  controller.abort()
  await expect(loading).resolves.toBeUndefined()
  await new Promise<void>((resolve) => setImmediate(resolve))

  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  expect(report).not.toHaveBeenCalled()
})

test('retiring a loader cancels its query before a fresh same-variable read', async () => {
  let release!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => {
    release = resolve
  })
  const fresh = {
    data: {
      ...response.data,
      viewer: { ...response.data.viewer, name: 'Fresh viewer' },
    },
  }
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementationOnce(() => pending)
    .mockResolvedValueOnce(
      new Response(JSON.stringify(fresh), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  vi.stubGlobal('fetch', fetch)
  const environment = createRelayEnvironment(createBootstrapReplay('[]'))
  const retired = new AbortController()
  const oldRead = fetchRouteQuery<WorkspaceQueryType>(
    environment,
    WorkspaceQuery,
    {},
    retired.signal,
  )
  retired.abort()
  await expect(oldRead).resolves.toBeUndefined()
  expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)

  const current = new AbortController()
  await fetchRouteQuery<WorkspaceQueryType>(
    environment,
    WorkspaceQuery,
    {},
    current.signal,
  )
  expect(readAccount(environment)).toMatchObject({ name: 'Fresh viewer' })
  expect(fetch).toHaveBeenCalledTimes(2)

  const stale = new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' },
  })
  const read = vi.spyOn(stale, 'json')
  release(stale)
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
  await read.mock.results[0]?.value
  await Promise.resolve()
  expect(readAccount(environment)).toMatchObject({ name: 'Fresh viewer' })
})

test.each(['data', 'error'] as const)(
  'a successful mutation replaces a shared pre-write query %s before normalization',
  async (staleResult) => {
    let releaseOld!: (response: Response) => void
    let releaseFresh!: (response: Response) => void
    const oldHTTP = new Promise<Response>((resolve) => {
      releaseOld = resolve
    })
    const freshHTTP = new Promise<Response>((resolve) => {
      releaseFresh = resolve
    })
    const json = (result: unknown) =>
      new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
      })
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(() => oldHTTP)
      .mockResolvedValueOnce(
        json({
          data: { deleteProject: { deletedProjectId: 'project:deleted' } },
        }),
      )
      .mockImplementationOnce(() => freshHTTP)
    vi.stubGlobal('fetch', fetch)
    const environment = createRelayEnvironment(createBootstrapReplay('[]'))
    const controller = new AbortController()
    const loader = fetchRouteQuery<WorkspaceQueryType>(
      environment,
      WorkspaceQuery,
      {},
      controller.signal,
    )
    const reader = fetchQuery<WorkspaceQueryType>(
      environment,
      WorkspaceQuery,
      {},
    ).toPromise()
    expect(fetch).toHaveBeenCalledTimes(1)
    await new Promise<void>((resolve, reject) => {
      commitMutation<DeleteProjectDialogMutation>(environment, {
        mutation: DeleteProjectMutation,
        variables: { input: { id: 'project:deleted' } },
        onCompleted: () => resolve(),
        onError: reject,
      })
    })
    controller.abort()
    await expect(loader).resolves.toBeUndefined()
    releaseOld(
      json(
        staleResult === 'data'
          ? response
          : { errors: [{ message: 'Obsolete request failed.' }] },
      ),
    )
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3))
    expect(
      environment.getStore().getSource().get('viewer:maintainer'),
      'An overtaken payload must never enter the normalized store',
    ).toBeUndefined()
    releaseFresh(
      json({
        data: {
          ...response.data,
          viewer: { ...response.data.viewer, name: 'Fresh viewer' },
        },
      }),
    )
    await reader
    expect(readAccount(environment)).toMatchObject({ name: 'Fresh viewer' })
  },
)

test.each(['data', 'error'] as const)(
  'a query %s settling with a successful mutation retries before publication',
  async (staleResult) => {
    let releaseQuery!: (value: unknown) => void
    let releaseMutation!: (value: unknown) => void
    const queryBody = new Promise<unknown>((resolve) => {
      releaseQuery = resolve
    })
    const mutationBody = new Promise<unknown>((resolve) => {
      releaseMutation = resolve
    })
    const staleHTTP = new Response(null, {
      headers: { 'Content-Type': 'application/json' },
    })
    const mutationHTTP = new Response(null, {
      headers: { 'Content-Type': 'application/json' },
    })
    const readQuery = vi.spyOn(staleHTTP, 'json').mockReturnValue(queryBody)
    const readMutation = vi
      .spyOn(mutationHTTP, 'json')
      .mockReturnValue(mutationBody)
    onTestFinished(() => {
      readQuery.mockRestore()
      readMutation.mockRestore()
    })
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(staleHTTP)
      .mockResolvedValueOnce(mutationHTTP)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              ...response.data,
              viewer: { ...response.data.viewer, name: 'Fresh viewer' },
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetch)
    const environment = createRelayEnvironment(createBootstrapReplay('[]'))
    const received: unknown[] = []
    const query = new Promise<void>((resolve, reject) => {
      fetchQuery<WorkspaceQueryType>(environment, WorkspaceQuery, {}).subscribe(
        {
          next: () => received.push(readAccount(environment).name),
          complete: resolve,
          error: reject,
        },
      )
    })
    const mutation = new Promise<void>((resolve, reject) => {
      commitMutation<DeleteProjectDialogMutation>(environment, {
        mutation: DeleteProjectMutation,
        variables: { input: { id: 'project:deleted' } },
        onCompleted: () => resolve(),
        onError: reject,
      })
    })
    await vi.waitFor(() => {
      expect(readQuery).toHaveBeenCalledOnce()
      expect(readMutation).toHaveBeenCalledOnce()
    })

    releaseMutation({
      data: { deleteProject: { deletedProjectId: 'project:deleted' } },
    })
    releaseQuery(
      staleResult === 'data'
        ? response
        : { errors: [{ message: 'Obsolete request failed.' }] },
    )
    await Promise.all([query, mutation])

    expect(received).toEqual(['Fresh viewer'])
    expect(readAccount(environment)).toMatchObject({ name: 'Fresh viewer' })
    expect(fetch).toHaveBeenCalledTimes(3)
  },
)

test('a failed mutation does not retry an in-flight query', async () => {
  let release!: (response: Response) => void
  const pending = new Promise<Response>((resolve) => {
    release = resolve
  })
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementationOnce(() => pending)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ errors: [{ message: 'Write rejected.' }] }),
        {
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )
  vi.stubGlobal('fetch', fetch)
  const environment = createRelayEnvironment(createBootstrapReplay('[]'))
  const query = fetchQuery<WorkspaceQueryType>(
    environment,
    WorkspaceQuery,
    {},
  ).toPromise()
  const mutation = new Promise<void>((resolve, reject) => {
    commitMutation<DeleteProjectDialogMutation>(environment, {
      mutation: DeleteProjectMutation,
      variables: { input: { id: 'project:deleted' } },
      onCompleted: () => resolve(),
      onError: reject,
    })
  })
  await expect(mutation).rejects.toThrow('Write rejected.')
  release(
    new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  await query
  expect(readAccount(environment)).toMatchObject({ name: 'Maintainer' })
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('the real compiled query normalizes bootstrap data synchronously and refreshes over HTTP', async (t) => {
  const fetch = mockAPI()
  const environment = createRelayEnvironment(
    createBootstrapReplay(bootstrap(WorkspaceQuery)),
  )
  const queryRef = loadQuery<WorkspaceQueryType>(
    environment,
    WorkspaceQuery,
    {},
    {
      fetchPolicy: 'store-and-network',
    },
  )
  t.onTestFinished(() => queryRef.dispose())

  const operation = createOperationDescriptor(WorkspaceQuery, {})
  expect(environment.check(operation).status).toBe('available')
  const workspace = environment.lookup(operation.fragment).data
  expect(workspace.viewer).not.toHaveProperty('name')
  expect(readAccount(environment)).toEqual({
    name: 'Maintainer',
    role: 'MAINTAINER',
    avatarUrl: null,
  })
  expect(workspace.serverInfo).toEqual({
    demoEnabled: true,
    githubEnabled: false,
  })
  expect(fetch).not.toHaveBeenCalled()

  const cachedRef = loadQuery<WorkspaceQueryType>(
    environment,
    WorkspaceQuery,
    {},
    {
      fetchPolicy: 'store-or-network',
    },
  )
  t.onTestFinished(() => cachedRef.dispose())
  expect(fetch).not.toHaveBeenCalled()

  await fetchQuery<WorkspaceQueryType>(
    environment,
    WorkspaceQuery,
    {},
    {
      fetchPolicy: 'network-only',
    },
  ).toPromise()
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    '/graphql',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify({ id: WorkspaceQuery.params.id, variables: {} }),
    }),
  )
})

test('replay compares full nested variables independent of object key order and preserves null', async () => {
  const fetch = mockAPI()
  const variables = {
    filter: { search: null, flags: [true, { enabled: false }] },
    after: null,
  }
  const environment = createRelayEnvironment(
    createBootstrapReplay(bootstrap(WorkspaceQuery, variables)),
  )
  const network = environment.getNetwork()
  await network
    .execute(
      WorkspaceQuery.params,
      {
        after: null,
        filter: { flags: [true, { enabled: false }], search: 'null' },
      },
      {},
    )
    .toPromise()
  expect(fetch).toHaveBeenCalledTimes(1)

  await network
    .execute(
      WorkspaceQuery.params,
      {
        after: null,
        filter: { flags: [true, { enabled: false }], search: null },
      },
      {},
    )
    .toPromise()
  expect(fetch).toHaveBeenCalledTimes(1)
  await network.execute(WorkspaceQuery.params, variables, {}).toPromise()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('bootstrap is consumed by the first subscription while an unused network observable stays cold', async () => {
  const fetch = mockAPI()
  const network = createRelayEnvironment(
    createBootstrapReplay(bootstrap(WorkspaceQuery)),
  ).getNetwork()
  const unused = network.execute(WorkspaceQuery.params, {}, {})

  await network.execute(WorkspaceQuery.params, {}, {}).toPromise()
  expect(fetch).not.toHaveBeenCalled()
  await unused.toPromise()
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('changing the URL before a network subscription retires its bootstrap permanently', async () => {
  const fetch = mockAPI()
  let href = 'http://localhost/projects'
  const network = createRelayEnvironment(
    createBootstrapReplay(bootstrap(WorkspaceQuery), () => href),
  ).getNetwork()
  const pending = network.execute(WorkspaceQuery.params, {}, {})

  href = 'http://localhost/components'
  await pending.toPromise()
  expect(fetch).toHaveBeenCalledTimes(1)
  href = 'http://localhost/projects'
  await network.execute(WorkspaceQuery.params, {}, {}).toPromise()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('initial Projects variables use the literal URL, including quoted search text', async () => {
  const fetch = mockAPI()
  const variables = projectVariables(
    new URLSearchParams('?first=2&status=ACTIVE&search=%22draft%22'),
  )
  expect(variables).toEqual({
    first: 2,
    after: null,
    anchor: null,
    search: '"draft"',
    status: 'ACTIVE',
  })
  const environment = createRelayEnvironment(
    createBootstrapReplay(bootstrap(ProjectsPageQuery, variables)),
  )
  await environment
    .getNetwork()
    .execute(ProjectsPageQuery.params, variables, {})
    .toPromise()
  expect(fetch).not.toHaveBeenCalled()
})

test('mutations never replay embedded responses', async () => {
  const fetch = mockAPI()
  const variables = { input: { id: 'project:1' } }
  const environment = createRelayEnvironment(
    createBootstrapReplay(bootstrap(DeleteProjectMutation, variables)),
  )
  await environment
    .getNetwork()
    .execute(DeleteProjectMutation.params, variables, {})
    .toPromise()
  expect(fetch).toHaveBeenCalledTimes(1)
})

test.each([null, {}, [], { data: null }, { errors: [{ code: 'broken' }] }])(
  'a malformed embedded response falls back to its persisted request (%j)',
  async (malformed) => {
    const fetch = mockAPI()
    const environment = createRelayEnvironment(
      createBootstrapReplay(bootstrap(WorkspaceQuery, {}, malformed)),
    )

    const result = await fetchQuery<WorkspaceQueryType>(
      environment,
      WorkspaceQuery,
      {},
    ).toPromise()

    expect(result?.viewer?.canManageProjects).toBe(true)
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/graphql',
      expect.objectContaining({
        body: JSON.stringify({ id: WorkspaceQuery.params.id, variables: {} }),
      }),
    )
  },
)

test('embedded and HTTP GraphQL errors preserve every error code through real Relay', async () => {
  const result = {
    data: null,
    errors: [
      { message: 'Forbidden.', extensions: { code: 'FORBIDDEN' } },
      { message: 'Sign in again.', extensions: { code: 'UNAUTHENTICATED' } },
    ],
  }
  const fetch = mockAPI(result)
  const environment = createRelayEnvironment(
    createBootstrapReplay(bootstrap(WorkspaceQuery, {}, result)),
  )
  const execute = () =>
    fetchQuery<WorkspaceQueryType>(
      environment,
      WorkspaceQuery,
      {},
      {
        fetchPolicy: 'network-only',
      },
    ).toPromise()
  for (const source of ['bootstrap', 'HTTP']) {
    const error = await execute().catch((cause: unknown) => cause)
    expect(error, source).toBeInstanceOf(RequestError)
    expect(error, source).toMatchObject({
      message: 'Forbidden. Sign in again.',
      codes: ['FORBIDDEN', 'UNAUTHENTICATED'],
    })
    expect(requiresSignIn(error), source).toBe(true)
    if (source === 'bootstrap') expect(fetch).not.toHaveBeenCalled()
  }
  expect(fetch).toHaveBeenCalledTimes(1)
})

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
])(
  'the real Relay network preserves recovery metadata for $name',
  async ({ status, body, contentType, codes, signIn }) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(body, {
        status,
        headers: { 'Content-Type': contentType },
      }),
    )
    vi.stubGlobal('fetch', fetch)
    const environment = createRelayEnvironment(createBootstrapReplay('[]'))
    const error = await environment
      .getNetwork()
      .execute(WorkspaceQuery.params, {}, {})
      .toPromise()
      .catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(RequestError)
    expect(error).toMatchObject({ status, codes })
    expect(requiresSignIn(error)).toBe(signIn)
  },
)

test('leaving the initial document URL discards unused responses, even when returning', async () => {
  const fetch = mockAPI()
  let href = 'http://localhost/projects'
  const replay = createBootstrapReplay(bootstrap(WorkspaceQuery), () => href)
  const environment = createRelayEnvironment(replay)
  href = 'http://localhost/components'
  await environment
    .getNetwork()
    .execute(WorkspaceQuery.params, {}, {})
    .toPromise()
  href = 'http://localhost/projects'
  await environment
    .getNetwork()
    .execute(WorkspaceQuery.params, {}, {})
    .toPromise()
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('nonpersisted development operations still send query text', async () => {
  const fetch = mockAPI()
  const environment = createRelayEnvironment(createBootstrapReplay('[]'))
  const operation = {
    ...WorkspaceQuery.params,
    id: null,
    cacheID: 'development-workspace',
    text: 'query WorkspaceQuery { viewer { id } }',
  }
  await environment.getNetwork().execute(operation, {}, {}).toPromise()
  expect(fetch).toHaveBeenCalledWith(
    '/graphql',
    expect.objectContaining({
      body: JSON.stringify({ query: operation.text, variables: {} }),
    }),
  )
})

test('the script text is preserved verbatim for hydration and is empty during prerender', () => {
  expect(readBootstrapText()).toBe('[]')
  const text = '[\n  {"escaped":"\\u003c/script\\u003e"}\n]\n'
  vi.stubGlobal('document', {
    getElementById: (id: string) =>
      id === 'route-bootstrap' ? { textContent: text } : null,
  })
  expect(readBootstrapText()).toBe(text)
})
