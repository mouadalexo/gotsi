'use strict';
const { db }        = require('../utils/database');
const { getTplCfg } = require('../utils/templateConfig');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({
  type: 2, style, label, custom_id: id, disabled,
});

function getStage(t) {
  if (t.status === 'finished') return 'finished';
  const matches = db.get('matches').filter(m => m.tournament_id === t.id);
  if (!matches.length || t.status === 'setup') return 'setup';
  const hasKnockout = matches.some(m => m.stage === 'knockout');
  return hasKnockout ? 'knockout' : 'group';
}

function buildPanel1(tournament) {
  const t   = tournament;
  const tid = t.id;
  const stage = getStage(t);

  const allMatches      = db.get('matches').filter(m => m.tournament_id === tid);
  const groupMatches    = allMatches.filter(m => m.stage === 'group');
  const knockoutMatches = allMatches.filter(m => m.stage === 'knockout');
  const playedGroup     = groupMatches.filter(m => m.status === 'played').length;
  const pendingGroup    = groupMatches.filter(m => m.status === 'pending').length;
  const ttRows          = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);

  const inner = [];

  inner.push(txt(`## Settings  \u2014  ${t.template || t.name}`));
  inner.push(SEP);

  if (stage === 'setup') {
    const required = t.team_count || 2;
    const current  = ttRows.length;
    const isFull   = current === required;
    const _cfg1    = getTplCfg(t.template || '');
    const _tpg     = _cfg1.tpg_opts.length === 1 ? _cfg1.tpg_opts[0] : (t.teams_per_group   || 4);
    const _apg     = _cfg1.apg_opts.length === 1 ? _cfg1.apg_opts[0] : (t.advance_per_group || 2);

    inner.push(txt(
      `**Status:** Setup\n**Type:** ${t.type || 'group_knockout'}\n**Groups of:** ${_tpg}\n**Advance:** ${_apg}/group`
    ));
    inner.push(SEP);

    if (current > required) {
      inner.push(txt(`**${current}/${required}** ⚠️  **Too many teams — remove ${current - required} before starting.**`));
    } else if (isFull) {
      inner.push(txt(`**${current}/${required}** ✅  **You can start a tournament now!**`));
    } else {
      inner.push(txt(`**${current}/${required}** teams`));
    }
    inner.push(SEP);

    inner.push({ type: 1, components: [
      btn('Begin Season', `p1_${tid}_begin`,    1, !isFull),
      btn('Settings',     `p1_${tid}_settings`, 3, false),
      btn('Refresh',      `p1_${tid}_refresh`,  2, false),
    ]});

  } else if (stage === 'group') {
    const allGroupDone = pendingGroup === 0 && groupMatches.length > 0;
    const groups = [...new Set(ttRows.map(tt => tt.group_name).filter(Boolean))].sort().join(', ') || 'not drawn';
    const allRounds_p1   = [...new Set(groupMatches.map(m => m.round))].sort((a, b) => a - b);
    const totalRounds_p1 = allRounds_p1.length;
    const pendingGM_p1   = groupMatches.filter(m => m.status !== 'played');
    const curRound_p1    = pendingGM_p1.length ? Math.min(...pendingGM_p1.map(m => m.round)) : totalRounds_p1;
    const roundPending_p1 = groupMatches.filter(m => m.round === curRound_p1 && m.status !== 'played').length;

    inner.push(txt(
      `> **Status:** Group Stage  |  **Groups:** ${groups}\n` +
      `> **Matches:** ${playedGroup} played  /  ${pendingGroup} pending`
    ));
    inner.push(SEP);
    inner.push(txt(
      allGroupDone
        ? '\u2705 All group matches done. Click **Advance to Knockout** to generate the bracket.'
        : `\u23f3 **Round ${curRound_p1}/${totalRounds_p1}** — **${roundPending_p1}** result${roundPending_p1 !== 1 ? 's' : ''} to add this round  •  **${pendingGroup}** total remaining`
    ));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Add Result',          `p1_${tid}_addresult`, 1, pendingGroup === 0),
      btn('Advance to Knockout', `p1_${tid}_advance`,   3, !allGroupDone),
      btn('Refresh',             `p1_${tid}_refresh`,   2, false),
      btn('End Tournament',      `p1_${tid}_end`,       4, false),
    ]});

  } else if (stage === 'knockout') {
    const allKORounds  = [...new Set(knockoutMatches.map(m => m.round))].sort((a, b) => b - a);
    const pendingKORds = knockoutMatches.filter(m => m.status === 'pending').map(m => m.round);
    // Active round = highest round# that still has pending matches (highest# = earliest KO stage)
    // If all done, fall back to the minimum round# = Final
    const curRound    = pendingKORds.length
      ? Math.max(...pendingKORds)
      : (allKORounds[allKORounds.length - 1] || 1);
    const curPending  = knockoutMatches.filter(m => m.round === curRound && m.status === 'pending').length;
    const curPlayed   = knockoutMatches.filter(m => m.round === curRound && m.status === 'played').length;
    const ROUND_LABELS = { 1: 'Final', 2: 'Semi-Finals', 4: 'Quarter-Finals', 8: 'Round of 16', 16: 'Round of 32' };
    const roundLabel  = ROUND_LABELS[curRound] || `Round ${curRound}`;
    const allKODone   = curPending === 0 && curPlayed > 0;

    inner.push(txt(
      `> **Status:** Knockout  |  **Stage:** ${roundLabel}\n` +
      `> **Matches:** ${curPlayed} played  /  ${curPending} pending`
    ));
    inner.push(SEP);
    inner.push(txt(
      allKODone
        ? '\u2705 **' + roundLabel + '** complete! Click **Next Round** to advance winners.'
        : `\u23f3 **${roundLabel}** \u2014 **${curPending}** result${curPending !== 1 ? 's' : ''} to add`
    ));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Add Result',     `p1_${tid}_addresult`, 1, curPending === 0),
      btn('Next Round',     `p1_${tid}_advance`,   3, !allKODone),
      btn('Refresh',        `p1_${tid}_refresh`,   2, false),
      btn('End Tournament', `p1_${tid}_end`,       4, false),
    ]});

  } else {
    // finished
    const playedKO   = knockoutMatches.filter(m => m.status === 'played');
    const finalRound = playedKO.length ? Math.min(...playedKO.map(m => m.round)) : null;
    const finalMatch = finalRound !== null ? playedKO.find(m => m.round === finalRound) : null;
    let winnerName   = '?';
    if (finalMatch) {
      const winId = finalMatch.home_score > finalMatch.away_score
        ? finalMatch.home_team_id : finalMatch.away_team_id;
      winnerName = db.findById('teams', winId)?.name || 'Unknown';
    }
    const confirmedWinner = db.findOne('winners', w => w.tournament_id === tid && w.season === t.season);

    inner.push(txt(
      `> **Status:** FINISHED  |  **Season ${t.season} Complete**\n` +
      `> 🏆  **Champion: ${winnerName}**` +
      (confirmedWinner ? `\n> ✅  **Winner confirmed & role assigned**` : '')
    ));
    inner.push(SEP);

    if (!confirmedWinner) {
      inner.push(txt('⚠️ Winner not yet confirmed. Click **Confirm Winner** to assign the role.'));
      inner.push(SEP);
      inner.push({ type: 1, components: [
        btn('🏆 Confirm Winner', `p1_${tid}_confirm_winner`, 1, false),
        btn('New Edition',       `p1_${tid}_newedition`,     2, false),
        btn('Refresh',           `p1_${tid}_refresh`,        2, false),
      ]});
    } else {
      inner.push(txt('Season officially complete! Click **New Edition** to start the next season.'));
      inner.push(SEP);
      inner.push({ type: 1, components: [
        btn('New Edition', `p1_${tid}_newedition`, 1, false),
        btn('Refresh',     `p1_${tid}_refresh`,    2, false),
      ]});
    }
  }

  inner.push(SEP);
  inner.push(txt(`-# © 24 2026  |  Goatsi Bot`));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

module.exports = { buildPanel1, getStage };
