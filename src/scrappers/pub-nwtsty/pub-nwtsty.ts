import { CONSTANTS, ErrorResult, logger, opErrored, wrapAsyncOp } from '../../kernel/index.js';
import * as cheerio from 'cheerio';
import { fetchAndParseAnchorReferenceOrThrow } from '../../data-fetching/reference-json.js';
import { CheerioAPI } from 'cheerio';
import { cleanText } from '../../data-extraction/generic.js';
import { extractPubNwtstyReferenceAsText } from '../../data-extraction/extractors-as-text.js';
import { getHtmlContent } from '../../data-fetching/raw.js';

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
	$anchor: ReturnType<CheerioAPI>;
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
	refContents: string;
}

interface BiblicalPassageRefEntry {
	citation: string;
	scripture: string;
	references: RefEntry[];
}

interface BiblicalBookReferenceData {
	entries: BiblicalPassageRefEntry[];
	sharedMnemonicReferences: Record<string, string>;
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
			const scripture = extractPubNwtstyReferenceAsText($(`[id*="${sectionKey}"]`), $);

			const references = referenceDataInAnchors.map(({ mnemonic }) => {
				const trackingObj = mnemonicExtractionTracking.get(mnemonic)!;
				let refContents = trackingObj.refContents;

				if (trackingObj.seenCounter > 1) {
					sharedMnemonicReferences[mnemonic] = refContents;
					refContents = `SEE: sharedMnemonicReferences["${mnemonic}"]`;
				}

				return {
					mnemonic,
					refContents,
				};
			});

			entries.push({
				citation: sectionTitle,
				scripture,
				references,
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

interface NwtstyReferenceDataResult extends BiblicalBookReferenceData {
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
