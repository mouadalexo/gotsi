'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testpanel')
    .setDescription('Post the test panel to quickly preview all bot panels with random data')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const panel = {
      flags: 32768,
      components: [{
        type: 17,
        accent_color: 0x2b2d31,
        components: [
          txt('# 🧪  Test Panel\nClick a button to preview the panel with random test data.'),
          SEP,
          {
            type: 1,
            components: [
              { type: 2, style: 1, label: 'Teams List',     custom_id: 'test_teams_list',  emoji: { name: '👥' } },
              { type: 2, style: 1, label: 'Standings',      custom_id: 'test_standings',   emoji: { name: '📊' } },
              { type: 2, style: 1, label: 'Match Schedule', custom_id: 'test_schedule',    emoji: { name: '📅' } },
            ],
          },
          {
            type: 1,
            components: [
              { type: 2, style: 1, label: 'Results',    custom_id: 'test_results',    emoji: { name: '⚽' } },
              { type: 2, style: 2, label: 'Group Draw', custom_id: 'test_groupdraw',  emoji: { name: '🎲' } },
            ],
          },
          SEP,
          txt('-# Night Stars • Test Mode — data is randomly generated'),
        ],
      }],
    };

    await interaction.editReply(panel);
  },
};
