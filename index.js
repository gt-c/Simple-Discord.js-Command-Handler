const fs = require('fs');
const Discord = require('discord.js');
const { Client, Message, Collection } = Discord;

/**
 * @typedef {object} Command
 * @property {string} id
 * @property {function(call: Call): void} exec
 * @property {string[]} aliases
 * @property {'dm'|'guild'|'any'} channels
 * @property {?string} category
 */

function defaults(obj, objDef) {
	for (let [name, prop] of Object.entries(objDef))
		if (!(name in obj))
			obj[name] = prop;

	return obj;
}

function getObjVal(obj, str) {
	str = str.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');

	let arr = str.split('.');

	for (let prop of arr) {
		if (prop in obj)
			obj = obj[prop];
		else
			return;
	}

	return obj;
}

function defObj(obj, str, val) {
	str = str.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');

	let arr = str.split('.');

	for (let prop of arr)
		if (prop in obj && typeof obj[prop] === 'object')
			obj = obj[prop];

	obj[arr[arr.length - 1]] = val(obj[arr[arr.length - 1]]);

	return obj[arr[arr.length - 1]];
}

function load(commands, path, customProps, category, editCategory) {
	for (let file of fs.readdirSync(path)) {
		try {
			let command = require(path + '/' + file);

			let id = defObj(command, customProps.id, (id) => id || undefined);
			let exec = defObj(command, customProps.exec, (exec) => exec || undefined);

			if (typeof id !== 'string' ||
				typeof exec !== 'function')
				throw new TypeError('Either command.' + customProps.id + ' or command.' + customProps.exec + ' are not their proper values.');

			if (category && !command.category)
				command.category = editCategory(category);

			defObj(command, customProps.aliases,
				(aliases) => Array.isArray(aliases) ?
					aliases.filter((alias) => typeof alias === 'string').map((alias) => alias.toLowerCase()) :
					[]);
			defObj(command, customProps.channels,
				(channels) => ['any', 'dm', 'guild'].includes(channels) ? channels : 'any');

			commands.set(id.toLowerCase(), command);
		} catch (err) {
			if (!err.message.startsWith('Cannot find module'))
				console.warn(file + ' command failed to load.\n', err.stack);
		}
	}
}

