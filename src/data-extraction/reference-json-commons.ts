import { logger, CONSTANTS, wrapAsyncOp } from '../kernel/index.js';
import { CheerioAPI } from 'cheerio';
import { getJsonContent } from '../data-fetching/raw.js';

/**
 * Logger instance for this module.
 */
const log = logger.child({ ...logger.bindings(), label: 'extractors-as-text' });

/**
 * Represents the data extracted from an anchor reference.
 */
export interface AnchorRefExtractionData {
	sourceHref: string;
	fetchUrl: string;
}

/**
 * Builds an object containing the source href and the URL to fetch the referenced data, given a cheerio element.
 * @param $el - The cheerio element from which to extract the data.
 * @returns An object containing the source href and the URL to fetch.
 */
export function buildAnchorRefExtractionData($el: ReturnType<CheerioAPI>): AnchorRefExtractionData {
	const sourceHref = $el.attr('href') || '';
	const fetchUrl = `${CONSTANTS.WOL_URL}${sourceHref.slice(3)}`;
	return {
		sourceHref,
		fetchUrl,
	};
}

/**
 * Represents a base publication item.
 */
export interface BasePublicationItem {
	title: string;
	url: string;
	caption: string;
	content: string;
	articleClasses: string;
	reference: string;
	categories: string[];
	pubType: string;
	publicationTitle: string;
}

/**
 * Represents a biblical passage item, extending the base publication item.
 */
export interface BiblicalPassageItem extends BasePublicationItem {
	book: number;
	first_chapter: number;
	first_verse: number;
	last_chapter: number;
	last_verse: number;
}

/**
 * Represents the base structure of a publication response.
 */
export interface BasePublicationRefResponse {
	title: string;
}

/**
 * Represents a response containing biblical passages.
 */
export interface BiblicalPassageRefResponse extends BasePublicationRefResponse {
	items: BiblicalPassageItem[];
}

/**
 * Represents a default publication response.
 */
export interface DefaultPublicationRefResponse extends BasePublicationRefResponse {
	items: BasePublicationItem[];
}

/**
 * Represents the detection data for publication references.
 */
export interface PublicationRefDetectionData {
	isPubW: boolean;
	isPubNwtsty: boolean;
}

/**
 * Fetches the JSON content from the WOL website given the anchor reference extraction data.
 * @param anchorRefExtractionData - An object containing the source href and the URL to fetch the referenced data.
 * @returns A promise that resolves to a tuple where the first element is an
 *      Error object (or null if no error occurred) and the second element is the JSON content (or null if an error occurred).
 */
async function _fetchAnchorReferenceData(
	anchorRefExtractionData: AnchorRefExtractionData,
): Promise<DefaultPublicationRefResponse | BiblicalPassageRefResponse | Error> {
	const { fetchUrl } = anchorRefExtractionData;
	const opRes = await getJsonContent(fetchUrl);
	return opRes.err ?? (opRes.res as DefaultPublicationRefResponse | BiblicalPassageRefResponse);
}

export const fetchAnchorReferenceData = wrapAsyncOp(_fetchAnchorReferenceData);

/**
 * Checks if the JSON fetched from the WOL website is acceptable for reference extraction.
 * @param json The JSON content to check.
 * @returns True if the JSON content is acceptable for reference extraction, false otherwise.
 */
export function isJsonContentAcceptableForReferenceExtraction(
	json: any | DefaultPublicationRefResponse | BiblicalPassageRefResponse,
): boolean {
	let isValid = true;
	if (!Array.isArray(json.items) || json.items.length < 1) {
		log.error(`JSON content doesn't contain exactly one item. JSON content: ${JSON.stringify(json)}`);
		isValid = false;
	}
	const [itemData] = json.items;
	if (typeof itemData.content !== 'string' || !itemData.content) {
		log.error(`JSON content doesn't contain content. JSON content: ${JSON.stringify(json)}`);
		isValid = false;
	}
	if (typeof itemData.articleClasses !== 'string' || !itemData.articleClasses) {
		log.error(`JSON content doesn't contain articleClasses. JSON content: ${JSON.stringify(json)}`);
		isValid = false;
	}
	return isValid;
}

/**
 * Detects the publication types for the given base publication item.
 * @param itemData - The item data to detect the publication types for.
 * @returns An object containing the detected publication types.
 */
export function detectReferenceDataType(itemData: BasePublicationItem): PublicationRefDetectionData {
	const articleClasses = itemData.articleClasses;
	const isPubW = new RegExp(`\\b${CONSTANTS.PUB_CODE_WATCHTOWER}\\b`, 'i').test(articleClasses);
	const isPubNwtsty = new RegExp(`\\b${CONSTANTS.PUB_CODE_BIBLE}\\b`, 'i').test(articleClasses);
	return {
		isPubW,
		isPubNwtsty,
	};
}
