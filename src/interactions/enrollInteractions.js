'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { fuzzyTeamSearch } = require('../utils/fuzzyTeam');
const { set: tmpSet, get: tmpGet, del: tmpDel } = require('../utils/tempState');
const {
  buildEnrollStep1, buildEnrollStep2, buildEnrollFuzzyResults, buildEnrollStep3,
} = require('../panels/enrollPanel');

// ── Update all live list panels on any enroll/remove/player change ────────────
// Uses config-level refs (one permanent message per template, across all seasons).
// If admin reposts, the new message ref overwrites the old one — bot always
// follows the latest ref stored in config.
async function updateLivePanels(client, tid) {
  const t = db.findById('tournaments', tid);
  if (!t) return;

  // Admin management panel (panel2_ref — still stored per tournament)
  if (t.panel2_ref) {
    try {
      const { buildPanel2 } = require('../panels/panel2');
      const ch  = await client.channels.fetch(t.panel2_ref.channelId);
      const msg = await ch.messages.fetch(t.panel2_ref.messageId);
      await msg.edit(buildPanel2(t));
    } catch {}
  }

  // Permanent public team list (stored globally in config per template)
  if (t.template) {
    const ref = db.getConfig('teams_list_ref_' + t.template);
    if (ref) {
      try {
        const { buildTeamsListEmbed } = require('../panels/teamListPanel');
        const ch  = await client.channels.fetch(ref.channelId);
        const msg = await ch.messages.fetch(ref.messageId);
        await msg.edit(buildTeamsListEmbed(tid));
      } catch {}
    }
  }
}

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

  // ── Step 2: modal submitted → fuzzy search ────────────────────────────────
  if (id.startsWith('enr_team_fuzzy_modal_')) {
    const tid = parseInt(id.replace('enr_team_fuzzy_modal_', ''));
    const typedText = interaction.fields.getTextInputValue('team_name').trim();

    const t = db.findById('tournaments', tid);
    if (!t) return interaction.update(buildEnrollStep1({ error: 'Tournament not found.' }));

    const enrolledIds = db.get('tournament_teams')
      .filter(tt => tt.tournament_id === tid)
      .map(tt => tt.team_id);
    const availableTeams = db.get('teams').filter(tm => !enrolledIds.includes(tm.id));

    if (availableTeams.length === 0) {
      return interaction.update(buildEnrollStep2(tid, { error: 'All teams are already enrolled in this tournament.' }));
    }

    const matches = fuzzyTeamSearch(typedText, availableTeams, 5);
    tmpSet('enr_typed_' + interaction.user.id + '_' + tid, typedText);

    return interaction.update(buildEnrollFuzzyResults(tid, typedText, matches));
  }

  // ── Step 2: fuzzy result selected ────────────────────────────────────────
  if (id.startsWith('enr_team_fuzzy_sel_')) {
    const tid = parseInt(id.replace('enr_team_fuzzy_sel_', ''));
    const val = interaction.values[0];
    const t   = db.findById('tournaments', tid);
    if (!t) return interaction.update(buildEnrollStep1({ error: 'Tournament not found.' }));

    let team;
    if (val === '_custom') {
      const typedText = tmpGet('enr_typed_' + interaction.user.id + '_' + tid) || 'Unknown';
      tmpDel('enr_typed_' + interaction.user.id + '_' + tid);
      const exists = db.get('teams').find(tm => tm.name.toLowerCase() === typedText.toLowerCase());
      team = exists || db.insert('teams', { name: typedText, temporary: true, season_id: tid });
    } else {
      team = db.findById('teams', parseInt(val));
    }

    if (!team) return interaction.update(buildEnrollStep2(tid, { error: 'Team not found.' }));

    const ok = enrollTeam(tid, team.id);
    if (!ok) {
      return interaction.update(buildEnrollStep2(tid, {
        error: '**' + team.name + '** is already enrolled in **' + t.name + '**.',
      }));
    }

    updateLivePanels(client, tid).catch(() => {});
    return interaction.update(buildEnrollStep3(tid, team.id));
  }

  // ── Step 3: Player picked via Discord User Select ─────────────────────────
  if (id.startsWith('enr_player_sel_')) {
    const rest   = id.replace('enr_player_sel_', '');
    const parts  = rest.split('_');
    const tid    = parseInt(parts[0]);
    const teamId = parseInt(parts[1]);
    const slot   = parts[2] !== undefined ? parseInt(parts[2]) : 0;
    const userId = interaction.values[0];

    if (userId) {
      // Find by slot field — not array index (prevents user mismatch bug)
      const existingForSlot = db.get('players').find(
        p => p.team_id === teamId && p.tournament_id === tid && p.slot === slot
      );
      if (existingForSlot) db.delete('players', existingForSlot.id);
      db.insert('players', { discord_id: userId, team_id: teamId, tournament_id: tid, slot });
    }

    updateLivePanels(client, tid).catch(() => {});
    // Stay on Step 3 so admin can assign both players (critical for MCL duo teams)
    return interaction.update(buildEnrollStep3(tid, teamId));
  }

  // ── Step 3: Remove Team (unenroll) ────────────────────────────────────────
  if (id.startsWith('enr_remove_team_')) {
    const rest   = id.replace('enr_remove_team_', '');
    const sep    = rest.indexOf('_');
    const tid    = parseInt(rest.slice(0, sep));
    const teamId = parseInt(rest.slice(sep + 1));
    const team   = db.findById('teams', teamId);

    db.deleteWhere('tournament_teams', r => r.tournament_id === tid && r.team_id === teamId);
    db.deleteWhere('players', p => p.team_id === teamId && p.tournament_id === tid);
    if (team && team.temporary) db.delete('teams', teamId);

    updateLivePanels(client, tid).catch(() => {});
    return interaction.update(buildEnrollStep2(tid));
  }
}

module.exports = { handleEnrollInteraction };
