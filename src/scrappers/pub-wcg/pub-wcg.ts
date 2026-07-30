import { CheerioAPI } from 'cheerio';
import { markify } from 'markify-ts';
import { fetchAndParseAnchorReferenceOrThrow } from '../../data-fetching/reference-json.js';
import type { CheerioSelection } from '../../data-extraction/generic.js';
import {
	CitationTextBlock,
	addParsedReferenceToCitationBlock,
	addUnableToExtractReferenceToCitationBlock,
	buildCitationMarker,
	createCitationTextBlock,
} from '../../data-extraction/citations.js';
import { fetchThisWeekMeetingHtml } from '../../data-fetching/wol-pages.js';
import {
	CONSTANTS,
	cleanInlineText,
	cleanText,
	fixLineContinuations,
	logger,
	normalizeWolUrl,
	opErrored,
	wrapAsyncOp,
} from '../../kernel/index.js';
import { ExtractionContextOptions, createExtractionContext } from '../generics.js';
import { CongregationBibleStudyData, extractBibleStudy } from '../pub-mwb/pub-mwb.js';

const log = logger.child({ ...logger.bindings(), label: 'pub-wcg-scraper' });

export const WCG_PAGE_TYPES = Object.freeze({
	COVER: 'COVER',
	PUBLISHERS_PAGE: 'PUBLISHERS_PAGE',
	INDEX: 'INDEX',
	GOVERNING_BODY_LETTER: 'GB_LETTER',
	INTRODUCTION: 'INTRODUCTION',
	SECTION_INTRODUCTION: 'SECTION_INTRO',
	TIMELINE: 'TIMELINE',
	LESSON: 'LESSON',
	CONCLUSION: 'CONCLUSION',
	BACK_COVER: 'BACK_COVER',
	UNKNOWN: 'UNKNOWN',
} as const);

export type WcgPageType = (typeof WCG_PAGE_TYPES)[keyof typeof WCG_PAGE_TYPES];

export interface WcgImage {
	src: string;
	alt: string;
}

export interface WcgFigure extends WcgImage {
	id: string;
	caption?: string;
	credit?: string;
	href?: string;
	video?: string;
}

export interface WcgBibleAccount {
	mnemonic: string;
	scripture: string;
}

export interface WcgQuestionBlock extends CitationTextBlock {
	figure: WcgFigure | null;
}

export interface WcgReflectQuestionBlock extends WcgQuestionBlock {
	subPoints?: WcgQuestionBlock[];
}

export interface WcgLessonContents {
	number?: number;
	subject: string;
	title: string;
	narration: string;
	narrationFigures: WcgImage[];
	featuredQuote: string;
	readTheBibleAccount: WcgBibleAccount[];
	forDiscussion: string;
	digDeeper: WcgQuestionBlock[];
	reflectOnTheLessons: WcgReflectQuestionBlock[];
	meditateOnTheBiggerPicture: string[];
}

export interface WcgSection {
	heading: string;
	level: 'h2' | 'h3';
	paragraphs: string[];
	questions: string[];
}

export interface WcgTable {
	heading: string;
	headers: string[];
	rows: string[][];
}

export interface WcgLink {
	text: string;
	href?: string;
}

export interface WcgItem {
	type: WcgPageType;
	contents: unknown;
}

interface WcgHeader {
	title: string;
}

interface WcgBodyStructure {
	questions: string[];
	sections: WcgSection[];
}

const WCG_MARKIFY_SELECTORS_TO_IGNORE = [
	...CONSTANTS.MARKIFY_GENERAL_CSS_SELECTORS_TO_IGNORE,
	'.gen-field',
	'.questionContainer',
	'.galleryModalContainer',
	'.pswp',
	'.alternatePresentation',
	'.groupFootnote',
	'.fn-ref',
];

