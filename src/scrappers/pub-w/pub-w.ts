import { CONSTANTS, logger, opErrored, cleanText, fixLineContinuations } from '../../kernel/index.js';
import { ExtractionContextOptions, createExtractionContext } from '../generics.js';
import { CheerioAPI } from 'cheerio';
import { fetchAndParseAnchorReferenceOrThrow } from '../../data-fetching/reference-json.js';
import { getCheerioSelectionOrThrow } from '../../data-extraction/generic.js';
import { markify } from 'markify-ts';

const log = logger.child({ ...logger.bindings(), label: 'pub-w-scraper' });

interface TeachBlock {
	headline: string;
	points: string[];
}

interface ParagraphData {
	number: number;
	originalContent: string;
	content: string;
	references: Record<number, string>;
}

export interface QuestionPartData {
	label?: string;
	text: string;
}

export type QuestionData = {
	pNumbers: number[];
	rawQuestionTxt: string;
	parts: QuestionPartData[];
	doMentionsSupplementBox: boolean;
	anchorsFound: ReturnType<ReturnType<CheerioAPI>['find']>;
};

interface QuestionReferencedFigureData {
	imgURL: string;
	altText: string;
	caption: string;
}

interface ContentData {
	pNumbers: number[];
	rawQuestionTxt: QuestionData['rawQuestionTxt'];
	questionParts: QuestionData['parts'];
	questionTextIfSingle?: QuestionPartData['text'];
	paragraphs: ParagraphData[];
	questionReferencedData: {
		figures: QuestionReferencedFigureData[];
		boxSupplements: QuestionReferencedBoxSupplementData[];
	};
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
 * Extracts the "teach block" information from the soup.
 * @param $ - Cheerio API instance.
 * @returns An object containing the headline and points of the "teach block".
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
 * Resolves the target Cheerio element for a box supplement based on an anchor element.
 * It first tries to resolve by href fragment (e.g., #p123) and then falls back to a title-based match.
 * @param $ - Cheerio API instance.
 * @param $a - The anchor Cheerio element.
 * @returns The Cheerio element representing the box supplement, or an empty Cheerio object if not found.
 */
function resolveHrefTargetForBox($: CheerioAPI, $a: ReturnType<CheerioAPI>) {
	const href = $a.attr('href') || '';
	let fragmentMatch = !!href ? href.match(CONSTANTS.PUB_W_REGEX_TEST_FOR_HREF_TO_BOX()) : '';
	if (fragmentMatch) {
		let pNum = fragmentMatch[1];
		const boxTtl = $(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_PARAGRAPHS_BY_NUMBER(pNum));
		if (boxTtl.length) {
			const boxSupplement = boxTtl.closest(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_SUPPLEMENT_BOX);
			if (boxSupplement.length) return boxSupplement;
		}
	}

	// Title-based fallback: anchor text often equals the box title
	const anchorText = cleanText($a.text());
	// Find the box titles that does partial match. The box title has to be included in anchor's text.
	const $boxTitleMatch = $(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_BOX_TITLES()).filter(function filterCb(_, el) {
		const $boxTitle = $(el);
		return anchorText.includes(cleanText($boxTitle.text()));
	});
	if ($boxTitleMatch.length) {
		return $boxTitleMatch.closest(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_SUPPLEMENT_BOX);
	}
	return $();
}

/**
 * Normalizes text for consistent regex matching by removing diacritics and converting to lowercase.
 */
function normalizeForMatching(s: string): string {
	return s
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();
}

/**
 * Extracts paragraph numbers from a caption string (e.g., "párrafos 4, 10-12").
 */
function extractPnumsFromCaptionStrict(captionText: string): string[] {
	const t = normalizeForMatching(captionText);
	const idx = t.indexOf('parrafo');
	if (idx === -1) return [];

	const slice = t.slice(idx);
	const m = slice.match(/parrafos?\s*([^)。\n\r.]*)/i);
	const windowText = m ? m[1] : slice;

	const out = new Set<string>();

	const rangeRe = /(\d+)\s*[-–]\s*(\d+)/g;
	let rm;
	while ((rm = rangeRe.exec(windowText)) !== null) {
		const a = parseInt(rm[1], 10);
		const b = parseInt(rm[2], 10);
		if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
		const lo = Math.min(a, b);
		const hi = Math.max(a, b);
		for (let i = lo; i <= hi; i += 1) out.add(String(i));
	}

	(windowText.match(/\d+/g) || []).forEach((n) => out.add(String(parseInt(n, 10))));
	return [...out];
}

/**
 * Parses question PIDs from a data-rel-pid attribute (e.g., "[1][2]").
 */
function extractQpidsFromRelPid(rel: string | undefined): string[] {
	if (!rel) return [];
	const out: string[] = [];
	const re = /\[(\d+)]/g;
	let m;
	while ((m = re.exec(rel)) !== null) out.push(m[1]);
	return out;
}

/**
 * Parses a question with optional labels (a), b), etc.)
 * @param question The question element containing the text to parse
 * @returns Parsed question data
 */
export function extractQuestionData(question: ReturnType<CheerioAPI>): QuestionData {
	const rawQuestionTxt = cleanText(question.text());
	const pNumbers: number[] = [];

	const pNumberRegex = /^\s*(\d+(?:[\s,-]*\d+)*?)\.\s*/;
	const pNumberMatch = rawQuestionTxt.match(pNumberRegex);

	let remainingLine = rawQuestionTxt;
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
		remainingLine = rawQuestionTxt.substring(pNumberMatch[0].length);
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
		rawQuestionTxt,
		parts: parsedQuestions,
		doMentionsSupplementBox: CONSTANTS.PUB_W_REGEX_TEST_FOR_MENTIONS_BOX().test(rawQuestionTxt),
		anchorsFound: question.find('a'),
	};
}

