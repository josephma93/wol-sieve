import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const newmanBin = path.join(repoRoot, 'node_modules', 'newman', 'bin', 'newman.js');

const RUNNERS = {
	sanity: {
		label: 'Risk-based v2 sanity',
		data: 'postman/data/sanity.json',
		collection: 'postman/collections/sanity.postman_collection.json',
	},
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
	all: ['mwb-treasures', 'mwb-program', 'wcg', 'sanity'],
	sanity: ['sanity'],
	mwb: ['mwb-treasures', 'mwb-program'],
	'mwb-treasures': ['mwb-treasures'],
	'mwb-program': ['mwb-program'],
	wcg: ['wcg'],
};

function printHelp() {
	console.log(`Usage:
  npm run e2e -- [target] [--base-url URL] [--skip-ping]

Targets:
  all            Run all curated and risk-based Postman suites (default)
  sanity         Run cross-route contracts and boundary checks
  mwb            Run all MWB positive suites
  mwb-treasures  Run only MWB treasures-talk positive suite
  mwb-program    Run only MWB full-program positive suite
  wcg            Run only WCG positive suite

Options:
  --base-url URL  Override the API base URL
  --report-dir DIR Save Newman JSON reports
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
	let reportDir;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];

		if (arg === '--help' || arg === '-h') {
			return { help: true };
		}

		if (arg === '--skip-ping') {
			skipPing = true;
			continue;
		}

		if (arg === '--base-url' || arg === '--report-dir') {
			const next = argv[i + 1];
			if (!next) {
				throw new Error(`Missing value for ${arg}`);
			}
			if (arg === '--base-url') baseUrl = next;
			else reportDir = path.resolve(next);
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

	return { help: false, target, baseUrl, skipPing, reportDir };
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

function runNewmanSuite(suiteKey, baseUrl, reportDir) {
	const suite = RUNNERS[suiteKey];
	if (!suite) {
		throw new Error(`Unknown suite: ${suiteKey}`);
	}

	const collectionPath = ensureFileExists(suite.collection);
	const dataPath = suite.data ? ensureFileExists(suite.data) : undefined;

	const args = [
		newmanBin,
		'run',
		collectionPath,
		'--env-var',
		`baseUrl=${baseUrl}`,
		'--timeout-request',
		'60000',
		'--timeout',
		'180000',
	];
	if (dataPath) args.push('--iteration-data', dataPath);
	if (reportDir)
		args.push('--reporters', 'cli,json', '--reporter-json-export', path.join(reportDir, `${suiteKey}.json`));

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

	return result.status ?? 1;
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

	if (parsed.reportDir) mkdirSync(parsed.reportDir, { recursive: true });
	const results = suites.map((suite) => ({ suite, exitCode: runNewmanSuite(suite, baseUrl, parsed.reportDir) }));
	if (parsed.reportDir) writeFileSync(path.join(parsed.reportDir, 'summary.json'), JSON.stringify(results, null, 2));
	if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1;
}

await main().catch((error) => {
	console.error(`[postman-e2e] ${error.message}`);
	process.exit(1);
});
