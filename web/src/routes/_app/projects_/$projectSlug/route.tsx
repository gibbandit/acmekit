import { defineRouteQuery } from '@/lib/route-query'
import {
  createFileRoute,
  Link,
  redirect,
  useAwaited,
} from '@tanstack/react-router'
import { graphql, useLazyLoadQuery } from 'react-relay'
import { type ProjectDetailPageQuery as ProjectDetailPageQueryType } from '@relay/ProjectDetailPageQuery.graphql'
import { Suspense, useEffect, useState } from 'react'
import { Folder, Pencil, Trash2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DescriptionList,
  DescriptionListDetails,
  DescriptionListItem,
  DescriptionListTerm,
} from '@/components/ui/description-list'
import { EmptyState } from '@/components/page'
import { StatusBadge } from '@/features/projects/project-status'
import { formatDate } from '@/lib/utils'
import { useWorkspace } from '@/features/auth/workspace'
import { DeleteProjectDialog } from '@/features/projects/DeleteProjectDialog'
import { ProjectBackLink } from '@/features/projects/ProjectBackLink'

const projectQuery = defineRouteQuery<ProjectDetailPageQueryType>()({
  request: graphql`
    query ProjectDetailPageQuery($slug: String!) {
      project: projectBySlug(slug: $slug) {
        slug
        name
        description
        status
        createdAt
        updatedAt
        ...DeleteProjectDialog_project
      }
    }
  `,
  authenticated: true,
  variables: { slug: { source: 'path', name: 'projectSlug' } },
})

export const Route = createFileRoute('/_app/projects_/$projectSlug')({
  beforeLoad: ({ location, params }) => {
    if (location.hash === 'edit') {
      throw redirect({
        to: '/projects/$projectSlug/edit',
        params,
        search: true,
        replace: true,
      })
    }
  },
  loader: (args) => projectQuery.loader(args),
  component: ProjectDetailPage,
  pendingComponent: ProjectDetailLoading,
  staticData: {
    preloads: [projectQuery.preload],
  },
  head: () => ({ meta: [{ title: 'Project · Acme' }] }),
})

function ProjectDetailPage() {
  const { viewer } = useWorkspace()
  return (
    <Suspense
      fallback={
        <ProjectDetailContent canManageProjects={viewer.canManageProjects} />
      }
    >
      <ProjectDetailData />
    </Suspense>
  )
}

function ProjectDetailLoading() {
  return <ProjectDetailContent />
}

