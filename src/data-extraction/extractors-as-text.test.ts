import { describe, expect, it } from 'vitest';
import { extractPubWReferenceAsText } from './extractors-as-text.js';

describe('extractPubWReferenceAsText', () => {
	it('extracts Watchtower citation paragraphs without p.sb classes', () => {
		const content = `
			<div class="bodyTxt">
				<p id="p60" data-pid="60" class="qu">
					<strong>11.</strong> Si sentimos que no tenemos las fuerzas?
				</p>
				<div class="gen-field" id="p61" data-pid="61">
					<label for="tt78" id="tt76" class="dc-screenReaderText">Respuesta</label>
					<textarea id="tt78" name="textarea-12"></textarea>
				</div>
				<p id="p19" data-pid="19" data-rel-pid="[60]">
					<span class="parNum" data-pnum="11"><strong><sup>11</sup></strong></span>
					A veces, la imperfección puede ser como una voz dentro de nuestra cabeza.
				</p>
			</div>
		`;

		expect(extractPubWReferenceAsText(content)).toBe(
			'A veces, la imperfección puede ser como una voz dentro de nuestra cabeza.',
		);
	});
});
