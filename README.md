# Fantasy AutoCoach

Fantasy AutoCoach is an open-source application that helps users manage Yahoo Fantasy Sports teams. It provides a web UI for account and team settings and backend services that schedule and perform lineup optimizations.

The hosted application is available at [fantasyautocoach.com](https://fantasyautocoach.com/).

## Repository layout

- `client/` — Angular web application.
- `common/` — shared types and services.
- `server/core/` — lineup optimization and shared server-domain logic.
- `server/api/` — read-oriented API service.
- `server/mutation-api/` — authenticated mutation API for actions that can change team state.
- `server/functions/` — Firebase Functions and scheduled work.
- `ops/` — deployment orchestration and environment configuration.
- `infrastructure/opentofu/` — Google Cloud and Firebase infrastructure definitions.

The client talks to the API through Firebase Hosting rewrites in production. The server services use Firebase and Google Cloud integrations; Yahoo and SendGrid are used only by functionality that needs external fantasy-data or email access.

## Local development

### Prerequisites

- [Bun](https://bun.sh/) using the version in [`.bun-version`](.bun-version).
- [Docker](https://docs.docker.com/get-docker/) for container builds.
- [Firebase CLI](https://firebase.google.com/docs/cli) for the Emulator Suite.
- A dedicated development Firebase project and web app for end-to-end local development.

Google Cloud, Yahoo, SendGrid, and production Firebase credentials are not required for the unit-test suite. Maintainer-only deployment prerequisites are documented in [`ops/README.md`](ops/README.md).

### Install dependencies

```bash
bun install --frozen-lockfile
```

### Run emulators and the application

Start the Firebase Emulator Suite in one terminal:

```bash
bun run dev:emulators
```

Create local environment files from the examples. Use a dedicated development project or emulator configuration; never copy production values:

```bash
cp server/api/.env.example server/api/.env
cp client/.env.example client/.env
```

Fill the client Firebase settings from the development Firebase web app, then start the API and client:

```bash
bun run dev
```

The client is served by the Angular development server and the API listens on its configured local port. The emulator ports are defined in [`firebase.json`](firebase.json). You can start either process independently with `bun run dev:api` or `bun run dev:client`.

## Checks and builds

Run the required local CI checks:

```bash
bun run checks:ci
```

Build the shared packages, API, Functions, and client:

```bash
bun run build
bun run build:api
bun run --cwd server/functions build
bun run build:client
```

Build both container images locally:

```bash
bun run container:build:cloud
bun run container:build:mutation-api:cloud
```

The test suite uses mocks, fixtures, synthetic data, and browser tests. It intentionally skips live integration tests unless they are explicitly enabled. Do not enable live tests with production credentials.

## Contributions and security

Contributions are welcome through forks and pull requests. All pull requests require maintainer approval and passing CI; see [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, review, and testing expectations.

Do not commit credentials or expose production resources to contributor code. Use the process in [`SECURITY.md`](SECURITY.md) for private vulnerability reports.

## Deployment

Production deployment is maintainer-controlled. Credentialed deployment workflows run only from the protected `main` branch or an authorized manual dispatch; pull requests run unprivileged validation and do not receive production secrets. There are no automatic production or Firebase preview deployments for pull requests; CI uploads a short-lived client build artifact instead. See [`ops/README.md`](ops/README.md) and [`infrastructure/opentofu/README.md`](infrastructure/opentofu/README.md) for operational details.

## License

Auto Coach is distributed under the [GNU General Public License v3.0](LICENSE.md).
