import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getHtmlContent: vi.fn(),
	getJsonContent: vi.fn(),
}));

vi.mock('../data-fetching/raw.js', () => ({
	getHtmlContent: mocks.getHtmlContent,
	getJsonContent: mocks.getJsonContent,
}));

import { extractArticleContents, extractArticleContentsV2 } from './pub-w/pub-w.js';
import { extractLfbContentsV2 } from './pub-lfb/pub-lfb.js';
import { extractTreasuresTalk, extractTreasuresTalkV2 } from './pub-mwb/pub-mwb.js';
import { extractReferencesFromLinksV2 } from './pub-nwtsty/pub-nwtsty.js';
import { clusterBiblicalPassageEntriesV2 } from '../services/pub-nwtsty.js';

function referenceResponse(overrides: Record<string, unknown> = {}) {
	return {
		err: null,
		res: {
			title: 'Reference response',
			items: [
				{
					title: 'Item title',
					url: '',
					caption: '',
					content: '<p class="sb"><span class="parNum">1</span>Parsed reference contents</p>',
					articleClasses: 'pub-w pub-w23',
					englishSymbol: '',
					reference: '',
					categories: [],
					pubType: '',
					publicationTitle: 'Publication title',
					source: 'Issue source',
					...overrides,
				},
			],
		},
	};
}

const watchtowerHtml = `
	<div id="article">
		<p class="contextTtl"><strong>Study Article 1</strong></p>
		<h1><strong>Article title</strong></h1>
		<p class="themeScrp">Theme scripture</p>
		<div id="tt9"><p>ignored</p><p>Article topic</p></div>
		<p class="qu" data-pid="1">1. Question?</p>
		<p data-rel-pid="[1]"><span class="parNum" data-pnum="1">1 </span>Paragraph mentions Ref A before <a href="/es/wol/d/r4/lp-s/123">Ref A</a> end.</p>
		<div class="dc-ttClassStyle--unset"><h2>Teach block</h2><ul><li><p>Teach point</p></li></ul></div>
	</div>
`;

const lfbHtml = `
	<div id="article" class="docClass-13">
		<div id="f1"><img src="/cover.jpg" alt="cover"></div>
		<p id="p1">LECCION 1</p>
		<h1 id="p2">Lesson title</h1>
		<div class="bodyTxt">
			<p>Lesson body.</p>
			<blockquote class="blockTxt rule">Quote names Ref A before <a href="/es/wol/d/r4/lp-s/456">Ref A</a>.</blockquote>
			<div class="boxSupplement">
				<div class="boxContent">
					<p>Question?</p>
					<p>Sources: <a href="/es/wol/d/r4/lp-s/789">Ref B</a></p>
				</div>
			</div>
		</div>
	</div>
`;

const mwbHtml = `
	<div id="article">
		<div id="tt9">
			<div id="f1" class="dc-bleedToArticleEdge">
				<figure>
					<img src="/img-1.jpg" alt="Opening illustration" />
					<figcaption><p>Opening caption</p></figcaption>
				</figure>
			</div>
			<h3>1. Treasures Talk</h3>
			<div id="tt11">
				<div><p class="du-color--textSubdued">(10 min.)</p></div>
				<p>Point names Ref A before <a href="/es/wol/d/r4/lp-s/654">Ref A</a>.</p>
				<hr />
				<p><span><strong>PREGÚNTESE:</strong></span> “Auxiliary prompt” (<a href="/es/wol/d/r4/lp-s/987">Ref B</a>).</p>
				<p>[<a href="https://www.jw.org/finder?wtlocale=S&amp;lank=pub-nwtsv_240_VIDEO" data-video="webpubvid://?pub=nwtsv&amp;track=240&amp;langwritten=S"><strong>Ponga el VIDEO</strong></a> <em>Información sobre Jeremías</em>].</p>
			</div>
			<div id="f2" class="south_center">
				<figure>
					<img src="/img-2.jpg" alt="Closing illustration" />
				</figure>
			</div>
		</div>
		<h3>2. Spiritual Gems</h3>
		<div></div>
		<h3>3. Bible Reading</h3>
		<div></div>
		<div class="dc-icon--wheat"><h2>Apply Yourself to the Field Ministry</h2></div>
		<div class="dc-icon--sheep"><h2>Living as Christians</h2></div>
	</div>
`;

