import {
  createFileRoute,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  type DeferredPromise,
} from '@tanstack/react-router'
import { afterEach, expect, expectTypeOf, test, vi } from 'vitest'
import type { ConcreteRequest, Environment } from 'relay-runtime'
import WorkspaceArtifact, {
  type WorkspaceQuery,
} from '../__generated__/WorkspaceQuery.graphql'
import EditArtifact, {
  type ProjectEditPageQuery,
} from '../__generated__/ProjectEditPageQuery.graphql'
import ProjectsArtifact, {
  type ProjectsPageQuery,
} from '../__generated__/ProjectsPageQuery.graphql'
import DeleteArtifact from '../__generated__/DeleteProjectDialogMutation.graphql'
import { projectBindings } from '../features/projects/project-variables'
import { createRelayEnvironment } from './relay'
import { createBootstrapReplay } from '@acmekit/route-adapter/runtime'
import {
  compileRoutePreloads as compilePreloads,
  type Preload,
} from '@acmekit/route-adapter/runtime'
import { defineRouteQuery } from './route-query'

function compileRoutePreloads(
  matches: readonly {
    params?: Record<string, unknown>
    staticData?: { preloads?: readonly Preload[] }
  }[],
  persisted: boolean,
) {
  const root = createRootRouteWithContext<{}>()()
  const routes = matches.map((match, index) =>
    createRoute({
      getParentRoute: () => root,
      path: `/fixture-${index}/${Object.keys(match.params ?? {})
        .map((name) => `$${name}`)
        .join('/')}`,
    }),
  )
  const router = createRouter({ routeTree: root.addChildren(routes) })
  return compilePreloads(
    router,
    matches.map((match, index) => ({
      ...match,
      routeId: routes[index]!.id,
    })),
    persisted,
  )
}

function persisted(request: ConcreteRequest): ConcreteRequest {
  return {
    ...request,
    params: {
      ...request.params,
      id: `test:${request.params.name}`,
      text: null,
    },
  }
}

const workspaceRequest = persisted(WorkspaceArtifact)
const editRequest = persisted(EditArtifact)
const defineWorkspace = defineRouteQuery<WorkspaceQuery>()
const defineEdit = defineRouteQuery<ProjectEditPageQuery>()
const workspace = defineWorkspace({ request: workspaceRequest })
const editBindings = { slug: { source: 'path', name: 'projectSlug' } } as const
const edit = defineEdit({
  request: editRequest,
  variables: editBindings,
  authenticated: true,
  fetchPolicy: 'store-or-network',
})
const optionalEdit = defineEdit({
  request: editRequest,
  variables: {
    slug: { source: 'path', name: 'projectSlug', default: 'atlas' },
  },
})
const queryEdit = defineEdit({
  request: editRequest,
  variables: { slug: { source: 'query', default: 'fallback' } },
  authenticated: true,
})
const projects = defineRouteQuery<ProjectsPageQuery>()({
  request: persisted(ProjectsArtifact),
  variables: projectBindings,
  authenticated: true,
})
const editResponse = {
  data: {
    project: {
      id: 'project:atlas',
      slug: 'atlas',
      name: 'Atlas',
      description: 'Launch plan',
      status: 'PLANNED',
    },
  },
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

test.each(['/optional', '/optional/another'])(
  'optional path bindings use native params and export metadata at %s',
  async (path) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json(editResponse))
    vi.stubGlobal('fetch', fetch)
    const root = createRootRouteWithContext<{
      relayEnvironment: Environment
    }>()()
    const page = createRoute({
      getParentRoute: () => root,
      path: '/optional/{-$projectSlug}',
      loader: (args) => optionalEdit.loader(args),
      staticData: { preloads: [optionalEdit.preload] },
    })
    const router = createRouter({
      routeTree: root.addChildren([page]),
      history: createMemoryHistory({ initialEntries: [path] }),
      context: {
        relayEnvironment: createRelayEnvironment(createBootstrapReplay('[]')),
      },
      isServer: false,
      origin: 'http://localhost',
    })
    await router.load()
    const match = router.state.matches.at(-1)!
    expect(match.params).toEqual(
      path === '/optional' ? {} : { projectSlug: 'another' },
    )
    const expected = { slug: path === '/optional' ? 'atlas' : 'another' }
    expect(JSON.parse(String(fetch.mock.calls[0]![1]!.body)).variables).toEqual(
      expected,
    )
    expect(optionalEdit.variables(match.params)).toEqual(expected)
    expect(
      JSON.parse(compilePreloads(router, router.state.matches, true)).preloads,
    ).toEqual([
      { id: editRequest.params.id, variables: optionalEdit.preload.variables },
    ])
  },
)

