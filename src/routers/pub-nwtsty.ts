import { logger, opErrored } from '../kernel/index.js';
import express, { Request, Response, NextFunction } from 'express';
import { buildDefaultLinks, isValidWolBibleBookUrl } from '../scrappers/pub-nwtsty/extras.js';
import {
	BiblicalBookReferenceData,
	BiblicalPassageRefEntry,
	extractReferencesFromLinks,
} from '../scrappers/pub-nwtsty/pub-nwtsty.js';
import { clusterBiblicalPassageEntries } from '../services/pub-nwtsty.js';

const log = logger.child({ ...logger.bindings(), label: 'pub-w-nwtsty' });

export const pubNwtstyRouter = express();

// Extend the Request interface to include custom properties
declare module 'express' {
	interface Request {
		validatedLinks?: string[];
		tokenLimit?: number; // Add tokenLimit to the Request interface
	}
}

/**
 * Middleware to handle and validate incoming links from the request query.
 * If no links are provided, fetches default weekly Bible reading links.
 * Attaches validated links to req.validatedLinks or sends an error response.
 *
 * @param req - The Express request object.
 * @param res - The Express response object.
 * @param next - The next middleware function.
 */
async function validateLinksMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
	let links: string[] = [];

	if (
		'links' in req.query &&
		Array.isArray(req.query.links) &&
		req.query.links.length > 0 &&
		req.query.links.every((l) => typeof l === 'string')
	) {
		links = req.query.links as string[];
	}

	log.debug(`Incoming links: [${links}]`);

	if (links.length === 0) {
		const opRes = await buildDefaultLinks();
		if (opErrored(opRes)) {
			res.status(500).json({ error: opRes.err.message });
			return;
		}
		links = opRes.res;
	}

	const invalidLinks = links.filter((link) => !isValidWolBibleBookUrl(link));
	if (invalidLinks.length > 0) {
		res.status(400).json({ error: 'Some links are invalid', invalid_links: invalidLinks });
		return;
	}

	req.validatedLinks = links;
	next();
}

/**
 * Middleware to validate and parse the tokenLimit query parameter.
 * Attaches the validated/default token limit to req.tokenLimit or sends an error response.
 *
 * @param req - The Express request object.
 * @param res - The Express response object.
 * @param next - The next middleware function.
 */
async function validateTokenLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
	const tokenLimitQuery = req.query.tokenLimit as string | undefined;

	if (tokenLimitQuery === undefined) {
		res.status(400).json({
			error: 'tokenLimit query parameter is required.',
		});
		return;
	}

	const parsedTokenLimit = parseInt(tokenLimitQuery, 10);

	if (
		isNaN(parsedTokenLimit) ||
		parsedTokenLimit <= 0 ||
		!Number.isInteger(parsedTokenLimit) ||
		parsedTokenLimit > 128000
	) {
		res.status(400).json({
			error: 'Invalid tokenLimit. Must be a positive integer not exceeding 128000.',
		});
		return;
	}

	req.tokenLimit = parsedTokenLimit;
	next();
}

/**
 * Extracts all Bible references to found in the provided links and returns them in JSON format.
 * If no links are provided, links are fetched from the weekly Bible reading assignment.
 *
 * @param req - The Express request object.
 * @param res - The Express response object.
 * @returns A promise resolving to the extracted references or undefined if an error response was sent.
 */
pubNwtstyRouter.get('/', validateLinksMiddleware, async function (req: Request, res: Response) {
	try {
		// Access validated links from the request object
		const links = req.validatedLinks as string[];

		const extractionResult = await extractReferencesFromLinks(links);

		return res.status(200).json(extractionResult);
	} catch (error: any) {
		log.error(`Error extracting references, reason: [${error.message}]`);
		return res.status(500).json({ error: error.message });
	}
});

/**
 * Extracts all Bible references and groups them by LLM token count for easier consumption.
 * If no links are provided, links are fetched from the weekly Bible reading assignment.
 *
 * The response is grouped by LLM token count for easier consumption.
 * Example of valid links:
 * - https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70
 * - https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/19/70
 * - https://wol.jw.org/en/wol/b/r1/lp-e/nwtsty/2/1
 */
pubNwtstyRouter.get(
	'/grouped',
	validateLinksMiddleware,
	validateTokenLimitMiddleware,
	async function (req: Request, res: Response) {
		try {
			const links = req.validatedLinks as string[];

			const dynamicTokenLimit = req.tokenLimit as number;

			const linkExtractionResult = (await extractReferencesFromLinks(links)).results;

			const clusteredResults = clusterBiblicalPassageEntries(linkExtractionResult, dynamicTokenLimit);

			return res.status(200).json(clusteredResults);
		} catch (error: any) {
			log.error(`Error extracting references, reason: [${error.message}]`);
			return res.status(500).json({ error: error.message });
		}
	},
);
