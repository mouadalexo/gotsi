const { db } = require('../utils/database');
const { requireManager } = require('../utils/permissions');
const { successEmbed, errorEmbed, warningEmbed, infoEmbed } = require('../utils/embeds');
const {
  buildTournamentListEmbed, buildTournamentButtons, buildTemplateSelectMenu,
  buildTournamentCreateModal, buildTournamentSelectMenu, TEMPLATES,
} = require('../panels/tournamentPanel');
const { buildGroupStandingsEmbed, buildKnockoutBracketEmbed } = require('../panels/standingsPanel');
const { getTargetChannel } = require('../utils/channelRouter');
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../utils/embeds');

async function handleTournamentInteraction(interaction, client) {
  const id = interaction.customId;

  if (id === 'tournament_create') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    return interaction.reply({ content: '🏆 Select a tournament template:', components: [buildTemplateSelectMenu()], ephemeral: true });
  }

  if (id === 'template_select') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    return interaction.showModal(buildTournamentCreateModal(interaction.values[0]));
  }

  if (id.startsWith('tournament_create_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = id.replace('tournament_create_modal_', '');
    const name = interaction.fields.getTextInputValue('tournament_name').trim();
    const teamCount = parseInt(interaction.fields.getTextInputValue('team_count')) || 16;
    const groupSize = parseInt(interaction.fields.getTextInputValue('group_size')) || 4;
    const tmpl = TEMPLATES[template];

    const existing = db.get('tournaments').filter(t => t.template === template);
    const season = existing.length + 1;

    db.insert('tournaments', { name, template, season, type: tmpl?.type || 'solo', team_count: teamCount, group_size: groupSize, status: 'setup', channel_id: interaction.channelId });
    await refreshTournamentListInChannel(interaction);
    return interaction.reply({
      embeds: [successEmbed('Tournament Created',
        `**${tmpl?.emoji || '🏆'} ${name}** (Season ${season}) created!\n\nTemplate: \`${template}\` | Teams: \`${teamCount}\` | Group size: \`${groupSize}\`\n\nUse **Manage** to add teams.`)],
      ephemeral: true,
    });
  }

  if (id === 'tournament_manage') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const menu = buildTournamentSelectMenu('Select a tournament to manage...');
    if (!menu) return interaction.reply({ embeds: [warningEmbed('No Tournaments', 'Create a tournament first.')], ephemeral: true });
    return interaction.reply({ content: '⚙️ Select a tournament:', components: [menu], ephemeral: true });
  }

  if (id === 'tournament_select') {
    const tournamentId = parseInt(interaction.values[0]);
    const t = db.findById('tournaments', tournamentId);
    if (!t) return interaction.update({ content: 'Tournament not found.', components: [] });

    const enrolled = db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId);
    const teamList = enrolled.length
      ? enrolled.map(tt => { const team = db.findById('teams', tt.team_id); return team ? `${team.emoji} ${team.name}` : '?'; }).join('\n')
      : '*No teams added yet*';

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tmt_add_teams_${tournamentId}`).setLabel('Add Teams').setStyle(ButtonStyle.Primary).setEmoji('➕'),
      new ButtonBuilder().setCustomId(`tmt_gen_groups_${tournamentId}`).setLabel('Generate Groups').setStyle(ButtonStyle.Secondary).setEmoji('🎲'),
      new ButtonBuilder().setCustomId(`tmt_gen_matches_${tournamentId}`).setLabel('Generate Matches').setStyle(ButtonStyle.Secondary).setEmoji('📅'),
      new ButtonBuilder().setCustomId(`tmt_start_knockout_${tournamentId}`).setLabel('Start Knockout').setStyle(ButtonStyle.Success).setEmoji('🏆'),
    );

    return interaction.reply({
      embeds: [infoEmbed(`⚙️ ${t.name} (Season ${t.season})`,
        `**Template:** ${t.template} | **Teams:** ${enrolled.length}/${t.team_count} | **Status:** \`${t.status}\`\n\n**Enrolled Teams:**\n${teamList}`)],
      components: [row],
      ephemeral: true,
    });
  }

  if (id.startsWith('tmt_add_teams_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tournamentId = parseInt(id.replace('tmt_add_teams_', ''));
    const enrolledIds = db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId).map(tt => tt.team_id);
    const available = db.get('teams').filter(t => !enrolledIds.includes(t.id)).slice(0, 25);
    if (!available.length) return interaction.reply({ embeds: [warningEmbed('All Teams Added', 'All available teams are already enrolled.')], ephemeral: true });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`tmt_team_select_${tournamentId}`)
        .setPlaceholder('Select teams to add...')
        .setMinValues(1).setMaxValues(Math.min(available.length, 10))
        .addOptions(available.map(t => ({ label: t.name, value: String(t.id), emoji: t.emoji?.slice(0, 2) || '⚽', description: t.short_name })))
    );
    return interaction.reply({ content: '➕ Select teams to add:', components: [row], ephemeral: true });
  }

  if (id.startsWith('tmt_team_select_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tournamentId = parseInt(id.replace('tmt_team_select_', ''));
    for (const tid of interaction.values) {
      const teamId = parseInt(tid);
      const already = db.findOne('tournament_teams', tt => tt.tournament_id === tournamentId && tt.team_id === teamId);
      if (!already) {
        db.insert('tournament_teams', { tournament_id: tournamentId, team_id: teamId, group_name: null, points: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0 });
      }
    }
    const names = interaction.values.map(tid => db.findById('teams', parseInt(tid))?.name).filter(Boolean);
    return interaction.reply({ embeds: [successEmbed('Teams Added', names.map(n => `• ${n}`).join('\n'))], ephemeral: true });
  }

  if (id.startsWith('tmt_gen_groups_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tournamentId = parseInt(id.replace('tmt_gen_groups_', ''));
    const t = db.findById('tournaments', tournamentId);
    const ttEntries = db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId);
    if (!ttEntries.length) return interaction.reply({ embeds: [warningEmbed('No Teams', 'Add teams to the tournament first.')], ephemeral: true });

    const shuffled = [...ttEntries].sort(() => Math.random() - 0.5);
    const groupSize = t.group_size || 4;
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < shuffled.length; i++) {
      db.update('tournament_teams', shuffled[i].id, { group_name: letters[Math.floor(i / groupSize)] });
    }

    const groupEmbed = buildGroupStandingsEmbed(tournamentId);
    // Post to match schedule channel
    const scheduleCh = await getTargetChannel(interaction.guild, t.template, 'matchSchedule');
    if (scheduleCh && groupEmbed) await scheduleCh.send({ embeds: [groupEmbed] });

    return interaction.reply({ embeds: [groupEmbed || successEmbed('Groups Generated', 'Groups drawn!')], ephemeral: false });
  }

  if (id.startsWith('tmt_gen_matches_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tournamentId = parseInt(id.replace('tmt_gen_matches_', ''));
    const t = db.findById('tournaments', tournamentId);
    const ttEntries = db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId);

    const groups = {};
    for (const tt of ttEntries) {
      const g = tt.group_name || 'A';
      if (!groups[g]) groups[g] = [];
      groups[g].push(tt);
    }

    const allMatches = [];
    for (const groupTeams of Object.values(groups)) {
      for (let i = 0; i < groupTeams.length; i++) {
        for (let j = i + 1; j < groupTeams.length; j++) {
          const m = db.insert('matches', {
            tournament_id: tournamentId,
            home_team_id: groupTeams[i].team_id,
            away_team_id: groupTeams[j].team_id,
            stage: 'group', round: 1, leg: 1, status: 'pending',
            home_score: null, away_score: null,
          });
          allMatches.push(m);
        }
      }
    }

    // Post match schedule to the template's schedule channel
    const scheduleCh = await getTargetChannel(interaction.guild, t.template, 'matchSchedule') || interaction.channel;
    await postMatchScheduleEmbed(scheduleCh, t, allMatches);

    return interaction.reply({
      embeds: [successEmbed('Matches Generated', `Generated **${allMatches.length}** fixtures.\nPosted to <#${scheduleCh.id}>`)],
      ephemeral: false,
    });
  }

  if (id.startsWith('tmt_start_knockout_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tournamentId = parseInt(id.replace('tmt_start_knockout_', ''));

    const groupNames = [...new Set(db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId).map(tt => tt.group_name).filter(Boolean))].sort();
    const qualifiers = [];
    for (const g of groupNames) {
      const top2 = db.get('tournament_teams')
        .filter(tt => tt.tournament_id === tournamentId && tt.group_name === g)
        .sort((a, b) => (b.points - a.points) || ((b.goals_for - b.goals_against) - (a.goals_for - a.goals_against)))
        .slice(0, 2)
        .map(tt => tt.team_id);
      qualifiers.push(...top2);
    }

    if (qualifiers.length < 2) return interaction.reply({ embeds: [warningEmbed('Not Enough Teams', 'Need at least 2 qualified teams.')], ephemeral: true });

    const shuffled = [...qualifiers].sort(() => Math.random() - 0.5);
    const numMatches = Math.floor(shuffled.length / 2);
    const round = numMatches;
    const isSF = numMatches === 2;
    const t = db.findById('tournaments', tournamentId);

    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      db.insert('matches', { tournament_id: tournamentId, home_team_id: shuffled[i], away_team_id: shuffled[i + 1], stage: 'knockout', round, leg: 1, status: 'pending', home_score: null, away_score: null });
      if (isSF) {
        db.insert('matches', { tournament_id: tournamentId, home_team_id: shuffled[i + 1], away_team_id: shuffled[i], stage: 'knockout', round, leg: 2, status: 'pending', home_score: null, away_score: null });
      }
    }

    db.update('tournaments', tournamentId, { status: 'active' });

    const bracketEmbed = buildKnockoutBracketEmbed(tournamentId);
    const scheduleCh = await getTargetChannel(interaction.guild, t.template, 'matchSchedule') || interaction.channel;
    if (bracketEmbed) await scheduleCh.send({ embeds: [bracketEmbed] });

    return interaction.reply({
      embeds: [bracketEmbed || successEmbed('Knockout Started', 'Knockout stage generated!')],
      ephemeral: false,
    });
  }

  if (id === 'tournament_bracket') {
    const menu = buildTournamentSelectMenu('Select a tournament to view bracket...', { showFinished: true });
    if (!menu) return interaction.reply({ embeds: [warningEmbed('No Tournaments', 'No active tournaments found.')], ephemeral: true });
    return interaction.reply({ content: '📋 Select a tournament:', components: [menu], ephemeral: true });
  }
}