export const buildDefaultLinks = wrapAsyncOp(async function _buildDefaultLinks(): Promise<
	CongregationBibleStudyData['references'] | Error
> {
	const htmlOpRes = await fetchThisWeekMeetingHtml();
	if (opErrored(htmlOpRes)) {
		return htmlOpRes.err;
	}

	const bibleStudy = extractBibleStudy({ html: htmlOpRes.res });
	if (bibleStudy.references.length === 0) {
		return new Error('No congregation Bible study WCG link found in this week meeting program.');
	}

	return bibleStudy.references;
});

function getArticleClasses($article: CheerioSelection): string {
	return $article.attr('class') ?? '';
}

function getHeaderSelection($article: CheerioSelection): CheerioSelection {
	const $scalableHeader = $article.find('.scalableui > header').first();
	if ($scalableHeader.length > 0) return $scalableHeader;
	return $article.find('header').first();
}

function getContextTitle($article: CheerioSelection): string {
	const $header = getHeaderSelection($article);
	return cleanInlineText($header.find('.contextTtl').first().text() || $article.find('.contextTtl').first().text());
}

function detectWcgPageType($article: CheerioSelection): WcgPageType {
	const docClass = getArticleClasses($article).match(/\bdocClass-([^\s]+)\b/i)?.[1] ?? '';

	if (docClass === '39') return WCG_PAGE_TYPES.COVER;
	if (docClass === '18') return WCG_PAGE_TYPES.PUBLISHERS_PAGE;
	if (docClass === '19') return WCG_PAGE_TYPES.INDEX;
	if (docClass === '24') return WCG_PAGE_TYPES.GOVERNING_BODY_LETTER;
	if (docClass === '16') return WCG_PAGE_TYPES.BACK_COVER;

	if (docClass === '15') {
		if ($article.find('header #f2 img').length > 0) return WCG_PAGE_TYPES.SECTION_INTRODUCTION;
		if ($article.find('.bodyTxt > table').length > 0) return WCG_PAGE_TYPES.TIMELINE;
		return WCG_PAGE_TYPES.UNKNOWN;
	}

	if (docClass === '13') {
		if ($article.find('.bodyTxt .stdPullQuote').length > 0) return WCG_PAGE_TYPES.LESSON;
		if ($article.find('.bodyTxt h3').length > 0) return WCG_PAGE_TYPES.CONCLUSION;
		return WCG_PAGE_TYPES.INTRODUCTION;
	}

	return WCG_PAGE_TYPES.UNKNOWN;
}

function parseWcgHeader($article: CheerioSelection): WcgHeader {
	const $header = getHeaderSelection($article);

	return {
		title: cleanInlineText($header.find('h1').first().text() || $article.find('h1').first().text()),
	};
}

function parseWcgImage($img: CheerioSelection): WcgImage {
	return {
		src: normalizeWolUrl($img.attr('src')) ?? '',
		alt: $img.attr('alt') ?? '',
	};
}

function parseWcgFigure($: CheerioAPI, figureEl: Parameters<CheerioAPI>[0]): WcgFigure {
	const $figure = $(figureEl);
	const $img = $figure.find('img').first();
	const $link = $figure.find('a').first();
	const image = parseWcgImage($img);
	const id = $figure.attr('id');
	const figure: WcgFigure = { ...image, id: id ?? '' };
	const caption = cleanInlineText($figure.find('figcaption').text());
	const credit = cleanInlineText($figure.find('.imgCredit').text());
	const href = normalizeWolUrl($link.attr('href'));
	const video = $link.attr('data-video');

	if (caption) figure.caption = caption;
	if (credit) figure.credit = credit;
	if (href) figure.href = href;
	if (video) figure.video = video;

	return figure;
}

function parseWcgFigures($: CheerioAPI, $article: CheerioSelection): WcgFigure[] {
	return $article
		.find(`.bodyTxt ${CONSTANTS.GENERAL_CSS_SELECTOR_FOR_FIGURES}`)
		.map((_, figureEl) => parseWcgFigure($, figureEl))
		.get();
}

function normalizeWcgFigureMarker(text: string): string {
	const tokens = cleanInlineText(text)
		.replace(/[()[\]{}]/g, ' ')
		.match(/[\p{L}\p{N}]+/gu);

	return tokens?.[tokens.length - 1]?.toLocaleUpperCase() ?? '';
}

