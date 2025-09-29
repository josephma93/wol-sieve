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
