# Configuration

[Contents](../README.md#documentation)

Runtime variables are read by [src/kernel/env.ts](../src/kernel/env.ts).
Docker defaults are set in the [Dockerfile](../Dockerfile).

| Variable       | Local default | Docker default | Meaning                                               |
| -------------- | ------------- | -------------- | ----------------------------------------------------- |
| `NODE_ENV`     | `development` | `production`   | Runtime mode: `development`, `production`, or `test`. |
| `WS_PORT`      | `5000`        | `3389`         | HTTP server port.                                     |
| `WS_LOG_LEVEL` | `info`        | `info`         | Pino log level.                                       |

## Local environment file

The [local startup commands](local-development.md#development-commands) load `.env` through `node --env-file=.env`.
The file must exist, even when it is empty. A missing file prevents startup.

Example `.env`:

```dotenv
NODE_ENV=development
WS_PORT=5000
WS_LOG_LEVEL=info
```

An unsupported `NODE_ENV` value prevents startup.
Development mode includes stack traces in [centrally handled errors](api.md#errors).

## Container environment

The container starts Node.js directly and does not load the repository's `.env` file.
Pass overrides through Docker environment options.
For example, add `-e WS_LOG_LEVEL=debug` to the [Docker run command](deployment.md#build-and-run).

If you change `WS_PORT`, update the container port in the Docker port mapping.
The host port determines the base URL used by [API clients](api.md).

Previous: [Local development](local-development.md). Next: [API](api.md).
