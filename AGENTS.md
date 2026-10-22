# AGENTS

Read `README.md` before making project changes. It is the source of truth for general project context such as setup,
architecture, routes, development workflow, testing, deployment, and contribution practices.
Do not use `README.md` to document internal contracts, implementation decisions, review handovers, or narrow behavioral
changes. Keep that context in code, tests, pull request notes, or the relevant review discussion.

Before completing scraper, fetcher, contract, route, or dependency changes, run `./scripts/sanity.sh`.
This command builds and tests the current source against WOL in a temporary Docker container.
Use `postman/README.md` to select risk coverage and interpret reports.
Preserve curated development scenarios. Add a focused regression case for each newly supported source variation or fixed defect.
Do not regenerate expected values from the API under test. Report any incomplete live verification explicitly.

## Responsibility and Dependency Boundaries

Place code according to the knowledge it requires and the responsibility it serves.
The number of consumers does not determine its location.

### `src/kernel/`

Contains the base capabilities that support the service.
Code in this folder must not know extraction structures, publication rules, or scraper workflows.
Do not introduce dependencies from `kernel` to `data-extraction` or `scrappers`.

#### `src/kernel/util.ts`

Contains utilities whose behavior can be defined without extraction concepts.
Do not place a function here only because several modules use it.

### `src/scrappers/`

Contains scrapers organized by publication type.
Each scraper knows the structure and rules of the publications it supports.
It selects content, coordinates extraction, and builds the result.
Keep publication-specific decisions close to the scraper that owns them.

### `src/data-extraction/`

Contains supporting operations that scrapers use to extract specific parts of content.
These operations can depend on extraction tools and shared content structures.
They must not coordinate complete publication extraction or define publication-specific rules.

#### `src/data-extraction/generic.ts`

Contains common extraction operations that do not belong in a more specific module.
Before adding a function, review the existing modules.
Do not use this file as the default location for extraction utilities.

### Placement Criteria

- Place code that determines publication-specific behavior in the corresponding scraper.
- Place shared extraction operations in `data-extraction`.
- Place capabilities that are independent of extraction in `kernel`.

Keep an operation local until a concrete need to share it exists.
When sharing an operation, keep its dependencies and responsibility explicit.

### Existing Code

Apply these boundaries to new code and changes to existing code.
Do not extend existing exceptions.
Correct an exception when the correction is necessary and remains within the scope of the work.
Do not perform unrelated refactoring to enforce these boundaries.
