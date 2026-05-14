'use strict';
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { db } = require('../utils/database');
const { COLORS, E } = require('../utils/embeds');
const { buildTeamListEmbed, buildTeamManageButtons } = require('../panels/teamListPanel');
const { buildTournamentListEmbed, buildTournamentButtons, TEMPLATES } = require('../panels/tournamentPanel');
const { getTargetChannel } = require('../utils/channelRouter');
const { makeScheduleEmbed, makeResultEmbed, makeStandingsEmbed } = require('../utils/tournamentEmbeds');

// Round-robin schedule generator
function generateRounds(teamIds) {
  const t = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, null];
  const half = t.length / 2;
  const rounds = [];
  for (let r = 0; r < t.length - 1; r++) {
    const round = [];
    for (let i = 0; i < half; i++) {
      const home = t[i];
      const away = t[t.length - 1 - i];
      if (home !== null && away !== null) round.push({ home, away });
    }
    rounds.push(round);
    t.splice(1, 0, t.pop());
  }
  return rounds;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('demo')
    .setDescription('Creates a demo tournament and posts real images to all channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName('template')
        .setDescription('Which tournament to demo')
        .setRequired(false)
        .addChoices(
          { name: 'MCL (Duo)', value: 'MCL' },
          { name: 'NSEL (Solo)', value: 'NSEL' },
        )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const template = (interaction.options.getString('template') || 'MCL').toUpperCase();
    const tmpl = TEMPLATES[template];

    const step = async (n, total, msg) => {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.info)
          .setTitle('🔄  Demo Running...')
          .setDescription(`**Step ${n}/${total}** — ${msg}`)],
      });
    };

    try {
      const TOTAL = 6;

      // ── Step 1: pick teams ────────────────────────────────────────────────
      await step(1, TOTAL, 'Selecting teams...');
      const teamCount = template === 'MCL' ? 8 : 16;
      const groupSize = 4;
      const allTeams = db.get('teams').sort(() => Math.random() - 0.5).slice(0, teamCount);
      if (allTeams.length < teamCount) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(COLORS.error)
            .setTitle('❌ Not enough teams')
            .setDescription(`Need ${teamCount} teams in the database. Add more first.`)],
        });
      }

      // ── Step 2: create tournament + draw groups + generate matches ────────
      await step(2, TOTAL, 'Creating tournament, drawing groups, generating matches...');

      const existing = db.get('tournaments').filter(t => t.template === template);
      const season = existing.length + 1;
      const tournament = db.insert('tournaments', {
        name: `${tmpl.emoji} ${template} Season ${season} (Demo)`,
        template,
        season,
        type: tmpl.type,
        team_count: teamCount,
        group_size: groupSize,
        status: 'active',
        channel_id: interaction.channelId,
      });

      // Enroll teams
      for (const team of allTeams) {
        db.insert('tournament_teams', {
          tournament_id: tournament.id,
          team_id: team.id,
          group_name: null,
          points: 0, wins: 0, draws: 0, losses: 0,
          goals_for: 0, goals_against: 0,
        });
      }

      // Draw groups
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const ttEntries = db.get('tournament_teams').filter(tt => tt.tournament_id === tournament.id);
      const shuffledTT = [...ttEntries].sort(() => Math.random() - 0.5);
      for (let i = 0; i < shuffledTT.length; i++) {
        db.update('tournament_teams', shuffledTT[i].id, { group_name: letters[Math.floor(i / groupSize)] });
      }

      // Build group map and generate matches
      const updatedTT = db.get('tournament_teams').filter(tt => tt.tournament_id === tournament.id);
      const groupMap = {};
      for (const tt of updatedTT) {
        const g = tt.group_name || 'A';
        if (!groupMap[g]) groupMap[g] = [];
        groupMap[g].push(tt.team_id);
      }

      const allMatches = [];
      const matchesByRound = {};
      for (const [groupLetter, teamIds] of Object.entries(groupMap)) {
        const rounds = generateRounds(teamIds);
        rounds.forEach((roundPairs, roundIdx) => {
          const roundNum = roundIdx + 1;
          if (!matchesByRound[roundNum]) matchesByRound[roundNum] = [];
          for (const { home, away } of roundPairs) {
            const m = db.insert('matches', {
              tournament_id: tournament.id,
              home_team_id: home,
              away_team_id: away,
              stage: 'group',
              round: roundNum,
              leg: 1,
              status: 'pending',
              home_score: null,
              away_score: null,
              group_name: groupLetter,
            });
            allMatches.push(m);
            matchesByRound[roundNum].push({ ...m, group_name: groupLetter });
          }
        });
      }

      // Add demo players (no guild fetch needed)
      const playersPerTeam = template === 'MCL' ? 2 : 1;
      const demoNames = ['Player_Alpha','Player_Beta','Player_Gamma','Player_Delta',
        'Player_Zeta','Player_Theta','Player_Sigma','Player_Omega',
        'Player_Kappa','Player_Lambda','Player_Mu','Player_Nu',
        'Player_Xi','Player_Pi','Player_Rho','Player_Tau',
        'Player_Phi','Player_Chi','Player_Psi','Player_Eta',
        'Player_Upsilon','Player_Iota','Player_Epsilon','Player_Delta2',
        'Player_Alpha2','Player_Beta2','Player_Gamma2','Player_Zeta2',
        'Player_Theta2','Player_Sigma2','Player_Omega2','Player_Kappa2'];
      let demoIdx = 0;
      for (const team of allTeams) {
        for (let i = 0; i < playersPerTeam; i++) {
          const uname = demoNames[demoIdx++ % demoNames.length];
          db.insert('players', {
            team_id: team.id,
            discord_id: `demo_${Date.now()}_${demoIdx}`,
            discord_username: uname,
          });
        }
      }

      const allTeamsById = Object.fromEntries(db.get('teams').map(t => [t.id, t]));
      const totalRounds = Object.keys(matchesByRound).length;

      // ── Step 3: post team list ────────────────────────────────────────────
      await step(3, TOTAL, 'Posting team list...');
      const teamListCh = await getTargetChannel(interaction.guild, template, 'teamList') || interaction.channel;
      await teamListCh.send({ embeds: [buildTeamListEmbed()], components: [buildTeamManageButtons()] });

      // ── Step 4: post schedule embeds ─────────────────────────────────────
      await step(4, TOTAL, 'Posting schedule embeds...');
      const scheduleCh = await getTargetChannel(interaction.guild, template, 'matchSchedule') || interaction.channel;
      for (const [roundNum, rMatches] of Object.entries(matchesByRound).sort((a, b) => Number(a[0]) - Number(b[0]))) {
        const embedMatches = rMatches.map(m => {
          const home = allTeamsById[m.home_team_id] || { name: 'TBD' };
          const away = allTeamsById[m.away_team_id] || { name: 'TBD' };
          return { home: home.name, away: away.name, group: m.group_name || 'A' };
        });
        await interaction.client.rest.post(`/channels/${scheduleCh.id}/messages`, { body: makeScheduleEmbed(embedMatches, 'Round ' + roundNum, tournament.name) });
      }

            // ── Step 5: simulate 3 results with embeds ────────────────────────────
      await step(5, TOTAL, 'Simulating results and posting result embeds...');
      const resultsCh = await getTargetChannel(interaction.guild, template, 'results') || interaction.channel;
      const sample = allMatches.slice(0, 3);
      for (const match of sample) {
        const hs = Math.floor(Math.random() * 5);
        const as_ = Math.floor(Math.random() * 5);
        const home = allTeamsById[match.home_team_id];
        const away = allTeamsById[match.away_team_id];
        const grpName = match.group_name || 'A';
        db.update('matches', match.id, { home_score: hs, away_score: as_, status: 'played', played_at: new Date().toISOString() });
        const homeTT = db.findOne('tournament_teams', tt => tt.tournament_id === match.tournament_id && tt.team_id === match.home_team_id);
        const awayTT = db.findOne('tournament_teams', tt => tt.tournament_id === match.tournament_id && tt.team_id === match.away_team_id);
        const homeWon = hs > as_, awayWon = as_ > hs, draw = hs === as_;
        if (homeTT) db.update('tournament_teams', homeTT.id, { goals_for: (homeTT.goals_for||0)+hs, goals_against: (homeTT.goals_against||0)+as_, wins: (homeTT.wins||0)+(homeWon?1:0), draws: (homeTT.draws||0)+(draw?1:0), losses: (homeTT.losses||0)+(awayWon?1:0), points: (homeTT.points||0)+(homeWon?3:draw?1:0) });
        if (awayTT) db.update('tournament_teams', awayTT.id, { goals_for: (awayTT.goals_for||0)+as_, goals_against: (awayTT.goals_against||0)+hs, wins: (awayTT.wins||0)+(awayWon?1:0), draws: (awayTT.draws||0)+(draw?1:0), losses: (awayTT.losses||0)+(homeWon?1:0), points: (awayTT.points||0)+(awayWon?3:draw?1:0) });
        await interaction.client.rest.post(`/channels/${resultsCh.id}/messages`, { body: makeResultEmbed(home.name, hs, away.name, as_, grpName, 'Round ' + match.round, tournament.name) });
      }

            // ── Step 6: post standings embed ──────────────────────────────────────
      await step(6, TOTAL, 'Posting standings embed...');
      const ttAll = db.get('tournament_teams').filter(tt => tt.tournament_id === tournament.id);
      const groupedStandings = {};
      for (const tt of ttAll) {
        const g = tt.group_name || 'A';
        if (!groupedStandings[g]) groupedStandings[g] = [];
        const team = allTeamsById[tt.team_id] || { name: 'TBD' };
        groupedStandings[g].push({ ...team, ...tt });
      }
      for (const g of Object.keys(groupedStandings)) {
        groupedStandings[g].sort((a, b) => (b.points||0)-(a.points||0) || ((b.goals_for||0)-(b.goals_against||0))-((a.goals_for||0)-(a.goals_against||0)));
      }
      await interaction.client.rest.post(`/channels/${resultsCh.id}/messages`, { body: makeStandingsEmbed(groupedStandings, tournament.name) });

      // Post tournament panel in current channel
      await interaction.channel.send({ embeds: [buildTournamentListEmbed()], components: [buildTournamentButtons()] });

      // ── Done ──────────────────────────────────────────────────────────────
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle(`✅  ${template} Demo Complete!`)
          .setDescription(
            `${tmpl.emoji} **${tournament.name}**\n\n` +
            `• **${allTeams.length} teams** enrolled across **${Object.keys(groupMap).length} groups**\n` +
            `• **${allMatches.length} matches** across **${totalRounds} rounds**\n` +
            `• **3 result images** with team logos posted\n` +
            `• **Standings image** generated\n\n` +
            `📋 Team list → <#${teamListCh.id}>\n` +
            `📅 Schedule → <#${scheduleCh.id}>\n` +
            `📊 Results & Standings → <#${resultsCh.id}>`
          )
          .setTimestamp()
        ],
      });

    } catch (err) {
      console.error('[DEMO ERROR]', err);
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(COLORS.error)
          .setTitle('❌ Demo Failed')
          .setDescription('```\n' + err.message + '\n```')],
      });
    }
  },
};