const nwtstyHtml = `
	<div id="article">
		<div class="section"></div>
		<div class="section" data-key="v1">
			<h3 class="title">Psalm 70:1</h3>
			<div id="v1"><span class="sz">Scripture text.</span></div>
			<div class="group index collapsible">
				<div class="sx">
					<a href="/es/wol/d/r4/lp-s/111">Ref A</a>
				</div>
			</div>
		</div>
		<div class="section" data-key="v2">
			<h3 class="title">Psalm 70:2</h3>
			<div id="v2"><span class="sz">Second scripture text.</span></div>
			<div class="group index collapsible">
				<div class="sx">
					<a href="/es/wol/d/r4/lp-s/111">Ref A</a>
				</div>
			</div>
		</div>
		<div class="section" data-key="v3">
			<h3 class="title">Psalm 70:3</h3>
			<div id="v3"><span class="sz">Scripture text without references.</span></div>
			<div class="group index collapsible">
				<div class="sx"></div>
			</div>
		</div>
	</div>
`;

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getJsonContent.mockResolvedValue(referenceResponse());
	mocks.getHtmlContent.mockResolvedValue({ err: null, res: nwtstyHtml });
});

describe('v2 citation scraper contracts', () => {
	it('keeps Watchtower v1 paragraphs stable while v2 uses canonical citation blocks', async () => {
		const v1 = await extractArticleContents({ html: watchtowerHtml });
		const v1Paragraph = v1.contents[0].paragraphs[0];

		expect(v1Paragraph).toEqual({
			number: 1,
			originalContent: '1 Paragraph mentions Ref A before Ref A end.',
			content: '1 Paragraph mentions Ref A before Ref A [^1] end.',
			references: {
				1: 'Parsed reference contents',
			},
		});

		const v2 = await extractArticleContentsV2({ html: watchtowerHtml });
		const v2Paragraph = v2.contents[0].paragraphs[0];

		expect(v2Paragraph).toEqual({
			number: 1,
			text: '1 Paragraph mentions Ref A before Ref A end.',
			textWithCitations: '1 Paragraph mentions Ref A before [[cite:1]] end.',
			citations: [
				{
					id: 1,
					marker: '[[cite:1]]',
					mnemonic: 'Ref A',
					referenceType: 'pub-w',
					issueName: 'Issue source',
					itemTitle: 'Item title',
					contents: 'Parsed reference contents',
				},
			],
		});
		expect(v2Paragraph).not.toHaveProperty('originalContent');
		expect(v2Paragraph).not.toHaveProperty('references');
	});

	it('converts LFB quote and source references to canonical v2 citation blocks', async () => {
		const parsed = await extractLfbContentsV2({ html: lfbHtml });
		const contents = parsed.contents as any;

		expect(contents.highlightQuote).toEqual({
			text: 'Quote names Ref A before Ref A.',
			textWithCitations: 'Quote names Ref A before [[cite:1]].',
			citations: [
				expect.objectContaining({
					id: 1,
					marker: '[[cite:1]]',
					mnemonic: 'Ref A',
					contents: 'Parsed reference contents',
				}),
			],
		});
		expect(contents.bibleSources).toEqual({
			text: 'Sources: Ref B',
			textWithCitations: 'Sources: [[cite:1]]',
			citations: [
				expect.objectContaining({
					id: 1,
					marker: '[[cite:1]]',
					mnemonic: 'Ref B',
					contents: 'Parsed reference contents',
				}),
			],
		});
	});

	it('converts MWB treasures talk points to canonical v2 citation blocks', async () => {
		const parsed = await extractTreasuresTalkV2({ html: mwbHtml });

		expect(parsed).toEqual({
			sectionNumber: 1,
			timeBox: 10,
			heading: 'Treasures Talk',
			content: [
				{
					kind: 'illustration',
					payload: {
						src: 'https://wol.jw.org/img-1.jpg',
						alt: 'Opening illustration',
						caption: 'Opening caption',
					},
				},
				{
					kind: 'point',
					payload: {
						text: 'Point names Ref A before Ref A.',
						textWithCitations: 'Point names Ref A before [[cite:1]].',
						citations: [
							expect.objectContaining({
								id: 1,
								marker: '[[cite:1]]',
								mnemonic: 'Ref A',
								contents: 'Parsed reference contents',
							}),
						],
					},
				},
				{
					kind: 'callout',
					payload: {
						label: 'PREGÚNTESE',
						text: 'PREGÚNTESE: “Auxiliary prompt” (Ref B).',
						textWithCitations: 'PREGÚNTESE: “Auxiliary prompt” ([[cite:1]]).',
						citations: [
							expect.objectContaining({
								id: 1,
								marker: '[[cite:1]]',
								mnemonic: 'Ref B',
								contents: 'Parsed reference contents',
							}),
						],
					},
				},
				{
					kind: 'video',
					payload: {
						text: '[Ponga el VIDEO Información sobre Jeremías].',
						label: 'Ponga el VIDEO',
						title: 'Información sobre Jeremías',
						url: 'https://www.jw.org/finder?wtlocale=S&lank=pub-nwtsv_240_VIDEO',
					},
				},
				{
					kind: 'illustration',
					payload: {
						src: 'https://wol.jw.org/img-2.jpg',
						alt: 'Closing illustration',
					},
				},
			],
		});
		expect(parsed).not.toHaveProperty('footnotes');
		expect(parsed).not.toHaveProperty('citations');
	});

	it('preserves treasures talk ordering and v1 footnote numbering when references resolve out of order', async () => {
		const mwbParallelHtml = `
			<div id="article">
				<div id="tt9">
					<h3>1. Treasures Talk</h3>
					<div id="tt11">
						<div><p class="du-color--textSubdued">(10 min.)</p></div>
						<p>Point starts with <a href="/es/wol/d/r4/lp-s/slow">Slow Ref</a> and then <a href="/es/wol/d/r4/lp-s/fast">Fast Ref</a>.</p>
						<hr />
						<p><span><strong>PREGÚNTESE:</strong></span> Examine <a href="/es/wol/d/r4/lp-s/mid">Mid Ref</a>.</p>
						<p>Point closes with <a href="/es/wol/d/r4/lp-s/end">End Ref</a>.</p>
					</div>
				</div>
				<h3>2. Spiritual Gems</h3>
				<div></div>
				<h3>3. Bible Reading</h3>
				<div></div>
				<div class="dc-icon--wheat"><h2>Apply Yourself to the Field Ministry</h2></div>
				<div class="dc-icon--sheep"><h2>Living as Christians</h2></div>
			</div>
		`;

		mocks.getJsonContent.mockImplementation(async (url: string) => {
			const responseByUrl = {
				'https://wol.jw.org/wol/d/r4/lp-s/slow': { delayMs: 40, content: 'Slow contents', title: 'Slow title' },
				'https://wol.jw.org/wol/d/r4/lp-s/fast': { delayMs: 5, content: 'Fast contents', title: 'Fast title' },
				'https://wol.jw.org/wol/d/r4/lp-s/mid': { delayMs: 20, content: 'Mid contents', title: 'Mid title' },
				'https://wol.jw.org/wol/d/r4/lp-s/end': { delayMs: 1, content: 'End contents', title: 'End title' },
			} as const;
			const match = responseByUrl[url as keyof typeof responseByUrl];
			if (!match) {
				return referenceResponse();
			}

			await new Promise((resolve) => setTimeout(resolve, match.delayMs));
			return referenceResponse({
				title: match.title,
				content: `<p class="sb"><span class="parNum">1</span>${match.content}</p>`,
			});
		});

		const v1 = await extractTreasuresTalk({ html: mwbParallelHtml });
		expect(v1.points).toEqual([
			{
				text: 'Point starts with Slow Ref[^2] and then Fast Ref[^3].',
				originalContent: 'Point starts with Slow Ref and then Fast Ref.',
				footnotes: [2, 3],
			},
			{
				text: 'Point closes with End Ref[^4].',
				originalContent: 'Point closes with End Ref.',
				footnotes: [4],
			},
		]);
		expect(v1.callout).toEqual({
			label: 'PREGÚNTESE',
			text: 'PREGÚNTESE: Examine Mid Ref[^1].',
			footnotes: [1],
		});
		expect(v1.footnotes).toEqual({
			1: 'Mid contents',
			2: 'Slow contents',
			3: 'Fast contents',
			4: 'End contents',
		});
		expect(v1.citations.map(({ mnemonic, footnoteNumber }) => ({ mnemonic, footnoteNumber }))).toEqual([
			{ mnemonic: 'Mid Ref', footnoteNumber: 1 },
			{ mnemonic: 'Slow Ref', footnoteNumber: 2 },
			{ mnemonic: 'Fast Ref', footnoteNumber: 3 },
			{ mnemonic: 'End Ref', footnoteNumber: 4 },
		]);

		const v2 = await extractTreasuresTalkV2({ html: mwbParallelHtml });
		expect(v2.content).toEqual([
			{
				kind: 'point',
				payload: {
					text: 'Point starts with Slow Ref and then Fast Ref.',
					textWithCitations: 'Point starts with [[cite:1]] and then [[cite:2]].',
					citations: [
						expect.objectContaining({
							id: 1,
							mnemonic: 'Slow Ref',
							contents: 'Slow contents',
						}),
						expect.objectContaining({
							id: 2,
							mnemonic: 'Fast Ref',
							contents: 'Fast contents',
						}),
					],
				},
			},
			{
				kind: 'callout',
				payload: {
					label: 'PREGÚNTESE',
					text: 'PREGÚNTESE: Examine Mid Ref.',
					textWithCitations: 'PREGÚNTESE: Examine [[cite:1]].',
					citations: [
						expect.objectContaining({
							id: 1,
							mnemonic: 'Mid Ref',
							contents: 'Mid contents',
						}),
					],
				},
			},
			{
				kind: 'point',
				payload: {
					text: 'Point closes with End Ref.',
					textWithCitations: 'Point closes with [[cite:1]].',
					citations: [
						expect.objectContaining({
							id: 1,
							mnemonic: 'End Ref',
							contents: 'End contents',
						}),
					],
				},
			},
		]);
	});

	it('preserves order across multiple async treasures talk content groups', async () => {
		const mwbConcurrentGroupsHtml = `
			<div id="article">
				<div id="tt9">
					<h3>1. Treasures Talk</h3>
					<div id="tt11">
						<div><p class="du-color--textSubdued">(10 min.)</p></div>
						<p>First point uses <a href="/es/wol/d/r4/lp-s/a1">A1</a> and <a href="/es/wol/d/r4/lp-s/a2">A2</a>.</p>
					</div>
					<div id="tt12">
						<p><span><strong>DEFINICIÓN:</strong></span> Second callout cites <a href="/es/wol/d/r4/lp-s/b1">B1</a>.</p>
					</div>
					<div id="tt13">
						<p>Third point uses <a href="/es/wol/d/r4/lp-s/c1">C1</a>, <a href="/es/wol/d/r4/lp-s/c2">C2</a>, and <a href="/es/wol/d/r4/lp-s/c3">C3</a>.</p>
					</div>
				</div>
				<h3>2. Spiritual Gems</h3>
				<div></div>
				<h3>3. Bible Reading</h3>
				<div></div>
				<div class="dc-icon--wheat"><h2>Apply Yourself to the Field Ministry</h2></div>
				<div class="dc-icon--sheep"><h2>Living as Christians</h2></div>
			</div>
		`;

		mocks.getJsonContent.mockImplementation(async (url: string) => {
			await new Promise((resolve) => setTimeout(resolve, 20));
			const mnemonic = url.split('/').pop()?.toUpperCase() ?? 'UNKNOWN';
			return referenceResponse({
				title: `${mnemonic} title`,
				content: `<p class="sb"><span class="parNum">1</span>${mnemonic} contents</p>`,
			});
		});

		const parsed = await extractTreasuresTalkV2({ html: mwbConcurrentGroupsHtml });

		expect(parsed.content).toEqual([
			{
				kind: 'point',
				payload: {
					text: 'First point uses A1 and A2.',
					textWithCitations: 'First point uses [[cite:1]] and [[cite:2]].',
					citations: [
						expect.objectContaining({ id: 1, mnemonic: 'A1', contents: 'A1 contents' }),
						expect.objectContaining({ id: 2, mnemonic: 'A2', contents: 'A2 contents' }),
					],
				},
			},
			{
				kind: 'callout',
				payload: {
					label: 'DEFINICIÓN',
					text: 'DEFINICIÓN: Second callout cites B1.',
					textWithCitations: 'DEFINICIÓN: Second callout cites [[cite:1]].',
					citations: [expect.objectContaining({ id: 1, mnemonic: 'B1', contents: 'B1 contents' })],
				},
			},
			{
				kind: 'point',
				payload: {
					text: 'Third point uses C1, C2, and C3.',
					textWithCitations: 'Third point uses [[cite:1]], [[cite:2]], and [[cite:3]].',
					citations: [
						expect.objectContaining({ id: 1, mnemonic: 'C1', contents: 'C1 contents' }),
						expect.objectContaining({ id: 2, mnemonic: 'C2', contents: 'C2 contents' }),
						expect.objectContaining({ id: 3, mnemonic: 'C3', contents: 'C3 contents' }),
					],
				},
			},
		]);
	});

	it('fails treasures talk v2 extraction when a parallel reference load errors', async () => {
		const mwbFailureHtml = `
			<div id="article">
				<div id="tt9">
					<h3>1. Treasures Talk</h3>
					<div id="tt11">
						<div><p class="du-color--textSubdued">(10 min.)</p></div>
						<p>Healthy point uses <a href="/es/wol/d/r4/lp-s/ok">Ok Ref</a>.</p>
					</div>
					<div id="tt12">
						<p>Broken point uses <a href="/es/wol/d/r4/lp-s/fail">Fail Ref</a>.</p>
					</div>
				</div>
				<h3>2. Spiritual Gems</h3>
				<div></div>
				<h3>3. Bible Reading</h3>
				<div></div>
				<div class="dc-icon--wheat"><h2>Apply Yourself to the Field Ministry</h2></div>
				<div class="dc-icon--sheep"><h2>Living as Christians</h2></div>
			</div>
		`;

		mocks.getJsonContent.mockImplementation(async (url: string) => {
			if (url.endsWith('/fail')) {
				await new Promise((resolve) => setTimeout(resolve, 5));
				return { err: new Error('reference upstream failed'), res: null };
			}

			await new Promise((resolve) => setTimeout(resolve, 15));
			return referenceResponse({
				title: 'Ok title',
				content: `<p class="sb"><span class="parNum">1</span>Ok contents</p>`,
			});
		});

		await expect(extractTreasuresTalkV2({ html: mwbFailureHtml })).rejects.toThrow('reference upstream failed');
	});

	it('deduplicates repeated NWTSTY references into shared references and occurrence citations', async () => {
		const link = 'https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70';
		const result = await extractReferencesFromLinksV2([link]);

		expect(result.errors).toEqual([]);
		expect(result.results).toHaveLength(1);
		expect(result.results[0]).not.toHaveProperty('sharedMnemonicReferences');
		expect(result.results[0].sharedReferences).toEqual({
			'ref:1': {
				mnemonic: 'Ref A',
				referenceType: 'pub-w',
				issueName: 'Issue source',
				itemTitle: 'Item title',
				contents: 'Parsed reference contents',
			},
		});
		expect(result.results[0].entries).toEqual([
			{
				mnemonic: 'Psalm 70:1',
				scripture: 'Scripture text.',
				citationTokenCount: expect.any(Number),
				citations: [
					{
						id: 1,
						referenceId: 'ref:1',
					},
				],
			},
			{
				mnemonic: 'Psalm 70:2',
				scripture: 'Second scripture text.',
				citationTokenCount: expect.any(Number),
				citations: [
					{
						id: 1,
						referenceId: 'ref:1',
					},
				],
			},
		]);
		expect(result.results[0].entries[0].citations[0]).not.toHaveProperty('contents');
		expect(result.results[0].entries[0].citations[0]).not.toHaveProperty('referenceType');
		expect(result.results[0].entries[0].citations[0]).not.toHaveProperty('issueName');
		expect(result.results[0].entries[0].citations[0]).not.toHaveProperty('itemTitle');
		expect(mocks.getJsonContent).toHaveBeenCalledTimes(1);
	});

	it('omits NWTSTY v2 entries without extracted references', async () => {
		const link = 'https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70';
		const result = await extractReferencesFromLinksV2([link]);

		expect(result.errors).toEqual([]);
		expect(result.results[0].entries.map(({ mnemonic }) => mnemonic)).toEqual(['Psalm 70:1', 'Psalm 70:2']);
	});

	it('fails NWTSTY v2 extraction when a shared reference cannot be loaded', async () => {
		const link = 'https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70';
		mocks.getJsonContent.mockResolvedValueOnce({ err: new Error('reference upstream failed'), res: null });

		const result = await extractReferencesFromLinksV2([link]);

		expect(result.results).toEqual([]);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({ link });
		expect(result.errors[0].error).toContain('Unable to load reference data for mnemonic: [Ref A]');
		expect(result.errors[0].error).toContain('reference upstream failed');
	});

	it('preserves NWTSTY sharedReferences while grouping only entries', async () => {
		const link = 'https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70';
		const extractionResult = await extractReferencesFromLinksV2([link]);
		const grouped = clusterBiblicalPassageEntriesV2(extractionResult.results, 1000);

		expect(grouped).toEqual([
			{
				link,
				sharedReferences: extractionResult.results[0].sharedReferences,
				clusters: [
					[
						expect.objectContaining({
							mnemonic: 'Psalm 70:1',
							citations: [{ id: 1, referenceId: 'ref:1' }],
						}),
						expect.objectContaining({
							mnemonic: 'Psalm 70:2',
							citations: [{ id: 1, referenceId: 'ref:1' }],
						}),
					],
				],
			},
		]);
		expect(grouped[0].clusters[0][0].citations[0]).not.toHaveProperty('contents');
		expect(grouped[0].sharedReferences['ref:1'].contents).toBe('Parsed reference contents');
	});

	it('omits NWTSTY v2 entries without citations before grouped token clustering', () => {
		const link = 'https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70';
		const sharedReferences = {
			'ref:1': {
				mnemonic: 'Ref A',
				referenceType: 'pub-w',
				issueName: 'Issue source',
				itemTitle: 'Item title',
				contents: 'Parsed reference contents',
			},
		};

		const grouped = clusterBiblicalPassageEntriesV2(
			[
				{
					link,
					sharedReferences,
					entries: [
						{
							mnemonic: 'Psalm 70:3',
							scripture: 'Scripture text without references.',
							citations: [],
							citationTokenCount: 9999,
						},
						{
							mnemonic: 'Psalm 70:1',
							scripture: 'Scripture text.',
							citations: [{ id: 1, referenceId: 'ref:1' }],
							citationTokenCount: 1,
						},
					],
				},
			],
			10,
		);

		expect(grouped).toEqual([
			{
				link,
				sharedReferences,
				clusters: [
					[
						{
							mnemonic: 'Psalm 70:1',
							scripture: 'Scripture text.',
							citations: [{ id: 1, referenceId: 'ref:1' }],
							citationTokenCount: 1,
						},
					],
				],
			},
		]);
	});
});
