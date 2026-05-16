'use strict';
const { db } = require('../utils/database');
const { buildTeamsListEmbed } = require('../panels/teamListPanel');
const { buildGroupStandingsEmbed } = require('../panels/standingsPanel');
const { buildAllResultsEmbed } = require('../panels/resultsPanel');

const SEP  = { type: 14, divider: true, spacing: 1 };
const txt  = c => ({ type: 10, content: c });
const box  = (color, inner) => ({ flags: 32768, components: [{ type: 17, accent_color: color, components: inner }] });

const E_CUP  = '<a:cup:1501741159557500971>';
const E_HASH = '<a:hashtag:1501741088736678069>';
const E_ARR  = '<a:arrow:1501741110798585927>';

const BACK_BTN = { type: 1, components: [{ type: 2, style: 2, label: '← Back to Menu', custom_id: 'test_back' }] };

function findTestTournament() {
  const ts = db.get('tournaments');
  return ts.find(t => t.status === 'active') || ts.find(t => t.status === 'setup') || ts[0] || null;
}

// ── Main menu ─────────────────────────────────────────────────────────────────
function buildTestMenuPayload() {
  const t = findTestTournament();
  const label = t ? `${t.name}  •  S${t.season}` : 'No tournament';
  return box(0x2b2d31, [
    txt(`# ${E_CUP}  Test Panel\nPreviews use the **same format** as live posts.\nUsing: **${label}**`),
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
    txt('-# Night Stars  •  Test Mode — uses live tournament data'),
  ]);
}

// ── Teams List — uses the real builder ────────────────────────────────────────
function buildTestTeamsList() {
  const t = findTestTournament();
  if (!t) return box(0x2b2d31, [txt('❌ No tournament found.'), SEP, BACK_BTN]);
  const embed = buildTeamsListEmbed(t.id);
  // Inject back button into the container components
  const container = embed.components[0];
  container.components.push(BACK_BTN);
  return embed;
}

// ── Standings — uses the real builder ────────────────────────────────────────
function buildTestStandings() {
  const t = findTestTournament();
  if (!t) return box(0x2b2d31, [txt('❌ No tournament found.'), SEP, BACK_BTN]);
  const embed = buildGroupStandingsEmbed(t.id);
  if (!embed) return box(0x2b2d31, [txt('❌ No standings data yet.'), SEP, BACK_BTN]);
  embed.components[0].components.push(BACK_BTN);
  return embed;
}

// ── Match Schedule — uses the same format as p3 schedule post ─────────────────
function buildTestSchedule() {
  const t = findTestTournament();
  if (!t) return box(0x2b2d31, [txt('❌ No tournament found.'), SEP, BACK_BTN]);
  const tid = t.id;
  const allGM = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
  if (!allGM.length) return box(0x5865F2, [
    txt(`# 📅  Schedule  —  ${t.name}\n*No matches generated yet.*`), SEP, BACK_BTN,
  ]);
  const teams  = db.get('teams');
  const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const getTeam = id => teams.find(t2 => t2.id === id) || { name: 'Unknown' };
  const getGrp  = id => ttRows.find(tt => tt.team_id === id)?.group_name || '?';
  const rounds  = [...new Set(allGM.map(m => m.round))].sort((a, b) => a - b);
  const total   = rounds.length;
  // Show round 1 as the example
  const round  = rounds[0];
  const matches = allGM.filter(m => m.round === round);
  const groups  = {};
  for (const m of matches) { const g = getGrp(m.home_team_id); (groups[g] = groups[g] || []).push(m); }
  const inner = [txt(`# 📅  Schedule  —  Round ${round}/${total}\n**${t.name}  •  Season ${t.season}**`), SEP];
  for (const [g, gm] of Object.entries(groups).sort()) {
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${gm.map(m => `${E_ARR}  **${getTeam(m.home_team_id).name}**  vs  **${getTeam(m.away_team_id).name}**`).join('\n')}`));
    inner.push(SEP);
  }
  inner.push(txt(`-# Night Stars  •  ${t.template}  •  Group Stage  •  Round ${round}`));
  inner.push(BACK_BTN);
  return box(0x5865F2, inner);
}

// ── Results — uses the real builder ───────────────────────────────────────────
function buildTestResults() {
  const t = findTestTournament();
  if (!t) return box(0x2b2d31, [txt('❌ No tournament found.'), SEP, BACK_BTN]);
  const embed = buildAllResultsEmbed(t.id);
  if (!embed) return box(0x2b2d31, [txt('❌ No results data yet.'), SEP, BACK_BTN]);
  embed.components[0].components.push(BACK_BTN);
  return embed;
}

// ── Group Draw — uses the same format as p3 groupdraw_confirm ─────────────────
function buildTestGroupDraw() {
  const t = findTestTournament();
  if (!t) return box(0x2b2d31, [txt('❌ No tournament found.'), SEP, BACK_BTN]);
  const tid = t.id;
  const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid && tt.group_name);
  if (!ttRows.length) return box(0xFEE75C, [
    txt(`# 🎲  Group Draw  —  ${t.name}\n*No groups drawn yet.*`), SEP, BACK_BTN,
  ]);
  const teams = db.get('teams');
  const groups = {};
  for (const tt of ttRows) {
    const g = tt.group_name;
    if (!groups[g]) groups[g] = [];
    groups[g].push(teams.find(t2 => t2.id === tt.team_id)?.name || 'Unknown');
  }
  const inner = [txt(`# 🎲  Group Draw  —  ${t.name}  S${t.season}`), SEP];
  for (const [g, names] of Object.entries(groups).sort()) {
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${names.map(n => `${E_ARR}  **${n}**`).join('\n')}`));
    inner.push(SEP);
  }
  inner.push(txt('-# Night Stars  •  Group Draw'));
  inner.push(BACK_BTN);
  return box(0xFEE75C, inner);
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
