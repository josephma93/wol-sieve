import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AsyncOperationResult, CONSTANTS, opErrored, ScrapperMethod } from '../../kernel/index.js';
import { AppError } from '../../kernel/app-error.js';
import { getHtmlContent } from '../../data-fetching/raw.js';

export const MAX_TOKEN_LIMIT = 128000;
export const DEFAULT_TOKEN_LIMIT = MAX_TOKEN_LIMIT;

type HtmlGenerator = () => Promise<AsyncOperationResult<string>>;

interface SingleSourceScraperHandlerSettings {
	defaultHtmlGenerator: HtmlGenerator;
	scrapperOperation: ScrapperMethod;
	errorLabel: string;
}

export function isWolUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		const wolHost = new URL(CONSTANTS.WOL_URL).hostname;
		return parsed.hostname === wolHost;
	} catch {
		return false;
	}
}

export function normalizeUrlsQueryParam(value: unknown): string[] | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (typeof value === 'string') {
		return [value];
	}

	if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
		return value;
	}

	throw new AppError('Missing or invalid urls parameter.', 400);
}

export function parseTokenLimit(value: unknown): number {
	if (value === undefined) {
		return DEFAULT_TOKEN_LIMIT;
	}

	if (typeof value !== 'string' || !/^\d+$/.test(value)) {
		throw new AppError(`Invalid tokenLimit. Must be a positive integer not exceeding ${MAX_TOKEN_LIMIT}.`, 400);
	}

	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_TOKEN_LIMIT) {
		throw new AppError(`Invalid tokenLimit. Must be a positive integer not exceeding ${MAX_TOKEN_LIMIT}.`, 400);
	}

	return parsed;
}

export function validateWolUrls(urls: string[]): string[] {
	const invalidUrls = urls.filter((url) => !isWolUrl(url));
	if (invalidUrls.length > 0) {
		throw new AppError('Some urls are invalid', 400, { invalid_urls: invalidUrls });
	}

	return urls;
}

export function validateUrlsWithPredicate(
	urls: string[],
	predicate: (url: string) => boolean,
	message = 'Some urls are invalid',
): string[] {
	const invalidUrls = urls.filter((url) => !predicate(url));
	if (invalidUrls.length > 0) {
		throw new AppError(message, 400, { invalid_urls: invalidUrls });
	}

	return urls;
}

async function resolveDefaultHtml(defaultHtmlGenerator: HtmlGenerator): Promise<string> {
	const opRes = await defaultHtmlGenerator();
	if (opErrored(opRes)) {
		throw new AppError(opRes.err.message, 500, opRes.err);
	}

	return opRes.res;
}

async function resolveHtmlFromWolUrl(url: string): Promise<string> {
	const opRes = await getHtmlContent(url);
	if (opErrored(opRes)) {
		throw new AppError(opRes.err.message, 500, opRes.err);
	}

	return opRes.res;
}

export async function resolveHtmlFromOptionalUrl(req: Request, defaultHtmlGenerator: HtmlGenerator): Promise<string> {
	if (!Object.hasOwn(req.query, 'url')) {
		return resolveDefaultHtml(defaultHtmlGenerator);
	}

	const { url } = req.query;
	if (typeof url !== 'string' || !isWolUrl(url)) {
		throw new AppError('Missing or invalid URL parameter.', 400);
	}

	return resolveHtmlFromWolUrl(url);
}

export function createSingleSourceScraperHandler({
	defaultHtmlGenerator,
	scrapperOperation,
	errorLabel,
}: SingleSourceScraperHandlerSettings): RequestHandler {
	return async function singleSourceScraperHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
		try {
			const html = await resolveHtmlFromOptionalUrl(req, defaultHtmlGenerator);
			const result = scrapperOperation({ html });
			const data = result instanceof Promise ? await result : result;
			res.json(data);
		} catch (error: any) {
			if (error instanceof AppError) {
				next(error);
				return;
			}

			next(new AppError(`${errorLabel}: ${error.message}`, 500, error));
		}
	};
}
