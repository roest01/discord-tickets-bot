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

module.exports = {
	event: 'messageReactionAdd',
	async execute(client, log, [r, u], {config, Ticket, Setting}) {
		if (r.partial) {
			try {
				await r.fetch();
			} catch (err) {
				log.error(err);
				return;
			}
		}

		let panelID = await Setting.findOne({ where: { key: 'panel_msg_id' } });
		if (!panelID) return;

		if (r.message.id !== panelID.get('value')) return;

		if (u.id === client.user.id) return;

		if (r.emoji.name !== config.panel.reaction && r.emoji.id !== config.panel.reaction) return;

		let channel = r.message.channel;

		const supportRole = channel.guild.roles.cache.get(config.staff_role);
		if (!supportRole) {
			return channel.send(
				new MessageEmbed()
					.setColor(config.err_colour)
					.setTitle('❌ **Error**')
					.setDescription(`${config.name} has not been set up correctly. Could not find a 'support team' role with the id \`${config.staff_role}\``)
					.setFooter(channel.guild.name, channel.guild.iconURL())
			);
		}

		// everything is cool

		await r.users.remove(u.id); // effectively cancel reaction

		let tickets = await Ticket.findAndCountAll({
			where: {
				creator: u.id,
				open: true
			},
			limit: config.tickets.max
		});

		if (tickets.count >= config.tickets.max) {
			let ticketList = [];
			for (let t in tickets.rows)  {
				let desc = tickets.rows[t].topic.substring(0, 30);
				ticketList
					.push(`<#${tickets.rows[t].channel}>: \`${desc}${desc.length > 30 ? '...' : ''}\``);
			}
			let dm = u.dmChannel || await u.createDM();

			try {
				return dm.send(
					new MessageEmbed()
						.setColor(config.err_colour)
						.setAuthor(u.username, u.displayAvatarURL())
						.setTitle(`❌ **Du hast bereits ${tickets.count} offene Tickets**`)
						.setDescription(`Nutze \`${config.prefix}close\` in einem Server Channel um abgeschlossene Tickets zu schließen.\n\n${ticketList.join(',\n')}`)
						.setFooter(channel.guild.name, channel.guild.iconURL())
				);
			} catch (e) {
				let m = await channel.send(
					new MessageEmbed()
						.setColor(config.err_colour)
						.setAuthor(u.username, u.displayAvatarURL())
						.setTitle(`❌ **Du hast bereits ${tickets.count} offene Tickets**`)
						.setDescription(`Nutze \`${config.prefix}close\` um abgeschlossene Tickets zu schließen.\n\n${ticketList.join(',\n')}`)
						.setFooter(channel.guild.name + ' | Diese Nachricht wird in 15 Sekunden gelöscht.', channel.guild.iconURL())
				);
				return m.delete({ timeout: 15000 });
			}
		}

		let topic = config.tickets.default_topic.command;
		
		let ticket = await Ticket.create({
			channel: '',
			creator: u.id,
			open: true,
			archived: false,
			topic: topic
		});

		let name = 'bewerbung-' + ticket.id;

		channel.guild.channels.create(name, {
			type: 'text',
			topic: `${u} | ${topic}`,
			parent: config.tickets.category,
			permissionOverwrites: [{
				id: channel.guild.roles.everyone,
				deny: ['VIEW_CHANNEL', 'SEND_MESSAGES']
			},
			{
				id: client.user,
				allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES', 'READ_MESSAGE_HISTORY']
			},
			{
				id: channel.guild.member(u),
				allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES', 'READ_MESSAGE_HISTORY']
			},
			{
				id: supportRole,
				allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES', 'READ_MESSAGE_HISTORY']
			}
			],
			reason: 'User requested a new support ticket channel (panel reaction)'
		}).then(async c => {
			Ticket.update({
				channel: c.id
			}, {
				where: {
					id: ticket.id
				}
			});

			// require('../modules/archive').create(client, c); // create files

			let ping;
			switch (config.tickets.ping) {
			case 'staff':
				ping = `<@&${config.staff_role}> `;
				break;
			case false:
				ping = '';
				break;
			default:
				ping = `@${config.tickets.ping} `;
			}

			let helpMessage = await c.send(`\`\`\`-close · Schließt dieses Ticket\n-delete · Löscht dieses Ticket. \n-topic · Ändert das Thema \n-add · Fügt jemanden zum Ticket hinzu\`\`\``);
			await helpMessage.pin();

			await c.send(`Cool ${u} - wir freuen uns über neue aktive Mitglieder. Deine Bewerbung kannst du gleich hier lassen. Ein Mitarbeiter wird sich um alles weitere kümmern.`);

			if (config.tickets.send_img) {
				const images = fs.readdirSync(join(__dirname, '../../user/images'));
				await c.send({
					files: [
						join(__dirname, '../../user/images', images[Math.floor(Math.random() * images.length)])
					]
				});
			}

			let text = config.tickets.text
				.replace(/{{ ?name ?}}/gmi, u.username)
				.replace(/{{ ?(tag|mention) ?}}/gmi, u);


			let w = await c.send(
				new MessageEmbed()
					.setColor(config.colour)
					.setAuthor('Bewerbung von ' + u.username + ' bei EuroElite', u.displayAvatarURL())
					.setDescription(text)
			);


			this.sendQuestionMessage(0, config, c, u, config.tickets.defaultStaff);


			if (config.tickets.pin) await w.pin();
			// await w.pin().then(m => m.delete()); // oopsie, this deletes the pinned message

			if (config.logs.discord.enabled)
				client.channels.cache.get(config.logs.discord.channel).send(
					new MessageEmbed()
						.setColor(config.colour)
						.setAuthor(u.username, u.displayAvatarURL())
						.setTitle('Neue Bewerbung (via panel)')
						.setDescription(`\`${topic}\``)
						.addField('Erstellt von', u, true)
						.addField('Kanal', c, true)
						.setFooter(channel.guild.name, channel.guild.iconURL())
						.setTimestamp()
				);

			log.info(`${u.tag} created a new ticket (#${name}) via panel`);
		}).catch(log.error);
	},

	sendQuestionMessage(iterator, config, channel, user, moderatorRole){
		let self = this;
		let questions = config.tickets.questions;
		//let filter = m => m.content !== "";
		let filter = m => m.author.id === user.id && !m.content.startsWith('-')

		if (!!questions[iterator]){
			channel.send(
				new MessageEmbed()
					.setColor(config.question_color)
					.setDescription(`${questions[iterator].replace('{staff}', '<@&' + config.tickets.roleMapping[moderatorRole] + '>')}`)
					.setFooter(channel.guild.name, channel.guild.iconURL())
					.setTimestamp()
			).then(() => {
				channel.awaitMessages(filter, {
					max: 1,
					time: 1000 * 60 * 60 * 24,
					errors: ['time']
				})
					.then(message => {
						message = message.first();

						let clanMapping = config.tickets.clanMapping;

						for (let role in clanMapping) {
							if (clanMapping.hasOwnProperty(role)) {
								clanMapping[role].forEach((keyword) => {
									if (
										message.content !== "" &&
										message.content.toLowerCase().includes(keyword)
									){

										channel.send(`Aufgrund der Erwähnung von \`${keyword}\` wurde die Zuständigkeit an <@&${config.tickets.roleMapping[role]}> übergeben. Bitte fahre mit der Beantwortung der Fragen fort.`)
										
										moderatorRole = role;
									}
								});
							}
						}

						iterator++; //increase iterator for next message
						self.sendQuestionMessage(iterator, config, channel, user, moderatorRole);
						//message.content.toUpperCase() == 'YES'

					})
					.catch(collected => {
						console.log("error in timeout", collected);

						channel.send('Sorry <@'+user.id+'>, du hast leider etwas zu lange gebraucht. Bitte stell sicher, dass du uns folgende Fragen beantwortet. Ein Mitarbeiter wird sich darum kümmern. Hast du kein Interesse mehr schließe diese Bewerbung via `-close`!\n\n' + questions.join('\n'));
					});
			});
		}

	}
};
