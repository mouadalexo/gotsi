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
 * NSEL slot: **N    Team name <arrow> name** / [U+3000] Player <smallarrow> <@id>
 * MCL slot:  **N   Team name <arrow> name** / [U+3000] Player 1 ... / [U+3000] Player 2 ...
 * Padding: >=10 teams = single digit 4 spaces / double digit 3 spaces. <10 = always 3 spaces
 * If teams > 18: groups multiple teams per slot to stay within 40-component Discord limit
 * Footer: -# copyright 2026 Night Stars
 */
function buildTeamsListEmbed(tournamentId) {
  const tournament = db.findById('tournaments', tournamentId);
  if (!tournament) return { flags: 32768, components: [{ type: 17, accent_color: 0x2b2d31, components: [{ type: 10, content: 'Tournament not found.' }] }] };

  const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId);
  const teams   = db.get('teams');
  const players = db.get('players');

  const E_CUP     = '<a:cup:1501741159557500971>';
  const E_ARROW   = '<a:arrow:1501741110798585927>';
  const E_SMALL   = '<a:smallarrow:1472222559645863936>';
  const E_CHANNEL = '<a:channelutility:1501741046734786600>';
  const INDENT    = '\u3000';
  const SEP       = { type: 14, divider: true, spacing: 1 };

  const isMCL          = tournament.template === 'MCL';
  const playersPerTeam = isMCL ? 2 : 1;
  const needsPad       = ttRows.length >= 10;

  const enrolledTeams = ttRows.map(tt => ({
    team:    teams.find(t => t.id === tt.team_id) || { name: 'Unknown' },
    players: players.filter(p => p.team_id === tt.team_id),
  }));

  const countLabel = `The **${enrolledTeams.length}** registered teams for **${tournament.template}** **S${tournament.season}**`;

  const MAX_TEAM_SLOTS = 18;
  const groupSize = enrolledTeams.length <= MAX_TEAM_SLOTS ? 1 : Math.ceil(enrolledTeams.length / MAX_TEAM_SLOTS);

  function teamLine(team, tp, i) {
    const num     = String(i + 1);
    const spacing = needsPad ? (num.length === 1 ? '    ' : '   ') : '   ';
    let line = `**${num}${spacing}Team name   ${E_ARROW}   ${team.name}**`;
    if (playersPerTeam === 1) {
      const p = tp[0];
      line += `\n${INDENT} Player   ${E_SMALL}   ${p ? '<@' + p.discord_id + '>' : '\`No player assigned\`'}`;
    } else {
      for (let s = 0; s < playersPerTeam; s++) {
        const p = tp[s];
        line += `\n${INDENT} Player ${s + 1}   ${E_SMALL}   ${p ? '<@' + p.discord_id + '>' : '\`No player assigned\`'}`;
      }
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

  inner.push({ type: 10, content: '-# \u00a9 2026 Night Stars \u2022 All rights reserved' });
  inner.push(SEP);

  return { flags: 32768, components: [{ type: 17, accent_color: 0x2b2d31, components: inner }] };
}

// ─── Admin team database embed ────────────────────────────────────────────────
function buildTeamListEmbed() {
  const teams = db.get("teams").sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });
  const players = db.get("players");

  const categories = { international: [], morocco: [], saudi: [], custom: [] };
  for (const t of teams) {
    const playerCount = players.filter(p => p.team_id === t.id).length;
    const cat = categories[t.category] || categories.custom;
    const playerLine = playerCount > 0 ? `  *(${playerCount}p)*` : "";
    cat.push(`${E.smallarrow} ${t.emoji} **${t.name}** \`${t.short_name}\`${playerLine}`);
  }

  function fieldValue(lines) {
    if (!lines.length) return "`empty`";
    return [" " + lines[0], ...lines.slice(1)].join("\n");
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle("NS eFootball — Team Database")
    .setDescription("All registered teams available in the bot.")
    .setTimestamp();

  if (categories.international.length) {
    const chunks = chunkArray(categories.international, 10);
    chunks.forEach((chunk, i) => {
      embed.addFields({ name: i === 0 ? "International Clubs" : "International (cont.)", value: fieldValue(chunk), inline: false });
    });
  }
  if (categories.morocco.length) embed.addFields({ name: "Moroccan Clubs",  value: fieldValue(categories.morocco), inline: false });
  if (categories.saudi.length)   embed.addFields({ name: "Saudi Clubs",     value: fieldValue(categories.saudi),   inline: false });
  if (categories.custom.length)  embed.addFields({ name: "Custom Teams",    value: fieldValue(categories.custom),  inline: false });

  embed.setFooter({ text: `${teams.length} teams registered` });
  return embed;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function buildTeamManageButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("team_add_predefined").setLabel("Add from List").setStyle(ButtonStyle.Primary).setEmoji("📋"),
    new ButtonBuilder().setCustomId("team_add_custom").setLabel("Add Custom Team").setStyle(ButtonStyle.Secondary).setEmoji("➕"),
    new ButtonBuilder().setCustomId("team_add_player").setLabel("Add Player").setStyle(ButtonStyle.Success).setEmoji("👤"),
    new ButtonBuilder().setCustomId("team_remove").setLabel("Remove Team").setStyle(ButtonStyle.Danger).setEmoji("🗑️"),
  );
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
