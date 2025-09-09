import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock upstream dependencies to avoid network and heavy parsing
vi.mock('../data-fetching/raw.js', () => ({
	getHtmlContent: vi.fn(),
}));

vi.mock('../scrappers/pub-w/pub-w.js', () => ({
	extractArticleContents: vi.fn(),
}));

import { pubWRouter } from './pub-w.js';
import { TEST_HOOK } from '../test-helpers/test-hook.js';
import { getHtmlContent } from '../data-fetching/raw.js';
import { extractArticleContents } from '../scrappers/pub-w/pub-w.js';

function createReq(options: Partial<Pick<Request, 'method' | 'query' | 'body'>>): Request {
	return {
		method: options.method ?? 'GET',
		query: options.query ?? {},
		body: options.body ?? {},
	} as unknown as Request;
}

function createRes() {
	const json = vi.fn();
	const res = { json } as unknown as Response & { json: ReturnType<typeof vi.fn> };
	return { res, json };
}

function createNext() {
	return vi.fn() as unknown as NextFunction;
}

describe('/pub-w/from-url handler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 400 via next if url is missing', async () => {
		const req = createReq({ method: 'GET', query: {} });
		const { res } = createRes();
		const next = createNext();

		const hook = (pubWRouter as any)[TEST_HOOK];
		await hook.handleFromUrl(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
		const err = (next as any).mock.calls[0][0];
		expect(err).toBeInstanceOf(Error);
		expect(err.statusCode).toBe(400);
	});

	it('returns 400 via next if url has wrong domain', async () => {
		const req = createReq({ method: 'GET', query: { url: 'https://example.com/foo' } });
		const { res } = createRes();
		const next = createNext();

		const hook = (pubWRouter as any)[TEST_HOOK];
		await hook.handleFromUrl(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
		const err = (next as any).mock.calls[0][0];
		expect(err).toBeInstanceOf(Error);
		expect(err.statusCode).toBe(400);
	});

	it('parses a valid GET url and returns JSON', async () => {
		(getHtmlContent as any).mockResolvedValue({ err: null, res: '<html><body>ok</body></html>' });
		const fakeOutput = { articleNumber: '1', contents: [] };
		(extractArticleContents as any).mockResolvedValue(fakeOutput);

		const req = createReq({ method: 'GET', query: { url: 'https://wol.jw.org/es/wol/d/r4/lp-s/2025521' } });
		const { res, json } = createRes();
		const next = createNext();

		const hook = (pubWRouter as any)[TEST_HOOK];
		await hook.handleFromUrl(req, res, next);

		expect(next).not.toHaveBeenCalled();
		expect(getHtmlContent).toHaveBeenCalledWith('https://wol.jw.org/es/wol/d/r4/lp-s/2025521');
		expect(extractArticleContents).toHaveBeenCalledWith({ html: '<html><body>ok</body></html>' });
		expect(json).toHaveBeenCalledWith(fakeOutput);
	});

	it('parses a valid POST url and returns JSON', async () => {
		(getHtmlContent as any).mockResolvedValue({ err: null, res: '<html>post</html>' });
		const fakeOutput = { articleNumber: '2', contents: [{ pNumbers: [1], paragraphs: [] }] };
		(extractArticleContents as any).mockResolvedValue(fakeOutput);

		const req = createReq({ method: 'POST', body: { url: 'https://wol.jw.org/es/wol/d/r4/lp-s/2025521' } });
		const { res, json } = createRes();
		const next = createNext();

		const hook = (pubWRouter as any)[TEST_HOOK];
		await hook.handleFromUrl(req, res, next);

		expect(next).not.toHaveBeenCalled();
		expect(getHtmlContent).toHaveBeenCalled();
		expect(json).toHaveBeenCalledWith(fakeOutput);
	});

	it('forwards fetch errors via next as 500', async () => {
		(getHtmlContent as any).mockResolvedValue({ err: new Error('boom'), res: null });

		const req = createReq({ method: 'GET', query: { url: 'https://wol.jw.org/es/wol/d/r4/lp-s/2025521' } });
		const { res } = createRes();
		const next = createNext();

		const hook = (pubWRouter as any)[TEST_HOOK];
		await hook.handleFromUrl(req, res, next);

		expect(next).toHaveBeenCalledTimes(1);
		const err = (next as any).mock.calls[0][0];
		expect(err).toBeInstanceOf(Error);
		expect(err.statusCode).toBe(500);
	});
});
