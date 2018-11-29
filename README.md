# Simple Discord.js Command Handler
A quite simple command handler for the [discord.js](https://discord.js.org) dependency.

### Example
```js
// Your launch file (commonly named index.js or bot.js).

const handler = require('discord.js-command-handler');
const token = '123';

// A third parameter can also be supplied, resembling the ClientOptions, normally passed into the Client class.
// And an objects option for a fourth, this should contain the following:
// customPrefix (a function or string used to determine the prefix, defaults to '!')
// loadCategories (whether or not to automatically load categories inside the commands folder, defaults to 'true')
// clientOptions (the options to directly pass into the require('discord.js').Client class)
// Returns the client object.
handler(__dirname + '/commands', token)
	.on('ready', () => {
		console.log(client.user.username + ' has successfully booted up.');
	});

// commands/ping.js

module.exports = {
	id: 'ping',
	aliases: ['pong'], // defaults to []
	channels: 'dm', // defaults to 'any'. options are: 'dm', 'guild', 'any'.
	// 'call' is an instance of the Call class, a class containing various properties and utility functions.
	exec: (call) => {
		call.message.channel.send('Pong! ' + Math.round(call.client.ping) + 'ms D-API delay.');
	}
};
```