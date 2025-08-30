import express, { NextFunction, Request, Response } from 'express';
import { fetchThisWeekWatchtowerHtml } from '../data-fetching/wol-pages.js';
import { addGetAndPostScrappingRoute, opErrored } from '../kernel/index.js';
import { AppError } from '../kernel/app-error.js';
import { extractArticleContents } from '../scrappers/pub-w/pub-w.js';

export const pubWRouter = express();

pubWRouter.get('/html', async (_: Request, res: Response, next: NextFunction) => {
	const opRes = await fetchThisWeekWatchtowerHtml();
	if (opErrored(opRes)) {
		return next(new AppError(opRes.err.message, 500, opRes.err));
	}
	res.json({ html: opRes.res });
});

addGetAndPostScrappingRoute({
	router: pubWRouter,
	path: '/',
	defaultHtmlGenerator: fetchThisWeekWatchtowerHtml,
	scrapperOperation: extractArticleContents,
});
