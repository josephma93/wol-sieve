import express, { NextFunction, Request, Response } from 'express';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../kernel/app-error.js';

const mocks = vi.hoisted(() => ({
	buildDefaultLfbLinks: vi.fn(),
	buildDefaultNwtstyLinks: vi.fn(),
	clusterBiblicalPassageEntriesV2: vi.fn(),
	extractArticleContentsV2: vi.fn(),
	extractFullWeekProgramV2: vi.fn(),
	extractLfbContentsV2: vi.fn(),
	extractReferencesFromLinksV2: vi.fn(),
	extractTreasuresTalkV2: vi.fn(),
	fetchThisWeekMeetingHtml: vi.fn(),
	fetchThisWeekWatchtowerHtml: vi.fn(),
	getHtmlContent: vi.fn(),
	isValidWolBibleBookUrl: vi.fn(),
}));

vi.mock('../../data-fetching/raw.js', () => ({
	getHtmlContent: mocks.getHtmlContent,
}));

vi.mock('../../data-fetching/wol-pages.js', () => ({
	fetchThisWeekMeetingHtml: mocks.fetchThisWeekMeetingHtml,
	fetchThisWeekWatchtowerHtml: mocks.fetchThisWeekWatchtowerHtml,
}));

vi.mock('../../scrappers/pub-w/pub-w.js', () => ({
	extractArticleContentsV2: mocks.extractArticleContentsV2,
}));

vi.mock('../../scrappers/pub-mwb/pub-mwb.js', () => ({
	extractFullWeekProgramV2: mocks.extractFullWeekProgramV2,
	extractTreasuresTalkV2: mocks.extractTreasuresTalkV2,
}));

vi.mock('../../scrappers/pub-nwtsty/extras.js', () => ({
	buildDefaultLinks: mocks.buildDefaultNwtstyLinks,
	isValidWolBibleBookUrl: mocks.isValidWolBibleBookUrl,
}));

vi.mock('../../scrappers/pub-nwtsty/pub-nwtsty.js', () => ({
	extractReferencesFromLinksV2: mocks.extractReferencesFromLinksV2,
}));

vi.mock('../../services/pub-nwtsty.js', () => ({
	clusterBiblicalPassageEntriesV2: mocks.clusterBiblicalPassageEntriesV2,
}));

vi.mock('../../scrappers/pub-lfb/pub-lfb.js', () => ({
	buildDefaultLinks: mocks.buildDefaultLfbLinks,
	extractLfbContentsV2: mocks.extractLfbContentsV2,
}));

import { v2Router } from './index.js';

const nwtstyUrl1 = 'https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70';
const nwtstyUrl2 = 'https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/71';
const lfbUrl1 = 'https://wol.jw.org/es/wol/d/r4/lp-s/1102016021';
const lfbUrl2 = 'https://wol.jw.org/es/wol/d/r4/lp-s/1102016022';

interface TestResponse {
	status: number;
	body: unknown;
	contentType: string;
	text: string;
}

function createTestApp() {
	const app = express();
	app.use(express.json());
	app.use('/v2', v2Router);
	app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
		if (err instanceof AppError) {
			res.status(err.statusCode).json({
				status: err.status,
				message: err.message,
				...(err.details && { details: err.details }),
			});
			return;
		}

		res.status(500).json({ status: 'error', message: err.message });
	});
	return app;
}

async function closeServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}

			resolve();
		});
	});
}

async function request(path: string, init?: RequestInit): Promise<TestResponse> {
	const server = createTestApp().listen(0);
	try {
		const { port } = server.address() as AddressInfo;
		const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
		const contentType = response.headers.get('content-type') ?? '';
		const text = await response.text();
		const body = contentType.includes('application/json') ? JSON.parse(text) : text;
		return { status: response.status, body, contentType, text };
	} finally {
		await closeServer(server);
	}
}

function encodeQueryUrl(url: string): string {
	return encodeURIComponent(url);
}

