'use strict';
const { db } = require('../utils/database');
const { buildTeamsListEmbed } = require('../panels/teamListPanel');
const {
  makeSchedulePost, makeResultsPost, makeStandingsPost,
  makeGroupDrawPost, makeBracketPost,
} = require('../utils/tournamentEmbeds');

const SEP  = { type: 14, divider: true, spacing: 1 };
const txt  = c => ({ type: 10, content: c });
const box  = (color, inner) => ({ flags: 32768, components: [{ type: 17, accent_color: color, components: inner }] });
const E_CUP = '<a:cup:1501741159557500971>';

// ── Returns the real active/setup tournament ──────────────────────────────────
function findTestTournament() {
  const ts = db.get('tournaments');
  return ts.find(t => t.status === 'active') || ts.find(t => t.status === 'setup') || ts[0] || null;
}

// ── 24 NSEL-style teams — 16 picked randomly every call ──────────────────────
const _POOL = [
  ['Real Madrid',       'RMA'], ['FC Barcelona',      'BAR'], ['Bayern Munich',     'BAY'],
  ['PSG',               'PSG'], ['Liverpool FC',      'LIV'], ['Manchester City',   'MCI'],
  ['Juventus',          'JUV'], ['AC Milan',          'MIL'], ['Inter Milan',       'INT'],
  ['Atletico Madrid',   'ATL'], ['Borussia Dortmund', 'BVB'], ['Porto',             'POR'],
  ['Benfica',           'SLB'], ['Ajax',              'AJX'], ['AS Roma',           'ROM'],
  ['Napoli',            'NAP'], ['Chelsea FC',        'CHE'], ['Arsenal',           'ARS'],
  ['Tottenham',         'TOT'], ['Sevilla FC',        'SEV'], ['Villarreal CF',     'VIL'],
  ['Lazio',             'LAZ'], ['AS FAR',            'FAR'], ['Celtic FC',         'CEL'],
];

function _shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// Random goal (weighted toward low scores)
function _g() { return [0,0,0,1,1,1,1,2,2,2,3,3,4][Math.floor(Math.random() * 13)]; }
// Random score that guarantees a winner (no draw) — used for KO matches
function _koScore() {
  let h, a;
  do { h = _g(); a = _g(); } while (h === a);
  return [h, a];
}

