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
