import {
  Environment,
  Network,
  Observable,
  RecordSource,
  Store,
  type FetchFunction,
  type GraphQLResponse,
  type GraphQLSingularResponse,
  type RequestParameters,
  type Variables,
} from 'relay-runtime'
import { createBootstrapReplay } from '@acmekit/route-adapter/runtime'
import { createRequestError } from './errors'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readResult(result: unknown): GraphQLSingularResponse {
  if (
    isObject(result) &&
    Array.isArray(result.errors) &&
    result.errors.length
  ) {
    throw createRequestError(result, 'The GraphQL request failed.')
  }
  if (isObject(result)) {
    if (isObject(result.data)) return { ...result, data: result.data }
    if (result.data === null) {
      return {
        ...result,
        data: null,
        extensions: isObject(result.extensions) ? result.extensions : {},
      }
    }
  }
  throw createRequestError(result, 'Acme received an invalid GraphQL response.')
}

function readResponse(result: unknown): GraphQLResponse {
  return Array.isArray(result) ? result.map(readResult) : readResult(result)
}

async function requestGraphQL(
  operation: RequestParameters,
  variables: Variables,
  signal: AbortSignal,
) {
  const response = await fetch('/graphql', {
    method: 'POST',
    credentials: 'same-origin',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      ...(operation.id ? { id: operation.id } : { query: operation.text }),
      variables,
    }),
  })

  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw createRequestError(
      undefined,
      'Acme could not reach its API. Check that the application server is running, then try again.',
      response.status,
    )
  }
  let result: unknown
  try {
    result = await response.json()
  } catch {
    throw createRequestError(
      undefined,
      'Acme received an invalid GraphQL response.',
      response.status,
    )
  }
  if (!response.ok) {
    throw createRequestError(
      result,
      `The request failed (${response.status}).`,
      response.status,
    )
  }
  return readResponse(result)
}

export function createRelayEnvironment(bootstrap = createBootstrapReplay()) {
  let completedWrites = 0
  const fetchGraphQL: FetchFunction = (operation, variables) =>
    Observable.create((sink) => {
      const bootstrapResponse = bootstrap.take(operation, variables)
      if (bootstrapResponse !== undefined) {
        try {
          sink.next(readResponse(bootstrapResponse))
          sink.complete()
        } catch (error) {
          sink.error(error instanceof Error ? error : new Error(String(error)))
        }
        return
      }

      const controller = new AbortController()
      const request = async () => {
        for (;;) {
          const startedAfterWrite = completedWrites
          // Relay can share this execution with a mounted reader. Refresh its
          // payload before normalization if a write overtook the HTTP request.
          const overtaken = () =>
            operation.operationKind === 'query' &&
            startedAfterWrite !== completedWrites &&
            !controller.signal.aborted
          try {
            const response = await requestGraphQL(
              operation,
              variables,
              controller.signal,
            )
            if (overtaken()) continue
            // Check the version and publish in one continuation so Relay always
            // receives reads that account for every completed write.
            if (operation.operationKind === 'mutation') completedWrites++
            if (!sink.closed) {
              sink.next(response)
              sink.complete()
            }
            return
          } catch (error) {
            if (overtaken()) continue
            if (!sink.closed) {
              sink.error(
                error instanceof Error ? error : new Error(String(error)),
              )
            }
            return
          }
        }
      }
      void request()
      return () => controller.abort()
    })
  return new Environment({
    network: Network.create(fetchGraphQL),
    store: new Store(new RecordSource()),
    isServer: typeof window === 'undefined',
  })
}
