'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildTournamentListPanel } = require('../panels/tournamentManagerPanel');
const { db } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('managerpanel')
    .setDescription('Post the persistent tournament manager panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const msg = await interaction.editReply(buildTournamentListPanel());
    db.setConfig('managerpanel_ref', { channelId: interaction.channelId, messageId: msg.id });
  },
};
