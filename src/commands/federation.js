'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { buildFederationPanel } = require('../panels/federationPanel');
const { isBotolaManager } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('federation')
    .setDescription('Federation of Clans — management panel'),

  async execute(interaction) {
    if (!isBotolaManager(interaction.member)) {
      return interaction.reply({ content: '❌ Managers only.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply(buildFederationPanel());
  },
};
