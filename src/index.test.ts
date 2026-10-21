import type { Express } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ startServer: vi.fn() }));

vi.mock('./kernel/index.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('./kernel/index.js')>()),
	startServer: mocks.startServer,
}));

import './index.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
	const app = mocks.startServer.mock.calls[0][0].app as Express;
	server = await new Promise<Server>((resolve) => {
		const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
	});
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('public API routes', () => {
	it('redirects the home page to the v2 endpoint index', async () => {
		const response = await fetch(baseUrl, { redirect: 'manual' });
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/v2/');
	});

	it('serves the v2 endpoint index', async () => {
		const response = await fetch(`${baseUrl}/v2/`);
		expect(response.status).toBe(200);
		expect(await response.text()).toContain('/v2/pub-mwb/');
	});

	it.each([
		'/wol/landing-html',
		'/wol/article-question-data',
		'/pub-mwb/',
		'/pub-mwb/from-url',
		'/pub-mwb/scrappers/treasures-talk',
		'/pub-w/',
		'/pub-w/html',
		'/pub-nwtsty/',
		'/pub-nwtsty/grouped',
		'/pub-lfb/',
	])('returns 404 for removed route %s with GET and POST', async (path) => {
		for (const method of ['GET', 'POST']) {
			const response = await fetch(`${baseUrl}${path}`, { method });
			expect(response.status).toBe(404);
		}
	});
});
