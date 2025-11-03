import express, { NextFunction, Request, Response } from 'express';
import { fetchThisWeekWatchtowerHtml } from '../data-fetching/wol-pages.js';
import { addGetAndPostScrappingRoute, opErrored } from '../kernel/index.js';
import { AppError } from '../kernel/app-error.js';
import { extractArticleContents } from '../scrappers/pub-w/pub-w.js';
import { TEST_HOOK } from '../test-helpers/test-hook.js';
import { createFromUrlHandler } from '../data-fetching/router-helpers.js';
import { getAndValidateWolUrl } from './validators.js';

export const pubWRouter = express();

pubWRouter.get('/html', async (_: Request, res: Response, next: NextFunction) => {
	const opRes = await fetchThisWeekWatchtowerHtml();
	if (opErrored(opRes)) {
		return next(new AppError(opRes.err.message, 500, opRes.err));
	}
	res.json({ html: opRes.res });
});

const handleFromUrl = createFromUrlHandler(extractArticleContents, getAndValidateWolUrl);

/**
 * GET/POST /pub-w/from-url
 * Accepts a WOL article URL (query or JSON body) and returns parsed Watchtower data.
 * - GET  /pub-w/from-url?url=...
 * - POST /pub-w/from-url { url: "..." }
 */
pubWRouter.route('/from-url').get(handleFromUrl).post(handleFromUrl);

(pubWRouter as any)[TEST_HOOK] = { handleFromUrl };

addGetAndPostScrappingRoute({
	router: pubWRouter,
	path: '/',
	defaultHtmlGenerator: fetchThisWeekWatchtowerHtml,
	scrapperOperation: extractArticleContents,
});
