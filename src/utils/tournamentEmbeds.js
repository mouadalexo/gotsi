'use strict';

// ── Accent colours ─────────────────────────────────────────────────────────────
const RED  = 0xCC0000;
const GOLD = 0xFFD700;
const GREEN = 0x00C853;
const GRAY  = 0x95A5A6;

// ── Custom server emojis ───────────────────────────────────────────────────────
const E_CUP        = '<a:cup:1501741159557500971>';
const E_HASHTAG    = '<a:hashtag:1501741088736678069>';
const E_SMALLARROW = '<a:smallarrow:1472222559645863936>';
const E_FIRE       = '<a:fire:1472250580583059611>';
const E_CROWN      = '<:crownn:1501741176296964277>';

// ── Component V2 helpers ───────────────────────────────────────────────────────
const sep = (spacing = 1) => ({ type: 14, divider: true, spacing });
const txt = (content)           => ({ type: 10, content });

function container(accentColor, components) {
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: accentColor, components }],
  };
}

// ── 1. Schedule embed ──────────────────────────────────────────────────────────
function makeScheduleEmbed(matches, roundName, seasonName) {
  const inner = [
    txt(`${E_CUP}  **SCHEDULE  —  ${seasonName}  ·  ${roundName.toUpperCase()}**`),
    sep(),
  ];

  const grouped = {};
  for (const m of matches) {
    const grp = m.group || '';
    if (!grouped[grp]) grouped[grp] = [];
    grouped[grp].push(m);
  }

  const entries = Object.entries(grouped).sort();
  entries.forEach(([grp, grpMatches], i) => {
    const PAD  = 22;
    const lines = grpMatches.map(m => {
      const h = m.home.toUpperCase().slice(0, PAD).padEnd(PAD);
      const a = m.away.toUpperCase().slice(0, PAD);
      return `${E_SMALLARROW}  \`${h}  vs  ${a}\``;
    });
    inner.push(txt(`${E_HASHTAG}  **GROUP ${grp}**\n${lines.join('\n')}`));
    if (i < entries.length - 1) inner.push(sep());
  });

  inner.push(sep());
  inner.push(txt(`-# Night Stars eFootball Tournament  •  ${seasonName}`));
  return container(RED, inner);
}

// ── 2. Result embed (single match) ────────────────────────────────────────────
function makeResultEmbed(home, homeScore, away, awayScore, roundName, seasonName) {
  const h = home.toUpperCase();
  const a = away.toUpperCase();
  let color, outcomeLine;

  if (homeScore > awayScore) {
    color = GREEN;
    outcomeLine = `${E_CROWN}  **${h} WINS**  ${E_CROWN}`;
  } else if (awayScore > homeScore) {
    color = GREEN;
    outcomeLine = `${E_CROWN}  **${a} WINS**  ${E_CROWN}`;
  } else {
    color = GRAY;
    outcomeLine = `${E_FIRE}  **MATCH DRAWN**  ${E_FIRE}`;
  }

  return container(color, [
    txt(`${E_CUP}  **FULL TIME  —  ${seasonName}  ·  ${roundName.toUpperCase()}**`),
    sep(),
    txt(`**${h}  ${homeScore}  —  ${awayScore}  ${a}**`),
    sep(2),
    txt(outcomeLine),
    sep(),
    txt(`-# Night Stars eFootball Tournament  •  ${seasonName}`),
  ]);
}

// ── 3. Multi-results embed ─────────────────────────────────────────────────────
function makeMultiResultsEmbed(results, seasonName) {
  const byRound = {};
  for (const r of results) {
    const key = r.round || 1;
    if (!byRound[key]) byRound[key] = [];
    byRound[key].push(r);
  }

  const inner = [
    txt(`${E_CUP}  **RESULTS  —  ${seasonName}**`),
    sep(),
  ];

  const entries = Object.entries(byRound).sort((a, b) => Number(a[0]) - Number(b[0]));
  entries.forEach(([round, roundResults], i) => {
    const lines = roundResults.map(r => {
      const h = r.home.toUpperCase(), a = r.away.toUpperCase();
      if (r.hs > r.as) return `${E_CROWN} **${h}**  \`${r.hs} — ${r.as}\`  ${a}`;
      if (r.as > r.hs) return `${h}  \`${r.hs} — ${r.as}\`  **${a}** ${E_CROWN}`;
      return `${E_FIRE} **${h}**  \`${r.hs} — ${r.as}\`  **${a}**`;
    });
    inner.push(txt(`${E_HASHTAG}  **ROUND ${round}**\n${lines.join('\n')}`));
    if (i < entries.length - 1) inner.push(sep());
  });

  inner.push(sep());
  inner.push(txt(`-# Night Stars eFootball Tournament  •  ${seasonName}`));
  return container(RED, inner);
}

