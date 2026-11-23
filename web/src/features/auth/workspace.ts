import { createContext, useContext } from 'react'
type WorkspaceContextValue = {
  viewer: {
    canManageProjects: boolean
  }
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null,
)

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('The workspace is not ready yet.')
  return context
}
