import express from 'express';
import { pinoHttp } from 'pino-http';
import { logger, addPingEndpoint, startServer } from './kernel/index.js';
import { wolRouter } from './routers/index.js';
import { pubMwbRouter } from './routers/pub-mwb.js';
import { pubWRouter } from './routers/pub-w.js';
import { pubNwtstyRouter } from './routers/pub-nwtsty.js';

const app = express();

app.use(pinoHttp({ logger: logger.child({ ...logger.bindings(), label: 'wol' }) }));
app.use(express.json());
app.use(express.urlencoded({ extended: false, limit: '512kb' }));

app.use('/wol', wolRouter);
app.use('/pub-mwb', pubMwbRouter);
app.use('/pub-w', pubWRouter);
app.use('/pub-nwtsty', pubNwtstyRouter);

addPingEndpoint(app);
startServer({ app });
