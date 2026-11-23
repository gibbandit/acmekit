import type { ReactNode } from 'react'
import { readableError, requiresSignIn } from '@/lib/errors'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

export function ErrorMessage({ error }: { error: unknown }) {
  const message = readableError(error)
  if (!requiresSignIn(error)) return message
  const prompt = /\b(?:sign|log)[ -]?in\b/i.exec(message)
  const before = prompt ? message.slice(0, prompt.index) : `${message} `
  const after = prompt ? message.slice(prompt.index + prompt[0].length) : ''
  return (
    <>
      {before}
      {/* Authentication recovery needs a fresh document and Relay environment. */}
      <a
        href="/"
        className="underline underline-offset-3 hover:text-foreground"
      >
        {prompt?.[0] ?? 'Sign in'}
      </a>
      {after}
    </>
  )
}

export function InlineError({ error }: { error: unknown }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>Unable to complete the request</AlertTitle>
      <AlertDescription>
        <ErrorMessage error={error} />
      </AlertDescription>
    </Alert>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: ReactNode
  description: string
  action?: ReactNode
}) {
  return (
    <Empty className="min-h-72 border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

export function PageHeader({
  title,
  action,
}: {
  title: string
  action?: ReactNode
}) {
  return (
    <div
      data-slot="page-header"
      className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] content-start items-baseline-last gap-x-3 gap-y-3 sm:gap-x-6 md:min-h-14"
    >
      <div className="col-start-1 row-start-1 flex min-w-0 flex-col gap-2">
        <h1 className="font-heading text-record text-balance break-words md:text-page">
          {title}
        </h1>
      </div>
      {action && (
        <div className="col-start-2 row-start-1 flex shrink-0 items-center justify-end gap-2">
          {action}
        </div>
      )}
    </div>
  )
}
