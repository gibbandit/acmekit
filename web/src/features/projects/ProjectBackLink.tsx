import {
  Link,
  useCanGoBack,
  useHydrated,
  useLocation,
  useRouter,
} from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'

declare module '@tanstack/react-router' {
  interface HistoryState {
    projectReturnLabel?: string
  }
}

export function ProjectBackLink({
  variant = 'ghost',
}: {
  variant?: 'ghost' | 'outline'
}) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const hydrated = useHydrated()
  const returnLabel = useLocation({
    select: (location) => location.state.projectReturnLabel,
  })

  if (hydrated && canGoBack) {
    return (
      <Button
        type="button"
        variant={variant}
        className="w-fit"
        onClick={() => router.history.back()}
      >
        <ArrowLeft data-icon="inline-start" />
        {returnLabel ? `Back to ${returnLabel}` : 'Back'}
      </Button>
    )
  }

  return (
    <Link
      to="/projects"
      className={buttonVariants({ variant, className: 'w-fit' })}
    >
      <ArrowLeft data-icon="inline-start" />
      Back to projects
    </Link>
  )
}
