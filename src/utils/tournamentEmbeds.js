'use strict';
const { db } = require('./database');

const RED    = 0xCC0000;
const GOLD   = 0xFFD700;
const BLUE   = 0x2563EB;
const ORANGE = 0xFF3600;
const PURPLE = 0x8B5CF6;
const GREEN  = 0x43FF00;

// Truncate + right-pad to exactly n chars (monospace alignment helper)
const tPad = (s, n) => { const x = s.length > n ? s.slice(0, n - 3) + '...' : s; return x.padEnd(n); };
// Truncate name to max n chars; adds "..." if cut. No padding (bold style).
const trunc = (s, n) => s.length > n ? s.slice(0, n - 3) + '...' : s;

// ── Centered match-line formatter ─────────────────────────────────────────────
// Total line width inside backticks — safe single-line limit in Discord
const LINE_W  = 36;
const VS_SEP  = ' vs '; // 4 chars — nameMax = (36-4)/2 = 16 per side

// Fixed-width score separator: "  H — A  " always 11 chars
// " H" = padStart(2), "A " = padEnd(2) → 2+2+3+2+2 = 11
const scoreSep  = (h, a) => ' ' + String(h).padStart(2) + '-' + String(a).padEnd(2) + ' ';
const fmtSc     = (v, forf) => forf ? '\u00D8' : String(v ?? '?');
const scoreSepF = (h, a, hf, af) => ' ' + fmtSc(h, hf).padStart(2) + '-' + fmtSc(a, af).padEnd(2) + ' ';

// Format one match line — never wraps on mobile, equal space both sides.
// Left name right-aligned toward center, right name left-aligned from center.
function fmtMatchLine(home, away, sep) {
  const half = Math.floor((LINE_W - sep.length) / 2);
  const h = home.length > half ? home.slice(0, half - 1) + '…' : home;
  const a = away.length > half ? away.slice(0, half - 1) + '…' : away;
  return '`' + h.padStart(half) + sep + a.padEnd(half) + '`';
}

const E_CUP   = '<a:cup:1501741159557500971>';
const E_HASH  = '<a:hashtag:1501741088736678069>';
const E_CROWN = '<a:crown:1501741170668077127>';
const E_FIRE  = '<a:fire:1472250580583059611>';
const E_ARR   = '<a:smallarrow:1472222559645863936>';

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const box = (color, comps) => ({ flags: 32768, components: [{ type: 17, accent_color: color, components: comps }] });

// ── Knockout round name from match count ──────────────────────────────────────
function koRoundName(round) {
  if (round === 1)  return 'FINAL';
  if (round === 2)  return 'SEMI-FINALS';
  if (round === 4)  return 'QUARTER-FINALS';
  if (round === 8)  return 'ROUND OF 16';
  if (round === 16) return 'ROUND OF 32';
  return `ROUND OF ${round * 2}`;
}

// ── Shared lookup helpers ─────────────────────────────────────────────────────
function getContext(tid) {
  const t      = db.findById('tournaments', tid);
  const teams  = db.get('teams');
  const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const getTeam = id => teams.find(tm => tm.id === id) || { name: 'TBD' };
  const getGrp  = id => ttRows.find(tt => tt.team_id === id)?.group_name || '?';
  return { t, teams, ttRows, getTeam, getGrp };
}

function groupMatchesByGroup(matches, getGrp, getTeam) {
  const grouped = {};
  for (const m of matches) {
    const g = getGrp(m.home_team_id);
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push({
      ...m,
      homeName: getTeam(m.home_team_id).name,
      awayName: getTeam(m.away_team_id).name,
    });
  }
  return grouped;
}

