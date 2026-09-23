'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { requireManager } = require('../utils/permissions');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getTargetChannel } = require('../utils/channelRouter');
const { makeSchedulePost, makeResultsPost, makeBracketPost } = require('../botola/tournamentEmbeds');
const {
  stageForRound,
  getKnockoutLegs,
  firstKnockoutRound,
} = require('../utils/knockoutConfig');
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

function tieKeyForMatch(match) {
  if (match.tie_key) return String(match.tie_key);
  const home = Number(match.home_team_id);
  const away = Number(match.away_team_id);
  if (Number.isFinite(home) && Number.isFinite(away)) {
    return `${match.tournament_id}:${match.round}:${Math.min(home, away)}-${Math.max(home, away)}`;
  }
  return `${match.tournament_id}:${match.round}:match-${match.id}`;
}

function groupKnockoutTies(matches) {
  const groups = new Map();
  for (const match of matches) {
    const key = tieKeyForMatch(match);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }
  return [...groups.values()].map(tie => tie.sort((a, b) => (a.leg || 1) - (b.leg || 1) || a.id - b.id));
}

function ensureRoundLegs(tournament, round) {
  const desiredLegs = getKnockoutLegs(tournament, round);
  const before = db.get('matches').filter(m =>
    m.tournament_id === tournament.id && m.stage === 'knockout' && m.round === round
  );

  for (const tie of groupKnockoutTies(before)) {
    const first = tie.find(m => (m.leg || 1) === 1) || tie[0];
    const home = Number(first.home_team_id);
    const away = Number(first.away_team_id);
    const fallbackKey = tieKeyForMatch(first);
    for (const match of tie) {
      const update = {};
      if (!match.tie_key) update.tie_key = fallbackKey;
      if (!match.leg) update.leg = match === first ? 1 : 2;
      if (Object.keys(update).length) db.update('matches', match.id, update);
    }

    const hasLeg2 = tie.some(m => Number(m.leg) === 2);
    if (desiredLegs === 2 && !hasLeg2 && Number.isFinite(home) && Number.isFinite(away)) {
      db.insert('matches', {
        tournament_id: tournament.id,
        home_team_id: away,
        away_team_id: home,
        stage: 'knockout',
        round,
        leg: 2,
        tie_key: fallbackKey,
        status: 'pending',
        home_score: null,
        away_score: null,
      });
    }
  }

  return db.get('matches').filter(m =>
    m.tournament_id === tournament.id && m.stage === 'knockout' && m.round === round
  );
}

function createKnockoutTie(tournamentId, round, homeTeamId, awayTeamId, legs) {
  const low = Math.min(Number(homeTeamId), Number(awayTeamId));
  const high = Math.max(Number(homeTeamId), Number(awayTeamId));
  const tieKey = `${tournamentId}:${round}:${low}-${high}`;
  const existing = db.get('matches').filter(m =>
    m.tournament_id === tournamentId &&
    m.stage === 'knockout' &&
    m.round === round &&
    tieKeyForMatch(m) === tieKey
  );
  if (existing.length) return existing;

  const records = [{
    tournament_id: tournamentId,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    stage: 'knockout',
    round,
    leg: 1,
    tie_key: tieKey,
    status: 'pending',
    home_score: null,
    away_score: null,
  }];
  if (legs === 2) {
    records.push({
      tournament_id: tournamentId,
      home_team_id: awayTeamId,
      away_team_id: homeTeamId,
      stage: 'knockout',
      round,
      leg: 2,
      tie_key: tieKey,
      status: 'pending',
      home_score: null,
      away_score: null,
    });
  }
  return records.map(record => db.insert('matches', record));
}

function aggregateScores(tie) {
  const totals = new Map();
  for (const match of tie) {
    if (match.status !== 'played' || match.home_score == null || match.away_score == null) return null;
    totals.set(match.home_team_id, (totals.get(match.home_team_id) || 0) + Number(match.home_score));
    totals.set(match.away_team_id, (totals.get(match.away_team_id) || 0) + Number(match.away_score));
  }
  return totals;
}

function tieWinner(tie) {
  const totals = aggregateScores(tie);
  if (!totals || totals.size < 2) return null;
  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (entries[0][1] > entries[1][1]) return entries[0][0];
  const decidedByPens = [...tie].reverse().find(match => match.pen_winner)?.pen_winner;
  return decidedByPens || null;
}

function roundIsComplete(tournament, round) {
  const matches = ensureRoundLegs(tournament, round);
  const ties = groupKnockoutTies(matches);
  return ties.length > 0 && ties.every(tie => tieWinner(tie) != null);
}

