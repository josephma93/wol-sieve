import { CONSTANTS, ErrorResult, logger, opErrored, wrapAsyncOp } from '../../kernel/index.js';
import * as cheerio from 'cheerio';
import { PublicationRefData, fetchAndParseAnchorReferenceOrThrow } from '../../data-fetching/reference-json.js';
import { CheerioAPI } from 'cheerio';
import { cleanText } from '../../kernel/util.js';
import { extractPubNwtstyReferenceAsText } from '../../data-extraction/extractors-as-text.js';
import type { CheerioSelection } from '../../data-extraction/generic.js';
import { getHtmlContent } from '../../data-fetching/raw.js';
import { get_encoding } from 'tiktoken';
import { buildCitationFromParsedReference } from '../../data-extraction/citations.js';

const log = logger.child({ ...logger.bindings(), label: 'pub-w-nwtsty' });

function removeMnemonicControlChars(txt: string) {
	return cleanText(txt).replaceAll(/[,;]/g, '');
}

function normalizeMnemonics($: CheerioAPI) {
	function normalizeAnchorMnemonic(_: number, anchor: any) {
		const $anchor = $(anchor);
		const currMnemonic = cleanText($anchor.text());
		const cleanCurrMnemonic = removeMnemonicControlChars(currMnemonic);
		if (currMnemonic.includes(',')) {
			const $nextAnchor = $anchor.next();
			const nextMnemonicPart = removeMnemonicControlChars(cleanText($nextAnchor.text()));
			const prevMnemonicCode = cleanCurrMnemonic.split(' ')[0];
			$nextAnchor.text(`${prevMnemonicCode} ${nextMnemonicPart}`);
		}
		$anchor.text(cleanCurrMnemonic);
	}

	$(`.section:not(:nth-child(1)) .group.index.collapsible .sx a`).each(normalizeAnchorMnemonic);
}

interface AnchorDataForProcess {
	$anchor: CheerioSelection;
	mnemonic: string;
}

interface SectionDataForProcess {
	sectionKey: string;
	sectionTitle: string;
	referenceDataInAnchors: AnchorDataForProcess[];
}

function pickRelevantDOMData($: CheerioAPI): SectionDataForProcess[] {
	function anchorMapper(anchor: any) {
		const $anchor = $(anchor);
		return {
			$anchor,
			mnemonic: $anchor.text(),
		};
	}
	function sectionReducer(section: any) {
		const $section = $(section);
		const sectionTitle = $section.find('h3.title').text();
		const referenceDataInAnchors = $section.find('.group.index.collapsible .sx a').toArray().map(anchorMapper);

		return {
			sectionKey: $section.attr('data-key'),
			sectionTitle: cleanText(sectionTitle),
			referenceDataInAnchors,
		} as SectionDataForProcess;
	}

	const sections = $(`.section:not(:nth-child(1))`).toArray();
	log.debug(`Found [${sections.length}] sections to process.`);

	return sections.map(sectionReducer);
}

interface RefEntry {
	mnemonic: string;
	refContents: string | null;
}

export interface BiblicalPassageRefEntry {
	citation: string;
	scripture: string;
	references: RefEntry[];
	referenceTokenCount: number;
}

export interface BiblicalBookReferenceData {
	entries: BiblicalPassageRefEntry[];
	sharedMnemonicReferences: Record<string, string>;
}

export interface BibleCitationOccurrence {
	id: number;
	referenceId: string;
}

export interface SharedReference {
	mnemonic: string;
	referenceType: string;
	issueName: string;
	itemTitle: string;
	contents: string;
}

export interface BiblicalPassageRefEntryV2 {
	mnemonic: string;
	scripture: string;
	citations: BibleCitationOccurrence[];
	citationTokenCount: number;
}

export interface BiblicalBookReferenceDataV2 {
	entries: BiblicalPassageRefEntryV2[];
	sharedReferences: Record<string, SharedReference>;
}

declare type SectionIndex = number;
declare type AnchorIndexes = Set<number[]>;

interface MnemonicExtractionTrackingData {
	mnemonic: string;
	refContents: string;
	seenCounter: number;
	operationPromise: Promise<void>;
	relatedDataTracking: Map<SectionIndex, AnchorIndexes>;
}

