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
import {
	extractChristianLiving,
	extractChristianLivingV2,
	extractTreasuresTalk,
	extractTreasuresTalkV2,
} from './pub-mwb/pub-mwb.js';
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
		<div id="tt10"><p>ignored</p><p>Article topic</p></div>
		<p class="qu" data-pid="1">1. Question?</p>
		<p data-rel-pid="[1]"><span class="parNum" data-pnum="1">1 </span>Paragraph mentions Ref A before <a href="/es/wol/d/r4/lp-s/123">Ref A</a> end.</p>
		<div class="dc-ttClassStyle--unset"><h2>Teach block</h2><ul><li><p>Teach point</p></li></ul></div>
	</div>
`;

const watchtowerFlowHtml = `
	<div id="article">
		<p class="contextTtl"><strong>Study Article 2</strong></p>
		<h1><strong>Flow article title</strong></h1>
		<p class="themeScrp">Flow theme scripture</p>
		<div id="tt10"><p>ignored</p><p>Flow article topic</p></div>
		<div class="bodyTxt">
			<h2 id="p10" data-pid="10"><strong>SECTION HEADING</strong></h2>
			<p id="p40" data-pid="40" class="qu"><strong>1.</strong> What does the <a class="it" href="/es/wol/d/r4/lp-s/flow#h=80-82:0">Question Box</a> show?</p>
			<div class="gen-field"></div>
			<p id="p11" data-pid="11" data-rel-pid="[40]"><span class="parNum" data-pnum="1">1 </span>Paragraph cites <a href="/es/wol/bc/r4/lp-s/flow/1/0">Bible Ref</a> and mentions the <a class="it" href="/es/wol/d/r4/lp-s/flow#h=90-92:0">Paragraph Box</a>.<a id="footnotesource1" data-fnid="1" class="fn" href="/es/wol/fn/r4/lp-s/flow/0">a</a></p>
			<div id="f1">
				<figure>
					<img src="/flow.jpg" alt="Flow illustration" />
					<figcaption>Flow caption (mira el párrafo 1).<a id="footnotesource2" data-fnid="2" class="fn" href="/es/wol/fn/r4/lp-s/flow/1">b</a></figcaption>
				</figure>
			</div>
			<div class="boxSupplement">
				<aside>
					<div id="p80" data-pid="80" class="boxTtl"><h2><strong>Question Box</strong></h2></div>
					<div class="boxContent">
						<p>Question box text cites <a href="/es/wol/pc/r4/lp-s/flow/2/0">Pub Ref</a>.</p>
					</div>
				</aside>
			</div>
			<div class="boxSupplement">
				<aside>
					<div id="p90" data-pid="90" class="boxTtl"><h2><strong>Paragraph Box</strong></h2></div>
					<div class="boxContent">
						<p>Paragraph box text links to <a href="https://example.com/resource">External resource</a> and <a href="https://www.jw.org/finder?lank=pub-test_VIDEO" data-video="webpubvid://test">Play video</a> <em>Video Title</em>.</p>
					</div>
				</aside>
			</div>
			<div class="blockTeach dc-ttClassStyle--unset"><h2>Teach block</h2><ul><li><p>Teach point</p></li></ul></div>
			<div class="groupFootnote">
				<div id="footnote1" data-fnid="1" class="fn-ref"><p><a href="#footnotesource1" class="fn-symbol">a</a> Footnote cites <a href="/es/wol/d/r4/lp-s/ref">Article Ref</a>.</p></div>
				<div id="footnote2" data-fnid="2" class="fn-ref"><p><a href="#footnotesource2" class="fn-symbol">b</a> Image note links to <a href="https://www.jw.org/finder?lank=pub-note_VIDEO" data-video="webpubvid://note">Image Video</a>.</p></div>
			</div>
		</div>
	</div>
