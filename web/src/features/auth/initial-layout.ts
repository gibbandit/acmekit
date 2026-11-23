import { createIsomorphicFn, getRouterInstance } from '@tanstack/react-start'
import {
  getRequestHeader,
  setResponseHeader,
} from '@tanstack/react-start/server'
import WorkspaceQuery, {
  type WorkspaceQuery as WorkspaceQueryType,
} from '@relay/WorkspaceQuery.graphql'
import type { SignInOptions } from './types'

export type InitialLayout =
  { kind: 'workspace' } | { kind: 'signin'; serverInfo?: SignInOptions }

export const getInitialLayout = createIsomorphicFn()
  .server(async (): Promise<InitialLayout> => {
    if (!import.meta.env.DEV) {
      const router = await getRouterInstance()
      return {
        kind: router.isShell() ? 'signin' : 'workspace',
      }
    }

    setResponseHeader('Cache-Control', 'private, no-store')
    const address = process.env.ACME_ADDR?.trim() || '127.0.0.1:8080'
    try {
      const response = await fetch(`http://${address}/graphql`, {
        method: 'POST',
        signal: AbortSignal.timeout(2_000),
        headers: {
          'Content-Type': 'application/json',
          Cookie: getRequestHeader('cookie') ?? '',
        },
        body: JSON.stringify({
          query: WorkspaceQuery.params.text,
          variables: {},
        }),
      })
      if (response.ok) {
        const result: { data?: WorkspaceQueryType['response'] } =
          await response.json()
        if (result.data?.viewer) return { kind: 'workspace' }
        if (result.data?.serverInfo) {
          const { demoEnabled, githubEnabled } = result.data.serverInfo
          return { kind: 'signin', serverInfo: { demoEnabled, githubEnabled } }
        }
      }
    } catch {
      // The browser's normal Relay request supplies the API error/retry view.
    }
    return { kind: 'signin' }
  })
  .client(async (): Promise<InitialLayout> => ({
    kind: 'signin',
  }))
