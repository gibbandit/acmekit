import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createStaticRoutes } from '@acmekit/route-adapter/vite'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { expect, test } from 'vitest'

const execute = promisify(execFile)
const projectRoot = fileURLToPath(new URL('../..', import.meta.url))

const declarations = [
  ['index', '/'],
  ['docs/route', '/docs'],
  ['docs/index/route', '/docs/'],
  ['docs.new', '/docs/new'],
  ['docs.$id', '/docs/$id'],
  ['records.{-$section}.{-$slug}', '/records/{-$section}/{-$slug}'],
  ['locale.{-$lang}.posts.$slug', '/locale/{-$lang}/posts/$slug'],
  ['mixed.$id.{-$tab}.edit', '/mixed/$id/{-$tab}/edit'],
  ['{-$lang}.help', '/{-$lang}/help'],
  ['help.{-$topic}', '/help/{-$topic}'],
  ['guides.{-$lang}.index', '/guides/{-$lang}/'],
  ['guides.new', '/guides/new'],
  ['optional.pre-{-$id}-tail', '/optional/pre-{-$id}-tail'],
  ['files.$', '/files/$'],
  ['files.new', '/files/new'],
  ['downloads.{$name}[.]txt', '/downloads/{$name}.txt'],
  ['archives.pre-{$id}-end', '/archives/pre-{$id}-end'],
  ['$left.fixed', '/$left/fixed'],
  ['fixed.$right', '/fixed/$right'],
  ['overlap.{$value}-end', '/overlap/{$value}-end'],
  ['overlap.pre-{$id}', '/overlap/pre-{$id}'],
  ['prefix.pre-{$short}', '/prefix/pre-{$short}'],
  ['prefix.pre-long-{$long}', '/prefix/pre-long-{$long}'],
  ['prefix.$plain', '/prefix/$plain'],
  ['suffix.{$short}[.]gz', '/suffix/{$short}.gz'],
  ['suffix.{$long}[.]tar[.]gz', '/suffix/{$long}.tar.gz'],
  ['suffix.$plain', '/suffix/$plain'],
  ['wild.pre-{$}[.]txt', '/wild/pre-{$}.txt'],
  ['wild.$', '/wild/$'],
  ['case.Exact', '/case/Exact'],
  ['samples.pre-{$id}', '/samples/pre-{$id}'],
  ['samples.pre-__route_shell[_][_]', '/samples/pre-__route_shell__'],
  ['samples.pre-route-shell', '/samples/pre-route-shell'],
  ['samples.pre-0', '/samples/pre-0'],
  ['samples.pre-x', '/samples/pre-x'],
  ['samples.pre-', '/samples/pre-'],
] as const

const paths = [
  '/',
  '/docs',
  '/docs/new',
  '/docs/entry',
  '/docs/release.v1',
  '/docs/entry/extra',
  '/records',
  '/records/tech',
  '/records/tech/entry',
  '/records/tech/entry/extra',
  '/locale/posts/welcome',
  '/locale/en/posts/welcome',
  '/mixed/42/edit',
  '/mixed/42/history/edit',
  '/help',
  '/help/help',
  '/en/help',
  '/help/install',
  '/guides',
  '/guides/en',
  '/guides/new',
  '/optional',
  '/optional/pre--tail',
  '/optional/pre-entry-tail',
  '/optional/pre-entry-wrong',
  '/files',
  '/files/new',
  '/files/entry',
  '/files/a/b',
  '/files/a/b.txt',
  '/downloads/report.txt',
  '/downloads/.txt',
  '/downloads/report.csv',
  '/archives/pre-42-end',
  '/archives/pre--end',
  '/archives/pre-42-wrong',
  '/fixed/fixed',
  '/value/fixed',
  '/fixed/value',
  '/overlap/pre-value-end',
  '/overlap/value-end',
  '/overlap/pre-value',
  '/prefix/pre-long-value',
  '/prefix/pre-value',
  '/prefix/plain',
  '/suffix/report.tar.gz',
  '/suffix/report.gz',
  '/suffix/plain',
  '/wild/pre-a/b.txt',
  '/wild/pre-.txt',
  '/wild/pre-a/b.csv',
  '/wild/a/b',
  '/case/Exact',
  '/case/exact',
  '/CASE/Exact',
  '/archives/PRE-42-end',
  '/samples/pre-z',
  '/samples/pre-__route_shell__',
  '/%64ocs/new',
  '/docs/%6Eew',
  '/docs/a%2Fb',
  '/docs/a%2fb',
  '/docs/%252F',
  '/docs/%25',
  '/docs/%5C',
  '/docs/%255C',
  '/docs/a+b',
  '/docs/plus+sign',
  '/docs/a%20b',
  '/docs/%3b',
  '/docs/%3B',
  '/docs/%00',
  '/docs/%7B',
  '/docs/%C3%A9',
  '/docs/caf%C3%A9',
  '/docs/%F0%9F%92%A1',
  '/docs/%FF',
  '/docs/%F0%9F%92',
  '/docs/%C0%AF',
  '/docs/%E0%A4',
  '/downloads/a%2Fb.txt',
  '/wild/pre-a%2Fb/c.txt',
  '/files/a%2Fb/c',
  '/files/%252F',
  '/files/%FF',
  '/files/ok%41%FF',
  '/unknown/nested',
] as const

