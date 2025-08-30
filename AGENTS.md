# Project: wol-sieve

## Project Overview

`wol-sieve` is a TypeScript-based web server that uses the Express.js framework.
Its primary function is to handle and process HTML content from the WOL (Watchtower Online Library) site.
The tool parses HTML content from various articles into a structured JSON format and retrieves HTML from different
relevant pages.
The project is set up to be run both locally and as a Docker container.

### Key Technologies

-   **Backend:** Node.js (≥ v22.x), Express.js (v4.x)
-   **Language:** TypeScript
-   **Dependencies:**
    -   `cheerio`: For parsing HTML.
    -   `pino` and `pino-http`: For logging.
    -   `markify-ts`: For converting text to markdown.
    -   `tiktoken`: For tokenizing text.
-   **Development:**
    -   `nodemon`: For automatic server restarts during development.
    -   `prettier`: For code formatting.
    -   `typescript`: For static typing.

### Architecture

The project follows a standard Node.js project structure.

-   `src/`: Contains the source code.
-   `src/index.ts`: The main entry point of the application.
-   `src/kernel/`: Core functionalities like server setup, logging, and asynchronous operations.
-   `src/routers/`: Defines the API routes.
-   `src/scrappers/`: Contains the logic for scrapping the WOL website.
-   `src/services/`: Business logic.
-   `dist/`: The output directory for the compiled TypeScript code.

### Error Handling

The project implements a centralized error handling strategy using Express.js middleware and a custom `AppError` class.

-   **`AppError` Class:** Defined in `src/kernel/app-error.ts`, this custom error class allows for attaching specific `statusCode`, `status` (e.g., 'fail' or 'error'), and `details` to errors. This provides more context for debugging and client responses.
-   **Centralized Global Error Handler:** A top-level error handling middleware in `src/index.ts` catches all errors passed via `next(err)`. In the development environment, this handler bubbles up detailed error information, including the stack trace, to the browser. In production, it provides a more generic error message for security.
-   **Lower-Level Middleware Error Propagation:** Deeper-level middlewares and route handlers no longer directly send error responses. Instead, they create an instance of `AppError` (or re-throw an existing error) and pass it to the `next()` function (e.g., `next(new AppError('Error message', 500, errorDetails))`). This ensures all errors are processed by the centralized handler.
-   **Asynchronous Operations (`src/kernel/async-ops.ts`):** This module provides utilities (`wrapAsyncOp`, `opErrored`) for handling asynchronous operations that might return an `Error` object instead of throwing one. Functions wrapped by `wrapAsyncOp` are designed to return `Promise<T | Error>`. The `opErrored` helper function is used to check if the result of an asynchronous operation is an error. When such an error occurs, it is then converted into an `AppError` and passed to `next()` for centralized handling.

## Building and Running

The project can be built and run using the provided `run.sh` script or npm scripts.

### Local Development

1. **Install dependencies:**

```bash
npm install
```

2. **Build the project:**

```bash
npm run build
```

3. **Run the server:**

-   **Development mode (with auto-reload):**

```bash
npm start
```

-   **Serve the pre-built application:**
    ```bash
    npm run serve
    ```
-   **Debug mode:**
    ```bash
    npm run start:debug
    ```
-   **Inspect mode:**

```bash
npm run start:inspect
```

### Docker

The project includes a `Dockerfile` for containerization.

1. **Build the Docker image:**

```bash
npm run docker:build
```

2. **Push the Docker image:**

```bash
npm run docker:push
```

3. **Build and push:**

```bash
npm run docker:buildnpush
```

## Development Conventions

### Coding Style

The project uses Prettier for code formatting. The configuration is defined in `.prettierrc`.

-   Tabs are used for indentation with a width of 4 spaces.
-   The print width is 120 characters.
-   Single quotes are used for strings.
-   Semicolons are required at the end of statements.
-   Trailing commas are used where possible.

### TypeScript

The TypeScript configuration is in `tsconfig.json`.

-   The target is `ES2023`.
-   The module system is `NodeNext`.
-   Strict mode is enabled.
-   Source maps are generated.
