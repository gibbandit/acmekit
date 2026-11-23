import { defineRouteQuery } from '@/lib/route-query'
import { createFileRoute, useAwaited } from '@tanstack/react-router'
import { Suspense, useState } from 'react'
import { graphql, useFragment, useLazyLoadQuery } from 'react-relay'
import type { SessionPageQuery as SessionPageQueryType } from '@relay/SessionPageQuery.graphql'
import type {
  SessionPage_viewer$data,
  SessionPage_viewer$key,
} from '@relay/SessionPage_viewer.graphql'
import type {
  SessionPage_serverInfo$data,
  SessionPage_serverInfo$key,
} from '@relay/SessionPage_serverInfo.graphql'
import { Check, Info, Loader2, LogOut, UserRound, X } from 'lucide-react'
import { useHashDialog } from '@/hooks/use-hash-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DescriptionList,
  DescriptionListDetails,
  DescriptionListItem,
  DescriptionListTerm,
} from '@/components/ui/description-list'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InlineError, PageHeader } from '@/components/page'
import { LoginDialog } from '@/features/auth/LoginDialog'
import { initials, postJSON } from '@/lib/utils'
import { RequestError } from '@/lib/errors'

type SessionViewProps = {
  viewer?: SessionPage_viewer$data
  serverInfo?: SessionPage_serverInfo$data
  switching?: boolean
  onSwitchingChange?: (open: boolean) => void
}

const viewerFragment = graphql`
  fragment SessionPage_viewer on User {
    name
    role
    avatarUrl
    canManageProjects
  }
`

const serverInfoFragment = graphql`
  fragment SessionPage_serverInfo on ServerInfo {
    name
    version
    demoEnabled
    githubEnabled
    storage
  }
`

const sessionQuery = defineRouteQuery<SessionPageQueryType>()({
  request: graphql`
    query SessionPageQuery {
      viewer {
        ...SessionPage_viewer
      }
      serverInfo {
        ...SessionPage_serverInfo
      }
    }
  `,
  authenticated: true,
})

export const Route = createFileRoute('/_app/session')({
  loader: (args) => sessionQuery.loader(args),
  component: SessionPage,
  pendingComponent: SessionLoading,
  staticData: {
    preloads: [sessionQuery.preload],
  },
  head: () => ({ meta: [{ title: 'Session · Acme' }] }),
})

function SessionPage() {
  const [switching, setSwitching] = useHashDialog('role')
  return (
    <Suspense fallback={<SessionLoading />}>
      <SessionData switching={switching} onSwitchingChange={setSwitching} />
    </Suspense>
  )
}

function SessionData({
  switching,
  onSwitchingChange,
}: {
  switching: boolean
  onSwitchingChange: (open: boolean) => void
}) {
  const { ready, variables } = Route.useLoaderData()
  useAwaited({ promise: ready })
  const data = useLazyLoadQuery<SessionPageQueryType>(
    sessionQuery.request,
    variables,
  )
  const viewer = useFragment<SessionPage_viewer$key>(
    viewerFragment,
    data.viewer ?? null,
  )
  const serverInfo = useFragment<SessionPage_serverInfo$key>(
    serverInfoFragment,
    data.serverInfo,
  )
  if (!viewer)
    throw new RequestError('Sign in to continue.', ['UNAUTHENTICATED'])
  return (
    <SessionView
      viewer={viewer}
      serverInfo={serverInfo}
      switching={switching}
      onSwitchingChange={onSwitchingChange}
    />
  )
}

function SessionLoading() {
  return (
    <>
      <span role="status" className="sr-only">
        Loading session details
      </span>
      <SessionView />
    </>
  )
}

