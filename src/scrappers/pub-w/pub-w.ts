import { logger, opErrored } from '../../kernel/index.js';
import { CONSTANTS } from '../../kernel/index.js';
import { ExtractionInput, processExtractionInput } from '../generics.js';
import { CheerioAPI } from 'cheerio';
import { fetchAndParseAnchorReferenceOrThrow } from '../../data-fetching/reference-json.js';
import { cleanText, getCheerioSelectionOrThrow } from '../../data-extraction/generic.js';

const log = logger.child({ ...logger.bindings(), label: 'pub-w-scraper' });

interface TeachBlock {
	headline: string;
	points: string[];
}

interface Paragraph {
	content: string;
	references: Record<number, string>;
}

type ParsedQuestion = {
	label?: string;
	text: string;
};

interface Content {
	pNumbers: number[];
	questions: ParsedQuestion[];
	paragraphs: Paragraph[];
}

interface WatchtowerArticleData {
	articleNumber: string;
	articleTitle: string;
	articleThemeScrip: string;
	articleTopic: string;
	contents: Content[];
	teachBlock: TeachBlock;
}

/**
 * Removes the first <strong> tag from the question element and returns the trimmed text.
 * @param question - Cheerio element representing the question.
 * @returns The text content of the question without the first <strong> tag.
 */
function removeStrongTag(question: ReturnType<CheerioAPI>): string {
	const strongTag = question.find('strong').first();
	if (strongTag.length) {
		strongTag.remove();
	}
	return cleanText(question.text());
}

/**
 * Extracts the teach block information from the soup.
 * @param $ - Cheerio API instance.
 * @returns An object containing the headline and points of the teach block.
 */
function extractTeachBlock($: CheerioAPI): TeachBlock {
	const teachBlockHeadline = cleanText(
		getCheerioSelectionOrThrow($, CONSTANTS.PUB_W_CSS_SELECTOR_TEACH_BLOCK_HEADLINE).text(),
	);
	const teachBlockPoints: string[] = $(CONSTANTS.PUB_W_CSS_SELECTOR_TEACH_BLOCK_POINTS)
		.map((_, elem) => cleanText($(elem).text()))
		.get();

	return {
		headline: teachBlockHeadline,
		points: teachBlockPoints,
	};
}

/**
 * Extracts numbers from the first <strong> tag within the question element.
 * @param question - Cheerio element representing the question.
 * @returns An array of numbers extracted from the <strong> tag.
 */
function extractParagraphNumbers(question: ReturnType<CheerioAPI>): number[] {
	const strongTag = question.find('strong').first();
	if (strongTag.length) {
		const questionText = strongTag.text().trim();
		const numbers = questionText.match(/\d+/g);
		return numbers ? numbers.map(Number) : [];
	}
	return [];
}

/**
 * Parses a single line of text containing questions with optional labels (a), b), etc.)
 * @param line The line of text to parse
 * @returns An array of ParsedQuestion objects
 */
function parseLine(line: string): ParsedQuestion[] {
	const parsedQuestions: ParsedQuestion[] = [];

	// Regex to match labels like 'a)', 'b)', etc., followed by a space or the start of the question
	const labelRegex = /([a-zA-Z])\)\s*/g;

	// Find all label matches with their indices
	const matches: RegExpExecArray[] = [];
	let match: RegExpExecArray | null;
	while ((match = labelRegex.exec(line)) !== null) {
		matches.push(match);
	}

	if (matches.length > 0) {
		// If there are labeled questions, split accordingly
		for (let i = 0; i < matches.length; i++) {
			const currentMatch = matches[i];
			const label = currentMatch[1];
			const startIndex = currentMatch.index + currentMatch[0].length;
			const endIndex = i + 1 < matches.length ? matches[i + 1].index : line.length;
			const questionText = line.substring(startIndex, endIndex).trim();

			parsedQuestions.push({
				label: label,
				text: questionText,
			});
		}
	} else {
		// If there are no labels, treat the entire line as a single question
		const trimmedLine = line.trim();
		if (trimmedLine.length > 0) {
			parsedQuestions.push({
				text: trimmedLine,
			});
		}
	}

	return parsedQuestions;
}

/**
 * Extracts the contents from the soup.
 * @param $ - Cheerio API instance.
 * @returns An array of Content objects.
 */
function extractContents($: CheerioAPI): Promise<Content[]> {
	let footnoteIndex = 1;

	const promises = $(CONSTANTS.PUB_W_CSS_SELECTOR_QUESTION)
		.map(async (_, elem) => {
			const question = $(elem);
			const pNumbers = extractParagraphNumbers(question);
			const qText = removeStrongTag(question);

			const dataPid = question.attr('data-pid');
			if (!dataPid) {
				const msg = `Missing data-pid for question ${qText}`;
				log.error(msg);
				throw new Error(msg);
			}

			log.debug(`Processing question [${dataPid}]`);

			const relatedParagraphs = $(CONSTANTS.PUB_W_CSS_SELECTOR_RELATED_PARAGRAPH(dataPid));

			const promises = relatedParagraphs.map(async (index, paraElem) => {
				const para = $(paraElem);

				log.debug(`Extracting paragraph [${index}] related to question [${dataPid}]`);

				const promises = para
					.find(CONSTANTS.PUB_W_CSS_SELECTOR_RELATED_PARAGRAPH_LINK)
					.map(async (_, anchor) => {
						const anchorRef = $(anchor);
						const mnemonic = anchorRef.text();
						log.debug(`Extracting reference: [${mnemonic}]`);
						const fnIndex = footnoteIndex++;
						anchorRef.replaceWith(`${mnemonic} [^${fnIndex}]`);
						const opRes = await fetchAndParseAnchorReferenceOrThrow(anchorRef);
						let refContents = CONSTANTS.UNABLE_TO_EXTRACT_REFERENCE;
						if (opErrored(opRes)) {
							log.warn(
								`Unable to load reference data for mnemonic: [${mnemonic}] due to: [${opRes.err.message}]`,
							);
						} else {
							refContents = opRes.res.parsedContent;
						}
						return [fnIndex, refContents] as [number, string];
					})
					.get();

				const tuples = await Promise.all(promises);
				const references: Record<number, string> = tuples.reduce(
					(accum, [num, txt]: [number, string]) => {
						accum[num] = txt;
						return accum;
					},
					{} as Record<number, string>,
				);

				return {
					content: cleanText(para.text()),
					references,
				};
			});

			const paragraphs: Paragraph[] = await Promise.all(promises);

			return {
				pNumbers,
				questions: parseLine(qText),
				paragraphs,
			} as Content;
		})
		.get();

	return Promise.all(promises);
}

/**
 * Extracts article contents
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export async function extractArticleContents(input: ExtractionInput): Promise<WatchtowerArticleData> {
	const { $ } = processExtractionInput(input);

	const articleNumber = cleanText($(CONSTANTS.PUB_W_CSS_SELECTOR_ARTICLE_NUMBER).text());
	const articleTitle = cleanText($(CONSTANTS.PUB_W_CSS_SELECTOR_ARTICLE_TITLE).text());
	const articleThemeScrip = cleanText($(CONSTANTS.PUB_W_CSS_SELECTOR_ARTICLE_THEME_SCRIP).text());
	const articleTopic = cleanText($(CONSTANTS.PUB_W_CSS_SELECTOR_ARTICLE_TOPIC).text());

	const contents = await extractContents($);
	const teachBlock = extractTeachBlock($);

	return {
		articleNumber,
		articleTitle,
		articleThemeScrip,
		articleTopic,
		contents,
		teachBlock,
	};
}
