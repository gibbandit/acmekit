import { createFileRoute, Link, useAwaited } from '@tanstack/react-router'
import { Suspense, useEffect } from 'react'
import { graphql, useLazyLoadQuery } from 'react-relay'
import type { ProjectEditPageQuery as ProjectEditPageQueryType } from '@relay/ProjectEditPageQuery.graphql'
import { ArrowLeft, Folder, LockKeyhole } from 'lucide-react'
import { EmptyState } from '@/components/page'
import { buttonVariants } from '@/components/ui/button'
import { useWorkspace } from '@/features/auth/workspace'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { ProjectFormLoading } from '@/features/projects/ProjectFormLayout'
import { defineRouteQuery } from '@/lib/route-query'

const projectQuery = defineRouteQuery<ProjectEditPageQueryType>()({
  request: graphql`
    query ProjectEditPageQuery($slug: String!) {
      project: projectBySlug(slug: $slug) {
        id
        slug
        ...ProjectForm_project
      }
    }
  `,
  authenticated: true,
  variables: { slug: { source: 'path', name: 'projectSlug' } },
  fetchPolicy: 'store-or-network',
})

export const Route = createFileRoute('/_app/projects_/$projectSlug_/edit')({
  loader: (args) => projectQuery.loader(args),
  component: ProjectEditPage,
  pendingComponent: ProjectEditLoading,
  staticData: {
    preloads: [projectQuery.preload],
  },
  head: () => ({ meta: [{ title: 'Edit project · Acme' }] }),
})

function ProjectEditPage() {
  const { viewer } = useWorkspace()
  return (
    <Suspense
      fallback={
        viewer.canManageProjects ? (
          <ProjectEditLoading />
        ) : (
          <ProjectEditPermission />
        )
      }
    >
      <ProjectEditData />
    </Suspense>
  )
}

function ProjectEditLoading() {
  return <ProjectFormLoading mode="edit" />
}

function ProjectEditData() {
  const { ready, variables } = Route.useLoaderData()
  useAwaited({ promise: ready })
  const { projectSlug } = Route.useParams()
  const { viewer } = useWorkspace()
  const navigate = Route.useNavigate()
  const { project } = useLazyLoadQuery<ProjectEditPageQueryType>(
    projectQuery.request,
    variables,
  )
  const canonicalSlug = project?.slug
  useEffect(() => {
    if (!canonicalSlug || canonicalSlug === projectSlug) return
    void navigate({
      to: '/projects/$projectSlug/edit',
      params: { projectSlug: canonicalSlug },
      search: true,
      hash: true,
      state: true,
      replace: true,
      resetScroll: false,
      hashScrollIntoView: false,
    })
  }, [canonicalSlug, projectSlug, navigate])

  if (!project) {
    return (
      <EmptyState
        icon={<Folder className="size-6" />}
        title={<h1>Project not found</h1>}
        description="The project may have been deleted or is not available in this workspace."
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
  if (!viewer.canManageProjects)
    return <ProjectEditPermission projectSlug={project.slug} />

  return <ProjectForm key={project.id} mode="edit" project={project} />
}

function ProjectEditPermission({ projectSlug }: { projectSlug?: string }) {
  return (
    <EmptyState
      icon={<LockKeyhole className="size-6" />}
      title={<h1>Read-only access</h1>}
      description="You need permission to edit projects in this workspace."
      action={
        projectSlug ? (
          <Link
            to="/projects/$projectSlug"
            params={{ projectSlug }}
            search={true}
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft data-icon="inline-start" />
            Back to project
          </Link>
        ) : (
          <Link
            to="/projects"
            search={true}
            className={buttonVariants({ variant: 'outline' })}
          >
            <ArrowLeft data-icon="inline-start" />
            Back to projects
          </Link>
        )
      }
    />
  )
}