function SessionView({
  viewer,
  serverInfo,
  switching = false,
  onSwitchingChange,
}: SessionViewProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function logout() {
    if (!viewer) return
    setBusy(true)
    setError(null)
    try {
      await postJSON('/auth/logout')
      window.location.assign('/')
    } catch (cause) {
      setError(cause)
      setBusy(false)
    }
  }

  const permissions = [
    ['View projects', viewer ? true : undefined],
    ['Create projects', viewer?.canManageProjects],
    ['Edit project details', viewer?.canManageProjects],
    ['Delete projects', viewer?.canManageProjects],
  ] as const

  return (
    <div
      className="flex flex-col gap-6 md:gap-8"
      aria-busy={!viewer || !serverInfo}
    >
      <PageHeader title="Session" />

      <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card role="group" aria-label="Account">
          <CardHeader className="flex flex-row items-center gap-4 lg:flex-col lg:items-start lg:gap-6">
            {viewer ? (
              <Avatar className="size-16">
                {viewer.avatarUrl && (
                  <AvatarImage src={viewer.avatarUrl} alt={viewer.name} />
                )}
                <AvatarFallback className="text-title">
                  {initials(viewer.name)}
                </AvatarFallback>
              </Avatar>
            ) : (
              <Skeleton className="size-16 shrink-0 rounded-full" />
            )}
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex min-h-20 items-center sm:min-h-10">
                {viewer ? (
                  <p className="text-record font-medium break-words">
                    {viewer.name}
                  </p>
                ) : (
                  <Skeleton className="h-10 w-40" />
                )}
              </div>
              <div
                role="group"
                aria-label="Account status"
                className="flex gap-2"
              >
                {viewer ? (
                  <Badge variant="outline" className="w-24">
                    {viewer.role === 'MAINTAINER' ? 'Maintainer' : 'Member'}
                  </Badge>
                ) : (
                  <Skeleton className="h-5 w-24 rounded-full" />
                )}
              </div>
            </div>
          </CardHeader>
          {error !== null && (
            <CardContent>
              <InlineError error={error} />
            </CardContent>
          )}
          <CardFooter className="mt-auto border-t">
            <Button
              variant="outline"
              className="w-full"
              disabled={!viewer || busy}
              aria-busy={busy}
              onClick={logout}
            >
              {busy ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <LogOut data-icon="inline-start" />
              )}
              Sign out
            </Button>
          </CardFooter>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2>Permissions</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="-mx-2 sm:-mx-3">
              <Table aria-label="Project permissions" className="table-fixed">
                <colgroup>
                  <col className="sm:w-3/5" />
                  <col className="w-30 sm:w-2/5" />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead className="text-right">Access</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissions.map(([label, allowed]) => (
                    <TableRow key={label}>
                      <TableCell className="whitespace-normal sm:whitespace-nowrap">
                        {label}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          {allowed === undefined ? (
                            <Skeleton className="h-5 w-26 rounded-full" />
                          ) : (
                            <Badge
                              variant={allowed ? 'secondary' : 'outline'}
                              className="w-26"
                            >
                              {allowed ? (
                                <Check data-icon="inline-start" />
                              ) : (
                                <X data-icon="inline-start" />
                              )}
                              {allowed ? 'Allowed' : 'Not allowed'}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-start-2">
          <CardHeader>
            <CardTitle>
              <h2>Workspace</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <DescriptionList>
              <DescriptionListItem>
                <DescriptionListTerm>Application</DescriptionListTerm>
                <DescriptionListDetails className="min-w-24">
                  {serverInfo ? (
                    serverInfo.name
                  ) : (
                    <Skeleton className="h-5 w-16" />
                  )}
                </DescriptionListDetails>
              </DescriptionListItem>
              <DescriptionListItem>
                <DescriptionListTerm>Version</DescriptionListTerm>
                <DescriptionListDetails className="min-w-24">
                  {serverInfo ? (
                    serverInfo.version
                  ) : (
                    <Skeleton className="h-5 w-12" />
                  )}
                </DescriptionListDetails>
              </DescriptionListItem>
              <DescriptionListItem>
                <DescriptionListTerm>Storage</DescriptionListTerm>
                <DescriptionListDetails className="min-w-24">
                  {serverInfo ? (
                    serverInfo.storage === 'memory' ? (
                      'In memory'
                    ) : (
                      serverInfo.storage
                    )
                  ) : (
                    <Skeleton className="h-5 w-20" />
                  )}
                </DescriptionListDetails>
              </DescriptionListItem>
            </DescriptionList>
            {serverInfo?.storage === 'memory' && (
              <Alert variant="warning">
                <Info />
                <AlertDescription>
                  Projects reset when the server restarts.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          {serverInfo?.demoEnabled && (
            <CardFooter className="border-t">
              <Button
                variant="outline"
                onClick={() => onSwitchingChange?.(true)}
              >
                <UserRound data-icon="inline-start" />
                Choose a role
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>

      {serverInfo && (
        <LoginDialog
          open={serverInfo.demoEnabled && switching}
          onOpenChange={(open) => onSwitchingChange?.(open)}
          demoEnabled={serverInfo.demoEnabled}
          githubEnabled={serverInfo.githubEnabled}
        />
      )}
    </div>
  )
}
