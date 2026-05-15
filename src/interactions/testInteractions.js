'use strict';
const { db } = require('../utils/database');

const SEP   = { type: 14, divider: true, spacing: 1 };
const txt   = c  => ({ type: 10, content: c });
const box   = (color, inner) => ({ flags: 32768, components: [{ type: 17, accent_color: color, components: inner }] });

const E_CUP  = '<a:cup:1501741159557500971>';
const E_HASH = '<a:hashtag:1501741088736678069>';
const E_ARR  = '<a:arrow:1501741110798585927>';
const E_FIRE = '<a:fire:1472250580583059611>';
const E_CROWN= '<:crownn:1501741176296964277>';

const BACK_BTN = { type: 1, components: [{ type: 2, style: 2, label: 'Back to Menu', custom_id: 'test_back' }] };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function getTestTeams() { return shuffle(db.get('teams')).slice(0, 8); }
function getTestPlayers() { return shuffle(db.get('players')).slice(0, 8); }
function splitGroups(teams) { return { A: teams.slice(0, 4), B: teams.slice(4, 8) }; }

// ── Main menu ─────────────────────────────────────────────────────────────────
function buildTestMenuPayload() {
  return box(0x2b2d31, [
    txt(`# ${E_CUP}  Test Panel\nClick a button to preview — updates in this message, no new posts.`),
    SEP,
    { type: 1, components: [
      { type: 2, style: 1, label: 'Teams List',     custom_id: 'test_teams_list' },
      { type: 2, style: 1, label: 'Standings',      custom_id: 'test_standings'  },
      { type: 2, style: 1, label: 'Match Schedule', custom_id: 'test_schedule'   },
    ]},
    { type: 1, components: [
      { type: 2, style: 1, label: 'Results',    custom_id: 'test_results'   },
      { type: 2, style: 2, label: 'Group Draw', custom_id: 'test_groupdraw' },
    ]},
    SEP,
    txt('-# Night Stars  •  Test Mode — data is randomly generated'),
  ]);
}

// ── Teams List ────────────────────────────────────────────────────────────────
function buildTestTeamsList() {
  const teams   = getTestTeams();
  const players = getTestPlayers();
  const inner   = [txt(`# ${E_CUP}  Teams List  —  Test Season\n8 teams  •  randomly picked`), SEP];

  teams.forEach((team, i) => {
    const p1 = players[i * 2 % players.length];
    const p2 = players[(i * 2 + 1) % players.length];
    inner.push(txt(`${E_ARR}  **${team.name}**\n<@${p1?.discord_id || '000'}> / <@${p2?.discord_id || '000'}>`));
    inner.push(SEP);
  });

  inner.push(txt('-# Night Stars  •  Test Mode'));
  inner.push(BACK_BTN);
  return box(0x2b2d31, inner);
}