test('one declaration supplies metadata, path variables, and shared query defaults', () => {
  const match = {
    params: { projectSlug: 'private-slug' },
    staticData: { preloads: [edit.preload] },
  }
  const text = compileRoutePreloads([match], true)
  expect(JSON.parse(text).preloads).toEqual([
    {
      id: editRequest.params.id,
      authenticated: true,
      variables: editBindings,
    },
  ])
  expect(text).not.toContain('private-slug')
  expect(edit.variables({ projectSlug: 'atlas' })).toEqual({ slug: 'atlas' })
  expect(queryEdit.variables({})).toEqual({ slug: 'fallback' })
  expect(workspace.variables({})).toEqual({})
  expect(projects.variables({})).toEqual({
    first: 6,
    after: null,
    anchor: null,
    search: null,
    status: null,
  })
  expect(
    projects.variables(
      {},
      new URLSearchParams('first=2&first=50&search=a;b&search=ignored'),
    ),
  ).toMatchObject({ first: 2, search: 'a;b' })
  expect(() => projects.variables({}, new URLSearchParams('first=01'))).toThrow(
    'Invalid value for first.',
  )
  expect(() =>
    compileRoutePreloads([{ ...match, params: { projectId: 'atlas' } }], true),
  ).toThrow('unknown path parameter projectSlug')
})

test('declarations validate their real compiled operation and accept development artifacts', () => {
  expect(() => defineWorkspace({ request: DeleteArtifact })).toThrow(
    'DeleteProjectDialogMutation must be a query.',
  )
  expect(() => defineWorkspace({ request: editRequest })).toThrow(
    'ProjectEditPageQuery needs a binding for slug.',
  )
  expect(() =>
    defineEdit({
      request: workspaceRequest,
      variables: editBindings,
    }),
  ).toThrow('WorkspaceQuery has no variable slug.')
  const invalid = JSON.parse(
    '{"slug":{"source":"path","name":"projectSlug","typo":true}}',
  )
  expect(() =>
    defineEdit({ request: editRequest, variables: invalid }),
  ).toThrow('ProjectEditPageQuery has an unknown binding field typo for slug.')
  expect(() =>
    defineEdit({
      request: editRequest,
      variables: {
        // @ts-expect-error Explicit undefined cannot supply a missing required value.
        slug: { source: 'path', default: undefined },
      },
    }),
  ).toThrow('ProjectEditPageQuery needs a defined default for slug.')
  const development = defineWorkspace({ request: WorkspaceArtifact })
  const metadata = compileRoutePreloads(
    [{ staticData: { preloads: [development.preload] } }],
    false,
  )
  expect(JSON.parse(metadata)).toEqual({ version: 1, preloads: [] })
})

test('private gating preserves bootstrap while cache policy reaches the native environment', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => json(editResponse))
  vi.stubGlobal('fetch', fetch)
  const environment = createRelayEnvironment(
    createBootstrapReplay(
      JSON.stringify([
        {
          id: editRequest.params.id,
          variables: { slug: 'atlas' },
          response: editResponse,
        },
      ]),
    ),
  )
  const args = {
    context: { relayEnvironment: environment, authenticated: false },
    params: { projectSlug: 'atlas' },
    location: { searchStr: '' },
    abortController: new AbortController(),
  }
  await expect(edit.fetch(args)).resolves.toBeUndefined()
  expect(fetch).not.toHaveBeenCalled()
  const authenticated = {
    ...args,
    context: { ...args.context, authenticated: true },
  }
  await expect(edit.fetch(authenticated)).resolves.toMatchObject({
    project: { slug: 'atlas' },
  })
  await edit.fetch(authenticated)
  expect(fetch).not.toHaveBeenCalled()
  const fresh = defineEdit({
    request: editRequest,
    variables: editBindings,
  })
  await fresh.fetch(authenticated)
  expect(fetch).toHaveBeenCalledOnce()
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    id: editRequest.params.id,
    variables: { slug: 'atlas' },
  })
})

