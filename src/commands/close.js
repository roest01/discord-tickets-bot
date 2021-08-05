/**
 *
 *  @name DiscordTickets
 *  @author eartharoid <contact@eartharoid.me>
 *  @license GNU-GPLv3
 *
 */

const { MessageEmbed } = require('discord.js');
const fs = require('fs');
const { join } = require('path');
const archive = require('../modules/archive');

module.exports = {
	name: 'close',
	description: 'Schließt ein Ticket; ein spezifischen (erwähnten) Kanal, oder den Kanal in dem der Befehl genutzt wurde.',
	usage: '[ticket]',
	aliases: ['none'],
	example: 'close #bewerbung-17',
	args: false,
	async execute(client, message, _args, log, { config, Ticket }) {
		const guild = client.guilds.cache.get(config.guild);

		const notTicket = new MessageEmbed()
			.setColor(config.err_colour)
			.setAuthor(message.author.username, message.author.displayAvatarURL())
			.setTitle('❌ **Dies ist kein Ticketkanal**')
			.setDescription('Nutze diesen Befehl im Ticket oder erwähne den Kanal.')
			.addField('Verwendung', `\`${config.prefix}${this.name} ${this.usage}\`\n`)
			.addField('Hilfe', `Tippe \`${config.prefix}help ${this.name}\` für weitere Informationen`)
			.setFooter(guild.name, guild.iconURL());

		let ticket;
		let channel = message.mentions.channels.first();
		// || client.channels.resolve(await Ticket.findOne({ where: { id: args[0] } }).channel) // channels.fetch()

		if (!channel) {
			channel = message.channel;

			ticket = await Ticket.findOne({
				where: {
					channel: channel.id
				}
			});
			if (!ticket) return message.channel.send(notTicket);
		} else {
			ticket = await Ticket.findOne({
				where: {
					channel: channel.id
				}
			});
			if (!ticket) {
				notTicket
					.setTitle('❌ **Kanal ist kein Ticket**')
					.setDescription(`${channel} ist kein Ticketkanal.`);
				return message.channel.send(notTicket);
			}

		}

		let paths = {
			text: join(__dirname, `../../user/transcripts/text/${ticket.get('channel')}.txt`),
			log: join(__dirname, `../../user/transcripts/raw/${ticket.get('channel')}.log`),
			json: join(__dirname, `../../user/transcripts/raw/entities/${ticket.get('channel')}.json`)
		};

		if (message.author.id !== ticket.creator && !message.member.roles.cache.has(config.staff_role))
			return message.channel.send(
				new MessageEmbed()
					.setColor(config.err_colour)
					.setAuthor(message.author.username, message.author.displayAvatarURL())
					.setTitle('❌ **Keine Berechtigungen**')
					.setDescription(`Du hast keine Berechtigung um ${channel} zu schließen, da dir dieses Ticket nicht zugewiesen ist und du kein Mitarbeiter bist.`)
					.addField('Verwendung', `\`${config.prefix}${this.name} ${this.usage}\`\n`)
					.addField('Hilfe', `Schreibe \`${config.prefix}help ${this.name}\` für weitere Informationen`)
					.setFooter(guild.name, guild.iconURL())
			);

		
		if (config.commands.close.confirmation) {
			let success;
			let pre = fs.existsSync(paths.text) || fs.existsSync(paths.log)
				? `Du kannst eine archivierte Version mit dem Befehl \`${config.prefix}transcript ${ticket.id}\` einsehen.`
				: '';
				
			let confirm = await message.channel.send(
				new MessageEmbed()
					.setColor(config.colour)
					.setAuthor(message.author.username, message.author.displayAvatarURL())
					.setTitle('❔ Bist du sicher?')
					.setDescription(`${pre}\n**Reagiere mit ✅ zur Bestätigung.**`)
					.setFooter(guild.name + ' | Läuft in 15 Sekunden ab.', guild.iconURL())
			);

			await confirm.react('✅');

			const collector = confirm.createReactionCollector(
				(r, u) => r.emoji.name === '✅' && u.id === message.author.id, {
					time: 15000
				});

			collector.on('collect', async () => {
				if (channel.id !== message.channel.id) {
					channel.send(
						new MessageEmbed()
							.setColor(config.colour)
							.setAuthor(message.author.username, message.author.displayAvatarURL())
							.setTitle('**Ticket geschlossen**')
							.setDescription(`Ticket geschlossen von ${message.author}`)
							.setFooter(guild.name, guild.iconURL())
					);
				}

				confirm.reactions.removeAll();
				confirm.edit(
					new MessageEmbed()
						.setColor(config.colour)
						.setAuthor(message.author.username, message.author.displayAvatarURL())
						.setTitle(`✅ **Ticket ${ticket.id} geschlossen**`)
						.setDescription('Der Kanal wird in einigen Sekunden automatisch gelöscht, sobald der Inhalt archiviert wurde.')
						.setFooter(guild.name, guild.iconURL())
				);
				

				if (channel.id !== message.channel.id)
					message.delete({
						timeout: 5000
					}).then(() => confirm.delete());
				
				success = true;
				close();
			});


			collector.on('end', () => {
				if (!success) {
					confirm.reactions.removeAll();
					confirm.edit(
						new MessageEmbed()
							.setColor(config.err_colour)
							.setAuthor(message.author.username, message.author.displayAvatarURL())
							.setTitle('❌ **Abgelaufen**')
							.setDescription('Du hast zu lang gebraucht um zu reagieren; Bestätigung fehlgeschlagen.')
							.setFooter(guild.name, guild.iconURL()));

					message.delete({
						timeout: 10000
					}).then(() => confirm.delete());
				}
			});
		} else {
			close();
		}

		
		async function close () {
			let users = [];

			if (config.transcripts.text.enabled || config.transcripts.web.enabled) {
				let u = await client.users.fetch(ticket.creator);
				if (u) {
					let dm;
					try {
						dm = u.dmChannel || await u.createDM();
					} catch (e) {
						log.warn(`Konnte mit ${u.tag} nicht via DM kommunizieren`);
					}

					let res = {};
					const embed = new MessageEmbed()
						.setColor(config.colour)
						.setAuthor(message.author.username, message.author.displayAvatarURL())
						.setTitle(`Ticket ${ticket.id}`)
						.setFooter(guild.name, guild.iconURL());

					if (fs.existsSync(paths.text)) {
						embed.addField('Text Verlauf', `Verlauf der Bewerbung von ${u.tag}`);
						res.files = [{
							attachment: paths.text,
							name: `bewerbung-${ticket.id}-${ticket.get('channel')}.txt`
						}];
					}

					if (fs.existsSync(paths.log) && fs.existsSync(paths.json)) {
						let data = JSON.parse(fs.readFileSync(paths.json));
						for (u in data.entities.users) users.push(u);
						embed.addField('Web archive', await archive.export(Ticket, channel)); // this will also delete these files
					}

					if (embed.fields.length < 1) {
						embed.setDescription(`Es existierten keine Aufzeichnungen oder Archive für das Ticket ${ticket.id}`);
					}

					res.embed = embed;

					try {
						if (config.commands.close.send_transcripts) dm.send(res).catch(() => log.warn(`Could not send a DM to ${u.tag}`));
						if (config.transcripts.channel.length > 1) client.channels.cache.get(config.transcripts.channel).send(res);
					} catch (e) {
						message.channel.send('❌ Konnte keine DM oder Archivierungs Nachricht senden.');
					}
				}
			}

			// update database
			ticket.update({
				open: false
			}, {
				where: {
					channel: channel.id
				}
			});

			// delete channel
			channel.delete({
				timeout: 5000
			});

			log.info(`${message.author.tag} hat ein Ticket geschlossen (#bewerbung-${ticket.id})`);

			if (config.logs.discord.enabled) {
				let embed = new MessageEmbed()
					.setColor(config.colour)
					.setAuthor(message.author.username, message.author.displayAvatarURL())
					.setTitle(`Ticket ${ticket.id} geschlossen`)
					.addField('Erstellt von', `<@${ticket.creator}>`, true)
					.addField('Geschlossen von', message.author, true)
					.setFooter(guild.name, guild.iconURL())
					.setTimestamp();

				if (users.length > 1)
					embed.addField('Mitglieder', users.map(u => `<@${u}>`).join('\n'));

				client.channels.cache.get(config.logs.discord.channel).send(embed);
			}
		}
	}
};
