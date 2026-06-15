'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { requireManager } = require('../utils/permissions');
const { getTargetChannel } = require('../utils/channelRouter');
const { makeSchedulePost, makeResultsPost } = require('../utils/tournamentEmbeds');
const { buildNewSeasonModal } = require('../panels/managePanel');
const {
  buildTournamentListPanel,
  buildTournamentSubPanel,
  buildMatchPickerPanel,
  buildTeamSearchResultsPanel,
} = require('../panels/tournamentManagerPanel');

// ── Helpers ───────────────────────────────────────────────────────────────────
function noPermission(interaction) {
  return interaction.reply({ content: '❌ Managers only.', ephemeral: true });
}

async function refreshSubPanel(client, tournamentId) {
  try {
    const ref = db.getConfig('managerpanel_ref');
    if (!ref) return;
    const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
    if (msg) await msg.edit(buildTournamentSubPanel(tournamentId)).catch(() => {});
  } catch {}
}

// Reverse a played group match's effect on standings
function _reverseGroupStandings(match, tournamentId) {
  const hs = match.home_score, as_ = match.away_score;
  if (hs == null || as_ == null) return;
  const t  = db.findById('tournaments', tournamentId);
  const wp = t?.win_pts  ?? 3;
  const dp = t?.draw_pts ?? 1;
  const lp = t?.loss_pts ?? 0;
  const homeWon = hs > as_, awayWon = as_ > hs, draw = hs === as_;
  for (const [teamId, scored, conceded, won, lost, drew] of [
    [match.home_team_id, hs, as_, homeWon, awayWon, draw],
    [match.away_team_id, as_, hs, awayWon, homeWon, draw],
  ]) {
    const tt = db.findOne('tournament_teams', r => r.tournament_id === tournamentId && r.team_id === teamId);
    if (tt) db.update('tournament_teams', tt.id, {
      goals_for:     Math.max(0, (tt.goals_for     || 0) - scored),
      goals_against: Math.max(0, (tt.goals_against || 0) - conceded),
      wins:          Math.max(0, (tt.wins          || 0) - (won  ? 1 : 0)),
      draws:         Math.max(0, (tt.draws         || 0) - (drew ? 1 : 0)),
      losses:        Math.max(0, (tt.losses        || 0) - (lost ? 1 : 0)),
      points:        Math.max(0, (tt.points        || 0) - (won ? wp : drew ? dp : lp)),
    });
  }
}