// ── Full NSEL 4-group demo tournament ─────────────────────────────────────────
// Group stage: 3 rounds of round-robin (each team plays exactly once per round)
// Bracket: QF (4, played) → SF (2, played) → Final (1, pending)
// Schedule/Results tests show Round 1 only; Standings after all 3 rounds.
function withDemoData(fn) {
  const ids = { teams: [], tt: [], matches: [], tid: null };
  try {
    const t = db.insert('tournaments', {
      name: 'NSEL S1', season: 1, template: 'NSEL',
      status: 'active', teams_per_group: 4, advance_per_group: 2,
      win_pts: 3, draw_pts: 1, loss_pts: 0, forfeit_pts: 0,
    });
    ids.tid = t.id;

    // 16 random teams from NSEL pool
    const picked  = _shuffle(_POOL).slice(0, 16);
    const teamIds = picked.map(([name, short_name]) => {
      const tm = db.insert('teams', { name, short_name });
      ids.teams.push(tm.id);
      return tm.id;
    });

    // Groups A-D, 4 teams each
    const GROUPS = ['A', 'B', 'C', 'D'];
    // Circle-method round-robin: [h0, a0, h1, a1] — each team plays exactly once/round
    const RR = [[0,1,2,3], [0,2,3,1], [0,3,1,2]];

    const qualifiers = []; // top-2 per group in order: A1, A2, B1, B2, C1, C2, D1, D2

    for (let gi = 0; gi < 4; gi++) {
      const grp   = GROUPS[gi];
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
          const m = db.insert('matches', {
            tournament_id: ids.tid,
            home_team_id: slice[hi], away_team_id: slice[ai],
            stage: 'group', round: r + 1, leg: 1,
            status: 'played', home_score: hs, away_score: as_,
          });
          ids.matches.push(m.id);
        }
      }

      // Save tournament_team rows with final stats
      const slotTTs = stats.map((s, si) => {
        const tt = db.insert('tournament_teams', {
          tournament_id: ids.tid, team_id: slice[si], group_name: grp,
          wins: s.wins, draws: s.draws, losses: s.losses,
          goals_for: s.goals_for, goals_against: s.goals_against, points: s.points,
        });
        ids.tt.push(tt.id);
        return { teamId: slice[si], points: s.points, gd: s.goals_for - s.goals_against };
      });

      // Top 2 from this group (in finish order)
      slotTTs
        .sort((a, b) => b.points - a.points || b.gd - a.gd)
        .slice(0, 2)
        .forEach(x => qualifiers.push(x.teamId));
    }

    // ── Full Knockout Bracket ──────────────────────────────────────────────────
    // qualifiers: [A1, A2, B1, B2, C1, C2, D1, D2]
    // QF draw: A1vD2, B1vC2, C1vB2, D1vA2  (standard cross-bracket)
    const qfPairs = [
      [qualifiers[0], qualifiers[7]],  // A1 vs D2
      [qualifiers[2], qualifiers[5]],  // B1 vs C2
      [qualifiers[4], qualifiers[3]],  // C1 vs B2
      [qualifiers[6], qualifiers[1]],  // D1 vs A2
    ];

    const qfWinners = [];
    for (const [home, away] of qfPairs) {
      const [hs, as_] = _koScore();
      const m = db.insert('matches', {
        tournament_id: ids.tid,
        home_team_id: home, away_team_id: away,
        stage: 'knockout', round: 4, leg: 1,
        status: 'played', home_score: hs, away_score: as_,
      });
      ids.matches.push(m.id);
      qfWinners.push(hs > as_ ? home : away);
    }

    // SF: QF winner 1 vs QF winner 2, QF winner 3 vs QF winner 4
    const sfPairs = [
      [qfWinners[0], qfWinners[1]],
      [qfWinners[2], qfWinners[3]],
    ];
    const sfWinners = [];
    for (const [home, away] of sfPairs) {
      const [hs, as_] = _koScore();
      const m = db.insert('matches', {
        tournament_id: ids.tid,
        home_team_id: home, away_team_id: away,
        stage: 'knockout', round: 2, leg: 1,
        status: 'played', home_score: hs, away_score: as_,
      });
      ids.matches.push(m.id);
      sfWinners.push(hs > as_ ? home : away);
    }

    // Final: pending (not played yet)
    const mFinal = db.insert('matches', {
      tournament_id: ids.tid,
      home_team_id: sfWinners[0], away_team_id: sfWinners[1],
      stage: 'knockout', round: 1, leg: 1,
      status: 'pending', home_score: null, away_score: null,
    });
    ids.matches.push(mFinal.id);

    return fn(ids.tid);
  } finally {
    db.deleteWhere('matches',          m  => ids.matches.includes(m.id));
    db.deleteWhere('tournament_teams', tt => ids.tt.includes(tt.id));
    db.deleteWhere('teams',            t  => ids.teams.includes(t.id));
    if (ids.tid !== null) db.delete('tournaments', ids.tid);
  }
}

// ── Main menu ─────────────────────────────────────────────────────────────────
function buildTestMenuPayload() {
  const t     = findTestTournament();
  const label = t ? t.name : 'No tournament — NSEL demo data will be used';
  return box(0x2b2d31, [
    txt(
      `# ${E_CUP}  Test Panel\n` +
      `> Every preview uses the **exact same builders** as live channel posts.\n` +
      `> Using: **${label}**`
    ),
    SEP,
    { type: 1, components: [
      { type: 2, style: 1, label: '📋 Teams List',   custom_id: 'test_teams_list' },
      { type: 2, style: 1, label: '📅 Schedule',     custom_id: 'test_schedule'   },
      { type: 2, style: 1, label: '⚽ Results',      custom_id: 'test_results'    },
    ]},
    { type: 1, components: [
      { type: 2, style: 1, label: '📊 Standings',    custom_id: 'test_standings'  },
      { type: 2, style: 1, label: '🎲 Group Draw',   custom_id: 'test_groupdraw'  },
      { type: 2, style: 1, label: '🏆 Bracket',      custom_id: 'test_bracket'    },
    ]},
    SEP,
    txt('-# Night Stars  •  Test Mode — previews are ephemeral, only you can see them'),
  ]);
}

