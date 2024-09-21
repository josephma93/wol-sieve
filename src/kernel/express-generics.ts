import { CONSTANTS } from './constants.js';
import { logger } from './logger.js';
import http, { Server } from 'http';
import { Application, Express, Request, Response } from 'express';

const log = logger.child({ ...logger.bindings(), label: 'start-server' });

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
