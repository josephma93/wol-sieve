import * as cheerio from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAndParseAnchorReferenceOrThrow } from './reference-json.js';

const logMocks = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../kernel/logger.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../kernel/logger.js')>();
	return { ...original, logger: { ...logMocks, bindings: () => ({}), child: () => logMocks } };
});

const anchorHtml = '<a href="/es/wol/pc/r4/lp-s/1102025913/0/0">Reference</a>';
const marker = '<a class="fn" data-fnid="1" href="/wol/fn/r4/lp-s/2009887/0">a</a>';
const note =
	'<div id="footnote1" class="fcc fn-ref" data-fnid="1"><p><a class="fn-symbol" href="#footnotesource1">a</a> Note answer.</p></div>';

function publication(content: string, articleClasses = 'publicationCitation pub-w docId-2009887') {
	return {
		items: [
			{
				content,
				articleClasses,
				title: 'Title',
				publicationTitle: 'Issue',
				categories: [],
				url: '',
				caption: '',
				reference: '',
				pubType: '',
				source: '',
			},
		],
	};
}

async function parse() {
	const $ = cheerio.load(anchorHtml);
	return fetchAndParseAnchorReferenceOrThrow($('a'));
}

function mockResponses(...responses: unknown[]) {
	const fetchMock = vi.fn();
	for (const response of responses) {
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(response), { status: 200 }));
	}
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('publication reference footnotes', () => {
	it('fetches a missing note from its explicit endpoint and includes its text', async () => {
		const fetchMock = mockResponses(publication(`<p class="sb">Paragraph.${marker}</p>`), publication(note));
		const result = await parse();
		expect(result.err).toBeNull();
		expect(result.res?.parsedContent).toBe('Paragraph.a\na Note answer.');
		expect(fetchMock.mock.calls[1][0]).toBe('https://wol.jw.org/wol/fn/r4/lp-s/2009887/0');
	});

	it('preserves embedded notes without fetching or duplicating them', async () => {
		const fetchMock = mockResponses(publication(`<p class="sb">Paragraph.${marker}</p>${note}`));
		expect((await parse()).res?.parsedContent).toBe('Paragraph.a\na Note answer.');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('fetches only missing notes when some notes are already embedded', async () => {
		const secondMarker = marker.replaceAll('data-fnid="1"', 'data-fnid="2"').replace('/2009887/0', '/2009887/1');
		const secondNote = note.replaceAll('data-fnid="1"', 'data-fnid="2"').replace('Note answer.', 'Second answer.');
		const fetchMock = mockResponses(
			publication(`<p class="sb">Paragraph.${marker}${secondMarker}</p>${note}`),
			publication(secondNote),
		);
		const text = (await parse()).res?.parsedContent;
		expect(text).toBe('Paragraph.aa\na Note answer.\na Second answer.');
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[1][0]).toBe('https://wol.jw.org/wol/fn/r4/lp-s/2009887/1');
	});

	it('extracts references that contain only a footnote', async () => {
		const fetchMock = mockResponses(publication(note));
		expect((await parse()).res?.parsedContent).toBe('a Note answer.');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('includes a repeated footnote only once', async () => {
		const fetchMock = mockResponses(
			publication(`<p class="sb">First.${marker}</p><p class="sb">Second.${marker}</p>`),
			publication(note),
		);
		expect((await parse()).res?.parsedContent).toBe('First.a\nSecond.a\na Note answer.');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it.each([null, {}, { items: [] }, publication(note.replaceAll('data-fnid="1"', 'data-fnid="2"'))])(
		'preserves the paragraph when the note response is invalid: %j',
		async (response) => {
			mockResponses(publication(`<p class="sb">Paragraph.${marker}</p>`), response);
			expect((await parse()).res?.parsedContent).toBe('Paragraph.a');
		},
	);

	it('preserves the paragraph when the supplementary request fails', async () => {
		const fetchMock = mockResponses(publication(`<p class="sb">Paragraph.${marker}</p>`));
		fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
		expect((await parse()).res?.parsedContent).toBe('Paragraph.a');
	});

	it('does not follow arbitrary footnote URLs', async () => {
		const fetchMock = mockResponses(
			publication(
				`<p class="sb">Paragraph.${marker.replace('/wol/fn/r4/lp-s/2009887/0', 'https://example.com/note')}</p>`,
			),
		);
		expect((await parse()).res?.parsedContent).toBe('Paragraph.a');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('leaves Bible reference note handling unchanged', async () => {
		const fetchMock = mockResponses(publication(`<p class="sb">Verse.${marker}</p>`, 'bibleCitation pub-nwtsty'));
		expect((await parse()).res?.parsedContent).toBe('Verse.');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('does not request supplementary data for paragraphs without notes', async () => {
		const fetchMock = mockResponses(publication('<p class="sb">Paragraph.</p>'));
		expect((await parse()).res?.parsedContent).toBe('Paragraph.');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
