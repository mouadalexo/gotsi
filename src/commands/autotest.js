'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { requireAdmin }    = require('../utils/permissions');
const { db }              = require('../utils/database');
const { buildSettingsPanel } = require('../interactions/autotestInteractions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('test')
    .setDescription('[ADMIN] Post the AutoTest control panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!requireAdmin(interaction.member)) {
      return interaction.reply({ content: '❌ Administrator only.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    // Delete previous panel if stored
    const oldRef = db.getConfig('autotest_panel_ref');
    if (oldRef) {
      try {
        const ch  = interaction.guild.channels.cache.get(oldRef.channelId)
          || await interaction.guild.channels.fetch(oldRef.channelId).catch(() => null);
        if (ch) {
          const msg = await ch.messages.fetch(oldRef.messageId).catch(() => null);
          if (msg) await msg.delete();
        }
      } catch {}
    }

    // Post new permanent panel
    const panel = buildSettingsPanel(interaction.guildId);
    const msg   = await interaction.channel.send(panel);

    db.setConfig('autotest_panel_ref', {
      channelId: interaction.channelId,
      messageId: msg.id,
    });

    return interaction.editReply({
      content: '✅ AutoTest panel posted — it lives there permanently. Just click the buttons whenever you want to test.',
    });
  },
};