function buildFigureLabelMap($: CheerioAPI, $scope: CheerioSelection): Map<string, WcgFigure> {
	const figures = new Map<string, WcgFigure>();

	getSelectionWithDescendants($scope, CONSTANTS.GENERAL_CSS_SELECTOR_FOR_FIGURES).each((_, figureEl) => {
		const $figure = $(figureEl);
		const figure = parseWcgFigure($, figureEl);
		const captionLabel = cleanInlineText($figure.find('figcaption').first().text()).split(/[:：]/, 1)[0];
		const label =
			normalizeWcgFigureMarker($figure.find('figcaption span[class*="du-bgColor"] strong').first().text()) ||
			normalizeWcgFigureMarker(captionLabel);

		if (label) {
			figures.set(label, figure);
		}
	});

	return figures;
}

function findBodyHeading(
	$: CheerioAPI,
	$article: CheerioSelection,
	selector: 'h2' | 'h3',
	textPattern: RegExp,
): CheerioSelection {
	return $article
		.find(`.bodyTxt ${selector}`)
		.filter((_, headingEl) => textPattern.test(cleanInlineText($(headingEl).text())))
		.first();
}

function getSectionSiblingsUntilHeading(
	$: CheerioAPI,
	$heading: CheerioSelection,
	stopPattern?: RegExp,
): CheerioSelection {
	const sectionElements: any[] = [];
	let $current = $heading.next();

	while ($current.length > 0) {
		const headingText = $current.is('h2, h3')
			? cleanInlineText($current.text())
			: cleanInlineText($current.find('h2, h3').first().text());
		if (headingText && (!stopPattern || stopPattern.test(headingText))) break;

		sectionElements.push($current[0]);
		$current = $current.next();
	}

	return $(sectionElements);
}

function getSelectionWithDescendants($selection: CheerioSelection, selector: string): CheerioSelection {
	return $selection.filter(selector).add($selection.find(selector));
}

function getPreviousQuestionParagraph($field: CheerioSelection): CheerioSelection {
	const $previousParagraph = $field.prev('p');
	if ($previousParagraph.length > 0) return $previousParagraph;
	return $field.prevAll('p').first();
}

async function buildCitationBlockFromElement($element: CheerioSelection): Promise<CitationTextBlock> {
	const anchors = $element.find('a');
	const textWithCitationsSelection = $element.clone();
	const textWithCitationsAnchors = textWithCitationsSelection.find('a');
	for (let i = 0; i < textWithCitationsAnchors.length; i++) {
		textWithCitationsAnchors.eq(i).replaceWith(buildCitationMarker(i + 1));
	}

	let block = createCitationTextBlock(
		cleanInlineText($element.text()),
		cleanInlineText(textWithCitationsSelection.text()),
	);

	for (let i = 0; i < anchors.length; i++) {
		const $anchor = anchors.eq(i);
		const mnemonic = cleanInlineText($anchor.text());
		const opRes = await fetchAndParseAnchorReferenceOrThrow($anchor);
		if (opErrored(opRes)) {
			log.warn(`Unable to load WCG citation for mnemonic: [${mnemonic}] due to: [${opRes.err.message}]`);
			block = addUnableToExtractReferenceToCitationBlock(block, mnemonic);
			continue;
		}

		block = addParsedReferenceToCitationBlock(block, mnemonic, opRes.res);
	}

	return block;
}

function getOpeningBlock($article: CheerioSelection, $readHeading: CheerioSelection): CheerioSelection {
	const $body = $article.find('.bodyTxt').first();
	if ($readHeading.length > 0) {
		if ($readHeading.parent()[0] === $body[0]) return $body;

		let $bodyBlock = $readHeading.parent();
		while ($bodyBlock.parent().length > 0 && $bodyBlock.parent()[0] !== $body[0]) {
			$bodyBlock = $bodyBlock.parent();
		}

		if ($bodyBlock.parent()[0] === $body[0]) return $bodyBlock;
	}

	const $firstBlock = $body.children().first();
	return $firstBlock.length > 0 ? $firstBlock : $body;
}

