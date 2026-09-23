'use strict';
const { db } = require('../utils/database');
const { getKnockoutLegs } = require('../utils/knockoutConfig');
const { postFooterComponent } = require('../utils/postFooter');

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

const toMathSansItalic = value => String(value).split('').map(ch => {
  const code = ch.charCodeAt(0);
  if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D608 + code - 65);
  if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D622 + code - 97);
  if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7E2 + code - 48);
  return ch;
}).join('');

// Decision details are kept below the regular score so a tied score is not
// mistaken for the final result in knockout posts.
function knockoutDecisionLines(match) {
  if (!match || match.status !== 'played') return [];
  const lines = [];

  if (match.home_pens != null && match.away_pens != null) {
    const text = `${toMathSansItalic('Penalties')} ${toMathSansItalic(match.home_pens)}–${toMathSansItalic(match.away_pens)}`;
    lines.push(text);
  }
  return lines;
}

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

// ── 1. Live Group Matches Post ────────────────────────────────────────────────
// This keeps the existing Schedule layout and changes only the match separators
// and color as results are entered. Existing public posts are never touched.
function makeGroupMatchesPost(tid, round) {
  const { t, getTeam, getGrp } = getContext(tid);
  if (!t) return null;
  const allGM   = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
  const total   = [...new Set(allGM.map(m => m.round))].length;
  const matches = allGM.filter(m => m.round === round);
  const label   = `${t.template || t.name} S${t.season}`;
  const complete = matches.length > 0 && matches.every(m => m.status === 'played');

  const grouped  = groupMatchesByGroup(matches, getGrp, getTeam);
  const entries  = Object.entries(grouped).sort();

  const inner = [
    txt(`${E_CUP}  **GROUP MATCHES — MATCHDAY ${round}/${total}  —  ${label.toUpperCase()}**`),
    SEP,
  ];

  entries.forEach(([g, gm], i) => {
    const lines = gm.map(m => {
      const separator = m.status === 'played'
        ? scoreSepF(m.home_score, m.away_score, m.home_forfeit, m.away_forfeit)
        : VS_SEP;
      return fmtMatchLine(m.homeName.toUpperCase(), m.awayName.toUpperCase(), separator);
    });
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${lines.join('\n')}`));
    if (i < entries.length - 1) inner.push(SEP);
  });

  inner.push(SEP);
  inner.push(postFooterComponent());
  return box(complete ? ORANGE : PURPLE, inner);
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

  const inner = [
    txt(`${E_CUP}  **STANDINGS  —  ${label.toUpperCase()}**`),
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
  inner.push(SEP);
  inner.push(postFooterComponent());
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
  inner.push(postFooterComponent());
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
  if (allKo.length) {
    firstKoRound = Math.max(...allKo.map(m => m.round));
  }

  const inner = [
    txt(`${E_CUP}  **KNOCKOUT BRACKET  —  ${label.toUpperCase()}**`),
  ];

  if (!firstKoRound) {
    inner.push(SEP);
    inner.push(txt(`⏳  No knockout bracket yet.`));
    inner.push(SEP);
    inner.push(postFooterComponent());
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
    const rName = koRoundName(round);
    const configuredLegs = getKnockoutLegs(t, round);
    const rMatches = (matchesByRound[round] || [])
      .sort((a, b) => (a.leg || 1) - (b.leg || 1) || a.id - b.id);

    // Keep the established bracket-post layout. Leg configuration changes the
    // fixtures shown inside a stage, not the stage heading or overall design.
    inner.push(SEP);
    inner.push(txt(`${E_ARR}  **${rName}**`));

    const tieMap = new Map();
    for (const match of rMatches) {
      const home = Number(match.home_team_id);
      const away = Number(match.away_team_id);
      const key = match.tie_key || (
        Number.isFinite(home) && Number.isFinite(away)
          ? `${Math.min(home, away)}-${Math.max(home, away)}`
          : `match-${match.id}`
      );
      if (!tieMap.has(key)) tieMap.set(key, []);
      tieMap.get(key).push(match);
    }

    const ties = [...tieMap.values()];
    const tieCount = ties.length || round;
    const renderTie = (tie, index) => {
      tie.sort((a, b) => (a.leg || 1) - (b.leg || 1) || a.id - b.id);
      const leg1 = tie.find(m => (m.leg || 1) === 1) || tie[0] || null;
      const leg2 = tie.find(m => Number(m.leg) === 2) || null;
      const homeName = leg1?.home_team_id
        ? getTeam(leg1.home_team_id).name.toUpperCase()
        : 'TBD';
      const awayName = leg1?.away_team_id
        ? getTeam(leg1.away_team_id).name.toUpperCase()
        : 'TBD';
      const oneLine = match => {
        if (!match) return fmtMatchLine('TBD', 'TBD', VS_SEP);
        const home = match.home_team_id ? getTeam(match.home_team_id).name.toUpperCase() : 'TBD';
        const away = match.away_team_id ? getTeam(match.away_team_id).name.toUpperCase() : 'TBD';
        const sep = match.status === 'played'
          ? scoreSepF(match.home_score, match.away_score, match.home_forfeit, match.away_forfeit)
          : VS_SEP;
        const details = knockoutDecisionLines(match, getTeam);
        return [fmtMatchLine(home, away, sep), ...details].join('\n');
      };

      if (configuredLegs === 2) {
        const lines = [];
        // This was part of the original semi-final layout; do not introduce
        // the newer generic TIE labels into the bracket post.
        if (round === 2 && tieCount > 1) lines.push(`***SF${index + 1}***`);

        if (!leg1) {
          lines.push('-# 1ST LEG:\n' + fmtMatchLine('TBD', 'TBD', VS_SEP));
          lines.push('-# 2ND LEG:\n' + fmtMatchLine('TBD', 'TBD', VS_SEP));
        } else {
          const leg1Done = leg1.status === 'played';
          const leg2Done = leg2?.status === 'played';
          const plannedLeg2 = leg2
            ? oneLine(leg2)
            : fmtMatchLine(awayName, homeName, VS_SEP);

          if (!leg1Done) {
            lines.push('-# 1ST LEG:\n' + oneLine(leg1));
            lines.push('-# 2ND LEG:\n' + plannedLeg2);
          } else if (!leg2Done) {
            lines.push('-# HOME:\n' + oneLine(leg1));
            lines.push('-# AWAY:\n' + plannedLeg2);
          } else {
            const homeAggregate = (leg1.home_score || 0) + (leg2.away_score || 0);
            const awayAggregate = (leg1.away_score || 0) + (leg2.home_score || 0);
            lines.push('-# HOME:\n' + oneLine(leg1));
            lines.push('-# AWAY:\n' + oneLine(leg2));
            lines.push('-# TOTAL:\n' + fmtMatchLine(homeName, awayName, scoreSep(homeAggregate, awayAggregate)));
          }
        }
        return lines.join('\n');
      }

      // One-leg stages show exactly one fixture per tie. Any stale second-leg
      // record is left in storage but is not rendered for a one-leg stage.
      return oneLine(leg1);
    };

    // Render TBD fixtures instead of the newer "waiting" message when the
    // next round has not been generated yet.
    const body = ties.length
      ? ties.map(renderTie).join('\n\n')
      : Array.from({ length: round }, (_, index) => renderTie([], index)).join('\n\n');
    inner.push(txt(body));
  }

  inner.push(SEP);
  inner.push(postFooterComponent());
  return box(RED, inner);
}


// ── Champion / Winner Announcement post ──────────────────────────────────────
function makeChampionPost(tournamentName, season, winnerTeamName, winnerPlayerMentions = []) {
  const mentions = Array.isArray(winnerPlayerMentions)
    ? winnerPlayerMentions.filter(Boolean)
    : [];
  const titleWord = mentions.length > 1 ? 'Champions' : 'Champion';
  const playerText = ` ${E_ARR} ${mentions.length ? mentions.join(' ') : '`No players registered`'}`;

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: GOLD, components: [
      txt(`${E_CUP}  **The ${tournamentName} S${season} ${titleWord}**`),
      SEP,
      txt(`${E_CROWN}  **${winnerTeamName.toUpperCase()}**${playerText}`),
      SEP,
      postFooterComponent(),
    ]}],
  };
}

module.exports = {
  makeGroupMatchesPost,
  fmtMatchLine,
  VS_SEP,
  scoreSep,
  scoreSepF,
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
