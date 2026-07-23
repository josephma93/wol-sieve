import { beforeEach, describe, expect, it, vi } from 'vitest';

const referenceMocks = vi.hoisted(() => ({
	fetchAndParseAnchorReferenceOrThrow: vi.fn(),
}));

vi.mock('../../data-fetching/reference-json.js', () => ({
	fetchAndParseAnchorReferenceOrThrow: referenceMocks.fetchAndParseAnchorReferenceOrThrow,
}));

import { extractWcgContents } from './pub-wcg.js';

function normalizeTestText(text: string): string {
	return text.trim().replaceAll(' ', ' ').replace(/\s+/g, ' ');
}

function parsedReference(title: string) {
	const isBible = /^(Génesis|Hebreos)/i.test(title);

	return {
		articleClasses: isBible ? 'pub-nwtsty' : 'pub-w',
		englishSymbol: '',
		parsedContent: `${isBible ? 'Scripture' : 'Parsed'}:${title}`,
		publicationTitle: isBible ? 'Traducción del Nuevo Mundo' : 'Publication',
		pubType: '',
		referenceType: isBible ? 'bible' : 'pub-w',
		source: isBible ? 'Bible' : 'Source',
		title,
	};
}

function article({
	docClass,
	header,
	body = '',
	extra = '',
}: {
	docClass: string;
	header: string;
	body?: string;
	extra?: string;
}) {
	return `
		<div id="article" class="article document html5 pub-wcg docClass-${docClass} docId-1102025910">
			<div class="scalableui">
				<header>${header}</header>
				${body ? `<div class="bodyTxt">${body}</div>` : ''}
				${extra}
			</div>
		</div>
	`;
}

beforeEach(() => {
	referenceMocks.fetchAndParseAnchorReferenceOrThrow.mockImplementation(async ($anchor) => {
		const title = normalizeTestText($anchor.text());
		return { err: null, res: parsedReference(title) };
	});
});

