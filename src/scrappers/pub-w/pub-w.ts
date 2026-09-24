import {
	CONSTANTS,
	logger,
	opErrored,
	cleanText,
	fixLineContinuations,
	normalizeWolUrl,
	isExternalHttpUrl,
} from '../../kernel/index.js';
import { ExtractionContextOptions, createExtractionContext } from '../generics.js';
import { CheerioAPI } from 'cheerio';
import { fetchAndParseAnchorReferenceOrThrow } from '../../data-fetching/reference-json.js';
import { getCheerioSelectionOrThrow, isVideoAnchor } from '../../data-extraction/generic.js';
import type { CheerioSelection } from '../../data-extraction/generic.js';
import { markify } from 'markify-ts';
import {
	Citation,
	CitationTextBlock,
	addParsedReferenceToCitationBlock,
	addUnableToExtractReferenceToCitationBlock,
	buildCitationMarker,
	createCitationTextBlock,
} from '../../data-extraction/citations.js';

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
	anchorsFound: CheerioSelection;
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

interface WatchtowerArticleDataV2 {
	articleNumber: string;
	articleTitle: string;
	articleThemeScrip: string;
	articleTopic: string;
	content: WatchtowerArticleContentItem[];
	indexReferences: WatchtowerIndexReferences;
}

interface WatchtowerExternalLink {
	text: string;
	url: string;
}

interface WatchtowerVideoData {
	text: string;
	label: string;
	title: string;
	url: string;
}

interface WatchtowerFootnoteRef {
	marker: string;
	fnid?: string;
}

interface WatchtowerBoxSupplementRef {
	title: string;
	targetPid: number;
}

interface WatchtowerRichTextBlock {
	text: string;
	textWithCitations: string;
	citations?: Citation[];
	externalLinks?: WatchtowerExternalLink[];
	videos?: WatchtowerVideoData[];
	footnoteRefs?: WatchtowerFootnoteRef[];
	boxSupplementRefs?: WatchtowerBoxSupplementRef[];
}

interface WatchtowerSectionHeadingPayload {
	text: string;
}

interface WatchtowerQuestionPayload extends WatchtowerRichTextBlock {
	pNumbers: number[];
	rawQuestionTxt: QuestionData['rawQuestionTxt'];
	questionParts: QuestionData['parts'];
	questionTextIfSingle?: QuestionPartData['text'];
}

interface WatchtowerParagraphPayload extends WatchtowerRichTextBlock {
	number: number;
}

interface WatchtowerIllustrationPayload {
	src: string;
	alt: string;
	caption: string;
	paragraphNumbers?: number[];
	footnoteRefs?: WatchtowerFootnoteRef[];
}

interface WatchtowerBoxSupplementPayload {
	title: string;
	content: WatchtowerEmbeddedContentItem[];
}

interface WatchtowerFootnotePayload extends WatchtowerRichTextBlock {
	marker: string;
}

type WatchtowerEmbeddedContentItem =
	| {
			kind: 'text';
			payload: WatchtowerRichTextBlock;
	  }
	| {
			kind: 'video';
			payload: WatchtowerVideoData;
	  };

type WatchtowerArticleContentItem =
	| {
			kind: 'sectionHeading';
			payload: WatchtowerSectionHeadingPayload;
	  }
	| {
			kind: 'question';
			payload: WatchtowerQuestionPayload;
	  }
	| {
			kind: 'paragraph';
			payload: WatchtowerParagraphPayload;
	  }
	| {
			kind: 'illustration';
			payload: WatchtowerIllustrationPayload;
	  }
	| {
			kind: 'boxSupplement';
			payload: WatchtowerBoxSupplementPayload;
	  }
	| {
			kind: 'footnote';
			payload: WatchtowerFootnotePayload;
	  }
	| {
			kind: 'video';
			payload: WatchtowerVideoData;
	  }
	| {
			kind: 'teachBlock';
			payload: TeachBlock;
	  };

interface WatchtowerQuestionAssociation {
	questionIndex: number;
	sectionHeadingIndex?: number;
	relevantParagraphIndexes?: number[];
	relevantIllustrationIndexes?: number[];
	relevantBoxSupplementIndexes?: number[];
	relevantFootnoteIndexes?: number[];
	relevantVideoIndexes?: number[];
}

interface WatchtowerFootnoteIndexReference {
	sourceIndex: number;
	targetIndex: number;
	marker: string;
}

interface WatchtowerBoxSupplementIndexReference {
	sourceIndex: number;
	targetIndex: number;
	title: string;
}

