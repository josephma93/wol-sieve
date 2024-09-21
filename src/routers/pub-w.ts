import express, { Request, Response } from 'express';
import { fetchThisWeekWatchtowerHtml } from '../data-fetching/wol-pages.js';
import { addGetAndPostScrappingRoute, opErrored } from '../kernel/index.js';
import { extractArticleContents } from '../scrappers/pub-w/pub-w.js';

export const pubWRouter = express();

pubWRouter.get('/html', async (_: Request, res: Response) => {
	const opRes = await fetchThisWeekWatchtowerHtml();
	if (opErrored(opRes)) {
		return res.status(500).json({ error: opRes.err.message });
	}
	res.json({ html: opRes.res });
});

addGetAndPostScrappingRoute({
	router: pubWRouter,
	path: '/',
	defaultHtmlGenerator: fetchThisWeekWatchtowerHtml,
	scrapperOperation: extractArticleContents,
});
