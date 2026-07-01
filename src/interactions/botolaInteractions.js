'use strict';
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db }          = require('../utils/database');
const { getTplCfg }   = require('../utils/templateConfig');
const { isBotolaManager } = require('../utils/permissions');
const { buildPanel1, getStage } = require('../panels/panel1');
const { buildPanel2 } = require('../panels/panel2');
const { buildPanel3 } = require('../panels/panel3');
const {
  buildGroupStandingsEmbed,
  buildKnockoutBracketEmbed,
} = require('../panels/standingsPanel');
const { buildAllResultsEmbed } = require('../panels/resultsPanel');
const {
  makeSchedulePost, makeResultsPost, makeGroupDrawPost, makeBracketPost,
  makeScheduleEmbed, makeChampionPost,
} = require('../utils/tournamentEmbeds');
const { buildWinnersHistoryPayload } = require('../utils/winnersHistory');
const { buildTeamsListEmbed } = require('../panels/teamListPanel');
const { get: tmpGet, set: tmpSet } = require('../utils/tempState');

// ── Helpers ───────────────────────────────────────────────────────────────────
const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

function noPermission(i) {
  return i.reply({ content: '❌ Managers only.', ephemeral: true });
}

function getT(tid) {
  const t = db.findById('tournaments', tid);
  if (!t) return t;
  const cfg = getTplCfg(t.template || '');
  const fix = {};
  if (cfg.tpg_opts.length        === 1 && t.teams_per_group   !== cfg.tpg_opts[0])        fix.teams_per_group   = cfg.tpg_opts[0];
  if (cfg.apg_opts.length        === 1 && t.advance_per_group !== cfg.apg_opts[0])        fix.advance_per_group = cfg.apg_opts[0];
  if (cfg.ppt_opts.length        === 1 && t.players_per_team  !== cfg.ppt_opts[0])        fix.players_per_team  = cfg.ppt_opts[0];
  if (cfg.team_count_opts.length === 1 && t.team_count        !== cfg.team_count_opts[0]) fix.team_count        = cfg.team_count_opts[0];
  if (Object.keys(fix).length) { db.update('tournaments', tid, fix); Object.assign(t, fix); }
  return t;
}

async function refreshPanel(client, t, panelNum) {
  try {
    const ref = t[`panel${panelNum}_ref`];
    if (!ref) return;
    const ch  = client.channels.cache.get(ref.channelId)
              ?? await client.channels.fetch(ref.channelId).catch(() => null);
    if (!ch) return;
    const msg = ch.messages.cache.get(ref.messageId)
              ?? await ch.messages.fetch(ref.messageId).catch(() => null);
    if (!msg) return;
    const payload = panelNum === 1 ? buildPanel1(t)
                  : panelNum === 2 ? buildPanel2(t)
                  : buildPanel3(t);
    await msg.edit(payload).catch(() => {});
  } catch {}
}

// Re-post all 3 panels in order (1->2->3) to the management channel.
// Called when any panel message is missing or stale.
async function repostPanels(client, t) {
  const mgmtId = t.channels?.management;
  if (!mgmtId) return;
  const mgmtCh = client.channels.cache.get(mgmtId)
               ?? await client.channels.fetch(mgmtId).catch(() => null);
  if (!mgmtCh) return;
  for (const key of ['panel1_ref', 'panel2_ref', 'panel3_ref']) {
    const ref = t[key];
    if (!ref?.messageId) continue;
    const ch = client.channels.cache.get(ref.channelId)
             ?? await client.channels.fetch(ref.channelId).catch(() => null);
    if (ch) {
      const m = await ch.messages.fetch(ref.messageId).catch(() => null);
      if (m) await m.delete().catch(() => {});
    }
  }
  db.update('tournaments', t.id, { panel1_ref: null, panel2_ref: null, panel3_ref: null });
  const msg1 = await mgmtCh.send(buildPanel1(t)).catch(() => null);
  const msg2 = await mgmtCh.send(buildPanel2(t)).catch(() => null);
  const msg3 = await mgmtCh.send(buildPanel3(t)).catch(() => null);
  db.update('tournaments', t.id, {
    panel1_ref: msg1 ? { channelId: mgmtCh.id, messageId: msg1.id } : null,
    panel2_ref: msg2 ? { channelId: mgmtCh.id, messageId: msg2.id } : null,
    panel3_ref: msg3 ? { channelId: mgmtCh.id, messageId: msg3.id } : null,
  });
}

async function refreshAll(client, tid) {
  const t = getT(tid);
  if (!t) return;
  const mgmtId = t.channels?.management;
  if (mgmtId) {
    // If any panel message is missing or stale, re-post all 3 in order.
    for (const key of ['panel1_ref', 'panel2_ref', 'panel3_ref']) {
      const ref = t[key];
      if (!ref?.messageId) { await repostPanels(client, t); return; }
      const ch = client.channels.cache.get(ref.channelId)
               ?? await client.channels.fetch(ref.channelId).catch(() => null);
      if (!ch) { await repostPanels(client, t); return; }
      const msg = ch.messages.cache.get(ref.messageId)
                ?? await ch.messages.fetch(ref.messageId).catch(() => null);
      if (!msg) { await repostPanels(client, t); return; }
    }
  }
  // All messages exist -- edit them in parallel
  await Promise.all([
    refreshPanel(client, t, 1),
    refreshPanel(client, t, 2),
    refreshPanel(client, t, 3),
  ]);
}

async function refreshPanels23(client, tid) {
  const t = getT(tid);
  if (!t) return;
  await Promise.all([
    refreshPanel(client, t, 2),
    refreshPanel(client, t, 3),
  ]);
}

// ── Schedule generation ───────────────────────────────────────────────────────
function runGroupDraw(tid) {
  const t        = getT(tid);
  const ttRows   = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const shuffled = [...ttRows].sort(() => Math.random() - 0.5);
  const gs       = t.teams_per_group || 4;
  const letters  = 'ABCDEFGHIJKLMNOP'.split('');
  db.updateMany('tournament_teams', shuffled.map((tt, i) => ({
    id: tt.id,
    data: { group_name: letters[Math.floor(i / gs)] },
  })));
}

function generateGroupSchedule(tid) {
  const t      = getT(tid);
  const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const groups = {};
  for (const tt of ttRows) {
    const g = tt.group_name || 'A';
    if (!groups[g]) groups[g] = [];
    groups[g].push(tt);
  }
  const toInsert = [];
  for (const [, gTeams] of Object.entries(groups)) {
    // Circle round-robin: each team plays exactly once per round
    const arr = [...gTeams];
    if (arr.length % 2 !== 0) arr.push(null); // null = bye slot for odd counts
    const numRounds = arr.length - 1;
    const half      = arr.length / 2;
    const fixed     = arr[0];
    const rotating  = arr.slice(1);
    for (let r = 0; r < numRounds; r++) {
      const roundTeams = [fixed, ...rotating];
      for (let i = 0; i < half; i++) {
        const home = roundTeams[i];
        const away = roundTeams[roundTeams.length - 1 - i];
        if (home && away) {
          toInsert.push({
            tournament_id: tid,
            home_team_id:  home.team_id,
            away_team_id:  away.team_id,
            stage: 'group', round: r + 1, leg: 1,
            status: 'pending', home_score: null, away_score: null,
          });
        }
      }
      // Rotate all except fixed: move last element to front
      rotating.unshift(rotating.pop());
    }
  }
  if (toInsert.length) db.insertMany('matches', toInsert);
}

function _reverseTTStandings(tid, match) {
  // Reverse a previously played match's contribution to group standings
  const hs = match.home_score, as_ = match.away_score;
  if (hs == null || as_ == null) return;
  const t  = getT(tid);
  const wp = t?.win_pts  ?? 3;
  const dp = t?.draw_pts ?? 1;
  const lp = t?.loss_pts ?? 0;
  const homeWon = hs > as_, awayWon = as_ > hs, draw = hs === as_;
  for (const [teamId, scored, conceded, won, lost, drew] of [
    [match.home_team_id, hs, as_, homeWon, awayWon, draw],
    [match.away_team_id, as_, hs, awayWon, homeWon, draw],
  ]) {
    const tt = db.findOne('tournament_teams', r => r.tournament_id === tid && r.team_id === teamId);
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

function updateStandings(tid, matchId, homeScore, awayScore) {
  const match = db.findById('matches', matchId);
  if (!match) return;
  const t = getT(tid);
  if (!t) return;
  const wp = t.win_pts  ?? 3;
  const dp = t.draw_pts ?? 1;
  const lp = t.loss_pts ?? 0;

  // If match was already played, reverse old group stats before applying new scores
  if (match.status === 'played' && match.home_score != null && match.stage === 'group') {
    _reverseTTStandings(tid, match);
  }

  const home_tt = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === match.home_team_id);
  const away_tt = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === match.away_team_id);

  if (homeScore > awayScore) {
    if (home_tt) db.update('tournament_teams', home_tt.id, {
      wins: (home_tt.wins || 0) + 1, points: (home_tt.points || 0) + wp,
      goals_for: (home_tt.goals_for || 0) + homeScore, goals_against: (home_tt.goals_against || 0) + awayScore,
    });
    if (away_tt) db.update('tournament_teams', away_tt.id, {
      losses: (away_tt.losses || 0) + 1, points: (away_tt.points || 0) + lp,
      goals_for: (away_tt.goals_for || 0) + awayScore, goals_against: (away_tt.goals_against || 0) + homeScore,
    });
  } else if (awayScore > homeScore) {
    if (home_tt) db.update('tournament_teams', home_tt.id, {
      losses: (home_tt.losses || 0) + 1, points: (home_tt.points || 0) + lp,
      goals_for: (home_tt.goals_for || 0) + homeScore, goals_against: (home_tt.goals_against || 0) + awayScore,
    });
    if (away_tt) db.update('tournament_teams', away_tt.id, {
      wins: (away_tt.wins || 0) + 1, points: (away_tt.points || 0) + wp,
      goals_for: (away_tt.goals_for || 0) + awayScore, goals_against: (away_tt.goals_against || 0) + homeScore,
    });
  } else {
    if (home_tt) db.update('tournament_teams', home_tt.id, {
      draws: (home_tt.draws || 0) + 1, points: (home_tt.points || 0) + dp,
      goals_for: (home_tt.goals_for || 0) + homeScore, goals_against: (home_tt.goals_against || 0) + awayScore,
    });
    if (away_tt) db.update('tournament_teams', away_tt.id, {
      draws: (away_tt.draws || 0) + 1, points: (away_tt.points || 0) + dp,
      goals_for: (away_tt.goals_for || 0) + awayScore, goals_against: (away_tt.goals_against || 0) + homeScore,
    });
  }
  db.update('matches', matchId, { status: 'played', home_score: homeScore, away_score: awayScore });
}

function generateKnockoutBracket(tid) {
  const t       = getT(tid);
  const advance = t.advance_per_group || 2;
  const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid && tt.group_name);
  const groups  = {};
  for (const tt of ttRows) {
    const g = tt.group_name;
    if (!groups[g]) groups[g] = [];
    groups[g].push(tt);
  }
  const qualifiers = [];
  for (const gTeams of Object.values(groups)) {
    gTeams.sort((a, b) => {
      const ptsDiff = (b.points || 0) - (a.points || 0);
      if (ptsDiff !== 0) return ptsDiff;
      return ((b.goals_for || 0) - (b.goals_against || 0)) - ((a.goals_for || 0) - (a.goals_against || 0));
    });
    qualifiers.push(...gTeams.slice(0, advance));
  }
  const shuffled = [...qualifiers].sort(() => Math.random() - 0.5);
  const numMatches = Math.floor(shuffled.length / 2);
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    db.insert('matches', {
      tournament_id: tid,
      home_team_id: shuffled[i].team_id, away_team_id: shuffled[i + 1].team_id,
      stage: 'knockout', round: numMatches, leg: 1,
      status: 'pending', home_score: null, away_score: null,
    });
  }
}

function advanceKnockout(tid) {
  const matches = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'knockout');

  // Round numbering: QF=4, SF=2, Final=1 (higher = earlier stage).
  // We want the MOST ADVANCED completed round = lowest round number where
  // every match in that round is played.
  const completedRounds = [...new Set(matches.filter(m => m.status === 'played').map(m => m.round))]
    .filter(r => matches.filter(m => m.round === r).every(m => m.status === 'played'))
    .sort((a, b) => a - b);                           // ascending: 1 < 2 < 4

  if (!completedRounds.length) return false;
  const curRound  = completedRounds[0];               // lowest = most advanced stage
  const curPlayed = matches.filter(m => m.round === curRound && m.status === 'played');

  // ── 2-leg Semi-Finals (round === 2) ───────────────────────────────────────
  if (curRound === 2) {
    const sfLeg1s = matches.filter(m => m.round === 2 && (!m.leg || m.leg === 1));
    const sfLeg2s = matches.filter(m => m.round === 2 && m.leg === 2);
    if (!sfLeg2s.length) {
      // SF Leg 1s just finished — create Leg 2 for each (reverse home/away)
      for (const leg1 of sfLeg1s) {
        db.insert('matches', {
          tournament_id: tid,
          home_team_id: leg1.away_team_id,
          away_team_id: leg1.home_team_id,
          stage: 'knockout', round: 2, leg: 2,
          status: 'pending', home_score: null, away_score: null,
        });
      }
      return 'leg2';
    }
    // Both legs played — determine SF winners by aggregate, create single-leg Final
    if (matches.some(m => m.round === 1)) return false;
    const sfWinners = [];
    for (const leg1 of sfLeg1s) {
      const leg2 = sfLeg2s.find(m => m.home_team_id === leg1.away_team_id && m.away_team_id === leg1.home_team_id);
      if (!leg2) continue;
      const hAgg = (leg1.home_score || 0) + (leg2.away_score || 0);
      const aAgg = (leg1.away_score || 0) + (leg2.home_score || 0);
      sfWinners.push(hAgg !== aAgg ? (hAgg > aAgg ? leg1.home_team_id : leg1.away_team_id)
                                   : (leg2.pen_winner || leg1.pen_winner || leg1.away_team_id));
    }
    for (let i = 0; i + 1 < sfWinners.length; i += 2) {
      db.insert('matches', {
        tournament_id: tid,
        home_team_id: sfWinners[i], away_team_id: sfWinners[i + 1],
        stage: 'knockout', round: 1, leg: 1,
        status: 'pending', home_score: null, away_score: null,
      });
    }
    return 1;
  }

  // ── Single-leg Final (round === 1) ────────────────────────────────────────
  if (curRound === 1) {
    db.update('tournaments', tid, { status: 'finished' });
    return 'finished';
  }

  const nextRound = Math.floor(curRound / 2);

  if (nextRound < 1) {
    db.update('tournaments', tid, { status: 'finished' });
    return 'finished';
  }

  // Guard: next round already exists — nothing to do (prevents double-advance)
  if (matches.some(m => m.round === nextRound)) return false;

  const winners = curPlayed.map(m => {
    if (m.home_score > m.away_score) return m.home_team_id;
    if (m.away_score > m.home_score) return m.away_team_id;
    return m.pen_winner || m.away_team_id;
  });
  for (let i = 0; i + 1 < winners.length; i += 2) {
    db.insert('matches', {
      tournament_id: tid,
      home_team_id: winners[i], away_team_id: winners[i + 1],
      stage: 'knockout', round: nextRound, leg: 1,
      status: 'pending', home_score: null, away_score: null,
    });
  }
  return nextRound;
}

// ── Pending match panel ───────────────────────────────────────────────────────
function buildMatchPickerEphemeral(tid, stage) {
  const teams   = db.get('teams');
  const getTeam = id => teams.find(t => t.id === id) || { name: 'Unknown' };
  const matches = db.get('matches').filter(m =>
    m.tournament_id === tid &&
    (stage ? m.stage === stage : true)
  );
  if (!matches.length) return null;
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      txt('**📊 Add Result — Select a match**'),
      SEP,
      { type: 1, components: [{
        type: 3, custom_id: `p1_${tid}_result_sel`,
        placeholder: 'Select match...',
        options: matches.slice(0, 25).map(m => ({
          label: `${getTeam(m.home_team_id).name} vs ${getTeam(m.away_team_id).name}`,
          value:  String(m.id),
          description: `${m.stage} · Round ${m.round}`,
        })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: 'Cancel', custom_id: `p1_${tid}_refresh` }]},
    ]}],
  };
}

