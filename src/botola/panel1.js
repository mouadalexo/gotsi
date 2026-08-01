'use strict';
const { db }        = require('../utils/database');
const { getTplCfg } = require('../utils/templateConfig');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({
  type: 2, style, label, custom_id: id, disabled,
});

const KO_LABELS = { 1: 'Final', 2: 'Semi-Final', 4: 'Quarter-Finals', 8: 'Round of 16', 16: 'Round of 32' };

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

  inner.push(txt(`## 1 : Main  —  ${t.template || t.name}`));
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
    const groups = [...new Set(ttRows.map(tt => tt.group_name).filter(Boolean))].sort().join(', ') || 'not drawn';

    // Current match day from tracker
    const allRds    = [...new Set(groupMatches.map(m => m.round))].sort((a, b) => a - b);
    const curRound  = db.getConfig('group_round_' + tid) || allRds[0] || 1;
    const lastRound = allRds[allRds.length - 1] || 1;
    const isLastRound = curRound >= lastRound;

    // Figure out the first KO round label (Quarter-Finals, Semi-Final, etc.)
    const numGroups   = [...new Set(ttRows.map(tt => tt.group_name).filter(Boolean))].length || 1;
    const advPerGroup = t.advance_per_group || 2;
    const qualifiers  = numGroups * advPerGroup;
    const firstKONum  = qualifiers / 2; // number of matches = round identifier
    const firstKOLabel = KO_LABELS[firstKONum] || 'Quarter-Finals';

    // Button label — never disabled
    const advLabel = isLastRound ? `Advance to ${firstKOLabel}` : 'Next Match Day';

    // Per-round match counts for status text
    const curPending = groupMatches.filter(m => m.round === curRound && m.status === 'pending').length;
    const curPlayed  = groupMatches.filter(m => m.round === curRound && m.status === 'played').length;

    inner.push(txt(
      `> **Status:** Group Stage  |  **Groups:** ${groups}\n` +
      `> **Match Day ${curRound}:** ${curPlayed} played  /  ${curPending} pending`
    ));
    inner.push(SEP);
    inner.push(txt(
      curPending === 0 && curPlayed > 0
        ? `\u2705 **Match Day ${curRound} complete!** Click **${advLabel}** to continue.`
        : `\u23f3 **Match Day ${curRound}** \u2014 **${curPending}** result${curPending !== 1 ? 's' : ''} remaining`
    ));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Add Result',     `p1_${tid}_addresult`, 1, false),
      btn(advLabel,         `p1_${tid}_advance`,   3, false),
      btn('Refresh',        `p1_${tid}_refresh`,   2, false),
      btn('End Tournament', `p1_${tid}_end`,       4, false),
    ]});

  } else if (stage === 'knockout') {
    // ── Knockout stage ────────────────────────────────────────────────────────

    // 2-leg Semi-Finals detection
    const r2All           = knockoutMatches.filter(m => m.round === 2);
    const r2Leg1          = r2All.filter(m => !m.leg || m.leg === 1);
    const r2Leg2          = r2All.filter(m => m.leg === 2);
    const r2Leg1AllPlayed = r2Leg1.length > 0 && r2Leg1.every(m => m.status === 'played');
    const r2Leg2Exists    = r2Leg2.length > 0;
    const r2Leg2AllPlayed = r2Leg2.length > 0 && r2Leg2.every(m => m.status === 'played');

    // Active round: highest round# with pending matches (highest# = earliest KO stage)
    const allKORounds  = [...new Set(knockoutMatches.map(m => m.round))].sort((a, b) => b - a);
    const pendingKORds = knockoutMatches.filter(m => m.status === 'pending').map(m => m.round);
    const curRound     = pendingKORds.length
      ? Math.max(...pendingKORds)
      : (allKORounds[allKORounds.length - 1] || 1);

    const curPending = knockoutMatches.filter(m => m.round === curRound && m.status === 'pending').length;
    const curPlayed  = knockoutMatches.filter(m => m.round === curRound && m.status === 'played').length;

    // Determine display state — handle 2-leg Semi-Finals specially
    let roundLabel;
    if (curRound === 2 && r2Leg1AllPlayed && !r2Leg2Exists) {
      roundLabel = 'Semi-Final (Home)';
    } else if (curRound === 2 && r2Leg2Exists && !r2Leg2AllPlayed) {
      roundLabel = 'Semi-Final (Away)';
    } else if (curRound === 2 && r2Leg2AllPlayed) {
      roundLabel = 'Semi-Final (Away)';
    } else {
      roundLabel = KO_LABELS[curRound] || `Round ${curRound}`;
    }

    // Next round label for button — always enabled
    const nextRound    = Math.floor(curRound / 2);
    const nextKOLabel  = nextRound >= 1 ? (KO_LABELS[nextRound] || 'Next Round') : null;
    const advBtnLabel  = nextKOLabel ? `Advance to ${nextKOLabel}` : 'Next';

    const allRoundDone = curPending === 0 && curPlayed > 0;

    inner.push(txt(
      `> **Status:** Knockout  |  **Stage:** ${roundLabel}\n` +
      `> **Matches:** ${curPlayed} played  /  ${curPending} pending`
    ));
    inner.push(SEP);
    inner.push(txt(
      allRoundDone
        ? `\u2705 **${roundLabel} complete!** Click **${advBtnLabel}** to continue.`
        : `\u23f3 **${roundLabel}** \u2014 **${curPending}** result${curPending !== 1 ? 's' : ''} to add`
    ));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Add Result',  `p1_${tid}_addresult`, 1, false),
      btn(advBtnLabel,   `p1_${tid}_advance`,   3, false),
      btn('Refresh',     `p1_${tid}_refresh`,   2, false),
      btn('End Tournament', `p1_${tid}_end`,    4, false),
    ]});

  } else {
    // ── Finished ──────────────────────────────────────────────────────────────
    const playedKO     = knockoutMatches.filter(m => m.status === 'played');
    const finalRound   = playedKO.length ? Math.min(...playedKO.map(m => m.round)) : null;
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
