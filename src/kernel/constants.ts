import * as process from 'node:process';

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

export const CONSTANTS = Object.freeze(
	Object.seal({
		LOG_LEVEL: process.env.WS_LOG_LEVEL ?? 'info',
		NORMALIZED_PORT_NUMBER: normalizePort(process.env.WS_PORT ?? '-1'),
		WOL_URL: 'https://wol.jw.org',
		CSS_SELECTOR_FOR_LINK_TO_LANG: process.env.WS_CSS_SELECTOR_FOR_LINK_TO_LANG ?? 'link[hreflang="es"]',
		CSS_SELECTOR_FOR_TODAYS_NAVIGATION_LINK: '#menuToday .todayNav',
		CSS_SELECTOR_FOR_WATCHTOWER_ARTICLE_LINK: '.todayItem.pub-w:nth-child(2) .itemData a',

		// Reference extraction
		PUB_CODE_WATCHTOWER: 'pub-w',
		PUB_CODE_BIBLE: 'pub-nwtsty',

		PUB_MWB_CSS_SELECTOR_ARTICLE: '#article',
		PUB_MWB_CSS_SELECTOR_INTRODUCTION: '#p3',
		PUB_MWB_CSS_SELECTOR_TREASURES_TALK: '#tt8',
		PUB_MWB_CSS_SELECTOR_LINE_WITH_TIME_BOX: '.du-color--textSubdued',
		PUB_MWB_CSS_SELECTOR_LINE_WITH_SECTION_NUMBER: '> h3',
		PUB_MWB_CSS_SELECTOR_STARTING_SONG: '.bodyTxt > #p3',
		PUB_MWB_CSS_SELECTOR_MIDDLE_SONG: '.bodyTxt > .dc-icon--music:not(:first-child)',
		PUB_MWB_CSS_SELECTOR_FINAL_SONG: '.bodyTxt > h3:last-child',
		PUB_MWB_CSS_SELECTOR_FIELD_MINISTRY_HEADLINE: '.dc-icon--wheat',
		PUB_MWB_CSS_SELECTOR_MIDWAY_SONG_HEADLINE: '.dc-icon--music',
		PUB_MWB_CSS_SELECTOR_CHRISTIAN_LIVING_HEADLINE: '.dc-icon--sheep',

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
	}),
);