function getChildrenBeforeElement(
	$: CheerioAPI,
	$container: CheerioSelection,
	$boundary: CheerioSelection,
): CheerioSelection {
	if ($boundary.length === 0) return $container.children();

	let $boundaryChild = $boundary;
	while ($boundaryChild.parent().length > 0 && $boundaryChild.parent()[0] !== $container[0]) {
		$boundaryChild = $boundaryChild.parent();
	}

	if ($boundaryChild.parent()[0] !== $container[0]) return $container.children();
	return $($boundaryChild.prevAll().get().reverse());
}

function parseNarration(
	$: CheerioAPI,
	$openingBlock: CheerioSelection,
	$readHeading: CheerioSelection,
): Pick<WcgLessonContents, 'narration' | 'narrationFigures' | 'featuredQuote'> {
	const paragraphs: string[] = [];
	const narrationFigures: WcgImage[] = [];
	let featuredQuote = '';

	getChildrenBeforeElement($, $openingBlock, $readHeading).each((_, el) => {
		const $el = $(el);
		if ($el.is(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_FIGURES)) {
			$el.find('img').each((_, imgEl) => {
				narrationFigures.push(parseWcgImage($(imgEl)));
			});
			return;
		}

		if (!featuredQuote && $el.is('.stdPullQuote')) {
			featuredQuote = cleanInlineText($el.text());
			return;
		}

		if (!$el.is('p') || shouldSkipWcgBodyText($el)) return;

		const text = cleanInlineText($el.text());
		if (text) paragraphs.push(text);
	});

	return {
		narration: paragraphs.join('\n\n'),
		narrationFigures,
		featuredQuote,
	};
}

async function parseBibleAccountAnchor($anchor: CheerioSelection): Promise<WcgBibleAccount> {
	const fallbackMnemonic = cleanInlineText($anchor.text());
	const opRes = await fetchAndParseAnchorReferenceOrThrow($anchor);
	if (opErrored(opRes)) {
		log.warn(`Unable to load WCG Bible account for mnemonic: [${fallbackMnemonic}] due to: [${opRes.err.message}]`);
		return {
			mnemonic: fallbackMnemonic,
			scripture: CONSTANTS.UNABLE_TO_EXTRACT_REFERENCE,
		};
	}

	return {
		mnemonic: cleanInlineText(opRes.res.title || fallbackMnemonic),
		scripture: opRes.res.parsedContent,
	};
}

async function parseBibleAccount($accountSection: CheerioSelection): Promise<WcgBibleAccount[]> {
	const anchors = getSelectionWithDescendants($accountSection, 'a');
	const accounts: WcgBibleAccount[] = [];

	for (let i = 0; i < anchors.length; i++) {
		accounts.push(await parseBibleAccountAnchor(anchors.eq(i)));
	}

	return accounts;
}

function parseForDiscussion($: CheerioAPI, $article: CheerioSelection): string {
	const $discussionHeading = findBodyHeading($, $article, 'h3', /^¿Qué diría\??$/i);
	if ($discussionHeading.length === 0) return '';

	const $discussionSection = getSectionSiblingsUntilHeading($, $discussionHeading);
	const $field = getSelectionWithDescendants($discussionSection, '.gen-field').first();
	const $question =
		$field.length > 0
			? getPreviousQuestionParagraph($field)
			: getSelectionWithDescendants($discussionSection, 'p').first();

	return cleanInlineText($question.text());
}

async function parseQuestionBlockFromParagraph(
	$question: CheerioSelection,
	figuresByLabel: Map<string, WcgFigure>,
): Promise<WcgQuestionBlock> {
	const block = await buildCitationBlockFromElement($question);
	const figureLabel =
		normalizeWcgFigureMarker($question.find('span[class*="du-color--"] strong').first().text()) ||
		(cleanInlineText(block.text)
			.match(/\s([A-Z])$/)?.[1]
			?.toUpperCase() ??
			'');

	return {
		...block,
		figure: figureLabel ? (figuresByLabel.get(figureLabel) ?? null) : null,
	};
}

