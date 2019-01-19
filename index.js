const fs = require('fs');
const { Client, Message, Collection } = require('discord.js');

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

	// Intentionally avoid MessageCollector's so not to cause confusion to the developer if a possible EventEmitter memory leak occurs.
	async prompt(msg, options = {}) {
		defaults(options, {
			filter: () => true,
			correct: () => {},
			cancellable: true,
			autoRespond: true,
			invisible: false,
			time: 180000,
			messages: 1,
			attempts: 10
		});

		if (msg)
			await this.message.channel.send(...(Array.isArray(msg) ? msg : [msg]));

		return new handler.Promise((resolve, reject) => {
			handler.prompts.set(this.message.author.id, new handler.Prompt(this.message.author, this.message.channel,
				options, resolve, reject));
		});
	}
}

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

handler.Promise = Promise;
handler.Call = Call;
handler.Prompt = Prompt;
handler.prompts = new Collection();

module.exports = handler;