function escapeRegExpChars(text) {
	return text.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

/**
 * @typedef {object} PromptOptions
 * Note: Setting the `time` option to `Infinity` is strongly disadvised, as it can cause confusion for the user, and may also cause the promise to
 * never be garbage collected if the prompt is never fulfilled.
 * @property {number} time The amount of milliseconds to wait before ending the prompt from time. Set this to `0` or `Infinity` for no time limit.
 * @property {?boolean} cancellable Whether or not the user should be able to reply with cancel to cancel the ongoing prompt.
 * @property {function(message: Discord.Message, prompt: Prompt): boolean} filter Called with the message and `Prompt` instance to determine whether a
 * message should be deleted or not. Should not include filtering the user (done internally).
 * @property {function(message: Discord.Message, prompt: Prompt): void} correct Called with the message and `Prompt` instance that should handle when
 * a message does not pass the filter.
 * @property {number} messages The amount of messages to accept before resolving the promise.
 * @property {number} attempts The amount of times the user is able to fail the filter before having the prompt cancelled. You can set this to `0` or
 * `Infinity` for infinite attempts permitted.
 * @property {?boolean} autoRespond Whether or not the bot should automatically respond when the prompt is cancelled/out of time with
 * `Cancelled prompt.`, or when the max attempts are exceeded, `Too many attempts..` If disabled, you should probably handle this on the promise's
 * rejection.
 * @property {?boolean} invisible Whether or not the prompt is permitted to coexist with another prompt in the same channel.
 */

/**
 * An instance of this is created whenever `Call#prompt` is called successfully and then added to `handler#prompts` and removed once the prompt is
 * finished. All parameters translate directly into properties.
 * @property {Discord.User} user The user the prompt is based around.
 * @property {Discord.TextChannel} channel The channel the prompt is in.
 * @property {PromptOptions} options The options of the prompt.
 * @property {function(value: Discord.Collection|Discord.Message): any} resolve The function to resolve the promise.
 * @property {function(err: Error): any} reject The function to reject the promise.
 * @property {boolean} ended Whether or not the prompt has been ended.
 * @property {number} attempts The amount of attempts the user has made to complete the prompt.
 * @property {Discord.Collection} values The `Message` objects collected by the prompt.
 */
class Prompt {
	constructor(user, channel, options, resolve, reject) {
		this.user = user;
		this.channel = channel;
		this.options = options;
		this.resolve = resolve;
		this.reject = reject;

		this.ended = false;
		this.attempts = 0;
		this.values = new Collection();

		if (options.time > 0 && options.time < Infinity)
			this.user.client.setTimeout(this.end.bind(this, 'time'), options.time);
	}

	/**
	 * Adds a message object to the values if it passes the filter provided, otherwise calling the correct function provided.
	 * @param {Discord.Message} message
	 * @returns {any}
	 */
	addInput(message) {
		if (this.ended)
			return;

		this.attempts++;

		// If cancelled.
		if (this.options.cancellable && message.content.toLowerCase() === 'cancel')
			return this.end('cancelled');

		// Add value to result.
		if (this.options.filter(message, this))
			this.values.set(message.id, message);
		// Corrects user on invalid input.
		else
			this.options.correct(message, this);

		// Resolve if messages required obtained.
		if (this.values.size >= this.options.messages)
			return this.end('success');

		// Attempts surpassed.
		if (this.options.attempts > 0 && this.attempts >= this.options.attempts)
			return this.end('attempts');
	}

	/**
	 * Ends the prompt for whatever reason, rejecting the promise if an unsuccessful completion.
	 * @param {'time'|'cancelled'|'attempts'|'success'} reason
	 * @returns {any}
	 */
	end(reason) {
		if (this.ended)
			return;

		this.ended = true;
		handler.prompts.delete(this.user.id);

		// If permitted to respond.
		if (this.options.autoRespond) {
			if (['time', 'cancelled'].includes(reason))
				this.channel.send('Cancelled prompt.');

			if (reason === 'attempts')
				this.channel.send('Too many attempts.');
		}

		if (reason !== 'success')
			return this.reject(new Error('Prompt ended: ' + reason));

		return this.resolve(this.values.size > 1 ? this.values : this.values.first());
	}
}

/**
 * An instance of this is supplied to a command's `exec` function when a command is called. All parameters translate directly into properties.
 * @property {Discord.Message} message The Message instance sent to trigger the command.
 * @property {Discord.Client} client The Client instance of the bot.
 * @property {Command} command The command object, e.g. `{ id: 'ping', exec: () => {} }`.
 * @property {Discord.Collection} commands All the command objects mapped by the command id's.
 * @property {string[]} args The arguments supplied to the message, e.g '!ban @gt_c for bullying me' would make this array
 * `['@gt_c', 'for', 'bullying', 'me']`.
 * @property {string} prefixUsed The prefix used to call the command. Possibly your client's mention if that is how the user triggered the command.
 * @property {string} aliasUsed The alias (or command id) used in calling the command, e.g. '!ping' would make this property 'ping'.
 * @property {string} cut The content of the message, excluding the prefix and alias used.
 */
class Call {
	constructor(message, command, commands, cut, args, prefixUsed, aliasUsed) {
		this.message = message;
		this.client = message.client;
		this.command = command;
		this.commands = commands;
		this.args = args;
		this.prefixUsed = prefixUsed;
		this.aliasUsed = aliasUsed;
		this.cut = cut;
	}

	/**
	 * Intentionally avoid `MessageCollector`'s so not to cause confusion to the developer if a possible `EventEmitter` memory leak occurs.
	 * Note: To force cancel a prompt, do `handler.prompts.get('1234567890').end('cancelled')` where the parameter is the prompted user's id.
	 * @param {?Discord.StringResolvable} msg The arguments you would supply to a `TextChannel#send` function. Can be an array of arguments or a
	 * single argument.
	 * @param {PromptOptions} options Options to customize the prompt with.
	 * @returns {Promise<Discord.Message|Discord.Collection<Discord.Snowflake, Discord.Message>>} A collection of messages recieved by the user that
	 * passed all requirements.
	 */
	async prompt(msg, options = {}) {
		defaults(options, handler.promptOptionsDefaults);

		let oldFilter = options.filter;

		if (oldFilter instanceof RegExp)
			options.filter = (m) => oldFilter.test(m.content);
		else if (Array.isArray(oldFilter))
			options.filter = (m) => oldFilter.includes(m.content.toLowerCase());
		else
			options.filter = () => !!oldFilter;

		if (msg)
			await (options.channel || this.message.channel).send(...(Array.isArray(msg) ? msg : [msg]));

		return new handler.Promise((resolve, reject) => {
			handler.prompts.set(this.message.author.id, new handler.Prompt(this.message.author, options.channel || this.message.channel,
				options, resolve, reject));
		});
	}
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
		clientOptions
	} = {}) {

	defaults(customProps, {
		id: 'id',
		exec: 'exec',
		aliases: 'aliases',
		channels: 'channels'
	});

	let determinePrefix = typeof customPrefix === 'function' ? customPrefix : () => customPrefix;
	let client = token instanceof Client ? token : new Client(clientOptions);
	let commands = new Collection();

	load(commands, location, customProps, setCategoryProperty ? defaultCategory : false, editCategory);

	if (loadCategories === true)
		for (let folder of fs.readdirSync(location))
			if (fs.statSync(location + '/' + folder).isDirectory())
				load(commands, location + '/' + folder, customProps, setCategoryProperty ? folder : false);

	client.on('message', async (message) => {
		if (!(message instanceof Message) || (message.author.bot && !allowBots))
			return;

		let prompt = handler.prompts.get(message.author.id);

		if (prompt && !prompt.invisible && prompt.channel.id === message.channel.id)
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

		let channels = getObjVal(command, customProps.channels);

		if ((message.guild && restrictedGuilds.length > 0 && !restrictedGuilds.includes(message.guild.id)) ||
			(channels === 'dm' && message.channel.type !== 'dm') ||
			(channels === 'guild' && message.channel.type !== 'text'))
			return;

		cut = cut.substring(aliasUsed.length).trim();
		args.shift();

		try {
			getObjVal(command, customProps.exec)(new handler.Call(message, command, commands, cut, args, prefixUsed, aliasUsed));
		} catch (exc) {
			onError(message, command, exc);
		}
	});

	if (!(token instanceof Client))
		client.login(token);

	return client;
}

/** The Promise class (purely for redefining and using a promise library different than the native js one, such as bluebird). */
handler.Promise = Promise;
handler.Call = Call;
handler.Prompt = Prompt;
/**
 * All current `Prompt` instances mapped by the user id.
 * @type {Discord.Collection}
 */
handler.prompts = new Collection();

/**
 * The default prompt options. Adjusted purely for code convenience
 * @type {PromptOptions}
 */
handler.promptOptionsDefaults = {
	filter: () => true,
	correct: () => {},
	cancellable: true,
	autoRespond: true,
	invisible: false,
	time: 180000,
	messages: 1,
	attempts: 10
};

module.exports = handler;
