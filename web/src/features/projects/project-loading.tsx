import { ProjectTable } from '@/features/projects/ProjectTable'
import { Skeleton } from '@/components/ui/skeleton'

export function ProjectsResultsSkeleton({
  loadingRows = 6,
}: {
  loadingRows?: number
}) {
  return (
    <>
      <span role="status" className="sr-only">
        Loading projects
      </span>
      <div aria-busy="true" className="relative flex flex-col gap-4">
        <ProjectTable label="Projects" loadingRows={loadingRows} />
        <div className="flex h-11 items-center justify-between gap-4 md:h-8">
          <Skeleton className="h-4 w-44 max-w-full" />
          <Skeleton className="h-11 w-28 shrink-0 md:h-8" />
        </div>
      </div>
    </>
  )
}
