import { NextFunction, Request, Response } from 'express';
import { Formatter, FracturedJsonOptions } from 'fracturedjsonjs';
import { AppError } from '../../kernel/app-error.js';

const allowedPrettyValues = new Set(['', '1', 'true']);
const prettyJsonOptions = new FracturedJsonOptions();

prettyJsonOptions.MaxTotalLineLength = 240;
prettyJsonOptions.IndentSpaces = 2;

function shouldUsePrettyJson(req: Request): boolean {
	if (!Object.hasOwn(req.query, 'pretty')) {
		return false;
	}

	const { pretty } = req.query;
	if (typeof pretty !== 'string' || !allowedPrettyValues.has(pretty.toLowerCase())) {
		throw new AppError('Invalid pretty parameter.', 400, {
			allowed_values: ['?pretty', '?pretty=true', '?pretty=1'],
		});
	}

	return true;
}

function serializePrettyJson(body: unknown): string | undefined {
	const formatter = new Formatter();
	formatter.Options = prettyJsonOptions;
	return formatter.Serialize(body);
}

export function prettyJsonResponseMiddleware(req: Request, res: Response, next: NextFunction): void {
	try {
		if (!shouldUsePrettyJson(req)) {
			next();
			return;
		}

		const originalJson = res.json.bind(res) as Response['json'];
		res.json = ((body?: unknown): Response => {
			const jsonText = serializePrettyJson(body);
			if (jsonText === undefined) {
				return originalJson(body);
			}

			res.type('application/json');
			return res.send(jsonText);
		}) as Response['json'];

		next();
	} catch (error) {
		next(error);
	}
}