function advanceKnockoutRound(tid, currentRound) {
  const tournament = db.findById('tournaments', tid);
  if (!tournament) return { ok: false, message: 'Tournament not found.' };

  const matches = ensureRoundLegs(tournament, currentRound);
  const ties = groupKnockoutTies(matches);
  if (!ties.length || ties.some(tie => tie.some(m => m.status !== 'played'))) {
    return { ok: false, message: 'Every required leg in this round must be completed first.' };
  }

  const winners = ties.map(tieWinner);
  if (winners.some(winner => winner == null)) {
    return { ok: false, message: 'A tied aggregate needs penalties before the round can advance.' };
  }

  const nextRound = currentRound / 2;
  if (!Number.isInteger(nextRound)) {
    return { ok: false, message: 'This knockout bracket is not a valid power-of-two bracket.' };
  }
  if (nextRound < 1) {
    db.update('tournaments', tid, { status: 'finished' });
    return { ok: true, finished: true };
  }

  const existingNext = db.get('matches').some(m =>
    m.tournament_id === tid && m.stage === 'knockout' && m.round === nextRound
  );
  if (!existingNext) {
    const legs = getKnockoutLegs(tournament, nextRound);
    for (let i = 0; i + 1 < winners.length; i += 2) {
      createKnockoutTie(tid, nextRound, winners[i], winners[i + 1], legs);
    }
  }
  return { ok: true, finished: false, nextRound };
}

