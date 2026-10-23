# Testing

[Contents](../README.md#documentation)

Run commands from the repository root.
The [constitution](../AGENTS.md#unit-tests-and-local-checks) defines which checks each change requires.

## Unit tests

Prerequisite: complete the dependency installation in [Local development](local-development.md#install-and-start).

```bash
npm run test:run
```

This command runs Vitest once. Use `npm run test` for watch mode.
Tests use `*.test.ts` files beside the affected source.
They cover controlled failures and HTML variants through fixtures and mocked network calls.
Use [WOL stencil scenario selection](wol-stencils.md#scenario-selection) to identify relevant source variations.

## Live regression

[Postman sanity checks](../postman/README.md) cover known public API risks against real WOL sources.
Use the guide for the risk matrix, suite commands, baseline maintenance, and report interpretation.

With Docker running and Internet access available, run:

```bash
./scripts/sanity.sh
```

The script installs locked dependencies, builds the current source, and tests a temporary API in Docker.
It runs the curated Postman suites through Newman.
It does not run the Vitest unit suite.
See [Postman reports](../postman/README.md#run-the-complete-check) for output locations and failure handling.

To test a running [local service](local-development.md) or [container](deployment.md#build-and-run),
follow [Run against an existing API](../postman/README.md#run-against-an-existing-api).

Previous: [WOL stencils](wol-stencils.md). Next: [Deployment](deployment.md).
