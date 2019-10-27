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

# Customization
I try to keep this dependency as customizable as possible, here are some benefits of the customizability.
### Classes
All references to classes come directly from the classes added onto the handler function. This means that you are able to easily extend these classes, either by access their prototype directly, or if you wish, redefining them, e.g. `handler.Call = <class-object-here>`. However redefining them is **not** recommended, and if you do so without being fully aware, it may cause some internal issues.
### Command Layouts
Already have existing command layouts, and you don't want to bother switching all `command.info.name` references to `command.id`? Simple, check out the `customProps` option that can be supplied to the [handle function's options](#handle-options).
### Other
Other forms of custom traits are
- custom & multiple prefixes
- custom command error handling
- options for loading categories, allowing bot input, etc.

If you have any suggestions for this dependency feel free to [leave an issue](https://github.com/gt-c/Simple-Discord.js-Command-Handler/issues) with your idea!

# API
Documentation may not be complete. If you find something undocumented make a pull request on [the repository](https://github.com/gt-c/Simple-Discord.js-Command-Handler).
### handle(path, client, options?): [Client](https://discord.js.org/#/docs/main/stable/class/Client)
Parameters:
- `path` A string representing the path to the commands folder.
- `client` A token to create a Client instance and login with, or a pre-existing Client instance to use.
- `options` Options to use with the handle function. [See here](#handle-options).

Properties (static):
- `Promise` The Promise class (purely for redefining and using a promise library different than the native js one, such as [bluebird](https://www.npmjs.com/package/bluebird)).
- `Call` The [Call class](#call-class).
- `Prompt` The [Prompt class](#prompt-class).
- `prompts` A [Collection](https://discord.js.org/#/docs/main/stable/class/Collection) of all current [Prompt](#prompt-class) instances mapped by the user id.
- `promptOptionsDefaults` The default prompt options. Adjusted purely for code convenience.

<a id="handle-options"></a>

### HandleOptions
Properties:
- `customPrefix` A string, array, or function value representing the prefix(es) of the bot. A function should return a string or array of strings. If a database call or some other asynchronous action is required, the function should return a Promise. Defaults to `!`.
- `onError` A function called with the message, the command and the error when a command encounters an error upon being run. Defaults to simply logging the command and error.
- `editCategory` A function that is called with a command's category folder, used to edit the string passed into the category property of the command. Requires `HandleOptions#setCategoryProperty` to be `true`. Defaults to capitilizing the first character of the category.
- `defaultCategory` The default category that is set on a command if it has no category folder. Defaults to `'Other'`.
- `loadCategories` A boolean option to load the folders inside the commands folder as well. Defaults to `true`.
- `setCategoryProperty` A boolean option representing whether or not to set the category property of a command based off of it's parent folder. Defaults to `true`.
- `defaultPrefix` A boolean option determining if the default mention prefix is used, e.g `@bot ping`. Defaults to `true`.
- `allowBots` A boolean option on whether or not to allow commands to be triggered by bots. Defaults to `false`.
- `restrictedGuilds` An array which restricts commands to certain guilds. Defaults to `[]`.
- `customProps` An object that redefines the property locations of a command, e.g. `{ id: 'name', exec: 'run' }` changes the location of the command id to `command.name` and the command execution to `command.run`. You can also use deep properties such as `{ id: 'info.name' }`.
- `clientOptions` Options to supply directly to the Client instance being created. Is not used if the 'token' parameter is supplied.

<a id="call-class"></a>

### Class: Call
An instance of this is supplied to a command's `exec` function when a command is called. All parameters translate directly into properties.

Parameters:
- `message`
- `command`
- `commands`
- `cut`
- `args`
- `prefixUsed`
- `aliasUsed`

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
- `prompt(message, options)` A function to prompt a user with the text supplied, and wait for a response. [See here](#prompt-function).

<a id="prompt-function"></a>

### Call#prompt(message?, options?): [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[Message](https://discord.js.org/#/docs/main/stable/class/Message)|[Collection](https://discord.js.org/#/docs/main/stable/class/Collection)<[Snowflake](https://discord.js.org/#/docs/main/stable/typedef/Snowflake), [Message](https://discord.js.org/#/docs/main/stable/class/Message)>>
Parameters:
- `message` The arguments you would supply to a [`TextChannel#send`](https://discord.js.org/#/docs/main/stable/class/TextChannel?scrollTo=send) function. Can be an array of arguments or a single argument.
- `options` Options to customize the prompt with. [See here](#prompt-options).

Returns: A collection of messages recieved by the user that passed all requirements.

Note: To force cancel a prompt, do `handler.prompts.get('1234567890').end('cancelled')` where the parameter is the prompted user's id.

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
- `channel` The channel to send the prompt to. Defaults to `this.message.channel`.
- `matchUntil` Causes the prompt to continue matching until the function provided returns true.
- `addLastMatch` A boolean representing whether or not to add the message that triggered the `matchUntil` function to the end result. Defaults to `false`.

Note: Setting the `time` option to Infinity is strongly disadvised, as it can cause confusion for the user, and may also cause the promise to never be [garbage collected](https://blog.codeship.com/understanding-garbage-collection-in-node-js/) if the prompt is never fulfilled.

<a id="prompt-class"></a>

### Class: Prompt
An instance of this is created whenever Call#prompt is called successfully and then added to handler#prompts and removed once the prompt is finished. All parameters translate directly into properties.

Parameters:
- `user`
- `channel`
- `options`
- `resolve`
- `reject`

Properties (when instantiated):
- `user` The user the prompt is based around.
- `channel` The channel the prompt is in.
- `options` The options of the prompt. [See here](#prompt-options).
- `resolve` The function to resolve the promise.
- `reject` The function to reject the promise.
- `ended` Whether or not the prompt has been ended.
- `attempts` The amount of attempts the user has made to complete the prompt.
- `values` A [Collection](https://discord.js.org/#/docs/main/stable/class/Collection) resembling the [Message](https://discord.js.org/#/docs/main/stable/class/Message) objects collected by the prompt.

Functions (when instantiated):
- `addInput(message)` Adds a message object to the values if it passes the filter provided, otherwise calling the correct function provided.
- `end(reason)` Ends the prompt for whatever reason, rejecting the promise if an unsuccessful completion.

# License
This work is licensed under a [Creative Commons Attribution-NonCommercial 4.0 International License](http://creativecommons.org/licenses/by-nc/4.0/).
