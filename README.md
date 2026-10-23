# wol-sieve

`wol-sieve` fetches selected WOL pages and returns extracted publication content as JSON.
It is a TypeScript and Node.js service with an Express API at `/v2`.

Supported content includes Watchtower articles, Midweek meeting programs, New World Translation study Bible references,
Lessons From the Bible, and the Courage book.
Bible references can also be grouped by token count.

## Documentation

| Chapter                                           | Responsibility                                            |
| ------------------------------------------------- | --------------------------------------------------------- |
| [1. Local development](docs/local-development.md) | Install, run, debug, build, and format the project.       |
| [2. Configuration](docs/configuration.md)         | Set runtime variables for local and Docker execution.     |
| [3. API](docs/api.md)                             | Send requests and interpret responses and errors.         |
| [4. Architecture](docs/architecture.md)           | Follow request processing and locate implementation code. |
| [5. Testing](docs/testing.md)                     | Run unit and live regression checks.                      |
| [6. Deployment](docs/deployment.md)               | Build, run, and publish Docker images.                    |

Start with local development to run the service, or use the API chapter to connect to an existing instance.
Each chapter links to related topics and the next chapter.

For agent instructions and development rules, read the [project constitution](AGENTS.md).

## Disclaimer

This tool is intended for personal use only. Use of this tool must comply with WOL terms and conditions.
Do not redistribute WOL content, use it commercially, or post it to other sites unless the applicable terms allow it.

## License

See [LICENSE](LICENSE).
