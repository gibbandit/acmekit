import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { defineConfig, normalizePath } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { redact } from '@tanstack/redact/vite'
import react from '@vitejs/plugin-react'
import relay from 'unplugin-relay/vite'
import type { createRouteAdapter } from '@acmekit/route-adapter/vite'

const root = fileURLToPath(new URL('./web/', import.meta.url))
const routing = {
  srcDirectory: 'src',
  router: {
    tmpDir: resolve(root, '.tanstack/tmp'),
  },
}

export default defineConfig(async ({ command, isPreview }) => {
  const isBuild = command === 'build'
  let adapter: Awaited<ReturnType<typeof createRouteAdapter>> | undefined
  if (isBuild) {
    const { createRouteAdapter } = await import('@acmekit/route-adapter/vite')
    adapter = await createRouteAdapter(root, {
      ...routing,
      reservedPaths: ['/auth', '/graphql', '/api', '/healthz'],
    })
  }
  const artifactDirectory =
    isBuild || isPreview === true
      ? resolve(root, 'build/__generated__')
      : resolve(root, routing.srcDirectory, '__generated__')
  const apiTarget = `http://${process.env.ACME_ADDR?.trim() || '127.0.0.1:8080'}`
  return {
    root,
    build: { outDir: resolve(root, 'dist') },
    preview: { host: '127.0.0.1' },
    // Cache the shared browser runtimes independently of application code.
    environments: {
      client: {
        build: {
          rolldownOptions: {
            output: {
              codeSplitting: {
                groups: [
                  {
                    name: 'renderer',
                    test: /[\\/]node_modules[\\/](@tanstack[\\/]redact|react|react-dom|react-is|scheduler|use-sync-external-store)[\\/]/,
                    priority: 20,
                  },
                  {
                    name: 'relay',
                    test: /[\\/]node_modules[\\/](react-relay|relay-runtime)[\\/]/,
                    priority: 10,
                  },
                ],
              },
            },
          },
        },
      },
    },
    cacheDir: fileURLToPath(new URL('./node_modules/.vite', import.meta.url)),
    resolve: {
      alias: {
        '@': resolve(root, routing.srcDirectory),
        '@relay': artifactDirectory,
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      watch: {
        ignored: [
          'build',
          '.tanstack',
          'playwright-report',
          'test-results',
          'coverage',
        ].map((directory) => `${normalizePath(resolve(root, directory))}/**`),
      },
      proxy: {
        // Preserve the browser's host for Go's same-origin checks.
        '^/graphql(?:/|\\?|$)': { target: apiTarget, changeOrigin: false },
        '^/auth(?:/|\\?|$)': { target: apiTarget, changeOrigin: false },
        '^/api(?:/|\\?|$)': { target: apiTarget, changeOrigin: false },
        '^/healthz(?:/|\\?|$)': { target: apiTarget, changeOrigin: false },
      },
    },
    plugins: [
      tailwindcss(),
      tanstackStart({
        ...routing,
        client: { entry: './client.tsx' },
        // Distinct build URLs let Start prerender both '/' and its SPA shell.
        spa: { enabled: true, maskPath: '/?_shell' },
        prerender: {
          enabled: true,
          autoStaticPathsDiscovery: false,
          crawlLinks: false,
          failOnError: true,
        },
        pages: adapter?.pages,
      }),
      adapter?.plugin,
      {
        ...relay({
          language: 'typescript',
          artifactDirectory,
          eagerEsModules: true,
        }),
        // Replace GraphQL tags before the React compiler transforms source.
        enforce: 'pre',
      },
      react({ compiler: true }),
      redact({ environments: ['client'] }),
    ],
  }
})
