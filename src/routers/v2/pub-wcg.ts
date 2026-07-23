import express, { NextFunction, Request, Response } from 'express';
import { getHtmlContent } from '../../data-fetching/raw.js';
import { AppError } from '../../kernel/app-error.js';
import { opErrored } from '../../kernel/index.js';
import { WcgItem, buildDefaultLinks, extractWcgContents } from '../../scrappers/pub-wcg/pub-wcg.js';
import { TEST_HOOK } from '../../test-helpers/test-hook.js';
import { isWolUrl, normalizeUrlsQueryParam, validateWolUrls } from './helpers.js';

interface HtmlFetchResult {
	link: string;
	html: string;
}

type WcgExtractionResult = { link: string } & WcgItem;

export const pubWcgV2Router = express.Router();

async function resolveWcgUrls(req: Request): Promise<string[]> {
	const urls = normalizeUrlsQueryParam(req.query.urls);
	if (urls !== undefined) {
		return validateWolUrls(urls);
	}

	const opRes = await buildDefaultLinks();
	if (opErrored(opRes)) {
		throw new AppError(opRes.err.message, 502, opRes.err);
	}

	const invalidUrls = opRes.res.filter((url) => !isWolUrl(url));
	if (invalidUrls.length > 0) {
		throw new AppError('Default WCG links are invalid.', 502, { invalid_urls: invalidUrls });
	}

	return opRes.res;
}

async function fetchHtmls(urls: string[]): Promise<HtmlFetchResult[]> {
	return Promise.all(
		urls.map(async (link) => {
			const opRes = await getHtmlContent(link);
			if (opErrored(opRes)) {
				throw new AppError(`Error fetching ${link}: ${opRes.err.message}`, 502, {
					originalError: opRes.err,
					link,
				});
			}

			return { link, html: opRes.res };
		}),
	);
}

async function extractWcgItems(htmls: HtmlFetchResult[]): Promise<WcgExtractionResult[]> {
	return Promise.all(
		htmls.map(async ({ link, html }) => {
			try {
				const parsed = await extractWcgContents({ html });
				return { link, ...parsed };
			} catch (error: any) {
				throw new AppError(`Error extracting ${link}: ${error.message}`, 502, { originalError: error, link });
			}
		}),
	);
}

async function handleWcgContents(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const urls = await resolveWcgUrls(req);
		const htmls = await fetchHtmls(urls);
		const extractedData = await extractWcgItems(htmls);

		res.json(extractedData);
	} catch (error: any) {
		if (error instanceof AppError) {
			next(error);
			return;
		}

		next(new AppError(`An error occurred during content extraction: ${error.message}`, 500, error));
	}
}

pubWcgV2Router.get('/', handleWcgContents);

(pubWcgV2Router as any)[TEST_HOOK] = { handleWcgContents, resolveWcgUrls, fetchHtmls, extractWcgItems };
