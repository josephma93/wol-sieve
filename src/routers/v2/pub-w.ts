import express from 'express';
import { fetchThisWeekWatchtowerHtml } from '../../data-fetching/wol-pages.js';
import { extractArticleContents } from '../../scrappers/pub-w/pub-w.js';
import { TEST_HOOK } from '../../test-helpers/test-hook.js';
import { createSingleSourceScraperHandler } from './helpers.js';

export const pubWV2Router = express.Router();

const handleArticleContents = createSingleSourceScraperHandler({
	defaultHtmlGenerator: fetchThisWeekWatchtowerHtml,
	scrapperOperation: extractArticleContents,
	errorLabel: 'Failed to extract article contents',
});

pubWV2Router.get('/', handleArticleContents);

(pubWV2Router as any)[TEST_HOOK] = { handleArticleContents };