describe('extractWcgContents', () => {
	it('extracts lesson pages with the section-specific WCG contract', async () => {
		const html = article({
			docClass: '13',
			header: `
				<div id="f1"><img src="/es/wol/mp/r4/lp-s/wcg/2025/241" alt=""></div>
				<p id="p1" class="contextTtl">5 ABRAHÁN</p>
				<h1 id="p2">Superó el desafío más difícil de su vida</h1>
			`,
			body: `
				<div id="tt4">
					<p id="p3">Primer párrafo de narración.</p>
					<p id="p4">Segundo párrafo de narración con <a href="/ref/genesis-12">Gén. 12:2</a>.</p>
					<div id="f2">
						<figure>
							<img src="/es/wol/mp/r4/lp-s/wcg/2025/111" alt="Abrahán e Isaac caminando hacia una montaña.">
						</figure>
					</div>
					<div class="stdPullQuote">
						<p><strong>Cita destacada de la lección.</strong></p>
					</div>
					<p id="p5">Tercer párrafo de narración después de la imagen.</p>
					<div id="f7">
						<figure>
							<img src="/es/wol/mp/r4/lp-s/wcg/2025/112" alt="Abrahán caminando con Isaac después de la prueba.">
						</figure>
					</div>
					<h3 id="p12"><strong>Lea el relato bíblico</strong></h3>
					<ul>
						<li><p id="p13"><a href="/bible/genesis-22">Génesis 22:1-19</a></p></li>
						<li><p id="p14"><a href="/bible/hebrews-11-a">Hebreos 11:11, 12</a>; <a href="/bible/hebrews-11-b">Hebreos 11:17-19</a></p></li>
					</ul>
					<h3 id="p15"><strong>¿Qué diría?</strong></h3>
					<p id="p16"><strong>¿De qué maneras demostró valor Abrahán durante esta etapa de su vida?</strong></p>
					<div id="p17" class="gen-field">Respuesta</div>
				</div>
				<div id="tt14">
					<h2 id="p18"><strong>Investigue un poco más</strong></h2>
					<ol>
						<li>
							<p id="p19">1. ¿Qué pruebas hay de que Abrahán fue alguien real? (<a href="/ref/g-5-12">g 5/12 18, recuadro</a>).</p>
							<div id="p20" class="gen-field">Respuesta</div>
						</li>
						<li>
							<p id="p21">2. ¿Qué hizo que Jehová aceptara la adoración de Abrahán? (<a href="/ref/rr-20">rr 20 párr. 18</a>). <span class="du-color--orange-700"><strong>A</strong></span></p>
							<div id="p22" class="gen-field">Respuesta</div>
							<div id="f3" class="south_center">
								<figure>
									<img src="/es/wol/mp/r4/lp-s/wcg/2025/113" alt="Un relieve sobre un muro de Karnak.">
									<p class="imgCredit">Museum credit</p>
									<figcaption><p><span class="dc-screenReaderText">Imagen </span><span class="du-bgColor--orange-600"><strong>A</strong></span><span class="dc-screenReaderText">: </span>Un relieve sobre un muro de Karnak que menciona el campo de Abrán.</p></figcaption>
								</figure>
							</div>
						</li>
					</ol>
					<div id="tt24">
						<ol>
							<li>
								<p id="p23">3. ¿Cómo confirma la promesa de Génesis 22:17 que la Biblia es exacta? (<a href="/ref/g88">g88 8/4 25</a>). B</p>
								<div id="p24" class="gen-field">Respuesta</div>
							</li>
						</ol>
					</div>
					<div id="f4">
						<figure>
							<img src="/es/wol/mp/r4/lp-s/wcg/2025/116" alt="Una vista del cielo lleno de estrellas.">
							<figcaption><p>Imagen B</p></figcaption>
						</figure>
					</div>
					<h2 id="p28"><strong>Piense en las lecciones</strong></h2>
					<ul>
						<li>
							<p id="p29">¿Cómo le ayudó la esperanza a Abrahán a ser valiente? (<a href="/bible/hebrews-11-19">Hebreos 11:19</a>). C</p>
							<div id="p30" class="gen-field">Respuesta</div>
							<div id="f5">
								<figure>
									<img src="/es/wol/mp/r4/lp-s/wcg/2025/119" alt="Abrahán pensando en la resurrección.">
									<figcaption><p>Imagen C</p></figcaption>
								</figure>
							</div>
						</li>
						<li>
							<p id="p31">Podemos imitar el valor de Abrahán haciendo sacrificios.</p>
							<ul>
								<li>
									<p id="p32">Cuando se nos presenta la oportunidad de predicar (<a href="/bible/hebrews-13-15">Hebreos 13:15</a>).</p>
									<div id="p33" class="gen-field">Respuesta</div>
								</li>
								<li>
									<p id="p34">Al decidir qué haremos con nuestras cosas materiales (<a href="/bible/proverbs-3-9">Proverbios 3:9</a>). <span class="du-color--orange-700"><strong>D</strong></span></p>
									<div id="p35" class="gen-field">Respuesta</div>
									<div id="f6">
										<figure>
											<img src="/es/wol/mp/r4/lp-s/wcg/2025/121" alt="Una familia decidiendo qué hacer con sus cosas materiales.">
											<figcaption><p><span class="dc-screenReaderText">Imagen </span><span class="du-bgColor--orange-600"><strong>D</strong></span></p></figcaption>
										</figure>
									</div>
								</li>
							</ul>
						</li>
					</ul>
					<h2 id="p40"><strong>Vea el cuadro completo</strong></h2>
					<ul>
						<li><p id="p41">¿Qué me enseña este relato sobre Jehová?</p><div id="p42" class="gen-field">Respuesta</div></li>
						<li><p id="p43">¿Cómo se relaciona este relato con el propósito de Jehová?</p><div id="p44" class="gen-field">Respuesta</div></li>
					</ul>
					<div id="tt95">
						<h2 id="p47"><strong>Para saber más</strong></h2>
						<p>Esta sección no pertenece al contrato de lesson.</p>
					</div>
				</div>
			`,
		});

		const parsed = await extractWcgContents({ html });
		const contents = parsed.contents as any;

		expect(parsed.type).toBe('LESSON');
		expect(contents).toMatchObject({
			number: 5,
			subject: 'ABRAHÁN',
			title: 'Superó el desafío más difícil de su vida',
			narration:
				'Primer párrafo de narración.\n\nSegundo párrafo de narración con Gén. 12:2.\n\nTercer párrafo de narración después de la imagen.',
			narrationFigures: [
				{
					src: 'https://wol.jw.org/es/wol/mp/r4/lp-s/wcg/2025/111',
					alt: 'Abrahán e Isaac caminando hacia una montaña.',
				},
				{
					src: 'https://wol.jw.org/es/wol/mp/r4/lp-s/wcg/2025/112',
					alt: 'Abrahán caminando con Isaac después de la prueba.',
				},
			],
			featuredQuote: 'Cita destacada de la lección.',
			readTheBibleAccount: [
				{ mnemonic: 'Génesis 22:1-19', scripture: 'Scripture:Génesis 22:1-19' },
				{ mnemonic: 'Hebreos 11:11, 12', scripture: 'Scripture:Hebreos 11:11, 12' },
				{ mnemonic: 'Hebreos 11:17-19', scripture: 'Scripture:Hebreos 11:17-19' },
			],
			forDiscussion: '¿De qué maneras demostró valor Abrahán durante esta etapa de su vida?',
			meditateOnTheBiggerPicture: [
				'¿Qué me enseña este relato sobre Jehová?',
				'¿Cómo se relaciona este relato con el propósito de Jehová?',
			],
		});
		for (const rejectedKey of [
			'publication',
			'articleClasses',
			'docClass',
			'docId',
			'contextTitle',
			'paragraphs',
			'contents',
			'questions',
			'bibleReading',
			'sections',
			'figures',
			'coverFigure',
			'narrationFigure',
		]) {
			expect(contents).not.toHaveProperty(rejectedKey);
		}

		expect(contents.digDeeper).toHaveLength(3);
		expect(contents.digDeeper[0]).toMatchObject({
			text: '1. ¿Qué pruebas hay de que Abrahán fue alguien real? (g 5/12 18, recuadro).',
			textWithCitations: '1. ¿Qué pruebas hay de que Abrahán fue alguien real? ([[cite:1]]).',
			figure: null,
		});
		expect(contents.digDeeper[0].citations).toEqual([
			expect.objectContaining({
				marker: '[[cite:1]]',
				mnemonic: 'g 5/12 18, recuadro',
				contents: 'Parsed:g 5/12 18, recuadro',
			}),
		]);
		expect(contents.digDeeper[1]).toMatchObject({
			text: '2. ¿Qué hizo que Jehová aceptara la adoración de Abrahán? (rr 20 párr. 18). A',
			textWithCitations: '2. ¿Qué hizo que Jehová aceptara la adoración de Abrahán? ([[cite:1]]). A',
			figure: {
				id: 'f3',
				src: 'https://wol.jw.org/es/wol/mp/r4/lp-s/wcg/2025/113',
				alt: 'Un relieve sobre un muro de Karnak.',
				caption: 'Imagen A: Un relieve sobre un muro de Karnak que menciona el campo de Abrán.',
				credit: 'Museum credit',
			},
		});
		expect(contents.digDeeper[2].figure).toMatchObject({
			id: 'f4',
			src: 'https://wol.jw.org/es/wol/mp/r4/lp-s/wcg/2025/116',
			alt: 'Una vista del cielo lleno de estrellas.',
			caption: 'Imagen B',
		});
		expect(contents.digDeeper[2].figure).not.toHaveProperty('credit');

		expect(contents.reflectOnTheLessons).toHaveLength(2);
		expect(contents.reflectOnTheLessons[0]).toMatchObject({
			text: '¿Cómo le ayudó la esperanza a Abrahán a ser valiente? (Hebreos 11:19). C',
			textWithCitations: '¿Cómo le ayudó la esperanza a Abrahán a ser valiente? ([[cite:1]]). C',
			figure: {
				id: 'f5',
				src: 'https://wol.jw.org/es/wol/mp/r4/lp-s/wcg/2025/119',
				alt: 'Abrahán pensando en la resurrección.',
				caption: 'Imagen C',
			},
		});
		expect(contents.reflectOnTheLessons[1]).toMatchObject({
			text: 'Podemos imitar el valor de Abrahán haciendo sacrificios.',
			figure: null,
			subPoints: [
				expect.objectContaining({
					text: 'Cuando se nos presenta la oportunidad de predicar (Hebreos 13:15).',
					textWithCitations: 'Cuando se nos presenta la oportunidad de predicar ([[cite:1]]).',
					figure: null,
				}),
				expect.objectContaining({
					text: 'Al decidir qué haremos con nuestras cosas materiales (Proverbios 3:9). D',
					textWithCitations: 'Al decidir qué haremos con nuestras cosas materiales ([[cite:1]]). D',
					figure: {
						id: 'f6',
						src: 'https://wol.jw.org/es/wol/mp/r4/lp-s/wcg/2025/121',
						alt: 'Una familia decidiendo qué hacer con sus cosas materiales.',
						caption: 'Imagen D',
					},
				}),
			],
		});
	});

	it('matches localized figure markers from the WOL stencil', async () => {
		const parsed = await extractWcgContents({
			html: article({
				docClass: '13',
				header: '<p class="contextTtl">1 TEST</p><h1>Localized marker lesson</h1>',
				body: `
					<p>Lesson narration.</p>
					<div class="stdPullQuote"><p>Featured quote.</p></div>
					<h3><strong>Lea el relato bíblico</strong></h3>
					<ul><li><p><a href="/bible/genesis-1">Génesis 1:1</a></p></li></ul>
					<h3><strong>¿Qué diría?</strong></h3>
					<p>Discussion question.</p>
					<div class="gen-field">Respuesta</div>
					<h2><strong>Investigue un poco más</strong></h2>
					<ol>
						<li>
							<p>Pregunta con marcador localizado <span class="du-color--orange-700"><strong>(ภาพ ก)</strong></span></p>
							<div class="gen-field">Respuesta</div>
							<div id="f3">
								<figure>
									<img src="/es/wol/mp/r4/lp-s/wcg/2025/113" alt="Campo con palmeras.">
									<figcaption><p><span class="dc-screenReaderText">ภาพ </span><span class="du-bgColor--orange-600"><strong>ก</strong></span></p></figcaption>
								</figure>
							</div>
						</li>
					</ol>
					<h2><strong>Piense en las lecciones</strong></h2>
					<ul></ul>
					<h2><strong>Vea el cuadro completo</strong></h2>
					<ul></ul>
				`,
			}),
		});

		const contents = parsed.contents as any;

		expect(contents.digDeeper[0]).toMatchObject({
			text: 'Pregunta con marcador localizado (ภาพ ก)',
			figure: {
				id: 'f3',
				src: 'https://wol.jw.org/es/wol/mp/r4/lp-s/wcg/2025/113',
				alt: 'Campo con palmeras.',
				caption: 'ภาพ ก',
			},
		});
	});

	it('separates section introductions from timelines even though both use docClass-15', async () => {
		const sectionIntro = await extractWcgContents({
			html: article({
				docClass: '15',
				header: `
					<div id="f1"><figure><img src="/es/wol/mp/r4/lp-s/wcg/2025/1343" alt=""></figure></div>
					<div id="f2"><figure><img src="/es/wol/mp/r4/lp-s/wcg/2025/1345" alt="Abrahán y Sara viajando en camello por la orilla del Éufrates."></figure></div>
					<p id="p1" class="contextTtl">SECCIÓN 1</p>
					<h1 id="p2">De los días de los patriarcas</h1>
				`,
				body: '<p>Section introduction paragraph.</p>',
			}),
		});

		const timeline = await extractWcgContents({
			html: article({
				docClass: '15',
				header: '<h1 id="p1">Timeline-shaped page</h1>',
				body: `
						<p>De los días de los patriarcas</p>
						<h2>Antes del Diluvio</h2>
						<table><tr><th>PERSONAJE</th><th>AÑO</th></tr><tr><td>Adán</td><td>4026-3096 a. e. c.</td></tr></table>
					`,
				extra: '<div class="groupFootnote"><p>a Año aproximado.</p></div>',
			}),
		});

		expect(sectionIntro.type).toBe('SECTION_INTRO');
		expect((sectionIntro.contents as any).sectionNumber).toBe(1);
		expect((sectionIntro.contents as any).headingImg).toEqual({
			src: 'https://wol.jw.org/es/wol/mp/r4/lp-s/wcg/2025/1345',
			alt: 'Abrahán y Sara viajando en camello por la orilla del Éufrates.',
		});
		expect(sectionIntro.contents as any).not.toHaveProperty('figures');
		expect(timeline.type).toBe('TIMELINE');
		expect((timeline.contents as any).tables).toEqual([
			{
				heading: 'Antes del Diluvio',
				headers: ['PERSONAJE', 'AÑO'],
				rows: [['Adán', '4026-3096 a. e. c.']],
			},
		]);
		expect((timeline.contents as any).footnotes).toEqual(['a Año aproximado.']);
	});

	it('detects front matter, introduction, conclusion, and index pages', async () => {
		const cases = [
			['39', '<h1>Seamos valientes al andar con Dios</h1>', '', 'COVER'],
			[
				'18',
				'<p class="contextTtl">Portada/Página de los editores</p><h1>Seamos valientes</h1>',
				'',
				'PUBLISHERS_PAGE',
			],
			['24', '<h1>Carta del Cuerpo Gobernante</h1>', '<p>Queridos hermanos:</p>', 'GB_LETTER'],
			[
				'13',
				'<p class="contextTtl">OPENING MATERIAL</p><h1>Intro-shaped page</h1>',
				'<p>Intro.</p>',
				'INTRODUCTION',
			],
			[
				'13',
				'<p class="contextTtl">CLOSING MATERIAL</p><h1>Conclusion-shaped page</h1>',
				'<p>Conclusion.</p><h3>Prompt</h3>',
				'CONCLUSION',
			],
			['16', '<h1>Contracubierta</h1>', '', 'BACK_COVER'],
		];

		for (const [docClass, header, body, type] of cases) {
			await expect(extractWcgContents({ html: article({ docClass, header, body }) })).resolves.toMatchObject({
				type,
			});
		}

		const index = await extractWcgContents({
			html: article({
				docClass: '19',
				header: '<h1>Índice</h1>',
				extra: '<div class="groupTOC"><a href="/es/wol/d/r4/lp-s/1102025910">10 MOISÉS</a></div>',
			}),
		});

		expect(index.type).toBe('INDEX');
		expect((index.contents as any).links).toEqual([
			{ text: '10 MOISÉS', href: 'https://wol.jw.org/es/wol/d/r4/lp-s/1102025910' },
		]);
	});

	it('rejects non-WCG article HTML', async () => {
		await expect(
			extractWcgContents({
				html: '<div id="article" class="article document html5 pub-lfb docClass-13"><h1>Other publication</h1></div>',
			}),
		).rejects.toThrow('Unsupported WCG page');
	});
});
