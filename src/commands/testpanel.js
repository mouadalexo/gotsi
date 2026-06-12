'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { executeTestpanel } = require('../interactions/testInteractions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testpanel')
    .setDescription('Post all bot posts with random teams — live preview in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await executeTestpanel(interaction);
  },
};
