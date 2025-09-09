/**
 * Shared symbol for attaching and accessing test-only hooks on instances.
 * Import this in both production modules (to attach) and tests (to access).
 */
export const TEST_HOOK = Symbol.for('wol-sieve.test-hook');
