import * as React from 'react'
import { cn } from '@/components/ui/cn'

function DescriptionList({ className, ...props }: React.ComponentProps<'dl'>) {
  return (
    <dl
      data-slot="description-list"
      className={cn('flex flex-col text-sm', className)}
      {...props}
    />
  )
}

function DescriptionListItem({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="description-list-item"
      className={cn(
        'flex min-h-8 items-center justify-between gap-4 border-b border-border/70 last:border-b-0',
        className,
      )}
      {...props}
    />
  )
}

function DescriptionListTerm({
  className,
  ...props
}: React.ComponentProps<'dt'>) {
  return (
    <dt
      data-slot="description-list-term"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  )
}

function DescriptionListDetails({
  className,
  ...props
}: React.ComponentProps<'dd'>) {
  return (
    <dd
      data-slot="description-list-details"
      className={cn(
        'flex min-h-5 items-center justify-end text-right',
        className,
      )}
      {...props}
    />
  )
}

export {
  DescriptionList,
  DescriptionListItem,
  DescriptionListTerm,
  DescriptionListDetails,
}
