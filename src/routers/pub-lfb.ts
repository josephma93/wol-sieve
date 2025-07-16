import express, { Request, Response, NextFunction } from 'express';
import { getHtmlContent } from '../data-fetching/raw.js';
import { logger, opErrored } from '../kernel/index.js';
import { LfbItem, extractLfbContents, buildDefaultLinks } from '../scrappers/pub-lfb/pub-lfb.js';

const log = logger.child({ ...logger.bindings(), label: 'pub-lfb-router' });

interface HtmlFetchResult {
	link: string;
	html: string;
}

async function validateLinksMiddleware(req: Request, res: Response, next: NextFunction) {
	let { links } = req.query;
	log.info('Validating links...');

	if (!links || !Array.isArray(links) || !links.every((l) => typeof l === 'string')) {
		log.warn('No valid links provided in query, building default links.');
		const opRes = await buildDefaultLinks();
		if (opErrored(opRes)) {
			log.error({ err: opRes.err }, 'Failed to build default links.');
			res.status(500).json({ error: opRes.err.message });
			return;
		}
		links = opRes.res;
		log.info({ linkCount: links.length }, 'Successfully built default links.');
	} else {
		log.info({ linkCount: (links as string[]).length }, 'Links from query are valid.');
	}
	req.validatedLinks = links as string[];
	next();
}

async function fetchHtmlsMiddleware(req: Request, res: Response, next: NextFunction) {
	log.info('Fetching HTML for links...');
	const links = req.validatedLinks!;

	for (const link of links) {
		if (!link.includes('wol.jw.org')) {
			log.warn({ link }, 'Invalid link provided.');
			return res.status(400).json({ error: `Invalid link: ${link}` });
		}
	}

	try {
		const results: HtmlFetchResult[] = await Promise.all(
			links.map(async (link) => {
				log.debug({ link }, 'Fetching HTML content for link.');
				const opRes = await getHtmlContent(link);
				if (opErrored(opRes)) {
					const err = new Error(`Error fetching ${link}: ${opRes.err.message}`);
					log.error({ err: opRes.err, link }, 'Error fetching content for link.');
					throw err;
				}
				log.debug({ link }, 'Successfully fetched HTML for link.');
				return { link, html: opRes.res };
			}),
		);

		log.info({ count: results.length }, 'Finished fetching all HTMLs.');
		res.locals.htmls = results;
		next();
	} catch (error: any) {
		log.error({ err: error }, 'An error occurred while fetching HTMLs in parallel.');
		res.status(500).json({ error: error.message });
	}
}

export const pubLfbRouter = express.Router();

pubLfbRouter.get('/', validateLinksMiddleware, fetchHtmlsMiddleware, async (_req: Request, res: Response) => {
	const handlerLog = log.child({ handler: 'main' });
	handlerLog.info('Extracting content from fetched HTMLs.');
	try {
		const htmls: HtmlFetchResult[] = res.locals.htmls;
		const extractedData: ({ link: string } & LfbItem)[] = await Promise.all(
			htmls.map(async ({ link, html }) => {
				handlerLog.debug({ link }, 'Extracting content for link.');
				const parsed: LfbItem = await extractLfbContents({ html });
				handlerLog.debug({ link }, 'Successfully extracted content.');
				return { link, ...parsed };
			}),
		);
		handlerLog.info({ count: extractedData.length }, 'Content extraction complete.');
		res.json({ results: extractedData });
	} catch (error: any) {
		handlerLog.error({ err: error }, 'An error occurred during content extraction.');
		res.status(500).json({ error: error.message });
	}
});
