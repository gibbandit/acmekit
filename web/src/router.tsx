import { createRouter } from '@tanstack/react-router'
import { RelayEnvironmentProvider } from 'react-relay'
import { routeTree } from './routeTree.gen'
import { ErrorView } from './components/ErrorView'
import { parseSearchParams, stringifySearchParams } from './lib/search-params'
import { createBootstrapReplay } from '@acmekit/route-adapter/runtime'
import { createRelayEnvironment } from './lib/relay'
import { RequestError } from './lib/errors'

export function getRouter() {
  const bootstrap = createBootstrapReplay()
  const relayEnvironment = createRelayEnvironment(bootstrap)
  const router = createRouter({
    routeTree,
    context: { relayEnvironment },
    Wrap: ({ children }) => (
      <RelayEnvironmentProvider environment={relayEnvironment}>
        {children}
      </RelayEnvironmentProvider>
    ),
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultErrorComponent: ErrorView,
    defaultOnCatch: (error) => {
      if (!(error instanceof RequestError)) console.error(error)
    },
    parseSearch: parseSearchParams,
    stringifySearch: stringifySearchParams,
    trailingSlash: 'never',
    caseSensitive: true,
  })
  // Document-only responses must never satisfy a later navigation.
  router.subscribe('onBeforeNavigate', ({ fromLocation, hrefChanged }) => {
    if (fromLocation && hrefChanged) bootstrap.clear()
  })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
