import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ChevronsUpDown,
  Loader2,
  LogOut,
  Monitor,
  Moon,
  Sun,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { graphql, useFragment } from 'react-relay'
import type { accountMenu_viewer$key } from '@relay/accountMenu_viewer.graphql'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorMessage } from '@/components/page'
import { useTheme } from '@/components/theme-provider'
import { SidebarMenuButton, useSidebar } from '@/components/ui/sidebar'
import { initials, postJSON } from '@/lib/utils'

const viewerFragment = graphql`
  fragment accountMenu_viewer on User {
    name
    role
    avatarUrl
  }
`

export function AccountMenu({
  viewer: viewerRef,
}: {
  viewer?: accountMenu_viewer$key
}) {
  const viewer = useFragment(viewerFragment, viewerRef ?? null)
  const [signingOut, setSigningOut] = useState(false)
  const { theme = 'system', setTheme } = useTheme()
  const { setOpenMobile } = useSidebar()

  async function signOut() {
    setSigningOut(true)
    try {
      await postJSON('/auth/logout')
      window.location.assign('/')
    } catch (error) {
      toast.error(<ErrorMessage error={error} />)
      setSigningOut(false)
    }
  }

  if (!viewer) {
    return (
      <div
        aria-hidden="true"
        className="flex h-13 w-full items-center gap-3 px-3"
      >
        <Skeleton className="size-8 shrink-0 rounded-full bg-sidebar-accent" />
        <div className="flex flex-col">
          <div className="flex h-5 items-center">
            <Skeleton className="h-4 w-24 bg-sidebar-accent" />
          </div>
          <div className="flex h-4 items-center">
            <Skeleton className="h-3 w-16 bg-sidebar-accent" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            aria-label={`${viewer.name} account menu`}
            className="h-13 text-sidebar-foreground"
          />
        }
      >
        <Avatar className="ring-1 ring-sidebar-border">
          <AvatarImage src={viewer.avatarUrl ?? undefined} alt={viewer.name} />
          <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground/80">
            {initials(viewer.name)}
          </AvatarFallback>
        </Avatar>
        <div className="grid min-w-0 flex-1 text-left">
          <span className="truncate font-medium">{viewer.name}</span>
          <span className="truncate text-xs text-sidebar-foreground/65">
            {viewer.role === 'MAINTAINER' ? 'Maintainer' : 'Member'}
          </span>
        </div>
        <ChevronsUpDown className="ml-auto" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" side="top" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2">
            <Avatar aria-hidden="true">
              <AvatarImage
                src={viewer.avatarUrl ?? undefined}
                alt={viewer.name}
              />
              <AvatarFallback>{initials(viewer.name)}</AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">
                {viewer.name}
              </span>
              <span className="truncate font-normal">
                {viewer.role === 'MAINTAINER' ? 'Maintainer' : 'Member'}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={<Link to="/session" />}
            onClick={() => setOpenMobile(false)}
          >
            <UserRound />
            Your session
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuRadioItem value="light">
            <Sun />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            disabled={signingOut}
            aria-busy={signingOut}
            onClick={() => {
              void signOut()
            }}
          >
            {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
