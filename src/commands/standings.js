const { SlashCommandBuilder } = require('discord.js');
const { buildGroupStandingsEmbed, buildKnockoutBracketEmbed } = require('../panels/standingsPanel');
const { buildTournamentSelectMenu } = require('../panels/tournamentPanel');
const { errorEmbed, warningEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('standings')
    .setDescription('View group standings or knockout bracket for a tournament'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    try {
      const menu = buildTournamentSelectMenu('Select a tournament to view standings...');
      if (!menu) {
        return interaction.editReply({ embeds: [warningEmbed('No Tournaments', 'No active tournaments found.')] });
      }
      await interaction.editReply({
        content: 'Select a tournament:',
        components: [menu],
      });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Error', err.message)] });
    }
  },
};
