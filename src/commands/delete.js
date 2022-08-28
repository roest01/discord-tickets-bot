/**
 *
 *  @name DiscordTickets
 *  @author eartharoid <contact@eartharoid.me>
 *  @license GNU-GPLv3
 *
 */

const {
	MessageEmbed
} = require('discord.js');
const fs = require('fs');
const { join } = require('path');

module.exports = {
	name: 'delete',
	description: 'Löscht ein Ticket. Gleich wie das schließen eines Tickets speichert allerdings keine Transcripts oder Archive.',
	usage: '[ticket]',
	aliases: ['del'],
	example: 'delete #bewerbung-17',
	args: false,
	async execute(client, message, _args, log, { config, Ticket }) {
		const guild = client.guilds.cache.get(config.guild);

		const notTicket = new MessageEmbed()
			.setColor(config.err_colour)
			.setAuthor(message.author.username, message.author.displayAvatarURL())
			.setTitle('❌ **This isn\'t a ticket channel**')
			.setDescription('Use this command in the ticket channel you want to delete, or mention the channel.')
			.addField('Usage', `\`${config.prefix}${this.name} ${this.usage}\`\n`)
			.addField('Help', `Type \`${config.prefix}help ${this.name}\` for more information`)
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
			if (!ticket) return channel.send(notTicket);

		} else {
			ticket = await Ticket.findOne({
				where: {
					channel: channel.id
				}
			});
			if (!ticket) {
				notTicket
					.setTitle('❌ **Kanal ist kein Ticket**')
					.setDescription(`${channel} ist kein Ticket Kanal.`);
				return message.channel.send(notTicket);
			}

		}
		if (message.author.id !== ticket.creator && !message.member.roles.cache.has(config.staff_role) && !message.member.roles.cache.has(config.staff_role2))
			return channel.send(
				new MessageEmbed()
					.setColor(config.err_colour)
					.setAuthor(message.author.username, message.author.displayAvatarURL())
					.setTitle('❌ **Keine Berechtigung**')
					.setDescription(`Du hast keine Berechtigung ${channel} zu löschen da er dir nicht gehört oder du kein Mitarbeiter bist.`)
					.addField('Verwendung', `\`${config.prefix}${this.name} ${this.usage}\`\n`)
					.addField('Hilfe', `Tippe \`${config.prefix}help ${this.name}\` für weitere Informationen`)
					.setFooter(guild.name, guild.iconURL())
			);

		
		if (config.commands.delete.confirmation) {
			let success;
			let confirm = await message.channel.send(
				new MessageEmbed()
					.setColor(config.colour)
					.setAuthor(message.author.username, message.author.displayAvatarURL())
					.setTitle('❔ Bist du sicher?')
					.setDescription(
						`:warning: Diese Aktion ist **endgültig**, das Ticket wird komplett aus der Datenbank entfernt.
						Du wirst **nicht** in der Lage sein den Verlauf oder das Archiv später an zu schauen.
						Möchtest du dieses Ticket einfach abschließen, nutze lieber \`-close\`.\n**Drücke  ✅ um das Ticket jetzt zu löschen.**`)
					.setFooter(guild.name + ' | Läuft in 15 Sekunden ab', guild.iconURL())
			);

			await confirm.react('✅');

			const collector = confirm.createReactionCollector(
				(r, u) => r.emoji.name === '✅' && u.id === message.author.id, {
					time: 15000
				});

			collector.on('collect', async () => {
				if (channel.id !== message.channel.id)
					channel.send(
						new MessageEmbed()
							.setColor(config.colour)
							.setAuthor(message.author.username, message.author.displayAvatarURL())
							.setTitle('**Ticket gelöscht**')
							.setDescription(`Ticket gelöscht von ${message.author}`)
							.setFooter(guild.name, guild.iconURL())
					);

				confirm.reactions.removeAll();
				confirm.edit(
					new MessageEmbed()
						.setColor(config.colour)
						.setAuthor(message.author.username, message.author.displayAvatarURL())
						.setTitle(`✅ **Ticket ${ticket.id} gelöscht**`)
						.setDescription('Der Kanal wird in wenigen Sekunden automatisch gelöscht.')
						.setFooter(guild.name, guild.iconURL())
				);

				if (channel.id !== message.channel.id)
					message.delete({
						timeout: 5000
					}).then(() => confirm.delete());

				success = true;
				del();
			});

			collector.on('end', () => {
				if (!success) {
					confirm.reactions.removeAll();
					confirm.edit(
						new MessageEmbed()
							.setColor(config.err_colour)
							.setAuthor(message.author.username, message.author.displayAvatarURL())
							.setTitle('❌ **Abgelaufen**')
							.setDescription('Du hast zu lange gebraucht; Bestätigung fehlgeschlagen.')
							.setFooter(guild.name, guild.iconURL()));

					message.delete({
						timeout: 10000
					}).then(() => confirm.delete());
				}
			});
		} else {
			del();
		}


		async function del () {
			let txt = join(__dirname, `../../user/transcripts/text/${ticket.get('channel')}.txt`),
				raw = join(__dirname, `../../user/transcripts/raw/${ticket.get('channel')}.log`),
				json = join(__dirname, `../../user/transcripts/raw/entities/${ticket.get('channel')}.json`);

			if (fs.existsSync(txt)) fs.unlinkSync(txt);
			if (fs.existsSync(raw)) fs.unlinkSync(raw);
			if (fs.existsSync(json)) fs.unlinkSync(json);

			// update database
			ticket.destroy(); // remove ticket from database

			// channel
			channel.delete({
				timeout: 5000
			});


			log.info(`${message.author.tag} löschte ein Ticket (#${ticket.id})`);

			if (config.logs.discord.enabled) {
				client.channels.cache.get(config.logs.discord.channel).send(
					new MessageEmbed()
						.setColor(config.colour)
						.setAuthor(message.author.username, message.author.displayAvatarURL())
						.setTitle('Ticket gelöscht')
						.addField('Erstellt von', `<@${ticket.creator}>`, true)
						.addField('Gelöscht von', message.author, true)
						.setFooter(guild.name, guild.iconURL())
						.setTimestamp()
				);
			}
		}
		
	}
};
