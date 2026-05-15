'use strict';
const {
  SlashCommandBuilder, PermissionFlagsBits,
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db }        = require('../utils/database');
const { isManager } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addteam')
    .setDescription('Search and register a team to a tournament with live search')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName('tournament')
        .setDescription('Select the tournament')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt.setName('team')
        .setDescription('Start typing a team name...')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'tournament') {
      const q = focused.value.toLowerCase();
      const results = db.get('tournaments')
        .filter(t => t.registration_open && (q === '' || t.name.toLowerCase().includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 25);
      return interaction.respond(
        results.map(t => ({ name: `${t.name}  —  Season ${t.season}`, value: String(t.id) }))
      );
    }

    if (focused.name === 'team') {
      const tid = parseInt(interaction.options.getString('tournament') || '0');
      const enrolled = isNaN(tid) ? [] :
        db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => tt.team_id);
      const q = focused.value.toLowerCase();
      const results = db.get('teams')
        .filter(t => !enrolled.includes(t.id) && (q === '' || t.name.toLowerCase().includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 25);
      return interaction.respond(
        results.map(t => ({ name: t.name, value: String(t.id) }))
      );
    }
  },

  async execute(interaction) {
    if (!isManager(interaction.member))
      return interaction.reply({ content: '❌ Managers only.', ephemeral: true });

    const tid    = parseInt(interaction.options.getString('tournament'));
    const teamId = parseInt(interaction.options.getString('team'));
    const team   = db.findById('teams', teamId);
    const t      = db.findById('tournaments', tid);

    if (!team || !t)
      return interaction.reply({ content: '❌ Team or tournament not found.', ephemeral: true });

    if (!t.registration_open)
      return interaction.reply({ content: `❌ Registration for **${t.name}** is closed.`, ephemeral: true });

    const already = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === teamId);
    if (!already) {
      db.insert('tournament_teams', {
        tournament_id: tid, team_id: teamId, group_name: null,
        wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0,
      });
    } else {
      return interaction.reply({ content: `⚠️ **${team.name}** is already enrolled in **${t.name}**.`, ephemeral: true });
    }

    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`addteam_player_${tid}_${teamId}`)
        .setTitle(`Assign Player — ${team.name.slice(0, 40)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('discord_id')
              .setLabel('Player Discord ID (leave blank to skip)')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('123456789012345678')
              .setRequired(false)
          )
        )
    );
  },
};
