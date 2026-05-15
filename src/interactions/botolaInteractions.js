'use strict';
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db }          = require('../utils/database');
const { isManager }   = require('../utils/permissions');
const { buildPanel1, getStage } = require('../panels/panel1');
const { buildPanel2 } = require('../panels/panel2');
const { buildPanel3 } = require('../panels/panel3');
const {
  buildGroupStandingsEmbed,
  buildKnockoutBracketEmbed,
} = require('../panels/standingsPanel');
const { buildAllResultsEmbed } = require('../panels/resultsPanel');
const { makeScheduleEmbed }    = require('../utils/tournamentEmbeds');
const { buildWinnersHistoryPayload } = require('../utils/winnersHistory');

// ── Helpers ───────────────────────────────────────────────────────────────────
const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

function noPermission(i) {
  return i.reply({ content: '❌ Managers only.', ephemeral: true });
}

function getT(tid) { return db.findById('tournaments', tid); }

async function refreshPanel(client, t, panelNum) {
  try {
    const ref = t[`panel${panelNum}_ref`];
    if (!ref) return;
    const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
    if (!msg) return;
    const payload = panelNum === 1 ? buildPanel1(t)
                  : panelNum === 2 ? buildPanel2(t)
                  : buildPanel3(t);
    await msg.edit(payload).catch(() => {});
  } catch {}
}

async function refreshAll(client, tid) {
  const t = getT(tid);
  if (!t) return;
  await Promise.all([
    refreshPanel(client, t, 1),
    refreshPanel(client, t, 2),
    refreshPanel(client, t, 3),
  ]);
}

// ── Schedule generation ───────────────────────────────────────────────────────
function runGroupDraw(tid) {
  const t        = getT(tid);
  const ttRows   = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const shuffled = [...ttRows].sort(() => Math.random() - 0.5);
  const gs       = t.teams_per_group || 4;
  const letters  = 'ABCDEFGHIJKLMNOP'.split('');
  shuffled.forEach((tt, i) => {
    db.update('tournament_teams', tt.id, { group_name: letters[Math.floor(i / gs)] });
  });
}

function generateGroupSchedule(tid) {
  const t      = getT(tid);
  const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const groups = {};
  for (const tt of ttRows) {
    const g = tt.group_name || 'A';
    if (!groups[g]) groups[g] = [];
    groups[g].push(tt);
  }
  const encounters = t.encounters || 1;
  for (const [, gTeams] of Object.entries(groups)) {
    for (let i = 0; i < gTeams.length; i++) {
      for (let j = i + 1; j < gTeams.length; j++) {
        db.insert('matches', {
          tournament_id: tid,
          home_team_id:  gTeams[i].team_id,
          away_team_id:  gTeams[j].team_id,
          stage: 'group', round: 1, leg: 1,
          status: 'pending', home_score: null, away_score: null,
        });
        if (encounters >= 2) {
          db.insert('matches', {
            tournament_id: tid,
            home_team_id:  gTeams[j].team_id,
            away_team_id:  gTeams[i].team_id,
            stage: 'group', round: 2, leg: 2,
            status: 'pending', home_score: null, away_score: null,
          });
        }
      }
    }
  }
}

function updateStandings(tid, matchId, homeScore, awayScore) {
  const match = db.findById('matches', matchId);
  if (!match) return;
  const t = getT(tid);
  if (!t) return;
  const wp = t.win_pts  ?? 3;
  const dp = t.draw_pts ?? 1;
  const lp = t.loss_pts ?? 0;

  const home_tt = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === match.home_team_id);
  const away_tt = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === match.away_team_id);

  if (homeScore > awayScore) {
    if (home_tt) db.update('tournament_teams', home_tt.id, {
      wins: (home_tt.wins || 0) + 1, points: (home_tt.points || 0) + wp,
      goals_for: (home_tt.goals_for || 0) + homeScore, goals_against: (home_tt.goals_against || 0) + awayScore,
    });
    if (away_tt) db.update('tournament_teams', away_tt.id, {
      losses: (away_tt.losses || 0) + 1, points: (away_tt.points || 0) + lp,
      goals_for: (away_tt.goals_for || 0) + awayScore, goals_against: (away_tt.goals_against || 0) + homeScore,
    });
  } else if (awayScore > homeScore) {
    if (home_tt) db.update('tournament_teams', home_tt.id, {
      losses: (home_tt.losses || 0) + 1, points: (home_tt.points || 0) + lp,
      goals_for: (home_tt.goals_for || 0) + homeScore, goals_against: (home_tt.goals_against || 0) + awayScore,
    });
    if (away_tt) db.update('tournament_teams', away_tt.id, {
      wins: (away_tt.wins || 0) + 1, points: (away_tt.points || 0) + wp,
      goals_for: (away_tt.goals_for || 0) + awayScore, goals_against: (away_tt.goals_against || 0) + homeScore,
    });
  } else {
    if (home_tt) db.update('tournament_teams', home_tt.id, {
      draws: (home_tt.draws || 0) + 1, points: (home_tt.points || 0) + dp,
      goals_for: (home_tt.goals_for || 0) + homeScore, goals_against: (home_tt.goals_against || 0) + awayScore,
    });
    if (away_tt) db.update('tournament_teams', away_tt.id, {
      draws: (away_tt.draws || 0) + 1, points: (away_tt.points || 0) + dp,
      goals_for: (away_tt.goals_for || 0) + awayScore, goals_against: (away_tt.goals_against || 0) + homeScore,
    });
  }
  db.update('matches', matchId, { status: 'played', home_score: homeScore, away_score: awayScore });
}