// ── Standings ─────────────────────────────────────────────────────────────────
function buildTestStandings() {
  const teams  = getTestTeams();
  const groups = splitGroups(teams);
  const inner  = [txt(`# ${E_CUP}  Standings  —  Test Season`), SEP];

  for (const [g, gTeams] of Object.entries(groups)) {
    const rows = gTeams.map(t => {
      const w = randInt(0, 3), d = randInt(0, 2), l = randInt(0, 3);
      const gf = randInt(0, 12), ga = randInt(0, 10);
      return { name: t.name, pts: w * 3 + d, gd: gf - ga, mp: w + d + l };
    }).sort((a, b) => b.pts - a.pts || b.gd - a.gd);

    const header = '`#   Team                MP   GD   PTS`';
    const lines  = rows.map((r, i) => {
      const num  = String(i + 1).padEnd(2);
      const name = r.name.padEnd(18).slice(0, 18);
      const mp   = String(r.mp).padStart(2);
      const gd   = (r.gd >= 0 ? '+' : '') + r.gd;
      const pts  = String(r.pts).padStart(3);
      return `\`${num}  ${name}  ${mp}  ${gd.padStart(4)}  ${pts}\``;
    });
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${header}\n${lines.join('\n')}`));
    inner.push(SEP);
  }

  inner.push(txt('-# Night Stars  •  Test Mode'));
  inner.push(BACK_BTN);
  return box(0xCC0000, inner);
}

// ── Match Schedule ────────────────────────────────────────────────────────────
function buildTestSchedule() {
  const teams  = getTestTeams();
  const groups = splitGroups(teams);
  const inner  = [txt(`# ${E_CUP}  Match Schedule  —  Test Season`), SEP];

  for (const [g, gTeams] of Object.entries(groups)) {
    const fixtures = [
      [gTeams[0], gTeams[3]], [gTeams[1], gTeams[2]],
      [gTeams[0], gTeams[2]], [gTeams[1], gTeams[3]],
      [gTeams[0], gTeams[1]], [gTeams[2], gTeams[3]],
    ];
    const rounds = [
      ['Round 1/3', fixtures.slice(0, 2)],
      ['Round 2/3', fixtures.slice(2, 4)],
      ['Round 3/3', fixtures.slice(4, 6)],
    ];
    inner.push(txt(`${E_HASH}  **GROUP ${g}**`));
    for (const [rLabel, pairs] of rounds) {
      const lines = pairs.map(([h, a]) => `${E_ARR}  **${h.name}**  vs  **${a.name}**`);
      inner.push(txt(`**${rLabel}**\n${lines.join('\n')}`));
    }
    inner.push(SEP);
  }

  inner.push(txt('-# Night Stars  •  Test Mode'));
  inner.push(BACK_BTN);
  return box(0x5865F2, inner);
}

// ── Results ───────────────────────────────────────────────────────────────────
function buildTestResults() {
  const teams  = getTestTeams();
  const groups = splitGroups(teams);
  const inner  = [txt(`# ${E_CUP}  Results of Round 1/3  —  Test Season`), SEP];

  for (const [g, gTeams] of Object.entries(groups)) {
    const fixtures = [[gTeams[0], gTeams[3]], [gTeams[1], gTeams[2]]];
    const lines = fixtures.map(([h, a]) => {
      const hs = randInt(0, 5), as_ = randInt(0, 5);
      const draw = hs === as_;
      const icon    = draw ? `${E_ARR}` : E_FIRE;
      const homeStr = hs > as_  ? `${E_CROWN} **${h.name}**` : `**${h.name}**`;
      const awayStr = as_ > hs  ? `**${a.name}** ${E_CROWN}` : `**${a.name}**`;
      return `${icon}  ${homeStr}  \`${hs} — ${as_}\`  ${awayStr}`;
    });
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${lines.join('\n')}`));
    inner.push(SEP);
  }

  inner.push(txt('-# Night Stars  •  Test Mode'));
  inner.push(BACK_BTN);
  return box(0xCC0000, inner);
}

// ── Group Draw ────────────────────────────────────────────────────────────────
function buildTestGroupDraw() {
  const teams  = getTestTeams();
  const groups = splitGroups(teams);
  const inner  = [txt(`# ${E_CUP}  Group Draw  —  Test Season`), SEP];

  for (const [g, gTeams] of Object.entries(groups)) {
    const lines = gTeams.map(t => `${E_ARR}  **${t.name}**`);
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${lines.join('\n')}`));
    inner.push(SEP);
  }

  inner.push(txt('-# Night Stars  •  Test Mode'));
  inner.push(BACK_BTN);
  return box(0xFFD700, inner);
}

// ── Main handler — all updates in place, zero new messages ───────────────────
async function handleTestInteraction(interaction) {
  const id = interaction.customId;
  let payload;

  if      (id === 'test_back')       payload = buildTestMenuPayload();
  else if (id === 'test_teams_list') payload = buildTestTeamsList();
  else if (id === 'test_standings')  payload = buildTestStandings();
  else if (id === 'test_schedule')   payload = buildTestSchedule();
  else if (id === 'test_results')    payload = buildTestResults();
  else if (id === 'test_groupdraw')  payload = buildTestGroupDraw();

  if (payload) await interaction.update(payload);
}

module.exports = { handleTestInteraction, buildTestMenuPayload };
