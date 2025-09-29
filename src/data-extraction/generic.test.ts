import { describe, it, expect } from 'vitest';
import { cleanText, collapseConsecutiveLineBreaks, takeOutTimeBoxText } from '../kernel/index.js';

describe('data-extraction/generic utilities', () => {
	it('cleanText removes NBSP and trims', () => {
		const input = '\u00A0 Hello\u00A0World \u00A0 ';
		expect(cleanText(input)).toBe('Hello World');
	});

	it('collapseConsecutiveLineBreaks reduces multiple newlines', () => {
		const input = 'a\n\n\n b\n\n c';
		expect(collapseConsecutiveLineBreaks(input)).toBe('a\n b\n c');
	});

	it('takeOutTimeBoxText removes leading timebox content up to first closing parenthesis', () => {
		const input = '(10 min.) Some section title and content';
		expect(takeOutTimeBoxText(input)).toBe('Some section title and content');
	});
});
