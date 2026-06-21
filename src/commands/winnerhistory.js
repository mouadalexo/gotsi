'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildWHMain } = require('../panels/whPanel');
const { isManager } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('winnerhistory')
    .setDescription('Manage winner history for each tournament')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!isManager(interaction.member)) {
      return interaction.reply({ content: '\u274c Managers only.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply(buildWHMain());
  },
};
