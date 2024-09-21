import express, { Request, Response } from 'express';
import { fetchLanguageSpecificLandingHtml, fetchThisWeekMeetingHtml } from '../data-fetching/wol-pages.js';
import { opErrored } from '../kernel/index.js';

export const wolRouter = express();

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
