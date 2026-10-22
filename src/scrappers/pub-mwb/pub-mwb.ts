import type { ImageData, VideoData } from '../../data-extraction/media.js';
import {
	logger,
	CONSTANTS,
	cleanText,
	collapseConsecutiveLineBreaks,
	isExternalHttpUrl,
	normalizeWolUrl,
	takeOutTimeBoxText,
} from '../../kernel/index.js';
import * as cheerio from 'cheerio';
import { CheerioAPI } from 'cheerio';
import { ExtractionContextOptions, createExtractionContext } from '../generics.js';
import { parsePubSjj, PubSjjParsedData } from '../../data-extraction/extractors-as-obj.js';
import { opErrored } from '../../kernel/index.js';
import { getCheerioSelectionOrThrow, isVideoAnchor, isWolReferenceHref } from '../../data-extraction/generic.js';
import type { CheerioSelection } from '../../data-extraction/generic.js';
import {
	buildChristianLivingSelections,
	buildFieldMinistrySelections,
	buildGodsTreasuresSelections,
	buildRelevantProgramGroupSelections,
	getAndValidateSongSelections,
} from './program-selection-groups.js';
import {
	fetchAnchorData,
	fetchAndParseAnchorReferenceOrThrow,
	PublicationRefData,
} from '../../data-fetching/reference-json.js';
import {
	BiblicalPassageItem,
	buildAnchorRefExtractionData,
	detectReferenceDataType,
	fetchAnchorReferenceData,
	isJsonContentAcceptableForReferenceExtraction,
} from '../../data-extraction/reference-json-commons.js';
import {
	Citation,
	CitationTextBlock,
	addParsedReferenceToCitationBlock,
	buildCitationMarker,
	createCitationTextBlock,
} from '../../data-extraction/citations.js';

const log = logger.child({ ...logger.bindings(), label: 'pub-mwb-scraper' });

interface SongData {
	songNumber: number;
	songData: PubSjjParsedData;
}

export interface WeeklyBibleReadData {
	bookName: string;
	bookNumber: number;
	firstChapter: number;
	lastChapter: number;
	links: string[];
}

interface ResolvedAnchorReference {
	mnemonic: string;
	parsedReference: PublicationRefData;
}

interface TreasuresTalkDataV2 {
	sectionNumber: number;
	timeBox: number;
	heading: string;
	/** Items follow the WOL DOM order. */
	content: TreasuresTalkContentItem[];
}

type TreasuresTalkContentItem =
	| {
			kind: 'point';
			payload: CitationTextBlock;
	  }
	| {
			kind: 'illustration';
			payload: ImageData;
	  }
	| {
			kind: 'callout';
			payload: CitationTextBlock & { label: string };
	  }
	| {
			kind: 'video';
			payload: VideoData;
	  };

interface PrintedQuestionV2 extends CitationTextBlock {
	question: string;
}

interface SpiritualGemsDataV2 {
	sectionNumber: number;
	timeBox: number;
	headline: string;
	printedQuestionData: PrintedQuestionV2;
	openEndedQuestion: string;
}

interface BibleReadDataV2 {
	sectionNumber: number;
	timeBox: number;
	headline: string;
	contents: CitationTextBlock;
}

type FieldMinistryAssignmentType =
	| 'startingAConversation'
	| 'followingUp'
	| 'makingDisciples'
	| 'explainingYourBeliefs'
	| 'talk'
	| 'whatWouldYouSay';

interface FieldMinistryExternalLink {
	text: string;
	url: string;
}

interface FieldMinistryTextBlock extends CitationTextBlock {
	externalLinks?: FieldMinistryExternalLink[];
}
type FieldMinistryQuestion = FieldMinistryTextBlock;

type FieldMinistryContentItem =
	| {
			kind: 'text';
			payload: FieldMinistryTextBlock;
	  }
	| {
			kind: 'illustration';
			payload: ImageData;
	  }
	| {
			kind: 'questionList';
			payload: { questions: FieldMinistryQuestion[] };
	  };

interface FieldMinistryAssignmentDataV2 {
	sectionNumber: number;
	timeBox: number;
	headline: string;
	type: FieldMinistryAssignmentType;
	content: FieldMinistryContentItem[];
}

interface ChristianLivingSectionDataV2 {
	sectionNumber: number;
	timeBox: number;
	headline: string;
	/**
	 * Linear text for agenda navigation.
	 *
	 * This value matches the former text-only extraction. Use `content` when
	 * presentation needs figures, videos, lists, citations, or link metadata.
	 */
	plainText: string;
	/** Content items in their published DOM order. */
	content: ChristianLivingContentItem[];
}

/** A published content item. The `kind` field defines its payload shape. */
type ChristianLivingContentItem =
	| {
			kind: 'text';
			payload: ChristianLivingTextBlock;
	  }
	| {
			kind: 'illustration';
			payload: ImageData;
	  }
	| {
			kind: 'video';
			payload: VideoData & ChristianLivingTextBlock;
	  }
	| {
			kind: 'list';
			payload: ChristianLivingList;
	  };

interface ChristianLivingLink {
	/** Visible text for an external link. */
	text: string;
	/** External destination URL. */
	url: string;
}

interface ChristianLivingTextBlock extends CitationTextBlock {
	/**
	 * Links outside WOL that do not have reference content to extract.
	 *
	 * Resolved WOL references are available only through `citations`. This
	 * avoids duplicating a citation as both a link and resolved content. Video
	 * URLs remain on their `video` content item.
	 */
	externalLinks: ChristianLivingLink[];
}

interface ChristianLivingList {
	/** Each item is a member of this published list and keeps its nested content. */
	items: Array<{ content: ChristianLivingContentItem[] }>;
}

export interface CongregationBibleStudyData {
	sectionNumber: number;
	timeBox: number;
	headline: string;
	contents: string;
	references: string[];
}

interface FullWeekProgramDataV2 {
	weekDateSpan: string;
	startingSong: SongData;
	weeklyBibleReadData: WeeklyBibleReadData;
	treasuresTalk: TreasuresTalkDataV2;
	spiritualGems: SpiritualGemsDataV2;
	bibleRead: BibleReadDataV2;
	fieldMinistry: FieldMinistryAssignmentDataV2[];
	middleSong: SongData;
	christianLiving: ChristianLivingSectionDataV2[];
	bibleStudy: CongregationBibleStudyData;
	closingSong: SongData;
}

