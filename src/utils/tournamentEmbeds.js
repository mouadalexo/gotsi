'use strict';
const { db } = require('./database');

const RED    = 0xCC0000;
const GOLD   = 0xFFD700;
const BLUE   = 0x2563EB;
const ORANGE = 0xF97316;

// Truncate + right-pad to exactly n chars (monospace alignment helper)
const tPad = (s, n) => { const x = s.length > n ? s.slice(0, n - 3) + '...' : s; return x.padEnd(n); };
// Truncate name to max n chars; adds "..." if cut. No padding (bold style).
const trunc = (s, n) => s.length > n ? s.slice(0, n - 3) + '...' : s;

const E_CUP   = '<a:cup:1501741159557500971>';
const E_HASH  = '<a:hashtag:1501741088736678069>';
const E_CROWN = '<:crownn:1501741176296964277>';
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
  const label   = t.name || `${t.template} S${t.season}`;
  const PAD     = 18;

  const grouped  = groupMatchesByGroup(matches, getGrp, getTeam);
  const entries  = Object.entries(grouped).sort();

  const inner = [
    txt(`${E_CUP}  **SCHEDULE — ROUND ${round}/${total}  —  ${label.toUpperCase()}**`),
    SEP,
  ];

  entries.forEach(([g, gm], i) => {
    const lines = gm.map(m => {
      const h = tPad(m.homeName.toUpperCase(), PAD);
      const a = tPad(m.awayName.toUpperCase(), PAD);
      return `\`${h}  vs  ${a}\``;
    });
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${lines.join('\n')}`));
    if (i < entries.length - 1) inner.push(SEP);
  });

  inner.push(SEP);
  inner.push(txt(`-# © 24 2026  |  Goatsi Bot`));
  return box(RED, inner);
}

// ── 2. Results Post ───────────────────────────────────────────────────────────
function makeResultsPost(tid, round) {
  const { t, getTeam, getGrp } = getContext(tid);
  if (!t) return null;
  const allGM   = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
  const total   = [...new Set(allGM.map(m => m.round))].length;
  const matches = allGM.filter(m => m.round === round && m.status === 'played');
  const label   = t.name || `${t.template} S${t.season}`;
  const PAD     = 18;

  const grouped = groupMatchesByGroup(matches, getGrp, getTeam);
  const entries = Object.entries(grouped).sort();

  const inner = [
    txt(`${E_CUP}  **RESULTS — ROUND ${round}/${total}  —  ${label.toUpperCase()}**`),
    SEP,
  ];

  entries.forEach(([g, gm], i) => {
    const lines = gm.map(m => {
      const h = tPad(m.homeName.toUpperCase(), PAD);
      const a = tPad(m.awayName.toUpperCase(), PAD);
      return `\`${h}  ${m.home_score} — ${m.away_score}  ${a}\``;
    });
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${lines.join('\n')}`));
    if (i < entries.length - 1) inner.push(SEP);
  });

  inner.push(SEP);
  inner.push(txt(`-# © 24 2026  |  Goatsi Bot`));
  return box(RED, inner);
}

// ── 3. Standings Post ─────────────────────────────────────────────────────────
function makeStandingsPost(tid) {
  const { t, teams, ttRows } = getContext(tid);
  if (!t) return null;
  const advance = t.advance_per_group || 2;
  const label   = t.name || `${t.template} S${t.season}`;
  const NW      = 14;

  const groups = {};
  for (const tt of ttRows.filter(tt => tt.group_name)) {
    const g    = tt.group_name;
    const team = teams.find(tm => tm.id === tt.team_id) || { name: 'Unknown' };
    if (!groups[g]) groups[g] = [];
    groups[g].push({ ...tt, name: team.name });
  }
  for (const g of Object.keys(groups)) {
    groups[g].sort((a, b) => {
      const pd = (b.points || 0) - (a.points || 0);
      if (pd !== 0) return pd;
      return ((b.goals_for || 0) - (b.goals_against || 0)) - ((a.goals_for || 0) - (a.goals_against || 0));
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
      const p    = (tm.wins || 0) + (tm.draws || 0) + (tm.losses || 0);
      const gd   = (tm.goals_for || 0) - (tm.goals_against || 0);
      const pts  = tm.points || 0;
      const dif  = (gd >= 0 ? '+' : '') + gd;
      return `\`${String(pos).padEnd(2)} ${name}  ${String(p).padStart(1)}  ${dif.padStart(3)}  ${String(pts).padStart(3)}\``;
    });
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${header}\n${rows.join('\n')}`));
    inner.push(SEP);
  });

  inner.pop();
  inner.push(txt(`-# © 24 2026  |  Goatsi Bot`));
  return box(ORANGE, inner);
}

// ── 4. Group Draw Post ────────────────────────────────────────────────────────
function makeGroupDrawPost(tid) {
  const { t, teams, ttRows } = getContext(tid);
  if (!t) return null;
  const label = t.name || `${t.template} S${t.season}`;

  const groups = {};
  for (const tt of ttRows.filter(tt => tt.group_name)) {
    const g    = tt.group_name;
    const team = teams.find(tm => tm.id === tt.team_id) || { name: 'Unknown' };
    if (!groups[g]) groups[g] = [];
    groups[g].push(team.name);
  }

  const inner = [
    txt(`${E_CUP}  **GROUP DRAW  —  ${label.toUpperCase()}**`),
    SEP,
  ];

  const entries = Object.entries(groups).sort();
  entries.forEach(([g, names], i) => {
    const lines = names.map(n => `${E_ARR}  **${n.toUpperCase()}**`);
    inner.push(txt(`${E_HASH}  **GROUP ${g}**\n${lines.join('\n')}`));
    if (i < entries.length - 1) inner.push(SEP);
  });

  inner.push(SEP);
  inner.push(txt(`-# © 24 2026  |  Goatsi Bot`));
  return box(GOLD, inner);
}

// ── 5. Bracket Post ───────────────────────────────────────────────────────────
function makeBracketPost(tid) {
  const { t, ttRows, getTeam } = getContext(tid);
  if (!t) return null;

  const label   = t.name || `${t.template} S${t.season}`;
  const allKo   = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'knockout');
  const KPAD    = 18;

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
    return box(BLUE, inner);
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
    inner.push(txt(`**${rName}**`));

    let matchText = '';

    if (round === 1) {
      // ── FINAL — 2 legs ────────────────────────────────────────────────────
      const leg1 = rMatches.find(m => !m.leg || m.leg === 1);
      const leg2 = rMatches.find(m => m.leg === 2);

      if (!leg1) {
        const h = tPad('TBD', KPAD);
        const a = tPad('TBD', KPAD);
        matchText  = `1ST LEG:  \`${h}  vs  ${a}\``;
        matchText += `\n2ND LEG:  \`${a}  vs  ${h}\``;
      } else {
        const hName  = getTeam(leg1.home_team_id).name.toUpperCase();
        const aName  = getTeam(leg1.away_team_id).name.toUpperCase();
        const l1Done = leg1.status === 'played';
        const l2Done = leg2?.status === 'played';
        const h = tPad(hName, KPAD);
        const a = tPad(aName, KPAD);

        if (!l1Done) {
          matchText  = `1ST LEG:  \`${h}  vs  ${a}\``;
          matchText += `\n2ND LEG:  \`${a}  vs  ${h}\``;
        } else if (l1Done && !l2Done) {
          matchText  = `HOME:  \`${tPad(hName, KPAD)}  ${leg1.home_score} — ${leg1.away_score}  ${tPad(aName, KPAD)}\``;
          matchText += `\nAWAY:  \`${tPad(aName, KPAD)}  vs  ${tPad(hName, KPAD)}\``;
        } else {
          const hAgg = (leg1.home_score || 0) + (leg2?.away_score || 0);
          const aAgg = (leg1.away_score || 0) + (leg2?.home_score || 0);
          matchText  = `HOME:  \`${tPad(hName, KPAD)}  ${leg1.home_score} — ${leg1.away_score}  ${tPad(aName, KPAD)}\``;
          matchText += `\nAWAY:  \`${tPad(aName, KPAD)}  ${leg2.home_score} — ${leg2.away_score}  ${tPad(hName, KPAD)}\``;
          matchText += `\nTOTAL: \`${tPad(hName, KPAD)}  ${hAgg} — ${aAgg}  ${tPad(aName, KPAD)}\``;
          if (hAgg > aAgg) {
            matchText += `\n${E_CROWN}  **${hName} WINS**`;
          } else if (aAgg > hAgg) {
            matchText += `\n${E_CROWN}  **${aName} WINS**`;
          } else if (leg2?.pen_winner) {
            const penTeam = getTeam(leg2.pen_winner);
            matchText += `\n${E_CROWN}  **${penTeam.name.toUpperCase()} WINS (PENALTIES)**`;
          }
        }
      }
    } else {
      // ── QF / SF / earlier rounds — single leg ─────────────────────────────
      const tbd = tPad('TBD', KPAD);
      if (!rMatches.length) {
        const lines = [];
        for (let i = 0; i < round; i++) lines.push(`\`${tbd}  vs  ${tbd}\``);
        matchText = lines.join('\n');
      } else {
        const lines = rMatches.map(m => {
          const hName = m.home_team_id ? getTeam(m.home_team_id).name.toUpperCase() : 'TBD';
          const aName = m.away_team_id ? getTeam(m.away_team_id).name.toUpperCase() : 'TBD';
          const h = tPad(hName, KPAD);
          const a = tPad(aName, KPAD);
          return m.status === 'played'
            ? `\`${h}  ${m.home_score} — ${m.away_score}  ${a}\``
            : `\`${h}  vs  ${a}\``;
        });
        matchText = lines.join('\n');
      }
    }

    inner.push(txt(matchText));
  }

  inner.push(SEP);
  inner.push(txt(`-# © 24 2026  |  Goatsi Bot`));
  return box(BLUE, inner);
}

module.exports = {
  makeSchedulePost,
  makeResultsPost,
  makeStandingsPost,
  makeGroupDrawPost,
  makeBracketPost,
  // Legacy no-ops (kept for any old callers)
  makeScheduleEmbed:          () => null,
  makeResultEmbed:            () => null,
  makeMultiResultsEmbed:      () => null,
  makeStandingsEmbed:         () => null,
  makeGroupRegistrationEmbed: () => null,
  makeBracketEmbed:           () => null,
};
