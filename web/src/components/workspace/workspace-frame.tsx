import {
  createContext,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Menu } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { InitialLayout } from '@/features/auth/initial-layout'

const InitialLayoutContext = createContext<InitialLayout>({ kind: 'signin' })

export function useInitialLayout() {
  return useContext(InitialLayoutContext)
}

export function WorkspaceProvider({
  children,
  initialLayout,
}: {
  children: ReactNode
  initialLayout: InitialLayout
}) {
  // Keep the document's choice through hydration and the first session query.
  const [initial] = useState(initialLayout)
  return (
    <InitialLayoutContext.Provider value={initial}>
      <TooltipProvider>
        <SidebarProvider
          open
          style={
            {
              '--sidebar-width': '15rem',
            } as CSSProperties
          }
        >
          {children}
        </SidebarProvider>
      </TooltipProvider>
    </InitialLayoutContext.Provider>
  )
}

export function WorkspaceFrame({
  sidebar,
  demoEnabled = false,
  children,
}: {
  sidebar: ReactNode
  demoEnabled?: boolean
  children: ReactNode
}) {
  const { openMobile, setOpenMobile } = useSidebar()
  return (
    <>
      {sidebar}
      <SidebarInset
        id="main-content"
        className="min-w-0 md:pt-[env(safe-area-inset-top)]"
      >
        <header className="sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-1 border-b border-sidebar-border bg-sidebar pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] text-sidebar-foreground backdrop-blur-xl md:hidden">
          <Button
            variant="ghost"
            size="icon-lg"
            className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Open navigation"
            aria-expanded={openMobile}
            onClick={() => setOpenMobile(true)}
          >
            <Menu />
          </Button>
          <div className="flex min-w-0 items-center gap-3">
            <Logo compact className="h-11 shrink-0 text-sidebar-foreground" />
            {demoEnabled && (
              <Badge
                variant="outline"
                className="border-sidebar-border text-sidebar-foreground/75"
              >
                Demo
              </Badge>
            )}
          </div>
        </header>
        <div className="@container/main flex flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 py-6 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] pl-4 max-md:pl-[max(1rem,env(safe-area-inset-left))] md:gap-8 md:py-8 md:pr-[max(1.5rem,env(safe-area-inset-right))] md:pb-[calc(2rem+env(safe-area-inset-bottom))] md:pl-6 lg:py-10 lg:pr-[max(2.5rem,env(safe-area-inset-right))] lg:pb-[calc(2.5rem+env(safe-area-inset-bottom))] lg:pl-10">
            {children}
          </div>
        </div>
      </SidebarInset>
    </>
  )
}