/**
 * Extracts the week date span text from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export function extractWeekDateSpan(input: ExtractionContextOptions): string {
	log.info('Starting to extract week date span');
	const { $ } = createExtractionContext(input);
	const $el = getCheerioSelectionOrThrow($, '#p1');
	const result = $el.text().toLowerCase();
	log.info(`Extracted week date span: [${result}]`);
	return result;
}

/**
 * Extracts the song data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export function extractSongData(input: ExtractionContextOptions): Promise<SongData[]> {
	input.selectionBuilder = ($) => getAndValidateSongSelections($).songs;
	const { $, selection: $songsSelection } = createExtractionContext(input);
	const $songAnchors = $songsSelection.map((_, anchor) => $(anchor).find('a'));
	if ($songAnchors.length !== 3) {
		const msg = `Expected 3 song anchors, found [${$songAnchors.length}]. The document structure may have changed.`;
		log.error(msg);
		throw new Error(msg);
	}

	const promises = $songAnchors
		.map(async function mapAnchorToSongData(_, anchor) {
			const $anchor = $(anchor);
			const text = cleanText($anchor.text());
			const songNumber = text.match(/\d+/);
			if (!songNumber || songNumber.length !== 1) {
				const msg = `Expected song number, found [${text}]. The document structure may have changed.`;
				log.warn(msg);
				return {
					songNumber: -1,
					songData: {
						name: text,
						themeScripture: '',
						content: '',
						closingContent: '',
					},
				};
			}

			const songNumberNumber = parseInt(songNumber[0], 10);

			const opRes = await fetchAnchorData($anchor);
			if (opErrored(opRes)) {
				throw opRes.err;
			}

			const json = opRes.res;
			if (!isJsonContentAcceptableForReferenceExtraction(json)) {
				const msg = `The song data extracted from the tooltip is eligible for reference extraction. The document structure may have changed.`;
				log.error(msg);
				throw new Error(msg);
			}
			const [itemData] = json.items;
			const songData = parsePubSjj(itemData.content);

			return {
				songNumber: songNumberNumber,
				songData,
			};
		})
		.toArray();

	return Promise.all(promises);
}

/**
 * Extracts the bible read data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export async function extractWeeklyBibleRead(input: ExtractionContextOptions): Promise<WeeklyBibleReadData> {
	function extractBookNameFromTooltipCaption(caption: string) {
		const pattern = /^(.*?)(?=\d+:)/;
		const match = caption.match(pattern);

		if (match) {
			return match[1].trim();
		} else {
			return caption;
		}
	}

	log.info('Starting to extract Bible read data');
	const { $ } = createExtractionContext(input);
	const $anchorSelection = getCheerioSelectionOrThrow($, '#p2 a');

	const result: WeeklyBibleReadData = {
		bookName: '',
		bookNumber: 0,
		firstChapter: 0,
		lastChapter: 0,
		links: [],
	};

	let urlPathForLinks = '';
	for (let i = 0; i < $anchorSelection.length; i++) {
		const $anchor = $anchorSelection.eq(i);
		const anchorRefExtractionData = buildAnchorRefExtractionData($anchor);
		log.debug(
			`Processing anchor at index [${i}], anchorRefExtractionData: [${JSON.stringify(anchorRefExtractionData)}]`,
		);

		const opRes = await fetchAnchorReferenceData(anchorRefExtractionData);
		if (opErrored(opRes)) {
			throw opRes.err;
		}

		const json = opRes.res;

		if (!isJsonContentAcceptableForReferenceExtraction(json)) {
			const msg = `JSON content for reference doesn't match the expected format.`;
			log.error(msg);
			throw new Error(msg);
		}
		const [rawFetchedData] = json.items;
		const detectedReferenceDataTypes = detectReferenceDataType(rawFetchedData);
		log.debug(`Detected reference data types: [${JSON.stringify(detectedReferenceDataTypes)}]`);

		if (!detectedReferenceDataTypes.isPubNwtsty) {
			const msg = `Unexpected anchor reference data extracted from anchor element`;
			log.error(msg);
			throw new Error(msg);
		}

		const biblicalRefData = rawFetchedData as BiblicalPassageItem;

		if (urlPathForLinks === '') {
			urlPathForLinks = biblicalRefData.url;
			result.bookNumber = biblicalRefData.book;
			result.bookName = extractBookNameFromTooltipCaption(biblicalRefData.caption);
			result.firstChapter = biblicalRefData.first_chapter;
			result.lastChapter = biblicalRefData.last_chapter;
			log.info(`Initialized result with first data: [${JSON.stringify(result)}]`);
		}

		result.firstChapter = Math.min(result.firstChapter, biblicalRefData.first_chapter);
		result.lastChapter = Math.max(result.lastChapter, biblicalRefData.last_chapter);
		log.debug(`Updated chapters: firstChapter=[${result.firstChapter}], lastChapter=[${result.lastChapter}]`);
	}

	const languageCode = buildAnchorRefExtractionData($anchorSelection.eq(0)).sourceHref.slice(0, 3);
	for (let chapter = result.firstChapter; chapter <= result.lastChapter; chapter++) {
		const urlPathParts = urlPathForLinks.split('/');
		urlPathParts[urlPathParts.length - 1] = String(chapter);
		let joinedUrlPath = urlPathParts.join('/');
		result.links.push(`${CONSTANTS.WOL_URL}${languageCode}${joinedUrlPath}`);
	}

	log.info(`Extracted Bible read data: [${JSON.stringify(result)}]`);
	return result;
}

export interface SectionHeadlineData {
	number: number;
	headline: string;
}

/**
 * Extracts the section number from the given element's text.
 * @param $element The selection from which to extract the section number.
 * @returns The number and the headline of the section.
 * @throws {Error} If the element's text doesn't match the expected format.
 */
