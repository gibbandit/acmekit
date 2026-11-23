import { createOperationDescriptor, type ConcreteRequest } from 'relay-runtime'
import { expect, test } from 'vitest'
import { resolveVariables } from './preloads.ts'
import {
  compileRoutePreloads as compilePreloads,
  type Preload,
} from './route-preloads.ts'
import {
  createRootRoute,
  createRoute,
  createRouter,
  type StaticDataRouteOption,
} from '@tanstack/react-router'

function compileRoutePreloads(
  matches: readonly {
    params?: Record<string, unknown>
    staticData?: StaticDataRouteOption
  }[],
  persisted: boolean,
) {
  const root = createRootRoute()
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

function request(name: string, variables: string[] = []): ConcreteRequest {
  const argumentDefinitions = variables.map((name) => ({
    kind: 'LocalArgument' as const,
    name,
    defaultValue: null,
  }))
  return {
    kind: 'Request',
    fragment: {
      kind: 'Fragment',
      name,
      type: 'Query',
      metadata: null,
      argumentDefinitions,
      selections: [],
    },
    operation: { kind: 'Operation', name, argumentDefinitions, selections: [] },
    params: {
      id: name,
      name,
      operationKind: 'query',
      metadata: {},
      text: null,
    },
  }
}

test('rejects stale path bindings after a route parameter is renamed', () => {
  const matches = [
    {
      params: { projectSlug: 'example' },
      staticData: {
        preloads: [
          {
            request: request('ProjectQuery', ['slug']),
            variables: { slug: { source: 'path' as const, name: 'projectId' } },
          },
        ],
      },
    },
  ]
  expect(() => compileRoutePreloads(matches, true)).toThrow(
    'ProjectQuery binds slug to an unknown path parameter projectId.',
  )
})

test('inherits root and layout preloads in match order for an unrelated nested dynamic route', () => {
  const matches: {
    staticData?: { preloads?: readonly Preload[] }
    params?: Record<string, string>
  }[] = [
    {
      staticData: {
        preloads: [{ request: request('SessionQuery'), variables: {} }],
      },
    },
    { staticData: {} },
    {
      staticData: {
        preloads: [
          {
            request: request('RegionQuery', ['region']),
            variables: {
              region: { source: 'path', name: 'regionKey' },
            },
          },
        ],
      },
    },
    {
      params: { regionKey: 'private-region', recordKey: 'private-record' },
      staticData: {
        preloads: [
          {
            request: request('RecordQuery', ['id', 'search']),
            authenticated: true,
            variables: {
              id: { source: 'path', name: 'recordKey' },
              search: { source: 'query', name: 'q', default: null },
            },
          },
        ],
      },
    },
  ]

  const serialized = compileRoutePreloads(matches, true)
  const metadata = JSON.parse(serialized)
  expect(metadata).toEqual({
    version: 1,
    preloads: [
      { id: 'SessionQuery', variables: {} },
      {
        id: 'RegionQuery',
        variables: { region: { source: 'path', name: 'regionKey' } },
      },
      {
        id: 'RecordQuery',
        authenticated: true,
        variables: {
          id: { source: 'path', name: 'recordKey' },
          search: { source: 'query', name: 'q', default: null },
        },
      },
    ],
  })
  expect(
    resolveVariables(
      metadata.preloads[2].variables,
      { recordKey: 'record-42' },
      new URLSearchParams('q=annual'),
    ),
  ).toEqual({ id: 'record-42', search: 'annual' })
  expect(serialized).not.toContain('private-region')
  expect(serialized).not.toContain('private-record')
  expect(serialized).not.toContain('"request"')
  expect(serialized).not.toContain('"fragment"')
  expect(serialized).not.toContain('"operation"')
})

test('exports no implicit preloads when matches have no declarations', () => {
  expect(
    JSON.parse(
      compileRoutePreloads([{ staticData: { preloadTimeoutMs: 1000 } }], true),
    ),
  ).toEqual({ version: 1, preloads: [] })
})

test.each([undefined, 250, 0])(
  'emits one shared timeout with page override %s',
  (pageTimeout) => {
    const matches = [
      { staticData: { preloadTimeoutMs: 1000 } },
      {
        staticData: {
          preloads: [{ request: request('WorkspaceQuery'), variables: {} }],
        },
      },
      {
        staticData: {
          preloadTimeoutMs: pageTimeout,
          preloads: [{ request: request('ReportsQuery'), variables: {} }],
        },
      },
    ]

    expect(JSON.parse(compileRoutePreloads(matches, true))).toEqual({
      version: 1,
      preloads: [
        { id: 'WorkspaceQuery', variables: {} },
        { id: 'ReportsQuery', variables: {} },
      ],
      preloadTimeoutMs: pageTimeout ?? 1000,
    })
    expect(JSON.parse(compileRoutePreloads(matches, false))).toEqual({
      version: 1,
      preloads: [],
    })
  },
)

test('preload bindings resolve to the same defaults as Relay network variables', () => {
  const original = request('RecordQuery', ['limit', 'offset', 'label', 'id'])
  const query: ConcreteRequest = {
    ...original,
    operation: {
      ...original.operation,
      argumentDefinitions: original.operation.argumentDefinitions.map(
        (argument, index) => ({
          ...argument,
          defaultValue: [8, 2, 'all', 'latest'][index],
        }),
      ),
    },
  }
  const variables = {
    limit: { source: 'query', type: 'int' },
    offset: { source: 'query', type: 'int', default: 0 },
    label: { source: 'literal', value: null },
    id: { source: 'path', name: 'recordId', default: null },
  } as const
  const { preloads } = JSON.parse(
    compileRoutePreloads(
      [
        {
          params: { recordId: 'example' },
          staticData: { preloads: [{ request: query, variables }] },
        },
      ],
      true,
    ),
  )

  for (const [params, search] of [
    [{}, new URLSearchParams()],
    [{ recordId: 'record-42' }, new URLSearchParams('limit=4&offset=1')],
  ] as const) {
    const relay = createOperationDescriptor(
      query,
      resolveVariables(variables, params, search),
    ).request.variables
    expect(resolveVariables(preloads[0].variables, params, search)).toEqual(
      relay,
    )
  }
})

test('development emits empty metadata without exposing query text or requiring persisted IDs', () => {
  const original = request('RecordQuery')
  const query: ConcreteRequest = {
    ...original,
    params: {
      name: 'RecordQuery',
      id: null,
      cacheID: 'RecordQuery',
      operationKind: 'query',
      metadata: {},
      text: 'query RecordQuery { privateRecord { secretField } }',
    },
  }
  const serialized = compileRoutePreloads(
    [
      {
        staticData: {
          preloads: [{ request: query, variables: {} }],
        },
      },
    ],
    false,
  )
  expect(JSON.parse(serialized)).toEqual({ version: 1, preloads: [] })
  expect(serialized).not.toContain('secretField')
})

test('escapes inline-script delimiters while preserving declared literal values', () => {
  const value = '</script><script>alert("unsafe")</script>\u2028\u2029'
  const serialized = compileRoutePreloads(
    [
      {
        staticData: {
          preloads: [
            {
              request: request('RecordQuery', ['message']),
              variables: { message: { source: 'literal', value } },
            },
          ],
        },
      },
    ],
    true,
  )
  expect(serialized).not.toContain('<')
  expect(JSON.parse(serialized).preloads[0].variables.message.value).toBe(value)
})

test.each(['missing ID', 'mutation'] as const)(
  'rejects a production request with %s',
  (failure) => {
    const original = request('RecordQuery')
    const query: ConcreteRequest = {
      ...original,
      params:
        failure === 'missing ID'
          ? { ...original.params, id: null, cacheID: 'RecordQuery' }
          : { ...original.params, operationKind: 'mutation' },
    }
    expect(() =>
      compileRoutePreloads(
        [
          {
            staticData: {
              preloads: [{ request: query, variables: {} }],
            },
          },
        ],
        true,
      ),
    ).toThrow(/RecordQuery/)
  },
)

const invalidBindings: [Preload['variables'], RegExp][] = [
  [
    {
      id: { source: 'path', name: 'recordKey' },
      extra: { source: 'literal', value: true },
    },
    /extra/,
  ],
  [{}, /id/],
]

test.each(invalidBindings)(
  'rejects invalid variable declarations %#',
  (variables, message) => {
    expect(() =>
      compileRoutePreloads(
        [
          {
            staticData: {
              preloads: [
                { request: request('RecordQuery', ['id']), variables },
              ],
            },
          },
        ],
        true,
      ),
    ).toThrow(message)
  },
)

test.each(['constructor', 'toString', '__proto__'])(
  'rejects a missing binding for prototype property %s',
  (variable) => {
    expect(() =>
      compileRoutePreloads(
        [
          {
            staticData: {
              preloads: [
                {
                  request: request('RecordQuery', [variable]),
                  variables: {},
                },
              ],
            },
          },
        ],
        true,
      ),
    ).toThrow(`RecordQuery needs a binding for ${variable}.`)
  },
)
