'use strict';
const { db } = require('../utils/database');
const {
  makeSchedulePost, makeResultsPost, makeStandingsPost,
  makeGroupDrawPost, makeBracketPost, makeChampionPost,
} = require('../utils/tournamentEmbeds');
const { buildTeamsListEmbed } = require('../panels/teamListPanel');

const SEP    = { type: 14, divider: true, spacing: 1 };
const txt    = c => ({ type: 10, content: c });
const DARK   = 2829617;

// ── Random team pool ──────────────────────────────────────────────────────────
const _POOL = [
  ['Real Madrid','RMA'],['FC Barcelona','BAR'],['Bayern Munich','BAY'],['PSG','PSG'],
  ['Liverpool FC','LIV'],['Manchester City','MCI'],['Juventus','JUV'],['AC Milan','MIL'],
  ['Inter Milan','INT'],['Atletico Madrid','ATL'],['Borussia Dortmund','BVB'],['Porto','POR'],
  ['Benfica','SLB'],['Ajax','AJX'],['AS Roma','ROM'],['Napoli','NAP'],
  ['Chelsea FC','CHE'],['Arsenal','ARS'],['Tottenham','TOT'],['Sevilla FC','SEV'],
  ['Villarreal CF','VIL'],['Lazio','LAZ'],['AS FAR','FAR'],['Celtic FC','CEL'],
];
function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function _g() { return [0,0,0,1,1,1,1,2,2,2,3,3,4][Math.floor(Math.random() * 13)]; }
function _koScore() { let h, a; do { h = _g(); a = _g(); } while (h === a); return [h, a]; }

// ── Build all demo payloads inside a temp tournament, clean up on exit ────────
function buildAllDemoPosts() {
  const ids = { teams: [], tt: [], matches: [], tid: null };
  try {
    const t = db.insert('tournaments', {
      name: 'TEST', season: 99, template: 'EL', status: 'active',
      teams_per_group: 4, advance_per_group: 2,
      win_pts: 3, draw_pts: 1, loss_pts: 0, forfeit_pts: 0,
    });
    ids.tid = t.id;

    // ── Batch insert teams (1 save instead of 16) ─────────────────────────────────────────
    const picked = _shuffle(_POOL).slice(0, 16);
    const insertedTeams = db.insertMany('teams', picked.map(([name, short_name]) => ({ name, short_name })));
    ids.teams = insertedTeams.map(tm => tm.id);
    const teamIds = ids.teams;

    const GROUPS = ['A','B','C','D'];
    const RR = [[0,1,2,3],[0,2,3,1],[0,3,1,2]];
    const qualifiers = [];
    const matchRecords = [];
    const ttRecords = [];

    for (let gi = 0; gi < 4; gi++) {
      const slice = teamIds.slice(gi * 4, gi * 4 + 4);
      const stats = Array.from({ length: 4 }, () => ({
        wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0,
      }));
      for (let r = 0; r < 3; r++) {
        const [h0, a0, h1, a1] = RR[r];
        for (const [hi, ai] of [[h0, a0], [h1, a1]]) {
          const hs = _g(), as_ = _g();
          stats[hi].goals_for  += hs;  stats[hi].goals_against += as_;
          stats[ai].goals_for  += as_; stats[ai].goals_against += hs;
          if      (hs > as_) { stats[hi].wins++;  stats[hi].points += 3; stats[ai].losses++; }
          else if (as_ > hs) { stats[ai].wins++;  stats[ai].points += 3; stats[hi].losses++; }
          else               { stats[hi].draws++; stats[hi].points++;    stats[ai].draws++; stats[ai].points++; }
          matchRecords.push({
            tournament_id: ids.tid,
            home_team_id: slice[hi], away_team_id: slice[ai],
            stage: 'group', round: r + 1, leg: 1,
            status: 'played', home_score: hs, away_score: as_,
          });
        }
      }
      const slotStats = slice.map((teamId, si) => ({
        teamId, points: stats[si].points, gd: stats[si].goals_for - stats[si].goals_against,
      }));
      slotStats.sort((a, b) => b.points - a.points || b.gd - a.gd)
               .slice(0, 2).forEach(x => qualifiers.push(x.teamId));
      for (let si = 0; si < 4; si++) {
        const s = stats[si];
        ttRecords.push({
          tournament_id: ids.tid, team_id: slice[si], group_name: GROUPS[gi],
          wins: s.wins, draws: s.draws, losses: s.losses,
          goals_for: s.goals_for, goals_against: s.goals_against, points: s.points,
        });
      }
    }

    // ── Batch insert group matches + tournament_teams (2 saves instead of 40) ────
    const insertedMatches = db.insertMany('matches', matchRecords);
    ids.matches = insertedMatches.map(m => m.id);
    const insertedTT = db.insertMany('tournament_teams', ttRecords);
    ids.tt = insertedTT.map(tt => tt.id);

    // ── KO bracket — collect all, then 1 batch insert ────────────────────────────
    const qfPairs = [
      [qualifiers[0], qualifiers[7]], [qualifiers[2], qualifiers[5]],
      [qualifiers[4], qualifiers[3]], [qualifiers[6], qualifiers[1]],
    ];
    const koRecords = [];
    const qfWinners = [];
    for (const [home, away] of qfPairs) {
      const [hs, as_] = _koScore();
      koRecords.push({ tournament_id: ids.tid, home_team_id: home, away_team_id: away, stage: 'knockout', round: 4, leg: 1, status: 'played', home_score: hs, away_score: as_ });
      qfWinners.push(hs > as_ ? home : away);
    }
    const sfWinners = [];
    for (const [home, away] of [[qfWinners[0], qfWinners[1]], [qfWinners[2], qfWinners[3]]]) {
      const [hs, as_] = _koScore();
      koRecords.push({ tournament_id: ids.tid, home_team_id: home, away_team_id: away, stage: 'knockout', round: 2, leg: 1, status: 'played', home_score: hs, away_score: as_ });
      sfWinners.push(hs > as_ ? home : away);
    }
    const [fhs, fas] = _koScore();
    koRecords.push({ tournament_id: ids.tid, home_team_id: sfWinners[0], away_team_id: sfWinners[1], stage: 'knockout', round: 1, leg: 1, status: 'played', home_score: fhs, away_score: fas });
    const [f2hs, f2as] = _koScore();
    koRecords.push({ tournament_id: ids.tid, home_team_id: sfWinners[1], away_team_id: sfWinners[0], stage: 'knockout', round: 1, leg: 2, status: 'played', home_score: f2hs, away_score: f2as });
    const insertedKO = db.insertMany('matches', koRecords);
    ids.matches.push(...insertedKO.map(m => m.id));

    const hAgg = fhs + f2as;
    const aAgg = fas + f2hs;
    const champId = hAgg >= aAgg ? sfWinners[0] : sfWinners[1];
    const chTeam  = db.get('teams').find(tm => tm.id === champId) || { name: 'Unknown' };

    // ── Build teams list post using the real builder (while DB records exist) ──
    const teamsListPost = buildTeamsListEmbed(ids.tid);

    return {
      teamsList:  teamsListPost,
      groupDraw:  makeGroupDrawPost(ids.tid),
      scheduleR1: makeSchedulePost(ids.tid, 1),
      resultsR1:  makeResultsPost(ids.tid, 1),
      standings:  makeStandingsPost(ids.tid),
      bracket:    makeBracketPost(ids.tid),
      champion: makeChampionPost('Test', 1, chTeam.name),
    };
  } finally {
    db.deleteWhere('matches',          m  => ids.matches.includes(m.id));
    db.deleteWhere('tournament_teams', tt => ids.tt.includes(tt.id));
    db.deleteWhere('teams',            t  => ids.teams.includes(t.id));
    if (ids.tid !== null) db.delete('tournaments', ids.tid);
  }
}

