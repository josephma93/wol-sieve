import express from 'express';
import { pubLfbV2Router } from './pub-lfb.js';
import { pubMwbV2Router } from './pub-mwb.js';
import { pubNwtstyV2Router } from './pub-nwtsty.js';
import { pubWV2Router } from './pub-w.js';
import { pubWcgV2Router } from './pub-wcg.js';
import { prettyJsonResponseMiddleware } from './pretty-json.js';

export const v2Router = express.Router();

v2Router.get('/', (_req, res) => {
	res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>wol-sieve v2</title>
	<style>
		body {
			color: #1f2937;
			font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			line-height: 1.45;
			margin: 2rem;
			max-width: 960px;
		}

		h1,
		h2 {
			line-height: 1.2;
		}

		section {
			border-top: 1px solid #d1d5db;
			margin-top: 1.5rem;
			padding-top: 1rem;
		}

		ul {
			padding-left: 1.25rem;
		}

		li {
			margin: 0.5rem 0;
		}

		code {
			background: #f3f4f6;
			border-radius: 4px;
			padding: 0.1rem 0.25rem;
		}
	</style>
</head>
<body>
	<h1>wol-sieve v2</h1>
	<p>GET-only endpoints. Links with no query params use the current default WOL source.</p>

	<section>
		<h2>Watchtower</h2>
		<ul>
			<li><a href="/v2/pub-w/">GET /v2/pub-w/</a></li>
			<li><a href="/v2/pub-w/?url=https://wol.jw.org/es/wol/d/r4/lp-s/2025521">GET /v2/pub-w/?url=...</a></li>
		</ul>
	</section>

	<section>
		<h2>Midweek Meeting</h2>
		<ul>
			<li><a href="/v2/pub-mwb/">GET /v2/pub-mwb/</a></li>
			<li><a href="/v2/pub-mwb/?url=https://wol.jw.org/es/wol/d/r4/lp-s/202025325">GET /v2/pub-mwb/?url=...</a></li>
			<li><a href="/v2/pub-mwb/treasures-talk">GET /v2/pub-mwb/treasures-talk</a></li>
			<li><a href="/v2/pub-mwb/treasures-talk?url=https://wol.jw.org/es/wol/d/r4/lp-s/202025325">GET /v2/pub-mwb/treasures-talk?url=...</a></li>
		</ul>
	</section>

	<section>
		<h2>Study Bible References</h2>
		<ul>
			<li><a href="/v2/pub-nwtsty/">GET /v2/pub-nwtsty/</a></li>
			<li><a href="/v2/pub-nwtsty/?urls=https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70&amp;urls=https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/71">GET /v2/pub-nwtsty/?urls=...&amp;urls=...</a></li>
			<li><a href="/v2/pub-nwtsty/grouped">GET /v2/pub-nwtsty/grouped</a></li>
			<li><a href="/v2/pub-nwtsty/grouped?urls=https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/70&amp;urls=https://wol.jw.org/es/wol/b/r4/lp-s/nwtsty/19/71&amp;tokenLimit=1000">GET /v2/pub-nwtsty/grouped?urls=...&amp;urls=...&amp;tokenLimit=1000</a></li>
		</ul>
	</section>

	<section>
		<h2>Lessons From the Bible</h2>
		<ul>
			<li><a href="/v2/pub-lfb/">GET /v2/pub-lfb/</a></li>
			<li><a href="/v2/pub-lfb/?urls=https://wol.jw.org/es/wol/d/r4/lp-s/1102016021&amp;urls=https://wol.jw.org/es/wol/d/r4/lp-s/1102016022">GET /v2/pub-lfb/?urls=...&amp;urls=...</a></li>
		</ul>
	</section>

	<section>
		<h2>Courage Book</h2>
		<ul>
			<li><a href="/v2/pub-wcg/">GET /v2/pub-wcg/</a></li>
			<li><a href="/v2/pub-wcg/?urls=https://wol.jw.org/es/wol/d/r4/lp-s/1102025910">GET /v2/pub-wcg/?urls=...</a></li>
		</ul>
	</section>
</body>
</html>`);
});

v2Router.use(prettyJsonResponseMiddleware);

v2Router.use('/pub-w', pubWV2Router);
v2Router.use('/pub-mwb', pubMwbV2Router);
v2Router.use('/pub-nwtsty', pubNwtstyV2Router);
v2Router.use('/pub-lfb', pubLfbV2Router);
v2Router.use('/pub-wcg', pubWcgV2Router);
