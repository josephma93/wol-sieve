import { CONSTANTS, opErrored, logger, wrapAsyncOp } from '../kernel/index.js';
import { getHtmlContent } from './raw.js';
import { getCheerioSelectionOrThrow } from '../data-extraction/generic.js';
import * as cheerio from 'cheerio';

const log = logger.child({ ...logger.bindings(), label: 'retrievers' });

interface HrefExtractionOptions {
	selector: string;
	selectionDescription: string;
	missingHrefMessage: string;
}

/**
 * Resolves the `href` attribute for a target element inside the provided HTML.
 * Loads the markup into cheerio, finds the element by selector, validates the
 * presence of the attribute, and optionally resolves it against a base URL.
 *
 * @param html - Raw HTML string that contains the target element.
 * @param options - Selector and messaging details controlling how the href is extracted.
 * @param options.selector - CSS selector used to find the element.
 * @param options.selectionDescription - Human-readable label for logging.
 * @param options.missingHrefMessage - Warning/error message if `href` is missing.
 * @returns Either the resolved URL as a string or an Error describing what went wrong.
 */
function extractHrefFromHtml(html: string, options: HrefExtractionOptions): string | Error {
	const { selector, selectionDescription, missingHrefMessage } = options;
	log.debug(`Selecting ${selectionDescription}`);
	const element = getCheerioSelectionOrThrow(cheerio.load(html), selector);
	const href = element.attr('href');

	log.debug(`Value for href: [${href}]`);
	if (!href) {
		log.warn(missingHrefMessage);
		return new Error(missingHrefMessage);
	}

	const resolvedHref = `${CONSTANTS.WOL_URL}${href}`;
	log.debug(`Resolved URL for ${selectionDescription}: [${resolvedHref}]`);
	return resolvedHref;
}

/**
 * Fetches the landing HTML from the WOL website.
 * @returns A promise that resolves to an HTML string or an Error.
 * 		The string is the HTML content of fetching the URL `BASE_URL`.
 * @throws If document structure has changed.
 * @see CONSTANTS.WOL_URL
 */
async function _fetchLanguageSpecificLandingHtml(): Promise<string | Error> {
	log.info(`Fetching landing HTML from [${CONSTANTS.WOL_URL}]`);
	let opRes = await getHtmlContent(CONSTANTS.WOL_URL);
	if (opErrored(opRes)) {
		return opRes.err;
	}

	const landingForLanguage = extractHrefFromHtml(opRes.res, {
		selector: CONSTANTS.CSS_SELECTOR_FOR_LINK_TO_LANG,
		selectionDescription: 'language-specific link',
		missingHrefMessage: `No href found for language selection link, website structure may have changed`,
	});
	if (landingForLanguage instanceof Error) {
		return landingForLanguage;
	}
	log.info(`Fetching HTML content from [${landingForLanguage}]`);
	opRes = await getHtmlContent(landingForLanguage);
	return opRes.err ?? opRes.res;
}

/**
 * Fetches the landing HTML from the WOL website with error handling.
 * @returns A promise that resolves to an SuccessResult or an ErrorResult. The SuccessResult contains the HTML content as a string.
 * @see _fetchLanguageSpecificLandingHtml
 */
export const fetchLanguageSpecificLandingHtml = wrapAsyncOp(_fetchLanguageSpecificLandingHtml);

async function _fetchThisWeeksMaterialPageHtml(): Promise<string | Error> {
	let opRes = await fetchLanguageSpecificLandingHtml();
	if (opErrored(opRes)) {
		return opRes.err;
	}

	const todayHtmlUrl = extractHrefFromHtml(opRes.res, {
		selector: CONSTANTS.CSS_SELECTOR_FOR_TODAYS_NAVIGATION_LINK,
		selectionDescription: "today's navigation link",
		missingHrefMessage: `No href found for today's navigation link, website structure may have changed`,
	});
	if (todayHtmlUrl instanceof Error) {
		return todayHtmlUrl;
	}

	log.info(`Fetching today's HTML content from [${todayHtmlUrl}]`);
	opRes = await getHtmlContent(todayHtmlUrl);
	return opRes.err ?? opRes.res;
}

/**
 * Fetches this week's meeting HTML from the WOL website.
 * @returns A promise that resolves to either the HTML content as a string or an Error object if any error occurs.
 * 		The string is the HTML content of fetching the meeting for this week. This is the same to pressing the today navigation link in the WOL website.
 */
async function _fetchThisWeekMeetingHtml(): Promise<string | Error> {
	let weekMaterialOp = await _fetchThisWeeksMaterialPageHtml();
	if (weekMaterialOp instanceof Error) {
		return weekMaterialOp;
	}

	const weeklyBookletHtmlUrl = extractHrefFromHtml(weekMaterialOp, {
		selector: CONSTANTS.CSS_SELECTOR_FOR_WEEKLY_BOOKLET_LINK,
		selectionDescription: "this week's navigation link",
		missingHrefMessage: `No href found for weekly booklet's navigation link, website structure may have changed`,
	});
	if (weeklyBookletHtmlUrl instanceof Error) {
		return weeklyBookletHtmlUrl;
	}

	log.info(`Fetching this week's HTML content from [${weeklyBookletHtmlUrl}]`);
	const opRes = await getHtmlContent(weeklyBookletHtmlUrl);
	return opRes.err ?? opRes.res;
}

/**
 * Fetches this week's meeting HTML from the WOL website with error handling.
 * @returns A promise that resolves to a tuple where the first element is an
 *      Error object (or null if no error occurred) and the second element is HTML content (or null if an error occurred).
 */
export const fetchThisWeekMeetingHtml = wrapAsyncOp(_fetchThisWeekMeetingHtml);

/**
 * Fetches this week's Watchtower ariticle's HTML from the WOL website.
 * @returns A promise that resolves to either the HTML content as a string or an Error object if any error occurs.
 * 		The string is the HTML content of fetching article assigned for this week. This is the same to pressing watchtower article link found in today's page.
 */
async function _fetchThisWeekWatchtowerHtml(): Promise<string | Error> {
	let weekMaterialOp = await _fetchThisWeeksMaterialPageHtml();
	if (weekMaterialOp instanceof Error) {
		return weekMaterialOp;
	}

	const wArticleHtmlUrl = extractHrefFromHtml(weekMaterialOp, {
		selector: CONSTANTS.CSS_SELECTOR_FOR_WATCHTOWER_ARTICLE_LINK,
		selectionDescription: 'watchtower article link',
		missingHrefMessage: `No href found for watchtower article link, website structure may have changed`,
	});
	if (wArticleHtmlUrl instanceof Error) {
		return wArticleHtmlUrl;
	}

	log.info(`Fetching watchtower HTML content from [${wArticleHtmlUrl}]`);
	const opRes = await getHtmlContent(wArticleHtmlUrl);
	return opRes.err ?? opRes.res;
}

/**
 * Fetches this week's meeting HTML from the WOL website with error handling.
 * @returns A promise that resolves to a tuple where the first element is an
 *      Error object (or null if no error occurred) and the second element is HTML content (or null if an error occurred).
 */
export const fetchThisWeekWatchtowerHtml = wrapAsyncOp(_fetchThisWeekWatchtowerHtml);
