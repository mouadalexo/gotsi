'use strict';
const {
  ActionRowBuilder, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { db } = require("../utils/database");
const { E } = require("../utils/embeds");

const E_CUP     = "<a:cup:1501741159557500971>";
const E_HASHTAG = "<a:hashtag:1501741088736678069>";
const E_CROWN   = "<:crownn:1501741176296964277>";
const E_FIRE    = "<a:fire:1472250580583059611>";

const sep = (sp = 1) => ({ type: 14, divider: true, spacing: sp });
const txt = c => ({ type: 10, content: c });
const box = (color, inner) => ({ flags: 32768, components: [{ type: 17, accent_color: color, components: inner }] });

function buildPendingMatchesSelect(tournamentId) {
  const matches = db.get("matches").filter(m => m.tournament_id === tournamentId && m.status === "pending");
  if (!matches.length) return null;

  const teams   = db.get("teams");
  const getTeam = id => teams.find(t => t.id === id) || { name: "Unknown" };

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`match_select_${tournamentId}`)
      .setPlaceholder("Select a match to add result...")
      .addOptions(matches.slice(0, 25).map(m => {
        const home = getTeam(m.home_team_id);
        const away = getTeam(m.away_team_id);
        return {
          label: `${home.name} vs ${away.name}`,
          value: String(m.id),
          description: `${m.stage} · Round ${m.round}`,
        };
      }))
  );
}

function buildResultModal(matchId) {
  return new ModalBuilder()
    .setCustomId(`result_modal_${matchId}`)
    .setTitle("Enter Match Result")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("home_score").setLabel("Home Team Score").setStyle(TextInputStyle.Short).setPlaceholder("0").setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("away_score").setLabel("Away Team Score").setStyle(TextInputStyle.Short).setPlaceholder("0").setRequired(true)
      ),
    );
}

// ── All Results — Component V2 ─────────────────────────────────────────────────
function buildAllResultsEmbed(tournamentId) {
  const tournament = db.findById("tournaments", tournamentId);
  if (!tournament) return null;

  const matches = db.get("matches").filter(m => m.tournament_id === tournamentId && m.stage === "group" && m.status === "played");
  const teams   = db.get("teams");
  const ttRows  = db.get("tournament_teams").filter(tt => tt.tournament_id === tournamentId);
  const getTeam = id => teams.find(t => t.id === id) || { name: "Unknown" };
  const getGrp  = id => ttRows.find(tt => tt.team_id === id)?.group_name || "?";

  const inner = [
    txt(`${E_CUP}  **${tournament.name}  —  All Results**`),
    sep(),
  ];

  if (!matches.length) {
    inner.push(txt("⏳  No results recorded yet."));
    inner.push(sep());
    inner.push(txt(`-# ${tournament.template}  •  Group Stage`));
    return box(0xCC0000, inner);
  }

  const groups = {};
  for (const m of matches) {
    const g = getGrp(m.home_team_id);
    if (!groups[g]) groups[g] = [];
    groups[g].push(m);
  }

  const entries = Object.entries(groups).sort();
  entries.forEach(([g, gMatches], gi) => {
    const lines = gMatches.map(m => {
      const home    = getTeam(m.home_team_id);
      const away    = getTeam(m.away_team_id);
      const homeWon = m.home_score > m.away_score;
      const awayWon = m.away_score > m.home_score;
      const draw    = m.home_score === m.away_score;
      const icon    = draw ? "🤝" : E_FIRE;
      const homeStr = homeWon ? `${E_CROWN} **${home.name}**` : `**${home.name}**`;
      const awayStr = awayWon ? `**${away.name}** ${E_CROWN}` : `**${away.name}**`;
      return `${icon}  ${homeStr}  \`${m.home_score} — ${m.away_score}\`  ${awayStr}`;
    });
    inner.push(txt(`${E_HASHTAG}  **GROUP ${g}**\n${lines.join("\n")}`));
    if (gi < entries.length - 1) inner.push(sep());
  });

  inner.push(sep());
  inner.push(txt(`-# ${tournament.template}  •  Group Stage`));
  return box(0xCC0000, inner);
}

module.exports = { buildPendingMatchesSelect, buildResultModal, buildAllResultsEmbed };
