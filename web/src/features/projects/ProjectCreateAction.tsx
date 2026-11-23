import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'

export function ProjectCreateAction({
  canManageProjects,
}: {
  canManageProjects?: boolean
}) {
  if (canManageProjects === false) {
    return (
      <div className="flex h-11 items-center md:h-8">
        <Badge variant="outline">Read-only access</Badge>
      </div>
    )
  }

  return (
    <Link
      to="/projects/new"
      search
      state={{ projectFormSource: true }}
      disabled={canManageProjects === undefined}
      className={buttonVariants({ size: 'sm' })}
    >
      <Plus data-icon="inline-start" />
      New project
    </Link>
  )
}
