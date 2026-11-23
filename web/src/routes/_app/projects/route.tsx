import { defineRouteQuery } from '@/lib/route-query'
import {
  createFileRoute,
  redirect,
  useAwaited,
  useLocation,
  useRouter,
} from '@tanstack/react-router'
import { graphql, useLazyLoadQuery, usePaginationFragment } from 'react-relay'
import { type ProjectsPageQuery as ProjectsPageQueryType } from '@relay/ProjectsPageQuery.graphql'
import {
  projectBindings,
  projectVariables,
  projectPage,
  validateProjectSearch,
} from '@/features/projects/project-variables'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { type ProjectsPagePaginationQuery } from '@relay/ProjectsPagePaginationQuery.graphql'
import { type ProjectsPage_projects$key } from '@relay/ProjectsPage_projects.graphql'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProjectsResultsSkeleton } from '@/features/projects/project-loading'
import { InlineError, PageHeader } from '@/components/page'
import {
  projectStatuses,
  type ProjectStatus,
} from '@/features/projects/project-status'
import { SelectControl } from '@/components/select-control'
import { useWorkspace } from '@/features/auth/workspace'
import { ProjectTable } from '@/features/projects/ProjectTable'
import { ProjectCreateAction } from '@/features/projects/ProjectCreateAction'

const projectsQuery = defineRouteQuery<ProjectsPageQueryType>()({
  request: graphql`
    query ProjectsPageQuery(
      $first: Int!
      $after: String
      $anchor: String
      $search: String
      $status: ProjectStatus
    ) {
      ...ProjectsPage_projects
        @arguments(
          first: $first
          after: $after
          anchor: $anchor
          search: $search
          status: $status
        )
    }
  `,
  authenticated: true,
  variables: projectBindings,
})
const projectsFragment = graphql`
  fragment ProjectsPage_projects on Query
  @argumentDefinitions(
    first: { type: "Int", defaultValue: 6 }
    after: { type: "String" }
    anchor: { type: "String" }
    search: { type: "String" }
    status: { type: "ProjectStatus" }
  )
  @refetchable(queryName: "ProjectsPagePaginationQuery") {
    projects(
      first: $first
      after: $after
      anchor: $anchor
      search: $search
      status: $status
    )
      @connection(
        key: "ProjectsPage_projects"
        filters: ["search", "status", "anchor"]
      ) {
      edges {
        node {
          ...ProjectTable_project
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`

export const Route = createFileRoute('/_app/projects')({
  // An initial connection read replaces its range. Hover must not reset an
  // already expanded list; this route fetches on navigation instead.
  preload: false,
  validateSearch: validateProjectSearch,
  loaderDeps: ({ search }) => projectVariables(search),
  beforeLoad: ({ location }) => {
    if (location.hash === 'new') {
      throw redirect({ to: '/projects/new', search: true, replace: true })
    }
  },
  loader: (args) => projectsQuery.loader(args),
  component: ProjectsPage,
  pendingComponent: ProjectsLoading,
  staticData: {
    preloads: [projectsQuery.preload],
  },
  head: () => ({ meta: [{ title: 'Projects · Acme' }] }),
})

function ProjectsPage() {
  const { viewer } = useWorkspace()
  const router = useRouter()
  const navigate = Route.useNavigate()
  const searchStr = useLocation({ select: (location) => location.searchStr })
  const params = Route.useSearch()
  const variables = Route.useLoaderDeps()
  const page = projectPage(params)
  const urlSearch =
    (Array.isArray(params.search) ? params.search[0] : params.search) ?? ''
  // Keep edits until validated route search commits, not just the URL.
  const [draft, setDraft] = useState({ source: params, value: urlSearch })
  if (draft.source !== params) {
    setDraft({ source: params, value: urlSearch })
  }
  const search = draft.source === params ? draft.value : urlSearch
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const unsubscribe = router.subscribe('onBeforeNavigate', (event) => {
      if (
        event.pathChanged ||
        event.fromLocation?.searchStr !== event.toLocation.searchStr
      ) {
        clearTimeout(timer.current)
        timer.current = undefined
      }
    })
    return () => {
      unsubscribe()
      clearTimeout(timer.current)
    }
  }, [router])

  function updateFilters(
    filters: { search?: string; status?: ProjectStatus | null },
    replace: boolean,
  ) {
    clearTimeout(timer.current)
    timer.current = undefined
    void navigate({
      search: (previous) => ({
        ...previous,
        search: search || undefined,
        ...filters,
        after: undefined,
        page: undefined,
      }),
      hash: true,
      replace,
      resetScroll: false,
      hashScrollIntoView: false,
    })
  }

  return (
    <ProjectsView
      viewer={viewer}
      variables={variables}
      page={page}
      onPageChange={(nextPage) => {
        if (
          timer.current !== undefined ||
          router.state.location.pathname !== '/projects' ||
          router.state.location.searchStr !== searchStr
        )
          return
        void navigate({
          search: (previous) => ({ ...previous, page: nextPage }),
          hash: true,
          resetScroll: false,
          hashScrollIntoView: false,
        })
      }}
      search={search}
      status={variables.status ?? 'ALL'}
      onSearchChange={(value) => {
        setDraft({ source: params, value })
        clearTimeout(timer.current)
        timer.current = setTimeout(
          () => updateFilters({ search: value || undefined }, true),
          220,
        )
      }}
      onSearchSubmit={() => {
        updateFilters({}, false)
      }}
      onStatusChange={(status) => {
        updateFilters(
          {
            status: status === 'ALL' ? null : status,
          },
          false,
        )
      }}
      onClearFilters={() => {
        updateFilters({ search: undefined, status: null }, false)
      }}
    />
  )
}

