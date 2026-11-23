import { expect, test } from 'vitest'
import {
  projectPage,
  validateProjectSearch,
  projectVariables,
} from './project-variables'
import { parseSearchParams } from '../../lib/search-params'

const queryDecodingCases: {
  query: string
  values: Record<string, string[]>
}[] = [
  { query: 'search=a;b', values: { search: ['a;b'] } },
  { query: 'search=a%3Bb', values: { search: ['a;b'] } },
  {
    query: 'keep=%zz;a&search=portal',
    values: { keep: ['%zz;a'], search: ['portal'] },
  },
  {
    query: 'search=%zz&search=second',
    values: { search: ['%zz', 'second'] },
  },
  { query: 'search=%&search=%2', values: { search: ['%', '%2'] } },
  {
    query: 'search=one+two%2Bthree%25',
    values: { search: ['one two+three%'] },
  },
  {
    query: 'search=caf%C3%A9%F0%9F%98%80',
    values: { search: ['café😀'] },
  },
  { query: 'search=%E0%A4', values: { search: ['\uFFFD'] } },
  { query: 'search=%E1%80%E1%80', values: { search: ['\uFFFD\uFFFD'] } },
  { query: 'search=%ED%A0%80', values: { search: ['\uFFFD\uFFFD\uFFFD'] } },
  {
    query: 'search=%F4%90%80%80',
    values: { search: ['\uFFFD\uFFFD\uFFFD\uFFFD'] },
  },
  {
    query: '%E0%A4=first&%EF%BF%BD=second',
    values: { '\uFFFD': ['first', 'second'] },
  },
  {
    query: '%73earch=first&search=second&keep=%zz;a',
    values: { search: ['first', 'second'], keep: ['%zz;a'] },
  },
  {
    query: '=empty&&flag&search=a=b&search=second',
    values: { '': ['empty'], flag: [''], search: ['a=b', 'second'] },
  },
  { query: 'search=%EF%BB%BFvalue', values: { search: ['\uFEFFvalue'] } },
  { query: '', values: {} },
]

test.each(queryDecodingCases)(
  'query decoding matches Go bootstrap for $query',
  ({ query, values }) => {
    const params = new URLSearchParams(query)
    const parsed = parseSearchParams(`?${query}`)
    expect(parsed).toEqual(
      Object.fromEntries(
        Object.entries(values).map(([name, items]) => [
          name,
          items.length === 1 ? items[0] : items,
        ]),
      ),
    )
    const variables = {
      search: values.search?.[0]?.trim() || null,
      status: null,
      first: 6,
      after: null,
      anchor: null,
    }
    expect(projectVariables(params)).toEqual(variables)
    expect(projectVariables(validateProjectSearch(parsed))).toEqual(variables)
  },
)

test.each(['first=%zz', 'first=1;first=2', 'first=%E0%A4'])(
  'forgiving URL decoding keeps integer validation for %s',
  (query) => {
    expect(() => projectVariables(new URLSearchParams(query))).toThrow(
      'Invalid value for first.',
    )
  },
)

test('missing and blank parameters preserve the server binding defaults', () => {
  for (const query of [
    '',
    'search=&status=&first=&after=',
    'search=+&status=+&first=+&after=+',
  ]) {
    expect(projectVariables(new URLSearchParams(query))).toEqual({
      search: null,
      status: null,
      first: 6,
      after: null,
      anchor: null,
    })
  }
})

test('query bindings trim whitespace while preserving quotes and cursor contents', () => {
  const params = new URLSearchParams({
    search: '  "draft"  ',
    after: ' cursor ',
  })
  expect(projectVariables(params)).toEqual({
    search: '"draft"',
    status: null,
    first: 6,
    after: null,
    anchor: 'cursor',
  })
})

test.each(['"draft"', 'null', 'true', '[1,2]', '{"q":"draft"}'])(
  'literal URL search %s remains a string rather than JSON state',
  (search) => {
    expect(projectVariables(new URLSearchParams({ search }))).toEqual({
      search,
      status: null,
      first: 6,
      after: null,
      anchor: null,
    })
  },
)

test.each([
  { query: 'first=1&status=ACTIVE', first: 1, status: 'ACTIVE' },
  { query: 'first=50&status=ARCHIVED', first: 50, status: 'ARCHIVED' },
  { query: 'first=+2+&status=+PLANNED+', first: 2, status: 'PLANNED' },
])(
  'valid project filters match the Go binding contract for $query',
  ({ query, first, status }) => {
    expect(projectVariables(new URLSearchParams(query))).toEqual({
      first,
      status,
      after: null,
      anchor: null,
      search: null,
    })
  },
)

