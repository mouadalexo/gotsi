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
          name: '`/demo`  🔒',
          value: 'Run a full demo with random teams — posts schedule image, 3 result images, and standings image to the correct channels.',
          inline: true,
        },
        {
          name: '`/help`',
          value: 'Shows this guide (only visible to you).',
          inline: true,
        },
      )
      .setFooter({ text: 'Page 2 / 3  —  Commands' });

    const e3 = new EmbedBuilder()
      .setColor(0xCC0000)
      .setTitle('🖼️  Auto-Posted Images & Channels')
      .addFields(
        {
          name: '📅  Schedule Image  →  match-schedule channel',
          value:
            'Posted when manager clicks **Post Schedule** or **Auto-Schedule** fires.\n' +
            'Shows all matches in the round — real team logos, white team names, **VS** centered.\n' +
            'Row height adapts automatically (1 match or 10 matches — always fits).',
          inline: false,
        },
        {
          name: '📊  Result Image  →  results channel',
          value:
            'Posted automatically when manager clicks **Add Result**.\n' +
            'Shows both team logos (no background, pro style), final score in white, winner crown.',
          inline: false,
        },
        {
          name: '🏅  Standings Image  →  results channel',
          value:
            'Posted after every result update.\n' +
            'All groups side by side — W/D/L/GD/PTS, top-2 highlighted green.\n' +
            'Canvas height adapts to number of groups (no empty space).',
          inline: false,
        },
        {
          name: '🏆  Team Logos',
          value: 'Fetched from **API-Football** (primary) then **Wikipedia** (fallback). Cached per team in the database. 39/41 built-in teams covered.',
          inline: false,
        },
        {
          name: '🔒  Manager Permission',
          value: 'Requires **Manage Server**, **Administrator**, or a role named `manager`, `admin`, or `tournament`.',
          inline: false,
        },
        {
          name: '📡  Channels',
          value:
            '**NSEL** and **MCL** each route to their own channels:\n' +
            '• team-list · match-schedule · results',
          inline: false,
        },
      )
      .setFooter({ text: 'Page 3 / 3  —  Night Stars eFootball Manager' });

    await interaction.reply({ embeds: [e1, e2, e3], ephemeral: true });
  },
};