function parseSectionHeadlineDataFromElement($element: CheerioSelection): SectionHeadlineData {
	log.info('Extracting section number from element');
	const elementText = cleanText($element.text());
	if (!/^\d+\./.test(elementText)) {
		const msg = `Unexpected section number for element [${elementText}].`;
		log.error(msg);
		throw new Error(msg);
	}
	const numberAsTxt = elementText.split('.')[0];
	const sectionNumber = parseInt(numberAsTxt, 10);
	log.info(`Extracted section number: [${sectionNumber}]`);
	return {
		number: sectionNumber,
		headline: cleanText(elementText.replace(`${numberAsTxt}.`, '')),
	};
}

/**
 * Finds and extracts the time box number from the given selection.
 * @param $selection The selection from which to extract the time box number.
 * @returns The time box number.
 * @throws {Error} If time box is not found.
 */
function getTimeBoxFromElement($selection: CheerioSelection): number {
	log.info('Extracting time box from element');
	const msg = `No selection found for element with time box information.`;
	let $lineWithTimeBox = cheerio.load($selection.toString())(CONSTANTS.PUB_MWB_CSS_SELECTOR_LINE_WITH_TIME_BOX);
	if (!$lineWithTimeBox.length) {
		if ($selection.parent().is(CONSTANTS.PUB_MWB_CSS_SELECTOR_BLEED_EDGE_GROUPS)) {
			// bleed edge scenarios
			$lineWithTimeBox = $selection.find(`> *:first-child > p`);
		}
	}

	if ($lineWithTimeBox.length !== 1) {
		log.error(msg);
		throw new Error(msg);
	}

	const timeMatch = cleanText($lineWithTimeBox.text()).match(/\((\d+)\s*\S*?\.\)/);
	if (timeMatch) {
		const timeBox = parseInt(timeMatch[1], 10);
		log.info(`Extracted time box: [${timeBox}] minutes`);
		return timeBox;
	}

	log.error(msg);
	throw new Error(msg);
}

async function buildRequiredCitationBlockFromAnchors(
	anchors: CheerioSelection,
	seedText: string,
	textWithCitations = seedText,
): Promise<CitationTextBlock> {
	let block = createCitationTextBlock(seedText, textWithCitations);
	const resolvedReferences = await resolveAnchorReferencesInOrder(anchors);

	for (const { mnemonic, parsedReference } of resolvedReferences) {
		block = addParsedReferenceToCitationBlock(block, mnemonic, parsedReference);
	}

	return block;
}

async function resolveAnchorReferencesInOrder(anchors: CheerioSelection): Promise<ResolvedAnchorReference[]> {
	const referencePromises: Promise<ResolvedAnchorReference>[] = [];

	for (let i = 0; i < anchors.length; i++) {
		const $anchor = anchors.eq(i);
		const mnemonic = cleanText($anchor.text());

		referencePromises.push(
			(async () => {
				const opRes = await fetchAndParseAnchorReferenceOrThrow($anchor);
				if (opRes.err) {
					throw opRes.err;
				}

				return {
					mnemonic,
					parsedReference: opRes.res,
				};
			})(),
		);
	}

	return Promise.all(referencePromises);
}

function buildTextWithCitationMarkers(
	selection: CheerioSelection,
	selectAnchors: (selection: CheerioSelection) => CheerioSelection,
	textFormatter: (text: string) => string = (text) => text,
): string {
	const textWithCitationsSelection = selection.clone();
	const anchors = selectAnchors(textWithCitationsSelection);
	for (let i = 0; i < anchors.length; i++) {
		anchors.eq(i).replaceWith(buildCitationMarker(i + 1));
	}

	return textFormatter(cleanText(textWithCitationsSelection.text()));
}

function buildDirectChildSelection($selection: CheerioSelection, selector = '> *') {
	if (selector === '> *') {
		return $selection.children();
	}

	return $selection.children(selector.replace(/^>\s*/, ''));
}

function extractIllustrationData($figureContainer: CheerioSelection): ImageData | null {
	const $image = $figureContainer.find('img').first();
	if (!$image.length) {
		return null;
	}

	const caption = cleanText($figureContainer.find('figcaption').text());

	return {
		src: normalizeWolUrl($image.attr('src')) ?? '',
		alt: cleanText($image.attr('alt') ?? ''),
		...(caption ? { caption } : {}),
	};
}

function extractSpecialItemBase($specialParagraph: CheerioSelection): { label: string; text: string } {
	const label = cleanText($specialParagraph.find('strong').first().text()).replace(/:$/, '');
	return {
		label,
		text: cleanText($specialParagraph.text()),
	};
}

function extractVideoMediaItem($paragraph: CheerioSelection): VideoData | null {
	const $videoAnchor = $paragraph.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_VIDEO_ANCHORS).first();
	if (!$videoAnchor.length) {
		return null;
	}

	const text = cleanText($paragraph.text());
	const label = cleanText($videoAnchor.text());
	const cloned = $paragraph.clone();
	cloned.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_VIDEO_ANCHORS).remove();

	return {
		text,
		label,
		title: cleanText(cloned.text()).replace(/^[\[\]\s.]+|[\[\]\s.]+$/g, ''),
		url: $videoAnchor.attr('href') ?? '',
	};
}

function extractVideoCitationDataFromAnchor($videoAnchor: CheerioSelection) {
	const label = cleanText($videoAnchor.text());
	const title = cleanText($videoAnchor.nextAll('em').first().text()) || label;

	return {
		mnemonic: label,
		citation: {
			referenceType: 'video',
			itemTitle: title,
			contents: title,
			url: $videoAnchor.attr('href') ?? '',
		} satisfies Omit<Citation, 'id' | 'marker' | 'mnemonic'>,
	};
}

function isSpecialItemParagraph($paragraph: CheerioSelection): boolean {
	if (!$paragraph.is('p')) {
		return false;
	}

	const $previous = $paragraph.prev();
	if ($previous.is('hr')) {
		return true;
	}

	return $paragraph.find('span > strong').length > 0;
}

function isVideoPromptParagraph($paragraph: CheerioSelection): boolean {
	return $paragraph.is('p') && $paragraph.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_VIDEO_ANCHORS).length > 0;
}

