import path from "node:path";
import fs from "node:fs/promises";

import * as Eris from "eris";
import { LavalinkManager, EQList } from "lavalink-client";

import { log, err, errDiscord } from "./utils.js";

process.title = "Bezzębna Stara Sobasa";
process.chdir(import.meta.dirname);

const config = JSON.parse(await fs.readFile("./config.json"));

const fragmentsPath = path.join(import.meta.dirname, "fragments");

const disabledChannels = {};

const bot = new Eris.Client(config.token);
const music = new LavalinkManager({
	nodes: [
		{
			host: config.lavalink.host,
			port: config.lavalink.port,
			authorization: config.lavalink.password,
			sessionId: config.lavalink.session,
			id: "main",
			requestSignalTimeoutMS: 3000
		}
	],
	sendToShard: (guildID, payload) => {
		const guild = bot.guilds.get(guildID);
		if(guild) {
			guild.shard.sendWS(payload.op, payload.d);
		}
	},
	playerOptions: {
		clientBasedPositionUpdateInterval: 500,
		onEmptyQueue: {
			destroyAfterMs: 500
		}
	},
	queueOptions: {
		maxPreviousTracks: 1
	}
});

async function playFragment(guildId, voiceChannelId, textChannelId, requester) {
	const oldPlayer = music.getPlayer(guildId);
	if(oldPlayer) { // TODO reuse old players
		await oldPlayer.destroy(bot.user.username + " stopped the playback.");
		await new Promise((resolve, reject) => setTimeout(resolve, 200));
	}

	const player = music.createPlayer({
		guildId,
		voiceChannelId,
		textChannelId,
		selfDeaf: true,
		instaUpdateFiltersFix: true
	});

	if(!player.connected) {
		await player.connect();
		await new Promise((resolve, reject) => setTimeout(resolve, 500));
	}

	player.queue.add((await player.search({
		query: path.join(fragmentsPath, Math.floor(Math.random() * 10) + ".mp3"),
		source: "local"
	}, {
		id: requester.id,
		username: requester.username,
		avatar: requester.avatar
	})).tracks[0]);

	if(!player.playing) await player.play({
		pause: false,
		volume: 100,
		startTime: 0
	});
}

function findChannel(guild) {
	const channels = guild.channels.filter(c => c.id !== guild.afkChannelID && !disabledChannels[guild.id + c.id] && c instanceof Eris.VoiceChannel && c.voiceMembers.some(m => !m.bot));
	if(channels.length !== 0) {
		const channel = channels[Math.floor(Math.random() * channels.length)];
		playFragment(channel.guild.id, channel.id, channel.id, bot.user).catch(e => {
			err("[Lavalink] Play error", e);
		});
	}
}

function randomPlay() {
	bot.guilds.forEach(findChannel);
	setTimeout(randomPlay, 1800000 + Math.floor(Math.random() * 1800000)); // 30 to 60 minutes
}

function getChannel(msg) {
	const channel = msg.member.voiceState.channelID;
	if(!channel) {
		bot.createMessage(msg.channel.id, "You must be in a voice channel.").catch(errDiscord);
		return;
	}
	return channel;
}

function checkQueue(msg, player) {
	if(!player.queue.current) {
		bot.createMessage(msg.channel.id, "No song playing.").catch(errDiscord);
		return;
	}
	return true;
}

async function getPlayer(msg, channel) {
	const player = await music.getPlayer(msg.guildID);
	if(!player) {
		bot.createMessage(msg.channel.id, "Bot is not connected.").catch(errDiscord);
		return;
	}

	if(player.voiceChannelId !== channel) {
		bot.createMessage(msg.channel.id, "You must be in the same voice channel as the bot.").catch(errDiscord);
		return;
	}

	return player;
}

music.nodeManager.on("error", (node, error, payload) => {
	err("[Lavalink %s] Error", node.id, error, "Payload", payload);
})/*.on("raw", (node, payload) => {
	log("[Lavalink %s] Raw", node.id, payload);
})*/.on("disconnect", (node, reason) => {
	log("[Lavalink %s] Disconnected", node.id, reason);
}).on("connect", node => {
	log("[Lavalink %s] Connected", node.id);

	randomPlay();
}).on("reconnecting", node => {
	log("[Lavalink %s] Reconnecting", node.id);
}).on("create", node => {
	log("[Lavalink %s] Created", node.id);
}).on("destroy", node => {
	log("[Lavalink %s] Destroyed", node.id);
}).on("resumed", (node, payload, players) => {
	log("[Lavalink %s] Resumed", node.id, players, "Payload", payload);
});

