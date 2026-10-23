# API

[Contents](../README.md#documentation)

The current API uses the `/v2` path.
For a base URL, use the host and port of your [local service](local-development.md) or [Docker container](deployment.md#build-and-run).

## Endpoints

All endpoints below use `GET`.

| Path                         | Result                                        | Source parameter |
| ---------------------------- | --------------------------------------------- | ---------------- |
| `/v2/`                       | HTML index with clickable sample requests     | None             |
| `/v2/pub-w/`                 | Watchtower article                            | `url`            |
| `/v2/pub-mwb/`               | Complete Midweek meeting program              | `url`            |
| `/v2/pub-mwb/treasures-talk` | Midweek meeting treasures talk                | `url`            |
| `/v2/pub-nwtsty/`            | Study Bible references                        | `urls`           |
| `/v2/pub-nwtsty/grouped`     | Study Bible references grouped by token count | `urls`           |
| `/v2/pub-lfb/`               | Lessons From the Bible content                | `urls`           |
| `/v2/pub-wcg/`               | Courage book content                          | `urls`           |

`GET /` redirects to `/v2/`. `GET /ping` returns `pong` without fetching WOL content.

## Query parameters

Single-source endpoints accept one optional `url` value.
The value must be an absolute `wol.jw.org` URL for the requested publication.
Omitting `url` selects the current default source.

Batch endpoints accept one or more `urls` values.
Repeat the parameter for multiple sources: `?urls=url1&urls=url2`.
Omitting `urls` selects the endpoint's default sources.
Sources must use `wol.jw.org`; Bible endpoints also validate the study Bible URL structure.
Invalid source URL parameters return HTTP 400. Batch failures return an error instead of partial results.

Use URL encoding when passing source URLs.
With a local service running at its default port, request a Watchtower article:

```bash
curl --get 'http://localhost:5000/v2/pub-w/' \
  --data-urlencode 'url=https://wol.jw.org/es/wol/d/r4/lp-s/2025521'
```

JSON endpoints accept `?pretty`, `?pretty=true`, or `?pretty=1` to format the response.
The `true` value is case-insensitive. Other values return HTTP 400.
Omit `pretty` for the default JSON format.

The grouped Bible endpoint accepts an optional `tokenLimit` integer from `1` through `128000`.
The default is `128000`. Invalid values return HTTP 400.
Grouping includes entries with citations and uses their citation token counts.
An entry that exceeds the limit forms its own cluster.

Example with two sources and a grouping limit:

```bash
curl --get 'http://localhost:5000/v2/pub-nwtsty/grouped' \
  --data-urlencode 'urls=https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70' \
  --data-urlencode 'urls=https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/71' \
  --data-urlencode 'tokenLimit=1000'
```

## Watchtower response

`GET /v2/pub-w/` returns article metadata, ordered content, and relationships between content items.

Metadata fields are `articleNumber`, `articleTitle`, `articleThemeScrip`, and `articleTopic`.
The `content` array contains items in published order. Each item has a `kind` and a `payload`.

Supported kinds are `sectionHeading`, `question`, `paragraph`, `illustration`, `boxSupplement`, `footnote`, `video`, and `teachBlock`.

The `indexReferences` object links items by their zero-based indexes in `content`.

| Field             | Meaning                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `teachBlockIndex` | Required index of the `teachBlock` item. Extraction fails if the source lacks this block. |
| `questions`       | Required array of question associations.                                                  |
| `footnotes`       | Optional array of footnote links.                                                         |
| `boxSupplements`  | Optional array of box supplement links.                                                   |

Each question association has these fields:

| Field                          | Target kind      | Presence       |
| ------------------------------ | ---------------- | -------------- |
| `questionIndex`                | `question`       | Required       |
| `sectionHeadingIndex`          | `sectionHeading` | Optional       |
| `relevantParagraphIndexes`     | `paragraph`      | Optional array |
| `relevantIllustrationIndexes`  | `illustration`   | Optional array |
| `relevantBoxSupplementIndexes` | `boxSupplement`  | Optional array |
| `relevantFootnoteIndexes`      | `footnote`       | Optional array |
| `relevantVideoIndexes`         | `video`          | Optional array |

Each footnote link contains `sourceIndex`, `targetIndex`, and `marker`.
Its `targetIndex` points to a `footnote` item.
Each box supplement link contains `sourceIndex`, `targetIndex`, and `title`.
Its `targetIndex` points to a `boxSupplement` item.
Every index points to an existing content item of the expected kind.

Empty optional arrays are omitted.
Use a default empty array when processing optional metadata:

```js
for (const index of question.relevantParagraphIndexes ?? []) {
	const paragraph = response.content[index];
}

for (const ref of response.indexReferences.footnotes ?? []) {
	const footnote = response.content[ref.targetIndex];
}
```

## Errors

Errors passed to the central handler use this JSON shape:

```json
{
	"status": "error",
	"message": "Something went wrong!",
	"details": {},
	"stack": "..."
}
```

`status` is `"fail"` for `AppError` responses with HTTP 4xx status codes.
Other errors handled centrally use `"error"`.
`details` is optional and contains additional error information when provided.
`stack` is optional and appears only in [development mode](configuration.md).
Unmatched routes use Express's default 404 response.

See [Architecture](architecture.md#request-flow) for request and error processing.
See [Testing](testing.md#live-regression) for checks against real WOL sources.

Previous: [Configuration](configuration.md). Next: [Architecture](architecture.md).
