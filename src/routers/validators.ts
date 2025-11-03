import { Request } from 'express';
import { AppError } from '../kernel/app-error.js';
import { CONSTANTS } from '../kernel/index.js';

export function getAndValidateWolUrl(req: Request): string | AppError {
	const url = req.method === 'GET' ? req.query.url : req.body?.url;
	if (!url || typeof url !== 'string') {
		return new AppError('Missing or invalid URL parameter.', 400);
	}
	try {
		const parsed = new URL(url);
		const wolHost = new URL(CONSTANTS.WOL_URL).hostname;
		if (parsed.hostname !== wolHost) {
			return new AppError(`URL must belong to ${wolHost} domain.`, 400);
		}
		return url;
	} catch (e: any) {
		return new AppError(`Invalid URL: ${e.message}`, 400, e);
	}
}