async function buildSpecialItemCitationBlock($paragraph: CheerioSelection) {
	const text = cleanText($paragraph.text());
	const selectAnchors = (selection: CheerioSelection) => selection.find('a');
	const $anchors = selectAnchors($paragraph);
	const textWithCitations = buildTextWithCitationMarkers($paragraph, selectAnchors);
	const base = extractSpecialItemBase($paragraph);
	let citationBlock = createCitationTextBlock(text, textWithCitations);
	const citationTasks: Promise<{ mnemonic: string; citation: Omit<Citation, 'id' | 'marker' | 'mnemonic'> }>[] = [];

	for (let i = 0; i < $anchors.length; i++) {
		const $anchor = $anchors.eq(i);
		if (isVideoAnchor($anchor)) {
			citationTasks.push(Promise.resolve(extractVideoCitationDataFromAnchor($anchor)));
			continue;
		}

		const mnemonic = cleanText($anchor.text());
		citationTasks.push(
			(async () => {
				const opRes = await fetchAndParseAnchorReferenceOrThrow($anchor);
				if (opRes.err) {
					throw opRes.err;
				}

				return {
					mnemonic,
					citation: {
						referenceType: opRes.res.referenceType || 'unknown',
						...(opRes.res.source || opRes.res.publicationTitle
							? { issueName: opRes.res.source || opRes.res.publicationTitle }
							: {}),
						itemTitle: opRes.res.title || opRes.res.itemTitle || '',
						contents: opRes.res.parsedContent,
					} satisfies Omit<Citation, 'id' | 'marker' | 'mnemonic'>,
				};
			})(),
		);
	}

	const resolvedCitations = await Promise.all(citationTasks);
	for (const { mnemonic, citation } of resolvedCitations) {
		const id = citationBlock.citations.length + 1;
		citationBlock = {
			text: citationBlock.text,
			textWithCitations: citationBlock.textWithCitations,
			citations: [
				...citationBlock.citations,
				{
					id,
					marker: buildCitationMarker(id),
					mnemonic,
					...citation,
				},
			],
		};
	}

	return {
		...base,
		...citationBlock,
	};
}

async function buildTreasuresTalkV2ContentItem($blockChild: CheerioSelection): Promise<TreasuresTalkContentItem> {
	if (isSpecialItemParagraph($blockChild)) {
		return {
			kind: 'callout',
			payload: await buildSpecialItemCitationBlock($blockChild),
		};
	}

	if (isVideoPromptParagraph($blockChild)) {
		const video = extractVideoMediaItem($blockChild);
		if (!video) {
			const msg = `Expected video metadata for treasures talk video prompt. The document structure may have changed.`;
			log.error(msg);
			throw new Error(msg);
		}

		return {
			kind: 'video',
			payload: video,
		};
	}

	const pointText = cleanText($blockChild.text());
	const selectReferences = (selection: CheerioSelection) =>
		selection.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_NON_VIDEO_ANCHORS);
	const $references = selectReferences($blockChild);
	const textWithCitations = buildTextWithCitationMarkers($blockChild, selectReferences);

	return {
		kind: 'point',
		payload: await buildRequiredCitationBlockFromAnchors($references, pointText, textWithCitations),
	};
}

async function extractTreasuresTalkV2ContentItemsFromContainer(
	$container: CheerioSelection,
): Promise<TreasuresTalkContentItem[]> {
	const $blockChildren = buildDirectChildSelection($container);
	const blockItemPromises: Promise<TreasuresTalkContentItem>[] = [];

	for (let i = 0; i < $blockChildren.length; i++) {
		const $blockChild = $blockChildren.eq(i);
		if (!$blockChild.is('p')) {
			continue;
		}

		blockItemPromises.push(buildTreasuresTalkV2ContentItem($blockChild));
	}

	return Promise.all(blockItemPromises);
}

export async function extractTreasuresTalkV2(input: ExtractionContextOptions): Promise<TreasuresTalkDataV2> {
	log.info('Extracting v2 treasures talk data');

	input.selectionBuilder = ($) => buildGodsTreasuresSelections($).treasuresTalk;
	const { selection: $treasuresTalkSelection } = createExtractionContext(input);
	const headlineData = parseSectionHeadlineDataFromElement(
		$treasuresTalkSelection.find(CONSTANTS.PUB_MWB_CSS_SELECTOR_LINE_WITH_SECTION_NUMBER),
	);

	const result: TreasuresTalkDataV2 = {
		sectionNumber: headlineData.number,
		timeBox: getTimeBoxFromElement($treasuresTalkSelection),
		heading: headlineData.headline,
		content: [],
	};

	const $children = buildDirectChildSelection($treasuresTalkSelection);
	const contentGroupPromises: Promise<TreasuresTalkContentItem[]>[] = [];

	for (let i = 0; i < $children.length; i++) {
		const $child = $children.eq(i);

		if ($child.attr('id')?.startsWith('f')) {
			const illustration = extractIllustrationData($child);
			contentGroupPromises.push(
				Promise.resolve(
					illustration
						? [
								{
									kind: 'illustration' as const,
									payload: illustration,
								},
							]
						: [],
				),
			);
			continue;
		}

		if (!$child.is('div')) {
			continue;
		}

		contentGroupPromises.push(extractTreasuresTalkV2ContentItemsFromContainer($child));
	}

	const contentGroups = await Promise.all(contentGroupPromises);
	result.content = contentGroups.flat();

	log.info(`Extracted v2 ten-minute talk data`);
	return result;
}

/**
 * Extracts the spiritual gem question from a given paragraph element.
 *
 * If the paragraph element contains exactly two anchor (<a>) tags,
 * the text content between them is extracted, excluding the first
 * and last two characters.
 *
 * Otherwise, the function attempts to match and extract the text
 * that appears after a period and before an opening parenthesis.
 *
 * @param $pElem - The Cheerio element containing the paragraph with the spiritual gem question.
 * @returns The extracted spiritual gem question as a string.
 */
