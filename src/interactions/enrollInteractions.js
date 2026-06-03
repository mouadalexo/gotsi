'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { fuzzyTeamSearch } = require('../utils/fuzzyTeam');
const { set: tmpSet, get: tmpGet, del: tmpDel } = require('../utils/tempState');
const {
  buildEnrollStep1, buildEnrollStep2, buildEnrollFuzzyResults, buildEnrollStep3,
} = require('../panels/enrollPanel');

async function updateLivePanels(client, tid) {
  const t = db.findById('tournaments', tid);
  if (!t) return;
  if (t.panel2_ref) {
    try {
      const { buildPanel2 } = require('../panels/panel2');
      const ch  = await client.channels.fetch(t.panel2_ref.channelId);
      const msg = await ch.messages.fetch(t.panel2_ref.messageId);
      await msg.edit(buildPanel2(t));
    } catch (e) { console.warn("[teamList/panel2]", e.message); }
  }
  if (t.template) {
    const ref = db.getConfig('teams_list_ref_' + t.template);
    if (ref) {
      try {
        const { buildTeamsListEmbed } = require('../panels/teamListPanel');
        const ch  = await client.channels.fetch(ref.channelId);
        const msg = await ch.messages.fetch(ref.messageId);
        await msg.edit(buildTeamsListEmbed(tid));
      } catch (e) { console.warn("[teamList/ref]", e.message); }
    }
  }
}


async function applyRegistrationRole(client, guildId, playerIds, tournamentId, add = true) {
  const t = require("../utils/database").db.findById("tournaments", tournamentId);
  const roleId = t && t.registration_role_id;
  if (!roleId) return;
  try {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    for (const uid of playerIds) {
      const member = await guild.members.fetch(uid).catch(() => null);
      if (!member) continue;
      if (add) await member.roles.add(roleId).catch(() => {});
      else await member.roles.remove(roleId).catch(() => {});
    }
  } catch {}
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
    // Clean up any draft for this admin
    const draftKeys = Object.keys(require('../utils/tempState')._store || {});
    tmpDel('enr_draft_' + interaction.user.id + '_' + tid);
    return interaction.update(buildEnrollStep2(tid));
  }

  // ── Step 1: tournament selected ───────────────────────────────────────────
  if (id === 'enr_tmt_sel') {
    const tid = parseInt(interaction.values[0]);
    return interaction.update(buildEnrollStep2(tid));
  }

  // ── Step 2: direct team selection from dropdown ─────────────────────────────
  if (id.startsWith('enr_team_direct_sel_')) {
    const tid = parseInt(id.replace('enr_team_direct_sel_', ''));
    const teamId = parseInt(interaction.values[0]);
    const t = db.findById('tournaments', tid);
    const team = db.findById('teams', teamId);
    if (!t || !team) return interaction.update(buildEnrollStep2(tid, { error: 'Team not found.' }));

    const alreadyEnrolled = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === team.id);
    if (alreadyEnrolled) {
      return interaction.update(buildEnrollStep2(tid, {
        error: '**' + team.name + '** is already enrolled in **' + t.name + '**.',
      }));
    }

    // Cap check: block if tournament is full
    const enrolledCount = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).length;
    if (t.team_count && enrolledCount >= t.team_count) {
      return interaction.update(buildEnrollStep2(tid, { error: 'This tournament is full — **' + enrolledCount + '/' + t.team_count + '** spots taken.' }));
    }

    const requiredPlayers = t.players_per_team || 1;
    tmpSet('enr_draft_' + interaction.user.id + '_' + tid, { teamId: team.id, players: {}, required: requiredPlayers }, 600_000);
    return interaction.update(buildEnrollStep3(tid, team.id, { isDraft: true, draftPlayers: {}, required: requiredPlayers }));
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
              .setPlaceholder('Type team name to search...')
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

  // ── Step 2: fuzzy result selected → ALWAYS start draft ───────────────────
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

    // Never enroll team here — always go to draft mode first
    const alreadyEnrolled = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === team.id);
    if (alreadyEnrolled) {
      return interaction.update(buildEnrollStep2(tid, {
        error: '**' + team.name + '** is already enrolled in **' + t.name + '**.',
      }));
    }

    // Cap check: block if tournament is full
    const enrolledCountF = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).length;
    if (t.team_count && enrolledCountF >= t.team_count) {
      return interaction.update(buildEnrollStep2(tid, { error: 'This tournament is full — **' + enrolledCountF + '/' + t.team_count + '** spots taken.' }));
    }

    const requiredPlayers = t.players_per_team || 1;
    tmpSet('enr_draft_' + interaction.user.id + '_' + tid, { teamId: team.id, players: {}, required: requiredPlayers }, 600_000);
    return interaction.update(buildEnrollStep3(tid, team.id, { isDraft: true, draftPlayers: {}, required: requiredPlayers }));
  }

  // ── Step 3: Player picked via Discord User Select ─────────────────────────
  if (id.startsWith('enr_player_sel_')) {
    const rest   = id.replace('enr_player_sel_', '');
    const parts  = rest.split('_');
    const tid    = parseInt(parts[0]);
    const teamId = parseInt(parts[1]);
    const slot   = parts[2] !== undefined ? parseInt(parts[2]) : 0;
    const userId = interaction.values[0];

    const t = db.findById('tournaments', tid);
    const requiredPlayers = t?.players_per_team || 1;

    const draftKey = 'enr_draft_' + interaction.user.id + '_' + tid;
    const draft = tmpGet(draftKey);

    if (draft && draft.teamId === teamId) {
      // Draft mode: save player to temp state (never touch DB yet)
      if (userId) draft.players[slot] = userId;
      else delete draft.players[slot];
      tmpSet(draftKey, draft, 600_000);

      // Count how many slots are filled
      const filledCount = Object.keys(draft.players).filter(k => draft.players[k]).length;

      // If minimum players are now assigned → finalize and create the team
      if (filledCount >= requiredPlayers) {
        const ok = enrollTeam(tid, teamId);
        if (!ok) {
          tmpDel(draftKey);
          return interaction.update(buildEnrollStep2(tid, { error: 'Team is already enrolled.' }));
        }
        for (const [slotStr, uid] of Object.entries(draft.players)) {
          if (uid) db.insert('players', { discord_id: uid, team_id: teamId, tournament_id: tid, slot: parseInt(slotStr) });
        }
        tmpDel(draftKey);
        updateLivePanels(client, tid).catch(() => {});
        // Give registration role to enrolled players
        applyRegistrationRole(client, interaction.guild.id, Object.values(draft.players).filter(Boolean), tid, true).catch(() => {});
        // Show live step3 (enrolled mode with Remove Team button)
        return interaction.update(buildEnrollStep3(tid, teamId));
      }

      // Not enough players yet — refresh draft panel
      return interaction.update(buildEnrollStep3(tid, teamId, { isDraft: true, draftPlayers: draft.players, required: requiredPlayers }));
    }

    // Already-enrolled team (editing players after enrollment): save to DB immediately
    if (userId) {
      const existingForSlot = db.get('players').find(
        p => p.team_id === teamId && p.tournament_id === tid && p.slot === slot
      );
      if (existingForSlot) db.delete('players', existingForSlot.id);
      db.insert('players', { discord_id: userId, team_id: teamId, tournament_id: tid, slot });
    }
    updateLivePanels(client, tid).catch(() => {});
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
