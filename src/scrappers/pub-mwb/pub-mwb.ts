import {
	logger,
	CONSTANTS,
	cleanText,
	collapseConsecutiveLineBreaks,
	normalizeWolUrl,
	takeOutTimeBoxText,
} from '../../kernel/index.js';
import * as cheerio from 'cheerio';
import { CheerioAPI } from 'cheerio';
import { ExtractionContextOptions, createExtractionContext } from '../generics.js';
import { parsePubSjj, PubSjjParsedData } from '../../data-extraction/extractors-as-obj.js';
import { opErrored } from '../../kernel/index.js';
import { getCheerioSelectionOrThrow } from '../../data-extraction/generic.js';
import {
	buildChristianLivingSelections,
	buildFieldMinistrySelections,
	buildGodsTreasuresSelections,
	buildRelevantProgramGroupSelections,
	getAndValidateSongSelections,
} from './program-selection-groups.js';
import { fetchAnchorData, fetchAndParseAnchorReferenceOrThrow } from '../../data-fetching/reference-json.js';
import {
	BiblicalPassageItem,
	buildAnchorRefExtractionData,
	detectReferenceDataType,
	fetchAnchorReferenceData,
	isJsonContentAcceptableForReferenceExtraction,
	PublicationRefDetectionData,
} from '../../data-extraction/reference-json-commons.js';
import {
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

interface TalkPoint {
	text: string;
	originalContent: string;
	footnotes: number[];
}

interface TreasuresTalkIllustration {
	src: string;
	alt: string;
	caption?: string;
}

interface TreasuresTalkSpecialItem {
	label: string;
	text: string;
	footnotes?: number[];
}

interface TreasuresTalkMediaItem {
	text: string;
	label: string;
	title: string;
	url: string;
}

interface CitationData extends PublicationRefDetectionData {
	mnemonic: string;
	footnoteNumber: number;
}

interface TreasuresTalkData {
	sectionNumber: number;
	timeBox: number;
	heading: string;
	points: TalkPoint[];
	illustrations: TreasuresTalkIllustration[];
	callout?: TreasuresTalkSpecialItem;
	video?: TreasuresTalkMediaItem;
	footnotes: Record<number, string>;
	citations: CitationData[];
}

interface TreasuresTalkDataV2 {
	sectionNumber: number;
	timeBox: number;
	heading: string;
	content: TreasuresTalkContentItem[];
}

type TreasuresTalkContentItem =
	| {
			kind: 'point';
			payload: CitationTextBlock;
	  }
	| {
			kind: 'illustration';
			payload: TreasuresTalkIllustration;
	  }
	| {
			kind: 'callout';
			payload: TreasuresTalkSpecialItem & CitationTextBlock;
	  }
	| {
			kind: 'video';
			payload: TreasuresTalkMediaItem;
	  };

interface AnswerSource {
	contents: string;
	mnemonic: string;
}

interface PrintedQuestion {
	answerSources: AnswerSource[];
	question: string;
	scriptureContents: string;
	scriptureMnemonic: string;
}

interface PrintedQuestionV2 extends CitationTextBlock {
	question: string;
}

interface SpiritualGemsData {
	sectionNumber: number;
	timeBox: number;
	headline: string;
	printedQuestionData: PrintedQuestion;
	openEndedQuestion: string;
}

interface SpiritualGemsDataV2 {
	sectionNumber: number;
	timeBox: number;
	headline: string;
	printedQuestionData: PrintedQuestionV2;
	openEndedQuestion: string;
}

interface StudyPoint {
	contents: string;
	mnemonic: string;
}

interface BibleReadData {
	sectionNumber: number;
	timeBox: number;
	headline: string;
	scriptureMnemonic: string;
	scriptureContents: string;
	studyPoint: StudyPoint;
}

interface BibleReadDataV2 {
	sectionNumber: number;
	timeBox: number;
	headline: string;
	contents: CitationTextBlock;
}

interface FieldMinistryAssignmentData {
	sectionNumber: number;
	timeBox: number;
	isStudentTask: boolean;
	headline: string;
	contents: string;
	studyPoint: StudyPoint | null;
}

interface FieldMinistryAssignmentDataV2 {
	sectionNumber: number;
	timeBox: number;
	isStudentTask: boolean;
	headline: string;
	contents: CitationTextBlock;
}

interface ChristianLivingSectionData {
	sectionNumber: number;
	timeBox: number;
	contents: string;
}

export interface CongregationBibleStudyData {
	sectionNumber: number;
	timeBox: number;
	headline: string;
	contents: string;
	references: string[];
}

interface FullWeekProgramData {
	weekDateSpan: string;
	startingSong: SongData;
	weeklyBibleReadData: WeeklyBibleReadData;
	treasuresTalk: TreasuresTalkData;
	spiritualGems: SpiritualGemsData;
	bibleRead: BibleReadData;
	fieldMinistry: FieldMinistryAssignmentData[];
	middleSong: SongData;
	christianLiving: ChristianLivingSectionData[];
	bibleStudy: CongregationBibleStudyData;
	closingSong: SongData;
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
	christianLiving: ChristianLivingSectionData[];
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
function parseSectionHeadlineDataFromElement($element: ReturnType<CheerioAPI>): SectionHeadlineData {
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
function getTimeBoxFromElement($selection: ReturnType<CheerioAPI>): number {
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
	anchors: ReturnType<CheerioAPI>,
	seedText: string,
	textWithCitations = seedText,
): Promise<CitationTextBlock> {
	let block = createCitationTextBlock(seedText, textWithCitations);

	for (let i = 0; i < anchors.length; i++) {
		const $anchor = anchors.eq(i);
		const mnemonic = cleanText($anchor.text());
		const opRes = await fetchAndParseAnchorReferenceOrThrow($anchor);
		if (opRes.err) {
			throw opRes.err;
		}

		block = addParsedReferenceToCitationBlock(block, mnemonic, opRes.res);
	}

	return block;
}

function buildTextWithCitationMarkers(
	selection: ReturnType<CheerioAPI>,
	selectAnchors: (selection: ReturnType<CheerioAPI>) => ReturnType<CheerioAPI>,
	textFormatter: (text: string) => string = (text) => text,
): string {
	const textWithCitationsSelection = selection.clone();
	const anchors = selectAnchors(textWithCitationsSelection);
	for (let i = 0; i < anchors.length; i++) {
		anchors.eq(i).replaceWith(buildCitationMarker(i + 1));
	}

	return textFormatter(cleanText(textWithCitationsSelection.text()));
}

function buildDirectChildSelection($selection: ReturnType<CheerioAPI>, selector = '> *') {
	if (selector === '> *') {
		return $selection.children();
	}

	return $selection.children(selector.replace(/^>\s*/, ''));
}

function extractIllustrationData($figureContainer: ReturnType<CheerioAPI>): TreasuresTalkIllustration | null {
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

function extractSpecialItemBase($specialParagraph: ReturnType<CheerioAPI>): TreasuresTalkSpecialItem {
	const label = cleanText($specialParagraph.find('strong').first().text()).replace(/:$/, '');
	return {
		label,
		text: cleanText($specialParagraph.text()),
	};
}

function extractVideoMediaItem($paragraph: ReturnType<CheerioAPI>): TreasuresTalkMediaItem | null {
	const $videoAnchor = $paragraph.find('a[data-video]').first();
	if (!$videoAnchor.length) {
		return null;
	}

	const text = cleanText($paragraph.text());
	const label = cleanText($videoAnchor.text());
	const cloned = $paragraph.clone();
	cloned.find('a[data-video]').remove();

	return {
		text,
		label,
		title: cleanText(cloned.text()).replace(/^[\[\]\s.]+|[\[\]\s.]+$/g, ''),
		url: $videoAnchor.attr('href') ?? '',
	};
}

function isSpecialItemParagraph($paragraph: ReturnType<CheerioAPI>): boolean {
	if (!$paragraph.is('p')) {
		return false;
	}

	const $previous = $paragraph.prev();
	if ($previous.is('hr')) {
		return true;
	}

	return $paragraph.find('span > strong').length > 0;
}

function isVideoPromptParagraph($paragraph: ReturnType<CheerioAPI>): boolean {
	return $paragraph.is('p') && $paragraph.find('a[data-video]').length > 0;
}

function extractMainPointParagraphs($pointContainer: ReturnType<CheerioAPI>): ReturnType<CheerioAPI>[] {
	const $children = buildDirectChildSelection($pointContainer);
	const paragraphs: ReturnType<CheerioAPI>[] = [];

	for (let i = 0; i < $children.length; i++) {
		const $child = $children.eq(i);
		if (!$child.is('p')) {
			continue;
		}
		if (isSpecialItemParagraph($child) || isVideoPromptParagraph($child)) {
			continue;
		}
		paragraphs.push($child);
	}

	return paragraphs;
}

function extractSpecialItemParagraphsFromPointContainer($pointContainer: ReturnType<CheerioAPI>) {
	const $children = buildDirectChildSelection($pointContainer);
	const paragraphs: ReturnType<CheerioAPI>[] = [];

	for (let i = 0; i < $children.length; i++) {
		const $child = $children.eq(i);
		if (isSpecialItemParagraph($child)) {
			paragraphs.push($child);
		}
	}

	return paragraphs;
}

function extractMediaItemsFromPointContainer($pointContainer: ReturnType<CheerioAPI>) {
	const $children = buildDirectChildSelection($pointContainer);
	const items: TreasuresTalkMediaItem[] = [];

	for (let i = 0; i < $children.length; i++) {
		const $child = $children.eq(i);
		const item = extractVideoMediaItem($child);
		if (item) {
			items.push(item);
		}
	}

	return items;
}

function assignSingleOptionalValue<T>(currentValue: T | undefined, nextValues: T[], kind: string): T | undefined {
	if (nextValues.length === 0) {
		return currentValue;
	}

	if (currentValue || nextValues.length > 1) {
		const msg = `Expected at most one ${kind} in treasures talk, found multiple values. The document structure may have changed.`;
		log.error(msg);
		throw new Error(msg);
	}

	return nextValues[0];
}

async function appendReferencesAsFootnotes(
	$paragraph: ReturnType<CheerioAPI>,
	result: Pick<TreasuresTalkData, 'footnotes' | 'citations'>,
	footnoteKey: number,
) {
	let text = cleanText($paragraph.text());
	const footnotes: number[] = [];
	const $references = $paragraph.find(`a:not([data-video])`);

	for (let j = 0; j < $references.length; j++) {
		const $ref = $references.eq(j);
		const refText = cleanText($ref.text());
		text = text.replace(refText, `${refText}[^${++footnoteKey}]`);
		const opRes = await fetchAndParseAnchorReferenceOrThrow($ref);
		if (opRes.err) {
			throw opRes.err;
		}

		result.footnotes[footnoteKey] = opRes.res.parsedContent;
		footnotes.push(footnoteKey);
		result.citations.push({
			mnemonic: refText,
			footnoteNumber: footnoteKey,
			isPubW: opRes.res.isPubW,
			isPubNwtsty: opRes.res.isPubNwtsty,
			isPubG: opRes.res.isPubG,
			issueName: opRes.res.issueName,
			itemTitle: opRes.res.itemTitle,
		});
	}

	return {
		text,
		footnotes,
		footnoteKey,
	};
}

async function buildSpecialItemCitationBlock($paragraph: ReturnType<CheerioAPI>) {
	const text = cleanText($paragraph.text());
	const selectReferences = (selection: ReturnType<CheerioAPI>) => selection.find(`a:not([data-video])`);
	const $references = selectReferences($paragraph);
	const textWithCitations = buildTextWithCitationMarkers($paragraph, selectReferences);
	const base = extractSpecialItemBase($paragraph);
	const citationBlock = await buildRequiredCitationBlockFromAnchors($references, text, textWithCitations);

	return {
		...base,
		...citationBlock,
	};
}

/**
 * Extracts the treasures talk data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export async function extractTreasuresTalk(input: ExtractionContextOptions): Promise<TreasuresTalkData> {
	log.info('Extracting treasures talk data');

	input.selectionBuilder = ($) => buildGodsTreasuresSelections($).treasuresTalk;
	const { selection: $treasuresTalkSelection } = createExtractionContext(input);
	const headlineData = parseSectionHeadlineDataFromElement(
		$treasuresTalkSelection.find(CONSTANTS.PUB_MWB_CSS_SELECTOR_LINE_WITH_SECTION_NUMBER),
	);

	const result: TreasuresTalkData = {
		sectionNumber: headlineData.number,
		timeBox: getTimeBoxFromElement($treasuresTalkSelection),
		heading: headlineData.headline,
		points: [],
		illustrations: [],
		footnotes: {},
		citations: [],
	};

	const $children = buildDirectChildSelection($treasuresTalkSelection);

	let footnoteKey = 0;
	for (let i = 0; i < $children.length; i++) {
		const $child = $children.eq(i);

		if ($child.attr('id')?.startsWith('f')) {
			const illustration = extractIllustrationData($child);
			if (illustration) {
				result.illustrations.push(illustration);
			}
			continue;
		}

		if (!$child.is('div')) {
			continue;
		}

		result.video = assignSingleOptionalValue(result.video, extractMediaItemsFromPointContainer($child), 'video');
		const specialParagraphs = extractSpecialItemParagraphsFromPointContainer($child);
		const callouts: TreasuresTalkSpecialItem[] = [];
		for (const $specialParagraph of specialParagraphs) {
			const base = extractSpecialItemBase($specialParagraph);
			const enriched = await appendReferencesAsFootnotes($specialParagraph, result, footnoteKey);
			footnoteKey = enriched.footnoteKey;
			callouts.push({
				...base,
				text: enriched.text,
				footnotes: enriched.footnotes,
			});
		}
		result.callout = assignSingleOptionalValue(result.callout, callouts, 'callout');

		const paragraphs = extractMainPointParagraphs($child);
		log.debug(`Processing point container [${i + 1}] with [${paragraphs.length}] main points`);

		for (const $point of paragraphs) {
			const talkPoint: TalkPoint = {
				text: '',
				originalContent: '',
				footnotes: [],
			};
			const originalPointText = cleanText($point.text());
			const enriched = await appendReferencesAsFootnotes($point, result, footnoteKey);
			footnoteKey = enriched.footnoteKey;

			talkPoint.text = enriched.text;
			talkPoint.originalContent = originalPointText;
			talkPoint.footnotes = enriched.footnotes;
			result.points.push(talkPoint);
		}
	}

	log.info(`Extracted ten-minute talk data`);
	return result;
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

	for (let i = 0; i < $children.length; i++) {
		const $child = $children.eq(i);

		if ($child.attr('id')?.startsWith('f')) {
			const illustration = extractIllustrationData($child);
			if (illustration) {
				result.content.push({
					kind: 'illustration',
					payload: illustration,
				});
			}
			continue;
		}

		if (!$child.is('div')) {
			continue;
		}

		const $blockChildren = buildDirectChildSelection($child);
		for (let j = 0; j < $blockChildren.length; j++) {
			const $blockChild = $blockChildren.eq(j);

			if (!$blockChild.is('p')) {
				continue;
			}

			if (isSpecialItemParagraph($blockChild)) {
				result.content.push({
					kind: 'callout',
					payload: await buildSpecialItemCitationBlock($blockChild),
				});
				continue;
			}

			if (isVideoPromptParagraph($blockChild)) {
				const video = extractVideoMediaItem($blockChild);
				if (!video) {
					const msg = `Expected video metadata for treasures talk video prompt. The document structure may have changed.`;
					log.error(msg);
					throw new Error(msg);
				}
				result.content.push({
					kind: 'video',
					payload: video,
				});
				continue;
			}

			const pointText = cleanText($blockChild.text());
			const selectReferences = (selection: ReturnType<CheerioAPI>) => selection.find(`a:not([data-video])`);
			const $references = selectReferences($blockChild);
			const textWithCitations = buildTextWithCitationMarkers($blockChild, selectReferences);

			result.content.push({
				kind: 'point',
				payload: await buildRequiredCitationBlockFromAnchors($references, pointText, textWithCitations),
			});
			log.debug(`Added v2 talk point [${result.content.length}]`);
		}
	}

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
function extractSpiritualGemQuestion($pElem: ReturnType<CheerioAPI>): string {
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

/**
 * Retrieves all <a> elements within the given Cheerio element that are:
 * - Enclosed within parentheses ()
 * - Located at the far right end of the element's content
 *
 * Assumptions:
 * - All links are placed one after the other without interruptions.
 * - The input element is a single Cheerio element (ReturnType<CheerioAPI>).
 *
 * @param element - The parent Cheerio element to search within
 * @param $ The cheerio instance.
 * @returns An array of Cheerio <a> elements that match the criteria
 */
function getSurroundedLinksAtFarRight(element: ReturnType<CheerioAPI>, $: CheerioAPI) {
	const links = [];
	const children = element.contents().toArray();

	let collecting = false;

	// Iterate from the last child to the first
	for (let i = children.length - 1; i >= 0; i--) {
		const child = children[i];

		if (child.type === 'text') {
			const text = child.data;

			if (!collecting) {
				// Check for closing parenthesis ')'
				if (/\)/.test(text)) {
					collecting = true;
				}
			} else {
				// Check for opening parenthesis '(' to stop collecting
				if (/\(/.test(text)) {
					break;
				}
			}
		} else if (child.type === 'tag' && child.name === 'a') {
			if (collecting) {
				// Prepend the link to maintain the original order
				links.unshift($(child));
			}
		}
	}

	return links;
}

/**
 * Extracts the spiritual gems data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export async function extractSpiritualGems(input: ExtractionContextOptions): Promise<SpiritualGemsData> {
	log.info('Extracting spiritual gems data');

	input.selectionBuilder = ($) => buildGodsTreasuresSelections($).spiritualGems;
	const { selection: $spiritualGemsSelection } = createExtractionContext(input);
	const $content = $spiritualGemsSelection.eq(1);

	const printedQuestionData: PrintedQuestion = {
		scriptureMnemonic: '',
		scriptureContents: '',
		question: '',
		answerSources: [],
	};

	const $scriptureAnchorSelection = $content.find(`a.b:first-child`);
	if ($scriptureAnchorSelection.length !== 1) {
		const msg = `Unexpected number of elements for scripture anchor.`;
		log.error(msg);
		throw new Error(msg);
	}

	printedQuestionData.scriptureMnemonic = cleanText($scriptureAnchorSelection.text());
	let opRes = await fetchAndParseAnchorReferenceOrThrow($scriptureAnchorSelection);
	if (opRes.err) {
		throw opRes.err;
	}
	printedQuestionData.scriptureContents = opRes.res.parsedContent;

	const $pElement = $scriptureAnchorSelection.parent();

	printedQuestionData.question = extractSpiritualGemQuestion($pElement);

	const $answerSelection = getSurroundedLinksAtFarRight($pElement, input.$!);

	log.debug(`Processing [${$answerSelection.length}] answer sources`);

	for (let i = 0; i < $answerSelection.length; i++) {
		const $answer = $answerSelection[i];
		opRes = await fetchAndParseAnchorReferenceOrThrow($answer);
		if (opRes.err) {
			throw opRes.err;
		}
		printedQuestionData.answerSources.push({
			contents: opRes.res.parsedContent,
			mnemonic: cleanText($answer.text()),
		});
		log.debug(
			`Added answer source [${i + 1}] for mnemonic [${printedQuestionData.answerSources[printedQuestionData.answerSources.length - 1].mnemonic}]`,
		);
	}
	const headlineData = parseSectionHeadlineDataFromElement($spiritualGemsSelection.eq(0));

	const result: SpiritualGemsData = {
		sectionNumber: headlineData.number,
		timeBox: getTimeBoxFromElement($content),
		headline: headlineData.headline,
		printedQuestionData,
		openEndedQuestion: cleanText($content.find(`li.du-margin-top--8 p`).text()),
	};

	log.info(`Extracted spiritual gems data`);
	return result;
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
	const selectReferences = (selection: ReturnType<CheerioAPI>) => selection.find('a');
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

/**
 * Extracts the bible reading data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export async function extractBibleRead(input: ExtractionContextOptions): Promise<BibleReadData> {
	log.info('Extracting Bible reading data');

	input.selectionBuilder = ($) => buildGodsTreasuresSelections($).bibleRead;
	const { selection: $bibleReadSelection } = createExtractionContext(input);
	const $content = $bibleReadSelection.eq(1);
	const headlineData = parseSectionHeadlineDataFromElement($bibleReadSelection.eq(0));
	const result = {
		sectionNumber: headlineData.number,
		timeBox: getTimeBoxFromElement($content),
		headline: headlineData.headline,
		scriptureMnemonic: '',
		scriptureContents: '',
		studyPoint: {
			mnemonic: '',
			contents: '',
		},
	};

	const $anchorSelection = $content.find(`a`);
	if ($anchorSelection.length !== 2) {
		const msg = `Unexpected number of elements for bible reading anchor.`;
		log.error(msg);
		throw new Error(msg);
	}

	const $scriptureAnchor = $anchorSelection.eq(0);
	const $studyPointAnchor = $anchorSelection.eq(1);
	let opRes = await fetchAndParseAnchorReferenceOrThrow($scriptureAnchor);
	if (opRes.err) {
		throw opRes.err;
	}
	result.scriptureMnemonic = cleanText($scriptureAnchor.text());
	result.scriptureContents = opRes.res.parsedContent;
	result.studyPoint.mnemonic = cleanText($studyPointAnchor.text());
	opRes = await fetchAndParseAnchorReferenceOrThrow($studyPointAnchor);
	if (opRes.err) {
		throw opRes.err;
	}
	result.studyPoint.contents = opRes.res.parsedContent;

	log.info(`Extracted Bible reading data`);
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
	heading: ReturnType<CheerioAPI>;
	contents: ReturnType<CheerioAPI>[];
}

function buildHeadlineToContentGroups(contentSelection: ReturnType<CheerioAPI>, $: CheerioAPI): HeadlineContentGroup[] {
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

/**
 * Extracts the field ministry data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export async function extractFieldMinistry(input: ExtractionContextOptions): Promise<FieldMinistryAssignmentData[]> {
	function extractBetweenParentheses(text: string) {
		const extractRegex = /\)\s*\s*(.*?)\s*(?=\s*\()/;
		const match = text.match(extractRegex);
		if (match) {
			return match[1];
		}
		return text;
	}

	log.info('Extracting field ministry data');
	input.selectionBuilder = ($) => buildFieldMinistrySelections($).fieldMinistry;
	const { $, selection: $fieldMinistrySelection } = createExtractionContext(input);
	const assignmentGroups = buildHeadlineToContentGroups($fieldMinistrySelection, $);

	const promises = assignmentGroups.map(async ({ heading, contents: [assignmentContents] }) => {
		const contentsText = cleanText(assignmentContents.text());
		const headlineData = parseSectionHeadlineDataFromElement(heading);
		const result: FieldMinistryAssignmentData = {
			sectionNumber: headlineData.number,
			timeBox: getTimeBoxFromElement(assignmentContents),
			// Student tasks have a time inside parentheses and a study point inside parentheses.
			isStudentTask: /\(.*?\).*?\(.*?\)/.test(contentsText),
			headline: headlineData.headline,
			contents: takeOutTimeBoxText(contentsText),
			studyPoint: null,
		};

		log.debug(`Processing assignment: [${result.headline}], isStudentTask=[${result.isStudentTask}]`);

		if (!result.isStudentTask) {
			log.info(`Extracted field ministry assignment`);
			return result;
		}

		const $studyPointAnchor = assignmentContents.find(`a`).slice(-1);
		if ($studyPointAnchor.length !== 1) {
			const msg = `Unable to find study point anchor.`;
			log.error(msg);
			throw new Error(msg);
		}
		const opRes = await fetchAndParseAnchorReferenceOrThrow($studyPointAnchor);
		if (opRes.err) {
			throw opRes.err;
		}
		result.studyPoint = {
			mnemonic: cleanText($studyPointAnchor.text()),
			contents: opRes.res.parsedContent,
		};
		result.contents = extractBetweenParentheses(contentsText);
		log.debug(`Added study point`);

		log.info(`Extracted field ministry assignment`);
		return result;
	});

	return Promise.all(promises);
}

export async function extractFieldMinistryV2(
	input: ExtractionContextOptions,
): Promise<FieldMinistryAssignmentDataV2[]> {
	log.info('Extracting v2 field ministry data');
	input.selectionBuilder = ($) => buildFieldMinistrySelections($).fieldMinistry;
	const { $, selection: $fieldMinistrySelection } = createExtractionContext(input);
	const assignmentGroups = buildHeadlineToContentGroups($fieldMinistrySelection, $);

	const promises = assignmentGroups.map(async ({ heading, contents: [assignmentContents] }) => {
		const contentsText = cleanText(assignmentContents.text());
		const headlineData = parseSectionHeadlineDataFromElement(heading);
		const contentsWithoutTimeBox = takeOutTimeBoxText(contentsText);
		const result: FieldMinistryAssignmentDataV2 = {
			sectionNumber: headlineData.number,
			timeBox: getTimeBoxFromElement(assignmentContents),
			isStudentTask: /\(.*?\).*?\(.*?\)/.test(contentsText),
			headline: headlineData.headline,
			contents: createCitationTextBlock(contentsWithoutTimeBox),
		};

		log.debug(`Processing v2 assignment: [${result.headline}], isStudentTask=[${result.isStudentTask}]`);

		if (!result.isStudentTask) {
			log.info(`Extracted v2 field ministry assignment`);
			return result;
		}

		const $studyPointAnchor = assignmentContents.find(`a`).slice(-1);
		if ($studyPointAnchor.length !== 1) {
			const msg = `Unable to find study point anchor.`;
			log.error(msg);
			throw new Error(msg);
		}

		const selectStudyPointAnchor = (selection: ReturnType<CheerioAPI>) => selection.find('a').slice(-1);
		result.contents = await buildRequiredCitationBlockFromAnchors(
			$studyPointAnchor,
			contentsWithoutTimeBox,
			buildTextWithCitationMarkers(assignmentContents, selectStudyPointAnchor, takeOutTimeBoxText),
		);
		log.info(`Extracted v2 field ministry assignment`);
		return result;
	});

	return Promise.all(promises);
}

/**
 * Extracts the Christian Living section data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export function extractChristianLiving(input: ExtractionContextOptions): ChristianLivingSectionData[] {
	function polishElementText($el: ReturnType<CheerioAPI>) {
		let result = $el.text();
		result = cleanText(result);
		result = collapseConsecutiveLineBreaks(result);
		return result;
	}

	log.info('Extracting Christian Living section data');
	input.selectionBuilder = ($) => buildChristianLivingSelections($).christianLiving;
	const { $, selection: $christianLivingSelection } = createExtractionContext(input);
	const sectionGroups = buildHeadlineToContentGroups($christianLivingSelection, $);

	return sectionGroups.map(({ heading, contents }) => {
		const headlineData = parseSectionHeadlineDataFromElement(heading);
		const result = {
			sectionNumber: headlineData.number,
			timeBox: getTimeBoxFromElement(contents[0]),
			headline: headlineData.headline,
			contents: takeOutTimeBoxText(contents.map(polishElementText).join('\n')),
		};
		log.info(`Extracted Christian Living section`);
		return result;
	});
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

/**
 * Extracts the full week program data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export async function extractFullWeekProgram(input: ExtractionContextOptions): Promise<FullWeekProgramData> {
	log.info('Starting full week program extraction');
	const inputObj = createExtractionContext(input);
	const { $ } = inputObj;
	const programGroups = buildRelevantProgramGroupSelections($);

	const weekDateSpan = extractWeekDateSpan(inputObj);
	const christianLiving = extractChristianLiving({ $, selection: programGroups.christianLiving });
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
		extractTreasuresTalk({ $, selection: programGroups.treasuresTalk }),
		extractSpiritualGems({ $, selection: programGroups.spiritualGems }),
		extractBibleRead({ $, selection: programGroups.bibleRead }),
		extractFieldMinistry({ $, selection: programGroups.fieldMinistry }),
	]);

	const result: FullWeekProgramData = {
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

	log.info('Successfully extracted full week program');
	return result;
}

export async function extractFullWeekProgramV2(input: ExtractionContextOptions): Promise<FullWeekProgramDataV2> {
	log.info('Starting v2 full week program extraction');
	const inputObj = createExtractionContext(input);
	const { $ } = inputObj;
	const programGroups = buildRelevantProgramGroupSelections($);

	const weekDateSpan = extractWeekDateSpan(inputObj);
	const christianLiving = extractChristianLiving({ $, selection: programGroups.christianLiving });
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
