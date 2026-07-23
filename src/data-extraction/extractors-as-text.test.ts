import { describe, expect, it } from 'vitest';
import { detectReferenceDataType } from './reference-json-commons.js';
import { extractPubWReferenceAsText, pickAndApplyTextExtractor } from './extractors-as-text.js';

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

describe('pickAndApplyTextExtractor', () => {
	it('uses the Watchtower extractor for dated Watchtower publication classes', () => {
		const content = `
			<div class="bodyTxt">
				<p id="p39" data-pid="39" class="qu">
					4. ¿Por qué permitió Jehová que José se hiciera prominente en el gobierno de Egipto?
				</p>
				<p id="p7" data-pid="7" data-rel-pid="[39]" class="sb">
					<span class="parNum" data-pnum="4"><strong><sup>4</sup></strong></span>
					Jehová consintió que algunos de sus siervos ocuparan importantes cargos públicos.
				</p>
			</div>
		`;
		const detection = detectReferenceDataType({
			articleClasses: 'publicationCitation html5 pub- docId-1996331 pub-w96 pub- pub-w96 docClass-40',
			caption: '',
			categories: [],
			content,
			publicationTitle: 'La Atalaya 1996 | 1 de mayo',
			pubType: '',
			reference: '',
			source: '',
			title: 'Dios y el César',
			url: '',
		});

		expect(detection.isPubW).toBe(true);
		expect(pickAndApplyTextExtractor(detection, content)).toBe(
			'Jehová consintió que algunos de sus siervos ocuparan importantes cargos públicos.',
		);
	});
});
