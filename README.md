# wol-sieve

`wol-sieve` is a TypeScript and Node.js service that fetches selected pages from WOL, extracts useful content from their
HTML, and returns structured JSON through Express routes.

The service focuses on:

-   WOL page HTML retrieval.
-   Watchtower article extraction.
-   Midweek meeting program extraction.
-   New World Translation study Bible reference extraction and token-based grouping.
-   Lessons From the Bible extraction.
-   Courage book extraction.

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
    Versioned v2 routers live under `src/routers/v2/`.
-   `src/services/`: service-level processing, including token-count clustering for extracted Bible references.
-   `src/test-helpers/`: shared test-only helpers.

The app uses ESM (`"type": "module"`), TypeScript strict mode, and Node's `NodeNext` module resolution.

## WOL HTML Stencils

WOL pages are generated from repeatable HTML stencils. A stencil is the structural frame used to render a publication
page: document classes, article layout, header structure, heading levels, section containers, figures, tables, pull
quotes, links, and other stable markup.

The localized text changes by language. The stencil usually does not.

The term stencil is intentional: WOL appears to render pages from fixed structural molds. The mold defines where titles,
figures, tables, pull quotes, lists, questions, and content blocks live. Each language fills those same slots with
localized text, but the surrounding HTML shape remains stable.

This matters because scraper logic can often be made multilingual by detecting the stencil instead of reading visible
labels. A page should be classified by the structure WOL used to render it, not by words such as "Introduction",
"Conclusión", "Section", or "Timeline".

### Scraping Rule

Prefer structural signals over visible text.

Good signals:

-   `#article` classes, especially publication classes and `docClass-*`.
-   Stable semantic or layout classes.
-   Presence or absence of stencil-specific elements.
-   Heading levels and heading counts.
-   Figure placement inside a known container.
-   Direct child structure inside `.bodyTxt`.
-   Tables, lists, pull quotes, and repeated content blocks.
-   Stable IDs when the ID belongs to the stencil.

Weak signals:

-   Localized visible text.
-   Titles, subtitles, and context labels.
-   Punctuation or casing in rendered text.
-   Language-specific section names.
-   Text position when the same stencil exposes a better structural marker.

Visible text can still be extracted as content. It should not be the first choice for deciding what kind of page is being
scraped.

### Practical Workflow

When adding support for a new publication:

1. Ask the stakeholder to provide representative WOL URLs for every apparent page type or scenario that matters.
2. Prefer explicitly curated scenarios over agent-selected guesses. Scenario quality is a judgment call tied to product
   intent, and required variants should be defined by the person specifying supported behavior.
3. Download local HTML copies of those URLs into a temporary working folder.
4. Compare the downloaded HTML structure across the set.
5. Identify which pages share the same `docClass-*`.
6. For shared document classes, find the smallest structural selector that separates the stencils.
7. Validate the selector against all known pages of that type.
8. If possible, validate the same selector in another language.
9. Implement the detector using structural checks first and visible text only as a fallback.

The goal is not to match one sample page. The goal is to identify the stencil.

### Local HTML Workflow

When investigating a WOL stencil, work from saved HTML samples before editing scraper code.

Recommended steps:

1. Create a temporary folder for the sample set.
2. Download each stakeholder-provided WOL page into that folder.
3. Inspect the HTML with focused command-line tools instead of reading whole documents manually.
4. Test selectors against the full sample set before changing scraper logic.

Useful tools:

-   `curl` to download local HTML copies.
-   `htmlq` to test CSS selectors quickly across multiple samples.
-   `rg` to locate stable structural markers such as `docClass-*`, `data-video`, `figcaption`, `table`, `h2`, `h3`,
    and figure containers.
-   `sed` to inspect narrow DOM slices around the relevant block.

Useful questions:

-   What is the real container for the content being scraped?
-   What are that container's direct children?
-   Which variants share the same stencil and which do not?
-   Is ordering in the DOM part of the meaning?
-   Which signal is structural, and which signal is only visible text?

This workflow should establish the stencil before scraper edits begin. If the structure is still unclear, gather better
scenario coverage first rather than patching the scraper around uncertainty.

### Scenario Selection

Representative sample quality determines selector quality.

The sample set should include scenarios that expose meaningful structural variation, for example:

-   image at the beginning;
-   image at the end;
-   multiple images;
-   captions or image comments;
-   callouts or auxiliary prompts;
-   embedded video prompts;
-   alternate wrappers such as bleed-to-edge containers;
-   list, table, or pull-quote variants when relevant.

