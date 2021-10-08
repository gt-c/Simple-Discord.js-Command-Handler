const fs = require('fs');
const Discord = require('discord.js');
const { Client, Collection } = Discord;
const { defaults, defObjVal, getObjVal, escapeRegExpChars } = require('./utils.js');

const Arguments = require('./structures/Arguments.js');
const Call = require('./structures/Call.js');
const Cooldown = require('./structures/Cooldown.js');
const Prompt = require('./structures/Prompt.js');

/**
 * @typedef {object} Command
 * @property {string} id
 * @property {function(call: Call): void} exec
 * @property {string[]} aliases
 * @property {'DM'|'GUILD_TEXT'|'ANY'} channels
 * @property {?string} category
 */

function load(commands, path, customProps, category, editCategory) {
	for (let file of fs.readdirSync(path)) {
		try {
			if (!file.endsWith('.js'))
				continue;

			let command = require(path + '/' + file);

			let id = defObjVal(command, customProps.id, (id) => id || undefined);
			let exec = defObjVal(command, customProps.exec, (exec) => exec || undefined);

			if (typeof id !== 'string' ||
				typeof exec !== 'function')
				throw new TypeError('Either command.' + customProps.id + ' or command.' + customProps.exec + ' are not their proper values.');

			if (category && !command.category)
				command.category = editCategory(category);

			defObjVal(command, customProps.aliases,
				(aliases) => Array.isArray(aliases) ?
					aliases.filter((alias) => typeof alias === 'string').map((alias) => alias.toLowerCase()) :
					[]);
			defObjVal(command, customProps.channels,
				(channels) => ['ANY', 'DM', 'GUILD_TEXT'].includes(channels) ? channels : 'ANY');
			defObjVal(command, customProps.canUse,
				(obj) => typeof obj === 'object' && obj !== null ? obj : {});
			defObjVal(command, customProps.cooldown,
				(cooldown) => cooldown instanceof Cooldown);

			commands.set(id.toLowerCase(), command);
		} catch (err) {
			console.warn(file + ' command failed to load.\n', err.stack);
		}
	}
}

function canUse(rules, message) {
	return (!rules.users && !rules.roles) ||
		(!!rules.users && rules.users.includes(message.author.id)) ||
		(!!rules.roles && !!message.member && message.member.roles.cache.some((r) => rules.roles.includes(r.id)));
}

/**
 * @typedef {object} HandleOptions
 * @property {?string|string[]|function(message: Discord.Message): Promise<string|string[]>} customPrefix The prefix(es) of the bot. A function should
 * return a string or array of strings. If a database call or some other asynchronous action is required, the function should return a Promise.
 * @property {?function(message: Discord.Message, cmd: Command, err: any): void} onError A function called with the message, the command and the error
 * when a command encounters an error upon being run.
 * @property {?function(category: string|boolean): string} editCategory Used to edit the string passed into the category property of the command.
 * Requires `setCategoryProperty` to be true.
 * @property {?string} defaultCategory The default category that is set on a command if it has no category folder.
 * @property {?boolean} loadCategories A boolean option to load the folders inside the commands folder as well.
 * @property {?boolean} setCategoryProperty A boolean option representing whether or not to set the category property of a command based off of it's
 * parent folder.
 * @property {?boolean} defaultPrefix A boolean option determining if the default mention prefix is used, e.g `@bot ping`.
 * @property {?boolean} allowBots A boolean option on whether or not to allow commands to be triggered by bots.
 * @property {?Discord.Snowflake[]} restrictedGuilds Restricts commands to certain guilds.
 * @property {?object} customProps Redefines the property locations of a command, e.g. `{ id: 'name', exec: 'run' }` changes the location of the
 * command id to `command.name` and the command execution to `command.run`. You can also use deep properties such as `{ id: 'info.name' }`.
 * @property {?Discord.ClientOptions} clientOptions Options to supply directly to the `Client` instance being created. Is not used if the `token`
 * parameter is supplied.
 */

/**
 * @param {string} location The path to the commands folder.
 * @param {Discord.Client|string} token A token to create a `Client` instance and login with, or a pre-existing `Client` instance to use.
 * @param {HandleOptions} options Options to use with the handle function.
 * @returns {Discord.Client}
 */
