export function fmt(func, format, ...args) {
	const date = new Date();
	const hours = ("0" + date.getHours()).slice(-2);
	const minutes = ("0" + date.getMinutes()).slice(-2);
	const seconds = ("0" + date.getSeconds()).slice(-2);
	func("[%s] " + format, hours + ":" + minutes + ":" + seconds, ...args);
}
export function log(format, ...args) {
	fmt(console.log, format, ...args);
}
export function err(format, ...args) {
	fmt(console.error, format, ...args);
}
export function errDiscord(e) {
	err("Discord", e);
}
