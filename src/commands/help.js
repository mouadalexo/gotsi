'use strict';
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Full guide — how the Night Stars bot works'),

  async execute(interaction) {

    const e1 = new EmbedBuilder()
      .setColor(0x8B0000)
      .setTitle('🌟  Night Stars eFootball Manager')
      .setDescription(
        'Full Discord-based tournament system for **NSEL** and **MCL**.\n' +
        'Everything runs through the **`/manage`** panel — managers just click buttons.\n\n' +
        '**How to run a full season:**\n' +
        '```\n' +
        '1.  /manage → New Season\n' +
        '2.  /manage → Register Teams\n' +
        '3.  /manage → Add Player  (repeat per team)\n' +
        '4.  /manage → Draw Groups\n' +
        '5.  /manage → Generate Matches\n' +
        '6.  /manage → Post Schedule  or  Auto-Schedule\n' +
        '7.  /manage → Add Result  (after each match played)\n' +
        '8.  /manage → Start Knockout  (when all group results are in)\n' +
        '```'
      )
      .setFooter({ text: 'Page 1 / 3  —  Quick Start' });

    const e2 = new EmbedBuilder()
      .setColor(0xAA0000)
      .setTitle('📋  All Slash Commands')
      .addFields(
        {
          name: '`/manage`  🔒 Manager',
          value:
            'All-in-one control panel — **3 rows of buttons:**\n' +
            '> **Row 1:** New Season · Register Teams · Add Player · Close Season\n' +
            '> **Row 2:** Draw Groups · Generate Matches · Post Schedule · Auto-Schedule\n' +
            '> **Row 3:** Add Result · Start Knockout · View Bracket',
          inline: false,
        },
        {
          name: '`/standings`',
          value: 'View live group standings table for any active tournament.',
          inline: true,
        },
        {
          name: '`/seasonlist`',
          value: 'List all seasons (active + past) with stats.',
          inline: true,
        },
        {
          name: '`/groupdraw`  🔒',
          value: 'Manually re-trigger group draw.',
          inline: true,
        },
        {
          name: '`/deadline`  🔒',
          value: 'Set a deadline on a match and get a reminder.',
          inline: true,
        },
        {
          name: '`/help`',
          value: 'Shows this guide (only visible to you).',
          inline: true,
        },
      )
      .setFooter({ text: 'Page 2 / 3  —  Commands' });

    await interaction.reply({ embeds: [e1, e2], ephemeral: true });
  },
};
