import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { expect, test, type TestContext } from 'vitest'
import { createStaticRoutes } from './static-routes.ts'
import { createRouteAdapter } from './vite.ts'

async function fixture(
  t: TestContext,
  files: readonly string[],
  routesDirectory = 'src/routes',
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'route-shells-'))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  for (const file of ['__root', ...files]) {
    const path = join(root, routesDirectory, `${file}.tsx`)
    await mkdir(dirname(path), { recursive: true })
    const source =
      file === '__root'
        ? "import { createRootRoute } from '@tanstack/react-router'; export const Route = createRootRoute({});"
        : "import { createFileRoute } from '@tanstack/react-router'; export const Route = createFileRoute('/')({ component: () => null, pendingComponent: () => null });"
    await writeFile(
      path,
      `${source}\nthrow new Error('Route modules must not execute during generation');\n`,
    )
  }
  return root
}

test('uses generator metadata for pathless, nested, index, and non-nested routes', async (t) => {
  const root = await fixture(t, [
    '_app',
    '_app.index',
    '_app.projects',
    '_app.projects_.$projectId',
    '_app.projects_.$projectId.tasks.$taskId',
    '_app.session',
    '_app.settings',
    '_app.settings.index',
    '_app.settings.profile',
  ])
  const routeTreeFile = join(root, 'src/routeTree.gen.ts')
  const existingRouteTree =
    '// Owned by TanStack Start, including its framework footer.\n'
  await writeFile(routeTreeFile, existingRouteTree)
  const plan = await createStaticRoutes(root)
  const routes = new Map(
    plan.manifest.routes.map((route) => [route.pattern, route]),
  )
  expect(plan.manifest.version).toBe(3)
  expect(plan.manifest.fallback).toBe('_shell.html')
  expect([...routes.keys()].sort()).toEqual(
    [
      '/',
      '/projects',
      '/projects/$projectId',
      '/projects/$projectId/tasks/$taskId',
      '/session',
      '/settings/',
      '/settings/profile',
    ].sort(),
  )
  expect(routes.get('/')).toStrictEqual({
    pattern: '/',
    file: 'index.html',
    routeId: '/_app/',
    segments: [],
  })
  expect(routes.get('/settings/')?.routeId).toBe('/_app/settings/')
  expect(routes.get('/projects')?.file).toBe('projects/index.html')
  expect(routes.get('/projects/$projectId')?.routeId).toBe(
    '/_app/projects_/$projectId',
  )
  expect(routes.get('/projects/$projectId')?.file).toMatch(
    /^_routes\/[a-f0-9]{20}\.html$/,
  )
  expect(plan.pages.find((page) => page.path === '/')).toStrictEqual({
    path: '/',
    prerender: { enabled: true, outputPath: '/index.html', crawlLinks: false },
    sitemap: { exclude: true },
  })
  const nested = plan.pages.find(
    (page) => page.path === '/projects/__route_shell__/tasks/__route_shell__',
  )
  expect(nested, 'Nested parameter route has a prerender entry').toBeDefined()
  expect(nested?.prerender.outputPath).toBe(
    `/${routes.get('/projects/$projectId/tasks/$taskId')?.file}`,
  )
  expect(
    plan.pages.every(
      (page) =>
        page.prerender.enabled &&
        !page.prerender.crawlLinks &&
        page.sitemap.exclude,
    ),
  ).toBe(true)
  expect(
    await createStaticRoutes(root),
    'reruns produce an identical plan',
  ).toStrictEqual(plan)
  expect(
    await readFile(routeTreeFile, 'utf8'),
    'metadata discovery preserves the canonical Start route tree',
  ).toBe(existingRouteTree)
})

test('shares native Start source, route, and token settings without replacing its route tree', async (t) => {
  const root = await fixture(
    t,
    ['home', 'books/view', 'books/home', 'books/$slug', 'ignored'],
    'frontend/pages',
  )
  const routeTreeFile = join(root, 'frontend/application-tree.ts')
  const existingRouteTree = '// Start owns this configured development tree.\n'
  await writeFile(routeTreeFile, existingRouteTree)
  const { manifest } = await createRouteAdapter(root, {
    srcDirectory: 'frontend',
    router: {
      routesDirectory: 'pages',
      generatedRouteTree: 'application-tree.ts',
      tmpDir: join(root, '.cache/router-tmp'),
      indexToken: 'home',
      routeToken: 'view',
      routeFileIgnorePattern: 'ignored',
    },
  })
  expect(manifest.routes.map(({ pattern }) => pattern).sort()).toEqual([
    '/',
    '/books/',
    '/books/$slug',
  ])
  expect(await readFile(routeTreeFile, 'utf8')).toBe(existingRouteTree)
  expect(
    await readFile(join(root, '.tanstack/static-route-tree.gen.ts'), 'utf8'),
  ).toContain('/books/$slug')
})

