import { getRequest, type GraphQLTaggedNode } from 'relay-runtime'
import type { StaticDataRouteOption } from '@tanstack/react-router'
import { getRouteSegments, type AnyRouter } from '@tanstack/router-core'
import type { VariableBinding } from './preloads.ts'

export type Preload = {
  request: GraphQLTaggedNode
  authenticated?: boolean
  variables: Record<string, VariableBinding>
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    preloads?: readonly Preload[]
    preloadTimeoutMs?: number
  }
}

export const preloadMetadataElementId = 'route-preloads'

/** Export declarations only; concrete parameters are resolved by Go per request. */
export function compileRoutePreloads(
  router: Pick<AnyRouter, 'routesById'>,
  matches: readonly {
    routeId: string
    staticData?: StaticDataRouteOption
  }[],
  persisted: boolean,
): string {
  const pathParams = new Set(
    matches.flatMap(({ routeId }) => {
      const route = router.routesById[routeId]
      if (!route) throw new Error(`Unknown route ${routeId}.`)
      return (getRouteSegments(route) ?? []).flatMap((segment) =>
        typeof segment === 'string' ? [] : [segment[1]],
      )
    }),
  )
  const preloads = persisted
    ? matches.flatMap(({ staticData }) =>
        (staticData?.preloads ?? []).map(({ request, ...preload }) => {
          const operation = getRequest(request)
          const { id, name, operationKind } = operation.params
          if (operationKind !== 'query' || !id) {
            throw new Error(
              `Missing persisted query ${name}; regenerate the Relay artifacts.`,
            )
          }
          const declared = new Map<string, unknown>(
            operation.operation.argumentDefinitions.map(
              ({ name, defaultValue }) => [name, defaultValue],
            ),
          )
          for (const variable of Object.keys(preload.variables)) {
            if (!declared.has(variable)) {
              throw new Error(`${name} has no variable ${variable}.`)
            }
          }
          for (const variable of declared.keys()) {
            if (!Object.hasOwn(preload.variables, variable)) {
              throw new Error(`${name} needs a binding for ${variable}.`)
            }
          }
          const variables = { ...preload.variables }
          for (const [variable, binding] of Object.entries(variables)) {
            if (
              binding.source === 'path' &&
              !pathParams.has(binding.name ?? variable)
            ) {
              throw new Error(
                `${name} binds ${variable} to an unknown path parameter ${binding.name ?? variable}.`,
              )
            }
            const defaultValue = declared.get(variable)
            if (defaultValue != null) {
              variables[variable] =
                binding.source === 'literal'
                  ? { ...binding, value: binding.value ?? defaultValue }
                  : { ...binding, default: binding.default ?? defaultValue }
            }
          }
          return { id, ...preload, variables }
        }),
      )
    : []
  let preloadTimeoutMs: number | undefined
  if (preloads.length) {
    for (const { routeId, staticData } of matches) {
      const timeout = staticData?.preloadTimeoutMs
      if (timeout === undefined) continue
      if (!Number.isInteger(timeout) || timeout < 0 || timeout > 0xffffffff) {
        throw new Error(`Invalid preloadTimeoutMs for route ${routeId}.`)
      }
      preloadTimeoutMs = timeout
    }
  }
  // Keep literal bindings from closing the inert JSON script element.
  return JSON.stringify({ version: 1, preloads, preloadTimeoutMs }).replace(
    /</g,
    '\\u003c',
  )
}

/** Keep the exact document metadata through hydration and client navigation. */
export function readPreloadMetadataText(serverText: string): string {
  if (typeof document === 'undefined') return serverText
  return (
    document.getElementById(preloadMetadataElementId)?.textContent ?? serverText
  )
}
