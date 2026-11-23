import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
  type JSHandle,
  type Locator,
  type Page,
  type Request,
  type Route,
} from '@playwright/test'
import {
  buildClientSchema,
  buildSchema,
  getIntrospectionQuery,
  lexicographicSortSchema,
  printSchema,
  type IntrospectionQuery,
} from 'graphql'
import WorkspaceQuery from '../build/__generated__/WorkspaceQuery.graphql'
import OverviewPageQuery from '../build/__generated__/OverviewPageQuery.graphql'
import ProjectsPageQuery from '../build/__generated__/ProjectsPageQuery.graphql'
import ProjectsPagePaginationQuery from '../build/__generated__/ProjectsPagePaginationQuery.graphql'
import ProjectDetailPageQuery from '../build/__generated__/ProjectDetailPageQuery.graphql'
import ProjectEditPageQuery from '../build/__generated__/ProjectEditPageQuery.graphql'
import SessionPageQuery from '../build/__generated__/SessionPageQuery.graphql'
import ProjectFormCreateMutation from '../build/__generated__/ProjectFormCreateMutation.graphql'
import ProjectFormUpdateMutation from '../build/__generated__/ProjectFormUpdateMutation.graphql'
import DeleteProjectDialogMutation from '../build/__generated__/DeleteProjectDialogMutation.graphql'
import {
  resolveVariables,
  type VariableBinding,
} from '@acmekit/route-adapter/runtime'
import { projectVariables } from '../src/features/projects/project-variables'

const playwrightRequire = createRequire(import.meta.url)
const { PNG } = playwrightRequire(
  join(
    dirname(playwrightRequire.resolve('playwright-core')),
    'lib/utilsBundle.js',
  ),
)

const test = base.extend<{
  browserErrors: void
  expectedConsoleErrors: { message: string; pathname: string }[]
}>({
  expectedConsoleErrors: [[], { option: true }],
  browserErrors: [
    async ({ page, expectedConsoleErrors }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (
          message.type() === 'error' &&
          !expectedConsoleErrors.some(
            (expected) =>
              message.text() === expected.message &&
              new URL(message.location().url, page.url()).pathname ===
                expected.pathname,
          )
        )
          errors.push(message.text())
      })
      await use()
      expect(errors, 'Browser runtime or hydration errors').toEqual([])
    },
    { auto: true },
  ],
})

type WorkspaceFixture = {
  viewer: { name: string }
  projects: {
    edges: {
      node: { id: string; slug: string; name: string; status: string }
    }[]
  }
}

type BootstrapEntry = {
  id: string
  variables: Record<string, unknown>
  response: { data: Record<string, unknown>; errors?: unknown[] }
}

function readPreloads(html: string) {
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*\bid=["']route-preloads["'][^>]*>([\s\S]*?)<\/script>/g,
    ),
  ]
  expect(scripts).toHaveLength(1)
  const metadata: {
    version: number
    preloadTimeoutMs?: number
    preloads: {
      id: string
      authenticated?: boolean
      variables: Record<string, VariableBinding>
    }[]
  } = JSON.parse(scripts[0]![1]!)
  expect(Object.keys(metadata).sort()).toEqual(
    metadata.preloads.length
      ? ['preloadTimeoutMs', 'preloads', 'version']
      : ['preloads', 'version'],
  )
  expect(metadata.version).toBe(1)
  for (const preload of metadata.preloads) {
    expect(preload.id).toMatch(/^[a-f0-9]{64}$/)
    expect(
      Object.keys(preload).every((key) =>
        ['id', 'authenticated', 'variables'].includes(key),
      ),
    ).toBe(true)
  }
  expect(scripts[0]![1]).not.toContain('__route_shell__')
  return metadata
}

function readBootstrap(html: string) {
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*\bid=["']route-bootstrap["'][^>]*>([\s\S]*?)<\/script>/g,
    ),
  ]
  expect(scripts).toHaveLength(1)
  const entries: BootstrapEntry[] = JSON.parse(scripts[0]![1]!)
  for (const entry of entries) {
    expect(entry.id).toMatch(/^[a-f0-9]{64}$/)
    expect(entry.response.errors).toBeUndefined()
  }
  return { entries, layout: html.replace(scripts[0]![0], '') }
}

function expectPrivateHTML(response: APIResponse) {
  expect(
    response
      .headers()
      ['cache-control'].split(',')
      .map((value) => value.trim()),
  ).toEqual(expect.arrayContaining(['private', 'no-store']))
}

function collectGraphQLRequests(page: Page) {
  const requests: Request[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/graphql') requests.push(request)
  })
  return requests
}

function trackMainContentContinuity() {
  const state = { seen: false, missing: false }
  Reflect.set(window, '__acmeMainContentContinuity', state)
  const record = () => {
    if (document.getElementById('main-content')) state.seen = true
    else if (state.seen) state.missing = true
  }
  new MutationObserver(record).observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['id'],
  })
  record()
}

async function openWorkspace(request: APIRequestContext, role = 'MAINTAINER') {
  await expect(await request.post('/auth/demo', { data: { role } })).toBeOK()
  const response = await request.post('/graphql', {
    data: {
      query:
        '{ viewer { name } projects(first: 2) { edges { node { id slug name status } } } }',
    },
  })
  await expect(response).toBeOK()
  const result: { data: WorkspaceFixture; errors?: unknown[] } =
    await response.json()
  expect(result.errors).toBeUndefined()
  expect(result.data.projects.edges).toHaveLength(2)
  return result.data
}

async function clickPendingAction(
  page: Page,
  container: Locator,
  name: string,
  endpoint: string,
  operationID?: string | null,
) {
  await container.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished)),
  )
  const buttons = container
    .locator(
      '[data-slot="dialog-footer"], [data-slot="alert-dialog-footer"], [data-slot="form-actions"]',
    )
    .getByRole('button')
  const before = await elementGeometry(buttons)
  let release!: () => void
  let requested!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const requestSeen = new Promise<void>((resolve) => {
    requested = resolve
  })
  let heldRequest: Promise<void> | undefined
  const hold = (route: Route) => {
    const matches =
      !operationID || route.request().postDataJSON()?.id === operationID
    const handled = (async () => {
      if (matches) {
        requested()
        await released
      }
      await route.continue()
    })()
    if (matches) heldRequest = handled
    return handled
  }
  await page.route(endpoint, hold)
  try {
    const action = container.getByRole('button', { name, exact: true })
    await action.click()
    await requestSeen
    await expect(action).toHaveAttribute('aria-busy', 'true')
    await expect(action).toHaveAccessibleName(name)
    expectFieldGeometry(await elementGeometry(buttons), before)
    await expect(
      container.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeDisabled()
    const pendingURL = page.url()
    await page.keyboard.press('Escape')
    await expect(container).toBeVisible()
    await expect(page).toHaveURL(pendingURL)
  } finally {
    release()
    await heldRequest
    await page.unroute(endpoint, hold)
  }
}

test('maintainer signs in, creates, edits, deletes, and signs out', async ({
  page,
}) => {
  const requests = collectGraphQLRequests(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL('/#login')
  const login = page.getByRole('dialog', { name: 'Open demo workspace' })
  await login
    .getByText('View projects with read-only access.', { exact: true })
    .click()
  await expect(
    login.getByRole('radio', { name: 'Member', exact: true }),
  ).toBeChecked()
  await login
    .getByText('View, create, edit, and delete projects.', { exact: true })
    .click()
  await expect(
    login.getByRole('radio', { name: 'Maintainer', exact: true }),
  ).toBeChecked()
  await clickPendingAction(page, login, 'Open workspace', '**/auth/demo')
  await expect(
    page.getByRole('button', { name: 'Alex Morgan account menu' }),
  ).toBeVisible()
  await expect(page).toHaveURL('/')
  const beforeProjectsNavigation = requests.length
  await page.getByRole('link', { name: 'Projects', exact: true }).click()
  await expect(page.getByText(/Showing \d+ of \d+ projects/)).toBeVisible()
  expect(
    requests
      .slice(beforeProjectsNavigation)
      .filter(
        (request) => request.postDataJSON()?.id === ProjectsPageQuery.params.id,
      ),
  ).toHaveLength(1)
  await page.reload()
  await expect(page.getByText(/Showing \d+ of \d+ projects/)).toBeVisible()
  const beforeNewNavigation = requests.length
  await page.getByRole('link', { name: 'New project', exact: true }).click()

  const create = page.getByRole('form', {
    name: 'New project',
    exact: true,
  })
  await expect(page).toHaveURL((url) => url.pathname === '/projects/new')
  await expect(
    create.getByLabel('Project name', { exact: true }),
  ).not.toBeFocused()
  expect(
    requests
      .slice(beforeNewNavigation)
      .filter(
        (request) => request.postDataJSON()?.id === ProjectsPageQuery.params.id,
      ),
  ).toHaveLength(0)
  await create
    .getByLabel('Project name', { exact: true })
    .fill('Playwright project')
  await create
    .getByLabel('Description', { exact: true })
    .fill('Created in the browser.')
  await create.getByRole('combobox', { name: 'Project status' }).click()
  await page.getByRole('option', { name: 'Active', exact: true }).click()
  const refresh = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/graphql' &&
      request.postDataJSON()?.id === ProjectsPageQuery.params.id,
  )
  const beforeCreate = requests.length
  await clickPendingAction(
    page,
    create,
    'Create project',
    '**/graphql',
    ProjectFormCreateMutation.params.id,
  )
  await refresh
  await expect(create).toBeHidden()
  await expect(page).toHaveURL('/projects')
  await expect(
    page.getByText('Project created.', { exact: true }),
  ).toBeVisible()
  const createdProject = page.getByRole('link', {
    name: 'Playwright project',
    exact: true,
  })
  await expect(createdProject).toBeVisible()
  expect(
    requests
      .slice(beforeCreate)
      .filter(
        (request) => request.postDataJSON()?.id === ProjectsPageQuery.params.id,
      ),
  ).toHaveLength(1)
  await createdProject.click()
  await expect(page).toHaveURL('/projects/playwright-project')
  await expect(
    page.getByText('Created in the browser.', { exact: true }),
  ).toBeVisible()

  const detailURL = page.url()
  const beforeEditNavigation = requests.length
  await page.getByRole('link', { name: 'Edit project', exact: true }).click()
  const edit = page.getByRole('form', { name: 'Edit project', exact: true })
  await expect(page).toHaveURL(
    (url) => url.pathname === new URL(`${detailURL}/edit`).pathname,
  )
  await expect(
    edit.getByLabel('Project name', { exact: true }),
  ).not.toBeFocused()
  expect(
    requests
      .slice(beforeEditNavigation)
      .filter(
        (request) =>
          request.postDataJSON()?.id === ProjectDetailPageQuery.params.id,
      ),
  ).toHaveLength(0)
  await edit
    .getByLabel('Project name', { exact: true })
    .fill('Updated Playwright project')
  await edit
    .getByLabel('Description', { exact: true })
    .fill('Updated in the browser.')
  await edit.getByRole('combobox', { name: 'Project status' }).click()
  await page.getByRole('option', { name: 'Archived', exact: true }).click()
  await clickPendingAction(
    page,
    edit,
    'Save changes',
    '**/graphql',
    ProjectFormUpdateMutation.params.id,
  )
  await expect(edit).toBeHidden()
  await expect(page).toHaveURL(detailURL)
  await expect(
    page.getByText('Project changes saved.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Updated Playwright project', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Updated in the browser.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Archived', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(detailURL)
  await expect(
    page.getByText('Updated Playwright project', { exact: true }),
  ).toBeVisible()

  await page
    .getByRole('button', { name: 'Delete project', exact: true })
    .click()
  await clickPendingAction(
    page,
    page.getByRole('alertdialog', { name: 'Delete project?' }),
    'Delete project',
    '**/graphql',
    DeleteProjectDialogMutation.params.id,
  )
  await expect(page).toHaveURL('/projects')
  await expect(
    page.getByText('Project deleted.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText(/Showing \d+ of \d+ projects/)).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Updated Playwright project', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Session', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeVisible()
  expect(requests.length).toBeGreaterThan(0)
  for (const request of requests) {
    expect(request.postDataJSON()).toMatchObject({
      id: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(request.postDataJSON()).not.toHaveProperty('query')
  }
})

test('member can read projects and sees no management actions', async ({
  page,
  context,
}) => {
  const workspace = await openWorkspace(context.request, 'MEMBER')
  const project = workspace.projects.edges[0]!.node
  await page.goto('/projects')
  const link = page.getByRole('link', { name: project.name, exact: true })
  await expect(link).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'New project', exact: true }),
  ).toHaveCount(0)
  await link.click()
  await expect(page.getByText(project.name, { exact: true })).toBeVisible()
  await expect(page.getByText('Read only', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Edit project', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Delete project', exact: true }),
  ).toHaveCount(0)
  for (const url of [
    '/#new',
    '/projects#new',
    `/projects/${project.slug}#edit`,
    '/projects/new',
    `/projects/${project.slug}/edit`,
  ]) {
    await page.goto(url)
    await expect(
      page.getByRole('button', {
        name: `${workspace.viewer.name} account menu`,
      }),
    ).toBeVisible()
    await expect(
      page.getByText('Read-only access', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('main').getByRole('link', { name: /^Back to project/ }),
    ).toBeVisible()
    await expect(
      page.getByRole('form', { name: 'New project', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('form', { name: 'Edit project', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'New project', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Edit project', exact: true }),
    ).toHaveCount(0)
  }
  await page.getByRole('link', { name: 'Session', exact: true }).click()
  await expect(
    page.getByRole('row', { name: 'Create projects Not allowed', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Choose a role', exact: true }).click()
  await expect(page).toHaveURL('/session#role')
  const roles = page.getByRole('dialog', {
    name: 'Open demo workspace',
    exact: true,
  })
  await expect(roles).toBeVisible()
  await roles.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL('/session')
  await expect(roles).toBeHidden()
})

test('deleting a project retires an intent-preloaded overview', async ({
  page,
  context,
}) => {
  const workspace = await openWorkspace(context.request)
  const project = workspace.projects.edges[0]!.node
  const requests = collectGraphQLRequests(page)
  await page.goto(`/projects/${project.slug}`)
  await expect(page.getByText(project.name, { exact: true })).toBeVisible()

  const overview = page.getByRole('link', { name: 'Overview', exact: true })
  const preload = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/graphql' &&
      response.request().postDataJSON()?.id === OverviewPageQuery.params.id,
  )
  await overview.hover()
  const preloaded = await preload
  expect(preloaded.ok()).toBe(true)
  expect(await preloaded.json()).toMatchObject({
    data: {
      projectStats: { total: 10 },
      projects: {
        edges: expect.arrayContaining([
          expect.objectContaining({
            node: expect.objectContaining({ id: project.id }),
          }),
        ]),
      },
    },
  })

  const beforeDelete = requests.length
  await page
    .getByRole('button', { name: 'Delete project', exact: true })
    .click()
  await page
    .getByRole('alertdialog', { name: 'Delete project?' })
    .getByRole('button', { name: 'Delete project', exact: true })
    .click()
  await expect(page).toHaveURL('/projects')
  await expect(
    page.getByText('Showing 6 of 9 projects', { exact: true }),
  ).toBeVisible()
  expect(
    requests
      .slice(beforeDelete)
      .filter(
        (request) =>
          request.postDataJSON()?.id === ProjectDetailPageQuery.params.id,
      ),
    'Deleting must not refetch the removed detail page',
  ).toHaveLength(0)

  const refresh = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/graphql' &&
      response.request().postDataJSON()?.id === OverviewPageQuery.params.id,
  )
  await overview.click()
  await expect(page).toHaveURL('/')
  expect((await refresh).ok()).toBe(true)
  const total = page
    .getByRole('region', { name: 'Project overview', exact: true })
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText('Total projects', { exact: true }) })
  await expect(total.locator('[data-slot="metric-value"]')).toHaveText('9')
  await expect(
    page
      .getByRole('table', { name: 'Recent projects', exact: true })
      .getByRole('link', { name: project.name, exact: true }),
  ).toHaveCount(0)
})

test('creating a project does not reuse a pending pre-mutation filter response', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  const requests = collectGraphQLRequests(page)
  await page.goto('/projects')
  await expect(
    page.getByText('Showing 6 of 10 projects', { exact: true }),
  ).toBeVisible()

  const isAtlasQuery = (request: Request) => {
    const body = request.postDataJSON()
    return (
      body?.id === ProjectsPageQuery.params.id &&
      body.variables?.search === 'Atlas'
    )
  }
  let release!: () => void
  let handled!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const responseHandled = new Promise<void>((resolve) => {
    handled = resolve
  })
  let holding = false
  let captured = false
  let oldResponse: unknown
  const holdFilter = async (route: Route) => {
    if (holding || !isAtlasQuery(route.request())) {
      await route.continue()
      return
    }
    holding = true
    try {
      const response = await route.fetch()
      oldResponse = await response.json()
      captured = true
      await released
      if (!route.request().failure()) {
        try {
          await route.fulfill({ response })
        } catch (error) {
          if (!route.request().failure()) throw error
        }
      }
    } finally {
      handled()
    }
  }
  await page.route('**/graphql', holdFilter)
  try {
    await page
      .getByRole('textbox', { name: 'Search projects', exact: true })
      .fill('Atlas')
    await expect.poll(() => captured).toBe(true)
    expect(oldResponse).toMatchObject({
      data: {
        projects: {
          totalCount: 1,
          edges: [
            expect.objectContaining({
              node: expect.objectContaining({ name: 'Atlas design system' }),
            }),
          ],
        },
      },
    })
    await expect(
      page.getByRole('link', { name: 'New project', exact: true }),
    ).toBeEnabled()
    await page.getByRole('link', { name: 'New project', exact: true }).click()
    const create = page.getByRole('form', {
      name: 'New project',
      exact: true,
    })
    await create
      .getByLabel('Project name', { exact: true })
      .fill('Atlas mutation freshness')
    const beforeCreate = requests.length
    await create
      .getByRole('button', { name: 'Create project', exact: true })
      .click()
    await expect(
      page.getByText('Project created.', { exact: true }),
    ).toBeVisible()

    release()
    await responseHandled
    await expect(create).toBeHidden()
    await expect(
      page.getByText('Showing 2 of 2 projects', { exact: true }),
    ).toBeVisible()
    const projects = page.getByRole('table', { name: 'Projects', exact: true })
    await expect(projects.getByRole('link')).toHaveText([
      'Atlas mutation freshness',
      'Atlas design system',
    ])
    expect(
      requests.slice(beforeCreate).filter(isAtlasQuery),
      'Mutation refresh must start one fresh query instead of sharing the older response',
    ).toHaveLength(1)
    expect(requests.filter(isAtlasQuery)).toHaveLength(2)
  } finally {
    release()
    if (captured) await responseHandled
    await page.unroute('**/graphql', holdFilter)
  }
})

test('pending project deletes preserve navigation after browser Back', async ({
  page,
  context,
}) => {
  const workspace = await openWorkspace(context.request)
  const project = workspace.projects.edges[0]!.node
  const source = '/?keep=back#source'
  await page.goto(source)
  await page.getByRole('link', { name: project.name, exact: true }).click()
  await page
    .getByRole('button', { name: 'Delete project', exact: true })
    .click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete project?' })
  let release!: () => void
  let requested!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const requestSeen = new Promise<void>((resolve) => {
    requested = resolve
  })
  let heldRequest: Promise<void> | undefined
  const hold = (route: Route) => {
    const handled = (async () => {
      if (
        route.request().postDataJSON()?.id ===
        DeleteProjectDialogMutation.params.id
      ) {
        requested()
        await released
      }
      await route.continue()
    })()
    if (
      route.request().postDataJSON()?.id ===
      DeleteProjectDialogMutation.params.id
    )
      heldRequest = handled
    return handled
  }
  await page.route('**/graphql', hold)
  try {
    await dialog
      .getByRole('button', { name: 'Delete project', exact: true })
      .click()
    await requestSeen
    await expect(
      dialog.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeDisabled()
    await page.goBack()
    await expect(page).toHaveURL(source)
    await expect(dialog).toBeHidden()
    await page.getByRole('link', { name: 'Session', exact: true }).click()
    await expect(page).toHaveURL('/session')
    release()
    await heldRequest
    await expect(
      page.getByText('Project deleted.', { exact: true }),
    ).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/session')
    await expect(
      page.getByRole('heading', { name: 'Session', exact: true }),
    ).toBeVisible()
  } finally {
    release()
    await heldRequest
    await page.unroute('**/graphql', hold)
  }
})

test('pending project saves preserve browser history and reentered drafts', async ({
  page,
  context,
}) => {
  const workspace = await openWorkspace(context.request)
  const project = workspace.projects.edges[0]!.node
  for (const { mode, reenter } of [
    { mode: 'create', reenter: false },
    { mode: 'edit', reenter: false },
    { mode: 'create', reenter: true },
    { mode: 'edit', reenter: true },
  ] as const) {
    const source =
      mode === 'create'
        ? '/projects?keep=back#source'
        : `/projects/${project.slug}?keep=back#source`
    const title = mode === 'create' ? 'New project' : 'Edit project'
    const operationID =
      mode === 'create'
        ? ProjectFormCreateMutation.params.id
        : ProjectFormUpdateMutation.params.id
    await page.goto(source)
    await page.getByRole('link', { name: title, exact: true }).click()
    const form = page.getByRole('form', { name: title, exact: true })
    await expect(form).toBeVisible()
    const formURL = page.url()
    if (mode === 'create')
      await form
        .getByLabel('Project name', { exact: true })
        .fill('Saved after browser Back')
    else
      await form
        .getByLabel('Description', { exact: true })
        .fill('Updated after browser Back')
    let release!: () => void
    let requested!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const requestSeen = new Promise<void>((resolve) => {
      requested = resolve
    })
    let heldRequest: Promise<void> | undefined
    const hold = (route: Route) => {
      const handled = (async () => {
        if (route.request().postDataJSON()?.id === operationID) {
          requested()
          await released
        }
        await route.continue()
      })()
      if (route.request().postDataJSON()?.id === operationID)
        heldRequest = handled
      return handled
    }
    await page.route('**/graphql', hold)
    try {
      await form
        .getByRole('button', {
          name: mode === 'create' ? 'Create project' : 'Save changes',
          exact: true,
        })
        .click()
      await requestSeen
      await expect(
        form.getByRole('button', { name: 'Cancel', exact: true }),
      ).toBeDisabled()
      await page.goBack()
      await expect(page).toHaveURL(source)
      await expect(form).toBeHidden()
      if (reenter) {
        await page.goForward()
        await expect(page).toHaveURL(formURL)
        await expect(
          form.getByRole('button', { name: 'Cancel', exact: true }),
        ).toBeEnabled()
        await form
          .getByLabel('Project name', { exact: true })
          .fill('Fresh draft after Forward')
      }
      release()
      await heldRequest
      await page.waitForLoadState('networkidle')
      await expect(
        page
          .getByText(
            mode === 'create' ? 'Project created.' : 'Project changes saved.',
            { exact: true },
          )
          .last(),
      ).toBeVisible()
      await expect(page).toHaveURL(reenter ? formURL : source)
      if (reenter) {
        await expect(
          form.getByLabel('Project name', { exact: true }),
        ).toHaveValue('Fresh draft after Forward')
        await form.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(page).toHaveURL(source)
      }
    } finally {
      release()
      await heldRequest
      await page.unroute('**/graphql', hold)
    }
  }
})

test('mobile project pages reuse downloaded routes and discard cancelled drafts', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const workspace = await openWorkspace(context.request)
  const requests = collectGraphQLRequests(page)
  const scripts: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url())
  })
  await page.goto('/?keep=retained#overview-anchor')
  await expect(
    page.getByRole('link', {
      name: workspace.projects.edges[0]!.node.name,
      exact: true,
    }),
  ).toBeVisible()
  const background = page.url()
  const readsBeforeOpen = requests.length
  const create = page.getByRole('form', { name: 'New project', exact: true })
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await expect(create).toBeVisible()
  await expect(page).toHaveURL((url) => url.pathname === '/projects/new')
  const name = create.getByRole('textbox', {
    name: 'Project name',
    exact: true,
  })
  await expect(name).not.toBeFocused()
  await name.fill('Cancelled mobile draft')
  await create.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(create).toBeHidden()
  await expect(page).toHaveURL(background)

  const scriptsBeforeRevisit = scripts.length
  await page.goForward()
  await expect(name).not.toBeFocused()
  await expect(name).toHaveValue('')
  await name.fill('Prepared mobile project')
  await expect(
    create.getByRole('button', { name: 'Create project', exact: true }),
  ).toBeEnabled()
  await create.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(create).toBeHidden()
  await expect(page).toHaveURL(background)
  expect(
    requests
      .slice(readsBeforeOpen)
      .every(
        (request) => request.postDataJSON()?.id === OverviewPageQuery.params.id,
      ),
  ).toBe(true)
  expect(scripts).toHaveLength(scriptsBeforeRevisit)
})

test('new project pages restore invoking history and redirect legacy links', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  const create = page.getByRole('form', { name: 'New project', exact: true })
  for (const url of [
    '/?keep=retained#overview-anchor',
    '/projects?first=2&page=2&keep=retained#projects-anchor',
  ]) {
    await page.goto(url)
    const newProject = page.getByRole('link', {
      name: 'New project',
      exact: true,
    })
    await expect(newProject).toBeEnabled()
    const background = page.url()
    await newProject.click()
    await expect(create).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'New project', exact: true }),
    ).toBeVisible()
    await expect(page).toHaveURL((url) => url.pathname === '/projects/new')
    await page.goBack()
    await expect(create).toBeHidden()
    await expect(page).toHaveURL(background)
    await page.goForward()
    await expect(create).toBeVisible()
    await create.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(create).toBeHidden()
    await expect(page).toHaveURL(background)
  }
  for (const legacy of [
    '/?first=2&keep=retained#new',
    '/projects?first=2&keep=retained#new',
  ]) {
    await page.goto(legacy)
    await expect(create).toBeVisible()
    await expect(page).toHaveURL('/projects/new?first=2&keep=retained')
    await page.reload()
    await expect(
      create.getByLabel('Project name', { exact: true }),
    ).toHaveValue('')
    await create.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(create).toBeHidden()
    await expect(page).toHaveURL('/projects?first=2&keep=retained')
  }
  await page.goto('/projects/new?keep=direct')
  await expect(create).toBeVisible()
  await create.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL('/projects?keep=direct')
  await page.goto('/projects/new?keep=direct-save')
  await create
    .getByLabel('Project name', { exact: true })
    .fill('Directly created project')
  await create
    .getByRole('button', { name: 'Create project', exact: true })
    .click()
  await expect(create).toBeHidden()
  await expect(page).toHaveURL('/projects?keep=direct-save')
  await page.goto(
    '/projects?first=2&page=2&status=ACTIVE&keep=retained#expanded',
  )
  await expect(
    page
      .getByRole('table', { name: 'Projects', exact: true })
      .getByRole('link'),
  ).toHaveCount(4)
  const expandedURL = page.url()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  await create
    .getByLabel('Project name', { exact: true })
    .fill('History-preserving project')
  await create.getByRole('combobox', { name: 'Project status' }).click()
  await page.getByRole('option', { name: 'Active', exact: true }).click()
  await create
    .getByRole('button', { name: 'Create project', exact: true })
    .click()
  await expect(
    page.getByText('Project created.', { exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(expandedURL)
  await expect(
    page
      .getByRole('table', { name: 'Projects', exact: true })
      .getByRole('link', { name: 'History-preserving project', exact: true }),
  ).toBeVisible()
})

test('edit project pages reload and return to invoking detail anchors', async ({
  page,
  context,
}) => {
  const workspace = await openWorkspace(context.request)
  const project = workspace.projects.edges[0]!.node
  const detailURL = `/projects/${project.slug}?keep=retained`
  const editURL = `/projects/${project.slug}/edit?keep=retained`
  const edit = page.getByRole('form', { name: 'Edit project', exact: true })
  for (const direct of [`${detailURL}#edit`, editURL]) {
    await page.goto(direct)
    await expect(edit.getByLabel('Project name', { exact: true })).toHaveValue(
      project.name,
    )
    await expect(page).toHaveURL(editURL)
    await page.reload()
    await expect(edit.getByLabel('Project name', { exact: true })).toHaveValue(
      project.name,
    )
    if (direct === editURL) {
      await edit
        .getByLabel('Description', { exact: true })
        .fill('Saved through a direct edit page.')
      await edit
        .getByRole('button', { name: 'Save changes', exact: true })
        .click()
    } else {
      await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
    }
    await expect(edit).toBeHidden()
    await expect(page).toHaveURL(detailURL)
  }
  await page.goto(`${detailURL}#details-anchor`)
  await page.getByRole('link', { name: 'Edit project', exact: true }).click()
  await expect(page).toHaveURL(
    (url) => url.pathname === `/projects/${project.slug}/edit`,
  )
  await page.goBack()
  await expect(edit).toBeHidden()
  await expect(page).toHaveURL(`${detailURL}#details-anchor`)
  await page.goForward()
  await expect(edit.getByLabel('Project name', { exact: true })).toHaveValue(
    project.name,
  )
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(edit).toBeHidden()
  await expect(page).toHaveURL(`${detailURL}#details-anchor`)
})

test('project details return to the invoking overview entry after editing', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  await page.setViewportSize({ width: 1280, height: 400 })
  await page.goto('/?keep=retained#overview-anchor')
  const project = page
    .getByRole('table', { name: 'Recent projects', exact: true })
    .getByRole('link')
    .last()
  await expect(project).toBeVisible()
  await project.scrollIntoViewIfNeeded()
  const source = await page.evaluate(() => ({
    url: location.href,
    state: history.state,
    scrollY,
  }))
  expect(source.scrollY).toBeGreaterThan(0)
  await project.click()
  const back = page.getByRole('button', {
    name: 'Back to Overview',
    exact: true,
  })
  await expect(back).toBeVisible()
  const detailURL = page.url()
  await page.getByRole('link', { name: 'Edit project', exact: true }).click()
  const edit = page.getByRole('form', { name: 'Edit project', exact: true })
  await expect(edit).toBeVisible()
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(edit).toBeHidden()
  await expect(page).toHaveURL(detailURL)
  await expect(back).toBeVisible()
  await back.click()
  await expect(page).toHaveURL(source.url)
  await expect(
    page.getByRole('table', { name: 'Recent projects', exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => history.state)).toEqual(source.state)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(source.scrollY)
  await page.goForward()
  await expect(page).toHaveURL(detailURL)
  await expect(back).toBeVisible()
})

test('project details reload and return to the filtered paginated projects entry', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  await page.setViewportSize({ width: 1280, height: 400 })
  await page.goto('/projects?first=2&keep=retained#projects-anchor')
  const search = page.getByRole('textbox', {
    name: 'Search projects',
    exact: true,
  })
  await search.fill('a')
  await expect(page).toHaveURL((url) => url.searchParams.get('search') === 'a')
  const status = page.getByRole('combobox', {
    name: 'Filter by project status',
    exact: true,
  })
  await status.click()
  await page.getByRole('option', { name: 'Active', exact: true }).click()
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('status') === 'ACTIVE',
  )
  const projects = page
    .getByRole('table', { name: 'Projects', exact: true })
    .getByRole('link')
  await expect(projects).toHaveCount(2)
  await page.getByRole('button', { name: 'Load more', exact: true }).click()
  await expect(projects).toHaveCount(4)
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('search') === 'a' &&
      url.searchParams.get('status') === 'ACTIVE' &&
      url.searchParams.get('page') === '2' &&
      url.searchParams.get('first') === '2' &&
      url.searchParams.get('keep') === 'retained' &&
      url.hash === '#projects-anchor',
  )
  const names = await projects.allTextContents()
  await projects.last().scrollIntoViewIfNeeded()
  const source = await page.evaluate(() => ({
    url: location.href,
    state: history.state,
    scrollY,
  }))
  expect(source.scrollY).toBeGreaterThan(0)
  await projects.last().click()
  const back = page.getByRole('button', {
    name: 'Back to Projects',
    exact: true,
  })
  await expect(back).toBeVisible()
  const detailURL = page.url()
  await page.reload()
  await expect(page).toHaveURL(detailURL)
  await expect(back).toBeVisible()
  await back.click()
  await expect(page).toHaveURL(source.url)
  await expect(projects).toHaveText(names)
  await expect(search).toHaveValue('a')
  await expect(status).toContainText('Active')
  expect(await page.evaluate(() => history.state)).toEqual(source.state)
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(source.scrollY)
})