test('keeps standalone native configuration when inline Start settings are omitted', async (t) => {
  const root = await fixture(t, ['home', 'library/view'], 'custom-routes')
  await writeFile(
    join(root, 'tsr.config.json'),
    JSON.stringify({
      routesDirectory: './custom-routes',
      generatedRouteTree: './development-tree.ts',
      indexToken: 'home',
      routeToken: 'view',
    }),
  )
  const routeTreeFile = join(root, 'development-tree.ts')
  const existingRouteTree = '// Native generator development tree.\n'
  await writeFile(routeTreeFile, existingRouteTree)
  const { manifest } = await createStaticRoutes(root)
  expect(manifest.routes.map(({ pattern }) => pattern).sort()).toEqual([
    '/',
    '/library',
  ])
  expect(await readFile(routeTreeFile, 'utf8')).toBe(existingRouteTree)
})

test('uses the shared native virtual route configuration', async (t) => {
  const root = await fixture(
    t,
    ['landing', 'detail', 'unlisted'],
    'frontend/pages',
  )
  const { manifest } = await createStaticRoutes(root, {
    srcDirectory: 'frontend',
    router: {
      routesDirectory: 'pages',
      virtualRouteConfig: {
        type: 'root',
        file: '__root.tsx',
        children: [
          { type: 'index', file: 'landing.tsx' },
          { type: 'route', path: '/catalog/$slug', file: 'detail.tsx' },
        ],
      },
    },
  })
  expect(manifest.routes.map(({ pattern }) => pattern).sort()).toEqual([
    '/',
    '/catalog/$slug',
  ])
})

test('uses the generic SPA shell at the root when no root page is declared', async (t) => {
  const root = await fixture(t, ['reports'])
  const plan = await createStaticRoutes(root)
  expect(plan.manifest.fallback).toBe('_shell.html')
  expect(plan.manifest.routes.some((route) => route.pattern === '/')).toBe(
    false,
  )
  expect(plan.pages.map((page) => page.path)).toEqual(['/reports'])
})

test('directory routes preserve flat route IDs and ignore colocated component folders', async (t) => {
  const flat = await fixture(t, [
    '_app',
    '_app.index',
    '_app.projects',
    '_app.projects_.$projectId',
    '_app.components',
    '_app.session',
  ])
  const directories = await fixture(t, [
    '_app/route',
    '_app/index/route',
    '_app/index/-components/OverviewPage',
    '_app/projects/route',
    '_app/projects/-components/ProjectsPage',
    '_app/projects_/$projectId/route',
    '_app/projects_/$projectId/-components/ProjectDetailPage',
    '_app/components/route',
    '_app/session/route',
  ])
  const original = await createStaticRoutes(flat)
  const plan = await createStaticRoutes(directories)
  function byPath(result: Awaited<ReturnType<typeof createStaticRoutes>>) {
    return {
      pages: [...result.pages].sort((a, b) => a.path.localeCompare(b.path)),
      manifest: {
        ...result.manifest,
        routes: [...result.manifest.routes].sort((a, b) =>
          a.routeId.localeCompare(b.routeId),
        ),
      },
    }
  }
  expect(byPath(plan)).toStrictEqual(byPath(original))
  expect(
    plan.manifest.routes.find(({ pattern }) => pattern === '/')?.routeId,
  ).toBe('/_app/')
})

test('nested directory indexes own their parent URL alongside sibling pages', async (t) => {
  const root = await fixture(t, [
    '_app/route',
    '_app/index/route',
    '_app/components/route',
    '_app/components/index/route',
    '_app/components/appearance/route',
    '_app/components/ai/route',
  ])
  const plan = await createStaticRoutes(root)
  expect(
    plan.manifest.routes.map(({ pattern, file, routeId }) => ({
      pattern,
      file,
      routeId,
    })),
  ).toStrictEqual([
    { pattern: '/', file: 'index.html', routeId: '/_app/' },
    {
      pattern: '/components/',
      file: 'components/index.html',
      routeId: '/_app/components/',
    },
    {
      pattern: '/components/ai',
      file: 'components/ai/index.html',
      routeId: '/_app/components/ai',
    },
    {
      pattern: '/components/appearance',
      file: 'components/appearance/index.html',
      routeId: '/_app/components/appearance',
    },
  ])
  expect(
    plan.pages.map(({ path, prerender }) => ({
      path,
      output: prerender.outputPath,
    })),
  ).toStrictEqual([
    { path: '/', output: '/index.html' },
    { path: '/components', output: '/components/index.html' },
    { path: '/components/ai', output: '/components/ai/index.html' },
    {
      path: '/components/appearance',
      output: '/components/appearance/index.html',
    },
  ])
})

