class Cooldown {
	constructor(length, options = {}) {
		this.length = length;

		this.set = options.database.set;
		this.delete = options.database.delete;
		this.update = options.database.update;
		this.get = options.database.get;

		this.handle = options.handle;
		this.handleDelay = options.handleDelay;

		this.setTimeout = options.setTimeout || setTimeout;
		this.clearTimeout = options.clearTimeout || clearTimeout;

		this.cache = {};
		this.handleCache = [];

		if (this.length < 100 || (this.length > 2147483647 && !this.get && !options.setTimeout))
			return new TypeError('Provided length is either less than 100 milliseconds or ' +
				'greater than the maximum positive value for a 32-bit signed binary integer without a retrieving or safe timer function.');

		this.loadCache();
	}

	loadCache() {
		if (!this.get)
			return;

		this.cache = this.get();
	}

	handle(message) {
		if (!this.handle || this.handleCache.includes(message.channel.id))
			return;

		this.handleCache.push(message.channel.id);

		this.setTimeout(() => {
			let index = this.handleCache.indexOf(message.channel.id);

			if (index > -1)
				this.handleCache.splice(index, 1);
		}, this.handleDelay);

		if (typeof this.handle === 'string')
			message.channel.send(this.handle);
		else if (typeof this.handle === 'function')
			this.handle(message);
	}

	onCooldown(id) {
		return id in this.cache;
	}

	addUser(id) {
		if (this.onCooldown(id)) {
			this.clearTimeout(this.cache[id]);

			this.update(id);
		} else {
			this.set(id);
		}

		this.cache[id] = this.setTimeout(this.deleteUser.bind(this, id), this.length);
	}

	deleteUser(id) {
		delete this.cache[id];

		this.delete(id);
	}
}

module.exports = Cooldown;