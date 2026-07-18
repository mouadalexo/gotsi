'use strict';
const { db } = require('./database');

const RED    = 0xCC0000;
const GOLD   = 0xFFD700;
const BLUE   = 0x2563EB;
const ORANGE = 0xFF3600;
const PURPLE = 0x8B5CF6;
const GREEN  = 0x43FF00;

const LINE_W = 36;
const VS_SEP = ' vs ';
const trunc  = (s, n) => s.length > n ? s.slice(0, n - 3) + '...' : s;
const tPad   = (s, n) => { const x = trunc(s, n); return x.padEnd(n); };
const scoreSep  = (h, a) => ' ' + String(h).padStart(2) + '-' + String(a).padEnd(2) + ' ';

function fmtMatchLine(home, away, sep) {
  const half = Math.floor((LINE_W - sep.length) / 2);
  const h = home.length > half ? home.slice(0, half - 1) + '\u2026' : home;
  const a = away.length > half ? away.slice(0, half - 1) + '\u2026' : away;
  return '`' + h.padStart(half) + sep + a.padEnd(half) + '`';
}

const E_CUP   = '<a:cup:1501741159557500971>';
const E_HASH  = '<a:hashtag:1501741088736678069>';
const E_CROWN = '<a:crown:1501741170668077127>';
const E_ARR     = '<a:smallarrow:1472222559645863936>';
const E_ARROW   = '<a:arrow:1501741110798585927>';
const E_CHANNEL = '<a:channelutility:1501741046734786600>';
const SEP  = { type: 14, divider: true, spacing: 1 };
const txt  = c => ({ type: 10, content: c });
const box  = (color, inner) => ({ flags: 32768, components: [{ type: 17, accent_color: color, components: inner }] });

function getContext() {
  const fed    = db.getConfig('federation') || {};
  const clans  = (db.get('fed_clans') || []).filter(c => c.fed_season === (fed.season || 1));
  const matches= (db.get('fed_matches') || []).filter(m => m.fed_season === (fed.season || 1));
  const getClan = id => clans.find(c => c.id === id) || { name: 'TBD' };
  return { fed, clans, matches, getClan };
}

function calcMatchResult(m) {
  // Simple match-level result: 'home' = home wins (3-0), 'away' = away wins (0-3), 'draw' = (1-1)
  if (m.result === 'home') return { hp: 3, ap: 0 };
  if (m.result === 'away') return { hp: 0, ap: 3 };
  if (m.result === 'draw') return { hp: 1, ap: 1 };
  return { hp: 0, ap: 0 };
}

// ── Clan List Post ────────────────────────────────────────────
function makeFedClanListPost(fed, clans) {
  const tag      = fed.tag || fed.name || 'Federation';
  const season   = fed.season || 1;
  const needsPad = clans.length >= 10;
  const inner    = [];
  inner.push(txt('# ' + E_CUP + '  ' + tag + ' \u2014 Clan List\n' +
    E_CHANNEL + '  The **' + clans.length + '** registered clans for **' + tag + '** **S' + season + '**'));
  inner.push(SEP);
  if (!clans.length) {
    inner.push(txt('\u23f3  No clans registered yet.'));
    inner.push(SEP);
  } else {
    for (let i = 0; i < clans.length; i++) {
      const clan     = clans[i];
      const num      = String(i + 1);
      const spacing  = needsPad ? (num.length === 1 ? '    ' : '   ') : '   ';
      const leaderId = (clan.players || [])[0] || null;
      const noLeader = "`No leader assigned`";
      let line = '**' + num + spacing + 'Clan name   ' + E_ARROW + '   ' + clan.name + '**';
      line += '\n\u3000 Leader   ' + E_ARR + '   ' + (leaderId ? '<@' + leaderId + '>' : noLeader);
      inner.push(txt(line));
      inner.push(SEP);
    }
  }
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
  return box(BLUE, inner);
}
// ── Schedule Post ──────────────────────────────────────────────────────────
function makeFedSchedulePost(fed, allMatches, round, clans) {
  const label    = (fed.tag || fed.name || 'Federation') + ' S' + (fed.season || 1);
  const getClan  = id => clans.find(c => c.id === id) || { name: 'TBD' };
  const system   = fed.system || 'cup';
  const rMatches = allMatches.filter(m => m.round === round);
  const totalRds = [...new Set(allMatches.map(m => m.round))].length;

  const inner = [
    txt(E_CUP + '  **SCHEDULE \u2014 ROUND ' + round + '/' + totalRds + '  \u2014  ' + label.toUpperCase() + '**'),
    SEP,
  ];

  if (!rMatches.length) {
    inner.push(txt('\u23f3  No matches for this round.'));
  } else if (system === 'cup') {
    const groups = {};
    for (const m of rMatches) {
      const g = m.group_name || '?';
      if (!groups[g]) groups[g] = [];
      groups[g].push(m);
    }
    Object.entries(groups).sort().forEach(([g, gm], i) => {
      const lines = gm.map(m => fmtMatchLine(getClan(m.home_clan_id).name.toUpperCase(), getClan(m.away_clan_id).name.toUpperCase(), VS_SEP));
      inner.push(txt(E_HASH + '  **GROUP ' + g + '**\n' + lines.join('\n')));
      if (i < Object.keys(groups).length - 1) inner.push(SEP);
    });
  } else {
    const lines = rMatches.map(m => fmtMatchLine(getClan(m.home_clan_id).name.toUpperCase(), getClan(m.away_clan_id).name.toUpperCase(), VS_SEP));
    inner.push(txt(lines.join('\n')));
  }

  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
  return box(PURPLE, inner);
}