async function parseDigDeeper($: CheerioAPI, $article: CheerioSelection): Promise<WcgQuestionBlock[]> {
	const $heading = findBodyHeading($, $article, 'h2', /^Investigue un poco más$/i);
	if ($heading.length === 0) return [];

	const $section = getSectionSiblingsUntilHeading($, $heading, /^Piense en las lecciones$/i);
	const figuresByLabel = buildFigureLabelMap($, $section);
	const fields = getSelectionWithDescendants($section, '.gen-field');
	const blocks: WcgQuestionBlock[] = [];
	const seenQuestions = new Set<unknown>();

	for (let i = 0; i < fields.length; i++) {
		const $question = getPreviousQuestionParagraph(fields.eq(i));
		if ($question.length === 0 || seenQuestions.has($question[0])) continue;

		seenQuestions.add($question[0]);
		if (!cleanInlineText($question.text())) continue;

		blocks.push(await parseQuestionBlockFromParagraph($question, figuresByLabel));
	}

	return blocks;
}

function getTopLevelList($: CheerioAPI, $scope: CheerioSelection, selector: 'ol' | 'ul'): CheerioSelection {
	return getSelectionWithDescendants($scope, selector)
		.filter((_, listEl) => $(listEl).parents(selector).length === 0)
		.first();
}

async function parseReflectOnLessons($: CheerioAPI, $article: CheerioSelection): Promise<WcgReflectQuestionBlock[]> {
	const $heading = findBodyHeading($, $article, 'h2', /^Piense en las lecciones$/i);
	if ($heading.length === 0) return [];

	const $section = getSectionSiblingsUntilHeading($, $heading, /^Vea el cuadro completo$/i);
	const figuresByLabel = buildFigureLabelMap($, $section);
	const $list = getTopLevelList($, $section, 'ul');
	const blocks: WcgReflectQuestionBlock[] = [];

	for (let i = 0; i < $list.children('li').length; i++) {
		const $li = $list.children('li').eq(i);
		const $question = $li.children('p').first();
		if ($question.length === 0 || !cleanInlineText($question.text())) continue;

		const block = await parseQuestionBlockFromParagraph($question, figuresByLabel);
		const subPoints: WcgQuestionBlock[] = [];
		const $nestedItems = $li.children('ul').children('li');

		for (let j = 0; j < $nestedItems.length; j++) {
			const $subPoint = $nestedItems.eq(j).children('p').first();
			if ($subPoint.length === 0 || !cleanInlineText($subPoint.text())) continue;
			subPoints.push(await parseQuestionBlockFromParagraph($subPoint, figuresByLabel));
		}

		blocks.push({
			...block,
			...(subPoints.length > 0 ? { subPoints } : {}),
		});
	}

	return blocks;
}

function parseMeditateOnBiggerPicture($: CheerioAPI, $article: CheerioSelection): string[] {
	const $heading = findBodyHeading($, $article, 'h2', /^Vea el cuadro completo$/i);
	if ($heading.length === 0) return [];

	const $section = getSectionSiblingsUntilHeading($, $heading, /^Para saber más$/i);
	const $list = getTopLevelList($, $section, 'ul');

	return $list
		.children('li')
		.map((_, liEl) => cleanInlineText($(liEl).children('p').first().text()))
		.get()
		.filter(Boolean);
}

function shouldSkipWcgBodyText($element: CheerioSelection): boolean {
	const text = cleanInlineText($element.text());
	return (
		$element.parents(`${CONSTANTS.GENERAL_CSS_SELECTOR_FOR_FIGURES}, .fn-ref, .groupFootnote`).length > 0 ||
		$element.is('.imgCredit, .gen-field') ||
		text === 'Respuesta' ||
		text === 'Respuestas'
	);
}

