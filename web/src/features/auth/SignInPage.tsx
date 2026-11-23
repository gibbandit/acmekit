import { ArrowRight } from 'lucide-react'
import type { SignInOptions } from './types'
import { useHashDialog } from '@/hooks/use-hash-dialog'
import { Logo } from '@/components/Logo'
import { LoginDialog } from '@/features/auth/LoginDialog'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'

type SignInPageProps = {
  serverInfo?: SignInOptions
  interactive?: boolean
}

export function SignInPage({
  serverInfo,
  interactive = true,
}: SignInPageProps) {
  return interactive ? (
    <InteractiveSignInPage serverInfo={serverInfo} />
  ) : (
    <SignInView serverInfo={serverInfo} interactive={false} />
  )
}

function InteractiveSignInPage({
  serverInfo,
}: Pick<SignInPageProps, 'serverInfo'>) {
  const [loginOpen, setLoginOpen] = useHashDialog('login')
  return (
    <SignInView
      serverInfo={serverInfo}
      loginOpen={loginOpen}
      onLoginOpenChange={setLoginOpen}
    />
  )
}

function SignInView({
  serverInfo,
  interactive = true,
  loginOpen = false,
  onLoginOpenChange,
}: SignInPageProps & {
  loginOpen?: boolean
  onLoginOpenChange?: (open: boolean) => void
}) {
  return (
    <main
      id="main-content"
      data-slot="sign-in-page"
      className="relative flex min-h-dvh w-full flex-col justify-center bg-background pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))] md:pt-[max(2.5rem,env(safe-area-inset-top))] md:pr-[max(2.5rem,env(safe-area-inset-right))] md:pb-[max(2.5rem,env(safe-area-inset-bottom))] md:pl-[max(2.5rem,env(safe-area-inset-left))]"
    >
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))]">
        <ModeToggle />
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-8 text-center">
        <Logo className="h-12 [&>span]:h-full [&>span]:w-[196.5px]" />
        <header className="flex flex-col items-center gap-4">
          <h1 className="font-heading text-record md:text-page">
            Welcome to Acme
          </h1>
          <p className="max-w-[34ch] text-base/7 text-muted-foreground">
            Manage projects and keep your workspace organized.
          </p>
        </header>
        <Button
          id="sign-in-continue"
          className="w-full"
          disabled={!interactive || serverInfo === undefined}
          onClick={() => onLoginOpenChange?.(true)}
        >
          Continue
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
      <LoginDialog
        open={interactive && serverInfo !== undefined && loginOpen}
        onOpenChange={(open) => onLoginOpenChange?.(open)}
        demoEnabled={serverInfo?.demoEnabled ?? false}
        githubEnabled={serverInfo?.githubEnabled ?? false}
      />
    </main>
  )
}
