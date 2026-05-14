'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { db } = require('../utils/database');
const { E } = require('../utils/embeds');
const { getTargetChannel } = require('../utils/channelRouter');

const ACCENT_COLOR = 2829617;
const FSPACE = '\u2007'; // figure space — same width as a digit

// Pad number so single-digit entries align with multi-digit ones
function paddedNum(n, total) {
  const maxLen = String(total).length;
  const s = String(n);
  return s + FSPACE.repeat(maxLen - s.length);
}

// Player line indent = same visual width as the padded number + '   ' gap
function playerIndent(total) {
  return FSPACE.repeat(String(total).length) + '   ';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seasonlist')
    .setDescription('Post the season team list')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName('template')
        .setDescription('Tournament template')
        .setRequired(false)
        .addChoices(
          { name: 'MCL', value: 'MCL' },
          { name: 'NSEL', value: 'NSEL' },
        )
    )
    .addIntegerOption(opt =>
      opt.setName('tournament_id')
        .setDescription('Specific tournament ID (optional — defaults to latest active)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      let tournament;
      const tid        = interaction.options.getInteger('tournament_id');
      const tmplFilter = interaction.options.getString('template');

      if (tid) tournament = db.findById('tournaments', tid);
      if (!tournament) {
        tournament = db.get('tournaments')
          .filter(t => t.status !== 'finished')
          .filter(t => !tmplFilter || t.template === tmplFilter)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      }
      if (!tournament) {
        return interaction.editReply({ content: '❌ No active tournament found. Create one first.' });
      }

      const teams     = db.get('teams');
      const players   = db.get('players');
      const ttEntries = db.get('tournament_teams').filter(tt => tt.tournament_id === tournament.id);

      if (!ttEntries.length) {
        return interaction.editReply({ content: '❌ No teams enrolled in this tournament yet.' });
      }

      const enrolledTeams = [];
      for (const tt of ttEntries) {
        const team = teams.find(t => t.id === tt.team_id);
        if (!team) continue;
        const teamPlayers = players.filter(p => p.team_id === tt.team_id);
        enrolledTeams.push({ team, players: teamPlayers });
      }

      const isDuo    = tournament.type === 'duo' || tournament.template === 'MCL';
      const total    = enrolledTeams.length;
      const indent   = playerIndent(total);
      const targetCh = await getTargetChannel(interaction.guild, tournament.template, 'teamList') || interaction.channel;

      const DIVIDER = { type: 14, spacing: 1, divider: true };
      const innerComponents = [];

      // Header
      const typeLabel = isDuo ? 'teams' : 'players';
      innerComponents.push({
        type: 10,
        content: `# ${E.cup}  ${tournament.template}  —  Team List\n${E.channel}  The **${total}** registered ${typeLabel} for **Season ${tournament.season}** of the **${tournament.template}**`,
      });

      for (let i = 0; i < enrolledTeams.length; i++) {
        const { team, players: tp } = enrolledTeams[i];
        innerComponents.push(DIVIDER);

        const lines = [
          `**${paddedNum(i + 1, total)}   Team name   ${E.arrow}   ${team.name}**`,
        ];

        if (isDuo) {
          // MCL — 2 players, labelled "Player 1" and "Player 2"
          const p1 = tp[0];
          const p2 = tp[1];
          lines.push(`${indent}Player 1   ${E.smallarrow}   ${p1 ? `<@${p1.discord_id}>` : '*No player assigned*'}`);
          lines.push(`${indent}Player 2   ${E.smallarrow}   ${p2 ? `<@${p2.discord_id}>` : '*No player assigned*'}`);
        } else {
          // NSEL — 1 player, labelled just "Player"
          const p1 = tp[0];
          lines.push(`${indent}Player   ${E.smallarrow}   ${p1 ? `<@${p1.discord_id}>` : '*No player assigned*'}`);
        }

        innerComponents.push({ type: 10, content: lines.join('\n') });
      }

      // Footer
      innerComponents.push(DIVIDER);
      innerComponents.push({
        type: 10,
        content: `-# © ${new Date().getFullYear()} Night Stars • All rights reserved`,
      });

      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
      await rest.post(`/channels/${targetCh.id}/messages`, {
        body: {
          components: [{ type: 17, accent_color: ACCENT_COLOR, spoiler: false, components: innerComponents }],
          flags: 32768,
        },
      });

      await interaction.editReply({
        content: `✅ Season list posted to <#${targetCh.id}> — **${total} ${typeLabel}**.`,
      });

    } catch (err) {
      console.error('[SEASONLIST ERROR]', err);
      await interaction.editReply({ content: `❌ Error: ${err.message}` });
    }
  },
};
