import { defer } from '@tanstack/react-router'
import {
  getRequest,
  type Environment,
  type GraphQLTaggedNode,
  type OperationType,
} from 'relay-runtime'
import { fetchRouteQuery } from './fetch-route-query.ts'
import {
  resolveVariables as decodeVariables,
  type InvalidVariable,
  type VariableBinding,
} from './preloads.ts'
import type { Preload } from './route-preloads.ts'

type Present<Value> = Exclude<Value, null | undefined>

type ScalarBinding<Value> = [Present<Value>] extends [never]
  ? never
  : Present<Value> extends number
    ? number extends Present<Value>
      ? { type: 'int'; min?: number; max?: number; values?: never }
      : never
    : Present<Value> extends boolean
      ? boolean extends Present<Value>
        ? { type: 'boolean'; min?: never; max?: never; values?: never }
        : never
      : Present<Value> extends string
        ? {
            type?: 'string'
            min?: never
            max?: never
          } & (string extends Present<Value>
            ? { values?: readonly Present<Value>[] }
            : { values: readonly Present<Value>[] })
        : never

type RouteVariableBinding<Value> =
  | {
      source: 'literal'
      value: Exclude<Value, undefined>
      name?: never
      type?: never
      default?: never
      values?: never
      min?: never
      max?: never
    }
  | ({
      source: 'path'
      name?: string
      default?: Exclude<Value, undefined>
      value?: never
    } & ScalarBinding<Value>)
  | ({ source: 'query'; name?: string; value?: never } & ScalarBinding<Value> &
      (null extends Value
        ? { default?: Exclude<Value, undefined> }
        : { default: Exclude<Value, undefined> }))

// Relay represents a query without variables as Record<PropertyKey, never>.
type VariableNames<Variables> = {
  [Name in keyof Variables]-?: [Variables[Name]] extends [never] ? never : Name
}[keyof Variables] &
  string

export type RouteQueryBindings<Variables> = {
  [Name in VariableNames<Variables>]: RouteVariableBinding<Variables[Name]>
}

type ExactBindings<Variables, Bindings> = Bindings &
  Record<Exclude<keyof Bindings, VariableNames<Variables>>, never> & {
    [Name in keyof Bindings]: Record<
      Exclude<keyof Bindings[Name], keyof VariableBinding>,
      never
    > &
      (Bindings[Name] extends { default: infer Default }
        ? undefined extends Default
          ? { default: never }
          : unknown
        : unknown)
  }

type PathNames<Bindings> = keyof PathParams<Bindings>

type PathParams<Bindings> = {
  [
    Name in keyof Bindings as Bindings[Name] extends { source: 'path' }
      ? Bindings[Name] extends { default: unknown }
        ? never
        : Bindings[Name] extends { name: infer Parameter extends string }
          ? Parameter
          : Extract<Name, string>
      : never
  ]: string
} & {
  [
    Name in keyof Bindings as Bindings[Name] extends {
      source: 'path'
      default: unknown
    }
      ? Bindings[Name] extends { name: infer Parameter extends string }
        ? Parameter
        : Extract<Name, string>
      : never
  ]?: string
}

type KnownPathParams<Bindings, Params> = Params &
  Record<Exclude<PathNames<Bindings>, keyof Params>, never>

type QueryArguments<
  Bindings,
  Authenticated extends boolean,
  Params extends PathParams<Bindings>,
> = {
  context: {
    relayEnvironment: Environment
    authenticated?: boolean
  } & (true extends Authenticated ? { authenticated: boolean } : unknown)
  params: KnownPathParams<Bindings, Params>
  location: { searchStr: string }
  abortController: AbortController
}

type FetchPolicy = 'network-only' | 'store-or-network'

const bindingFields = {
  source: true,
  name: true,
  type: true,
  value: true,
  default: true,
  values: true,
  min: true,
  max: true,
} satisfies Record<keyof VariableBinding, true>

