import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = 'http://127.0.0.1:16040';
const logFile = openSync('/reports/server.log', 'w');
const server = spawn(process.execPath, ['dist/index.js'], {
	env: { ...process.env, NODE_ENV: 'test', WS_PORT: '16040', WS_LOG_LEVEL: 'info' },
	stdio: ['ignore', logFile, logFile],
});
closeSync(logFile);

try {
	let ready = false;
	for (let attempt = 0; attempt < 100; attempt++) {
		if (server.exitCode !== null) throw new Error('API exited before startup. See server.log.');
		try {
			ready = (await fetch(`${baseUrl}/ping`, { signal: AbortSignal.timeout(1000) })).ok;
		} catch {
			// Connection failures are expected while the local API starts.
		}
		if (ready) break;
		await delay(100);
	}
	if (!ready) throw new Error('API startup timed out. See server.log.');

	const runner = spawn(
		process.execPath,
		['scripts/postman-e2e.mjs', 'all', '--base-url', baseUrl, '--report-dir', '/reports'],
		{ stdio: 'inherit' },
	);
	process.exitCode = await new Promise((resolve, reject) => {
		runner.once('error', reject);
		runner.once('exit', (code) => resolve(code ?? 1));
	});
} finally {
	server.kill('SIGTERM');
}
