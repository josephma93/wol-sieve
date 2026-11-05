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

## Layout variants within a stencil

A stencil can have layout variants without changing the meaning or order of its content.
Image compositions can place text over a background or blend an image into the surrounding background.
These compositions can introduce containers around a heading, some questions, or an entire group of content blocks.
Related content can continue outside the visual container.

A visual container does not necessarily define a section boundary.
A section heading can be inside that container while later questions or associated figures remain outside it.
Extract the complete logical section and preserve source order across those containers.
Use structural signals to identify the layout variant before selecting the extraction scope.
Verify those signals against the affected samples before applying them elsewhere.

Distinguish content images from background fragments that complete a visual composition.
Preserve the association between each content image and its related question or paragraph.
Do not return decorative fragments as additional content images.

Document publication-specific selectors, source cases, and expected results beside the relevant implementation, fixtures, or tests.
Keep regression scenarios for both layout variants and ordinary layouts.
Tests must verify complete sections, content order, image associations, and nested content when present.

Previous: [Architecture](architecture.md). Next: [Testing](testing.md).