test('rejects separate index pages that resolve to the same URL', async (t) => {
  const root = await fixture(t, [
    'index',
    '(first).components.index',
    '(second).components.index',
  ])
  await expect(createStaticRoutes(root)).rejects.toThrow(
    /Conflicting configuration paths|multiple pages resolve/,
  )
})

test('route groups do not become URL segments, and standalone params remain supported', async (t) => {
  const root = await fixture(t, ['index', '(workspace).reports', '$slug'])
  const { manifest } = await createStaticRoutes(root)
  expect(manifest.routes.map((route) => route.pattern).sort()).toEqual(
    ['/reports', '/', '/$slug'].sort(),
  )
})

test('dynamic output names stay distinct when readable slugs would collide', async (t) => {
  const root = await fixture(t, ['index', 'a-b.$id', 'a.b.$id'])
  const { manifest } = await createStaticRoutes(root)
  const files = manifest.routes.map((route) => route.file)
  expect(new Set(files).size).toBe(files.length)
})

test.for([
  {
    file: 'files.{-$id}',
    pattern: '/files/{-$id}',
    segment: { kind: 'optional', name: 'id', prefix: '', suffix: '' },
  },
  {
    file: 'files.pre-{$id}[.]json',
    pattern: '/files/pre-{$id}.json',
    segment: { kind: 'param', name: 'id', prefix: 'pre-', suffix: '.json' },
  },
  {
    file: 'files.pre-{-$id}[.]json',
    pattern: '/files/pre-{-$id}.json',
    segment: { kind: 'optional', name: 'id', prefix: 'pre-', suffix: '.json' },
  },
  {
    file: 'files.$',
    pattern: '/files/$',
    segment: { kind: 'splat', name: '_splat', prefix: '', suffix: '' },
  },
  {
    file: 'files.pre-{$}[.]txt',
    pattern: '/files/pre-{$}.txt',
    segment: { kind: 'splat', name: '_splat', prefix: 'pre-', suffix: '.txt' },
  },
  {
    file: 'files.{$}.download',
    pattern: '/files/{$}/download',
    segment: { kind: 'splat', name: '_splat', prefix: '', suffix: '/download' },
  },
  {
    file: 'files.$.ignored',
    pattern: '/files/$/ignored',
    segment: { kind: 'splat', name: '_splat', prefix: '', suffix: '' },
  },
])('exports native segments for $pattern', async (expected, t) => {
  const root = await fixture(t, ['index', expected.file])
  const plan = await createStaticRoutes(root)
  const route = plan.manifest.routes.find(
    ({ pattern }) => pattern === expected.pattern,
  )
  expect(route?.segments).toStrictEqual([
    { kind: 'static', value: 'files' },
    expected.segment,
  ])
  expect(
    plan.pages.some((page) => page.prerender.outputPath === `/${route?.file}`),
  ).toBe(true)
})

test('prerenders a splat-suffix index under its explicit native parent', async (t) => {
  const root = await fixture(t, ['index', 'foo.{$}.bar', 'foo.{$}.bar.index'])
  const plan = await createStaticRoutes(root)
  const entry = plan.manifest.routes.find(
    ({ pattern }) => pattern === '/foo/{$}/bar/',
  )
  expect(entry).toBeDefined()
  const page = plan.pages.find(
    ({ prerender }) => prerender.outputPath === `/${entry?.file}`,
  )
  expect(page).toBeDefined()

  const nativeRoot = createRootRoute()
  const parent = createRoute({
    getParentRoute: () => nativeRoot,
    path: '/foo/{$}/bar',
  })
  const index = createRoute({ getParentRoute: () => parent, path: '/' })
  const router = createRouter({
    routeTree: nativeRoot.addChildren([parent.addChildren([index])]),
    isServer: true,
    caseSensitive: true,
  })
  const location = createMemoryHistory({
    initialEntries: [page!.path],
  }).location
  const [, params, owner] = router.getMatchedRoutes(
    router.parseLocation(location).pathname,
  )
  expect(owner).toBe(index)
  expect(owner?.id).toBe(entry?.routeId)
  expect(params).not.toHaveProperty('**')
})