async function expectProjectFormAlignment(page: Page, form: Locator) {
  const controls = await elementGeometry(
    form
      .getByLabel('Project name', { exact: true })
      .or(form.getByLabel('Description', { exact: true }))
      .or(form.getByRole('combobox', { name: 'Project status', exact: true })),
  )
  const labels = await elementGeometry(
    form.locator(
      'label[for="project-name"], label[for="project-description"], label[for="project-status"]',
    ),
  )
  expect(controls).toHaveLength(3)
  expect(labels).toHaveLength(3)
  const name = controls[0]!
  const description = controls[1]!
  const status = controls[2]!
  const formBounds = (await form.boundingBox())!
  const group = (await form.locator('[data-slot="field-group"]').boundingBox())!
  const title = page.getByRole('heading', { level: 1 })
  const desktop = page.viewportSize()!.width >= 768
  await expect(title).toHaveCSS('font-family', /^Archivo,/)
  await expect(title).toHaveCSS('font-weight', '500')
  await expect(title).toHaveCSS('font-size', desktop ? '44px' : '32px')
  await expect(title).toHaveCSS('line-height', desktop ? '52px' : '40px')
  const heading = (await title.boundingBox())!
  for (const control of [
    form.getByLabel('Project name', { exact: true }),
    form.getByRole('combobox', { name: 'Project status', exact: true }),
    ...(await form
      .locator('[data-slot="form-actions"]')
      .getByRole('button')
      .all()),
  ]) {
    await expect(control).toHaveCSS('height', desktop ? '40px' : '44px')
    await expect(control).toHaveCSS('border-radius', '10px')
  }
  expect(heading.x).toBeCloseTo(formBounds.x, 0)
  expect(description.x).toBeCloseTo(name.x, 0)
  expect(status.x).toBeCloseTo(name.x, 0)
  expect(description.width).toBeCloseTo(name.width, 0)
  expect(name.x + name.width).toBeCloseTo(formBounds.x + formBounds.width, 0)
  for (const [index, control] of controls.entries()) {
    const label = labels[index]!
    expect(label.x).toBeCloseTo(labels[0]!.x, 0)
    if (group.width >= 448) {
      expect(label.x + label.width).toBeLessThanOrEqual(control.x)
      expect(label.y).toBeLessThan(control.y + control.height)
      expect(label.y + label.height).toBeGreaterThan(control.y)
    } else {
      expect(control.x).toBeCloseTo(label.x, 0)
      expect(control.width).toBeCloseTo(group.width, 0)
      expect(label.y + label.height).toBeLessThanOrEqual(control.y)
    }
  }
  if (group.width >= 448) expect(status.width).toBeCloseTo(208, 0)
  const actions = await elementGeometry(
    form.locator('[data-slot="form-actions"]').getByRole('button'),
  )
  expect(actions).toHaveLength(2)
  const cancel = actions[0]!
  const submit = actions[1]!
  expect(submit.y).toBeCloseTo(cancel.y, 0)
  expect(submit.x + submit.width).toBeCloseTo(name.x + name.width, 0)
}

test.describe('touch focus', () => {
  test.use({ hasTouch: true, isMobile: true })

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    test(`project pages avoid automatic text focus at ${viewport.width}px`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize(viewport)
      const workspace = await openWorkspace(context.request)
      const project = workspace.projects.edges[0]!.node
      const create = page.getByRole('form', {
        name: 'New project',
        exact: true,
      })
      const createName = create.getByLabel('Project name', { exact: true })
      const newProject = page.getByRole('link', {
        name: 'New project',
        exact: true,
      })
      await page.goto('/?keep=retained#overview-anchor')
      await expect(
        page.getByRole('link', { name: project.name, exact: true }),
      ).toBeVisible()
      await newProject.tap()
      await expect(create).toBeVisible()
      await expect(createName).not.toBeFocused()
      await expectProjectFormAlignment(page, create)
      await createName.tap()
      await expect(createName).toBeFocused()
      await createName.pressSequentially('Cancelled touch draft')
      await expect(createName).toHaveValue('Cancelled touch draft')
      await create.getByRole('button', { name: 'Cancel', exact: true }).tap()
      await expect(create).toBeHidden()
      await expect(page).toHaveURL('/?keep=retained#overview-anchor')
      await page.goForward()
      await expect(create).toBeVisible()
      await expect(createName).not.toBeFocused()
      await expect(createName).toHaveValue('')
      await create.getByRole('button', { name: 'Cancel', exact: true }).tap()
      await expect(page).toHaveURL('/?keep=retained#overview-anchor')

      await page.goto('/projects/new?first=2&keep=retained')
      await expect(create).toBeVisible()
      await expect(createName).not.toBeFocused()
      await page.reload()
      await expect(create).toBeVisible()
      await expect(createName).not.toBeFocused()
      await create.getByRole('button', { name: 'Cancel', exact: true }).tap()
      await expect(page).toHaveURL('/projects?first=2&keep=retained')

      const detailURL = `/projects/${project.slug}?keep=retained`
      const editProject = page.getByRole('link', {
        name: 'Edit project',
        exact: true,
      })
      const edit = page.getByRole('form', { name: 'Edit project', exact: true })
      const editName = edit.getByLabel('Project name', { exact: true })
      await page.goto(`${detailURL}#details-anchor`)
      await expect(editProject).toBeEnabled()
      await editProject.tap()
      await expect(edit).toBeVisible()
      await expect(editName).not.toBeFocused()
      await expectProjectFormAlignment(page, edit)
      await editName.tap()
      await expect(editName).toBeFocused()
      await editName.press('End')
      await editName.pressSequentially(' draft')
      await expect(editName).toHaveValue(`${project.name} draft`)
      await edit.getByRole('button', { name: 'Cancel', exact: true }).tap()
      await expect(edit).toBeHidden()
      await expect(page).toHaveURL(`${detailURL}#details-anchor`)
      await page.goForward()
      await expect(edit).toBeVisible()
      await expect(editName).not.toBeFocused()
      await expect(editName).toHaveValue(project.name)
      await page.reload()
      await expect(edit).toBeVisible()
      await expect(editName).not.toBeFocused()
      await edit.getByRole('button', { name: 'Cancel', exact: true }).tap()
      await expect(page).toHaveURL(`${detailURL}#details-anchor`)

      await page.goto(`/projects/${project.slug}/edit?keep=retained`)
      await expect(edit).toBeVisible()
      await expect(editName).not.toBeFocused()
      await page.reload()
      await expect(edit).toBeVisible()
      await expect(editName).not.toBeFocused()
      await edit.getByRole('button', { name: 'Cancel', exact: true }).tap()
      await expect(page).toHaveURL(detailURL)
    })
  }

  test('sign-in and component dialogs focus their popup on touch', async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    const continueButton = page.getByRole('button', {
      name: 'Continue',
      exact: true,
    })
    await expect(continueButton).toBeEnabled()
    await continueButton.tap()
    const login = page.getByRole('dialog', { name: 'Open demo workspace' })
    await expect(login).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(login).toBeHidden()
    await expect(continueButton).toBeFocused()

    await openWorkspace(context.request)
    await page.goto('/components')
    const open = page.getByRole('button', { name: 'Open dialog', exact: true })
    await expect(open).toBeEnabled()
    await open.tap()
    const example = page.getByRole('dialog', { name: 'Confirm example action' })
    await expect(example).toBeFocused()
    await example.getByRole('button', { name: 'Cancel', exact: true }).tap()
    await expect(example).toBeHidden()
    await expect(open).toBeFocused()
  })
})

test('New project actions use compact desktop and touch-sized mobile controls', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    for (const url of ['/', '/projects']) {
      await page.goto(url)
      const newProject = page.getByRole('link', {
        name: 'New project',
        exact: true,
      })
      await expect(newProject).toBeEnabled()
      await expect(newProject).toHaveCSS(
        'height',
        width >= 768 ? '32px' : '44px',
      )
      await expect(newProject).toHaveAttribute('href', '/projects/new')
      await page.evaluate(() => document.fonts.ready)
      const header = page.locator('[data-slot="page-header"]')
      const heading = header.getByRole('heading', { level: 1 })
      await expect(header).toHaveCSS('align-items', 'last baseline')
      await expect(heading.locator('..')).toHaveCSS('align-self', 'auto')
      const headerBounds = (await header.boundingBox())!
      const headingBounds = (await heading.boundingBox())!
      const actionBounds = (await newProject.boundingBox())!
      expect(actionBounds.x + actionBounds.width).toBeCloseTo(
        headerBounds.x + headerBounds.width,
        0,
      )
      expect(actionBounds.y).toBeLessThan(
        headingBounds.y + headingBounds.height,
      )
      expect(headingBounds.y).toBeLessThan(actionBounds.y + actionBounds.height)
      const baselines = await newProject.evaluate((element) => {
        const title = element
          .closest('[data-slot="page-header"]')!
          .querySelector('h1')!

        function textBaseline(target: Element) {
          const text = Array.from(target.childNodes).find(
            (node) =>
              node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          )
          if (!text) throw new Error('Expected visible header text')
          const wrapper = document.createElement('span')
          const probe = document.createElement('span')
          Object.assign(probe.style, {
            display: 'inline-block',
            width: '0',
            height: '0',
            verticalAlign: 'baseline',
          })
          text.replaceWith(wrapper)
          wrapper.append(text, probe)
          try {
            return probe.getBoundingClientRect().top
          } finally {
            wrapper.replaceWith(text)
          }
        }

        return {
          heading: textBaseline(title),
          action: textBaseline(element),
        }
      })
      expect(baselines.action - baselines.heading).toBe(0)
    }
  }
})

