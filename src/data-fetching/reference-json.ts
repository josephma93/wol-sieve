import * as cheerio from 'cheerio';
import { CONSTANTS, logger } from '../kernel/index.js';
import { getJsonContent } from './raw.js';
import {
	BasePublicationItem,
	BiblicalPassageRefResponse,
	buildAnchorRefExtractionData,
	DefaultPublicationRefResponse,
	detectReferenceDataType,
	fetchAnchorReferenceData,
	isJsonContentAcceptableForReferenceExtraction,
	PublicationRefDetectionData,
} from '../data-extraction/reference-json-commons.js';
import { deriveReferenceType } from '../data-extraction/citations.js';
import { pickAndApplyTextExtractor } from '../data-extraction/extractors-as-text.js';
import type { CheerioSelection } from '../data-extraction/generic.js';
import { wrapAsyncOp } from '../kernel/index.js';

/**
 * Logger instance for this module.
 */
const log = logger.child({ ...logger.bindings(), label: 'tooltip-data-retriever' });

/** Complete publication footnotes before converting reference HTML to text. */
async function completePublicationFootnotes(item: BasePublicationItem): Promise<BasePublicationItem> {
	// Bible references have a separate note extraction contract.
	if (detectReferenceDataType(item).isPubNwtsty) return item;
	const $ = cheerio.load(item.content, null, false);
	const notes = new Set(
		$('.fn-ref[data-fnid]')
			.map((_, el) => $(el).attr('data-fnid')!)
			.get(),
	);
	const attempted = new Set<string>();
	for (const anchor of $('a.fn[data-fnid][href]').toArray()) {
		const fnid = $(anchor).attr('data-fnid')!;
		const href = $(anchor).attr('href')!;
		if (notes.has(fnid) || attempted.has(href)) continue;
		attempted.add(href);
		// Follow only explicit WOL footnote endpoints, never arbitrary content links.
		if (!/^\/(?:[a-z-]+\/)?wol\/fn\/[^/]+\/[^/]+\/\d+\/\d+$/.test(href)) {
			log.warn({ href, fnid }, 'Unsupported publication footnote URL.');
			continue;
		}
		const url = new URL(href, CONSTANTS.WOL_URL).href;
		const result = await getJsonContent(url);
		if (result.err) {
			// Keep the available citation when a supplementary note cannot be fetched.
			log.warn({ err: result.err, url, fnid }, 'Could not complete publication footnote.');
			continue;
		}
		const response = result.res as { items?: { content?: unknown }[] } | null;
		const content = Array.isArray(response?.items) ? response.items[0]?.content : undefined;
		const $note = cheerio.load(typeof content === 'string' ? content : '', null, false);
		const matchingNotes = $note('.fn-ref[data-fnid]').filter((_, el) => $note(el).attr('data-fnid') === fnid);
		if (matchingNotes.length !== 1 || !matchingNotes.text().trim()) {
			log.warn({ url, fnid }, 'Footnote response does not contain the expected note.');
			continue;
		}
		$.root().append(matchingNotes.toString());
		notes.add(fnid);
	}
	return { ...item, content: $.html() };
}

/**
 * Represents the parsed publication reference data.
 */
export interface PublicationRefData extends PublicationRefDetectionData {
	parsedContent: string;
	referenceType: string;
	articleClasses: string;
	englishSymbol: string;
	pubType: string;
	publicationTitle: string;
	source: string;
	title: string;
}

/**
 * Builds a PublicationRefData object from the given raw reference data.
 * @param rawReferenceData - A JSON object that meets expected parsing requirements.
 * @returns The parsed reference data.
 */
export function buildPublicationRefData(rawReferenceData: BasePublicationItem): PublicationRefData {
	const contentDetectionData = detectReferenceDataType(rawReferenceData);
	const parsedContent = pickAndApplyTextExtractor(contentDetectionData, rawReferenceData);
	return {
		...contentDetectionData,
		parsedContent,
		referenceType: deriveReferenceType(rawReferenceData),
		articleClasses: rawReferenceData.articleClasses,
		englishSymbol: rawReferenceData.englishSymbol || '',
		pubType: rawReferenceData.pubType,
		publicationTitle: rawReferenceData.publicationTitle,
		source: rawReferenceData.source,
		title: rawReferenceData.title,
	};
}

/**
 * Attempts to parse the given JSON content fetched from an anchor reference
 * by detecting the type of publication and applying the corresponding parser
 * strategy.
 *
 * @param fetchedReferenceJson - The JSON content fetched from the anchor reference.
 * @returns The parsed publication information.
 * @throws {Error} If the JSON content doesn't match the expected format.
 */
async function parseAnchorRefDataOrThrow(
	fetchedReferenceJson: any | DefaultPublicationRefResponse | BiblicalPassageRefResponse,
): Promise<PublicationRefData> {
	if (!isJsonContentAcceptableForReferenceExtraction(fetchedReferenceJson)) {
		throw new Error(`JSON content for reference doesn't match the expected format.`);
	}
	const [itemData] = fetchedReferenceJson.items;
	return buildPublicationRefData(await completePublicationFootnotes(itemData));
}

/**
 * Fetches the JSON reference content from the WOL website given the anchor reference extraction data.
 * @param $anchor - The cheerio element for the anchor reference to fetch.
 * @returns A promise that resolves to either the JSON content or an Error object.
 */
async function _fetchAnchorData(
	$anchor: CheerioSelection,
): Promise<any | DefaultPublicationRefResponse | BiblicalPassageRefResponse | Error> {
	const anchorRefExtractionData = buildAnchorRefExtractionData($anchor);
	const opRes = await fetchAnchorReferenceData(anchorRefExtractionData);
	return opRes.err ?? opRes.res;
}

/**
 * Fetches the JSON reference content from the WOL website given the anchor reference extraction data.
 * @param $anchor - The cheerio element for the anchor reference to fetch.
 * @returns A promise that resolves to a SuccessResult with the JSON content or an ErrorResult with the error.
 * @see _fetchAnchorData
 */
export const fetchAnchorData = wrapAsyncOp(_fetchAnchorData);

/**
 * Fetches an anchor reference data and attempts to parse it.
 * @param $anchor - The cheerio element for the anchor reference to fetch.
 * @returns A promise that resolves to either the JSON content or an Error object.
 * @throws {Error} If the JSON content doesn't match the expected format.
 */
async function _fetchAndParseAnchorReferenceOrThrow($anchor: CheerioSelection): Promise<PublicationRefData | Error> {
	const opRes = await fetchAnchorData($anchor);
	if (opRes.err) {
		return opRes.err;
	}
	const parsed = await parseAnchorRefDataOrThrow(
		opRes.res as DefaultPublicationRefResponse | BiblicalPassageRefResponse,
	);
	log.debug(
		`Parsed anchor reference data for [${$anchor.text()}] and anchor reference [${$anchor.text()}]: ${JSON.stringify(
			parsed,
		)}`,
	);
	return parsed;
}

/**
 * Fetches an anchor reference data and attempts to parse it.
 * @param $anchor - The cheerio element for the anchor reference to fetch.
 * @returns A promise that resolves to either a SuccessResult with the JSON content or an ErrorResult with the error.
 * @see _fetchAndParseAnchorReferenceOrThrow
 */
export const fetchAndParseAnchorReferenceOrThrow = wrapAsyncOp(_fetchAndParseAnchorReferenceOrThrow);
