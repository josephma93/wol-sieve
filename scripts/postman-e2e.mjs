import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const newmanBin = path.join(repoRoot, 'node_modules', 'newman', 'bin', 'newman.js');

const RUNNERS = {
	'mwb-treasures': {
		label: 'MWB treasures talk',
		collection: 'postman/collections/mwb.postman_collection.json',
		data: 'postman/data/mwb-treasures-talk-positive.json',
		folder: 'MWB Treasures Talk',
	},
	'mwb-program': {
		label: 'MWB full program',
		collection: 'postman/collections/mwb.postman_collection.json',
		data: 'postman/data/mwb-program-positive.json',
		folder: 'MWB Full Program',
	},
	wcg: {
		label: 'WCG positive batch',
		collection: 'postman/collections/wcg.postman_collection.json',
		data: 'postman/data/wcg-positive.json',
	},
};

const TARGETS = {
	all: ['mwb-treasures', 'mwb-program', 'wcg'],
	mwb: ['mwb-treasures', 'mwb-program'],
	'mwb-treasures': ['mwb-treasures'],
	'mwb-program': ['mwb-program'],
	wcg: ['wcg'],
};

function printHelp() {
	console.log(`Usage:
  npm run e2e -- [target] [--base-url URL] [--skip-ping]

Targets:
  all            Run every positive Postman/Newman suite (default)
  mwb            Run all MWB positive suites
  mwb-treasures  Run only MWB treasures-talk positive suite
  mwb-program    Run only MWB full-program positive suite
  wcg            Run only WCG positive suite

Options:
  --base-url URL  Override the API base URL
  --skip-ping     Skip the preflight GET /ping check
  --help          Show this help

Base URL resolution:
  1. --base-url
  2. BASE_URL environment variable
  3. http://localhost:5001`);
}

function parseArgs(argv) {
	let target = 'all';
	let baseUrl;
	let skipPing = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];

		if (arg === '--help' || arg === '-h') {
			return { help: true };
		}

		if (arg === '--skip-ping') {
			skipPing = true;
			continue;
		}

		if (arg === '--base-url') {
			const next = argv[i + 1];
			if (!next) {
				throw new Error('Missing value for --base-url');
			}
			baseUrl = next;
			i += 1;
			continue;
		}

		if (arg.startsWith('--base-url=')) {
			baseUrl = arg.slice('--base-url='.length);
			continue;
		}

		if (arg.startsWith('-')) {
			throw new Error(`Unknown option: ${arg}`);
		}

		target = arg;
	}

	return { help: false, target, baseUrl, skipPing };
}

function normalizeBaseUrl(baseUrl) {
	const trimmed = baseUrl.replace(/\/+$/, '');
	try {
		const parsed = new URL(trimmed);
		if (!/^https?:$/.test(parsed.protocol)) {
			throw new Error(`Unsupported protocol: ${parsed.protocol}`);
		}
		return trimmed;
	} catch (error) {
		throw new Error(`Invalid base URL [${baseUrl}]: ${error.message}`);
	}
}

async function pingServer(baseUrl) {
	const pingUrl = new URL('/ping', `${baseUrl}/`);
	const response = await fetch(pingUrl);
	if (!response.ok) {
		throw new Error(`GET ${pingUrl} returned ${response.status}`);
	}
	const body = await response.text();
	if (body.trim() !== 'pong') {
		throw new Error(`GET ${pingUrl} returned unexpected body: ${body}`);
	}
}

function ensureFileExists(relativePath) {
	const absolutePath = path.join(repoRoot, relativePath);
	if (!existsSync(absolutePath)) {
		throw new Error(`Required file does not exist: ${relativePath}`);
	}
	return absolutePath;
}

function runNewmanSuite(suiteKey, baseUrl) {
	const suite = RUNNERS[suiteKey];
	if (!suite) {
		throw new Error(`Unknown suite: ${suiteKey}`);
	}

	const collectionPath = ensureFileExists(suite.collection);
	const dataPath = ensureFileExists(suite.data);

	const args = [newmanBin, 'run', collectionPath, '--iteration-data', dataPath, '--env-var', `baseUrl=${baseUrl}`];

	if (suite.folder) {
		args.push('--folder', suite.folder);
	}

	console.log(`\n[postman-e2e] Running ${suite.label}`);
	const result = spawnSync(process.execPath, args, {
		cwd: repoRoot,
		stdio: 'inherit',
		env: process.env,
	});

	if (result.error) {
		throw result.error;
	}

	if ((result.status ?? 1) !== 0) {
		process.exit(result.status ?? 1);
	}
}

async function main() {
	const parsed = parseArgs(process.argv.slice(2));
	if (parsed.help) {
		printHelp();
		return;
	}

	const suites = TARGETS[parsed.target];
	if (!suites) {
		throw new Error(`Unknown target: ${parsed.target}`);
	}

	if (!existsSync(newmanBin)) {
		throw new Error('Newman is not installed. Run npm install first.');
	}

	const baseUrl = normalizeBaseUrl(parsed.baseUrl || process.env.BASE_URL || 'http://localhost:5001');

	console.log(`[postman-e2e] Target: ${parsed.target}`);
	console.log(`[postman-e2e] Base URL: ${baseUrl}`);

	if (!parsed.skipPing) {
		console.log('[postman-e2e] Checking /ping before running suites');
		await pingServer(baseUrl);
	}

	for (const suiteKey of suites) {
		runNewmanSuite(suiteKey, baseUrl);
	}
}

await main().catch((error) => {
	console.error(`[postman-e2e] ${error.message}`);
	process.exit(1);
});
