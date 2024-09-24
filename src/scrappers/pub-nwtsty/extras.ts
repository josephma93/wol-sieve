import { logger, opErrored, wrapAsyncOp } from '../../kernel/index.js';
import { extractWeeklyBibleRead, WeeklyBibleReadData } from '../pub-mwb/pub-mwb.js';
import { fetchThisWeekMeetingHtml } from '../../data-fetching/wol-pages.js';

const log = logger.child({ ...logger.bindings(), label: 'pub-w-nwtsty' });

/**
 * Checks if a given URL is a valid WOL Bible book URL.
 *
 * A valid URL has the following structure:
 *   wol.jw.org/{language-code}/wol/b/r{book-number}/lp-{language-code}/nwtsty/{chapter-number}/{verse-number}
 *   where:
 *     - {language-code} is a two-letter language code (e.g. 'en', 'es', 'fr', etc.)
 *     - {book-number} is a number from 1 to 66 (inclusive)
 *     - {chapter-number} is a number from 1 to 176 (inclusive)
 *     - {verse-number} is a number from 1 to 176 (inclusive)
 *
 * If the URL is invalid, the function logs a warning message and returns false.
 * If the URL is valid, the function logs an info message and returns true.
 *
 * @param url The URL to check.
 * @returns - True if the URL is valid, false otherwise.
 */
export function isValidWolBibleBookUrl(url: string): boolean {
	log.debug(`Checking if URL is a valid WOL Bible book URL: ${url}`);

	let parsedUrl;
	try {
		parsedUrl = new URL(url);
	} catch (error) {
		log.warn(`Failed to parse URL: ${url}`);
		return false;
	}

	if (parsedUrl.hostname !== 'wol.jw.org') {
		log.debug(`URL is not from wol.jw.org, skipping: ${url}`);
		return false;
	}

	const pathParts = parsedUrl.pathname.split('/');
	log.debug(`Parsed URL path parts: ${pathParts}`);

	if (pathParts.length !== 9) {
		log.warn(`Invalid URL path parts length: ${pathParts.length} (expected 9)`);
		return false;
	}

	if (pathParts[0] !== '') {
		log.warn(`Invalid URL path parts first element: ${pathParts[0]} (expected empty string)`);
		return false;
	}

	if (pathParts[1].length !== 2) {
		log.warn(`Invalid URL path parts second element length: ${pathParts[1].length} (expected 2)`);
		return false;
	}

	if (!pathParts[5].startsWith('lp')) {
		log.warn(`Invalid URL path parts fourth element from end: ${pathParts[5]} (expected to start with 'lp')`);
		return false;
	}

	if (pathParts[6] !== 'nwtsty') {
		log.warn(`Invalid URL path parts third element from end: ${pathParts[6]} (expected 'nwtsty')`);
		return false;
	}

	if (isNaN(parseFloat(pathParts[7])) || isNaN(parseFloat(pathParts[8]))) {
		log.warn(`Invalid URL path parts last two elements: ${pathParts[7]}, ${pathParts[8]} (expected digits)`);
		return false;
	}

	log.info(`URL is a valid WOL Bible book URL: ${url}`);
	return true;
}

/**
 * Builds the default links for the scripture-read-references endpoint by fetching the current week's meeting and extracting the Bible read links.
 * @returns A promise that resolves to an array of strings (the links) or an Error object if any error occurs.
 */
async function _buildDefaultLinks(): Promise<WeeklyBibleReadData['links'] | Error> {
	let htmlOpRes = await fetchThisWeekMeetingHtml();

	if (opErrored(htmlOpRes)) {
		return htmlOpRes.err;
	}

	let bibleReadOpRes = await wrapAsyncOp(extractWeeklyBibleRead)({ html: htmlOpRes.res });
	if (opErrored(bibleReadOpRes)) {
		return bibleReadOpRes.err;
	}
	return bibleReadOpRes.res.links;
}

/**
 * Builds the default links for the scripture-read-references endpoint by fetching the current week's meeting and extracting the Bible read links.
 * @returns A promise that resolves to an SuccessResult or an ErrorResult. The SuccessResult contains the array of links or an Error object if any error occurs.
 */
export const buildDefaultLinks = wrapAsyncOp(_buildDefaultLinks);