// ── Build the control panel message ──────────────────────────────────────────
function buildPanel() {
  const active = db.get('tournaments').find(t => t.status === 'active');
  const label  = active ? active.name : 'TEST MODE';
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: DARK, components: [
      txt(`# Test Panel\n> Every preview uses the **exact same builders** as live channel posts.\n> Using: **${label}**`),
      SEP,
      { type: 1, components: [
        { type: 2, style: 1, label: '📋 Teams List', custom_id: 'test_teams_list' },
        { type: 2, style: 1, label: '🎲 Group Draw', custom_id: 'test_groupdraw' },
      ]},
      { type: 1, components: [
        { type: 2, style: 1, label: '📅 Schedule',   custom_id: 'test_schedule' },
        { type: 2, style: 1, label: '⚽ Results',    custom_id: 'test_results' },
      ]},
      { type: 1, components: [
        { type: 2, style: 1, label: '📊 Standings',  custom_id: 'test_standings' },
        { type: 2, style: 1, label: '🏆 Bracket',   custom_id: 'test_bracket' },
      ]},
      { type: 1, components: [
        { type: 2, style: 1, label: '🥇 Winner Ann', custom_id: 'test_winner_ann' },
      ]},
      SEP,
      txt('-# © 24 2026  |  Goatsi Bot'),
    ]}],
  };
}

// ── Button handler — each click sends ephemeral preview, deletes after 15s ───
async function handleTestInteraction(interaction) {
  const id = interaction.customId;
  const valid = ['test_teams_list','test_schedule','test_results','test_standings','test_groupdraw','test_bracket','test_winner_ann'];
  if (!valid.includes(id)) return;

  // deferReply already called in interactionCreate router before dispatch
  const posts = buildAllDemoPosts();
  const map = {
    test_teams_list: posts.teamsList,
    test_schedule:   posts.scheduleR1,
    test_results:    posts.resultsR1,
    test_standings:  posts.standings,
    test_groupdraw:  posts.groupDraw,
    test_bracket:    posts.bracket,
    test_winner_ann: posts.champion,
  };

  const payload = map[id];
  await interaction.editReply({ flags: payload.flags, components: payload.components });

  setTimeout(() => interaction.deleteReply().catch(() => {}), 15_000);
}

// ── Called by /testpost slash command ────────────────────────────────────────
async function executeTestpanel(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel;
  const ref     = db.getConfig('testpanel_ref') || {};

  // Delete old panel if same channel
  if (ref.controlId && ref.channelId === channel.id) {
    const old = await channel.messages.fetch(ref.controlId).catch(() => null);
    if (old) await old.delete().catch(() => {});
  }

  const panelMsg = await channel.send(buildPanel());
  db.setConfig('testpanel_ref', { channelId: channel.id, controlId: panelMsg.id });

  await interaction.editReply({ content: '✅ Test panel posted.' });
  setTimeout(() => interaction.deleteReply().catch(() => {}), 5_000);
}

module.exports = { handleTestInteraction, executeTestpanel };
