import {
  useHydrated,
  useLoaderData,
  useRouter,
  useRouterState,
  type AnyRoute,
} from '@tanstack/react-router'
import { AppSidebar } from '@/components/workspace/AppSidebar'
import {
  useInitialLayout,
  WorkspaceFrame,
} from '@/components/workspace/workspace-frame'
import { SignInPage } from '@/features/auth/SignInPage'

export function WorkspaceLoading() {
  const initial = useInitialLayout()
  return initial.kind === 'signin' ? (
    <SignInPage serverInfo={initial.serverInfo} interactive={false} />
  ) : (
    <WorkspaceRouteLoading />
  )
}

function pendingPage(route: AnyRoute | undefined) {
  while (route) {
    const Pending = route.options.pendingComponent
    if (Pending && Pending !== WorkspaceLoading) return Pending
    route = route.parentRoute
  }
  return EmptyPage
}

function EmptyPage() {
  return null
}

function WorkspaceRouteLoading() {
  const router = useRouter()
  const hydrated = useHydrated()
  const { pendingRouteId } = useLoaderData({ from: '__root__' })
  const PendingPage = useRouterState({
    select: (state) => {
      const leaf = state.matches.at(-1)
      return pendingPage(
        Object.values(router.routesById).find(
          (route) => route.id === leaf?.routeId,
        ),
      )
    },
  })
  // The server and first client render use the identity saved in this shell.
  // After hydration, the router's real URL determines the pending page.
  const InitialPage = pendingPage(
    Object.values(router.routesById).find(
      (route) => route.id === pendingRouteId,
    ),
  )
  const Page = hydrated ? PendingPage : InitialPage

  return (
    <WorkspaceFrame sidebar={<AppSidebar />}>
      {/* Router supplies stable pending component types from route options. */}
      {/* eslint-disable-next-line react-hooks/static-components */}
      <Page />
    </WorkspaceFrame>
  )
}
