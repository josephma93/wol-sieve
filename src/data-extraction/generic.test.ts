import { describe, it, expect } from 'vitest';
import {
	cleanInlineText,
	cleanText,
	collapseConsecutiveLineBreaks,
	isExternalHttpUrl,
	isWolUrl,
	takeOutTimeBoxText,
} from '../kernel/index.js';
import * as cheerio from 'cheerio';
import { isVideoAnchor } from './generic.js';

describe('data-extraction/generic utilities', () => {
	it('cleanText removes NBSP and trims', () => {
		const input = '\u00A0 Hello\u00A0World \u00A0 ';
		expect(cleanText(input)).toBe('Hello World');
	});

	it('cleanInlineText collapses whitespace runs into single spaces', () => {
		const input = '\u00A0 Hello\n\tWorld   again \u00A0 ';
		expect(cleanInlineText(input)).toBe('Hello World again');
	});

	it('collapseConsecutiveLineBreaks reduces multiple newlines', () => {
		const input = 'a\n\n\n b\n\n c';
		expect(collapseConsecutiveLineBreaks(input)).toBe('a\n b\n c');
	});

	it('takeOutTimeBoxText removes leading timebox content up to first closing parenthesis', () => {
		const input = '(10 min.) Some section title and content';
		expect(takeOutTimeBoxText(input)).toBe('Some section title and content');
	});

	it('isWolUrl accepts only absolute URLs from the configured WOL host', () => {
		expect(isWolUrl('https://wol.jw.org/es/wol/d/r4/lp-s/2025521')).toBe(true);
		expect(isWolUrl('https://wol.jw.org.evil.example/es/wol/d/r4/lp-s/2025521')).toBe(false);
		expect(isWolUrl('/es/wol/d/r4/lp-s/2025521')).toBe(false);
		expect(isWolUrl('not a url')).toBe(false);
	});

	it('isExternalHttpUrl accepts only absolute HTTP URLs outside WOL', () => {
		expect(isExternalHttpUrl('https://example.com/resource')).toBe(true);
		expect(isExternalHttpUrl('https://wol.jw.org/es/wol/d/r4/lp-s/2025521')).toBe(false);
		expect(isExternalHttpUrl('/es/wol/d/r4/lp-s/2025521')).toBe(false);
		expect(isExternalHttpUrl('mailto:person@example.com')).toBe(false);
		expect(isExternalHttpUrl('not a url')).toBe(false);
	});

	it('isVideoAnchor detects anchors with WOL video metadata', () => {
		const $ = cheerio.load(`
			<a id="video" href="https://www.jw.org/finder?lank=test" data-video="webpubvid://test">Play</a>
			<a id="article" href="/es/wol/d/r4/lp-s/123">Article</a>
		`);

		expect(isVideoAnchor($('#video'))).toBe(true);
		expect(isVideoAnchor($('#article'))).toBe(false);
	});
});
