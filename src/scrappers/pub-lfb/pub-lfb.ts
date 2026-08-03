import { ExtractionContextOptions, createExtractionContext } from '../generics.js';
import { CheerioAPI } from 'cheerio';
import { CONSTANTS, logger, opErrored, wrapAsyncOp, cleanText, fixLineContinuations } from '../../kernel/index.js';
import { markify } from 'markify-ts';
import { fetchAndParseAnchorReferenceOrThrow } from '../../data-fetching/reference-json.js';
import type { CheerioSelection } from '../../data-extraction/generic.js';
import { CongregationBibleStudyData, extractBibleStudy } from '../pub-mwb/pub-mwb.js';
import { fetchThisWeekMeetingHtml } from '../../data-fetching/wol-pages.js';
import {
	CitationTextBlock,
	addParsedReferenceToCitationBlock,
	addUnableToExtractReferenceToCitationBlock,
	buildCitationMarker,
	createCitationTextBlock,
} from '../../data-extraction/citations.js';

const log = logger.child({ ...logger.bindings(), label: 'pub-lfb-scraper' });

const GOVERNMENT_BODY_LETTER = 'GB_LETTER';
const SECTION_INTRODUCTION = 'SECTION_INTRO';
const LESSON = 'LESSON';

export const buildDefaultLinks = wrapAsyncOp(async function _buildDefaultLinks(): Promise<
	CongregationBibleStudyData['references'] | Error
> {
	let htmlOpRes = await fetchThisWeekMeetingHtml();

	if (opErrored(htmlOpRes)) {
		return htmlOpRes.err;
	}

	let bibleReadOpRes = extractBibleStudy({ html: htmlOpRes.res });
	return bibleReadOpRes.references;
});

export interface LfbItem {
	type: typeof GOVERNMENT_BODY_LETTER | typeof SECTION_INTRODUCTION | typeof LESSON;
	contents: unknown;
}

export interface LfbItemV2 {
	type: typeof GOVERNMENT_BODY_LETTER | typeof SECTION_INTRODUCTION | typeof LESSON;
	contents: unknown;
}

function detectHasGbLetter($article: CheerioSelection): boolean {
	return $article.is('.docClass-24');
}

function detectHasSectionIntro($article: CheerioSelection): boolean {
	return $article.is('.docClass-15');
}

function detectHasLessons($article: CheerioSelection): boolean {
	return $article.is('.docClass-13');
}

function parseGbLetter($article: CheerioSelection): LfbItem {
	const contents = cleanText($article.text());
	return { type: GOVERNMENT_BODY_LETTER, contents: { contents } };
}

function parseSectionIntro($: CheerioAPI, $article: CheerioSelection): LfbItem {
	const title = cleanText($article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_SECTION_INTRO_HEADLINE).text());
	const contents = cleanText($article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_BODY_SELECTOR).text());
	const lessons = $article
		.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_SECTION_INTRO_LESSONS_SELECTOR)
		.map((_, li) => cleanText($(li).text()))
		.get();
	const img = $article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_HEADLINE_FIGURE);
	const coverFigure = {
		imgURL: `${CONSTANTS.WOL_URL}${img.attr('src')}`,
		altText: img.attr('alt'),
	};
	return {
		type: SECTION_INTRODUCTION,
		contents: {
			title,
			contents,
			lessons,
			coverFigure,
		},
	};
}

function findAndBuildCitation($: CheerioAPI, foo: CheerioSelection, seedText: string) {
	const citationPromises = foo
		.find('a')
		.map(async (index, aEl) => {
			const $a = $(aEl);
			const textRaw = cleanText($a.text());
			log.debug(`Extracting reference: [${textRaw}]`);
			seedText = seedText.replace(textRaw.replace(';', ''), `{{${index + 1}}}`);

			const opRes = await fetchAndParseAnchorReferenceOrThrow($a);
			if (opErrored(opRes)) {
				log.warn(`Unable to load reference data for mnemonic: [${textRaw}] due to: [${opRes.err.message}]`);
				return {
					refNum: index + 1,
					mnemonic: textRaw,
					contents: CONSTANTS.UNABLE_TO_EXTRACT_REFERENCE,
				};
			}
			return {
				refNum: index + 1,
				mnemonic: opRes.res.itemTitle,
				contents: opRes.res.parsedContent,
			};
		})
		.get();
	return { citationPromises, processedText: seedText };
}

