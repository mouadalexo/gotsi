'use strict';
const { buildTeamsListEmbed } = require('../panels/teamListPanel');
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const box = (color, inner) => ({ flags: 32768, components: [{ type: 17, accent_color: color, components: inner }] });

const E_CUP  = '<a:cup:1501741159557500971>';
const E_HASH = '<a:hashtag:1501741088736678069>';
const E_ARR  = '<a:arrow:1501741110798585927>';
const E_FIRE = '<a:fire:1472250580583059611>';
const E_CROWN= '<:crownn:1501741176296964277>';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// Pick 8 random teams from DB
function getTestTeams() {
  const all = db.get('teams');
  return shuffle(all).slice(0, 8);
}

// Pick 8 random players from DB (for mentions)
function getTestPlayers() {
  const all = db.get('players');
  return shuffle(all).slice(0, 8);
}

// Split 8 teams into 2 groups of 4
function splitGroups(teams) {
  return { A: teams.slice(0, 4), B: teams.slice(4, 8) };
}

// ── Teams List ────────────────────────────────────────────────────────────────
function buildTestTeamsList(isMCL) {
  const teams   = getTestTeams();
  const players = getTestPlayers();
  const label   = isMCL ? 'MCL' : 'NSEL';

  const inner = [
    txt(`# ${E_CUP}  ${label}  —  Team List\n8 registered teams for **${label} Test Season**`),
    SEP,
  ];

  teams.forEach((team, i) => {
    if (isMCL) {
      const p1 = players[i * 2]     ? `<@${players[i * 2].discord_id}>`     : '`No player`';
      const p2 = players[i * 2 + 1] ? `<@${players[i * 2 + 1].discord_id}>` : '`No player`';
      inner.push(txt(`<@${players[i]?.discord_id || players[0].discord_id}>\n<@${players[(i + 1) % players.length].discord_id}>`));
    } else {
      const p = players[i] ? `<@${players[i].discord_id}>` : '`No player`';
      inner.push(txt(p));
    }
    inner.push(SEP);
  });

  inner.push(txt('-# Night Stars • Test Mode'));
  inner.push(SEP);
  return box(0x2b2d31, inner);
}

// ── Standings ─────────────────────────────────────────────────────────────────
function buildTestStandings() {
  const teams  = getTestTeams();
  const groups = splitGroups(teams);
  const inner  = [txt(`${E_CUP}  **STANDINGS  —  TEST SEASON**`), SEP];

  for (const [g, gTeams] of Object.entries(groups)) {
    // Generate random stats
    const rows = gTeams.map(t => {
      const w = randInt(0, 3), d = randInt(0, 2), l = randInt(0, 3);
      const gf = randInt(0, 12), ga = randInt(0, 10);
      return { name: t.name, pts: w * 3 + d, gd: gf - ga, mp: w + d + l };
    }).sort((a, b) => b.pts - a.pts || b.gd - a.gd);

    const header = '`#  Team                J   Dif   Pts`';
    const lines  = rows.map((r, i) => {
      const name = r.name.padEnd(18).slice(0, 18);
      const num  = String(i + 1).padEnd(2);
      const mp   = String(r.mp).padEnd(3);
      const gd   = (r.gd >= 0 ? '+' : '') + r.gd;
      const pts  = String(r.pts).padStart(3);
      return `\`${num} ${name}  ${mp} ${gd.padStart(4)}  ${pts}\``;
    });

    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${header}\n${lines.join('\n')}`));
    inner.push(SEP);
  }

  inner.push(txt('-# Night Stars • Test Mode'));
  inner.push(SEP);
  return box(0xCC0000, inner);
}

// ── Match Schedule ────────────────────────────────────────────────────────────
function buildTestSchedule() {
  const teams  = getTestTeams();
  const groups = splitGroups(teams);
  const inner  = [txt(`${E_CUP}  **MATCH SCHEDULE  —  TEST SEASON**`), SEP];

  for (const [g, gTeams] of Object.entries(groups)) {
    // Round-robin pairs (round 1: 0v3, 1v2 | round 2: 0v2, 1v3 | round 3: 0v1, 2v3)
    const fixtures = [
      [gTeams[0], gTeams[3]], [gTeams[1], gTeams[2]],
      [gTeams[0], gTeams[2]], [gTeams[1], gTeams[3]],
      [gTeams[0], gTeams[1]], [gTeams[2], gTeams[3]],
    ];
    const rounds = [
      ['Round 1', fixtures.slice(0, 2)],
      ['Round 2', fixtures.slice(2, 4)],
      ['Round 3', fixtures.slice(4, 6)],
    ];
    inner.push(txt(`${E_HASH}  **GROUP ${g}**`));
    for (const [rLabel, pairs] of rounds) {
      const lines = pairs.map(([h, a]) => `${E_ARR}  **${h.name}**  vs  **${a.name}**`);
      inner.push(txt(`**🔵 ${rLabel}**\n${lines.join('\n')}`));
    }
    inner.push(SEP);
  }

  inner.push(txt('-# Night Stars • Test Mode'));
  inner.push(SEP);
  return box(0x5865F2, inner);
}

// ── Results ───────────────────────────────────────────────────────────────────
function buildTestResults() {
  const teams  = getTestTeams();
  const groups = splitGroups(teams);
  const inner  = [txt(`${E_CUP}  **RESULTS  —  TEST SEASON**`), SEP];

  for (const [g, gTeams] of Object.entries(groups)) {
    const fixtures = [
      [gTeams[0], gTeams[3]], [gTeams[1], gTeams[2]],
      [gTeams[0], gTeams[2]], [gTeams[1], gTeams[3]],
    ];
    const lines = fixtures.map(([h, a]) => {
      const hs = randInt(0, 5), as_ = randInt(0, 5);
      const icon    = hs === as_ ? '🤝' : E_FIRE;
      const homeStr = hs > as_  ? `${E_CROWN} **${h.name}**` : `**${h.name}**`;
      const awayStr = as_ > hs  ? `**${a.name}** ${E_CROWN}` : `**${a.name}**`;
      return `${icon}  ${homeStr}  \`${hs} — ${as_}\`  ${awayStr}`;
    });
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${lines.join('\n')}`));
    inner.push(SEP);
  }

  inner.push(txt('-# Night Stars • Test Mode'));
  inner.push(SEP);
  return box(0xCC0000, inner);
}

// ── Group Draw ────────────────────────────────────────────────────────────────
function buildTestGroupDraw() {
  const teams  = getTestTeams();
  const groups = splitGroups(teams);
  const inner  = [txt(`${E_CUP}  **GROUP DRAW  —  TEST SEASON**`), SEP];

  for (const [g, gTeams] of Object.entries(groups)) {
    const lines = gTeams.map(t => `${E_ARR}  **${t.name}**`);
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${lines.join('\n')}`));
    inner.push(SEP);
  }

  inner.push(txt('-# Night Stars • Test Mode'));
  inner.push(SEP);
  return box(0xFFD700, inner);
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleTestInteraction(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const id = interaction.customId;
  let payload;

  if (id === 'test_teams_list') {
    const ts = db.get('tournaments').sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
    const t = ts[0];
    payload = t ? buildTeamsListEmbed(t.id) : { content: 'No tournaments found.' };
  }
  else if (id === 'test_standings')   payload = buildTestStandings();
  else if (id === 'test_schedule')    payload = buildTestSchedule();
  else if (id === 'test_results')     payload = buildTestResults();
  else if (id === 'test_groupdraw')   payload = buildTestGroupDraw();

  if (payload) await interaction.editReply(payload);
}

module.exports = { handleTestInteraction };
