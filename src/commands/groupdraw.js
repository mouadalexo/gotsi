const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../utils/database');
const { getTargetChannel } = require('../utils/channelRouter');
const { generateGroupDrawImage } = require('../utils/imageGen');
const { AttachmentBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('groupdraw')
    .setDescription('Post the group draw announcement image')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName('template')
        .setDescription('Tournament template')
        .setRequired(false)
        .addChoices(
          { name: 'MCL',  value: 'MCL'  },
          { name: 'NSEL', value: 'NSEL' },
        )
    )
    .addIntegerOption(opt =>
      opt.setName('tournament_id')
        .setDescription('Specific tournament ID (optional)')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // ── Resolve tournament ───────────────────────────────────────────────────
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
        return interaction.editReply({ content: '❌ No active tournament found.' });
      }

      // ── Build groupedTeams ───────────────────────────────────────────────────
      const teams     = db.get('teams');
      const ttEntries = db.get('tournament_teams').filter(tt => tt.tournament_id === tournament.id);

      if (!ttEntries.length) {
        return interaction.editReply({ content: '❌ No teams enrolled in this tournament yet.' });
      }

      const groupedTeams = {};
      for (const tt of ttEntries) {
        const team = teams.find(t => t.id === tt.team_id);
        if (!team) continue;
        const g = tt.group_name || 'A';
        if (!groupedTeams[g]) groupedTeams[g] = [];
        groupedTeams[g].push(team);
      }

      // ── Generate & post image ────────────────────────────────────────────────
      const buf       = generateGroupDrawImage(tournament, groupedTeams);
      const targetCh  = await getTargetChannel(interaction.guild, tournament.template, 'groupDraw')
                     || await getTargetChannel(interaction.guild, tournament.template, 'matchSchedule')
                     || interaction.channel;

      await targetCh.send({
        files: [new AttachmentBuilder(buf, { name: 'group_draw.png' })],
      });

      await interaction.editReply({
        content: `✅ Group draw posted to <#${targetCh.id}> — **${Object.keys(groupedTeams).length} groups**.`,
      });

    } catch (err) {
      console.error('[GROUPDRAW ERROR]', err);
      await interaction.editReply({ content: `❌ Error: ${err.message}` });
    }
  },
};
