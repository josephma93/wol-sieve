import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchThisWeekMeetingHtml, fetchThisWeekWatchtowerHtml } from './wol-pages.js';

const logMocks = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../kernel/logger.js', async (importOriginal) => {
	const original = await importOriginal<typeof import('../kernel/logger.js')>();
	return { ...original, logger: { ...logMocks, bindings: () => ({}), child: () => logMocks } };
});

const meetingsUrl = 'https://wol.jw.org/es/wol/meetings/r4/lp-s';
const meetingsHtml = `
<nav id="materialNav">
<a class="pub-mwb cardLine1Prominent" href="/es/wol/d/r4/lp-s/202026258">Meeting</a>
<a class="pub-w cardLine1Prominent" href="/es/wol/d/r4/lp-s/2026522">Watchtower</a>
</nav>`;

const sources = [
	{ name: 'meeting', retrieve: fetchThisWeekMeetingHtml, path: '/es/wol/d/r4/lp-s/202026258' },
	{ name: 'Watchtower', retrieve: fetchThisWeekWatchtowerHtml, path: '/es/wol/d/r4/lp-s/2026522' },
];

afterEach(() => vi.unstubAllGlobals());

describe.each(sources)('current $name source', ({ retrieve, path }) => {
	it('fetches the weekly index and the selected article with two requests', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(meetingsHtml))
			.mockResolvedValueOnce(new Response('<article>Selected publication</article>'));
		vi.stubGlobal('fetch', fetchMock);

		expect(await retrieve()).toEqual({ err: null, res: '<article>Selected publication</article>' });
		expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([meetingsUrl, `https://wol.jw.org${path}`]);
	});

	it('propagates a weekly index failure without another request', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }));
		vi.stubGlobal('fetch', fetchMock);
		const result = await retrieve();
		expect(result.err).toBeInstanceOf(Error);
		expect(result.res).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('reports an absent publication link without fetching another page', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(new Response('<nav id="materialNav"></nav>'));
		vi.stubGlobal('fetch', fetchMock);
		expect((await retrieve()).err).toBeInstanceOf(Error);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('propagates an article failure', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(new Response(meetingsHtml))
				.mockResolvedValueOnce(new Response('', { status: 503 })),
		);
		expect((await retrieve()).err).toBeInstanceOf(Error);
	});
});
