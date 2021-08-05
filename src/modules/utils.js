/**
 *
 *  @name DiscordTickets
 *  @author eartharoid <contact@eartharoid.me>
 *  @license GNU-GPLv3
 *
 */


module.exports = {
	/**
	 * @description Appends 's' to a word if plural number
	 * @param {string} word - singular version of word
	 * @param {number} num - integer
	 */
	plural(word, num) {
		return num !== 1 ? word + 's' : word;
	},

	checkTopic(message, config, ticket) {
		let clanMapping = config.tickets.clanMapping;
		let moderatorRole = "";

		for (let role in clanMapping) {
			if (clanMapping.hasOwnProperty(role)) {
				clanMapping[role].forEach((keyword) => {
					if (
						!!message &&
						message.content !== "" &&
						message.content.toLowerCase().includes(keyword) &&
						role !== moderatorRole
					){

						let channel = message.channel;
						channel.setName(keyword+ "-bewerbung-" + ticket.id);
						channel.send(`Die Zuständigkeit wurde aufgrund der Erwähnung von \`${keyword}\` an <@&${config.tickets.roleMapping[role]}> übergeben.`)


						moderatorRole = role;

						return {
							moderatorRole: moderatorRole,
							message: `Aufgrund der Erwähnung von \`${keyword}\` wurde die Zuständigkeit an <@&${config.tickets.roleMapping[role]}> übergeben.`
						}

					}
				});
			}
		}
	}
};
