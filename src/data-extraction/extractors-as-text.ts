import * as cheerio from 'cheerio';
import { cleanText, collapseConsecutiveLineBreaks } from '../kernel/index.js';
import { BasePublicationItem, PublicationRefDetectionData } from './reference-json-commons.js';
import { CheerioAPI } from 'cheerio';
import type { CheerioSelection } from './generic.js';

/**
 * A function that parses HTML content and returns the extracted text.
 */
type ReferenceAsTextBuilder = (content: string) => string;

interface TextExtractionContext {
	$: CheerioAPI;
	root: CheerioSelection;
}

type TextExtractionStep = (context: TextExtractionContext) => TextExtractionContext;
type TextExtractionOutput = (context: TextExtractionContext) => string;

function createTextExtractionContext(
	content: string | CheerioSelection,
	$document?: CheerioAPI,
): TextExtractionContext {
	if (typeof content === 'string') {
		const $ = $document ?? cheerio.load(content);
		return { $, root: $(content) };
	}

	return { $: $document ?? cheerio.load(''), root: content };
}

function runTextExtractionPipeline(
	context: TextExtractionContext,
	steps: TextExtractionStep[],
	output: TextExtractionOutput,
): string {
	const finalContext = steps.reduce((currentContext, step) => step(currentContext), context);
	return output(finalContext);
}

function removeElements(selector: string): TextExtractionStep {
	return (context) => {
		context.root.find(selector).remove();
		return context;
	};
}

function selectPubWReferenceParagraphs(context: TextExtractionContext): TextExtractionContext {
	const $citationParagraphs = context.$('p.sb, p[data-rel-pid]');
	const root = $citationParagraphs.length ? $citationParagraphs : context.$('.bodyTxt p');
	return { ...context, root };
}

function fixNwtstySpacing(context: TextExtractionContext): TextExtractionContext {
	context.root.find('.sz').each((_, el) => {
		const element = context.$(el);
		const previousText = element.prev().text();
		// Fix for padding spacing.
		if (previousText && !/\s$/.test(previousText) && !/^\s/.test(element.text())) {
			element.prepend(' ');
		}
	});

	context.root.each((_, el) => {
		const element = context.$(el);
		const hasSpacingSignal = element.hasClass('sz') || element.parent().hasClass('sz');
		if (!hasSpacingSignal || /^\s/.test(element.text())) {
			return;
		}

		element.prepend(' ');
	});

	return context;
}

function outputCleanText(context: TextExtractionContext): string {
	return cleanText(context.root.text());
}

function outputNwtstyText(context: TextExtractionContext): string {
	return context.root
		.map((_, el) => cleanText(context.$(el).text().replace(/\s+/g, ' ')).replace(/(\s\n|\n\s)/g, '\n'))
		.get()
		.filter(Boolean)
		.join(' ');
}

function outputDefaultText(context: TextExtractionContext): string {
	return collapseConsecutiveLineBreaks(cleanText(context.$.text()));
}

function outputParagraphText(separator: string): TextExtractionOutput {
	return (context) =>
		context.root
			.map((_, el) => cleanText(context.$(el).text().replace(/\s+/g, ' ')))
			.get()
			.filter(Boolean)
			.join(separator);
}

/**
 * Pub W text extraction strategy.
 * @param content - The HTML content to parse.
 * @returns The text parsed.
 */
export function extractPubWReferenceAsText(content: string): string {
	return runTextExtractionPipeline(
		createTextExtractionContext(content),
		[selectPubWReferenceParagraphs, removeElements('.parNum')],
		outputParagraphText('\n'),
	);
}

/**
 * Pub NWTSTY text extraction strategy.
 * @param content - The Cheerio selection or HTML string to parse.
 * @param [$document] - The document loaded initially
 * @returns The text parsed.
 */
export function extractPubNwtstyReferenceAsText(content: CheerioSelection, $document: CheerioAPI): string;
export function extractPubNwtstyReferenceAsText(content: string, $document?: CheerioAPI): string;
export function extractPubNwtstyReferenceAsText(content: string | CheerioSelection, $document?: CheerioAPI): string {
	return runTextExtractionPipeline(
		createTextExtractionContext(content, $document),
		[removeElements('a.fn, a.b'), fixNwtstySpacing],
		outputNwtstyText,
	);
}

/**
 * Pub NWTSTY study note extraction strategy.
 * @param content - The studyContent HTML to parse.
 * @returns The study note text parsed.
 */
export function extractPubNwtstyStudyContentAsText(content: string): string {
	const context = createTextExtractionContext(content);
	const $noteParagraphs = context.$('p');

	if (!$noteParagraphs.length) {
		return runTextExtractionPipeline(context, [], outputCleanText);
	}

	return runTextExtractionPipeline(
		{ ...context, root: $noteParagraphs },
		[removeElements('a.fn')],
		outputParagraphText('\n\n'),
	);
}

/**
 * Default text extraction strategy.
 * @param content - The HTML content to parse.
 * @returns The text parsed.
 */
export function extractReferenceAsTextDefaultStrategy(content: string): string {
	return runTextExtractionPipeline(createTextExtractionContext(content), [], outputDefaultText);
}

function isPubNwtstyStudyNoteReference(
	{ isPubNwtsty }: PublicationRefDetectionData,
	publicationItem: BasePublicationItem,
): boolean {
	return isPubNwtsty && Boolean(publicationItem.studyContent?.trim());
}

/**
 * Extracts the reference text from the given publication reference data.
 * @param contentDetectionData
 * @param publicationItem
 * @returns The reference text extracted.
 */
export function pickAndApplyTextExtractor(
	contentDetectionData: PublicationRefDetectionData,
	publicationItem: BasePublicationItem,
): string {
	let parserStrategy: ReferenceAsTextBuilder;
	const { isPubW, isPubNwtsty } = contentDetectionData;

	if (isPubNwtstyStudyNoteReference(contentDetectionData, publicationItem)) {
		return extractPubNwtstyStudyContentAsText(publicationItem.studyContent || '');
	}

	if (isPubW) {
		parserStrategy = extractPubWReferenceAsText;
	} else if (isPubNwtsty) {
		parserStrategy = extractPubNwtstyReferenceAsText;
	} else {
		parserStrategy = extractReferenceAsTextDefaultStrategy;
	}

	return parserStrategy(publicationItem.content);
}
