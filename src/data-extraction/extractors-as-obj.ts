import * as cheerio from 'cheerio';
import { BasePublicationItem } from './reference-json-commons.js';
import { cleanText } from './generic.js';

/**
 * Represents the parsed data for a Pub SJJ publication.
 */
export interface PubSjjParsedData {
	name: string;
	themeScripture: string;
	content: string;
	closingContent: string;
}

/**
 * Pub SJJ as object extraction strategy.
 * @param content - The HTML content to parse.
 * @returns SJJ parsed data.
 */
export function parsePubSjj(content: BasePublicationItem['content']): PubSjjParsedData {
	const $ = cheerio.load(content);

	const themeScriptureMatch = cleanText($('#p3').text()).match(/\(([\s\S]+?)\)/);
	const closingContentMatch = cleanText($('.closingContent').text()).match(/\(([\s\S]+?)\)/);

	if (!themeScriptureMatch || themeScriptureMatch.length < 2) {
		throw new Error('Invalid themeScripture format');
	}

	if (!closingContentMatch || closingContentMatch.length < 2) {
		throw new Error('Invalid closingContent format');
	}

	return {
		name: cleanText($('#p2').text()),
		themeScripture: themeScriptureMatch[1],
		content: cleanText($('.bodyTxt').text()),
		closingContent: closingContentMatch[1],
	};
}