// ── 4. Standings embed ─────────────────────────────────────────────────────────
function makeStandingsEmbed(groups, seasonName, advanceSpots = 2, tournamentId = null) {
  const NW     = 18;
  const header = `\`#  ${'Team'.padEnd(NW)}  J   Dif   Pts\``;

  const inner = [
    txt(`${E_CUP}  **STANDINGS  —  ${seasonName}**`),
    sep(),
  ];

  const entries = Object.entries(groups).sort();
  entries.forEach(([grpName, teams], gi) => {
    const rows = [header];
    teams.forEach((t, i) => {
      const pos  = i + 1;
      const name = (t.name || '').slice(0, NW).padEnd(NW);
      const j    = (t.wins || 0) + (t.draws || 0) + (t.losses || 0);
      const gd   = (t.goals_for || 0) - (t.goals_against || 0);
      const pts  = t.points ?? t.pts ?? 0;
      const dif  = gd >= 0 ? `+${gd}` : String(gd);
      rows.push(`\`${String(pos).padEnd(2)} ${name}  ${String(j).padStart(1)}  ${dif.padStart(4)}  ${String(pts).padStart(3)}\``);
    });
    inner.push(txt(`${E_HASHTAG}  **GROUP ${grpName}**\n${rows.join('\n')}`));
    if (gi < entries.length - 1) inner.push(sep());
  });

  inner.push(sep());
  inner.push(txt(`-# Night Stars eFootball Tournament  •  ${seasonName}`));

  if (tournamentId !== null) {
    inner.push({
      type: 1,
      components: [{
        type: 2, style: 2,
        label: 'View All Results',
        emoji: { id: '1501741159557500971', name: 'cup', animated: true },
        custom_id: `view_results_${tournamentId}`,
      }],
    });
  }

  return container(RED, inner);
}

// ── 5. Group registration embed ────────────────────────────────────────────────
function makeGroupRegistrationEmbed(groups, seasonName) {
  const inner = [
    txt(`${E_CUP}  **GROUP DRAW  —  ${seasonName.toUpperCase()}**`),
    sep(),
  ];

  const entries = Object.entries(groups).sort();
  entries.forEach(([grpName, teams], i) => {
    const lines = teams.map(team => `${E_SMALLARROW}  **${team.toUpperCase()}**`);
    inner.push(txt(`${E_HASHTAG}  **GROUP ${grpName}**\n${lines.join('\n')}`));
    if (i < entries.length - 1) inner.push(sep());
  });

  inner.push(sep());
  inner.push(txt(`-# Night Stars eFootball Tournament  •  ${seasonName}`));
  return container(RED, inner);
}

// ── 6. Bracket embed ───────────────────────────────────────────────────────────
function makeBracketEmbed(rounds, seasonName) {
  const roundIcons = {
    'round of 16':    '🔵',
    'quarter-finals': '🟠',
    'semi-finals':    '🔴',
    'final':          '⭐',
  };

  const inner = [
    txt(`${E_CUP}  **KNOCKOUT BRACKET  —  ${seasonName.toUpperCase()}**`),
    sep(),
  ];

  const entries = Object.entries(rounds);
  entries.forEach(([roundName, matches], i) => {
    const icon  = roundIcons[roundName.toLowerCase()] || '🔹';
    const lines = matches.map(m => {
      const h = m.home.toUpperCase(), a = m.away.toUpperCase();
      if (m.hs == null) return `⏳  **${h}**  \`vs\`  **${a}**`;
      if (m.hs > m.as) return `${E_CROWN} **${h}**  \`${m.hs} — ${m.as}\`  ${a}`;
      if (m.as > m.hs) return `${h}  \`${m.hs} — ${m.as}\`  **${a}** ${E_CROWN}`;
      return `${E_FIRE} **${h}**  \`${m.hs} — ${m.as}\`  **${a}**`;
    });
    inner.push(txt(`${icon}  **${roundName.toUpperCase()}**\n${lines.join('\n')}`));
    if (i < entries.length - 1) inner.push(sep());
  });

  inner.push(sep());
  inner.push(txt(`-# Night Stars eFootball Tournament  •  ${seasonName}`));
  return container(GOLD, inner);
}

module.exports = {
  makeScheduleEmbed,
  makeResultEmbed,
  makeMultiResultsEmbed,
  makeStandingsEmbed,
  makeGroupRegistrationEmbed,
  makeBracketEmbed,
};
