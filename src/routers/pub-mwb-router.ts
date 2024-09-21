import express, { NextFunction, Request, Response } from 'express';
import { fetchThisWeekMeetingHtml } from '../data-fetching/wol-pages.js';
import { opErrored } from '../kernel/index.js';
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
import { ExtractionInput } from '../scrappers/generics.js';

export const pubMwbRouter = express.Router();

async function fillHtmlContent(req: Request, res: Response, next: NextFunction) {
	let html = req.body?.html;

	if (!html) {
		const opRes = await fetchThisWeekMeetingHtml();

		if (opErrored(opRes)) {
			return res.status(500).json({ error: opRes.err.message });
		}

		html = opRes.res;
	}

	res.locals.html = html;
	next();
}

declare type ScrapperMethod = (input: ExtractionInput) => Promise<any> | any;

function handleRequest(scrapperOperation: ScrapperMethod) {
	return async function scrapperMiddleware(_: Request, res: Response) {
		try {
			const result = scrapperOperation({ html: res.locals.html });
			const data = result instanceof Promise ? await result : result;
			res.json(data);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			res.status(500).json({ error: errorMessage });
		}
	};
}

function createRoute(path: string, scrapperOperation: ScrapperMethod) {
	pubMwbRouter
		.route(path)
		.post(fillHtmlContent, handleRequest(scrapperOperation))
		.get(fillHtmlContent, handleRequest(scrapperOperation));
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
