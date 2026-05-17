'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { fuzzyTeamSearch } = require('../utils/fuzzyTeam');
const { set: tmpSet, get: tmpGet } = require('../utils/tempState');
const { buildTeamCrudPanel } = require('../panels/teamCrudPanel');
const { buildEnrollStep1 } = require('../panels/enrollPanel');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const E_CUP = '<a:cup:1501741159557500971>';

function buildDelFuzzyPanel(typedText, matches) {
  const options = matches.map(t => ({
    label: t.name.slice(0, 100),
    description: 'From master list',
    value: String(t.id),
  }));
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xED4245, components: [
      txt('**' + E_CUP + '  Delete Team — best matches for "' + typedText + '"**\n> Select the team you want to delete.'),
      SEP,
      { type: 1, components: [{
        type: 3, custom_id: 'tc_del_fuzzy_sel',
        placeholder: 'Select team to delete...',
        options,
      }]},
      SEP,
      { type: 1, components: [
        { type: 2, style: 2, label: '\ud83d\udd01  Search Again', custom_id: 'tc_del_start' },
        { type: 2, style: 2, label: 'Back', custom_id: 'tc_refresh' },
      ]},
    ]}],
  };
}

function buildDelConfirmPanel(teamId, teamName) {
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xED4245, components: [
      txt('**' + E_CUP + '  Delete Team**\nAre you sure you want to delete **' + teamName + '**?\nThis cannot be undone.'),
      SEP,
      { type: 1, components: [
        { type: 2, style: 4, label: 'Yes, Delete', custom_id: 'tc_del_confirm_' + teamId },
        { type: 2, style: 2, label: 'Cancel',      custom_id: 'tc_refresh' },
      ]},
    ]}],
  };
}

async function handleTeamCrudInteraction(interaction) {
  const id = interaction.customId;

  // ── Add ───────────────────────────────────────────────────────────────────
  if (id === 'tc_add') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('tc_add_modal').setTitle('Add Team')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Team Name')
              .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Real Madrid').setRequired(true)
          ),
        )
    );
  }

  if (id === 'tc_add_modal') {
    const name = interaction.fields.getTextInputValue('name').trim();
    if (!name) return interaction.reply({ content: '\u274c Team name cannot be empty.', ephemeral: true });
    const exists = db.get('teams').find(t => t.name.toLowerCase() === name.toLowerCase());
    if (exists) return interaction.reply({ content: '\u274c **' + name + '** already exists.', ephemeral: true });
    db.insert('teams', { name });
    await interaction.update(buildTeamCrudPanel());
    return interaction.followUp({ content: '\u2705 **' + name + '** added to the list.', ephemeral: true });
  }

  // ── Enroll ────────────────────────────────────────────────────────────────
  if (id === 'tc_enroll') {
    return interaction.update(buildEnrollStep1());
  }

  // ── Search ────────────────────────────────────────────────────────────────
  if (id === 'tc_search') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('tc_search_modal').setTitle('Search Teams')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('query').setLabel('Team name (partial match)')
              .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Real').setRequired(true).setMinLength(1)
          )
        )
    );
  }

  if (id === 'tc_search_modal') {
    const query = interaction.fields.getTextInputValue('query').trim();
    const allTeams = db.get('teams').sort((a, b) => a.name.localeCompare(b.name));
    const teams = fuzzyTeamSearch(query, allTeams, 25);
    if (!teams.length) {
      return interaction.reply({ content: '\ud83d\udd0d No teams found matching **"' + query + '"**.', ephemeral: true });
    }
    const lines = teams.map((t, i) => '\`' + String(i + 1).padStart(2, ' ') + '.\`  **' + t.name + '**');
    return interaction.reply({
      content: '\ud83d\udd0d **' + teams.length + '** team' + (teams.length !== 1 ? 's' : '') + ' matching **"' + query + '"**:\n' + lines.join('\n'),
      ephemeral: true,
    });
  }

  // ── Delete — open type-name modal ─────────────────────────────────────────
  if (id === 'tc_del_start') {
    const teams = db.get('teams');
    if (!teams.length) return interaction.reply({ content: '\u274c No teams to delete.', ephemeral: true });
    return interaction.showModal(
      new ModalBuilder().setCustomId('tc_del_fuzzy_modal').setTitle('Delete Team — Type Name')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('team_name').setLabel('Type the team name to search')
              .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Real Madrid').setRequired(true).setMinLength(2)
          )
        )
    );
  }

  // ── Delete — fuzzy search modal submitted ─────────────────────────────────
  if (id === 'tc_del_fuzzy_modal') {
    const typedText = interaction.fields.getTextInputValue('team_name').trim();
    const allTeams  = db.get('teams').sort((a, b) => a.name.localeCompare(b.name));
    const matches   = fuzzyTeamSearch(typedText, allTeams, 10);
    tmpSet('tc_del_typed_' + interaction.user.id, typedText);
    if (!matches.length) {
      return interaction.reply({ content: '\ud83d\udd0d No teams found matching **"' + typedText + '"**.', ephemeral: true });
    }
    return interaction.update(buildDelFuzzyPanel(typedText, matches));
  }

  // ── Delete — team selected from fuzzy results ─────────────────────────────
  if (id === 'tc_del_fuzzy_sel') {
    const teamId = parseInt(interaction.values[0]);
    const team   = db.findById('teams', teamId);
    if (!team) return interaction.reply({ content: '\u274c Team not found.', ephemeral: true });
    return interaction.update(buildDelConfirmPanel(teamId, team.name));
  }

  // ── Delete confirmed ──────────────────────────────────────────────────────
  if (id.startsWith('tc_del_confirm_')) {
    const teamId = parseInt(id.replace('tc_del_confirm_', ''));
    const team   = db.findById('teams', teamId);
    const name   = team?.name || 'Unknown';
    db.delete('teams', teamId);
    await interaction.update(buildTeamCrudPanel());
    return interaction.followUp({ content: '\u2705 **' + name + '** removed from the list.', ephemeral: true });
  }

  // ── Refresh ───────────────────────────────────────────────────────────────
  if (id === 'tc_refresh' || id.startsWith('tc_refresh_') || id.startsWith('tc_page_')) {
    return interaction.update(buildTeamCrudPanel());
  }
}

module.exports = { handleTeamCrudInteraction };
