# Acmekit

Acmekit is a Go application template with an embedded React frontend, GraphQL, cookie sessions, and server-side authorization.

Build it once and run one binary. The Acme demo includes a project workspace, a component gallery, and a session inspector. Signed-out visits start on the public Welcome page. Signed-in pages start with prebuilt loading layouts, including a shared layout for all project-detail URLs. Go embeds the session's initial GraphQL results in the response for Relay to use during hydration. The demo stores projects and sessions in memory.

## Run it locally

Requirements: **Go 1.26 or newer**, a supported Node.js release, and npm. **Node.js 24 LTS (24.11+) is recommended**; `package.json` records the supported Node ranges, including 22.18+ on Node 22. [just](https://github.com/casey/just) runs the complete development, build, and test workflows; native Go/npm equivalents are described below.

```sh
git clone https://github.com/gibbandit/acmekit.git
cd acmekit
just setup
just dev
```

Open **http://127.0.0.1:5173**, click **Continue**, and choose a role:

- **Maintainer** can create, edit, archive, and delete projects.
- **Member** can browse projects but cannot change them. Go enforces that restriction through OPA.

Each demo sign-in creates a separate seeded workspace. Projects and sessions live in the Go process and disappear when it stops. A new sign-in starts with fresh seed data.

Development starts Vite and an API-only Go build without production assets. To build and run the embedded application instead:

```sh
just build
./.build/acme --demo
```

Open **http://127.0.0.1:8080** for the embedded application. `just build` compiles production Relay operations and their persisted IDs, builds the frontend, and embeds the frontend and operation map in `.build/acme`. If development is still using 8080, launch the production binary with `--addr 127.0.0.1:8081` in a separate browser context. `just run` builds and launches the embedded application. Demo mode is explicit and requires a loopback listening address. Anyone able to reach a demo-enabled process can select a demo role; use it only with disposable sample data.

## Explore the application

| Page           | What it demonstrates                                                                          |
| -------------- | --------------------------------------------------------------------------------------------- |
| Overview       | Four compact project metrics above a recent-project table, backed by Relay.                   |
| Projects       | A project table with GraphQL search, status filters, cursor pagination, and project creation. |
| Project detail | A record-name heading, flat description and metadata columns, and edit/delete operations.     |
| Components     | Interactive controls, local AI interface previews, and theme radio rows.                      |
| Session        | Account and logout, server-backed permissions, and workspace details.                         |

Light, dark, and system themes are available from the sidebar account menu's Appearance radio group and the Components page. `next-themes` saves the preference under `acme-theme` and temporarily suppresses transitions when switching themes. See [dark-mode integration](docs/design-system.md#tanstack-start-dark-mode) for the provider configuration.

The [preview gallery](docs/previews/README.md) shows the demo workspace in both themes.

## Stack

| Layer                 | Choice                                    | Responsibility                                                                            |
| --------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Frontend application  | React, TypeScript, TanStack Start         | One SPA with public sign-in HTML and prerendered workspace loading layouts.               |
| Browser runtime       | TanStack Redact 0.3.1                     | React-compatible browser hydration and rendering.                                         |
| Navigation            | TanStack Router                           | File-based routes and navigation.                                                         |
| URL query state       | TanStack Router                           | Projects search, filters, and visible pagination window.                                  |
| GraphQL client        | Relay and the Relay compiler              | Typed operations, fragments, persisted IDs, bootstrap replay, and normalized client data. |
| Frontend build        | Vite and Oxc                              | React Compiler, Relay transforms, development server, and production assets.              |
| Styling and controls  | Tailwind CSS 4 and shadcn/ui with Base UI | Theme colors, typography, panels, and accessible controls.                                |
| Theme state           | next-themes 0.4.6                         | Saved or system appearance, root theme class, and coordinated theme changes.              |
| Forms                 | TanStack Form and Zod                     | Form state and client-side validation.                                                    |
| Project tables        | TanStack Table v9                         | Column definitions and row/cell rendering through the shared shadcn Table primitives.     |
| HTTP                  | Go `net/http` and chi                     | API and authentication routes; the route adapter selects embedded route HTML.             |
| GraphQL server        | `github.com/graphql-go/graphql`           | Queries, mutations, and the Relay-compatible schema.                                      |
| Sessions              | SCS v2                                    | Opaque session cookies backed by an in-memory store.                                      |
| Permissions           | Embedded OPA / Rego                       | Member and maintainer decisions enforced in Go.                                           |
| CSRF protection       | Go `http.CrossOriginProtection`           | Origin checks on state-changing browser requests.                                         |
| Optional GitHub login | `golang.org/x/oauth2`                     | Server-side authorization-code flow with state and PKCE.                                  |

React imports, types, and peer dependencies stay in place. Redact's official Vite plugin replaces React and ReactDOM in the browser in development and production. React handles development HTML and build-time prerendering; the standard Start client entry sets Redact's documented `identifierStrategy: 'react'` for matching hydration IDs. Default features remain enabled for Relay, Suspense, hydration, portals, and error boundaries. Browser rendering is synchronous; see the [runtime integration](https://tanstack.com/redact/latest/docs/vite-plugin#native-react-for-ssr) and [compatibility limits](https://tanstack.com/redact/latest/docs/compatibility).

Vite's official React plugin uses `react({ compiler: true })` with `oxc-transform-react` for native React Compiler, JSX, and Fast Refresh. Upstream marks the Rust compiler experimental. The community [unplugin-relay](https://github.com/PatrykWalach/unplugin-relay) adapter runs Oxc's Relay transform first, preserving JSX for the compiler and selecting the isolated Relay artifact paths. The React and Relay transforms use Oxc; ESLint and TanStack's internals still depend on Babel. ESLint's React Hooks rules report unsupported patterns. See [Vite's native compiler setup](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#rust-react-compiler) and [Oxc's compiler documentation](https://oxc.rs/docs/guide/usage/transformer/react-compiler.html).

The running application needs only the Go binary. Node.js is a build and development dependency. The TypeScript build adapter derives the HTML entries and Go routing manifest from TanStack's route tree, so adding a page does not require a separate Go route list. The build creates a loading document for each workspace route, plus one shared public sign-in document. Overview uses `index.html`; the native SPA fallback is `_shell.html`. Go selects the document using the session. Project-detail HTML is shared across slugs, and all entries load the same client application.

Project URLs use stable, workspace-unique `Project.slug` values, such as `/projects/atlas-design-system`. Duplicate names receive suffixes such as `-2`; renaming keeps the original slug, and deleted projects' slugs stay reserved within that workspace. The `new` slug is reserved for `/projects/new`, so a project named New receives `new-2`. Relay's opaque `id` still identifies records for node lookups and mutations. Existing encoded-ID URLs continue to resolve within the current workspace, then the browser replaces them with the canonical detail or edit URL while preserving query parameters and the hash.

Routes keep their `graphql` tag inside one typed `defineRouteQuery` declaration in `route.tsx`. Its `.loader`, `.preload`, and `.request` share the operation and variable bindings between native Router loaders, Go metadata, and Relay readers. Generated response types use `@relay`; the Oxc Relay transform selects the isolated development or production artifact directory. The shared Workspace query belongs to `_app`; page queries live on their routes. Normal prerendering emits only operation IDs and binding descriptors in `script#route-preloads`, and Go reads them at startup. Go resolves dynamic values from the actual request URL, executes the queries with the same session and OPA checks as the API, then adds a private JSON bootstrap to the HTML. Relay consumes each response once; later navigation, pagination, and mutations use `/graphql`. Production requests send persisted SHA-256 IDs, resolved through an operation map embedded outside the public filesystem. Raw query text remains accepted for tools. The document uses `private, no-store` caching because its bootstrap can contain private data. See [Static routing](docs/static-routing.md) for the full contract and [adding a page](docs/static-routing.md#adding-or-renaming-a-page).

Each Router instance owns one Relay Environment, available to native route loaders through context and to components through its provider `Wrap`. Loaders use the small `fetchRouteQuery` adapter around native `fetchQuery.subscribe`, tied to the loader's abort signal, to warm Relay's normalized store; native deferred readiness lets page controls render while data regions wait under Suspense, and `useLazyLoadQuery` reads that store with its default `store-or-network` policy and can fetch if data is missing. Create refreshes through synchronous Router invalidation; edits merge their native Relay mutation payload and clear inactive Router matches, while deletes use `@deleteRecord`, clear matches, and navigate to Projects. The private npm workspace `@acmekit/route-adapter` owns route planning, preload declarations, and bootstrap replay. Its `/vite` entry provides build tooling and its `/runtime` entry provides browser integration. The Go `routeadapter` package consumes the same contract. Acme supplies its queries, authentication, GraphQL transport, validation errors, and initial-layout choice.

Projects keeps search, filters, and its visible batch count in native TanStack Router query state. A local search draft updates immediately and replaces the URL after 220ms; navigation cancels pending edits. Enter, status changes, and Clear filters commit immediately and push history entries. The committed URL drives Relay through the same bindings Go uses for bootstrap. The URL's `after` binds GraphQL `anchor`, while the initial GraphQL `after` is always `null`; Relay advances that pagination cursor while keeping the anchor fixed. Filter changes clear `page` and URL `after`, preserving the batch size, unrelated parameters, and hash.

`page` is a positive batch count, defaulting to 1; `first` remains the batch size (1–50), and `after` remains the initial cursor anchor. Successful Load more pushes the next `page` into history; a failed request leaves the URL unchanged. Back/Forward selects up to `first * page` cached rows. Reloading or sharing an expanded URL bootstraps only the initial batch, then uses normal Relay pagination to restore the requested window. `page` is browser state, not a GraphQL or bootstrap variable. Components tabs use native TanStack Router page routes, ordered Controls (`/components`), AI Elements (`/components/ai`), then Appearance (`/components/appearance`). Each starts with the correct tab selected in its prebuilt HTML, including direct visits and reloads; browser history and unrelated query parameters are preserved. The AI Elements tab previews chat, activity, and approval patterns locally, without a model connection.

New project uses `/projects/new` and the inherited Workspace query. Edit project uses `/projects/$projectSlug/edit`, whose colocated `ProjectEditPageQuery` binds `slug` to the path's `projectSlug` and spreads the shared form's `ProjectForm_project` fragment. Its `store-or-network` loader reuses normalized detail data when available. Both pages use native automatic route splitting and the shared `ProjectForm`.

New project and Edit project actions are native Links that preserve query parameters and mark the form's history entry with `projectFormSource`. Cancel and successful submission return to that source through browser history when available. Direct New visits replace the form entry with Projects, and direct Edit visits replace it with canonical project details. Form fields receive no automatic focus on desktop or touch devices. Legacy `/#new`, `/projects#new`, and project-detail `#edit` URLs use native `beforeLoad` replacement redirects to the corresponding form page, preserving query parameters.

Public `#login`, `/session#role`, and `/components#dialog` continue to control their dialogs. Opening adds a history entry, and closing returns to the prior entry or replaces a directly linked hash with its fallback. Query parameters remain intact. Loading HTML keeps these dialogs closed, and interactive pages open them when their providers and permissions allow it.

The UI uses shadcn's standard source layout in `web/src/components/ui/`, with `base-luma` and aliases recorded in `components.json`. The workspace adapts the official [sidebar-07](https://ui.shadcn.com/r/styles/base-luma/sidebar-07.json) block, and project tables compose the [Data Table](https://ui.shadcn.com/docs/components/base/data-table) pattern with actual application data. Route files own page composition; shared workspace and authentication components own the shell and public sign-in view. Layouts use Tailwind utilities and the standard component APIs.

The theme uses blue primary actions with white labels, a semantic palette, and neutral content surfaces. Self-hosted Archivo supplies page headings. Instrument Sans supplies body text, controls, card titles, and metrics. The [design-system guide](docs/design-system.md) documents the palette, typography, and component styles.

The workspace uses a fixed 240px Sidebar with theme-adaptive neutral fill at 92% opacity, 24px backdrop blur, and framed selected rows. Its titlebarless desktop view is bounded at 1280px, and mobile uses a 56px brand/menu row with a full-screen drawer. Overview keeps four separate metric Cards, giving Total more width from `xl` and larger type than the status counts. Page headings, table text, and pagination share their outside edges. Controls gives editing examples a wider column and groups results in ruled Card footers. AI pairs a larger conversation area with an 18rem supporting rail, and Appearance aligns its legend beside native choice rows on wider containers. Session keeps three Cards with an 18rem Account rail beside stacked Permissions and Workspace. Project Detail combines the record name and status above three-column metadata and a bounded description. New and Edit remain dedicated flat form pages. Public sign-in centers the original full mark, Welcome text, and Continue action in a 384px column. Shared pending markup preserves the page structure and control geometry. The [layout guide](docs/design-system.md#workspace-layout-and-loading) owns dimensions, spacing, and responsive details.

## Commands

Run these commands from the project root. `justfile` coordinates Go and frontend workflows. The npm scripts run frontend tools.

| Command                         | Effect                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `just setup`                    | Install locked frontend dependencies, Go modules, and the pinned local Air binary.             |
| `just dev`                      | Start API-only Go development and Vite concurrently, without a production build.               |
| `just dev-api`                  | Start only the API watcher, without a frontend build.                                          |
| `just build`                    | Build the production frontend and embedded Go binary in order.                                 |
| `just test`                     | Check source with Prettier, ESLint, React Doctor and TypeScript, then run unit and race tests. |
| `just e2e`                      | Build the embedded application, then run the complete Playwright suite.                        |
| `just run`                      | Build and launch the embedded demo.                                                            |
| `just clean`                    | Remove generated build and test output after stopping development and Relay watch.             |
| `npm run dev:web`               | Compile development Relay artifacts, then start Vite with React Fast Refresh.                  |
| `npm run relay`                 | Compile development Relay artifacts with full query text.                                      |
| `npm run relay:watch`           | Run Relay's native development watcher; this optional command requires Watchman.               |
| `npm run relay:production`      | Compile production Relay artifacts and persisted SHA-256 operations.                           |
| `npm run ui -- add <component>` | Add a component using the installed shadcn CLI and root `components.json`.                     |
| `npm run build:web`             | Compile production Relay artifacts, then build route shells and client assets.                 |
| `npm run typecheck`             | Type-check the development application and tools using the existing Relay artifacts.           |
| `npm run typecheck:production`  | Type-check the production configuration and E2E code after a production build.                 |
| `npm run format`                | Format authored source, configuration, and documentation with pinned Prettier.                 |
| `npm run format:check`          | Check Prettier formatting without writing files.                                               |
| `npm run lint`                  | Run ESLint with the recommended Router, React Hooks, and Relay TypeScript rules.               |
| `npm run lint:fix`              | Apply available ESLint fixes; review the resulting changes.                                    |
| `npm run doctor`                | Run a complete local React Doctor audit, including compiler diagnostics.                       |
| `npm test`                      | Run the TypeScript route-generator and preload tests with Vitest.                              |
| `npm run test:watch`            | Run Vitest in watch mode.                                                                      |
| `npm run test:e2e`              | Run Playwright Test against a freshly built `.build/acme`.                                     |

Stop development (Air and Vite) and any optional Relay watcher before running `just clean`; it removes their working directories.

Development starts without a production build. `just dev` uses `concurrently` to start Air and `npm run dev:web`; the frontend command explicitly compiles development Relay artifacts before Vite starts. Open **http://127.0.0.1:5173** while developing. Port 5173 is Vite's default; its proxy forwards `/graphql`, `/auth`, and `/healthz` to Go on port 8080. Playwright uses a separate built server on port 4175.

If Go reports that its address is already in use, stop the existing process or restart development with `ACME_ADDR=127.0.0.1:8082 just dev`. Air and Vite's proxy use the same address; the frontend remains on 5173.

Air watches Go source, embedded Rego policy, and Go module files, then rebuilds and restarts the API with `-tags dev`. That build uses `web/assets_dev.go`, which supplies no frontend filesystem or persisted-operation map; the same Go server serves its normal API and returns 404 for page requests. `just setup`, `just dev`, and `just dev-api` install the pinned Air version into `.build/tools` using native `go install`, then run that binary directly. Go caches its compilation, no global PATH changes are needed, and Air's tool dependencies stay outside the application module. Vite handles React and CSS updates. Before serving development HTML, its server forwards the request cookie to Go to choose the initial sign-in or workspace layout; only that layout and public sign-in options are serialized. Its documents have no Go bootstrap, and normal browser Relay requests still load development data using full query text. Air's Go/Rego watch filter excludes frontend changes and the persisted-operation map, so frontend query edits do not restart Go or reset the demo session.

Go build outputs live in one ignored directory: `.build/acme` is the production executable, `.build/dev` is Air's disposable API output, and `.build/tools` contains Air itself. The development and production executables remain separate, so building production cannot replace the running API. Air cleans only `.build/dev` when it exits. `just clean` removes the whole `.build` directory after development stops; the next development command reinstalls the cached tool automatically.

Run `npm run relay` after changing GraphQL operations. Optional continuous compilation uses `npm run relay:watch`, which invokes `relay-compiler --watch` directly. It requires Watchman (`brew install watchman` on macOS); ordinary development and builds do not require it.

`relay.config.json` writes development artifacts to `web/src/__generated__`. `relay.config.prod.json` writes persisted artifacts to the ignored, rebuilt `web/build/__generated__` directory. Each uses Relay's native `sources`/`projects` configuration with a project `output`, so the compiler creates missing artifact directories itself. Separate configurations keep development independent of production persistence. One `vite.config.ts` selects development artifacts for the dev server and production artifacts for builds and previews. It discovers route shells only during builds and does not import production requests or read the persisted map while loading the configuration. Production builds can run while Vite and the optional development Relay watcher remain active. Run E2E tests after the production frontend and Go binary have been built.

Without just, install dependencies with `go mod download` and `npm ci`, then run each side in a separate terminal:

```sh
GOBIN="$PWD/.build/tools" go install github.com/air-verse/air@v1.67.4
./.build/tools/air
```

```sh
npm run dev:web
```

Set the same `ACME_ADDR` in both terminals when choosing another API port. Go restarts reset this demo's in-memory sessions and project data; refresh and sign in again after a backend reload.

After building, run the binary directly to choose its options:

```sh
./.build/acme --demo --addr 127.0.0.1:8080
./.build/acme --help
./.build/acme --version
```

Run `just` to list its recipes. The recipes show their Go and npm steps explicitly. `just test` needs no production build; TypeScript checking itself does not regenerate artifacts. ESLint uses Babel to parse TypeScript syntax for its plugins; `tsc` owns type checking. Vite uses native Oxc application transforms. Generated artifacts and build/test outputs are excluded from formatting and linting. React Doctor is an additional full-project audit; its command disables remote scoring and supply-chain lookups. Review its static warnings against the actual framework composition and browser tests. For a native production build, run `npm run build:web`, then `CGO_ENABLED=0 go build -buildvcs=false -trimpath -o .build/acme ./cmd/acme`. Go creates the binary's output directory itself.

### Testing the built application

From the project root:

```sh
just test
just build
npm run typecheck:production
go test -race ./cmd/... ./internal/... ./routeadapter ./web
npm exec -- playwright install chromium
npm run test:e2e
```

Install Chromium once after setup, and again when a Playwright upgrade requires it. CI uses `playwright install --with-deps chromium` to install the browser's system dependencies too.

Go's `testing` and `net/http/httptest` cover the API, sessions, policy, OAuth, pagination, static routes, persisted operations, and bootstrap responses. Those backend tests use in-memory fixtures. The production checks include the CLI and its embedded web package, so production assets and the operation map must exist. Add `-tags dev` for the API-only variant without those inputs; `go test ./internal/...` also has no frontend-build requirement. The workflows name the application's Go packages explicitly so Go does not scan source shipped inside npm dependencies. CI builds the production application, checks both TypeScript configurations, and runs both Go variants before Playwright.

Playwright Test is written in TypeScript. Its standard `webServer` configuration starts the real built Go binary on a loopback port and stops it after the tests. It covers maintainer and member flows, fixed and dynamic initial HTML, private bootstrap data, URL variables, hydration without initial browser GraphQL fetches, fresh reads after mutations, not-found handling, and runtime GraphQL schema parity with the Relay compiler's SDL.

CI runs the same build and test checks on Node.js 24 and uploads the Playwright report on failure when one is available.

## Configuration

The server reads these environment variables. It does not load a `.env` file automatically.

| Variable                    | Default                              | Purpose                                                                  |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `ACME_ADDR`                 | `127.0.0.1:8080`                     | Listening address; `--addr` takes precedence.                            |
| `ACME_PUBLIC_URL`           | `http://` plus the listening address | Browser-facing origin used for OAuth redirects and cookie configuration. |
| `ACME_GITHUB_CLIENT_ID`     | Empty                                | Enable GitHub OAuth together with the client secret.                     |
| `ACME_GITHUB_CLIENT_SECRET` | Empty                                | GitHub OAuth client secret, used only by Go.                             |

Copy `.env.example` to `.env` to configure the server. Git ignores `.env` and its local variants. Keep real credentials in server-side environment variables.

### Optional GitHub login

1. Register a GitHub OAuth application with homepage `http://127.0.0.1:8080` and callback `http://127.0.0.1:8080/auth/github/callback`.
2. Copy `.env.example` to `.env` and fill in the client ID and secret.
3. Load the file into your shell and start the built server:

```sh
set -a
. ./.env
set +a
./.build/acme
```

GitHub sign-in exchanges the authorization code in Go and creates the same SCS session consumed by Relay's `viewer` query. Every GitHub account gets a personal workspace and the maintainer role in this template. Its data remains in memory; this is a starting point for implementing your own account provisioning and permission model.

For a different origin, set `ACME_PUBLIC_URL` and register the matching callback URL. Non-loopback OAuth origins must use HTTPS. HTTPS public URLs enable the cookie's `Secure` attribute.

For Vite development, use `ACME_PUBLIC_URL=http://127.0.0.1:5173` and register `http://127.0.0.1:5173/auth/github/callback` as the callback.

## Project layout

| Path                                             | Contents                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `cmd/acme/`                                      | CLI entry point and server startup.                                                                       |
| `package.json` / `package-lock.json`             | Root npm commands and locked dependencies for the project.                                                |
| `tsconfig.json` / `tsconfig.prod.json`           | Development and production TypeScript configurations.                                                     |
| `.air.toml`                                      | Go development watcher, build command, and graceful restart settings.                                     |
| `.build/`                                        | Ignored Go executables and development tool; generated by the commands above.                             |
| `internal/`                                      | GraphQL, authentication, project storage, and authorization policy.                                       |
| `schema.graphql`                                 | Frontend GraphQL contract used by the Relay compiler.                                                     |
| `web/src/`                                       | Routes, components, Relay operations, and application styles.                                             |
| `web/src/routes/`                                | Native directory routes containing their query tags, Route declaration, page, and pending view.           |
| `packages/route-adapter/`                        | Private npm workspace with explicit `/vite` and `/runtime` exports for the route/bootstrap contract.      |
| `routeadapter/`                                  | Go route matching, metadata validation, URL variable resolution, bootstrap generation, and asset serving. |
| `web/src/lib/route-query.ts`                     | Acme validation-error configuration for the shared typed query declarations.                              |
| `packages/route-adapter/src/preloads.ts`         | Shared Go/browser URL variable-binding types and resolver.                                                |
| `web/src/features/projects/project-variables.ts` | Acme's project search, status, and pagination bindings shared by the client and build.                    |
| `packages/route-adapter/src/route-preloads.ts`   | Typed route preload declarations, descriptor compilation, and document metadata hydration.                |
| `web/src/router.tsx` / `web/src/lib/relay.ts`    | Router-owned Relay Environment/provider and GraphQL network transport.                                    |
| `web/src/features/auth/`                         | Shared sign-in view/dialog and presentation types.                                                        |
| `web/src/features/projects/`                     | Shared project forms, table, status controls, loading content, and URL bindings.                          |
| `web/src/lib/search-params.ts`                   | Literal query-string parsing and serialization for TanStack Router, including repeated keys.              |
| `web/src/__generated__/`                         | Development Relay artifacts, including full query text.                                                   |
| `web/build/__generated__/`                       | Ignored production Relay artifacts with persisted IDs; rebuilt before production bundling.                |
| `web/persisted-queries.json`                     | Relay's generated SHA-256 operation map, embedded separately from public assets.                          |
| `web/tooling/`                                   | Differential tests comparing the generated route plan and Go serving with native TanStack matching.       |
| `vite.config.ts`                                 | Shared Vite configuration with development, build, and preview settings.                                  |
| `web/assets.go` / `web/assets_dev.go`            | Production frontend embeds and the asset-free `dev` build variant.                                        |
| `web/e2e/`                                       | Playwright Test browser flows, initial HTML/hydration checks, and schema parity.                          |
| `playwright.config.ts`                           | Chromium and the built Go application’s test-server configuration.                                        |
| `web/src/components/ui/`                         | shadcn source for the sidebar, cards, tables, form controls, dialogs, and other shared components.        |
| `web/src/components/workspace/`                  | Shared workspace layout, navigation, account menu, and loading composition.                               |
| `web/src/components/`                            | Generic composed controls, branding, errors, and theme support.                                           |
| `web/src/lib/utils.ts`                           | The shared `cn` export.                                                                                   |
| `web/src/styles/theme.css`                       | Shared design tokens and Tailwind theme mappings.                                                         |
| `web/src/styles.css`                             | Imports, Acme's primary/hover/foreground mapping in both modes, and base styles.                          |
| `web/public/`                                    | Static brand assets.                                                                                      |
| `components.json`                                | shadcn configuration: `base-luma`, TypeScript, CSS variables, and `@/` aliases.                           |
| `web/dist/client/`                               | Generated client assets, route HTML, and `route-shells.json`, embedded into Go.                           |
| `docs/`                                          | Architecture and template customization notes.                                                            |

The frontend source follows this layout:

```text
web/src/
  routes/
    __root.tsx
    _app/
      route.tsx
      index/route.tsx
      projects/route.tsx
      projects_/new/route.tsx
      projects_/$projectSlug/route.tsx
      projects_/$projectSlug_/edit/route.tsx
      components/route.tsx
      session/route.tsx
  features/{auth,projects}/
  components/{ui,workspace}/
  lib/
  hooks/
  router.tsx
  routeTree.gen.ts
```

Add a page in a directory `route.tsx`, keeping its query tag, `Route`, page component, and pending view together. Declare the native loader and any Go `staticData.preloads` bindings there; move only genuinely shared code into features or shared components. See the [page extension guide](docs/static-routing.md#adding-or-renaming-a-page) for the complete pattern.

Read [Architecture](docs/architecture.md) for the request and session flow, [Static routing](docs/static-routing.md) for the HTML adapter, or [Customize the template](docs/customization.md) to start a new application. The frontend, build adapter, Vitest tests, and Playwright tests use TypeScript.

## Scope

The Go binary serves an embedded SPA with a prebuilt public sign-in page, workspace loading layouts, and private bootstrap data for authenticated routes. React renders workspace data in the browser. Projects and sessions use in-memory storage. See the [storage and identity extension points](docs/architecture.md#extension-points) when adapting the template.

## License

The application is available under the [MIT license](LICENSE). Retain applicable upstream copyright and license notices when reusing assets, shadcn component and block source, or next-themes.

Instrument Sans and Archivo are distributed under the SIL Open Font License 1.1, retained from their pinned Fontsource packages. [Instrument Sans license](web/public/fonts/OFL-Instrument-Sans.txt), [Archivo license](web/public/fonts/OFL-Archivo.txt).
