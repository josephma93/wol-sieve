# WOL URL `#h=` Fragment

## Purpose

Use this note when you inspect or build a WOL URL that contains `#h=`.

Full example:

```text
https://wol.jw.org/es/wol/d/r4/lp-s/2023365#h=21:308-25:153
```

This note describes the current client-side model that WOL uses for `#h=`.

## What This Is

`#h=` is a URL fragment used by WOL.

The URL fragment is the part after `#`.

In this example, the page URL is:

```text
https://wol.jw.org/es/wol/d/r4/lp-s/2023365
```

The fragment is:

```text
#h=21:308-25:153
```

WOL uses this fragment to reopen the page with a text highlight selection.

This is a page-view feature.

It is not page content by itself.

## Why It Matters

This detail matters for three reasons:

1. It explains how WOL links can point to one text selection.
2. It explains why browser-rendered highlights do not exist in the raw published HTML.
3. It gives a workable rule for local offset construction from saved HTML.

## Status

This note is based on observed runtime behavior and inspected WOL client code loaded in the browser.

WOL server source code is not available here.

Treat server-side details as unknown.

Treat the client-side offset rules in this note as the current working contract.

## Terms

Use these terms in this note:

-   `URL fragment`: the part of a URL after `#`.
-   `block`: one WOL content block addressed by the fragment.
-   `block ID`: the numeric block identifier in the fragment.
-   `offset`: one text position inside one block.
-   `range`: the full highlight selection from start to end.

## Web Context

Standard web behavior applies here.

The browser keeps the URL fragment on the client side.

The browser does not send the fragment to the server in the HTTP request.

Because of that, a raw HTML fetch for the page URL will not include `#h=` as request input.

If WOL applies the highlight from `#h=`, that work happens after the page loads in the browser.

## Relation to Other WOL Fragments

WOL uses more than one fragment style.

This note is only about `#h=`.

Example fragment styles:

-   `#p123`: appears to point to one block or anchor target
-   `#h=21:308-25:153`: defines one text range

Do not treat `#h=` as one normal single-anchor jump.

It carries selection coordinates.

## Fragment Shape

Use this shape:

```text
#h=<start-block>:<start-offset>-<end-block>:<end-offset>
```

Example:

```text
#h=21:308-25:153
```

Read it as:

-   start at block ID `21`, offset `308`
-   end at block ID `25`, offset `153`

## What The Block ID Means

On document pages, the block ID matches the WOL paragraph block identifier.

In the tested page, block `21` matched `data-pid="21"` and `id="p21"`.

In the same page, block `25` matched `data-pid="25"` and `id="p25"`.

The block ID is not the printed paragraph number.

In that page, printed paragraph `14` lived in block `21`.

## Current Client Flow

The current WOL client flow is:

1. Read the `h` fragment from the URL.
2. Parse it into start and end block values plus offsets.
3. Resolve the matching `data-pid` blocks.
4. Walk descendant text nodes in DOM order.
5. Insert or apply highlight markup in the browser.

The current runtime path uses functions named `highlightUrlFragment()`, `getValidParagraphRange()`,
`highlightParagraphTextRange()`, and `insertTag()`.

## Offset Rules

Use these rules for the current WOL client:

-   Count text from the parsed DOM, not from raw HTML source bytes.
-   Walk descendant text nodes in DOM order.
-   Use JavaScript string length for the count.
-   Count paragraph number text.
-   Count link text.
-   Count text produced from decoded HTML entities such as `&nbsp;`.
-   Do not count markup.
-   Do not count attributes.
-   Do not count empty elements that have no text nodes.
-   Current client code skips text nodes whose value is exactly `\n`.

**NOTE** JavaScript string length counts UTF-16 code units.

This detail can matter for emoji or other non-BMP characters.

## Start And End Semantics

The start offset is inclusive.

The end offset is exclusive.

This matches current client behavior.

Example:

-   `21:0-21:2` highlights the two-character paragraph number `14`
-   `21:344-21:352` highlights the eight-character link text `Ecl. 3:7`
-   `21:352-21:354` highlights `).`

## Why `inserted` Appears

WOL adds `span.jwac-textHighlight.inserted` when a range boundary falls inside one text node.

WOL adds the highlight class to an existing element when the full text of that element is selected.

That is why one range can produce both:

-   inserted wrapper spans
-   existing elements with `jwac-textHighlight`

## Worked Example

For this fragment:

```text
#h=21:308-25:153
```

the current client model fits the page exactly.

For block `21`:

-   printed paragraph number `14` contributes `2`
-   the following text before the empty page marker contributes `306`
-   the empty page marker contributes `0`

That gives `308`.

Offset `308` starts before this text:

```text
no vale la pena tratar de comentar (
```

For block `25`:

-   printed paragraph number `17` contributes `2`
-   the following text before the empty page marker contributes `151`
-   the empty page marker contributes `0`

That gives `153`.

Offset `153` ends before this text:

```text
edad (
```

This means the fragment highlights:

1. block `21` from offset `308` to the end of the block
2. full blocks between `21` and `25`
3. block `25` from the start of the block to offset `153`

## Local Reconstruction Rule

You can build `#h=` offsets from saved WOL HTML.

Do not count characters from the raw file directly.

Parse the HTML into a DOM first.

Then use this procedure:

1. Find the target block by `data-pid` or the matching `id="p..."`.
2. Collect descendant text nodes in DOM order.
3. Ignore nodes whose value is exactly `\n`.
4. Sum JavaScript string length across the collected text.
5. Record the start offset at the first selected text position.
6. Record the end offset as the first position after the selected text.

This rule should match current WOL browser behavior more closely than any raw HTML byte count.

## Limits

This repository does not parse or generate `#h=` fragments today.

Current box resolution in `pub-w` uses `href` fragments such as `#p123` and a title fallback.

See [src/scrappers/pub-w/pub-w.ts](/Users/joseph.montero/learning/wol-sieve/src/scrappers/pub-w/pub-w.ts:120).

Use this note as research context for future work.

Do not treat it as one active scraper contract until code and tests use it.
