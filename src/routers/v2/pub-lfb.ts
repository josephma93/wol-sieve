import express, { NextFunction, Request, Response } from 'express';
import { getHtmlContent } from '../../data-fetching/raw.js';
import { opErrored } from '../../kernel/index.js';
import { AppError } from '../../kernel/app-error.js';
import { LfbItemV2, buildDefaultLinks, extractLfbContentsV2 } from '../../scrappers/pub-lfb/pub-lfb.js';
import { TEST_HOOK } from '../../test-helpers/test-hook.js';
import { normalizeUrlsQueryParam, validateWolUrls } from './helpers.js';

interface HtmlFetchResult {
	link: string;
	html: string;
}

export const pubLfbV2Router = express.Router();

async function resolveLfbUrls(req: Request): Promise<string[]> {
	const urls = normalizeUrlsQueryParam(req.query.urls);
	if (urls !== undefined) {
		return validateWolUrls(urls);
	}

	const opRes = await buildDefaultLinks();
	if (opErrored(opRes)) {
		throw new AppError(opRes.err.message, 500, opRes.err);
	}

	return validateWolUrls(opRes.res);
}

async function fetchHtmls(urls: string[]): Promise<HtmlFetchResult[]> {
	return Promise.all(
		urls.map(async (link) => {
			const opRes = await getHtmlContent(link);
			if (opErrored(opRes)) {
				throw new AppError(`Error fetching ${link}: ${opRes.err.message}`, 500, {
					originalError: opRes.err,
					link,
				});
			}

			return { link, html: opRes.res };
		}),
	);
}

async function handleLfbContents(req: Request, res: Response, next: NextFunction): Promise<void> {
	try {
		const urls = await resolveLfbUrls(req);
		const htmls = await fetchHtmls(urls);
		const extractedData: ({ link: string } & LfbItemV2)[] = await Promise.all(
			htmls.map(async ({ link, html }) => {
				const parsed = await extractLfbContentsV2({ html });
				return { link, ...parsed };
			}),
		);

		res.json({ results: extractedData });
	} catch (error: any) {
		if (error instanceof AppError) {
			next(error);
			return;
		}

		next(new AppError(`An error occurred during content extraction: ${error.message}`, 500, error));
	}
}

pubLfbV2Router.get('/', handleLfbContents);

(pubLfbV2Router as any)[TEST_HOOK] = { handleLfbContents, resolveLfbUrls, fetchHtmls };
