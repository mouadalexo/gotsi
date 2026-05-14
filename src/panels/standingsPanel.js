'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { db } = require("../utils/database");

const E_CUP     = "<a:cup:1501741159557500971>";
const E_HASHTAG = "<a:hashtag:1501741088736678069>";
const E_CROWN   = "<:crownn:1501741176296964277>";
const E_ARROW   = "<a:arrow:1501741110798585927>";
const E_FIRE    = "<a:fire:1472250580583059611>";

const SEP  = { type: 14, divider: true, spacing: 1 };
const txt  = c => ({ type: 10, content: c });
const box  = (color, inner) => ({ flags: 32768, components: [{ type: 17, accent_color: color, components: inner }] });

// ── Group Standings ────────────────────────────────────────────────────────────
function buildGroupStandingsEmbed(tournamentId) {
  const tournament = db.findById("tournaments", tournamentId);
  if (!tournament) return null;

  const ttRows = db.get("tournament_teams").filter(tt => tt.tournament_id === tournamentId);
  const teams  = db.get("teams");
  const label  = `${tournament.template} S${tournament.season}`;

  const rows = ttRows.map(tt => ({ ...tt, ...teams.find(t => t.id === tt.team_id) }));

  const groups = {};
  for (const r of rows) {
    const g = r.group_name || "A";
    if (!groups[g]) groups[g] = [];
    groups[g].push(r);
  }
  for (const g of Object.keys(groups)) {
    groups[g].sort((a, b) => {
      const pd = (b.points || 0) - (a.points || 0);
      if (pd !== 0) return pd;
      return ((b.goals_for || 0) - (b.goals_against || 0)) - ((a.goals_for || 0) - (a.goals_against || 0));
    });
  }

  const inner = [
    txt(`${E_CUP}  **STANDINGS  —  ${label}**`),
    SEP,
  ];

  const entries = Object.entries(groups).sort();
  entries.forEach(([groupName, gTeams]) => {
    const header = "`#  Team                J   Dif   Pts`";
    const teamLines = gTeams.map((t, i) => {
      const mp    = (t.wins || 0) + (t.draws || 0) + (t.losses || 0);
      const gd    = (t.goals_for || 0) - (t.goals_against || 0);
      const gdStr = (gd >= 0 ? "+" : "") + gd;
      const pts   = t.points || 0;
      const name  = (t.name || "Unknown").padEnd(18).slice(0, 18);
      const num   = String(i + 1).padEnd(2);
      const mpStr = String(mp).padEnd(3);
      const dStr  = gdStr.padStart(4);
      const pStr  = String(pts).padStart(3);
      return `\`${num} ${name}  ${mpStr} ${dStr}  ${pStr}\``;
    });
    inner.push(txt(`${E_HASHTAG}  **GROUP ${groupName}**\n${header}\n${teamLines.join("\n")}`));
    inner.push(SEP);
  });

  inner.push(txt(`-# Night Stars eFootball Tournament  •  ${label}`));
  inner.push(SEP);

  return box(0xCC0000, inner);
}

function buildStandingsRow(tournamentId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`view_results_${tournamentId}`)
      .setLabel("View All Results")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: "1501741159557500971", name: "cup", animated: true }),
  );
}

// ── Knockout Bracket ───────────────────────────────────────────────────────────
function buildKnockoutBracketEmbed(tournamentId) {
  const tournament = db.findById("tournaments", tournamentId);
  if (!tournament) return null;

  const matches = db.get("matches").filter(m => m.tournament_id === tournamentId && m.stage === "knockout");
  const teams   = db.get("teams");
  const getTeam = id => teams.find(t => t.id === id) || { name: "TBD" };
  const label   = `${tournament.template} S${tournament.season}`;

  const inner = [
    txt(`${E_CUP}  **KNOCKOUT BRACKET  —  ${label}**`),
    SEP,
  ];

  if (!matches.length) {
    inner.push(txt("⏳  No knockout matches yet. Complete the group stage first."));
    inner.push(SEP);
    inner.push(txt(`-# Night Stars eFootball Tournament  •  ${label}`));
    inner.push(SEP);
    return box(0xFFD700, inner);
  }

  const rounds = {};
  for (const m of matches) {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }

  const roundLabels = { 1: "⭐  FINAL", 2: "🔴  SEMI-FINALS", 4: "🟠  QUARTER-FINALS", 8: "🔵  ROUND OF 16" };
  const entries = Object.entries(rounds).sort((a, b) => Number(b[0]) - Number(a[0]));

  entries.forEach(([round, rMatches]) => {
    const label2 = roundLabels[round] || `🔹  ROUND ${round}`;
    const lines = rMatches.map(m => {
      const home    = getTeam(m.home_team_id);
      const away    = getTeam(m.away_team_id);
      const score   = m.status === "played" ? `\`${m.home_score} — ${m.away_score}\`` : "`? — ?`";
      const homeWon = m.status === "played" && m.home_score > m.away_score;
      const awayWon = m.status === "played" && m.away_score > m.home_score;
      const h = homeWon ? `${E_CROWN} **${home.name}**` : `**${home.name}**`;
      const a = awayWon ? `**${away.name}** ${E_CROWN}` : `**${away.name}**`;
      return `${E_ARROW}  ${h}  ${score}  ${a}`;
    });
    inner.push(txt(`**${label2}**\n${lines.join("\n")}`));
    inner.push(SEP);
  });

  inner.push(txt(`-# Night Stars eFootball Tournament  •  ${label}`));
  inner.push(SEP);
  return box(0xFFD700, inner);
}

module.exports = { buildGroupStandingsEmbed, buildStandingsRow, buildKnockoutBracketEmbed };