type Match = { routeId: string | null; params: Record<string, string> }

test('generated shells and Go routing agree with the native router', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'route-parity-'))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  for (const file of [
    '__root',
    '_app/route',
    ...declarations.map(([file]) => `_app/${file}`),
  ]) {
    const target = join(root, 'src/routes', `${file}.tsx`)
    await mkdir(dirname(target), { recursive: true })
    const declaration =
      file === '__root'
        ? "import { createRootRoute } from '@tanstack/react-router'; export const Route = createRootRoute({});"
        : "import { createFileRoute } from '@tanstack/react-router'; export const Route = createFileRoute('/')({});"
    await writeFile(
      target,
      `${declaration}\nthrow new Error('Route modules must not execute during generation');\n`,
    )
  }

  const plan = await createStaticRoutes(root)
  expect(plan.manifest.version).toBe(3)
  const expectedPaths = new Map<string, string>(
    declarations.map(([, path]) => [`/_app${path}`, path]),
  )
  expect(plan.manifest.routes).toHaveLength(declarations.length - 1)
  for (const route of plan.manifest.routes) {
    expect(route.pattern, route.routeId).toBe(expectedPaths.get(route.routeId))
  }

  const nativeRoot = createRootRoute()
  const app = createRoute({ getParentRoute: () => nativeRoot, id: '_app' })
  app.addChildren(
    plan.manifest.routes.map(({ routeId }) =>
      createRoute({
        getParentRoute: () => app,
        path: expectedPaths.get(routeId)!,
      }),
    ),
  )
  nativeRoot.addChildren([app])

  function match(path: string): Match {
    const router = createRouter({
      routeTree: nativeRoot,
      history: createMemoryHistory({ initialEntries: [path] }),
      caseSensitive: true,
      trailingSlash: 'never',
    })
    const [, params, found] = router.getMatchedRoutes(
      router.state.location.pathname,
    )
    if (!found || Object.hasOwn(params, '**'))
      return { routeId: null, params: {} }
    return { routeId: found.id, params: { ...params } }
  }

  for (const page of plan.pages) {
    const owner = plan.manifest.routes.find(
      ({ file }) => page.prerender.outputPath === `/${file}`,
    )
    expect(owner, page.path).toBeDefined()
    expect(match(page.path).routeId, page.path).toBe(owner?.routeId)
  }
  for (const route of plan.manifest.routes) {
    expect(
      plan.pages.some((page) => page.prerender.outputPath === `/${route.file}`),
      route.routeId,
    ).toBe(true)
  }

  const requests = paths.map((path) => {
    const native = match(path)
    return {
      path,
      ...native,
      ...(native.routeId === null && extname(path) ? { status: 404 } : {}),
    }
  })
  const corpusFile = join(root, 'corpus.json')
  await writeFile(
    corpusFile,
    JSON.stringify({
      cases: [
        {
          manifest: plan.manifest,
          requests: [
            ...requests,
            { path: '/unknown.json', ...match('/unknown.json'), status: 404 },
            ...['/docs', '/files', '/files/a/b', '/guides/en'].map((path) => ({
              path: `${path}/`,
              routeId: null,
              params: {},
              status: 308,
              location: path,
            })),
            {
              path: '/docs//entry',
              routeId: null,
              params: {},
              status: 308,
              location: '/docs/entry',
            },
            {
              path: '/docs/../docs/entry',
              routeId: null,
              params: {},
              status: 308,
              location: '/docs/entry',
            },
          ],
        },
      ],
    }),
  )
  const result = await execute(
    'go',
    ['test', './routeadapter', '-run', '^TestFrontendRouteParity$', '-count=1'],
    {
      cwd: projectRoot,
      env: { ...process.env, ACME_ROUTE_PARITY_CORPUS: corpusFile },
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    },
  )
  expect(result.stdout).toMatch(/ok\s+.*\/routeadapter/)
}, 90_000)
