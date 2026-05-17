'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

function buildEnrollStep1() {
  const tournaments = db.get('tournaments')
    .filter(t => t.status === 'setup' || t.status === 'group')
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!tournaments.length) {
    return {
      flags: 32768,
      components: [{ type: 17, accent_color: 0x5865F2, components: [
        txt('## \u2795  Enroll Team\n> No tournaments are currently open for registration.'),
        SEP,
        { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: 'tc_refresh' }] },
      ]}],
    };
  }

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      txt('## \u2795  Enroll Team\n> **Step 1 / 3** \u2014 Select a tournament'),
      SEP,
      { type: 1, components: [{
        type: 3,
        custom_id: 'enr_tmt_sel',
        placeholder: 'Select tournament...',
        options: tournaments.slice(0, 25).map(t => ({
          label: t.name.slice(0, 100),
          description: ('Season ' + (t.season ?? '\u2014')).slice(0, 100),
          value: String(t.id),
        })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: '\u2190 Back', custom_id: 'tc_refresh' }] },
    ]}],
  };
}

function buildEnrollStep2(tid) {
  const tournament = db.findById('tournaments', tid);
  if (!tournament) return buildEnrollStep1();

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      txt('## \u2795  Enroll Team\n> **Step 2 / 3** \u2014 Type the team name for **' + tournament.name + '**\n> Bot will search the master list and show the closest matches.'),
      SEP,
      { type: 1, components: [
        { type: 2, style: 1, label: '\ud83d\udd0d  Type Team Name', custom_id: 'enr_team_type_' + tid },
        { type: 2, style: 2, label: '\u2190 Back', custom_id: 'enr_back_step1' },
      ]},
    ]}],
  };
}

function buildEnrollFuzzyResults(tid, typedText, matches) {
  const tournament = db.findById('tournaments', tid);
  const options = matches.map(t => ({
    label: t.name.slice(0, 100),
    description: 'From master list',
    value: String(t.id),
  }));
  options.push({
    label: ('\u270f\ufe0f  Use: ' + typedText).slice(0, 100),
    description: 'Add as temporary team for this season',
    value: '_custom',
  });

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      txt('## \u2795  Enroll Team\n> **Step 2 / 3** \u2014 Best matches for **"' + typedText + '"** in **' + (tournament ? tournament.name : '') + '**\n> Last option uses exactly what you typed.'),
      SEP,
      { type: 1, components: [{
        type: 3,
        custom_id: 'enr_team_fuzzy_sel_' + tid,
        placeholder: 'Select a team...',
        options,
      }]},
      SEP,
      { type: 1, components: [
        { type: 2, style: 2, label: '\ud83d\udd01  Search Again', custom_id: 'enr_team_type_' + tid },
        { type: 2, style: 2, label: '\u2190 Back', custom_id: 'enr_back_step1' },
      ]},
    ]}],
  };
}

function buildEnrollStep3(tid, teamId) {
  const tournament = db.findById('tournaments', tid);
  const team = db.findById('teams', teamId);
  if (!tournament || !team) return buildEnrollStep1();
  const isMCL = (tournament.players_per_team || 1) >= 2;

  const playerRows = isMCL
    ? [
        { type: 1, components: [{ type: 5, custom_id: 'enr_player_sel_' + tid + '_' + teamId + '_0', placeholder: '\ud83d\udc64  Player 1 — search member...', min_values: 0, max_values: 1 }] },
        { type: 1, components: [{ type: 5, custom_id: 'enr_player_sel_' + tid + '_' + teamId + '_1', placeholder: '\ud83d\udc64  Player 2 — search member...', min_values: 0, max_values: 1 }] },
      ]
    : [
        { type: 1, components: [{ type: 5, custom_id: 'enr_player_sel_' + tid + '_' + teamId + '_0', placeholder: 'Search for a Discord member...', min_values: 0, max_values: 1 }] },
      ];

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x57F287, components: [
      txt('## \u2705  Enroll Team\n> **Step 3 / 3** \u2014 Assign ' + (isMCL ? '2 players' : 'a player') + ' to **' + team.name + '** in **' + tournament.name + '**\n> Use the member picker(s) below.'),
      SEP,
      ...playerRows,
      SEP,
      { type: 1, components: [
        { type: 2, style: 1, label: '\u270f\ufe0f  Edit Team', custom_id: 'enr_edit_team_' + tid + '_' + teamId },
        { type: 2, style: 4, label: '\ud83d\uddd1\ufe0f  Remove Team', custom_id: 'enr_remove_team_' + tid + '_' + teamId },
        { type: 2, style: 2, label: '\u2190 Back', custom_id: 'enr_back_step2_' + tid },
      ]},
    ]}],
  };
}

module.exports = { buildEnrollStep1, buildEnrollStep2, buildEnrollFuzzyResults, buildEnrollStep3 };