declare type MnemonicDataFetchingPromises = MnemonicExtractionTrackingData['operationPromise'][];

/**
 * Compute how make AI tokes the given string has.
 * @param {string} text String to token out
 * @returns {number} Number of tokes for the given string.
 */
function computeNumberOfTokensForString(text: string): number {
	const encoding = get_encoding('o200k_base');
	let tokenCount = encoding.encode(text).length;
	encoding.free();
	return tokenCount;
}

function buildSharedReferenceFromFetchedReference(
	mnemonic: string,
	fetchedReference: PublicationRefData,
): SharedReference {
	const citation = buildCitationFromParsedReference({ id: 0, mnemonic, parsedReference: fetchedReference });

	return {
		mnemonic: citation.mnemonic,
		referenceType: citation.referenceType,
		issueName: citation.issueName,
		itemTitle: citation.itemTitle,
		contents: citation.contents,
	};
}

/**
 * Parses the Bible reference from the provided HTML content.
 * @param html - The HTML content to parse.
 * @returns - An object containing entries and sharedMnemonicReferences.
 */
async function _extractBibleReferences(html: string): Promise<BiblicalBookReferenceData> {
	log.info('Starting to parse Bible reference');
	const $ = cheerio.load(html);
	normalizeMnemonics($);
	const dataInSectionsToProcess = pickRelevantDOMData($);
	const mnemonicExtractionTracking: Map<string, MnemonicExtractionTrackingData> = new Map();

	function sectionDataMapper(sectionData: SectionDataForProcess, sectionIndex: number) {
		function getTrackingObj(mnemonic: string, anchorIndex: number) {
			const trackingObj = mnemonicExtractionTracking.get(mnemonic) ?? {
				mnemonic,
				refContents: '',
				seenCounter: 0,
				operationPromise: Promise.resolve(),
				relatedDataTracking: new Map(),
			};

			const relatedDataTracking = trackingObj.relatedDataTracking.get(sectionIndex) ?? new Set();
			relatedDataTracking.add(anchorIndex);
			trackingObj.relatedDataTracking.set(anchorIndex, relatedDataTracking);
			mnemonicExtractionTracking.set(mnemonic, trackingObj);
			return trackingObj;
		}

		const { sectionKey, referenceDataInAnchors } = sectionData;
		log.debug(`Processing section with key: [${sectionKey}]`);

		let mnemonicDataFetchingPromises: MnemonicDataFetchingPromises = [];
		for (let anchorIndex = 0; anchorIndex < referenceDataInAnchors.length; anchorIndex++) {
			const { $anchor, mnemonic } = referenceDataInAnchors[anchorIndex];

			const trackingObj = getTrackingObj(mnemonic, anchorIndex);
			if (trackingObj.seenCounter === 0) {
				trackingObj.operationPromise = fetchAndParseAnchorReferenceOrThrow($anchor).then((opRes) => {
					let refContents;
					if (opErrored(opRes)) {
						log.warn(
							`Unable to load reference data for mnemonic: [${mnemonic}] due to: [${opRes.err.message}]`,
						);
						refContents = CONSTANTS.UNABLE_TO_EXTRACT_REFERENCE;
					} else {
						refContents = opRes.res.parsedContent;
					}
					log.debug(`Finished extracting data for mnemonic: [${mnemonic}]`);
					trackingObj.refContents = refContents;
				});
				mnemonicDataFetchingPromises.push(trackingObj.operationPromise);
			}
			trackingObj.seenCounter += 1;
		}

		return Promise.all(mnemonicDataFetchingPromises);
	}

	await Promise.all(dataInSectionsToProcess.map(sectionDataMapper));

	return dataInSectionsToProcess.reduce(
		(
			{ entries, sharedMnemonicReferences },
			{ sectionKey, sectionTitle, referenceDataInAnchors }: SectionDataForProcess,
		) => {
			const matchingElements = $(`#article [id*="${sectionKey}"]`).filter((_, el) => {
				return new RegExp(`^[^\d-]*${sectionKey}(?!\\d)`).test($(el).attr('id') ?? '');
			});
			const scripture = extractPubNwtstyReferenceAsText(matchingElements, $);
			let referenceTokenCount = 0;

			const references = referenceDataInAnchors.map(({ mnemonic }) => {
				const trackingObj = mnemonicExtractionTracking.get(mnemonic)!;
				referenceTokenCount += computeNumberOfTokensForString(trackingObj.refContents);

				if (trackingObj.seenCounter > 1) {
					sharedMnemonicReferences[mnemonic] = trackingObj.refContents;
					return {
						mnemonic,
						refContents: null,
					};
				} else {
					return {
						mnemonic,
						refContents: trackingObj.refContents,
					};
				}
			});

			entries.push({
				citation: sectionTitle,
				scripture,
				references,
				referenceTokenCount,
			});

			return { entries, sharedMnemonicReferences };
		},
		{
			entries: [],
			sharedMnemonicReferences: {},
		} as BiblicalBookReferenceData,
	);
}

