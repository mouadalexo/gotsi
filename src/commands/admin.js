'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildManagePanelV2 } = require('../panels/managePanel');
const { isManager } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin panel — tournament lifecycle & bot settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!isManager(interaction.member)) {
      return interaction.reply({ content: '❌ Managers only.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: false });
    await interaction.editReply(buildManagePanelV2());
  },
};
