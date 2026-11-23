# List the available workflows.
default:
    @just --list

# Install locked dependencies and the pinned Go development tool.
setup: tools
    npm ci
    go mod download

# Start the API watcher and frontend without a production build.
dev: tools
    npm exec -- concurrently --kill-others --names api,web "./.build/tools/air" "npm run dev:web"

# Start only the API watcher, without frontend assets.
dev-api: tools
    ./.build/tools/air

# Install Air locally without adding its dependencies to the application module.
[private]
tools:
    GOBIN="{{justfile_directory()}}/.build/tools" go install github.com/air-verse/air@v1.67.4

# Build the frontend and embed it in the Go binary.
build:
    npm run build:web
    CGO_ENABLED=0 go build -buildvcs=false -trimpath -o .build/acme ./cmd/acme

# Check source and run tests without production assets.
test:
    npm run format:check
    npm run relay
    npm run lint
    npm run doctor
    npm run typecheck
    npm test
    go test -tags dev -race ./cmd/... ./internal/... ./routeadapter ./web

# Build and run the complete browser suite.
e2e: build
    npm run test:e2e

# Build and run the embedded demo.
run: build
    ./.build/acme --demo

# Remove generated output after stopping development and Relay watch.
clean:
    rm -rf .build web/dist web/.tanstack web/.output web/build web/test-results web/playwright-report web/coverage