function handler(location, token,
	{
		customPrefix = '!',
		onError = (_, command, exc) => console.warn('The ' + command.id + ' command encountered an error:\n' + exc.stack),
		editCategory = (category) => category.replace(/^./, (m) => m.toUpperCase()),

		defaultCategory = 'Other',
		loadCategories = true,
		setCategoryProperty = true,
		defaultPrefix = true,
		allowBots = false,
		restrictedGuilds = [],
		customProps = {},
		clientOptions,
		commandEmitter
	} = {}) {

	defaults(customProps, {
		id: 'id',
		exec: 'exec',
		aliases: 'aliases',
		channels: 'channels',
		canUse: 'canUse',
		cooldown: 'cooldown'
	});

	let determinePrefix = typeof customPrefix === 'function' ? customPrefix : () => customPrefix;
	let client = typeof token === 'string' ? new Client(clientOptions) : token;
	let commands = new Collection();

	commandEmitter = commandEmitter || client;
	handler.commands = commands;

	load(commands, location, customProps, setCategoryProperty ? defaultCategory : false, editCategory);

	if (loadCategories === true)
		for (let folder of fs.readdirSync(location))
			if (fs.statSync(location + '/' + folder).isDirectory())
				load(commands, location + '/' + folder, customProps, setCategoryProperty ? folder : false, editCategory);

	client.on('messageCreate', async (message) => {
		if (message.channel.partial)
			await message.channel.fetch();

		if (message.author.bot && !allowBots)
			return;

		let prompt = handler.prompts.find((p) => p.user.id === message.author.id && p.channel.id === message.channel.id);

		if (prompt)
			return prompt.addInput(message);

		let prefixes = await determinePrefix(message);
		prefixes = (Array.isArray(prefixes) ? prefixes : [prefixes]).filter((p) => typeof p === 'string').map(escapeRegExpChars);

		if (prefixes.length === 0)
			return;

		if (defaultPrefix)
			prefixes.push('<@' + client.user.id + '>', '<@!' + client.user.id + '>');

		let prefixUsed = message.content.match(new RegExp('^' + prefixes.join('|')));

		if (prefixUsed == null)
			return;

		prefixUsed = prefixUsed[0];
		let cut = message.content.substring(prefixUsed.length).trim();
		let args = cut.split(/\s+/g);

		if (!args[0])
			return;

		let aliasUsed = args[0].toLowerCase();
		let command = commands.find((cmd) => aliasUsed.toLowerCase() === getObjVal(cmd, customProps.id) ||
			getObjVal(cmd, customProps.aliases).includes(aliasUsed));

		if (command == null)
			return;

		let rules = getObjVal(command, customProps.canUse);

		if (!canUse(rules, message))
			return typeof rules.cant === 'function' ? rules.cant(message) : message.channel.send(rules.cant);

		let channels = getObjVal(command, customProps.channels);

		if (
			(message.guild && restrictedGuilds.length > 0 && !restrictedGuilds.includes(message.guild.id)) ||
			(channels === 'TEXT' ? !message.channel.isText() : message.channel.type !== channels)
		)
			return;

		if (command.cooldown && command.cooldown.onCooldown(message.author.id))
			return command.cooldown.handle(message);

		cut = cut.substring(aliasUsed.length).trim();
		args.shift();

		try {
			let call = new handler.Call(message, command, commands, cut, null, prefixUsed, aliasUsed, handler);

			call.args = command.arguments ? await command.arguments.getAll(call) : args;

			let result = await getObjVal(command, customProps.exec)(call);

			commandEmitter.emit('commandUsed', call, result);
		} catch (exc) {
			onError(message, command, exc);
		}
	});

	if (typeof token === 'string')
		client.login(token);

	return client;
}

/** The Promise class (purely for redefining and using a promise library different than the native js one, such as bluebird). */
handler.Promise = Promise;
handler.Arguments = Arguments;
handler.Call = Call;
handler.Cooldown = Cooldown;
handler.Prompt = Prompt;

Call.handler = handler;

/**
 * All current `Prompt` instances.
 * @type {Array<Prompt>}
 */
handler.prompts = [];

/**
 * The default prompt options. Adjusted purely for code convenience
 * @type {PromptOptions}
 */
handler.promptOptionsDefaults = {
	filter: () => true,
	correct: () => {},
	formatCorrect: (_, arg) => arg,
	formatTrigger: (_, arg) => arg,
	cancellable: true,
	autoRespond: true,
	addLastMatch: false,
	time: 180000,
	messages: 1,
	attempts: 10
};


module.exports = handler;