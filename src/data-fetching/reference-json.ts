import { logger } from '../kernel/index.js';
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
import { pickAndApplyTextExtractor } from '../data-extraction/extractors-as-text.js';
import type { CheerioAPI } from 'cheerio';
import { wrapAsyncOp } from '../kernel/index.js';

/**
 * Logger instance for this module.
 */
const log = logger.child({ ...logger.bindings(), label: 'tooltip-data-retriever' });

/**
 * Represents the parsed publication reference data.
 */
export interface PublicationRefData extends PublicationRefDetectionData {
	parsedContent: string;
}

/**
 * Builds a PublicationRefData object from the given raw reference data.
 * @param rawReferenceData - A JSON object that meets expected parsing requirements.
 * @returns The parsed reference data.
 */
export function buildPublicationRefData(rawReferenceData: BasePublicationItem): PublicationRefData {
	const contentDetectionData = detectReferenceDataType(rawReferenceData);
	const parsedContent = pickAndApplyTextExtractor(contentDetectionData, rawReferenceData.content);
	return {
		...contentDetectionData,
		parsedContent,
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
function parseAnchorRefDataOrThrow(
	fetchedReferenceJson: any | DefaultPublicationRefResponse | BiblicalPassageRefResponse,
): PublicationRefData {
	if (!isJsonContentAcceptableForReferenceExtraction(fetchedReferenceJson)) {
		throw new Error(`JSON content for reference doesn't match the expected format.`);
	}
	const [itemData] = fetchedReferenceJson.items;
	return buildPublicationRefData(itemData);
}

/**
 * Fetches the JSON reference content from the WOL website given the anchor reference extraction data.
 * @param $anchor - The cheerio element for the anchor reference to fetch.
 * @returns A promise that resolves to either the JSON content or an Error object.
 */
async function _fetchAnchorData(
	$anchor: ReturnType<CheerioAPI>,
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
async function _fetchAndParseAnchorReferenceOrThrow(
	$anchor: ReturnType<CheerioAPI>,
): Promise<PublicationRefData | Error> {
	const opRes = await fetchAnchorData($anchor);
	if (opRes.err) {
		return opRes.err;
	}
	const parsed = parseAnchorRefDataOrThrow(opRes.res as DefaultPublicationRefResponse | BiblicalPassageRefResponse);
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
