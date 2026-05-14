'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildAdminPanel } = require('../panels/adminPanel');
const { db } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminpanel')
    .setDescription('Post the admin setup panel (channels, bot configuration)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const msg = await interaction.editReply(buildAdminPanel());
    db.setConfig('adminpanel_ref', { channelId: interaction.channelId, messageId: msg.id });
  },
};
