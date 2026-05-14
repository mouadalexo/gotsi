const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db } = require('../utils/database');
const { COLORS, E } = require('../utils/embeds');

function buildPendingMatchesSelect(tournamentId) {
  const matches = db.get('matches').filter(m => m.tournament_id === tournamentId && m.status === 'pending');
  if (!matches.length) return null;

  const teams   = db.get('teams');
  const getTeam = id => teams.find(t => t.id === id) || { name: 'Unknown' };

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`match_select_${tournamentId}`)
      .setPlaceholder('Select a match to add result...')
      .addOptions(matches.slice(0, 25).map(m => {
        const home = getTeam(m.home_team_id);
        const away = getTeam(m.away_team_id);
        return {
          label: `${home.name} vs ${away.name}`,
          value: String(m.id),
          description: `${m.stage} · Round ${m.round}`,
        };
      }))
  );
}

function buildResultModal(matchId) {
  return new ModalBuilder()
    .setCustomId(`result_modal_${matchId}`)
    .setTitle('Enter Match Result')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('home_score').setLabel('Home Team Score').setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('away_score').setLabel('Away Team Score').setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true)
      ),
    );
}

function buildAllResultsEmbed(tournamentId) {
  const tournament = db.findById('tournaments', tournamentId);
  if (!tournament) return null;

  const matches = db.get('matches').filter(m => m.tournament_id === tournamentId && m.stage === 'group' && m.status === 'played');
  const teams   = db.get('teams');
  const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId);
  const getTeam = id => teams.find(t => t.id === id) || { name: 'Unknown' };
  const getGrp  = id => ttRows.find(tt => tt.team_id === id)?.group_name || '?';

  if (!matches.length) {
    return new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`${E.cup}  ${tournament.name}  —  Results`)
      .setDescription('No results recorded yet.')
      .setTimestamp();
  }

  const groups = {};
  for (const m of matches) {
    const g = getGrp(m.home_team_id);
    if (!groups[g]) groups[g] = [];
    groups[g].push(m);
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${E.cup}  ${tournament.name}  —  All Results`)
    .setTimestamp();

  for (const [g, gMatches] of Object.entries(groups).sort()) {
    const lines = gMatches.map(m => {
      const home    = getTeam(m.home_team_id);
      const away    = getTeam(m.away_team_id);
      const homeWon = m.home_score > m.away_score;
      const awayWon = m.away_score > m.home_score;
      const draw    = m.home_score === m.away_score;
      const icon    = draw ? '🤝' : E.fire;

      const homeStr = homeWon ? `${E.crown} **${home.name}**` : `**${home.name}**`;
      const awayStr = awayWon ? `**${away.name}** ${E.crown}` : `**${away.name}**`;
      return `${icon}  ${homeStr}  \`${m.home_score} — ${m.away_score}\`  ${awayStr}`;
    });
    embed.addFields({
      name: `${E.hashtag}  GROUP ${g}`,
      value: lines.join('\n'),
      inline: false,
    });
  }

  return embed;
}

module.exports = { buildPendingMatchesSelect, buildResultModal, buildAllResultsEmbed };