async function buildCitationBlockFromAnchors(foo: CheerioSelection, seedText: string): Promise<CitationTextBlock> {
	const anchors = foo.find('a');
	const textWithCitationsSelection = foo.clone();
	const textWithCitationsAnchors = textWithCitationsSelection.find('a');
	for (let i = 0; i < textWithCitationsAnchors.length; i++) {
		textWithCitationsAnchors.eq(i).replaceWith(buildCitationMarker(i + 1));
	}

	let block = createCitationTextBlock(seedText, cleanText(textWithCitationsSelection.text()));

	for (let i = 0; i < anchors.length; i++) {
		const $a = anchors.eq(i);
		const mnemonic = cleanText($a.text());
		log.debug(`Extracting v2 reference: [${mnemonic}]`);

		const opRes = await fetchAndParseAnchorReferenceOrThrow($a);
		if (opErrored(opRes)) {
			log.warn(`Unable to load reference data for mnemonic: [${mnemonic}] due to: [${opRes.err.message}]`);
			block = addUnableToExtractReferenceToCitationBlock(block, mnemonic);
			continue;
		}

		block = addParsedReferenceToCitationBlock(block, mnemonic, opRes.res);
	}

	return block;
}

async function buildLessonMarkdown($article: CheerioSelection): Promise<string> {
	const { markdown } = await markify({
		htmlContent: $article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_BODY_SELECTOR).html() ?? '',
		ignoreSelectors: CONSTANTS.MARKIFY_GENERAL_CSS_SELECTORS_TO_IGNORE,
		ignoreHiddenElements: true,
	});

	return fixLineContinuations(markdown);
}

async function parseLesson($: CheerioAPI, $article: CheerioSelection): Promise<LfbItem> {
	const lessonNumberText = cleanText($article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_SECTION_INTRO_HEADLINE).text());
	log.debug(`Parsing lesson number text: [${lessonNumberText}]`);
	const number = parseInt(lessonNumberText.replace(/\D/g, ''), 10);
	const title = cleanText($article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_LESSON_TITLE_SELECTOR).text());
	const lessonContentsAsMd = await buildLessonMarkdown($article);
	const figures = $article
		.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_LESSON_FIGURE_SELECTOR)
		// This selector matches the cover image too so we just skip it
		.slice(1)
		.map((_, imgEl) => {
			const $figure = $(imgEl);
			return {
				imgURL: $figure.attr('src'),
				altText: $figure.attr('alt'),
			};
		})
		.get();
	const $quoteEl = $article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_LESSON_HIGHLIGHT_QUOTE_SELECTOR);
	const highlightQuoteTextRaw = cleanText($quoteEl.text());

	log.debug('Extracting citations for highlight quote...');
	const quoteSourceReferPromises = findAndBuildCitation($, $quoteEl, highlightQuoteTextRaw);
	const quoteSourceCitations = await Promise.all(quoteSourceReferPromises.citationPromises);

	const questions = cleanText($article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_LESSON_QUESTIONS_SELECTOR).text());

	const $sourcesEls = $article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_LESSON_CITATIONS_SELECTOR);
	log.debug('Extracting citations for bible sources...');
	const bibleSourcesCitations = cleanText($sourcesEls.text());
	const sourceCitationsWork = findAndBuildCitation($, $sourcesEls, bibleSourcesCitations);
	const bibleSourceCitations = await Promise.all(sourceCitationsWork.citationPromises);

	const coverImg = $article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_HEADLINE_FIGURE);
	const coverFigure = {
		imgURL: coverImg.attr('src'),
		altText: coverImg.attr('alt'),
	};

	return {
		type: LESSON,
		contents: {
			number,
			title,
			coverFigure,
			contents: lessonContentsAsMd,
			figures,
			highlightQuote: {
				textRaw: highlightQuoteTextRaw,
				textProcessed: quoteSourceReferPromises.processedText,
				citations: quoteSourceCitations,
			},
			questions,
			bibleSources: {
				textRaw: bibleSourcesCitations,
				textProcessed: sourceCitationsWork.processedText,
				citations: bibleSourceCitations,
			},
		},
	};
}

