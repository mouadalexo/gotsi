const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db } = require('../utils/database');
const { COLORS } = require('../utils/embeds');

const TEMPLATES = {
  EL:   { name: 'EL',   description: 'Solo | Group Stage + Knockout | Finals Home & Away', type: 'solo',   emoji: '🏆' },
  MCL:    { name: 'MCL',    description: 'Duo | Group Stage + Knockout | Finals Home & Away',  type: 'duo',    emoji: '⚡' },
  NSLIGA: { name: 'NSLIGA', description: 'Official league system (expandable)',                 type: 'league', emoji: '🥇' },
  NSF:    { name: 'NSF',    description: 'Official cup system (expandable)',                    type: 'cup',    emoji: '🏅' },
};

function buildTournamentListEmbed() {
  const tournaments = db.get('tournaments').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('🏆  NS eFootball — Tournaments')
    .setTimestamp();

  if (!tournaments.length) {
    embed.setDescription('No tournaments yet. Create one using the button below!');
  } else {
    const lines = tournaments.map(t => {
      const tmpl = TEMPLATES[t.template] || {};
      const statusEmoji = { setup: '⚙️', active: '🟢', finished: '🔴' }[t.status] || '⚙️';
      return `${tmpl.emoji || '🏆'} **${t.name}** — Season ${t.season} ${statusEmoji} \`${t.status}\` | ${t.team_count} teams`;
    });
    embed.setDescription(lines.join('\n'));
  }

  embed.setFooter({ text: `${tournaments.length} tournament(s) registered` });
  return embed;
}

function buildTournamentButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tournament_create').setLabel('Create Tournament').setStyle(ButtonStyle.Primary).setEmoji('➕'),
    new ButtonBuilder().setCustomId('tournament_manage').setLabel('Manage').setStyle(ButtonStyle.Secondary).setEmoji('⚙️'),
    new ButtonBuilder().setCustomId('tournament_results').setLabel('Add Result').setStyle(ButtonStyle.Success).setEmoji('📊'),
    new ButtonBuilder().setCustomId('tournament_bracket').setLabel('View Bracket').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
  );
}

function buildTemplateSelectMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('template_select')
      .setPlaceholder('Choose a tournament template...')
      .addOptions(Object.values(TEMPLATES).map(t => ({
        label: t.name,
        value: t.name,
        emoji: t.emoji,
        description: t.description,
      })))
  );
}

// showFinished: pass true to include finished tournaments (e.g. bracket viewer)
function buildTournamentSelectMenu(placeholder = 'Select a tournament...', customId = 'tournament_select', { showFinished = false } = {}) {
  const tournaments = db.get('tournaments')
    .filter(t => showFinished || t.status !== 'finished')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 25);
  if (!tournaments.length) return null;
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(tournaments.map(t => ({
        label: `${t.name} — Season ${t.season}`,
        value: String(t.id),
        description: `${t.template} | ${t.team_count} teams | ${t.status}`,
      })))
  );
}

function buildTournamentCreateModal(template) {
  return new ModalBuilder()
    .setCustomId(`tournament_create_modal_${template}`)
    .setTitle(`Create ${template} Tournament`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('tournament_name').setLabel('Tournament Name').setStyle(TextInputStyle.Short).setPlaceholder(`e.g. ${template} Season 1`).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('team_count').setLabel('Number of Teams (8/16/32/64)').setStyle(TextInputStyle.Short).setPlaceholder('16').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('group_size').setLabel('Teams per Group').setStyle(TextInputStyle.Short).setPlaceholder('4').setRequired(true)
      ),
    );
}

module.exports = {
  buildTournamentListEmbed, buildTournamentButtons, buildTemplateSelectMenu,
  buildTournamentSelectMenu, buildTournamentCreateModal, TEMPLATES
};