const extractBibleReferences = wrapAsyncOp(_extractBibleReferences);

async function _extractBibleReferencesV2(html: string): Promise<BiblicalBookReferenceDataV2> {
	log.info('Starting to parse v2 Bible reference');
	const $ = cheerio.load(html);
	normalizeMnemonics($);
	const dataInSectionsToProcess = pickRelevantDOMData($);
	const referenceFetchesByMnemonic: Map<string, Promise<PublicationRefData>> = new Map();

	for (const { referenceDataInAnchors } of dataInSectionsToProcess) {
		for (const { $anchor, mnemonic } of referenceDataInAnchors) {
			if (referenceFetchesByMnemonic.has(mnemonic)) {
				continue;
			}

			referenceFetchesByMnemonic.set(
				mnemonic,
				fetchAndParseAnchorReferenceOrThrow($anchor).then((opRes) => {
					if (opErrored(opRes)) {
						const errorMessage = `Unable to load reference data for mnemonic: [${mnemonic}] due to: [${opRes.err.message}]`;
						log.warn(errorMessage);
						throw new Error(errorMessage);
					}

					log.debug(`Finished extracting v2 data for mnemonic: [${mnemonic}]`);
					return opRes.res;
				}),
			);
		}
	}

	const referencesByMnemonic: Map<string, PublicationRefData> = new Map();
	await Promise.all(
		[...referenceFetchesByMnemonic.entries()].map(async ([mnemonic, referenceFetch]) => {
			referencesByMnemonic.set(mnemonic, await referenceFetch);
		}),
	);

	const referenceIdsByMnemonic: Map<string, string> = new Map();
	const sharedReferences: Record<string, SharedReference> = {};
	for (const { referenceDataInAnchors } of dataInSectionsToProcess) {
		for (const { mnemonic } of referenceDataInAnchors) {
			if (referenceIdsByMnemonic.has(mnemonic)) {
				continue;
			}

			const referenceId = `ref:${referenceIdsByMnemonic.size + 1}`;
			referenceIdsByMnemonic.set(mnemonic, referenceId);
			const fetchedReference = referencesByMnemonic.get(mnemonic);
			if (fetchedReference === undefined) {
				throw new Error(`Missing fetched reference for mnemonic [${mnemonic}]`);
			}

			sharedReferences[referenceId] = buildSharedReferenceFromFetchedReference(mnemonic, fetchedReference);
		}
	}

	return dataInSectionsToProcess.reduce(
		(
			{ entries, sharedReferences },
			{ sectionKey, sectionTitle, referenceDataInAnchors }: SectionDataForProcess,
		) => {
			if (referenceDataInAnchors.length === 0) {
				log.debug(`Skipping section with key [${sectionKey}] because it has no extracted references.`);
				return { entries, sharedReferences };
			}

			const matchingElements = $(`#article [id*="${sectionKey}"]`).filter((_, el) => {
				return new RegExp(`^[^\\d-]*${sectionKey}(?!\\d)`).test($(el).attr('id') ?? '');
			});
			const scripture = extractPubNwtstyReferenceAsText(matchingElements, $);
			let citationTokenCount = 0;

			const citations = referenceDataInAnchors.map(({ mnemonic }, index) => {
				const referenceId = referenceIdsByMnemonic.get(mnemonic)!;
				const sharedReference = sharedReferences[referenceId];

				citationTokenCount += computeNumberOfTokensForString(sharedReference.contents);
				return {
					id: index + 1,
					referenceId,
				};
			});

			entries.push({
				mnemonic: sectionTitle,
				scripture,
				citations,
				citationTokenCount,
			});

			return { entries, sharedReferences };
		},
		{
			entries: [],
			sharedReferences,
		} as BiblicalBookReferenceDataV2,
	);
}

