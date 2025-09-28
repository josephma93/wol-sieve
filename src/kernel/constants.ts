import env from './env.js';

declare type PortNumber = number | string | false;

function normalizePort(val: string | number): PortNumber {
	const port = parseInt(val as string, 10);

	if (isNaN(port)) {
		// Named pipe
		return val;
	}

	if (port >= 0) {
		// Port number
		return port;
	}

	return false;
}

const GENERAL_CSS_SELECTOR_FOR_FIGURES = 'div[id^="f"]';

export const CONSTANTS = Object.freeze(
	Object.seal({
		LOG_LEVEL: env.LOG_LEVEL,
		NORMALIZED_PORT_NUMBER: normalizePort(String(env.PORT)),
		WOL_URL: 'https://wol.jw.org',
		CSS_SELECTOR_FOR_LINK_TO_LANG: env.CSS_SELECTOR_FOR_LINK_TO_LANG,
		CSS_SELECTOR_FOR_TODAYS_NAVIGATION_LINK: '#menuToday .todayNav',
		CSS_SELECTOR_FOR_WEEKLY_BOOKLET_LINK: 'a.pub-mwb.cardLine1Prominent',
		CSS_SELECTOR_FOR_WATCHTOWER_ARTICLE_LINK: 'a.pub-w.cardLine1Prominent',

		UNABLE_TO_EXTRACT_REFERENCE: 'UNEXPECTED_ERROR_UNABLE_TO_EXTRACT_REFERENCE',
		PUB_CODE_WATCHTOWER: 'pub-w',
		PUB_CODE_BIBLE: 'pub-nwtsty',
		PUB_CODE_AWAKE: 'pub-g',

		PUB_MWB_CSS_SELECTOR_ARTICLE: '#article',
		PUB_MWB_CSS_SELECTOR_INTRODUCTION: '#p3',
		PUB_MWB_CSS_SELECTOR_TREASURES_TALK: '#tt9',
		PUB_MWB_CSS_SELECTOR_LINE_WITH_TIME_BOX: '.du-color--textSubdued',
		PUB_MWB_CSS_SELECTOR_LINE_WITH_SECTION_NUMBER: '> h3',
		PUB_MWB_CSS_SELECTOR_STARTING_SONG: '.bodyTxt > #p3',
		PUB_MWB_CSS_SELECTOR_MIDDLE_SONG: '.bodyTxt > .dc-icon--music:not(:first-child)',
		PUB_MWB_CSS_SELECTOR_FINAL_SONG: '.bodyTxt > h3:last-child',
		PUB_MWB_CSS_SELECTOR_FIELD_MINISTRY_HEADLINE: '.dc-icon--wheat',
		PUB_MWB_CSS_SELECTOR_MIDWAY_SONG_HEADLINE: '.dc-icon--music',
		PUB_MWB_CSS_SELECTOR_CHRISTIAN_LIVING_HEADLINE: '.dc-icon--sheep',
		PUB_MWB_CSS_SELECTOR_BLEED_EDGE_GROUPS: '.dc-bleedToArticleEdge',

		PUB_W_CSS_SELECTOR_ARTICLE_NUMBER: 'p.contextTtl strong',
		PUB_W_CSS_SELECTOR_ARTICLE_TITLE: 'h1 strong:first-child',
		PUB_W_CSS_SELECTOR_ARTICLE_THEME_SCRIP: 'p.themeScrp',
		PUB_W_CSS_SELECTOR_ARTICLE_TOPIC: '#tt9 p:nth-of-type(2)',
		PUB_W_CSS_SELECTOR_TEACH_BLOCK: '.dc-ttClassStyle--unset',
		PUB_W_CSS_SELECTOR_QUESTION: 'p.qu',
		PUB_W_CSS_SELECTOR_RELATED_PARAGRAPH: (dataPid: string) => `p[data-rel-pid="[${dataPid}]"]`,
		PUB_W_CSS_SELECTOR_RELATED_PARAGRAPH_LINK: 'p[data-rel-pid] a:not([data-video])',
		PUB_W_CSS_SELECTOR_TEACH_BLOCK_HEADLINE: '.dc-ttClassStyle--unset h2',
		PUB_W_CSS_SELECTOR_TEACH_BLOCK_POINTS: '.dc-ttClassStyle--unset ul li p',

		PUB_LFB_CSS_SELECTOR_HEADLINE_FIGURE: '#f1 img',
		PUB_LFB_CSS_SELECTOR_BODY_SELECTOR: '.bodyTxt',
		PUB_LFB_CSS_SELECTOR_SECTION_INTRO_HEADLINE: '#p1',
		PUB_LFB_CSS_SELECTOR_SECTION_INTRO_LESSONS_SELECTOR: '.boxSupplement ul li',
		PUB_LFB_CSS_SELECTOR_LESSON_NUMBER_SELECTOR: '#p1',
		PUB_LFB_CSS_SELECTOR_LESSON_TITLE_SELECTOR: '#p2',
		PUB_LFB_CSS_SELECTOR_LESSON_HIGHLIGHT_QUOTE_SELECTOR: '.blockTxt.rule',
		PUB_LFB_CSS_SELECTOR_LESSON_FIGURE_SELECTOR: GENERAL_CSS_SELECTOR_FOR_FIGURES + ' img',
		PUB_LFB_MARKIFY_CSS_SELECTORS_TO_IGNORE: [GENERAL_CSS_SELECTOR_FOR_FIGURES],
		PUB_LFB_CSS_SELECTOR_LESSON_QUESTIONS_SELECTOR: '.boxSupplement .boxContent p:first-child',
		PUB_LFB_CSS_SELECTOR_LESSON_CITATIONS_SELECTOR: '.boxSupplement .boxContent p:not(:first-child)',
	}),
);
