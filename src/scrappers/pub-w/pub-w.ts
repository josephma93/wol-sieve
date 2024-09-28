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

interface ParagraphData {
	content: string;
	references: Record<number, string>;
}

interface QuestionPartData {
	label?: string;
	text: string;
}

type QuestionData = {
	pNumbers: number[];
	parts: QuestionPartData[];
};

interface ContentData {
	pNumbers: number[];
	questionParts: QuestionData['parts'];
	questionTextIfSingle?: QuestionPartData['text'];
	paragraphs: ParagraphData[];
}

interface WatchtowerArticleData {
	articleNumber: string;
	articleTitle: string;
	articleThemeScrip: string;
	articleTopic: string;
	contents: ContentData[];
	teachBlock: TeachBlock;
}

/**
 * Extracts the teach block information from the soup.
 * @param $ - Cheerio API instance.
 * @returns An object containing the headline and points of the teach block.
 */
function extractTeachBlock($: CheerioAPI): TeachBlock {
	try {
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
	} catch (e: any) {
		log.warn(`Unable to extract teach block due to: ${e.message}`);

		return {
			headline: CONSTANTS.UNABLE_TO_EXTRACT_REFERENCE,
			points: [],
		};
	}
}

/**
 * Parses a question with optional labels (a), b), etc.)
 * @param question The question element containing the text to parse
 * @returns Parsed question data
 */
function extractQuestionData(question: ReturnType<CheerioAPI>): QuestionData {
	const questionTxt = cleanText(question.text());
	const pNumbers: number[] = [];

	const pNumberRegex = /^\s*(\d+(?:[\s,-]*\d+)*?)\.\s*/;

	const pNumberMatch = questionTxt.match(pNumberRegex);
	let remainingLine = questionTxt;
	if (pNumberMatch) {
		const numbersStr = pNumberMatch[1];
		const tokens = numbersStr.split(/\s*,\s*/);
		for (const token of tokens) {
			if (token.includes('-')) {
				const [startStr, endStr] = token.split('-').map((s) => s.trim());
				const start = parseInt(startStr, 10);
				const end = parseInt(endStr, 10);
				if (!isNaN(start) && !isNaN(end) && start <= end) {
					for (let i = start; i <= end; i++) {
						pNumbers.push(i);
					}
				}
			} else {
				const num = parseInt(token.trim(), 10);
				if (!isNaN(num)) {
					pNumbers.push(num);
				}
			}
		}
		remainingLine = questionTxt.substring(pNumberMatch[0].length);
	}

	const parsedQuestions: QuestionPartData[] = [];

	const labelRegex = /\b([a-zA-Z])\)&nbsp;|\b([a-zA-Z])\)\s*/g;

	const matches: { index: number; label: string; 0: string }[] = [];
	let match: RegExpExecArray | null;
	while ((match = labelRegex.exec(remainingLine)) !== null) {
		const label = match[1] || match[2];
		matches.push({ ...match, label });
	}

	if (matches.length > 0) {
		for (let i = 0; i < matches.length; i++) {
			const currentMatch = matches[i];
			const label = currentMatch.label;
			const startIndex = currentMatch.index + currentMatch[0].length;
			const endIndex = i + 1 < matches.length ? matches[i + 1].index : remainingLine.length;
			const questionText = remainingLine.substring(startIndex, endIndex).trim();

			parsedQuestions.push({
				label: label,
				text: questionText,
			});
		}
	} else {
		const trimmedLine = remainingLine.trim();
		if (trimmedLine.length > 0) {
			parsedQuestions.push({
				text: trimmedLine,
			});
		}
	}

	return {
		pNumbers,
		parts: parsedQuestions,
	};
}

/**
 * Extracts the contents from the soup.
 * @param $ - Cheerio API instance.
 * @returns An array of ContentData objects.
 */
function extractContents($: CheerioAPI): Promise<ContentData[]> {
	let footnoteIndex = 1;

	const promises = $(CONSTANTS.PUB_W_CSS_SELECTOR_QUESTION)
		.map(async (_, elem) => {
			const question = $(elem);
			const qText = cleanText(question.text());
			const questionData = extractQuestionData(question);

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

			const paragraphs: ParagraphData[] = await Promise.all(promises);

			return {
				pNumbers: questionData.pNumbers,
				questionParts: questionData.parts,
				questionTextIfSingle: questionData.parts.length === 1 ? questionData.parts[0].text : undefined,
				paragraphs,
			} as ContentData;
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
