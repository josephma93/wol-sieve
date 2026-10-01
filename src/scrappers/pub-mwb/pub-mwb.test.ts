import { beforeEach, describe, expect, it, vi } from 'vitest';

const referenceMocks = vi.hoisted(() => ({
	fetchAndParseAnchorReferenceOrThrow: vi.fn(),
}));

vi.mock('../../data-fetching/reference-json.js', () => ({
	fetchAndParseAnchorReferenceOrThrow: referenceMocks.fetchAndParseAnchorReferenceOrThrow,
}));

import { extractFieldMinistry, extractFieldMinistryV2 } from './pub-mwb.js';

interface TestAssignment {
	headline: string;
	content: string;
}

function page(assignments: TestAssignment[]): string {
	const assignmentHtml = assignments
		.map(({ headline, content }, index) => `<h3>${index + 4}. ${headline}</h3>${content}`)
		.join('');

	return `
		<div id="article">
			<div class="bodyTxt">
				<div class="dc-icon--wheat"><h2>SEAMOS MEJORES MAESTROS</h2></div>
				${assignmentHtml}
				<div class="dc-icon--sheep"><h2>NUESTRA VIDA CRISTIANA</h2></div>
			</div>
		</div>
	`;
}

function timeBox(minutes: number, text: string): string {
	return `<div class="du-color--textSubdued"><p>(${minutes} mins.) ${text}</p></div>`;
}

function question(text: string): string {
	return `<li><p>${text}</p></li>`;
}

function parsedReference(title: string) {
	return {
		parsedContent: `Parsed:${title}`,
		referenceType: 'pub-w',
		articleClasses: 'pub-w',
		englishSymbol: '',
		pubType: '',
		publicationTitle: 'Publication',
		source: 'Source',
		title,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	referenceMocks.fetchAndParseAnchorReferenceOrThrow.mockImplementation(async ($anchor) => ({
		err: null,
		res: parsedReference($anchor.text()),
	}));
});

