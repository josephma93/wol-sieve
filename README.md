# wol-sieve

`wol-sieve` is a TypeScript and Node.js service that fetches selected pages from WOL, extracts useful content from their
HTML, and returns structured JSON through Express routes.

The service focuses on:

-   WOL page HTML retrieval.
-   Watchtower article extraction.
-   Midweek meeting program extraction.
-   New World Translation study Bible reference extraction and token-based grouping.
-   Lessons From the Bible extraction.

## Disclaimer

This tool is intended for personal use only. Use of this tool must comply with WOL terms and conditions. Do not
redistribute WOL content, use it commercially, or post it to other sites unless the applicable terms allow it.

## Architecture

The application entry point is `src/index.ts`. It creates the Express app, installs request logging and body parsing,
mounts feature routers, registers central error handling, adds `/ping`, and starts the HTTP server through the kernel
helpers.

Main source areas:

-   `src/kernel/`: shared infrastructure for environment parsing, constants, logging, async operation results, app
    errors, and Express server helpers.
-   `src/data-fetching/`: WOL HTML and JSON fetchers. Fetch operations are wrapped with `wrapAsyncOp` so callers receive
    `{ err, res }` results instead of handling thrown errors directly.
-   `src/data-extraction/`: lower-level extraction utilities for article-related data.
-   `src/scrappers/`: Cheerio-based scrapers for supported publication types.
-   `src/routers/`: Express routers that validate request inputs and expose scraper/fetcher behavior as HTTP endpoints.
-   `src/services/`: service-level processing, including token-count clustering for extracted Bible references.
-   `src/test-helpers/`: shared test-only helpers.

The app uses ESM (`"type": "module"`), TypeScript strict mode, and Node's `NodeNext` module resolution.

## Error Handling

Central error handling is registered in `src/index.ts`. Error responses use this shape:

```json
{
	"status": "error",
	"message": "Something went wrong!",
	"details": {},
	"stack": "..."
}
```

`details` is included when an `AppError` provides it. `stack` is included only in development mode.

## Environment

Runtime configuration is read in `src/kernel/env.ts`.

| Variable                           | Local default         | Docker default        | Notes                                                     |
| ---------------------------------- | --------------------- | --------------------- | --------------------------------------------------------- |
| `NODE_ENV`                         | `development`         | `production`          | Must be `development`, `production`, or `test`.           |
| `WS_PORT`                          | `5000`                | `3389`                | HTTP server port.                                         |
| `WS_LOG_LEVEL`                     | `info`                | `info`                | Pino log level.                                           |
| `WS_CSS_SELECTOR_FOR_LINK_TO_LANG` | `link[hreflang="es"]` | `link[hreflang="es"]` | Selector used when resolving language-specific WOL links. |

Local commands run through `run.sh` load `.env` with `node --env-file=.env`.

## Local Development

Use Node.js `v22.8.0` from `.nvmrc`.

```bash
nvm use
npm install
```

Common commands:

```bash
npm start
npm run start:inspect
npm run start:debug
npm run build
npm run serve
npm run format
npm run test
npm run test:run
```

`npm start` runs `./run.sh start`. The script uses `nodemon` to watch `src/**/*.ts` and `src/**/*.json`; on change it
formats the project, compiles TypeScript, and runs `dist/index.js` with `.env`.

There is no `nodemon.json`; watch behavior is defined in `run.sh`.

## TypeScript and Formatting

TypeScript configuration:

-   Target: `ES2023`.
-   Module and resolution: `NodeNext`.
-   Output directory: `dist/`.
-   Strict checks: enabled, including `noImplicitAny`, `noUnusedLocals`, and `noUnusedParameters`.
-   Source maps and incremental builds: enabled.

Prettier configuration:

-   Tabs with width `4`.
-   Print width `120`.
-   Single quotes.
-   Semicolons.
-   Trailing commas.
-   JSON and YAML use spaces with width `2`.
-   Dockerfiles use width `2` and double quotes.

## Testing and Quality

Run the local quality checks before submitting changes:

```bash
npm run format
npm run build
npm run test:run
```

Testing practices:

-   Place focused tests next to the code under test, for example `src/**/feature.test.ts`.
-   Avoid network calls in unit tests. Mock `fetch` and use small HTML fixtures.
-   Keep logs deterministic in tests by stubbing where needed.
-   Keep production code free of `console` statements and `debugger`; use the shared logger.

Internal route handlers and utilities can be tested without exporting them as public API by attaching test-only hooks with
`TEST_HOOK` from `src/test-helpers/test-hook.ts`.

Example:

```ts
(router as any)[TEST_HOOK] = { handleFromUrl };
```

Tests can then read the hook through the same symbol and invoke the internal function directly.

## Docker and Deployment

The Docker image expects compiled output to already exist in `dist/`. Build the TypeScript project before a local Docker
build:

```bash
npm run build
npm run docker:build
```

Docker-related package scripts build and push an image named from:

```text
dkr-reg.home.leaflex.site/<package-name>:latest
```

The GitHub Actions workflow at `.github/workflows/docker-image.yml` runs on pushes to `main`. It installs dependencies,
builds the project, and publishes Docker images to Docker Hub using:

```text
${DOCKER_USERNAME}/wol-sieve
```

with `latest`, SHA, and branch tags.

To run a built image locally:

```bash
npm run docker:run
```

or:

```bash
docker run --rm -p 3389:3389 <image-name>
```

## Contribution Notes

-   Keep changes focused and covered by relevant tests.
-   Prefer existing helpers and patterns over new abstractions.
-   Use `wrapAsyncOp` and `opErrored` for fetcher-style operations that return explicit async result objects.
-   Use `AppError` for HTTP errors that need status codes or response details.
-   Create child loggers with useful labels for module-specific logs.
-   Avoid committing `dist/`, local environment files, caches, or secrets.
-   Keep long-form project documentation in this README.

## License

See the [LICENSE](./LICENSE) file for details.