test.each(['01', '2junk', '0', '51', '-1', '2147483648', '1.5'])(
  'malformed page size %s cannot bypass the shared strict binding',
  (value) => {
    expect(() =>
      projectVariables(new URLSearchParams({ first: value })),
    ).toThrow('Invalid value for first.')
  },
)

test.each(['active', 'ALL', 'DELETED'])(
  'unsupported status %s cannot bypass the shared strict binding',
  (value) => {
    expect(() =>
      projectVariables(new URLSearchParams({ status: value })),
    ).toThrow('Invalid value for status.')
  },
)

test('repeated parameters use the first value, including empty and invalid values', () => {
  const params = new URLSearchParams(
    'first=2&first=50&search=%22draft%22&search=ignored',
  )
  expect(projectVariables(params)).toEqual({
    first: 2,
    search: '"draft"',
    status: null,
    after: null,
    anchor: null,
  })
  expect(
    projectVariables(
      new URLSearchParams('first=&first=2&search=&search=ignored'),
    ),
  ).toEqual({
    first: 6,
    search: null,
    status: null,
    after: null,
    anchor: null,
  })
  expect(() =>
    projectVariables(new URLSearchParams('first=01&first=2')),
  ).toThrow('Invalid value for first.')
})

test.each([
  { query: '', page: 1 },
  { query: 'page=', page: 1 },
  { query: 'page=+', page: 1 },
  { query: 'page=1', page: 1 },
  { query: 'page=+2+', page: 2 },
  { query: 'page=2147483647', page: 2147483647 },
])('browser view depth resolves $query to $page', ({ query, page }) => {
  expect(projectPage(new URLSearchParams(query))).toBe(page)
})

test.each(['0', '-1', '01', '2junk', '1.5', '1e2', '2147483648'])(
  'browser view depth rejects malformed page %s',
  (page) => {
    expect(() => projectPage(new URLSearchParams({ page }))).toThrow(
      'Invalid value for page.',
    )
  },
)

test('browser view depth uses the first repeated value', () => {
  expect(projectPage(new URLSearchParams('page=2&page=50'))).toBe(2)
  expect(projectPage(new URLSearchParams('page=&page=2'))).toBe(1)
  expect(() => projectPage(new URLSearchParams('page=01&page=2'))).toThrow(
    'Invalid value for page.',
  )
})

test('browser view depth does not enter GraphQL or Go bootstrap variables', () => {
  const params = new URLSearchParams({
    first: '2',
    after: 'cursor',
    search: '"draft"',
    status: 'ACTIVE',
    page: '3',
  })
  const expected = {
    first: 2,
    after: null,
    anchor: 'cursor',
    search: '"draft"',
    status: 'ACTIVE',
  }
  expect(projectPage(params)).toBe(3)
  expect(projectVariables(params)).toEqual(expected)
  params.delete('page')
  expect(projectVariables(params)).toEqual(expected)
})

test('typed Router search retains literal repeated values and unrelated keys', () => {
  const query =
    '?search=%22blue%22&search=tail&first=2&first=50&after=a%2Fb&page=3&keep=one&keep=two'
  const raw = parseSearchParams(query)
  const search = validateProjectSearch(raw)
  expect(search).toBe(raw)
  expect(projectVariables(search)).toEqual(
    projectVariables(new URLSearchParams(query)),
  )
  expect(projectPage(search)).toBe(3)
})

test('typed Router search accepts native numeric updates and cleared filters', () => {
  const search = validateProjectSearch({
    first: 2,
    page: 3,
    status: null,
    search: undefined,
    after: undefined,
    keep: ['one', 'two'],
  })
  expect(projectVariables(search)).toEqual({
    first: 2,
    after: null,
    anchor: null,
    status: null,
    search: null,
  })
  expect(projectPage(search)).toBe(3)
  expect(search.keep).toEqual(['one', 'two'])
})

test.each([
  { first: ['01', '2'] },
  { status: ['DELETED', 'ACTIVE'] },
  { page: ['0', '2'] },
])('typed Router validation rejects invalid first values: %j', (search) => {
  expect(() => validateProjectSearch(search)).toThrow('Invalid value for')
})

test.each([
  { search: true },
  { status: ['ACTIVE', 1] },
  { after: { cursor: 'value' } },
  { first: false },
  { page: [2, {}] },
])('typed Router validation rejects unsupported value shapes: %j', (search) => {
  expect(() => validateProjectSearch(search)).toThrow(
    'Invalid project filters.',
  )
})
