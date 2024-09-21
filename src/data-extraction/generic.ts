import { logger } from '../kernel/index.js';
import { CheerioAPI } from 'cheerio';

const log = logger.child({ ...logger.bindings(), label: 'util' });

/**
 * Finds a cheerio element based on the given selector, or throws an error
 * if no element is found.
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

/**
 * Ensures the value is a string, otherwise returns an empty string.
 * @param value - The value to enforce as string.
 * @returns The string value or an empty string.
 */
function enforceIsString(value: any): string {
	return typeof value === 'string' ? value : '';
}

/**
 * Trims, and removes all non-breaking space characters from the given text.
 * @param txt - The text to clean.
 * @returns Cleaned text or empty string if the given value is not a string.
 */
export function cleanText(txt: any): string {
	return enforceIsString(txt).trim().replaceAll(' ', ' ');
}

/**
 * Collapses consecutive line breaks with a single line break in the given text.
 * @param txt - The text to collapse line breaks in.
 * @returns Collapsed text or empty string if the given value is not a string.
 */
export function collapseConsecutiveLineBreaks(txt: any): string {
	return enforceIsString(txt).replace(/\n+/g, '\n');
}

/**
 * Removes the time box text from the given text.
 * @param text - The text to remove the time box text from.
 * @returns The text with the time box text removed and trimmed.
 */
export function takeOutTimeBoxText(text: string): string {
	return text.split(')').slice(1).join(')').trim();
}
