'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildAdminPanel } = require('../panels/fedRosterPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clans_fed_database')
    .setDescription('Federation roster database — manage all clan registrations (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply(buildAdminPanel());
  },
};