function generateKnockoutBracket(tid) {
  const t       = getT(tid);
  const advance = t.advance_per_group || 2;
  const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid && tt.group_name);
  const groups  = {};
  for (const tt of ttRows) {
    const g = tt.group_name;
    if (!groups[g]) groups[g] = [];
    groups[g].push(tt);
  }
  const qualifiers = [];
  for (const gTeams of Object.values(groups)) {
    gTeams.sort((a, b) => {
      const ptsDiff = (b.points || 0) - (a.points || 0);
      if (ptsDiff !== 0) return ptsDiff;
      return ((b.goals_for || 0) - (b.goals_against || 0)) - ((a.goals_for || 0) - (a.goals_against || 0));
    });
    qualifiers.push(...gTeams.slice(0, advance));
  }
  const shuffled = [...qualifiers].sort(() => Math.random() - 0.5);
  const numMatches = Math.floor(shuffled.length / 2);
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    db.insert('matches', {
      tournament_id: tid,
      home_team_id: shuffled[i].team_id, away_team_id: shuffled[i + 1].team_id,
      stage: 'knockout', round: numMatches, leg: 1,
      status: 'pending', home_score: null, away_score: null,
    });
  }
}

function advanceKnockout(tid) {
  const matches     = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'knockout');
  const playedRounds= [...new Set(matches.filter(m => m.status === 'played').map(m => m.round))].sort((a, b) => b - a);
  if (!playedRounds.length) return false;
  const curRound    = playedRounds[0];
  const curPlayed   = matches.filter(m => m.round === curRound && m.status === 'played');
  const nextRound   = Math.floor(curRound / 2);
  if (nextRound < 1) {
    db.update('tournaments', tid, { status: 'finished' });
    return true;
  }
  const winners = curPlayed.map(m =>
    m.home_score > m.away_score ? m.home_team_id : m.away_team_id
  );
  for (let i = 0; i + 1 < winners.length; i += 2) {
    db.insert('matches', {
      tournament_id: tid,
      home_team_id: winners[i], away_team_id: winners[i + 1],
      stage: 'knockout', round: nextRound, leg: 1,
      status: 'pending', home_score: null, away_score: null,
    });
  }
  return true;
}

// ── Pending match panel ───────────────────────────────────────────────────────
function buildMatchPickerEphemeral(tid, stage) {
  const teams   = db.get('teams');
  const getTeam = id => teams.find(t => t.id === id) || { name: 'Unknown' };
  const matches = db.get('matches').filter(m =>
    m.tournament_id === tid && m.status === 'pending' &&
    (stage ? m.stage === stage : true)
  );
  if (!matches.length) return null;
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      txt('**📊 Add Result — Select a match**'),
      SEP,
      { type: 1, components: [{
        type: 3, custom_id: `p1_${tid}_result_sel`,
        placeholder: 'Select match...',
        options: matches.slice(0, 25).map(m => ({
          label: `${getTeam(m.home_team_id).name} vs ${getTeam(m.away_team_id).name}`,
          value:  String(m.id),
          description: `${m.stage} · Round ${m.round}`,
        })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: 'Cancel', custom_id: `p1_${tid}_refresh` }]},
    ]}],
  };
}

