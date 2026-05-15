'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildTestMenuPayload } = require('../interactions/testInteractions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testpanel')
    .setDescription('Preview all bot panels with random data (updates in place)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.reply(buildTestMenuPayload());
  },
};