function extractSpiritualGemQuestion($pElem: CheerioSelection): string {
	if ($pElem.filter('a').length === 2) {
		return $pElem
			.contents()
			.filter(function () {
				return this.nodeType === 3; /* TEXT_NODE */
			})
			.eq(0)
			.text()
			.slice(2, -2);
	}
	const pFullText = cleanText($pElem.text());
	return (pFullText.match(/(?<=\. ).*?(?= \()/g) ?? [''])[0];
}

export async function extractSpiritualGemsV2(input: ExtractionContextOptions): Promise<SpiritualGemsDataV2> {
	log.info('Extracting v2 spiritual gems data');

	input.selectionBuilder = ($) => buildGodsTreasuresSelections($).spiritualGems;
	const { selection: $spiritualGemsSelection } = createExtractionContext(input);
	const $content = $spiritualGemsSelection.eq(1);

	const $scriptureAnchorSelection = $content.find(`a.b:first-child`);
	if ($scriptureAnchorSelection.length !== 1) {
		const msg = `Unexpected number of elements for scripture anchor.`;
		log.error(msg);
		throw new Error(msg);
	}

	const $pElement = $scriptureAnchorSelection.parent();
	const question = extractSpiritualGemQuestion($pElement);
	const selectReferences = (selection: CheerioSelection) => selection.find('a');
	const printedQuestionBlock = await buildRequiredCitationBlockFromAnchors(
		selectReferences($pElement),
		cleanText($pElement.text()),
		buildTextWithCitationMarkers($pElement, selectReferences),
	);
	const headlineData = parseSectionHeadlineDataFromElement($spiritualGemsSelection.eq(0));

	const result: SpiritualGemsDataV2 = {
		sectionNumber: headlineData.number,
		timeBox: getTimeBoxFromElement($content),
		headline: headlineData.headline,
		printedQuestionData: {
			...printedQuestionBlock,
			question,
		},
		openEndedQuestion: cleanText($content.find(`li.du-margin-top--8 p`).text()),
	};

	log.info(`Extracted v2 spiritual gems data`);
	return result;
}

export async function extractBibleReadV2(input: ExtractionContextOptions): Promise<BibleReadDataV2> {
	log.info('Extracting v2 Bible reading data');

	input.selectionBuilder = ($) => buildGodsTreasuresSelections($).bibleRead;
	const { selection: $bibleReadSelection } = createExtractionContext(input);
	const $content = $bibleReadSelection.eq(1);
	const headlineData = parseSectionHeadlineDataFromElement($bibleReadSelection.eq(0));
	const $anchorSelection = $content.find(`a`);
	if ($anchorSelection.length !== 2) {
		const msg = `Unexpected number of elements for bible reading anchor.`;
		log.error(msg);
		throw new Error(msg);
	}

	const contents = await buildRequiredCitationBlockFromAnchors(
		$anchorSelection,
		cleanText(takeOutTimeBoxText($content.text())),
		buildTextWithCitationMarkers(
			$content,
			(selection) => selection.find('a'),
			(text) => takeOutTimeBoxText(text),
		),
	);

	const result: BibleReadDataV2 = {
		sectionNumber: headlineData.number,
		timeBox: getTimeBoxFromElement($content),
		headline: headlineData.headline,
		contents,
	};

	log.info(`Extracted v2 Bible reading data`);
	return result;
}

interface HeadlineContentGroup {
	heading: CheerioSelection;
	contents: CheerioSelection[];
}

function buildHeadlineToContentGroups(contentSelection: CheerioSelection, $: CheerioAPI): HeadlineContentGroup[] {
	return contentSelection.toArray().reduce((acc, el) => {
		const $el = $(el);

		if ($el.is('h3')) {
			acc.push({
				heading: $el,
				contents: [],
			});
		} else if ($el.is(CONSTANTS.PUB_MWB_CSS_SELECTOR_BLEED_EDGE_GROUPS)) {
			acc.push(
				...buildHeadlineToContentGroups(
					$el.find(`> *:not(${CONSTANTS.PUB_MWB_CSS_SELECTOR_BLEED_EDGE_GROUPS})`),
					$,
				),
			);
		} else {
			acc.at(-1)?.contents.push($el);
		}

		return acc;
	}, [] as HeadlineContentGroup[]);
}

function makeFieldMinistryError(context: string, message: string, cause?: unknown): Error {
	const fullMessage = `${context}: ${message}`;
	log.error(fullMessage);
	return cause === undefined ? new Error(fullMessage) : new Error(fullMessage, { cause });
}

function normalizeFieldMinistryHeadline(headline: string): string {
	return cleanText(headline)
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[¿?¡!]/g, '')
		.toLowerCase();
}

function detectFieldMinistryAssignmentType(headline: string, context: string): FieldMinistryAssignmentType {
	const normalizedHeadline = normalizeFieldMinistryHeadline(headline);
	const knownTypes: Record<string, FieldMinistryAssignmentType> = {
		'empiece conversaciones': 'startingAConversation',
		'empecemos conversaciones': 'startingAConversation',
		'starting a conversation': 'startingAConversation',
		'start conversations': 'startingAConversation',
		'haga revisitas': 'followingUp',
		'hagamos revisitas': 'followingUp',
		'following up': 'followingUp',
		'return visit': 'followingUp',
		'haga discipulos': 'makingDisciples',
		'hagamos discipulos': 'makingDisciples',
		'making disciples': 'makingDisciples',
		'make disciples': 'makingDisciples',
		'explique sus creencias': 'explainingYourBeliefs',
		'expliquemos nuestras creencias': 'explainingYourBeliefs',
		'explaining your beliefs': 'explainingYourBeliefs',
		'explain your beliefs': 'explainingYourBeliefs',
		'que diria': 'whatWouldYouSay',
		'que dirias': 'whatWouldYouSay',
		'what would you say': 'whatWouldYouSay',
		talk: 'talk',
		discurso: 'talk',
	};
	const type = knownTypes[normalizedHeadline];
	if (!type) {
		throw makeFieldMinistryError(context, `Unsupported field ministry assignment type for headline "${headline}".`);
	}
	return type;
}

function getFieldMinistryContext(heading: CheerioSelection): string {
	const rawHeading = cleanText(heading.text());
	const match = rawHeading.match(/^(\d+)\./);
	const headline = match ? cleanText(rawHeading.slice(match[0].length)) : rawHeading;
	return match
		? `Field ministry section ${match[1]} headline "${headline}"`
		: `Field ministry heading "${rawHeading}"`;
}