function parseWcgBodyStructure($: CheerioAPI, $article: CheerioSelection): WcgBodyStructure {
	const questions: string[] = [];
	const sections: WcgSection[] = [];
	let currentSection: WcgSection | undefined;

	$article
		.find('.bodyTxt')
		.first()
		.find('h2, h3, p, blockquote')
		.each((_, el) => {
			const $el = $(el);
			if (shouldSkipWcgBodyText($el)) return;

			const text = cleanInlineText($el.text());
			if (!text) return;

			if ($el.is('h2, h3')) {
				currentSection = {
					heading: text,
					level: el.tagName.toLowerCase() as 'h2' | 'h3',
					paragraphs: [],
					questions: [],
				};
				sections.push(currentSection);
				return;
			}

			if ($el.is('p.qu') || $el.next().is('.gen-field')) {
				questions.push(text);
				currentSection?.questions.push(text);
				return;
			}

			if (currentSection) {
				currentSection.paragraphs.push(text);
			}
		});

	return { questions, sections };
}

async function parseWcgBodyMarkdown($article: CheerioSelection): Promise<string> {
	const htmlContent = $article.find('.bodyTxt').first().html() ?? '';
	if (!htmlContent) return '';

	const contents = await markify({
		htmlContent,
		ignoreSelectors: WCG_MARKIFY_SELECTORS_TO_IGNORE,
		ignoreHiddenElements: true,
	});

	return fixLineContinuations(contents.markdown);
}

function parseWcgSectionNumber(contextTitle: string): number | undefined {
	const match = contextTitle.match(/\d+/);
	return match ? parseInt(match[0], 10) : undefined;
}

function parseWcgTables($: CheerioAPI, $article: CheerioSelection): WcgTable[] {
	return $article
		.find('.bodyTxt table')
		.map((_, tableEl) => {
			const $table = $(tableEl);
			const rows: string[][] = [];
			$table.find('tr').each((__, rowEl) => {
				rows.push(
					$(rowEl)
						.find('th, td')
						.map((___, cellEl) => cleanInlineText($(cellEl).text()))
						.get(),
				);
			});
			const [headers = [], ...bodyRows] = rows;

			return {
				heading: cleanText($table.prevAll('h2, h3').first().text()),
				headers,
				rows: bodyRows,
			};
		})
		.get();
}

function parseWcgLinks($: CheerioAPI, $article: CheerioSelection): WcgLink[] {
	return $article
		.find('.bodyTxt a, .groupTOC a')
		.map((_, linkEl) => {
			const $link = $(linkEl);
			return {
				text: cleanInlineText($link.text()),
				href: normalizeWolUrl($link.attr('href')),
			};
		})
		.get();
}

async function parseStudyPage($: CheerioAPI, $article: CheerioSelection, type: WcgPageType): Promise<WcgItem> {
	const body = parseWcgBodyStructure($, $article);

	return {
		type,
		contents: {
			...parseWcgHeader($article),
			contents: await parseWcgBodyMarkdown($article),
			questions: body.questions,
			sections: body.sections,
			figures: parseWcgFigures($, $article),
		},
	};
}

async function parseLesson($: CheerioAPI, $article: CheerioSelection): Promise<WcgItem> {
	const header = parseWcgHeader($article);
	const lessonContextMatch = getContextTitle($article).match(/^(\d+)\s*(.*)$/);
	const $readHeading = findBodyHeading($, $article, 'h3', /^Lea el relato b[ií]blico$/i);
	const $openingBlock = getOpeningBlock($article, $readHeading);
	const { narration, narrationFigures, featuredQuote } = parseNarration($, $openingBlock, $readHeading);
	const accountSection = getSectionSiblingsUntilHeading($, $readHeading);
	const contents: WcgLessonContents = {
		number: lessonContextMatch ? parseInt(lessonContextMatch[1], 10) : undefined,
		subject: cleanInlineText(lessonContextMatch?.[2] ?? ''),
		title: header.title,
		narration,
		narrationFigures,
		featuredQuote,
		readTheBibleAccount: await parseBibleAccount(accountSection),
		forDiscussion: parseForDiscussion($, $article),
		digDeeper: await parseDigDeeper($, $article),
		reflectOnTheLessons: await parseReflectOnLessons($, $article),
		meditateOnTheBiggerPicture: parseMeditateOnBiggerPicture($, $article),
	};

	return {
		type: WCG_PAGE_TYPES.LESSON,
		contents,
	};
}

