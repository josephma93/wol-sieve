# Local development

[Contents](../README.md#documentation)

Run all commands from the repository root.
Prerequisites: nvm, the Node.js version in [.nvmrc](../.nvmrc), and Internet access for dependency installation and WOL requests.

## Install and start

1. Select the project Node.js version.

    ```bash
    nvm use
    ```

2. Install dependencies.

    ```bash
    npm install
    ```

3. Create the local environment file.

    ```bash
    touch .env
    ```

    The startup commands require this file.
    An empty file uses the defaults in [Configuration](configuration.md).

4. Start the service.

    ```bash
    npm start
    ```

With default configuration, open [the endpoint index](http://localhost:5000/v2/).
Use the [API chapter](api.md) to select an endpoint.

`npm start` watches TypeScript and JSON files under `src/`.
On startup and each restart, it formats the whole project, compiles TypeScript, and runs `dist/index.js`.
The watcher and startup behavior are defined in [run.sh](../run.sh).

## Development commands

| Command                 | Behavior                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| `npm run start:inspect` | Start the watcher with the Node.js inspector enabled.                      |
| `npm run start:debug`   | Start the watcher and pause for the debugger before application code runs. |
| `npm run build`         | Remove `dist/` and compile TypeScript.                                     |
| `npm run serve`         | Run existing compiled output with `.env`, without watching or rebuilding.  |
| `npm run format`        | Format the whole project with Prettier.                                    |

The inspector commands use the same formatting and build steps as `npm start`.
Removing `dist/` before compilation prevents deleted source files from remaining in build output.
See [Testing](testing.md) for verification commands and [Deployment](deployment.md) for Docker commands.

## Compiler and formatting settings

[tsconfig.json](../tsconfig.json) defines the ES2023 target, NodeNext modules and resolution, and `dist/` output.
Strict checks include `noImplicitAny`, `noUnusedLocals`, and `noUnusedParameters`.
Source maps and incremental builds are enabled.

[.prettierrc](../.prettierrc) defines tabs with width 4, a print width of 120, single quotes, semicolons, and trailing commas.
JSON and YAML use two-space indentation. Dockerfiles use width 2 and double quotes.

Next: [Configuration](configuration.md).
