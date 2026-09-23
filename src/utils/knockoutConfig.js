'use strict';

const KNOCKOUT_STAGE_DEFS = [
  { key: 'round_of_32', label: 'Round of 32', round: 16 },
  { key: 'round_of_16', label: 'Round of 16', round: 8 },
  { key: 'quarter_final', label: 'Quarter-finals', round: 4 },
  { key: 'semi_final', label: 'Semi-finals', round: 2 },
  { key: 'final', label: 'Final', round: 1 },
];

const DEFAULT_KNOCKOUT_LEGS = Object.freeze(
  Object.fromEntries(KNOCKOUT_STAGE_DEFS.map(stage => [stage.key, 1]))
);

function normalizeKnockoutLegs(value) {
  const source = value && typeof value === 'object' ? value : {};
  const normalized = {};

  for (const stage of KNOCKOUT_STAGE_DEFS) {
    const raw = source[stage.key] ?? source[String(stage.round)];
    normalized[stage.key] = Number(raw) === 2 ? 2 : 1;
  }

  return normalized;
}

function stageForRound(round) {
  const numericRound = Number(round);
  return KNOCKOUT_STAGE_DEFS.find(stage => stage.round === numericRound)
    || { key: `round_${numericRound}`, label: `Round ${numericRound}`, round: numericRound };
}

function getKnockoutLegs(tournament, round) {
  const config = normalizeKnockoutLegs(
    tournament?.knockout_legs || tournament?.ko_legs
  );
  const stage = stageForRound(round);
  return config[stage.key] === 2 ? 2 : 1;
}

function projectedKnockoutTeams(tournament) {
  if (!tournament) return 0;
  if (tournament.type === 'knockout') return Number(tournament.team_count) || 0;

  const teamCount = Number(tournament.team_count) || 0;
  const teamsPerGroup = Number(tournament.teams_per_group) || 4;
  const groups = Math.max(1, Math.ceil(teamCount / teamsPerGroup));
  const advance = Number(tournament.advance_per_group) || 2;
  return groups * advance;
}

function firstKnockoutRound(tournament, actualRound = null) {
  if (actualRound != null && Number(actualRound) > 0) return Number(actualRound);

  const qualifiers = projectedKnockoutTeams(tournament);
  if (qualifiers < 2) return 0;

  // Tournament brackets are powers of two. Use the largest valid bracket
  // round that can contain the projected qualifiers.
  let round = 1;
  while (round * 2 <= Math.floor(qualifiers / 2)) round *= 2;
  return Math.max(1, round);
}

function knockoutStagesForTournament(tournament, actualRound = null) {
  const firstRound = firstKnockoutRound(tournament, actualRound);
  if (!firstRound) return [];

  const stages = [];
  for (let round = firstRound; round >= 1; round = Math.floor(round / 2)) {
    stages.push(stageForRound(round));
    if (round === 1) break;
  }
  return stages;
}

function describeLegs(count) {
  return count === 2 ? '2 legs · home & away' : '1 leg';
}

module.exports = {
  KNOCKOUT_STAGE_DEFS,
  DEFAULT_KNOCKOUT_LEGS,
  normalizeKnockoutLegs,
  stageForRound,
  getKnockoutLegs,
  projectedKnockoutTeams,
  firstKnockoutRound,
  knockoutStagesForTournament,
  describeLegs,
};