// ── Results Post ───────────────────────────────────────────────────────────
function makeFedResultsPost(fed, allMatches, round, clans) {
  const label    = (fed.tag || fed.name || 'Federation') + ' S' + (fed.season || 1);
  const getClan  = id => clans.find(c => c.id === id) || { name: 'TBD' };
  const system   = fed.system || 'cup';
  const rMatches = allMatches.filter(m => m.round === round && m.status === 'played');
  const totalRds = [...new Set(allMatches.map(m => m.round))].length;

  const inner = [
    txt(E_CUP + '  **RESULTS \u2014 ROUND ' + round + '/' + totalRds + '  \u2014  ' + label.toUpperCase() + '**'),
    SEP,
  ];

  if (!rMatches.length) {
    inner.push(txt('\u23f3  No results yet for this round.'));
  } else if (system === 'cup') {
    const groups = {};
    for (const m of rMatches) {
      const g = m.group_name || '?';
      if (!groups[g]) groups[g] = [];
      groups[g].push(m);
    }
    Object.entries(groups).sort().forEach(([g, gm], i) => {
      const lines = gm.map(m => {
        const { hp, ap } = calcMatchResult(m);
        return fmtMatchLine(getClan(m.home_clan_id).name.toUpperCase(), getClan(m.away_clan_id).name.toUpperCase(), scoreSep(hp, ap));
      });
      inner.push(txt(E_HASH + '  **GROUP ' + g + '**\n' + lines.join('\n')));
      if (i < Object.keys(groups).length - 1) inner.push(SEP);
    });
  } else {
    const lines = rMatches.map(m => {
      const { hp, ap } = calcMatchResult(m);
      return fmtMatchLine(getClan(m.home_clan_id).name.toUpperCase(), getClan(m.away_clan_id).name.toUpperCase(), scoreSep(hp, ap));
    });
    inner.push(txt(lines.join('\n')));
  }

  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
  return box(ORANGE, inner);
}

