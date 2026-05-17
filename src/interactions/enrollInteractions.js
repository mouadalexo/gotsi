'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { fuzzyTeamSearch } = require('../utils/fuzzyTeam');
const { set: tmpSet, get: tmpGet, del: tmpDel } = require('../utils/tempState');
const {
  buildEnrollStep1, buildEnrollStep2, buildEnrollFuzzyResults, buildEnrollStep3,
} = require('../panels/enrollPanel');
const { buildTeamCrudPanel } = require('../panels/teamCrudPanel');

function enrollTeam(tid, teamId) {
  const existing = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === teamId);
  if (existing) return false;
  db.insert('tournament_teams', {
    tournament_id: tid, team_id: teamId, group_name: null,
    wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0,
  });
  return true;
}

async function handleEnrollInteraction(interaction, client) {
  const id = interaction.customId;

  // ── Back navigation ───────────────────────────────────────────────────────
  if (id === 'enr_back_step1') {
    return interaction.update(buildEnrollStep1());
  }
  if (id.startsWith('enr_back_step2_')) {
    const tid = parseInt(id.replace('enr_back_step2_', ''));
    return interaction.update(buildEnrollStep2(tid));
  }

  // ── Step 1: tournament selected ───────────────────────────────────────────
  if (id === 'enr_tmt_sel') {
    const tid = parseInt(interaction.values[0]);
    return interaction.update(buildEnrollStep2(tid));
  }

  // ── Step 2: open modal to type team name ──────────────────────────────────
  if (id.startsWith('enr_team_type_')) {
    const tid = parseInt(id.replace('enr_team_type_', ''));
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('enr_team_fuzzy_modal_' + tid)
        .setTitle('Search Team')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('team_name')
              .setLabel('Type team name')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. Real Madrid, Raja, Bayern...')
              .setRequired(true)
              .setMinLength(2)
          )
        )
    );
  }

  // ── Step 2: modal submitted → fuzzy search → show select ─────────────────
  if (id.startsWith('enr_team_fuzzy_modal_')) {
    const tid = parseInt(id.replace('enr_team_fuzzy_modal_', ''));
    const typedText = interaction.fields.getTextInputValue('team_name').trim();

    const t = db.findById('tournaments', tid);
    if (!t) return interaction.reply({ content: '\u274c Tournament not found.', ephemeral: true });

    const enrolledIds = db.get('tournament_teams')
      .filter(tt => tt.tournament_id === tid)
      .map(tt => tt.team_id);
    const availableTeams = db.get('teams').filter(t => !enrolledIds.includes(t.id));

    const matches = fuzzyTeamSearch(typedText, availableTeams, 5);

    tmpSet('enr_typed_' + interaction.user.id + '_' + tid, typedText);

    if (!matches.length && availableTeams.length === 0) {
      return interaction.reply({ content: '\u26a0\ufe0f All teams are already enrolled in this tournament.', ephemeral: true });
    }

    return interaction.update(buildEnrollFuzzyResults(tid, typedText, matches));
  }

  // ── Step 2: fuzzy result selected ────────────────────────────────────────
  if (id.startsWith('enr_team_fuzzy_sel_')) {
    const tid    = parseInt(id.replace('enr_team_fuzzy_sel_', ''));
    const val    = interaction.values[0];
    const t      = db.findById('tournaments', tid);
    if (!t) return interaction.reply({ content: '\u274c Tournament not found.', ephemeral: true });

    let team;
    if (val === '_custom') {
      const typedText = tmpGet('enr_typed_' + interaction.user.id + '_' + tid) || 'Unknown';
      tmpDel('enr_typed_' + interaction.user.id + '_' + tid);
      const exists = db.get('teams').find(t => t.name.toLowerCase() === typedText.toLowerCase());
      if (exists) {
        team = exists;
      } else {
        team = db.insert('teams', { name: typedText, temporary: true, season_id: tid });
      }
    } else {
      team = db.findById('teams', parseInt(val));
    }

    if (!team) return interaction.reply({ content: '\u274c Team not found.', ephemeral: true });

    const ok = enrollTeam(tid, team.id);
    if (!ok) return interaction.reply({ content: '\u26a0\ufe0f **' + team.name + '** is already enrolled in **' + t.name + '**.', ephemeral: true });

    return interaction.update(buildEnrollStep3(tid, team.id));
  }

  // ── Step 3a: Player picked via Discord User Select ────────────────────────
  if (id.startsWith('enr_player_sel_')) {
    const rest   = id.replace('enr_player_sel_', '');
    const parts  = rest.split('_');
    const tid    = parseInt(parts[0]);
    const teamId = parseInt(parts[1]);
    const slot   = parts[2] !== undefined ? parseInt(parts[2]) : 0;
    const userId = interaction.values[0];
    const team   = db.findById('teams', teamId);
    const t      = db.findById('tournaments', tid);
    if (userId) {
      // Remove any existing player in this slot for the team
      const slotPlayers = db.get('players').filter(p => p.team_id === teamId && p.tournament_id === tid);
      if (slotPlayers[slot]) db.delete('players', slotPlayers[slot].id);
      db.insert('players', { discord_id: userId, team_id: teamId, tournament_id: tid, slot });
    }
    if (t && t.panel2_ref) {
      try {
        const { buildPanel2 } = require('../panels/panel2');
        const ch  = await client.channels.fetch(t.panel2_ref.channelId);
        const msg = await ch.messages.fetch(t.panel2_ref.messageId);
        await msg.edit(buildPanel2(t));
      } catch {}
    }
    return interaction.update(buildTeamCrudPanel());
  }

  // ── Step 3: Edit Team name ────────────────────────────────────────────────
  if (id.startsWith('enr_edit_team_')) {
    const rest   = id.replace('enr_edit_team_', '');
    const sep    = rest.indexOf('_');
    const tid    = parseInt(rest.slice(0, sep));
    const teamId = parseInt(rest.slice(sep + 1));
    const team   = db.findById('teams', teamId);
    if (!team) return interaction.reply({ content: '\u274c Team not found.', ephemeral: true });
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('enr_edit_team_modal_' + tid + '_' + teamId)
        .setTitle('Edit Team Name')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('team_name')
              .setLabel('New team name')
              .setStyle(TextInputStyle.Short)
              .setValue(team.name)
              .setRequired(true)
          )
        )
    );
  }

  if (id.startsWith('enr_edit_team_modal_')) {
    const rest   = id.replace('enr_edit_team_modal_', '');
    const sep    = rest.indexOf('_');
    const tid    = parseInt(rest.slice(0, sep));
    const teamId = parseInt(rest.slice(sep + 1));
    const newName = interaction.fields.getTextInputValue('team_name').trim();
    if (!newName) return interaction.reply({ content: '\u274c Name cannot be empty.', ephemeral: true });
    db.update('teams', teamId, { name: newName });
    return interaction.update(buildEnrollStep3(tid, teamId));
  }

  // ── Step 3: Remove Team (unenroll) ────────────────────────────────────────
  if (id.startsWith('enr_remove_team_')) {
    const rest   = id.replace('enr_remove_team_', '');
    const sep    = rest.indexOf('_');
    const tid    = parseInt(rest.slice(0, sep));
    const teamId = parseInt(rest.slice(sep + 1));
    const team   = db.findById('teams', teamId);
    const t      = db.findById('tournaments', tid);
    db.deleteWhere('tournament_teams', r => r.tournament_id === tid && r.team_id === teamId);
    if (team && team.temporary) db.delete('teams', teamId);
    return interaction.update(buildEnrollStep2(tid));
  }
}

module.exports = { handleEnrollInteraction };