async function parseSectionIntro($article: CheerioSelection): Promise<WcgItem> {
	const header = parseWcgHeader($article);
	const $headingImg = getHeaderSelection($article).find('#f2 img').first();

	return {
		type: WCG_PAGE_TYPES.SECTION_INTRODUCTION,
		contents: {
			...header,
			sectionNumber: parseWcgSectionNumber(getContextTitle($article)),
			contents: await parseWcgBodyMarkdown($article),
			headingImg: parseWcgImage($headingImg),
		},
	};
}

async function parseTimeline($: CheerioAPI, $article: CheerioSelection): Promise<WcgItem> {
	const body = parseWcgBodyStructure($, $article);
	const header = parseWcgHeader($article);

	return {
		type: WCG_PAGE_TYPES.TIMELINE,
		contents: {
			...header,
			sectionNumber: parseWcgSectionNumber(header.title),
			contents: await parseWcgBodyMarkdown($article),
			sections: body.sections,
			tables: parseWcgTables($, $article),
			footnotes: $article
				.find('.groupFootnote p')
				.map((_, footnoteEl) => cleanText($(footnoteEl).text()))
				.get(),
			figures: parseWcgFigures($, $article),
		},
	};
}

async function parseIndex($: CheerioAPI, $article: CheerioSelection): Promise<WcgItem> {
	return {
		type: WCG_PAGE_TYPES.INDEX,
		contents: {
			...parseWcgHeader($article),
			links: parseWcgLinks($, $article),
		},
	};
}

async function parseGenericPage($: CheerioAPI, $article: CheerioSelection, type: WcgPageType): Promise<WcgItem> {
	return {
		type,
		contents: {
			...parseWcgHeader($article),
			contents: await parseWcgBodyMarkdown($article),
			figures: parseWcgFigures($, $article),
		},
	};
}

async function parseGoverningBodyLetter($: CheerioAPI, $article: CheerioSelection): Promise<WcgItem> {
	return {
		type: WCG_PAGE_TYPES.GOVERNING_BODY_LETTER,
		contents: {
			...parseWcgHeader($article),
			contents: await parseWcgBodyMarkdown($article),
			closing: cleanText($article.find('.closingContent').text()),
			figures: parseWcgFigures($, $article),
		},
	};
}

export async function extractWcgContents(input: ExtractionContextOptions): Promise<WcgItem> {
	log.debug('Starting WCG content extraction...');
	const cc = createExtractionContext({ ...input, selectionBuilder: ($) => $('#article') });
	const $article = cc.selection;
	const articleClasses = getArticleClasses($article);

	if (!new RegExp(`\\b${CONSTANTS.PUB_CODE_WCG}\\b`, 'i').test(articleClasses)) {
		throw new Error(`Unsupported WCG page. Article classes: [${articleClasses}]`);
	}

	const pageType = detectWcgPageType($article);
	if (pageType === WCG_PAGE_TYPES.GOVERNING_BODY_LETTER) return parseGoverningBodyLetter(cc.$, $article);
	if (pageType === WCG_PAGE_TYPES.LESSON) return parseLesson(cc.$, $article);
	if (pageType === WCG_PAGE_TYPES.SECTION_INTRODUCTION) return parseSectionIntro($article);
	if (pageType === WCG_PAGE_TYPES.TIMELINE) return parseTimeline(cc.$, $article);
	if (pageType === WCG_PAGE_TYPES.INDEX) return parseIndex(cc.$, $article);
	if (pageType === WCG_PAGE_TYPES.INTRODUCTION || pageType === WCG_PAGE_TYPES.CONCLUSION) {
		return parseStudyPage(cc.$, $article, pageType);
	}

	return parseGenericPage(cc.$, $article, pageType);
}