function getFieldMinistryExternalLinks($: CheerioAPI, $element: CheerioSelection): FieldMinistryExternalLink[] {
	return $element
		.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_NON_VIDEO_ANCHORS)
		.map((_, anchor) => {
			const $anchor = $(anchor);
			const href = $anchor.attr('href') ?? '';
			if (!href || isWolReferenceHref(href)) return null;

			return {
				text: cleanText($anchor.text()),
				url: href,
			};
		})
		.get()
		.filter((link): link is FieldMinistryExternalLink => link !== null);
}

function selectFieldMinistryReferenceAnchors($: CheerioAPI, $element: CheerioSelection): CheerioSelection {
	return $element.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_NON_VIDEO_ANCHORS).filter((_, anchor) => {
		const href = $(anchor).attr('href') ?? '';
		return isWolReferenceHref(href);
	});
}

function removeFieldMinistryTimeBoxPrefix(text: string): string {
	return cleanText(text.replace(/^\(\s*\d+\s*[^)]*\)\s*/, ''));
}

async function buildFieldMinistryCitationTextBlock(
	$: CheerioAPI,
	paragraphs: CheerioSelection[],
	context: string,
): Promise<FieldMinistryTextBlock> {
	const textParts: string[] = [];
	const textWithCitationParts: string[] = [];
	const paragraphAnchors: CheerioSelection[] = [];
	let nextCitationId = 1;

	for (const $paragraph of paragraphs) {
		const $paragraphWithMarkers = $paragraph.clone();
		const $references = selectFieldMinistryReferenceAnchors($, $paragraph);
		const $referencesWithMarkers = selectFieldMinistryReferenceAnchors($, $paragraphWithMarkers);
		if ($references.length !== $referencesWithMarkers.length) {
			throw makeFieldMinistryError(context, 'Unable to preserve WOL references while reading a text block.');
		}

		for (let i = 0; i < $referencesWithMarkers.length; i++) {
			$referencesWithMarkers.eq(i).replaceWith(buildCitationMarker(nextCitationId));
			nextCitationId++;
		}

		const isTimeBoxLine =
			$paragraph.is(CONSTANTS.PUB_MWB_CSS_SELECTOR_LINE_WITH_TIME_BOX) ||
			$paragraph.parents(CONSTANTS.PUB_MWB_CSS_SELECTOR_LINE_WITH_TIME_BOX).length > 0;
		const text = cleanText($paragraph.text());
		const textWithCitations = cleanText($paragraphWithMarkers.text());
		textParts.push(isTimeBoxLine ? removeFieldMinistryTimeBoxPrefix(text) : text);
		textWithCitationParts.push(
			isTimeBoxLine ? removeFieldMinistryTimeBoxPrefix(textWithCitations) : textWithCitations,
		);
		paragraphAnchors.push($references);
	}

	let block: FieldMinistryTextBlock = createCitationTextBlock(
		textParts.filter(Boolean).join('\n'),
		textWithCitationParts.filter(Boolean).join('\n'),
	);
	for (const $anchors of paragraphAnchors) {
		try {
			const resolvedReferences = await resolveAnchorReferencesInOrder($anchors);
			for (const { mnemonic, parsedReference } of resolvedReferences) {
				block = addParsedReferenceToCitationBlock(block, mnemonic, parsedReference);
			}
		} catch (error) {
			throw makeFieldMinistryError(context, 'Unable to resolve a WOL citation in the assignment text.', error);
		}
	}
	const externalLinks = paragraphs.flatMap(($paragraph) => getFieldMinistryExternalLinks($, $paragraph));
	if (externalLinks.length > 0) {
		block = { ...block, externalLinks };
	}

	return block;
}

async function extractFieldMinistryQuestion(
	$: CheerioAPI,
	$listItem: CheerioSelection,
	context: string,
): Promise<FieldMinistryQuestion> {
	const $children = $listItem.children();
	const $paragraphs = $children.filter('p');
	const $unexpectedChildren = $children.not('p, .gen-field');
	if ($paragraphs.length !== 1 || $unexpectedChildren.length > 0) {
		throw makeFieldMinistryError(
			context,
			`Expected each question list item to contain one paragraph and no unsupported siblings; found ${$paragraphs.length} paragraphs.`,
		);
	}

	return buildFieldMinistryCitationTextBlock($, [$paragraphs.first()], context);
}

async function extractFieldMinistryQuestionList(
	$: CheerioAPI,
	$list: CheerioSelection,
	context: string,
): Promise<FieldMinistryContentItem> {
	const $items = $list.children('li');
	if ($items.length === 0 || $items.length !== $list.children().length) {
		throw makeFieldMinistryError(context, 'Expected a non-empty list containing only direct list items.');
	}

	const questions = await Promise.all(
		$items.toArray().map(($item) => extractFieldMinistryQuestion($, $($item), context)),
	);
	return {
		kind: 'questionList',
		payload: { questions },
	};
}