beforeEach(() => {
	vi.clearAllMocks();

	mocks.fetchThisWeekWatchtowerHtml.mockResolvedValue({ err: null, res: 'default-watchtower-html' });
	mocks.fetchThisWeekMeetingHtml.mockResolvedValue({ err: null, res: 'default-meeting-html' });
	mocks.getHtmlContent.mockImplementation(async (url: string) => ({ err: null, res: `html:${url}` }));

	mocks.extractArticleContentsV2.mockImplementation(async ({ html }: { html: string }) => ({
		kind: 'watchtower',
		html,
	}));
	mocks.extractFullWeekProgramV2.mockImplementation(async ({ html }: { html: string }) => ({
		kind: 'meeting',
		html,
	}));
	mocks.extractTreasuresTalkV2.mockImplementation(async ({ html }: { html: string }) => ({
		kind: 'treasures-talk',
		html,
	}));

	mocks.buildDefaultNwtstyLinks.mockResolvedValue({ err: null, res: [nwtstyUrl1] });
	mocks.isValidWolBibleBookUrl.mockImplementation((url: string) => {
		return url.startsWith('https://wol.jw.org/') && url.includes('/nwtsty/');
	});
	mocks.extractReferencesFromLinksV2.mockImplementation(async (links: string[]) => ({
		errors: [],
		results: links.map((link) => ({
			link,
			sharedReferences: {
				'ref:1': {
					mnemonic: 'Ref A',
					referenceType: 'pub-w',
					issueName: 'Issue source',
					itemTitle: 'Item title',
					contents: 'Parsed reference contents',
				},
			},
			entries: [{ mnemonic: link, scripture: 'scripture', citations: [], citationTokenCount: 10 }],
		})),
	}));
	mocks.clusterBiblicalPassageEntriesV2.mockImplementation(
		(results: { link: string; sharedReferences: Record<string, unknown> }[], tokenLimit: number) => {
			return results.map(({ link, sharedReferences }) => ({ link, sharedReferences, tokenLimit, clusters: [] }));
		},
	);

	mocks.buildDefaultLfbLinks.mockResolvedValue({ err: null, res: [lfbUrl1] });
	mocks.extractLfbContentsV2.mockImplementation(async ({ html }: { html: string }) => ({
		type: 'LESSON',
		contents: { html },
	}));
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('/v2', () => {
	it('serves an HTML endpoint index with clickable v2 links', async () => {
		const response = await request('/v2/');
		const body = String(response.body);

		expect(response.status).toBe(200);
		expect(response.contentType).toContain('text/html');
		expect(body).toContain('<h1>wol-sieve v2</h1>');
		expect(body).toContain('href="/v2/pub-w/"');
		expect(body).toContain('href="/v2/pub-mwb/treasures-talk"');
		expect(body).toContain('href="/v2/pub-nwtsty/grouped');
		expect(body).toContain('href="/v2/pub-lfb/');
		expect(mocks.fetchThisWeekWatchtowerHtml).not.toHaveBeenCalled();
		expect(mocks.fetchThisWeekMeetingHtml).not.toHaveBeenCalled();
	});

	it('does not apply pretty JSON validation to the HTML endpoint index', async () => {
		const response = await request('/v2/?pretty=false');
		const body = String(response.body);

		expect(response.status).toBe(200);
		expect(response.contentType).toContain('text/html');
		expect(body).toContain('<h1>wol-sieve v2</h1>');
		expect(mocks.fetchThisWeekWatchtowerHtml).not.toHaveBeenCalled();
		expect(mocks.fetchThisWeekMeetingHtml).not.toHaveBeenCalled();
	});
});

describe('/v2 pretty JSON', () => {
	it('formats JSON endpoint responses with FracturedJson when pretty is present', async () => {
		const response = await request(
			`/v2/pub-lfb/?urls=${encodeQueryUrl(lfbUrl1)}&urls=${encodeQueryUrl(lfbUrl2)}&pretty`,
		);

		expect(response.status).toBe(200);
		expect(response.contentType).toContain('application/json');
		expect(response.body).toEqual({
			results: [
				{ link: lfbUrl1, type: 'LESSON', contents: { html: `html:${lfbUrl1}` } },
				{ link: lfbUrl2, type: 'LESSON', contents: { html: `html:${lfbUrl2}` } },
			],
		});
		expect(response.text).toContain('\n');
		expect(response.text).toContain('"results"');
		expect(response.text).not.toBe(JSON.stringify(response.body));
	});

	it('accepts explicit pretty enable values', async () => {
		const trueResponse = await request('/v2/pub-w/?pretty=true');
		const oneResponse = await request('/v2/pub-w/?pretty=1');

		expect(trueResponse.status).toBe(200);
		expect(trueResponse.body).toEqual({ kind: 'watchtower', html: 'default-watchtower-html' });
		expect(oneResponse.status).toBe(200);
		expect(oneResponse.body).toEqual({ kind: 'watchtower', html: 'default-watchtower-html' });
		expect(mocks.fetchThisWeekWatchtowerHtml).toHaveBeenCalledTimes(2);
	});

	it('rejects unsupported pretty values before endpoint work starts', async () => {
		const response = await request('/v2/pub-w/?pretty=false');

		expect(response.status).toBe(400);
		expect(response.body).toMatchObject({
			status: 'fail',
			message: 'Invalid pretty parameter.',
			details: { allowed_values: ['?pretty', '?pretty=true', '?pretty=1'] },
		});
		expect(mocks.fetchThisWeekWatchtowerHtml).not.toHaveBeenCalled();
		expect(mocks.getHtmlContent).not.toHaveBeenCalled();
	});
});

describe('/v2/pub-w', () => {
	it('uses the default Watchtower HTML when url is absent', async () => {
		const response = await request('/v2/pub-w/');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ kind: 'watchtower', html: 'default-watchtower-html' });
		expect(mocks.fetchThisWeekWatchtowerHtml).toHaveBeenCalledTimes(1);
		expect(mocks.getHtmlContent).not.toHaveBeenCalled();
	});

	it('fetches and scrapes the provided WOL url', async () => {
		const url = 'https://wol.jw.org/es/wol/d/r4/lp-s/2025521';
		const response = await request(`/v2/pub-w/?url=${encodeQueryUrl(url)}`);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ kind: 'watchtower', html: `html:${url}` });
		expect(mocks.fetchThisWeekWatchtowerHtml).not.toHaveBeenCalled();
		expect(mocks.getHtmlContent).toHaveBeenCalledWith(url);
	});

	it('rejects non-WOL urls', async () => {
		const response = await request('/v2/pub-w/?url=https%3A%2F%2Fexample.com%2Farticle');

		expect(response.status).toBe(400);
		expect(response.body).toMatchObject({
			status: 'fail',
			message: 'Missing or invalid URL parameter.',
		});
		expect(mocks.getHtmlContent).not.toHaveBeenCalled();
	});

	it('does not expose from-url or POST', async () => {
		const fromUrlResponse = await request('/v2/pub-w/from-url');
		const postResponse = await request('/v2/pub-w/', { method: 'POST' });

		expect(fromUrlResponse.status).toBe(404);
		expect(postResponse.status).toBe(404);
	});
});

