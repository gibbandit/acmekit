import type { ProjectsPageQuery$variables } from '@relay/ProjectsPageQuery.graphql'
import { RequestError } from '../../lib/errors'
import { resolveVariables } from '../../lib/route-query'
import type { VariableBinding } from '@acmekit/route-adapter/runtime'

export const projectBindings = {
  search: { source: 'query', name: 'search', default: null },
  status: {
    source: 'query',
    name: 'status',
    default: null,
    values: ['ACTIVE', 'PLANNED', 'ARCHIVED'] as const,
  },
  first: {
    source: 'query',
    name: 'first',
    type: 'int',
    default: 6,
    min: 1,
    max: 50,
  },
  after: { source: 'literal', value: null },
  anchor: { source: 'query', name: 'after', default: null },
} satisfies Record<string, VariableBinding>

type TextValue = string | string[] | null | undefined
type NumberValue = string | number | (string | number)[] | null | undefined
type ProjectSearch = Record<string, unknown> & {
  search?: TextValue
  status?: TextValue
  after?: TextValue
  first?: NumberValue
  page?: NumberValue
}

function isText(value: unknown): value is TextValue {
  return (
    value == null ||
    typeof value === 'string' ||
    (Array.isArray(value) &&
      value.every((item: unknown) => typeof item === 'string'))
  )
}

function isNumberText(value: unknown): value is NumberValue {
  return (
    isText(value) ||
    typeof value === 'number' ||
    (Array.isArray(value) &&
      value.every(
        (item: unknown) => typeof item === 'string' || typeof item === 'number',
      ))
  )
}

function isProjectSearch(
  search: Record<string, unknown>,
): search is ProjectSearch {
  return (
    isText(search.search) &&
    isText(search.status) &&
    isText(search.after) &&
    isNumberText(search.first) &&
    isNumberText(search.page)
  )
}

function queryValues(search: URLSearchParams | ProjectSearch) {
  if (search instanceof URLSearchParams) return search
  return {
    get(name: string) {
      const raw = search[name]
      const first = Array.isArray(raw) ? raw[0] : raw
      return first == null ? null : String(first)
    },
  }
}

export function projectVariables(search: URLSearchParams | ProjectSearch) {
  const variables = resolveVariables(projectBindings, {}, queryValues(search))
  const { first, after, anchor, search: term, status } = variables
  if (
    typeof first !== 'number' ||
    after !== null ||
    !(anchor === null || typeof anchor === 'string') ||
    !(term === null || typeof term === 'string') ||
    !isStatus(status)
  ) {
    throw new Error('Project variable bindings produced an unexpected type.')
  }
  return {
    first,
    after,
    anchor,
    search: term,
    status,
  } satisfies ProjectsPageQuery$variables
}

function isStatus(
  value: unknown,
): value is (typeof projectBindings.status.values)[number] | null {
  return (
    value === null ||
    projectBindings.status.values.some((status) => status === value)
  )
}

const pageBindings = {
  page: { source: 'query', type: 'int', default: 1, min: 1, max: 2147483647 },
} satisfies Record<string, VariableBinding>

/** Browser-only view depth; each GraphQL request keeps its own page-size limit. */
export function projectPage(search: URLSearchParams | ProjectSearch): number {
  const { page } = resolveVariables(pageBindings, {}, queryValues(search))
  if (typeof page !== 'number') {
    throw new Error('Project page binding produced an unexpected type.')
  }
  return page
}

/** Validate shared bindings without changing literal, repeated, or unrelated values. */
export function validateProjectSearch(
  search: Record<string, unknown>,
): ProjectSearch {
  if (!isProjectSearch(search)) {
    throw new RequestError('Invalid project filters.', ['BAD_USER_INPUT'])
  }
  projectVariables(search)
  projectPage(search)
  return search
}