// ── 1. Schedule Post ──────────────────────────────────────────────────────────
function makeSchedulePost(tid, round) {
  const { t, getTeam, getGrp } = getContext(tid);
  if (!t) return null;
  const allGM   = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
  const total   = [...new Set(allGM.map(m => m.round))].length;
  const matches = allGM.filter(m => m.round === round);
  const label   = `${t.template || t.name} S${t.season}`;

  const grouped  = groupMatchesByGroup(matches, getGrp, getTeam);
  const entries  = Object.entries(grouped).sort();

  const inner = [
    txt(`${E_CUP}  **SCHEDULE — ROUND ${round}/${total}  —  ${label.toUpperCase()}**`),
    SEP,
  ];

  entries.forEach(([g, gm], i) => {
    const lines = gm.map(m => fmtMatchLine(
      m.homeName.toUpperCase(), m.awayName.toUpperCase(), VS_SEP
    ));
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${lines.join('\n')}`));
    if (i < entries.length - 1) inner.push(SEP);
  });

  inner.push(SEP);
  inner.push(txt(`-# © 24 2026  |  Goatsi Bot`));
  return box(PURPLE, inner);
}

// ── 2. Results Post ───────────────────────────────────────────────────────────
function makeResultsPost(tid, round) {
  const { t, getTeam, getGrp } = getContext(tid);
  if (!t) return null;
  const allGM   = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
  const total   = [...new Set(allGM.map(m => m.round))].length;
  const matches = allGM.filter(m => m.round === round && m.status === 'played');
  const label   = `${t.template || t.name} S${t.season}`;

  const grouped = groupMatchesByGroup(matches, getGrp, getTeam);
  const entries = Object.entries(grouped).sort();

  const inner = [
    txt(`${E_CUP}  **RESULTS — ROUND ${round}/${total}  —  ${label.toUpperCase()}**`),
    SEP,
  ];

  entries.forEach(([g, gm], i) => {
    const lines = gm.map(m => fmtMatchLine(
      m.homeName.toUpperCase(), m.awayName.toUpperCase(),
      scoreSepF(m.home_score, m.away_score, m.home_forfeit, m.away_forfeit)
    ));
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${lines.join('\n')}`));
    if (i < entries.length - 1) inner.push(SEP);
  });

  inner.push(SEP);
  inner.push(txt(`-# © 24 2026  |  Goatsi Bot`));
  return box(ORANGE, inner);
}

// ── 3. Standings Post ──────────────────────────────────────────────────────────────────────────────
// upToRound: if set, only count matches with round <= upToRound
function makeStandingsPost(tid, upToRound = null) {
  const { t, teams, ttRows } = getContext(tid);
  if (!t) return null;
  const label = `${t.template || t.name} S${t.season}`;
  const NW    = 18;

  // Compute stats from actual played matches (never trust pre-stored totals)
  const init    = () => ({ w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  const stats   = {};
  const played  = db.get('matches').filter(m =>
    m.tournament_id === tid &&
    m.stage         === 'group' &&
    m.status        === 'played' &&
    (upToRound === null || m.round <= upToRound)
  );

  for (const m of played) {
    if (!stats[m.home_team_id]) stats[m.home_team_id] = init();
    if (!stats[m.away_team_id]) stats[m.away_team_id] = init();
    const hs = stats[m.home_team_id];
    const as = stats[m.away_team_id];

    if (m.home_forfeit && m.away_forfeit) {
      hs.l++; as.l++; continue;
    }
    if (m.home_forfeit) {
      hs.l++; hs.ga += 3;
      as.w++; as.gf += 3; as.pts += 3; continue;
    }
    if (m.away_forfeit) {
      as.l++; as.ga += 3;
      hs.w++; hs.gf += 3; hs.pts += 3; continue;
    }

    const hg = m.home_score || 0;
    const ag = m.away_score || 0;
    hs.gf += hg; hs.ga += ag;
    as.gf += ag; as.ga += hg;
    if (hg > ag)      { hs.w++; hs.pts += 3; as.l++; }
    else if (hg < ag) { as.w++; as.pts += 3; hs.l++; }
    else              { hs.d++; hs.pts += 1; as.d++; as.pts += 1; }
  }

  // Group teams
  const groups = {};
  for (const tt of ttRows.filter(tt => tt.group_name)) {
    const g    = tt.group_name;
    const team = teams.find(tm => tm.id === tt.team_id) || { name: 'Unknown' };
    const s    = stats[tt.team_id] || init();
    if (!groups[g]) groups[g] = [];
    groups[g].push({ name: team.name, played: s.w + s.d + s.l, ...s });
  }

  for (const g of Object.keys(groups)) {
    groups[g].sort((a, b) => {
      const pd = b.pts - a.pts;
      if (pd !== 0) return pd;
      return (b.gf - b.ga) - (a.gf - a.ga);
    });
  }

  const roundLabel = upToRound !== null ? `ROUND ${upToRound}  —  ` : '';
  const inner = [
    txt(`${E_CUP}  **STANDINGS  —  ${roundLabel}${label.toUpperCase()}**`),
    SEP,
  ];

  const entries = Object.entries(groups).sort();
  entries.forEach(([g, gTeams]) => {
    const header = `\`#  ${'Team'.padEnd(NW)}  P  Dif  Pts\``;
    const rows   = gTeams.map((tm, i) => {
      const pos  = i + 1;
      const name = trunc(tm.name, NW).padEnd(NW);
      const gd   = tm.gf - tm.ga;
      const dif  = (gd >= 0 ? '+' : '') + gd;
      return `\`${String(pos).padEnd(2)} ${name}  ${String(tm.played).padStart(1)}  ${dif.padStart(3)}  ${String(tm.pts).padStart(3)}\``;
    });
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${header}\n${rows.join('\n')}`));
    inner.push(SEP);
  });

  inner.pop();
  inner.push(txt(`-# \u00a9 24 2026  |  Goatsi Bot`));
  return box(GREEN, inner);
}

// ── 4. Group Draw Post ────────────────────────────────────────────────────────
function makeGroupDrawPost(tid) {
  const { t, teams, ttRows } = getContext(tid);
  if (!t) return null;
  const label = `${t.template || t.name} S${t.season}`;

  const groups = {};
  for (const tt of ttRows.filter(tt => tt.group_name)) {
    const g    = tt.group_name;
    const team = teams.find(tm => tm.id === tt.team_id) || { name: 'Unknown' };
    if (!groups[g]) groups[g] = [];
    groups[g].push(team.name);
  }

  const inner = [
    txt(`${E_CUP}  **GROUP DRAW  \u2014  ${label.toUpperCase()}**`),
    SEP,
  ];

  // Each team in a numbered code-block row; no sep needed so full LINE_W for name
  const NAME_W = LINE_W - 4; // 4 chars for "N.  " prefix
  const entries = Object.entries(groups).sort();
  entries.forEach(([g, names], i) => {
    const rows = names.map((n, idx) => {
      const num  = `${idx + 1}.`;
      const name = trunc(n.toUpperCase(), NAME_W).padEnd(NAME_W);
      return '`' + num.padEnd(2) + '  ' + name + '`';
    });
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${rows.join('\n')}`));
    if (i < entries.length - 1) inner.push(SEP);
  });

  inner.push(SEP);
  inner.push(txt(`-# \u00a9 24 2026  |  Goatsi Bot`));
  return box(BLUE, inner);
}

// ── 5. Bracket Post ───────────────────────────────────────────────────────────
function makeBracketPost(tid) {
  const { t, ttRows, getTeam } = getContext(tid);
  if (!t) return null;

  const label   = `${t.template || t.name} S${t.season}`;
  const allKo   = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'knockout');
  const groupNames = [...new Set(ttRows.filter(tt => tt.group_name).map(tt => tt.group_name))];
  const advance    = t.advance_per_group || 2;
  let firstKoRound = groupNames.length > 0 ? Math.floor((groupNames.length * advance) / 2) : 0;
  if (!firstKoRound && allKo.length) {
    firstKoRound = Math.max(...allKo.map(m => m.round));
  }

  const inner = [
    txt(`${E_CUP}  **KNOCKOUT BRACKET  —  ${label.toUpperCase()}**`),
  ];

  if (!firstKoRound) {
    inner.push(SEP);
    inner.push(txt(`⏳  No knockout bracket yet.`));
    inner.push(SEP);
    inner.push(txt(`-# © 24 2026  |  Goatsi Bot`));
    return box(RED, inner);
  }

  const roundList = [];
  for (let r = firstKoRound; r >= 1; r = Math.floor(r / 2)) {
    roundList.push(r);
    if (r === 1) break;
  }

  const matchesByRound = {};
  for (const m of allKo) {
    if (!matchesByRound[m.round]) matchesByRound[m.round] = [];
    matchesByRound[m.round].push(m);
  }

  for (const round of roundList) {
    const rName    = koRoundName(round);
    const rMatches = (matchesByRound[round] || []).sort((a, b) => (a.leg || 1) - (b.leg || 1) || a.id - b.id);

    // ── type 14 separator + round label ────────────────────────────────────
    inner.push(SEP);
    inner.push(txt(`${E_ARR}  **${rName}**`));

    let matchText = '';

    if (round === 2) {
      // ── SEMI-FINALS — 2 legs ─────────────────────────────────────────────
      const sfLeg1s = rMatches.filter(m => !m.leg || m.leg === 1);
      const sfLeg2s = rMatches.filter(m => m.leg === 2);
      const sfParts = [];
      const numSF   = sfLeg1s.length || 2;
      for (let idx = 0; idx < numSF; idx++) {
        const leg1  = sfLeg1s[idx];
        const lines = [];
        if (numSF > 1) lines.push('***SF' + (idx + 1) + '***');
        if (!leg1) {
          lines.push('-# 1ST LEG:\n' + fmtMatchLine('TBD', 'TBD', VS_SEP));
          lines.push('-# 2ND LEG:\n' + fmtMatchLine('TBD', 'TBD', VS_SEP));
        } else {
          const hName  = getTeam(leg1.home_team_id).name.toUpperCase();
          const aName  = getTeam(leg1.away_team_id).name.toUpperCase();
          const l1Done = leg1.status === 'played';
          const leg2   = sfLeg2s.find(m => m.home_team_id === leg1.away_team_id && m.away_team_id === leg1.home_team_id);
          const l2Done = leg2?.status === 'played';
          if (!l1Done) {
            lines.push('-# 1ST LEG:\n' + fmtMatchLine(hName, aName, VS_SEP));
            lines.push('-# 2ND LEG:\n' + fmtMatchLine(aName, hName, VS_SEP));
          } else if (!l2Done) {
            lines.push('-# HOME:\n' + fmtMatchLine(hName, aName, scoreSepF(leg1.home_score, leg1.away_score, leg1.home_forfeit, leg1.away_forfeit)));
            lines.push('-# AWAY:\n' + fmtMatchLine(aName, hName, VS_SEP));
          } else {
            const hAgg = (leg1.home_score || 0) + (leg2.away_score || 0);
            const aAgg = (leg1.away_score || 0) + (leg2.home_score || 0);
            lines.push('-# HOME:\n' + fmtMatchLine(hName, aName, scoreSepF(leg1.home_score, leg1.away_score, leg1.home_forfeit, leg1.away_forfeit)));
            lines.push('-# AWAY:\n' + fmtMatchLine(aName, hName, scoreSepF(leg2.home_score, leg2.away_score, leg2.home_forfeit, leg2.away_forfeit)));
            lines.push('-# TOTAL:\n' + fmtMatchLine(hName, aName, scoreSep(hAgg, aAgg)));
          }
        }
        sfParts.push(lines.join('\n'));
      }
      matchText = sfParts.join('\n\n');
    } else {
      // ── Final + earlier rounds — single leg ───────────────────────────────
      if (!rMatches.length) {
        const lines = [];
        for (let i = 0; i < round; i++) lines.push(fmtMatchLine('TBD', 'TBD', VS_SEP));
        matchText = lines.join('\n');
      } else {
        const lines = rMatches.filter(m => !m.leg || m.leg === 1).map(m => {
          const hName = m.home_team_id ? getTeam(m.home_team_id).name.toUpperCase() : 'TBD';
          const aName = m.away_team_id ? getTeam(m.away_team_id).name.toUpperCase() : 'TBD';
          return m.status === 'played'
            ? fmtMatchLine(hName, aName, scoreSepF(m.home_score, m.away_score, m.home_forfeit, m.away_forfeit))
            : fmtMatchLine(hName, aName, VS_SEP);
        });
        matchText = lines.join('\n');
      }
    }

    if (matchText !== null) inner.push(txt(matchText));
  }

  inner.push(SEP);
  inner.push(txt(`-# © 24 2026  |  Goatsi Bot`));
  return box(RED, inner);
}


// ── Champion / Winner Announcement post ──────────────────────────────────────
function makeChampionPost(tournamentName, season, winnerTeamName) {
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: GOLD, components: [
      txt(`${E_CUP}  **The ${tournamentName} S${season} winner**`),
      SEP,
      txt(`${E_CROWN}  **${winnerTeamName.toUpperCase()}**`),
      SEP,
      txt('-# © 24 2026  |  Goatsi Bot'),
    ]}],
  };
}

module.exports = {
  makeSchedulePost,
  fmtMatchLine,
  VS_SEP,
  scoreSep,
  scoreSepF,
  makeResultsPost,
  makeStandingsPost,
  makeGroupDrawPost,
  makeBracketPost,
  makeChampionPost,
  // Legacy no-ops (kept for any old callers)
  makeScheduleEmbed:          () => null,
  makeResultEmbed:            () => null,
  makeMultiResultsEmbed:      () => null,
  makeStandingsEmbed:         () => null,
  makeGroupRegistrationEmbed: () => null,
  makeBracketEmbed:           () => null,
};
