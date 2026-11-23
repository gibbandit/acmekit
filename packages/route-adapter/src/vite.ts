import type { Plugin } from 'vite'
import { createStaticRoutes } from './static-routes.ts'
import type { StaticRouteOptions } from './static-routes.ts'

export { createStaticRoutes } from './static-routes.ts'
export type {
  RouteShellEntry,
  RouteShellManifest,
  RouteShellSegment,
  StaticPrerenderPage,
  StaticRoutePlan,
  StaticRouteOptions,
} from './static-routes.ts'

/**
 * Build-only planning and manifest emission for Start's client environment.
 * Share native srcDirectory/router settings with tanstackStart's options.
 */
export async function createRouteAdapter(
  root: string,
  options?: StaticRouteOptions,
) {
  const plan = await createStaticRoutes(root, options)
  const plugin: Plugin = {
    name: 'go-route-shell-manifest',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'route-shells.json',
        source: `${JSON.stringify(plan.manifest, null, 2)}\n`,
      })
    },
  }
  return { ...plan, plugin }
}
