# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dockge is a self-hosted Docker Compose stack manager with a web UI. It manages `compose.yaml` files on disk (not in the database) and supports managing stacks across multiple Docker hosts via a multi-agent architecture.

- **Node.js >= 22.14.0**, ESM (`"type": "module"`)
- **Frontend**: Vue 3 + Vite + Bootstrap Vue Next + Socket.IO Client
- **Backend**: Express + Socket.IO + RedBean ORM (SQLite/MySQL) + node-pty
- **Shared code**: `common/` directory imported by both frontend and backend

## Commands

```bash
npm run dev              # Frontend (port 5000) + backend (port 5001) concurrently
npm run dev:frontend     # Vite dev server only (port 5000)
npm run dev:backend      # tsx watch with --inspect (port 5001)
npm run build:frontend   # Vite production build → frontend-dist/
npm run lint             # ESLint check on **/*.{ts,vue}
npm run fmt              # ESLint fix on **/*.{ts,vue}
npm run check-ts         # TypeScript type check (no emit, backend + common only)
npm start                # Run backend (production)
npm run reset-password   # CLI password reset utility
```

No test suite exists. Validation is done via `lint`, `check-ts`, and manual testing.

## Architecture

### Communication Model

All client-server communication uses **Socket.IO events** (not REST). Express is only used for serving static files and a few routes (`/`, `/robots.txt`). The frontend emits events, backend socket handlers process them and respond via callbacks.

### Socket Handler Organization

- **`backend/socket-handlers/`** — Handlers that run on the main server only (auth, settings, agent management)
- **`backend/agent-socket-handlers/`** — Handlers that support the multi-agent proxy pattern (Docker operations, terminal). These can be forwarded to remote Dockge instances.

### Multi-Agent System

The main Dockge instance can connect to remote Dockge instances as "agents" via Socket.IO client connections. `AgentManager` (per-client) routes operations to the correct agent based on an `endpoint` parameter. The local instance is the default agent.

### Stack Lifecycle

`Stack` class (`backend/stack.ts`) manages compose stacks:
- Stacks are directories under `DOCKGE_STACKS_DIR` containing a `compose.yaml` (or variant) and optional `.env`
- Docker operations shell out to `docker compose` CLI via child_process
- Each stack has an associated `Terminal` (node-pty) for streaming output to the UI

### Frontend Structure

- **Pages** (`frontend/src/pages/`): Route-level components (Dashboard, Compose editor, Settings, etc.)
- **Components** (`frontend/src/components/`): Reusable UI pieces (Terminal via xterm.js, StackList, Container editor, etc.)
- **Mixins** (`frontend/src/mixins/`): `socket` (Socket.IO client setup), `lang` (i18n), `theme` (dark/light mode)
- **Settings subpages** (`frontend/src/components/settings/`): General, Appearance, Security, GlobalEnv, About

### Database

- RedBean ORM with Knex migrations (`backend/migrations/`)
- Three tables: `user`, `setting`, `agent`
- Settings are cached in-memory with 60s TTL (`backend/settings.ts`)
- Default SQLite (`data/dockge.db`), optional MySQL via `data/db-config.json`

### Dependencies Convention

Both frontend and backend share one `package.json`:
- `"dependencies"` = backend (shipped in production)
- `"devDependencies"` = frontend + dev tools (baked into `frontend-dist/` at build time)

## Coding Conventions

- 4 spaces indentation, double quotes, semicolons required
- JS/TS: `camelCase`, SQL: `snake_case`, CSS/SCSS: `kebab-case`
- Follow `.editorconfig` and `.eslintrc.cjs`
- Document public methods/functions with JSDoc
- All translatable strings go in `frontend/src/lang/en.json` using `$t("key")` — do not add other language files in PRs
- Settings should be configurable in the UI, not via env vars (except startup-related like `DOCKGE_STACKS_DIR`)
