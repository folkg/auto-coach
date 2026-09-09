# Contributing to Auto Coach

Thanks for helping improve Auto Coach. Contributions are welcome through forks and pull requests. You do not need repository write access, production access, or access to any third-party account to contribute.

## Before you start

1. Search existing issues and pull requests.
2. For a substantial change, open an issue first so the scope and design can be agreed on.
3. Fork the repository and create a focused branch from `main`.
4. Keep changes small enough to review and explain the user-visible or operational impact.

## Local setup

Auto Coach uses Bun. The required version is recorded in [`.bun-version`](.bun-version).

```bash
bun install --frozen-lockfile
```

The server and client can be run locally with the Firebase Emulator Suite and synthetic data. Start the emulators in one terminal:

```bash
bun run dev:emulators
```

For API development, copy [`server/api/.env.example`](server/api/.env.example) to `server/api/.env` and use a dedicated development Firebase project or the emulators. For client development, create `client/.env` with the Firebase web-app settings for that same development project and set:

```dotenv
NG_APP_API_BASE_URL=http://localhost:3000
```

Never copy [`client/.env.production`](client/.env.production) into a local development environment. Do not point contributor code at production Firebase resources.

Run the application processes in another terminal:

```bash
bun run dev
```

You may also run the API and client separately with `bun run dev:api` and `bun run dev:client`.

## Checks before opening a pull request

Run the same checks used by the required CI status:

```bash
bun run checks:ci
```

Useful additional checks are:

```bash
bun run build
bun run build:api
bun run --cwd server/functions build
bun run build:client
bun run container:build:cloud
bun run container:build:mutation-api:cloud
```

The formatter and linter are Oxc tools. Use `bun run fix` when you want to apply formatting and lint fixes automatically, then review the resulting changes.

Tests must use mocks, fixtures, synthetic data, or emulators. Tests must not use production credentials, real user data, live Yahoo mutations, SendGrid delivery, or production Firebase projects.

## Pull requests

A pull request should:

- explain the problem and the approach;
- identify behavior, schema, infrastructure, or deployment changes;
- include tests for observable behavior and document any tests that cannot run locally;
- update documentation or examples when setup or behavior changes;
- avoid unrelated formatting or generated-file changes; and
- disclose security, privacy, migration, and rollback considerations.

All pull requests require approval from the repository maintainer, `@folkg`, before they can merge. Conversations must be resolved and required CI must pass. Pull requests are merged using squash merging. Changes to workflows, deployment tooling, infrastructure, authentication, Firestore rules, and other sensitive paths receive maintainer review through [`CODEOWNERS`](.github/CODEOWNERS).

Do not use `pull_request_target` or add production secrets to a pull-request workflow. Pull-request workflows run untrusted contributor code and must remain safe without credentials. Pull requests do not receive automatic Firebase previews; CI may upload a short-lived build artifact for inspection. Production deployment is performed only by the maintainer from the protected `main` branch or through an explicitly authorized manual deployment.

## Commit and license expectations

There is no CLA or DCO requirement at present. By submitting a contribution, you agree that it may be distributed under the repository's [GPL-3.0 license](LICENSE.md). Do not include code or assets whose license is incompatible with GPL-3.0.

## Questions

Open an issue for public questions about the project. Report security issues privately using the process in [`SECURITY.md`](SECURITY.md).