function buildMatchPickerInline(tid, stage) {
  const teams      = db.get('teams');
  const getTeam    = id => teams.find(t => t.id === id) || { name: 'Unknown' };
  const allMatches = db.get('matches').filter(m => m.tournament_id === tid && (stage ? m.stage === stage : true));
  if (!allMatches.length) return null;

  // Active round: highest round# with pending matches (highest# = earliest KO stage)
  // If all done: show lowest round# (most recent = Final area)
  const pendingRounds = allMatches.filter(m => m.status === 'pending').map(m => m.round);
  const activeRound   = pendingRounds.length
    ? Math.max(...pendingRounds)
    : Math.min(...allMatches.map(m => m.round));
  const roundMatches  = allMatches
    .filter(m => m.round === activeRound)
    .sort((a, b) => (a.status === 'played' ? 1 : 0) - (b.status === 'played' ? 1 : 0));
  const allRoundDone  = roundMatches.length > 0 && roundMatches.every(m => m.status === 'played');
  const pendingCount  = roundMatches.filter(m => m.status === 'pending').length;

  // Round / advance button labels
  const ROUND_LABELS = { 1: 'Final', 2: 'Semi-Finals', 4: 'Quarter-Finals', 8: 'Round of 16', 16: 'Round of 32' };
  const roundLabel   = ROUND_LABELS[activeRound] || ('Round ' + activeRound);
  const nextRound    = Math.floor(activeRound / 2);
  const nextLabel    = nextRound >= 1 ? ('Advance to ' + (ROUND_LABELS[nextRound] || 'Next Round')) : '';

  const statusLine = allRoundDone
    ? 'All done — go back to the main panel to advance.'
    : (pendingCount + ' result' + (pendingCount !== 1 ? 's' : '') + ' remaining in ' + roundLabel);

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      txt('**' + roundLabel + ' — Select a match**'),
      SEP,
      txt(statusLine),
      SEP,
      { type: 1, components: [{
        type: 3, custom_id: `p1_${tid}_result_sel`,
        placeholder: 'Select match to add/edit result…',
        options: roundMatches.slice(0, 25).map(m => {
          const hd = m.home_forfeit ? 'Ø' : String(m.home_goals != null ? m.home_goals : (m.home_score != null ? m.home_score : '?'));
          const ad = m.away_forfeit ? 'Ø' : String(m.away_goals != null ? m.away_goals : (m.away_score != null ? m.away_score : '?'));
          return {
            label: `${getTeam(m.home_team_id).name} vs ${getTeam(m.away_team_id).name}`,
            value: String(m.id),
            description: m.status === 'played' ? ('Edit: ' + hd + ' — ' + ad) : 'Pending',
          };
        }),
      }]},
      SEP,
      { type: 1, components: [
        { type: 2, style: 2, label: '← Back', custom_id: `p1_${tid}_refresh` },
      ]},
    ]}],
  };
}


function buildKORoundMatchesPanel(tid) {
  const teams      = db.get('teams');
  const getTeam    = id => teams.find(t => t.id === id) || { name: 'Unknown' };
  const allKO      = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'knockout');
  if (!allKO.length) return null;

  // Active round: highest round# with pending matches (earliest KO stage)
  const pendingRds = allKO.filter(m => m.status === 'pending').map(m => m.round);
  const activeRound = pendingRds.length
    ? Math.max(...pendingRds)
    : Math.min(...allKO.map(m => m.round));

  const ROUND_LABELS = { 1: 'Final', 2: 'Semi-Finals', 4: 'Quarter-Finals', 8: 'Round of 16', 16: 'Round of 32' };
  const roundLabel  = ROUND_LABELS[activeRound] || ('Round ' + activeRound);

  const roundMatches = allKO
    .filter(m => m.round === activeRound)
    .sort((a, b) => (a.status === 'played' ? 1 : 0) - (b.status === 'played' ? 1 : 0));

  const played  = roundMatches.filter(m => m.status === 'played').length;
  const total   = roundMatches.length;
  const allDone = played === total && total > 0;

  const inner = [
    txt(`**📊 Add Result — ${roundLabel}**`),
    SEP,
    txt(`**${played}/${total}** matches played` + (allDone ? ' — all done, go back to advance.' : '')),
    SEP,
  ];

  for (const m of roundMatches) {
    const home = getTeam(m.home_team_id).name;
    const away = getTeam(m.away_team_id).name;
    let label;
    if (m.status === 'played') {
      const hs  = m.home_forfeit ? 'Ø' : String(m.home_goals ?? m.home_score ?? '?');
      const as_ = m.away_forfeit ? 'Ø' : String(m.away_goals ?? m.away_score ?? '?');
      label = `✅  ${home}  ${hs} — ${as_}  ${away}`;
    } else {
      label = `⏳  ${home}  vs  ${away}`;
    }
    inner.push({ type: 1, components: [{ type: 2, style: m.status === 'played' ? 2 : 1, label: label.slice(0, 80), custom_id: `p1_${tid}_matchbtn_${m.id}` }] });
  }

  inner.push(SEP);
  inner.push({ type: 1, components: [
    { type: 2, style: 2, label: '← Back', custom_id: `p1_${tid}_refresh` },
  ]});

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

function buildGroupSelectorPanel(tid) {
  const allGM      = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
  if (!allGM.length) return null;
  const pendingGM  = allGM.filter(m => m.status !== 'played');
  const allRounds  = [...new Set(allGM.map(m => m.round))].sort((a, b) => a - b);
  const _cfgRound  = db.getConfig('group_round_' + tid);
  const curRound   = _cfgRound || (pendingGM.length ? Math.min(...pendingGM.map(m => m.round)) : allRounds[allRounds.length - 1]);
  const totalRounds = allRounds.length;
  const curPending  = allGM.filter(m => m.round === curRound && m.status !== 'played').length;
  const curPlayed   = allGM.filter(m => m.round === curRound && m.status === 'played').length;
  const totalInRound = allGM.filter(m => m.round === curRound).length;
  const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const groups = [...new Set(ttRows.map(tt => tt.group_name).filter(Boolean))].sort();
  const allRoundDone = curPending === 0;
  const inner = [
    txt(`**\ud83d\udcca Add Result \u2014 Round ${curRound}/${totalRounds}**`),
    SEP,
    txt(`**${curPlayed}/${totalInRound}** matches played this round` + (allRoundDone ? ' \u2014 go back to advance.' : '')),
    SEP,
  ];
  for (let i = 0; i < groups.length; i += 5) {
    inner.push({ type: 1, components: groups.slice(i, i + 5).map(g => ({
      type: 2, style: 2, label: `Group ${g}`,
      custom_id: `p1_${tid}_grpsel_${g}_${curRound}`,
    }))});
  }
  inner.push(SEP);
  inner.push({ type: 1, components: [
    { type: 2, style: 2, label: '\u2190 Back', custom_id: `p1_${tid}_refresh` },
  ]});
  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}


function buildRoundMatchesPanel(tid, round) {
  const allGM = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
  if (!allGM.length) return null;
  const allRounds   = [...new Set(allGM.map(m => m.round))].sort((a, b) => a - b);
  const totalRounds = allRounds.length;
  const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const teams   = db.get('teams');
  const getTeam = id => teams.find(t2 => t2.id === id) || { name: 'Unknown' };
  const getGrp  = id => ttRows.find(tt => tt.team_id === id)?.group_name;

  const roundMatches = allGM.filter(m => m.round === round);
  if (!roundMatches.length) return null;

  const groups  = [...new Set(roundMatches.map(m => getGrp(m.home_team_id)).filter(Boolean))].sort();
  const played  = roundMatches.filter(m => m.status === 'played').length;
  const total   = roundMatches.length;
  const allDone = played === total && total > 0;

  const inner = [
    txt(`**\u1F4CA Add Result \u2014 Round ${round}/${totalRounds}**`),
    SEP,
    txt(`**${played}/${total}** matches played this round` + (allDone ? ' \u2014 all done, go back to advance.' : '')),
    SEP,
  ];

  for (const g of groups) {
    const gMatches = roundMatches.filter(m => getGrp(m.home_team_id) === g);
    inner.push(txt(`**Group ${g}**`));
    for (const m of gMatches) {
      const home = getTeam(m.home_team_id).name;
      const away = getTeam(m.away_team_id).name;
      let label;
      if (m.status === 'played') {
        const hs  = m.home_forfeit ? '\u00d8' : String(m.home_goals ?? m.home_score ?? '?');
        const as_ = m.away_forfeit ? '\u00d8' : String(m.away_goals ?? m.away_score ?? '?');
        label = `\u2705  ${home}  ${hs} \u2014 ${as_}  ${away}`;
      } else {
        label = `\u23f3  ${home}  vs  ${away}`;
      }
      inner.push({ type: 1, components: [{ type: 2, style: m.status === 'played' ? 2 : 1, label: label.slice(0, 80), custom_id: `p1_${tid}_matchbtn_${m.id}` }] });
    }
    inner.push(SEP);
  }

  inner.push({ type: 1, components: [
    { type: 2, style: 2, label: '\u2190 Back', custom_id: `p1_${tid}_addresult` },
  ]});

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

function buildGroupMatchPicker(tid, group, round) {
  const allGM      = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
  const allRounds  = [...new Set(allGM.map(m => m.round))].sort((a, b) => a - b);
  const totalRounds = allRounds.length;
  const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const teams   = db.get('teams');
  const getTeam = id => teams.find(t2 => t2.id === id) || { name: 'Unknown' };
  const getGrp  = id => ttRows.find(tt => tt.team_id === id)?.group_name;
  const pendingInRound = allGM.filter(m => m.round === round && m.status !== 'played').length;
  const groupMatches   = allGM.filter(m => m.round === round && getGrp(m.home_team_id) === group);
  const allRoundDone   = pendingInRound === 0;
  // nextLabel replaced by advLabel below
  const options = groupMatches.map(m => {
    const hd = m.home_forfeit ? '\u00d8' : String(m.home_goals != null ? m.home_goals : (m.home_score != null ? m.home_score : '?'));
    const ad = m.away_forfeit ? '\u00d8' : String(m.away_goals != null ? m.away_goals : (m.away_score != null ? m.away_score : '?'));
    return {
      label: `${getTeam(m.home_team_id).name} vs ${getTeam(m.away_team_id).name}`,
      value: String(m.id),
      description: m.status === 'played' ? `\u270f\ufe0f Edit: ${hd} \u2014 ${ad}` : '\u23f3 Pending',
    };
  });
  const inner = [
    txt(`**\ud83d\udcca Group ${group} \u2014 Round ${round}/${totalRounds}**`),
    SEP,
  ];
  if (!options.length) {
    inner.push(txt('No matches in this group for this round.'));
  } else {
    inner.push({ type: 1, components: [{ type: 3, custom_id: `p1_${tid}_result_sel`,
      placeholder: 'Select match to add/edit result\u2026', options }] });
  }
  inner.push(SEP);
  inner.push({ type: 1, components: [
    { type: 2, style: 2, label: '\u2190 Groups', custom_id: `p1_${tid}_grpback` },
  ]});
  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

function buildResultPreviewEphemeral(matchId) {
  const match = db.findById('matches', matchId);
  const teams = db.get('teams');
  const home  = teams.find(t => t.id === match?.home_team_id)?.name || 'Home';
  const away  = teams.find(t => t.id === match?.away_team_id)?.name || 'Away';
  const isKnockout = match?.stage === 'knockout';
  const modal = new ModalBuilder()
    .setCustomId(`p1_result_modal_${matchId}`)
    .setTitle(isKnockout ? `KO: ${home.slice(0, 20)} vs ${away.slice(0, 20)}` : `Result: ${home.slice(0, 25)} vs ${away.slice(0, 25)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('home_score').setLabel(`${home.slice(0, 40)} — Score`)
          .setStyle(TextInputStyle.Short).setPlaceholder('0–20 | F forfeit | Ø=0').setRequired(true)
          .setValue(match?.home_forfeit ? 'F' : (match?.home_goals != null ? String(match.home_goals) : (match?.home_score != null ? String(match.home_score) : '')))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('away_score').setLabel(`${away.slice(0, 40)} — Score`)
          .setStyle(TextInputStyle.Short).setPlaceholder('0–20 | F forfeit | Ø=0').setRequired(true)
          .setValue(match?.away_forfeit ? 'F' : (match?.away_goals != null ? String(match.away_goals) : (match?.away_score != null ? String(match.away_score) : '')))
      ),
    );
  if (isKnockout) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('home_pens').setLabel(`${home.slice(0, 30)} Penalties (if draw)`)
          .setStyle(TextInputStyle.Short).setPlaceholder('Leave blank if no draw').setRequired(false)
          .setValue(match?.home_pens != null ? String(match.home_pens) : '')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('away_pens').setLabel(`${away.slice(0, 30)} Penalties (if draw)`)
          .setStyle(TextInputStyle.Short).setPlaceholder('Leave blank if no draw').setRequired(false)
          .setValue(match?.away_pens != null ? String(match.away_pens) : '')
      ),
    );
  }
  return modal;
}

// ── Add team — search-filtered select ────────────────────────────────────────
// ── Score picker panels (select menus — group stage) ─────────────────────
function buildHomeScorePicker(tid, matchId) {
  const match = db.findById('matches', matchId);
  const teams = db.get('teams');
  const home  = teams.find(t2 => t2.id === match?.home_team_id)?.name || 'Home';
  const away  = teams.find(t2 => t2.id === match?.away_team_id)?.name || 'Away';
  const opts  = [
    { label: 'Forfeit  (Ø)', value: 'F', description: 'Team did not show' },
    ...Array.from({ length: 21 }, (_, i) => ({ label: String(i), value: String(i) })),
  ];
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      txt(),
      SEP,
      { type: 1, components: [{ type: 3, custom_id: `p1_${tid}_rs_home_${matchId}`,
        placeholder: home + ' score…', options: opts }] },
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: '← Back', custom_id: `p1_${tid}_addresult` }] },
    ]}],
  };
}

function buildAwayScorePicker(tid, matchId, homeVal) {
  const match    = db.findById('matches', matchId);
  const teams    = db.get('teams');
  const home     = teams.find(t2 => t2.id === match?.home_team_id)?.name || 'Home';
  const away     = teams.find(t2 => t2.id === match?.away_team_id)?.name || 'Away';
  const homeDisp = homeVal === 'F' ? 'Ø' : homeVal;
  const opts     = [
    { label: 'Forfeit  (Ø)', value: 'F', description: 'Team did not show' },
    ...Array.from({ length: 21 }, (_, i) => ({ label: String(i), value: String(i) })),
  ];
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      txt(),
      SEP,
      { type: 1, components: [{ type: 3, custom_id: `p1_${tid}_rs_away_${matchId}`,
        placeholder: away + ' score…', options: opts }] },
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: '← Back', custom_id: `p1_${tid}_addresult` }] },
    ]}],
  };
}

function buildTeamSearchResults(tid, query) {
  const { fuzzyTeamSearch } = require('../utils/fuzzyTeam');
  const enrolled  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => tt.team_id);
  const available = db.get('teams').filter(t => !enrolled.includes(t.id));
  const usageCount = {};
  for (const tt of db.get('tournament_teams')) usageCount[tt.team_id] = (usageCount[tt.team_id] || 0) + 1;
  const results   = query
    ? fuzzyTeamSearch(query, available, 25)
    : available.sort((a, b) => (usageCount[b.id] || 0) - (usageCount[a.id] || 0) || a.name.localeCompare(b.name)).slice(0, 25);

  if (!results.length) return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x57F287, components: [
      txt(query ? `No teams found matching **"${query}"** — try a different name.` : 'All teams are already enrolled.'),
      SEP,
      { type: 1, components: [
        { type: 2, style: 1, label: '🔍️  Search by Name', custom_id: `p2_${tid}_addteam_search` },
        { type: 2, style: 2, label: 'Cancel',       custom_id: `p2_${tid}_refresh`  },
      ]},
    ]}],
  };

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x57F287, components: [
      txt(`**${results.length}** team${results.length !== 1 ? 's' : ''} found${query ? ` for **"${query}"**` : ''} — select one to enroll`),
      SEP,
      { type: 1, components: [{
        type: 3, custom_id: `p2_${tid}_team_sel`,
        placeholder: 'Select team to enroll...',
        options: results.slice(0, 25).map(t => ({ label: t.name.slice(0, 100), value: String(t.id) })),
      }]},
      SEP,
      { type: 1, components: [
        { type: 2, style: 1, label: '🔍️  Search by Name', custom_id: `p2_${tid}_addteam_search` },
        { type: 2, style: 2, label: 'Cancel',       custom_id: `p2_${tid}_refresh`  },
      ]},
    ]}],
  };
}


function buildTeamSearchStep2(tid, query, queueEntries) {
  const { fuzzyTeamSearch } = require('../utils/fuzzyTeam');
  const enrolled  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => tt.team_id);
  const inQueue   = (queueEntries || []).map(e => e.teamId);
  const exclude   = new Set([...enrolled, ...inQueue]);
  const available = db.get('teams').filter(t => !exclude.has(t.id));
  const usageCount = {};
  for (const tt of db.get('tournament_teams')) usageCount[tt.team_id] = (usageCount[tt.team_id] || 0) + 1;
  const results = query
    ? fuzzyTeamSearch(query, available, 25)
    : available.sort((a, b) => (usageCount[b.id] || 0) - (usageCount[a.id] || 0) || a.name.localeCompare(b.name)).slice(0, 25);
  const queueTxt = (queueEntries && queueEntries.length > 0)
    ? '**Queue**\n' + queueEntries.map(e => `\u2705  <@${e.userIds[0]}>${e.userIds[1] ? ` & <@${e.userIds[1]}>` : ''} \u2192 ${e.teamName}`).join('\n') + '\n\n'
    : '';
  const doneOrCancel = (queueEntries && queueEntries.length)
    ? [{ type: 2, style: 3, label: 'Done', custom_id: `p2_${tid}_addteam_done` },
       { type: 2, style: 2, label: '\u2190 Cancel', custom_id: `p2_${tid}_refresh` }]
    : [{ type: 2, style: 1, label: '\uD83D\uDD0D\uFE0F  Search by Name', custom_id: `p2_${tid}_addteam_teamsearch` },
       { type: 2, style: 2, label: 'Cancel', custom_id: `p2_${tid}_refresh` }];
  if (!results.length) return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x57F287, components: [
      txt(queueTxt + (query ? `No teams found matching **\u201c${query}\u201d** \u2014 try a different name.` : '\u26a0\ufe0f All teams are already enrolled.')),
      SEP,
      { type: 1, components: [
        { type: 2, style: 1, label: '\uD83D\uDD0D\uFE0F  Search by Name', custom_id: `p2_${tid}_addteam_teamsearch` },
        { type: 2, style: queueEntries && queueEntries.length ? 1 : 2, label: queueEntries && queueEntries.length ? 'Done' : 'Cancel',
          custom_id: queueEntries && queueEntries.length ? `p2_${tid}_addteam_done` : `p2_${tid}_refresh` },
      ]},
    ]}],
  };
  const resultTxt = queueTxt + (query ? `**${results.length}** team${results.length !== 1 ? 's' : ''} found for **\u201c${query}\u201d**` : '');
  const innerComps = [];
  if (resultTxt) innerComps.push(txt(resultTxt));
  innerComps.push(SEP);
  innerComps.push({ type: 1, components: [{ type: 3, custom_id: `p2_${tid}_addteam_teamsel`,
    placeholder: 'Select team...', options: results.slice(0, 25).map(t => ({ label: t.name.slice(0, 100), value: String(t.id) })) }]});
  innerComps.push(SEP);
  innerComps.push({ type: 1, components: [
    { type: 2, style: 1, label: '\uD83D\uDD0D\uFE0F  Search by Name', custom_id: `p2_${tid}_addteam_teamsearch` },
    { type: 2, style: queueEntries && queueEntries.length ? 3 : 2, label: queueEntries && queueEntries.length ? 'Done' : 'Cancel',
      custom_id: queueEntries && queueEntries.length ? `p2_${tid}_addteam_done` : `p2_${tid}_refresh` },
  ]});
  return { flags: 32768, components: [{ type: 17, accent_color: 0x57F287, components: innerComps }] };
}
// ── Post helper ───────────────────────────────────────────────────────────────
async function postToChannel(client, channelId, payload) {
  if (!channelId) return null;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch) return null;
  return ch.send(payload).catch(() => null);
}

// Ping role (plain msg) then post embed — two separate messages, no tag for teams list
async function postWithPing(client, channelId, roleId, payload) {
  if (!channelId) return null;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch) return null;
  let merged = payload;
  if (roleId) {
    // Component V2 messages (flags 32768) ignore the content field 
    // inject the mention as the first text component inside the container
    const isV2 = (payload.flags & 32768) && Array.isArray(payload.components);
    if (isV2) {
      const container = payload.components[0];
      if (container && container.type === 17 && Array.isArray(container.components)) {
        merged = {
          ...payload,
          components: [
            {
              ...container,
              components: [
                { type: 10, content: '<@&' + roleId + '>' },
                ...container.components,
              ],
            },
            ...payload.components.slice(1),
          ],
        };
      }
    } else {
      merged = { ...payload, content: '<@&' + roleId + '>' + (payload.content ? '\n' + payload.content : '') };
    }
  }
  return ch.send(merged).catch(() => null);
}

// Small component v2 ephemeral reply that auto-deletes after 5 s (publish panel feedback)
async function p3SmallReply(interaction, message) {
  try { await interaction.deferUpdate(); } catch {}
  const payload = {
    flags: 64 | 32768,
    components: [{ type: 17, accent_color: 0xFF0049, components: [
      { type: 10, content: message },
    ]}],
  };
  const msg = await interaction.followUp(payload).catch(() => null);
  if (msg) setTimeout(() => interaction.deleteReply(msg.id).catch(() => {}), 5_000);
}

async function refreshBracketMessage(client, tid) {
  const ref = db.getConfig('bracket_ref_' + tid);
  if (!ref) return;
  try {
    const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
    if (!msg) return;
    const payload = makeBracketPost(tid);
    if (payload) await msg.edit(payload).catch(() => {});
  } catch {}
}

async function refreshStandingsMessage(client, tid) {
  const t = getT(tid);
  if (!t) return;
  const payload = buildGroupStandingsEmbed ? buildGroupStandingsEmbed(tid) : null;
  if (!payload) return;
  const ref = db.getConfig('standings_ref_' + tid);
  if (ref) {
    // Update existing standings post (cache-first)
    try {
      const ch  = client.channels.cache.get(ref.channelId)
                ?? await client.channels.fetch(ref.channelId).catch(() => null);
      if (!ch) return;
      const msg = ch.messages.cache.get(ref.messageId)
                ?? await ch.messages.fetch(ref.messageId).catch(() => null);
      if (!msg) return;
      await msg.edit(payload).catch(() => {});
    } catch {}
  } else {
    // No existing post — auto-post to results channel on Next
    const _ch = t.channels || {};
    const postCh = _ch.results || _ch.management;
    if (!postCh) return;
    try {
      const _role = t.tag_on ? t.registration_role_id : null;
      const posted = await postWithPing(client, postCh, _role, payload).catch(() => null);
      if (posted) db.setConfig('standings_ref_' + tid, { channelId: postCh, messageId: posted.id });
    } catch {}
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
// ── P1 Settings Panel (select-menu based) ────────────────────────────────────
function buildSettingsPanel(t, pending) {
  const cfg     = getTplCfg(t.template || '');
  const tid     = t.id;
  const SEP     = { type: 14, divider: true, spacing: 1 };
  const nGroups = pending.teams_per_group > 0
    ? Math.ceil(pending.team_count / pending.teams_per_group) : '?';

  const mkSel = (label, action, opts, current) => ({
    type: 1,
    components: [{
      type: 3, custom_id: `p1_${tid}_${action}`,
      placeholder: `${label}: ${current}`,
      options: opts.map(v => ({ label: String(v), value: String(v), default: String(v) === String(current) })),
    }],
  });

  const lockedLines = [
    cfg.team_count_opts.length === 1 ? `Teams: **${pending.team_count}**`                : null,
    cfg.tpg_opts.length        === 1 ? `Groups of: **${pending.teams_per_group}**`        : null,
    cfg.apg_opts.length        === 1 ? `Advance: **${pending.advance_per_group}/group**`  : null,
    cfg.ppt_opts.length        === 1 ? `Players/team: **${pending.players_per_team}**`    : null,
  ].filter(Boolean);

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      { type: 10, content: `**⚙️ Settings — ${t.name}**
Groups: **${nGroups}** · Advance: **${pending.advance_per_group}/group**` },
      SEP,
      ...(cfg.team_count_opts.length > 1 ? [mkSel('Total Teams',        'settings_tc',  cfg.team_count_opts,  pending.team_count)]        : []),
      ...(cfg.tpg_opts.length        > 1 ? [mkSel('Teams per Group',    'settings_tpg', cfg.tpg_opts,         pending.teams_per_group)]    : []),
      ...(cfg.apg_opts.length        > 1 ? [mkSel('Advance per Group',  'settings_apg', cfg.apg_opts,         pending.advance_per_group)]  : []),
      ...(cfg.ppt_opts.length        > 1 ? [mkSel('Players per Team',   'settings_ppt', cfg.ppt_opts,         pending.players_per_team)]   : []),
      ...(lockedLines.length          > 0 ? [{ type: 10, content: `-# Fixed: ${lockedLines.join(' · ')}` }] : []),
      SEP,
      { type: 1, components: [
        { type: 2, style: 3, label: '💾 Save',    custom_id: `p1_${tid}_settings_save`   },
        { type: 2, style: 2, label: '🔢 Season',  custom_id: `p1_${tid}_settings_season` },
        { type: 2, style: 2, label: 'Refresh',     custom_id: `p1_${tid}_refresh`         },
      ]},
    ]}],
  };
}