// ── Standings Post (League & Cup groups) ──────────────────────────────────
function makeFedStandingsPost(fed, allMatches, clans, isLeague) {
  const label  = (fed.tag || fed.name || 'Federation') + ' S' + (fed.season || 1);
  const NW     = 18;
  const title  = isLeague ? 'STANDING LEAGUE' : 'STANDINGS';

  const init   = () => ({ w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  const stats  = {};
  const played = allMatches.filter(m => m.status === 'played');

  for (const m of played) {
    if (!stats[m.home_clan_id]) stats[m.home_clan_id] = init();
    if (!stats[m.away_clan_id]) stats[m.away_clan_id] = init();
    const { hp, ap } = calcMatchResult(m);
    const hs = stats[m.home_clan_id];
    const as = stats[m.away_clan_id];
    hs.gf += hp; hs.ga += ap;
    as.gf += ap; as.ga += hp;
    if (hp > ap)      { hs.w++; hs.pts += 3; as.l++; }
    else if (hp < ap) { as.w++; as.pts += 3; hs.l++; }
    else              { hs.d++; hs.pts += 1; as.d++; as.pts += 1; }
  }

  const inner = [
    txt(E_CUP + '  **' + title + '  \u2014  ' + label.toUpperCase() + '**'),
    SEP,
  ];

  if (isLeague) {
    // League: one big table
    const allC = clans.map(c => {
      const s = stats[c.id] || init();
      return { name: c.name, played: s.w + s.d + s.l, ...s };
    }).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));

    const header = '`#  ' + 'Clan'.padEnd(NW) + '  P  Dif  Pts`';
    const rows   = allC.map((c, i) => {
      const pos  = i + 1;
      const name = trunc(c.name, NW).padEnd(NW);
      const gd   = c.gf - c.ga;
      const dif  = (gd >= 0 ? '+' : '') + gd;
      return '`' + String(pos).padEnd(2) + ' ' + name + '  ' + String(c.played).padStart(1) + '  ' + dif.padStart(3) + '  ' + String(c.pts).padStart(3) + '`';
    });
    inner.push(txt(header + '\n' + rows.join('\n')));
  } else {
    // Cup: group tables
    const groups = {};
    for (const c of clans) {
      const g = c.group_name || '?';
      if (!groups[g]) groups[g] = [];
      groups[g].push(c);
    }
    const entries = Object.entries(groups).sort();
    entries.forEach(([g, gClans], idx) => {
      const sorted = gClans.map(c => {
        const s = stats[c.id] || init();
        return { name: c.name, played: s.w + s.d + s.l, ...s };
      }).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));

      const header = '`#  ' + 'Clan'.padEnd(NW) + '  P  Dif  Pts`';
      const rows   = sorted.map((c, i) => {
        const pos = i + 1;
        const name = trunc(c.name, NW).padEnd(NW);
        const gd   = c.gf - c.ga;
        const dif  = (gd >= 0 ? '+' : '') + gd;
        return '`' + String(pos).padEnd(2) + ' ' + name + '  ' + String(c.played).padStart(1) + '  ' + dif.padStart(3) + '  ' + String(c.pts).padStart(3) + '`';
      });
      inner.push(txt(E_HASH + '  **GROUP ' + g + '**\n' + header + '\n' + rows.join('\n')));
      if (idx < entries.length - 1) inner.push(SEP);
    });
  }

  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
  return box(GREEN, inner);
}

// ── Group Draw Post ────────────────────────────────────────────────────────
function makeFedGroupDrawPost(fed, clans) {
  const label  = (fed.tag || fed.name || 'Federation') + ' S' + (fed.season || 1);
  const groups = {};
  for (const c of clans) {
    const g = c.group_name || '?';
    if (!groups[g]) groups[g] = [];
    groups[g].push(c.name);
  }
  const inner = [
    txt(E_CUP + '  **GROUP DRAW  \u2014  ' + label.toUpperCase() + '**'),
    SEP,
  ];
  const NW = LINE_W - 4;
  Object.entries(groups).sort().forEach(([g, names], i) => {
    const rows = names.map((n, idx) => {
      const num  = String(idx + 1) + '.';
      return '`' + num.padEnd(2) + '  ' + trunc(n.toUpperCase(), NW).padEnd(NW) + '`';
    });
    inner.push(txt(E_HASH + '  **GROUP ' + g + '**\n' + rows.join('\n')));
    if (i < Object.keys(groups).length - 1) inner.push(SEP);
  });
  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
  return box(BLUE, inner);
}

