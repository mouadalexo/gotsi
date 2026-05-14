const { db } = require('../utils/database');
const { requireManager } = require('../utils/permissions');
const { successEmbed, errorEmbed, warningEmbed } = require('../utils/embeds');
const {
  buildTeamListEmbed, buildTeamManageButtons, buildTeamSelectMenu,
  buildAddPlayerModal, buildCustomTeamModal,
} = require('../panels/teamListPanel');
const { DEFAULT_TEAMS } = require('../data/seed');
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

async function handleTeamInteraction(interaction, client) {
  const id = interaction.customId;

  if (id === 'team_add_predefined') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const existing = db.get('teams').map(t => t.name);
    const available = DEFAULT_TEAMS.filter(t => !existing.includes(t.name));
    if (!available.length) return interaction.reply({ embeds: [warningEmbed('All Teams Added', 'All predefined teams are already in the database.')], ephemeral: true });
    const options = available.slice(0, 25).map(t => ({
      label: t.name, value: t.name, emoji: t.emoji?.slice(0, 2) || '⚽', description: `${t.short_name} | ${t.category}`,
    }));
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('team_predefined_select').setPlaceholder('Select teams to add...')
        .setMinValues(1).setMaxValues(Math.min(options.length, 10)).addOptions(options)
    );
    return interaction.reply({ content: '📋 Select teams to add:', components: [row], ephemeral: true });
  }

  if (id === 'team_predefined_select') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    for (const name of interaction.values) {
      const t = DEFAULT_TEAMS.find(t => t.name === name);
      if (t && !db.findOne('teams', r => r.name === t.name)) db.insert('teams', t);
    }
    await refreshTeamListInChannel(interaction);
    return interaction.reply({ embeds: [successEmbed('Teams Added', `Added: ${interaction.values.join(', ')}`)], ephemeral: true });
  }

  if (id === 'team_add_custom') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    return interaction.showModal(buildCustomTeamModal());
  }

  if (id === 'custom_team_modal') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const name = interaction.fields.getTextInputValue('team_name').trim();
    const short = interaction.fields.getTextInputValue('team_short').trim().toUpperCase();
    const emoji = interaction.fields.getTextInputValue('team_emoji').trim() || '⚽';
    if (db.findOne('teams', t => t.name === name)) {
      return interaction.reply({ embeds: [errorEmbed('Already Exists', `Team "${name}" already exists.`)], ephemeral: true });
    }
    db.insert('teams', { name, short_name: short, emoji, category: 'custom' });
    await refreshTeamListInChannel(interaction);
    return interaction.reply({ embeds: [successEmbed('Team Added', `**${emoji} ${name}** (\`${short}\`) has been added.`)], ephemeral: true });
  }

  if (id === 'team_add_player') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const menu = buildTeamSelectMenu('Select a team to add player to...');
    if (!menu) return interaction.reply({ embeds: [warningEmbed('No Teams', 'Add teams first.')], ephemeral: true });
    return interaction.reply({ content: '👤 Select a team:', components: [menu], ephemeral: true });
  }

  if (id === 'team_select') {
    const teamId = parseInt(interaction.values[0]);
    return interaction.showModal(buildAddPlayerModal(teamId));
  }

  if (id.startsWith('player_add_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const teamId = parseInt(id.replace('player_add_modal_', ''));
    let rawInput = interaction.fields.getTextInputValue('player_discord_id').trim();
    const mentionMatch = rawInput.match(/^<@!?(\d+)>$/);
    const discordId = mentionMatch ? mentionMatch[1] : rawInput;
    const team = db.findById('teams', teamId);
    if (!team) return interaction.reply({ embeds: [errorEmbed('Team Not Found', 'The selected team does not exist.')], ephemeral: true });

    let username = discordId;
    try { const member = await interaction.guild.members.fetch(discordId); username = member.user.username; } catch (_) {}

    const existing = db.findOne('players', p => p.discord_id === discordId);
    if (existing) {
      db.update('players', existing.id, { team_id: teamId, discord_username: username });
    } else {
      db.insert('players', { team_id: teamId, discord_id: discordId, discord_username: username });
    }
    await refreshTeamListInChannel(interaction);
    return interaction.reply({ embeds: [successEmbed('Player Added', `<@${discordId}> has been added to **${team.emoji} ${team.name}**.`)], ephemeral: true });
  }

  if (id === 'team_remove') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const teams = db.get('teams').sort((a, b) => a.name.localeCompare(b.name)).slice(0, 25);
    if (!teams.length) return interaction.reply({ embeds: [warningEmbed('No Teams', 'No teams to remove.')], ephemeral: true });
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('team_remove_select').setPlaceholder('Select team to remove...')
        .addOptions(teams.map(t => ({ label: t.name, value: String(t.id), emoji: t.emoji?.slice(0, 2) || '⚽' })))
    );
    return interaction.reply({ content: '🗑️ Select a team to remove:', components: [row], ephemeral: true });
  }

  if (id === 'team_remove_select') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const teamId = parseInt(interaction.values[0]);
    const team = db.findById('teams', teamId);
    if (!team) return interaction.reply({ embeds: [errorEmbed('Not Found', 'Team not found.')], ephemeral: true });
    db.delete('teams', teamId);
    db.deleteWhere('players', p => p.team_id === teamId);
    await refreshTeamListInChannel(interaction);
    return interaction.reply({ embeds: [successEmbed('Team Removed', `**${team.name}** has been removed.`)], ephemeral: true });
  }
}

async function refreshTeamListInChannel(interaction) {
  try {
    const messages = await interaction.channel.messages.fetch({ limit: 20 });
    const botMsg = messages.find(m =>
      m.author.id === interaction.client.user.id &&
      m.embeds.length > 0 &&
      m.embeds[0].title?.includes('Team Database')
    );
    if (botMsg) await botMsg.edit({ embeds: [buildTeamListEmbed()], components: [buildTeamManageButtons()] });
  } catch (_) {}
}

function noPermission(interaction) {
  return interaction.reply({ embeds: [warningEmbed('No Permission', 'Only managers can do this.')], ephemeral: true });
}

module.exports = { handleTeamInteraction };