// ── Score Picker Panel ────────────────────────────────────────────────────────
function buildBotolaScorePicker(tid, matchId, state) {
  const match = db.findById('matches', matchId);
  if (!match) return null;
  const teams = db.get('teams');
  const home  = teams.find(t2 => t2.id === match.home_team_id)?.name || 'Home';
  const away  = teams.find(t2 => t2.id === match.away_team_id)?.name || 'Away';
  const t     = db.findById('tournaments', tid);
  const isKO  = match.stage === 'knockout';

  const { home: hv, away: av, hp, ap } = state;
  const homeForfeit  = hv === 'forfeit';
  const awayForfeit  = av === 'forfeit';
  const bothNumeric  = typeof hv === 'number' && typeof av === 'number';
  const isDraw       = bothNumeric && hv === av && isKO;

  // Status line
  let statusLine, accent;
  if (homeForfeit && awayForfeit) {
    statusLine = 'Result saved: **\u00D8 \u2014 \u00D8**  \u2022  Both teams forfeit';
    accent = 0xED4245;
  } else if (homeForfeit && typeof av === 'number') {
    statusLine = 'Result saved: **\u00D8 \u2014 ' + av + '**  \u2022  ' + home + ' forfeits';
    accent = 0xED4245;
  } else if (awayForfeit && typeof hv === 'number') {
    statusLine = 'Result saved: **' + hv + ' \u2014 \u00D8**  \u2022  ' + away + ' forfeits';
    accent = 0xED4245;
  } else if (bothNumeric && !isDraw) {
    statusLine = 'Result saved: **' + hv + ' \u2014 ' + av + '**';
    accent = 0x57F287;
  } else if (isDraw && typeof hp === 'number' && typeof ap === 'number' && hp !== ap) {
    const pw = hp > ap ? home : away;
    statusLine = 'Result saved: **' + hv + ' \u2014 ' + av + '** (Draw)  \u2022  ' + pw + ' wins on pens **' + hp + ' \u2014 ' + ap + '**';
    accent = 0x57F287;
  } else if (isDraw) {
    statusLine = '-# Draw \u2014 select penalty scores below';
    accent = 0xFEE75C;
  } else {
    statusLine = '-# Select scores for both teams';
    accent = 0x5865F2;
  }

  // Option builders
  const normalOpts = (sel) => [
    { label: 'Forfeit', value: 'forfeit', default: sel === 'forfeit' },
    ...Array.from({ length: 21 }, (_, i) => ({
      label: String(i), value: String(i),
      default: sel === i || sel === String(i),
    })),
  ];
  const minThreeOpts = (sel) => [
    { label: 'Forfeit', value: 'forfeit', default: sel === 'forfeit' },
    ...Array.from({ length: 18 }, (_, i) => ({
      label: String(i + 3), value: String(i + 3),
      default: sel === (i + 3) || sel === String(i + 3),
    })),
  ];
  const penOpts = (sel) => Array.from({ length: 21 }, (_, i) => ({
    label: String(i), value: String(i),
    default: sel === i || sel === String(i),
  }));

  const homeOpts = awayForfeit ? minThreeOpts(hv) : normalOpts(hv);
  const awayOpts = homeForfeit ? minThreeOpts(av) : normalOpts(av);

  const stageLabel = isKO
    ? (match.round_name || 'Knockout')
    : ('Group Stage \u00b7 Round ' + (match.round || 1));

  const inner = [
    txt('**\ud83d\udcca Add Result \u2014 ' + (t ? t.name : 'Tournament') + '**\n' + home + '  vs  ' + away + '  \u00b7  ' + stageLabel),
    SEP,
    txt(statusLine),
    SEP,
    txt('**' + home + '** score'),
    { type: 1, components: [{ type: 3, custom_id: 'p1_' + tid + '_rs_home_' + matchId, placeholder: home + ' score\u2026', options: homeOpts }] },
    txt('**' + away + '** score'),
    { type: 1, components: [{ type: 3, custom_id: 'p1_' + tid + '_rs_away_' + matchId, placeholder: away + ' score\u2026', options: awayOpts }] },
  ];

  if (isDraw) {
    inner.push(SEP);
    inner.push(txt('Draw \u2014 select penalty scores'));
    inner.push(txt('**' + home + '** penalties'));
    inner.push({ type: 1, components: [{ type: 3, custom_id: 'p1_' + tid + '_rs_hp_' + matchId, placeholder: home + ' penalties\u2026', options: penOpts(hp) }] });
    inner.push(txt('**' + away + '** penalties'));
    inner.push({ type: 1, components: [{ type: 3, custom_id: 'p1_' + tid + '_rs_ap_' + matchId, placeholder: away + ' penalties\u2026', options: penOpts(ap) }] });
  }

  // Back button: for group matches return to round match list; for KO go to KO picker
  const _backMatch = db.findById('matches', matchId);
  let _backId = 'p1_' + tid + '_addresult';
  if (_backMatch && _backMatch.stage !== 'knockout') {
    _backId = 'p1_' + tid + '_roundback_' + (_backMatch.round || 1);
  }
  inner.push(SEP);
  inner.push({ type: 1, components: [
    { type: 2, style: 2, label: '\u2190 Back', custom_id: _backId },
    { type: 2, style: 2, label: 'Refresh',    custom_id: 'p1_' + tid + '_refresh' },
  ]});
  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: accent, components: inner }] };
}

// ── Save score and refresh panels ─────────────────────────────────────────────

// Send a screenshot round header to the screenshot channel when a round completes
async function sendScreenshotRoundMessage(cli, tid, match) {
  const t = getT(tid);
  if (!t || !t.channels?.screenshot) return;
  const scrCh = await cli.channels.fetch(t.channels.screenshot).catch(() => null);
  if (!scrCh) return;

  const ROUND_LABELS = { 1: 'Final', 2: 'Semi Final', 4: 'Quarter Final', 8: 'Round of 16', 16: 'Round of 32' };
  let label = null;

  if (match.stage === 'group') {
    const roundMatches = db.get('matches').filter(m =>
      m.tournament_id === tid && m.stage === 'group' && m.round === match.round
    );
    if (roundMatches.length > 0 && roundMatches.every(m => m.status === 'played')) {
      label = `# Round ${match.round}`;
    }
  } else if (match.stage === 'knockout') {
    const koMatches = db.get('matches').filter(m =>
      m.tournament_id === tid && m.stage === 'knockout' && m.round === match.round
    );
    if (koMatches.length > 0 && koMatches.every(m => m.status === 'played')) {
      label = `# ${ROUND_LABELS[match.round] || 'Round ' + match.round}`;
    }
  }

  if (!label) return;
  await scrCh.send({
    flags: 32768,
    components: [{ type: 17, accent_color: 0x00FF76, components: [{ type: 10, content: label }] }],
  }).catch(() => {});
}

async function _saveBotolaScore(cli, tid, matchId, state, interaction) {
  // Defer immediately so Discord's 3-second deadline is met even if DB work takes time
  await interaction.deferUpdate().catch(() => {});

  const match = db.findById('matches', matchId);
  if (!match) return interaction.editReply({ content: '\u274c Match not found.', components: [] });
  const _wasPlayed = match.status === 'played';

  const { home: hv, away: av, hp, ap } = state;
  const homeForfeit = hv === 'forfeit';
  const awayForfeit = av === 'forfeit';
  const isKO        = match.stage === 'knockout';

  if (homeForfeit || awayForfeit) {
    if (homeForfeit && awayForfeit) {
      // Double forfeit — both teams get 0 points (both count as a loss, no goals added)
      const _m0 = db.findById('matches', matchId);
      if (_m0 && _m0.status === 'played' && _m0.home_score != null && _m0.stage === 'group') {
        _reverseTTStandings(tid, _m0);
      }
      const _lp0 = getT(tid)?.loss_pts ?? 0;
      const _htt = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === _m0.home_team_id);
      const _att = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === _m0.away_team_id);
      if (_htt) db.update('tournament_teams', _htt.id, { losses: (_htt.losses || 0) + 1, points: (_htt.points || 0) + _lp0 });
      if (_att) db.update('tournament_teams', _att.id, { losses: (_att.losses || 0) + 1, points: (_att.points || 0) + _lp0 });
      db.update('matches', matchId, {
        status: 'played', home_score: 0, away_score: 0,
        home_forfeit: true, away_forfeit: true,
        home_goals: null, away_goals: null,
      });
    } else {
      // Single forfeit — non-forfeit side gets their score (min 3)
      const effHome = homeForfeit ? 0 : (typeof hv === 'number' ? hv : 3);
      const effAway = awayForfeit ? 0 : (typeof av === 'number' ? av : 3);
      if (homeForfeit) state.away = effAway;
      if (awayForfeit) state.home = effHome;
      updateStandings(tid, matchId, effHome, effAway);
      db.update('matches', matchId, {
        home_forfeit: homeForfeit, away_forfeit: awayForfeit,
        home_goals: homeForfeit ? null : effHome,
        away_goals: awayForfeit ? null : effAway,
      });
    }
    refreshPanels23(cli, tid).catch(() => {});

  } else if (typeof hv === 'number' && typeof av === 'number') {
    if (!isKO || hv !== av) {
      // Decisive result
      updateStandings(tid, matchId, hv, av);
      db.update('matches', matchId, { home_forfeit: false, away_forfeit: false, home_goals: hv, away_goals: av });
      refreshPanels23(cli, tid).catch(() => {});
      if (isKO) refreshBracketMessage(cli, tid).catch(() => {});

    } else if (typeof hp === 'number' && typeof ap === 'number' && hp !== ap) {
      // KO draw with valid penalties
      const penWinner = hp > ap ? match.home_team_id : match.away_team_id;
      db.update('matches', matchId, {
        status: 'played', home_score: hv, away_score: av,
        home_pens: hp, away_pens: ap, pen_winner: penWinner,
        home_forfeit: false, away_forfeit: false,
        home_goals: hv, away_goals: av,
      });
      refreshPanels23(cli, tid).catch(() => {});
      refreshBracketMessage(cli, tid).catch(() => {});
    }
    // KO equal pens or pens not set yet — no save, just show updated panel
  }

  // Send screenshot round header if this score completed a round
  if (!_wasPlayed) {
    const _matchNow = db.findById('matches', matchId);
    if (_matchNow && _matchNow.status === 'played') {
      sendScreenshotRoundMessage(cli, tid, _matchNow).catch(() => {});
    }
  }
  tmpSet('p1rs_' + matchId, state);
  const panel = buildBotolaScorePicker(tid, matchId, state);
  if (!panel) return interaction.editReply({ content: '\u274c Match not found.', components: [] });
  return interaction.editReply(panel);
}

