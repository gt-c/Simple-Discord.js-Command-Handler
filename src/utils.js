const MS_CONFIG = {
	ms: 1,
	milliseconds: 1,
	s: 1000,
	sec: 1000,
	secs: 1000,
	second: 1000,
	seconds: 1000,
	m: 60000,
	min: 60000,
	mins: 60000,
	minute: 60000,
	minutes: 60000,
	h: 3600000,
	hour: 3600000,
	hours: 3600000,
	d: 86400000,
	day: 86400000,
	days: 86400000,
	w: 604800000,
	week: 604800000,
	weeks: 604800000,
	mon: 2592000000,
	month: 2592000000,
	months: 2592000000,
	y: 31536000000,
	year: 31536000000,
	years: 31536000000,
};

// Defines all properties of objDef that are not on obj on obj.
function defaults(obj, objDef) {
	for (let [name, prop] of Object.entries(objDef))
		if (!(name in obj))
			obj[name] = prop;

	return obj;
}

// Defines deep object values.
function defObjVal(obj, str, val) {
	str = str.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');

	let arr = str.split('.');

	for (let prop of arr)
		if (prop in obj && typeof obj[prop] === 'object')
			obj = obj[prop];

	obj[arr[arr.length - 1]] = val(obj[arr[arr.length - 1]]);

	return obj[arr[arr.length - 1]];
}

// Escapes (backslashes) all key characters in regex that are in a string.
function escapeRegExpChars(text) {
	return text.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

// Gets deep object values.
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

function parseTime(str) {
	let time = 0;

	str.replace(new RegExp(`(\\d+)(${Object.keys(MS_CONFIG).join('|')})`, 'g'), (_, mul, len) => time += MS_CONFIG[len]*mul);

	return time || null;
}

module.exports = {
	defaults,
	defObjVal,
	escapeRegExpChars,
	getObjVal,
	parseTime
};