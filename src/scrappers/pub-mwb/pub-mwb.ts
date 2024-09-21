import { logger, CONSTANTS } from '../../kernel/index.js';
import { CheerioAPI } from 'cheerio';
import { ExtractionInput, processExtractionInput } from '../generics.js';
import { parsePubSjj, PubSjjParsedData } from '../../data-extraction/extractors-as-obj.js';
import { opErrored } from '../../kernel/index.js';
import {
	cleanText,
	collapseConsecutiveLineBreaks,
	getCheerioSelectionOrThrow,
	takeOutTimeBoxText,
} from '../../data-extraction/generic.js';
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
} from '../../data-extraction/reference-json-commons.js';

const log = logger.child({ ...logger.bindings(), label: 'pub-mwb-scraper' });

interface SongData {
	songNumber: number;
	songData: PubSjjParsedData;
}

interface WeeklyBibleReadData {
	bookName: string;
	bookNumber: number;
	firstChapter: number;
	lastChapter: number;
	links: string[];
}

interface TalkPoint {
	text: string;
	footnotes: number[];
}

interface TreasuresTalkData {
	sectionNumber: number;
	timeBox: number;
	heading: string;
	points: TalkPoint[];
	footnotes: Record<number, string>;
}

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

interface SpiritualGemsData {
	sectionNumber: number;
	timeBox: number;
	headline: string;
	printedQuestionData: PrintedQuestion;
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

interface FieldMinistryAssignmentData {
	sectionNumber: number;
	timeBox: number;
	isStudentTask: boolean;
	headline: string;
	contents: string;
	studyPoint: StudyPoint | null;
}

interface ChristianLivingSectionData {
	sectionNumber: number;
	timeBox: number;
	contents: string;
}

interface CongregationBibleStudyData {
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

/**
 * Extracts the week date span text from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export function extractWeekDateSpan(input: ExtractionInput): string {
	log.info('Starting to extract week date span');
	const { $ } = processExtractionInput(input);
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
export function extractSongData(input: ExtractionInput): Promise<SongData[]> {
	input.selectionBuilder = ($) => getAndValidateSongSelections($).songs;
	const { $, selection: $songsSelection } = processExtractionInput(input);
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
				log.error(msg);
				throw new Error(msg);
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
export async function extractWeeklyBibleRead(input: ExtractionInput): Promise<WeeklyBibleReadData> {
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
	const { $ } = processExtractionInput(input);
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
	if (!/^\d\./.test(elementText)) {
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
	const msg = `No selection found for selector [${CONSTANTS.LINE_WITH_TIME_BOX_CSS_SELECTOR}]`;
	let $lineWithTimeBox = $selection.find(CONSTANTS.LINE_WITH_TIME_BOX_CSS_SELECTOR);
	if (!$lineWithTimeBox.length) {
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

/**
 * Extracts the treasures talk data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export async function extractTreasuresTalk(input: ExtractionInput): Promise<TreasuresTalkData> {
	log.info('Extracting treasures talk data');

	input.selectionBuilder = ($) => buildGodsTreasuresSelections($).treasuresTalk;
	const { selection: $treasuresTalkSelection } = processExtractionInput(input);
	const headlineData = parseSectionHeadlineDataFromElement(
		$treasuresTalkSelection.find(CONSTANTS.LINE_WITH_SECTION_NUMBER_CSS_SELECTOR),
	);

	const result: TreasuresTalkData = {
		sectionNumber: headlineData.number,
		timeBox: getTimeBoxFromElement($treasuresTalkSelection),
		heading: headlineData.headline,
		points: [],
		footnotes: {},
	};

	const $points = $treasuresTalkSelection.find(`> div > p`);
	log.debug(`Found [${$points.length}] points in the talk`);

	let footnoteKey = 0;
	for (let i = 0; i < $points.length; i++) {
		const $point = $points.eq(i);
		const talkPoint: TalkPoint = {
			text: '',
			footnotes: [],
		};
		let pointText = cleanText($point.text());
		const $references = $point.find(`a`);

		log.debug(`Processing point [${i + 1}] with [${$references.length}] references`);

		for (let j = 0; j < $references.length; j++) {
			const $ref = $references.eq(j);
			const refText = cleanText($ref.text());
			pointText = pointText.replace(refText, `${refText}[^${++footnoteKey}]`);
			const opRes = await fetchAndParseAnchorReferenceOrThrow($ref);
			if (opRes.err) {
				throw opRes.err;
			}
			result.footnotes[footnoteKey] = opRes.res.parsedContent;
			talkPoint.footnotes.push(footnoteKey);
			log.debug(`Added footnote [${footnoteKey}] for reference: [${refText}]`);
		}

		talkPoint.text = pointText;
		result.points.push(talkPoint);
		log.debug(`Added talk point [${i + 1}]`);
	}

	log.info(`Extracted ten-minute talk data`);
	return result;
}

/**
 * Extracts the spiritual gems data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export async function extractSpiritualGems(input: ExtractionInput): Promise<SpiritualGemsData> {
	log.info('Extracting spiritual gems data');

	input.selectionBuilder = ($) => buildGodsTreasuresSelections($).spiritualGems;
	const { selection: $spiritualGemsSelection } = processExtractionInput(input);
	const $content = $spiritualGemsSelection.eq(1);

	const printedQuestionData: PrintedQuestion = {
		scriptureMnemonic: '',
		scriptureContents: '',
		question: '',
		answerSources: [],
	};

	const $scriptureAnchorSelection = $content.find(`a.b`);
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

	printedQuestionData.question = $scriptureAnchorSelection
		.parent()
		.contents()
		.filter(function () {
			return this.nodeType === 3; /* TEXT_NODE */
		})
		.eq(0)
		.text()
		.slice(2, -2);

	const $answerSelection = $content.find(`a`).slice(1); // Skip the first element, which is the scripture reference.

	log.debug(`Processing [${$answerSelection.length}] answer sources`);

	for (let i = 0; i < $answerSelection.length; i++) {
		const $answer = $answerSelection.eq(i);
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

/**
 * Extracts the bible reading data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export async function extractBibleRead(input: ExtractionInput): Promise<BibleReadData> {
	log.info('Extracting Bible reading data');

	input.selectionBuilder = ($) => buildGodsTreasuresSelections($).bibleRead;
	const { selection: $bibleReadSelection } = processExtractionInput(input);
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

interface HeadlineContentGroup {
	heading: ReturnType<CheerioAPI>;
	contents: ReturnType<CheerioAPI>[];
}

function buildHeadlineToContentGroups(fieldMinistry: ReturnType<CheerioAPI>, $: CheerioAPI): HeadlineContentGroup[] {
	return fieldMinistry.toArray().reduce((acc, el) => {
		const $el = $(el);

		if ($el.is('h3')) {
			acc.push({
				heading: $el,
				contents: [],
			});
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
export async function extractFieldMinistry(input: ExtractionInput): Promise<FieldMinistryAssignmentData[]> {
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
	const { $, selection: $fieldMinistrySelection } = processExtractionInput(input);
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

/**
 * Extracts the Christian Living section data from the given input.
 * @param input The input object necessary values for correct extraction.
 * @returns The extracted data.
 * @throws {Error} If the extraction fails.
 */
export function extractChristianLiving(input: ExtractionInput): ChristianLivingSectionData[] {
	function polishElementText($el: ReturnType<CheerioAPI>) {
		let result = $el.text();
		result = cleanText(result);
		result = collapseConsecutiveLineBreaks(result);
		return result;
	}

	log.info('Extracting Christian Living section data');
	input.selectionBuilder = ($) => buildChristianLivingSelections($).christianLiving;
	const { $, selection: $christianLivingSelection } = processExtractionInput(input);
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
export function extractBibleStudy(input: ExtractionInput): CongregationBibleStudyData {
	log.info('Extracting Bible study section data');
	input.selectionBuilder = ($) => buildChristianLivingSelections($).bibleStudy;
	const { $, selection: $bibleStudySelection } = processExtractionInput(input);
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
export async function extractFullWeekProgram(input: ExtractionInput): Promise<FullWeekProgramData> {
	log.info('Starting full week program extraction');
	const inputObj = processExtractionInput(input);
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
