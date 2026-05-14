'use strict';
const { EmbedBuilder } = require('discord.js');

const RED      = 0xCC0000;
const GOLD     = 0xFFD700;
const GREEN    = 0x00C853;
const GRAY     = 0x95A5A6;

const TROPHY    = '🏆';
const BALL      = '⚽';
const CALENDAR  = '📅';
const CHART     = '📊';
const STAR      = '⭐';
const CROWN     = '👑';
const SHIELD    = '🛡️';
const LINE      = '──────────────────────────';
const THIN_LINE = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';

function rankIcon(pos) {
  return pos <= 3 ? ['🥇', '🥈', '🥉'][pos - 1] : `\`${pos}.\``;
}

// ── 1. Schedule embed ─────────────────────────────────────────────────────────
function makeScheduleEmbed(matches, roundName, seasonName) {
  const embed = new EmbedBuilder()
    .setColor(RED)
    .setTitle(`${CALENDAR}  SCHEDULE  —  ${roundName.toUpperCase()}`)
    .setDescription(`**${seasonName}**\n${LINE}`)
    .setFooter({ text: `Night Stars eFootball Tournament  •  ${seasonName}` });

  const grouped = {};
  for (const m of matches) {
    const grp = m.group || '';
    if (!grouped[grp]) grouped[grp] = [];
    grouped[grp].push(m);
  }

  for (const [grp, grpMatches] of Object.entries(grouped)) {
    const lines = grpMatches.map(m =>
      `${BALL}  **${m.home.toUpperCase()}**  \`vs\`  **${m.away.toUpperCase()}**`
    );
    embed.addFields({
      name: grp ? `🔹 GROUP ${grp}` : `${BALL} MATCHES`,
      value: lines.join('\n') + `\n${THIN_LINE}`,
      inline: false,
    });
  }
  return embed;
}

// ── 2. Result embed (single match) ───────────────────────────────────────────
function makeResultEmbed(home, homeScore, away, awayScore, group, roundName, seasonName) {
  const h = home.toUpperCase();
  const a = away.toUpperCase();
  let color, outcomeLine;

  if (homeScore > awayScore) {
    color = GREEN;
    outcomeLine = `${CROWN}  **${h} WINS**  ${CROWN}`;
  } else if (awayScore > homeScore) {
    color = GREEN;
    outcomeLine = `${CROWN}  **${a} WINS**  ${CROWN}`;
  } else {
    color = GRAY;
    outcomeLine = `🤝  **MATCH DRAWN**`;
  }

  const scoreLine = `\`\`\`\n${h.padEnd(20)} ${homeScore}  —  ${awayScore}  ${a}\n\`\`\``;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${TROPHY}  FULL TIME  —  GROUP ${group}  •  ${roundName.toUpperCase()}`)
    .setDescription(`**${seasonName}**\n${LINE}\n${scoreLine}\n${outcomeLine}\n${LINE}`)
    .setFooter({ text: `Night Stars eFootball Tournament  •  ${seasonName}` });
}

// ── 3. Multi-results embed ────────────────────────────────────────────────────
function makeMultiResultsEmbed(results, roundName, seasonName) {
  const embed = new EmbedBuilder()
    .setColor(RED)
    .setTitle(`${TROPHY}  RESULTS  —  ${roundName.toUpperCase()}`)
    .setDescription(`**${seasonName}**\n${LINE}`)
    .setFooter({ text: `Night Stars eFootball Tournament  •  ${seasonName}` });

  const grouped = {};
  for (const r of results) {
    const grp = r.group || '';
    if (!grouped[grp]) grouped[grp] = [];
    grouped[grp].push(r);
  }

  for (const [grp, grpResults] of Object.entries(grouped)) {
    const lines = grpResults.map(r => {
      const h = r.home.toUpperCase(), a = r.away.toUpperCase();
      if (r.hs > r.as) return `${STAR} **${h}**  \`${r.hs} — ${r.as}\`  ${a}`;
      if (r.as > r.hs) return `**${h}**  \`${r.hs} — ${r.as}\`  **${a}** ${STAR}`;
      return `**${h}**  \`${r.hs} — ${r.as}\`  **${a}**  _(Draw)_`;
    });
    embed.addFields({
      name: grp ? `🔹 GROUP ${grp}` : `${TROPHY} RESULTS`,
      value: lines.join('\n') + `\n${THIN_LINE}`,
      inline: false,
    });
  }
  return embed;
}

