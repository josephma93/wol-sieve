# Developer Guide

This document summarises conventions and practices used within the **wol-sieve** codebase. The goal is to provide quick guidance for contributors about how the project is structured and how to add new code consistently.

## Directory layout

-   `src/` – TypeScript source files.
-   `dist/` – Compiled output produced by `npm run build`.
-   `node_modules/` – Package dependencies (not committed).
-   Configuration files such as [`.prettierrc`](./.prettierrc),
    [`tsconfig.json`](./tsconfig.json) and [`.nvmrc`](./.nvmrc) live in the project root.

## Tooling

-   **Node.js** version specified in [`.nvmrc`](./.nvmrc) (`v22.8.0`).
-   The project is written in TypeScript and compiled with `tsc` (`npm run build`).
-   `nodemon` watches the `src` folder for development and runs formatting and compilation automatically before executing the built code.
-   `prettier` formats the codebase (`npm run format`).

## Formatting rules

Prettier settings are defined in [`.prettierrc`](./.prettierrc). It uses tabs with a width of four spaces and enforces trailing commas and single quotes. JSON and YAML files override these settings to use spaces, and Dockerfiles use two spaces and double quotes.

## TypeScript configuration

The TypeScript compiler options live in [`tsconfig.json`](./tsconfig.json). It
targets ES2023, uses the `NodeNext` module system and outputs compiled files to
`dist/` with strict type checking enabled.

Source files under `src/` are compiled to `dist/`. Only ECMAScript modules are used.

## Logging

Pino is used for structured logging. Each module typically creates a child logger with a `label` to identify log entries. For example:

```ts
const log = logger.child({ ...logger.bindings(), label: 'express-generics' });
```

The base logger is configured in `src/kernel/logger.ts` and respects `WS_LOG_LEVEL` from the environment.

## Asynchronous utilities

The utility `wrapAsyncOp` converts async functions into ones that return a `{err, res}` pair. Example implementation:

```ts
export function wrapAsyncOp<T, A extends any[]>(
	asyncFunc: (...args: A) => Promise<T | Error>,
): (...args: A) => Promise<{ err: Error | null; res: T | null }> {
	return async function (...args: A) {
		try {
			const result = await asyncFunc(...args);
			if (result instanceof Error) {
				return { err: result, res: null };
			}
			return { err: null, res: result };
		} catch (error) {
			return { err: error as Error, res: null };
		}
	};
}
```

`opErrored` is used to check the result. Many modules export their public functions as wrapped versions so callers don’t need try/catch logic.

## Express helpers

Common Express logic lives in `src/kernel/express-generics.ts`. Notable helpers include `startServer`, `addPingEndpoint` and `addGetAndPostScrappingRoute`. The latter adds a route that accepts both GET and POST requests and normalises HTML input before invoking a scraping function.

```ts
export function addGetAndPostScrappingRoute({
	router,
	path,
	defaultHtmlGenerator,
	scrapperOperation,
}: GetAndPostRouteSettings) {
	// middleware then handler
	router
		.route(path)
		.post(fillHtmlContentMiddleware, scrapperMiddleware)
		.get(fillHtmlContentMiddleware, scrapperMiddleware);
}
```

## Error handling

Functions typically return `Error` objects when encountering unexpected DOM structures or fetch problems. Routes translate these errors to HTTP status codes. Always log detailed context to aid debugging.

## Environment variables

Several values are configured through environment variables, for example `WS_PORT`, `WS_LOG_LEVEL` and selectors used by scrapers. See `src/kernel/constants.ts` for defaults and names.

## Contribution tips

1. Run `npm run format` before committing.
2. Ensure `npm run build` completes without errors.
3. Follow the existing logging and error‑handling patterns (use `logger.child` and `wrapAsyncOp`).
4. Keep functions small and document them with JSDoc comments.
5. When adding routers, prefer the helpers in `express-generics.ts` to avoid duplication.

By adhering to these conventions the codebase remains consistent and easier to maintain.
