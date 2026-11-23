import { expect, test } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  projectPage,
  validateProjectSearch,
  projectVariables,
} from '../features/projects/project-variables'
import { parseSearchParams, stringifySearchParams } from './search-params'

test('preserves quoted, JSON, numeric-looking, and boolean-looking text', () => {
  for (const value of [
    '"quoted"',
    '{"term": "blue", "active": true}',
    '["one","two"]',
    'true',
    'false',
    'null',
    '001',
    '1e3',
    ' 17 ',
    '0',
    '',
    'café + /?&#',
  ]) {
    const query = new URLSearchParams({ search: value }).toString()
    const parsed = parseSearchParams(query)
    expect(parsed.search).toBe(value)
    expect(
      new URLSearchParams(stringifySearchParams(parsed)).get('search'),
    ).toBe(value)
  }
})

test('keeps duplicate values in order and preserves first-value project bindings', () => {
  const parsed = parseSearchParams(
    '?search=portal&status=ACTIVE&search=service&first=6',
  )
  expect(parsed).toEqual({
    search: ['portal', 'service'],
    status: 'ACTIVE',
    first: '6',
  })
  const serialized = new URLSearchParams(stringifySearchParams(parsed))
  expect(serialized.getAll('search')).toEqual(['portal', 'service'])
  expect(projectVariables(serialized)).toEqual({
    search: 'portal',
    status: 'ACTIVE',
    first: 6,
    after: null,
    anchor: null,
  })
})

test('retains empty values and produces no question mark for empty search', () => {
  expect(parseSearchParams('')).toEqual({})
  expect(parseSearchParams('?flag&empty=')).toEqual({ flag: '', empty: '' })
  expect(stringifySearchParams(parseSearchParams('?flag&empty='))).toBe(
    '?flag=&empty=',
  )
  expect(stringifySearchParams({})).toBe('')
})

test('omits cleared values without dropping false, zero, or empty strings', () => {
  const result = new URLSearchParams(
    stringifySearchParams({
      search: null,
      after: undefined,
      first: 0,
      enabled: false,
      repeated: ['', null, undefined, 'tail'],
    }),
  )
  expect([...result.entries()]).toEqual([
    ['first', '0'],
    ['enabled', 'false'],
    ['repeated', ''],
    ['repeated', 'tail'],
  ])
})

test('serializes object values as JSON while leaving scalar strings verbatim', () => {
  const result = new URLSearchParams(
    stringifySearchParams({
      object: { term: 'blue' },
      literal: '{"term": "blue"}',
      repeated: [1, false, { term: 'blue' }],
    }),
  )
  expect(result.get('object')).toBe('{"term":"blue"}')
  expect(result.get('literal')).toBe('{"term": "blue"}')
  expect(result.getAll('repeated')).toEqual(['1', 'false', '{"term":"blue"}'])
})

test('treats prototype property names as ordinary query keys', () => {
  const parsed = parseSearchParams(
    '?__proto__=literal&constructor=first&constructor=second&toString=',
  )
  expect(Object.getPrototypeOf(parsed)).toBe(null)
  expect(parsed.__proto__).toBe('literal')
  expect(parsed.constructor).toEqual(['first', 'second'])
  expect(parsed.toString).toBe('')
  expect(
    new URLSearchParams(stringifySearchParams(parsed)).getAll('constructor'),
  ).toEqual(['first', 'second'])
})

test('TanStack preserves literal and repeated values in its initial location and navigation', () => {
  const root = createRootRoute()
  const projects = createRoute({
    getParentRoute: () => root,
    path: '/projects',
    validateSearch: validateProjectSearch,
    loaderDeps: ({ search }) => projectVariables(search),
  })
  const query = '?search=%22blue%22&search=tail&first=6&after=a%2Fb'
  const router = createRouter({
    routeTree: root.addChildren([projects]),
    history: createMemoryHistory({ initialEntries: [`/projects${query}`] }),
    parseSearch: parseSearchParams,
    stringifySearch: stringifySearchParams,
    trailingSlash: 'never',
  })
  expect(router.state.location.searchStr).toBe(query)
  const initial = new URLSearchParams(router.state.location.searchStr)
  expect(projectVariables(initial)).toEqual({
    search: '"blue"',
    status: null,
    first: 6,
    after: null,
    anchor: 'a/b',
  })
  const next = router.buildLocation({
    to: '/projects',
    search: (previous) => ({ ...previous, status: 'ACTIVE' }),
  })
  const updated = new URLSearchParams(next.searchStr)
  expect(updated.getAll('search')).toEqual(['"blue"', 'tail'])
  expect(updated.get('status')).toBe('ACTIVE')

  const expanded = router.buildLocation({
    to: '/projects',
    search: (previous) => ({ ...previous, page: 3, keep: ['one', 'two'] }),
    hash: 'documentation-anchor',
  })
  const expandedSearch = validateProjectSearch(expanded.search)
  expect(projectPage(expandedSearch)).toBe(3)
  expect(projectVariables(expandedSearch)).toEqual(projectVariables(initial))
  expect(new URLSearchParams(expanded.searchStr).getAll('search')).toEqual([
    '"blue"',
    'tail',
  ])
  expect(new URLSearchParams(expanded.searchStr).getAll('keep')).toEqual([
    'one',
    'two',
  ])
  expect(expanded.hash).toBe('documentation-anchor')
})
