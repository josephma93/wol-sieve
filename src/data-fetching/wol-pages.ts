import { CONSTANTS, opErrored, logger, wrapAsyncOp } from '../kernel/index.js';
import { getHtmlContent } from './raw.js';
import { getCheerioSelectionOrThrow } from '../data-extraction/generic.js';
import * as cheerio from 'cheerio';

const log = logger.child({ ...logger.bindings(), label: 'retrievers' });

/**
 * Fetches the landing HTML from the WOL website.
 * @returns A promise that resolves to an HTML string or an Error.
 * 		The string is the HTML content of fetching the URL `BASE_URL`.
 * @throws If document structure has changed.
 * @see CONSTANTS.WOL_URL
 */
async function _fetchLanguageSpecificLandingHtml(): Promise<string | Error> {
	const { WOL_URL } = CONSTANTS;

	log.info(`Fetching landing HTML from [${WOL_URL}]`);
	let opRes = await getHtmlContent(WOL_URL);
	if (opErrored(opRes)) {
		return opRes.err;
	}

	const linkElement = getCheerioSelectionOrThrow(cheerio.load(opRes.res), CONSTANTS.CSS_SELECTOR_FOR_LINK_TO_LANG);
	const hrefLangEs = linkElement.attr('href');
	log.debug(`Value for hrefLangEs: [${hrefLangEs}]`);

	const landingForLanguage = `${WOL_URL}${hrefLangEs}`;
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

/**
 * Fetches this week's meeting HTML from the WOL website.
 * @returns A promise that resolves to either the HTML content as a string or an Error object if any error occurs.
 * 		The string is the HTML content of fetching the meeting for this week. This is the same to pressing the today navigation link in the WOL website.
 */
async function _fetchThisWeekMeetingHtml(): Promise<string | Error> {
	let opRes = await fetchLanguageSpecificLandingHtml();
	if (opErrored(opRes)) {
		return opRes.err;
	}

	log.debug("Selecting today's navigation link");
	const anchorElement = getCheerioSelectionOrThrow(
		cheerio.load(opRes.res),
		CONSTANTS.CSS_SELECTOR_FOR_TODAYS_NAVIGATION_LINK,
	);
	const todayNav = anchorElement.attr('href');

	log.debug(`Value for href: [${todayNav}]`);
	if (!todayNav) {
		const msg = `No href found for today's navigation link, website structure may have changed`;
		log.warn(msg);
		return new Error(msg);
	}

	const todayHtmlUrl = `${CONSTANTS.WOL_URL}${todayNav}`;
	log.info(`Fetching today's HTML content from [${todayHtmlUrl}]`);
	opRes = await getHtmlContent(todayHtmlUrl);
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
	let opRes = await fetchThisWeekMeetingHtml();
	if (opErrored(opRes)) {
		return opRes.err;
	}

	log.debug('Selecting watchtower article link');
	const anchorElement = getCheerioSelectionOrThrow(
		cheerio.load(opRes.res),
		CONSTANTS.CSS_SELECTOR_FOR_WATCHTOWER_ARTICLE_LINK,
	);
	const wArticleHref = anchorElement.attr('href');

	log.debug(`Value for href: [${wArticleHref}]`);
	if (!wArticleHref) {
		const msg = `No href found for watchtower article link, website structure may have changed`;
		log.warn(msg);
		return new Error(msg);
	}

	const wArticleHtmlUrl = `${CONSTANTS.WOL_URL}${wArticleHref}`;
	log.info(`Fetching watchtower HTML content from [${wArticleHtmlUrl}]`);
	opRes = await getHtmlContent(wArticleHtmlUrl);
	return opRes.err ?? opRes.res;
}

/**
 * Fetches this week's meeting HTML from the WOL website with error handling.
 * @returns A promise that resolves to a tuple where the first element is an
 *      Error object (or null if no error occurred) and the second element is HTML content (or null if an error occurred).
 */
export const fetchThisWeekWatchtowerHtml = wrapAsyncOp(_fetchThisWeekWatchtowerHtml);
