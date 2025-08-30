import * as cheerio from 'cheerio';
import { cleanText } from './generic.js';
import { extractQuestionData } from '../scrappers/pub-w/pub-w.js';
import { QuestionData, QuestionPartData } from '../scrappers/pub-w/pub-w.js';
import { logger, opErrored, wrapAsyncOp } from '../kernel/index.js';
import { AppError } from '../kernel/app-error.js';
import { getHtmlContent } from '../data-fetching/raw.js';

const log = logger.child({ ...logger.bindings(), label: 'article-extractor' });

/**
 * Fetches HTML content from the given URL, loads it into Cheerio, and validates the presence of the #article element.
 * @param url The URL of the article.
 * @returns A tuple containing the CheerioAPI object and the #article element, or an Error if any step fails.
 */
async function _fetchAndValidateArticleHtml(url: string): Promise<[cheerio.CheerioAPI] | Error> {
	const opRes = await getHtmlContent(url);

	if (opErrored(opRes)) {
		log.error(`Failed to fetch HTML: ${opRes.err.message}`, { url });
		return opRes.err;
	}

	const html = opRes.res;
	const $ = cheerio.load(html);

	const articleElement = $('#article');
	if (articleElement.length !== 1) {
		const msg = 'Could not find a single #article element on the page.';
		log.warn(msg, { found: articleElement.length, url });
		return new AppError(msg, 500);
	}

	return [$];
}

/**
 * Fetches and extracts question data from a given WOL article URL.
 * @param url The URL of the article.
 * @returns A promise resolving to an array of extracted question data or an error if the operation failed.
 */
async function _extractArticleQuestionData(
	url: string,
): Promise<{ pnumbers: string; question: string; relatedPids: string }[] | Error> {
	const validationResult = await _fetchAndValidateArticleHtml(url);
	if (validationResult instanceof Error) {
		return validationResult;
	}
	const [$] = validationResult;

	const articleElement = $('#article');
	const questionElements = articleElement.find('.qu');
	if (questionElements.length === 0) {
		const msg = 'Could not find any .qu elements within the #article element.';
		log.warn(msg, { url });
		return new AppError(msg, 500);
	}

	const extractedData: { pnumbers: string; question: string; relatedPids: string }[] = [];

	questionElements.each((_, element) => {
		const $element = $(element);
		const dataPid = $element.attr('data-pid') || '';

		const questionData: QuestionData = extractQuestionData($element);

		const pnumbers = questionData.pNumbers.join(', ');
		const question = questionData.parts
			.map((part: QuestionPartData) => {
				const text = part.text.trim();
				if (part.label && text.length > 0) {
					return `${part.label}) ${text}`;
				} else {
					return text;
				}
			})
			.join(' ')
			.trim();

		extractedData.push({
			pnumbers,
			question,
			relatedPids: dataPid,
		});
	});

	return extractedData;
}

/**
 * Fetches and extracts question data from a given WOL article URL with error wrapping.
 * @see _extractArticleQuestionData
 */
export const extractArticleQuestionData = wrapAsyncOp(_extractArticleQuestionData);

/**
 * Fetches and extracts related paragraph data from a given WOL article URL based on a list of related PIDs.
 * @param url The URL of the article.
 * @param relatedPids An array of related PIDs (strings).
 * @returns A promise resolving to an array of extracted related paragraph data or an error if the operation failed.
 */
async function _extractArticleRelatedParagraphData(
	url: string,
	relatedPids: string[],
): Promise<{ text: string; relatedPid: string }[] | Error> {
	const validationResult = await _fetchAndValidateArticleHtml(url);
	if (validationResult instanceof Error) {
		return validationResult;
	}
	const [$] = validationResult;

	const specificPidSelectors = relatedPids.map((pid) => `#article [data-rel-pid="[${pid}]"]`);
	const combinedSelector = specificPidSelectors.join(', ');
	log.debug('Constructed combined selector', { combinedSelector });

	const relatedElements = $(combinedSelector);
	log.debug(`Found ${relatedElements.length} elements matching the specific PIDs within #article`);

	if (relatedElements.length === 0) {
		const msg = 'Could not find any elements with matching data-rel-pid within the #article element.';
		log.warn(msg, { relatedPids });
		return new AppError(msg, 500);
	}

	const extractedData: { text: string; relatedPid: string }[] = [];

	relatedElements.each((_, element) => {
		const $element = $(element);
		const dataRelPid = $element.attr('data-rel-pid') as string;

		const text = cleanText($element.text());
		log.debug('Extracting data', { dataRelPid, text });
		extractedData.push({
			text: text,
			relatedPid: dataRelPid,
		});
	});

	return extractedData;
}

/**
 * Fetches and extracts related paragraph data from a given WOL article URL based on a list of related PIDs with error wrapping.
 * @see _extractArticleRelatedParagraphData
 */
export const extractArticleRelatedParagraphData = wrapAsyncOp(_extractArticleRelatedParagraphData);
