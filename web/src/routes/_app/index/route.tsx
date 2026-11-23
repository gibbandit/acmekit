import { defineRouteQuery } from '@/lib/route-query'
import {
  createFileRoute,
  Link,
  redirect,
  useAwaited,
  useHydrated,
} from '@tanstack/react-router'
import { graphql, useLazyLoadQuery } from 'react-relay'
import { type OverviewPageQuery as OverviewPageQueryType } from '@relay/OverviewPageQuery.graphql'
import { Suspense, useMemo } from 'react'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page'
import { useWorkspace } from '@/features/auth/workspace'
import { ProjectTable } from '@/features/projects/ProjectTable'
import { ProjectCreateAction } from '@/features/projects/ProjectCreateAction'

const compactCountFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumSignificantDigits: 2,
})

const overviewQuery = defineRouteQuery<OverviewPageQueryType>()({
  request: graphql`
    query OverviewPageQuery {
      projectStats {
        total
        active
        planned
        archived
      }
      projects(first: 5) {
        edges {
          node {
            ...ProjectTable_project
          }
        }
      }
    }
  `,
  authenticated: true,
})

export const Route = createFileRoute('/_app/')({
  beforeLoad: ({ location }) => {
    if (location.hash === 'new') {
      throw redirect({ to: '/projects/new', search: true, replace: true })
    }
  },
  loader: (args) => overviewQuery.loader(args),
  component: OverviewPage,
  pendingComponent: OverviewLoading,
  staticData: {
    preloads: [overviewQuery.preload],
  },
  head: () => ({ meta: [{ title: 'Overview · Acme' }] }),
})

function OverviewPage() {
  const { viewer } = useWorkspace()
  return <OverviewView viewer={viewer} />
}

function OverviewLoading() {
  return <OverviewView />
}

function OverviewView({ viewer }: { viewer?: { canManageProjects: boolean } }) {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader
        title="Overview"
        action={
          <ProjectCreateAction canManageProjects={viewer?.canManageProjects} />
        }
      />

      {viewer ? (
        <Suspense fallback={<OverviewContent />}>
          <OverviewData />
        </Suspense>
      ) : (
        <OverviewContent />
      )}
    </div>
  )
}

function OverviewData() {
  const { ready, variables } = Route.useLoaderData()
  useAwaited({ promise: ready })
  const data = useLazyLoadQuery<OverviewPageQueryType>(
    overviewQuery.request,
    variables,
  )

  return <OverviewContent data={data} />
}

function OverviewContent({
  data,
}: {
  data?: OverviewPageQueryType['response']
}) {
  const hydrated = useHydrated()
  const isLoading = data === undefined
  const projectRefs = useMemo(
    () => data?.projects.edges.map(({ node }) => node),
    [data?.projects.edges],
  )
  const viewAllProjectsProps = {
    className: buttonVariants({ variant: 'link', size: 'sm' }),
    children: (
      <>
        View all projects
        <ArrowRight data-icon="inline-end" />
      </>
    ),
  }
  const stats = [
    {
      label: 'Total projects',
      value: data?.projectStats.total,
    },
    {
      label: 'Active',
      badge: 'success',
      value: data?.projectStats.active,
      share: data
        ? `${data.projectStats.total ? Math.round((data.projectStats.active / data.projectStats.total) * 100) : 0}%`
        : undefined,
    },
    {
      label: 'Planned',
      badge: 'warning',
      value: data?.projectStats.planned,
      share: data
        ? `${data.projectStats.total ? Math.round((data.projectStats.planned / data.projectStats.total) * 100) : 0}%`
        : undefined,
    },
    {
      label: 'Archived',
      badge: 'outline',
      value: data?.projectStats.archived,
      share: data
        ? `${data.projectStats.total ? Math.round((data.projectStats.archived / data.projectStats.total) * 100) : 0}%`
        : undefined,
    },
  ] as const

  return (
    <>
      {isLoading && (
        <span className="sr-only" role="status">
          Loading project overview.
        </span>
      )}
      <div className="flex flex-col gap-8 md:gap-10" aria-busy={isLoading}>
        <section
          aria-label="Project overview"
          className="grid grid-cols-2 gap-4 md:gap-6 xl:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]"
        >
          {stats.map((stat) => (
            <Card key={stat.label} className="min-w-0">
              <CardContent className="grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[1.25rem_3rem_1.25rem] items-center gap-x-3 gap-y-2 sm:grid-rows-2 sm:gap-y-3">
                <CardDescription
                  className={cn(
                    'col-span-2 col-start-1 row-start-1 sm:col-span-1',
                    !('badge' in stat) && 'sm:row-span-2',
                  )}
                >
                  {stat.label}
                </CardDescription>
                <div
                  data-slot="metric-value"
                  className={cn(
                    'col-span-2 col-start-1 row-start-2 flex h-12 min-w-0 items-center font-medium tabular-nums sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:w-[4ch] sm:justify-end md:h-16',
                    'badge' in stat
                      ? 'text-record md:text-metric-compact'
                      : 'text-metric-compact md:text-metric',
                  )}
                  title={stat.value?.toString()}
                >
                  {stat.value === undefined ? (
                    <Skeleton className="h-8 w-10 md:h-10 md:w-12" />
                  ) : stat.value < 1000 ? (
                    stat.value
                  ) : (
                    compactCountFormatter.format(stat.value)
                  )}
                </div>
                {'badge' in stat && (
                  <Badge
                    variant={stat.badge}
                    className="col-start-1 row-start-3 justify-self-start sm:row-start-2"
                    render={<div />}
                  >
                    <div className="flex h-4 w-9 items-center justify-center tabular-nums">
                      {stat.share === undefined ? (
                        <Skeleton className="h-3 w-full" />
                      ) : (
                        stat.share
                      )}
                    </div>
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
        <section
          className="flex min-w-0 flex-col gap-4"
          aria-labelledby="recent-projects-title"
        >
          <h2 id="recent-projects-title" className="text-section">
            Recent projects
          </h2>
          <ProjectTable
            projects={projectRefs}
            label="Recent projects"
            loadingRows={5}
          />
          <div className="flex justify-end">
            {hydrated ? (
              <Link to="/projects" {...viewAllProjectsProps} />
            ) : (
              <a href="/projects" {...viewAllProjectsProps} />
            )}
          </div>
        </section>
      </div>
    </>
  )
}