test.each([true, false])(
  'native routes inherit authenticated=%s through a data-free intermediate route',
  async (authenticated) => {
    const viewer = {
      id: 'viewer:1',
      name: 'Reader',
      role: 'MAINTAINER',
      avatarUrl: null,
      canManageProjects: true,
    }
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        json({
          data: {
            viewer: authenticated ? viewer : null,
            serverInfo: { demoEnabled: true, githubEnabled: false },
          },
        }),
      )
      .mockResolvedValueOnce(json(editResponse))
    vi.stubGlobal('fetch', fetch)
    const environment = createRelayEnvironment(createBootstrapReplay('[]'))
    const root = createRootRouteWithContext<{
      relayEnvironment: Environment
    }>()()
    const session = createRoute({
      getParentRoute: () => root,
      path: 'workspace',
      ssr: false,
      beforeLoad: async (args) => ({
        authenticated: Boolean((await workspace.fetch(args))?.viewer),
      }),
    })
    const intermediate = createRoute({
      getParentRoute: () => session,
      path: 'nested',
    })
    let inheritedAuthenticated: boolean | undefined
    let ready: Promise<ProjectEditPageQuery['response'] | undefined> | undefined
    const detail = createRoute({
      getParentRoute: () => intermediate,
      path: 'projects/$projectSlug',
      loader: (args) => {
        inheritedAuthenticated = args.context.authenticated
        const loaded = edit.loader(args)
        ready = loaded.ready
        return loaded
      },
    })
    const router = createRouter({
      routeTree: root.addChildren([
        session.addChildren([intermediate.addChildren([detail])]),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/workspace/nested/projects/atlas'],
      }),
      context: { relayEnvironment: environment },
      isServer: false,
      origin: 'http://localhost',
    })
    await router.load()
    expect(inheritedAuthenticated).toBe(authenticated)
    await expect(ready).resolves.toEqual(
      authenticated
        ? expect.objectContaining({
            project: expect.objectContaining({ slug: 'atlas' }),
          })
        : undefined,
    )
    expect(fetch).toHaveBeenCalledTimes(authenticated ? 2 : 1)
  },
)

