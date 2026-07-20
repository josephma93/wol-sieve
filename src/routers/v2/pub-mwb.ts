import express from 'express';
import { fetchThisWeekMeetingHtml } from '../../data-fetching/wol-pages.js';
import { extractFullWeekProgramV2, extractTreasuresTalkV2 } from '../../scrappers/pub-mwb/pub-mwb.js';
import { TEST_HOOK } from '../../test-helpers/test-hook.js';
import { createSingleSourceScraperHandler } from './helpers.js';

export const pubMwbV2Router = express.Router();

const handleFullWeekProgram = createSingleSourceScraperHandler({
	defaultHtmlGenerator: fetchThisWeekMeetingHtml,
	scrapperOperation: extractFullWeekProgramV2,
	errorLabel: 'Failed to extract meeting program',
});

const handleTreasuresTalk = createSingleSourceScraperHandler({
	defaultHtmlGenerator: fetchThisWeekMeetingHtml,
	scrapperOperation: extractTreasuresTalkV2,
	errorLabel: 'Failed to extract treasures talk',
});

pubMwbV2Router.get('/', handleFullWeekProgram);
pubMwbV2Router.get('/treasures-talk', handleTreasuresTalk);

(pubMwbV2Router as any)[TEST_HOOK] = { handleFullWeekProgram, handleTreasuresTalk };