function ProjectDetailData() {
  const { projectSlug } = Route.useParams()
  const { ready, variables } = Route.useLoaderData()
  useAwaited({ promise: ready })
  const { viewer } = useWorkspace()
  const navigate = Route.useNavigate()
  const { project } = useLazyLoadQuery<ProjectDetailPageQueryType>(
    projectQuery.request,
    variables,
  )
  const canonicalSlug = project?.slug
  useEffect(() => {
    if (!canonicalSlug || canonicalSlug === projectSlug) return
    void navigate({
      to: '/projects/$projectSlug',
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
        action={<ProjectBackLink variant="outline" />}
      />
    )
  }

  return (
    <ProjectDetailContent
      project={project}
      canManageProjects={viewer.canManageProjects}
    />
  )
}

function ProjectDetailContent({
  project,
  canManageProjects,
}: {
  project?: NonNullable<ProjectDetailPageQueryType['response']['project']>
  canManageProjects?: boolean
}) {
  const [deleting, setDeleting] = useState(false)

  return (
    <>
      {!project && (
        <span role="status" className="sr-only">
          Loading project details
        </span>
      )}
      <div
        className="flex w-full min-w-0 flex-col gap-6"
        aria-busy={!project || undefined}
      >
        <ProjectBackLink />
        <Card className="min-w-0">
          <CardHeader>
            <header className="grid min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
              <div className="flex max-w-full min-w-0 flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <CardTitle className="w-full min-w-0 sm:w-auto">
                  <h1 className="max-w-full min-w-0 font-heading text-record [overflow-wrap:anywhere]">
                    {project?.name ?? 'Project details'}
                  </h1>
                </CardTitle>
                {project ? (
                  <StatusBadge status={project.status} />
                ) : (
                  <Skeleton className="h-5 w-22 rounded-full" />
                )}
              </div>
              {canManageProjects === false ? (
                <div className="flex h-11 w-fit shrink-0 items-center sm:justify-self-end md:h-10">
                  <Badge variant="outline">Read-only access</Badge>
                </div>
              ) : (
                <Link
                  to="/projects/$projectSlug/edit"
                  params={{ projectSlug: project?.slug ?? '' }}
                  search
                  state={{ projectFormSource: true }}
                  disabled={!project}
                  className={buttonVariants({
                    className: 'w-fit shrink-0 sm:justify-self-end',
                  })}
                >
                  <Pencil data-icon="inline-start" />
                  Edit project
                </Link>
              )}
            </header>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-8">
            <DescriptionList className="min-w-0 self-start border-b pb-4 lg:col-start-2 lg:row-start-1 lg:border-b-0 lg:border-l lg:pb-0 lg:pl-6">
              <DescriptionListItem>
                <DescriptionListTerm>Created</DescriptionListTerm>
                <DescriptionListDetails className="w-32 min-w-0 shrink-0 whitespace-nowrap">
                  {project ? (
                    <time dateTime={project.createdAt}>
                      {formatDate(project.createdAt)}
                    </time>
                  ) : (
                    <Skeleton className="h-4 w-20" />
                  )}
                </DescriptionListDetails>
              </DescriptionListItem>
              <DescriptionListItem>
                <DescriptionListTerm>Updated</DescriptionListTerm>
                <DescriptionListDetails className="w-32 min-w-0 shrink-0 whitespace-nowrap">
                  {project ? (
                    <time dateTime={project.updatedAt}>
                      {formatDate(project.updatedAt)}
                    </time>
                  ) : (
                    <Skeleton className="h-4 w-20" />
                  )}
                </DescriptionListDetails>
              </DescriptionListItem>
              <DescriptionListItem>
                <DescriptionListTerm>Your access</DescriptionListTerm>
                <DescriptionListDetails className="w-32 min-w-0 shrink-0">
                  {canManageProjects === undefined ? (
                    <Skeleton className="h-4 w-16" />
                  ) : canManageProjects ? (
                    'Can edit'
                  ) : (
                    'Read only'
                  )}
                </DescriptionListDetails>
              </DescriptionListItem>
            </DescriptionList>
            <section
              aria-labelledby="project-description-title"
              className="flex max-w-prose min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-1"
            >
              <h2 id="project-description-title" className="text-section">
                Description
              </h2>
              <div className="min-h-21 text-base/7">
                {project ? (
                  <p className="break-words whitespace-pre-wrap">
                    {project.description || 'No description provided.'}
                  </p>
                ) : (
                  <div className="flex flex-col">
                    <div className="flex h-7 items-center">
                      <Skeleton className="h-4 w-full" />
                    </div>
                    <div className="flex h-7 items-center">
                      <Skeleton className="h-4 w-full" />
                    </div>
                    <div className="flex h-7 items-center">
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                )}
              </div>
              {project && canManageProjects && !project.description && (
                <Link
                  to="/projects/$projectSlug/edit"
                  params={{ projectSlug: project.slug }}
                  search
                  state={{ projectFormSource: true }}
                  className={buttonVariants({
                    variant: 'outline',
                    className: 'w-fit',
                  })}
                >
                  <Pencil data-icon="inline-start" />
                  Add description
                </Link>
              )}
            </section>
          </CardContent>
          {canManageProjects !== false && (
            <CardFooter>
              <Button
                variant="destructive"
                disabled={!project}
                onClick={() => setDeleting(true)}
              >
                <Trash2 data-icon="inline-start" />
                Delete project
              </Button>
            </CardFooter>
          )}
        </Card>
        {deleting && project && (
          <DeleteProjectDialog
            open={deleting}
            onOpenChange={setDeleting}
            project={project}
          />
        )}
      </div>
    </>
  )
}