async function extractFieldMinistryContentItems(
	$: CheerioAPI,
	contentElements: CheerioSelection[],
	context: string,
): Promise<FieldMinistryContentItem[]> {
	const content: FieldMinistryContentItem[] = [];
	let pendingTextParagraphs: CheerioSelection[] = [];

	const flushText = async () => {
		if (pendingTextParagraphs.length === 0) return;
		const payload = await buildFieldMinistryCitationTextBlock($, pendingTextParagraphs, context);
		pendingTextParagraphs = [];
		if (payload.text) content.push({ kind: 'text', payload });
	};

	const visit = async ($element: CheerioSelection): Promise<void> => {
		const unsupportedElementSelector = 'table, video, audio, iframe, object, embed';
		const $unsupportedElement = $element.is(unsupportedElementSelector)
			? $element
			: $element.find(unsupportedElementSelector).first();
		if ($unsupportedElement.length > 0) {
			const unsupportedName =
				($unsupportedElement[0] as { tagName?: string }).tagName?.toLowerCase() ?? 'element';
			throw makeFieldMinistryError(
				context,
				`Unsupported <${unsupportedName}> element in field ministry content.`,
			);
		}

		if ($element.is('figure')) {
			await flushText();
			if ($element.find('img').length !== 1) {
				throw makeFieldMinistryError(context, 'Expected each field ministry figure to contain one image.');
			}
			if (selectFieldMinistryReferenceAnchors($, $element).length > 0) {
				throw makeFieldMinistryError(context, 'WOL references in illustration captions are not supported.');
			}
			const illustration = extractIllustrationData($element);
			if (!illustration) {
				throw makeFieldMinistryError(context, 'Unable to extract the field ministry illustration.');
			}
			content.push({ kind: 'illustration', payload: illustration });
			return;
		}

		if ($element.is('ul')) {
			await flushText();
			content.push(await extractFieldMinistryQuestionList($, $element, context));
			return;
		}

		if ($element.is('ol')) {
			throw makeFieldMinistryError(
				context,
				'Ordered lists are not part of the supported field ministry stencil.',
			);
		}

		if ($element.is('p, blockquote')) {
			if ($element.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_VIDEO_ANCHORS).length > 0) {
				throw makeFieldMinistryError(
					context,
					'Video links are not part of the supported field ministry content contract.',
				);
			}
			pendingTextParagraphs.push($element);
			return;
		}

		const node = $element[0];
		const elementName = node && 'tagName' in node ? node.tagName : 'element';
		if ($element.is('.gen-field, label, textarea, img')) {
			throw makeFieldMinistryError(
				context,
				`Unexpected ${elementName} outside its expected field ministry structure.`,
			);
		}

		if ($element.is('hr, script, style')) return;

		const hasDirectText = $element
			.contents()
			.toArray()
			.some((node) => {
				return node.type === 'text' && cleanText((node as { data?: string }).data).length > 0;
			});
		if (hasDirectText) {
			throw makeFieldMinistryError(
				context,
				`Unexpected direct text in <${elementName}>; expected paragraphs, figures, or question lists.`,
			);
		}

		const children = $element.children().toArray();
		for (const child of children) {
			await visit($(child));
		}
	};

	for (const $element of contentElements) {
		await visit($element);
	}
	await flushText();
	return content;
}

function getFieldMinistryTimeBox($: CheerioAPI, contentElements: CheerioSelection[], context: string): number {
	const timeBoxSelections: CheerioSelection[] = [];
	for (const $element of contentElements) {
		if ($element.is(CONSTANTS.PUB_MWB_CSS_SELECTOR_LINE_WITH_TIME_BOX)) {
			timeBoxSelections.push($element);
		}
		$element.find(CONSTANTS.PUB_MWB_CSS_SELECTOR_LINE_WITH_TIME_BOX).each((_, element) => {
			timeBoxSelections.push($(element));
		});
	}

	if (timeBoxSelections.length !== 1) {
		throw makeFieldMinistryError(context, `Expected one time box element, found ${timeBoxSelections.length}.`);
	}

	try {
		return getTimeBoxFromElement(timeBoxSelections[0]);
	} catch (error) {
		throw makeFieldMinistryError(context, 'Unable to read the assignment time box.', error);
	}
}

export async function extractFieldMinistryV2(
	input: ExtractionContextOptions,
): Promise<FieldMinistryAssignmentDataV2[]> {
	log.info('Extracting v2 field ministry data');
	input.selectionBuilder = ($) => buildFieldMinistrySelections($).fieldMinistry;
	let $: CheerioAPI;
	let $fieldMinistrySelection: CheerioSelection;
	try {
		({ $, selection: $fieldMinistrySelection } = createExtractionContext(input));
	} catch (error) {
		throw makeFieldMinistryError(
			'Field ministry stencil between .dc-icon--wheat and .dc-icon--sheep',
			'Unable to select the assignment section.',
			error,
		);
	}
	const assignmentGroups = buildHeadlineToContentGroups($fieldMinistrySelection, $);
	if (assignmentGroups.length === 0) {
		throw makeFieldMinistryError(
			'Field ministry stencil between .dc-icon--wheat and .dc-icon--sheep',
			'No assignment h3 headings were found.',
		);
	}

	const results: FieldMinistryAssignmentDataV2[] = [];
	for (const { heading, contents } of assignmentGroups) {
		const context = getFieldMinistryContext(heading);
		let headlineData: SectionHeadlineData;
		try {
			headlineData = parseSectionHeadlineDataFromElement(heading);
		} catch (error) {
			throw makeFieldMinistryError(context, 'Unable to parse the assignment heading.', error);
		}
		if (contents.length === 0) {
			throw makeFieldMinistryError(context, 'The assignment has no content siblings before the next h3.');
		}

		const type = detectFieldMinistryAssignmentType(headlineData.headline, context);
		const timeBox = getFieldMinistryTimeBox($, contents, context);
		const content = await extractFieldMinistryContentItems($, contents, context);
		if (!content.some((item) => item.kind === 'text')) {
			throw makeFieldMinistryError(context, 'Expected at least one text content item.');
		}
		if (type === 'whatWouldYouSay' && !content.some((item) => item.kind === 'questionList')) {
			throw makeFieldMinistryError(context, 'Expected a question list for a "What would you say?" assignment.');
		}

		results.push({
			sectionNumber: headlineData.number,
			timeBox,
			headline: headlineData.headline,
			type,
			content,
		});
	}

	return results;
}