async function tryAdvanceKnockout(client, tid, currentRound) {
  const roundMatches = db.get('matches').filter(m =>
    m.tournament_id === tid && m.stage === 'knockout' && m.round === currentRound
  );
  if (!roundMatches.length || roundMatches.some(m => m.status !== 'played')) return;

  const nextRound = currentRound / 2;

  if (nextRound < 1) {
    db.update('tournaments', tid, { status: 'finished' });
    return;
  }

  const winners = roundMatches.map(m => {
    if (m.home_score > m.away_score) return m.home_team_id;
    if (m.away_score > m.home_score) return m.away_team_id;
    return m.pen_winner ?? m.home_team_id;
  });

  for (let i = 0; i + 1 < winners.length; i += 2) {
    db.insert('matches', {
      tournament_id: tid,
      home_team_id:  winners[i],
      away_team_id:  winners[i + 1],
      stage:         'knockout',
      round:         nextRound,
      leg:           1,
      status:        'pending',
      home_score:    null,
      away_score:    null,
    });
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleTournamentManagerInteraction(interaction) {
  const id = interaction.customId;

  // ── Back to list ──────────────────────────────────────────────────────────
  if (id === 'tmgr_back') {
    return interaction.update(buildTournamentListPanel());
  }

  // ── Select tournament ─────────────────────────────────────────────────────
  if (id.startsWith('tmgr_t_')) {
    const tid = parseInt(id.replace('tmgr_t_', ''));
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Refresh sub-panel ─────────────────────────────────────────────────────
  if (id.startsWith('tmgr_refresh_')) {
    const tid = parseInt(id.replace('tmgr_refresh_', ''));
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── New season — show template modal ──────────────────────────────────────
  if (id.startsWith('tmgr_new_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = id.replace('tmgr_new_', '');
    const modal = buildNewSeasonModal(template);
    modal.setCustomId(`tmgr_create_modal_${template}`);
    return interaction.showModal(modal);
  }

  // ── Create season modal submit ────────────────────────────────────────────
  if (id.startsWith('tmgr_create_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template     = id.replace('tmgr_create_modal_', '');
    const name         = interaction.fields.getTextInputValue('tournament_name').trim();
    const teamCount    = parseInt(interaction.fields.getTextInputValue('team_count'));
    const groupSize    = parseInt(interaction.fields.getTextInputValue('group_size'));
    const deadlineHrs  = parseInt(interaction.fields.getTextInputValue('deadline_hours') || '0') || null;
    const seasons      = db.get('tournaments').filter(t => t.template === template).length;
    if (isNaN(teamCount) || isNaN(groupSize)) {
      return interaction.reply({ content: '❌ Invalid team count or group size.', ephemeral: true });
    }
    return interaction.reply({ content: '❌ Tournaments are pre-configured. Use /panels to manage existing tournaments.', ephemeral: true });
  }

  // ── Add Teams — show search modal ─────────────────────────────────────────
  if (id.startsWith('tmgr_addteams_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('tmgr_addteams_', ''));
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`tmgr_team_modal_${tid}`)
        .setTitle('Search Team to Add')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('query').setLabel('Team name or short name')
              .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Arsenal').setRequired(true)
          ),
        )
    );
  }

  // ── Team search modal submit ──────────────────────────────────────────────
  if (id.startsWith('tmgr_team_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid   = parseInt(id.replace('tmgr_team_modal_', ''));
    const query = interaction.fields.getTextInputValue('query').toLowerCase().trim();
    const enrolled = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => tt.team_id);
    const found    = db.get('teams').filter(t =>
      !enrolled.includes(t.id) &&
      (t.name?.toLowerCase().includes(query) || t.short_name?.toLowerCase().includes(query))
    );
    return interaction.update(buildTeamSearchResultsPanel(tid, found));
  }

  // ── Enroll team ───────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_enroll_sel_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid    = parseInt(id.replace('tmgr_enroll_sel_', ''));
    const teamId = parseInt(interaction.values[0]);
    const exists = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === teamId);
    if (!exists) {
      db.insert('tournament_teams', {
        tournament_id: tid, team_id: teamId,
        group_name: null, wins: 0, draws: 0, losses: 0,
        goals_for: 0, goals_against: 0, points: 0,
      });
    }
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Add Player — show search modal ────────────────────────────────────────
  if (id.startsWith('tmgr_addplayer_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('tmgr_addplayer_', ''));
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`tmgr_player_modal_${tid}`)
        .setTitle('Add Player to Team')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('discord_id').setLabel('Player Discord ID')
              .setStyle(TextInputStyle.Short).setPlaceholder('1234567890123456789').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('team_name').setLabel('Team name or short name')
              .setStyle(TextInputStyle.Short).setPlaceholder('Arsenal').setRequired(true)
          ),
        )
    );
  }

  // ── Player modal submit ───────────────────────────────────────────────────
  if (id.startsWith('tmgr_player_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid      = parseInt(id.replace('tmgr_player_modal_', ''));
    const discordId = interaction.fields.getTextInputValue('discord_id').trim().replace(/\D/g, '');
    const teamQuery = interaction.fields.getTextInputValue('team_name').toLowerCase().trim();
    const enrolled  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
    const team      = enrolled
      .map(tt => db.findById('teams', tt.team_id))
      .filter(Boolean)
      .find(t => t.name?.toLowerCase().includes(teamQuery) || t.short_name?.toLowerCase().includes(teamQuery));
    if (!team) {
      return interaction.reply({ content: `❌ Team matching "${teamQuery}" not found in this tournament.`, ephemeral: true });
    }
    const existing = db.findOne('players', p => p.discord_id === discordId && p.team_id === team.id);
    if (existing) {
      return interaction.reply({ content: `❌ Player <@${discordId}> is already on **${team.name}**.`, ephemeral: true });
    }
    db.insert('players', { discord_id: discordId, team_id: team.id });
    await interaction.reply({ content: `✅ <@${discordId}> added to **${team.name}**.`, ephemeral: true });
    return interaction.message?.edit(buildTournamentSubPanel(tid)).catch(() => {});
  }

  // ── Draw Groups ───────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_drawgroups_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid      = parseInt(id.replace('tmgr_drawgroups_', ''));
    const t        = db.findById('tournaments', tid);
    const ttRows   = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
    const perGroup = t?.teams_per_group || 4;
    const shuffled = [...ttRows].sort(() => Math.random() - 0.5);
    const letters  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    shuffled.forEach((tt, i) => {
      db.update('tournament_teams', tt.id, { group_name: letters[Math.floor(i / perGroup)] });
    });
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Generate Matches ──────────────────────────────────────────────────────
  if (id.startsWith('tmgr_genmatches_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid    = parseInt(id.replace('tmgr_genmatches_', ''));
    const t      = db.findById('tournaments', tid);
    const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
    const enc    = t?.encounters || 1;

    const groups = {};
    for (const tt of ttRows) {
      const g = tt.group_name || 'A';
      if (!groups[g]) groups[g] = [];
      groups[g].push(tt.team_id);
    }

    let existing = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
    for (const m of existing) db.delete('matches', m.id);

    for (const [, gTeams] of Object.entries(groups)) {
      for (let i = 0; i < gTeams.length; i++) {
        for (let j = i + 1; j < gTeams.length; j++) {
          for (let leg = 1; leg <= enc; leg++) {
            const home = leg === 1 ? gTeams[i] : gTeams[j];
            const away = leg === 1 ? gTeams[j] : gTeams[i];
            db.insert('matches', {
              tournament_id: tid,
              home_team_id: home, away_team_id: away,
              stage: 'group', round: 1, leg,
              status: 'pending', home_score: null, away_score: null,
            });
          }
        }
      }
    }

    db.update('tournaments', tid, { status: 'active' });
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Post Schedule ─────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_postschedule_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid   = parseInt(id.replace('tmgr_postschedule_', ''));
    const t     = db.findById('tournaments', tid);
    const ch    = await getTargetChannel(interaction.guild, t?.template, 'matchSchedule').catch(() => null);
    const target = ch || interaction.channel;
    const payload = makeSchedulePost(tid, null);
    if (payload) await target.send(payload).catch(() => {});
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Add Result — show match picker ────────────────────────────────────────
  if (id.startsWith('tmgr_addresult_')) {
    const tid = parseInt(id.replace('tmgr_addresult_', ''));
    return interaction.update(buildMatchPickerPanel(tid));
  }

  // ── Start Knockout ────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_knockout_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid     = parseInt(id.replace('tmgr_knockout_', ''));
    const t       = db.findById('tournaments', tid);
    const advance = t?.advance_per_group || 2;
    const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);

    const groups = {};
    for (const tt of ttRows) {
      const g = tt.group_name || 'A';
      if (!groups[g]) groups[g] = [];
      groups[g].push(tt);
    }

    const qualifiers = [];
    for (const gTeams of Object.values(groups)) {
      gTeams.sort((a, b) => {
        const pd = (b.points || 0) - (a.points || 0);
        if (pd !== 0) return pd;
        const gd = ((b.goals_for || 0) - (b.goals_against || 0)) - ((a.goals_for || 0) - (a.goals_against || 0));
        if (gd !== 0) return gd;
        return (b.goals_for || 0) - (a.goals_for || 0);
      });
      for (let i = 0; i < advance && i < gTeams.length; i++) {
        qualifiers.push(gTeams[i].team_id);
      }
    }

    if (qualifiers.length < 2) {
      return interaction.reply({ content: '❌ Need at least 2 qualified teams.', ephemeral: true });
    }

    const shuffled   = [...qualifiers].sort(() => Math.random() - 0.5);
    const numMatches = Math.floor(shuffled.length / 2);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      db.insert('matches', {
        tournament_id: tid,
        home_team_id:  shuffled[i],
        away_team_id:  shuffled[i + 1],
        stage:         'knockout',
        round:         numMatches,
        leg:           1,
        status:        'pending',
        home_score:    null,
        away_score:    null,
      });
    }

    db.update('tournaments', tid, { status: 'active' });
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Next Round ────────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_nextround_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const parts     = id.replace('tmgr_nextround_', '').split('_');
    const tid       = parseInt(parts[0]);
    const nextRound = parseInt(parts[1]);
    const t         = db.findById('tournaments', tid);
    if (!t) return interaction.update(buildTournamentListPanel());

    const scheduleCh = await getTargetChannel(interaction.guild, t.template, 'matchSchedule').catch(() => null);
    const target     = scheduleCh || interaction.channel;
    const payload    = makeSchedulePost(tid, nextRound);
    if (payload) await target.send(payload).catch(() => {});

    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Close Season ──────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_closeseason_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('tmgr_closeseason_', ''));
    db.update('tournaments', tid, { status: 'finished' });
    return interaction.update(buildTournamentSubPanel(tid));
  }
}

async function refreshListPanel(client) {
  try {
    const ref = db.getConfig('managerpanel_ref');
    if (!ref) return;
    const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
    if (msg) await msg.edit(buildTournamentListPanel()).catch(() => {});
  } catch {}
}

module.exports = { handleTournamentManagerInteraction };