// ── 4. Standings embed ────────────────────────────────────────────────────────
function makeStandingsEmbed(groups, seasonName, advanceSpots = 2) {
  const embed = new EmbedBuilder()
    .setColor(RED)
    .setTitle(`${CHART}  STANDINGS  —  GROUP STAGE`)
    .setDescription(`**${seasonName}**  •  Top ${advanceSpots} from each group advance\n${LINE}`)
    .setFooter({ text: `✅ = Advances to Knockout Stage  •  Night Stars eFootball Tournament` });

  for (const [grpName, teams] of Object.entries(groups)) {
    const header = `\`${'#'.padEnd(2)} ${'TEAM'.padEnd(22)} ${'P'.padStart(2)} ${'W'.padStart(2)} ${'D'.padStart(2)} ${'L'.padStart(2)} ${'GD'.padStart(4)} ${'PTS'.padStart(4)}\``;
    const rows = [header];
    teams.forEach((t, i) => {
      const pos = i + 1;
      const name = (t.name || '').slice(0, 20);
      const p   = t.p   || (t.wins || 0) + (t.draws || 0) + (t.losses || 0);
      const w   = t.w   || t.wins   || 0;
      const d   = t.d   || t.draws  || 0;
      const l   = t.l   || t.losses || 0;
      const gd  = t.gd  ?? ((t.goals_for || 0) - (t.goals_against || 0));
      const pts = t.pts ?? t.points ?? 0;
      const gdStr = gd > 0 ? `+${gd}` : String(gd);
      const adv = pos <= advanceSpots ? '✅' : '  ';
      rows.push(
        `\`${String(pos).padEnd(2)} ${name.padEnd(22)} ${String(p).padStart(2)} ${String(w).padStart(2)} ${String(d).padStart(2)} ${String(l).padStart(2)} ${gdStr.padStart(4)} ${String(pts).padStart(4)}\`  ${adv}`
      );
    });
    embed.addFields({
      name: `🔹 GROUP ${grpName}`,
      value: rows.join('\n') + `\n${THIN_LINE}`,
      inline: false,
    });
  }
  return embed;
}

// ── 5. Group registration embed ───────────────────────────────────────────────
function makeGroupRegistrationEmbed(groups, seasonName) {
  const embed = new EmbedBuilder()
    .setColor(RED)
    .setTitle(`${SHIELD}  GROUP DRAW  —  ${seasonName.toUpperCase()}`)
    .setDescription(`**Tournament Groups**\n${LINE}`)
    .setFooter({ text: `Night Stars eFootball Tournament  •  ${seasonName}` });

  for (const [grpName, teams] of Object.entries(groups)) {
    const lines = teams.map((team, i) => `\`${i + 1}.\`  **${team.toUpperCase()}**`);
    embed.addFields({
      name: `🔹 GROUP ${grpName}`,
      value: lines.join('\n'),
      inline: true,
    });
  }
  return embed;
}

// ── 6. Bracket embed ──────────────────────────────────────────────────────────
function makeBracketEmbed(rounds, seasonName) {
  const embed = new EmbedBuilder()
    .setColor(GOLD)
    .setTitle(`${TROPHY}  KNOCKOUT BRACKET  —  ${seasonName.toUpperCase()}`)
    .setDescription(LINE)
    .setFooter({ text: `⭐ = Winner  •  ⏳ = Not played yet  •  Night Stars eFootball Tournament` });

  const roundIcons = {
    'round of 16':    '🔵',
    'quarter-finals': '🟠',
    'semi-finals':    '🔴',
    'final':          '⭐',
  };

  for (const [roundName, matches] of Object.entries(rounds)) {
    const icon = roundIcons[roundName.toLowerCase()] || '🔹';
    const lines = matches.map(m => {
      const h = m.home.toUpperCase(), a = m.away.toUpperCase();
      if (m.hs == null) return `⏳  **${h}**  \`vs\`  **${a}**`;
      if (m.hs > m.as) return `${STAR} **${h}**  \`${m.hs} — ${m.as}\`  ${a}`;
      if (m.as > m.hs) return `**${h}**  \`${m.hs} — ${m.as}\`  **${a}** ${STAR}`;
      return `**${h}**  \`${m.hs} — ${m.as}\`  **${a}**  _(Draw)_`;
    });
    embed.addFields({
      name: `${icon}  ${roundName.toUpperCase()}`,
      value: lines.join('\n') + `\n${THIN_LINE}`,
      inline: false,
    });
  }
  return embed;
}

module.exports = {
  makeScheduleEmbed,
  makeResultEmbed,
  makeMultiResultsEmbed,
  makeStandingsEmbed,
  makeGroupRegistrationEmbed,
  makeBracketEmbed,
};