async function parseLessonV2($: CheerioAPI, $article: CheerioSelection): Promise<LfbItemV2> {
	const lessonNumberText = cleanText($article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_SECTION_INTRO_HEADLINE).text());
	log.debug(`Parsing v2 lesson number text: [${lessonNumberText}]`);
	const number = parseInt(lessonNumberText.replace(/\D/g, ''), 10);
	const title = cleanText($article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_LESSON_TITLE_SELECTOR).text());
	const lessonContentsAsMd = await buildLessonMarkdown($article);
	const figures = $article
		.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_LESSON_FIGURE_SELECTOR)
		.slice(1)
		.map((_, imgEl) => {
			const $figure = $(imgEl);
			return {
				imgURL: $figure.attr('src'),
				altText: $figure.attr('alt'),
			};
		})
		.get();
	const $quoteEl = $article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_LESSON_HIGHLIGHT_QUOTE_SELECTOR);
	const highlightQuoteText = cleanText($quoteEl.text());

	log.debug('Extracting v2 citations for highlight quote...');
	const highlightQuote = await buildCitationBlockFromAnchors($quoteEl, highlightQuoteText);

	const questions = cleanText($article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_LESSON_QUESTIONS_SELECTOR).text());

	const $sourcesEls = $article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_LESSON_CITATIONS_SELECTOR);
	log.debug('Extracting v2 citations for bible sources...');
	const bibleSourcesText = cleanText($sourcesEls.text());
	const bibleSources = await buildCitationBlockFromAnchors($sourcesEls, bibleSourcesText);

	const coverImg = $article.find(CONSTANTS.PUB_LFB_CSS_SELECTOR_HEADLINE_FIGURE);
	const coverFigure = {
		imgURL: coverImg.attr('src'),
		altText: coverImg.attr('alt'),
	};

	return {
		type: LESSON,
		contents: {
			number,
			title,
			coverFigure,
			contents: lessonContentsAsMd,
			figures,
			highlightQuote,
			questions,
			bibleSources,
		},
	};
}

export async function extractLfbContents(input: ExtractionContextOptions): Promise<LfbItem> {
	log.debug('Starting LFB content extraction...');
	const cc = createExtractionContext({ ...input, selectionBuilder: ($) => $('#article') });
	const $article = cc.selection;
	let result: LfbItem;
	if (detectHasGbLetter($article)) {
		log.debug('Governing Body letter detected. Parsing...');
		result = parseGbLetter($article);
	}
	if (detectHasSectionIntro($article)) {
		log.debug('Section introduction detected. Parsing...');
		result = parseSectionIntro(cc.$, cc.selection);
	}
	if (detectHasLessons($article)) {
		log.debug('Lesson detected. Parsing...');
		result = await parseLesson(cc.$, cc.selection);
	}
	log.debug('LFB content extraction finished.');
	return result!;
}

export async function extractLfbContentsV2(input: ExtractionContextOptions): Promise<LfbItemV2> {
	log.debug('Starting v2 LFB content extraction...');
	const cc = createExtractionContext({ ...input, selectionBuilder: ($) => $('#article') });
	const $article = cc.selection;
	let result: LfbItemV2;
	if (detectHasGbLetter($article)) {
		log.debug('Governing Body letter detected. Parsing...');
		result = parseGbLetter($article);
	}
	if (detectHasSectionIntro($article)) {
		log.debug('Section introduction detected. Parsing...');
		result = parseSectionIntro(cc.$, cc.selection);
	}
	if (detectHasLessons($article)) {
		log.debug('Lesson detected. Parsing v2...');
		result = await parseLessonV2(cc.$, cc.selection);
	}
	log.debug('V2 LFB content extraction finished.');
	return result!;
}