test('project pagination and server filters retain complete, unique results', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  const requests = collectGraphQLRequests(page)
  await page.goto('/projects?keep=retained#projects')
  const table = page.getByRole('table', { name: 'Projects', exact: true })
  const projects = table.getByRole('link')
  const more = page.getByRole('button', { name: 'Load more', exact: true })
  const newProject = page.getByRole('link', {
    name: 'New project',
    exact: true,
  })
  for (const control of [more, newProject]) {
    await expect(control).toHaveCSS('font-size', '14px')
    await expect(control).toHaveCSS('font-weight', '500')
    await expect(control).toHaveCSS('line-height', '20px')
  }
  await expect(more).toHaveCSS('height', '32px')
  await expect(more).toHaveCSS('width', '112px')
  await expect(projects).toHaveCount(6)
  await expect(
    page.getByText('Showing 6 of 10 projects', { exact: true }),
  ).toBeVisible()
  const firstPage = await projects.allTextContents()
  const pagination = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/graphql' &&
      Boolean(request.postDataJSON()?.variables?.after),
  )
  await more.click()
  await pagination
  await expect(projects).toHaveCount(10)
  expect(await projects.allTextContents()).toEqual(
    expect.arrayContaining(firstPage),
  )
  const hrefs = await projects.evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  )
  expect(new Set(hrefs).size).toBe(10)
  await expect(
    page.getByText('Showing 10 of 10 projects', { exact: true }),
  ).toBeVisible()
  await expect(more).toHaveCount(0)
  await expect(page).toHaveURL('/projects?keep=retained&page=2#projects')
  await page.goBack()
  await expect(page).toHaveURL('/projects?keep=retained#projects')
  await expect(projects).toHaveText(firstPage)
  await expect(more).toBeEnabled()
  await page.goForward()
  await expect(projects).toHaveCount(10)
  expect(
    await projects.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')),
    ),
  ).toEqual(hrefs)
  expect(requests.map((request) => request.postDataJSON()?.id)).toEqual([
    ProjectsPagePaginationQuery.params.id,
  ])

  const beforeReload = requests.length
  await page.reload()
  await expect(projects).toHaveCount(10)
  expect(
    await projects.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')),
    ),
  ).toEqual(hrefs)
  expect(
    requests.slice(beforeReload).map((request) => request.postDataJSON()?.id),
  ).toEqual([ProjectsPagePaginationQuery.params.id])
  const shared = await context.newPage()
  const sharedErrors: string[] = []
  shared.on('pageerror', (error) => sharedErrors.push(error.message))
  shared.on('console', (message) => {
    if (message.type() === 'error') sharedErrors.push(message.text())
  })
  const sharedRequests = collectGraphQLRequests(shared)
  try {
    await shared.goto(page.url())
    const sharedProjects = shared
      .getByRole('table', { name: 'Projects', exact: true })
      .getByRole('link')
    await expect(sharedProjects).toHaveCount(10)
    expect(
      await sharedProjects.evaluateAll((links) =>
        links.map((link) => link.getAttribute('href')),
      ),
    ).toEqual(hrefs)
    expect(sharedRequests.map((request) => request.postDataJSON()?.id)).toEqual(
      [ProjectsPagePaginationQuery.params.id],
    )
    expect(sharedErrors).toEqual([])
  } finally {
    await shared.close()
  }

  const search = page.getByRole('textbox', {
    name: 'Search projects',
    exact: true,
  })
  await search.fill('Atlas')
  await expect(projects).toHaveText(['Atlas design system'])
  await expect(
    page.getByText('Showing 1 of 1 projects', { exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(
    (url) => !url.searchParams.has('page') && !url.searchParams.has('after'),
  )
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(projects).toHaveCount(6)
  await expect(
    page.getByText('Showing 6 of 10 projects', { exact: true }),
  ).toBeVisible()
  await expect(more).toBeEnabled()

  await page
    .getByRole('combobox', { name: 'Filter by project status', exact: true })
    .click()
  await page.getByRole('option', { name: 'Planned', exact: true }).click()
  await expect(projects).toHaveCount(3)
  await expect(
    table.getByRole('cell', { name: 'Planned', exact: true }),
  ).toHaveCount(3)
  await expect(
    page.getByText('Showing 3 of 3 projects', { exact: true }),
  ).toBeVisible()
  await search.fill('no-such-project')
  await expect(
    table.getByRole('cell', { name: 'No matching projects.', exact: true }),
  ).toBeVisible()
  await expect(projects).toHaveCount(0)
  await expect(
    page.getByText('Showing 0 of 0 projects', { exact: true }),
  ).toBeVisible()
  await expect(table.getByRole('columnheader')).toHaveText([
    'Project',
    'Status',
    'Updated',
  ])
  await expect(more).toHaveCount(0)
  for (const request of requests) {
    expect(request.postDataJSON()).toMatchObject({
      id: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(request.postDataJSON()).not.toHaveProperty('query')
  }
})

test('project slugs distinguish duplicate names and canonicalize legacy edit links', async ({
  page,
  context,
}) => {
  const workspace = await openWorkspace(context.request)
  const project = workspace.projects.edges[0]!.node
  const created = await context.request.post('/graphql', {
    data: {
      query:
        'mutation DuplicateProject($input: CreateProjectInput!) { createProject(input: $input) { project { id slug name } } }',
      variables: {
        input: {
          name: project.name,
          description: 'Duplicate name with its own stable URL.',
          status: project.status,
        },
      },
    },
  })
  await expect(created).toBeOK()
  const result = await created.json()
  expect(result.errors).toBeUndefined()
  const duplicate = result.data.createProject.project
  expect(duplicate.id).not.toBe(project.id)
  expect(duplicate.slug).not.toBe(project.slug)
  expect(duplicate.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  const listingURL = `/projects?${new URLSearchParams({ search: project.name })}`
  await page.goto(listingURL)
  const links = page
    .getByRole('table', { name: 'Projects', exact: true })
    .getByRole('link', { name: project.name, exact: true })
  await expect(links).toHaveCount(2)
  expect(
    (
      await links.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('href')),
      )
    ).sort(),
  ).toEqual([`/projects/${project.slug}`, `/projects/${duplicate.slug}`].sort())

  const legacyURL = `/projects/${project.id}?keep=retained#edit`
  const response = await context.request.get(legacyURL)
  await expect(response).toBeOK()
  const { entries } = readBootstrap(await response.text())
  expect(entries[1]).toMatchObject({
    id: ProjectDetailPageQuery.params.id,
    variables: { slug: project.id },
    response: { data: { project: { id: project.id, slug: project.slug } } },
  })
  await page.goto(legacyURL)
  const edit = page.getByRole('form', { name: 'Edit project', exact: true })
  await expect(edit.getByLabel('Project name', { exact: true })).toHaveValue(
    project.name,
  )
  await expect(page).toHaveURL(`/projects/${project.slug}/edit?keep=retained`)
  await page.reload()
  await expect(edit.getByLabel('Project name', { exact: true })).toHaveValue(
    project.name,
  )
  await expect(page).toHaveURL(`/projects/${project.slug}/edit?keep=retained`)
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(edit).toBeHidden()
  await expect(page).toHaveURL(`/projects/${project.slug}?keep=retained`)
  await page.goBack()
  await expect(page).toHaveURL(listingURL)
  const directEdit = `/projects/${encodeURIComponent(project.id)}/edit?keep=encoded`
  const directResponse = await context.request.get(directEdit)
  await expect(directResponse).toBeOK()
  expect(readBootstrap(await directResponse.text()).entries[1]).toMatchObject({
    id: ProjectEditPageQuery.params.id,
    variables: { slug: project.id },
    response: { data: { project: { id: project.id, slug: project.slug } } },
  })
  await page.goto(directEdit)
  await expect(edit.getByLabel('Project name', { exact: true })).toHaveValue(
    project.name,
  )
  await expect(page).toHaveURL(`/projects/${project.slug}/edit?keep=encoded`)
  await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL(`/projects/${project.slug}?keep=encoded`)
  for (const slug of ['new-2', 'new-3']) {
    const reservedResponse = await context.request.post('/graphql', {
      data: {
        query:
          'mutation ReservedProjectName($input: CreateProjectInput!) { createProject(input: $input) { project { id slug name } } }',
        variables: {
          input: {
            name: 'New',
            description: `Project using the reserved path suffix ${slug}.`,
            status: 'PLANNED',
          },
        },
      },
    })
    await expect(reservedResponse).toBeOK()
    const reserved = await reservedResponse.json()
    expect(reserved.errors).toBeUndefined()
    expect(reserved.data.createProject.project).toMatchObject({
      name: 'New',
      slug,
    })
    await page.goto(`/projects/${slug}`)
    await expect(
      page.getByRole('heading', { name: 'New', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(`Project using the reserved path suffix ${slug}.`, {
        exact: true,
      }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Edit project', exact: true }).click()
    await expect(page).toHaveURL(`/projects/${slug}/edit`)
    await expect(edit.getByLabel('Project name', { exact: true })).toHaveValue(
      'New',
    )
    await expect(edit.getByLabel('Description', { exact: true })).toHaveValue(
      `Project using the reserved path suffix ${slug}.`,
    )
    await edit.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page).toHaveURL(`/projects/${slug}`)
  }
  await page.goto('/projects/new')
  await expect(
    page.getByRole('heading', { name: 'New project', exact: true }),
  ).toBeVisible()
  const create = page.getByRole('form', { name: 'New project', exact: true })
  await expect(create.getByLabel('Project name', { exact: true })).toHaveValue(
    '',
  )
  await expect(
    create.getByRole('button', { name: 'Create project', exact: true }),
  ).toBeEnabled()
})

test('a shared anchored project window restores multiple batches and resets with filters', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  const anchorResponse = await context.request.post('/graphql', {
    data: {
      query:
        '{ projects(first: 2) { edges { node { id slug } } pageInfo { endCursor } } }',
    },
  })
  await expect(anchorResponse).toBeOK()
  const anchorResult = await anchorResponse.json()
  expect(anchorResult.errors).toBeUndefined()
  const anchor = anchorResult.data.projects
  const expectedResponse = await context.request.post('/graphql', {
    data: {
      query:
        'query Window($after: String!) { projects(first: 8, after: $after) { edges { node { id slug } } } }',
      variables: { after: anchor.pageInfo.endCursor },
    },
  })
  await expect(expectedResponse).toBeOK()
  const expectedResult = await expectedResponse.json()
  expect(expectedResult.errors).toBeUndefined()
  const expected = expectedResult.data.projects.edges.map(
    ({ node }: { node: { slug: string } }) => `/projects/${node.slug}`,
  )
  const params = new URLSearchParams({
    first: '2',
    after: anchor.pageInfo.endCursor,
    page: '3',
    keep: 'retained',
  })
  const response = await context.request.get(`/projects?${params}`)
  await expect(response).toBeOK()
  const html = await response.text()
  const { entries } = readBootstrap(html)
  expect(entries[1]).toMatchObject({
    id: ProjectsPageQuery.params.id,
    variables: {
      first: 2,
      after: null,
      anchor: anchor.pageInfo.endCursor,
      search: null,
      status: null,
    },
  })
  expect(
    resolveVariables(readPreloads(html).preloads[1]!.variables, {}, params),
  ).toEqual(entries[1]!.variables)
  const requests = collectGraphQLRequests(page)
  await page.goto(`/projects?${params}#anchor`)
  const projects = page
    .getByRole('table', { name: 'Projects', exact: true })
    .getByRole('link')
  await expect(projects).toHaveCount(6)
  expect(
    await projects.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')),
    ),
  ).toEqual(expected.slice(0, 6))
  expect(requests.length).toBeGreaterThan(0)
  expect(
    requests.every(
      (request) =>
        request.postDataJSON()?.id === ProjectsPagePaginationQuery.params.id,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Load more', exact: true }).click()
  await expect(projects).toHaveCount(8)
  expect(
    await projects.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href')),
    ),
  ).toEqual(expected)
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('page') === '4' &&
      url.searchParams.get('after') === anchor.pageInfo.endCursor,
  )
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toHaveCount(0)
  const expandedURL = page.url()
  await projects.first().click()
  await page.getByRole('link', { name: 'Edit project', exact: true }).click()
  const edit = page.getByRole('form', { name: 'Edit project', exact: true })
  await edit
    .getByLabel('Description', { exact: true })
    .fill('Edited from an anchored project window.')
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(edit).toBeHidden()
  await expect(
    page.getByText('Project changes saved.', { exact: true }),
  ).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(expandedURL)
  await expect(projects).toHaveCount(8)
  await expect
    .poll(() =>
      projects.evaluateAll((links) =>
        links.map((link) => link.getAttribute('href')),
      ),
    )
    .toEqual(expected)
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('textbox', { name: 'Search projects', exact: true })
    .fill('Atlas')
  await expect(projects).toHaveText(['Atlas design system'])
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('first') === '2' &&
      url.searchParams.get('keep') === 'retained' &&
      !url.searchParams.has('page') &&
      !url.searchParams.has('after') &&
      url.hash === '#anchor',
  )
})

test('late pagination responses cannot change a newer route or filter', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  for (const destination of ['components', 'planned'] as const) {
    await page.setViewportSize({
      width: destination === 'components' ? 1280 : 390,
      height: 844,
    })
    await page.goto('/projects?keep=retained#projects')
    await expect(
      page.getByText('Showing 6 of 10 projects', { exact: true }),
    ).toBeVisible()
    const more = page.getByRole('button', { name: 'Load more', exact: true })
    await more.scrollIntoViewIfNeeded()
    const before = await elementGeometry(more)
    await expect(more).toHaveCSS(
      'height',
      destination === 'components' ? '32px' : '44px',
    )
    await expect(more).toHaveCSS('width', '112px')
    await expect(more).toHaveCSS('font-size', '14px')
    await expect(more).toHaveCSS('font-weight', '500')
    await expect(more).toHaveCSS('line-height', '20px')
    let release!: () => void
    let fetched!: () => void
    let fulfilled!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const responseFetched = new Promise<void>((resolve) => {
      fetched = resolve
    })
    const responseFulfilled = new Promise<void>((resolve) => {
      fulfilled = resolve
    })
    const holdPagination = async (route: Route) => {
      if (
        route.request().postDataJSON()?.id !==
        ProjectsPagePaginationQuery.params.id
      ) {
        await route.continue()
        return
      }
      const response = await route.fetch()
      fetched()
      await released
      await route.fulfill({ response })
      fulfilled()
    }
    await page.route('**/graphql', holdPagination)
    try {
      await more.click()
      await responseFetched
      const pending = page.getByRole('button', {
        name: 'Loading…',
        exact: true,
      })
      await expect(pending).toBeDisabled()
      await expect(pending).toHaveAttribute('aria-busy', 'true')
      await expect(pending).toHaveCSS('font-size', '14px')
      await expect(pending).toHaveCSS('font-weight', '500')
      await expect(pending).toHaveCSS('line-height', '20px')
      expectFieldGeometry(await elementGeometry(pending), before)
      if (destination === 'components') {
        await page
          .getByRole('link', { name: 'Components', exact: true })
          .click()
        await expect(
          page.getByRole('heading', { name: 'Components', exact: true }),
        ).toBeVisible()
      } else {
        await page
          .getByRole('combobox', {
            name: 'Filter by project status',
            exact: true,
          })
          .click()
        await page.getByRole('option', { name: 'Planned', exact: true }).click()
        await expect(
          page.getByText('Showing 3 of 3 projects', { exact: true }),
        ).toBeVisible()
      }
      release()
      await responseFulfilled
      await page.waitForTimeout(300)
      if (destination === 'components') {
        await expect(page).toHaveURL('/components')
        await expect(
          page.getByRole('heading', { name: 'Components', exact: true }),
        ).toBeVisible()
      } else {
        await expect(page).toHaveURL(
          '/projects?keep=retained&status=PLANNED#projects',
        )
        await expect(
          page
            .getByRole('table', { name: 'Projects', exact: true })
            .getByRole('link'),
        ).toHaveCount(3)
        await expect(page.getByRole('alert')).toHaveCount(0)
      }
    } finally {
      release()
      await page.unroute('**/graphql', holdPagination)
    }
  }
})

test('an expired session offers sign-in recovery through a full page navigation', async ({
  page,
  context,
}) => {
  const workspace = await openWorkspace(context.request)
  await page.goto('/projects')
  await expect(
    page.getByText('Showing 6 of 10 projects', { exact: true }),
  ).toBeVisible()
  const initialURL = page.url()
  await expect(await context.request.post('/auth/logout')).toBeOK()

  await page.getByRole('button', { name: 'Load more', exact: true }).click()
  const error = page
    .getByRole('alert')
    .filter({ hasText: 'Unable to complete the request' })
  await expect(error).toBeVisible()
  await expect(error).toContainText('Sign in to continue.')
  await expect(page).toHaveURL(initialURL)
  await expect(
    page
      .getByRole('table', { name: 'Projects', exact: true })
      .getByRole('link'),
  ).toHaveCount(6)
  const signIn = error.getByRole('link', { name: 'Sign in', exact: true })
  await expect(signIn).toHaveAttribute('href', '/')

  const navigation = page.waitForRequest(
    (request) =>
      request.isNavigationRequest() &&
      request.resourceType() === 'document' &&
      request.frame() === page.mainFrame() &&
      new URL(request.url()).pathname === '/',
  )
  await signIn.click()
  expect((await navigation).method()).toBe('GET')
  await expect(page).toHaveURL('/')
  await expect(page.getByText('Welcome to Acme', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeEnabled()
  await expect(page.locator('[data-slot="sidebar-content"]')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: `${workspace.viewer.name} account menu` }),
  ).toHaveCount(0)
})

test('an expired session on the Session route returns to sign-in and can recover', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'Alex Morgan account menu', exact: true }),
  ).toBeVisible()
  await expect(await context.request.post('/auth/logout')).toBeOK()
  const sessionResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/graphql' &&
      response.request().postDataJSON()?.id === SessionPageQuery.params.id,
  )
  await page.getByRole('link', { name: 'Session', exact: true }).click()
  expect((await (await sessionResponse).json()).data.viewer).toBeNull()
  await expect(page.getByText('Welcome to Acme', { exact: true })).toBeVisible()
  await expect(page.locator('[data-slot="sidebar-content"]')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page
    .getByRole('button', { name: 'Open workspace', exact: true })
    .click()
  await expect(page).toHaveURL('/')
  await expect(
    page.getByRole('button', { name: 'Alex Morgan account menu', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Overview', exact: true }),
  ).toBeVisible()
})

test('a project form recognizes an authentication code when its message changes', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  await page.goto('/projects')
  await expect(
    page.getByText('Showing 6 of 10 projects', { exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'New project', exact: true }).click()
  const form = page.getByRole('form', {
    name: 'New project',
    exact: true,
  })
  await form
    .getByLabel('Project name', { exact: true })
    .fill('Expired session project')
  await expect(await context.request.post('/auth/logout')).toBeOK()
  await page.route('**/graphql', async (route) => {
    if (
      route.request().postDataJSON()?.id !== ProjectFormCreateMutation.params.id
    ) {
      await route.continue()
      return
    }
    const response = await route.fetch()
    const result = await response.json()
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extensions: expect.objectContaining({ code: 'UNAUTHENTICATED' }),
        }),
      ]),
    )
    await route.fulfill({
      response,
      json: {
        ...result,
        errors: result.errors.map((error: { message: string }) => ({
          ...error,
          message: 'Session expired. Please authenticate again.',
        })),
      },
    })
  })

  await form
    .getByRole('button', { name: 'Create project', exact: true })
    .click()
  const error = form.getByRole('alert')
  await expect(error).toContainText(
    'Session expired. Please authenticate again.',
  )
  const signIn = error.getByRole('link', { name: 'Sign in', exact: true })
  await expect(signIn).toHaveAttribute('href', '/')
  const navigation = page.waitForRequest(
    (request) =>
      request.isNavigationRequest() &&
      request.resourceType() === 'document' &&
      request.frame() === page.mainFrame() &&
      new URL(request.url()).pathname === '/',
  )
  await signIn.click()
  await navigation
  await expect(page.getByText('Welcome to Acme', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeEnabled()
  await expect(page.locator('[data-slot="sidebar-content"]')).toHaveCount(0)
})

test.describe('demo sign-in retry', () => {
  test.use({
    expectedConsoleErrors: [
      {
        message:
          'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
        pathname: '/auth/demo',
      },
    ],
  })

  test('closing a failed login clears the error before reopening and retrying', async ({
    page,
  }) => {
    await page.goto('/')
    const continueButton = page.getByRole('button', {
      name: 'Continue',
      exact: true,
    })
    await continueButton.click()
    const dialog = page.getByRole('dialog', {
      name: 'Open demo workspace',
      exact: true,
    })
    const submit = dialog.getByRole('button', {
      name: 'Open workspace',
      exact: true,
    })
    await page.route('**/auth/demo', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'TEMPORARILY_UNAVAILABLE',
          error: 'Sign-in is temporarily unavailable. Please try again.',
        }),
      }),
    )
    for (const close of ['cancel', 'history'] as const) {
      await submit.click()
      await expect(dialog.getByRole('alert')).toContainText(
        'Sign-in is temporarily unavailable.',
      )
      await expect(submit).toBeEnabled()
      if (close === 'cancel')
        await dialog
          .getByRole('button', { name: 'Cancel', exact: true })
          .click()
      else await page.goBack()
      await expect(dialog).toBeHidden()
      await expect(page).toHaveURL('/')
      await page.goForward()
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('alert')).toHaveCount(0)
      await expect(submit).toBeEnabled()
    }
    await page.unroute('**/auth/demo')
    await submit.click()
    await expect(
      page.getByRole('button', {
        name: 'Alex Morgan account menu',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Overview', exact: true }),
    ).toBeVisible()
    await expect(page).toHaveURL('/')
  })
})

test.describe('REST authentication recovery', () => {
  test.use({
    expectedConsoleErrors: [
      {
        message:
          'Failed to load resource: the server responded with a status of 401 (Unauthorized)',
        pathname: '/auth/logout',
      },
    ],
  })

  test('an account sign-out failure offers sign-in recovery from its REST toast', async ({
    page,
    context,
  }) => {
    const workspace = await openWorkspace(context.request)
    await page.goto('/projects')
    await expect(
      page.getByText('Showing 6 of 10 projects', { exact: true }),
    ).toBeVisible()
    await expect(await context.request.post('/auth/logout')).toBeOK()
    await page.route('**/auth/logout', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'UNAUTHENTICATED',
          error: 'Your session has ended.',
        }),
      }),
    )
    await page
      .getByRole('button', { name: `${workspace.viewer.name} account menu` })
      .click()
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
    const toast = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: 'Your session has ended.' })
    await expect(toast).toBeVisible()
    const signIn = toast.getByRole('link', { name: 'Sign in', exact: true })
    await expect(signIn).toHaveAttribute('href', '/')
    const navigation = page.waitForRequest(
      (request) =>
        request.isNavigationRequest() &&
        request.resourceType() === 'document' &&
        request.frame() === page.mainFrame() &&
        new URL(request.url()).pathname === '/',
    )
    await signIn.click()
    await navigation
    await expect(
      page.getByText('Welcome to Acme', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Continue', exact: true }),
    ).toBeEnabled()
    await expect(page.locator('[data-slot="sidebar-content"]')).toHaveCount(0)
    await expect(
      page.getByRole('button', {
        name: `${workspace.viewer.name} account menu`,
      }),
    ).toHaveCount(0)
  })
})

