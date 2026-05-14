'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildTeamCrudPanel } = require('../panels/teamCrudPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Manage the master teams list (admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    await interaction.editReply(buildTeamCrudPanel());
  },
};
