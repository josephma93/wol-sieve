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

		// Reference extraction
		PUB_CODE_WATCHTOWER: 'pub-w',
		PUB_CODE_BIBLE: 'pub-nwtsty',

		// Pub mwb
		ARTICLE_CSS_SELECTOR: '#article',
		INTRODUCTION_CSS_SELECTOR: '#p3',
		TREASURES_TALK_CSS_SELECTOR: '#tt8',
		LINE_WITH_TIME_BOX_CSS_SELECTOR: '.du-color--textSubdued',
		LINE_WITH_SECTION_NUMBER_CSS_SELECTOR: '> h3',
		STARTING_SONG_CSS_SELECTOR: '.bodyTxt > #p3',
		MIDDLE_SONG_CSS_SELECTOR: '.bodyTxt > .dc-icon--music:not(:first-child)',
		FINAL_SONG_CSS_SELECTOR: '.bodyTxt > h3:last-child',
		FIELD_MINISTRY_HEADLINE_CSS_SELECTOR: '.dc-icon--wheat',
		MIDWAY_SONG_HEADLINE_CSS_SELECTOR: '.dc-icon--music',
		CHRISTIAN_LIVING_HEADLINE_CSS_SELECTOR: '.dc-icon--sheep',
	}),
);
