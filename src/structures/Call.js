const { defaults } = require('../utils.js');

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
	constructor(message, command, commands, cut, args, prefixUsed, aliasUsed, handler) {
		this.message = message;
		this.client = message.client;
		this.command = command;
		this.commands = commands;
		this.args = args;
		this.prefixUsed = prefixUsed;
		this.aliasUsed = aliasUsed;
		this.cut = cut;

		this.handler = handler;
	}

	/**
	 * Intentionally avoids `MessageCollector`'s so not to cause confusion to the developer if a possible `EventEmitter` memory leak occurs.
	 * Note: To force cancel a prompt, do `handler.prompts.get('1234567890').end('cancelled')` where the parameter is the prompted user's id.
	 * @param {?Discord.StringResolvable} msg The arguments you would supply to a `TextChannel#send` function. Can be an array of arguments or a
	 * single argument.
	 * @param {PromptOptions} options Options to customize the prompt with.
	 * @returns {Promise<Discord.Message|Discord.Collection<Discord.Snowflake, Discord.Message>>} A collection of messages recieved by the user that
	 * passed all requirements.
	 */
	async prompt(msg, options = {}) {
		defaults(options, this.handler.promptOptionsDefaults);

		let oldFilter = options.filter;
		options.rawFilter = oldFilter;

		if (oldFilter instanceof RegExp)
			options.filter = (m) => oldFilter.test(m.content);
		else if (Array.isArray(oldFilter))
			options.filter = (m) => oldFilter.map((o) => o.toLowerCase()).includes(m.content.toLowerCase());
		else if (typeof oldFilter === 'number')
			options.filter = (m) => !!m.content.length && m.content.length <= oldFilter;
		else if (typeof oldFilter === 'function')
			options.filter = oldFilter;

		return new this.handler.Promise(async (resolve, reject) => {
			let prompt = new this.handler.Prompt(this.message.author, options.channel || this.message.channel, options,
				resolve, reject, this.handler);

			msg = options.formatTrigger(prompt, ...(Array.isArray(msg) ? msg : [msg]));

			let oldCorrect = options.correct;

			if (typeof oldCorrect === 'string')
				options.correct = (m) => m.channel.send(...options.formatCorrect(prompt, oldCorrect));
			else if (typeof oldCorrect === 'function')
				options.correct = (m) => m.channel.send(...options.formatCorrect(prompt, oldCorrect(m)));

			if (msg[0]) {
				let failed = false;

				await (options.channel || this.message.channel).send(...msg).catch(() => {
					prompt.end('trigger message failed to send');

					failed = true;
				});

				if (failed)
					return;
			}

			this.handler.prompts.set(this.message.author.id, prompt);
		});
	}
}

module.exports = Call;