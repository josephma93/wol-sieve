import * as cheerio from 'cheerio';
import { cleanText, collapseConsecutiveLineBreaks } from './generic.js';
import { BasePublicationItem, PublicationRefDetectionData } from './reference-json-commons.js';
import { CheerioAPI } from 'cheerio';

/**
 * A function that parses HTML content and returns the extracted text.
 */
type ReferenceAsTextBuilder = (content: string) => string;

/**
 * Pub W text extraction strategy.
 * @param content - The HTML content to parse.
 * @returns The text parsed.
 */
export function extractPubWReferenceAsText(content: string): string {
	const $ = cheerio.load(content);
	return $('p.sb')
		.map((_, el) => {
			const $el = $(el);
			$el.find('.parNum').remove();
			return cleanText($el.text());
		})
		.get()
		.join('\n');
}

/**
 * Pub NWTSTY text extraction strategy.
 * @param content - The Cheerio selection or HTML string to parse.
 * @param [$document] - The document loaded initially
 * @returns The text parsed.
 */
export function extractPubNwtstyReferenceAsText(content: ReturnType<CheerioAPI>, $document: CheerioAPI): string;
export function extractPubNwtstyReferenceAsText(content: string, $document?: CheerioAPI): string;
export function extractPubNwtstyReferenceAsText(
	content: string | ReturnType<CheerioAPI>,
	$document?: CheerioAPI,
): string {
	let context: ReturnType<CheerioAPI>;
	let $: CheerioAPI;

	if (typeof content === 'string') {
		$ = cheerio.load(content);
		context = $('*');
	} else {
		context = content;
		if (!$document) {
			throw new Error('This method signature requires a CheerioAPI to be present.');
		}
		$ = $document;
	}

	context.find('a.fn, a.b').remove();
	context.find('.sl, .sz').each((_, el) => {
		$(el).append('<span> </span>');
	});

	return cleanText(context.text()).replace(/(\s\n|\n\s)/g, '\n');
}

/**
 * Default text extraction strategy.
 * @param content - The HTML content to parse.
 * @returns The text parsed.
 */
export function extractReferenceAsTextDefaultStrategy(content: string): string {
	const $ = cheerio.load(content);
	return collapseConsecutiveLineBreaks(cleanText($.text()));
}

/**
 * Extracts the reference text from the given publication reference data.
 * @param contentDetectionData
 * @param contentToParse
 * @returns The reference text extracted.
 */
export function pickAndApplyTextExtractor(
	{ isPubW, isPubNwtsty }: PublicationRefDetectionData,
	contentToParse: BasePublicationItem['content'],
): string {
	let parserStrategy: ReferenceAsTextBuilder;

	if (isPubW) {
		parserStrategy = extractPubWReferenceAsText;
	} else if (isPubNwtsty) {
		parserStrategy = extractPubNwtstyReferenceAsText;
	} else {
		parserStrategy = extractReferenceAsTextDefaultStrategy;
	}

	return parserStrategy(contentToParse);
}
