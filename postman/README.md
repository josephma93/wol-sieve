# Postman sanity checks

Postman is the risk-based live regression check for the public v2 API. Newman runs curated scenarios against real WOL
responses. The scenarios target known extraction risks, such as DOM order, optional media, references, batch ordering,
and route boundaries. They are a safety net, not an exhaustive survey of WOL pages or languages. Unit tests cover
controlled failures and HTML variants that live requests cannot reproduce reliably.

## Run the complete check

Prerequisites: Docker must run, and the container must have Internet access.

```bash
./scripts/sanity.sh
```

`npm run sanity` runs the same command. The script creates one temporary container with `--rm`.
It installs locked dependencies, compiles the current source, starts a local API, and runs all curated suites.
The workspace is mounted read-only. The API and dependencies disappear when the container exits.

The command prints the report directory. Set `SANITY_REPORT_DIR` to select another directory.
Reports include installation output, compilation output, API logs, Newman JSON reports, and a suite summary.
Any failed suite returns a nonzero exit code. Later suites still run after an assertion failure.
A compilation or startup failure stops the check before Postman runs.

GitHub Actions runs this check on pull requests and pushes to `main`. The image build and publish job runs only on pushes
to `main`, after this check passes. WOL availability and content changes can cause failures. Inspect the reports before
changing source or expected values.

## Coverage by risk

| Risk                                  | Persistent scenarios                                                                                | Assertions                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| MWB DOM order and optional media      | Curated treasures talks                                                                             | Exact item order, images, captions, callouts, video prompts, citation fragments                |
| MWB section integration               | Curated complete programs                                                                           | Program sections, including external ministry links                                            |
| WCG stencil detection and batch order | Publication pages in one curated batch                                                              | Returned order, page types, narration, questions, figures, references                          |
| Publication note loss                 | WCG lesson `1102025913`                                                                             | Referenced paragraph and the missing note answer, included exactly once                        |
| Watchtower relation corruption        | Selected article and current weekly article                                                         | Question associations, target kinds, index bounds, footnotes, boxes, teach block               |
| Citation corruption                   | Watchtower, current MWB, LFB, WCG                                                                   | Unique citation IDs, marker resolution, nonempty reference content, no extraction placeholders |
| Default weekly discovery              | MWB and Watchtower without `url`                                                                    | Complete, nonempty results using the current meetings index                                    |
| LFB extraction and ordering           | Two selected lessons in one batch                                                                   | Source order, lesson type, curated lesson number and title, citation integrity                 |
| Bible reference reuse                 | Psalm 70                                                                                            | Every occurrence resolves to a shared reference with content                                   |
| Bible grouping loss                   | Psalm 70 with a 1000-token limit                                                                    | Same entries and references, stable order, no empty clusters, oversized-entry exception        |
| Query and route boundaries            | Invalid sources, mixed batch, duplicate `url`, token limits, invalid `pretty`, POST, removed routes | Expected 400 or 404 responses                                                                  |
| JSON formatting                       | LFB with `pretty=1`                                                                                 | Parseable formatted JSON and expected lesson content                                           |

The curated suites exercise every public JSON route. They do not cover every publication stencil or language.
LFB letters and section introductions still need curated live cases. Ministry assignment variants have deeper unit-test
coverage. Connection failures, malformed WOL responses, and note-fetch failures also require unit tests.
There is no live performance threshold because response time depends on WOL and network conditions.

## Run against an existing API

```bash
npm run e2e -- all --base-url http://localhost:5000 --report-dir /tmp/wol-e2e
```

Targets: `all`, `mwb`, `mwb-treasures`, `mwb-program`, `wcg`, and `sanity`.
The `sanity` target runs the cross-route collection. The `all` target also runs every curated baseline.
The CLI checks `/ping` first. Use `--skip-ping` only when the target does not expose that endpoint.
Base URL precedence is `--base-url`, `BASE_URL`, then `http://localhost:5001`.

## Maintain the safety net

-   Keep stakeholder-selected development scenarios when the corresponding behavior remains supported.
-   Add a regression scenario when a defect exposes a missing assertion or source variation.
-   Record the source URL, the risk, and the intended result for each new curated scenario.
-   Use fixed source URLs for text assertions. Use structural assertions for changing weekly sources.
-   Keep expected source values in `postman/data/`. Keep `baseUrl` outside the collections.
-   Compare arrays in exact order when order is part of the contract.
-   Compare objects as deep subsets when additional response fields are allowed.
-   Do not generate expected values from the API under test.
-   Do not update baselines automatically during test runs.
-   Verify a changed expectation against the WOL source and the intended public contract.
-   Preserve failures until the cause is understood. Do not accept HTTP 200 as proof of correct extraction.

Curated baseline files contain their scenario identifiers and reasons.
`sanity.json` contains selected sources and stable expected values for cross-route checks.
Runtime response comparisons, such as ungrouped versus grouped Bible entries, supplement these independent expectations.
