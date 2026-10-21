import { BiblicalPassageRefEntryV2, NwtstyReferenceDataResultV2 } from '../scrappers/pub-nwtsty/pub-nwtsty.js';

export function clusterBiblicalPassageEntriesV2(
	linkExtractionResult: NwtstyReferenceDataResultV2[],
	tokenCountLimit: number,
) {
	return linkExtractionResult.map(({ link, entries, sharedReferences }) => {
		const entriesWithCitations = entries.filter((entry) => entry.citations.length > 0);
		const clustersFound: BiblicalPassageRefEntryV2[][] = [];
		let nextClusterItems: BiblicalPassageRefEntryV2[] = [];
		let currentClusterTokenCount = 0;
		function resetCluster() {
			clustersFound.push(nextClusterItems);
			nextClusterItems = [];
			currentClusterTokenCount = 0;
		}

		for (const entry of entriesWithCitations) {
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
