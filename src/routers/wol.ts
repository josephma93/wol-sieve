import express, { Request, Response, NextFunction } from 'express';
import { fetchLanguageSpecificLandingHtml, fetchThisWeekMeetingHtml } from '../data-fetching/wol-pages.js';
import { opErrored } from '../kernel/index.js';
import { logger } from '../kernel/index.js';
import {
	extractArticleQuestionData,
	extractArticleRelatedParagraphData,
} from '../data-extraction/article-extractor.js';
import { CONSTANTS } from '../kernel/index.js';

const log = logger.child({ ...logger.bindings(), label: 'wol-router' });

export const wolRouter = express();

declare module 'express' {
	interface Request {
		wolUrl?: string;
	}
}

/**
 * Fetches the configured language specific landing page HTML from the WOL website.
 */
wolRouter.get('/landing-html', async (_: Request, res: Response) => {
	const opRes = await fetchLanguageSpecificLandingHtml();
	if (opErrored(opRes)) {
		return res.status(500).json({ error: opRes.err.message });
	}
	res.json({ html: opRes.res });
});

/**
 * Fetches the HTML for this week's meeting using the language specific setting.
 */
wolRouter.get('/mid-week-program-html', async (_: Request, res: Response) => {
	const opRes = await fetchThisWeekMeetingHtml();
	if (opErrored(opRes)) {
		return res.status(500).json({ error: opRes.err.message });
	}
	res.json({ html: opRes.res });
});

/**
 * Middleware to validate the 'url' query parameter for WOL domain.
 * Attaches the validated URL string to req.wolUrl.
 */
function validateWolUrl(req: Request, res: Response, next: NextFunction) {
	const { url } = req.query;

	if (!url || typeof url !== 'string') {
		return res.status(400).json({ error: 'Missing or invalid URL parameter.' });
	}

	try {
		const articleUrl = new URL(url);

		if (articleUrl.hostname !== new URL(CONSTANTS.WOL_URL).hostname) {
			return res.status(400).json({ error: `URL must belong to ${new URL(CONSTANTS.WOL_URL).hostname} domain.` });
		}

		req.wolUrl = url;

		next();
	} catch (error: any) {
		res.status(500).json({ error: `An unexpected error occurred during URL validation: ${error.message}` });
	}
}

/**
 * Fetches article question data from a given WOL URL.
 */
wolRouter.get('/article-question-data', validateWolUrl, async (req: Request, res: Response) => {
	log.info('Received request for /article-question-data', { query: req.query });
	const url = req.wolUrl as string;

	try {
		const extractedDataOpRes = await extractArticleQuestionData(url);

		if (opErrored(extractedDataOpRes)) {
			return res.status(500).json({ error: extractedDataOpRes.err.message });
		}

		const extractedData = extractedDataOpRes.res;
		log.info(`Successfully extracted ${extractedData.length} question items.`);
		res.json(extractedData);
	} catch (error: any) {
		log.error(`An unexpected error occurred in /article-question-data handler: ${error.message}`, { error, url });
		res.status(500).json({ error: `An unexpected error occurred: ${error.message}` });
	}
});

/**
 * Fetches related data elements for given PIDs from a WOL article URL.
 */
wolRouter.get('/article-paragraph-data', validateWolUrl, async (req: Request, res: Response) => {
	log.info('Received request for /article-paragraph-data', { query: req.query });
	const url = req.wolUrl as string;
	const { relatedPids } = req.query;

	if (!relatedPids || (typeof relatedPids !== 'string' && !Array.isArray(relatedPids))) {
		log.warn('Missing or invalid relatedPids parameter', { relatedPids });
		return res
			.status(400)
			.json({ error: 'Missing or invalid relatedPids parameter (should be comma-separated string or array).' });
	}

	const relatedPidArray = (
		Array.isArray(relatedPids) ? relatedPids : relatedPids.split(',').map((pid) => pid.trim())
	) as string[];
	log.debug('Parsed relatedPids into array', { relatedPidArray });

	try {
		const extractedDataOpRes = await extractArticleRelatedParagraphData(url, relatedPidArray);

		if (opErrored(extractedDataOpRes)) {
			return res.status(500).json({ error: extractedDataOpRes.err.message });
		}

		const extractedData = extractedDataOpRes.res;
		log.info(`Successfully extracted ${extractedData.length} related paragraph items.`);
		res.json(extractedData);
	} catch (error: any) {
		log.error(`An unexpected error occurred in /article-paragraph-data handler: ${error.message}`, {
			error,
			url,
			relatedPids,
		});
		res.status(500).json({ error: `An unexpected error occurred: ${error.message}` });
	}
});
