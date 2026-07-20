import {
	BiblicalPassageRefEntry,
	BiblicalBookReferenceData,
	NwtstyReferenceDataResult,
	BiblicalPassageRefEntryV2,
	NwtstyReferenceDataResultV2,
} from '../scrappers/pub-nwtsty/pub-nwtsty.js';

/**
 * Fills missing shared mnemonic references in the entries.
 *
 * @param entries - The entries to fill.
 * @param sharedMnemonicReferences - The shared mnemonic references to fill.
 * @returns The entries with filled missing shared mnemonic references.
 */
function fillMissingSharedMnemonicReferences(
	entries: BiblicalPassageRefEntry[],
	sharedMnemonicReferences: BiblicalBookReferenceData['sharedMnemonicReferences'],
) {
	return entries.map((entry) => {
		return {
			...entry,
			references: entry.references.map((reference) => {
				return {
					...reference,
					refContents:
						reference.refContents === null
							? sharedMnemonicReferences[reference.mnemonic]
							: reference.refContents,
				};
			}),
		};
	});
}

/**
 * Clusters biblical passage entries based on a dynamic token limit.
 *
 * @param linkExtractionResult - The result from extracting references from links.
 * @param tokenCountLimit - The maximum token limit for each cluster.
 * @returns The clustered results.
 */
export function clusterBiblicalPassageEntries(
	linkExtractionResult: NwtstyReferenceDataResult[],
	tokenCountLimit: number,
) {
	return linkExtractionResult.map(({ link, entries, sharedMnemonicReferences }) => {
		entries = fillMissingSharedMnemonicReferences(entries, sharedMnemonicReferences);

		const clustersFound: BiblicalPassageRefEntry[][] = [];
		let nextClusterItems: BiblicalPassageRefEntry[] = [];
		let currentClusterTokenCount = 0;
		function resetCluster() {
			clustersFound.push(nextClusterItems);
			nextClusterItems = [];
			currentClusterTokenCount = 0;
		}

		for (const entry of entries) {
			const tokenCount = entry.referenceTokenCount;
			const doEntryExceedsTokenLimit = tokenCount > tokenCountLimit;
			const doEntryTokenCountAddsBeyondLimit = currentClusterTokenCount + tokenCount > tokenCountLimit;

			if (doEntryExceedsTokenLimit) {
				if (nextClusterItems.length > 0) {
					resetCluster();
				}
				clustersFound.push([entry]);
				continue;
			}

			if (doEntryTokenCountAddsBeyondLimit) {
				resetCluster();
			}

			nextClusterItems.push(entry);
			currentClusterTokenCount += tokenCount;
		}

		if (nextClusterItems.length > 0) {
			clustersFound.push(nextClusterItems);
		}

		return {
			link,
			clusters: clustersFound,
		};
	});
}

export function clusterBiblicalPassageEntriesV2(
	linkExtractionResult: NwtstyReferenceDataResultV2[],
	tokenCountLimit: number,
) {
	return linkExtractionResult.map(({ link, entries, sharedReferences }) => {
		const clustersFound: BiblicalPassageRefEntryV2[][] = [];
		let nextClusterItems: BiblicalPassageRefEntryV2[] = [];
		let currentClusterTokenCount = 0;
		function resetCluster() {
			clustersFound.push(nextClusterItems);
			nextClusterItems = [];
			currentClusterTokenCount = 0;
		}

		for (const entry of entries) {
			const tokenCount = entry.citationTokenCount;
			const doEntryExceedsTokenLimit = tokenCount > tokenCountLimit;
			const doEntryTokenCountAddsBeyondLimit = currentClusterTokenCount + tokenCount > tokenCountLimit;

			if (doEntryExceedsTokenLimit) {
				if (nextClusterItems.length > 0) {
					resetCluster();
				}
				clustersFound.push([entry]);
				continue;
			}

			if (doEntryTokenCountAddsBeyondLimit) {
				resetCluster();
			}

			nextClusterItems.push(entry);
			currentClusterTokenCount += tokenCount;
		}

		if (nextClusterItems.length > 0) {
			clustersFound.push(nextClusterItems);
		}

		return {
			link,
			sharedReferences,
			clusters: clustersFound,
		};
	});
}