async function handleBotolaInteraction(interaction) {
  // Auto-delete all ephemeral replies so botola messages are temporary
  const _origReply = interaction.reply.bind(interaction);
  interaction.reply = async (opts) => {
    // For plain text-only ephemeral confirmations (e.g. "✅ Posted to #channel"),
    // ephemeral initial replies cannot be deleted via the API.
    // Use deferUpdate + ephemeral followUp + deleteReply(id) instead.
    if (opts && opts.ephemeral && opts.content && !opts.components && !opts.embeds) {
      try { await interaction.deferUpdate(); } catch {}
      const msg = await interaction.followUp({ ...opts }).catch(() => null);
      if (msg) setTimeout(() => interaction.deleteReply(msg.id).catch(() => {}), 5_000);
      return msg;
    }
    return _origReply(opts);
  };
  const id  = interaction.customId;
  const cli = interaction.client;

  // ── /botola — tournament clicked ──────────────────────────────────────────
  if (id.startsWith('bot_t_')) {
    if (!isBotolaManager(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('bot_t_', ''));
    const t   = getT(tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });

    const ch = t.channels || {};
    if (!ch.management) {
      return interaction.reply({
        content: '❌ No management channel configured for this tournament.\nUse `/manage → Set Channels` first.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const mgmtCh = await cli.channels.fetch(ch.management).catch(() => null);
    if (!mgmtCh) return interaction.editReply({ content: '❌ Management channel not found.' });

    // Delete old panels in parallel (only this tournament's refs, never others').
    await Promise.all(['panel1_ref', 'panel2_ref', 'panel3_ref'].map(async refKey => {
      const ref = t[refKey];
      if (!ref?.messageId) return;
      const old = await mgmtCh.messages.fetch(ref.messageId).catch(() => null);
      if (old) await old.delete().catch(() => {});
    }));
    db.update('tournaments', tid, { panel1_ref: null, panel2_ref: null, panel3_ref: null });

    // Send panels sequentially to preserve order in channel
    const msg1 = await mgmtCh.send(buildPanel1(t)).catch(() => null);
    const msg2 = await mgmtCh.send(buildPanel2(t)).catch(() => null);
    const msg3 = await mgmtCh.send(buildPanel3(t)).catch(() => null);
    // Save all refs in one write
    db.update('tournaments', tid, {
      panel1_ref: msg1 ? { channelId: mgmtCh.id, messageId: msg1.id } : null,
      panel2_ref: msg2 ? { channelId: mgmtCh.id, messageId: msg2.id } : null,
      panel3_ref: msg3 ? { channelId: mgmtCh.id, messageId: msg3.id } : null,
    });

    return interaction.editReply({ content: `✅ Panels sent to <#${ch.management}>.` });
  }

  // /panels select menu - tournament chosen
  if (id === 'bot_sel_t') {
    if (!isBotolaManager(interaction.member)) return noPermission(interaction);
    const tid = parseInt(interaction.values[0]);
    const t   = getT(tid);
    if (!t) return interaction.reply({ content: '\u274c Tournament not found.', ephemeral: true });
    const ch = t.channels || {};
    if (!ch.management) {
      return interaction.reply({ content: '\u274c No management channel configured.\nUse /manage to set channels first.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const mgmtCh2 = await cli.channels.fetch(ch.management).catch(() => null);
    if (!mgmtCh2) return interaction.editReply({ content: '\u274c Management channel not found.' });
    await Promise.all(['panel1_ref', 'panel2_ref', 'panel3_ref'].map(async refKey => {
      const ref = t[refKey];
      if (!ref?.messageId) return;
      const old = await mgmtCh2.messages.fetch(ref.messageId).catch(() => null);
      if (old) await old.delete().catch(() => {});
    }));
    db.update('tournaments', tid, { panel1_ref: null, panel2_ref: null, panel3_ref: null });
    const msg1 = await mgmtCh2.send(buildPanel1(t)).catch(() => null);
    const msg2 = await mgmtCh2.send(buildPanel2(t)).catch(() => null);
    const msg3 = await mgmtCh2.send(buildPanel3(t)).catch(() => null);
    db.update('tournaments', tid, {
      panel1_ref: msg1 ? { channelId: mgmtCh2.id, messageId: msg1.id } : null,
      panel2_ref: msg2 ? { channelId: mgmtCh2.id, messageId: msg2.id } : null,
      panel3_ref: msg3 ? { channelId: mgmtCh2.id, messageId: msg3.id } : null,
    });
    return interaction.editReply({ content: `\u2705 Panels sent to <#${ch.management}>.` });
  }

  // ── Extract tid from p1/p2/p3 IDs ────────────────────────────────────────
  const p1Match = id.match(/^p1_(\d+)_(.+)$/);
  const p2Match = id.match(/^p2_(\d+)_(.+)$/);
  const p3Match = id.match(/^p3_(\d+)_(.+)$/);

  // ════════════════════════════════════════════════════════════════════════════
  // PANEL 1 INTERACTIONS
  // ════════════════════════════════════════════════════════════════════════════
  if (p1Match) {
    const tid    = parseInt(p1Match[1]);
    const action = p1Match[2];
    const t      = getT(tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });

    if (!isBotolaManager(interaction.member)) return noPermission(interaction);

    const allMatches = db.get('matches').filter(m => m.tournament_id === tid);

    // Refresh
    if (action === 'refresh') return interaction.update(buildPanel1(t));

    // Begin Season
    if (action === 'begin') {
      await interaction.deferUpdate();
      if (t.status !== 'setup' && t.status !== 'active') {
        return interaction.followUp({ content: '❌ Season already started or finished.', ephemeral: true });
      }
      const ttCount = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).length;
      const required = t.team_count || 2;
      if (ttCount < required) {
        return interaction.followUp({ content: `❌ Need all **${required}** teams registered before starting. Currently **${ttCount}/${required}** enrolled.`, ephemeral: true });
      }
      // Draw groups if not done
      const hasGroups = db.get('tournament_teams').some(tt => tt.tournament_id === tid && tt.group_name);
      if (!hasGroups) runGroupDraw(tid);
      // Generate schedule if no matches
      const hasMatches = db.get('matches').some(m => m.tournament_id === tid);
      if (!hasMatches) generateGroupSchedule(tid);
      // Initialise active round tracker (all group rounds are pre-generated)
      db.setConfig('group_round_' + tid, 1);
      // Activate
      db.update('tournaments', tid, { status: 'active' });
      refreshPanels23(cli, tid).catch(() => {});
      return interaction.editReply(buildPanel1(getT(tid)));
    }

    // End Tournament (full reset to setup)
    if (action === 'end') {
      const matchCount = db.get('matches').filter(m => m.tournament_id === tid).length;
      const teamCount  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).length;
      return interaction.update({
        flags: 32768,
        components: [{ type: 17, accent_color: 0xED4245, components: [
          txt(`# ⚠️  End Tournament\nThis will fully reset **${t.name}**:\n• **${teamCount}** teams removed\n• **${matchCount}** matches deleted\n• All scores & standings cleared\n\nThe tournament returns to **Setup** mode. This cannot be undone.`),
          SEP,
          { type: 1, components: [
            { type: 2, style: 4, label: '⚠️  Confirm End & Reset', custom_id: `p1_${tid}_end_confirm` },
            { type: 2, style: 2, label: 'Cancel',                   custom_id: `p1_${tid}_refresh` },
          ]},
        ]}],
      });
    }

    if (action === 'end_confirm') {
      await interaction.deferUpdate();

      // Warmup channel: delete old one and recreate with same name/perms
      const _warmupId = t.channels?.warmup;
      if (_warmupId) {
        try {
          const _wCh = await cli.channels.fetch(_warmupId).catch(() => null);
          if (_wCh) {
            const _wName  = _wCh.name;
            const _wType  = _wCh.type;
            const _wPar   = _wCh.parentId;
            const _wTopic = _wCh.topic || undefined;
            const _wPerms = _wCh.permissionOverwrites.cache.map(po => ({
              id: po.id, type: po.type,
              allow: po.allow.bitfield,
              deny:  po.deny.bitfield,
            }));
            await _wCh.delete('End Tournament — warmup channel reset').catch(() => {});
            const _newWCh = await interaction.guild.channels.create({
              name: _wName, type: _wType,
              parent: _wPar, topic: _wTopic,
              permissionOverwrites: _wPerms,
              reason: 'End Tournament — warmup channel recreated',
            }).catch(() => null);
            if (_newWCh) {
              db.update('tournaments', tid, { channels: { ...t.channels, warmup: _newWCh.id } });
            }
          }
        } catch (e) { console.warn('[warmup] recreation failed:', e.message); }
      }

      db.deleteWhere('matches', m => m.tournament_id === tid);
      db.deleteWhere('players', p => p.tournament_id === tid);
      const ttRowsR   = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
      const tmpTeamIdsR = ttRowsR.filter(tt => db.findById('teams', tt.team_id)?.temporary).map(tt => tt.team_id);
      if (tmpTeamIdsR.length) db.deleteWhere('teams', t2 => tmpTeamIdsR.includes(t2.id));
      db.deleteWhere('tournament_teams', tt => tt.tournament_id === tid);
      db.setConfig('group_round_' + tid, null);
      db.update('tournaments', tid, { status: 'setup', preview_mode: false });
      refreshPanels23(cli, tid).catch(() => {});
      return interaction.editReply(buildPanel1(getT(tid)));
    }

    // Settings — show inline panel with select menus
    if (action === 'settings') {
      const cfg     = getTplCfg(t.template || '');
      // When cfg locks a field to a single value, always enforce that value
      // regardless of what the tournament currently stores (handles stale data).
      const pending = {
        team_count:        cfg.team_count_opts.length === 1 ? cfg.team_count_opts[0] : (t.team_count        || cfg.team_count_opts[0]),
        teams_per_group:   cfg.tpg_opts.length        === 1 ? cfg.tpg_opts[0]        : (t.teams_per_group   || cfg.tpg_opts[0]),
        advance_per_group: cfg.apg_opts.length        === 1 ? cfg.apg_opts[0]        : (t.advance_per_group || cfg.apg_opts[0]),
        players_per_team:  cfg.ppt_opts.length        === 1 ? cfg.ppt_opts[0]        : (t.players_per_team  || cfg.ppt_opts[0]),
      };
      db.setConfig(`p1_settings_${interaction.user.id}_${tid}`, pending);
      return interaction.update(buildSettingsPanel(t, pending));
    }

    // Settings — select menu changed, update pending + refresh panel
    if (action === 'settings_tc' || action === 'settings_tpg' || action === 'settings_apg' || action === 'settings_ppt') {
      const fieldMap = {
        settings_tc:  'team_count',
        settings_tpg: 'teams_per_group',
        settings_apg: 'advance_per_group',
        settings_ppt: 'players_per_team',
      };
      const field   = fieldMap[action];
      const pending = db.getConfig(`p1_settings_${interaction.user.id}_${tid}`) || {
        team_count: t.team_count, teams_per_group: t.teams_per_group,
        advance_per_group: t.advance_per_group, players_per_team: t.players_per_team,
      };
      pending[field] = Number(interaction.values[0]);
      db.setConfig(`p1_settings_${interaction.user.id}_${tid}`, pending);
      return interaction.update(buildSettingsPanel(t, pending));
    }

    // Settings — save button
    if (action === 'settings_save') {
      const pending = db.getConfig(`p1_settings_${interaction.user.id}_${tid}`);
      if (pending) {
        const cfgSave = getTplCfg(t.template || '');
        db.update('tournaments', tid, {
          team_count:        cfgSave.team_count_opts.length === 1 ? cfgSave.team_count_opts[0] : pending.team_count,
          teams_per_group:   cfgSave.tpg_opts.length        === 1 ? cfgSave.tpg_opts[0]        : pending.teams_per_group,
          advance_per_group: cfgSave.apg_opts.length        === 1 ? cfgSave.apg_opts[0]        : pending.advance_per_group,
          players_per_team:  cfgSave.ppt_opts.length        === 1 ? cfgSave.ppt_opts[0]        : pending.players_per_team,
        });
        db.setConfig(`p1_settings_${interaction.user.id}_${tid}`, null);
        // Auto-trim teams if new team_count is less than current enrollment
        const _freshSave = db.findById('tournaments', tid);
        const _ttNow = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
        if (_ttNow.length > _freshSave.team_count) {
          const _excess = _ttNow.slice(_freshSave.team_count);
          for (const _tt of _excess) {
            db.deleteWhere('tournament_teams', r => r.id === _tt.id);
            db.deleteWhere('players', p => p.team_id === _tt.team_id && p.tournament_id === tid);
          }
        }
        refreshPanels23(cli, tid).catch(() => {});
      }
      const updatedT = db.findById('tournaments', tid);
      await interaction.update(buildPanel1(updatedT));
      return interaction.followUp({ content: '✅ Settings saved.', flags: 64 });
    }

    // Settings — change season number
    if (action === 'settings_season') {
      return interaction.showModal(
        new ModalBuilder().setCustomId(`p1_${tid}_settings_season_modal`).setTitle(`Season Number — ${t.template || t.name}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('season')
                .setLabel('Season Number (numbers only: 1, 2, 20, 100…)')
                .setStyle(TextInputStyle.Short)
                .setValue(String(t.season || ''))
                .setPlaceholder('e.g. 3')
                .setMinLength(1).setMaxLength(3)
                .setRequired(true)
            ),
          )
      );
    }

    // Settings — season modal submit
    if (action === 'settings_season_modal') {
      const raw       = interaction.fields.getTextInputValue('season').trim();
      const seasonNum = parseInt(raw.replace(/\D/g, ''), 10);
      if (!seasonNum || seasonNum < 1 || seasonNum > 999)
        return interaction.reply({ content: '❌ Season must be a number between 1 and 999.', ephemeral: true });
      // Check no duplicate season for same template
      const duplicate = db.get('tournaments').find(x => x.template === t.template && x.season === seasonNum && x.id !== tid);
      if (duplicate)
        return interaction.reply({ content: `❌ ${t.template} S${seasonNum} already exists.`, ephemeral: true });
      db.update('tournaments', tid, { season: seasonNum });
      const updatedT = db.findById('tournaments', tid);
      const pending  = db.getConfig(`p1_settings_${interaction.user.id}_${tid}`) || {
        team_count: updatedT.team_count, teams_per_group: updatedT.teams_per_group,
        advance_per_group: updatedT.advance_per_group, players_per_team: updatedT.players_per_team,
      };
      return interaction.update(buildSettingsPanel(updatedT, pending));
    }

    // Add Result — show picker inline (replaces panel content)
    if (action === 'addresult') {
      const stg_ = getStage(t);
      if (stg_ === 'knockout') {
        const panel = buildKORoundMatchesPanel(tid);
        if (!panel) return interaction.reply({ content: '\u274c No pending matches found.', ephemeral: true });
        return interaction.update(panel);
      }
      // Group stage: show round selector or jump straight to match list
      const allGM_ar = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
      if (!allGM_ar.length) return interaction.reply({ content: '\u274c No matches found.', ephemeral: true });
      const allRds_ar = [...new Set(allGM_ar.map(m => m.round))].sort((a, b) => a - b);
      if (allRds_ar.length === 1) {
        const panel = buildRoundMatchesPanel(tid, allRds_ar[0]);
        if (!panel) return interaction.reply({ content: '\u274c No matches found.', ephemeral: true });
        return interaction.update(panel);
      }
      const pendingByRound = allRds_ar.map(r => ({
        r,
        pending: allGM_ar.filter(m => m.round === r && m.status !== 'played').length,
      }));
      return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: [
        { type: 10, content: '**Add Result \u2014 Select a round**' },
        { type: 14, divider: true, spacing: 1 },
        { type: 1, components: [{ type: 3, custom_id: `p1_${tid}_addresult_sel`,
          placeholder: 'Select round...',
          options: pendingByRound.map(({ r, pending }) => ({
            label: `Round ${r}`,
            description: pending > 0 ? `${pending} match${pending !== 1 ? 'es' : ''} pending` : 'All played',
            value: String(r),
          })),
        }]},
        { type: 14, divider: true, spacing: 1 },
        { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p1_${tid}_refresh` }]},
      ]}] });
    }

    if (action === 'addresult_sel') {
      const round_ar = parseInt(interaction.values[0]);
      const panel    = buildRoundMatchesPanel(tid, round_ar);
      if (!panel) return interaction.reply({ content: '\u274c No matches found for this round.', ephemeral: true });
      return interaction.update(panel);
    }

    // Group selected from group selector
    if (action.startsWith('grpsel_')) {
      const rest  = action.slice(7);           // e.g. "A_1"
      const parts = rest.split('_');
      const round = parseInt(parts[parts.length - 1]);
      const group = parts.slice(0, parts.length - 1).join('_');
      return interaction.update(buildGroupMatchPicker(tid, group, round));
    }

    // Back to group selector from match picker
    if (action === 'grpback') {
      const panel = buildGroupSelectorPanel(tid);
      if (!panel) return interaction.reply({ content: '❌ No matches found.', ephemeral: true });
      return interaction.update(panel);
    }

    // Back from score picker -> return to round match list
    if (action.startsWith('roundback_')) {
      const roundNum = parseInt(action.slice(10));
      const panel = buildRoundMatchesPanel(tid, roundNum);
      if (!panel) return interaction.reply({ content: '\u274c No matches found.', ephemeral: true });
      return interaction.update(panel);
    }

    // Match selected → show score picker (no modal)
    // Match button clicked directly -> open score picker
    if (action.startsWith('matchbtn_')) {
      const matchId = parseInt(action.slice(9));
      const match2  = db.findById('matches', matchId);
      let initState = { home: null, away: null, hp: null, ap: null };
      if (match2?.status === 'played') {
        initState.home = match2.home_forfeit ? 'forfeit' : (match2.home_goals ?? match2.home_score ?? null);
        initState.away = match2.away_forfeit ? 'forfeit' : (match2.away_goals ?? match2.away_score ?? null);
        if (match2.home_pens != null) initState.hp = match2.home_pens;
        if (match2.away_pens != null) initState.ap = match2.away_pens;
      }
      tmpSet('p1rs_' + matchId, initState);
      const panel = buildBotolaScorePicker(tid, matchId, initState);
      if (!panel) return interaction.reply({ content: '\u274c Match not found.', ephemeral: true });
      return interaction.update(panel);
    }

        if (action === 'result_sel') {
      const matchId = parseInt(interaction.values[0]);
      const match2  = db.findById('matches', matchId);
      let initState = { home: null, away: null, hp: null, ap: null };
      if (match2?.status === 'played') {
        initState.home = match2.home_forfeit ? 'forfeit' : (match2.home_goals ?? match2.home_score ?? null);
        initState.away = match2.away_forfeit ? 'forfeit' : (match2.away_goals ?? match2.away_score ?? null);
        if (match2.home_pens != null) initState.hp = match2.home_pens;
        if (match2.away_pens != null) initState.ap = match2.away_pens;
      }
      tmpSet('p1rs_' + matchId, initState);
      const panel = buildBotolaScorePicker(tid, matchId, initState);
      if (!panel) return interaction.reply({ content: '\u274c Match not found.', ephemeral: true });
      return interaction.update(panel);
    }

    // Score picker: home score selected
    if (action.startsWith('rs_home_')) {
      const matchId = parseInt(action.slice(8));
      const state   = tmpGet('p1rs_' + matchId) || { home: null, away: null, hp: null, ap: null };
      const raw     = interaction.values[0];
      state.home    = raw === 'forfeit' ? 'forfeit' : parseInt(raw);
      if (state.home === 'forfeit' && state.away !== 'forfeit' && !(typeof state.away === 'number' && state.away >= 3)) state.away = 3;
      return _saveBotolaScore(cli, tid, matchId, state, interaction);
    }

    // Score picker: away score selected
    if (action.startsWith('rs_away_')) {
      const matchId = parseInt(action.slice(8));
      const state   = tmpGet('p1rs_' + matchId) || { home: null, away: null, hp: null, ap: null };
      const raw     = interaction.values[0];
      state.away    = raw === 'forfeit' ? 'forfeit' : parseInt(raw);
      if (state.away === 'forfeit' && state.home !== 'forfeit' && !(typeof state.home === 'number' && state.home >= 3)) state.home = 3;
      return _saveBotolaScore(cli, tid, matchId, state, interaction);
    }

    // Score picker: home penalties (KO draw)
    if (action.startsWith('rs_hp_')) {
      const matchId = parseInt(action.slice(6));
      const state   = tmpGet('p1rs_' + matchId) || { home: null, away: null, hp: null, ap: null };
      state.hp      = parseInt(interaction.values[0]);
      return _saveBotolaScore(cli, tid, matchId, state, interaction);
    }

    // Score picker: away penalties (KO draw)
    if (action.startsWith('rs_ap_')) {
      const matchId = parseInt(action.slice(6));
      const state   = tmpGet('p1rs_' + matchId) || { home: null, away: null, hp: null, ap: null };
      state.ap      = parseInt(interaction.values[0]);
      return _saveBotolaScore(cli, tid, matchId, state, interaction);
    }

    // Result modal submitted
    if (action.startsWith('result_modal_')) {
      // This is matched differently — see below
    }

    // "Next" button — advance to next round, post schedule/results/bracket
    if (action === 'advance') {
      const stage = getStage(t);
      if (stage === 'group') {
        // Find current round (lowest with pending, or last round if all played)
        const allGM_adv     = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
        const pendingGM_adv = allGM_adv.filter(m => m.status !== 'played');
        const allRds_adv    = [...new Set(allGM_adv.map(m => m.round))].sort((a, b) => a - b);
        const curRound_adv  = db.getConfig('group_round_' + tid) || allRds_adv[0] || 1;

        // Guard: current round must be fully played
        const stillPendingInRound = allGM_adv.filter(m => m.round === curRound_adv && m.status !== 'played');
        if (stillPendingInRound.length > 0) {
          return interaction.reply({
            content: `❌ **Cannot advance yet — ${stillPendingInRound.length} match${stillPendingInRound.length !== 1 ? 'es' : ''} still pending in Round ${curRound_adv}.**`,
            ephemeral: true,
          });
        }

        await interaction.deferUpdate();

        const isLastRound = curRound_adv === allRds_adv[allRds_adv.length - 1];
        // Last group round → generate KO bracket (post manually via panel 3)
        if (isLastRound) generateKnockoutBracket(tid);

        // Advance the stored active round so panel knows we moved forward
        db.setConfig('group_round_' + tid, curRound_adv + 1);
        refreshPanels23(cli, tid).catch(() => {});
        refreshStandingsMessage(cli, tid).catch(() => {});
        return interaction.editReply(buildPanel1(getT(tid)));
      } else if (stage === 'knockout') {
        advanceKnockout(tid);
        await refreshAll(cli, tid);
        await refreshBracketMessage(cli, tid);
        const _koPanel = buildMatchPickerInline(tid, 'knockout');
        if (_koPanel) return interaction.update(_koPanel);
        return;
      }
      await refreshAll(cli, tid);
      return;
    }


    // ── Confirm Winner ──────────────────────────────────────────────────────
    if (action === 'confirm_winner') {
      // Find the final match (lowest round number in knockout, status played)
      const playedKO = allMatches.filter(m => m.stage === 'knockout' && m.status === 'played');
      const finalRound = playedKO.length ? Math.min(...playedKO.map(m => m.round)) : null;
      const finalMatch = finalRound !== null ? playedKO.find(m => m.round === finalRound) : null;
      if (!finalMatch) return interaction.reply({ content: '❌ No final match found.', ephemeral: true });

      const winTeamId = finalMatch.home_score > finalMatch.away_score
        ? finalMatch.home_team_id : finalMatch.away_team_id;
      const winTeam = db.findById('teams', winTeamId);

      // Find players for this team in this tournament
      const winTTs   = db.findWhere('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === winTeamId);
      const players  = db.findWhere('players', p => winTTs.some(tt => tt.id === p.tournament_team_id));
      const playerList = players.length
        ? players.map(p => `<@${p.discord_id}>`).join(', ')
        : '`No players registered`';

      const hasRole  = !!t.winner_role_id;
      const hasRef   = !!t.winners_history_ref;

      const confirmPayload = {
        flags: 32768,
        components: [{ type: 17, accent_color: 0xFFD700, components: [
          { type: 10, content:
            `# 🏆  Confirm Season Winner\n` +
            `> **Tournament:** ${t.name}  —  Season ${t.season}\n` +
            `> **Champion:** ${winTeam?.name || 'Unknown'}\n` +
            `> **Players:** ${playerList}`
          },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content:
            `**Actions that will be performed:**\n` +
            (hasRole
              ? `✅ Remove winner role from previous champion(s)\n✅ Assign winner role to new champion's players\n`
              : `⚠️ No winner role configured for this tournament (set one via /manage → 🏆 Winners Setup)\n`) +
            (hasRef
              ? `✅ Update the Winners History leaderboard message`
              : `⚠️ No winners history message configured (set one via /manage → 🏆 Winners Setup)`)
          },
          { type: 14, divider: true, spacing: 1 },
          { type: 1, components: [
            { type: 2, style: 1, label: '✅ Confirm Winner', custom_id: `p1_${tid}_winner_confirm` },
            { type: 2, style: 2, label: 'Cancel',            custom_id: `p1_${tid}_refresh` },
          ]},
        ]}],
      };
      return interaction.reply({ ...confirmPayload, ephemeral: true });
    }

    // ── Execute Winner Confirmation ─────────────────────────────────────────
    if (action === 'winner_confirm') {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;

      // Already confirmed?
      const alreadyConfirmed = db.findOne('winners', w => w.tournament_id === tid && w.season === t.season);
      if (alreadyConfirmed) {
        return interaction.editReply({ content: '⚠️ Winner already confirmed for this season.' });
      }

      // Find final match
      const playedKO2  = allMatches.filter(m => m.stage === 'knockout' && m.status === 'played');
      const finalRound2 = playedKO2.length ? Math.min(...playedKO2.map(m => m.round)) : null;
      const finalMatch2 = finalRound2 !== null ? playedKO2.find(m => m.round === finalRound2) : null;
      if (!finalMatch2) return interaction.editReply({ content: '❌ No final match found.' });

      const winTeamId2 = finalMatch2.home_score > finalMatch2.away_score
        ? finalMatch2.home_team_id : finalMatch2.away_team_id;
      const winTeam2   = db.findById('teams', winTeamId2);

      // Find players
      const winTTs2   = db.findWhere('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === winTeamId2);
      const players2  = db.findWhere('players', p => winTTs2.some(tt => tt.id === p.tournament_team_id));
      const playerIds = players2.map(p => p.discord_id).filter(Boolean);

      const roleId = t.winner_role_id;
      let roleMsg  = '';

      if (roleId) {
        // Remove role from all previous winners of this tournament
        const prevWinners = db.findWhere('winners', w => w.tournament_id === tid);
        for (const pw of prevWinners) {
          for (const pid of (pw.player_ids || [])) {
            try {
              const mem = await guild.members.fetch(pid).catch(() => null);
              if (mem) await mem.roles.remove(roleId).catch(() => {});
            } catch {}
          }
        }
        // Give role to new winners
        const given = [];
        for (const pid of playerIds) {
          try {
            const mem = await guild.members.fetch(pid).catch(() => null);
            if (mem) { await mem.roles.add(roleId).catch(() => {}); given.push(`<@${pid}>`); }
          } catch {}
        }
        roleMsg = given.length
          ? `✅ Winner role assigned to: ${given.join(', ')}`
          : '⚠️ Could not find members to assign winner role.';
      } else {
        roleMsg = '⚠️ No winner role configured for this tournament.';
      }

      // Insert winner record
      db.insert('winners', {
        tournament_id: tid,
        season:        t.season,
        team_id:       winTeamId2,
        player_ids:    playerIds,
        confirmed_by:  interaction.user.id,
      });

      // Edit winners history leaderboard message
      const ref = t.winners_history_ref;
      let refMsg = '';
      if (ref) {
        try {
          const wCh  = await cli.channels.fetch(ref.channelId).catch(() => null);
          const wMsg = await wCh?.messages.fetch(ref.messageId).catch(() => null);
          if (wMsg) {
            await wMsg.edit(buildWinnersHistoryPayload(tid)).catch(() => {});
            refMsg = `✅ Winners History leaderboard updated in <#${ref.channelId}>`;
          } else {
            refMsg = '⚠️ Could not find winners history message to update.';
          }
        } catch (e) {
          refMsg = `⚠️ Failed to update leaderboard: ${e.message}`;
        }
      } else {
        refMsg = '⚠️ No winners history message configured.';
      }

      // Refresh Panel 1
      const freshT = db.findById('tournaments', tid);
      await refreshAll(cli, tid);

      // -- Public champion announcement --
      const champCh = ch.results || ch.management;
      if (champCh) {
        const champChannel = await cli.channels.fetch(champCh).catch(() => null);
        if (champChannel) {
          const playerMentions = playerIds.length
            ? playerIds.map(pid => `<@${pid}>`).join('  ')
            : '`No players registered`';
          const champPayload = makeChampionPost(t.name, t.season, winTeam2?.name || 'UNKNOWN');
          const _champRole = t.tag_on ? t.registration_role_id : null;
          if (_champRole) {
            await champChannel.send({ content: `<@&${_champRole}>`, allowedMentions: { roles: [_champRole] } })
              .then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
          }
          await champChannel.send(champPayload).catch(() => {});
        }
      }

      return interaction.editReply({
        content:
          `# 🏆  Season ${t.season} Winner Confirmed!\n` +
          `**${winTeam2?.name || 'Unknown'}** is the official champion.\n\n` +
          `${roleMsg}\n${refMsg}`,
      });
    }

    // New Edition (when finished)
    if (action === 'newedition') {
      await interaction.deferUpdate();
      // Reset tournament data — same tournament, new season
      db.deleteWhere('matches', m => m.tournament_id === tid);
      db.deleteWhere('players', p => p.tournament_id === tid);
      const ttRowsNE     = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
      const tmpTeamIdsNE = ttRowsNE.filter(tt => db.findById('teams', tt.team_id)?.temporary).map(tt => tt.team_id);
      if (tmpTeamIdsNE.length) db.deleteWhere('teams', t2 => tmpTeamIdsNE.includes(t2.id));
      db.deleteWhere('tournament_teams', tt => tt.tournament_id === tid);
      const newSeason = (t.season || 1) + 1;
      db.update('tournaments', tid, { status: 'setup', season: newSeason, preview_mode: false, tag_on: false });
      refreshPanels23(cli, tid).catch(() => {});
      return interaction.editReply(buildPanel1(getT(tid)));
    }
  }

  // ── Result modal (custom_id: p1_result_modal_{matchId}) ───────────────────
  if (id.startsWith('p1_result_modal_')) {
    const matchId  = parseInt(id.replace('p1_result_modal_', ''));
    const match    = db.findById('matches', matchId);
    if (!match) return interaction.reply({ content: '\u274c Match not found.', ephemeral: true });

    const _norm = v => v.trim().toUpperCase().replace(/Ø/g, '0');
    const rawHS = _norm(interaction.fields.getTextInputValue('home_score'));
    const rawAS = _norm(interaction.fields.getTextInputValue('away_score'));

    // ── Knockout: no forfeit, just numeric + penalty logic ───────────────────
    if (match.stage === 'knockout') {
      const hs = parseInt(rawHS), as_ = parseInt(rawAS);
      if (isNaN(hs) || isNaN(as_) || hs < 0 || hs > 20 || as_ < 0 || as_ > 20) {
        return interaction.reply({ content: '\u274c Invalid score. Enter a number 0\u201320.', ephemeral: true });
      }
      if (hs === as_) {
        const rawHP = interaction.fields.getTextInputValue('home_pens').trim();
        const rawAP = interaction.fields.getTextInputValue('away_pens').trim();
        const hp = rawHP ? parseInt(rawHP) : NaN;
        const ap = rawAP ? parseInt(rawAP) : NaN;
        if (isNaN(hp) || isNaN(ap) || hp === ap) {
          return interaction.reply({
            content: '\u274c **Knockout draw requires a penalty score.**\nFill in both penalty fields and they must differ.',
            ephemeral: true,
          });
        }
        const penWinner = hp > ap ? match.home_team_id : match.away_team_id;
        db.update('matches', matchId, {
          status: 'played', home_score: hs, away_score: as_,
          home_pens: hp, away_pens: ap, pen_winner: penWinner,
          home_forfeit: false, away_forfeit: false,
          home_goals: hs, away_goals: as_,
        });
        await refreshAll(cli, match.tournament_id);
        await refreshBracketMessage(cli, match.tournament_id);
        const teams2  = db.get('teams');
        const penTeam = teams2.find(t2 => t2.id === penWinner)?.name || 'Unknown';
        return interaction.reply({
          content: `\u2705 Result saved: **${hs} \u2014 ${as_}** (Draw)\n\ud83c\udfc6 **${penTeam}** wins on penalties **${hp} \u2014 ${ap}**`,
          ephemeral: true,
        });
      }
      updateStandings(match.tournament_id, matchId, hs, as_);
      db.update('matches', matchId, { home_forfeit: false, away_forfeit: false, home_goals: hs, away_goals: as_ });
      await refreshAll(cli, match.tournament_id);
      await refreshBracketMessage(cli, match.tournament_id);
      const isEditKO = match.status === 'played';
      return interaction.reply({ content: `\u2705 Result ${isEditKO ? 'updated' : 'saved'}: **${hs} \u2014 ${as_}**`, ephemeral: true });
    }

    // ── Group stage: accepts 0-20 or F (forfeit) ────────────────────────────
    function parseScoreField(raw) {
      if (raw === 'F') return { valid: true, forfeit: true, value: null };
      const n = parseInt(raw);
      if (!isNaN(n) && n >= 0 && n <= 20 && String(n) === raw) return { valid: true, forfeit: false, value: n };
      return { valid: false };
    }
    const hsP = parseScoreField(rawHS);
    const asP = parseScoreField(rawAS);
    if (!hsP.valid || !asP.valid) {
      return interaction.reply({ content: '\u274c Invalid score. Both fields required \u2014 enter **0\u201320** or **F** for forfeit (e.g. `F : 3` or `2 : F`).', ephemeral: true });
    }


    const hForfeit = hsP.forfeit;
    const aForfeit = asP.forfeit;

    // Forfeit side → null (Ø in posts), non-forfeit side → entered value
    const homeGoals = hForfeit ? null : hsP.value;
    const awayGoals = aForfeit ? null : asP.value;

    // Standings: forfeit side = 0 goals, opponent = their actual entered score
    const standHome = homeGoals ?? 0;
    const standAway = awayGoals ?? 0;

    updateStandings(match.tournament_id, matchId, standHome, standAway);
    db.update('matches', matchId, {
      home_forfeit: hForfeit,
      away_forfeit: aForfeit,
      home_goals:   homeGoals,
      away_goals:   awayGoals,
    });
    await refreshAll(cli, match.tournament_id);


    const isEdit = match.status === 'played';
    const tid    = match.tournament_id;
    const round  = match.round;
    const allGM2 = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
    const pendingInRound = allGM2.filter(m => m.round === round && m.status !== 'played').length;
    const pendingTotal   = allGM2.filter(m => m.status !== 'played').length;
    const hDisp = hForfeit ? '\u00d8' : String(homeGoals);
    const aDisp = aForfeit ? '\u00d8' : String(awayGoals);
    const roundMsg = pendingInRound === 0
      ? ` \u2014 Round ${round} complete! All results in.`
      : ` (${pendingInRound} result${pendingInRound !== 1 ? 's' : ''} left in Round ${round})`;
    return interaction.reply({
      content: `\u2705 Result ${isEdit ? 'updated' : 'saved'}: **${hDisp} \u2014 ${aDisp}**${roundMsg}`,
      ephemeral: true,
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PANEL 2 INTERACTIONS
  // ════════════════════════════════════════════════════════════════════════════
  if (p2Match) {
    const tid    = parseInt(p2Match[1]);
    const action = p2Match[2];
    const t      = getT(tid);
    if (!t) return p3SmallReply(interaction, '❌ Tournament not found.');

    if (!isBotolaManager(interaction.member)) return noPermission(interaction);

    if (action === 'refresh') return interaction.update(buildPanel2(t));

    // ── Random Fill (admin-only test helper) ─────────────────────────────────
    if (action === 'random') {
      const { PermissionFlagsBits } = require('discord.js');
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: [
          { type: 10, content: '\u274c **Random Fill** is only available to server administrators.' },
          SEP,
          { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p2_${tid}_refresh` }] },
        ]}] });
      }
      const enrolled_r  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
      const spotsLeft_r = t.team_count ? t.team_count - enrolled_r.length : 0;
      if (spotsLeft_r <= 0) {
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: [
          { type: 10, content: '\u26a0\ufe0f Tournament is already full \u2014 nothing to fill.' },
          SEP,
          { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p2_${tid}_refresh` }] },
        ]}] });
      }
      // Pick random available teams
      const enrolledIds_r = new Set(enrolled_r.map(tt => tt.team_id));
      const available_r   = db.get('teams').filter(tm => !enrolledIds_r.has(tm.id));
      if (!available_r.length) {
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: [
          { type: 10, content: '\u26a0\ufe0f No available teams left to add.' },
          SEP,
          { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p2_${tid}_refresh` }] },
        ]}] });
      }
      const toEnroll_r = [...available_r].sort(() => Math.random() - 0.5).slice(0, spotsLeft_r);
      // Enroll teams only — no player assignment (test fill)
      for (const team_r of toEnroll_r) {
        const already_r = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === team_r.id);
        if (!already_r) {
          db.insert('tournament_teams', {
            tournament_id: tid, team_id: team_r.id, group_name: null,
            wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0,
          });
        }
      }
      refreshAll(cli, tid).catch(() => {});
      return interaction.update(buildPanel2(getT(tid)));
    }

    // ── Add Team: Step 1 — show user picker ──────────────────────────────────
    if (action === 'addteam') {
      const enrolled_a = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => tt.team_id);
      if (t.team_count && enrolled_a.length >= t.team_count) {
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: [
          txt(`\u274c **This tournament is full \u2014 ${enrolled_a.length}/${t.team_count} teams registered.**\nRemove a team first to make room.`),
          SEP, { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p2_${tid}_refresh` }] },
        ]}] });
      }
      const available_a = db.get('teams').filter(t2 => !enrolled_a.includes(t2.id));
      if (!available_a.length) {
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: [
          txt('\u26a0\ufe0f All teams are already enrolled in this tournament.'),
          SEP, { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p2_${tid}_refresh` }] },
        ]}] });
      }
      const mgr_a = interaction.user.id;
      const { set: _tmpSetA } = require('../utils/tempState');
      _tmpSetA(`p2_adding_${tid}_${mgr_a}`, { pendingUsers: [], entries: [] }, 600000);
      const isCL_a = (t.players_per_team || 1) >= 2 || (t.template || '').toUpperCase() === 'CL';
      if (isCL_a) {
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: [
          txt(`**Add Team \u2014 ${t.template || t.name}**\nSelect both players for this team.`),
          SEP,
          { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_addteam_duo`,
            placeholder: '\uD83D\uDC65  Player 1 & 2 \u2014 search members...', min_values: 2, max_values: 2 }] },
          SEP,
          { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Cancel', custom_id: `p2_${tid}_refresh` }] },
        ]}] });
      }
      return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: [
        txt(`**Add Team \u2014 ${t.template || t.name}**\nSelect the player for this team.`),
        SEP,
        { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_addteam_u1`,
          placeholder: '\uD83D\uDC64  Select player...', min_values: 0, max_values: 1 }] },
        SEP,
        { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Cancel', custom_id: `p2_${tid}_refresh` }] },
      ]}] });
    }

    // ── addteam_u1: user 1 picked ──────────────────────────────────────────────
    if (action === 'addteam_u1') {
      const userId_u1 = interaction.values?.[0];
      const mgr_u1 = interaction.user.id;
      const { get: _tmpGetU1, set: _tmpSetU1 } = require('../utils/tempState');
      const state_u1 = _tmpGetU1(`p2_adding_${tid}_${mgr_u1}`) || { pendingUsers: [], entries: [] };
      const isCL_u1 = (t.players_per_team || 1) >= 2 || (t.template || '').toUpperCase() === 'CL';
      const queueTxt_u1 = state_u1.entries.length
        ? state_u1.entries.map(e => `\u2705  <@${e.userIds[0]}>${e.userIds[1] ? ` & <@${e.userIds[1]}>` : ''} \u2192 ${e.teamName}`).join('\n') + '\n\n'
        : '';
      if (!userId_u1) {
        state_u1.pendingUsers = [];
        _tmpSetU1(`p2_adding_${tid}_${mgr_u1}`, state_u1, 600000);
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: [
          txt(`${queueTxt_u1}**Add Team \u2014 ${t.template || t.name}**\nSelect the ${isCL_u1 ? 'first ' : ''}player for this team.`),
          SEP,
          { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_addteam_u1`,
            placeholder: isCL_u1 ? '\uD83D\uDC64  Player 1 \u2014 search member...' : '\uD83D\uDC64  Select player...', min_values: 0, max_values: 1 }] },
          SEP,
          { type: 1, components: state_u1.entries.length
            ? [{ type: 2, style: 3, label: 'Done', custom_id: `p2_${tid}_addteam_done` }, { type: 2, style: 2, label: '\u2190 Cancel', custom_id: `p2_${tid}_refresh` }]
            : [{ type: 2, style: 2, label: '\u2190 Cancel', custom_id: `p2_${tid}_refresh` }] },
        ]}] });
      }
      const _enrolledTids_u1 = new Set(db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => Number(tt.team_id)));
      const existP_u1 = db.findOne('players', p => p.discord_id === userId_u1 && (_enrolledTids_u1.has(Number(p.team_id)) || p.tournament_id === tid));
      const inQ_u1 = state_u1.entries.some(e => e.userIds.includes(userId_u1));
      if (existP_u1 || inQ_u1) {
        const errTeam = existP_u1 ? db.findById('teams', existP_u1.team_id) : null;
        const errMsg_u1 = existP_u1
          ? `\u274c <@${userId_u1}> is already on **${errTeam?.name || 'another team'}**. Select a different player.`
          : `\u274c <@${userId_u1}> is already in the queue. Select a different player.`;
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: [
          txt(`${queueTxt_u1}${errMsg_u1}`),
          SEP,
          { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_addteam_u1`,
            placeholder: '\uD83D\uDC64  Choose a different player...', min_values: 0, max_values: 1 }] },
          SEP,
          { type: 1, components: state_u1.entries.length
            ? [{ type: 2, style: 3, label: 'Done', custom_id: `p2_${tid}_addteam_done` }, { type: 2, style: 2, label: '\u2190 Cancel', custom_id: `p2_${tid}_refresh` }]
            : [{ type: 2, style: 2, label: '\u2190 Cancel', custom_id: `p2_${tid}_refresh` }] },
        ]}] });
      }
      state_u1.pendingUsers = [userId_u1];
      _tmpSetU1(`p2_adding_${tid}_${mgr_u1}`, state_u1, 600000);
      if (isCL_u1) {
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: [
          txt(`${queueTxt_u1}**Add Team \u2014 ${t.template || t.name}**\nPlayer 1: <@${userId_u1}>\nNow select Player 2.`),
          SEP,
          { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_addteam_u2`,
            placeholder: '\uD83D\uDC64  Player 2 \u2014 search member...', min_values: 0, max_values: 1 }] },
          SEP,
          { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p2_${tid}_addteam` }] },
        ]}] });
      }
      return interaction.update(buildTeamSearchStep2(tid, '', state_u1.entries));
    }

    // ── addteam_u2: user 2 picked (CL only) ──────────────────────────────────
    if (action === 'addteam_u2') {
      const userId_u2 = interaction.values?.[0];
      const mgr_u2 = interaction.user.id;
      const { get: _tmpGetU2, set: _tmpSetU2 } = require('../utils/tempState');
      const state_u2 = _tmpGetU2(`p2_adding_${tid}_${mgr_u2}`) || { pendingUsers: [], entries: [] };
      const queueTxt_u2 = state_u2.entries.length
        ? state_u2.entries.map(e => `\u2705  <@${e.userIds[0]}> & <@${e.userIds[1]}> \u2192 ${e.teamName}`).join('\n') + '\n\n'
        : '';
      if (!userId_u2) {
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: [
          txt(`${queueTxt_u2}Player 1: <@${state_u2.pendingUsers[0]}>\nSelect Player 2.`),
          SEP,
          { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_addteam_u2`,
            placeholder: '\uD83D\uDC64  Player 2 \u2014 search member...', min_values: 0, max_values: 1 }] },
          SEP,
          { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p2_${tid}_addteam` }] },
        ]}] });
      }
      const _enrolledTids_u2 = new Set(db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => Number(tt.team_id)));
      const existP_u2 = db.findOne('players', p => p.discord_id === userId_u2 && (_enrolledTids_u2.has(Number(p.team_id)) || p.tournament_id === tid));
      const inQ_u2 = state_u2.entries.some(e => e.userIds.includes(userId_u2));
      const sameAsP1 = state_u2.pendingUsers[0] === userId_u2;
      if (sameAsP1 || existP_u2 || inQ_u2) {
        const msg_u2 = sameAsP1
          ? '\u274c Player 2 cannot be the same as Player 1.'
          : existP_u2 ? `\u274c <@${userId_u2}> is already registered.`
          : `\u274c <@${userId_u2}> is already in the queue.`;
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: [
          txt(`${queueTxt_u2}Player 1: <@${state_u2.pendingUsers[0]}>\n${msg_u2} Choose a different player.`),
          SEP,
          { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_addteam_u2`,
            placeholder: '\uD83D\uDC64  Choose different Player 2...', min_values: 0, max_values: 1 }] },
          SEP,
          { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p2_${tid}_addteam` }] },
        ]}] });
      }
      state_u2.pendingUsers = [state_u2.pendingUsers[0], userId_u2];
      _tmpSetU2(`p2_adding_${tid}_${mgr_u2}`, state_u2, 600000);
      return interaction.update(buildTeamSearchStep2(tid, '', state_u2.entries));
    }

    // ── addteam_duo: both players picked at once (CL/duo) ────────────────────
    if (action === 'addteam_duo') {
      const [userId_d1, userId_d2] = interaction.values;
      const mgr_d = interaction.user.id;
      const { get: _tmpGetD, set: _tmpSetD } = require('../utils/tempState');
      const state_d = _tmpGetD(`p2_adding_${tid}_${mgr_d}`) || { pendingUsers: [], entries: [] };
      const queueTxt_d = state_d.entries.length
        ? state_d.entries.map(e => `\u2705  <@${e.userIds[0]}> & <@${e.userIds[1]}> \u2192 ${e.teamName}`).join('\n') + '\n\n'
        : '';
      const duoErrPanel = (msg) => interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: [
        txt(`${queueTxt_d}${msg}`),
        SEP,
        { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_addteam_duo`,
          placeholder: '\uD83D\uDC65  Player 1 & 2 \u2014 search members...', min_values: 2, max_values: 2 }] },
        SEP,
        { type: 1, components: state_d.entries.length
          ? [{ type: 2, style: 3, label: 'Done', custom_id: `p2_${tid}_addteam_done` }, { type: 2, style: 2, label: '\u2190 Cancel', custom_id: `p2_${tid}_refresh` }]
          : [{ type: 2, style: 2, label: '\u2190 Cancel', custom_id: `p2_${tid}_refresh` }] },
      ]}] });
      if (userId_d1 === userId_d2) {
        return duoErrPanel('\u274c Player 1 and Player 2 cannot be the same person. Try again.');
      }
      const _enrolledTids_d = new Set(db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => Number(tt.team_id)));
      for (const uid of [userId_d1, userId_d2]) {
        const existP_d = db.findOne('players', p => p.discord_id === uid && (_enrolledTids_d.has(Number(p.team_id)) || p.tournament_id === tid));
        const inQ_d = state_d.entries.some(e => e.userIds.includes(uid));
        if (existP_d || inQ_d) {
          const errTeam_d = existP_d ? db.findById('teams', existP_d.team_id) : null;
          return duoErrPanel(existP_d
            ? `\u274c <@${uid}> is already on **${errTeam_d?.name || 'another team'}**. Select different players.`
            : `\u274c <@${uid}> is already in the queue. Select different players.`);
        }
      }
      state_d.pendingUsers = [userId_d1, userId_d2];
      _tmpSetD(`p2_adding_${tid}_${mgr_d}`, state_d, 600000);
      return interaction.update(buildTeamSearchStep2(tid, '', state_d.entries));
    }

    // ── addteam_teamsearch: open search modal ──────────────────────────────────
    if (action === 'addteam_teamsearch') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId(`p2_${tid}_addteam_teammodal`)
          .setTitle('Search Team by Name')
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('team_search').setLabel('Type team name')
              .setStyle(TextInputStyle.Short).setPlaceholder('Team name...').setRequired(true).setMinLength(2)
          ))
      );
    }

    // ── addteam_teammodal: process search modal ────────────────────────────────
    if (action === 'addteam_teammodal') {
      const typedText_tm = interaction.fields.getTextInputValue('team_search').trim();
      const mgr_tm = interaction.user.id;
      const { get: _tmpGetTM } = require('../utils/tempState');
      const state_tm = _tmpGetTM(`p2_adding_${tid}_${mgr_tm}`) || { pendingUsers: [], entries: [] };
      return interaction.update(buildTeamSearchStep2(tid, typedText_tm, state_tm.entries));
    }

    // ── addteam_teamsel: team chosen → add pair to queue ───────────────────────
    if (action === 'addteam_teamsel') {
      const teamId_ts = parseInt(interaction.values[0]);
      const team_ts = db.findById('teams', teamId_ts);
      if (!team_ts) return p3SmallReply(interaction, '\u274c Team not found.');
      const mgr_ts = interaction.user.id;
      const { get: _tmpGetTS, set: _tmpSetTS } = require('../utils/tempState');
      const state_ts = _tmpGetTS(`p2_adding_${tid}_${mgr_ts}`) || { pendingUsers: [], entries: [] };
      state_ts.entries.push({ userIds: [...state_ts.pendingUsers], teamId: teamId_ts, teamName: team_ts.name });
      state_ts.pendingUsers = [];
      _tmpSetTS(`p2_adding_${tid}_${mgr_ts}`, state_ts, 600000);
      const enrolledCount_ts = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).length;
      const isFull_ts = t.team_count && (enrolledCount_ts + state_ts.entries.length) >= t.team_count;
      const isCL_ts = (t.players_per_team || 1) >= 2 || (t.template || '').toUpperCase() === 'CL';
      const queueTxt_ts = state_ts.entries.map(e =>
        `\u2705  <@${e.userIds[0]}>${e.userIds[1] ? ` & <@${e.userIds[1]}>` : ''} \u2192 ${e.teamName}`
      ).join('\n');
      if (isFull_ts) {
        return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0x57F287, components: [
          txt(`${queueTxt_ts}\n\n\u26a0\ufe0f Tournament will be full. Click **Done** to confirm.`),
          SEP,
          { type: 1, components: [
            { type: 2, style: 1, label: 'Done', custom_id: `p2_${tid}_addteam_done` },
            { type: 2, style: 2, label: '\u2190 Cancel', custom_id: `p2_${tid}_refresh` },
          ]},
        ]}] });
      }
      return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0x57F287, components: [
        txt(`${queueTxt_ts}\n\n**Select player for next team** \u2014 or click **Done** to add all.`),
        SEP,
        { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_addteam_u1`,
          placeholder: isCL_ts ? '\uD83D\uDC64  Player 1 for next team...' : '\uD83D\uDC64  Select player for next team...', min_values: 0, max_values: 1 }] },
        SEP,
        { type: 1, components: [
          { type: 2, style: 1, label: 'Done', custom_id: `p2_${tid}_addteam_done` },
          { type: 2, style: 2, label: '\u2190 Cancel', custom_id: `p2_${tid}_refresh` },
        ]},
      ]}] });
    }

    // ── addteam_done: commit all queued pairs to DB ────────────────────────────
    if (action === 'addteam_done') {
      const mgr_d = interaction.user.id;
      const { get: _tmpGetD, del: _tmpDelD } = require('../utils/tempState');
      const state_d = _tmpGetD(`p2_adding_${tid}_${mgr_d}`);
      if (!state_d || !state_d.entries.length) return interaction.update(buildPanel2(getT(tid)));
      for (const entry of state_d.entries) {
        const already_d = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === entry.teamId);
        if (!already_d) {
          db.insert('tournament_teams', { tournament_id: tid, team_id: entry.teamId, group_name: null,
            wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0 });
        }
        entry.userIds.forEach((uid, slot) => {
          if (uid) {
            const exSl_d = db.findOne('players', p => p.team_id === entry.teamId && p.tournament_id === tid && (p.slot || 0) === slot);
            if (exSl_d) db.delete('players', exSl_d.id);
            db.insert('players', { discord_id: uid, team_id: entry.teamId, tournament_id: tid, slot, username: interaction.users?.get(uid)?.username || null });
          }
        });
      }
      _tmpDelD(`p2_adding_${tid}_${mgr_d}`);
      (async () => {
        const _tD = getT(tid);
        const _roleId_d = _tD && _tD.registration_role_id;
        if (_roleId_d) {
          const allUids = state_d.entries.flatMap(e => e.userIds).filter(Boolean);
          for (const uid of allUids) {
            const mem = await interaction.guild.members.fetch(uid).catch(() => null);
            if (mem) await mem.roles.add(_roleId_d).catch(() => {});
          }
        }
        const _tpl_d = (_tD || {}).template;
        if (_tpl_d) {
          const _refD = db.getConfig('teams_list_ref_' + _tpl_d);
          if (_refD) {
            const _chD = await cli.channels.fetch(_refD.channelId).catch(() => null);
            const _msgD = await _chD?.messages.fetch(_refD.messageId).catch(() => null);
            if (_msgD) await _msgD.edit(buildTeamsListEmbed(tid)).catch(e => console.warn('[p2 teamlist]', e.message));
          }
        }
      })().catch(() => {});
      refreshAll(cli, tid).catch(() => {});
      return interaction.update(buildPanel2(getT(tid)));
    }

    if (action === 'team_sel') {
      const teamId    = parseInt(interaction.values[0]);
      const team      = db.findById('teams', teamId);
      if (!team) return p3SmallReply(interaction, '\u274c Team not found.');
      const isCL     = (t.players_per_team || 1) >= 2 || (t.template || '').toUpperCase() === 'CL';
      const reqPlayers = t.players_per_team || (isCL ? 2 : 1);
      const SEP_U     = { type: 14, divider: true, spacing: 1 };
      // Start draft — team is NOT enrolled until Add is clicked
      const { set: _tmpSet } = require('../utils/tempState');
      _tmpSet('p2_draft_' + tid + '_' + teamId, { players: {}, required: reqPlayers }, 600000);
      const rows = isCL
        ? [
            { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_0`, placeholder: '\u{1F464}  Player 1 \u2014 search member...', min_values: 0, max_values: 1 }] },
            { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_1`, placeholder: '\u{1F464}  Player 2 \u2014 search member...', min_values: 0, max_values: 1 }] },
          ]
        : [
            { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_0`, placeholder: 'Select a player...', min_values: 0, max_values: 1 }] },
          ];
      return interaction.update({
        flags: 32768,
        components: [{ type: 17, accent_color: 0x5865F2, components: [
          { type: 10, content: `**Assign ${isCL ? '2 Players' : 'Player'} \u2014 ${team.name}**\nSelect the Discord user${isCL ? 's' : ''} for this team, then click **\u2705 Add**.` },
          SEP,
          ...rows,
          SEP,
          { type: 1, components: [
            { type: 2, style: 1, label: '\u2705 Add', custom_id: `p2_${tid}_add_confirm_${teamId}`, disabled: true },
            { type: 2, style: 4, label: '\u274c Cancel', custom_id: `p2_${tid}_refresh` },
          ]},
        ]}],
      });
    }

    if (action.startsWith('player_user_')) {
      const rest    = action.replace('player_user_', '');
      const parts   = rest.split('_');
      const teamId  = parseInt(parts[0]);
      const slot    = parts[1] !== undefined ? parseInt(parts[1]) : 0;
      const userId  = interaction.values && interaction.values[0];
      const SEP_U   = { type: 14, divider: true, spacing: 1 };
      const isCL_p = (t.players_per_team || 1) >= 2 || (t.template || '').toUpperCase() === 'CL';
      const { get: _tmpGet, set: _tmpSet2 } = require('../utils/tempState');
      const draftKey = 'p2_draft_' + tid + '_' + teamId;
      const draft    = _tmpGet(draftKey);

      if (draft) {
        // ── DRAFT MODE: save to temp, never touch DB yet ──────────────────
        if (userId) draft.players[slot] = userId;
        else delete draft.players[slot];
        const reqPl = draft.required || (isCL_p ? 2 : 1);
        // Dupe check: one team per user per season.
        // A player is a duplicate only if they appear on a DIFFERENT team
        // that is currently enrolled in THIS tournament (ignores old seasons).
        if (userId) {
          const _enrolledIds = new Set(
            db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => tt.team_id)
          );
          const dupe = db.findOne('players', p =>
            p.discord_id === userId && p.team_id !== teamId && _enrolledIds.has(p.team_id)
          );
          if (dupe) {
            delete draft.players[slot];
            _tmpSet2(draftKey, draft, 600000);
            const dupTeam = db.findById('teams', dupe.team_id);
            const eRows   = isCL_p
              ? [
                  { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_0`, placeholder: '\u{1F464}  Player 1 \u2014 search member...', min_values: 0, max_values: 1 }] },
                  { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_1`, placeholder: '\u{1F464}  Player 2 \u2014 search member...', min_values: 0, max_values: 1 }] },
                ]
              : [{ type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_0`, placeholder: 'Choose a different player...', min_values: 0, max_values: 1 }] }];
            return interaction.update({
              flags: 32768,
              components: [{ type: 17, accent_color: 0xED4245, components: [
                { type: 10, content: `\u274c <@${userId}> is already on **${dupTeam?.name || 'another team'}**. Choose a different player.` },
                SEP, ...eRows, SEP,
                { type: 1, components: [
                  { type: 2, style: 1, label: '\u2705 Add', custom_id: `p2_${tid}_add_confirm_${teamId}`, disabled: true },
                  { type: 2, style: 4, label: '\u274c Cancel', custom_id: `p2_${tid}_refresh` },
                ]},
              ]}],
            });
          }
        }
        _tmpSet2(draftKey, draft, 600000);
        const team_p   = db.findById('teams', teamId);
        const filled   = Object.keys(draft.players).filter(k => draft.players[k]).length;
        const canAdd   = filled >= reqPl;
        const statuses = [];
        for (let i = 0; i < reqPl; i++) {
          const uid = draft.players[i];
          statuses.push(uid ? `\u2705 P${reqPl > 1 ? i+1 : ''}: <@${uid}>`.replace('P: ', 'Player: ') : `\u274c P${reqPl > 1 ? i+1 : ''}: not assigned`.replace('P: ', 'Player: '));
        }
        const pRows = isCL_p
          ? [
              { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_0`, placeholder: '\u{1F464}  Player 1 \u2014 search member...', min_values: 0, max_values: 1 }] },
              { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_1`, placeholder: '\u{1F464}  Player 2 \u2014 search member...', min_values: 0, max_values: 1 }] },
            ]
          : [{ type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_0`, placeholder: 'Select a player...', min_values: 0, max_values: 1 }] }];
        return interaction.update({
          flags: 32768,
          components: [{ type: 17, accent_color: canAdd ? 0x57F287 : 0x5865F2, components: [
            { type: 10, content: `**Assign ${isCL_p ? '2 Players' : 'Player'} \u2014 ${team_p?.name}**\n> ${statuses.join('  \u00b7  ')}${canAdd ? '\n> \u2705 Ready \u2014 click **Add** to confirm.' : ''}` },
            SEP, ...pRows, SEP,
            { type: 1, components: [
              { type: 2, style: 1, label: '\u2705 Add', custom_id: `p2_${tid}_add_confirm_${teamId}`, disabled: !canAdd },
              { type: 2, style: 4, label: '\u274c Cancel', custom_id: `p2_${tid}_refresh` },
            ]},
          ]}],
        });
      }

      // ── EDIT MODE: team already enrolled, save directly to DB ─────────────
      if (!userId) return interaction.update(buildPanel2(getT(tid)));
      const _enrolledIds2 = new Set(
        db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => tt.team_id)
      );
      const dupePlayer = db.findOne('players', p =>
        p.discord_id === userId && p.team_id !== teamId && _enrolledIds2.has(p.team_id)
      );
      if (dupePlayer) {
        const dupTeam = db.findById('teams', dupePlayer.team_id);
        const errRows = isCL_p
          ? [
              { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_0`, placeholder: '\u{1F464}  Player 1 \u2014 search member...', min_values: 0, max_values: 1 }] },
              { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_1`, placeholder: '\u{1F464}  Player 2 \u2014 search member...', min_values: 0, max_values: 1 }] },
            ]
          : [{ type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId}_0`, placeholder: 'Choose a different player...', min_values: 0, max_values: 1 }] }];
        return interaction.update({
          flags: 32768,
          components: [{ type: 17, accent_color: 0xED4245, components: [
            { type: 10, content: `\u274c <@${userId}> is already on **${dupTeam?.name || 'another team'}** in this tournament. Choose a different player.` },
            SEP, ...errRows, SEP,
            { type: 1, components: [{ type: 2, style: 4, label: 'Cancel', custom_id: `p2_${tid}_refresh` }] },
          ]}],
        });
      }
      const existingSlot = db.findOne('players', p => p.team_id === teamId && p.tournament_id === tid && (p.slot || 0) === slot);
      if (existingSlot) db.delete('players', existingSlot.id);
      db.insert('players', { discord_id: userId, team_id: teamId, tournament_id: tid, slot, username: interaction.users?.get(userId)?.username || null });
      refreshAll(cli, tid).catch(() => {});
      return interaction.update(buildPanel2(getT(tid)));
    }

    if (action.startsWith('add_confirm_')) {
      const teamId2   = parseInt(action.replace('add_confirm_', ''));
      const { get: _tmpGet2, del: _tmpDel } = require('../utils/tempState');
      const draftKey2 = 'p2_draft_' + tid + '_' + teamId2;
      const draft2    = _tmpGet2(draftKey2);
      const SEP_U2    = { type: 14, divider: true, spacing: 1 };
      const isCL_ac  = (t.players_per_team || 1) >= 2 || (t.template || '').toUpperCase() === 'CL';
      if (!draft2) return interaction.update(buildPanel2(getT(tid)));
      const reqPl2  = draft2.required || (isCL_ac ? 2 : 1);
      const filled2 = Object.keys(draft2.players).filter(k => draft2.players[k]).length;
      if (filled2 < reqPl2) {
        const acRows = isCL_ac
          ? [
              { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId2}_0`, placeholder: '\u{1F464}  Player 1 \u2014 search member...', min_values: 0, max_values: 1 }] },
              { type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId2}_1`, placeholder: '\u{1F464}  Player 2 \u2014 search member...', min_values: 0, max_values: 1 }] },
            ]
          : [{ type: 1, components: [{ type: 5, custom_id: `p2_${tid}_player_user_${teamId2}_0`, placeholder: 'Select a player...', min_values: 0, max_values: 1 }] }];
        return interaction.update({
          flags: 32768,
          components: [{ type: 17, accent_color: 0xED4245, components: [
            { type: 10, content: `\u26a0\ufe0f Assign all ${reqPl2} player${reqPl2 > 1 ? 's' : ''} before adding the team.` },
            SEP_U2, ...acRows, SEP_U2,
            { type: 1, components: [
              { type: 2, style: 1, label: '\u2705 Add', custom_id: `p2_${tid}_add_confirm_${teamId2}`, disabled: true },
              { type: 2, style: 4, label: '\u274c Cancel', custom_id: `p2_${tid}_refresh` },
            ]},
          ]}],
        });
      }
      const alreadyEnrolled2 = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === teamId2);
      if (!alreadyEnrolled2) {
        db.insert('tournament_teams', { tournament_id: tid, team_id: teamId2, group_name: null, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0 });
      }
      for (const [slotStr, uid] of Object.entries(draft2.players)) {
        if (uid) {
          const exSl = db.findOne('players', p => p.team_id === teamId2 && p.tournament_id === tid && (p.slot || 0) === parseInt(slotStr));
          if (exSl) db.delete('players', exSl.id);
          db.insert('players', { discord_id: uid, team_id: teamId2, tournament_id: tid, slot: parseInt(slotStr), username: draft2.usernames?.[uid] || null });
        }
      }
      _tmpDel(draftKey2);
      // Give registration role to enrolled players
      (async () => {
        const _t2 = getT(tid);
        const _roleId = _t2 && _t2.registration_role_id;
        if (_roleId) {
          for (const uid of Object.values(draft2.players).filter(Boolean)) {
            const mem = await interaction.guild.members.fetch(uid).catch(() => null);
            if (mem) await mem.roles.add(_roleId).catch(() => {});
          }
        }
        const _tpl = (_t2 || {}).template;
        if (_tpl) {
          const _ref2 = db.getConfig('teams_list_ref_' + _tpl);
          if (_ref2) {
            const { buildTeamsListEmbed } = require('../panels/teamListPanel');
            const _ch2 = await cli.channels.fetch(_ref2.channelId).catch(() => null);
            const _msg2 = await _ch2?.messages.fetch(_ref2.messageId).catch(() => null);
            if (_msg2) await _msg2.edit(buildTeamsListEmbed(tid)).catch(e => console.warn('[p2 teamlist]', e.message));
          }
        }
      })().catch(() => {});
      refreshAll(cli, tid).catch(() => {});
      return interaction.update(buildPanel2(getT(tid)));
    }

    if (action.startsWith('player_modal_')) {
      const teamId   = parseInt(action.replace('player_modal_', ''));
      const rawId    = interaction.fields.getTextInputValue('discord_id').trim().replace(/\D/g, '');
      if (rawId) {
        const exists = db.findOne('players', p => p.discord_id === rawId && p.team_id === teamId);
        if (!exists) db.insert('players', { discord_id: rawId, team_id: teamId, tournament_id: tid });
      }
      const freshT = getT(tid);
      // Modal submissions must be acknowledged — silently defer+delete, then refresh the panel
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      await refreshAll(cli, tid);
      await interaction.deleteReply().catch(() => {});
      return;
    }



    // ── Edit team players (always active, works even when tournament running) ──
    if (action === 'editteam') {
      const ttRowsE = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
      if (!ttRowsE.length) return interaction.update(buildPanel2(t));
      const opts = ttRowsE.map(tt => {
        const tm = db.findById('teams', tt.team_id) || { name: 'Unknown', id: tt.team_id };
        return { label: tm.name.slice(0, 100), value: String(tm.id) };
      }).sort((a, b) => a.label.localeCompare(b.label));
      return interaction.update({
        flags: 32768,
        components: [{ type: 17, accent_color: 0xFF0049, components: [
          { type: 10, content: '**\u270f\ufe0f  Edit Team Players \u2014 Select a team**' },
          SEP,
          { type: 1, components: [{ type: 3, custom_id: `p2_${tid}_editteam_sel`, placeholder: 'Select a team to edit...', options: opts.slice(0, 25) }] },
          SEP,
          { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p2_${tid}_refresh` }] },
        ]}],
      });
    }

    if (action === 'editteam_sel') {
      const teamIdE = parseInt(interaction.values[0]);
      const teamE = db.findById('teams', teamIdE);
      if (!teamE) return interaction.update(buildPanel2(t));
      const slotsE = (t.players_per_team || 1) >= 2 || (t.template || '').toUpperCase() === 'CL' ? 2 : 1;
      const curPlayers = db.get('players').filter(p => p.team_id === teamIdE && p.tournament_id === tid);
      const statusE = [];
      for (let i = 0; i < slotsE; i++) {
        const p = curPlayers.find(pl => (pl.slot || 0) === i);
        statusE.push(p ? `\u2705 ${slotsE > 1 ? 'P' + (i+1) : 'Player'}: <@${p.discord_id}>` : `\u274c ${slotsE > 1 ? 'P' + (i+1) : 'Player'}: not assigned`);
      }
      const playerRowsE = [];
      for (let i = 0; i < slotsE; i++) {
        playerRowsE.push({ type: 1, components: [{ type: 5, custom_id: `p2_${tid}_editteam_player_${teamIdE}_${i}`, placeholder: slotsE > 1 ? `\ud83d\udc64  Player ${i+1} \u2014 pick new player...` : '\ud83d\udc64  Pick new player...', min_values: 0, max_values: 1 }] });
      }
      return interaction.update({
        flags: 32768,
        components: [{ type: 17, accent_color: 0xFF0049, components: [
          { type: 10, content: `**\u270f\ufe0f  Edit Players \u2014 ${teamE.name}**\n> ${statusE.join('  \u00b7  ')}` },
          SEP,
          ...playerRowsE,
          SEP,
          { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p2_${tid}_editteam` }] },
        ]}],
      });
    }

    if (action.startsWith('editteam_player_')) {
      const epRest = action.replace('editteam_player_', '');
      const epLast = epRest.lastIndexOf('_');
      const teamIdEP = parseInt(epRest.slice(0, epLast));
      const slotEP   = parseInt(epRest.slice(epLast + 1));
      const userIdEP = interaction.values[0];
      if (userIdEP) {
        const exSlEP = db.findOne('players', p => p.team_id === teamIdEP && p.tournament_id === tid && (p.slot || 0) === slotEP);
        if (exSlEP) db.delete('players', exSlEP.id);
        db.insert('players', { discord_id: userIdEP, team_id: teamIdEP, tournament_id: tid, slot: slotEP, username: interaction.users?.get(userIdEP)?.username || null });
        const tplEP = t.template;
        if (tplEP) {
          (async () => {
            const _refEP = db.getConfig('teams_list_ref_' + tplEP);
            if (_refEP) {
              const { buildTeamsListEmbed } = require('../panels/teamListPanel');
              const _chEP  = await cli.channels.fetch(_refEP.channelId).catch(() => null);
              const _msgEP = await _chEP?.messages.fetch(_refEP.messageId).catch(() => null);
              if (_msgEP) await _msgEP.edit(buildTeamsListEmbed(tid)).catch(e => console.warn('[p2 editteam]', e.message));
            }
          })().catch(() => {});
        }
      }
      // Refresh edit panel for this team
      const teamEP = db.findById('teams', teamIdEP);
      if (!teamEP) return interaction.update(buildPanel2(t));
      const slotsEP = (t.players_per_team || 1) >= 2 || (t.template || '').toUpperCase() === 'CL' ? 2 : 1;
      const curPlayersEP = db.get('players').filter(p => p.team_id === teamIdEP && p.tournament_id === tid);
      const statusEP = [];
      for (let i = 0; i < slotsEP; i++) {
        const p = curPlayersEP.find(pl => (pl.slot || 0) === i);
        statusEP.push(p ? `\u2705 ${slotsEP > 1 ? 'P' + (i+1) : 'Player'}: <@${p.discord_id}>` : `\u274c ${slotsEP > 1 ? 'P' + (i+1) : 'Player'}: not assigned`);
      }
      const playerRowsEP = [];
      for (let i = 0; i < slotsEP; i++) {
        playerRowsEP.push({ type: 1, components: [{ type: 5, custom_id: `p2_${tid}_editteam_player_${teamIdEP}_${i}`, placeholder: slotsEP > 1 ? `\ud83d\udc64  Player ${i+1} \u2014 pick new player...` : '\ud83d\udc64  Pick new player...', min_values: 0, max_values: 1 }] });
      }
      return interaction.update({
        flags: 32768,
        components: [{ type: 17, accent_color: 0xFF0049, components: [
          { type: 10, content: `**\u270f\ufe0f  Edit Players \u2014 ${teamEP.name}**\n> ${statusEP.join('  \u00b7  ')}` },
          SEP,
          ...playerRowsEP,
          SEP,
          { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: `p2_${tid}_editteam` }] },
        ]}],
      });
    }

    if (action === 'previewlist') {
      const { buildTeamsListEmbed: _buildTLE } = require('../panels/teamListPanel');
      const _previewPayload = _buildTLE(tid);
      return interaction.reply({ ..._previewPayload, flags: (_previewPayload.flags || 0) | 64 });
    }

    if (action === 'postlist') {
      const template = t.template;
      if (!template) return interaction.update(buildPanel2(t));
      try {
        const { buildTeamsListEmbed } = require('../panels/teamListPanel');
        const ref = db.getConfig('teams_list_ref_' + template);
        if (ref) {
          try {
            const ch2  = await cli.channels.fetch(ref.channelId);
            const msg2 = await ch2.messages.fetch(ref.messageId);
            await msg2.edit(buildTeamsListEmbed(tid));
            return interaction.update(buildPanel2(getT(tid)));
          } catch { /* ref stale — fall through to repost */ }
        }
        const targetId = (t.channels || {}).teamsList || (t.channels || {}).management;
        if (!targetId) return interaction.update(buildPanel2(t));
        const targetCh = await cli.channels.fetch(targetId).catch(() => null);
        if (!targetCh) return interaction.update(buildPanel2(t));
        const posted = await targetCh.send(buildTeamsListEmbed(tid));
        db.setConfig('teams_list_ref_' + template, { channelId: targetCh.id, messageId: posted.id });
        return interaction.update(buildPanel2(getT(tid)));
      } catch { return interaction.update(buildPanel2(t)); }
    }

    if (action === 'removeteam') {
      const ttRows2 = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
      if (!ttRows2.length) return interaction.update(buildPanel2(t));
      const opts = ttRows2.map(tt => {
        const tm = db.findById('teams', tt.team_id) || { name: 'Unknown', id: tt.team_id };
        return { label: tm.name.slice(0, 100), value: String(tm.id) };
      });
      return interaction.update({
        flags: 32768,
        components: [{ type: 17, accent_color: 0xED4245, components: [
          { type: 10, content: '**\ud83d\uddd1\ufe0f  Remove Team \u2014 Select a team to unenroll**' },
          SEP,
          { type: 1, components: [{ type: 3, custom_id: `p2_${tid}_removeteam_sel`, placeholder: 'Select a team to remove...', options: opts.slice(0, 25) }] },
          { type: 1, components: [{ type: 2, style: 2, label: 'Cancel', custom_id: `p2_${tid}_refresh` }] },
        ]}],
      });
    }

    if (action === 'removeteam_sel') {
      const teamId = parseInt(interaction.values[0]);
      const team   = db.findById('teams', teamId);
      const _removedPids = db.get('players').filter(p => p.team_id === teamId && p.tournament_id === tid).map(p => p.discord_id).filter(Boolean);
      db.deleteWhere('tournament_teams', r => r.tournament_id === tid && r.team_id === teamId);
      db.deleteWhere('players', p => p.team_id === teamId && p.tournament_id === tid);
      if (team && team.temporary) db.deleteWhere('teams', r => r.id === teamId);
      // Remove registration role + update team list
      (async () => {
        const _trm = getT(tid);
        const _regRole = _trm && _trm.registration_role_id;
        if (_regRole) {
          for (const uid of _removedPids) {
            const mem = await interaction.guild.members.fetch(uid).catch(() => null);
            if (mem) await mem.roles.remove(_regRole).catch(() => {});
          }
        }
        const _tplr = (_trm || {}).template;
        if (_tplr) {
          const _refr = db.getConfig('teams_list_ref_' + _tplr);
          if (_refr) {
            const { buildTeamsListEmbed } = require('../panels/teamListPanel');
            const _chr = await cli.channels.fetch(_refr.channelId).catch(() => null);
            const _msgr = await _chr?.messages.fetch(_refr.messageId).catch(() => null);
            if (_msgr) await _msgr.edit(buildTeamsListEmbed(tid)).catch(e => console.warn('[p2 rm teamlist]', e.message));
          }
        }
      })().catch(() => {});
      const freshT = getT(tid);
      refreshAll(cli, tid).catch(() => {});
      return interaction.update(buildPanel2(freshT));
    }

    if (action === 'clearteams') {
      const ttCount = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).length;
      if (!ttCount) return p3SmallReply(interaction, '⚠️ No teams to clear.');
      const SEP_U = { type: 14, divider: true, spacing: 1 };
      return interaction.update({
        flags: 32768,
        components: [{ type: 17, accent_color: 0xED4245, components: [
          { type: 10, content: `**⚠️  Clear All Teams**\nThis will remove all **${ttCount}** enrolled teams and their players from this tournament. This cannot be undone.` },
          SEP,
          { type: 1, components: [
            { type: 2, style: 4, label: '🗑  Confirm Clear All', custom_id: `p2_${tid}_clearteams_confirm` },
            { type: 2, style: 2, label: 'Cancel',                custom_id: `p2_${tid}_refresh` },
          ]},
        ]}],
      });
    }

    if (action === 'clearteams_confirm') {
      const ttRowsC   = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
      const tmpTeamIdsC = ttRowsC.filter(tt => db.findById('teams', tt.team_id)?.temporary).map(tt => tt.team_id);
      if (tmpTeamIdsC.length) db.deleteWhere('teams', t2 => tmpTeamIdsC.includes(t2.id));
      db.deleteWhere('tournament_teams', tt => tt.tournament_id === tid);
      db.deleteWhere('players', p => p.tournament_id === tid);
      refreshAll(cli, tid).catch(() => {});
      return interaction.update(buildPanel2(getT(tid)));
    }

        if (action === 'closereg') {
      await interaction.deferUpdate();
      db.update('tournaments', tid, { registration_open: false });
      // Run group draw if not done
      const hasGroups = db.get('tournament_teams').some(tt => tt.tournament_id === tid && tt.group_name);
      if (!hasGroups) runGroupDraw(tid);
      await refreshAll(cli, tid);
      return;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PANEL 3 INTERACTIONS
  // ════════════════════════════════════════════════════════════════════════════
  if (p3Match) {
    const tid    = parseInt(p3Match[1]);
    const action = p3Match[2];
    const t      = getT(tid);
    if (!t) return p3SmallReply(interaction, '❌ Tournament not found.');

    if (!isBotolaManager(interaction.member)) return noPermission(interaction);

    if (action === 'refresh') return interaction.update(buildPanel3(t));

    // Round selector  save chosen round and re-render panel
    if (action === 'roundsel') {
      const selRound = parseInt(interaction.values?.[0]);
      if (!isNaN(selRound)) db.setConfig('p3_round_' + tid, selRound);
      return interaction.update(buildPanel3(getT(tid)));
    }


    // Toggle post / preview mode
    if (action === 'togglemode') {
      db.update('tournaments', tid, { preview_mode: !t.preview_mode });
      const freshT = getT(tid);
      return interaction.update(buildPanel3(freshT));
    }

    if (action === 'toggletag') {
      db.update('tournaments', tid, { tag_on: !t.tag_on });
      const freshT = getT(tid);
      return interaction.update(buildPanel3(freshT));
    }

    const ch = t.channels || {};

    // ── Teams List ─────────────────────────────────────────────────────────
    if (action === 'teamslist') {
      const ttRows2 = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
      if (!ttRows2.length) return p3SmallReply(interaction, '❌ No teams enrolled yet.');
      const payload = buildTeamsListEmbed(tid);
      if (t.preview_mode) {
        return interaction.reply({ ...payload, ephemeral: true });
      }
      const targetCh = ch.teamsList || ch.management;
      if (!targetCh) return p3SmallReply(interaction, '❌ No channel configured. Set channels via `/admin`.');
      const postedMsg = await postToChannel(cli, targetCh, payload);
      if (postedMsg) db.setConfig('teams_list_ref_' + t.template, { channelId: targetCh, messageId: postedMsg.id });
      return p3SmallReply(interaction, `✅ Teams list posted to <#${targetCh}>.`);
    }

    // ── Post Schedule — auto current round ────────────────────────────────
    if (action === 'schedule') {
      const allGM_s = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
      if (!allGM_s.length) return p3SmallReply(interaction, '\u274c No matches generated yet.');
      const savedRd_s = db.getConfig('p3_round_' + tid);
      const allRds_s  = [...new Set(allGM_s.map(m => m.round))].sort((a, b) => a - b);
      const round_s   = (savedRd_s && allRds_s.includes(savedRd_s)) ? savedRd_s : (allRds_s[0] || 1);
      const schedPayload = makeSchedulePost(tid, round_s);
      if (!schedPayload) return p3SmallReply(interaction, '\u274c Failed to build schedule for Round ' + round_s + '.');
      if (t.preview_mode) return interaction.reply({ ...schedPayload, ephemeral: true });
      if (!ch.schedule) return p3SmallReply(interaction, '\u274c No schedule channel configured.');
      const _schedRole = t.tag_on ? t.registration_role_id : null;
      await postWithPing(cli, ch.schedule, _schedRole, schedPayload);
      return p3SmallReply(interaction, `\u2705 Round ${round_s} schedule posted to <#${ch.schedule}>.`);
    }


    // Post Schedule for a specific round
    if (action.startsWith('schedule_r') && !isNaN(parseInt(action.slice(10)))) {
      if (!ch.schedule) return p3SmallReply(interaction, '\u274c No schedule channel configured.');
      const round = parseInt(action.slice(10));
      const schedPayload = makeSchedulePost(tid, round);
      if (!schedPayload) return p3SmallReply(interaction, '\u274c No matches found for that round.');
      if (t.preview_mode) return interaction.reply({ ...schedPayload, ephemeral: true });
      const _schedRole = t.tag_on ? t.registration_role_id : null;
      await postWithPing(cli, ch.schedule, _schedRole, schedPayload);
      return p3SmallReply(interaction, `\u2705 Round ${round} schedule posted to <#${ch.schedule}>.`);
    }

    // ── Results — auto last completed round ────────────────────────────────
    if (action === 'results') {
      const allGM_r = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
      if (!allGM_r.length) return p3SmallReply(interaction, '\u274c No matches yet.');
      const savedRd_r = db.getConfig('p3_round_' + tid);
      const allRds_r  = [...new Set(allGM_r.map(m => m.round))].sort((a, b) => a - b);
      const round_r   = (savedRd_r && allRds_r.includes(savedRd_r)) ? savedRd_r : (allRds_r[0] || 1);
      const resultsPayload = makeResultsPost(tid, round_r);
      if (!resultsPayload) return p3SmallReply(interaction, `\u274c No played matches in Round ${round_r} yet.`);
      if (t.preview_mode) return interaction.reply({ ...resultsPayload, ephemeral: true });
      if (!ch.results) return p3SmallReply(interaction, '\u274c No results channel configured.');
      const _resRole = t.tag_on ? t.registration_role_id : null;
      await postWithPing(cli, ch.results, _resRole, resultsPayload);
      return p3SmallReply(interaction, `\u2705 Round ${round_r} results posted to <#${ch.results}>.`);
    }


    // Post Results for a specific round
    // Post Results for a specific round
    if (action.startsWith('results_r') && !isNaN(parseInt(action.slice(9)))) {
      if (!ch.results) return p3SmallReply(interaction, '\u274c No results channel configured.');
      const round = parseInt(action.slice(9));
      const resultsPayload = makeResultsPost(tid, round);
      if (!resultsPayload) return p3SmallReply(interaction, `\u274c No played matches in Round ${round} yet.`);
      if (t.preview_mode) return interaction.reply({ ...resultsPayload, ephemeral: true });
      const _resRole = t.tag_on ? t.registration_role_id : null;
      await postWithPing(cli, ch.results, _resRole, resultsPayload);
      return p3SmallReply(interaction, `\u2705 Round ${round} results posted to <#${ch.results}>.`);
    }

    // ── Standings ────────────────────────────────────────────────────────
    if (action === 'standings') {
      const savedRd_st = db.getConfig('p3_round_' + tid) || null;
      const standEmbed = buildGroupStandingsEmbed ? buildGroupStandingsEmbed(tid, savedRd_st) : null;
      if (!standEmbed) return p3SmallReply(interaction, '\u274c No standings to display yet.');
      if (t.preview_mode) return interaction.reply({ ...standEmbed, ephemeral: true });
      const postCh = ch.results || ch.management;
      if (!postCh) return p3SmallReply(interaction, '\u274c No results channel configured. Set it via `/admin`.');
      const _standRole = t.tag_on ? t.registration_role_id : null;
      const posted = await postWithPing(cli, postCh, _standRole, standEmbed);
      if (posted) db.setConfig('standings_ref_' + tid, { channelId: postCh, messageId: posted.id });
      return p3SmallReply(interaction, `\u2705 Standings (Round ${savedRd_st || 'all'}) posted to <#${postCh}>.`);
    }


    if (action === 'standings_confirm') {
      return interaction.update(buildPanel3(t));
    }

    // ── Post Group Draw ─────────────────────────────────────────────────────
    if (action === 'groupdraw') {
      const drawPayload = makeGroupDrawPost(tid);
      if (!drawPayload) return p3SmallReply(interaction, '❌ No groups drawn yet.');
      if (t.preview_mode) return interaction.reply({ ...drawPayload, ephemeral: true });
      const _gdCh = ch.schedule || ch.management;
      if (!_gdCh) return p3SmallReply(interaction, '❌ No schedule channel configured.');
      const _drawRole = t.tag_on ? t.registration_role_id : null;
      await postWithPing(cli, _gdCh, _drawRole, drawPayload);
      return p3SmallReply(interaction, `✅ Group draw posted to <#${_gdCh}>.`);
    }

    // ── Post Bracket ────────────────────────────────────────────────────────
    if (action === 'bracket') {
      const bracketPayload = makeBracketPost(tid);
      if (!bracketPayload) return p3SmallReply(interaction, '❌ No knockout matches yet.');
      if (t.preview_mode) return interaction.reply({ ...bracketPayload, ephemeral: true });
      const _brCh = ch.results || ch.management;
      if (!_brCh) return p3SmallReply(interaction, '❌ No results channel configured.');
      const _brackRole = t.tag_on ? t.registration_role_id : null;
      const _brPosted = await postWithPing(cli, _brCh, _brackRole, bracketPayload);
      if (_brPosted) db.setConfig('bracket_ref_' + tid, { channelId: _brCh, messageId: _brPosted.id });
      return p3SmallReply(interaction, `✅ Bracket posted to <#${_brCh}> — updates live as results are added.`);
    }

    // ── Winner Announcement ─────────────────────────────────────────────────
    if (action === 'winner_ann') {
      // Determine winner from Final aggregate (leg1 + leg2)
      const koMatches = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'knockout');
      const leg1 = koMatches.find(m => m.round === 1 && (!m.leg || m.leg === 1));
      const leg2 = koMatches.find(m => m.round === 1 && m.leg === 2);

      if (!leg1 || leg1.status !== 'played') {
        return p3SmallReply(interaction, '❌ Final must be played first.');
      }

      // Aggregate goals: use both legs if available, otherwise single leg
      let winTeamId;
      if (leg2 && leg2.status === 'played') {
        const hAgg = (leg1.home_score || 0) + (leg2.away_score || 0);
        const aAgg = (leg1.away_score || 0) + (leg2.home_score || 0);
        if (hAgg > aAgg) {
          winTeamId = leg1.home_team_id;
        } else if (aAgg > hAgg) {
          winTeamId = leg1.away_team_id;
        } else {
          winTeamId = leg2.pen_winner || leg1.home_team_id;
        }
      } else {
        winTeamId = (leg1.home_score || 0) >= (leg1.away_score || 0) ? leg1.home_team_id : leg1.away_team_id;
      }

      const winTeam  = db.findById('teams', winTeamId);
      const winTTs   = db.findWhere('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === winTeamId);
      const players  = db.findWhere('players', p => winTTs.some(tt => tt.id === p.tournament_team_id));
      const playerMentions = players.length
        ? players.map(p => `<@${p.discord_id}>`).join('  ')
        : '`No players registered`';

      const champPayload = makeChampionPost(t.name, t.season, winTeam?.name || 'UNKNOWN');

      if (t.preview_mode) return interaction.reply({ ...champPayload, ephemeral: true });

      const _annCh = ch.results || ch.management;
      if (!_annCh) return p3SmallReply(interaction, '❌ No results channel configured.');
      const _annRole = t.tag_on ? t.registration_role_id : null;
      await postWithPing(cli, _annCh, _annRole, champPayload);
      return p3SmallReply(interaction, `✅ Winner announcement posted to <#${_annCh}>.`);
    }
  }
}

module.exports = { handleBotolaInteraction, refreshAll };
