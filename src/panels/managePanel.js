'use strict';
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db } = require('../utils/database');
const { COLORS, E } = require('../utils/embeds');

function getActiveTournament(template) {
  return db.get('tournaments')
    .filter(t => (!template || t.template === template) && t.status !== 'finished')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

function buildManagePanelEmbed(template) {
  const t = getActiveTournament(template);
  const total = db.get('tournaments').filter(x => !template || x.template === template).length;

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${E.cup}  NS eFootball — Manager Panel`)
    .setTimestamp();

  if (!t) {
    embed.setDescription(
      `**No active season.**\nStart a new season with the button below.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 Past seasons: **${total}**`
    );
  } else {
    const enrolled = db.get('tournament_teams').filter(tt => tt.tournament_id === t.id);
    const pending  = db.get('matches').filter(m => m.tournament_id === t.id && m.status === 'pending');
    const played   = db.get('matches').filter(m => m.tournament_id === t.id && m.status === 'played');
    const statusEmoji = { setup: '⚙️', active: '🟢', finished: '🔒' }[t.status] || '⚙️';

    embed.setDescription(
      `${statusEmoji} **${t.name}** — Season ${t.season}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📋 Template: \`${t.template}\`  |  👥 Teams: **${enrolled.length}/${t.team_count}**\n` +
      `⏱️ Deadline: **${t.round_deadline_hours ? t.round_deadline_hours + 'h per round' : 'not set'}**\n` +
      `📊 Matches: **${played.length}** played  ·  **${pending.length}** pending\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  embed.setFooter({ text: 'Managers only  •  All actions are immediate' });
  return embed;
}

function buildManagePanelRows(template) {
  const tmpl = template || 'ALL';
  const t = getActiveTournament(template);
  const has = !!t;

  return [
    // Row 1 — Tournament lifecycle
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mgr_new_season_${tmpl}`).setLabel('New Season').setStyle(ButtonStyle.Primary).setEmoji('🆕'),
      new ButtonBuilder().setCustomId(`mgr_search_teams_${tmpl}`).setLabel('Register Teams').setStyle(ButtonStyle.Secondary).setEmoji('🔍').setDisabled(!has),
      new ButtonBuilder().setCustomId(`mgr_add_player_${tmpl}`).setLabel('Add Player').setStyle(ButtonStyle.Secondary).setEmoji('👤').setDisabled(!has),
      new ButtonBuilder().setCustomId(`mgr_close_season_${tmpl}`).setLabel('Close Season').setStyle(ButtonStyle.Danger).setEmoji('🔒').setDisabled(!has),
    ),
    // Row 2 — Group/Match setup
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mgr_gen_groups_${tmpl}`).setLabel('Draw Groups').setStyle(ButtonStyle.Secondary).setEmoji('🎲').setDisabled(!has),
      new ButtonBuilder().setCustomId(`mgr_gen_matches_${tmpl}`).setLabel('Gen Matches').setStyle(ButtonStyle.Secondary).setEmoji('📅').setDisabled(!has),
      new ButtonBuilder().setCustomId(`mgr_post_schedule_${tmpl}`).setLabel('Post Schedule').setStyle(ButtonStyle.Success).setEmoji('📤').setDisabled(!has),
      new ButtonBuilder().setCustomId(`mgr_auto_schedule_${tmpl}`).setLabel('Auto-Schedule').setStyle(ButtonStyle.Secondary).setEmoji('⏰').setDisabled(!has),
    ),
    // Row 3 — Results & knockout
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mgr_add_result_${tmpl}`).setLabel('Add Result').setStyle(ButtonStyle.Success).setEmoji('📊').setDisabled(!has),
      new ButtonBuilder().setCustomId(`mgr_knockout_${tmpl}`).setLabel('Start Knockout').setStyle(ButtonStyle.Primary).setEmoji('🏆').setDisabled(!has),
      new ButtonBuilder().setCustomId(`mgr_view_bracket_${tmpl}`).setLabel('View Bracket').setStyle(ButtonStyle.Secondary).setEmoji('📋').setDisabled(!has),
    ),
  ];
}

function buildNewSeasonModal(template) {
  return new ModalBuilder()
    .setCustomId(`mgr_create_modal_${template}`)
    .setTitle(`New ${template} Season`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('tournament_name').setLabel('Tournament Name')
          .setStyle(TextInputStyle.Short).setPlaceholder(`e.g. ${template} Season 8`).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('team_count').setLabel('Number of Teams (8 / 16 / 32)')
          .setStyle(TextInputStyle.Short).setPlaceholder('16').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('group_size').setLabel('Teams per Group (4 recommended)')
          .setStyle(TextInputStyle.Short).setPlaceholder('4').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('deadline_hours').setLabel('Round Deadline in hours (e.g. 48 — optional)')
          .setStyle(TextInputStyle.Short).setPlaceholder('48').setRequired(false)
      ),
    );
}

function buildTeamSearchModal(tournamentId) {
  return new ModalBuilder()
    .setCustomId(`mgr_team_search_modal_${tournamentId}`)
    .setTitle('Search & Register Team')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('search_query').setLabel('Team name (or part of it)')
          .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Real, Bayern, Man City, Wydad...').setRequired(true)
      ),
    );
}

function buildPlayerSearchModal(tournamentId) {
  return new ModalBuilder()
    .setCustomId(`mgr_player_search_modal_${tournamentId}`)
    .setTitle('Search Player')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('member_query').setLabel('Type first letters of username')
          .setStyle(TextInputStyle.Short).setPlaceholder('e.g. john, xX, star...').setRequired(true)
      ),
    );
}

function buildAutoScheduleModal(tournamentId) {
  return new ModalBuilder()
    .setCustomId(`mgr_auto_schedule_modal_${tournamentId}`)
    .setTitle('Auto-Post Schedule')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('delay_hours').setLabel('Post schedule in how many hours from now?')
          .setStyle(TextInputStyle.Short).setPlaceholder('e.g. 24').setRequired(true)
      ),
    );
}

module.exports = {
  getActiveTournament,
  buildManagePanelEmbed,
  buildManagePanelRows,
  buildNewSeasonModal,
  buildTeamSearchModal,
  buildPlayerSearchModal,
  buildAutoScheduleModal,
};
