# wol-sieve

`wol-sieve` is a versatile set of tools designed to handle and process various HTML content from the WOL site. The
primary functions include parsing HTML content from different types of articles into a structured JSON format and
retrieving the HTML of different relevant places.

## Disclaimer

This tool is intended for personal use only. The use of this tool must comply with the terms and conditions of the WOL.
Users are prohibited from redistributing, using the content for commercial purposes, or posting the content on any other
site. Please review the WOL's Terms and Conditions of Use before using this tool to ensure compliance.

## Environment Variables

You can configure `wol-sieve` using the following environment variables:

-   `NODE_ENV`: Sets the environment mode. Should be set to `production` in a production environment (default:
    `production`).
-   `WS_PORT`: Specifies the port the web server listens on (default: `3389`).
-   `WS_LOG_LEVEL`: Defines the log level. Accepted values are `info`, `warn`, `error`, `debug`, etc. (default: `info`).

These variables can be passed when running the Docker container directly with the `-e` option or through the
`docker-compose.yml` file, as shown in the example.

## Docker Installation

You can also run `wol-sieve` as a Docker container, which simplifies the setup and ensures consistent behavior across
different environments. Follow the steps below to install and run `wol-sieve` using Docker:

### Pulling the Docker Image

To get the latest version of the `wol-sieve` Docker image, pull it from Docker Hub:

```bash
docker pull joesofteng/wol-sieve:latest
```

### Running the Docker Container

Once you have the image, you can run it using the following command:

```bash
docker run -d --name wol-sieve -p 3389:3389 joesofteng/wol-sieve
```

This command will start the `wol-sieve` container in detached mode (`-d`), exposing port `3389` as defined in the
`Dockerfile`.

### Running with Specific Environment Variables

You can also configure the behavior of `wol-sieve` using the following environment variables:

-   `NODE_ENV`: Defines the environment mode (`production` by default).
-   `WS_PORT`: Specifies the port the application listens on (default: `3389`).
-   `WS_LOG_LEVEL`: Sets the logging level (`info`, `warn`, `error`, etc.; default: `info`).

Here’s how you can run the Docker container while overriding some of these environment variables:

```bash
docker run -d --name wol-sieve -e NODE_ENV=development -e WS_PORT=8080 -e WS_LOG_LEVEL=debug -p 8080:8080 joesofteng/wol-sieve
```

In this example:

-   The app is run in `development` mode.
-   The port `8080` is exposed instead of the default `3389`.
-   The log level is set to `debug`.

### Stopping and Removing the Container

To stop the running container:

```bash
docker stop wol-sieve
```

To remove the container:

```bash
docker rm wol-sieve
```

## Docker Compose Example

You can also use `docker-compose` to manage `wol-sieve`. Below is a sample `docker-compose.yml` file that starts the
service:

```yaml
version: '3.8'
services:
    wol-sieve:
        image: joesofteng/wol-sieve:latest
        container_name: wol-sieve
        environment:
            - NODE_ENV=production
            - WS_PORT=3389
            - WS_LOG_LEVEL=info
        ports:
            - '3389:3389'
        restart: unless-stopped
```

### Starting the Service with Docker Compose

Once you have the `docker-compose.yml` file, you can start the service by running:

```bash
docker-compose up -d
```

This command will start the `wol-sieve` service in detached mode.

### Stopping the Service

To stop the service, run:

```bash
docker-compose down
```

This command will stop and remove the `wol-sieve` container.

## Running the Project Locally for Development

To run the `wol-sieve` project locally for development, follow these steps:

### Prerequisites

Ensure you have the following installed on your machine:

-   **Node.js**: Version specified in the `.nvmrc` file. You can use [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions.
-   **npm**: Comes with Node.js, used for managing packages.

### Setup

1. **Clone the repository**:

    ```bash
    git clone https://github.com/yourusername/wol-sieve.git
    cd wol-sieve
    ```

2. **Install dependencies**:

    ```bash
    npm install
    ```

3. **Set up environment variables**:
   Create a `.env` file in the root directory and configure the necessary environment variables as described in the "Environment Variables" section.

### Development Workflow

-   **Compile TypeScript**:
    The project uses TypeScript, and you need to compile it before running. Use the following command to compile the TypeScript files:

    ```bash
    npm run build
    ```

-   **Run the development server**:
    Use `nodemon` to automatically restart the server on file changes:

    ```bash
    npm start
    ```

-   **Code Formatting**:
    The project uses Prettier for code formatting. Ensure your code is formatted correctly by running:
    ```bash
    npm run format
    ```

### Additional Notes

-   The `tsconfig.json` file is configured to target `ES2023` and uses `NodeNext` for module resolution.
-   The `nodemon.json` file is set up to watch for changes in `.ts` and `.json` files within the `src` directory.
-   Ensure your code adheres to the style guidelines specified in the `.prettierrc` file.

By following these steps, you can set up the project for local development and ensure a smooth workflow with TypeScript and Prettier.

## License

See the [LICENSE](./LICENSE) file for details.