music.on("playerSocketClosed", (player, payload) => {
	log("[Lavalink on %s] Socket closed", player.guildId, payload);
}).on("trackStart", (player, track) => {
	//log("[Lavalink on %s] Track start", player.guildId, track);
	if(track && track.info && track.info.artworkUrl) {
		bot.createMessage(player.textChannelId, { embed: {
			title: "Now Playing",
			description: track.info.author.replaceAll("*", "\\*").replaceAll("_", "\\_") + " **-** " + track.info.title.replaceAll("*", "\\*").replaceAll("_", "\\_"),
			author: {
				name: "Requested by " + track.requester.username,
				"icon_url": "https://cdn.discordapp.com/avatars/" + track.requester.id + "/" + track.requester.avatar + ".webp?size=80"
			},
			thumbnail: {
				url: track.info.artworkUrl,
			}
		}}).catch(errDiscord);
	}
}).on("trackEnd", (player, track, payload) => {
	//log("[Lavalink on %s] Track end", player.guildId, track, "Payload", payload);
}).on("trackError", (player, track, payload) => {
	err("[Lavalink on %s] Track error", player.guildId, track, "Payload", payload);
}).on("trackStuck", (player, track, payload) => {
	log("[Lavalink on %s] Track stuck", player.guildId, track, "Payload", payload);
}).on("queueEnd", (player, track, payload) => {
	// track = last track
	//log("[Lavalink on %s] Queue end", player.guildId, payload);
	//bot.createMessage(player.textChannel, "Queue has ended!").catch(errDiscord);
});

/*.on("nodeDisconnect", (node, { code, reason }) => {
	if(code === 1000 && reason === "destroy") {
		log("[Lavalink %s] Disconnected", node.options.identifier);
	}
})*/

