import { defineRouteQuery } from '@/lib/route-query'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useMemo } from 'react'
import { graphql, useLazyLoadQuery } from 'react-relay'
import type { WorkspaceQuery as WorkspaceQueryType } from '@relay/WorkspaceQuery.graphql'
import { WorkspaceLoading } from '@/components/workspace/loading'
import { AppSidebar } from '@/components/workspace/AppSidebar'
import { WorkspaceFrame } from '@/components/workspace/workspace-frame'
import { SignInPage } from '@/features/auth/SignInPage'
import { WorkspaceContext } from '@/features/auth/workspace'

const workspaceQuery = defineRouteQuery<WorkspaceQueryType>()({
  request: graphql`
    query WorkspaceQuery {
      viewer {
        canManageProjects
        ...AppSidebar_viewer
      }
      serverInfo {
        demoEnabled
        githubEnabled
      }
    }
  `,
  fetchPolicy: 'store-or-network',
})

export const Route = createFileRoute('/_app')({
  ssr: false,
  beforeLoad: async (args) => {
    const data = await workspaceQuery.fetch(args)
    return { authenticated: Boolean(data?.viewer) }
  },
  staticData: {
    preloads: [workspaceQuery.preload],
  },
  component: WorkspaceEntry,
  pendingComponent: WorkspaceLoading,
})

function WorkspaceEntry() {
  const data = useLazyLoadQuery<WorkspaceQueryType>(workspaceQuery.request, {})
  const context = useMemo(
    () =>
      data.viewer
        ? {
            viewer: {
              canManageProjects: data.viewer.canManageProjects,
            },
          }
        : null,
    [data],
  )
  if (!context)
    return (
      <SignInPage
        serverInfo={{
          demoEnabled: data.serverInfo.demoEnabled,
          githubEnabled: data.serverInfo.githubEnabled,
        }}
      />
    )
  return (
    <WorkspaceContext.Provider value={context}>
      <WorkspaceFrame
        demoEnabled={data.serverInfo.demoEnabled}
        sidebar={
          <AppSidebar
            viewer={data.viewer ?? undefined}
            demoEnabled={data.serverInfo.demoEnabled}
          />
        }
      >
        <Outlet />
      </WorkspaceFrame>
    </WorkspaceContext.Provider>
  )
}
