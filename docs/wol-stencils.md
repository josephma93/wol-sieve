# WOL HTML stencils

[Contents](../README.md#documentation)

Use this chapter when adding a scraper or changing how an existing scraper identifies and extracts publication content.
[Architecture](architecture.md) explains where scrapers fit in the service.
The [constitution](../AGENTS.md#investigate-wol-structures) defines the required investigation checks.

## The stencil model

WOL pages are generated from repeatable HTML stencils.
A stencil is the structural frame used to render a publication page.
It includes document classes, article layout, header structure, heading levels, section containers, figures, tables, pull quotes, links, and other stable markup.

The localized text changes by language. The stencil usually does not.

The term stencil is intentional: WOL appears to render pages from fixed structural molds.
The mold defines where titles, figures, tables, pull quotes, lists, questions, and content blocks belong.
Each language fills those same slots with localized text, but the surrounding HTML shape remains stable.

This matters because scraper logic can often support multiple languages by detecting the stencil instead of reading visible labels.
Classify a page by its structure, rather than words such as "Introduction", "Conclusión", "Section", or "Timeline".

## Structural signals and visible text

Prefer structural signals over visible text.

Good signals:

-   `#article` classes, especially publication classes and `docClass-*`.
-   Stable semantic or layout classes.
-   Presence or absence of elements specific to the stencil.
-   Heading levels and heading counts.
-   Figure placement inside a known container.
-   Direct child structure inside `.bodyTxt`.
-   Tables, lists, pull quotes, and repeated content blocks.
-   Stable IDs when the ID belongs to the stencil.

Weak signals:

-   Localized visible text.
-   Titles, subtitles, and context labels.
-   Punctuation or casing in rendered text.
-   Section names that depend on the language.
-   Text position when the same stencil exposes a better structural marker.

Visible text is still content to extract.
Use it for classification only when structural signals are insufficient.

## Practical workflow

Use supplied URLs and existing curated scenarios when adding publication support or investigating a source variation.
The person defining supported behavior determines which variants matter.
If required samples are missing, ask for them before defining those variants.

1. Select representative WOL URLs for each relevant page type or scenario.
2. Download local HTML copies into a temporary working folder.
3. Compare the downloaded HTML structure across the sample set.
4. Identify which pages share the same `docClass-*`.
5. For shared document classes, find the smallest structural selector that separates the stencils.
6. Validate the selector against all supplied and curated samples for the affected page types.
7. When samples are available, validate the same selector in another language.
8. Implement the detector using structural checks first and visible text only as a fallback.

The expected result is a detector that recognizes the supported stencil across the sample set.
Matching one page is insufficient.

## Local HTML workflow

When investigating a WOL stencil, work from saved HTML samples before editing scraper code.

1. Create a temporary folder for the sample set.
2. Download each selected WOL page into that folder.
3. Inspect the HTML with focused command-line tools.
4. Test selectors against the full sample set before changing scraper logic.

Useful tools:

-   `curl` to download local HTML copies.
-   `htmlq`, when available, to test CSS selectors across multiple samples.
-   `rg` to locate `docClass-*`, `data-video`, `figcaption`, `table`, `h2`, `h3`, and figure containers.
-   `sed` to inspect narrow DOM slices around the relevant block.

Use these tools to compare relevant structures without reading every complete document.

Useful questions:

-   What is the actual container for the content being scraped?
-   What are that container's direct children?
-   Which variants share the same stencil and which do not?
-   Is ordering in the DOM part of the meaning?
-   Which signal is structural, and which signal is only visible text?

This workflow should establish the stencil before scraper edits begin.
If the structure remains unclear, obtain additional representative samples before implementing the detector.

## Scenario selection

Representative sample quality determines selector quality.
Prefer explicitly curated scenarios over guessed variants.
Scenario selection depends on the intended supported behavior.

The sample set should include relevant structural variations, such as:

-   an image at the beginning;
-   an image at the end;
-   multiple images;
-   captions or image comments;
-   callouts or auxiliary prompts;
-   embedded video prompts;
-   alternate wrappers, such as bleed-to-edge containers;
-   lists, tables, or pull quotes.

Use URLs supplied by the person defining supported behavior and existing curated scenarios.
This keeps investigation aligned with actual requirements and avoids expanding support around guessed cases.
The [Postman risk matrix](../postman/README.md#coverage-by-risk) identifies existing coverage and known gaps.
[Testing](testing.md) explains how unit fixtures and live scenarios protect extraction behavior.

## Example: WCG page classification

The Courage book scraper uses the publication code `wcg`.
In WCG, `docClass-13` is shared by lessons, the introduction, and the conclusion.
The page title depends on the language, so it is a poor discriminator.
The document class alone also cannot distinguish those page types.

The stencil provides more specific signals.
The detector checks these conditions in order:

| Structural signal                                         | Page shape   |
| --------------------------------------------------------- | ------------ |
| `.bodyTxt .stdPullQuote` exists                           | lesson       |
| No `.bodyTxt .stdPullQuote`, but `.bodyTxt h3` exists     | conclusion   |
| Neither `.bodyTxt .stdPullQuote` nor `.bodyTxt h3` exists | introduction |

Checking only for `h3` would be insufficient because lessons can also contain those headings.
The pull quote check takes precedence.

For `docClass-15`, the detector uses another ordered set of checks:

| Structural signal                                  | Page shape           |
| -------------------------------------------------- | -------------------- |
| `header #f2 img` exists                            | section introduction |
| No `header #f2 img`, but `.bodyTxt > table` exists | timeline             |
| Neither signal exists                              | unknown              |

These selectors describe the rendering stencil.
They do not depend on Spanish labels, so they can work across languages when WOL preserves the same structure.

See `detectWcgPageType` in the [WCG scraper](../src/scrappers/pub-wcg/pub-wcg.ts) and the
[WCG tests](../src/scrappers/pub-wcg/pub-wcg.test.ts) for the implementation and representative fixtures.
[Curated WCG scenarios](../postman/data/wcg-positive.json) provide source URLs and expected results for live regression.

### WCG study sections with background compositions

Study sections use two layout variants. The heading can be a sibling of the questions or inside a background composition.
A direct parent with `data-bg-image` identifies the second variant. This attribute also occurs around questions inside a section.

For a heading inside a background composition, use that composition as the section start.
Include the composition and its following siblings until the next section heading.
For an ordinary heading, use the following siblings until the next section heading.
Both variants retain question order and use labeled figures to associate images with questions.
Background fragments do not become additional figures.

The following source cases cover these variations:

| Lesson       | Structural variation                                                                                     | Required result                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `1102025914` | Reflection lists surround a background composition.                                                      | Preserve three reflection points and image C on the middle point.     |
| `1102025915` | The study heading and question 1 share a background composition.                                         | Preserve questions 1–4 and images A and B on their labeled questions. |
| `1102025916` | Study question 3 is inside a background composition between ordinary lists.                              | Preserve questions 1–4 and image A on question 3.                     |
| `1102025917` | The study heading and questions share a background composition. Figures follow outside that composition. | Preserve questions 1–4 and image A on question 4.                     |
| `1102025918` | Study questions use an ordinary list with inline figures.                                                | Preserve questions 1–4 and images A and B on their labeled questions. |

The English pages for lessons 15–17 expose the same background layout signals.
This comparison verifies the stencil signal. It does not add English lesson extraction support.

The WCG Postman suite checks exact question arrays, source order, reference labels, figure descriptions, and captions.
Run this suite before changing extraction to reproduce the failure. Run the complete sanity check after the change.

These selectors describe WCG. Inspect the relevant publication before applying them to another scraper.

Previous: [Architecture](architecture.md). Next: [Testing](testing.md).
