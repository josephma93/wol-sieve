import { CheerioAPI } from 'cheerio';
import { logger } from '../kernel/index.js';
import * as cheerio from 'cheerio';

const log = logger.child({ ...logger.bindings(), label: 'scraper-generics' });

export interface ExtractionInput {
	$?: CheerioAPI;
	html?: string;
	selection?: ReturnType<CheerioAPI>;
	selectionBuilder?: ($: CheerioAPI) => ReturnType<CheerioAPI>;
}

interface ExtractorInputWithDefaults extends ExtractionInput {
	$: CheerioAPI;
	html: string;
	selection: ReturnType<CheerioAPI>;
}

/**
 * Processes the extraction input and deals with defaults.
 * @param input The input object necessary values for correct extraction.
 * @returns The input object with the default values filled in.
 * @throws If something is wrong with the input.
 */
export function processExtractionInput(input: ExtractionInput): ExtractorInputWithDefaults {
	let { $, html, selection, selectionBuilder } = input;

	const isCheerioProvided = !!$;
	const isHtmlProvided = !!html;

	// Either a cheerio object or HTML string must be provided
	if (!isCheerioProvided && !isHtmlProvided) {
		const msg = 'No HTML or Cheerio object provided';
		log.error(msg);
		throw new Error(msg);
	}

	// When cheerio is missing we create it from the HTML
	if (isHtmlProvided && !isCheerioProvided) {
		let htmlTxt: string = html;
		$ = cheerio.load(htmlTxt);
	}

	if (!$) {
		const msg = 'No Cheerio object provided';
		log.error(msg);
		throw new Error(msg);
	}

	// If there is no selection, we build it if there is a selection builder
	if (!selection && selectionBuilder) {
		selection = selectionBuilder($ as CheerioAPI);
	}

	if (!selection) {
		selection = $('*');
	}

	// Put together an object with all values together for usage
	return {
		$: $ as CheerioAPI,
		html: html || '',
		selection,
		selectionBuilder: selectionBuilder || (() => selection),
	};
}
