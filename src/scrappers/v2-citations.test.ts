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
import { extractTreasuresTalkV2 } from './pub-mwb/pub-mwb.js';
import { extractReferencesFromLinksV2 } from './pub-nwtsty/pub-nwtsty.js';

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
			<h3>1. Treasures Talk</h3>
			<p class="du-color--textSubdued">(10 min.)</p>
			<div><p>Point names Ref A before <a href="/es/wol/d/r4/lp-s/654">Ref A</a>.</p></div>
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
					<a href="/es/wol/d/r4/lp-s/111">Ref A</a>
				</div>
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
			points: [
				{
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
			],
		});
		expect(parsed).not.toHaveProperty('footnotes');
		expect(parsed).not.toHaveProperty('citations');
	});

	it('expands repeated NWTSTY references into complete per-passage citations', async () => {
		const link = 'https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70';
		const result = await extractReferencesFromLinksV2([link]);

		expect(result.errors).toEqual([]);
		expect(result.results).toHaveLength(1);
		expect(result.results[0]).not.toHaveProperty('sharedMnemonicReferences');
		expect(result.results[0].entries).toEqual([
			{
				mnemonic: 'Psalm 70:1',
				scripture: 'Scripture text.',
				citationTokenCount: expect.any(Number),
				citations: [
					{
						id: 1,
						mnemonic: 'Ref A',
						referenceType: 'pub-w',
						issueName: 'Issue source',
						itemTitle: 'Item title',
						contents: 'Parsed reference contents',
					},
					{
						id: 2,
						mnemonic: 'Ref A',
						referenceType: 'pub-w',
						issueName: 'Issue source',
						itemTitle: 'Item title',
						contents: 'Parsed reference contents',
					},
				],
			},
		]);
		expect(mocks.getJsonContent).toHaveBeenCalledTimes(1);
	});
});
