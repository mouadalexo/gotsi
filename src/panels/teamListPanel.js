'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { db } = require("../utils/database");
const { COLORS, E } = require("../utils/embeds");

const _sep = (sp = "small") => ({ type: 14, divider: true, spacing: sp });
const _txt = c => ({ type: 10, content: c });
const _box = (color, inner) => ({ flags: 32768, components: [{ type: 17, accent_color: color, components: inner }] });

/*
 * TEAMS LIST — buildTeamsListEmbed(tournamentId)
 * Always use this function. Never rebuild the format from scratch.
 *
 * flags: 32768 | accent_color: 0x2b2d31 | type-17 container | max 40 components total
 * Header:  # <cup>  {TEMPLATE}  Team List / <channelutility> The N registered teams ...
 * EL slot: **N    Team name <arrow> name** / <@id>
 * CL slot:  **N   Team name <arrow> name** / <@id1> / <@id2>
 * Padding: >=10 teams = single digit 4 spaces / double digit 3 spaces. <10 = always 3 spaces
 * If teams > 18: groups multiple teams per slot to stay within 40-component Discord limit
 * Footer: -# © 24 2026  |  Goatsi Bot
 */
function buildTeamsListEmbed(tournamentId) {
  const tournament = db.findById('tournaments', tournamentId);
  if (!tournament) return { flags: 32768, components: [{ type: 17, accent_color: 0x2b2d31, components: [{ type: 10, content: 'Tournament not found.' }] }] };

  const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId);
  const teams   = db.get('teams');
  const players = db.get('players');

  const E_CUP     = "<a:cup:1501741159557500971>";
  const E_ARROW   = '<a:arrow:1501741110798585927>';
  const E_CHANNEL = '<a:channelutility:1501741046734786600>';
  const SEP       = { type: 14, divider: true, spacing: 1 };

  const isCL          = tournament.template === 'CL';
  const playersPerTeam = isCL ? 2 : 1;
  const needsPad       = ttRows.length >= 10;

  const enrolledTeams = ttRows.map(tt => ({
    team:    teams.find(t => t.id === tt.team_id) || { name: 'Unknown' },
    players: players.filter(p => p.team_id === tt.team_id && p.tournament_id === tournamentId),
  }));

  const countLabel = `The **${enrolledTeams.length}** registered teams for **${tournament.template}** **S${tournament.season}**`;

  const MAX_TEAM_SLOTS = 18;
  const groupSize = enrolledTeams.length <= MAX_TEAM_SLOTS ? 1 : Math.ceil(enrolledTeams.length / MAX_TEAM_SLOTS);

  const E_SMALLARROW = '<a:smallarrow:1472222559645863936>';

  function teamLine(team, tp, i) {
    const num     = String(i + 1);
    const spacing = needsPad ? (num.length === 1 ? '    ' : '   ') : '   ';
    let line = `**${num}${spacing}Team name   ${E_ARROW}   ${team.name}**`;
    for (let s = 0; s < playersPerTeam; s++) {
      const p       = tp.find(pl => (pl.slot || 0) === s);
      const label   = playersPerTeam > 1 ? `Player ${s + 1}` : 'Player';
      const mention = p ? (p.username ? `<@${p.discord_id}>  \u00b7  \`@${p.username}\`` : `<@${p.discord_id}>`) : '`No player assigned`';
      line += `\n\u3000 ${label}   ${E_SMALLARROW}   ${mention}`;
    }
    return line;
  }

  const inner = [];
  inner.push({ type: 10, content: `# ${E_CUP}  ${tournament.template}  —  Team List\n${E_CHANNEL}  ${countLabel}` });
  inner.push(SEP);

  for (let i = 0; i < enrolledTeams.length; i += groupSize) {
    const group   = enrolledTeams.slice(i, i + groupSize);
    const content = group.map(({ team, players: tp }, j) => teamLine(team, tp, i + j)).join('\n');
    inner.push({ type: 10, content });
    inner.push(SEP);
  }

  inner.push({ type: 10, content: '-# \u00a9 24 2026  |  Goatsi Bot' });

  return { flags: 32768, components: [{ type: 17, accent_color: 0x2b2d31, components: inner }] };
}

// ─── Admin team database embed ────────────────────────────────────────────────
function buildTeamListEmbed() {
  const teams = db.get("teams");
  if (!teams.length) {
    return new EmbedBuilder().setColor(COLORS.warning).setTitle("No Teams").setDescription("No teams in the database.");
  }
  const lines = teams.map(t => `${t.emoji || "⚽"} **${t.name}** \`${t.short_name}\` — ${t.category || "General"}`);
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${E.cup}  Team Database (${teams.length})`)
    .setDescription(lines.join("\n"))
    .setTimestamp();
}

function buildTeamManageButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("team_add_predefined").setLabel("Add Predefined Team").setStyle(ButtonStyle.Primary).setEmoji("⚽"),
      new ButtonBuilder().setCustomId("team_add_custom").setLabel("Add Custom Team").setStyle(ButtonStyle.Secondary).setEmoji("✏️"),
      new ButtonBuilder().setCustomId("team_add_player").setLabel("Add Player").setStyle(ButtonStyle.Success).setEmoji("👤"),
      new ButtonBuilder().setCustomId("team_remove").setLabel("Remove Team").setStyle(ButtonStyle.Danger).setEmoji("🗑️"),
    ),
  ];
}

function buildTeamSelectMenu(placeholder = "Select a team...", customId = "team_select") {
  const teams = db.get("teams").sort((a, b) => a.name.localeCompare(b.name)).slice(0, 25);
  if (!teams.length) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(teams.map(t => ({
        label: t.name,
        value: String(t.id),
        emoji: t.emoji?.slice(0, 2) || "⚽",
        description: `${t.short_name} | ${t.category}`,
      })))
  );
}

function buildAddPlayerModal(teamId) {
  return new ModalBuilder()
    .setCustomId(`player_add_modal_${teamId}`)
    .setTitle("Add Player to Team")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("player_discord_id")
          .setLabel("Discord User ID or @mention")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g. 123456789012345678")
          .setRequired(true)
      )
    );
}

function buildCustomTeamModal() {
  return new ModalBuilder()
    .setCustomId("custom_team_modal")
    .setTitle("Add Custom Team")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("team_name").setLabel("Team Name").setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("team_short").setLabel("Short Name (3-4 letters)").setStyle(TextInputStyle.Short).setMaxLength(4).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("team_emoji").setLabel("Emoji (optional)").setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder("⚽")
      ),
    );
}

module.exports = { buildTeamsListEmbed, buildTeamListEmbed, buildTeamManageButtons, buildTeamSelectMenu, buildAddPlayerModal, buildCustomTeamModal };
