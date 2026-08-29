'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../utils/database');

const dashboardComponents = [{
  type: 1,
  components: [{
    type: 2,
    style: 1,
    label: '🗂️  Open My Clan',
    custom_id: 'fr_open_dashboard',
  }],
}];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('button_clan_dashboard')
    .setDescription('Post the permanent clan dashboard button')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '🚫 This command is restricted to server administrators only.', flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });
    const channel = interaction.channel;
    const oldChannelId = db.getConfig('clan_dashboard_channel_id') || null;
    const oldMessageId = db.getConfig('clan_dashboard_message_id') || null;
    let panelMessage = null;

    // Reuse the configured panel when the command is run in the same channel.
    if (oldChannelId === channel.id && oldMessageId) {
      panelMessage = await channel.messages.fetch(oldMessageId).catch(() => null);
      if (panelMessage) await panelMessage.edit({ content: '', components: dashboardComponents }).catch(() => { panelMessage = null; });
    }

    // If the panel moved or was deleted, remove the old copy and post one new copy.
    if (!panelMessage) {
      if (oldChannelId && oldMessageId) {
        const oldChannel = await interaction.client.channels.fetch(oldChannelId).catch(() => null);
        if (oldChannel?.isTextBased?.()) {
          const oldMessage = await oldChannel.messages.fetch(oldMessageId).catch(() => null);
          if (oldMessage) await oldMessage.delete().catch(() => {});
        }
      }
      panelMessage = await channel.send({ content: '', components: dashboardComponents });
    }

    db.setConfig('clan_dashboard_channel_id', channel.id);
    db.setConfig('clan_dashboard_message_id', panelMessage.id);
    await interaction.deleteReply().catch(() => {});
  },
};
