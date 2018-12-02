const fs = require('fs');
const { Client, Message, Collection } = require('discord.js');

function load(commands, path) {
	for (let file of fs.readdirSync(path)) {
		try {
			let command = require(path + '/' + file);

			if (typeof command.id !== 'string' || typeof command.exec !== 'function')
				throw new TypeError('Either command.id or command.exec are not their proper values.');

			command.aliases = Array.isArray(command.aliases) ?
				command.aliases.filter((alias) => typeof alias === 'string').map((alias) => alias.toLowerCase()) :
				[];
			command.channels = ['any', 'dm', 'guild'].includes(command.channels) ? command.channels : 'any';

			commands.set(command.id.toLowerCase(), command);
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

		this.user.client.setTimeout(this.endPrompt.bind(this, 'time'), options.time <= 0 ? Infinity : options.time);
	}

	addInput(message) {
		if (this.ended)
			return;

		this.attempts++;

		// If cancelled.
		if (this.options.cancellable && message.content.toLowerCase() === 'cancel')
			return this.endPrompt('cancelled');

		// Add value to result.
		if (this.options.filter(message, this))
			this.values.set(message.id, message);
		// Corrects user on invalid input.
		else
			this.options.correct(message, this);

		// Resolve if messages required obtained.
		if (this.values.size >= this.options.messages)
			return this.endPrompt('success');

		// Attempts surpassed.
		if (this.options.attempts > 0 && this.attempts >= this.options.attempts)
			return this.endPrompt('attempts');
	}

	endPrompt(reason) {
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
	async prompt(msg,
		{
			filter = () => true,
			correct = () => {},
			cancellable = true,
			autoRespond = true,
			invisible = false,
			time = 180000,
			messages = 1,
			attempts = 10
		} = {}) {

		if (msg)
			await this.message.channel.send(...(Array.isArray(msg) ? msg : [msg]));

		return new Promise((resolve, reject) => {
			handler.prompts.set(this.message.author.id, new Prompt(this.message.author, this.message.channel,
				{ filter, correct, cancellable, autoRespond, invisible, time, messages, attempts }, resolve, reject));
		});
	}
}

function handler(location, token,
	{
		customPrefix = '!',
		onError = (_, command, exc) => console.warn('The ' + command.id + ' command encountered an error:\n' + exc.stack),
		loadCategories = true,
		allowBots = false,
		clientOptions
	} = {}) {

	let determinePrefix = typeof customPrefix === 'function' ? customPrefix : () => customPrefix;
	let client = token instanceof Client ? token : new Client(clientOptions);
	let commands = new Collection();

	load(commands, location);

	if (loadCategories === true)
		for (let folder of fs.readdirSync(location))
			if (fs.statSync(location + '/' + folder).isDirectory())
				load(commands, location + '/' + folder);

	client.on('message', async (message) => {
		let prompt = handler.prompts.get(message.author.id);

		if (prompt && !prompt.invisible && prompt.channel.id === message.channel.id)
			return prompt.addInput(message);

		if (!(message instanceof Message) || (message.author.bot && !allowBots))
			return;

		let prefix = await determinePrefix(message);

		if (typeof prefix !== 'string')
			return;

		let prefixUsed = message.content.match(new RegExp('^<@!?' + client.user.id + '>|' + escapeRegExpChars(prefix)));

		if (prefixUsed == null)
			return;
		else
			prefixUsed = prefixUsed[0];

		let cut = message.content.substring(prefixUsed.length).trim();
		let args = cut.split(/\s+/g);

		if (!args[0])
			return;

		let aliasUsed = args[0].toLowerCase();
		let command = commands.find((cmd) => aliasUsed.toLowerCase() === cmd.id || cmd.aliases.includes(aliasUsed));

		if (command == null ||
			(command.channels === 'dm' && message.channel.type !== 'dm') ||
			(command.channels === 'guild' && message.channel.type !== 'text'))
			return;

		args.shift();
		cut.substring(aliasUsed.length).trim();

		try {
			command.exec(new Call(message, command, commands, cut, args, prefixUsed, aliasUsed));
		} catch (exc) {
			onError(message, command, exc);
		}
	});

	if (!(token instanceof Client))
		client.login(token);

	return client;
}

handler.Call = Call;
handler.Prompt = Prompt;
handler.prompts = new Collection();

module.exports = handler;