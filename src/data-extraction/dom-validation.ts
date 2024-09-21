import { logger } from '../kernel/index.js';
import { CheerioAPI } from 'cheerio';

const log = logger.child({ ...logger.bindings(), label: 'dom-validation' });

/**
 * Validate that the given selection is a h3 element.
 * @param selection The selection to check.
 * @param selector The selector to assert against.
 * @throws {Error} If the selection is not a h3 element.
 */
export function assertSelectionIs(selection: ReturnType<CheerioAPI>, selector: string) {
	if (!selection.is(selector)) {
		const msg = `Unexpected element detected. Expected [${selector}], got something else. Document structure might have changed.`;
		log.error(msg);
		throw new Error(msg);
	}
}
