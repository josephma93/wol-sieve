import { logger } from '../kernel/index.js';
import { CheerioAPI } from 'cheerio';

const log = logger.child({ ...logger.bindings(), label: 'util' });

/**
 * Finds a cheerio element based on the given selector, or throws an error if no element is found.
 *
 * @param $ - The cheerio object to search for the element.
 * @param selector - The CSS selector to search for.
 * @returns The cheerio element that was found.
 * @throws {Error} If no element is found for the given selector.
 */
export function getCheerioSelectionOrThrow($: CheerioAPI, selector: string) {
	const $selection = $(selector);
	if (!$selection.length) {
		log.error(`No selection found for selector [${selector}]`);
		throw new Error(`No selection found for selector [${selector}]`);
	}
	return $selection;
}
