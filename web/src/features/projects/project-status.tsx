import { Archive, CircleCheck, CircleDashed } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export const projectStatuses = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PLANNED', label: 'Planned' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const
export type ProjectStatus = (typeof projectStatuses)[number]['value']

export function StatusBadge({ status }: { status: string }) {
  const Icon =
    status === 'ACTIVE'
      ? CircleCheck
      : status === 'PLANNED'
        ? CircleDashed
        : Archive
  return (
    <Badge
      variant={
        status === 'ACTIVE'
          ? 'success'
          : status === 'PLANNED'
            ? 'warning'
            : 'secondary'
      }
      className="w-22"
    >
      <Icon data-icon="inline-start" />
      {projectStatuses.find((option) => option.value === status)?.label ??
        status}
    </Badge>
  )
}
