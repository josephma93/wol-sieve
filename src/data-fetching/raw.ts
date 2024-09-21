import { CONSTANTS, logger, wrapAsyncOp } from '../kernel/index.js';

const log = logger.child(Object.assign(logger.bindings(), { label: 'retrievers' }));

interface FetchContentResult {
	response: Response;
	elapsedTime: number;
}

/**
 * Performs a GET request to the given URL with the given headers.
 * @param url - The URL to fetch.
 * @param headers - The headers to include in the request.
 * @returns A promise that resolves to a FetchContentResult, or an Error object if an error occurred.
 */
async function _fetchContent(url: string, headers: RequestInit['headers']): Promise<FetchContentResult | Error> {
	const startTime = performance.now();

	log.debug(`Sending GET request to [${url}]`);

	try {
		const response = await fetch(url, { headers });
		const elapsedTime = (performance.now() - startTime) / 1000;

		if (!response.ok) {
			const errorMessage = `Failed to fetch [${url}] with status [${response.status}] (${response.statusText}) after [${elapsedTime.toFixed(4)}] seconds. Response headers: [${JSON.stringify(response.headers)}]`;
			log.error(errorMessage);
			return new Error(errorMessage);
		}

		if (elapsedTime > 10) {
			log.warn(`Operation took [${elapsedTime.toFixed(4)}] seconds`);
		}

		return {
			response,
			elapsedTime,
		};
	} catch (error: any) {
		const elapsedTime = (performance.now() - startTime) / 1000;
		let errorMessage = `Request to [${url}] failed after [${elapsedTime.toFixed(4)}] seconds.`;

		if (error.name === 'TypeError') {
			errorMessage += ` Network or DNS error occurred: [${error.message}]`;
		} else if (error.code === 'ENOTFOUND') {
			errorMessage += ` DNS lookup failed: [${error.message}]`;
		} else if (error.code === 'ETIMEDOUT') {
			errorMessage += ` Request timed out: [${error.message}]`;
		} else if (error instanceof SyntaxError) {
			errorMessage += ` Failed to parse response: [${error.message}]`;
		} else {
			errorMessage += ` Unexpected error occurred: [${error.message}]`;
		}

		log.error(errorMessage);
		return new Error(errorMessage);
	}
}

/**
 * Generates the headers for a fetch request.
 * @param contentType - The expected content type (e.g., 'application/json', 'text/html').
 * @returns An object containing the headers for the fetch request.
 */
function createHeaders(contentType: 'application/json' | 'text/html'): RequestInit['headers'] {
	return {
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0',
		Accept: contentType,
		'Accept-Language': 'es-ES,es;q=0.5',
		'Accept-Encoding': 'gzip, deflate, br',
		Referer: CONSTANTS.WOL_URL,
	};
}

/**
 * Fetches text content from the given URL with error handling.
 * @param url - The URL to fetch.
 * @returns A promise that resolves to either an Error object if any error occurs, or the TEXT content if successful.
 */
async function _getTextContent(url: string): Promise<string | Error> {
	const headers = createHeaders('text/html');
	const result = await _fetchContent(url, headers);

	if (result instanceof Error) {
		return result;
	}
	const { response, elapsedTime } = result;

	try {
		const content = await response.text();
		log.info(
			`Received TEXT content from [${url}] with status code 200 in [${elapsedTime.toFixed(4)}] seconds. Content length: [${content.length}]`,
		);
		return content;
	} catch (error: any) {
		log.error(`Failed to parse text response from [${url}]: [${error.message}]`);
		return new Error(`Failed to parse text response: [${error.message}]`);
	}
}

/**
 * Fetches HTML content from the specified URL with error handling.
 * @returns A promise that resolves to resolving to either a SuccessResult or an ErrorResult. The SuccessResult contains the HTML content if successful.
 */
export const getHtmlContent = wrapAsyncOp(_getTextContent);

/**
 * Fetches JSON content from the given URL with error handling.
 * @param url - The URL to fetch.
 * @returns A promise that resolves to either parsed JSON content or an Error object if any error occurs.
 */
async function _getJsonContent(url: string): Promise<unknown | Error> {
	const headers = createHeaders('application/json');
	const result = await _fetchContent(url, headers);

	if (result instanceof Error) {
		return result;
	}
	const { response, elapsedTime } = result;

	try {
		const content = await response.json();
		log.info(
			`Received JSON content from [${url}] with status code 200 in [${elapsedTime.toFixed(4)}] seconds. Content length: [${JSON.stringify(content).length}]`,
		);
		return content;
	} catch (error: any) {
		log.error(`Failed to parse JSON response from [${url}]: [${error.message}]`);
		return new Error(`Failed to parse JSON response: [${error.message}]`);
	}
}

/**
 * Fetches JSON content from the specified URL with error handling.
 * @returns A promise that resolves to either a SuccessResult or an ErrorResult. The SuccessResult contains the JSON content if successful.
 */
export const getJsonContent = wrapAsyncOp(_getJsonContent);
