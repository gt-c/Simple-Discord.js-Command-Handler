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
			console.warn(file + ' command failed to load.\n', err.stack);
		}
	}
}

function escapeRegExpChars(text) {
	return text.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
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
}

function handler(location, token, { customPrefix = '!', loadCategories = true, clientOptions } = {}) {
	determinePrefix = typeof customPrefix === 'function' ? customPrefix : () => customPrefix;

	let client = new Client(clientOptions);
	let commands = new Collection();

	load(commands, location);

	if (loadCategories === true)
		for (let folder of fs.readdirSync(location))
			if (fs.statSync(location + '/' + folder).isDirectory())
				load(commands, location + '/' + folder);

	client.on('message', async (message) => {
		if (!(message instanceof Message))
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

		if (command == null)
			return;

		args.shift();
		cut.substring(aliasUsed.length).trim();

		command.exec(new Call(message, command, commands, cut, args, prefixUsed, aliasUsed));
	});

	client.login(token);

	return client;
}

handler.Call = Call;

module.exports = handler;