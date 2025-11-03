import { NextFunction, Request, Response } from 'express';
import { AppError } from '../kernel/app-error.js';
import { getHtmlContent } from './raw.js';
import { opErrored } from '../kernel/index.js';
import { ExtractionContextOptions } from '../scrappers/generics.js';

declare type ScrapperMethod = (input: ExtractionContextOptions) => Promise<any> | any;
declare type ValidationMethod = (req: Request) => string | AppError;

export function createFromUrlHandler(scrapper: ScrapperMethod, validator: ValidationMethod) {
	return async function handleFromUrl(req: Request, res: Response, next: NextFunction) {
		const urlOrErr = validator(req);
		if (urlOrErr instanceof AppError) return next(urlOrErr);

		const opRes = await getHtmlContent(urlOrErr);
		if (opErrored(opRes)) {
			return next(new AppError(opRes.err.message, 500, opRes.err));
		}

		try {
			const data = await scrapper({ html: opRes.res });
			res.json(data);
		} catch (error: any) {
			next(new AppError(`Failed to extract article contents: ${error.message}`, 500, error));
		}
	};
}
