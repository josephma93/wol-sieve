# AGENTS: Dev Environment Guide

This document provides commands and best practices to set up, navigate, test, and contribute to the wol-sieve codebase. It reflects the current project tooling (npm, TypeScript, Prettier, Vitest). Where CI is not present, run the commands locally before pushing.

**Quick Start**

-   Node: Use `v22.x` (see `.nvmrc`).
-   Install: `npm install`
-   Build: `npm run build` (typechecks via `tsc`)
-   Dev (watch + auto-reload): `npm start`
-   Debug: `npm run start:inspect` or `npm run start:debug`
-   Serve built: `npm run serve`

**Project Navigation**

-   Source code: `src/`
    -   Server entry: `src/index.ts`
    -   Kernel (infra): `src/kernel/*`
    -   Routers (HTTP): `src/routers/*`
    -   Scrapers: `src/scrappers/*`
    -   Data fetching/parsing: `src/data-fetching/*`, `src/data-extraction/*`
-   Build output: `dist/`
-   Formatting config: `.prettierrc`
-   TypeScript config: `tsconfig.json`
-   Test config: `vitest.config.ts`

**Testing & Code Quality**

-   Run tests (watch): `npm run test`
-   Run tests (single): `npm run test:run`
-   Coverage (optional): `npm run test:coverage` (install `@vitest/coverage-v8` if needed)
-   Typecheck: `npm run build` (uses `tsc` strict mode)
-   Format: `npm run format` (Prettier)

Best practices:

-   Prefer adding tests next to code, e.g. `src/**/foo.test.ts`.
-   Avoid network in unit tests; mock `fetch` and use small HTML fixtures.
-   Keep logs deterministic in tests (stub as needed).

**Local “CI” Checklist (before push/PR)**

-   Format code: `npm run format`
-   Typecheck build: `npm run build`
-   Run unit tests: `npm run test:run`
-   Optional coverage gate: `npm run test:coverage`

Submissions should:

-   Include only focused changes and relevant tests.
-   Avoid committing `dist/` and environment secrets.
-   Keep console statements out of production code (use `logger`).

**Docker (optional)**

-   Build image: `npm run docker:build`
-   Push image: `npm run docker:push`
-   Build & push: `npm run docker:buildnpush`
-   Run published image: `docker run -d --name wol-sieve -p 3389:3389 joesofteng/wol-sieve:latest`

**Environment**

-   `.env` is read by `run.sh` via `node --env-file=.env`.
-   Key vars: `NODE_ENV`, `WS_PORT`, `WS_LOG_LEVEL`, `WS_CSS_SELECTOR_FOR_LINK_TO_LANG`.

**Troubleshooting**

-   Node mismatch: `nvm use` (or install Node 22.x).
-   Port in use: change `WS_PORT` or stop conflicting process.
-   Network-restricted tests: mock `fetch` or provide fixtures.

Note: This project does not use pnpm, Turbo, or ESLint at this time. Commands above use npm, Vitest, Prettier, and TypeScript only.

**Testing Internals (Pattern)**

- Purpose: test internal handlers/utilities without exporting them as public API.
- Approach: attach test-only hooks using a shared Symbol so only tests know how to access them.
- Shared key: `src/test-helpers/test-hook.ts` exports `TEST_HOOK`.
- Attaching in code (example):
  - `(router as any)[TEST_HOOK] = { handleFromUrl } // test-only`
- Using in tests:
  - `import { TEST_HOOK } from '../test-helpers/test-hook'`
  - `const hook = (router as any)[TEST_HOOK]`
  - `await hook.handleFromUrl(req, res, next)`
- Notes:
  - Keeps internals unexported and avoids implying public/stable API.
  - No network in tests; mock fetchers (e.g., `getHtmlContent`) and heavy parsers as needed.