/**
 * Extracts the Christian Living section data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
function extractChristianLivingPlainText(contents: CheerioSelection[]): string {
	const text = contents.map(($content) => collapseConsecutiveLineBreaks(cleanText($content.text()))).join('\n');
	return takeOutTimeBoxText(text);
}

function isChristianLivingReferenceAnchor($anchor: CheerioSelection): boolean {
	const href = $anchor.attr('href') ?? '';
	return href.startsWith('/') && href.includes('/wol/');
}

function getChristianLivingExternalLinks($: CheerioAPI, $element: CheerioSelection): ChristianLivingLink[] {
	return $element
		.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_NON_VIDEO_ANCHORS)
		.map((_, anchor) => {
			const $anchor = $(anchor);
			const href = $anchor.attr('href');
			if (!isExternalHttpUrl(href)) {
				return null;
			}

			return {
				text: cleanText($anchor.text()),
				url: href,
			};
		})
		.get()
		.filter((link): link is ChristianLivingLink => link !== null);
}

function selectChristianLivingReferenceAnchors($: CheerioAPI, $element: CheerioSelection): CheerioSelection {
	return $element
		.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_NON_VIDEO_ANCHORS)
		.filter((_, anchor) => isChristianLivingReferenceAnchor($(anchor)));
}

async function buildChristianLivingTextBlock(
	$: CheerioAPI,
	$paragraph: CheerioSelection,
): Promise<ChristianLivingTextBlock> {
	const $references = selectChristianLivingReferenceAnchors($, $paragraph);
	const text = cleanText($paragraph.text());
	const citationBlock = await buildRequiredCitationBlockFromAnchors(
		$references,
		text,
		buildTextWithCitationMarkers($paragraph, (selection) => selectChristianLivingReferenceAnchors($, selection)),
	);

	return {
		...citationBlock,
		externalLinks: getChristianLivingExternalLinks($, $paragraph),
	};
}

async function extractChristianLivingContentItem(
	$: CheerioAPI,
	$element: CheerioSelection,
): Promise<ChristianLivingContentItem[]> {
	if ($element.is('figure')) {
		const illustration = extractIllustrationData($element);
		return illustration ? [{ kind: 'illustration', payload: illustration }] : [];
	}

	if ($element.is('p, blockquote')) {
		if ($element.parents(CONSTANTS.PUB_MWB_CSS_SELECTOR_LINE_WITH_TIME_BOX).length) {
			return [];
		}

		const textBlock = await buildChristianLivingTextBlock($, $element);
		if ($element.find(CONSTANTS.GENERAL_CSS_SELECTOR_FOR_VIDEO_ANCHORS).length) {
			const video = extractVideoMediaItem($element);
			if (!video) {
				const msg =
					'Expected video metadata for Christian Living content. The document structure may have changed.';
				log.error(msg);
				throw new Error(msg);
			}

			return [{ kind: 'video', payload: { ...video, ...textBlock } }];
		}

		return [{ kind: 'text', payload: textBlock }];
	}

	if ($element.is('ul, ol')) {
		const items = await Promise.all(
			$element
				.children('li')
				.toArray()
				.map(async (item) => ({ content: await extractChristianLivingContentItems($, $(item)) })),
		);

		return [
			{
				kind: 'list',
				payload: {
					items,
				},
			},
		];
	}

	if ($element.is('hr, textarea, label, script, style')) {
		return [];
	}

	return extractChristianLivingContentItems($, $element);
}

async function extractChristianLivingContentItems(
	$: CheerioAPI,
	$container: CheerioSelection,
): Promise<ChristianLivingContentItem[]> {
	const contentGroups = await Promise.all(
		$container
			.children()
			.toArray()
			.map((child) => extractChristianLivingContentItem($, $(child))),
	);
	return contentGroups.flat();
}

export async function extractChristianLivingV2(
	input: ExtractionContextOptions,
): Promise<ChristianLivingSectionDataV2[]> {
	log.info('Extracting v2 Christian Living section data');
	input.selectionBuilder = ($) => buildChristianLivingSelections($).christianLiving;
	const { $, selection: $christianLivingSelection } = createExtractionContext(input);
	const sectionGroups = buildHeadlineToContentGroups($christianLivingSelection, $);

	return Promise.all(
		sectionGroups.map(async ({ heading, contents }) => {
			const headlineData = parseSectionHeadlineDataFromElement(heading);
			const contentGroups = await Promise.all(
				contents.map(($content) => extractChristianLivingContentItem($, $content)),
			);
			const result: ChristianLivingSectionDataV2 = {
				sectionNumber: headlineData.number,
				timeBox: getTimeBoxFromElement(contents[0]),
				headline: headlineData.headline,
				plainText: extractChristianLivingPlainText(contents),
				content: contentGroups.flat(),
			};
			log.info('Extracted v2 Christian Living section');
			return result;
		}),
	);
}

/**
 * Extracts the Congregation Bible study data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export function extractBibleStudy(input: ExtractionContextOptions): CongregationBibleStudyData {
	log.info('Extracting Bible study section data');
	input.selectionBuilder = ($) => buildChristianLivingSelections($).bibleStudy;
	const { $, selection: $bibleStudySelection } = createExtractionContext(input);
	const headlineData = parseSectionHeadlineDataFromElement($bibleStudySelection.eq(0));

	const result: CongregationBibleStudyData = {
		sectionNumber: headlineData.number,
		timeBox: getTimeBoxFromElement($bibleStudySelection),
		headline: headlineData.headline,
		contents: cleanText(takeOutTimeBoxText($bibleStudySelection.eq(1).text())),
		references: $bibleStudySelection
			.eq(1)
			.find('a')
			.map((_, el) => {
				const $el = $(el);
				return `${CONSTANTS.WOL_URL}${$el.attr('href')}`;
			})
			.get(),
	};

	log.info(`Extracted Bible study data`);
	return result;
}

export async function extractFullWeekProgramV2(input: ExtractionContextOptions): Promise<FullWeekProgramDataV2> {
	log.info('Starting v2 full week program extraction');
	const inputObj = createExtractionContext(input);
	const { $ } = inputObj;
	const programGroups = buildRelevantProgramGroupSelections($);

	const weekDateSpan = extractWeekDateSpan(inputObj);
	const christianLiving = await extractChristianLivingV2({ $, selection: programGroups.christianLiving });
	const bibleStudy = extractBibleStudy({ $, selection: programGroups.bibleStudy });

	const [
		[startingSong, middleSong, closingSong],
		weeklyBibleReadData,
		treasuresTalk,
		spiritualGems,
		bibleRead,
		fieldMinistry,
	] = await Promise.all([
		extractSongData({ $, selection: programGroups.songs }),
		extractWeeklyBibleRead({ $, selection: programGroups.bibleRead }),
		extractTreasuresTalkV2({ $, selection: programGroups.treasuresTalk }),
		extractSpiritualGemsV2({ $, selection: programGroups.spiritualGems }),
		extractBibleReadV2({ $, selection: programGroups.bibleRead }),
		extractFieldMinistryV2({ $, selection: programGroups.fieldMinistry }),
	]);

	const result: FullWeekProgramDataV2 = {
		weekDateSpan,
		startingSong: startingSong,
		weeklyBibleReadData,
		treasuresTalk,
		spiritualGems,
		bibleRead,
		fieldMinistry,
		middleSong: middleSong,
		christianLiving,
		bibleStudy,
		closingSong: closingSong,
	};

	log.info('Successfully extracted v2 full week program');
	return result;
}
