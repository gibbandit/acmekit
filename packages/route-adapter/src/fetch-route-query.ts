import {
  fetchQuery,
  type Environment,
  type GraphQLTaggedNode,
  type OperationType,
  type Subscription,
} from 'relay-runtime'

/** Fetch a query for a Router loader and resolve to undefined if it is canceled. */
export function fetchRouteQuery<T extends OperationType>(
  environment: Environment,
  query: GraphQLTaggedNode,
  variables: T['variables'],
  signal: AbortSignal,
  fetchPolicy: 'network-only' | 'store-or-network' = 'network-only',
): Promise<T['response'] | undefined> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      resolve(undefined)
      return
    }
    const source = fetchQuery<T>(environment, query, variables, {
      fetchPolicy,
    })
    let subscription: Subscription | undefined
    let data: T['response'] | undefined
    const abort = () => {
      subscription?.unsubscribe()
      resolve(undefined)
    }
    const cleanup = () => signal.removeEventListener('abort', abort)
    source.finally(cleanup).subscribe({
      start: (started) => {
        subscription = started
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      },
      next: (value) => {
        data = value
      },
      error: reject,
      complete: () => {
        resolve(data)
      },
    })
  })
}