interface WatchtowerIndexReferences {
	questions: WatchtowerQuestionAssociation[];
	footnotes?: WatchtowerFootnoteIndexReference[];
	boxSupplements?: WatchtowerBoxSupplementIndexReference[];
}

interface WatchtowerFlowExtraction {
	content: WatchtowerArticleContentItem[];
	indexReferences: WatchtowerIndexReferences;
}

interface PendingFootnoteIndexReference {
	sourceIndex: number;
	marker: string;
	fnid?: string;
}

interface PendingBoxSupplementIndexReference {
	sourceIndex: number;
	title: string;
	targetPid: number;
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
function resolveHrefTargetForBox($: CheerioAPI, $a: CheerioSelection) {
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
export function extractQuestionData(question: CheerioSelection): QuestionData {
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
	para: CheerioSelection,
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

async function buildQuestionReferencedBoxSupplement(
	$boxSupplement: CheerioSelection,
): Promise<QuestionReferencedBoxSupplementData> {
	const title = cleanText($boxSupplement.find(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_BOX_TITLE).text());
	const markedContent = await markify({
		htmlContent: $boxSupplement.find(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_BOX_CONTENT).html() ?? '',
		ignoreSelectors: CONSTANTS.MARKIFY_GENERAL_CSS_SELECTORS_TO_IGNORE,
		ignoreHiddenElements: true,
	});

	return {
		title,
		content: fixLineContinuations(markedContent.markdown),
	};
}

function extractFigures($: CheerioAPI, questionPid: string) {
	const figures: QuestionReferencedFigureData[] = [];
	$(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_FIGURES).each((_, fig) => {
		const $fig = $(fig);
		const captionText = $fig.find('figcaption').text();
		let pnums = extractPnumsFromCaptionStrict(captionText);

		// Fallback: nearest previous paragraph with a number
		if (pnums.length === 0) {
			const $prev = $fig
				.closest(`${CONSTANTS.GENERAL_CSS_SELECTOR_FOR_FIGURES}, figure`)
				.prevAll(`[data-pid]`)
				.find('.parNum[data-pnum]')
				.first();
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
			$boxSupplements.map(($boxSupplement) => buildQuestionReferencedBoxSupplement($boxSupplement)),
		);
	}

	const figures = extractFigures($, questionPid);
	return {
		figures,
		boxSupplements,
	};
}

function addUniqueIndex(indexes: number[], index: number): void {
	if (!indexes.includes(index)) indexes.push(index);
}

function isFootnoteAnchor($anchor: CheerioSelection): boolean {
	const href = $anchor.attr('href') || '';
	return $anchor.is('.fn') || !!$anchor.attr('data-fnid') || href.includes('/wol/fn/');
}

function getBoxSupplementPid($boxSupplement: CheerioSelection): number {
	const rawPid = $boxSupplement.find('[data-pid]').first().attr('data-pid');
	const title = cleanText($boxSupplement.find(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_BOX_TITLE).first().text());

	if (!rawPid) {
		throw new Error(`Missing data-pid for v2 flow box supplement [${title}]`);
	}

	const pid = Number.parseInt(rawPid, 10);
	if (!Number.isFinite(pid)) {
		throw new Error(`Invalid data-pid [${rawPid}] for v2 flow box supplement [${title}]`);
	}

	return pid;
}

function resolveBoxSupplementRef(
	$: CheerioAPI,
	$anchor: CheerioSelection,
): {
	title: string;
	targetPid: number;
	$boxSupplement: CheerioSelection;
} | null {
	const $boxSupplement = resolveHrefTargetForBox($, $anchor);
	if (!$boxSupplement.length) return null;

	const targetPid = getBoxSupplementPid($boxSupplement);
	return {
		title: cleanText($boxSupplement.find(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_BOX_TITLE).first().text()),
		targetPid,
		$boxSupplement,
	};
}

function isReferenceAnchor($: CheerioAPI, $anchor: CheerioSelection): boolean {
	const href = $anchor.attr('href') || '';
	if (!href) return false;
	if (isVideoAnchor($anchor)) return false;
	if (isFootnoteAnchor($anchor)) return false;
	if (resolveBoxSupplementRef($, $anchor)) return false;
	if (href.startsWith('#')) return false;

	return href.startsWith('/') && href.includes('/wol/');
}

function buildVideoData($anchor: CheerioSelection, fallbackText = ''): WatchtowerVideoData {
	const label = cleanText($anchor.text());
	const title = cleanText($anchor.nextAll('em').first().text()) || label;
	const url = normalizeWolUrl($anchor.attr('href')) ?? '';

	return {
		text: fallbackText || label,
		label,
		title,
		url,
	};
}

function buildFootnoteRef($anchor: CheerioSelection): WatchtowerFootnoteRef {
	const href = $anchor.attr('href') || '';
	return {
		marker: cleanText($anchor.text()),
		fnid: $anchor.attr('data-fnid') || href.split('/').pop() || '',
	};
}

function addExternalLinks(target: WatchtowerExternalLink[], links: WatchtowerExternalLink[]): void {
	for (const link of links) {
		if (!target.some((item) => item.url === link.url && item.text === link.text)) {
			target.push(link);
		}
	}
}

function addFootnoteRefs(target: WatchtowerFootnoteRef[], refs: WatchtowerFootnoteRef[]): void {
	for (const ref of refs) {
		if (!target.some((item) => item.fnid === ref.fnid && item.marker === ref.marker)) {
			target.push(ref);
		}
	}
}

function addBoxSupplementRefs(target: WatchtowerBoxSupplementRef[], refs: WatchtowerBoxSupplementRef[]): void {
	for (const ref of refs) {
		if (!target.some((item) => item.targetPid === ref.targetPid && item.title === ref.title)) {
			target.push(ref);
		}
	}
}

function addVideos(target: WatchtowerVideoData[], videos: WatchtowerVideoData[]): void {
	for (const video of videos) {
		if (!target.some((item) => item.url === video.url && item.label === video.label)) {
			target.push(video);
		}
	}
}

async function buildRichTextBlock($: CheerioAPI, $source: CheerioSelection): Promise<WatchtowerRichTextBlock> {
	const originalAnchors = $source
		.find('a[href]')
		.toArray()
		.map((anchor) => $(anchor));
	const referenceAnchors = originalAnchors.filter(($anchor) => isReferenceAnchor($, $anchor));
	const referenceAnchorIndexes = new Set(
		originalAnchors
			.map(($anchor, index) => (isReferenceAnchor($, $anchor) ? index : -1))
			.filter((index) => index >= 0),
	);

	const textWithCitationsSource = $source.clone();
	const clonedAnchors = textWithCitationsSource.find('a[href]');
	let citationMarkerIndex = 1;
	for (let i = 0; i < clonedAnchors.length; i += 1) {
		if (!referenceAnchorIndexes.has(i)) continue;
		clonedAnchors.eq(i).replaceWith(buildCitationMarker(citationMarkerIndex));
		citationMarkerIndex += 1;
	}

	let citationBlock: CitationTextBlock = createCitationTextBlock(
		cleanText($source.text()),
		cleanText(textWithCitationsSource.text()),
	);

	const referenceResults = await Promise.all(
		referenceAnchors.map(($anchor) => {
			const mnemonic = cleanText($anchor.text());
			log.debug(`Extracting v2 flow reference: [${mnemonic}]`);
			return fetchAndParseAnchorReferenceOrThrow($anchor).then((opRes) => ({ mnemonic, opRes }));
		}),
	);

	for (const { mnemonic, opRes } of referenceResults) {
		if (opErrored(opRes)) {
			log.warn(`Unable to load reference data for mnemonic: [${mnemonic}] due to: [${opRes.err.message}]`);
			citationBlock = addUnableToExtractReferenceToCitationBlock(citationBlock, mnemonic);
			continue;
		}

		citationBlock = addParsedReferenceToCitationBlock(citationBlock, mnemonic, opRes.res);
	}

	const externalLinks = originalAnchors
		.filter(($anchor) => isExternalHttpUrl($anchor.attr('href')) && !isVideoAnchor($anchor))
		.map(($anchor) => ({
			text: cleanText($anchor.text()),
			url: normalizeWolUrl($anchor.attr('href')) ?? '',
		}));
	const videos = originalAnchors.filter(isVideoAnchor).map(($anchor) => buildVideoData($anchor));
	const footnoteRefs = originalAnchors.filter(isFootnoteAnchor).map(buildFootnoteRef);
	const boxSupplementRefs = originalAnchors
		.map(($anchor) => resolveBoxSupplementRef($, $anchor))
		.filter((ref): ref is NonNullable<typeof ref> => !!ref)
		.map(({ targetPid, title }) => ({ title, targetPid }));

	const uniqueExternalLinks: WatchtowerExternalLink[] = [];
	const uniqueVideos: WatchtowerVideoData[] = [];
	const uniqueFootnoteRefs: WatchtowerFootnoteRef[] = [];
	const uniqueBoxSupplementRefs: WatchtowerBoxSupplementRef[] = [];

	addExternalLinks(uniqueExternalLinks, externalLinks);
	addVideos(uniqueVideos, videos);
	addFootnoteRefs(uniqueFootnoteRefs, footnoteRefs);
	addBoxSupplementRefs(uniqueBoxSupplementRefs, boxSupplementRefs);

	return {
		text: citationBlock.text,
		textWithCitations: citationBlock.textWithCitations,
		...(citationBlock.citations.length > 0 ? { citations: citationBlock.citations } : {}),
		...(uniqueExternalLinks.length > 0 ? { externalLinks: uniqueExternalLinks } : {}),
		...(uniqueVideos.length > 0 ? { videos: uniqueVideos } : {}),
		...(uniqueFootnoteRefs.length > 0 ? { footnoteRefs: uniqueFootnoteRefs } : {}),
		...(uniqueBoxSupplementRefs.length > 0 ? { boxSupplementRefs: uniqueBoxSupplementRefs } : {}),
	};
}

function buildSectionHeadingPayload($heading: CheerioSelection): WatchtowerSectionHeadingPayload {
	return {
		text: cleanText($heading.text()),
	};
}

async function buildQuestionPayload($: CheerioAPI, $question: CheerioSelection): Promise<WatchtowerQuestionPayload> {
	const questionData = extractQuestionData($question);
	const richBlock = await buildRichTextBlock($, $question);

	return {
		...richBlock,
		pNumbers: questionData.pNumbers,
		questionParts: questionData.parts,
		questionTextIfSingle: questionData.parts.length === 1 ? questionData.parts[0].text : undefined,
		rawQuestionTxt: questionData.rawQuestionTxt,
	};
}

async function buildParagraphPayload($: CheerioAPI, $paragraph: CheerioSelection): Promise<WatchtowerParagraphPayload> {
	const number = parseFloat($paragraph.find('.parNum').attr('data-pnum') || 'NaN');
	const richBlock = await buildRichTextBlock($, $paragraph);

	return {
		...richBlock,
		number,
	};
}

function buildIllustrationPayload($: CheerioAPI, $figure: CheerioSelection): WatchtowerIllustrationPayload {
	const $image = $figure.find('img').first();
	const caption = cleanText($figure.find('figcaption').text());
	const paragraphNumbers = extractPnumsFromCaptionStrict(caption).map((pnum) => Number.parseInt(pnum, 10));
	const footnoteRefs = $figure
		.find('figcaption a.fn')
		.map((_, anchor) => buildFootnoteRef($(anchor)))
		.get();

	return {
		src: normalizeWolUrl($image.attr('src')) ?? '',
		alt: $image.attr('alt') ?? '',
		caption,
		...(paragraphNumbers.length > 0 ? { paragraphNumbers } : {}),
		...(footnoteRefs.length > 0 ? { footnoteRefs } : {}),
	};
}

async function buildBoxSupplementPayload(
	$: CheerioAPI,
	$boxSupplement: CheerioSelection,
): Promise<WatchtowerBoxSupplementPayload> {
	const $title = $boxSupplement.find(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_BOX_TITLE).first();
	const contentPromises = $boxSupplement
		.find(`${CONSTANTS.PUB_W_CSS_SELECTOR_FOR_BOX_CONTENT} p`)
		.map(async (_, paragraph) => ({
			kind: 'text' as const,
			payload: await buildRichTextBlock($, $(paragraph)),
		}))
		.get();

	return {
		title: cleanText($title.text()),
		content: await Promise.all(contentPromises),
	};
}

async function buildFootnotePayload($: CheerioAPI, $footnote: CheerioSelection): Promise<WatchtowerFootnotePayload> {
	const fnid = $footnote.attr('data-fnid') || $footnote.attr('id')?.replace(/^footnote/, '') || '';
	const marker = cleanText($footnote.find('.fn-symbol').first().text()) || fnid;
	const $content = $footnote.clone();
	$content.find('.fn-symbol').remove();
	const richBlock = await buildRichTextBlock($, $content);

	return {
		...richBlock,
		marker,
	};
}

function buildQuestionAssociation(
	questionIndex: number,
	sectionHeadingIndex: number | undefined,
): WatchtowerQuestionAssociation {
	return {
		questionIndex,
		...(sectionHeadingIndex !== undefined ? { sectionHeadingIndex } : {}),
	};
}

function isTopLevelTeachBlock($element: CheerioSelection): boolean {
	return (
		$element.is('.blockTeach') ||
		($element.is(CONSTANTS.PUB_W_CSS_SELECTOR_TEACH_BLOCK) &&
			$element.find(CONSTANTS.PUB_W_CSS_SELECTOR_TEACH_BLOCK_POINTS).length > 0)
	);
}

function addIndexesForQuestionPids(
	questionPids: string[],
	questionIndexByPid: Map<string, number>,
	questions: WatchtowerQuestionAssociation[],
	target: keyof Omit<WatchtowerQuestionAssociation, 'questionIndex' | 'sectionHeadingIndex'>,
	index: number,
): void {
	for (const questionPid of questionPids) {
		const questionIndex = questionIndexByPid.get(questionPid);
		if (questionIndex === undefined) continue;
		const questionAssociation = questions.find((question) => question.questionIndex === questionIndex);
		if (!questionAssociation) continue;
		const indexes = questionAssociation[target] ?? [];
		addUniqueIndex(indexes, index);
		questionAssociation[target] = indexes;
	}
}

function questionPidsForFigure($: CheerioAPI, $figure: CheerioSelection): string[] {
	const caption = cleanText($figure.find('figcaption').text());
	const pnums = extractPnumsFromCaptionStrict(caption);
	const questionPids = new Set<string>();

	for (const pnum of pnums) {
		$(`.parNum[data-pnum="${pnum}"]`)
			.closest('[data-pid]')
			.each((_, paragraph) => {
				for (const questionPid of extractQpidsFromRelPid($(paragraph).attr('data-rel-pid'))) {
					questionPids.add(questionPid);
				}
			});
	}

	return [...questionPids];
}

function addFootnoteIndexReference(
	refs: WatchtowerFootnoteIndexReference[],
	ref: WatchtowerFootnoteIndexReference,
): void {
	if (
		refs.some(
			(item) =>
				item.sourceIndex === ref.sourceIndex &&
				item.targetIndex === ref.targetIndex &&
				item.marker === ref.marker,
		)
	) {
		return;
	}

	refs.push(ref);
}

function addBoxSupplementIndexReference(
	refs: WatchtowerBoxSupplementIndexReference[],
	ref: WatchtowerBoxSupplementIndexReference,
): void {
	if (
		refs.some(
			(item) =>
				item.sourceIndex === ref.sourceIndex &&
				item.targetIndex === ref.targetIndex &&
				item.title === ref.title,
		)
	) {
		return;
	}

	refs.push(ref);
}

function collectRichTextIndexReferences(
	sourceIndex: number,
	payload: WatchtowerRichTextBlock,
	pendingFootnotes: PendingFootnoteIndexReference[],
	pendingBoxSupplements: PendingBoxSupplementIndexReference[],
): void {
	for (const ref of payload.footnoteRefs ?? []) {
		pendingFootnotes.push({
			sourceIndex,
			marker: ref.marker,
			...(ref.fnid ? { fnid: ref.fnid } : {}),
		});
	}
	delete payload.footnoteRefs;

	for (const ref of payload.boxSupplementRefs ?? []) {
		pendingBoxSupplements.push({
			sourceIndex,
			title: ref.title,
			targetPid: ref.targetPid,
		});
	}
	delete payload.boxSupplementRefs;
}

function collectContentItemIndexReferences(
	sourceIndex: number,
	item: WatchtowerArticleContentItem,
	pendingFootnotes: PendingFootnoteIndexReference[],
	pendingBoxSupplements: PendingBoxSupplementIndexReference[],
): void {
	if (item.kind === 'question' || item.kind === 'paragraph' || item.kind === 'footnote') {
		collectRichTextIndexReferences(sourceIndex, item.payload, pendingFootnotes, pendingBoxSupplements);
		return;
	}

	if (item.kind === 'illustration') {
		for (const ref of item.payload.footnoteRefs ?? []) {
			pendingFootnotes.push({
				sourceIndex,
				marker: ref.marker,
				...(ref.fnid ? { fnid: ref.fnid } : {}),
			});
		}
		delete item.payload.footnoteRefs;
		return;
	}

	if (item.kind === 'boxSupplement') {
		for (const boxItem of item.payload.content) {
			if (boxItem.kind === 'text') {
				collectRichTextIndexReferences(sourceIndex, boxItem.payload, pendingFootnotes, pendingBoxSupplements);
			}
		}
	}
}

function questionAssociationsForSourceIndex(
	sourceIndex: number,
	questions: WatchtowerQuestionAssociation[],
	paragraphQuestionPidsByIndex: Map<number, string[]>,
	questionIndexByPid: Map<string, number>,
): WatchtowerQuestionAssociation[] {
	const paragraphQuestionIndexes = new Set(
		(paragraphQuestionPidsByIndex.get(sourceIndex) ?? [])
			.map((questionPid) => questionIndexByPid.get(questionPid))
			.filter((index): index is number => index !== undefined),
	);

	return questions.filter((question) => {
		if (question.questionIndex === sourceIndex) return true;
		if (paragraphQuestionIndexes.has(question.questionIndex)) return true;
		if ((question.relevantParagraphIndexes ?? []).includes(sourceIndex)) return true;
		if ((question.relevantIllustrationIndexes ?? []).includes(sourceIndex)) return true;
		if ((question.relevantBoxSupplementIndexes ?? []).includes(sourceIndex)) return true;
		if ((question.relevantFootnoteIndexes ?? []).includes(sourceIndex)) return true;
		return false;
	});
}

function addQuestionRelevantIndex(
	question: WatchtowerQuestionAssociation,
	field: keyof Omit<WatchtowerQuestionAssociation, 'questionIndex' | 'sectionHeadingIndex'>,
	index: number,
): void {
	const indexes = question[field] ?? [];
	addUniqueIndex(indexes, index);
	question[field] = indexes;
}

function buildIndexReferences(input: {
	questions: WatchtowerQuestionAssociation[];
	pendingFootnotes: PendingFootnoteIndexReference[];
	pendingBoxSupplements: PendingBoxSupplementIndexReference[];
	footnoteIndexByFnid: Map<string, number>;
	boxSupplementIndexByPid: Map<number, number>;
	paragraphQuestionPidsByIndex: Map<number, string[]>;
	questionIndexByPid: Map<string, number>;
}): WatchtowerIndexReferences {
	const boxSupplements: WatchtowerBoxSupplementIndexReference[] = [];
	const footnotes: WatchtowerFootnoteIndexReference[] = [];

	for (const pendingBoxSupplement of input.pendingBoxSupplements) {
		const targetIndex = input.boxSupplementIndexByPid.get(pendingBoxSupplement.targetPid);
		if (targetIndex === undefined) {
			throw new Error(
				`Unable to resolve v2 flow box supplement pid [${pendingBoxSupplement.targetPid}] for [${pendingBoxSupplement.title}]`,
			);
		}

		addBoxSupplementIndexReference(boxSupplements, {
			sourceIndex: pendingBoxSupplement.sourceIndex,
			targetIndex,
			title: pendingBoxSupplement.title,
		});

		for (const question of questionAssociationsForSourceIndex(
			pendingBoxSupplement.sourceIndex,
			input.questions,
			input.paragraphQuestionPidsByIndex,
			input.questionIndexByPid,
		)) {
			addQuestionRelevantIndex(question, 'relevantBoxSupplementIndexes', targetIndex);
		}
	}

	for (const pendingFootnote of input.pendingFootnotes) {
		if (!pendingFootnote.fnid) continue;
		const targetIndex = input.footnoteIndexByFnid.get(pendingFootnote.fnid);
		if (targetIndex === undefined) continue;

		addFootnoteIndexReference(footnotes, {
			sourceIndex: pendingFootnote.sourceIndex,
			targetIndex,
			marker: pendingFootnote.marker,
		});

		for (const question of questionAssociationsForSourceIndex(
			pendingFootnote.sourceIndex,
			input.questions,
			input.paragraphQuestionPidsByIndex,
			input.questionIndexByPid,
		)) {
			addQuestionRelevantIndex(question, 'relevantFootnoteIndexes', targetIndex);
		}
	}

	return {
		questions: input.questions,
		...(footnotes.length > 0 ? { footnotes } : {}),
		...(boxSupplements.length > 0 ? { boxSupplements } : {}),
	};
}

function assertQuestionAssociations(
	content: WatchtowerArticleContentItem[],
	questions: WatchtowerQuestionAssociation[],
): void {
	const expectedKinds: Record<
		keyof Omit<WatchtowerQuestionAssociation, 'questionIndex' | 'sectionHeadingIndex'>,
		WatchtowerArticleContentItem['kind']
	> = {
		relevantParagraphIndexes: 'paragraph',
		relevantIllustrationIndexes: 'illustration',
		relevantBoxSupplementIndexes: 'boxSupplement',
		relevantFootnoteIndexes: 'footnote',
		relevantVideoIndexes: 'video',
	};

	for (const question of questions) {
		if (content[question.questionIndex]?.kind !== 'question') {
			throw new Error(`Invalid questionIndex [${question.questionIndex}] in Watchtower v2 flow.`);
		}

		if (
			question.sectionHeadingIndex !== undefined &&
			content[question.sectionHeadingIndex]?.kind !== 'sectionHeading'
		) {
			throw new Error(`Invalid sectionHeadingIndex [${question.sectionHeadingIndex}] in Watchtower v2 flow.`);
		}

		for (const [field, expectedKind] of Object.entries(expectedKinds) as Array<
			[keyof typeof expectedKinds, WatchtowerArticleContentItem['kind']]
		>) {
			for (const index of question[field] ?? []) {
				if (content[index]?.kind !== expectedKind) {
					throw new Error(`Invalid ${field} entry [${index}] in Watchtower v2 flow.`);
				}
			}
		}
	}
}

function assertIndexReferences(
	content: WatchtowerArticleContentItem[],
	indexReferences: WatchtowerIndexReferences,
): void {
	for (const ref of indexReferences.footnotes ?? []) {
		if (!content[ref.sourceIndex]) {
			throw new Error(`Invalid footnote sourceIndex [${ref.sourceIndex}] in Watchtower v2 flow.`);
		}
		if (content[ref.targetIndex]?.kind !== 'footnote') {
			throw new Error(`Invalid footnote targetIndex [${ref.targetIndex}] in Watchtower v2 flow.`);
		}
	}

	for (const ref of indexReferences.boxSupplements ?? []) {
		if (!content[ref.sourceIndex]) {
			throw new Error(`Invalid boxSupplement sourceIndex [${ref.sourceIndex}] in Watchtower v2 flow.`);
		}
		if (content[ref.targetIndex]?.kind !== 'boxSupplement') {
			throw new Error(`Invalid boxSupplement targetIndex [${ref.targetIndex}] in Watchtower v2 flow.`);
		}
	}
}

async function extractArticleFlow($: CheerioAPI): Promise<WatchtowerFlowExtraction> {
	const content: WatchtowerArticleContentItem[] = [];
	const questions: WatchtowerQuestionAssociation[] = [];
	const questionIndexByPid = new Map<string, number>();
	const boxSupplementIndexByPid = new Map<number, number>();
	const footnoteIndexByFnid = new Map<string, number>();
	const pendingFootnotes: PendingFootnoteIndexReference[] = [];
	const pendingBoxSupplements: PendingBoxSupplementIndexReference[] = [];
	const paragraphQuestionPidsByIndex = new Map<number, string[]>();
	const $body = $('#article .bodyTxt').first();
	const $flowRoot = $body.length ? $body : $('#article');
	let currentSectionHeadingIndex: number | undefined;

	const addContent = (item: WatchtowerArticleContentItem) => {
		content.push(item);
		return content.length - 1;
	};

	const flowChildren = $flowRoot.children().toArray();
	for (const element of flowChildren) {
		const $element = $(element);

		if ($element.is('h2') && $element.parents(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_SUPPLEMENT_BOX).length === 0) {
			currentSectionHeadingIndex = addContent({
				kind: 'sectionHeading',
				payload: buildSectionHeadingPayload($element),
			});
			continue;
		}

		if ($element.is(CONSTANTS.PUB_W_CSS_SELECTOR_QUESTION)) {
			const questionPid = $element.attr('data-pid');
			if (!questionPid) {
				throw new Error(`Missing data-pid for v2 flow question ${cleanText($element.text())}`);
			}

			const questionIndex = addContent({
				kind: 'question',
				payload: await buildQuestionPayload($, $element),
			});
			collectContentItemIndexReferences(
				questionIndex,
				content[questionIndex],
				pendingFootnotes,
				pendingBoxSupplements,
			);
			questionIndexByPid.set(questionPid, questionIndex);
			questions.push(buildQuestionAssociation(questionIndex, currentSectionHeadingIndex));
			continue;
		}

		if ($element.is('p[data-rel-pid]')) {
			const questionPids = extractQpidsFromRelPid($element.attr('data-rel-pid'));
			const paragraphIndex = addContent({
				kind: 'paragraph',
				payload: await buildParagraphPayload($, $element),
			});
			paragraphQuestionPidsByIndex.set(paragraphIndex, questionPids);
			collectContentItemIndexReferences(
				paragraphIndex,
				content[paragraphIndex],
				pendingFootnotes,
				pendingBoxSupplements,
			);
			addIndexesForQuestionPids(
				questionPids,
				questionIndexByPid,
				questions,
				'relevantParagraphIndexes',
				paragraphIndex,
			);
			continue;
		}

		if ($element.is(CONSTANTS.PUB_W_CSS_SELECTOR_FOR_SUPPLEMENT_BOX)) {
			const payload = await buildBoxSupplementPayload($, $element);
			const boxSupplementIndex = addContent({
				kind: 'boxSupplement',
				payload,
			});
			collectContentItemIndexReferences(
				boxSupplementIndex,
				content[boxSupplementIndex],
				pendingFootnotes,
				pendingBoxSupplements,
			);
			const boxSupplementPid = getBoxSupplementPid($element);
			boxSupplementIndexByPid.set(boxSupplementPid, boxSupplementIndex);
			continue;
		}

		if ($element.is('figure') || $element.find('figure').length > 0) {
			const figures = $element.is('figure') ? $element.toArray() : $element.find('figure').toArray();
			for (const figure of figures) {
				const $figure = $(figure);
				const illustrationIndex = addContent({
					kind: 'illustration',
					payload: buildIllustrationPayload($, $figure),
				});
				collectContentItemIndexReferences(
					illustrationIndex,
					content[illustrationIndex],
					pendingFootnotes,
					pendingBoxSupplements,
				);
				addIndexesForQuestionPids(
					questionPidsForFigure($, $figure),
					questionIndexByPid,
					questions,
					'relevantIllustrationIndexes',
					illustrationIndex,
				);
			}
			continue;
		}

		if (isTopLevelTeachBlock($element)) {
			addContent({
				kind: 'teachBlock',
				payload: {
					headline: cleanText($element.find('h2').first().text()),
					points: $element
						.find('ul li p')
						.map((_, point) => cleanText($(point).text()))
						.get(),
				},
			});
			continue;
		}

		if ($element.is('p') && $element.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_VIDEO_ANCHORS).length > 0) {
			$element.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_VIDEO_ANCHORS).each((_, anchor) => {
				const videoIndex = addContent({
					kind: 'video',
					payload: buildVideoData($(anchor), cleanText($element.text())),
				});
				const questionPids = extractQpidsFromRelPid($element.attr('data-rel-pid'));
				addIndexesForQuestionPids(
					questionPids,
					questionIndexByPid,
					questions,
					'relevantVideoIndexes',
					videoIndex,
				);
			});
		}
	}

	const footnotes = $('#article .groupFootnote .fn-ref').toArray();
	for (const footnote of footnotes) {
		const $footnote = $(footnote);
		const footnoteIndex = addContent({
			kind: 'footnote',
			payload: await buildFootnotePayload($, $footnote),
		});
		collectContentItemIndexReferences(
			footnoteIndex,
			content[footnoteIndex],
			pendingFootnotes,
			pendingBoxSupplements,
		);
		const fnid = $footnote.attr('data-fnid') || $footnote.attr('id')?.replace(/^footnote/, '');
		if (fnid) footnoteIndexByFnid.set(fnid, footnoteIndex);
	}

	const indexReferences = buildIndexReferences({
		questions,
		pendingFootnotes,
		pendingBoxSupplements,
		footnoteIndexByFnid,
		boxSupplementIndexByPid,
		paragraphQuestionPidsByIndex,
		questionIndexByPid,
	});
	assertQuestionAssociations(content, indexReferences.questions);
	assertIndexReferences(content, indexReferences);

	return {
		content,
		indexReferences,
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

export async function extractArticleContentsV2(input: ExtractionContextOptions): Promise<WatchtowerArticleDataV2> {
	const { $ } = createExtractionContext(input);

	const articleNumber = cleanText($(CONSTANTS.PUB_W_CSS_SELECTOR_ARTICLE_NUMBER).text());
	const articleTitle = cleanText($(CONSTANTS.PUB_W_CSS_SELECTOR_ARTICLE_TITLE).text());
	const articleThemeScrip = cleanText($(CONSTANTS.PUB_W_CSS_SELECTOR_ARTICLE_THEME_SCRIP).text());
	const articleTopic = cleanText($(CONSTANTS.PUB_W_CSS_SELECTOR_ARTICLE_TOPIC).text());

	const { content, indexReferences } = await extractArticleFlow($);

	return {
		articleNumber,
		articleTitle,
		articleThemeScrip,
		articleTopic,
		content,
		indexReferences,
	};
}
