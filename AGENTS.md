# Project Constitution

## Scope

-   Implement the user's requested change. Preserve unrelated code and local edits.
-   Before editing, read [README.md](README.md), relevant code, and tests.
-   Resolve routine choices from existing evidence. Ask only about unresolved behavior choices or rule conflicts.
-   Follow explicit user overrides; do not invent exceptions to these rules.
-   During reviews, report findings without editing files unless asked.
-   Edit this file only when the user explicitly requests instruction changes.

## Implementation

-   Use `.nvmrc` locally and in host CI; container versions may vary within the same Node.js major version.
-   Use dependency and compiler settings from `package.json`, `package-lock.json`, and `tsconfig.json`. Preserve `.js` relative imports.
-   Use `AppError` for HTTP errors and the shared logger for diagnostics. Keep `console` and `debugger` out of production code.
-   For fetchers, use `wrapAsyncOp` to produce `AsyncOperationResult<T>`. Do not wrap operations already returning that type.
-   Check `opErrored` before reading `res`.
-   Preserve response fields and source order outside the requested behavior change. Never treat valid `0` or `false` as absent.
-   Omit empty optional arrays; keep required arrays present even when empty. Follow response types and contract tests.
-   Update the relevant documentation when API or operating behavior changes.
-   Write repository documentation in English with short, direct sentences and consistent technical terms.
-   Do not commit `dist/`, caches, local environment files, or secrets.

## Responsibility and Dependency Boundaries

Place code by responsibility, not consumer count.

| Location               | Responsibility                                                                |
| ---------------------- | ----------------------------------------------------------------------------- |
| `src/routers/v2/`      | HTTP validation and responses                                                 |
| `src/data-fetching/`   | WOL retrieval, without publication interpretation                             |
| `src/scrappers/`       | Publication rules and extraction coordination                                 |
| `src/data-extraction/` | Shared extraction operations, without publication rules or complete workflows |
| `src/services/`        | Processing extracted results                                                  |
| `src/kernel/`          | Capabilities independent of extraction                                        |
| `src/test-helpers/`    | Shared test support                                                           |

Do not add dependencies from `kernel` to `data-extraction` or `scrappers`.
Keep `kernel/util.ts` independent of extraction. Prefer specific extraction modules over `data-extraction/generic.ts`.
Do not extend existing boundary violations or refactor unrelated code to remove them.

## Investigate WOL Structures

For new publication support or source variations, compare saved WOL HTML for the affected variants.
Use supplied URLs and existing curated samples. Ask for missing samples when required to determine the requested behavior.
Prefer document structure over localized text. Validate changed selectors against the affected samples.
Check another language when samples are available. Do not invent missing source content or add unrequested publication support.

For the structural model, investigation workflow, and classification examples, see [WOL stencils](docs/wol-stencils.md).

## Unit Tests and Local Checks

-   Cover changed behavior, boundaries, and failures with focused Vitest tests beside the affected code. Mock network calls.
-   Follow the existing `TEST_HOOK` pattern when testing internal route handlers.
-   After changing code, format only files edited for the request; run `npm run build` and `npm run test:run`.
-   For scraper, fetcher, contract, route, or dependency changes, also run `./scripts/sanity.sh`.
-   Follow [postman/README.md](postman/README.md) for live regression coverage, assertions, and reports.
-   For documentation-only changes, check formatting, links, and consistency with code and commands.
-   Fix failures caused by the change. Report required checks as passed, failed, or not run, with reasons for failures or omissions.
-   Failed or unrun required checks mean verification is incomplete.
-   When changing branch protection, require the sanity status check before merge.