async function postMatchScheduleEmbed(channel, tournament, matches) {
  const teams = db.get('teams');
  const getTeam = id => teams.find(t => t.id === id) || { name: 'TBD', emoji: '⚽', short_name: '???' };

  const ttEntries = db.get('tournament_teams').filter(tt => tt.tournament_id === tournament.id);
  const groupOfTeam = {};
  for (const tt of ttEntries) groupOfTeam[tt.team_id] = tt.group_name;

  const byGroup = {};
  for (const m of matches) {
    const g = groupOfTeam[m.home_team_id] || 'A';
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(m);
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`📅  ${tournament.name} — Match Schedule`)
    .setDescription(`**${tournament.template}** Group Stage | ${matches.length} fixtures total`)
    .setTimestamp();

  for (const [group, gMatches] of Object.entries(byGroup).sort()) {
    const lines = gMatches.map((m, i) => {
      const home = getTeam(m.home_team_id);
      const away = getTeam(m.away_team_id);
      return `\`${String(i + 1).padStart(2, '0')}\` ${home.emoji} **${home.short_name}** vs **${away.short_name}** ${away.emoji}`;
    });
    embed.addFields({ name: `Group ${group}`, value: lines.join('\n'), inline: true });
  }

  await channel.send({ embeds: [embed] });
}

async function refreshTournamentListInChannel(interaction) {
  try {
    const messages = await interaction.channel.messages.fetch({ limit: 20 });
    const botMsg = messages.find(m =>
      m.author.id === interaction.client.user.id && m.embeds.length > 0 && m.embeds[0].title?.includes('Tournaments')
    );
    if (botMsg) await botMsg.edit({ embeds: [buildTournamentListEmbed()], components: [buildTournamentButtons()] });
  } catch (_) {}
}

function noPermission(interaction) {
  return interaction.reply({ embeds: [warningEmbed('No Permission', 'Only managers can do this.')], ephemeral: true });
}

module.exports = { handleTournamentInteraction };
