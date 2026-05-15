'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { buildTeamCrudPanel } = require('../panels/teamCrudPanel');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const E_CUP = '<a:cup:1501741159557500971>';

function buildDelSelectPanel(teams) {
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xED4245, components: [
      txt(`**${E_CUP}  Delete Team — select a team to remove**`),
      SEP,
      { type: 1, components: [{
        type: 3, custom_id: 'tc_del_sel', placeholder: 'Choose team to delete...',
        options: teams.slice(0, 25).map(t => ({
          label: t.name.slice(0, 100),
          value: String(t.id),
        })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'tc_refresh' }] },
    ]}],
  };
}

function buildDelConfirmPanel(teamId, teamName) {
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xED4245, components: [
      txt(`**${E_CUP}  Delete Team**\nAre you sure you want to delete **${teamName}**?\nThis cannot be undone.`),
      SEP,
      { type: 1, components: [
        { type: 2, style: 4, label: 'Yes, Delete', custom_id: `tc_del_confirm_${teamId}` },
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
    if (exists) return interaction.reply({ content: `\u274c **${name}** already exists.`, ephemeral: true });
    db.insert('teams', { name });
    await interaction.update(buildTeamCrudPanel());
    return interaction.followUp({ content: `\u2705 **${name}** added to the list.`, ephemeral: true });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  if (id === 'tc_del_start') {
    const teams = db.get('teams').sort((a, b) => a.name.localeCompare(b.name));
    if (!teams.length) return interaction.reply({ content: '\u274c No teams to delete.', ephemeral: true });
    return interaction.update(buildDelSelectPanel(teams));
  }

  if (id === 'tc_del_sel') {
    const teamId = parseInt(interaction.values[0]);
    const team   = db.findById('teams', teamId);
    if (!team) return interaction.reply({ content: '\u274c Team not found.', ephemeral: true });
    return interaction.update(buildDelConfirmPanel(teamId, team.name));
  }

  if (id.startsWith('tc_del_confirm_')) {
    const teamId = parseInt(id.replace('tc_del_confirm_', ''));
    const team   = db.findById('teams', teamId);
    const name   = team?.name || 'Unknown';
    db.delete('teams', teamId);
    await interaction.update(buildTeamCrudPanel());
    return interaction.followUp({ content: `\u2705 **${name}** removed from the list.`, ephemeral: true });
  }

  // ── Refresh ───────────────────────────────────────────────────────────────
  if (id === 'tc_refresh') {
    return interaction.update(buildTeamCrudPanel());
  }

  // legacy page/refresh ids
  if (id.startsWith('tc_refresh_') || id.startsWith('tc_page_')) {
    return interaction.update(buildTeamCrudPanel());
  }
}

module.exports = { handleTeamCrudInteraction };