const extractBibleReferencesV2 = wrapAsyncOp(_extractBibleReferencesV2);

export interface NwtstyReferenceDataResult extends BiblicalBookReferenceData {
	link: string;
}

export interface NwtstyReferenceDataResultV2 extends BiblicalBookReferenceDataV2 {
	link: string;
}

interface NwtstyReferenceDataError {
	link: string;
	error: string;
}

interface NwtstyReferenceData {
	results: NwtstyReferenceDataResult[];
	errors: NwtstyReferenceDataError[];
}

interface NwtstyReferenceDataV2 {
	results: NwtstyReferenceDataResultV2[];
	errors: NwtstyReferenceDataError[];
}

/**
 * Extracts Bible references from the provided list of links.
 * @param {string[]} links - Array of Bible book URLs.
 * @returns - An object containing results and errors.
 */
export async function extractReferencesFromLinks(links: string[]): Promise<NwtstyReferenceData> {
	log.info('Starting to extract references from links');

	const opResults = await Promise.all(
		links.map(async (link) => {
			const opRes = await getHtmlContent(link);
			return {
				link,
				opRes,
			};
		}),
	);

	const result: NwtstyReferenceData = {
		errors: [],
		results: [],
	};

	function registerOpWithErr({ link, opRes }: { link: string; opRes: ErrorResult }) {
		const errorMsg = `Error processing link [${link}] due to: [${opRes.err.message}]`;
		log.warn(errorMsg);
		result.errors.push({
			link: link,
			error: errorMsg,
		});
	}

	for (const { link, opRes } of opResults) {
		if (opErrored(opRes)) {
			registerOpWithErr({ link, opRes });
			continue;
		}
		const extractRes = await extractBibleReferences(opRes.res);
		if (opErrored(extractRes)) {
			registerOpWithErr({ link, opRes: extractRes });
			continue;
		}
		log.debug(`Reference extraction for link [${link}] was successful.`);
		const extracted = extractRes.res;

		result.results.push({
			link,
			entries: extracted.entries,
			sharedMnemonicReferences: extracted.sharedMnemonicReferences,
		});
	}

	log.info('Finished processing all reference links.');
	return result;
}

export async function extractReferencesFromLinksV2(links: string[]): Promise<NwtstyReferenceDataV2> {
	log.info('Starting to extract v2 references from links');

	const opResults = await Promise.all(
		links.map(async (link) => {
			const opRes = await getHtmlContent(link);
			return {
				link,
				opRes,
			};
		}),
	);

	const result: NwtstyReferenceDataV2 = {
		errors: [],
		results: [],
	};

	function registerOpWithErr({ link, opRes }: { link: string; opRes: ErrorResult }) {
		const errorMsg = `Error processing link [${link}] due to: [${opRes.err.message}]`;
		log.warn(errorMsg);
		result.errors.push({
			link: link,
			error: errorMsg,
		});
	}

	const extractionResults = await Promise.all(
		opResults.map(async ({ link, opRes }) => {
			if (opErrored(opRes)) {
				return { link, opRes };
			}

			return {
				link,
				opRes: await extractBibleReferencesV2(opRes.res),
			};
		}),
	);

	for (const { link, opRes } of extractionResults) {
		if (opErrored(opRes)) {
			registerOpWithErr({ link, opRes });
			continue;
		}

		log.debug(`V2 reference extraction for link [${link}] was successful.`);
		result.results.push({
			link,
			entries: opRes.res.entries,
			sharedReferences: opRes.res.sharedReferences,
		});
	}

	log.info('Finished processing all v2 reference links.');
	return result;
}
