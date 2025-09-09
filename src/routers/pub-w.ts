import express, { NextFunction, Request, Response } from 'express';
import { fetchThisWeekWatchtowerHtml } from '../data-fetching/wol-pages.js';
import { addGetAndPostScrappingRoute, opErrored } from '../kernel/index.js';
import { AppError } from '../kernel/app-error.js';
import { extractArticleContents } from '../scrappers/pub-w/pub-w.js';
import { getHtmlContent } from '../data-fetching/raw.js';
import { CONSTANTS } from '../kernel/constants.js';
import { TEST_HOOK } from '../test-helpers/test-hook.js';

export const pubWRouter = express();

pubWRouter.get('/html', async (_: Request, res: Response, next: NextFunction) => {
	const opRes = await fetchThisWeekWatchtowerHtml();
	if (opErrored(opRes)) {
		return next(new AppError(opRes.err.message, 500, opRes.err));
	}
	res.json({ html: opRes.res });
});

/**
 * Validates that a provided URL belongs to the WOL domain and returns it.
 */
function getAndValidateWolUrl(req: Request): string | AppError {
	const url = (req.method === 'GET' ? (req.query.url as string) : req.body?.url) as string | undefined;
	if (!url || typeof url !== 'string') {
		return new AppError('Missing or invalid URL parameter.', 400);
	}
	try {
		const parsed = new URL(url);
		const wolHost = new URL(CONSTANTS.WOL_URL).hostname;
		if (parsed.hostname !== wolHost) {
			return new AppError(`URL must belong to ${wolHost} domain.`, 400);
		}
		return url;
	} catch (e: any) {
		return new AppError(`Invalid URL: ${e.message}`, 400, e);
	}
}

/**
 * GET/POST /pub-w/from-url
 * Accepts a WOL article URL (query or JSON body) and returns parsed Watchtower data.
 * - GET  /pub-w/from-url?url=...
 * - POST /pub-w/from-url { url: "..." }
 */
pubWRouter.route('/from-url').get(handleFromUrl).post(handleFromUrl);

async function handleFromUrl(req: Request, res: Response, next: NextFunction) {
	const urlOrErr = getAndValidateWolUrl(req);
	if (urlOrErr instanceof AppError) return next(urlOrErr);

	const opRes = await getHtmlContent(urlOrErr);
	if (opErrored(opRes)) {
		return next(new AppError(opRes.err.message, 500, opRes.err));
	}

	try {
		const data = await extractArticleContents({ html: opRes.res });
		res.json(data);
	} catch (error: any) {
		next(new AppError(`Failed to extract article contents: ${error.message}`, 500, error));
	}
}

(pubWRouter as any)[TEST_HOOK] = { handleFromUrl };

addGetAndPostScrappingRoute({
	router: pubWRouter,
	path: '/',
	defaultHtmlGenerator: fetchThisWeekWatchtowerHtml,
	scrapperOperation: extractArticleContents,
});
