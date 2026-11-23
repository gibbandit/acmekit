import { Link, useMatches } from '@tanstack/react-router'
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import { graphql, useFragment } from 'react-relay'
import type {
  ProjectTable_project$data,
  ProjectTable_project$key,
} from '@relay/ProjectTable_project.graphql'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/features/projects/project-status'
import { cn, formatDate } from '@/lib/utils'

const projectFragment = graphql`
  fragment ProjectTable_project on Project @relay(plural: true) {
    id
    slug
    name
    status
    updatedAt
  }
`

type Project = ProjectTable_project$data[number]
const features = tableFeatures({})
const columnHelper = createColumnHelper<typeof features, Project>()
const emptyProjects: readonly Project[] = []
const skeletonWidths = ['w-44', 'w-36', 'w-40', 'w-48', 'w-32', 'w-40']

function ProjectDetailLink({
  projectSlug,
  name,
}: {
  projectSlug: string
  name: string
}) {
  const returnLabel = useMatches({
    select: (matches) =>
      matches
        .at(-1)
        ?.meta?.find((meta) => meta?.title)
        ?.title?.split(' · ')[0],
  })

  return (
    <Link
      to="/projects/$projectSlug"
      params={{ projectSlug }}
      state={{ projectReturnLabel: returnLabel }}
      className={cn(
        buttonVariants({ variant: 'link' }),
        'h-9 w-fit max-w-full px-0 text-left text-foreground md:h-9',
      )}
      title={name}
    >
      <span className="truncate font-medium">{name}</span>
    </Link>
  )
}

const columns = columnHelper.columns([
  columnHelper.accessor((project) => project.name, {
    id: 'name',
    header: 'Project',
    cell: ({ row, getValue }) => (
      <ProjectDetailLink projectSlug={row.original.slug} name={getValue()} />
    ),
  }),
  columnHelper.accessor((project) => project.status, {
    id: 'status',
    header: 'Status',
    cell: ({ getValue }) => (
      <div className="flex h-9 items-center">
        <StatusBadge status={getValue()} />
      </div>
    ),
  }),
  columnHelper.accessor((project) => project.updatedAt, {
    id: 'updatedAt',
    header: 'Updated',
    cell: ({ getValue }) => (
      <time
        dateTime={getValue()}
        className="text-xs text-muted-foreground tabular-nums sm:text-sm"
      >
        {formatDate(getValue())}
      </time>
    ),
  }),
])

export function ProjectTable({
  projects,
  label,
  loadingRows = 6,
  emptyMessage = 'No projects yet.',
}: {
  projects?: ProjectTable_project$key
  label: string
  loadingRows?: number
  emptyMessage?: string
}) {
  const data = useFragment(projectFragment, projects ?? null)
  const table = useTable({
    features,
    columns,
    data: data ?? emptyProjects,
    getRowId: (project) => project.id,
  })
  const rows = table.getRowModel().rows

  return (
    <div className="-mx-2 border-b bg-background sm:-mx-3">
      <Table
        aria-label={label}
        density="compact"
        className="min-w-80 table-fixed sm:min-w-md"
      >
        <colgroup>
          <col />
          <col className="w-26 sm:w-36" />
          <col className="w-26 sm:w-36" />
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  colSpan={header.colSpan}
                  className="last:text-right"
                >
                  {header.isPlaceholder ? null : (
                    <table.FlexRender header={header} />
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {projects === undefined ? (
            Array.from({ length: loadingRows }, (_, index) => (
              <TableRow key={'loading-' + index}>
                <TableCell>
                  <div className="flex h-9 items-center">
                    <Skeleton
                      className={cn(
                        'h-4 max-w-full',
                        skeletonWidths[index % skeletonWidths.length],
                      )}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex h-9 items-center">
                    <Skeleton className="h-5 w-22 rounded-full" />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Skeleton className="ml-auto h-4 w-24 max-w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length ? (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="last:text-right">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
