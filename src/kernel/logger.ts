import pino from 'pino';
import { CONSTANTS } from './constants.js';

const stderrStream = pino.destination(2);

export const logger = pino.default(
	{
		level: CONSTANTS.LOG_LEVEL,
		formatters: {
			level(label: string) {
				return { level: label };
			},
		},
		base: null,
		timestamp: pino.stdTimeFunctions.isoTime,
	},
	stderrStream,
);
