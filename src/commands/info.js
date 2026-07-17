'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { isBotolaManager } = require('../utils/permissions');
const { buildInfoPickerPanel } = require('../panels/infoPanel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Post the tournament info sender panel'),

  async execute(interaction) {
    if (!isBotolaManager(interaction.member)) {
      return interaction.reply({ content: '❌ Managers only.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: false });
    await interaction.editReply(buildInfoPickerPanel());
  },
};
