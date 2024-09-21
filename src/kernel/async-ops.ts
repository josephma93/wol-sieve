/**
 * An object representing a successful operation, where `err` is undefined and `res` is of type T.
 */
export type SuccessResult<T> = { err: null; res: T };

/**
 * An object representing an error, where `err` is an Error and `res` is null.
 */
export type ErrorResult = { err: Error; res: null };

/**
 * Wraps an asynchronous function with error handling, returning a Promise that resolves to
 * either a SuccessResult or an ErrorResult.
 * @returns A function that returns a promise resolving to either a SuccessResult or an ErrorResult.
 */
export function wrapAsyncOp<T, A extends any[]>(
	asyncFunc: (...args: A) => Promise<T | Error>,
): (...args: A) => Promise<SuccessResult<T> | ErrorResult> {
	return async function (...args: A): Promise<SuccessResult<T> | ErrorResult> {
		try {
			const result = await asyncFunc(...args);
			if (result instanceof Error) {
				return { err: result, res: null } as ErrorResult;
			}
			return { err: null, res: result } as SuccessResult<T>;
		} catch (error: unknown) {
			return { err: error as Error, res: null } as ErrorResult;
		}
	};
}

/**
 * Checks if the operation result is an error
 * @param result - The operation result to check
 * @returns true if the result is an error
 */
export function opErrored(result: SuccessResult<unknown> | ErrorResult): result is ErrorResult {
	return result.err !== null;
}
