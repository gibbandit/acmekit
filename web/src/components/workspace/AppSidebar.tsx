import {
  Link,
  useHydrated,
  useLoaderData,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { graphql, useFragment } from 'react-relay'
import {
  Blocks,
  BookOpen,
  FolderKanban,
  LayoutDashboard,
  UserRound,
} from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Badge } from '@/components/ui/badge'
import { AccountMenu } from '@/components/workspace/account-menu'
import type { AppSidebar_viewer$key } from '@relay/AppSidebar_viewer.graphql'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'

const navigation = [
  { title: 'Overview', to: '/', icon: LayoutDashboard },
  { title: 'Projects', to: '/projects', icon: FolderKanban },
] as const
const settings = [
  { title: 'Components', to: '/components', icon: Blocks },
  { title: 'Session', to: '/session', icon: UserRound },
] as const

const viewerFragment = graphql`
  fragment AppSidebar_viewer on User {
    ...accountMenu_viewer
  }
`

export function AppSidebar({
  viewer: viewerRef,
  demoEnabled = false,
}: {
  viewer?: AppSidebar_viewer$key
  demoEnabled?: boolean
}) {
  const viewer = useFragment(viewerFragment, viewerRef ?? null)
  const hydrated = useHydrated()
  const router = useRouter()
  const { pendingRouteId } = useLoaderData({ from: '__root__' })
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const activePath = hydrated
    ? pathname
    : (Object.values(router.routesById).find(
        (route) => route.id === pendingRouteId,
      )?.fullPath ?? '')
  const { setOpenMobile } = useSidebar()

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="h-14 shrink-0 justify-center border-b border-sidebar-border px-5 py-0 max-md:pr-16 md:h-18">
        <div className="flex min-w-0 items-center gap-3">
          <Logo
            compact
            className="h-11 shrink-0 gap-3 text-sidebar-foreground"
            onClick={() => setOpenMobile(false)}
          />
          {demoEnabled && (
            <Badge
              variant="outline"
              className="border-sidebar-border text-sidebar-foreground/75"
            >
              Demo
            </Badge>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0 py-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    className="max-md:h-11 [&_svg]:text-sidebar-foreground/60 data-active:[&_svg]:text-sidebar-accent-foreground"
                    render={
                      hydrated ? <Link to={item.to} /> : <a href={item.to} />
                    }
                    isActive={
                      item.to === '/'
                        ? activePath === '/'
                        : activePath.startsWith(item.to)
                    }
                    tooltip={item.title}
                    onClick={() => setOpenMobile(false)}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator className="data-horizontal:w-auto" />
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {settings.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    className="max-md:h-11 [&_svg]:text-sidebar-foreground/60 data-active:[&_svg]:text-sidebar-accent-foreground"
                    render={
                      hydrated ? <Link to={item.to} /> : <a href={item.to} />
                    }
                    isActive={activePath.startsWith(item.to)}
                    tooltip={item.title}
                    onClick={() => setOpenMobile(false)}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="max-md:h-11 [&_svg]:text-sidebar-foreground/60 data-active:[&_svg]:text-sidebar-accent-foreground"
              render={
                <a
                  href="https://github.com/gibbandit/acmekit/tree/main/docs"
                  target="_blank"
                  rel="noreferrer"
                />
              }
              tooltip="Documentation"
            >
              <BookOpen />
              <span>Documentation</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator className="mx-0 data-horizontal:w-auto" />
        <div className="flex items-center">
          <AccountMenu viewer={viewer ?? undefined} />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
