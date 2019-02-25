import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import Template from '@/interfaces/Template';
import logger from './config/logger';
import defaults from 'defaults-deep';

export default class Utils {
	public static getPlatformConfig(platformId: string): any {
		try {
			let config = require(`../platforms/${platformId}/config.json`) || {};
			config = defaults(
				config,
				require(`../platforms/config.default.json`),
			);
			logger.debug('config loaded', config);
			return config;
		} catch (err) {
			logger.error(
				'config.json missing. copy config.default.json to selected platform folder and rename.',
			);
			return require(`../platforms/config.default.json`);
		}
	}

	public static loadTemplate(
		platformId: string,
		templateId: string,
		type: string,
		language?: string,
	): Template {
		let template: Template;
		let templatePath = path.join(
			__dirname,
			'..',
			'platforms',
			platformId,
			'templates',
			templateId,
			`${type}${language ? '.' + language : ''}.mustache`,
		);
		try {
			template = yaml.safeLoad(fs.readFileSync(templatePath, 'utf8'));
		} catch (err) {
			// use language independent template as default/fallback
			templatePath = path.join(
				__dirname,
				'..',
				'platforms',
				platformId,
				'templates',
				templateId,
				`${type}.mustache`,
			);
			template = yaml.safeLoad(fs.readFileSync(templatePath, 'utf8'));
		}
		template.type = type;
		if (language) {
			template.language = language;
		}
		return template;
	}

	public static mustacheFunctions(
		platformId: string,
		messageId: string,
		receiverId: string,
	): any {
		const config = Utils.getPlatformConfig(platformId);
		return {
			callbackLink() {
				const url = config.callback.url;
				return (text: any, render: any) => {
					return url
						.replace('{RECEIVER_ID}', receiverId)
						.replace('{MESSAGE_ID}', messageId)
						.replace('{REDIRECT_URL}', render(text));
				};
			},
		};
	}

	public static guid() {
		function s4() {
			return Math.floor((1 + Math.random()) * 0x10000)
				.toString(16)
				.substring(1);
		}
		return (
			s4() +
			s4() +
			'-' +
			s4() +
			'-' +
			s4() +
			'-' +
			s4() +
			'-' +
			s4() +
			s4() +
			s4()
		);
	}

	public static parametersMissing(parametersList: string[], base: any, res: any) {
		for (const parameter of parametersList) {
			if (!base.hasOwnProperty(parameter)) {
				res.status(400).send('Missing parameter: ' + parameter + '.');
				return true;
			}
		}
	}

	public static serviceEnum() {
		return ['firebase', 'safari'];
	}

}
