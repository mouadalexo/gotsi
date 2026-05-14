const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { db } = require('../utils/database');
const { COLORS } = require('../utils/embeds');
const { getTargetChannel } = require('../utils/channelRouter');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deadline')
    .setDescription('Post the match submission deadline report — who submitted vs who did not')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName('tournament')
        .setDescription('Tournament ID or leave empty to use the latest active one')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    try {
      // Resolve tournament
      let tournament;
      const tIdInput = interaction.options.getString('tournament');
      if (tIdInput) {
        tournament = db.findById('tournaments', parseInt(tIdInput)) ||
          db.findOne('tournaments', t => t.name.toLowerCase().includes(tIdInput.toLowerCase()));
      }
      if (!tournament) {
        // Latest active
        tournament = db.get('tournaments')
          .filter(t => t.status === 'active' || t.status === 'setup')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      }
      if (!tournament) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLORS.warning).setTitle('⚠️ No Tournament Found').setDescription('No active tournaments found. Create one first.')]
        });
      }

      const teams = db.get('teams');
      const players = db.get('players');
      const ttEntries = db.get('tournament_teams').filter(tt => tt.tournament_id === tournament.id);

      if (!ttEntries.length) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLORS.warning).setTitle('⚠️ No Teams').setDescription('No teams enrolled in this tournament yet.')]
        });
      }

      const submitted = [];   // teams WITH at least one player assigned
      const missing = [];     // teams with NO player assigned

      for (const tt of ttEntries) {
        const team = teams.find(t => t.id === tt.team_id);
        if (!team) continue;
        const teamPlayers = players.filter(p => p.team_id === tt.team_id);
        if (teamPlayers.length > 0) {
          submitted.push({ team, players: teamPlayers });
        } else {
          missing.push({ team });
        }
      }

      const embed = new EmbedBuilder()
        .setColor(COLORS.gold)
        .setTitle(`⏰  Match Submission Deadline — ${tournament.name}`)
        .setDescription(
          `**${submitted.length}** teams submitted  ·  **${missing.length}** teams missing\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        )
        .setTimestamp();

      // Submitted teams
      if (submitted.length > 0) {
        const lines = submitted.map(({ team, players: tp }) => {
          const playerNames = tp.map(p => `<@${p.discord_id}>`).join(', ');
          return `✅ ${team.emoji || '⚽'} **${team.name}** — ${playerNames}`;
        });
        // Split into chunks of 10 to avoid field value limits
        for (let i = 0; i < lines.length; i += 10) {
          embed.addFields({
            name: i === 0 ? `✅  Submitted (${submitted.length})` : '✅  Submitted (cont.)',
            value: lines.slice(i, i + 10).join('\n'),
            inline: false,
          });
        }
      }

      // Missing teams
      if (missing.length > 0) {
        const lines = missing.map(({ team }) =>
          `❌ ${team.emoji || '⚽'} **${team.name}** \`${team.short_name}\``
        );
        for (let i = 0; i < lines.length; i += 10) {
          embed.addFields({
            name: i === 0 ? `❌  Did NOT Submit (${missing.length})` : '❌  Missing (cont.)',
            value: lines.slice(i, i + 10).join('\n'),
            inline: false,
          });
        }
      }

      embed.setFooter({ text: `${tournament.template}  •  Season ${tournament.season}  •  Deadline Report` });

      // Also post to the results channel if configured
      const resultsCh = await getTargetChannel(interaction.guild, tournament.template, 'results');
      if (resultsCh && resultsCh.id !== interaction.channelId) {
        await resultsCh.send({ embeds: [embed] });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[DEADLINE ERROR]', err);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(COLORS.error).setTitle('❌ Error').setDescription(err.message)]
      });
    }
  },
};