/** Configure application-specific validation errors once for all route queries. */
export function createRouteQueries(
  configuration: {
    invalidVariable?: InvalidVariable
  } = {},
) {
  function resolveVariables(
    bindings: Record<string, VariableBinding>,
    params: Record<string, string | undefined>,
    search: Pick<URLSearchParams, 'get'>,
  ) {
    return decodeVariables(
      bindings,
      params,
      search,
      configuration.invalidVariable,
    )
  }

  /**
   * Declare the variables shared by Go metadata, native loaders, and Relay readers.
   * Use `loader: (args) => query.loader(args)` to retain Router's input inference.
   */
  function defineRouteQuery<Query extends OperationType>() {
    return <
      const Bindings extends RouteQueryBindings<Query['variables']> =
        RouteQueryBindings<Query['variables']>,
      const Authenticated extends boolean = false,
    >(
      options: {
        request: GraphQLTaggedNode
        authenticated?: Authenticated
        fetchPolicy?: FetchPolicy
      } & (VariableNames<Query['variables']> extends never
        ? { variables?: ExactBindings<Query['variables'], Bindings> }
        : { variables: ExactBindings<Query['variables'], Bindings> }),
    ) => {
      const request = getRequest(options.request)
      const { name, operationKind } = request.params
      if (operationKind !== 'query') throw new Error(`${name} must be a query.`)

      const bindings: Record<string, VariableBinding> = options.variables ?? {}
      const declared = new Set(
        request.operation.argumentDefinitions.map((argument) => argument.name),
      )
      for (const variable of Object.keys(bindings)) {
        if (!declared.has(variable)) {
          throw new Error(`${name} has no variable ${variable}.`)
        }
      }
      for (const variable of declared) {
        if (!Object.hasOwn(bindings, variable)) {
          throw new Error(`${name} needs a binding for ${variable}.`)
        }
      }
      for (const [variable, binding] of Object.entries(bindings)) {
        if (
          Object.hasOwn(binding, 'default') &&
          binding.default === undefined
        ) {
          throw new Error(`${name} needs a defined default for ${variable}.`)
        }
        for (const field of Object.keys(binding)) {
          if (!Object.hasOwn(bindingFields, field)) {
            throw new Error(
              `${name} has an unknown binding field ${field} for ${variable}.`,
            )
          }
        }
      }

      const preload: Preload = {
        request: options.request,
        variables: bindings,
        ...(options.authenticated === undefined
          ? {}
          : { authenticated: options.authenticated }),
      }

      function variables(
        params: PathParams<Bindings>,
        search: Pick<URLSearchParams, 'get'> = new URLSearchParams(),
      ) {
        const pathValues: Record<string, unknown> = params
        for (const [variable, binding] of Object.entries(bindings)) {
          if (binding.source !== 'path') continue
          const parameter = binding.name ?? variable
          const raw = Object.hasOwn(params, parameter)
            ? pathValues[parameter]
            : undefined
          if (
            typeof raw !== 'string' &&
            !(raw === undefined && Object.hasOwn(binding, 'default'))
          ) {
            throw (
              configuration.invalidVariable?.(variable) ??
              new Error(`Invalid value for ${variable}.`)
            )
          }
        }
        return resolveVariables(bindings, params, search) as Query['variables']
      }

      function fetchResolved<Params extends PathParams<Bindings>>(
        args: QueryArguments<Bindings, Authenticated, Params>,
        resolved: Query['variables'],
      ): Promise<Query['response'] | undefined> {
        if (options.authenticated && !args.context.authenticated) {
          return Promise.resolve(undefined)
        }
        return fetchRouteQuery<Query>(
          args.context.relayEnvironment,
          options.request,
          resolved,
          args.abortController.signal,
          options.fetchPolicy,
        )
      }

      function fetch<Params extends PathParams<Bindings>>(
        args: QueryArguments<Bindings, Authenticated, Params>,
      ) {
        return fetchResolved(
          args,
          variables(args.params, new URLSearchParams(args.location.searchStr)),
        )
      }

      function loader<Params extends PathParams<Bindings>>(
        args: QueryArguments<Bindings, Authenticated, Params>,
      ) {
        const resolved = variables(
          args.params,
          new URLSearchParams(args.location.searchStr),
        )
        return {
          variables: resolved,
          ready: defer(fetchResolved(args, resolved)),
        }
      }

      return { request: options.request, preload, variables, fetch, loader }
    }
  }

  return { defineRouteQuery, resolveVariables }
}
