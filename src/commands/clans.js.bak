'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildClanCrudPanel } = require('../panels/clanCrudPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clans')
    .setDescription('Manage the master clan database (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply(buildClanCrudPanel());
  },
};
