import { createServer as createHTTPServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, loadConfigFromFile } from 'vite'
import { expect, test } from 'vitest'

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string')
    throw new Error('Expected an HTTP listener address.')
  return `http://127.0.0.1:${address.port}`
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}

test('the development proxy preserves API namespaces and unrelated page names', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'vite-proxy-'))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const backend = createHTTPServer((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(
      JSON.stringify({
        source: 'backend',
        url: request.url,
        host: request.headers.host,
      }),
    )
  })
  const backendURL = await listen(backend)
  t.onTestFinished(() => close(backend))

  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'test' },
    fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  )
  expect(loaded).not.toBeNull()
  const configured = loaded?.config.server?.proxy ?? {}
  const proxy = Object.fromEntries(
    Object.entries(configured).map(([pattern, options]) => [
      pattern,
      { ...(typeof options === 'string' ? {} : options), target: backendURL },
    ]),
  )
  const vite = await createServer({
    configFile: false,
    root,
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, proxy, watch: null, ws: false },
  })
  t.onTestFinished(() => vite.close())
  const application = createHTTPServer((request, response) => {
    vite.middlewares(request, response, () => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ source: 'application', url: request.url }))
    })
  })
  const origin = await listen(application)
  t.onTestFinished(() => close(application))

  for (const namespace of ['/auth', '/graphql', '/api', '/healthz']) {
    for (const suffix of ['', '/', '/nested', '?check=1', '/nested?check=1']) {
      const url = `${namespace}${suffix}`
      const response = await fetch(`${origin}${url}`)
      expect(response.status, url).toBe(200)
      expect(await response.json(), url).toEqual({
        source: 'backend',
        url,
        host: new URL(origin).host,
      })
    }
  }
  for (const url of [
    '/authors',
    '/authors/ada?tab=books',
    '/graphql-explorer',
    '/healthzone',
    '/apiculture',
    '/Auth',
  ]) {
    const response = await fetch(`${origin}${url}`)
    expect(response.status, url).toBe(200)
    expect(await response.json(), url).toEqual({ source: 'application', url })
  }
})
