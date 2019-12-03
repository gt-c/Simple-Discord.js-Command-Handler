const { Collection } = require('discord.js');

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
 * @property {?function(message: Discord.Message, prompt: Prompt): boolean} matchUntil Continues matching until the function provided returns true
 * or when the amount of messages matched is equal to options.messages.
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
	constructor(user, channel, options, resolve, reject, handler) {
		this.startedAt = Date.now();

		this.user = user;
		this.channel = channel;
		this.options = options;
		this.resolve = resolve;
		this.reject = reject;

		this.ended = false;
		this.attempts = 0;
		this.values = new Collection();

		this.handler = handler;

		if (options.time > 0 && options.time < Infinity)
			this.user.client.setTimeout(this.end.bind(this, 'time'), options.time);
	}

	/**
	 * Adds a message object to the values if it passes the filter provided, otherwise calling the correct function provided.
	 * @param {Discord.Message} message
	 * @returns {any}
	 */
	async addInput(message) {
		if (this.ended)
			return;

		this.attempts++;

		// If cancelled.
		if (this.options.cancellable && message.content.toLowerCase() === 'cancel')
			return this.end('cancelled');

		// Add value to result.
		if (await this.options.filter(message, this)) {
			// If matchUntil function returns true
			if (this.options.matchUntil && this.options.matchUntil(message, this)) {
				if (this.options.addLastMatch)
					this.values.set(message.id, message);

				return this.end('success');
			}

			this.values.set(message.id, message);
		// Corrects user on invalid input.
		} else {
			await this.options.correct(message, this);
		}

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
		this.handler.prompts.delete(this.user.id);

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

module.exports = Prompt;