test.each(['complete', 'error', 'abort', 'pre-abort'])(
  'loader defers its %s outcome and forwards cancellation',
  async (outcome) => {
    let release!: (response: Response) => void
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      (_url, options) =>
        new Promise<Response>((resolve, reject) => {
          release = resolve
          options?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    if (outcome === 'pre-abort') controller.abort()
    const loaded = queryEdit.loader({
      context: {
        relayEnvironment: createRelayEnvironment(createBootstrapReplay('[]')),
        authenticated: true,
      },
      params: {},
      location: { searchStr: '?slug=atlas&slug=ignored' },
      abortController: controller,
    })
    expect(loaded.variables).toEqual({ slug: 'atlas' })
    if (outcome !== 'pre-abort') {
      expect(
        JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).variables,
      ).toEqual(loaded.variables)
    }
    expectTypeOf(loaded.ready).toEqualTypeOf<
      DeferredPromise<ProjectEditPageQuery['response'] | undefined>
    >()
    if (outcome === 'abort' || outcome === 'pre-abort') {
      controller.abort()
      await expect(loaded.ready).resolves.toBeUndefined()
      expect(fetch).toHaveBeenCalledTimes(outcome === 'abort' ? 1 : 0)
    } else if (outcome === 'error') {
      release(
        json({
          errors: [
            { message: 'Read denied.', extensions: { code: 'FORBIDDEN' } },
          ],
        }),
      )
      await expect(loaded.ready).rejects.toMatchObject({
        message: 'Read denied.',
        codes: ['FORBIDDEN'],
      })
    } else {
      release(json(editResponse))
      await expect(loaded.ready).resolves.toMatchObject({
        project: { slug: 'atlas' },
      })
    }
  },
)

test('generated variable and response types remain exact at native route call sites', () => {
  expectTypeOf(edit.variables({ projectSlug: 'atlas' })).toEqualTypeOf<
    ProjectEditPageQuery['variables']
  >()
  expectTypeOf(workspace.variables({})).toEqualTypeOf<
    WorkspaceQuery['variables']
  >()
  expectTypeOf<ReturnType<typeof edit.fetch>>().toEqualTypeOf<
    Promise<ProjectEditPageQuery['response'] | undefined>
  >()
  if (false) {
    defineEdit({
      request: editRequest,
      // @ts-expect-error Every declared variable requires a binding.
      variables: {},
    })
    defineEdit({
      request: editRequest,
      variables: {
        slug: editBindings.slug,
        // @ts-expect-error Extra query variables are rejected.
        extra: { source: 'literal', value: 'extra' },
      },
    })
    defineWorkspace({
      request: workspaceRequest,
      variables: {
        // @ts-expect-error A query with no variables also rejects extra bindings.
        extra: { source: 'literal', value: 'extra' },
      },
    })
    defineEdit({
      request: editRequest,
      variables: {
        // @ts-expect-error Slug is a string variable.
        slug: { source: 'literal', value: 1 },
      },
    })
    defineEdit({
      request: editRequest,
      variables: {
        slug: {
          ...editBindings.slug,
          // @ts-expect-error Unknown path binding fields are rejected.
          typo: true,
        },
      },
    })
    defineRouteQuery<ProjectsPageQuery>()({
      request: ProjectsArtifact,
      variables: {
        ...projectBindings,
        search: {
          source: 'query',
          // @ts-expect-error Nullable query bindings still reject misspelled options.
          deafult: null,
        },
      },
    })
    // @ts-expect-error Path parameter names must match the declaration.
    edit.variables({ projectId: 'atlas' })
    // @ts-expect-error Required path parameters cannot be omitted.
    edit.variables({})
    // @ts-expect-error Native path parameter values must be strings.
    edit.variables({ projectSlug: 1 })
    optionalEdit.variables({})
    createRoute({
      getParentRoute: () =>
        createRootRouteWithContext<{ relayEnvironment: Environment }>()(),
      path: '/optional/{-$projectSlug}',
      loader: (args) => optionalEdit.loader(args),
    })
    createRoute({
      getParentRoute: () =>
        createRootRouteWithContext<{ relayEnvironment: Environment }>()(),
      path: '/optional/{-$wrongName}',
      loader: (args) => {
        // @ts-expect-error Defaults still require the declared parameter name on the route.
        return optionalEdit.loader(args)
      },
    })
    createRoute({
      getParentRoute: () =>
        createRootRouteWithContext<{
          relayEnvironment: Environment
          authenticated: boolean
        }>()(),
      path: '/optional/{-$projectSlug}',
      loader: (args) => {
        // @ts-expect-error Optional parameters need an explicit default for a required variable.
        return edit.loader(args)
      },
    })
    const args = {
      context: { relayEnvironment: createRelayEnvironment() },
      params: { projectSlug: 'atlas' },
      location: { searchStr: '' },
      abortController: new AbortController(),
    }
    // @ts-expect-error Private declarations require the authenticated context boolean.
    edit.fetch(args)
    createFileRoute('/_app/projects_/$projectSlug_/edit')({
      loader: edit.loader,
    })
    createFileRoute('/_app/projects')({
      loader: (args) => {
        // @ts-expect-error This native route has no projectSlug parameter.
        return edit.loader(args)
      },
    })
  }
})