function buildManagerResultModal(match) {
  const isKnockout = match.stage === 'knockout';
  const stageLabel = isKnockout ? stageForRound(match.round).label : `Group round ${match.round}`;
  const modal = new ModalBuilder()
    .setCustomId(`tmgr_result_modal_${match.id}`)
    .setTitle(`${stageLabel}${isKnockout ? ` · Leg ${match.leg || 1}` : ''}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('home_score').setLabel('Home Team Score')
          .setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true)
          .setValue(match.home_score != null ? String(match.home_score) : '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('away_score').setLabel('Away Team Score')
          .setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true)
          .setValue(match.away_score != null ? String(match.away_score) : '')
      ),
    );
  if (isKnockout) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('home_pens').setLabel('Home penalties if tie')
          .setStyle(TextInputStyle.Short).setPlaceholder('Leave blank unless required').setRequired(false)
          .setValue(match.home_pens != null ? String(match.home_pens) : '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('away_pens').setLabel('Away penalties if tie')
          .setStyle(TextInputStyle.Short).setPlaceholder('Leave blank unless required').setRequired(false)
          .setValue(match.away_pens != null ? String(match.away_pens) : '')
      ),
    );
  }
  return modal;
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

function resultNeedsPenalties(match, homeScore, awayScore) {
  if (match.stage !== 'knockout') return false;

  const roundMatches = db.get('matches').filter(m =>
    m.tournament_id === match.tournament_id &&
    m.stage === 'knockout' &&
    m.round === match.round
  );
  const tie = groupKnockoutTies(roundMatches).find(group =>
    group.some(item => item.id === match.id)
  ) || [match];

  if (tie.length <= 1) return homeScore === awayScore;

  const simulated = tie.map(item => item.id === match.id
    ? { ...item, status: 'played', home_score: homeScore, away_score: awayScore }
    : item
  );
  const totals = aggregateScores(simulated);
  if (!totals) return false;
  const values = [...totals.values()].sort((a, b) => b - a);
  return values.length > 1 && values[0] === values[1];
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
    const tournament = db.findById('tournaments', tid);
    const rounds = [...new Set(db.get('matches')
      .filter(m => m.tournament_id === tid && m.stage === 'knockout')
      .map(m => m.round))];
    for (const round of rounds) ensureRoundLegs(tournament, round);
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Refresh sub-panel ─────────────────────────────────────────────────────
  if (id.startsWith('tmgr_refresh_')) {
    const tid = parseInt(id.replace('tmgr_refresh_', ''));
    const tournament = db.findById('tournaments', tid);
    const rounds = [...new Set(db.get('matches')
      .filter(m => m.tournament_id === tid && m.stage === 'knockout')
      .map(m => m.round))];
    for (const round of rounds) ensureRoundLegs(tournament, round);
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

  // ── Add Result — select match and submit result ───────────────────────────
  if (id.startsWith('tmgr_match_sel_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const matchId = parseInt(interaction.values?.[0]);
    const match = db.findById('matches', matchId);
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    return interaction.showModal(buildManagerResultModal(match));
  }

  if (id.startsWith('tmgr_result_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);

    const matchId = parseInt(id.replace('tmgr_result_modal_', ''));
    const match = db.findById('matches', matchId);
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });

    const homeScore = parseInt(interaction.fields.getTextInputValue('home_score'));
    const awayScore = parseInt(interaction.fields.getTextInputValue('away_score'));
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Score', 'Scores must be whole numbers starting at 0.')], ephemeral: true });
    }

    const needsPens = resultNeedsPenalties(match, homeScore, awayScore);
    const rawHomePens = match.stage === 'knockout'
      ? interaction.fields.getTextInputValue('home_pens')?.trim()
      : undefined;
    const rawAwayPens = match.stage === 'knockout'
      ? interaction.fields.getTextInputValue('away_pens')?.trim()
      : undefined;
    const homePens = rawHomePens === undefined || rawHomePens === '' ? NaN : parseInt(rawHomePens);
    const awayPens = rawAwayPens === undefined || rawAwayPens === '' ? NaN : parseInt(rawAwayPens);

    if (needsPens && (!Number.isInteger(homePens) || !Number.isInteger(awayPens) || homePens < 0 || awayPens < 0 || homePens === awayPens)) {
      return interaction.reply({
        embeds: [errorEmbed(
          'Penalty Shootout Required',
          'This tie is level on aggregate. Enter different penalty scores for both teams.'
        )],
        ephemeral: true,
      });
    }

    const isEdit = match.status === 'played';
    if (isEdit && match.stage === 'group') _reverseGroupStandings(match, match.tournament_id);

    const penWinner = needsPens
      ? (homePens > awayPens ? match.home_team_id : match.away_team_id)
      : null;
    db.update('matches', matchId, {
      home_score: homeScore,
      away_score: awayScore,
      home_pens: needsPens ? homePens : null,
      away_pens: needsPens ? awayPens : null,
      pen_winner: penWinner,
      status: 'played',
      played_at: new Date().toISOString(),
    });

    if (match.stage === 'group') {
      const tournament = db.findById('tournaments', match.tournament_id);
      const wp = tournament?.win_pts ?? 3;
      const dp = tournament?.draw_pts ?? 1;
      const lp = tournament?.loss_pts ?? 0;
      const homeWon = homeScore > awayScore;
      const awayWon = awayScore > homeScore;
      const draw = homeScore === awayScore;
      for (const [teamId, scored, conceded, won, lost] of [
        [match.home_team_id, homeScore, awayScore, homeWon, awayWon],
        [match.away_team_id, awayScore, homeScore, awayWon, homeWon],
      ]) {
        const tt = db.findOne('tournament_teams', row =>
          row.tournament_id === match.tournament_id && row.team_id === teamId
        );
        if (tt) db.update('tournament_teams', tt.id, {
          goals_for: (tt.goals_for || 0) + scored,
          goals_against: (tt.goals_against || 0) + conceded,
          wins: (tt.wins || 0) + (won ? 1 : 0),
          draws: (tt.draws || 0) + (draw ? 1 : 0),
          losses: (tt.losses || 0) + (lost ? 1 : 0),
          points: (tt.points || 0) + (won ? wp : draw ? dp : lp),
        });
      }
    }

    const teams = db.get('teams');
    const home = teams.find(team => team.id === match.home_team_id)?.name || 'Home';
    const away = teams.find(team => team.id === match.away_team_id)?.name || 'Away';
    const legText = match.stage === 'knockout' ? ` · Leg ${match.leg || 1}` : '';
    return interaction.reply({
      embeds: [successEmbed(
        isEdit ? 'Result Updated' : 'Result Recorded',
        `**${home} ${homeScore} — ${awayScore} ${away}**${legText}${needsPens ? `\n🏆 Penalties: **${homePens} — ${awayPens}**` : ''}`
      )],
      ephemeral: true,
    });
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

    if (db.get('matches').some(m => m.tournament_id === tid && m.stage === 'knockout')) {
      return interaction.reply({ content: '❌ Knockout matches already exist for this tournament.', ephemeral: true });
    }

    const shuffled   = [...qualifiers].sort(() => Math.random() - 0.5);
    const numMatches = Math.floor(shuffled.length / 2);
    if (numMatches < 1 || (numMatches & (numMatches - 1)) !== 0) {
      return interaction.reply({
        content: '❌ The qualified teams must form a power-of-two bracket (4, 8, 16, 32…). Adjust the group advance settings first.',
        ephemeral: true,
      });
    }

    const firstRound = firstKnockoutRound(t, numMatches);
    const legs = getKnockoutLegs(t, firstRound);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      createKnockoutTie(tid, firstRound, shuffled[i], shuffled[i + 1], legs);
    }

    db.update('tournaments', tid, { status: 'active' });
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Next Round ────────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_nextround_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const parts     = id.replace('tmgr_nextround_', '').split('_');
    const tid       = parseInt(parts[0]);
    const currentRound = parseInt(parts[1]);
    const t         = db.findById('tournaments', tid);
    if (!t) return interaction.update(buildTournamentListPanel());

    const result = advanceKnockoutRound(tid, currentRound);
    if (!result.ok) {
      return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
    }

    if (result.nextRound) {
      const resultsCh = await getTargetChannel(interaction.guild, t.template, 'results').catch(() => null);
      const target = resultsCh || interaction.channel;
      const payload = makeBracketPost(tid);
      if (payload) await target.send(payload).catch(() => {});
    }

    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Post current knockout bracket ────────────────────────────────────────
  if (id.startsWith('tmgr_postbracket_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('tmgr_postbracket_', ''));
    const t = db.findById('tournaments', tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    const resultsCh = await getTargetChannel(interaction.guild, t.template, 'results').catch(() => null);
    const target = resultsCh || interaction.channel;
    const payload = makeBracketPost(tid);
    if (!payload) return interaction.reply({ content: '❌ No knockout bracket exists yet.', ephemeral: true });
    await target.send(payload).catch(() => {});
    return interaction.reply({ content: `✅ Knockout bracket posted in <#${target.id}>.`, ephemeral: true });
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