// ── Teams List ─────────────────────────────────────────────────────────────────
function buildTestTeamsList() {
  const t = findTestTournament();
  if (!t) return box(0x2b2d31, [txt('❌ No tournament found — create one first.')]);
  const embed = buildTeamsListEmbed(t.id);
  if (!embed) return box(0x2b2d31, [txt('❌ No teams registered yet.')]);
  return embed;
}

// ── Schedule — Round 1 (each team plays exactly once) ─────────────────────────
function buildTestSchedule() {
  const t    = findTestTournament();
  const allGM = t ? db.get('matches').filter(m => m.tournament_id === t.id && m.stage === 'group') : [];
  if (allGM.length) {
    const rounds = [...new Set(allGM.map(m => m.round))].sort((a, b) => a - b);
    const payload = makeSchedulePost(t.id, rounds[0]);
    if (payload) return payload;
  }
  return withDemoData(tid => makeSchedulePost(tid, 1) || box(0x2b2d31, [txt('❌ Schedule demo failed.')]));
}

// ── Results — Round 1 scores ───────────────────────────────────────────────────
function buildTestResults() {
  const t    = findTestTournament();
  const allGM = t ? db.get('matches').filter(m => m.tournament_id === t.id && m.stage === 'group') : [];
  const done  = [...new Set(allGM.filter(m => m.status === 'played').map(m => m.round))].sort((a, b) => a - b);
  if (done.length) {
    const payload = makeResultsPost(t.id, done[0]); // Round 1
    if (payload) return payload;
  }
  return withDemoData(tid => makeResultsPost(tid, 1) || box(0x2b2d31, [txt('❌ Results demo failed.')]));
}

// ── Standings — after all group rounds ────────────────────────────────────────
function buildTestStandings() {
  const t      = findTestTournament();
  const ttRows = t ? db.get('tournament_teams').filter(tt => tt.tournament_id === t.id && tt.group_name) : [];
  if (ttRows.length) {
    const payload = makeStandingsPost(t.id);
    if (payload) return payload;
  }
  return withDemoData(tid => makeStandingsPost(tid) || box(0x2b2d31, [txt('❌ Standings demo failed.')]));
}

// ── Group Draw ────────────────────────────────────────────────────────────────
function buildTestGroupDraw() {
  const t      = findTestTournament();
  const ttRows = t ? db.get('tournament_teams').filter(tt => tt.tournament_id === t.id && tt.group_name) : [];
  if (ttRows.length) {
    const payload = makeGroupDrawPost(t.id);
    if (payload) return payload;
  }
  return withDemoData(tid => makeGroupDrawPost(tid) || box(0x2b2d31, [txt('❌ Group draw demo failed.')]));
}

// ── Bracket — QF (played) + SF (played) + Final (pending) ────────────────────
function buildTestBracket() {
  const t   = findTestTournament();
  const koM = t ? db.get('matches').filter(m => m.tournament_id === t.id && m.stage === 'knockout') : [];
  if (koM.length > 0 && koM.length <= 16) {
    const payload = makeBracketPost(t.id);
    if (payload) return payload;
  }
  return withDemoData(tid => makeBracketPost(tid) || box(0x2b2d31, [txt('❌ Bracket demo failed.')]));
}

// ── Interaction handler ───────────────────────────────────────────────────────
async function handleTestInteraction(interaction) {
  const id = interaction.customId;

  const BUILDERS = {
    test_teams_list: buildTestTeamsList,
    test_schedule:   buildTestSchedule,
    test_results:    buildTestResults,
    test_standings:  buildTestStandings,
    test_groupdraw:  buildTestGroupDraw,
    test_bracket:    buildTestBracket,
  };

  if (BUILDERS[id]) {
    await interaction.deferReply({ flags: 64 | 32768 }); // ephemeral + components v2
    const payload = BUILDERS[id]();
    if (!payload) { await interaction.deleteReply(); return; }
    return interaction.editReply({ ...payload });
  }

  if (id === 'test_back') {
    return interaction.update(buildTestMenuPayload());
  }
}

module.exports = { handleTestInteraction, buildTestMenuPayload, buildTestTeamsList, buildTestSchedule, buildTestResults, buildTestStandings, buildTestGroupDraw, buildTestBracket };