bot.on("error", errDiscord).on("ready", () => {
	log("[Discord] Ready");
	bot.editStatus({ name: "Życie toczy się, z zębami czy bez...", type: 3 });

	music.init({
		id: bot.user.id,
		username: "bezzebna-stara-sobasa"
	});
}).on("rawWS", data => {
	music.sendRawData(data).catch(e => {
		err("[Lavalink] Send error", e);
	});
}).on("channelDelete", channel => {
	const player = music.getPlayer(channel.guild.id);
	if(!player) {
		return;
	}
	if(channel.id === player.voiceChannelId) {
		player.destroy("Voice channel deleted");
	} else if(channel.id === player.textChannelId) {
		player.textChannelId = player.voiceChannelId;
	}
}).on("guildRemove", guild => {
	const player = music.getPlayer(guild.id);
	if(player) {
		player.destroy("Guild deleted");
	}
}).on("voiceChannelLeave", async (member, channel) => {
	if(!channel.voiceMembers.some(m => !m.bot)) {
		const id = channel.guild.id + channel.id;
		if(disabledChannels[id]) {
			delete disabledChannels[id];
		}

		const player = await music.getPlayer(channel.guild.id);
		if(player) {
			player.destroy("Everyone left the voice channel");
		}
	}
})/*.on("voiceChannelJoin", async (member, channel) => {
	const player = await music.get(channel.guild.id);
	if(!player) {
		play(channel.guild.id, channel.id, channel.id, bot.user).catch(console.error);
	}
}).on("voiceChannelLeave", async (member, oldChannel) => {
	const player = await music.get(oldChannel.guild.id);
	if(!player || !oldChannel.voiceMembers.some(m => !m.bot)) {
		if(player) {
			player.destroy();
		}
		findChannel(oldChannel.guild);
	}
}).on("voiceChannelSwitch", async (member, channel, oldChannel) => {
	const player = await music.get(channel.guild.id);
	if(!player || !oldChannel.voiceMembers.some(m => !m.bot)) {
		if(player) {
			player.destroy();
		}
		play(channel.guild.id, channel.id, channel.id, bot.user).catch(console.error);
	}
})*/.on("messageCreate", async msg => {
	// TODO
	// queue.shufle()
	// queue.clear()
	// queue.remove(startOrPosition = 0, end)
	// pokazywanie queue (jest arrayem)
	// moze statsy node'a?
	// moze custom equalizery?
	// mozliwosc dzialania jako zwykly music bot

	if(msg.author.bot) return;

	if(msg.content.length <= config.prefix.length) return;

	if(msg.content.slice(0, config.prefix.length).toLowerCase() !== config.prefix) {
		return;
	}

	const args = msg.content.split(/\s+/g);
	const cmd = args.shift().slice(config.prefix.length).toLowerCase();

	if(cmd === "co_umiesz?" || cmd === "pokaz") {
		bot.createMessage(msg.channel.id,
			"`" + config.prefix + "co_umiesz?|" + config.prefix + "pokaz` Shows this message\n" +
			"`" + config.prefix + "tekst` Shows the lyrics\n" +
			"`" + config.prefix + "chodz|" + config.prefix + "dawaj|" + config.prefix + "zapierdalaj|" + config.prefix + "zakurwiaj` Joins your channel\n" +
			"`" + config.prefix + "do_spania|" + config.prefix + "spac` Temporarily disables auto joining for your channel\n" +
			"`" + config.prefix + "tepnij|" + config.prefix + "tepaj <czas>` Seeks the playback to the time provided\n" +
			"`" + config.prefix + "daj_glos <procent>` Changes volume of the playback (1-1000, 100 = default)\n" +
			"`" + config.prefix + "daj_glos_efektu <procent>` Changes volume of the effect (1-5, 1 = default)\n" +
			"`" + config.prefix + "jebnij_basem <mnoznik>` Bass boosts the playback\n" +
			"`" + config.prefix + "jebnij_efektem <efekt>` Applies effect to the playback\n" +
			"`" + config.prefix + "jebnij_reset` Removes all playback effects\n" +
			"`" + config.prefix + "jebnij_kreche <predkosc>` Sets speed of the playback (1 = default)\n" +
			"`" + config.prefix + "jebnij_helu <wysokosc>` Sets pitch of the playback (1 = default)\n" +
			"`" + config.prefix + "jebnij_ratio <wspolczynnik>` Sets rate of the playback (1 = default)\n" +
			"`" + config.prefix + "jebnij_rotation` Applies rotation effect to the playback\n" +
			"`" + config.prefix + "jebnij_vibrato` Applies vibrato effect to the playback\n" +
			"`" + config.prefix + "jebnij_tremolo` Applies tremolo effect to the playback\n" +
			"`" + config.prefix + "jebnij_lowpass` Applies lowpass effect to the playback\n" +
			"`" + config.prefix + "jebnij_nightcore` Applies nightcore effect to the playback\n" +
			"`" + config.prefix + "jebnij_vaporwave` Applies vaporwave effect to the playback\n" +
			"`" + config.prefix + "jebnij_karaoke` Applies karaoke effect to the playback\n" +
			"`" + config.prefix + "wyjdz|" + config.prefix + "wypierdalaj|" + config.prefix + "wykurwiaj` Leaves your channel"
		).catch(errDiscord);
	} else if(cmd == "tekst") {
		bot.createMessage(msg.channel.id, `Sobas młody biznesmen
Uderzył swoją starą
Tak mocno, tak mocno
Poleciały jej zęby.
[x2]

Każdy ząb na podłodze
Bezzębna teraz ona
Bez słów, bez słów
Patrzy na niego.
[x2]

Życie, toczy się
Z zębami, czy bez
Miłość boli, mocno
W sercu i ustach.

Życie toczy się
Z zębami czy bez
Miłość boli mocno
W sercu i ustach.
[x4]`).catch(errDiscord);
	} else if(cmd === "chodz" || cmd === "dawaj" || cmd === "zapierdalaj" || cmd === "zakurwiaj") {
		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const oldPlayer = music.getPlayer(msg.guildID);
		if(oldPlayer) { // TODO reuse old players
			await oldPlayer.destroy(msg.author.username + " stopped the playback.");
			await new Promise((resolve, reject) => setTimeout(resolve, 200));
		}

		const player = music.createPlayer({
			guildId: msg.guildID,
			voiceChannelId: channel,
			textChannelId: msg.channel.id,
			selfDeaf: true,
			instaUpdateFiltersFix: true
		});

		if(!player.connected) {
			await player.connect();
			await new Promise((resolve, reject) => setTimeout(resolve, 500));
		}

		const track = (await player.search({
			query: path.join(import.meta.dirname, "bezzebna-stara-sobasa.mp3"),
			source: "local"
		}, {
			id: msg.author.id,
			username: msg.author.username,
			avatar: msg.author.avatar
		})).tracks[0];

		track.info.title = "Bezzębna Stara Sobasa";
		track.info.author = "Various Artists";
		track.info.artworkUrl = "https://i1.sndcdn.com/artworks-HlUb7cSzbjCgenn3-hl5aSA-t500x500.jpg";

		player.queue.add(track);

		if(!player.playing) await player.play({
			pause: false,
			volume: 100,
			startTime: 0
		});
	} else if(cmd === "do_spania" || cmd === "spac") {
		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const id = msg.guildID + channel.id;
		if(disabledChannels[id]) {
			delete disabledChannels[id];
			bot.createMessage(msg.channel.id, "Re-enabled auto joining for your channel.").catch(errDiscord);
		} else {
			disabledChannels[id] = true;
			bot.createMessage(msg.channel.id, "Temporarily disabled auto joining for your channel.").catch(errDiscord);
		}
	} else if(cmd === "tepnij" || cmd === "tepaj") {
		const split = args[0].split(":");
		if(split.length > 3) {
			bot.createMessage(msg.channel.id, "Invalid command. Try `" + config.prefix + "seek <Hours:Minutes:Seconds>`").catch(errDiscord);
			return;
		}

		let pos = parseInt(split[split.length - 1], 10);
		if(isNaN(pos)) {
			bot.createMessage(msg.channel.id, "Invalid seconds number. Try `" + config.prefix + "seek <Hours:Minutes:Seconds>`").catch(errDiscord);
			return;
		}
		pos *= 1000;

		if(split.length >= 2) {
			const minutes = parseInt(split[split.length - 2], 10);
			if(isNaN(minutes)) {
				bot.createMessage(msg.channel.id, "Invalid minutes number. Try `" + config.prefix + "seek <Hours:Minutes:Seconds>`").catch(errDiscord);
				return;
			}
			pos += minutes * 60000;
		}

		if(split.length === 3) {
			const hours = parseInt(split[0], 10);
			if(isNaN(hours)) {
				bot.createMessage(msg.channel.id, "Invalid hours number. Try `" + config.prefix + "seek <Hours:Minutes:Seconds>`").catch(errDiscord);
				return;
			}
			pos += hours * 3600000;
		}

		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		if(pos > player.queue.current.info.duration || pos < 0) {
			bot.createMessage(msg.channel.id, "The position can't be bigger than the song's duration.").catch(errDiscord);
			return;
		}

		await player.seek(pos);
		bot.createMessage(msg.channel.id, "Seeked the current song.").catch(errDiscord);
	} else if(cmd === "daj_glos") {
		const num = parseInt(args[0]);
		if(isNaN(num) || num < 1 || num > 1000) {
			bot.createMessage(msg.channel.id, "Invalid command. Try `" + config.prefix + "daj_glos <procent>`").catch(errDiscord);
			return;
		}

		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.setVolume(num, true);
		bot.createMessage(msg.channel.id, "Changed the volume.").catch(errDiscord);
	} else if(cmd === "daj_glos_efektu") {
		const num = parseInt(args[0]);
		if(isNaN(num) || num < 0 || num > 5) {
			bot.createMessage(msg.channel.id, "Invalid command. Try `" + config.prefix + "daj_glos_efektu <procent>`").catch(errDiscord);
			return;
		}

		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.setVolume(num);
		bot.createMessage(msg.channel.id, "Changed the effect volume.").catch(errDiscord);
	} else if(cmd === "jebnij_basem") {
		const num = parseInt(args[0]);
		if(isNaN(num)) {
			bot.createMessage(message.channel.id, "Invalid command. Try `" + config.prefix + "jebnij_basem <mnoznik>`").catch(errDiscord);
			return;
		}

		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		if(num === 0) {
			await player.filterManager.clearEQ();
			bot.createMessage(message.channel.id, "Disabled bass boost for the current playback.").catch(errDiscord);
		} else {
			await player.filterManager.setEQ([
				{ band: 0, gain: num * 0.5 },
				{ band: 1, gain: num * 0.4 },
				{ band: 2, gain: num * 0.3 },
				{ band: 3, gain: num * 0.2 },
				{ band: 4, gain: num * 0.1 }
			]);
			bot.createMessage(msg.channel.id, "Bass boosted the current playback.").catch(errDiscord);
		}
	} else if(cmd === "jebnij_efektem") {
		const arg = args[0];
		if(!arg) {
			bot.createMessage(msg.channel.id, "Invalid command. Try `" + config.prefix + "jebnij_efektem <efekt>`. Effects:\nclear\n" + Object.keys(EQList).join("\n")).catch(errDiscord);
			return;
		}
		let effect;
		if(arg !== "clear") {
			for(const eq in EQList) {
				if(arg.toLowerCase() === eq.toLowerCase()) {
					effect = eq;
					break;
				}
			}
			if(!effect) {
				bot.createMessage(msg.channel.id, "Invalid command. Try `" + config.prefix + "jebnij_efektem <efekt>`. Effects:\nclear\n" + Object.keys(EQList).join("\n")).catch(errDiscord);
				return;
			}
		}

		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		if(!effect) {
			await player.filterManager.clearEQ();
			bot.createMessage(msg.channel.id, "Disabled effects for the current playback.").catch(errDiscord);
		} else {
			await player.filterManager.setEQ(EQList[effect]);
			bot.createMessage(msg.channel.id, "Applied effect for the current playback.").catch(errDiscord);
		}
	} else if(cmd === "jebnij_reset") {
		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.resetFilters();
		bot.createMessage(msg.channel.id, "Removed all effects.").catch(errDiscord);
	} else if(cmd === "jebnij_kreche") {
		const num = parseInt(args[0]);
		if(isNaN(num)) {
			bot.createMessage(msg.channel.id, "Invalid command. Try `" + config.prefix + "jebnij_kreche <predkosc>`").catch(errDiscord);
			return;
		}

		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.setSpeed(num);
		bot.createMessage(msg.channel.id, "Changed the speed.").catch(errDiscord);
	} else if(cmd === "jebnij_helu") {
		const num = parseInt(args[0]);
		if(isNaN(num)) {
			bot.createMessage(msg.channel.id, "Invalid command. Try `" + config.prefix + "jebnij_helu <wysokosc>`").catch(errDiscord);
			return;
		}

		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.setPitch(num);
		bot.createMessage(msg.channel.id, "Changed the pitch.").catch(errDiscord);
	} else if(cmd === "jebnij_ratio") {
		const num = parseInt(args[0]);
		if(isNaN(num)) {
			bot.createMessage(msg.channel.id, "Invalid command. Try `" + config.prefix + "jebnij_ratio <wspolczynnik>`").catch(errDiscord);
			return;
		}

		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.setRate(num);
		bot.createMessage(msg.channel.id, "Changed the rate.").catch(errDiscord);
	} else if(cmd === "jebnij_rotation") {
		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.toggleRotation();
		bot.createMessage(msg.channel.id, "Applied rotation effect.").catch(errDiscord);
	} else if(cmd === "jebnij_vibrato") {
		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.toggleVibrato();
		bot.createMessage(msg.channel.id, "Applied vibrato effect.").catch(errDiscord);
	} else if(cmd === "jebnij_tremolo") {
		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.toggleTremolo();
		bot.createMessage(msg.channel.id, "Applied tremolo effect.").catch(errDiscord);
	} else if(cmd === "jebnij_lowpass") {
		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.toggleLowPass();
		bot.createMessage(msg.channel.id, "Applied lowpass effect.").catch(errDiscord);
	} else if(cmd === "jebnij_nightcore") {
		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.toggleNightcore();
		bot.createMessage(msg.channel.id, "Applied nightcore effect.").catch(errDiscord);
	} else if(cmd === "jebnij_vaporwave") {
		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.toggleVaporwave();
		bot.createMessage(msg.channel.id, "Applied vaporwave effect.").catch(errDiscord);
	} else if(cmd === "jebnij_karaoke") {
		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		if(!checkQueue(msg, player)) {
			return;
		}

		await player.filterManager.toggleKaraoke();
		bot.createMessage(msg.channel.id, "Applied karaoke effect.").catch(errDiscord);
	} else if(cmd === "wyjdz" || cmd === "wypierdalaj" || cmd === "wykurwiaj") {
		const channel = getChannel(msg);
		if(!channel) {
			return;
		}

		const player = await getPlayer(msg, channel);
		if(!player) {
			return;
		}

		await player.destroy(msg.author.username + " stopped the playback.");
		bot.createMessage(msg.channel.id, "Stopped the playback.").catch(errDiscord);
	}
}).connect();
