# Deployment

[Contents](../README.md#documentation)

Run commands from the repository root.
Prerequisites: installed project dependencies, Docker running, and Internet access to retrieve images and dependencies.
Use [Local development](local-development.md#install-and-start) for dependency installation.

## Build and run

The [Dockerfile](../Dockerfile) copies compiled output from `dist/`; it does not compile TypeScript.
It uses Node.js 22 Alpine images, installs production dependencies, and runs the service as the `node` user.

1. Compile the project.

    ```bash
    npm run build
    ```

2. Build the image.

    ```bash
    npm run docker:build
    ```

3. Start the container.

    ```bash
    npm run docker:run
    ```

With the default configuration, open [the endpoint index](http://localhost:3389/v2/).
The run script maps host port `3389` to container port `3389` and removes the container after it exits.

To select an image explicitly, replace `<image-name>`:

```bash
docker run --rm -p 3389:3389 <image-name>
```

See [Configuration](configuration.md#container-environment) for runtime variables and port overrides.
Use [Testing](testing.md#live-regression) to check a running container against WOL.

## Publish with package scripts

Docker package scripts use this image name:

```text
dkr-reg.home.leaflex.site/<package-name>:latest
```

`<package-name>` comes from [package.json](../package.json).
After building, authenticate to that registry before publishing with `npm run docker:push`.
The command uploads the image and updates its `latest` tag.

## GitHub Actions

[The workflow](../.github/workflows/docker-image.yml) runs [live regression checks](testing.md#live-regression)
on pull requests targeting `main` and pushes to `main`.
It uploads available sanity reports as the `postman-sanity` artifact, retained for seven days.

On pushes to `main`, a successful sanity check enables the image build and publish job.
That job installs dependencies, compiles the project, and publishes to Docker Hub as `${DOCKER_USERNAME}/wol-sieve`.
It uses `latest`, SHA, and branch tags.
Repository secrets `DOCKER_USERNAME` and `DOCKER_PASSWORD` provide registry credentials.

Previous: [Testing](testing.md). Return to [Contents](../README.md#documentation).
