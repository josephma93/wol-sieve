import express, { NextFunction, Request, Response } from 'express';
import { buildDefaultLinks, isValidWolBibleBookUrl } from '../../scrappers/pub-nwtsty/extras.js';
import {
	extractReferencesFromLinksV2,
	type NwtstyReferenceDataResultV2,
} from '../../scrappers/pub-nwtsty/pub-nwtsty.js';
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
		throw new AppError(opRes.err.message, 502, opRes.err);
	}

	const invalidUrls = opRes.res.filter((url) => !isValidWolBibleBookUrl(url));
	if (invalidUrls.length > 0) {
		throw new AppError('Default Bible links are invalid.', 502, { invalid_urls: invalidUrls });
	}

	return opRes.res;
}

async function extractCompleteReferences(urls: string[]): Promise<NwtstyReferenceDataResultV2[]> {
	const extractionResult = await extractReferencesFromLinksV2(urls);
	if (extractionResult.errors.length > 0 || extractionResult.results.length !== urls.length) {
		throw new AppError('Failed to extract references for all urls.', 502, {
			errors: extractionResult.errors,
			requested_urls: urls.length,
			completed_urls: extractionResult.results.length,
		});
	}

	return extractionResult.results;
}

async function handleReferences(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const urls = await resolveBibleUrls(req);
		const results = await extractCompleteReferences(urls);
		res.status(200).json(results);
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
		const results = await extractCompleteReferences(urls);
		const clusteredResults = clusterBiblicalPassageEntriesV2(results, tokenLimit);
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

(pubNwtstyV2Router as any)[TEST_HOOK] = {
	handleReferences,
	handleGroupedReferences,
	resolveBibleUrls,
	extractCompleteReferences,
};
