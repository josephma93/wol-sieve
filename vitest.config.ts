import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// We run tests in Node since this is a server-only project
		environment: 'node',

		// Discover tests in src/ or tests/
		include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],
		exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],

		// Keep globals off to align with strict TS; import from 'vitest' in tests
		globals: false,

		// Keep concurrency conservative by default; adjust as needed
		sequence: {
			concurrent: false,
		},

		// Threads pool is usually the fastest for TS with esbuild
		pool: 'threads',
		poolOptions: {
			threads: {
				// You can tune via VITEST_MIN_THREADS/VITEST_MAX_THREADS env vars
			},
		},

		// Toggle coverage on demand (requires @vitest/coverage-v8 when enabled)
		coverage: {
			provider: 'v8',
			enabled: false,
			reporter: ['text', 'html'],
			reportsDirectory: './coverage',
			include: ['src/**/*.ts'],
			exclude: ['**/*.d.ts', '**/dist/**', '**/node_modules/**'],
		},
	},
});
