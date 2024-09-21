import { CONSTANTS } from './constants.js';
import { logger } from './logger.js';
import http, { Server } from 'http';
import { Application, Express, NextFunction, Request, Response, Router } from 'express';
import { AsyncOperationResult, opErrored } from './async-ops.js';
import { ExtractionInput } from '../scrappers/generics.js';

const log = logger.child({ ...logger.bindings(), label: 'express-generics' });

/**
 * Default event listener for HTTP server "error" event.
 * @link https://nodejs.org/api/net.html#event-error
 * @param error - The error object.
 */
function defaultOnError(error: NodeJS.ErrnoException): void {
	if (error.syscall !== 'listen') {
		throw error;
	}

	const bind =
		typeof CONSTANTS.NORMALIZED_PORT_NUMBER === 'string'
			? `Pipe [${CONSTANTS.NORMALIZED_PORT_NUMBER}]`
			: `Port [${CONSTANTS.NORMALIZED_PORT_NUMBER}]`;

	// Handle specific listen errors with friendly messages
	switch (error.code) {
		case 'EACCES':
			log.error(`${bind} requires elevated privileges`);
			process.exit(1);
			break;
		case 'EADDRINUSE':
			log.error(`${bind} is already in use`);
			process.exit(1);
			break;
		default:
			throw error;
	}
}

/**
 * Default event listener for HTTP server "listening" event.
 * @link https://nodejs.org/api/net.html#event-listening
 * @param server - The HTTP server instance.
 */
function defaultOnListening(server: Server): void {
	const addr = server.address();
	const bind = typeof addr === 'string' ? `pipe [${addr}]` : `port [${addr?.port}]`;
	log.info(`Listening on ${bind}`);
}

/**
 * Configuration options for starting the server.
 */
interface StartServerConfig {
	app: Express;
	onError?: (error: NodeJS.ErrnoException) => void;
	onListening?: (server: Server) => void;
	beforeListen?: (server: Server) => void;
}

/**
 * Starts an HTTP server with the given configuration.
 *
 * @param config - The server configuration object.
 * @returns The created HTTP server instance.
 * @throws If the Express app instance is not provided.
 */
export function startServer({ app, onError, onListening, beforeListen }: StartServerConfig): Server {
	if (!app) {
		throw new Error('Express app instance is required.');
	}

	app.set('port', CONSTANTS.NORMALIZED_PORT_NUMBER);
	const server = http.createServer(app);

	if (beforeListen) {
		beforeListen(server);
	}

	server.listen(CONSTANTS.NORMALIZED_PORT_NUMBER);
	server.on('error', onError ?? defaultOnError);
	server.on('listening', () => (onListening ?? defaultOnListening)(server));

	return server;
}

/**
 * Adds the ping endpoint to the given Express app.
 * @param app - The Express application.
 */
export function addPingEndpoint(app: Application): void {
	/**
	 * GET /ping
	 * Returns 'pong' to indicate that the server is up and running.
	 */
	app.get('/ping', (_: Request, res: Response) => res.send('pong'));
}

export declare type ScrapperMethod = (input: ExtractionInput) => Promise<any> | any;

export declare type GetAndPostRouteSettings = {
	router: Router;
	path: string;
	defaultHtmlGenerator: () => Promise<AsyncOperationResult<string>>;
	scrapperOperation: ScrapperMethod;
};

/**
 * Adds a route to the given router that accepts GET and POST requests, where:
 * - GET requests fetch the HTML content using the provided defaultHtmlGenerator and then invoke the scrapperOperation with the fetched HTML.
 * - POST requests take the HTML as the body of the request and invoke the scrapperOperation with the provided HTML.
 * @param router - The Express router to add the route to.
 * @param path - The path of the route.
 * @param defaultHtmlGenerator - A function that returns a Promise that resolves to the default HTML content to use for GET requests.
 * @param scrapperOperation - A function that takes an ExtractionInput and returns a Promise that resolves to the result of the scrapper operation.
 */
export function addGetAndPostScrappingRoute({
	router,
	path,
	defaultHtmlGenerator,
	scrapperOperation,
}: GetAndPostRouteSettings) {
	async function fillHtmlContentMiddleware(req: Request, res: Response, next: NextFunction) {
		let html = req.body?.html;
		if (!html) {
			log.info(`Using default HTML generator for request at path: [${path}]`);
			const opRes = await defaultHtmlGenerator();
			if (opErrored(opRes)) {
				log.error(`Error occurred while generating default HTML content for path: [${path}].`, opRes.err);
				return res.status(500).json({ error: opRes.err.message });
			}
			html = opRes.res;
		} else {
			log.debug(`Using user-provided HTML content for POST request at path: [${path}]`);
		}
		res.locals.html = html;
		next();
	}

	async function scrapperMiddleware(_: Request, res: Response) {
		try {
			log.debug(`Invoking scrapper operation for path: [${path}]`);
			const result = scrapperOperation({ html: res.locals.html });
			const data = result instanceof Promise ? await result : result;
			log.info(`Scrapper operation completed for path: [${path}]`);
			res.json(data);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			log.error(`Error occurred while running scrapper operation for path: [${path}].`, error);
			res.status(500).json({ error: errorMessage });
		}
	}

	router
		.route(path)
		.post(fillHtmlContentMiddleware, scrapperMiddleware)
		.get(fillHtmlContentMiddleware, scrapperMiddleware);
}
