import { buttonVariants } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  createRootRouteWithContext,
  ClientOnly,
  HeadContent,
  Outlet,
  Scripts,
  Link,
} from '@tanstack/react-router'
import type { Environment } from 'relay-runtime'
import { getRouterInstance } from '@tanstack/react-start'
import {
  bootstrapElementId,
  readBootstrapText,
} from '@acmekit/route-adapter/runtime'
import { ThemeProvider } from '@/components/theme-provider'
import { Logo } from '../components/Logo'
import { WorkspaceProvider } from '@/components/workspace/workspace-frame'
import { WorkspaceLoading } from '@/components/workspace/loading'
import appCSS from '../styles.css?url'
import instrumentSansLatinURL from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url'
import archivoLatinURL from '@fontsource/archivo/files/archivo-latin-500-normal.woff2?url'
import {
  getInitialLayout,
  type InitialLayout,
} from '@/features/auth/initial-layout'
import {
  compileRoutePreloads,
  preloadMetadataElementId,
  readPreloadMetadataText,
} from '@acmekit/route-adapter/runtime'

export const Route = createRootRouteWithContext<{
  relayEnvironment: Environment
}>()({
  staticData: { preloadTimeoutMs: 1000 },
  // Static documents contain only public layout metadata, never a session or
  // a concrete dynamic parameter. Go selects the document before serving it.
  beforeLoad: async ({
    matches,
  }): Promise<{
    pendingRouteId: string
    preloadMetadata: string
  }> => ({
    pendingRouteId: matches.at(-1)?.routeId ?? '__root__',
    preloadMetadata: compileRoutePreloads(
      await getRouterInstance(),
      matches,
      import.meta.env.PROD,
    ),
  }),
  loader: async ({
    context,
  }): Promise<{
    pendingRouteId: string
    initialLayout: InitialLayout
    preloadMetadata: string
  }> => {
    const initialLayout = await getInitialLayout()
    return {
      pendingRouteId: context.pendingRouteId,
      initialLayout,
      // The public SPA document supplies presentation only. Go bootstraps it
      // using declarations from the originally requested route's document.
      preloadMetadata:
        initialLayout.kind === 'signin'
          ? JSON.stringify({ version: 1, preloads: [] })
          : context.preloadMetadata,
    }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'Acme — Workspace' },
      {
        name: 'description',
        content:
          'An Acme template with a Go server, embedded React, GraphQL, and session authentication.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCSS },
      {
        rel: 'preload',
        href: instrumentSansLatinURL,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: archivoLatinURL,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  component: Root,
  notFoundComponent: () => (
    <main
      id="main-content"
      className="grid min-h-svh w-full place-items-center bg-background pt-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))]"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="gap-4">
          <Logo />
          <CardTitle>
            <h1 className="font-heading text-dialog">Page not found</h1>
          </CardTitle>
          <CardDescription>
            The page you requested does not exist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/" className={cn(buttonVariants())}>
            Back to Acme
          </Link>
        </CardContent>
      </Card>
    </main>
  ),
})

function Root() {
  const { initialLayout, preloadMetadata } = Route.useLoaderData()
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="relative bg-inherit font-sans text-foreground antialiased selection:bg-primary selection:text-primary-foreground">
        <script
          id={preloadMetadataElementId}
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: readPreloadMetadataText(preloadMetadata),
          }}
        />
        <script
          id={bootstrapElementId}
          type="application/json"
          dangerouslySetInnerHTML={{ __html: readBootstrapText() }}
        />
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:top-[max(1rem,env(safe-area-inset-top))] focus:left-[max(1rem,env(safe-area-inset-left))] focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-md focus:ring-2 focus:ring-ring"
          href="#main-content"
        >
          Skip to content
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          storageKey="acme-theme"
          enableSystem
          disableTransitionOnChange
        >
          <WorkspaceProvider initialLayout={initialLayout}>
            <ClientOnly fallback={<WorkspaceLoading />}>
              <Outlet />
            </ClientOnly>
          </WorkspaceProvider>
          <Toaster position="bottom-right" closeButton />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
