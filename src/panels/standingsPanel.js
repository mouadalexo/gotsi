const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('../utils/database');
const { COLORS, E } = require('../utils/embeds');

function buildGroupStandingsEmbed(tournamentId) {
  const tournament = db.findById('tournaments', tournamentId);
  if (!tournament) return null;

  const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId);
  const teams  = db.get('teams');

  const rows = ttRows.map(tt => ({
    ...tt,
    ...teams.find(t => t.id === tt.team_id),
  }));

  const groups = {};
  for (const r of rows) {
    const g = r.group_name || 'A';
    if (!groups[g]) groups[g] = [];
    groups[g].push(r);
  }

  for (const g of Object.keys(groups)) {
    groups[g].sort((a, b) => {
      const pd = (b.points || 0) - (a.points || 0);
      if (pd !== 0) return pd;
      const gdA = (a.goals_for || 0) - (a.goals_against || 0);
      const gdB = (b.goals_for || 0) - (b.goals_against || 0);
      return gdB - gdA;
    });
  }

  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${E.cup}  ${tournament.name}  —  Group Standings`)
    .setDescription(
      `${E.yeaaaah}  **Top 2 from each group advance to Knockout Stage**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setTimestamp();

  for (const [groupName, gTeams] of Object.entries(groups).sort()) {
    // Column header line (monospace so it reads like a table header)
    const header = '`  #   NAME                  P    DIF   PTS`';

    const teamLines = gTeams.map((t, i) => {
      const mp    = (t.wins || 0) + (t.draws || 0) + (t.losses || 0);
      const gd    = (t.goals_for || 0) - (t.goals_against || 0);
      const gdStr = (gd >= 0 ? '+' : '') + gd;
      const pts   = t.points || 0;
      const qual  = i < 2 ? '🟢' : '🔴';
      const emoji = t.emoji || '⚽';
      const name  = (t.name || 'Unknown').slice(0, 20);

      return (
        `${qual} \`${i + 1}\` ${emoji} **${name}**\n` +
        `⠀⠀⠀⠀\`P: ${String(mp).padStart(2)}  Dif: ${gdStr.padStart(3)}  Pts: ${String(pts).padStart(3)}\``
      );
    });

    embed.addFields({
      name: `${E.hashtag}  GROUP ${groupName}`,
      value: header + '\n' + teamLines.join('\n'),
      inline: false,
    });
  }

  embed.setFooter({ text: `${tournament.template}  •  Group Stage` });
  return embed;
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
  const tournament = db.findById('tournaments', tournamentId);
  if (!tournament) return null;

  const matches = db.get('matches').filter(m => m.tournament_id === tournamentId && m.stage === 'knockout');
  const teams   = db.get('teams');
  const getTeam = id => teams.find(t => t.id === id) || { name: 'TBD' };

  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle(`${E.crown}  ${tournament.name}  —  Knockout Bracket`)
    .setTimestamp();

  if (!matches.length) {
    embed.setDescription('No knockout matches yet. Complete the group stage first.');
    return embed;
  }

  const rounds = {};
  for (const m of matches) {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  }

  const roundNames = { 1: '🏆 Final', 2: '🥈 Semi-Finals', 4: '🏅 Quarter-Finals', 8: '🔵 Round of 16' };

  for (const [round, rMatches] of Object.entries(rounds).sort((a, b) => b[0] - a[0])) {
    const label = roundNames[round] || `Round ${round}`;
    const lines = rMatches.map(m => {
      const home    = getTeam(m.home_team_id);
      const away    = getTeam(m.away_team_id);
      const score   = m.status === 'played' ? `\`${m.home_score} — ${m.away_score}\`` : '`? — ?`';
      const homeWon = m.status === 'played' && m.home_score > m.away_score;
      const awayWon = m.status === 'played' && m.away_score > m.home_score;
      const h = homeWon ? `${E.crown} **${home.name}**` : `**${home.name}**`;
      const a = awayWon ? `**${away.name}** ${E.crown}` : `**${away.name}**`;
      return `${E.arrow}  ${h}  ${score}  ${a}`;
    });
    embed.addFields({ name: `${E.channel}  ${label}`, value: lines.join('\n'), inline: false });
  }

  return embed;
}

module.exports = { buildGroupStandingsEmbed, buildStandingsRow, buildKnockoutBracketEmbed };
