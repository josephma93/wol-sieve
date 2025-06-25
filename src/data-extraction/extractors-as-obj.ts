import * as cheerio from 'cheerio';
import { BasePublicationItem } from './reference-json-commons.js';
import { cleanText } from './generic.js';
import { logger as baseLogger } from '../kernel/index.js';

/**
 * Represents the parsed data for a Pub SJJ publication.
 */
export interface PubSjjParsedData {
	name: string;
	themeScripture: string;
	content: string;
	closingContent: string | null;
}

const logger = baseLogger.child({ ...baseLogger.bindings(), label: 'extractors-as-obj' });

/**
 * Pub SJJ as object extraction strategy.
 * @param content - The HTML content to parse.
 * @returns SJJ parsed data.
 */
export function parsePubSjj(content: BasePublicationItem['content']): PubSjjParsedData {
	const $ = cheerio.load(content);
	debugger;
	logger.debug('Loaded HTML content for PubSjj parsing');

	const themeScriptureRaw = $('#p3').text();
	const closingContentRaw = $('.closingContent').text();
	logger.debug('Raw themeScripture text', { themeScriptureRaw });
	logger.debug('Raw closingContent text', { closingContentRaw });

	const themeScriptureMatch = cleanText(themeScriptureRaw).match(/\(([\s\S]+?)\)/);
	const closingContentMatch = cleanText(closingContentRaw).match(/\(([\s\S]+?)\)/);

	logger.debug('themeScriptureMatch result', { themeScriptureMatch });
	logger.debug('closingContentMatch result', { closingContentMatch });

	if (!themeScriptureMatch || themeScriptureMatch.length < 2) {
		logger.error('Invalid themeScripture format', { themeScriptureRaw, themeScriptureMatch });
		throw new Error('Invalid themeScripture format');
	}

	let closingContent: PubSjjParsedData['closingContent'] = null;
	if (!closingContentMatch || closingContentMatch.length < 2) {
		logger.warn('Missing or invalid closingContent format, setting to null', {
			closingContentRaw,
			closingContentMatch,
		});
		closingContent = null;
	} else {
		closingContent = closingContentMatch[1];
	}

	const name = cleanText($('#p2').text());
	const contentText = cleanText($('.bodyTxt').text());
	logger.debug('Extracted name and content', { name, contentText });

	return {
		name,
		themeScripture: themeScriptureMatch[1],
		content: contentText,
		closingContent,
	};
}