/**
 * Fetches and replaces references for a paragraph in parallel.
 * Returns an array of [footnoteIndex, referenceText].
 */
async function extractReferences(
	$: CheerioAPI,
	para: ReturnType<CheerioAPI>,
	footnoteIndexRef: { value: number },
): Promise<[number, string][]> {
	const anchorElems = para.find(CONSTANTS.PUB_W_CSS_SELECTOR_RELATED_PARAGRAPH_LINK);

	const referencePromises = anchorElems.map(async (_, anchor) => {
		const anchorRef = $(anchor);
		const mnemonic = anchorRef.text();
		log.debug(`Extracting reference: [${mnemonic}]`);

		const currentIndex = footnoteIndexRef.value;
		footnoteIndexRef.value += 1; // increment for the next footnote

		// Mutates the DOM: replace the anchor with footnote marker
		anchorRef.replaceWith(`${mnemonic} [^${currentIndex}]`);

		const opRes = await fetchAndParseAnchorReferenceOrThrow(anchorRef);
		let refContents = CONSTANTS.UNABLE_TO_EXTRACT_REFERENCE;
		if (opErrored(opRes)) {
			log.warn(`Unable to load reference data for mnemonic: [${mnemonic}] due to: [${opRes.err.message}]`);
		} else {
			refContents = opRes.res.parsedContent;
		}
		return [currentIndex, refContents] as [number, string];
	});

	return Promise.all(referencePromises.get());
}

/**
 * Extracts all paragraphs for a given question in parallel.
 */
async function extractParagraphs(
	$: CheerioAPI,
	questionPid: string,
	footnoteIndexRef: { value: number },
): Promise<ParagraphData[]> {
	const relatedParagraphs = $(CONSTANTS.PUB_W_CSS_SELECTOR_RELATED_PARAGRAPH(questionPid));

	const paragraphPromises = relatedParagraphs.map(async (_, paraElem) => {
		const para = $(paraElem);
		log.debug(`Extracting paragraph related to question [${questionPid}]`);

		const originalParagraphText = para.text();
		const paragraphNumber = parseFloat(para.find('.parNum').attr('data-pnum') || 'NaN');

		const referenceTuples = await extractReferences($, para, footnoteIndexRef);

		const references: Record<number, string> = referenceTuples.reduce(
			(accum, [num, txt]) => {
				accum[num] = txt;
				return accum;
			},
			{} as Record<number, string>,
		);

		const mutatedParagraphText = para.text();

		return {
			number: paragraphNumber,
			originalContent: cleanText(originalParagraphText),
			content: cleanText(mutatedParagraphText),
			references,
		};
	});

	return Promise.all(paragraphPromises.get());
}

