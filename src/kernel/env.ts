interface Env {
	NODE_ENV: 'development' | 'production' | 'test';
	PORT: number;
	LOG_LEVEL: string;
	CSS_SELECTOR_FOR_LINK_TO_LANG: string;
	IS_DEV_ENV: boolean;
	IS_PROD_ENV: boolean;
	IS_TEST_ENV: boolean;
	// Add other environment variables as they are identified
}

const determinedNodeEnv = (process.env.NODE_ENV as Env['NODE_ENV']) || 'development';

const env: Env = {
	NODE_ENV: determinedNodeEnv,
	PORT: parseInt(process.env.PORT || '5000', 10),
	LOG_LEVEL: process.env.WS_LOG_LEVEL || 'info',
	CSS_SELECTOR_FOR_LINK_TO_LANG: process.env.WS_CSS_SELECTOR_FOR_LINK_TO_LANG || 'link[hreflang="es"]',
	IS_DEV_ENV: determinedNodeEnv === 'development',
	IS_PROD_ENV: determinedNodeEnv === 'production',
	IS_TEST_ENV: determinedNodeEnv === 'test',
};

// Basic validation (can be expanded)
if (!['development', 'production', 'test'].includes(env.NODE_ENV)) {
	throw new Error(`Invalid NODE_ENV: ${env.NODE_ENV}`);
}

export default env;