async function expectOpaquePopup(popup: Locator, surface: string) {
  await expect(popup).toHaveCSS('background-color', surface)
  await expect(popup).toHaveCSS('background-image', 'none')
  await expect(popup).toHaveCSS('backdrop-filter', 'none')
  await expect(popup).toHaveCSS('opacity', '1')
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} appearance persists through sidebar profile menus and fixed navigation`, async ({
    page,
    context,
    baseURL,
  }) => {
    const workspace = await openWorkspace(context.request)
    const project = workspace.projects.edges[0]!.node
    const themeName = theme === 'light' ? 'Light' : 'Dark'
    const popupSurface =
      theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(37, 40, 43)'
    const selectedSurface =
      theme === 'light' ? 'rgb(226, 231, 226)' : popupSurface
    await context.addCookies([
      {
        name: 'sidebar_state',
        value: 'false',
        url: new URL('/', baseURL).href,
      },
    ])
    await page.goto('/')
    const sidebar = page.locator('[data-slot="sidebar"]')
    const accountName = `${workspace.viewer.name} account menu`
    const accountTrigger = sidebar.getByRole('button', {
      name: accountName,
      exact: true,
    })
    await expect(page.getByRole('button', { name: accountName })).toHaveCount(1)
    await expect(accountTrigger).toBeVisible()
    await expect(
      accountTrigger.getByText(workspace.viewer.name, { exact: true }),
    ).toBeVisible()
    const accountSize = await accountTrigger.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      available: element.parentElement!.clientWidth,
    }))
    expect(accountSize.height).toBeGreaterThanOrEqual(44)
    expect(accountSize.width).toBeCloseTo(accountSize.available, 0)
    await expect(page.getByRole('main').locator(':scope > header')).toBeHidden()
    await expect(
      page.getByRole('button', { name: /^(Expand|Collapse) sidebar$/ }),
    ).toBeHidden()
    await expect(
      page.getByRole('button', { name: 'Toggle theme', exact: true }),
    ).toHaveCount(0)
    await expect(sidebar).toHaveCSS('width', '240px')
    for (const shortcut of ['Control+b', 'Meta+b']) {
      await page.keyboard.press(shortcut)
      await expect(sidebar).toHaveCSS('width', '240px')
      await expect(
        sidebar.getByRole('link', { name: 'Projects', exact: true }),
      ).toBeVisible()
    }
    await expect(
      sidebar.locator('[data-slot="sidebar-header"]').getByText('Demo', {
        exact: true,
      }),
    ).toBeVisible()
    await accountTrigger.click()
    const selectedTheme = page.getByRole('menuitemradio', {
      name: themeName,
      exact: true,
    })
    await selectedTheme.click()
    await expect(selectedTheme).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Escape')
    await expect(selectedTheme).toBeHidden()
    await expect(
      page.getByRole('menu', { name: accountName, exact: true }),
    ).toBeHidden()
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
    await page.reload()
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
    await expect(accountTrigger).toBeVisible()
    await expect(sidebar).toHaveCSS('width', '240px')
    const sidebarFace = sidebar.locator('[data-slot="sidebar-inner"]')
    await expect(sidebarFace).toHaveCSS(
      'background-color',
      theme === 'light'
        ? 'rgba(236, 238, 234, 0.92)'
        : 'rgba(24, 26, 28, 0.92)',
    )
    await expect(sidebarFace).toHaveCSS('backdrop-filter', 'blur(24px)')
    const overview = sidebar.getByRole('link', {
      name: 'Overview',
      exact: true,
    })
    await expect(overview).toHaveCSS('height', '40px')
    await expect(overview).toHaveCSS('background-color', selectedSurface)
    await expect(overview).toHaveCSS('box-shadow', 'none')

    await accountTrigger.click()
    const account = page.getByRole('menu', { name: accountName, exact: true })
    await expectOpaquePopup(account, popupSurface)
    const headingBounds = (await page
      .getByRole('heading', { name: 'Overview', exact: true })
      .boundingBox())!
    await page.mouse.move(headingBounds.x, headingBounds.y)
    await expect(account).toBeVisible()
    await expect(accountTrigger).toHaveAttribute('data-popup-open', '')
    await expect(accountTrigger).toHaveCSS('background-color', selectedSurface)
    await expect(accountTrigger).toHaveCSS('box-shadow', 'none')
    await expect(
      account.getByText(workspace.viewer.name, { exact: true }),
    ).toBeVisible()
    await expect(account.getByText('Maintainer', { exact: true })).toBeVisible()
    const themeChoice = page.getByRole('menuitemradio', {
      name: themeName,
      exact: true,
    })
    await expect(themeChoice).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('menuitemradio')).toHaveText([
      'Light',
      'Dark',
      'System',
    ])
    await account
      .getByRole('menuitem', { name: 'Your session', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Session', exact: true }),
    ).toBeVisible()
    await expect(sidebar).toHaveCSS('width', '240px')
    await expect(page.getByRole('button', { name: accountName })).toHaveCount(1)

    await page.getByRole('link', { name: 'Projects', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: 'Projects', exact: true }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'New project', exact: true }).click()
    const create = page.getByRole('form', {
      name: 'New project',
      exact: true,
    })
    await expect(page).toHaveURL((url) => url.pathname === '/projects/new')
    await expect(create).toBeVisible()
    const surfaces = await create.evaluate((element) => {
      const probe = document.createElement('div')
      element.append(probe)
      probe.style.backgroundColor = 'var(--field)'
      const field = getComputedStyle(probe).backgroundColor
      probe.style.backgroundColor = 'var(--card)'
      const card = getComputedStyle(probe).backgroundColor
      probe.remove()
      return { field, card }
    })
    const fields = [
      create.getByLabel('Project name', { exact: true }),
      create.getByLabel('Description', { exact: true }),
      create.getByRole('combobox', { name: 'Project status', exact: true }),
    ]
    expect(surfaces.field).not.toBe(surfaces.card)
    for (const field of fields) {
      await expect(field).toHaveCSS('background-color', surfaces.field)
      await field.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(field).toBeFocused()
      await expect(field).toHaveCSS('background-color', surfaces.card)
      await expect(field).toHaveCSS('box-shadow', /0px 0px 0px 3px/)
      await field.evaluate((element) => element.blur())
      await expect(field).toHaveCSS('background-color', surfaces.field)
    }
    await fields[2]!.click()
    const statusPopup = page.locator('[data-slot="select-content"]')
    await expectOpaquePopup(statusPopup, popupSurface)
    await expect(statusPopup).toHaveCSS('border-radius', '14px')
    await expect(statusPopup.locator('[data-slot="select-group"]')).toHaveCSS(
      'padding',
      '8px',
    )
    await expect(statusPopup).toHaveCSS('box-shadow', /0px 1px 0px 0px inset/)
    await expect(statusPopup).not.toHaveCSS(
      'box-shadow',
      /0px 0px 0px [34]px inset/,
    )
    await page.keyboard.press('Escape')
    await expect(statusPopup).toBeHidden()
    await create.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(create).toBeHidden()
    await expect(page).toHaveURL('/projects')
    await page.getByRole('link', { name: project.name, exact: true }).click()
    await expect(
      page.getByRole('heading', { name: project.name, exact: true }),
    ).toBeVisible()

    for (const name of ['Components', 'Session', 'Overview']) {
      await page.getByRole('link', { name, exact: true }).click()
      await expect(
        page.getByRole('heading', { name, exact: true }),
      ).toBeVisible()
      await expect(sidebar).toHaveCSS('width', '240px')
      await expect(page.locator('html')).toHaveClass(
        new RegExp(`\\b${theme}\\b`),
      )
      if (name === 'Components') {
        await page.getByRole('button', { name: 'Primary', exact: true }).click()
        await expect(
          page.getByText('Primary action selected.', { exact: true }),
        ).toBeVisible()
        await expectOpaquePopup(
          page
            .locator('[data-sonner-toast]')
            .filter({ hasText: 'Primary action selected.' }),
          popupSurface,
        )
      }
    }
  })
}

test('mobile navigation owns the account and profile theme choices', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const workspace = await openWorkspace(context.request)
  await page.goto('/')
  await expect(
    page.getByRole('link', {
      name: workspace.projects.edges[0]!.node.name,
      exact: true,
    }),
  ).toBeVisible()
  const open = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  })
  const titlebar = page.getByRole('main').locator(':scope > header')
  await expect(titlebar).toBeVisible()
  await expect(titlebar).toHaveCSS('position', 'sticky')
  await expect(titlebar).toHaveCSS('height', '56px')
  await expect(
    titlebar.getByRole('link', { name: 'Acme home', exact: true }),
  ).toBeVisible()
  await expect(titlebar.getByText('Demo', { exact: true })).toBeVisible()
  await expect(
    titlebar.getByRole('button', { name: 'Open navigation', exact: true }),
  ).toBeVisible()
  await expect(open).toHaveCount(1)
  await expect(open).toHaveAttribute('aria-expanded', 'false')
  const navigation = page.getByRole('dialog', { name: 'Sidebar', exact: true })
  await expect(navigation).toBeHidden()
  const accountName = `${workspace.viewer.name} account menu`
  await expect(page.getByRole('button', { name: accountName })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Toggle theme', exact: true }),
  ).toHaveCount(0)
  await open.click()
  await expect(navigation).toBeVisible()
  await navigation.getByRole('link', { name: 'Acme home', exact: true }).click()
  await expect(page).toHaveURL('/')
  await expect(navigation).toBeHidden()
  await expect(open).toHaveAttribute('aria-expanded', 'false')
  await open.click()
  await expect(navigation).toBeVisible()
  const accountTrigger = navigation.getByRole('button', {
    name: accountName,
    exact: true,
  })
  await expect(accountTrigger).toBeVisible()
  await expect(
    accountTrigger.getByText(workspace.viewer.name, { exact: true }),
  ).toBeVisible()
  expect((await accountTrigger.boundingBox())!.height).toBeGreaterThanOrEqual(
    44,
  )
  const accountSize = await accountTrigger.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    available: element.parentElement!.clientWidth,
  }))
  expect(accountSize.width).toBeCloseTo(accountSize.available, 0)
  await accountTrigger.click()
  const account = page.getByRole('menu', { name: accountName, exact: true })
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(
    page.getByRole('menuitemradio', { name: 'Dark', exact: true }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('menuitemradio', { name: 'Dark', exact: true }),
  ).toBeHidden()
  await expect(account).toBeHidden()
  await expect(navigation).toBeVisible()

  await accountTrigger.click()
  await expectOpaquePopup(account, 'rgb(37, 40, 43)')
  await expect(
    account.getByText(workspace.viewer.name, { exact: true }),
  ).toBeVisible()
  await expect(account.getByText('Maintainer', { exact: true })).toBeVisible()
  await account
    .getByRole('menuitem', { name: 'Your session', exact: true })
    .click()
  await expect(navigation).toBeHidden()
  await expect(
    page.getByRole('heading', { name: 'Session', exact: true }),
  ).toBeVisible()
  await expect(open).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: accountName })).toHaveCount(0)

  await open.click()
  await expect(navigation).toHaveCSS(
    'background-color',
    'rgba(24, 26, 28, 0.92)',
  )
  await expect(navigation).toHaveCSS('background-image', 'none')
  await expect(navigation).toHaveCSS('backdrop-filter', 'blur(24px)')
  await expect(navigation).toHaveCSS('opacity', '1')
  await expect(accountTrigger).toBeVisible()
  await navigation.getByRole('link', { name: 'Projects', exact: true }).click()
  await expect(navigation).toBeHidden()
  await expect(
    page.getByRole('heading', { name: 'Projects', exact: true }),
  ).toBeVisible()
  await expect(open).toHaveAttribute('aria-expanded', 'false')
  await open.click()
  await accountTrigger.click()
  await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/\blight\b/)
  await expect(
    page.getByRole('menuitemradio', { name: 'Light', exact: true }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('menuitemradio', { name: 'Light', exact: true }),
  ).toBeHidden()
  await expect(account).toBeHidden()
  await accountTrigger.click()
  await expectOpaquePopup(account, 'rgb(255, 255, 255)')
  await page.keyboard.press('Escape')
  await expect(account).toBeHidden()
  await expect(navigation).toBeVisible()
  await navigation
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click()
  await expect(navigation).toBeHidden()
  await expect(open).toHaveAttribute('aria-expanded', 'false')
})

const shells = [
  { name: 'overview', url: '/', heading: 'Overview' },
  { name: 'projects', url: '/projects', heading: 'Projects' },
  { name: 'new project', url: '/projects/new', heading: 'New project' },
  {
    name: 'edit project',
    projectIndex: 0,
    edit: true,
    heading: 'Edit project',
  },
  { name: 'components', url: '/components', heading: 'Components' },
  {
    name: 'appearance components',
    url: '/components/appearance',
    heading: 'Components',
    tab: 'Appearance',
  },
  {
    name: 'AI components',
    url: '/components/ai',
    heading: 'Components',
    tab: 'AI Elements',
  },
  { name: 'session', url: '/session', heading: 'Session' },
  { name: 'first project', projectIndex: 0, heading: 'Project details' },
  { name: 'second project', projectIndex: 1, heading: 'Project details' },
  { name: 'missing project', projectIndex: 0, heading: 'Project details' },
] as const

async function tableGeometry(table: Locator) {
  return table.evaluate((element) => {
    const bounds = (node: Element) => {
      const { x, y, width, height } = node.getBoundingClientRect()
      return { x, y, width, height }
    }
    return {
      table: bounds(element),
      columns: Array.from(element.querySelectorAll('thead th'), bounds),
      rows: Array.from(element.querySelectorAll('tbody tr'), bounds),
    }
  })
}

async function fieldGeometry(page: Page) {
  const fields = page.locator(
    [
      'section[aria-label="Project overview"] [data-slot="metric-value"]',
      'section[aria-label="Project overview"] [data-slot="badge"]',
      'section[aria-label="Project overview"] [data-slot="badge"] > div',
      '[role="group"][aria-label="Account status"] > *',
      'table[aria-label="Project permissions"] tbody td:last-child > div > *',
      'table[aria-label="Projects"] tbody td:nth-child(2) [data-slot="badge"]',
      'table[aria-label="Projects"] tbody td:nth-child(2) [data-slot="skeleton"]',
      'table[aria-label="Recent projects"] tbody td:nth-child(2) [data-slot="badge"]',
      'table[aria-label="Recent projects"] tbody td:nth-child(2) [data-slot="skeleton"]',
      'main dl > div > dd',
      'form#project-form [data-slot="field"]',
      'form#project-form [data-slot="form-actions"]',
      'form#project-form input',
      'form#project-form textarea',
      'form#project-form [role="combobox"]',
      'form#project-form button',
      'main [data-slot="card"]:has(#example-message)',
      'main [data-slot="card"]:has(#example-message) [data-slot="card-header"]',
      'main [data-slot="card"]:has(#example-message) [data-slot="card-footer"]',
      'main [data-slot="card"]:has(#example-message) [data-slot="card-footer"] > div:first-child > button',
      'main [data-slot="input-group"]:has(#example-message)',
      '#example-message',
      '#example-message-description',
      'main button[aria-label="Reset conversation"]',
      'main button[aria-label="Send message"]',
      'main [data-slot="card"][data-variant="ghost"] [data-slot="item-actions"]',
      'main [data-slot="card"][data-variant="ghost"] [data-slot="item-actions"] > button',
    ].join(', '),
  )
  return elementGeometry(fields)
}

async function elementGeometry(elements: Locator) {
  return elements.evaluateAll((elements) =>
    elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }),
  )
}

function expectFieldGeometry(
  actual: Awaited<ReturnType<typeof fieldGeometry>>,
  expected: Awaited<ReturnType<typeof fieldGeometry>>,
) {
  expect(actual).toHaveLength(expected.length)
  for (const [index, rect] of actual.entries()) {
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(rect[key], `Loading field ${index}.${key}`).toBeCloseTo(
        expected[index]![key],
        0,
      )
    }
  }
}

async function expectSessionLayout(page: Page) {
  const initialViewport = page.viewportSize()!
  const account = page.getByRole('group', { name: 'Account', exact: true })
  const permissions = page.locator('[data-slot="card"]').filter({
    has: page.getByRole('heading', { name: 'Permissions', exact: true }),
  })
  const workspace = page.locator('[data-slot="card"]').filter({
    has: page.getByRole('heading', { name: 'Workspace', exact: true }),
  })

  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(async () => {
      const accountBounds = (await account.boundingBox())!
      const permissionsBounds = (await permissions.boundingBox())!
      const workspaceBounds = (await workspace.boundingBox())!
      if (width >= 1024) {
        expect(accountBounds.y).toBeCloseTo(permissionsBounds.y, 0)
        expect(accountBounds.y + accountBounds.height).toBeCloseTo(
          permissionsBounds.y + permissionsBounds.height,
          0,
        )
        expect(workspaceBounds.x).toBeCloseTo(permissionsBounds.x, 0)
        expect(workspaceBounds.width).toBeCloseTo(permissionsBounds.width, 0)
        expect(workspaceBounds.y).toBeCloseTo(
          permissionsBounds.y + permissionsBounds.height + 32,
          0,
        )
      } else {
        const cards = [accountBounds, permissionsBounds, workspaceBounds]
        for (const [index, card] of cards.entries()) {
          expect(card.x).toBeCloseTo(accountBounds.x, 0)
          expect(card.width).toBeCloseTo(accountBounds.width, 0)
          if (index > 0) {
            const previous = cards[index - 1]!
            expect(card.y).toBeGreaterThan(previous.y + previous.height)
          }
        }
      }
    }).toPass()
  }
  await page.setViewportSize(initialViewport)
}

function expectTableGeometry(
  actual: Awaited<ReturnType<typeof tableGeometry>>,
  expected: Awaited<ReturnType<typeof tableGeometry>>,
) {
  expect(actual.columns).toHaveLength(expected.columns.length)
  expect(actual.rows).toHaveLength(expected.rows.length)
  for (const [index, rect] of [
    actual.table,
    ...actual.columns,
    ...actual.rows,
  ].entries()) {
    const before = [expected.table, ...expected.columns, ...expected.rows][
      index
    ]!
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(rect[key], `Table geometry ${index}.${key}`).toBeCloseTo(
        before[key],
        0,
      )
    }
  }
}

for (const shell of shells) {
  test(`${shell.name} hydrates its layout from private bootstrap data`, async ({
    page,
    context,
    request,
  }) => {
    const workspace = await openWorkspace(context.request)
    if (shell.name === 'overview') {
      const response = await context.request.post('/graphql', {
        data: {
          query:
            '{ projects(first: 50) { edges { node { id name description } } } }',
        },
      })
      await expect(response).toBeOK()
      const projects = await response.json()
      expect(projects.errors).toBeUndefined()
      for (const { node } of projects.data.projects.edges) {
        const updated = await context.request.post('/graphql', {
          data: {
            query:
              'mutation AllActive($input: UpdateProjectInput!) { updateProject(input: $input) { project { id } } }',
            variables: { input: { ...node, status: 'ACTIVE' } },
          },
        })
        await expect(updated).toBeOK()
        expect((await updated.json()).errors).toBeUndefined()
      }
    }
    const project =
      'projectIndex' in shell
        ? workspace.projects.edges[shell.projectIndex]!.node
        : undefined
    const url =
      'url' in shell
        ? shell.url
        : `/projects/${project!.slug}${'edit' in shell ? '/edit' : ''}`
    const projectQuery =
      'edit' in shell ? ProjectEditPageQuery : ProjectDetailPageQuery
    if (shell.name === 'missing project') {
      const removed = await context.request.post('/graphql', {
        data: {
          query:
            'mutation RemoveFixtureProject($id: ID!) { deleteProject(input: {id: $id}) { deletedProjectId } }',
          variables: { id: project!.id },
        },
      })
      await expect(removed).toBeOK()
      expect(await removed.json()).toEqual({
        data: { deleteProject: { deletedProjectId: project!.id } },
      })
    }
    const response = await context.request.get(url)
    await expect(response).toBeOK()
    expectPrivateHTML(response)
    const html = await response.text()
    expect(html).toMatch(new RegExp(`<h1\\b[^>]*>${shell.heading}</h1>`))
    expect(html).not.toContain('__route_shell__')
    const bootstrap = readBootstrap(html)
    const expected = [{ id: WorkspaceQuery.params.id, variables: {} }]
    if (project)
      expected.push({
        id: projectQuery.params.id,
        variables: { slug: project.slug },
      })
    else if (shell.name === 'overview')
      expected.push({ id: OverviewPageQuery.params.id, variables: {} })
    else if (shell.name === 'session')
      expected.push({ id: SessionPageQuery.params.id, variables: {} })
    else if (shell.name === 'projects')
      expected.push({
        id: ProjectsPageQuery.params.id,
        variables: {
          search: null,
          status: null,
          first: 6,
          after: null,
          anchor: null,
        },
      })
    expect(
      bootstrap.entries.map(({ id, variables }) => ({ id, variables })),
    ).toEqual(expected)
    const metadata = readPreloads(html)
    if (shell.name === 'overview') expect(metadata.preloadTimeoutMs).toBe(1000)
    expect(metadata.preloads.map(({ id }) => id)).toEqual(
      expected.map(({ id }) => id),
    )
    expect(
      metadata.preloads.map(({ variables }) =>
        resolveVariables(
          variables,
          project ? { projectSlug: project.slug } : {},
          new URL(url, 'http://acme.test').searchParams,
        ),
      ),
    ).toEqual(expected.map(({ variables }) => variables))
    expect(metadata.preloads[0]).toEqual({
      id: WorkspaceQuery.params.id,
      variables: {},
    })
    if (project)
      expect(metadata.preloads[1]).toEqual({
        id: projectQuery.params.id,
        authenticated: true,
        variables: { slug: { source: 'path', name: 'projectSlug' } },
      })
    expect(bootstrap.entries[0]!.response.data.viewer).toMatchObject({
      name: workspace.viewer.name,
    })
    if (shell.name === 'session') {
      expect(metadata.preloads[1]).toEqual({
        id: SessionPageQuery.params.id,
        authenticated: true,
        variables: {},
      })
      expect(bootstrap.entries[1]!.response.data).toMatchObject({
        viewer: { name: workspace.viewer.name },
        serverInfo: { name: 'Acme', storage: 'memory' },
      })
    }
    if (project) {
      expect(bootstrap.entries[1]!.response.data.project).toEqual(
        shell.name === 'missing project'
          ? null
          : expect.objectContaining({
              id: project.id,
              slug: project.slug,
              name: project.name,
            }),
      )
    }
    expect(bootstrap.layout).not.toContain(workspace.viewer.name)
    for (const { node } of workspace.projects.edges)
      expect(bootstrap.layout).not.toContain(node.id)
    const publicResponse = await request.get(url)
    await expect(publicResponse).toBeOK()
    expectPrivateHTML(publicResponse)
    const anonymous = readBootstrap(await publicResponse.text())
    expect(readPreloads(anonymous.layout)).toEqual({ version: 1, preloads: [] })
    expect(anonymous.layout).toContain('Welcome to Acme')
    expect(anonymous.layout).not.toContain('data-slot="sidebar-content"')
    expect(anonymous.layout).not.toContain('data-slot="skeleton"')
    expect(anonymous.layout).not.toMatch(/<table\b/)
    expect(anonymous.entries).toHaveLength(1)
    expect(anonymous.entries[0]).toMatchObject({
      id: WorkspaceQuery.params.id,
      variables: {},
      response: { data: { viewer: null } },
    })

    const requests = collectGraphQLRequests(page)
    await page.addInitScript(trackMainContentContinuity)
    let releaseScripts!: () => void
    const scriptsReleased = new Promise<void>((resolve) => {
      releaseScripts = resolve
    })
    let blockedScripts = 0
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() === 'script') {
        blockedScripts++
        await scriptsReleased
      }
      await route.continue()
    })
    let originalHTML: JSHandle<HTMLElement> | undefined
    const table = page.getByRole('main').getByRole('table')
    const footer = page.locator('[data-slot="sidebar-footer"]')
    const selectedNavigation = page.locator(
      '[data-sidebar="menu-button"][data-active]',
    )
    const navigationTitle = [
      'Project details',
      'New project',
      'Edit project',
    ].includes(shell.heading)
      ? 'Projects'
      : shell.heading
    let loadingTable: Awaited<ReturnType<typeof tableGeometry>> | undefined
    let loadingFields: Awaited<ReturnType<typeof fieldGeometry>> | undefined
    let loadingFooter: Awaited<ReturnType<typeof elementGeometry>> | undefined
    try {
      await page.goto(url, { waitUntil: 'commit' })
      await expect(
        page.getByRole('heading', { name: shell.heading, exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('main').locator(':scope > header'),
      ).toBeHidden()
      await expect(footer).toBeVisible()
      await expect(footer).toHaveCSS('display', 'flex')
      await expect(selectedNavigation).toHaveText(navigationTitle)
      loadingFooter = await elementGeometry(
        footer.or(footer.locator(':scope > div:last-child > *')),
      )
      if ('projectIndex' in shell && !('edit' in shell)) {
        await expect(
          page.getByRole('link', { name: /^Back to project/ }),
        ).toBeVisible()
      }
      await expect.poll(() => blockedScripts).toBeGreaterThan(0)
      if (shell.name === 'new project' || shell.name === 'edit project') {
        const form = page.getByRole('form', {
          name: shell.heading,
          exact: true,
        })
        await expect(form).toBeVisible()
        await expect(form).toHaveAttribute('aria-busy', 'true')
        for (const control of await form
          .locator('input, textarea, button')
          .all())
          await expect(control).toBeDisabled()
      }
      if ('tab' in shell) {
        await expect(
          page.getByRole('tab', { name: shell.tab, exact: true }),
        ).toHaveAttribute('aria-selected', 'true')
        await expect(
          page.getByRole('checkbox', { name: 'Write a brief', exact: true }),
        ).toHaveCount(0)
        if (shell.tab === 'Appearance')
          await expect(
            page.getByRole('radiogroup', { name: 'Theme', exact: true }),
          ).toBeVisible()
        else
          await expect(page.getByRole('status')).toHaveText(
            'Loading AI examples',
          )
      }
      if (['overview', 'projects', 'session'].includes(shell.name)) {
        loadingTable = await tableGeometry(table)
      }
      if (shell.name === 'session') {
        await expectSessionLayout(page)
      }
      if (shell.name !== 'missing project') {
        loadingFields = await fieldGeometry(page)
      }
      originalHTML = await page.evaluateHandle(() => document.documentElement)
      expect(
        await originalHTML.evaluate((element) => ({
          same: element === document.documentElement,
          connected: element.isConnected,
        })),
      ).toEqual({ same: true, connected: true })
      expect(
        await page.evaluate(() =>
          Reflect.get(window, '__acmeMainContentContinuity'),
        ),
      ).toEqual({ seen: true, missing: false })
    } finally {
      releaseScripts()
    }
    await expect(
      page.getByRole('button', {
        name: `${workspace.viewer.name} account menu`,
      }),
    ).toBeVisible()
    if (shell.name === 'missing project') {
      await expect(
        page.getByRole('heading', { name: 'Project not found', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Back to projects', exact: true }),
      ).toBeVisible()
    } else if (shell.name === 'edit project' || shell.name === 'new project') {
      const form = page.getByRole('form', { name: shell.heading, exact: true })
      await expect(
        form.getByRole('button', {
          name:
            shell.name === 'edit project' ? 'Save changes' : 'Create project',
          exact: true,
        }),
      ).toBeEnabled()
      await expect(
        form.getByLabel('Project name', { exact: true }),
      ).toHaveValue(project?.name ?? '')
    } else if (project) {
      await expect(page.getByText(project.name, { exact: true })).toBeVisible()
    } else if (shell.name === 'overview' || shell.name === 'projects') {
      await expect(
        page.getByRole('link', {
          name: workspace.projects.edges[0]!.node.name,
          exact: true,
        }),
      ).toBeVisible()
    } else if (shell.name === 'session') {
      await expect(
        page.getByRole('button', { name: 'Sign out', exact: true }),
      ).toBeEnabled()
    } else {
      await expect(
        page.getByRole('tab', {
          name: 'tab' in shell ? shell.tab : 'Controls',
          exact: true,
        }),
      ).toHaveAttribute('aria-selected', 'true')
      if ('tab' in shell && shell.tab === 'AI Elements')
        await expect(
          page.getByRole('textbox', { name: 'Message', exact: true }),
        ).toBeVisible()
      if ('tab' in shell && shell.tab === 'Appearance')
        await expect(
          page.getByRole('radio', { name: 'Light', exact: true }),
        ).toHaveCSS('transition-duration', '0.12s')
    }
    await expect(page.getByRole('main').locator(':scope > header')).toBeHidden()
    await expect(selectedNavigation).toHaveText(navigationTitle)
    if (loadingFooter) {
      expectFieldGeometry(
        await elementGeometry(
          footer.or(footer.locator(':scope > div:last-child > *')),
        ),
        loadingFooter,
      )
    }
    if (
      'projectIndex' in shell &&
      !('edit' in shell) &&
      shell.name !== 'missing project'
    ) {
      await expect(
        page.getByRole('link', { name: /^Back to project/ }),
      ).toBeVisible()
    }
    if (loadingTable) {
      expectTableGeometry(await tableGeometry(table), loadingTable)
    }
    if (loadingFields) {
      expectFieldGeometry(await fieldGeometry(page), loadingFields)
    }
    if (shell.name === 'session') {
      await expectSessionLayout(page)
    }
    if (shell.name === 'overview') {
      const summary = page.getByRole('region', {
        name: 'Project overview',
        exact: true,
      })
      const percentage = summary.getByText('100%', { exact: true })
      await expect(percentage).toBeVisible()
      expect(
        await percentage.evaluate((element) => {
          const slot = element.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(element)
          const text = range.getBoundingClientRect()
          return text.left >= slot.left && text.right <= slot.right
        }),
        'The full percentage must fit without overlapping its icon',
      ).toBe(true)

      const initialViewport = page.viewportSize()!
      const metricCells = summary.locator(':scope > [data-slot="card"]')
      await expect(metricCells).toHaveCount(4)
      for (const width of [390, 1280, 1440]) {
        await page.setViewportSize({ width, height: 844 })
        await expect(table.getByRole('columnheader')).toHaveText([
          'Project',
          'Status',
          'Updated',
        ])
        for (const header of await table.getByRole('columnheader').all()) {
          await expect(header).toBeInViewport()
        }
        await expect(async () => {
          const projects = (await table.boundingBox())!
          const metrics = (await summary.boundingBox())!
          const cells = await elementGeometry(metricCells)
          const values = await elementGeometry(
            summary.locator('[data-slot="metric-value"]'),
          )
          expect(values).toHaveLength(cells.length)
          const columns = width === 390 ? 2 : 4
          const gap = width === 390 ? 16 : 24
          const standardWidth = cells[columns === 4 ? 1 : 0]!.width
          for (const [index, cell] of cells.entries()) {
            const rowIndex = index - (index % columns)
            const rowStart = cells[rowIndex]!
            expect(values[index]!.y).toBeCloseTo(values[rowIndex]!.y, 0)
            const widthRatio = columns === 4 && index === 0 ? 1.2 : 1
            expect(cell.width).toBeCloseTo(standardWidth * widthRatio, 0)
            expect(cell.y).toBeCloseTo(rowStart.y, 0)
            expect(cell.height).toBeCloseTo(rowStart.height, 0)
            if (index % columns === 0) {
              expect(cell.x).toBeCloseTo(cells[0]!.x, 0)
            } else {
              const previous = cells[index - 1]!
              expect(cell.x).toBeCloseTo(previous.x + previous.width + gap, 0)
            }
            if (index >= columns) {
              const above = cells[index - columns]!
              expect(cell.y).toBeCloseTo(above.y + above.height + gap, 0)
            }
          }
          expect(
            metrics.y + metrics.height,
            'Overview keeps its compact summary above the project table',
          ).toBeLessThanOrEqual(projects.y)
        }).toPass()
      }
      await page.setViewportSize(initialViewport)
    }
    expect(
      await page.evaluate(() =>
        Reflect.get(window, '__acmeMainContentContinuity'),
      ),
      'The main landmark must remain present throughout hydration',
    ).toEqual({ seen: true, missing: false })
    expect(
      await originalHTML!.evaluate((element) => ({
        same: element === document.documentElement,
        connected: element.isConnected,
      })),
      'Hydration must preserve the original document element',
    ).toEqual({ same: true, connected: true })
    await originalHTML!.dispose()
    await expect(page.locator('body')).not.toContainText('__route_shell__')
    expect(
      requests,
      'Preloaded operations should not make browser GraphQL requests',
    ).toHaveLength(0)
    if (shell.name === 'overview') {
      const countCases = [
        {
          stats: {
            total: 2147483647,
            active: 99999999,
            planned: 9999,
            archived: 2047473649,
          },
          labels: ['2.1B', '100M', '10K', '2B'],
        },
        {
          stats: { total: 99999, active: 9999, planned: 1000, archived: 89000 },
          labels: ['100K', '10K', '1K', '89K'],
        },
      ]
      let currentStats = countCases[0]!.stats
      const serveCounts = async (route: Route) => {
        const response = await route.fetch()
        const html = await response.text()
        const { entries } = readBootstrap(html)
        entries.find(
          (entry) => entry.id === OverviewPageQuery.params.id,
        )!.response.data.projectStats = currentStats
        const serialized = JSON.stringify(entries).replaceAll('<', '\\u003c')
        const body = html.replace(
          /(<script\b[^>]*\bid=["']route-bootstrap["'][^>]*>)[\s\S]*?(<\/script>)/,
          (_script, opening, closing) => `${opening}${serialized}${closing}`,
        )
        await route.fulfill({ response, body })
      }
      await page.route('**/', serveCounts)
      try {
        for (const countCase of countCases) {
          currentStats = countCase.stats
          for (const width of [320, 1280, 1440]) {
            await page.setViewportSize({ width, height: 844 })
            await page.goto('/')
            const values = page
              .getByRole('region', { name: 'Project overview', exact: true })
              .locator('[data-slot="metric-value"]')
            for (const [index, count] of Object.values(currentStats).entries())
              await expect(values.nth(index)).toHaveAttribute(
                'title',
                String(count),
              )
            await expect(values).toHaveText(countCase.labels)
            const bounds = await values.evaluateAll((elements) =>
              elements.map((element) => {
                const slot = element.getBoundingClientRect()
                const range = document.createRange()
                range.selectNodeContents(element)
                const text = range.getBoundingClientRect()
                return {
                  label: element.textContent,
                  left: text.left - slot.left,
                  right: slot.right - text.right,
                }
              }),
            )
            for (const value of bounds) {
              expect(
                value.left,
                `${value.label} stays within its number slot`,
              ).toBeGreaterThanOrEqual(-0.5)
              expect(
                value.right,
                `${value.label} stays within its number slot`,
              ).toBeGreaterThanOrEqual(-0.5)
            }
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth),
            ).toBe(width)
          }
        }
      } finally {
        await page.unroute('**/', serveCounts)
      }
      expect(
        requests,
        'Metric bootstrap fixtures should hydrate without browser GraphQL requests',
      ).toHaveLength(0)
    }
  })
}

test('a malformed Workspace bootstrap retries only that persisted query', async ({
  page,
  context,
}) => {
  const workspace = await openWorkspace(context.request)
  const requests = collectGraphQLRequests(page)
  await page.route('**/', async (route) => {
    const response = await route.fetch()
    const html = await response.text()
    const { entries } = readBootstrap(html)
    expect(entries.map((entry) => entry.id)).toEqual([
      WorkspaceQuery.params.id,
      OverviewPageQuery.params.id,
    ])
    const payload = entries.map((entry) =>
      entry.id === WorkspaceQuery.params.id
        ? { ...entry, response: null }
        : entry,
    )
    const body = html.replace(
      /(<script\b[^>]*\bid=["']route-bootstrap["'][^>]*>)[\s\S]*?(<\/script>)/,
      (_script, opening, closing) =>
        `${opening}${JSON.stringify(payload).replaceAll('<', '\\u003c')}${closing}`,
    )
    await route.fulfill({ response, body })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByRole('table')).toContainText(
    workspace.projects.edges[0]!.node.name,
  )
  expect(requests.map((request) => request.postDataJSON())).toEqual([
    { id: WorkspaceQuery.params.id, variables: {} },
  ])
})

test('mobile table placeholders retain their layout when data arrives', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  for (const role of ['MAINTAINER', 'MEMBER']) {
    await openWorkspace(context.request, role)
    for (const url of ['/', '/projects', '/session']) {
      let release!: () => void
      const scriptsReleased = new Promise<void>((resolve) => {
        release = resolve
      })
      const holdScripts = async (route: Route) => {
        if (route.request().resourceType() === 'script') await scriptsReleased
        await route.continue()
      }
      await page.route('**/*', holdScripts)
      const table = page.getByRole('main').getByRole('table')
      let loading!: Awaited<ReturnType<typeof tableGeometry>>
      let loadingFields!: Awaited<ReturnType<typeof fieldGeometry>>
      let loadingTitlebar!: Awaited<ReturnType<typeof elementGeometry>>
      const titlebar = page.getByRole('main').locator(':scope > header')
      const titlebarParts = titlebar.or(
        titlebar.getByRole('button', { name: 'Open navigation', exact: true }),
      )
      let signOutTop: number | undefined
      try {
        await page.goto(url, { waitUntil: 'commit' })
        await expect(table).toHaveCSS('font-size', '14px')
        await page.evaluate(() => document.fonts.ready)
        await expect(titlebar).toBeVisible()
        await expect(titlebar).toHaveCSS('position', 'sticky')
        loadingTitlebar = await elementGeometry(titlebarParts)
        if (url !== '/session') {
          await expect(table.getByRole('columnheader')).toHaveText([
            'Project',
            'Status',
            'Updated',
          ])
        }
        loading = await tableGeometry(table)
        loadingFields = await fieldGeometry(page)
        if (url === '/session') {
          signOutTop = (await page
            .getByRole('button', { name: 'Sign out', exact: true })
            .boundingBox())!.y
        }
      } finally {
        release()
      }
      await expect(table.locator('[data-slot="skeleton"]')).toHaveCount(0)
      expectTableGeometry(await tableGeometry(table), loading)
      expectFieldGeometry(await fieldGeometry(page), loadingFields)
      expectFieldGeometry(await elementGeometry(titlebarParts), loadingTitlebar)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        'Mobile tables must not widen the page',
      ).toBe(320)
      const scrolls = await table.evaluate((element) => {
        const container = element.parentElement!
        return container.scrollWidth > container.clientWidth
      })
      if (url === '/session') {
        expect(scrolls, 'Permission labels must fit without panning').toBe(
          false,
        )
      } else {
        await expect(table.getByRole('columnheader')).toHaveText([
          'Project',
          'Status',
          'Updated',
        ])
        expect(scrolls, 'All project columns scroll within the table').toBe(
          true,
        )
        await expect(table.locator('..')).toHaveCSS('overflow-x', 'auto')
      }
      if (signOutTop !== undefined) {
        expect(
          (await page
            .getByRole('button', { name: 'Sign out', exact: true })
            .boundingBox())!.y,
        ).toBeCloseTo(signOutTop, 0)
      }
      await page.unroute('**/*', holdScripts)
    }
  }
})

test('project rows retain padded rounded highlights and visible keyboard focus', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme })
    for (const width of [320, 390, 640, 1440]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/projects')
      const table = page.getByRole('table', { name: 'Projects', exact: true })
      const headers = table.getByRole('columnheader')
      const row = table.locator('tbody tr').first()
      const cells = row.getByRole('cell')
      const link = row.getByRole('link')
      await expect(link).toBeVisible()
      await expect(page.locator('html')).toHaveClass(
        new RegExp(`\\b${colorScheme}\\b`),
      )
      await expect(headers).toHaveText(['Project', 'Status', 'Updated'])
      await expect(cells).toHaveCount(3)
      const padding = width < 640 ? '8px' : '12px'
      await expect(headers.first()).toHaveCSS('padding-left', padding)
      await expect(headers.last()).toHaveCSS('padding-right', padding)
      await expect(cells.first()).toHaveCSS('padding-left', padding)
      await expect(cells.last()).toHaveCSS('padding-right', padding)
      const painters = await cells.evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element, '::before')
          return {
            top: style.top,
            bottom: style.bottom,
            left: style.left,
            right: style.right,
            topLeft: style.borderTopLeftRadius,
            bottomLeft: style.borderBottomLeftRadius,
            topRight: style.borderTopRightRadius,
            bottomRight: style.borderBottomRightRadius,
          }
        }),
      )
      for (const painter of painters)
        expect(painter).toMatchObject({
          top: '2px',
          bottom: '2px',
          left: '0px',
          right: '0px',
        })
      expect(painters[0]).toMatchObject({ topLeft: '8px', bottomLeft: '8px' })
      expect(painters[1]).toMatchObject({
        topLeft: '0px',
        bottomLeft: '0px',
        topRight: '0px',
        bottomRight: '0px',
      })
      expect(painters[2]).toMatchObject({ topRight: '8px', bottomRight: '8px' })
      const heading = (await page
        .getByRole('heading', { name: 'Projects', exact: true })
        .boundingBox())!
      const header = (await headers.first().boundingBox())!
      const name = (await link.boundingBox())!
      expect(header.x + Number.parseFloat(padding)).toBeCloseTo(heading.x, 0)
      expect(name.x).toBeCloseTo(heading.x, 0)
      const container = table.locator('..')
      const scrolls = await container.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      )
      expect(scrolls).toBe(width === 320)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width)
      const accent = await page.locator('body').evaluate((element) => {
        const probe = document.createElement('div')
        probe.style.backgroundColor = 'var(--accent)'
        element.append(probe)
        const color = getComputedStyle(probe).backgroundColor
        probe.remove()
        return color
      })
      await row.hover()
      for (const cell of await cells.all()) {
        await expect(cell).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        await expect
          .poll(() =>
            cell.evaluate(
              (element) =>
                getComputedStyle(element, '::before').backgroundColor,
            ),
          )
          .toBe(accent)
      }
      if (colorScheme === 'light' && width === 1440) {
        const painted = PNG.sync.read(await row.screenshot())
        const pixel = (x: number, y: number) => {
          const offset = (y * painted.width + x) * 4
          return Array.from(painted.data.subarray(offset, offset + 4))
        }
        const canvas = pixel(24, 1)
        expect(
          pixel(24, 4),
          'The row fill starts below the top gap',
        ).not.toEqual(canvas)
        expect(pixel(1, 4), 'The outer corner remains rounded').toEqual(canvas)
        expect(
          pixel(24, painted.height - 2),
          'The bottom gap separates the fill from the divider',
        ).toEqual(canvas)
      }
      await page.mouse.move(0, 0)
      await expect
        .poll(() =>
          cells
            .first()
            .evaluate(
              (element) =>
                getComputedStyle(element, '::before').backgroundColor,
            ),
        )
        .toBe('rgba(0, 0, 0, 0)')
      await link.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(link).toBeFocused()
      await expect(link).toHaveCSS('box-shadow', /0px 0px 0px 3px/)
      for (const cell of await cells.all())
        await expect
          .poll(() =>
            cell.evaluate(
              (element) =>
                getComputedStyle(element, '::before').backgroundColor,
            ),
          )
          .toBe(accent)
      const focused = (await link.boundingBox())!
      const viewport = (await container.boundingBox())!
      expect(focused.x - 3).toBeGreaterThanOrEqual(viewport.x)
      expect(focused.x + focused.width + 3).toBeLessThanOrEqual(
        viewport.x + viewport.width,
      )
    }
  }
})

test('long project names retain readable detail headings on phones', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  const name = 'W'.repeat(80)
  const response = await context.request.post('/graphql', {
    data: {
      query:
        'mutation LongProjectName($input: CreateProjectInput!) { createProject(input: $input) { project { slug name } } }',
      variables: { input: { name, description: '', status: 'PLANNED' } },
    },
  })
  await expect(response).toBeOK()
  const result = await response.json()
  expect(result.errors).toBeUndefined()
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(`/projects/${result.data.createProject.project.slug}`)
    const heading = page.getByRole('heading', { name, exact: true })
    await expect(heading).toBeVisible()
    const back = page.getByRole('link', {
      name: 'Back to projects',
      exact: true,
    })
    await expect(back).toBeVisible()
    await expect(back).toHaveAttribute('href', '/projects')
    await expect(back).toHaveCSS('padding-left', '12px')
    await expect(back).toHaveCSS('padding-right', '16px')
    await expect(back).toHaveCSS('gap', '8px')
    const edit = page.getByRole('link', { name: 'Edit project', exact: true })
    await expect(edit).toBeEnabled()
    const card = page.getByRole('main').locator('[data-slot="card"]')
    await expect(card).toHaveCount(1)
    const cardBounds = (await card.boundingBox())!
    const contentBounds = await page
      .getByRole('main')
      .locator(':scope > div > div')
      .evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const styles = getComputedStyle(element)
        const paddingLeft = parseFloat(styles.paddingLeft)
        const paddingRight = parseFloat(styles.paddingRight)
        return {
          x: bounds.x + paddingLeft,
          width: bounds.width - paddingLeft - paddingRight,
        }
      })
    expect(cardBounds.x).toBeCloseTo(contentBounds.x, 0)
    expect(cardBounds.width).toBeCloseTo(contentBounds.width, 0)
    const metadata = card.locator('dl')
    await expect(metadata).toBeVisible()
    expect(
      await metadata.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return Array.from(element.querySelectorAll('dt, dd')).every((value) => {
          const range = document.createRange()
          range.selectNodeContents(value)
          const text = range.getBoundingClientRect()
          return text.left >= bounds.left && text.right <= bounds.right
        })
      }),
      'Project metadata fits within the record at every viewport width',
    ).toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    if (width < 640) {
      const title = (await heading.boundingBox())!
      const header = (await heading
        .locator('xpath=ancestor::header[1]')
        .boundingBox())!
      expect(title.width).toBeCloseTo(header.width, 0)
      expect((await edit.boundingBox())!.y).toBeGreaterThanOrEqual(
        title.y + title.height,
      )
    }
  }
})

test('mobile controls, forms, and dialogs fit narrow and short viewports', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await openWorkspace(context.request)
  await page.goto('/projects')
  const search = page.getByRole('textbox', {
    name: 'Search projects',
    exact: true,
  })
  await expect(search).toBeEnabled()
  await expect(search).toHaveCSS('font-size', '16px')
  const status = page.getByRole('combobox', {
    name: 'Filter by project status',
    exact: true,
  })
  const newProject = page.getByRole('link', {
    name: 'New project',
    exact: true,
  })
  const more = page.getByRole('button', { name: 'Load more', exact: true })
  for (const control of [search, status, newProject, more]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await expect(more).toHaveCSS('height', '44px')
  await expect(more).toHaveCSS('width', '112px')
  await expect(more).toHaveCSS('font-size', '14px')
  await expect(more).toHaveCSS('font-weight', '500')
  await expect(more).toHaveCSS('line-height', '20px')
  const projects = page.getByRole('table', { name: 'Projects', exact: true })
  await expect(projects.getByRole('columnheader')).toHaveText([
    'Project',
    'Status',
    'Updated',
  ])
  await projects.evaluate((element) => {
    const container = element.parentElement!
    container.scrollLeft = container.scrollWidth
  })
  await expect(
    projects.getByRole('columnheader', { name: 'Updated', exact: true }),
  ).toBeInViewport()
  await expect(
    projects.locator('tbody tr').first().locator('time'),
  ).toBeInViewport()
  expect(await page.evaluate(() => window.scrollX)).toBe(0)
  await projects.evaluate((element) => {
    element.parentElement!.scrollLeft = 0
  })
  const headers = projects.getByRole('columnheader')
  const originalColumns = await elementGeometry(headers)
  await search.fill('No matching mobile project')
  await expect(
    projects.getByRole('cell', { name: 'No matching projects.', exact: true }),
  ).toBeVisible()
  await expect(projects.locator('tbody td')).toHaveCount(1)
  await expect(projects.locator('tbody td')).toHaveAttribute('colspan', '3')
  expect(await elementGeometry(headers)).toEqual(originalColumns)
  await search.fill('')
  await expect(projects.getByRole('link')).toHaveCount(6)
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      await projects.evaluate((element) => {
        const container = element.parentElement!
        return container.scrollWidth <= container.clientWidth
      }),
      'All three columns should fit a normal phone width without panning',
    ).toBe(true)
    for (const header of await projects.getByRole('columnheader').all()) {
      await expect(header).toBeInViewport()
    }
    await expect(
      projects.locator('tbody tr').first().locator('time'),
    ).toBeInViewport()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
  }
  await page.setViewportSize({ width: 320, height: 568 })

  await newProject.click()
  const form = page.getByRole('form', {
    name: 'New project',
    exact: true,
  })
  const name = form.getByRole('textbox', {
    name: 'Project name',
    exact: true,
  })
  await expect(name).not.toBeFocused()
  await name.fill('A'.repeat(81))
  await form
    .getByRole('button', { name: 'Create project', exact: true })
    .click()
  await expect(
    form.getByText('Keep the name to 80 characters.', { exact: true }),
  ).toBeVisible()
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width)
    await form
      .getByRole('button', { name: 'Cancel', exact: true })
      .scrollIntoViewIfNeeded()
    await expect(
      form.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeInViewport()
    await name.scrollIntoViewIfNeeded()
    await expect(name).toBeInViewport()
  }
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(form).toBeHidden()

  for (const width of [320, 390, 700]) {
    await page.setViewportSize({ width, height: 568 })
    const titlebar = page.getByRole('main').locator(':scope > header')
    await expect(titlebar).toHaveCSS('position', 'sticky')
    await expect(titlebar).toHaveCSS('height', '56px')
    const open = page.getByRole('button', {
      name: 'Open navigation',
      exact: true,
    })
    await open.click()
    const navigation = page.getByRole('dialog', {
      name: 'Sidebar',
      exact: true,
    })
    await expect(navigation).toBeVisible()
    await expect
      .poll(async () => (await navigation.boundingBox())?.x)
      .toBeCloseTo(0, 0)
    const bounds = (await navigation.boundingBox())!
    expect(bounds.width).toBeCloseTo(width, 0)
    expect(bounds.height).toBeCloseTo(568, 0)
    expect(bounds.y).toBeCloseTo(0, 0)
    await navigation
      .getByRole('button', { name: 'Close navigation', exact: true })
      .click()
    await expect(navigation).toBeHidden()
    await expect(open).toBeFocused()
  }
  await page.goto('/components')
  const controls = page.getByRole('tab', { name: 'Controls', exact: true })
  await expect(controls).toBeVisible()
  for (const tab of await page.getByRole('tab').all()) {
    expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click()
  await expect(page).toHaveURL('/components/appearance')
  await page.goBack()
  await expect(controls).toHaveAttribute('aria-selected', 'true')
})

async function expectSignInCanvas(page: Page) {
  const main = page.getByRole('main')
  await expect(main).toHaveCSS('display', 'flex')
  const background = await main.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  )
  expect(background).not.toBe('rgba(0, 0, 0, 0)')
  await expect(page.locator('html')).toHaveCSS('background-color', background)
  await expect(page.locator('body')).toHaveCSS('background-color', background)
  await page.evaluate(() => document.fonts.ready)
  const button = main.getByRole('button', { name: 'Continue', exact: true })
  const stack = button.locator('..')
  const logo = main.getByRole('link', { name: 'Acme home', exact: true })
  const heading = main.getByRole('heading', {
    name: 'Welcome to Acme',
    exact: true,
  })
  const copy = main.getByText(
    'Manage projects and keep your workspace organized.',
    { exact: true },
  )
  await expect(heading).toHaveCSS('text-align', 'center')
  await expect(copy).toHaveCSS('text-align', 'center')
  const desktop = page.viewportSize()!.width >= 768
  await expect(heading).toHaveCSS('font-family', /^Archivo,/)
  await expect(heading).toHaveCSS('font-weight', '500')
  await expect(heading).toHaveCSS('font-size', desktop ? '44px' : '32px')
  await expect(heading).toHaveCSS('line-height', desktop ? '52px' : '40px')
  await expect(button).toHaveCSS('height', desktop ? '40px' : '44px')
  const parts = await elementGeometry(
    stack.or(logo).or(heading).or(copy).or(button),
  )
  expect(parts).toHaveLength(5)
  const bounds = (await main.boundingBox())!
  const centered = parts[0]!
  const padding = await main.evaluate((element) => {
    const style = getComputedStyle(element)
    return (
      Number.parseFloat(style.paddingLeft) +
      Number.parseFloat(style.paddingRight)
    )
  })
  expect(centered.width).toBeCloseTo(Math.min(384, bounds.width - padding), 0)
  expect(centered.y + centered.height / 2).toBeCloseTo(
    bounds.y + bounds.height / 2,
    0,
  )
  for (const part of parts)
    expect(part.x + part.width / 2).toBeCloseTo(bounds.x + bounds.width / 2, 0)
  const action = parts[4]!
  expect(action.x).toBeCloseTo(centered.x, 0)
  expect(action.width).toBeCloseTo(centered.width, 0)
  return parts
}

for (const { name, url, colorScheme, width } of [
  { name: 'homepage', url: '/', colorScheme: 'light', width: 1440 },
  {
    name: 'new project page',
    url: '/projects/new?keep=retained',
    colorScheme: 'light',
    width: 390,
  },
  {
    name: 'edit project page',
    url: '/projects/anonymous-project/edit?keep=retained',
    colorScheme: 'dark',
    width: 320,
  },
  {
    name: 'project deep link',
    url: '/projects/anonymous-project?keep=retained#documentation-anchor',
    colorScheme: 'dark',
    width: 390,
  },
] as const) {
  test(`anonymous ${name} keeps its sign-in page before and after JavaScript loads`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ colorScheme })
    const requests = collectGraphQLRequests(page)
    await page.addInitScript(trackMainContentContinuity)
    await page.addInitScript(() => {
      Reflect.set(window, '__acmeWorkspaceFlash', false)
      const labels: string[] = []
      Reflect.set(window, '__acmePublicButtonLabels', labels)
      const record = () => {
        const label = document
          .getElementById('sign-in-continue')
          ?.textContent?.trim()
        if (label && label !== labels.at(-1)) labels.push(label)
        if (
          document.querySelector(
            '[data-slot="sidebar-content"], [data-slot="skeleton"], [data-slot="spinner"], .animate-spin, table',
          )
        ) {
          Reflect.set(window, '__acmeWorkspaceFlash', true)
        }
      }
      new MutationObserver(record).observe(document, {
        childList: true,
        subtree: true,
        characterData: true,
      })
      record()
    })
    let releaseScripts!: () => void
    const scriptsReleased = new Promise<void>((resolve) => {
      releaseScripts = resolve
    })
    let blockedScripts = 0
    await context.route('**/*', async (route) => {
      if (route.request().resourceType() === 'script') {
        blockedScripts++
        await scriptsReleased
      }
      await route.continue()
    })
    const continueButton = page.getByRole('button', {
      name: 'Continue',
      exact: true,
    })
    const publicCopy = ['Manage projects and keep your workspace organized.']
    let originalHTML: JSHandle<HTMLElement> | undefined
    let loadingGeometry!: Awaited<ReturnType<typeof expectSignInCanvas>>
    try {
      await page.goto(url, { waitUntil: 'commit' })
      await expect(
        page.getByText('Welcome to Acme', { exact: true }),
      ).toBeVisible()
      await expect.poll(() => blockedScripts).toBeGreaterThan(0)
      loadingGeometry = await expectSignInCanvas(page)
      originalHTML = await page.evaluateHandle(() => document.documentElement)
      expect(
        await originalHTML.evaluate((element) => ({
          same: element === document.documentElement,
          connected: element.isConnected,
        })),
      ).toEqual({ same: true, connected: true })
      expect(
        await page.evaluate(() =>
          Reflect.get(window, '__acmeMainContentContinuity'),
        ),
      ).toEqual({ seen: true, missing: false })
      await expect(continueButton).toBeVisible()
      await expect(continueButton).toBeDisabled()
      for (const copy of publicCopy)
        await expect(page.getByText(copy, { exact: true })).toBeVisible()
      await expect(
        page.locator(
          '[data-slot="sidebar-content"], [data-slot="skeleton"], [data-slot="spinner"], .animate-spin',
        ),
      ).toHaveCount(0)
      await expect(page.getByRole('table')).toHaveCount(0)
    } finally {
      releaseScripts()
    }
    await expect(continueButton).toBeEnabled()
    expectFieldGeometry(await expectSignInCanvas(page), loadingGeometry)
    await page.setViewportSize({ width: 390, height: 932 })
    await expect
      .poll(async () => (await page.getByRole('main').boundingBox())?.height)
      .toBe(932)
    await expectSignInCanvas(page)
    expect(
      await page.evaluate(() =>
        Reflect.get(window, '__acmeMainContentContinuity'),
      ),
      'The main landmark must remain present throughout hydration',
    ).toEqual({ seen: true, missing: false })
    expect(
      await originalHTML!.evaluate((element) => ({
        same: element === document.documentElement,
        connected: element.isConnected,
      })),
      'Hydration must preserve the original document element',
    ).toEqual({ same: true, connected: true })
    await originalHTML!.dispose()
    for (const copy of publicCopy)
      await expect(page.getByText(copy, { exact: true })).toBeVisible()
    expect(
      await page.evaluate(() =>
        Reflect.get(window, '__acmePublicButtonLabels'),
      ),
      'The static public button label must remain unchanged during hydration',
    ).toEqual(['Continue'])
    const backgroundURL = page.url()
    const signInURL = new URL(backgroundURL)
    signInURL.hash = 'login'
    await continueButton.click()
    const login = page.getByRole('dialog', {
      name: 'Open demo workspace',
      exact: true,
    })
    await expect(login).toBeVisible()
    await expect(page).toHaveURL(signInURL.href)
    await login.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(login).toBeHidden()
    await expect(page).toHaveURL(backgroundURL)
    await page.goto(signInURL.href)
    await expect(login).toBeVisible()
    await login.getByRole('button', { name: 'Cancel', exact: true }).click()
    signInURL.hash = ''
    await expect(page).toHaveURL(signInURL.href)
    signInURL.hash = 'new'
    await page.goto(signInURL.href)
    await expect(continueButton).toBeEnabled()
    await expect(
      page.getByRole('form', { name: 'New project', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.locator('[data-slot="sidebar-content"], [data-slot="skeleton"]'),
    ).toHaveCount(0)
    expect(
      await page.evaluate(() => Reflect.get(window, '__acmeWorkspaceFlash')),
    ).toBe(false)
    expect(
      requests,
      'Anonymous bootstrap should hydrate without browser GraphQL requests',
    ).toHaveLength(0)
  })
}

test('project URL filters and page size use the matching bootstrap response', async ({
  page,
  context,
}) => {
  const workspace = await openWorkspace(context.request)
  const project = workspace.projects.edges[0]!.node
  const search = new URLSearchParams({
    search: project.name,
    status: project.status,
    first: '1',
  })
  const url = `/projects?${search}`
  const response = await context.request.get(url)
  await expect(response).toBeOK()
  expectPrivateHTML(response)
  const html = await response.text()
  const { entries } = readBootstrap(html)
  expect(entries).toHaveLength(2)
  expect(entries[1]).toMatchObject({
    id: ProjectsPageQuery.params.id,
    variables: {
      search: project.name,
      status: project.status,
      first: 1,
      after: null,
      anchor: null,
    },
    response: {
      data: {
        projects: {
          edges: [{ node: { id: project.id, slug: project.slug } }],
          totalCount: 1,
        },
      },
    },
  })
  const metadata = readPreloads(html)
  expect(
    metadata.preloads.map(({ id, variables }) => ({
      id,
      variables: resolveVariables(variables, {}, search),
    })),
  ).toEqual(entries.map(({ id, variables }) => ({ id, variables })))
  const requests = collectGraphQLRequests(page)
  await page.goto(url)
  await expect(
    page.getByRole('textbox', { name: 'Search projects', exact: true }),
  ).toHaveValue(project.name)
  await expect(
    page.getByRole('link', { name: project.name, exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Showing 1 of 1 projects', { exact: true }),
  ).toBeVisible()
  expect(
    requests,
    'URL variables must match the preloaded operation',
  ).toHaveLength(0)

  for (const literal of ['"Atlas"', '{"name":"Atlas"}', '123']) {
    const url = `/projects?${new URLSearchParams({ search: literal })}`
    const response = await context.request.get(url)
    await expect(response).toBeOK()
    const { entries } = readBootstrap(await response.text())
    expect(entries[1]).toMatchObject({
      variables: { search: literal },
      response: { data: { projects: { edges: [], totalCount: 0 } } },
    })
    await page.goto(url)
    await expect(
      page.getByRole('textbox', { name: 'Search projects', exact: true }),
    ).toHaveValue(literal)
    await expect(
      page.getByRole('cell', { name: 'No matching projects.', exact: true }),
    ).toBeVisible()
    expect(new URL(page.url()).searchParams.get('search')).toBe(literal)
    expect(
      requests,
      'Literal search values must consume their matching bootstrap',
    ).toHaveLength(0)
  }
})

test('raw project query strings hydrate with browser-equivalent bootstrap variables', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  const requests = collectGraphQLRequests(page)
  const heading = page.getByRole('heading', { name: 'Projects', exact: true })
  const search = page.getByRole('textbox', {
    name: 'Search projects',
    exact: true,
  })
  for (const query of [
    'search=a;b&keep=left;right&search=ignored&first=2&first=50',
    'search=%zz&keep=left;right',
    'search=%&search=ignored',
    'search=%F0%9F%92&search=ignored',
    'search=%FF%FF&keep=left;right&search=ignored',
  ]) {
    await test.step(query, async () => {
      const params = new URLSearchParams(query)
      const expected = projectVariables(params)
      let releaseScripts!: () => void
      const scriptsReleased = new Promise<void>((resolve) => {
        releaseScripts = resolve
      })
      let blockedScripts = 0
      const holdScripts = async (route: Route) => {
        if (route.request().resourceType() === 'script') {
          blockedScripts++
          await scriptsReleased
        }
        await route.continue()
      }
      await page.route('**/*', holdScripts)
      try {
        const response = await page.goto(`/projects?${query}`, {
          waitUntil: 'commit',
        })
        expect(response?.ok()).toBe(true)
        await expect(heading).toBeVisible()
        await expect(heading).toHaveCount(1)
        await expect(search).toBeDisabled()
        await expect.poll(() => blockedScripts).toBeGreaterThan(0)
        const { entries } = readBootstrap(await response!.text())
        expect(entries.map(({ id, variables }) => ({ id, variables }))).toEqual(
          [
            { id: WorkspaceQuery.params.id, variables: {} },
            { id: ProjectsPageQuery.params.id, variables: expected },
          ],
        )
      } finally {
        releaseScripts()
        await page.unrouteAll({ behavior: 'wait' })
      }

      await expect(search).toBeEnabled()
      await expect(search).toHaveValue(expected.search ?? '')
      await expect(heading).toBeVisible()
      await expect(heading).toHaveCount(1)
      const hydratedParams = new URL(page.url()).searchParams
      expect(hydratedParams.getAll('search')).toEqual(params.getAll('search'))
      expect(hydratedParams.getAll('keep')).toEqual(params.getAll('keep'))
      expect(
        requests,
        'Browser-decoded variables must consume the embedded response',
      ).toHaveLength(0)
    })
  }
})

test('project filters preserve URL state, focus, and browser history', async ({
  page,
  context,
}) => {
  const workspace = await openWorkspace(context.request)
  const requests = collectGraphQLRequests(page)
  const cursorResponse = await context.request.post('/graphql', {
    data: {
      query:
        '{ projects(first: 2) { pageInfo { endCursor } } planned: projects(first: 1, status: PLANNED) { pageInfo { endCursor } } }',
    },
  })
  await expect(cursorResponse).toBeOK()
  const cursors = await cursorResponse.json()
  expect(cursors.errors).toBeUndefined()
  const cursor = cursors.data.projects.pageInfo.endCursor
  const params = new URLSearchParams({
    first: '2',
    after: cursor,
    keep: 'retained',
  })
  await page.goto(`/projects?${params}#filters`)
  await expect(
    page.getByText('Showing 2 of 10 projects', { exact: true }),
  ).toBeVisible()
  const search = page.getByRole('textbox', {
    name: 'Search projects',
    exact: true,
  })
  const resultsFooter = page
    .getByRole('main')
    .locator('p[aria-live="polite"]')
    .locator('..')
  const footerHeight = (await resultsFooter.boundingBox())!.height
  let release!: () => void
  let fetched!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const responseFetched = new Promise<void>((resolve) => {
    fetched = resolve
  })
  const holdSearch = async (route: Route) => {
    const body = route.request().postDataJSON()
    if (
      body?.id !== ProjectsPageQuery.params.id ||
      body.variables?.search !== 'Atlas'
    ) {
      await route.continue()
      return
    }
    const response = await route.fetch()
    fetched()
    await released
    await route.fulfill({ response })
  }
  await page.route('**/graphql', holdSearch)
  try {
    await search.fill('Atlas')
    const originalSearch = await search.elementHandle()
    await responseFetched
    await page.waitForTimeout(1150)
    await expect(search).toHaveValue('Atlas')
    await expect(search).toBeEnabled()
    await expect(search).toBeFocused()
    const table = page.getByRole('table', { name: 'Projects', exact: true })
    await expect(table.locator('[data-slot="skeleton"]').first()).toBeVisible()
    await expect(table.locator('tbody tr')).toHaveCount(2)
    expect(
      await originalSearch!.evaluate(
        (element) => element.isConnected && element === document.activeElement,
      ),
    ).toBe(true)
    release()
    await expect(
      page.getByText('Showing 1 of 1 projects', { exact: true }),
    ).toBeVisible()
    expect((await resultsFooter.boundingBox())!.height).toBeCloseTo(
      footerHeight,
      0,
    )
  } finally {
    release()
    await page.unroute('**/graphql', holdSearch)
  }
  await expect(search).toBeFocused()
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('search') === 'Atlas' &&
      !url.searchParams.has('after'),
  )
  const status = page.getByRole('combobox', {
    name: 'Filter by project status',
    exact: true,
  })
  await status.click()
  await page.getByRole('option', { name: 'Planned', exact: true }).click()
  await expect(
    page.getByRole('cell', { name: 'No matching projects.', exact: true }),
  ).toBeVisible()
  await expect(status).toBeFocused()
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('status') === 'PLANNED',
  )

  await page.goBack()
  await expect(search).toHaveValue('Atlas')
  await expect(
    page.getByText('Showing 1 of 1 projects', { exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL((url) => !url.searchParams.has('status'))
  await page.goForward()
  await expect(
    page.getByRole('cell', { name: 'No matching projects.', exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('status') === 'PLANNED',
  )
  await page.reload()
  await expect(search).toHaveValue('Atlas')
  await expect(status).toContainText('Planned')
  await expect(
    page.getByRole('cell', { name: 'No matching projects.', exact: true }),
  ).toBeVisible()
  const paginated = new URLSearchParams({
    first: '2',
    after: cursors.data.planned.pageInfo.endCursor,
    status: 'PLANNED',
    keep: 'retained',
  })
  await page.goto(`/projects?${paginated}#filters`)
  await expect(
    page.getByText('Showing 2 of 3 projects', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(search).toHaveValue('')
  await expect(status).toContainText('All statuses')
  await expect(
    page.getByText('Showing 2 of 10 projects', { exact: true }),
  ).toBeVisible()
  const cleared = new URL(page.url())
  expect([...cleared.searchParams.entries()].sort()).toEqual([
    ['first', '2'],
    ['keep', 'retained'],
  ])
  expect(cleared.hash).toBe('#filters')

  await search.fill('Atlas')
  await status.click()
  await page.getByRole('option', { name: 'Active', exact: true }).click()
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('search') === 'Atlas' &&
      url.searchParams.get('status') === 'ACTIVE',
  )
  await expect(
    page.getByText('Showing 1 of 1 projects', { exact: true }),
  ).toBeVisible()
  await search.fill('no-such-enter')
  await search.press('Enter')
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('search') === 'no-such-enter' &&
      url.searchParams.get('status') === 'ACTIVE',
  )
  await expect(
    page.getByRole('cell', { name: 'No matching projects.', exact: true }),
  ).toBeVisible()

  await search.fill('uncommitted-back')
  await page.goBack()
  await page.waitForTimeout(500)
  await expect(search).toHaveValue('Atlas')
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('search') === 'Atlas' &&
      url.searchParams.get('status') === 'ACTIVE',
  )
  await expect(
    page.getByText('Showing 1 of 1 projects', { exact: true }),
  ).toBeVisible()
  await search.fill('uncommitted-forward')
  await page.goForward()
  await page.waitForTimeout(500)
  await expect(search).toHaveValue('no-such-enter')
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get('search') === 'no-such-enter' &&
      url.searchParams.get('status') === 'ACTIVE',
  )
  await expect(
    page.getByRole('cell', { name: 'No matching projects.', exact: true }),
  ).toBeVisible()

  const archived = await context.request.post('/graphql', {
    data: {
      query:
        'mutation ArchiveFromAnotherClient($input: UpdateProjectInput!) { updateProject(input: $input) { project { id status } } }',
      variables: {
        input: {
          id: workspace.projects.edges[0]!.node.id,
          name: workspace.projects.edges[0]!.node.name,
          description: 'Updated outside this browser page.',
          status: 'ARCHIVED',
        },
      },
    },
  })
  await expect(archived).toBeOK()
  expect((await archived.json()).errors).toBeUndefined()
  const beforeCachedBack = requests.length
  await page.goBack()
  await expect(search).toHaveValue('Atlas')
  await expect(
    page.getByRole('cell', { name: 'No matching projects.', exact: true }),
  ).toBeVisible()
  expect(
    requests
      .slice(beforeCachedBack)
      .filter(
        (request) => request.postDataJSON()?.id === ProjectsPageQuery.params.id,
      ),
  ).toHaveLength(1)
})

test('pending project search updates cannot undo navigation', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  await page.goto('/projects')
  await expect(
    page.getByText('Showing 6 of 10 projects', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Search projects', exact: true })
    .pressSequentially('Atlas', { delay: 5 })
  await page.getByRole('link', { name: 'Components', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Components', exact: true }),
  ).toBeVisible()
  await page.waitForTimeout(500)
  await expect(page).toHaveURL('/components')
  await expect(
    page.getByRole('heading', { name: 'Components', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: 'Search projects', exact: true }),
  ).toHaveCount(0)
})

test('component previews update checklist progress and support keyboard controls', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  const requests = collectGraphQLRequests(page)
  await page.goto('/components')
  await expect(
    page.getByRole('tab', { name: 'Controls', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: 'Open dialog', exact: true }),
  ).toBeEnabled()
  const primary = page.getByRole('button', { name: 'Primary', exact: true })
  await expect(primary).toHaveCSS('font-size', '14px')
  await expect(primary).toHaveCSS('font-weight', '500')
  await expect(primary).toHaveCSS('line-height', '20px')
  await expect(primary).toHaveCSS('font-family', /^"Instrument Sans Variable",/)
  await expect(primary).toHaveCSS('height', '40px')
  await expect(primary).toHaveCSS('border-radius', '10px')
  for (const action of [
    primary,
    page.getByRole('button', { name: 'Outline', exact: true }),
  ]) {
    await action.hover()
    await expect(action).toHaveCSS('box-shadow', 'none')
    await page.mouse.down()
    try {
      await expect(action).toHaveCSS('translate', 'none')
      await expect(action).toHaveCSS('box-shadow', 'none')
    } finally {
      await page.mouse.move(0, 0)
      await page.mouse.up()
    }
  }
  const inputTitle = page
    .locator('[data-slot="card-title"]')
    .filter({ hasText: /^Inputs$/ })
  await expect(inputTitle).toHaveCSS(
    'font-family',
    /^"Instrument Sans Variable",/,
  )
  await expect(inputTitle).toHaveCSS('font-size', '16px')
  await expect(inputTitle).toHaveCSS('font-weight', '500')
  const controlsTab = page.getByRole('tab', { name: 'Controls', exact: true })
  await controlsTab.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(controlsTab).toHaveCSS('box-shadow', /0px 0px 0px 3px/)
  await page.keyboard.press('Tab')
  const panel = page.getByRole('tabpanel', { name: 'Controls', exact: true })
  await expect(panel).toBeFocused()
  await expect(panel).not.toHaveCSS('box-shadow', 'none')

  await expect(
    page.getByRole('checkbox', { name: 'Write a brief', exact: true }),
  ).toBeChecked()
  await expect(
    page.getByRole('checkbox', { name: 'Add project details', exact: true }),
  ).toBeChecked()
  const share = page.getByRole('checkbox', {
    name: 'Share with the team',
    exact: true,
  })
  const progress = page.getByRole('progressbar', {
    name: 'Launch checklist',
    exact: true,
  })
  await expect(share).not.toBeChecked()
  await expect(progress).toHaveAttribute('aria-valuemax', '3')
  await expect(progress).toHaveAttribute('aria-valuenow', '2')
  await expect(page.getByText('2 of 3 complete', { exact: true })).toBeVisible()
  const shareLabel = page.locator('label[for="example-task-share"]')
  const shareBounds = (await shareLabel.boundingBox())!
  await shareLabel.click({
    position: { x: shareBounds.width - 4, y: shareBounds.height / 2 },
  })
  await expect(share).toBeChecked()
  await expect(progress).toHaveAttribute('aria-valuenow', '3')
  await expect(page.getByText('3 of 3 complete', { exact: true })).toBeVisible()

  const avatarSize = page.getByRole('slider', {
    name: 'Avatar size',
    exact: true,
  })
  const avatar = page.getByRole('img', {
    name: 'Robin Chen avatar preview',
    exact: true,
  })
  await expect(avatarSize).toHaveAttribute('min', '24')
  await expect(avatarSize).toHaveAttribute('max', '64')
  await expect(avatarSize).toHaveAttribute('step', '4')
  await expect(avatarSize).toHaveAttribute('aria-valuenow', '40')
  await expect(avatar).toHaveCSS('width', '40px')
  await expect(avatar).toHaveCSS('height', '40px')
  await avatarSize.press('ArrowRight')
  await expect(page.locator('[data-slot="slider-thumb"]')).toHaveCSS(
    'box-shadow',
    /0px 0px 0px 3px/,
  )
  await expect(avatarSize).toHaveAttribute('aria-valuenow', '44')
  await expect(page.getByText('44px', { exact: true })).toBeVisible()
  await expect(avatar).toHaveCSS('width', '44px')
  await expect(avatar).toHaveCSS('height', '44px')
  const avatarSlot = avatar.locator('..')
  const slot = (await avatarSlot.boundingBox())!
  await avatarSize.press('Home')
  await expect(avatar).toHaveCSS('width', '24px')
  await avatarSize.press('End')
  await expect(avatar).toHaveCSS('width', '64px')
  expect((await avatarSlot.boundingBox())!.height).toBeCloseTo(slot.height, 0)

  const notes = page.getByRole('textbox', { name: 'Notes', exact: true })
  await notes.scrollIntoViewIfNeeded()
  const beforeNotes = await elementGeometry(notes)
  await notes.fill('A longer example note.\n'.repeat(12))
  expectFieldGeometry(await elementGeometry(notes), beforeNotes)
  const alertSwitch = page.getByRole('switch', {
    name: 'Show example alert',
    exact: true,
  })
  await alertSwitch.scrollIntoViewIfNeeded()
  const openDialog = page.getByRole('button', {
    name: 'Open dialog',
    exact: true,
  })
  const beforeToggle = await elementGeometry(openDialog)
  await alertSwitch.click()
  await expect(page.getByText('Changes saved', { exact: true })).toBeHidden()
  expectFieldGeometry(await elementGeometry(openDialog), beforeToggle)
  await alertSwitch.click()
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible()

  const disclosure = page.getByRole('button', {
    name: 'Do these examples change my workspace?',
    exact: true,
  })
  const explanation = page.getByText(
    'These controls are a preview. Changes stay on this page and do not update your projects.',
    { exact: true },
  )
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await disclosure.focus()
  await page.keyboard.press('Enter')
  await expect(disclosure).toHaveCSS('box-shadow', /0px 0px 0px 3px/)
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(explanation).toBeVisible()
  expect(
    requests,
    'Preview controls must not send GraphQL requests',
  ).toHaveLength(0)
})

test('reduced motion keeps overlays and disclosures usable without animation', async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const workspace = await openWorkspace(context.request)
  await page.goto('/components')

  await page.getByRole('button', { name: 'Open dialog', exact: true }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Confirm example action',
    exact: true,
  })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveCSS('animation-name', 'none')
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS(
    'animation-name',
    'none',
  )
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  const accountName = `${workspace.viewer.name} account menu`
  await page.getByRole('button', { name: accountName, exact: true }).click()
  const menu = page.getByRole('menu', { name: accountName, exact: true })
  await expect(menu).toBeVisible()
  await expect(menu).toHaveCSS('animation-name', 'none')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  await page
    .getByRole('button', {
      name: 'Do these examples change my workspace?',
      exact: true,
    })
    .click()
  const explanation = page.getByRole('region', {
    name: 'Do these examples change my workspace?',
    exact: true,
  })
  await expect(explanation).toBeVisible()
  await expect(explanation).toHaveCSS('animation-name', 'none')
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click()
  await expect(
    page.getByRole('radio', { name: 'Light', exact: true }),
  ).toHaveCSS('transition-duration', '0s')
})