test('an optional route keeps its absent-parameter witness beside a required sibling', async (t) => {
  const root = await fixture(t, ['index', 'reports.$id', 'reports.{-$id}'])
  const plan = await createStaticRoutes(root)
  const optional = plan.manifest.routes.find(
    ({ pattern }) => pattern === '/reports/{-$id}',
  )
  expect(optional).toBeDefined()
  expect(
    plan.pages.find(
      (page) => page.prerender.outputPath === `/${optional?.file}`,
    )?.path,
  ).toBe('/reports')
})

test('omits a family shadowed by an index and required sibling', async (t) => {
  const root = await fixture(t, [
    'index',
    'reports',
    'reports.index',
    'reports.$id',
    'reports.{-$id}',
  ])
  const { manifest } = await createStaticRoutes(root)
  expect(manifest.routes.map(({ pattern }) => pattern).sort()).toEqual(
    ['/', '/reports/', '/reports/$id'].sort(),
  )
})

test('omits a parent whose optional descendant owns the parent URL', async (t) => {
  const root = await fixture(t, ['index', 'reports', 'reports.{-$id}'])
  const { manifest } = await createStaticRoutes(root)
  expect(manifest.routes.map(({ pattern }) => pattern).sort()).toEqual(
    ['/', '/reports/{-$id}'].sort(),
  )
})

test('a leading optional owns root without an artificial root fallback route', async (t) => {
  const root = await fixture(t, ['{-$language}'])
  const { manifest } = await createStaticRoutes(root)
  expect(manifest.routes.map(({ pattern }) => pattern)).toEqual([
    '/{-$language}',
  ])
})

test('rejects a root output file reused as an output directory', async (t) => {
  const root = await fixture(t, ['index', 'index[.]html'])
  await expect(createStaticRoutes(root)).rejects.toThrow(
    'Static route shells: output file collision for /index.html',
  )
})

test('rejects a nested output file reused as an output directory', async (t) => {
  const root = await fixture(t, ['index', 'reports', 'reports.index[.]html'])
  await expect(createStaticRoutes(root)).rejects.toThrow(
    'Static route shells: output file collision for /reports/index.html',
  )
})

for (const route of ['files.prefix-$id', 'files.$id.$id', 'files.$bad-name']) {
  test(`rejects unsupported route grammar: ${route}`, async (t) => {
    const root = await fixture(t, ['index', route])
    await expect(createStaticRoutes(root)).rejects.toThrow(
      /Static route shells: (unsupported|duplicate)/,
    )
  })
}

for (const route of [
  'assets.image',
  '[_]routes.shell',
  '[_]shell[.]html',
  'route-shells[.]json',
  'projects.[_]_route_shell_[_]',
]) {
  test(`rejects reserved URLs: ${route}`, async (t) => {
    const root = await fixture(t, ['index', route])
    await expect(createStaticRoutes(root)).rejects.toThrow(
      /Static route shells: .*reserved/,
    )
  })
}

for (const route of ['api.users', 'auth', 'graphql', 'healthz']) {
  test(`rejects consumer-reserved URLs: ${route}`, async (t) => {
    const root = await fixture(t, ['index', route])
    await expect(
      createStaticRoutes(root, {
        reservedPaths: ['/api', '/auth', '/graphql', '/healthz'],
      }),
    ).rejects.toThrow(/Static route shells: .*reserved/)
  })
}

test('allows consumer auth pages unless the consumer reserves their namespace', async (t) => {
  const root = await fixture(t, ['auth', 'auth.callback'])
  const { manifest } = await createStaticRoutes(root)
  expect(manifest.routes.map(({ pattern }) => pattern)).toEqual([
    '/auth',
    '/auth/callback',
  ])
  await expect(
    createStaticRoutes(root, { reservedPaths: ['/auth'] }),
  ).rejects.toThrow('Static route shells: reserved URL prefix in /auth')
})

test('rejects the same matching pattern under different parameter names', async (t) => {
  const root = await fixture(t, ['index', 'projects.$id', 'projects.$slug'])
  await expect(createStaticRoutes(root)).rejects.toThrow(
    /ambiguous parameter pattern/,
  )
})
