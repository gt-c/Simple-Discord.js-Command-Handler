# Simple Discord.js Command Handler
A quite simple command handler for the [discord.js](https://discord.js.org) dependency.

### Examples
Launch your bot along with the handler.
```js
const handler = require('d.js-command-handler');
const token = 'abc123';

let client = handler(`${__dirname}/commands`, token, { customPrefix: '-', clientOptions: { disableEveryone: true } });

client.on('ready', () => {
	console.log(`${client.user.username} has successfully booted up.`);
	console.log(`Connected as ${client.user.tag}`)
});
```
Login when you choose (supply a Client instance instead of a token).
```js
const { Client } = require('discord.js');
const handler = require('d.js-command-handler');
const token = 'abc123';

let client = new Client({ disableEveryone: true });

client.on('ready', () => {
	console.log(`${client.user.username} has successfully booted up.`);
	console.log(`Connected as ${client.user.tag}`)
});

handler(`${__dirname}/commands`, client, { customPrefix: '-' });

client.login(token);
```
Example command.
```js
// commands/ping.js

module.exports = {
	id: 'ping',
	aliases: ['pong'], // defaults to []
	channels: 'dm', // defaults to 'any'. options are: 'dm', 'guild', 'any'.
	// 'call' is an instance of the Call class, a class containing various properties and utility functions.
	exec: (call) => {
		call.message.channel.send(`Pong! ${Math.round(call.client.ping)} ms D-API delay.`);
	}
};
```
# API
### handle(path, client, options?)
Parameters:
- `path` A string representing the path to the commands folder.
- `client` A token to create a Client instance and login with, or a pre-existing Client instance to use.
- `options` Options to use with the handle function. [See here](#handle-options).

Properties (static):
- `Call` The Call class.

<a id="handle-options"></a>

### HandleOptions
Properties:
- `customPrefix` A string representing the prefix. If a function is supplied, the function is called with the message, the function is also allowed to return a promise. Defaults to '!'.
- `loadCategories` A boolean option to load the folders inside the commands folder as well. Defaults to 'true'.
- `allowBots` A boolean option on whether or not to allow commands to be triggered by bots. Defaults to 'false'.
- `clientOptions` Options to supply directly to the Client instance being created. Is not used if the 'token' parameter is supplied.

### Class: Call
An instance of this is supplied to a command's `exec` function when a command is called.
Properties (when instantiated):
- `message` The [Message](https://discord.js.org/#/docs/main/stable/class/Message) instance sent to trigger the command.
- `client` The [Client](https://discord.js.org/#/docs/main/stable/class/Client) instance of the bot.
- `command` The command object, e.g. `{ id: 'ping', exec: () => {} }`
- `commands` A [Collection](https://discord.js.org/#/docs/main/stable/class/Collection) instance representing all the command objects mapped by the command id's.
- `args` A array of strings representing the arguments supplied to the message, e.g '!ban @gt_c for bullying me' would make this array `['@gt_c', 'for', 'bullying', 'me']`.
- `prefixUsed` A string representing the prefix used to call the command. Possibly your client's mention if that is how the user triggered the command.
- `aliasUsed` The alias (or command id) used in calling the command, e.g. '!ping' would make this property 'ping'.
- `cut` A string representing the content of the message, excluding the prefix and alias used.
