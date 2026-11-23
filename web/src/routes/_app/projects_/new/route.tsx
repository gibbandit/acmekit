import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { EmptyState } from '@/components/page'
import { buttonVariants } from '@/components/ui/button'
import { useWorkspace } from '@/features/auth/workspace'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { ProjectFormLoading } from '@/features/projects/ProjectFormLayout'

export const Route = createFileRoute('/_app/projects_/new')({
  component: ProjectNewPage,
  pendingComponent: ProjectNewLoading,
  head: () => ({ meta: [{ title: 'New project · Acme' }] }),
})

function ProjectNewPage() {
  const { viewer } = useWorkspace()
  if (!viewer.canManageProjects) {
    return (
      <EmptyState
        icon={<LockKeyhole className="size-6" />}
        title={<h1>Read-only access</h1>}
        description="You need permission to create projects in this workspace."
        action={
          <Link
            to="/projects"
            search={true}
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft data-icon="inline-start" />
            Back to projects
          </Link>
        }
      />
    )
  }
  return <ProjectForm mode="create" />
}

function ProjectNewLoading() {
  return <ProjectFormLoading mode="create" />
}
