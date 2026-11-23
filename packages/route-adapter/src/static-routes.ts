import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { Generator, getConfig, inferFullPath } from '@tanstack/router-generator'
import type { Config, RouteNode } from '@tanstack/router-generator'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  getRouteSegments,
  interpolatePath,
  type AnyRoute,
} from '@tanstack/router-core'

export type RouteShellSegment =
  | { kind: 'static'; value: string }
  | {
      kind: 'param' | 'optional' | 'splat'
      name: string
      prefix: string
      suffix: string
    }

export interface RouteShellEntry {
  pattern: string
  file: string
  routeId: string
  segments: RouteShellSegment[]
}

export interface RouteShellManifest {
  version: 3
  fallback: '_shell.html'
  routes: RouteShellEntry[]
}

export interface StaticPrerenderPage {
  path: string
  prerender: { enabled: true; outputPath: string; crawlLinks: false }
  sitemap: { exclude: true }
}

export interface StaticRoutePlan {
  pages: StaticPrerenderPage[]
  manifest: RouteShellManifest
}

export interface StaticRouteOptions {
  reservedPaths?: readonly string[]
  srcDirectory?: string
  router?: Partial<Config>
}

const representativeParam = '__route_shell__'
const internalReservedPaths = [
  '/assets',
  '/_routes',
  '/_shell.html',
  '/route-shells.json',
]

function fail(message: string): never {
  throw new Error(`Static route shells: ${message}`)
}

function routeSegments(
  route: AnyRoute,
  reservedPaths: readonly string[],
): RouteShellSegment[] {
  const path = route.fullPath
  const interpolation = getRouteSegments(route) ?? [path]
  const segments = interpolation.flatMap<RouteShellSegment>((part) => {
    if (typeof part === 'string') {
      return part
        .split('/')
        .filter(Boolean)
        .map((value) => ({ kind: 'static', value }))
    }
    const [kind, name, prefix, suffix] = part
    if (kind !== 1 && kind !== 2 && kind !== 3) {
      fail(`unknown native segment kind ${kind} in ${path}`)
    }
    return [
      {
        kind: kind === 1 ? 'param' : kind === 3 ? 'optional' : 'splat',
        name,
        prefix: prefix.startsWith('/') ? prefix.slice(1) : prefix,
        suffix: suffix ?? '',
      },
    ]
  })
  const params = new Set<string>()
  for (const segment of segments) {
    if (segment.kind !== 'static') {
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(segment.name)) {
        fail(`unsupported parameter ${segment.name} in ${path}`)
      }
      if (params.has(segment.name)) fail(`duplicate parameter in ${path}`)
      params.add(segment.name)
    }
    const literals =
      segment.kind === 'static'
        ? [segment.value]
        : [segment.prefix, ...segment.suffix.split('/')]
    for (const literal of literals) {
      if (
        literal &&
        (!/^[A-Za-z0-9_.~-]+$/.test(literal) ||
          literal === '.' ||
          literal === '..')
      ) {
        fail(`unsupported literal in route ${path}`)
      }
      if (segment.kind === 'static' && literal === representativeParam) {
        fail(
          `${path} uses the reserved build placeholder ${representativeParam}`,
        )
      }
    }
  }
  if (
    reservedPaths.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  ) {
    fail(`reserved URL prefix in ${path}`)
  }
  return segments
}

function optionalVariants(segments: RouteShellSegment[]) {
  let variants: RouteShellSegment[][] = [[]]
  for (const segment of segments) {
    variants = variants.flatMap((previous) =>
      segment.kind === 'optional'
        ? [[...previous, segment], previous]
        : [[...previous, segment]],
    )
  }
  return variants
}

function sameShape(left: RouteShellSegment[], right: RouteShellSegment[]) {
  return (
    left.length === right.length &&
    left.every((segment, index) => {
      const other = right[index]!
      if (segment.kind === 'static') {
        return other.kind === 'static' && segment.value === other.value
      }
      return (
        other.kind !== 'static' &&
        (segment.kind === 'splat') === (other.kind === 'splat') &&
        segment.prefix === other.prefix &&
        segment.suffix === other.suffix
      )
    })
  )
}

