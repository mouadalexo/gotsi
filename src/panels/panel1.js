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

  inner.push(txt(`## Settings  —  ${t.template || t.name}`));
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
    // ── Group stage ──────────────────────────────────────────────────────────
    const groups        = [...new Set(ttRows.map(tt => tt.group_name).filter(Boolean))].sort().join(', ') || 'not drawn';
    const allRounds_p1  = [...new Set(groupMatches.map(m => m.round))].sort((a, b) => a - b);
    const totalRounds_p1 = allRounds_p1.length;

    // Current round = lowest round with any pending match
    const pendingGM_p1  = groupMatches.filter(m => m.status !== 'played');
    const curRound_p1   = db.getConfig('group_round_' + tid) || allRounds_p1[0] || 1;
    const roundPending_p1 = groupMatches.filter(m => m.round === curRound_p1 && m.status !== 'played').length;
    const roundPlayed_p1  = groupMatches.filter(m => m.round === curRound_p1 && m.status === 'played').length;

    inner.push(txt(
      `> **Status:** Group Stage  |  **Groups:** ${groups}\n` +
      `> **Matches:** ${playedGroup} played  /  ${pendingGroup} pending`
    ));
    inner.push(SEP);

    // "Next" unlocks when ALL matches in the current round are played
    const roundDone_p1 = roundPending_p1 === 0 && roundPlayed_p1 > 0;

    // Status line shows current round progress
    const statusLine = roundDone_p1
      ? `\u2705 **Round ${curRound_p1}/${totalRounds_p1} complete!** Click **Next** to continue.`
      : roundPlayed_p1 > 0
        ? `\u23f3 **Round ${curRound_p1}/${totalRounds_p1}** — **${roundPending_p1}** result${roundPending_p1 !== 1 ? 's' : ''} remaining`
        : `\u23f3 **Round ${curRound_p1}/${totalRounds_p1}** — **${roundPending_p1}** result${roundPending_p1 !== 1 ? 's' : ''} to add`;

    inner.push(txt(statusLine));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Add Result',     `p1_${tid}_addresult`, 1, false),
      btn('Next',           `p1_${tid}_advance`,   3, !roundDone_p1),
      btn('Refresh',        `p1_${tid}_refresh`,   2, false),
      btn('End Tournament', `p1_${tid}_end`,       4, false),
    ]});

  } else if (stage === 'knockout') {
    // ── Knockout stage ────────────────────────────────────────────────────────
    const ROUND_LABELS = { 1: 'Final', 2: 'Semi-Finals', 4: 'Quarter-Finals', 8: 'Round of 16', 16: 'Round of 32' };

    // 2-leg Final detection
    const r1All          = knockoutMatches.filter(m => m.round === 1);
    const r1Leg1         = r1All.filter(m => !m.leg || m.leg === 1);
    const r1Leg2         = r1All.filter(m => m.leg === 2);
    const r1Leg1AllPlayed  = r1Leg1.length > 0 && r1Leg1.every(m => m.status === 'played');
    const r1Leg2Exists   = r1Leg2.length > 0;
    const r1Leg2AllPlayed  = r1Leg2.length > 0 && r1Leg2.every(m => m.status === 'played');

    // Active round: highest round# with pending matches (highest# = earliest KO stage)
    const allKORounds  = [...new Set(knockoutMatches.map(m => m.round))].sort((a, b) => b - a);
    const pendingKORds = knockoutMatches.filter(m => m.status === 'pending').map(m => m.round);
    const curRound     = pendingKORds.length
      ? Math.max(...pendingKORds)
      : (allKORounds[allKORounds.length - 1] || 1);

    const curPending = knockoutMatches.filter(m => m.round === curRound && m.status === 'pending').length;
    const curPlayed  = knockoutMatches.filter(m => m.round === curRound && m.status === 'played').length;

    // Determine display state — handle 2-leg Final specially
    let roundLabel, allKODone, canAdv;

    if (curRound === 1 && r1Leg1AllPlayed && !r1Leg2Exists) {
      // Final (Home) played, Final (Away) not yet created
      roundLabel = 'Final (Home)';
      allKODone  = true;
      canAdv     = true;
    } else if (curRound === 1 && r1Leg2Exists && !r1Leg2AllPlayed) {
      // Final (Away) in progress
      roundLabel = 'Final (Away)';
      allKODone  = false;
      canAdv     = false;
    } else if (curRound === 1 && r1Leg2AllPlayed) {
      // Both Final legs done — ready to wrap up
      roundLabel = 'Final (Away)';
      allKODone  = true;
      canAdv     = true;
    } else {
      // Normal KO round (QF, SF, R16, etc.)
      roundLabel = ROUND_LABELS[curRound] || `Round ${curRound}`;
      allKODone  = curPending === 0 && curPlayed > 0;
      canAdv     = allKODone;
    }

    inner.push(txt(
      `> **Status:** Knockout  |  **Stage:** ${roundLabel}\n` +
      `> **Matches:** ${curPlayed} played  /  ${curPending} pending`
    ));
    inner.push(SEP);
    inner.push(txt(
      allKODone
        ? `\u2705 **${roundLabel}** complete! Click **Next** to continue.`
        : `\u23f3 **${roundLabel}** \u2014 **${curPending}** result${curPending !== 1 ? 's' : ''} to add`
    ));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Add Result',     `p1_${tid}_addresult`, 1, false),
      btn('Next',           `p1_${tid}_advance`,   3, !canAdv),
      btn('Refresh',        `p1_${tid}_refresh`,   2, false),
      btn('End Tournament', `p1_${tid}_end`,       4, false),
    ]});

  } else {
    // ── Finished ──────────────────────────────────────────────────────────────
    const playedKO   = knockoutMatches.filter(m => m.status === 'played');
    const finalRound = playedKO.length ? Math.min(...playedKO.map(m => m.round)) : null;
    const finalMatches = finalRound !== null ? playedKO.filter(m => m.round === finalRound) : [];
    let winnerName = '?';
    if (finalMatches.length) {
      const leg1 = finalMatches.find(m => !m.leg || m.leg === 1);
      const leg2 = finalMatches.find(m => m.leg === 2);
      if (leg1 && leg2) {
        const hAgg = (leg1.home_score || 0) + (leg2.away_score || 0);
        const aAgg = (leg1.away_score || 0) + (leg2.home_score || 0);
        const winId = hAgg >= aAgg ? leg1.home_team_id : leg1.away_team_id;
        winnerName = db.findById('teams', winId)?.name || 'Unknown';
      } else if (leg1) {
        const winId = leg1.home_score > leg1.away_score ? leg1.home_team_id : leg1.away_team_id;
        winnerName = db.findById('teams', winId)?.name || 'Unknown';
      }
    }

    inner.push(txt(
      `> **Status:** FINISHED  |  **Season ${t.season} Complete**\n` +
      `> 🏆  **Champion: ${winnerName}**`
    ));
    inner.push(SEP);
    inner.push(txt('Season complete! Click **End Season** to start the next season.'));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('End Season', `p1_${tid}_newedition`, 1, false),
      btn('Refresh',    `p1_${tid}_refresh`,    2, false),
    ]});
  }

  inner.push(SEP);
  inner.push(txt(`-# © 24 2026  |  Goatsi Bot`));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

module.exports = { buildPanel1, getStage };
