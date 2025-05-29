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
   - Copy `server/api/.env.example` to `server/api/.env` (if available)
   - Configure the following environment variables:
     - `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
     - `FIREBASE_AUTH_EMULATOR_HOST` - Firebase Auth emulator host (for local dev)
     - `FIRESTORE_EMULATOR_HOST` - Firestore emulator host (for local dev)
     - `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account key file (for local dev)

## Development Setup

### Quick Start (All Services)

```bash
# Start all development services
bun run dev
```

This will start:
- Angular development server on `http://localhost:4200`
- Hono API server on `http://localhost:3000`
- Firebase emulators (Auth, Firestore, Functions)

### Individual Services

#### 1. Start Firebase Emulators

```bash
# Start Firebase emulators (Auth, Firestore, Functions)
firebase emulators:start
```

The emulators will run on:
- Auth: `http://localhost:9099`
- Firestore: `http://localhost:8080`
- Functions: `http://localhost:5001`

#### 2. Start Hono API Server

```bash
# In a new terminal
cd server/api
bun run dev
```

The API server will run on `http://localhost:3000` with hot-reloading.

#### 3. Start Angular Client

```bash
# In a new terminal
cd client
bun run start
```

The client will run on `http://localhost:4200` and automatically open in your browser.

## Environment Configuration

### Local Development

For local development, the client should connect to:
- API Server: `http://localhost:3000`
- Firebase Emulators: Configure in `client/src/environments/environment.ts`

### Angular Environment

Update `client/src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  firebase: {
    // Firebase config
  },
  apiBaseUrl: 'http://localhost:3000', // Hono server
  useEmulators: true
};
```

## Testing

### Run All Tests

```bash
bun run test
```

### Individual Package Tests

```bash
# Client tests
cd client && bun run test

# Server tests  
cd server/api && bun run test

# Functions tests
cd server/functions && bun run test

# Common tests
cd common && bun run test
```

## Code Quality

### Run All Checks

```bash
bun run all-checks
```

This runs:
- Biome linting and formatting
- TypeScript type checking
- Tests
- Build verification

### Fix Code Issues

```bash
bun run fix
```

### Type Checking

```bash
bun run types
```

## Building

### Build All Packages

```bash
bun run build
```

### Individual Builds

```bash
# Client
cd client && bun run build

# Server API
cd server/api && bun run build

# Functions
cd server/functions && bun run build
```

## API Development

### Hono Server

The Hono server provides type-safe RPC endpoints:

- **GET** `/api/teams` - Fetch user's teams
- **GET** `/api/schedules` - Fetch game schedules
- **GET** `/api/transactions` - Get transaction suggestions
- **POST** `/api/transactions` - Process transactions
- **POST** `/api/feedback` - Send feedback email
- **PUT** `/api/teams/:teamKey/lineup/setting` - Update lineup setting
- **PUT** `/api/teams/:teamKey/lineup/paused` - Pause/resume lineup

### Authentication

All API endpoints require Firebase Auth ID tokens in the `Authorization: Bearer <token>` header.

### Adding New Endpoints

1. Add endpoint definition to `server/api/src/api-endpoints.ts`
2. Create or update router in `server/api/src/<domain>/<domain>.ts`
3. Implement business logic in `server/core/src/<domain>/`
4. Add request/response types to `common/src/types/`
5. Update client to use new endpoint

## Firebase Functions

Remaining Firebase Functions handle scheduled/triggered tasks:

- `authBlock.*` - Authentication blocking functions
- `lineup.*` - Lineup optimization scheduling
- `transactions.schedulecalcpositionalscarcity` - Positional scarcity calculation

### Local Function Development

```bash
cd server/functions
bun run serve
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Change ports in respective config files
2. **Firebase emulator issues**: Run `firebase emulators:kill` then restart
3. **TypeScript errors**: Run `bun run types` to check for issues
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

## VS Code Setup

Recommended extensions:
- Biome (code formatting)
- Angular Language Service
- TypeScript and JavaScript Language Features
- Firebase Explorer

Workspace settings are configured in `.vscode/settings.json`.

## Next Steps

- Review [Architecture Documentation](./README.md)
- Check [Deployment Guide](./DEPLOYMENT.md) (when available)
- See [Contributing Guidelines](./CONTRIBUTING.md) (when available)