test('AI element previews keep navigation and interactions local', async ({
  page,
  context,
}) => {
  await openWorkspace(context.request)
  const requests = collectGraphQLRequests(page)
  await page.goto('/components/ai?keep=retained')
  const ai = page.getByRole('tab', { name: 'AI Elements', exact: true })
  const controls = page.getByRole('tab', { name: 'Controls', exact: true })
  const message = page.getByRole('textbox', { name: 'Message', exact: true })
  await expect(ai).toHaveAttribute('aria-selected', 'true')
  await expect(message).toBeVisible()
  await page.reload()
  await expect(ai).toHaveAttribute('aria-selected', 'true')
  await controls.click()
  await expect(page).toHaveURL('/components?keep=retained')
  await page.goBack()
  await expect(ai).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL('/components/ai?keep=retained')
  await page.goForward()
  await expect(controls).toHaveAttribute('aria-selected', 'true')
  await page.goBack()
  await expect(message).toBeVisible()

  const send = page.getByRole('button', { name: 'Send message', exact: true })
  await expect(send).toBeDisabled()
  await page.getByRole('button', { name: 'Plan a launch', exact: true }).click()
  const prompt = 'Help me plan a project launch.'
  await expect(page.getByText(prompt, { exact: true })).toHaveCount(1)
  const reply = page.getByText(
    'This is a sample reply. Your message stays in this preview and does not change your workspace.',
    { exact: true },
  )
  await expect(reply).toHaveCount(1)
  await expect(message).toHaveValue('')
  await expect(message).not.toBeFocused()
  await expect(send).toBeDisabled()

  await page
    .getByRole('button', { name: 'Review a brief', exact: true })
    .click()
  const reviewPrompt = 'What should I look for in a project brief?'
  await expect(page.getByText(reviewPrompt, { exact: true })).toHaveCount(1)
  await expect(reply).toHaveCount(2)
  await expect(message).toHaveValue('')
  await expect(send).toBeDisabled()

  const typedPrompt = 'Help me review the launch plan.'
  await message.fill(typedPrompt)
  await expect(send).toBeEnabled()
  await send.click()
  await expect(page.getByText(typedPrompt, { exact: true })).toHaveCount(1)
  await expect(reply).toHaveCount(3)
  await expect(message).toHaveValue('')
  await expect(send).toBeDisabled()
  await message.fill('First line')
  await message.press('Shift+Enter')
  await message.pressSequentially('Second line')
  const multilinePrompt = 'First line\nSecond line'
  await expect(message).toHaveValue(multilinePrompt)
  await message.press('Enter')
  const multiline = page
    .locator('[data-slot="bubble-content"]')
    .filter({ hasText: multilinePrompt })
  await expect(multiline).toHaveText(multilinePrompt)
  expect(
    await multiline.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getClientRects().length
    }),
    'An explicit line break must remain visible in a sent message',
  ).toBeGreaterThan(1)
  await message.fill('An unsent draft')
  await page
    .getByRole('button', { name: 'Reset conversation', exact: true })
    .click()
  await expect(message).toHaveValue('')
  await expect(send).toBeDisabled()
  await expect(page.getByText(prompt, { exact: true })).toHaveCount(0)
  await expect(page.getByText(reviewPrompt, { exact: true })).toHaveCount(0)
  await expect(page.getByText(typedPrompt, { exact: true })).toHaveCount(0)
  await expect(reply).toHaveCount(0)
  await expect(
    page.getByText('What should a launch checklist include?', { exact: true }),
  ).toBeVisible()

  const preparation = page.getByRole('button', {
    name: 'How this example was prepared',
    exact: true,
  })
  await expect(preparation).toHaveAttribute('aria-expanded', 'false')
  await preparation.press('Enter')
  await expect(preparation).toHaveAttribute('aria-expanded', 'true')
  await expect(
    page.getByText(
      'The sample plan groups preparation, review, and launch into a short checklist.',
      { exact: true },
    ),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Approve example', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Example approved' }),
  ).toHaveText('Example approved')
  expect(
    requests,
    'AI previews must not send messages or workspace queries to a backend',
  ).toHaveLength(0)
})

