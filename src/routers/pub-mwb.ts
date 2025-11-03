import express, { NextFunction, Request, Response } from 'express';
import { fetchThisWeekMeetingHtml } from '../data-fetching/wol-pages.js';
import { opErrored } from '../kernel/index.js';
import { AppError } from '../kernel/app-error.js';
import {
	extractBibleRead,
	extractBibleStudy,
	extractChristianLiving,
	extractFieldMinistry,
	extractFullWeekProgram,
	extractSongData,
	extractSpiritualGems,
	extractTreasuresTalk,
	extractWeekDateSpan,
	extractWeeklyBibleRead,
} from '../scrappers/pub-mwb/pub-mwb.js';
import { ExtractionContextOptions } from '../scrappers/generics.js';
import { getHtmlContent } from '../data-fetching/raw.js';
import { TEST_HOOK } from '../test-helpers/test-hook.js';
import { createFromUrlHandler } from '../data-fetching/router-helpers.js';
import { getAndValidateWolUrl } from './validators.js';

export const pubMwbRouter = express.Router();

async function fillHtmlContent(req: Request, res: Response, next: NextFunction) {
	let html = req.body?.html;

	if (!html) {
		const opRes = await fetchThisWeekMeetingHtml();

		if (opErrored(opRes)) {
			return next(new AppError(opRes.err.message, 500, opRes.err));
		}

		html = opRes.res;
	}

	res.locals.html = html;
	next();
}

async function fetchHtmlFromSourceUrl(req: Request, _res: Response, next: NextFunction) {
	const sourceUrl = req.query.source_url as string;

	if (sourceUrl && sourceUrl.includes('wol.jw.org')) {
		const opRes = await getHtmlContent(sourceUrl);
		if (opErrored(opRes)) {
			return next(new AppError(opRes.err.message, 500, opRes.err));
		}
		req.body.html = opRes.res;
	}

	next();
}

const handleFromUrl = createFromUrlHandler(extractFullWeekProgram, getAndValidateWolUrl);

/**
 * GET/POST /pub-w/from-url
 * Accepts a WOL article URL (query or JSON body) and returns parsed Watchtower data.
 * - GET  /pub-w/from-url?url=...
 * - POST /pub-w/from-url { url: "..." }
 */
pubMwbRouter.route('/from-url').get(handleFromUrl).post(handleFromUrl);

(pubMwbRouter as any)[TEST_HOOK] = { handleFromUrl };

declare type ScrapperMethod = (input: ExtractionContextOptions) => Promise<any> | any;

function handleRequest(scrapperOperation: ScrapperMethod) {
	return async function scrapperMiddleware(_: Request, _res: Response, next: NextFunction) {
		try {
			const result = scrapperOperation({ html: _res.locals.html });
			const data = result instanceof Promise ? await result : result;
			_res.json(data);
		} catch (error: any) {
			next(new AppError(`Scrapper operation failed: ${error.message}`, 500, error));
		}
	};
}

function createRoute(path: string, scrapperOperation: ScrapperMethod) {
	pubMwbRouter
		.route(path)
		.post(fillHtmlContent, handleRequest(scrapperOperation))
		.get(fetchHtmlFromSourceUrl, fillHtmlContent, handleRequest(scrapperOperation));
}

// Now, define the routes using the createRoute function to eliminate duplication
createRoute('/', extractFullWeekProgram);
createRoute('/scrappers/week-date-span', extractWeekDateSpan);
createRoute('/scrappers/songs', extractSongData);
createRoute('/scrappers/weekly-bible-read', extractWeeklyBibleRead);
createRoute('/scrappers/treasures-talk', extractTreasuresTalk);
createRoute('/scrappers/spiritual-gems', extractSpiritualGems);
createRoute('/scrappers/bible-read-details', extractBibleRead);
createRoute('/scrappers/field-ministry', extractFieldMinistry);
createRoute('/scrappers/christian-living', extractChristianLiving);
createRoute('/scrappers/bible-study', extractBibleStudy);