function ProjectsLoading() {
  return <ProjectsView />
}

function ProjectsView({
  viewer,
  variables = projectVariables({}),
  page = 1,
  onPageChange,
  search,
  status,
  onSearchChange,
  onSearchSubmit,
  onStatusChange,
  onClearFilters,
}: {
  viewer?: { canManageProjects: boolean }
  variables?: ReturnType<typeof projectVariables>
  page?: number
  onPageChange?: (page: number) => void
  search?: string
  status?: ProjectStatus | 'ALL'
  onSearchChange?: (value: string) => void
  onSearchSubmit?: () => void
  onStatusChange?: (value: ProjectStatus | 'ALL') => void
  onClearFilters?: () => void
}) {
  const searchValue = search ?? variables.search ?? ''
  const statusValue = status ?? variables.status ?? 'ALL'

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <PageHeader
        title="Projects"
        action={
          <ProjectCreateAction canManageProjects={viewer?.canManageProjects} />
        }
      />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            className="sm:flex-1 md:max-w-sm"
            aria-label="Search projects"
            placeholder="Search projects…"
            value={searchValue}
            disabled={!viewer}
            onChange={(event) => onSearchChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSearchSubmit?.()
            }}
            maxLength={200}
          />
          <div className="flex shrink-0 items-center gap-2">
            <SelectControl
              value={statusValue}
              onChange={(value) => onStatusChange?.(value)}
              options={[
                { value: 'ALL', label: 'All statuses' },
                ...projectStatuses,
              ]}
              label="Filter by project status"
              className="sm:w-44"
              disabled={!viewer}
            />
            {(searchValue || statusValue !== 'ALL') && (
              <Button
                variant="outline"
                disabled={!viewer}
                onClick={onClearFilters}
              >
                <X data-icon="inline-start" />
                Clear filters
              </Button>
            )}
          </div>
        </div>
        {viewer ? (
          <Suspense
            fallback={<ProjectsResultsSkeleton loadingRows={variables.first} />}
          >
            <ProjectsResults
              variables={variables}
              page={page}
              onPageChange={onPageChange}
            />
          </Suspense>
        ) : (
          <ProjectsResultsSkeleton />
        )}
      </div>

      {viewer && !viewer.canManageProjects && (
        <p className="text-sm text-muted-foreground">
          You have read-only access. Maintainers can create, edit, and delete
          projects.
        </p>
      )}
    </div>
  )
}

type ProjectsResultsProps = {
  variables: ReturnType<typeof projectVariables>
  page: number
  onPageChange?: (page: number) => void
}

function ProjectsResults({
  variables,
  page,
  onPageChange,
}: ProjectsResultsProps) {
  const { ready, variables: queryVariables } = Route.useLoaderData()
  useAwaited({ promise: ready })
  const updatedAt = Route.useMatch({ select: (match) => match.updatedAt })
  const data = useLazyLoadQuery<ProjectsPageQueryType>(
    projectsQuery.request,
    queryVariables,
  )

  return (
    <ProjectConnection
      key={JSON.stringify([variables, page, updatedAt])}
      queryRef={data}
      filtered={Boolean(variables.search || variables.status)}
      first={variables.first}
      page={page}
      onPageChange={onPageChange}
    />
  )
}

function ProjectConnection({
  queryRef,
  filtered,
  first,
  page,
  onPageChange,
}: {
  queryRef: ProjectsPage_projects$key
  filtered: boolean
  first: number
  page: number
  onPageChange?: (page: number) => void
}) {
  const { data, loadNext, hasNext, isLoadingNext } = usePaginationFragment<
    ProjectsPagePaginationQuery,
    ProjectsPage_projects$key
  >(projectsFragment, queryRef)
  const [error, setError] = useState<unknown>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const projects = data.projects.edges
  const visibleCount = page * first
  const projectRefs = useMemo(
    () => projects.slice(0, visibleCount).map(({ node }) => node),
    [projects, visibleCount],
  )
  const restoring = projects.length < visibleCount && hasNext

  useEffect(() => {
    if (!restoring || isLoadingNext || error !== null) return
    // A shared URL starts with its normal Go bootstrap, then Relay fills the
    // requested window using the same bounded cursor requests as Load more.
    loadNext(Math.min(first, visibleCount - projects.length), {
      onComplete: (cause) => {
        if (mounted.current && cause) setError(cause)
      },
    })
  }, [
    restoring,
    isLoadingNext,
    error,
    loadNext,
    first,
    visibleCount,
    projects.length,
  ])
  const loading = isLoadingNext || (restoring && error === null)

  return (
    <div className="relative flex flex-col gap-4">
      <ProjectTable
        projects={projectRefs}
        label="Projects"
        emptyMessage={filtered ? 'No matching projects.' : 'No projects yet.'}
      />
      <div className="flex min-h-11 items-center justify-between gap-4 md:min-h-8">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Showing {projectRefs.length} of {data.projects.totalCount} projects
        </p>
        {(hasNext || projects.length > visibleCount) && (
          <Button
            variant="outline"
            size="sm"
            className="w-28"
            disabled={loading}
            aria-busy={loading}
            onClick={() => {
              setError(null)
              if (restoring) return
              const nextPage = page + 1
              const missing = nextPage * first - projects.length
              if (missing <= 0 || !hasNext) {
                onPageChange?.(nextPage)
                return
              }
              loadNext(Math.min(first, missing), {
                onComplete: (cause) => {
                  if (!mounted.current) return
                  if (cause) setError(cause)
                  else onPageChange?.(nextPage)
                },
              })
            }}
          >
            {loading && (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            )}
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </div>
      {error !== null && <InlineError error={error} />}
    </div>
  )
}