function makePlan(
  routeTree: readonly RouteNode[],
  options: StaticRouteOptions,
): StaticRoutePlan {
  const rootRoute = createRootRoute()
  const candidates: { node: RouteNode; route: AnyRoute }[] = []
  const nodesByRoute = new Map<AnyRoute, RouteNode>()

  function createRoutes(nodes: readonly RouteNode[], parent: AnyRoute) {
    return nodes.map((node) => {
      const hasPath =
        !node.isNonPath ||
        (node._fsRouteType === 'pathless_layout' && Boolean(node.cleanedPath))
      const path = hasPath
        ? node.routePath?.endsWith('/') && node.cleanedPath === ''
          ? '/'
          : node.cleanedPath
        : node.path
      if (path === undefined) {
        fail(
          `the router generator did not provide a path for ${node.routePath}`,
        )
      }
      const route: AnyRoute =
        hasPath && path
          ? createRoute({
              getParentRoute: () => parent,
              path,
            })
          : createRoute({
              getParentRoute: () => parent,
              id: node.path ?? fail(`missing route ID for ${node.routePath}`),
            })
      nodesByRoute.set(route, node)
      if (!node.isNonPath && !node.isVirtualParentRoute) {
        candidates.push({ node, route })
      }
      if (node.children?.length) {
        route.addChildren(createRoutes(node.children, route))
      }
      return route
    })
  }

  rootRoute.addChildren(createRoutes(routeTree, rootRoute))
  const router = createRouter({
    routeTree: rootRoute,
    isServer: true,
    caseSensitive: true,
  })
  const segmentsByRoute = new Map<AnyRoute, RouteShellSegment[]>()
  const reservedPaths = [
    ...internalReservedPaths,
    ...(options.reservedPaths ?? []),
  ]
  for (const { route } of candidates) {
    segmentsByRoute.set(route, routeSegments(route, reservedPaths))
  }
  const maxSegments = Math.max(
    1,
    ...[...segmentsByRoute.values()].map((s) => s.length),
  )
  // Literal segments and affixes use ASCII. This additional witness cannot
  // accidentally match a competing literal or a more restrictive affix.
  const freshRepresentative = `\uE000${representativeParam}\uE000`
  const pages: StaticPrerenderPage[] = []
  const routes: RouteShellEntry[] = []
  const files = new Set<string>()
  const patterns = new Set<string>()

  for (const { node, route } of candidates) {
    const path = inferFullPath(node)
    const routeId = node.routePath
    if (!routeId) fail(`the router generator did not provide an ID for ${path}`)
    const segments = segmentsByRoute.get(route)!
    const dynamic = segments.some((segment) => segment.kind !== 'static')
    const pattern = path
    if (
      !segments.some(
        (segment) => segment.kind === 'optional' || segment.kind === 'splat',
      )
    ) {
      const shape = JSON.stringify({
        index: pattern.endsWith('/'),
        segments: segments.map((segment) =>
          segment.kind === 'static'
            ? segment
            : {
                kind: segment.kind,
                prefix: segment.prefix,
                suffix: segment.suffix,
              },
        ),
      })
      if (patterns.has(shape)) fail(`ambiguous parameter pattern ${pattern}`)
      patterns.add(shape)
    }

    let representative: string | undefined
    let covered = true
    const interpolation = getRouteSegments(route)
    for (const variant of optionalVariants(segments)) {
      let variantCovered = false
      for (const value of [representativeParam, freshRepresentative, '']) {
        const splatValues = variant.some((segment) => segment.kind === 'splat')
          ? [
              Array(maxSegments + 1)
                .fill(value || representativeParam)
                .join('/'),
              value,
              '',
            ]
          : [value]
        for (const splat of splatValues) {
          const params = Object.fromEntries(
            variant.flatMap((segment) =>
              segment.kind === 'static'
                ? []
                : [[segment.name, segment.kind === 'splat' ? splat : value]],
            ),
          )
          const pathname =
            (interpolation
              ? interpolatePath(path, interpolation, params)
              : path
            ).replace(/\/+$/, '') || '/'
          const location = createMemoryHistory({
            initialEntries: [pathname],
          }).location
          const [, rawParams, owner] = router.getMatchedRoutes(
            router.parseLocation(location).pathname,
          )
          if (owner === route && !Object.hasOwn(rawParams, '**')) {
            representative = pathname
            break
          }
          const ownerSegments = owner && segmentsByRoute.get(owner)
          if (
            ownerSegments &&
            !Object.hasOwn(rawParams, '**') &&
            optionalVariants(ownerSegments).some((other) =>
              sameShape(variant, other),
            )
          ) {
            variantCovered = true
          }
        }
        if (representative) break
      }
      if (representative) break
      covered &&= variantCovered
    }
    if (!representative) {
      if (covered) continue
      const owner = nodesByRoute.get(
        router.getMatchedRoutes(path)[2]!,
      )?.routePath
      fail(
        `could not find a native matching prerender URL for ${path}${owner ? `; matched ${owner}` : ''}`,
      )
    }

    const staticPath = path.replace(/\/$/, '') || '/'
    const file =
      path === '/'
        ? 'index.html'
        : dynamic
          ? `_routes/${createHash('sha256').update(pattern).digest('hex').slice(0, 20)}.html`
          : `${staticPath.slice(1)}/index.html`
    if (
      files.has(file) ||
      [...files].some(
        (existing) =>
          file.startsWith(`${existing}/`) || existing.startsWith(`${file}/`),
      )
    )
      fail(`output file collision for ${path}`)
    files.add(file)
    routes.push({ pattern, file, routeId, segments })

    // Start generates the generic SPA shell separately at its reserved mask URL.
    pages.push({
      path: representative,
      prerender: { enabled: true, outputPath: `/${file}`, crawlLinks: false },
      sitemap: { exclude: true },
    })
  }
  return { pages, manifest: { version: 3, fallback: '_shell.html', routes } }
}

/**
 * Derive both Start's build inputs and Go's shell mapping from the same route tree.
 * This runs the normal generator; route modules are parsed, never imported.
 * The Go handler must reserve API/internal/static namespaces before matching a
 * leading parameter such as /{slug}.
 */
export async function createStaticRoutes(
  root: string,
  options: StaticRouteOptions = {},
): Promise<StaticRoutePlan> {
  root = resolve(root)
  let routeTree: RouteNode[] | undefined
  const config = getConfig(
    {
      ...options.router,
      ...(options.srcDirectory !== undefined || options.router !== undefined
        ? {
            routesDirectory: resolve(
              root,
              options.srcDirectory ?? 'src',
              options.router?.routesDirectory ?? 'routes',
            ),
          }
        : {}),
      disableLogging: options.router?.disableLogging ?? true,
      // Discovery must not overwrite Start's live tree and framework footer.
      generatedRouteTree: resolve(root, '.tanstack/static-route-tree.gen.ts'),
      tmpDir: options.router?.tmpDir ?? resolve(root, '.tanstack/tmp'),
    },
    root,
  )
  config.plugins = [
    ...(config.plugins ?? []),
    {
      name: 'static-route-shells',
      onRouteTreeChanged(result) {
        routeTree = result.routeTree
      },
    },
  ]
  await new Generator({ config, root }).run()
  if (!routeTree) fail('the router generator did not return a route tree')
  return makePlan(routeTree, options)
}