function buildResultPreviewEphemeral(matchId) {
  const match = db.findById('matches', matchId);
  const teams = db.get('teams');
  const home  = teams.find(t => t.id === match?.home_team_id)?.name || 'Home';
  const away  = teams.find(t => t.id === match?.away_team_id)?.name || 'Away';
  return new ModalBuilder()
    .setCustomId(`p1_result_modal_${matchId}`)
    .setTitle(`Result: ${home.slice(0, 30)} vs ${away.slice(0, 30)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('home_score').setLabel(`${home.slice(0, 40)} — Score`)
          .setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('away_score').setLabel(`${away.slice(0, 40)} — Score`)
          .setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true)
      ),
    );
}

// ── Add team to tournament ephemeral flow ─────────────────────────────────────
function buildAddTeamSelectEphemeral(tid) {
  const enrolled = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => tt.team_id);
  const available= db.get('teams').filter(t => !enrolled.includes(t.id))
                     .sort((a, b) => a.name.localeCompare(b.name));
  if (!available.length) return null;
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x57F287, components: [
      txt('**➕ Add Team — Select from master list**'),
      SEP,
      { type: 1, components: [{
        type: 3, custom_id: `p2_${tid}_team_sel`,
        placeholder: 'Select team to register...',
        options: available.slice(0, 25).map(t => ({
          label: t.name.slice(0, 100),
          value: String(t.id),
          description: t.category || 'No category',
        })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: 'Cancel', custom_id: `p2_${tid}_refresh` }]},
    ]}],
  };
}

// ── Post helper ───────────────────────────────────────────────────────────────
async function postToChannel(client, channelId, payload) {
  if (!channelId) return null;
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch) return null;
  return ch.send(payload).catch(() => null);
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleBotolaInteraction(interaction) {
  const id  = interaction.customId;
  const cli = interaction.client;

  // ── /botola — tournament clicked ──────────────────────────────────────────
  if (id.startsWith('bot_t_')) {
    if (!isManager(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('bot_t_', ''));
    const t   = getT(tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });

    const ch = t.channels || {};
    if (!ch.management) {
      return interaction.reply({
        content: '❌ No management channel configured for this tournament.\nUse `/manage → Set Channels` first.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // Send Panel 1 + Panel 3 to management channel
    const mgmtCh = await cli.channels.fetch(ch.management).catch(() => null);
    if (!mgmtCh) return interaction.editReply({ content: '❌ Management channel not found.' });

    const msg1 = await mgmtCh.send(buildPanel1(t)).catch(() => null);
    const msg3 = await mgmtCh.send(buildPanel3(t)).catch(() => null);
    if (msg1) db.update('tournaments', tid, { panel1_ref: { channelId: mgmtCh.id, messageId: msg1.id } });
    if (msg3) db.update('tournaments', tid, { panel3_ref: { channelId: mgmtCh.id, messageId: msg3.id } });

    // Send Panel 2 to registration channel (or management if not set)
    const regChId = ch.registration || ch.management;
    const regCh   = await cli.channels.fetch(regChId).catch(() => null);
    if (regCh) {
      const msg2 = await regCh.send(buildPanel2(t)).catch(() => null);
      if (msg2) db.update('tournaments', tid, { panel2_ref: { channelId: regCh.id, messageId: msg2.id } });
    }

    return interaction.editReply({
      content: `✅ Panels sent to <#${ch.management}>${regChId !== ch.management ? ` + <#${regChId}>` : ''}.`,
    });
  }

  // ── Extract tid from p1/p2/p3 IDs ────────────────────────────────────────
  const p1Match = id.match(/^p1_(\d+)_(.+)$/);
  const p2Match = id.match(/^p2_(\d+)_(.+)$/);
  const p3Match = id.match(/^p3_(\d+)_(.+)$/);

  // ════════════════════════════════════════════════════════════════════════════
  // PANEL 1 INTERACTIONS
  // ════════════════════════════════════════════════════════════════════════════
  if (p1Match) {
    const tid    = parseInt(p1Match[1]);
    const action = p1Match[2];
    const t      = getT(tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });

    if (!isManager(interaction.member)) return noPermission(interaction);

    // Refresh
    if (action === 'refresh') return interaction.update(buildPanel1(t));

    // Begin Season
    if (action === 'begin') {
      await interaction.deferUpdate();
      if (t.status !== 'setup' && t.status !== 'active') {
        return interaction.followUp({ content: '❌ Season already started or finished.', ephemeral: true });
      }
      const ttCount = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).length;
      if (ttCount < 2) {
        return interaction.followUp({ content: '❌ Need at least 2 teams enrolled.', ephemeral: true });
      }
      // Close registration if open
      if (t.registration_open !== false) {
        db.update('tournaments', tid, { registration_open: false });
      }
      // Draw groups if not done
      const hasGroups = db.get('tournament_teams').some(tt => tt.tournament_id === tid && tt.group_name);
      if (!hasGroups) runGroupDraw(tid);
      // Generate schedule if no matches
      const hasMatches = db.get('matches').some(m => m.tournament_id === tid);
      if (!hasMatches) generateGroupSchedule(tid);
      // Activate
      db.update('tournaments', tid, { status: 'active' });
      await refreshAll(cli, tid);
      return;
    }

    // Settings modal
    if (action === 'settings') {
      return interaction.showModal(
        new ModalBuilder().setCustomId(`p1_${tid}_settings_modal`).setTitle(`Tournament Settings: ${t.name.slice(0, 30)}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('name').setLabel('Tournament Name')
                .setStyle(TextInputStyle.Short).setValue(t.name).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('team_count').setLabel('Max Teams')
                .setStyle(TextInputStyle.Short).setValue(String(t.team_count || '')).setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('teams_per_group').setLabel('Teams per Group')
                .setStyle(TextInputStyle.Short).setValue(String(t.teams_per_group || 4)).setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('advance_per_group').setLabel('Teams Advancing per Group')
                .setStyle(TextInputStyle.Short).setValue(String(t.advance_per_group || 2)).setRequired(false)
            ),
          )
      );
    }

    if (action === 'settings_modal') {
      const name        = interaction.fields.getTextInputValue('name').trim();
      const team_count  = parseInt(interaction.fields.getTextInputValue('team_count')) || t.team_count;
      const tpg         = parseInt(interaction.fields.getTextInputValue('teams_per_group')) || t.teams_per_group;
      const apg         = parseInt(interaction.fields.getTextInputValue('advance_per_group')) || t.advance_per_group;
      db.update('tournaments', tid, { name, team_count, teams_per_group: tpg, advance_per_group: apg });
      await refreshAll(cli, tid);
      return interaction.reply({ content: '✅ Tournament settings updated.', ephemeral: true });
    }

    // Set Channels modal
    if (action === 'setchannels') {
      const ch = t.channels || {};
      return interaction.showModal(
        new ModalBuilder().setCustomId(`p1_${tid}_channels_modal`).setTitle('Set Tournament Channels')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('management').setLabel('Management Channel ID')
                .setStyle(TextInputStyle.Short).setValue(ch.management || '').setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('registration').setLabel('Registration Channel ID')
                .setStyle(TextInputStyle.Short).setValue(ch.registration || '').setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('results').setLabel('Results Channel ID')
                .setStyle(TextInputStyle.Short).setValue(ch.results || '').setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('schedule').setLabel('Schedule Channel ID')
                .setStyle(TextInputStyle.Short).setValue(ch.schedule || '').setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('standings').setLabel('Standings Channel ID')
                .setStyle(TextInputStyle.Short).setValue(ch.standings || '').setRequired(false)
            ),
          )
      );
    }

    if (action === 'channels_modal') {
      const mgmt = interaction.fields.getTextInputValue('management').trim();
      const reg  = interaction.fields.getTextInputValue('registration').trim();
      const res  = interaction.fields.getTextInputValue('results').trim();
      const sch  = interaction.fields.getTextInputValue('schedule').trim();
      const std  = interaction.fields.getTextInputValue('standings').trim();
      db.update('tournaments', tid, { channels: {
        management: mgmt || null, registration: reg || null,
        results: res || null, schedule: sch || null, standings: std || null,
      }});
      await refreshAll(cli, tid);
      return interaction.reply({ content: '✅ Channels saved.', ephemeral: true });
    }

    // Add Result — show picker
    if (action === 'addresult') {
      const stage    = getStage(t);
      const stageFilter = stage === 'knockout' ? 'knockout' : 'group';
      const panel    = buildMatchPickerEphemeral(tid, stageFilter);
      if (!panel) return interaction.reply({ content: '❌ No pending matches.', ephemeral: true });
      return interaction.reply({ ...panel, ephemeral: true });
    }

    // Match selected from result picker
    if (action === 'result_sel') {
      const matchId = parseInt(interaction.values[0]);
      return interaction.showModal(buildResultPreviewEphemeral(matchId));
    }

    // Result modal submitted
    if (action.startsWith('result_modal_')) {
      // This is matched differently — see below
    }

    // Advance (group → knockout OR knockout next round)
    if (action === 'advance') {
      await interaction.deferUpdate();
      const stage = getStage(t);
      if (stage === 'group') {
        generateKnockoutBracket(tid);
      } else if (stage === 'knockout') {
        advanceKnockout(tid);
      }
      await refreshAll(cli, tid);
      return;
    }


    // ── Confirm Winner ──────────────────────────────────────────────────────
    if (action === 'confirm_winner') {
      // Find the final match (lowest round number in knockout, status played)
      const playedKO = allMatches.filter(m => m.stage === 'knockout' && m.status === 'played');
      const finalRound = playedKO.length ? Math.min(...playedKO.map(m => m.round)) : null;
      const finalMatch = finalRound !== null ? playedKO.find(m => m.round === finalRound) : null;
      if (!finalMatch) return interaction.reply({ content: '❌ No final match found.', ephemeral: true });

      const winTeamId = finalMatch.home_score > finalMatch.away_score
        ? finalMatch.home_team_id : finalMatch.away_team_id;
      const winTeam = db.findById('teams', winTeamId);

      // Find players for this team in this tournament
      const winTTs   = db.findWhere('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === winTeamId);
      const players  = db.findWhere('players', p => winTTs.some(tt => tt.id === p.tournament_team_id));
      const playerList = players.length
        ? players.map(p => `<@${p.discord_id}>`).join(', ')
        : '`No players registered`';

      const hasRole  = !!t.winner_role_id;
      const hasRef   = !!t.winners_history_ref;

      const confirmPayload = {
        flags: 32768,
        components: [{ type: 17, accent_color: 0xFFD700, components: [
          { type: 10, content:
            `# 🏆  Confirm Season Winner\n` +
            `> **Tournament:** ${t.name}  —  Season ${t.season}\n` +
            `> **Champion:** ${winTeam?.name || 'Unknown'}\n` +
            `> **Players:** ${playerList}`
          },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content:
            `**Actions that will be performed:**\n` +
            (hasRole
              ? `✅ Remove winner role from previous champion(s)\n✅ Assign winner role to new champion's players\n`
              : `⚠️ No winner role configured for this tournament (set one via /manage → 🏆 Winners Setup)\n`) +
            (hasRef
              ? `✅ Update the Winners History leaderboard message`
              : `⚠️ No winners history message configured (set one via /manage → 🏆 Winners Setup)`)
          },
          { type: 14, divider: true, spacing: 1 },
          { type: 1, components: [
            { type: 2, style: 1, label: '✅ Confirm Winner', custom_id: `p1_${tid}_winner_confirm` },
            { type: 2, style: 2, label: 'Cancel',            custom_id: `p1_${tid}_refresh` },
          ]},
        ]}],
      };
      return interaction.reply({ ...confirmPayload, ephemeral: true });
    }

    // ── Execute Winner Confirmation ─────────────────────────────────────────
    if (action === 'winner_confirm') {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;

      // Already confirmed?
      const alreadyConfirmed = db.findOne('winners', w => w.tournament_id === tid && w.season === t.season);
      if (alreadyConfirmed) {
        return interaction.editReply({ content: '⚠️ Winner already confirmed for this season.' });
      }

      // Find final match
      const playedKO2  = allMatches.filter(m => m.stage === 'knockout' && m.status === 'played');
      const finalRound2 = playedKO2.length ? Math.min(...playedKO2.map(m => m.round)) : null;
      const finalMatch2 = finalRound2 !== null ? playedKO2.find(m => m.round === finalRound2) : null;
      if (!finalMatch2) return interaction.editReply({ content: '❌ No final match found.' });

      const winTeamId2 = finalMatch2.home_score > finalMatch2.away_score
        ? finalMatch2.home_team_id : finalMatch2.away_team_id;
      const winTeam2   = db.findById('teams', winTeamId2);

      // Find players
      const winTTs2   = db.findWhere('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === winTeamId2);
      const players2  = db.findWhere('players', p => winTTs2.some(tt => tt.id === p.tournament_team_id));
      const playerIds = players2.map(p => p.discord_id).filter(Boolean);

      const roleId = t.winner_role_id;
      let roleMsg  = '';

      if (roleId) {
        // Remove role from all previous winners of this tournament
        const prevWinners = db.findWhere('winners', w => w.tournament_id === tid);
        for (const pw of prevWinners) {
          for (const pid of (pw.player_ids || [])) {
            try {
              const mem = await guild.members.fetch(pid).catch(() => null);
              if (mem) await mem.roles.remove(roleId).catch(() => {});
            } catch {}
          }
        }
        // Give role to new winners
        const given = [];
        for (const pid of playerIds) {
          try {
            const mem = await guild.members.fetch(pid).catch(() => null);
            if (mem) { await mem.roles.add(roleId).catch(() => {}); given.push(`<@${pid}>`); }
          } catch {}
        }
        roleMsg = given.length
          ? `✅ Winner role assigned to: ${given.join(', ')}`
          : '⚠️ Could not find members to assign winner role.';
      } else {
        roleMsg = '⚠️ No winner role configured for this tournament.';
      }

      // Insert winner record
      db.insert('winners', {
        tournament_id: tid,
        season:        t.season,
        team_id:       winTeamId2,
        player_ids:    playerIds,
        confirmed_by:  interaction.user.id,
      });

      // Edit winners history leaderboard message
      const ref = t.winners_history_ref;
      let refMsg = '';
      if (ref) {
        try {
          const wCh  = await cli.channels.fetch(ref.channelId).catch(() => null);
          const wMsg = await wCh?.messages.fetch(ref.messageId).catch(() => null);
          if (wMsg) {
            await wMsg.edit(buildWinnersHistoryPayload(tid)).catch(() => {});
            refMsg = `✅ Winners History leaderboard updated in <#${ref.channelId}>`;
          } else {
            refMsg = '⚠️ Could not find winners history message to update.';
          }
        } catch (e) {
          refMsg = `⚠️ Failed to update leaderboard: ${e.message}`;
        }
      } else {
        refMsg = '⚠️ No winners history message configured.';
      }

      // Refresh Panel 1
      const freshT = db.findById('tournaments', tid);
      await refreshPanel(cli, freshT, 1);

      return interaction.editReply({
        content:
          `# 🏆  Season ${t.season} Winner Confirmed!\n` +
          `**${winTeam2?.name || 'Unknown'}** is the official champion.\n\n` +
          `${roleMsg}\n${refMsg}`,
      });
    }

    // New Edition (when finished)
    if (action === 'newedition') {
      await interaction.deferReply({ ephemeral: true });
      const newSeason = Math.max(0, ...db.get("tournaments").filter(x => x.template === t.template).map(x => x.season)) + 1;
      const nt = db.insert('tournaments', {
        name: t.name, template: t.template, season: newSeason,
        team_count: t.team_count, teams_per_group: t.teams_per_group,
        advance_per_group: t.advance_per_group, encounters: t.encounters,
        players_per_team: t.players_per_team, win_pts: t.win_pts, draw_pts: t.draw_pts,
        loss_pts: t.loss_pts, forfeit_pts: t.forfeit_pts, type: t.type,
        status: 'setup', registration_open: true, channels: t.channels || {},
      });
      return interaction.editReply({
        content: `✅ **${nt.name} — Season ${nt.season}** created. Use \`/botola\` to open its panels.`,
      });
    }
  }

  // ── Result modal (custom_id: p1_result_modal_{matchId}) ───────────────────
  if (id.startsWith('p1_result_modal_')) {
    const matchId  = parseInt(id.replace('p1_result_modal_', ''));
    const match    = db.findById('matches', matchId);
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });
    const hs = parseInt(interaction.fields.getTextInputValue('home_score'));
    const as_ = parseInt(interaction.fields.getTextInputValue('away_score'));
    if (isNaN(hs) || isNaN(as_) || hs < 0 || as_ < 0) {
      return interaction.reply({ content: '❌ Invalid score. Enter non-negative numbers.', ephemeral: true });
    }
    updateStandings(match.tournament_id, matchId, hs, as_);
    await refreshAll(cli, match.tournament_id);
    return interaction.reply({ content: `✅ Result saved: **${hs} — ${as_}**`, ephemeral: true });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PANEL 2 INTERACTIONS
  // ════════════════════════════════════════════════════════════════════════════
  if (p2Match) {
    const tid    = parseInt(p2Match[1]);
    const action = p2Match[2];
    const t      = getT(tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });

    if (!isManager(interaction.member)) return noPermission(interaction);

    if (action === 'refresh') return interaction.update(buildPanel2(t));

    if (action === 'addteam') {
      const panel = buildAddTeamSelectEphemeral(tid);
      if (!panel) return interaction.reply({ content: '❌ All teams are already enrolled.', ephemeral: true });
      return interaction.reply({ ...panel, ephemeral: true });
    }

    if (action === 'team_sel') {
      const teamId = parseInt(interaction.values[0]);
      const team   = db.findById('teams', teamId);
      if (!team) return interaction.reply({ content: '❌ Team not found.', ephemeral: true });
      const already = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === teamId);
      if (!already) {
        db.insert('tournament_teams', {
          tournament_id: tid, team_id: teamId, group_name: null,
          wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0,
        });
      }
      // Now ask for player Discord ID
      return interaction.showModal(
        new ModalBuilder().setCustomId(`p2_${tid}_player_modal_${teamId}`).setTitle(`Assign Player — ${team.name.slice(0, 40)}`)
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('discord_id').setLabel('Player Discord ID (or @mention ID)')
                .setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(false)
            ),
          )
      );
    }

    if (action.startsWith('player_modal_')) {
      const teamId   = parseInt(action.replace('player_modal_', ''));
      const rawId    = interaction.fields.getTextInputValue('discord_id').trim().replace(/\D/g, '');
      if (rawId) {
        const exists = db.findOne('players', p => p.discord_id === rawId && p.team_id === teamId);
        if (!exists) db.insert('players', { discord_id: rawId, team_id: teamId, tournament_id: tid });
      }
      const freshT = getT(tid);
      // Refresh panel2 in channel
      await refreshPanel(cli, freshT, 2);
      return interaction.reply({ content: '✅ Team enrolled' + (rawId ? ` with player <@${rawId}>` : '') + '.', ephemeral: true });
    }

    if (action === 'closereg') {
      await interaction.deferUpdate();
      db.update('tournaments', tid, { registration_open: false });
      // Run group draw if not done
      const hasGroups = db.get('tournament_teams').some(tt => tt.tournament_id === tid && tt.group_name);
      if (!hasGroups) runGroupDraw(tid);
      await refreshAll(cli, tid);
      return;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PANEL 3 INTERACTIONS
  // ════════════════════════════════════════════════════════════════════════════
  if (p3Match) {
    const tid    = parseInt(p3Match[1]);
    const action = p3Match[2];
    const t      = getT(tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });

    if (!isManager(interaction.member)) return noPermission(interaction);

    if (action === 'refresh') return interaction.update(buildPanel3(t));

    const ch = t.channels || {};

    // ── Post Schedule ───────────────────────────────────────────────────────
    if (action === 'schedule') {
      const matches = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
      const teams   = db.get('teams');
      const getTeam = id => teams.find(tt => tt.id === id) || { name: 'Unknown' };
      const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
      const getGrp  = id => ttRows.find(tt => tt.team_id === id)?.group_name || '?';
      const items   = matches.map(m => ({
        home: getTeam(m.home_team_id).name,
        away: getTeam(m.away_team_id).name,
        group: getGrp(m.home_team_id),
        round: m.round, leg: m.leg,
        status: m.status, score: m.status === 'played' ? `${m.home_score}-${m.away_score}` : null,
      }));
      const embed = makeScheduleEmbed ? makeScheduleEmbed(items, t) : null;
      const payload = embed ? { embeds: [embed] } : { content: `Schedule for **${t.name}**: ${matches.length} matches` };
      const confirmPanel = {
        flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: [
          txt(`**📅 Schedule Preview**\nPost schedule to <#${ch.schedule || 'not set'}>?`),
          SEP,
          { type: 1, components: [
            { type: 2, style: 1, label: 'Confirm Post', custom_id: `p3_${tid}_schedule_confirm` },
            { type: 2, style: 2, label: 'Cancel',        custom_id: `p3_${tid}_refresh` },
          ]},
        ]}],
      };
      await interaction.reply({ ...confirmPanel, ephemeral: true });
      return;
    }

    if (action === 'schedule_confirm') {
      if (!ch.schedule) return interaction.reply({ content: '❌ No schedule channel configured.', ephemeral: true });
      const matches = db.get('matches').filter(m => m.tournament_id === tid && m.stage === 'group');
      const teams   = db.get('teams');
      const getTeam = id => teams.find(tt => tt.id === id) || { name: 'Unknown' };
      const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
      const getGrp  = id => ttRows.find(tt => tt.team_id === id)?.group_name || '?';
      const items   = matches.map(m => ({
        home: getTeam(m.home_team_id).name, away: getTeam(m.away_team_id).name,
        group: getGrp(m.home_team_id), round: m.round, leg: m.leg, status: m.status,
      }));
      const embed = makeScheduleEmbed ? makeScheduleEmbed(items, t) : null;
      const payload = embed ? { embeds: [embed] } : { content: `**${t.name} — Schedule**\n${matches.length} matches generated.` };
      await postToChannel(cli, ch.schedule, payload);
      return interaction.reply({ content: `✅ Schedule posted to <#${ch.schedule}>.`, ephemeral: true });
    }

    // ── Post Results ────────────────────────────────────────────────────────
    if (action === 'results') {
      const embed = buildAllResultsEmbed ? buildAllResultsEmbed(tid) : null;
      const confirmPanel = {
        flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: [
          txt(`**📊 Results Preview**\nPost results to <#${ch.results || 'not set'}>?`),
          SEP,
          { type: 1, components: [
            { type: 2, style: 1, label: 'Confirm Post', custom_id: `p3_${tid}_results_confirm` },
            { type: 2, style: 2, label: 'Cancel',        custom_id: `p3_${tid}_refresh` },
          ]},
        ]}],
      };
      await interaction.reply({ ...confirmPanel, ephemeral: true });
      if (embed) await interaction.followUp({ embeds: [embed], ephemeral: true });
      return;
    }

    if (action === 'results_confirm') {
      if (!ch.results) return interaction.reply({ content: '❌ No results channel configured.', ephemeral: true });
      const embed = buildAllResultsEmbed ? buildAllResultsEmbed(tid) : null;
      if (embed) await postToChannel(cli, ch.results, { embeds: [embed] });
      return interaction.reply({ content: `✅ Results posted to <#${ch.results}>.`, ephemeral: true });
    }

    // ── Post Standings ──────────────────────────────────────────────────────
    if (action === 'standings') {
      const embed = buildGroupStandingsEmbed ? buildGroupStandingsEmbed(tid) : null;
      const confirmPanel = {
        flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: [
          txt(`**📈 Standings Preview**\nPost standings to <#${ch.standings || 'not set'}>?`),
          SEP,
          { type: 1, components: [
            { type: 2, style: 1, label: 'Confirm Post', custom_id: `p3_${tid}_standings_confirm` },
            { type: 2, style: 2, label: 'Cancel',        custom_id: `p3_${tid}_refresh` },
          ]},
        ]}],
      };
      await interaction.reply({ ...confirmPanel, ephemeral: true });
      if (embed) await interaction.followUp({ embeds: [embed], ephemeral: true });
      return;
    }

    if (action === 'standings_confirm') {
      if (!ch.standings) return interaction.reply({ content: '❌ No standings channel configured.', ephemeral: true });
      const embed = buildGroupStandingsEmbed ? buildGroupStandingsEmbed(tid) : null;
      if (embed) await postToChannel(cli, ch.standings, { embeds: [embed] });
      return interaction.reply({ content: `✅ Standings posted to <#${ch.standings}>.`, ephemeral: true });
    }

    // ── Post Group Draw ─────────────────────────────────────────────────────
    if (action === 'groupdraw') {
      const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid && tt.group_name);
      const teams  = db.get('teams');
      const groups = {};
      for (const tt of ttRows) {
        const g = tt.group_name;
        if (!groups[g]) groups[g] = [];
        groups[g].push(teams.find(t2 => t2.id === tt.team_id)?.name || 'Unknown');
      }
      const lines  = Object.entries(groups).sort().map(([g, names]) =>
        `**Group ${g}**\n${names.map(n => `• ${n}`).join('\n')}`
      );
      const drawText = lines.join('\n\n') || 'No groups drawn yet.';
      const confirmPanel = {
        flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: [
          txt(`**🎲 Group Draw — ${t.name}**\n${drawText}`),
          SEP,
          txt(`Post to <#${ch.management || 'not set'}>?`),
          SEP,
          { type: 1, components: [
            { type: 2, style: 1, label: 'Confirm Post', custom_id: `p3_${tid}_groupdraw_confirm` },
            { type: 2, style: 2, label: 'Cancel',        custom_id: `p3_${tid}_refresh` },
          ]},
        ]}],
      };
      return interaction.reply({ ...confirmPanel, ephemeral: true });
    }

    if (action === 'groupdraw_confirm') {
      const postCh = ch.management || ch.schedule;
      if (!postCh) return interaction.reply({ content: '❌ No management channel configured.', ephemeral: true });
      const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid && tt.group_name);
      const teams  = db.get('teams');
      const groups = {};
      for (const tt of ttRows) {
        const g = tt.group_name;
        if (!groups[g]) groups[g] = [];
        groups[g].push(teams.find(t2 => t2.id === tt.team_id)?.name || 'Unknown');
      }
      const drawInner = [
        txt(`# 🎲  Group Draw  —  ${t.name}  S${t.season}`), SEP,
        ...Object.entries(groups).sort().map(([g, names]) =>
          txt(`**Group ${g}**\n${names.map(n => `• ${n}`).join('\n')}`)
        ),
        SEP, txt('-# Night Stars  •  Group Draw'),
      ];
      await postToChannel(cli, postCh, { flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: drawInner }] });
      return interaction.reply({ content: `✅ Group draw posted to <#${postCh}>.`, ephemeral: true });
    }

    // ── Post Bracket ────────────────────────────────────────────────────────
    if (action === 'bracket') {
      const embed = buildKnockoutBracketEmbed ? buildKnockoutBracketEmbed(tid) : null;
      const confirmPanel = {
        flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: [
          txt(`**🏆 Bracket Preview**\nPost bracket to <#${ch.results || 'not set'}>?`),
          SEP,
          { type: 1, components: [
            { type: 2, style: 1, label: 'Confirm Post', custom_id: `p3_${tid}_bracket_confirm` },
            { type: 2, style: 2, label: 'Cancel',        custom_id: `p3_${tid}_refresh` },
          ]},
        ]}],
      };
      await interaction.reply({ ...confirmPanel, ephemeral: true });
      if (embed) await interaction.followUp({ embeds: [embed], ephemeral: true });
      return;
    }

    if (action === 'bracket_confirm') {
      const postCh = ch.results || ch.management;
      if (!postCh) return interaction.reply({ content: '❌ No results channel configured.', ephemeral: true });
      const embed = buildKnockoutBracketEmbed ? buildKnockoutBracketEmbed(tid) : null;
      if (embed) await postToChannel(cli, postCh, { embeds: [embed] });
      return interaction.reply({ content: `✅ Bracket posted to <#${postCh}>.`, ephemeral: true });
    }
  }
}

module.exports = { handleBotolaInteraction };