// ── KO Bracket Post ────────────────────────────────────────────────────────
function makeFedBracketPost(fed, allMatches, clans) {
  const label    = (fed.tag || fed.name || 'Federation') + ' S' + (fed.season || 1);
  const getClan  = id => clans.find(c => c.id === id) || { name: 'TBD' };
  const koMs     = allMatches.filter(m => m.stage === 'knockout');
  const grpClans = clans.filter(c => c.group_name);
  const advance  = fed.advance_per_group || 2;
  const groups   = [...new Set(grpClans.map(c => c.group_name))];

  // Compute firstKoRound from group structure, same logic as CL bracket
  let firstKoRound = groups.length > 0 ? Math.floor((groups.length * advance) / 2) : 0;
  if (!firstKoRound && koMs.length) firstKoRound = Math.max(...koMs.map(m => m.round));

  const inner = [txt(E_CUP + '  **KNOCKOUT BRACKET  \u2014  ' + label.toUpperCase() + '**')];

  if (!firstKoRound) {
    inner.push(SEP);
    inner.push(txt('\u23f3  Knockout stage not started yet.'));
    inner.push(SEP);
    inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
    return box(RED, inner);
  }

  // Build full round list from firstKoRound down to 1 (halving each step)
  const roundList = [];
  for (let r = firstKoRound; r >= 1; r = Math.floor(r / 2)) {
    roundList.push(r);
    if (r === 1) break;
  }

  const matchesByRound = {};
  for (const m of koMs) {
    if (!matchesByRound[m.round]) matchesByRound[m.round] = [];
    matchesByRound[m.round].push(m);
  }

  const ROUND_LABELS = { 1: 'FINAL', 2: 'SEMI-FINALS', 4: 'QUARTER-FINALS', 8: 'ROUND OF 16', 16: 'ROUND OF 32' };
  // Single-leg result separator: W (home won) / D (draw) / L (home lost)
  const fedSep = r => r === 'home' ? '  W  ' : r === 'away' ? '  L  ' : '  D  ';

  for (const round of roundList) {
    const rLabel   = ROUND_LABELS[round] || 'ROUND ' + round;
    const rMatches = (matchesByRound[round] || []).sort((a, b) => a.id - b.id);
    inner.push(SEP);
    inner.push(txt(E_ARR + '  **' + rLabel + '**'));

    let matchText;
    if (!rMatches.length) {
      // Round not generated yet — show TBD placeholders
      const lines = [];
      for (let i = 0; i < round; i++) lines.push(fmtMatchLine('TBD', 'TBD', VS_SEP));
      matchText = lines.join('\n');
    } else {
      const lines = rMatches.map(m => {
        const hName = getClan(m.home_clan_id).name.toUpperCase();
        const aName = getClan(m.away_clan_id).name.toUpperCase();
        return m.status === 'played'
          ? fmtMatchLine(hName, aName, fedSep(m.result))
          : fmtMatchLine(hName, aName, VS_SEP);
      });
      matchText = lines.join('\n');
    }
    inner.push(txt(matchText));
  }

  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
  return box(RED, inner);
}

// ── Champion Post ──────────────────────────────────────────────────────────
function makeFedChampionPost(fed, clanName) {
  return { flags: 32768, components: [{ type: 17, accent_color: GOLD, components: [
    txt(E_CUP + '  **The ' + (fed.tag || fed.name || 'Federation') + ' S' + (fed.season || 1) + ' winner**'),
    SEP,
    txt(E_CROWN + '  **' + clanName.toUpperCase() + '**'),
    SEP,
    txt('-# \u00a9 24 2026  |  Goatsi Bot'),
  ]}]};
}

// ── Match Channel message ──────────────────────────────────────────────────
function makeFedMatchChannelMsg(clanAName, clanBName) {
  return { flags: 32768, components: [{ type: 17, accent_color: 0xE67E22, components: [
    txt(E_CUP + '  **' + clanAName.toUpperCase() + '  vs  ' + clanBName.toUpperCase() + '**'),
    SEP,
    txt('-# \u00a9 24 2026  |  Goatsi Bot'),
  ]}]};
}

module.exports = {
  makeFedClanListPost, makeFedSchedulePost, makeFedResultsPost,
  makeFedStandingsPost, makeFedGroupDrawPost, makeFedBracketPost,
  makeFedChampionPost, makeFedMatchChannelMsg, calcMatchResult,
};
