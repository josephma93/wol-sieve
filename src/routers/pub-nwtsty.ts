import { logger, opErrored } from '../kernel/index.js';
import express, { Request, Response } from 'express';
import { buildDefaultLinks, isValidWolBibleBookUrl } from '../scrappers/pub-nwtsty/extras.js';
import { extractReferencesFromLinks } from '../scrappers/pub-nwtsty/pub-nwtsty.js';

const log = logger.child({ ...logger.bindings(), label: 'pub-w-nwtsty' });

export const pubNwtstyRouter = express();

/**
 * Extracts all Bible references to found in the provided links and returns them in JSON format.
 * If no links are provided, links are fetched from the weekly Bible reading assignment.
 *
 * Example of valid links:
 * - https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70
 * - https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/19/70
 * - https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/2/1
 */
pubNwtstyRouter.get('/', async function (req: Request, res: Response) {
	try {
		let links: string[] = [];

		if (
			'links' in req.query &&
			Array.isArray(req.query.links) &&
			req.query.links.length > 0 &&
			req.query.links.every((l) => typeof l === 'string')
		) {
			links = req.query.links;
		}

		log.debug(`Incoming links: [${links}]`);

		if (links.length === 0) {
			const opRes = await buildDefaultLinks();
			if (opErrored(opRes)) {
				return res.status(500).json({ error: opRes.err.message });
			}
			links = opRes.res;
		}

		const invalidLinks = links.filter((link) => !isValidWolBibleBookUrl(link));
		if (invalidLinks.length > 0) {
			return res.status(400).json({ error: 'Some links are invalid', invalid_links: invalidLinks });
		}

		const extractionResult = await extractReferencesFromLinks(links);

		return res.status(200).json(extractionResult);
	} catch (error: any) {
		log.error(`Error extracting references, reason: [${error.message}]`);
		return res.status(500).json({ error: error.message });
	}
});