for (const width of [1280, 390]) {
  test(`AI conversation preserves selections and handles reply actions at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await openWorkspace(context.request)
    const requests = collectGraphQLRequests(page)
    await page.goto('/components/ai')
    const message = page.getByRole('textbox', { name: 'Message', exact: true })
    const model = page.getByRole('button', { name: 'Model', exact: true })
    const effort = page.getByRole('button', { name: 'Effort', exact: true })
    const restore = page.getByRole('button', {
      name: 'Restore checkpoint',
      exact: true,
    })
    await expect(restore).toBeDisabled()
    await model.click()
    await page
      .getByRole('menuitemradio', { name: 'GPT-5 mini', exact: true })
      .click()
    await effort.click()
    await page.getByRole('menuitemradio', { name: 'High', exact: true }).click()
    await message.fill('Use the selected model for this preview.')
    await message.press('Enter')
    const reply = page.locator('[data-slot="message"]').filter({
      has: page.getByRole('button', { name: 'Copy reply 2', exact: true }),
    })
    const replyText =
      'This is a sample reply. Your message stays in this preview and does not change your workspace.'
    await expect(reply).toContainText('GPT-5 mini · High effort')
    await expect(
      page.getByText('GPT-5 · Medium effort', { exact: true }),
    ).toHaveCount(1)
    await expect(restore).toBeEnabled()
    await expect(reply).toHaveAttribute('aria-busy', 'false')
    await expect(reply.locator('[data-slot="bubble-content"]')).toHaveText(
      replyText,
    )

    await page.evaluate(() => {
      const writes: string[] = []
      Reflect.set(window, '__acmeClipboardWrites', writes)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            writes.push(value)
          },
        },
      })
    })
    const copy = reply.getByRole('button', {
      name: 'Copy reply 2',
      exact: true,
    })
    await copy.click()
    await expect
      .poll(() =>
        page.evaluate(() => Reflect.get(window, '__acmeClipboardWrites')),
      )
      .toEqual([replyText])
    const copyAnnouncement = reply.locator('[aria-live="polite"]')
    await expect(copyAnnouncement).toHaveText('Reply copied')
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new DOMException('Clipboard access denied', 'NotAllowedError')
          },
        },
      })
    })
    await copy.click()
    await expect(
      page.getByText('Could not copy the reply. Try again.', { exact: true }),
    ).toBeVisible()
    await expect(copyAnnouncement).toBeEmpty()
    expect(
      await page.evaluate(() => Reflect.get(window, '__acmeClipboardWrites')),
    ).toEqual([replyText])

    const helpful = reply.getByRole('button', {
      name: 'Helpful reply 2',
      exact: true,
    })
    const notHelpful = reply.getByRole('button', {
      name: 'Not helpful reply 2',
      exact: true,
    })
    await expect(helpful).toHaveAttribute('aria-pressed', 'false')
    await expect(notHelpful).toHaveAttribute('aria-pressed', 'false')
    await helpful.click()
    await expect(helpful).toHaveAttribute('aria-pressed', 'true')
    await expect(notHelpful).toHaveAttribute('aria-pressed', 'false')
    await notHelpful.click()
    await expect(helpful).toHaveAttribute('aria-pressed', 'false')
    await expect(notHelpful).toHaveAttribute('aria-pressed', 'true')
    await notHelpful.click()
    await expect(helpful).toHaveAttribute('aria-pressed', 'false')
    await expect(notHelpful).toHaveAttribute('aria-pressed', 'false')

    await message.fill('An unsent draft to clear at the checkpoint')
    await restore.click()
    await expect(message).toHaveValue('')
    await expect(restore).toBeDisabled()
    await expect(reply).toHaveCount(0)
    await expect(
      page.getByText('Use the selected model for this preview.', {
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(model).toContainText('GPT-5 mini')
    await expect(effort).toContainText('High')
    await page
      .getByRole('button', { name: 'Plan a launch', exact: true })
      .click()
    await expect(reply).toContainText('GPT-5 mini · High effort')
    expect(
      requests,
      'Reply actions must remain in the local preview',
    ).toHaveLength(0)
  })
}

test('AI reply copy feedback resets its timer and ignores late clipboard settlements', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: new Date('2026-11-16T12:00:00Z') })
  await openWorkspace(context.request)
  const requests = collectGraphQLRequests(page)
  await page.goto('/components/ai')
  const copy = page.getByRole('button', { name: 'Copy reply 1', exact: true })
  const reply = page.locator('[data-slot="message"]').filter({ has: copy })
  const announcement = reply.locator('[aria-live="polite"]')
  await expect(copy).toBeEnabled()
  await page.clock.pauseAt(new Date('2026-11-16T13:00:00Z'))
  await page.evaluate(() => {
    const writes: string[] = []
    Reflect.set(window, '__acmeRepeatedClipboardWrites', writes)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          writes.push(value)
        },
      },
    })
  })
  await copy.click()
  await expect(announcement).toHaveText('Reply copied')
  await page.clock.runFor(1500)
  await copy.click()
  await expect
    .poll(() =>
      page.evaluate(() => Reflect.get(window, '__acmeRepeatedClipboardWrites')),
    )
    .toHaveLength(2)
  await page.clock.runFor(1000)
  await expect(announcement).toHaveText('Reply copied')
  await page.clock.runFor(1000)
  await expect(announcement).toBeEmpty()

  for (const outcome of ['resolve', 'reject']) {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () =>
            new Promise<void>((resolve, reject) => {
              Reflect.set(window, '__acmeResolveClipboard', resolve)
              Reflect.set(window, '__acmeRejectClipboard', reject)
            }),
        },
      })
    })
    await copy.click()
    await page.getByRole('tab', { name: 'Controls', exact: true }).click()
    await expect(copy).toHaveCount(0)
    await page.evaluate((result) => {
      if (result === 'resolve') Reflect.get(window, '__acmeResolveClipboard')()
      else
        Reflect.get(
          window,
          '__acmeRejectClipboard',
        )(new DOMException('Clipboard access denied', 'NotAllowedError'))
    }, outcome)
    await page.clock.runFor(2100)
    await expect(
      page.getByText('Could not copy the reply. Try again.', { exact: true }),
    ).toHaveCount(0)
    await expect(page.getByText('Reply copied', { exact: true })).toHaveCount(0)
    await page.getByRole('tab', { name: 'AI Elements', exact: true }).click()
    await expect(copy).toBeEnabled()
    await expect(announcement).toBeEmpty()
  }
  expect(requests, 'Reply copying must remain local').toHaveLength(0)
})

for (const width of [1280, 390]) {
  test(`AI conversation stops, retries, and cancels pending replies at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install({ time: new Date('2026-11-16T12:00:00Z') })
    await openWorkspace(context.request)
    const requests = collectGraphQLRequests(page)
    await page.goto('/components/ai')
    const message = page.getByRole('textbox', { name: 'Message', exact: true })
    const send = page.getByRole('button', { name: 'Send message', exact: true })
    const stop = page.getByRole('button', {
      name: 'Stop response',
      exact: true,
    })
    const retry = page.getByRole('button', {
      name: 'Retry response',
      exact: true,
    })
    const reset = page.getByRole('button', {
      name: 'Reset conversation',
      exact: true,
    })
    const restore = page.getByRole('button', {
      name: 'Restore checkpoint',
      exact: true,
    })
    const messages = page.locator('[data-slot="message"]')
    const reply = messages.filter({
      has: page.getByRole('button', { name: 'Copy reply 2', exact: true }),
    })
    const replyBody = reply.locator('[data-slot="bubble-content"]')
    const replyText =
      'This is a sample reply. Your message stays in this preview and does not change your workspace.'
    await expect(message).toBeEnabled()
    await page.clock.pauseAt(new Date('2026-11-16T13:00:00Z'))
    await expect(retry).toHaveCount(0)

    const prompt = 'A reply that I can stop and retry.'
    await message.fill(prompt)
    await send.click()
    await expect(reply).toHaveAttribute('aria-busy', 'true')
    await expect(stop).toBeEnabled()
    await expect(retry).toBeDisabled()
    await expect(
      reply.getByRole('button', { name: 'Retry response', exact: true }),
    ).toHaveText('Retry')
    await expect(
      page.locator('[data-slot="card-header"]').getByRole('button', {
        name: 'Retry response',
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Plan a launch', exact: true }),
    ).toBeDisabled()
    for (const name of [
      'Copy reply 2',
      'Helpful reply 2',
      'Not helpful reply 2',
    ]) {
      await expect(
        reply.getByRole('button', { name, exact: true }),
      ).toBeDisabled()
    }
    await page.clock.runFor(200)
    const partialReply = (await replyBody.textContent())!
    expect(partialReply.length).toBeGreaterThan(0)
    expect(partialReply.length).toBeLessThan(replyText.length)
    expect(replyText.startsWith(partialReply)).toBe(true)
    const draft = 'Keep this unsent draft.'
    await message.fill(draft)
    await message.press('Enter')
    await expect(messages).toHaveCount(4)
    await expect(message).toHaveValue(draft)
    await stop.click()
    await expect(reply).toHaveAttribute('aria-busy', 'false')
    await expect(reply).toContainText('Stopped')
    await expect(messages).toHaveCount(4)
    await expect(message).toHaveValue(draft)
    await page.clock.runFor(2000)
    await expect(replyBody).toHaveText(partialReply)
    await expect(message).toHaveValue(draft)
    await expect(retry).toBeEnabled()
    await expect(
      reply.getByRole('button', { name: 'Copy reply 2', exact: true }),
    ).toBeEnabled()
    const helpful = reply.getByRole('button', {
      name: 'Helpful reply 2',
      exact: true,
    })
    await helpful.click()
    await expect(helpful).toHaveAttribute('aria-pressed', 'true')

    await retry.click()
    await expect(reply).toHaveAttribute('aria-busy', 'true')
    await expect(helpful).toHaveAttribute('aria-pressed', 'false')
    await expect(messages).toHaveCount(4)
    await expect(page.getByText(prompt, { exact: true })).toHaveCount(1)
    await expect(message).toHaveValue(draft)
    await page.clock.runFor(2000)
    await expect(replyBody).toHaveText(replyText)
    await expect(reply).toHaveAttribute('aria-busy', 'false')
    await expect(retry).toBeEnabled()
    await expect(messages).toHaveCount(4)

    await retry.click()
    await expect(stop).toBeVisible()
    await reset.click()
    await page.clock.runFor(2000)
    await expect(messages).toHaveCount(2)
    await expect(message).toHaveValue('')
    await expect(reply).toHaveCount(0)
    await expect(retry).toHaveCount(0)

    await message.fill('Restore this active response to the checkpoint.')
    await send.click()
    await expect(stop).toBeVisible()
    await restore.click()
    await page.clock.runFor(2000)
    await expect(messages).toHaveCount(2)
    await expect(restore).toBeDisabled()
    await expect(reply).toHaveCount(0)

    await page
      .getByRole('button', { name: 'Plan a launch', exact: true })
      .click()
    await expect(stop).toBeVisible()
    await page.getByRole('tab', { name: 'Controls', exact: true }).click()
    await expect(message).toHaveCount(0)
    await page.clock.runFor(2000)
    await page.getByRole('tab', { name: 'AI Elements', exact: true }).click()
    await expect(message).toBeEnabled()
    await expect(messages).toHaveCount(2)
    await expect(message).toHaveValue('')
    await expect(stop).toHaveCount(0)
    await expect(retry).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width)
    expect(requests, 'Response controls must remain local').toHaveLength(0)
  })

  test(`AI tools, plans, queues, and subagents advance local runs at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await openWorkspace(context.request)
    const requests = collectGraphQLRequests(page)
    await page.goto('/components/ai')
    const reasoningSummary = page.getByRole('button', {
      name: 'Reasoning summary',
      exact: true,
    })
    const reasoningLine = reasoningSummary.locator('[data-slot="trace-line"]')
    await expect(reasoningSummary).toHaveAttribute('aria-expanded', 'false')
    await page
      .getByRole('button', { name: 'Run reasoning', exact: true })
      .click()
    await expect(reasoningSummary).toHaveAttribute('aria-expanded', 'true')
    await expect(reasoningLine).toHaveAttribute('data-status', 'running')
    await reasoningSummary.press('Enter')
    await expect(reasoningSummary).toHaveAttribute('aria-expanded', 'false')
    await page
      .getByRole('button', { name: 'Finish reasoning', exact: true })
      .click()
    await expect(reasoningSummary).toHaveAttribute('aria-expanded', 'false')
    await expect(reasoningLine).not.toHaveAttribute('data-status', 'running')
    await page
      .getByRole('button', { name: 'Run reasoning', exact: true })
      .click()
    await expect(reasoningSummary).toHaveAttribute('aria-expanded', 'false')
    await expect(reasoningLine).toHaveAttribute('data-status', 'running')
    await page
      .getByRole('button', { name: 'Finish reasoning', exact: true })
      .click()
    await expect(reasoningSummary).toHaveAttribute('aria-expanded', 'false')
    await expect(reasoningLine).not.toHaveAttribute('data-status', 'running')

    const tools = page.locator('[aria-labelledby="tools-example-title"]')
    const plan = page.locator('[aria-labelledby="plan-example-title"]')
    const queue = page.locator('[aria-labelledby="queue-example-title"]')
    const subagents = page.locator(
      '[aria-labelledby="subagents-example-title"]',
    )

    const outcome = tools.getByRole('combobox', {
      name: 'Tool outcome',
      exact: true,
    })
    await expect(tools.getByText('Arguments', { exact: true })).toBeVisible()
    await expect(tools.getByText('Result', { exact: true })).toBeVisible()
    await expect(
      tools.locator('[data-slot="code-block-content"]').first(),
    ).toContainText('"file": "launch-brief.md"')
    await outcome.click()
    await page.getByRole('option', { name: 'Failure', exact: true }).click()
    await tools
      .getByRole('button', { name: 'Run example', exact: true })
      .click()
    await expect(outcome).toBeDisabled()
    await expect(
      tools.locator('[data-slot="trace-line"][data-status="running"]'),
    ).toHaveText('Running search_files')
    await tools
      .getByRole('button', { name: 'Finish example', exact: true })
      .click()
    await expect(
      tools.locator('[data-slot="trace-line"][data-status="error"]'),
    ).toHaveText('Failed to run search_files')
    await expect(tools.getByText(/FILE_NOT_FOUND/)).toBeVisible()
    await tools
      .getByRole('button', { name: 'Retry example', exact: true })
      .click()
    await tools
      .getByRole('button', { name: 'Stop example', exact: true })
      .click()
    await expect(
      tools.getByText('Stopped search_files', { exact: true }),
    ).toBeVisible()
    await tools
      .getByRole('button', { name: 'Retry example', exact: true })
      .click()
    await tools
      .getByRole('button', { name: 'Finish example', exact: true })
      .click()
    await expect(tools.getByText(/FILE_NOT_FOUND/)).toBeVisible()
    await outcome.click()
    await page.getByRole('option', { name: 'Denied', exact: true }).click()
    await tools
      .getByRole('button', { name: 'Retry example', exact: true })
      .click()
    await tools
      .getByRole('button', { name: 'Finish example', exact: true })
      .click()
    await expect(
      tools.getByText('Denied search_files', { exact: true }),
    ).toBeVisible()
    await expect(tools.locator('[data-slot="trace-collapsible"]')).toHaveCount(
      0,
    )
    await outcome.click()
    await page.getByRole('option', { name: 'Success', exact: true }).click()
    await tools
      .getByRole('button', { name: 'Run example', exact: true })
      .click()
    await tools
      .getByRole('button', { name: 'Finish example', exact: true })
      .click()
    const toolResult = tools.getByRole('button', {
      name: 'Ran search_files',
      exact: true,
    })
    await expect(toolResult).toHaveAttribute('aria-expanded', 'true')
    await toolResult.press('Enter')
    await expect(toolResult).toHaveAttribute('aria-expanded', 'false')
    await expect(tools.getByText('Arguments', { exact: true })).toBeHidden()
    await toolResult.press('Enter')
    await expect(tools.getByText('Result', { exact: true })).toBeVisible()

    const steps = plan.locator(
      '[data-slot="trace-collapsible-content"] [data-slot="trace-line"]',
    )
    const completeStep = plan.getByRole('button', {
      name: 'Complete next step',
      exact: true,
    })
    await expect(plan.getByText('1 of 3 done', { exact: true })).toBeVisible()
    await expect(steps).toHaveCount(3)
    await expect(steps.nth(1)).toHaveAttribute('data-status', 'running')
    await expect(steps.nth(2)).toHaveAttribute('data-status', 'pending')
    await completeStep.click()
    await expect(plan.getByText('2 of 3 done', { exact: true })).toBeVisible()
    await completeStep.click()
    await expect(plan.getByText('3 of 3 done', { exact: true })).toBeVisible()
    await expect(completeStep).toBeDisabled()
    await plan.getByRole('button', { name: 'Reset plan', exact: true }).click()
    await expect(plan.getByText('0 of 3 done', { exact: true })).toBeVisible()
    await expect(steps.first()).toHaveAttribute('data-status', 'running')
    await expect(completeStep).toBeEnabled()

    const queuedTitles = queue.locator(
      '[data-slot="item-content"] [data-slot="trace-title"]',
    )
    await expect(queuedTitles).toHaveText([
      'Review the launch brief',
      'Draft the announcement',
      'Prepare release notes',
    ])
    await queue
      .getByRole('button', {
        name: 'Move Prepare release notes up',
        exact: true,
      })
      .click()
    await expect(queuedTitles).toHaveText([
      'Review the launch brief',
      'Prepare release notes',
      'Draft the announcement',
    ])
    const completeTask = queue.getByRole('button', {
      name: 'Complete next task',
      exact: true,
    })
    await completeTask.click()
    await expect(queuedTitles).toHaveText([
      'Prepare release notes',
      'Draft the announcement',
    ])
    await expect(
      queue.getByRole('button', { name: '2 completed', exact: true }),
    ).toBeVisible()
    await queue
      .getByRole('button', {
        name: 'Remove Prepare release notes',
        exact: true,
      })
      .click()
    await expect(queuedTitles).toHaveText(['Draft the announcement'])
    await completeTask.click()
    await expect(queue.getByText('Queue empty', { exact: true })).toBeVisible()
    await expect(completeTask).toBeDisabled()
    await queue
      .getByRole('button', { name: 'Reset queue', exact: true })
      .click()
    await expect(queuedTitles).toHaveCount(3)
    await expect(
      queue.getByRole('button', { name: '1 completed', exact: true }),
    ).toBeVisible()
    await expect(completeTask).toBeEnabled()

    await subagents
      .getByRole('button', { name: 'Run agents', exact: true })
      .click()
    await expect(subagents.getByRole('status')).toHaveText('0 of 2 done')
    await expect(
      subagents.getByText('GPT-5 mini', { exact: true }),
    ).toBeVisible()
    await expect(
      subagents.getByText('Find launch requirements in the brief.', {
        exact: true,
      }),
    ).toBeVisible()
    await subagents
      .getByRole('button', { name: 'Finish next agent', exact: true })
      .click()
    await expect(subagents.getByRole('status')).toHaveText('1 of 2 done')
    const nestedTool = subagents.getByRole('button', {
      name: 'Ran search_files',
      exact: true,
    })
    await nestedTool.click()
    await expect(
      subagents.locator('[data-slot="code-block-content"]'),
    ).toHaveText('Found a launch date, owner, and approval checklist.')
    const reviewer = subagents.getByRole('button', {
      name: 'Running the review agent',
      exact: true,
    })
    await reviewer.click()
    await expect(
      subagents.getByText('Check the launch checklist for missing owners.', {
        exact: true,
      }),
    ).toBeVisible()
    await subagents
      .getByRole('button', { name: 'Finish next agent', exact: true })
      .click()
    await expect(subagents.getByRole('status')).toHaveText('2 of 2 done')
    await expect(
      subagents.getByRole('button', {
        name: 'Ran the review agent',
        exact: true,
      }),
    ).toBeVisible()
    await subagents
      .getByRole('button', { name: 'Replay agents', exact: true })
      .click()
    await expect(subagents.getByRole('status')).toHaveText('0 of 2 done')
    await expect(
      subagents.getByRole('button', {
        name: 'Running the research agent',
        exact: true,
      }),
    ).toBeVisible()

    for (const viewportWidth of width === 390 ? [390, 320] : [1280]) {
      await page.setViewportSize({ width: viewportWidth, height: 1000 })
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(viewportWidth)
    }
    expect(requests, 'Agent workflow controls must remain local').toHaveLength(
      0,
    )
  })

  test(`AI files and diagnostics expose nested local output at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await openWorkspace(context.request)
    const requests = collectGraphQLRequests(page)
    await page.goto('/components/ai')
    const files = page.locator('[aria-labelledby="files-example-title"]')
    const diagnostics = page.locator(
      '[aria-labelledby="diagnostics-example-title"]',
    )
    const folder = files.getByRole('button', { name: 'project', exact: true })
    const launchPlan = files.getByRole('button', {
      name: 'launch-plan.json',
      exact: true,
    })
    const checklist = files.getByRole('button', {
      name: 'checklist.md',
      exact: true,
    })
    const diff = files.getByRole('button', { name: 'Diff', exact: true })
    await expect(launchPlan).toHaveAttribute('aria-pressed', 'true')
    await expect(
      files.getByLabel('launch-plan.json preview', { exact: true }),
    ).toContainText('"owner": "Maya Chen"')
    await expect(folder).toHaveAttribute('aria-expanded', 'true')
    await folder.press('Enter')
    await expect(folder).toHaveAttribute('aria-expanded', 'false')
    await expect(checklist).toBeHidden()
    await folder.press('Enter')
    await checklist.click()
    await expect(checklist).toHaveAttribute('aria-pressed', 'true')
    await expect(launchPlan).toHaveAttribute('aria-pressed', 'false')
    const checklistText =
      '# Atlas launch\n\n- [x] Draft the brief\n- [x] Assign an owner\n- [ ] Schedule the announcement'
    await expect(
      files.getByLabel('checklist.md preview', { exact: true }),
    ).toHaveText(checklistText, { useInnerText: true })
    await diff.click()
    await expect(diff).toHaveAttribute('aria-pressed', 'true')
    const checklistDiff = files.getByLabel('checklist.md diff', { exact: true })
    await expect(
      checklistDiff.locator(
        '[data-slot="code-block-line"][data-variant="removed"]',
      ),
    ).toHaveText('- [ ] Assign an owner')
    await expect(
      checklistDiff.locator(
        '[data-slot="code-block-line"][data-variant="added"]',
      ),
    ).toHaveText('- [x] Assign an owner')
    await page.evaluate(() => {
      const writes: string[] = []
      Reflect.set(window, '__acmeArtifactClipboardWrites', writes)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            writes.push(value)
          },
        },
      })
    })
    await files
      .getByRole('button', { name: 'Copy project/checklist.md', exact: true })
      .click()
    await expect
      .poll(() =>
        page.evaluate(() =>
          Reflect.get(window, '__acmeArtifactClipboardWrites'),
        ),
      )
      .toEqual([checklistText])
    await diff.click()
    await expect(diff).toHaveAttribute('aria-pressed', 'false')
    await expect(
      files.getByLabel('checklist.md preview', { exact: true }),
    ).toBeVisible()

    await expect(diagnostics.getByRole('status')).toHaveText(
      '1 passed, 1 failed',
    )
    const failure = diagnostics.getByRole('button', {
      name: 'requires a launch owner',
      exact: true,
    })
    await expect(failure).toHaveAttribute('aria-expanded', 'true')
    const assertion = diagnostics.getByText(
      /AssertionError: Expected a launch owner, received null/,
    )
    await expect(assertion).toBeVisible()
    const frames = diagnostics.getByRole('button', {
      name: '2 framework frames',
      exact: true,
    })
    await expect(frames).toHaveAttribute('aria-expanded', 'false')
    const frameworkOutput = diagnostics.getByText(
      /runTest \(node_modules\/example-runner\/run.js:94:12\)/,
    )
    await expect(frameworkOutput).toBeHidden()
    await frames.press('Enter')
    await expect(frames).toHaveAttribute('aria-expanded', 'true')
    await expect(frameworkOutput).toBeVisible()
    await failure.press('Enter')
    await expect(assertion).toBeHidden()
    await failure.press('Enter')
    await expect(assertion).toBeVisible()
    await expect(frames).toHaveAttribute('aria-expanded', 'true')
    await expect(frameworkOutput).toBeVisible()
    const runSummary = diagnostics.getByRole('button', {
      name: '1 passed, 1 failed',
      exact: true,
    })
    const suite = diagnostics.getByRole('button', {
      name: /^launch-plan\.test\.ts/,
    })
    await failure.press('Enter')
    await runSummary.press('Enter')
    await expect(suite).toBeHidden()
    await runSummary.press('Enter')
    await expect(suite).toHaveAttribute('aria-expanded', 'true')
    await expect(failure).toHaveAttribute('aria-expanded', 'false')
    await expect(assertion).toBeHidden()
    await failure.press('Enter')
    await expect(frames).toHaveAttribute('aria-expanded', 'true')
    await expect(frameworkOutput).toBeVisible()
    await suite.press('Enter')
    await runSummary.press('Enter')
    await runSummary.press('Enter')
    await expect(suite).toHaveAttribute('aria-expanded', 'false')
    await expect(failure).toBeHidden()
    await suite.press('Enter')
    await expect(failure).toHaveAttribute('aria-expanded', 'true')
    await expect(frames).toHaveAttribute('aria-expanded', 'true')
    await expect(frameworkOutput).toBeVisible()
    const terminal = diagnostics.getByRole('button', {
      name: /^Terminal output/,
    })
    await expect(terminal).toHaveAttribute('aria-expanded', 'false')
    await terminal.press('Enter')
    await expect(terminal).toHaveAttribute('aria-expanded', 'true')
    const terminalOutput = diagnostics
      .locator('[data-slot="code-block-content"]')
      .filter({ hasText: 'RUN  Atlas launch checks' })
    await expect(terminalOutput).toContainText('Exit code 1')
    await diagnostics
      .getByRole('button', { name: 'Rerun checks', exact: true })
      .click()
    await expect(diagnostics.getByRole('status')).toHaveText('Running 2 checks')
    await expect(terminalOutput).toContainText(
      'Checking the example launch files…',
    )
    await expect(assertion).toHaveCount(0)
    await diagnostics
      .getByRole('button', { name: 'Finish checks', exact: true })
      .click()
    await expect(diagnostics.getByRole('status')).toHaveText(
      '2 passed, 0 failed',
    )
    await expect(terminalOutput).toContainText('Exit code 0')
    await expect(failure).toHaveCount(0)
    await expect(
      diagnostics.getByRole('button', { name: 'Rerun checks', exact: true }),
    ).toBeEnabled()
    await diagnostics
      .getByRole('button', { name: 'Copy terminal output', exact: true })
      .click()
    await expect
      .poll(() =>
        page.evaluate(() =>
          Reflect.get(window, '__acmeArtifactClipboardWrites'),
        ),
      )
      .toEqual([
        checklistText,
        'RUN  Atlas launch checks\n\nPASS  preserves the project name\nPASS  requires a launch owner\n\nTests  2 passed (2)\nExit code 0',
      ])

    for (const viewportWidth of width === 390 ? [390, 320] : [1280]) {
      await page.setViewportSize({ width: viewportWidth, height: 1000 })
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(viewportWidth)
    }
    expect(
      requests,
      'File and diagnostics controls must remain local',
    ).toHaveLength(0)
  })
}

