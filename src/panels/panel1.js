'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, emoji, disabled = false) => ({
  type: 2, style, label, custom_id: id, disabled,
  ...(emoji ? { emoji: { name: emoji } } : {}),
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

  const E_CUP = '<a:cup:1501741159557500971>';
  const inner = [];

  inner.push(txt(`# ${E_CUP}  ${t.name}  —  Season ${t.season}`));
  inner.push(SEP);

  if (stage === 'setup') {
    const regStatus = t.registration_open !== false ? '🟢 Open' : '🔴 Closed';
    inner.push(txt(
      `> **Status:** Setup  |  **Teams:** ${ttRows.length}${t.team_count ? `/${t.team_count}` : ''}  |  **Registration:** ${regStatus}\n` +
      `> **Type:** \`${t.type || 'group_knockout'}\`  |  **Groups of:** ${t.teams_per_group || 4}  |  **Advance:** ${t.advance_per_group || 2}/group`
    ));
    inner.push(SEP);
    inner.push(txt(
      t.registration_open !== false
        ? 'Register teams via **Panel 2**, then close registration and click **Begin Season**.'
        : 'Registration is closed. Click **Begin Season** to draw groups and generate the schedule.'
    ));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Begin Season',  `p1_${tid}_begin`,       1, null),
      btn('Settings',      `p1_${tid}_settings`,    2, null),
      btn('Set Channels',  `p1_${tid}_setchannels`, 2, null),
      btn('Refresh',       `p1_${tid}_refresh`,     2, null),
    ]});

  } else if (stage === 'group') {
    const allGroupDone = pendingGroup === 0 && groupMatches.length > 0;
    const groups = [...new Set(ttRows.map(tt => tt.group_name).filter(Boolean))].sort().join(', ') || 'not drawn';
    inner.push(txt(
      `> **Status:** Group Stage  |  **Groups:** ${groups}\n` +
      `> **Matches:** ${playedGroup} played  /  ${pendingGroup} pending`
    ));
    inner.push(SEP);
    inner.push(txt(
      allGroupDone
        ? '✅ All group matches are done. Click **Advance to Knockout** to generate the bracket.'
        : `⏳ ${pendingGroup} match${pendingGroup !== 1 ? 'es' : ''} still pending in the group stage.`
    ));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Add Result',          `p1_${tid}_addresult`, 1, null, pendingGroup === 0),
      btn('Advance to Knockout', `p1_${tid}_advance`,   3, null, !allGroupDone),
      btn('Settings',            `p1_${tid}_settings`,  2, null),
      btn('Set Channels',        `p1_${tid}_setchannels`, 2, null),
      btn('Refresh',             `p1_${tid}_refresh`,   2, null),
    ]});

  } else if (stage === 'knockout') {
    const rounds      = [...new Set(knockoutMatches.map(m => m.round))].sort((a, b) => b - a);
    const curRound    = rounds[0] || 1;
    const curPending  = knockoutMatches.filter(m => m.round === curRound && m.status === 'pending').length;
    const curPlayed   = knockoutMatches.filter(m => m.round === curRound && m.status === 'played').length;
    const ROUND_LABELS = { 1: 'Final', 2: 'Semi-Finals', 4: 'Quarter-Finals', 8: 'Round of 16', 16: 'Round of 32' };
    const roundLabel   = ROUND_LABELS[curRound] || `Round ${curRound}`;
    const allKODone    = curPending === 0 && curPlayed > 0;
    inner.push(txt(
      `> **Status:** Knockout  |  **Stage:** ${roundLabel}\n` +
      `> **Matches:** ${curPlayed} played  /  ${curPending} pending`
    ));
    inner.push(SEP);
    inner.push(txt(
      allKODone
        ? '✅ Round complete! Click **Next Round** to advance winners.'
        : `⏳ ${curPending} match${curPending !== 1 ? 'es' : ''} remaining in this round.`
    ));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Add Result',   `p1_${tid}_addresult`, 1, null, curPending === 0),
      btn('Next Round',   `p1_${tid}_advance`,   3, null, !allKODone),
      btn('Settings',     `p1_${tid}_settings`,  2, null),
      btn('Set Channels', `p1_${tid}_setchannels`, 2, null),
      btn('Refresh',      `p1_${tid}_refresh`,   2, null),
    ]});

  } else { // finished
    const playedKO    = knockoutMatches.filter(m => m.status === 'played');
    const finalRound  = playedKO.length ? Math.min(...playedKO.map(m => m.round)) : null;
    const finalMatch  = finalRound !== null ? playedKO.find(m => m.round === finalRound) : null;
    let winnerTeamId  = null;
    let winnerName    = '?';
    if (finalMatch) {
      winnerTeamId = finalMatch.home_score > finalMatch.away_score ? finalMatch.home_team_id : finalMatch.away_team_id;
      winnerName   = db.findById('teams', winnerTeamId)?.name || 'Unknown';
    }

    // Check if winner already confirmed for this season
    const confirmedWinner = db.findOne('winners', w => w.tournament_id === tid && w.season === t.season);

    inner.push(txt(
      `> **Status:** FINISHED  |  **Season ${t.season} Complete**\n` +
      `> 🏆  **Champion: ${winnerName}**` +
      (confirmedWinner ? `\n> ✅  **Winner confirmed & role assigned**` : '')
    ));
    inner.push(SEP);

    if (!confirmedWinner) {
      inner.push(txt(
        '⚠️ Winner not yet officially confirmed. Click **Confirm Winner** to assign the winner role and update the Winners History leaderboard.\n\n' +
        'Or click **New Edition** to start the next season.'
      ));
      inner.push(SEP);
      inner.push({ type: 1, components: [
        btn('🏆 Confirm Winner', `p1_${tid}_confirm_winner`, 1, null),
        btn('New Edition',       `p1_${tid}_newedition`,     2, null),
        btn('Settings',          `p1_${tid}_settings`,       2, null),
        btn('Refresh',           `p1_${tid}_refresh`,        2, null),
      ]});
    } else {
      inner.push(txt('Season is officially complete! Click **New Edition** to start the next season.'));
      inner.push(SEP);
      inner.push({ type: 1, components: [
        btn('New Edition', `p1_${tid}_newedition`, 1, null),
        btn('Settings',    `p1_${tid}_settings`,   2, null),
        btn('Refresh',     `p1_${tid}_refresh`,    2, null),
      ]});
    }
  }

  inner.push(SEP);
  inner.push(txt(`-# Night Stars  •  Panel 1: Tournament Management  •  ${t.template || t.name}`));

  return { flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: inner }] };
}

module.exports = { buildPanel1, getStage };
