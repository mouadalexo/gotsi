'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { buildTeamCrudPanel } = require('../panels/teamCrudPanel');

const SEP = { type: 14, divider: true, spacing: 1 };

function buildEditSelectPanel(teams) {
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xFEE75C, components: [
      { type: 10, content: '**✏ Edit Team — Select a team to rename**' },
      SEP,
      { type: 1, components: [{
        type: 3, custom_id: 'tc_edit_sel', placeholder: 'Choose team to edit...',
        options: teams.slice(0, 25).map(t => ({
          label: t.name.slice(0, 100),
          value: String(t.id),
          description: t.category || 'No category',
        })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'tc_refresh_0' }] },
    ]}],
  };
}

function buildDelSelectPanel(teams) {
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xED4245, components: [
      { type: 10, content: '**🗑 Delete Team — Select a team to remove**' },
      SEP,
      { type: 1, components: [{
        type: 3, custom_id: 'tc_del_sel', placeholder: 'Choose team to delete...',
        options: teams.slice(0, 25).map(t => ({
          label: t.name.slice(0, 100),
          value: String(t.id),
          description: `ID: ${t.id}`,
        })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'tc_refresh_0' }] },
    ]}],
  };
}

function buildDelConfirmPanel(teamId, teamName) {
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xED4245, components: [
      { type: 10, content: `**🗑 Delete Team**\nAre you sure you want to delete **${teamName}**?\nThis action cannot be undone.` },
      SEP,
      { type: 1, components: [
        { type: 2, style: 4, label: 'Yes, Delete', custom_id: `tc_del_confirm_${teamId}` },
        { type: 2, style: 2, label: 'Cancel',      custom_id: 'tc_refresh_0' },
      ] },
    ]}],
  };
}

async function handleTeamCrudInteraction(interaction) {
  const id = interaction.customId;

  // ── Add ──────────────────────────────────────────────────────────────────
  if (id === 'tc_add') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('tc_add_modal').setTitle('Add Team')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Team Name')
              .setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('category').setLabel('Category  (e.g. international, morocco, saudi)')
              .setStyle(TextInputStyle.Short).setRequired(false)
          ),
        )
    );
  }

  if (id === 'tc_add_modal') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const cat  = interaction.fields.getTextInputValue('category').trim() || null;
    if (!name) return interaction.reply({ content: '❌ Team name cannot be empty.', ephemeral: true });
    const t = db.insert('teams', { name, category: cat, short_name: name.slice(0, 4).toUpperCase() });
    return interaction.reply({ content: `✅ **${name}** added to master list (ID: ${t.id}).`, ephemeral: true });
  }

  // ── Edit ─────────────────────────────────────────────────────────────────
  if (id === 'tc_edit_start') {
    const teams = db.get('teams').sort((a, b) => a.name.localeCompare(b.name));
    return interaction.update(buildEditSelectPanel(teams));
  }

  if (id === 'tc_edit_sel') {
    const teamId = parseInt(interaction.values[0]);
    const team   = db.findById('teams', teamId);
    if (!team) return interaction.reply({ content: '❌ Team not found.', ephemeral: true });
    return interaction.showModal(
      new ModalBuilder().setCustomId(`tc_edit_modal_${teamId}`).setTitle(`Rename: ${team.name.slice(0, 40)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('New Team Name')
              .setStyle(TextInputStyle.Short).setValue(team.name).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('category').setLabel('Category')
              .setStyle(TextInputStyle.Short).setValue(team.category || '').setRequired(false)
          ),
        )
    );
  }

  if (id.startsWith('tc_edit_modal_')) {
    const teamId = parseInt(id.replace('tc_edit_modal_', ''));
    const name   = interaction.fields.getTextInputValue('name').trim();
    const cat    = interaction.fields.getTextInputValue('category').trim() || null;
    db.update('teams', teamId, { name, category: cat });
    return interaction.reply({ content: `✅ Team renamed to **${name}**.`, ephemeral: true });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  if (id === 'tc_del_start') {
    const teams = db.get('teams').sort((a, b) => a.name.localeCompare(b.name));
    return interaction.update(buildDelSelectPanel(teams));
  }

  if (id === 'tc_del_sel') {
    const teamId = parseInt(interaction.values[0]);
    const team   = db.findById('teams', teamId);
    if (!team) return interaction.reply({ content: '❌ Team not found.', ephemeral: true });
    return interaction.update(buildDelConfirmPanel(teamId, team.name));
  }

  if (id.startsWith('tc_del_confirm_')) {
    const teamId = parseInt(id.replace('tc_del_confirm_', ''));
    const team   = db.findById('teams', teamId);
    const name   = team?.name || 'Unknown';
    db.delete('teams', teamId);
    await interaction.update(buildTeamCrudPanel(0));
    return interaction.followUp({ content: `✅ **${name}** deleted from master list.`, ephemeral: true });
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  if (id.startsWith('tc_refresh_')) {
    const page = parseInt(id.replace('tc_refresh_', '')) || 0;
    return interaction.update(buildTeamCrudPanel(page));
  }
  if (id.startsWith('tc_page_')) {
    const page = parseInt(id.replace('tc_page_', '')) || 0;
    return interaction.update(buildTeamCrudPanel(page));
  }
}

module.exports = { handleTeamCrudInteraction };
