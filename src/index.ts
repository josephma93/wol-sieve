import express, { Request, Response, NextFunction } from 'express';
import { pinoHttp } from 'pino-http';
import { logger, addPingEndpoint, startServer } from './kernel/index.js';
import { AppError } from './kernel/app-error.js';
import env from './kernel/env.js';
import { wolRouter } from './routers/index.js';
import { pubMwbRouter } from './routers/pub-mwb.js';
import { pubWRouter } from './routers/pub-w.js';
import { pubNwtstyRouter } from './routers/pub-nwtsty.js';
import { pubLfbRouter } from './routers/pub-lfb.js';

const app = express();

app.use(pinoHttp({ logger: logger.child({ ...logger.bindings(), label: 'wol' }) }));
app.use(express.json());
app.use(express.urlencoded({ extended: false, limit: '512kb' }));

app.get('/', (_, res) => {
	res.send(`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Document</title>
</head>
<body>
	<ul>
		<li><a href="wol/landing-html">GET wol/landing-html</a></li>
		<li><a href="wol/mid-week-program-html">GET wol/mid-week-program-html</a></li>
		<li><a href="/pub-mwb/">GET & POST /pub-mwb/</a></li>
		<li><a href="/pub-mwb/scrappers/week-date-span">GET & POST /pub-mwb/scrappers/week-date-span</a></li>
		<li><a href="/pub-mwb/scrappers/songs">GET & POST /pub-mwb/scrappers/songs</a></li>
		<li><a href="/pub-mwb/scrappers/weekly-bible-read">GET & POST /pub-mwb/scrappers/weekly-bible-read</a></li>
		<li><a href="/pub-mwb/scrappers/treasures-talk">GET & POST /pub-mwb/scrappers/treasures-talk</a></li>
		<li><a href="/pub-mwb/scrappers/spiritual-gems">GET & POST /pub-mwb/scrappers/spiritual-gems</a></li>
		<li><a href="/pub-mwb/scrappers/bible-read-details">GET & POST /pub-mwb/scrappers/bible-read-details</a></li>
		<li><a href="/pub-mwb/scrappers/field-ministry">GET & POST /pub-mwb/scrappers/field-ministry</a></li>
		<li><a href="/pub-mwb/scrappers/christian-living">GET & POST /pub-mwb/scrappers/christian-living</a></li>
		<li><a href="/pub-mwb/scrappers/bible-study">GET & POST /pub-mwb/scrappers/bible-study</a></li>
		<li><a href="/pub-w/">GET /pub-w/</a></li>
		<li><a href="/pub-w/html">GET & POST /pub-w/html</a></li>
		<li><a href="/pub-w/from-url?url=https://wol.jw.org/es/wol/d/r4/lp-s/2025521">GET /pub-w/from-url?url=...</a></li>
		<li><a href="/pub-nwtsty/">GET & POST /pub-nwtsty/</a></li>
		<li><a href="/pub-lfb/">GET /pub-lfb/</a></li>
	</ul>
</body>
</html>`);
});
app.use('/wol', wolRouter);
app.use('/pub-mwb', pubMwbRouter);
app.use('/pub-w', pubWRouter);
app.use('/pub-nwtsty', pubNwtstyRouter);
app.use('/pub-lfb', pubLfbRouter);

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