describe('extractFieldMinistryV2', () => {
	it('extracts a simple assignment as one citation text item', async () => {
		const result = await extractFieldMinistryV2({
			html: page([
				{
					headline: 'Empiece conversaciones',
					content: timeBox(3, 'Hable con alguien de su vecindario.'),
				},
			]),
		});

		expect(result).toEqual([
			{
				sectionNumber: 4,
				timeBox: 3,
				headline: 'Empiece conversaciones',
				type: 'startingAConversation',
				content: [
					{
						kind: 'text',
						payload: {
							text: 'Hable con alguien de su vecindario.',
							textWithCitations: 'Hable con alguien de su vecindario.',
							citations: [],
						},
					},
				],
			},
		]);
	});

	it('keeps markers and resolved citations for every WOL anchor', async () => {
		const result = await extractFieldMinistryV2({
			html: page([
				{
					headline: 'Haga revisitas',
					content: timeBox(
						4,
						'Lea <a href="/es/wol/pc/r4/lp-s/one">Ref A</a> y consulte <a href="/es/wol/pc/r4/lp-s/two">Ref B</a>.',
					),
				},
			]),
		});

		expect(result[0].content).toEqual([
			{
				kind: 'text',
				payload: {
					text: 'Lea Ref A y consulte Ref B.',
					textWithCitations: 'Lea [[cite:1]] y consulte [[cite:2]].',
					citations: [
						expect.objectContaining({
							id: 1,
							marker: '[[cite:1]]',
							mnemonic: 'Ref A',
							contents: 'Parsed:Ref A',
						}),
						expect.objectContaining({
							id: 2,
							marker: '[[cite:2]]',
							mnemonic: 'Ref B',
							contents: 'Parsed:Ref B',
						}),
					],
				},
			},
		]);
	});

	it.each([
		['Empiece conversaciones', 'startingAConversation'],
		['Empecemos conversaciones', 'startingAConversation'],
		['Starting a Conversation', 'startingAConversation'],
		['Start Conversations', 'startingAConversation'],
		['Haga revisitas', 'followingUp'],
		['Hagamos revisitas', 'followingUp'],
		['Following Up', 'followingUp'],
		['Return Visit', 'followingUp'],
		['Haga discípulos', 'makingDisciples'],
		['Hagamos discípulos', 'makingDisciples'],
		['Making Disciples', 'makingDisciples'],
		['Make Disciples', 'makingDisciples'],
		['Explique sus creencias', 'explainingYourBeliefs'],
		['Expliquemos nuestras creencias', 'explainingYourBeliefs'],
		['Explaining Your Beliefs', 'explainingYourBeliefs'],
		['Explain Your Beliefs', 'explainingYourBeliefs'],
		['Talk', 'talk'],
		['Discurso', 'talk'],
		['What Would You Say?', 'whatWouldYouSay'],
	] as const)('detects the known assignment type for "%s"', async (headline, type) => {
		const content =
			type === 'whatWouldYouSay'
				? `${timeBox(3, 'Discuss the question.')}<ul>${question('What would you say?')}</ul>`
				: timeBox(3, 'Contenido de la asignación.');
		const result = await extractFieldMinistryV2({
			html: page([{ headline, content }]),
		});

		expect(result[0].type).toBe(type);
	});

	it.each([
		[
			'assignment text',
			'Empiece conversaciones',
			timeBox(3, 'Use este recurso: <a href="https://example.com/resource">recurso externo</a>.'),
		],
		[
			'question text',
			'What Would You Say?',
			`${timeBox(6, 'Analysis with the audience.')}<ul>${question('What resource would you show? <a href="https://example.com/tract">sample resource</a>')}</ul>`,
		],
	] as const)('rejects non-WOL external links in %s with assignment context', async (_, headline, content) => {
		await expect(
			extractFieldMinistryV2({
				html: page([{ headline, content }]),
			}),
		).rejects.toThrow(
			`Field ministry section 4 headline "${headline}": Unsupported non-WOL link destination "https://example.com/`,
		);
	});

	it.each(['¿Qué diría?', '¿Qué dirías?'])(
		'extracts a prompted discussion without an image: %s',
		async (headline) => {
			const result = await extractFieldMinistryV2({
				html: page([
					{
						headline,
						content: `${timeBox(6, 'Análisis con el auditorio. Luego pregunte:')}<ul>${question('¿Qué le diría?')}</ul>`,
					},
				]),
			});

			expect(result[0]).toMatchObject({ type: 'whatWouldYouSay' });
			expect(result[0].content.map((item) => item.kind)).toEqual(['text', 'questionList']);
			expect(result[0].content[1]).toEqual({
				kind: 'questionList',
				payload: {
					questions: [
						{
							text: '¿Qué le diría?',
							textWithCitations: '¿Qué le diría?',
							citations: [],
						},
					],
				},
			});
		},
	);

	it('preserves text, illustration, and questions in DOM order', async () => {
		const result = await extractFieldMinistryV2({
			html: page([
				{
					headline: '¿Qué diría?',
					content: `${timeBox(5, 'Mencione la imagen y luego pregunte:')}<div id="f2"><figure><img src="/image.jpg" alt="Persona en una puerta."></figure></div><div><ul>${question('¿Qué pregunta podría hacer?')}${question('¿Qué texto mostraría?')}</ul></div>`,
				},
			]),
		});

		expect(result[0].content.map((item) => item.kind)).toEqual(['text', 'illustration', 'questionList']);
		expect(result[0].content[1]).toMatchObject({
			kind: 'illustration',
			payload: { src: 'https://wol.jw.org/image.jpg', alt: 'Persona en una puerta.' },
		});
	});

	it('extracts three question fields from one discussion list', async () => {
		const result = await extractFieldMinistryV2({
			html: page([
				{
					headline: '¿Qué dirías?',
					content: `${timeBox(6, 'Análisis con el auditorio.')}<ul>${question('Pregunta uno')}${question('Pregunta dos')}${question('Pregunta tres')}</ul>`,
				},
			]),
		});

		const questionList = result[0].content.find((item) => item.kind === 'questionList');
		expect(questionList).toMatchObject({
			kind: 'questionList',
			payload: {
				questions: [{ text: 'Pregunta uno' }, { text: 'Pregunta dos' }, { text: 'Pregunta tres' }],
			},
		});
	});

	it('extracts citations from a question paragraph', async () => {
		const result = await extractFieldMinistryV2({
			html: page([
				{
					headline: 'What Would You Say?',
					content: `${timeBox(6, 'Analysis with the audience.')}<ul>${question('Which scripture would you show? <a href="/en/wol/pc/r1/lp-e/ref">John 3:16</a>')}</ul>`,
				},
			]),
		});

		expect(result[0].content).toContainEqual({
			kind: 'questionList',
			payload: {
				questions: [
					{
						text: 'Which scripture would you show? John 3:16',
						textWithCitations: 'Which scripture would you show? [[cite:1]]',
						citations: [
							expect.objectContaining({
								id: 1,
								marker: '[[cite:1]]',
								mnemonic: 'John 3:16',
								contents: 'Parsed:John 3:16',
							}),
						],
					},
				],
			},
		});
	});

	it('throws with section and headline context for an unsupported assignment type', async () => {
		await expect(
			extractFieldMinistryV2({
				html: page([{ headline: 'Reparta invitaciones', content: timeBox(3, 'Contenido.') }]),
			}),
		).rejects.toThrow(
			'Field ministry section 4 headline "Reparta invitaciones": Unsupported field ministry assignment type',
		);
	});

	it.each(['<video src="/meeting.mp4"></video>', '<table><tr><td>Contenido.</td></tr></table>'])(
		'rejects unsupported structured content instead of dropping it: %s',
		async (unsupportedContent) => {
			await expect(
				extractFieldMinistryV2({
					html: page([
						{
							headline: 'Empiece conversaciones',
							content: `${timeBox(3, 'Contenido.')}${unsupportedContent}`,
						},
					]),
				}),
			).rejects.toThrow('Unsupported <');
		},
	);

	it('throws with section and headline context for malformed question content', async () => {
		const malformedQuestion = '<ul><li><p>¿Qué diría?</p><span>Unexpected content</span></li></ul>';
		await expect(
			extractFieldMinistryV2({
				html: page([
					{
						headline: '¿Qué diría?',
						content: `${timeBox(6, 'Análisis con el auditorio.')}${malformedQuestion}`,
					},
				]),
			}),
		).rejects.toThrow(
			'Field ministry section 4 headline "¿Qué diría?": Expected each question list item to contain one paragraph and no unsupported siblings',
		);
	});
});

describe('extractFieldMinistry', () => {
	it('preserves the v1 student assignment shape', async () => {
		const result = await extractFieldMinistry({
			html: page([
				{
					headline: 'Empiece conversaciones',
					content: timeBox(
						3,
						'Presente una idea bíblica (<a href="/es/wol/pc/r4/lp-s/lesson">Lección 5</a>).',
					),
				},
			]),
		});

		expect(result[0]).toMatchObject({
			sectionNumber: 4,
			timeBox: 3,
			isStudentTask: true,
			headline: 'Empiece conversaciones',
			contents: 'Presente una idea bíblica',
			studyPoint: {
				mnemonic: 'Lección 5',
				contents: 'Parsed:Lección 5',
			},
		});
	});
});
