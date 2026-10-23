# Architecture

[Contents](../README.md#documentation)

The service uses TypeScript with ESM, Express for HTTP, Cheerio for HTML extraction, and Pino for logging.
[Local development](local-development.md#compiler-and-formatting-settings) describes compiler and formatting settings.

## Request flow

[src/index.ts](../src/index.ts) creates the Express app, installs request logging, mounts `/v2`, and registers central error handling.
Kernel helpers add `/ping` and start the server using [runtime configuration](configuration.md).

1. [Route handlers](../src/routers/v2/) validate query parameters and select supplied or default WOL sources.
2. [Fetchers](../src/data-fetching/) retrieve HTML or JSON.
3. [Scrapers](../src/scrappers/) apply publication rules and use [extraction operations](../src/data-extraction/) to build results.
4. [Services](../src/services/) perform additional processing when needed, such as grouping Bible references by token count.
5. Route handlers return JSON or pass errors to the central handler.

Single-source route helpers fetch HTML before calling a scraper.
Some batch scrapers fetch their sources internally.
The [API chapter](api.md) describes client-visible requests, responses, and errors.

Code placement and dependency rules are defined in the
[constitution's responsibility boundaries](../AGENTS.md#responsibility-and-dependency-boundaries).

## WOL page structures

A stencil is a recurring HTML structure used to render a publication page.
WOL pages share stencils across languages while their visible text changes.
The [WOL stencils chapter](wol-stencils.md) explains the model, structural signals, investigation workflow, and WCG classification examples.
[Testing](testing.md) explains how unit fixtures and live regression scenarios verify extraction behavior.

The [WOL highlight fragment note](notes/wol-h-fragment.md) describes observed browser behavior for `#h=` links.
This service does not currently parse or generate those fragments.

Previous: [API](api.md). Next: [WOL stencils](wol-stencils.md).
