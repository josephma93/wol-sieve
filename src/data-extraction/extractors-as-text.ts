import * as cheerio from 'cheerio';
import { cleanText, collapseConsecutiveLineBreaks } from './generic.js';
import { BasePublicationItem, PublicationRefDetectionData } from './reference-json-commons.js';

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
 * @param content - The HTML content to parse.
 * @returns The text parsed.
 */
export function extractPubNwtstyReferenceAsText(content: string): string {
	const $ = cheerio.load(content);
	$('a.fn, a.b').remove();
	$('.sl, .sz').each((_, el) => {
		$(el).append('<span> </span>');
	});
	return cleanText($.text()).replace(/(\s\n|\n\s)/g, '\n');
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
