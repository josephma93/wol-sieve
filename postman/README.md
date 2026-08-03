## Postman Baselines

These files are the source of truth for positive E2E scraping regression checks.

Rules:

- `baseUrl` must come from the Newman environment or CLI, not from these files.
- Collection variables should only hold stable path fragments such as `/v2`, `/pub-mwb`, `/treasures-talk`, and `/pub-wcg`.
- Expected values live in `postman/data/*.json`.
- The current baseline covers positive scenarios only.
- `mwb-treasures-talk-positive.json` is the deepest MWB contract and should validate item order plus the expected payload fragments for each item.
- `mwb-program-positive.json` validates the larger MWB envelope without duplicating the full depth of `treasures-talk`.
- `wcg-positive.json` is modeled as a mixed batch request. Tests should assert returned link order first, then validate each item by `link`.

Implementation guidance:

- Compare exact scalar values for stable scraped text.
- Compare arrays with exact order when order is part of the contract.
- Compare objects as deep subsets when the runtime returns additional fields that are not part of the baseline.
- Do not rewrite these files automatically during test runs.

Command:

- `npm run e2e -- [target] [--base-url URL] [--skip-ping]`

Targets:

- `all`
- `mwb`
- `mwb-treasures`
- `mwb-program`
- `wcg`

Base URL resolution:

1. `--base-url`
2. `BASE_URL`
3. `http://localhost:5001`

The CLI performs a preflight `GET /ping` check unless `--skip-ping` is passed.

Examples:

- `npm run e2e`
- `npm run e2e -- mwb`
- `npm run e2e -- wcg --base-url http://localhost:5000`
- `BASE_URL=http://localhost:5000 npm run e2e -- all`
