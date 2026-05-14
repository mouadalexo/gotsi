'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildManagePanelEmbed, buildManagePanelRows } = require('../panels/managePanel');
const { errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('manage')
    .setDescription('Post the all-in-one tournament management panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName('template')
        .setDescription('Tournament template to manage (default: all)')
        .setRequired(false)
        .addChoices(
          { name: 'NSEL', value: 'NSEL' },
          { name: 'MCL',  value: 'MCL'  },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const template = interaction.options.getString('template') || null;
      await interaction.channel.send({
        embeds: [buildManagePanelEmbed(template)],
        components: buildManagePanelRows(template),
      });
      await interaction.editReply({ content: '✅ Manager panel posted.' });
    } catch (err) {
      await interaction.editReply({ embeds: [errorEmbed('Error', err.message)] });
    }
  },
};
