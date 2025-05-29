# Fantasy AutoCoach Development Guide

This guide explains how to set up and run the Fantasy AutoCoach application in development mode.

## Architecture Overview

The application is structured as a monorepo with the following packages:

- **`client/`** - Angular single-page application (frontend)
- **`server/api/`** - Hono server for API endpoints (backend)
- **`server/functions/`** - Firebase Functions for scheduled/triggered tasks
- **`server/core/`** - Shared business logic and services
- **`common/`** - Shared types, schemas, and utilities

## Prerequisites

- [Bun](https://bun.sh/) - JavaScript runtime and package manager
- [Firebase CLI](https://firebase.google.com/docs/cli) - For emulators and deployment
- [Node.js 22+](https://nodejs.org/) - Required for Firebase Functions

## Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd auto-coach
   ```

2. **Install dependencies:**
   ```bash
   bun install
   ```

3. **Set up environment variables:**
   - Copy `server/api/.env.example` to `server/api/.env`
   - Configure the following environment variables:
     - `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
     - `FIREBASE_AUTH_EMULATOR_HOST` - Firebase Auth emulator host (default: `localhost:9099`)
     - `FIRESTORE_EMULATOR_HOST` - Firestore emulator host (default: `localhost:6001`)
     - `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account key file (for production)
     - `NG_APP_API_BASE_URL` - API base URL for the client (e.g., `http://localhost:3000`)

## Development Setup

### Quick Start (All Services)

```bash
# Start all development services (API server + Angular client)
bun run dev
```

This will start:
- Angular development server on `http://localhost:4200`
- Hono API server on `http://localhost:3000`

For Firebase emulators, run separately:
```bash
# Start Firebase emulators (Auth, Firestore, Functions)
bun run dev:emulators
```

### Individual Services

#### 1. Start Firebase Emulators

```bash
# Start Firebase emulators (Auth, Firestore, Functions)
bun run dev:emulators
```

The emulators will run on:
- Auth: `http://localhost:9099`
- Firestore: `http://localhost:6001`
- Functions: `http://localhost:6003`
- Hosting: `http://localhost:6002`
- UI Console: `http://localhost:4000` (if enabled)

#### 2. Start Hono API Server

```bash
# Start API server only
bun run dev:api
```

The API server will run on `http://localhost:3000` with hot-reloading.

#### 3. Start Angular Client

```bash
# Start client only
bun run dev:client
```

The client will run on `http://localhost:4200` and automatically open in your browser.

## Environment Configuration

### Local Development

For local development, the client connects to:
- API Server: `http://localhost:3000`

### Client Configuration

The client uses environment variables through `import.meta.env`:

```typescript
// In client/src/app/hono-client-config.ts
const API_BASE_URL = import.meta.env.NG_APP_API_BASE_URL;
```

Set `NG_APP_API_BASE_URL=http://localhost:3000` for local development.

## Testing

### Run All Tests in Watch Mode

```bash
bun run test
```

### Run Tests in CI Mode

```bash
bun run test:ci
```

### Individual Project Tests

```bash
# Client tests (browser-based with Vitest Browser Mode)
bun run test:client

# Server tests (core + functions)
bun run test:server
```

## Code Quality

### Run All Checks

```bash
bun run all-checks
```

This runs:
- Biome linting and formatting (with fixes)
- All tests in CI mode
- TypeScript compilation

### Fix Code Issues

```bash
bun run fix
```

### Linting Only

```bash
bun run checks
```

## Building

### Build All Packages

```bash
bun run build
```

This compiles all TypeScript projects using the workspace TypeScript build.

### Individual Builds

```bash
# Client
cd client && bun run build

# Server API (built via workspace tsc)
# No individual build script (yet)

# Functions
cd server/functions && bun run build
```

## API Development

### Hono Server

The Hono server provides type-safe RPC endpoints:

- **GET** `/api/teams` - Fetch user's teams
- **PUT** `/api/teams/:teamKey/lineup/setting` - Update lineup setting
- **PUT** `/api/teams/:teamKey/lineup/paused` - Pause/resume lineup
- **GET** `/api/schedules` - Fetch game schedules
- **GET** `/api/transactions` - Get transaction suggestions
- **POST** `/api/transactions` - Process transactions
- **POST** `/api/feedback` - Send feedback email

### Authentication

All API endpoints require Firebase Auth ID tokens in the `Authorization: Bearer <token>` header.

### Adding New Endpoints

1. Add endpoint definition to `server/api/src/api-endpoints.ts`
2. Create or update router in `server/api/src/<domain>/<domain>.ts`
3. Implement business logic in `server/core/src/<domain>/`
4. Add request/response types to `common/src/types/`
5. Update client to use new endpoint

## Firebase Functions

Firebase Functions handle scheduled/triggered tasks:

- `authBlock.*` - Authentication blocking functions
- `lineup.*` - Lineup optimization scheduling
- `transactions.*` - Transaction-related functions

### Local Function Development

```bash
cd server/functions
bun run serve
```

This will build functions in watch mode and start the Firebase emulators.

## Troubleshooting

### Common Issues

1. **Port conflicts**: Change ports in `firebase.json` for emulators
2. **Firebase emulator issues**: Run `firebase emulators:kill` then restart
3. **TypeScript errors**: Run `bun run build` to check for compilation issues. If issues persist, try `bun run clean` to remove build artifacts, then try building again.
4. **Hot-reload not working**: Restart the specific service

### Reset Development Environment

```bash
# Kill all processes
firebase emulators:kill

# Clear node_modules and reinstall
rm -rf node_modules */node_modules
bun install

# Restart services
bun run dev
```
