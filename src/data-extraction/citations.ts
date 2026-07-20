import { CONSTANTS, cleanText } from '../kernel/index.js';

export interface Citation {
	id: number;
	marker?: string;
	mnemonic: string;
	referenceType: string;
	issueName: string;
	itemTitle: string;
	contents: string;
}

export interface CitationTextBlock {
	text: string;
	textWithCitations: string;
	citations: Citation[];
}

export interface ReferenceTypeSource {
	articleClasses?: string;
	englishSymbol?: string;
	pubType?: string;
}

export interface ParsedCitationReference extends ReferenceTypeSource {
	parsedContent: string;
	referenceType: string;
	source?: string;
	publicationTitle?: string;
	title?: string;
	itemTitle?: string;
}

export function deriveReferenceType({ articleClasses = '', englishSymbol = '', pubType = '' }: ReferenceTypeSource) {
	const [pubToken] = articleClasses
		.split(/\s+/)
		.filter((token) => token.toLowerCase().startsWith('pub-') && token.toLowerCase() !== 'pub-');

	if (pubToken) {
		if (/^pub-w(?:\d.*)?$/i.test(pubToken)) return CONSTANTS.PUB_CODE_WATCHTOWER;
		if (/^pub-g(?:\d.*)?$/i.test(pubToken)) return CONSTANTS.PUB_CODE_AWAKE;
		if (/^pub-it(?:-\d+)?$/i.test(pubToken)) return 'pub-it';
		if (pubToken.toLowerCase() === CONSTANTS.PUB_CODE_BIBLE) return CONSTANTS.PUB_CODE_BIBLE;
		return pubToken;
	}

	if (englishSymbol.trim()) return englishSymbol.trim();
	if (pubType.trim()) return pubType.trim();
	return 'unknown';
}

export function buildCitationMarker(id: number): string {
	return `[[cite:${id}]]`;
}

export function createCitationTextBlock(text: string, textWithCitations = text): CitationTextBlock {
	return {
		text,
		textWithCitations,
		citations: [],
	};
}

export function buildCitationFromParsedReference({
	id,
	marker,
	mnemonic,
	parsedReference,
}: {
	id: number;
	marker?: string;
	mnemonic: string;
	parsedReference: ParsedCitationReference;
}): Citation {
	const itemTitle = parsedReference.title || parsedReference.itemTitle || '';

	return {
		id,
		...(marker ? { marker } : {}),
		mnemonic: cleanText(mnemonic) || itemTitle,
		referenceType: parsedReference.referenceType || 'unknown',
		issueName: parsedReference.source || parsedReference.publicationTitle || '',
		itemTitle,
		contents: parsedReference.parsedContent,
	};
}

export function buildUnableToExtractCitation({
	id,
	marker,
	mnemonic,
}: {
	id: number;
	marker?: string;
	mnemonic: string;
}): Citation {
	return {
		id,
		...(marker ? { marker } : {}),
		mnemonic: cleanText(mnemonic),
		referenceType: 'unknown',
		issueName: '',
		itemTitle: '',
		contents: CONSTANTS.UNABLE_TO_EXTRACT_REFERENCE,
	};
}

export function addParsedReferenceToCitationBlock(
	block: CitationTextBlock,
	mnemonic: string,
	parsedReference: ParsedCitationReference,
): CitationTextBlock {
	const id = block.citations.length + 1;
	const marker = buildCitationMarker(id);

	return {
		text: block.text,
		textWithCitations: block.textWithCitations,
		citations: [
			...block.citations,
			buildCitationFromParsedReference({
				id,
				marker,
				mnemonic,
				parsedReference,
			}),
		],
	};
}

export function addUnableToExtractReferenceToCitationBlock(
	block: CitationTextBlock,
	mnemonic: string,
): CitationTextBlock {
	const id = block.citations.length + 1;
	const marker = buildCitationMarker(id);

	return {
		text: block.text,
		textWithCitations: block.textWithCitations,
		citations: [
			...block.citations,
			buildUnableToExtractCitation({
				id,
				marker,
				mnemonic,
			}),
		],
	};
}