interface QuestionReferencedBoxSupplementData {
	title: string;
	content: string;
}

function extractFigures($: CheerioAPI, questionPid: string) {
	const figures: QuestionReferencedFigureData[] = [];
	$(CONSTANTS.PUB_W_CSS_SELECTOR_FIGURE).each((_, fig) => {
		const $fig = $(fig);
		const captionText = $fig.find('figcaption').text();
		let pnums = extractPnumsFromCaptionStrict(captionText);

		// Fallback: nearest previous paragraph with a number
		if (pnums.length === 0) {
			const $prev = $fig.closest('div[id^="f"], figure').prevAll(`[data-pid]`).find('.parNum[data-pnum]').first();
			const p = $prev.attr('data-pnum');
			if (p) pnums = [p];
		}

		// Check if this figure relates to the current question
		let isRelated = false;
		for (const pnum of pnums) {
			const $paras = $(`.parNum[data-pnum="${pnum}"]`).closest('[data-pid]');
			$paras.each((_, p) => {
				const relPids = extractQpidsFromRelPid($(p).attr('data-rel-pid'));
				if (relPids.includes(questionPid)) {
					isRelated = true;
					return false; // break inner loop
				}
			});
			if (isRelated) break;
		}

		if (isRelated) {
			let $img = $fig.find('img');
			figures.push({
				imgURL: $img.attr('src') ?? '',
				altText: $img.attr('alt') ?? '',
				caption: cleanText(captionText),
			});
		}
	});
	return figures;
}

async function extractQuestionReferencedData($: CheerioAPI, questionData: QuestionData, questionPid: string) {
	let boxSupplements: QuestionReferencedBoxSupplementData[] = [];
	if (questionData.doMentionsSupplementBox) {
		const $boxSupplements = questionData.anchorsFound
			.filter('.it') // Filter for elements with class 'it'
			.map((_, el) => resolveHrefTargetForBox($, $(el))) // Resolve href target for each filtered anchor
			.get(); // Convert Cheerio object to a plain array of Cheerio elements

		boxSupplements = await Promise.all(
			$boxSupplements.map(async ($boxSupplement) => {
				const title = cleanText($boxSupplement.find(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_BOX_TITLE).text());
				const markedContent = await markify({
					htmlContent: $boxSupplement.find(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_BOX_CONTENT).html() ?? '',
					ignoreSelectors: CONSTANTS.MARKIFY_GENERAL_CSS_SELECTORS_TO_IGNORE,
					ignoreHiddenElements: true,
				});
				return {
					title: title,
					content: fixLineContinuations(markedContent.markdown),
				};
			}),
		);
	}

	const figures = extractFigures($, questionPid);
	return {
		figures,
		boxSupplements,
	};
}

/**
 * Extracts the contents from the soup, returning an array of ContentData objects.
 * This function remains the orchestrator, but now each paragraph has two versions.
 * @param $ - Cheerio API instance.
 * @returns Promise of an array of ContentData objects.
 */
async function extractContents($: CheerioAPI): Promise<ContentData[]> {
	// Keep a single footnote counter that we pass by reference
	const footnoteIndexRef = { value: 1 };

	const questionElems = $(CONSTANTS.PUB_W_CSS_SELECTOR_QUESTION);

	// For each question, extract its data and related paragraphs in parallel
	const contentPromises = questionElems.map(async (_, elem) => {
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

		// Extract all paragraphs associated with this question
		const paragraphs = await extractParagraphs($, dataPid, footnoteIndexRef);
		const questionReferencedData = await extractQuestionReferencedData($, questionData, dataPid);

		return {
			pNumbers: questionData.pNumbers,
			questionParts: questionData.parts,
			questionTextIfSingle: questionData.parts.length === 1 ? questionData.parts[0].text : undefined,
			rawQuestionTxt: questionData.rawQuestionTxt,
			paragraphs,
			questionReferencedData,
		};
	});

	return Promise.all(contentPromises.get());
}

/**
 * Extracts article contents
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export async function extractArticleContents(input: ExtractionContextOptions): Promise<WatchtowerArticleData> {
	const { $ } = createExtractionContext(input);

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