The URLs that define those scenarios should be supplied by the person specifying supported behavior. That keeps scenario
selection aligned with actual product needs and avoids wasting effort on guessed edge cases that do not matter.

### Example

In WCG, `docClass-13` is used by lessons, the introduction, and the conclusion. The page title is language-dependent, so
it is a poor discriminator.

A better discriminator is the stencil:

| Structural signal                           | Page shape   |
| ------------------------------------------- | ------------ |
| `.bodyTxt .stdPullQuote` exists             | lesson       |
| no `.stdPullQuote` and `.bodyTxt h3` exists | conclusion   |
| no `.stdPullQuote` and no `.bodyTxt h3`     | introduction |

The same idea applies to `docClass-15`:

| Structural signal         | Page shape           |
| ------------------------- | -------------------- |
| `header #f2 img` exists   | section introduction |
| `.bodyTxt > table` exists | timeline             |

These selectors describe the rendering stencil. They are not tied to Spanish labels, so the same detector can work across
languages when WOL keeps the same stencil.

## API Versions

The API has two supported route families with distinct contracts:

-   **v1, unversioned compatibility routes**: mounted at paths such as `/pub-w`, `/pub-mwb`, `/pub-nwtsty`, `/pub-lfb`,
    and `/wol`. These routes preserve the original public surface, including mixed GET/POST support on some endpoints,
    public HTML helper endpoints, `/from-url` routes, MWB `/scrappers/*` routes, and the `links` query parameter
    convention.
-   **v2, versioned GET-only routes**: mounted under `/v2`. This is the preferred contract for new integrations. These
    routes expose selected JSON-producing endpoints, reject POST by omission, do not expose public HTML fetch endpoints,
    do not expose `/from-url`, and use canonical query parameters to select WOL source URLs.

`GET /v2/` returns a browser-friendly HTML index with clickable sample links for the available v2 endpoints.

### v2 Endpoints

Single-source v2 endpoints accept an optional `url` query parameter. If `url` is omitted, the endpoint uses the current
default WOL source for that scraper. If `url` is provided, it must be a single `wol.jw.org` URL.

```text
GET /v2/pub-w/
GET /v2/pub-w/?url=...

GET /v2/pub-mwb/
GET /v2/pub-mwb/?url=...

GET /v2/pub-mwb/treasures-talk
GET /v2/pub-mwb/treasures-talk?url=...
```

Multi-source v2 endpoints accept repeated `urls` query parameters. A single `urls` value is also accepted and normalized
internally. If `urls` is omitted, the endpoint uses its existing default link builder. The v2 API does not treat `links`
as an alias for `urls`.

JSON-producing v2 endpoints accept an optional `pretty` query parameter that formats the response with FracturedJsonJs.
Valid enabling forms are `?pretty`, `?pretty=true`, and `?pretty=1`; other values are rejected.

```text
GET /v2/pub-nwtsty/
GET /v2/pub-nwtsty/?urls=url1&urls=url2

GET /v2/pub-nwtsty/grouped
GET /v2/pub-nwtsty/grouped?urls=url1&urls=url2
GET /v2/pub-nwtsty/grouped?urls=url1&urls=url2&tokenLimit=1000

GET /v2/pub-lfb/
GET /v2/pub-lfb/?urls=url1&urls=url2

GET /v2/pub-wcg/
GET /v2/pub-wcg/?urls=url1&urls=url2
```

Preserve v1 behavior when changing v2 routes. The two route families are intentionally different; do not treat v1-only
patterns as aliases in v2 unless the v2 contract explicitly defines them.

## Contract Design

JSON contracts should favor semantic absence for optional simple values and structural stability for collections.

-   Omit optional simple fields when no meaningful value exists.
-   Return empty arrays for collection fields when no elements exist.
-   Use empty strings, empty objects, or placeholder values only when they represent a meaningful domain state rather
    than missing data.

This keeps responses easier to consume. Optional simple fields work naturally with nullish coalescing such as
`value ?? fallback`, while array fields remain safe to process with `map`, `forEach`, `filter`, and `length` checks
without extra guards.

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

| Variable       | Local default | Docker default | Notes                                           |
| -------------- | ------------- | -------------- | ----------------------------------------------- |
| `NODE_ENV`     | `development` | `production`   | Must be `development`, `production`, or `test`. |
| `WS_PORT`      | `5000`        | `3389`         | HTTP server port.                               |
| `WS_LOG_LEVEL` | `info`        | `info`         | Pino log level.                                 |

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
