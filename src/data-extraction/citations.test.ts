import { describe, expect, it } from 'vitest';
import { buildCitationFromParsedReference, buildCitationMarker, deriveReferenceType } from './citations.js';

describe('deriveReferenceType', () => {
	it.each([
		[{ articleClasses: 'pub-w pub-w23' }, 'pub-w'],
		[{ articleClasses: 'pub-w91' }, 'pub-w'],
		[{ articleClasses: 'pub-g24' }, 'pub-g'],
		[{ articleClasses: 'pub- pub-it-1 pub- pub-it-1' }, 'pub-it'],
		[{ articleClasses: 'pub-it-2' }, 'pub-it'],
		[{ articleClasses: 'pub-nwtsty' }, 'pub-nwtsty'],
		[{ articleClasses: 'pub-ijwhf' }, 'pub-ijwhf'],
		[{ articleClasses: 'card', englishSymbol: 'ijwbq' }, 'ijwbq'],
		[{}, 'unknown'],
	])('derives %s as %s', (input, expected) => {
		expect(deriveReferenceType(input)).toBe(expected);
	});
});

describe('buildCitationFromParsedReference', () => {
	it('builds canonical citation metadata from a parsed reference', () => {
		const citation = buildCitationFromParsedReference({
			id: 1,
			marker: buildCitationMarker(1),
			mnemonic: 'Anchor mnemonic',
			parsedReference: {
				parsedContent: 'Parsed reference contents',
				referenceType: 'pub-w',
				source: 'Issue source',
				publicationTitle: 'Publication title',
				title: 'Item title',
			},
		});

		expect(citation).toEqual({
			id: 1,
			marker: '[[cite:1]]',
			mnemonic: 'Anchor mnemonic',
			referenceType: 'pub-w',
			issueName: 'Issue source',
			itemTitle: 'Item title',
			contents: 'Parsed reference contents',
		});
	});

	it('uses publicationTitle when source is empty and omits marker when none is provided', () => {
		const citation = buildCitationFromParsedReference({
			id: 2,
			mnemonic: '',
			parsedReference: {
				parsedContent: 'Parsed reference contents',
				referenceType: 'pub-g',
				source: '',
				publicationTitle: 'Publication title',
				title: 'Item title',
			},
		});

		expect(citation).toEqual({
			id: 2,
			mnemonic: 'Item title',
			referenceType: 'pub-g',
			issueName: 'Publication title',
			itemTitle: 'Item title',
			contents: 'Parsed reference contents',
		});
	});
});
