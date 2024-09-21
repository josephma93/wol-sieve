import { logger, CONSTANTS } from '../../kernel/index.js';
import { Cheerio, CheerioAPI } from 'cheerio';
import { assertSelectionIs } from '../../data-extraction/dom-validation.js';

const log = logger.child({ ...logger.bindings(), label: 'program-selection-groups' });

interface GodsTreasuresSelections {
	treasuresTalk: ReturnType<CheerioAPI>;
	spiritualGems: ReturnType<CheerioAPI>;
	bibleRead: ReturnType<CheerioAPI>;
}

interface ChristianLivingSelections {
	christianLiving: ReturnType<CheerioAPI>;
	bibleStudy: ReturnType<CheerioAPI>;
}

interface FieldMinistrySelection {
	fieldMinistry: ReturnType<CheerioAPI>;
}

interface RelevantProgramGroupSelections {
	introduction: ReturnType<CheerioAPI>;
	songs: ReturnType<CheerioAPI>;
	startingSong: ReturnType<CheerioAPI>;
	treasuresTalk: ReturnType<CheerioAPI>;
	spiritualGems: ReturnType<CheerioAPI>;
	bibleRead: ReturnType<CheerioAPI>;
	fieldMinistry: ReturnType<CheerioAPI>;
	middleSong: ReturnType<CheerioAPI>;
	christianLiving: ReturnType<CheerioAPI>;
	bibleStudy: ReturnType<CheerioAPI>;
	closingSong: ReturnType<CheerioAPI>;
}

interface FieldMinistryHeadlineSelections {
	fieldMinistryHeadline: ReturnType<CheerioAPI>;
	christianLivingHeadline: ReturnType<CheerioAPI>;
}

/**
 * Validate the number of headline elements for Field Ministry and Christian Living.
 * @param fieldMinistryHeadline The selection for Field Ministry.
 * @param christianLivingHeadline The selection for Christian Living.
 * @throws {Error} If the number of headline elements is not as expected.
 */
function assertHeadlineDOMStructure(
	fieldMinistryHeadline: ReturnType<CheerioAPI>,
	christianLivingHeadline: ReturnType<CheerioAPI>,
) {
	if (fieldMinistryHeadline.find('> h2').length !== 1 || christianLivingHeadline.find('> h2').length !== 1) {
		const msg = 'Unexpected number of elements for field ministry and christian living.';
		log.error(msg);
		throw new Error(msg);
	}
}

function assertIsH3(selection: ReturnType<CheerioAPI>) {
	return assertSelectionIs(selection, 'h3');
}

/**
 * Retrieve and validate the songs (middle and final).
 * @param $ The cheerio instance.
 * @returns The selections.
 * @throws {Error} If the DOM structure is not as expected.
 */
export function getAndValidateSongSelections($: CheerioAPI): {
	songs: ReturnType<CheerioAPI>;
	startingSong: ReturnType<CheerioAPI>;
	middleSong: ReturnType<CheerioAPI>;
	closingSong: ReturnType<CheerioAPI>;
} {
	const startingSong = $(CONSTANTS.STARTING_SONG_CSS_SELECTOR);
	const middleSong = $(CONSTANTS.MIDDLE_SONG_CSS_SELECTOR);
	const closingSong = $(CONSTANTS.FINAL_SONG_CSS_SELECTOR);
	assertIsH3(startingSong);
	assertIsH3(middleSong);
	assertIsH3(closingSong);
	const songs = $([startingSong[0], middleSong[0], closingSong[0]]);
	return { songs, startingSong, middleSong, closingSong };
}

/**
 * Retrieve and validate the Treasures Talk and subsequent elements.
 * @param $ The cheerio instance.
 * @param fieldMinistryHeadline The field ministry headline element.
 * @returns The treasures talk and related elements.
 * @throws {Error} If the DOM structure is not as expected.
 */
function getAndValidateGodsTreasuresSelections(
	$: CheerioAPI,
	fieldMinistryHeadline: Cheerio<any>,
): GodsTreasuresSelections {
	const treasuresTalk = $(CONSTANTS.TREASURES_TALK_CSS_SELECTOR);
	const points2and3 = treasuresTalk.nextUntil(fieldMinistryHeadline);
	if (points2and3.length !== 4) {
		const msg = `Unexpected number of elements for points 2 and 3. Expected 4, got ${points2and3.length}`;
		log.error(msg);
		throw new Error(msg);
	}
	const spiritualGems = points2and3.slice(0, 2);
	const bibleRead = points2and3.slice(2, 4);
	return { treasuresTalk, spiritualGems, bibleRead };
}

