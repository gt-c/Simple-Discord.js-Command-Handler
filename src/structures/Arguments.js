const { defaults, parseTime } = require('../utils.js');

/**
 * @typedef {object} definition
 * @property {string} key The name of the argument
 * @property {string|any[]} prompt The prompt to query if the arg is not specified in the main message.
 * @property {?('string'|'number'|'time'|string[])} type The type of the argument. If an array, the argument
 * will resolve to the first type that returns a non null value, in left to right order.
 * @property {?boolean} infinite Whether or not the argument takes up the rest of the string. Defaults to false.
 * @property {?any} default The default value of the argument if not provided (makes the argument optional).
 * @property {?object} range The range of the variable. Should contain a `min` property and/or a `max` property.
 * If the type is 'string', this defines the range of the length of the string.
 * If 'number', the range of the number.
 * If 'time', the range of the time (in milliseconds).
 */

let rangeDefault = {
	min: -Infinity,
	max: Infinity,
};

let defDefault = {
	type: 'string',
	infinite: false,
	range: rangeDefault
};

let types = {
	string: {
		parse: (c) => c,
		filter: (c, range) => c && c.length <= range.min && c.length >= range.max
	},
	number: {
		parse: (c) => parseInt(c),
		filter: (c, range) => c && c >= range.min && c <= range.max
	},
	time: {
		parse: (c) => parseTime(c),
		filter: (c, range) => c && c >= range.min && c <= range.max
	},
	member: {
		parse: (c, call) => {
			c = c.toLowerCase();

			return call.message.guild &&
				call.message.guild.member(c.replace(/\D+/g, '')) ||
				call.message.guild.members.find((m) => m.user.tag.toLowerCase() === c) ||
				call.message.guild.members.find((m) => m.user.displayName === c);
		},
		filter: (c, range) => {
			return (!Array.isArray(range.ids) && !Array.isArray(range.roles)) ||
				(Array.isArray(range.ids) && range.ids.includes(c.id)) ||
				(Array.isArray(range.roles) && c.roles.some((r) => range.roles.includes(r.id) || range.roles.includes(r.name.toLowerCase())));
		}
	},
	user: {
		parse: async (c, call) => {
			c = c.toLowerCase();

			let fetched = await call.client.fetchUser(c.replace(/\D+/g, '')).catch(() => null);

			return fetched || call.client.users.find((u) => u.tag.toLowerCase() === c);
		},
		filter: (c, range) => !Array.isArray(range.ids) || range.ids.includes(c.id)
	}
};

class Arguments {
	constructor(definitions, splitter) {
		this.splitter = splitter || /[^\s"']+|"([^"]*)"|'([^']*)'/g;
		this.definitions = definitions.map((def) => {
			defaults(def, defDefault);
			defaults(def.range, rangeDefault);

			return def;
		});

		this.handler = require('../index.js');
	}

	validType(defType) {
		return defType in types || (Array.isArray(defType) && defType.every((type) => typeof type === 'string' || Array.isArray(type)));
	}

	async firstType(call, def, arg) {
		for (let type of Array.isArray(def.type) ? def.type.map((type) => types[type] || type) : [types[def.type] || type]) {
			let oldType = type;

			// Custom type where an argument matching the content in an array is valid.
			if (Array.isArray(type))
				type = { parse: (c) => c, filter: (c) => oldType.includes(c.toLowerCase()) };
			else if (type.parse || type.filter)
				type = { parse: type.parse || ((c) => c), filter: type.filter || (() => true) };

			let parsed = await type.parse(arg, call);

			if (parsed && type.filter(parsed, def.range))
				return type;
		}
	}

	async getAll(call) {
		let split = this.splitter instanceof RegExp ? call.cut.match(this.splitter) || [] : this.splitter(call.cut) || [];
		let args = {};
		let pos = 0;

		for (let def of this.definitions) {
			if (!this.validType(def.type))
				throw new TypeError(`Invalid type(s) provided for argument ${pos + 1} of ${call.command.id}.`);

			let argValue = def.infinite ? split[pos] : split.slice(pos).join(' ');
			let arg;

			if (argValue) {
				let type = await this.firstType(call, def, argValue);

				if (type)
					arg = type.parse(argValue, call);
			}

			if (!arg) {
				if ('default' in def) {
					arg = def.default;
				} else {
					if (typeof def.prompt !== 'string')
						throw new TypeError(`Invalid prompt property for argument ${pos} of ${call.command.id}.`);

					let type;

					arg = await call.prompt(def.prompt, { filter: async (m) => type = await this.firstType(call, def, m.content) })
						.then((m) => type.parse(m.content, call));
				}

				// Do not count this as an argument as to not offset other arguments.
				pos--;
			}

			pos++;
			args[def.key] = arg;

			if (def.infinite)
				break;
		}

		return args;
	}
}

Arguments.types = types;

module.exports = Arguments;