for (const width of [1280, 390]) {
  test(`AI supporting previews work at ${width}px without backend requests`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await openWorkspace(context.request)
    const requests = collectGraphQLRequests(page)
    await page.goto('/components/ai')
    const files = page.getByLabel('Choose files', { exact: true })
    await expect(
      page.getByRole('button', { name: 'Remove launch-brief.md', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Remove screenshot.png', exact: true }),
    ).toBeVisible()
    const attachment = {
      name: 'local-preview.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('A local preview attachment'),
    }
    const chooserOpened = page.waitForEvent('filechooser')
    await page
      .getByRole('button', { name: 'Attach files', exact: true })
      .click()
    await (await chooserOpened).setFiles(attachment)
    const removeAttachment = page.getByRole('button', {
      name: 'Remove local-preview.txt',
      exact: true,
    })
    await expect(removeAttachment).toBeVisible()
    await expect(files).toHaveValue('')
    await removeAttachment.click()
    await expect(removeAttachment).toHaveCount(0)
    await files.setInputFiles(attachment)
    await expect(removeAttachment).toBeVisible()
    await expect(files).toHaveValue('')
    await removeAttachment.click()
    await page
      .getByRole('button', { name: 'Remove screenshot.png', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Remove screenshot.png', exact: true }),
    ).toHaveCount(0)

    const sourceOne = page.getByRole('button', {
      name: 'View source 1',
      exact: true,
    })
    const sourceTwo = page.getByRole('button', {
      name: 'View source 2',
      exact: true,
    })
    const routeSource = page.getByLabel('Route loaders', { exact: true })
    const relaySource = page.getByLabel('Relay fragments', { exact: true })
    await sourceOne.click()
    await expect(routeSource).toBeVisible()
    await expect(routeSource).toBeInViewport({ ratio: 1 })
    await expect(routeSource.getByRole('link')).toHaveAttribute(
      'href',
      /^https:\/\/tanstack\.com\//,
    )
    await page.keyboard.press('Escape')
    await expect(routeSource).toBeHidden()
    await sourceTwo.focus()
    await sourceTwo.press('Enter')
    await expect(relaySource).toBeVisible()
    await expect(relaySource).toBeInViewport({ ratio: 1 })
    await expect(relaySource.getByRole('link')).toHaveAttribute(
      'href',
      /^https:\/\/relay\.dev\//,
    )
    await page.keyboard.press('Escape')
    await expect(relaySource).toBeHidden()
    const references = page.getByRole('button', {
      name: '2 references',
      exact: true,
    })
    await expect(references).toHaveAttribute('aria-expanded', 'false')
    await references.press('Enter')
    await expect(references).toHaveAttribute('aria-expanded', 'true')
    const sourceList = page.locator('[data-slot="card"]').filter({
      has: references,
    })
    await expect(sourceList.getByRole('link')).toHaveCount(2)

    const progress = page.getByRole('progressbar', {
      name: 'Context used',
      exact: true,
    })
    await expect(progress).toHaveAttribute('aria-valuemax', '8000')
    await expect(progress).toHaveAttribute('aria-valuenow', '2400')
    const inspect = page.getByRole('button', {
      name: 'Inspect context usage',
      exact: true,
    })
    const contextUsage = page.getByLabel('Context usage', { exact: true })
    await inspect.click()
    await expect(contextUsage).toBeVisible()
    await expect(contextUsage).toBeInViewport({ ratio: 1 })
    await expect(contextUsage).toContainText('1,800')
    await expect(contextUsage).toContainText('600')
    await expect(contextUsage).toContainText('5,600')
    await page.keyboard.press('Escape')
    await expect(contextUsage).toBeHidden()
    await page
      .getByRole('button', { name: 'Add sample turn', exact: true })
      .click()
    await expect(progress).toHaveAttribute('aria-valuenow', '2912')
    await inspect.focus()
    await inspect.press('Enter')
    await expect(contextUsage).toBeVisible()
    await expect(contextUsage).toContainText('1,112')
    await expect(contextUsage).toContainText('5,088')
    await page.keyboard.press('Escape')
    await page
      .getByRole('button', { name: 'Reset context', exact: true })
      .click()
    await expect(progress).toHaveAttribute('aria-valuenow', '2400')

    for (const viewportWidth of width === 390 ? [390, 320] : [1280]) {
      await page.setViewportSize({ width: viewportWidth, height: 1000 })
      await inspect.click()
      await expect(contextUsage).toBeInViewport({ ratio: 1 })
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(viewportWidth)
      await page.keyboard.press('Escape')
      await expect(contextUsage).toBeHidden()
    }
    expect(
      requests,
      'Attachments, references, and context controls must remain local',
    ).toHaveLength(0)
  })
}

test('component tabs use native page links across reload and browser history', async ({
  page,
  context,
}) => {
  const workspace = await openWorkspace(context.request)
  const requests = collectGraphQLRequests(page)
  await page.goto('/components/appearance?keep=retained')
  const appearance = page.getByRole('tab', { name: 'Appearance', exact: true })
  const controls = page.getByRole('tab', { name: 'Controls', exact: true })
  await expect(page.getByRole('tab')).toHaveText([
    'Controls',
    'AI Elements',
    'Appearance',
  ])
  await expect(appearance).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.getByRole('radiogroup', { name: 'Theme', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(appearance).toHaveAttribute('aria-selected', 'true')
  await controls.click()
  await expect(controls).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL('/components?keep=retained')
  await page.goBack()
  await expect(appearance).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL('/components/appearance?keep=retained')
  await page.goForward()
  await expect(controls).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL('/components?keep=retained')
  await page.reload()
  await expect(controls).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('button', { name: 'Open dialog', exact: true }).click()
  const example = page.getByRole('dialog', {
    name: 'Confirm example action',
    exact: true,
  })
  await expect(example).toBeVisible()
  await expect(page).toHaveURL('/components?keep=retained#dialog')
  await example.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(example).toBeHidden()
  await expect(page).toHaveURL('/components?keep=retained')

  for (const hash of ['', '#documentation-anchor']) {
    await page.goto(`/components?keep=retained${hash}`)
    await expect(
      page.getByRole('button', {
        name: `${workspace.viewer.name} account menu`,
      }),
    ).toBeVisible()
    await expect(controls).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(`/components?keep=retained${hash}`)
  }
  expect(
    requests,
    'Tab selection must not trigger GraphQL requests',
  ).toHaveLength(0)
})

test('an unknown URL hydrates the generic shell into the not-found page', async ({
  page,
  request,
}) => {
  const response = await request.get('/no-such-page')
  await expect(response).toBeOK()
  const html = await response.text()
  expect(html).toContain('Welcome to Acme')
  expect(html).not.toContain('data-slot="sidebar-content"')
  expect(html).not.toContain('__route_shell__')
  expect(readPreloads(html)).toEqual({ version: 1, preloads: [] })
  await page.goto('/no-such-page')
  await expect(
    page.getByRole('heading', { name: 'Page not found', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Acme' })).toBeVisible()
})

base(
  'unexpected JavaScript failures show a safe route error and recover on retry',
  async ({ page, context }) => {
    const fault = 'viewer is not defined'
    const pageErrors: string[] = []
    const developerMessages: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        developerMessages.push(message.text())
    })
    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window)
      window.fetch = (...args) => {
        const input = args[0]
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          location.href,
        )
        if (
          url.pathname === '/graphql' &&
          Reflect.get(window, '__acmeNextGraphQLFault')
        ) {
          Reflect.set(window, '__acmeNextGraphQLFault', false)
          throw new ReferenceError('viewer is not defined')
        }
        return nativeFetch(...args)
      }
    })
    await openWorkspace(context.request)
    await page.goto('/projects')
    await expect(
      page.getByText('Showing 6 of 10 projects', { exact: true }),
    ).toBeVisible()
    await page.evaluate(() =>
      Reflect.set(window, '__acmeNextGraphQLFault', true),
    )
    await page
      .getByRole('textbox', { name: 'Search projects', exact: true })
      .fill('Atlas')
    await expect(
      page.getByText('Unable to load this page', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Something went wrong. Please try again.', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', {
        name: 'Unable to load this page',
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.locator('body')).not.toContainText(fault)
    await expect(page.locator('body')).not.toContainText('ReferenceError')
    await expect(
      page.getByRole('link', { name: 'Sign in', exact: true }),
    ).toHaveCount(0)

    const reload = page.waitForRequest(
      (request) =>
        request.isNavigationRequest() &&
        request.resourceType() === 'document' &&
        request.frame() === page.mainFrame() &&
        new URL(request.url()).pathname === '/projects',
    )
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await reload
    await expect(
      page.getByRole('textbox', { name: 'Search projects', exact: true }),
    ).toHaveValue('Atlas')
    await expect(
      page.getByText('Showing 1 of 1 projects', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText('Unable to load this page', { exact: true }),
    ).toHaveCount(0)
    expect(
      developerMessages,
      'The original exception must remain available to developers',
    ).toEqual(expect.arrayContaining([expect.stringContaining(fault)]))
    expect(
      [...pageErrors, ...developerMessages].filter(
        (message) =>
          !message.includes(fault) &&
          !/^Warning: Error in route match: \/_app\/projects\b/.test(message),
      ),
      'Only diagnostics from the injected fault are expected',
    ).toEqual([])
  },
)

base(
  'the running Go GraphQL schema matches the Relay compiler schema',
  async ({ request }) => {
    const response = await request.post('/graphql', {
      data: { query: getIntrospectionQuery({ descriptions: false }) },
    })
    await expect(response).toBeOK()
    const result: { data: IntrospectionQuery; errors?: unknown[] } =
      await response.json()
    expect(result.errors).toBeUndefined()
    const source = await readFile(
      new URL('../../schema.graphql', import.meta.url),
      'utf8',
    )
    expect(
      printSchema(lexicographicSortSchema(buildClientSchema(result.data))),
    ).toBe(printSchema(lexicographicSortSchema(buildSchema(source))))
  },
)
