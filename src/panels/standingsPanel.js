'use strict';
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { makeStandingsPost, makeBracketPost } = require('../utils/tournamentEmbeds');

function buildGroupStandingsEmbed(tournamentId) {
  return makeStandingsPost(tournamentId);
}

function buildStandingsRow(tournamentId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`view_results_${tournamentId}`)
      .setLabel('View All Results')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: '1501741159557500971', name: 'cup', animated: true }),
  );
}

function buildKnockoutBracketEmbed(tournamentId) {
  return makeBracketPost(tournamentId);
}

module.exports = { buildGroupStandingsEmbed, buildStandingsRow, buildKnockoutBracketEmbed };
