# Simple Discord.js Command Handler
A quite simple command handler for the [discord.js](https://discord.js.org) dependency.

### Examples
Launch your bot along with the handler.
```js
const handler = require('d.js-command-handler');
const token = 'abc123';

let client = handler(__dirname + '/commands', token, { customPrefix: '-', clientOptions: { disableEveryone: true } });

client.on('ready', () => {
	console.log(client.user.username + ' has successfully booted up.');
});
```
Login when you choose (supply a Client instance instead of a token).
```js
const { Client } = require('discord.js');
const handler = require('d.js-command-handler');
const token = 'abc123';

let client = new Client({ disableEveryone: true });

client.on('ready', () => {
	console.log(client.user.username + ' has successfully booted up.');
});

handler(__dirname + '/commands', client, { customPrefix: '-' });

client.login(token);
```
Example command.
```js
module.exports = {
	id: 'ping',
	aliases: ['pong'], // defaults to []
	channels: 'any', // defaults to 'any'. options are: 'dm', 'guild', 'any'.
	// 'call' is an instance of the Call class, a class containing various properties and utility functions.
	exec: (call) => {
		call.message.channel.send('Pong! ' + Math.round(call.client.ping) + 'ms D-API delay.');
	}
};
```
Example command using the prompt function.
```js
module.exports = {
	id: 'ice-cream',
	exec: (call) => {
		call.prompt('What\'s your favorite ice cream flavor?',
			{ time: 60000 }).then((msg) => {
				// Resolves with the response.
				console.log(msg.content);
				if (msg.content.toLowerCase() === 'vanilla')
					call.message.channel.send('Cool! Mine too!');
				else
					call.message.channel.send('Cool!');
			}).catch((exc) => {
				// Rejects when the command is cancelled, out of time, or surpasses the maximum amount of attempts.
				// In this case surpassing the maximum amount of attempts is impossible since there is no filter.
				call.message.channel.send('Cancelled prompt.');
			});
	}
};
```
# API
### handle(path, client, options?): [Client](https://discord.js.org/#/docs/main/stable/class/Client)
Parameters:
- `path` A string representing the path to the commands folder.
- `client` A token to create a Client instance and login with, or a pre-existing Client instance to use.
- `options` Options to use with the handle function. [See here](#handle-options).

Properties (static):
- `Call` The Call class.
- `Prompt` The Prompt class.
- `prompts` - A [Collection](https://discord.js.org/#/docs/main/stable/class/Collection) of all current Prompt instances mapped by the user id.

<a id="handle-options"></a>

### HandleOptions
Properties:
- `customPrefix` A string representing the prefix. If a function is supplied, the function is called with the message, the function is also allowed to return a promise. Defaults to `!`.
- `onError` A function called with the message, the command and the error when a command encounters an error upon being run. Defaults to simply logging the command and error.
- `loadCategories` A boolean option to load the folders inside the commands folder as well. Defaults to `true`.
- `allowBots` A boolean option on whether or not to allow commands to be triggered by bots. Defaults to `false`.
- `clientOptions` Options to supply directly to the Client instance being created. Is not used if the 'token' parameter is supplied.

### Class: Call
An instance of this is supplied to a command's `exec` function when a command is called.

Properties (when instantiated):
- `message` The [Message](https://discord.js.org/#/docs/main/stable/class/Message) instance sent to trigger the command.
- `client` The [Client](https://discord.js.org/#/docs/main/stable/class/Client) instance of the bot.
- `command` The command object, e.g. `{ id: 'ping', exec: () => {} }`.
- `commands` A [Collection](https://discord.js.org/#/docs/main/stable/class/Collection) instance representing all the command objects mapped by the command id's.
- `args` A array of strings representing the arguments supplied to the message, e.g '!ban @gt_c for bullying me' would make this array `['@gt_c', 'for', 'bullying', 'me']`.
- `prefixUsed` A string representing the prefix used to call the command. Possibly your client's mention if that is how the user triggered the command.
- `aliasUsed` The alias (or command id) used in calling the command, e.g. '!ping' would make this property 'ping'.
- `cut` A string representing the content of the message, excluding the prefix and alias used.

Functions (when instantiated):
- `prompt` A function to prompt a user with the text supplied, and wait for a response. [See here](#prompt-function).

<a id="prompt-function"></a>

### Call#prompt(message?, options?): [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Message](https://discord.js.org/#/docs/main/stable/class/Message)|[Collection](https://discord.js.org/#/docs/main/stable/class/Collection)<[Snowflake](https://discord.js.org/#/docs/main/stable/typedef/Snowflake), [Message](https://discord.js.org/#/docs/main/stable/class/Message)>>
Parameters:
- `message` The arguments you would supply to a [`TextChannel#send`](https://discord.js.org/#/docs/main/stable/class/TextChannel?scrollTo=send) function. Can be an array of arguments or a single argument.
- `options` Options to customize the prompt with. [See here](#prompt-options).

Returns: A collection of messages recieved by the user that passed all requirements.

Note: To force cancel a prompt, do `handler.prompts.delete('1234567890')` where the parameter is the prompted user's id.

<a id="prompt-options"></a>

### PromptOptions
Properties:
- `filter` A function called with the message and Prompt instance to determine whether a message should be deleted or not. Should not include filtering the user (done internally). Defaults to `() => true`.
- `correct` A function called with the message and Prompt instance that should handle when a message does not pass the filter. Defaults to `() => {}`.
- `cancellable` A boolean representing whether or not the user should be able to reply with `cancel` to cancel the ongoing prompt. Defaults to `true`.
- `autoRespond` A boolean representing whether or not the bot should automatically respond when the prompt is cancelled/out of time with `Cancelled prompt.`, or when the max attempts are exceeded, `Too many attempts.`. If disabled, you should probably handle this on the promise's rejection. Defaults to `true`.
- `invisible` A boolean representing whether or not the prompt is permitted to coexist with another prompt in the same channel. Defaults to `false`.
- `time` A number represing the amount of milliseconds to wait before ending the prompt from time. Defaults to `180000` or 3 minutes. Set this to 0 or `Infinity` for no time limit.
- `messages` The amount of messages to accept before resolving the promise. Defaults to `1`.
- `attempts` The amount of times the user is able to fail the filter before having the prompt cancelled. Defaults to `10`. You can set this to `0` or `Infinity` for infinite attempts permitted.

Note: Setting the `time` option to Infinity is strongly disadvised, as it can cause confusion for the user, and may also cause the promise to never be [garbage collected](https://blog.codeship.com/understanding-garbage-collection-in-node-js/) if the prompt is never fulfilled.