describe('/v2/pub-mwb', () => {
	it('uses the default meeting HTML for the full program', async () => {
		const response = await request('/v2/pub-mwb/');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ kind: 'meeting', html: 'default-meeting-html' });
		expect(mocks.fetchThisWeekMeetingHtml).toHaveBeenCalledTimes(1);
	});

	it('fetches the provided WOL url for the full program', async () => {
		const url = 'https://wol.jw.org/es/wol/d/r4/lp-s/202025325';
		const response = await request(`/v2/pub-mwb/?url=${encodeQueryUrl(url)}`);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ kind: 'meeting', html: `html:${url}` });
		expect(mocks.getHtmlContent).toHaveBeenCalledWith(url);
	});

	it('exposes treasures-talk as a clean route only', async () => {
		const response = await request('/v2/pub-mwb/treasures-talk');
		const oldRouteResponse = await request('/v2/pub-mwb/scrappers/treasures-talk');

		expect(response.status).toBe(200);
		expect(response.body).toEqual({ kind: 'treasures-talk', html: 'default-meeting-html' });
		expect(oldRouteResponse.status).toBe(404);
	});
});

describe('/v2/pub-nwtsty', () => {
	it('uses repeated urls query params and ignores links', async () => {
		const response = await request(
			`/v2/pub-nwtsty/?urls=${encodeQueryUrl(nwtstyUrl1)}&urls=${encodeQueryUrl(nwtstyUrl2)}&links=ignored`,
		);

		expect(response.status).toBe(200);
		expect(mocks.extractReferencesFromLinksV2).toHaveBeenCalledWith([nwtstyUrl1, nwtstyUrl2]);
		expect(mocks.buildDefaultNwtstyLinks).not.toHaveBeenCalled();
	});

	it('treats links as absent rather than as an alias for urls', async () => {
		const response = await request(`/v2/pub-nwtsty/?links=${encodeQueryUrl(nwtstyUrl2)}`);

		expect(response.status).toBe(200);
		expect(mocks.buildDefaultNwtstyLinks).toHaveBeenCalledTimes(1);
		expect(mocks.extractReferencesFromLinksV2).toHaveBeenCalledWith([nwtstyUrl1]);
	});

	it('groups references with the requested tokenLimit', async () => {
		const response = await request(
			`/v2/pub-nwtsty/grouped?urls=${encodeQueryUrl(nwtstyUrl1)}&urls=${encodeQueryUrl(
				nwtstyUrl2,
			)}&tokenLimit=1000`,
		);

		expect(response.status).toBe(200);
		expect(mocks.clusterBiblicalPassageEntriesV2).toHaveBeenCalledWith(expect.any(Array), 1000);
		expect(response.body).toEqual([
			{
				link: nwtstyUrl1,
				sharedReferences: {
					'ref:1': {
						mnemonic: 'Ref A',
						referenceType: 'pub-w',
						issueName: 'Issue source',
						itemTitle: 'Item title',
						contents: 'Parsed reference contents',
					},
				},
				tokenLimit: 1000,
				clusters: [],
			},
			{
				link: nwtstyUrl2,
				sharedReferences: {
					'ref:1': {
						mnemonic: 'Ref A',
						referenceType: 'pub-w',
						issueName: 'Issue source',
						itemTitle: 'Item title',
						contents: 'Parsed reference contents',
					},
				},
				tokenLimit: 1000,
				clusters: [],
			},
		]);
	});
});

