'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { buildLeaderDashboard, getRosterForMember } = require('../federation/fedRosterPanel');
const { closePreviousClanPanel, rememberClanPanel } = require('../federation/fedRosterInteractions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clan')
    .setDescription('Open your private clan management dashboard')
    .setDMPermission(false),

  async execute(interaction) {
    const roster = getRosterForMember(interaction.user.id);
    if (!roster) {
      return interaction.reply({
        content: '❌ You are not assigned as a clan leader or co-leader.',
        flags: 64,
      });
    }
    await closePreviousClanPanel(interaction.user.id);
    await interaction.reply(buildLeaderDashboard(roster.leader_discord_id));
    rememberClanPanel(interaction.user.id, interaction);
  },
};