`;

const currentWatchtowerTopicHtml = `
	<div id="article">
		<header>
			<div id="tt2">
				<p class="contextTtl"><strong>Study Article 3</strong></p>
			</div>
			<div id="tt4">
				<p class="pubRefs"><a href="/es/wol/pc/r4/lp-s/topic/0/0"><strong>CANCIÓN 4</strong></a> Song title</p>
			</div>
			<h1><strong>Current topic article</strong></h1>
		</header>
		<div id="tt8">
			<p class="themeScrp">Current theme scripture</p>
		</div>
		<div id="tt10">
			<p class="pubRefs"><strong>TEMA</strong></p>
			<p class="pubRefs">Current stencil article topic.</p>
		</div>
		<div class="bodyTxt"></div>
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
	it('preserves Christian Living content order, structure, media, and external links', async () => {
		const christianLivingHtml = `
			<div class="bodyTxt">
				<h3 id="p3">Starting Song</h3>
				<h3 class="dc-icon--music">Middle Song</h3>
				<h3>7. Christian Living Assignment</h3>
				<div>
					<div class="du-color--textSubdued"><p>(15 min.) Discussion.</p></div>
					<p>Consider <a href="/es/wol/bc/r4/lp-s/123">John 3:16</a>.</p>
				</div>
				<div id="f2"><figure><img src="/image.jpg" alt="Illustration" /><figcaption>Caption</figcaption></figure></div>
				<div>
					<p><a href="https://www.jw.org/finder?lank=pub-test_VIDEO" data-video="webpubvid://test"><strong>Play VIDEO</strong></a> Video title.</p>
					<ul>
						<li><p>Read <a href="/es/wol/pc/r4/lp-s/456">w25.01 10</a>.</p></li>
						<li><p><a href="https://donate.jw.org/">External resource</a></p></li>
					</ul>
				</div>
				<h3>8. Congregation Bible Study</h3>
				<div><p>(30 min.) Study.</p></div>
				<h3>Closing Song</h3>
			</div>
		`;

		const parsed = await extractChristianLivingV2({ html: christianLivingHtml });
		const plainText = extractChristianLiving({ html: christianLivingHtml })[0].contents;

		expect(parsed).toEqual([
			{
				sectionNumber: 7,
				timeBox: 15,
				headline: 'Christian Living Assignment',
				plainText: expect.any(String),
				content: [
					{
						kind: 'text',
						payload: {
							text: 'Consider John 3:16.',
							textWithCitations: 'Consider [[cite:1]].',
							citations: [
								expect.objectContaining({
									mnemonic: 'John 3:16',
									contents: 'Parsed reference contents',
								}),
							],
							externalLinks: [],
						},
					},
					{
						kind: 'illustration',
						payload: {
							src: 'https://wol.jw.org/image.jpg',
							alt: 'Illustration',
							caption: 'Caption',
						},
					},
					{
						kind: 'video',
						payload: {
							text: 'Play VIDEO Video title.',
							textWithCitations: 'Play VIDEO Video title.',
							citations: [],
							externalLinks: [],
							label: 'Play VIDEO',
							title: 'Video title',
							url: 'https://www.jw.org/finder?lank=pub-test_VIDEO',
						},
					},
					{
						kind: 'list',
						payload: {
							items: [
								{
									content: [
										{
											kind: 'text',
											payload: expect.objectContaining({
												text: 'Read w25.01 10.',
												textWithCitations: 'Read [[cite:1]].',
												externalLinks: [],
											}),
										},
									],
								},
								{
									content: [
										{
											kind: 'text',
											payload: {
												text: 'External resource',
												textWithCitations: 'External resource',
												citations: [],
												externalLinks: [
													{ text: 'External resource', url: 'https://donate.jw.org/' },
												],
											},
										},
									],
								},
							],
						},
					},
				],
			},
		]);
		expect(parsed[0].plainText).toBe(plainText);
	});

	it('keeps Watchtower v1 paragraphs stable while v2 exposes natural article flow and associations', async () => {
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

		const v2 = await extractArticleContentsV2({ html: watchtowerFlowHtml });

		expect(v2).toMatchObject({
			articleNumber: 'Study Article 2',
			articleTitle: 'Flow article title',
			articleThemeScrip: 'Flow theme scripture',
			articleTopic: 'Flow article topic',
		});
		expect(v2).not.toHaveProperty('contents');
		expect(v2).not.toHaveProperty('teachBlock');
		expect(v2).not.toHaveProperty('questions');
		expect(v2.content.map((item) => item.kind)).toEqual([
			'sectionHeading',
			'question',
			'paragraph',
			'illustration',
			'boxSupplement',
			'boxSupplement',
			'teachBlock',
			'footnote',
			'footnote',
		]);

		expect(v2.content[0]).toEqual({
			kind: 'sectionHeading',
			payload: {
				text: 'SECTION HEADING',
			},
		});
		expect(v2.content[1]).toMatchObject({
			kind: 'question',
			payload: {
				pNumbers: [1],
				rawQuestionTxt: '1. What does the Question Box show?',
				questionParts: [{ text: 'What does the Question Box show?' }],
				questionTextIfSingle: 'What does the Question Box show?',
			},
		});
		expect(v2.content[2]).toMatchObject({
			kind: 'paragraph',
			payload: {
				number: 1,
				text: '1 Paragraph cites Bible Ref and mentions the Paragraph Box.a',
				textWithCitations: '1 Paragraph cites [[cite:1]] and mentions the Paragraph Box.a',
				citations: [
					expect.objectContaining({
						id: 1,
						marker: '[[cite:1]]',
						mnemonic: 'Bible Ref',
						contents: 'Parsed reference contents',
					}),
				],
			},
		});
		expect(v2.content[3]).toEqual({
			kind: 'illustration',
			payload: {
				src: 'https://wol.jw.org/flow.jpg',
				alt: 'Flow illustration',
				caption: 'Flow caption (mira el párrafo 1).b',
				paragraphNumbers: [1],
			},
		});
		expect(v2.content[4]).toMatchObject({
			kind: 'boxSupplement',
			payload: {
				title: 'Question Box',
				content: [
					{
						kind: 'text',
						payload: expect.objectContaining({
							text: 'Question box text cites Pub Ref.',
							textWithCitations: 'Question box text cites [[cite:1]].',
							citations: [expect.objectContaining({ mnemonic: 'Pub Ref' })],
						}),
					},
				],
			},
		});
		expect(v2.content[5]).toMatchObject({
			kind: 'boxSupplement',
			payload: {
				title: 'Paragraph Box',
				content: [
					{
						kind: 'text',
						payload: expect.objectContaining({
							externalLinks: [{ text: 'External resource', url: 'https://example.com/resource' }],
							videos: [
								{
									text: 'Play video',
									label: 'Play video',
									title: 'Video Title',
									url: 'https://www.jw.org/finder?lank=pub-test_VIDEO',
								},
							],
						}),
					},
				],
			},
		});
		expect(v2.content[7]).toMatchObject({
			kind: 'footnote',
			payload: {
				marker: 'a',
				text: 'Footnote cites Article Ref.',
				textWithCitations: 'Footnote cites [[cite:1]].',
				citations: [expect.objectContaining({ mnemonic: 'Article Ref' })],
			},
		});
		expect(v2.content[8]).toMatchObject({
			kind: 'footnote',
			payload: {
				marker: 'b',
				videos: [
					{
						text: 'Image Video',
						label: 'Image Video',
						title: 'Image Video',
						url: 'https://www.jw.org/finder?lank=pub-note_VIDEO',
					},
				],
			},
		});
		expect(v2.indexReferences).toEqual({
			questions: [
				{
					questionIndex: 1,
					sectionHeadingIndex: 0,
					relevantParagraphIndexes: [2],
					relevantIllustrationIndexes: [3],
					relevantBoxSupplementIndexes: [4, 5],
					relevantFootnoteIndexes: [7, 8],
				},
			],
			footnotes: [
				{ sourceIndex: 2, targetIndex: 7, marker: 'a' },
				{ sourceIndex: 3, targetIndex: 8, marker: 'b' },
			],
			boxSupplements: [
				{ sourceIndex: 1, targetIndex: 4, title: 'Question Box' },
				{ sourceIndex: 2, targetIndex: 5, title: 'Paragraph Box' },
			],
		});
		expect(v2.content[1].payload).not.toHaveProperty('citations');
		expect(v2.content[1].payload).not.toHaveProperty('externalLinks');
		expect(v2.content[1].payload).not.toHaveProperty('videos');
		expect(v2.content[1].payload).not.toHaveProperty('boxSupplementRefs');
		expect(v2.content[2].payload).not.toHaveProperty('footnoteRefs');
		expect(v2.content[2].payload).not.toHaveProperty('boxSupplementRefs');
		expect(v2.content[2].payload).not.toHaveProperty('questionPids');
		expect(v2.content[3].payload).not.toHaveProperty('footnoteRefs');
		expect(v2.content[4].payload).not.toHaveProperty('pid');
		expect(v2.content[5].payload).not.toHaveProperty('pid');
		expect(v2.indexReferences.questions[0]).not.toHaveProperty('relevantVideoIndexes');
	});

	it('extracts Watchtower articleTopic from the current metadata block in v1 and v2', async () => {
		const v1 = await extractArticleContents({ html: currentWatchtowerTopicHtml });
		const v2 = await extractArticleContentsV2({ html: currentWatchtowerTopicHtml });

		expect(v1.articleTopic).toBe('Current stencil article topic.');
		expect(v2.articleTopic).toBe('Current stencil article topic.');
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

	it('includes embedded video anchors inside treasures talk callout citations', async () => {
		const mwbHybridCalloutHtml = `
			<div id="article">
				<div id="tt9">
					<h3>1. Treasures Talk</h3>
					<div id="tt11">
						<div><p class="du-color--textSubdued">(10 min.)</p></div>
						<hr />
						<p><span><strong>SUGERENCIA PARA LA ADORACIÓN EN FAMILIA:</strong></span> Vean el <a href="https://www.jw.org/finder?lank=pub-jwb-098_7_VIDEO&amp;wtlocale=S" data-video="webpubvid://?pub=jwb-098&amp;track=7&amp;langwritten=S"><strong>VIDEO</strong></a> <em>Compren un campo en Anatot</em> y hablen sobre cómo la instrucción que Jehová le dio a Jeremías fortaleció su fe y cómo puede fortalecer la nuestra (<a href="/es/wol/d/r4/lp-s/456">Jer 32:6-8</a>).</p>
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

		const parsed = await extractTreasuresTalkV2({ html: mwbHybridCalloutHtml });

		expect(parsed.content).toEqual([
			{
				kind: 'callout',
				payload: {
					label: 'SUGERENCIA PARA LA ADORACIÓN EN FAMILIA',
					text: 'SUGERENCIA PARA LA ADORACIÓN EN FAMILIA: Vean el VIDEO Compren un campo en Anatot y hablen sobre cómo la instrucción que Jehová le dio a Jeremías fortaleció su fe y cómo puede fortalecer la nuestra (Jer 32:6-8).',
					textWithCitations:
						'SUGERENCIA PARA LA ADORACIÓN EN FAMILIA: Vean el [[cite:1]] Compren un campo en Anatot y hablen sobre cómo la instrucción que Jehová le dio a Jeremías fortaleció su fe y cómo puede fortalecer la nuestra ([[cite:2]]).',
					citations: [
						{
							id: 1,
							marker: '[[cite:1]]',
							mnemonic: 'VIDEO',
							referenceType: 'video',
							itemTitle: 'Compren un campo en Anatot',
							contents: 'Compren un campo en Anatot',
							url: 'https://www.jw.org/finder?lank=pub-jwb-098_7_VIDEO&wtlocale=S',
						},
						expect.objectContaining({
							id: 2,
							marker: '[[cite:2]]',
							mnemonic: 'Jer 32:6-8',
							contents: 'Parsed reference contents',
						}),
					],
				},
			},
		]);
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
