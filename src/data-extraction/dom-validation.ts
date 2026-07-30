import { logger } from '../kernel/index.js';
import type { CheerioSelection } from './generic.js';

const log = logger.child({ ...logger.bindings(), label: 'dom-validation' });

/**
 * Validate that the given selection matches the provided CSS selector.
 * @param selection The selection to check.
 * @param selector The selector to assert against.
 * @throws {Error} If the selection does not match the selector.
 */
export function assertSelectionIs(selection: CheerioSelection, selector: string) {
	if (!selection.is(selector)) {
		const msg = `Unexpected element detected. Expected [${selector}], got something else. Document structure might have changed.`;
		log.error(msg);
		throw new Error(msg);
	}
}
