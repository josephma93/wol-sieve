import express, { Request, Response, NextFunction } from 'express';
import { pinoHttp } from 'pino-http';
import { logger, addPingEndpoint, startServer } from './kernel/index.js';
import { AppError } from './kernel/app-error.js';
import env from './kernel/env.js';
import { v2Router } from './routers/v2/index.js';

const app = express();

app.use(pinoHttp({ logger: logger.child({ ...logger.bindings(), label: 'wol' }) }));

app.get('/', (_req, res) => {
	res.redirect('/v2/');
});
app.use('/v2', v2Router);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	logger.error(err);

	let statusCode = 500;
	let message = 'Something went wrong!';
	let details = undefined;
	let stack = env.IS_DEV_ENV ? err.stack : undefined;

	if (err instanceof AppError) {
		statusCode = err.statusCode;
		message = err.message;
		details = err.details;
	}

	res.status(statusCode).send({
		status: err instanceof AppError ? err.status : 'error',
		message,
		...(details && { details }),
		...(stack && { stack }),
	});
});

addPingEndpoint(app);
startServer({ app });
