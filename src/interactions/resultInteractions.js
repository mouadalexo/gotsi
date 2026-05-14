'use strict';
const { db } = require('../utils/database');
const { requireManager } = require('../utils/permissions');
const { successEmbed, errorEmbed, warningEmbed, E } = require('../utils/embeds');
const { buildPendingMatchesSelect, buildResultModal, buildAllResultsEmbed } = require('../panels/resultsPanel');
const { buildTournamentSelectMenu } = require('../panels/tournamentPanel');
const { getTargetChannel } = require('../utils/channelRouter');
const { postResultAndNextRound } = require('./manageInteractions');
const { makeResultEmbed } = require('../utils/tournamentEmbeds');

async function handleResultInteraction(interaction, client) {
  const id = interaction.customId;

  // ── View All Results button ────────────────────────────────────────────────
  if (id.startsWith('view_results_')) {
    const tournamentId = parseInt(id.replace('view_results_', ''));
    const embed = buildAllResultsEmbed(tournamentId);
    if (!embed) return interaction.reply({ embeds: [warningEmbed('No Results', 'No results recorded yet.')], ephemeral: true });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── Select tournament to add result (old panel path) ───────────────────────
  if (id === 'tournament_results') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const menu = buildTournamentSelectMenu('Select a tournament to add result...', 'result_tournament_select');
    if (!menu) return interaction.reply({ embeds: [warningEmbed('No Tournaments', 'No active tournaments found.')], ephemeral: true });
    return interaction.reply({ content: `${E.cup}  Select a tournament:`, components: [menu], ephemeral: true });
  }

  if (id === 'result_tournament_select') {
    const tournamentId = parseInt(interaction.values[0]);
    const matchMenu = buildPendingMatchesSelect(tournamentId);
    if (!matchMenu) return interaction.update({ content: '✅  No pending matches in this tournament.', components: [] });
    return interaction.update({ content: `${E.arrow}  Select a match:`, components: [matchMenu] });
  }

  if (id.startsWith('match_select_')) {
    const matchId = parseInt(interaction.values[0]);
    return interaction.showModal(buildResultModal(matchId));
  }

  // ── Submit result modal ────────────────────────────────────────────────────
  if (id.startsWith('result_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);

    const matchId   = parseInt(id.replace('result_modal_', ''));
    const homeScore = parseInt(interaction.fields.getTextInputValue('home_score'));
    const awayScore = parseInt(interaction.fields.getTextInputValue('away_score'));

    if (isNaN(homeScore) || isNaN(awayScore)) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Score', 'Scores must be numbers.')], ephemeral: true });
    }

    const match = db.findById('matches', matchId);
    if (!match) return interaction.reply({ embeds: [errorEmbed('Not Found', 'Match not found.')], ephemeral: true });

    const tournament = db.findById('tournaments', match.tournament_id);
    const teams      = db.get('teams');
    const homeTeam   = teams.find(t => t.id === match.home_team_id) || { name: 'Home', short_name: 'HOM' };
    const awayTeam   = teams.find(t => t.id === match.away_team_id) || { name: 'Away', short_name: 'AWY' };

    // Save result
    db.update('matches', matchId, {
      home_score: homeScore,
      away_score: awayScore,
      status: 'played',
      played_at: new Date().toISOString(),
    });

    // Update group standings
    if (match.stage === 'group') {
      const homeWon = homeScore > awayScore;
      const awayWon = awayScore > homeScore;
      const draw    = homeScore === awayScore;

      for (const [teamId, scored, conceded, won, lost] of [
        [match.home_team_id, homeScore, awayScore, homeWon, awayWon],
        [match.away_team_id, awayScore, homeScore, awayWon, homeWon],
      ]) {
        const tt = db.findOne('tournament_teams', r => r.tournament_id === match.tournament_id && r.team_id === teamId);
        if (tt) db.update('tournament_teams', tt.id, {
          goals_for:     (tt.goals_for     || 0) + scored,
          goals_against: (tt.goals_against || 0) + conceded,
          wins:          (tt.wins          || 0) + (won  ? 1 : 0),
          draws:         (tt.draws         || 0) + (draw ? 1 : 0),
          losses:        (tt.losses        || 0) + (lost ? 1 : 0),
          points:        (tt.points        || 0) + (won ? 3 : draw ? 1 : 0),
        });
      }
    }

    // Re-fetch match with updated scores
    const updatedMatch = db.findById('matches', matchId);

    // Post result embed to results channel
    const resultsCh = await getTargetChannel(interaction.guild, tournament.template, 'results');
    if (resultsCh) {
      try {
        const ttEntry = db.findOne('tournament_teams', tt => tt.tournament_id === match.tournament_id && tt.team_id === match.home_team_id);
        const grpName = ttEntry?.group_name || '?';
        const resEmbed = makeResultEmbed(homeTeam.name, homeScore, awayTeam.name, awayScore, grpName, 'Round ' + updatedMatch.round, tournament.name);
        await resultsCh.send({ embeds: [resEmbed] });
      } catch (e) { console.error('[ResultEmbed]', e.message); }
    }

    // Post standings + next round schedule (non-blocking)
    postResultAndNextRound(interaction.guild, updatedMatch, tournament, homeTeam, awayTeam, client)
      .catch(e => console.error('[PostResultAndNextRound]', e.message));

    const resultLabel = homeScore > awayScore
      ? `${E.fire} **${homeTeam.name}  ${homeScore} — ${awayScore}  ${awayTeam.name}**`
      : awayScore > homeScore
      ? `${E.fire} **${homeTeam.name}  ${homeScore} — ${awayScore}  ${awayTeam.name}**`
      : `🤝 **${homeTeam.name}  ${homeScore} — ${awayScore}  ${awayTeam.name}** *(Draw)*`;

    return interaction.reply({
      embeds: [successEmbed('Result Recorded',
        `${resultLabel}\n\nResult embed + standings posted to results channel.`
      )],
      ephemeral: true,
    });
  }
}

function noPermission(interaction) {
  return interaction.reply({ embeds: [warningEmbed('No Permission', 'Only managers can add results.')], ephemeral: true });
}

module.exports = { handleResultInteraction };
