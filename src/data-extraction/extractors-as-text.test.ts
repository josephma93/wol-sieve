import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { detectReferenceDataType } from './reference-json-commons.js';
import {
	extractPubNwtstyReferenceAsText,
	extractPubWReferenceAsText,
	pickAndApplyTextExtractor,
} from './extractors-as-text.js';

describe('extractPubWReferenceAsText', () => {
	it('extracts standard publication paragraphs when citation paragraph classes are absent', () => {
		const content = `
			<div class="bodyTxt">
				<p id="p2">First standard paragraph.</p>
				<p id="p3">Second standard paragraph.</p>
			</div>
		`;

		expect(extractPubWReferenceAsText(content)).toBe('First standard paragraph.\nSecond standard paragraph.');
	});

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

describe('extractPubNwtstyReferenceAsText', () => {
	it('continues to remove Bible reference anchors from standard scripture content', () => {
		const content = `<p class="sb">Jesús aguantó un madero de tormento (<a class="b" href="/es/wol/bc/r4/lp-s/2026484/1/0">Heb 12:2</a>).</p>`;

		expect(extractPubNwtstyReferenceAsText(content)).toBe('Jesús aguantó un madero de tormento ().');
	});

	it('adds spacing between split verse segments', () => {
		const content = `
			<div id="p2721" data-pid="2721">
				<p data-pid="2721" class="sl">
					<span id="v19-119-1-1" class="v">
						<a class="cl vx vp"><strong>119</strong> <span class="tt cl"></span></a>
						Felices los que son intachables<a class="fn">*<span class="tt fn"></span></a> en su camino,
					</span>
				</p>
				<p data-pid="2721" class="sz">
					<span id="v19-119-1-2" class="v">
						los que andan de acuerdo con la ley de Jehová.<a class="b">+<span class="tt m"></span></a>
					</span>
				</p>
			</div>
		`;
		const $ = cheerio.load(content);
		const verseSegments = $('[id^="v19-119-1-"]');

		expect(extractPubNwtstyReferenceAsText(verseSegments, $)).toBe(
			'119 Felices los que son intachables en su camino, los que andan de acuerdo con la ley de Jehová.',
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
		expect(
			pickAndApplyTextExtractor(detection, {
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
			}),
		).toBe('Jehová consintió que algunos de sus siervos ocuparan importantes cargos públicos.');
	});

	it('uses study notes instead of scripture text for study Bible references with studyContent', () => {
		const content = `
			<p class="sb">
				<span class="verseNum">12</span>
				Por eso también estoy sufriendo todo esto, pero no me avergüenzo.
			</p>
		`;
		const studyContent = `
			<div class="studyNotes">
				<p class="s5">
					<strong>lo que he dejado bajo su cuidado:</strong>
					Probablemente Pablo quería decir que había confiado su vida futura a Jehová
					(<a class="b" href="/es/wol/bc/r4/lp-s/2026484/1/0">2Ti 1:11</a>).
				</p>
				<p class="s5">
					<strong>ese día:</strong>
					Es decir, el día en que Jehová lo resucitara.
				</p>
			</div>
		`;
		const publicationItem = {
			articleClasses: 'bibleCitation html5 pub- docId-1001061160 pub-nwtsty',
			caption: '',
			categories: [],
			content,
			studyContent,
			englishSymbol: 'nwtsty',
			publicationTitle: 'La Biblia. Traducción del Nuevo Mundo (edición de estudio)',
			pubType: '',
			reference: '',
			source: 'La Biblia. Traducción del Nuevo Mundo (edición de estudio)',
			title: '2 Timoteo 1:12',
			url: '',
		};
		const detection = detectReferenceDataType(publicationItem);

		expect(pickAndApplyTextExtractor(detection, publicationItem)).toBe(
			'lo que he dejado bajo su cuidado: Probablemente Pablo quería decir que había confiado su vida futura a Jehová (2Ti 1:11).\n\nese día: Es decir, el día en que Jehová lo resucitara.',
		);
	});
});
