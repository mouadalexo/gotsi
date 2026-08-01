'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildAdminPanel } = require('../federation/fedRosterPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clan_database')
    .setDescription('Federation roster database — manage all clan registrations (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '🚫 This command is restricted to server administrators only.', flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });
    await interaction.editReply(buildAdminPanel());
  },
};
