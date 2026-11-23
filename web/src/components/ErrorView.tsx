import { ArrowLeft, CircleAlert, RotateCcw } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { ErrorMessage } from '@/components/page'

export function ErrorView({ error }: { error: unknown }) {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CircleAlert className="mb-2 size-6 text-destructive" />
          <h1 className="font-heading text-dialog">Unable to load this page</h1>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            <ErrorMessage error={error} />
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button onClick={() => window.location.reload()}>
            <RotateCcw data-icon="inline-start" />
            Try again
          </Button>
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            <ArrowLeft data-icon="inline-start" />
            Overview
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