/**
 * Allows easier creation of gods treasures selections.
 * @param $ The cheerio instance.
 * @returns The gods treasures selections.
 */
export function buildGodsTreasuresSelections($: CheerioAPI): GodsTreasuresSelections {
	const { fieldMinistryHeadline } = buildAndValidateHeadlineSelections($);
	return getAndValidateGodsTreasuresSelections($, fieldMinistryHeadline);
}

/**
 * Retrieve and validate the Christian Living section.
 * @param middleSong The middle song element.
 * @param closingSong The final song element.
 * @returns The Christian Living section and the Bible study headline.
 * @throws {Error} If the DOM structure is not as expected.
 */
function getAndValidateChristianLivingSelections(
	middleSong: ReturnType<CheerioAPI>,
	closingSong: ReturnType<CheerioAPI>,
): ChristianLivingSelections {
	const bibleStudyHeadline = closingSong.prevAll('h3').first();
	assertIsH3(bibleStudyHeadline);
	const christianLiving = middleSong.nextUntil(bibleStudyHeadline);
	const bibleStudySiblings = closingSong.prevUntil(bibleStudyHeadline);
	const bibleStudy = bibleStudySiblings.add(bibleStudyHeadline);
	return { christianLiving, bibleStudy };
}

/**
 * Allows easier creation of christian living selections.
 * @param $ The cheerio instance.
 * @returns The Christian Living selections.
 */
export function buildChristianLivingSelections($: CheerioAPI): ChristianLivingSelections {
	const { middleSong, closingSong } = getAndValidateSongSelections($);
	return getAndValidateChristianLivingSelections(middleSong, closingSong);
}

/**
 * Build the field ministry group selection.
 * @param fieldMinistryHeadline The field ministry headline element.
 * @param christianLivingHeadline The christian living headline element.
 * @returns The field ministry selection.
 */
function getAndValidateFieldMinistrySelection(
	fieldMinistryHeadline: ReturnType<CheerioAPI>,
	christianLivingHeadline: Cheerio<any>,
): FieldMinistrySelection {
	return {
		fieldMinistry: fieldMinistryHeadline.nextUntil(christianLivingHeadline),
	};
}

/**
 * Allows easier creation of field ministry selections.
 * @param $ The cheerio instance.
 * @returns The field ministry selection.
 */
export function buildFieldMinistrySelections($: CheerioAPI): FieldMinistrySelection {
	const { fieldMinistryHeadline, christianLivingHeadline } = buildAndValidateHeadlineSelections($);
	return getAndValidateFieldMinistrySelection(fieldMinistryHeadline, christianLivingHeadline);
}

/**
 * Build and validate the headlines.
 * @param $ The cheerio instance.
 * @returns The field ministry and christian living headline selections.
 * @throws {Error} If the DOM structure is not as expected.
 */
function buildAndValidateHeadlineSelections($: CheerioAPI): FieldMinistryHeadlineSelections {
	const fieldMinistryHeadline = $(CONSTANTS.FIELD_MINISTRY_HEADLINE_CSS_SELECTOR);
	const christianLivingHeadline = $(CONSTANTS.CHRISTIAN_LIVING_HEADLINE_CSS_SELECTOR);
	assertHeadlineDOMStructure(fieldMinistryHeadline, christianLivingHeadline);
	return { fieldMinistryHeadline, christianLivingHeadline };
}

/**
 * Build the final program group selections object.
 * @param $ The cheerio instance.
 * @returns Object containing all the relevant program group selections.
 * @throws {Error} If the DOM structure is not as expected.
 */
export function buildRelevantProgramGroupSelections($: CheerioAPI): RelevantProgramGroupSelections {
	const { fieldMinistryHeadline, christianLivingHeadline } = buildAndValidateHeadlineSelections($);
	const { songs, startingSong, middleSong, closingSong } = getAndValidateSongSelections($);
	const { treasuresTalk, spiritualGems, bibleRead } = getAndValidateGodsTreasuresSelections($, fieldMinistryHeadline);
	const { fieldMinistry } = getAndValidateFieldMinistrySelection(fieldMinistryHeadline, christianLivingHeadline);
	const { christianLiving, bibleStudy } = getAndValidateChristianLivingSelections(middleSong, closingSong);

	return {
		introduction: $(CONSTANTS.INTRODUCTION_CSS_SELECTOR),
		songs,
		startingSong,
		treasuresTalk,
		spiritualGems,
		bibleRead,
		fieldMinistry,
		middleSong,
		christianLiving,
		bibleStudy,
		closingSong,
	};
}
