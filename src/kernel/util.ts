import { CONSTANTS } from './constants.js';

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
 * Cleans text intended for inline display by trimming, replacing NBSP characters, and collapsing all whitespace runs.
 * @param txt - The text to clean.
 * @returns Cleaned single-line text or empty string if the given value is not a string.
 */
export function cleanInlineText(txt: any): string {
	return cleanText(txt).replace(/\s+/g, ' ');
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

/**
 * Creates a new `RegExp` instance from an existing one, preserving its pattern (`source`) and flags.
 * This ensures that the returned regular expression is a *fresh object*, not a reference to the original.
 *
 * Useful when you need to:
 * - Avoid sharing `lastIndex` state between regex instances.
 * - Reuse the same pattern safely in multiple contexts.
 *
 * @param input - The original `RegExp` instance to clone.
 * @returns A new `RegExp` object with the same pattern and flags as `input`.
 */
export function freshRegExp(input: RegExp): RegExp {
	return new RegExp(input.source, input.flags);
}

/**
 * Removes line-continuation backslashes at end-of-line so JSON.stringify doesn't produce "\\\n". Also normalizes line
 * breaks and drops a final dangling backslash, if present.
 * @param input The value to fix.
 */
export function fixLineContinuations(input: string) {
	let s = input.replace(/\r\n?/g, '\n');
	s = s.replace(/[ \t\u00A0]*\\\n/g, '\n');
	s = s.replace(/[ \t\u00A0]*\\\s*$/g, '');
	return s;
}

/**
 * Converts WOL-relative URLs to absolute WOL URLs.
 * @param url - The URL to normalize.
 * @returns The normalized absolute URL, or the original URL when already absolute.
 */
export function normalizeWolUrl(url: string | undefined): string | undefined {
	if (!url) return undefined;
	if (url.startsWith('/')) return `${CONSTANTS.WOL_URL}${url}`;
	return url;
}

/**
 * Checks whether an absolute URL belongs to the configured WOL host.
 *
 * Use this helper when code must apply the same host rule as the API validators.
 * Relative paths are not valid input for this check.
 *
 * @param url - The URL to check.
 * @returns `true` when the URL host is the configured WOL host.
 */
export function isWolUrl(url: string | undefined): boolean {
	if (!url) return false;

	try {
		const parsed = new URL(url);
		const wolHost = new URL(CONSTANTS.WOL_URL).hostname;
		return parsed.hostname === wolHost;
	} catch {
		return false;
	}
}

/**
 * Checks whether an absolute HTTP(S) URL points outside the configured WOL host.
 *
 * Use this helper before adding scraper links to `externalLinks`.
 * Relative paths, fragments, and non-HTTP protocols are not external HTTP URLs.
 *
 * @param url - The URL to check.
 * @returns `true` when the URL uses HTTP(S) and does not belong to the configured WOL host.
 */
export function isExternalHttpUrl(url: string | undefined): boolean {
	if (!url || !/^https?:\/\//i.test(url)) return false;
	return !isWolUrl(url);
}