describe('/v2/pub-lfb', () => {
	it('uses urls query params to fetch and extract LFB contents', async () => {
		const response = await request(`/v2/pub-lfb/?urls=${encodeQueryUrl(lfbUrl1)}&urls=${encodeQueryUrl(lfbUrl2)}`);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			results: [
				{ link: lfbUrl1, type: 'LESSON', contents: { html: `html:${lfbUrl1}` } },
				{ link: lfbUrl2, type: 'LESSON', contents: { html: `html:${lfbUrl2}` } },
			],
		});
		expect(mocks.buildDefaultLfbLinks).not.toHaveBeenCalled();
		expect(mocks.getHtmlContent).toHaveBeenCalledWith(lfbUrl1);
		expect(mocks.getHtmlContent).toHaveBeenCalledWith(lfbUrl2);
	});

	it('rejects urls outside wol.jw.org', async () => {
		const response = await request('/v2/pub-lfb/?urls=https%3A%2F%2Fexample.com%2Flesson');

		expect(response.status).toBe(400);
		expect(response.body).toMatchObject({
			status: 'fail',
			message: 'Some urls are invalid',
			details: { invalid_urls: ['https://example.com/lesson'] },
		});
		expect(mocks.getHtmlContent).not.toHaveBeenCalled();
	});
});
