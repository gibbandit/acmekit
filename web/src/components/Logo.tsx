import { Link, useHydrated } from '@tanstack/react-router'
import type { MouseEventHandler } from 'react'
import { cn } from '@/lib/utils'

export function AcmeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 44 44"
      fill="currentColor"
      aria-hidden="true"
      className={cn('size-4 shrink-0', className)}
    >
      <path
        d="M0 26H44V36H10V70H0ZM19 45H44V70H19ZM25 51V64H38V51Z"
        fillRule="evenodd"
        transform="translate(44 -26) scale(-1 1)"
      />
    </svg>
  )
}

export function AcmeMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-8 w-[131px] shrink-0 bg-current [mask-image:url('/acme.svg')] [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat]",
        className,
      )}
    />
  )
}

export function AcmeWordmark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-4.5 w-[78px] shrink-0 bg-current [mask-image:url('/acme-wordmark.svg')] [mask-size:contain] [mask-position:center] [mask-repeat:no-repeat]",
        className,
      )}
    />
  )
}

export function Logo({
  className,
  compact = false,
  onClick,
}: {
  className?: string
  compact?: boolean
  onClick?: MouseEventHandler<HTMLAnchorElement>
}) {
  const hydrated = useHydrated()
  const linkClassName = cn(
    'inline-flex w-fit items-center gap-2 rounded-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
    className,
  )
  const mark = compact ? (
    <>
      <AcmeIcon />
      <AcmeWordmark />
    </>
  ) : (
    <AcmeMark />
  )
  // The public document is shared across URLs; active link state is client-only.
  return hydrated ? (
    <Link
      to="/"
      className={linkClassName}
      aria-label="Acme home"
      onClick={onClick}
    >
      {mark}
    </Link>
  ) : (
    <a
      href="/"
      className={linkClassName}
      aria-label="Acme home"
      onClick={onClick}
    >
      {mark}
    </a>
  )
}
