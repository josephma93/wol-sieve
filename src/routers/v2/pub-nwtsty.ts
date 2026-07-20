import express, { NextFunction, Request, Response } from 'express';
import { buildDefaultLinks, isValidWolBibleBookUrl } from '../../scrappers/pub-nwtsty/extras.js';
import { extractReferencesFromLinksV2 } from '../../scrappers/pub-nwtsty/pub-nwtsty.js';
import { clusterBiblicalPassageEntriesV2 } from '../../services/pub-nwtsty.js';
import { opErrored } from '../../kernel/index.js';
import { AppError } from '../../kernel/app-error.js';
import { TEST_HOOK } from '../../test-helpers/test-hook.js';
import { normalizeUrlsQueryParam, parseTokenLimit, validateUrlsWithPredicate } from './helpers.js';

export const pubNwtstyV2Router = express.Router();

async function resolveBibleUrls(req: Request): Promise<string[]> {
	const urls = normalizeUrlsQueryParam(req.query.urls);
	if (urls !== undefined) {
		return validateUrlsWithPredicate(urls, isValidWolBibleBookUrl);
	}

	const opRes = await buildDefaultLinks();
	if (opErrored(opRes)) {
		throw new AppError(opRes.err.message, 500, opRes.err);
	}

	return validateUrlsWithPredicate(opRes.res, isValidWolBibleBookUrl);
}

async function handleReferences(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const urls = await resolveBibleUrls(req);
		const extractionResult = await extractReferencesFromLinksV2(urls);
		res.status(200).json(extractionResult);
	} catch (error: any) {
		if (error instanceof AppError) {
			next(error);
			return;
		}

		next(new AppError(`Error extracting references: ${error.message}`, 500, error));
	}
}

async function handleGroupedReferences(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const urls = await resolveBibleUrls(req);
		const tokenLimit = parseTokenLimit(req.query.tokenLimit);
		const linkExtractionResult = (await extractReferencesFromLinksV2(urls)).results;
		const clusteredResults = clusterBiblicalPassageEntriesV2(linkExtractionResult, tokenLimit);
		res.status(200).json(clusteredResults);
	} catch (error: any) {
		if (error instanceof AppError) {
			next(error);
			return;
		}

		next(new AppError(`Error extracting references: ${error.message}`, 500, error));
	}
}

pubNwtstyV2Router.get('/', handleReferences);
pubNwtstyV2Router.get('/grouped', handleGroupedReferences);

(pubNwtstyV2Router as any)[TEST_HOOK] = { handleReferences, handleGroupedReferences, resolveBibleUrls };
