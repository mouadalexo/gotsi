'use strict';
const {
  ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder, EmbedBuilder,
} = require('discord.js');
const { db } = require('../utils/database');
const { requireManager } = require('../utils/permissions');
const { successEmbed, errorEmbed, warningEmbed, COLORS, E } = require('../utils/embeds');
const {
  buildManagePanelEmbed, buildManagePanelRows,
  buildNewSeasonModal, buildTeamSearchModal, buildPlayerSearchModal, buildAutoScheduleModal,
  getActiveTournament,
} = require('../panels/managePanel');
const { buildGroupStandingsEmbed, buildStandingsRow, buildKnockoutBracketEmbed } = require('../panels/standingsPanel');
const { buildPendingMatchesSelect, buildResultModal } = require('../panels/resultsPanel');
const { getTargetChannel } = require('../utils/channelRouter');
const { ensureTeamLogos, ensureTeamLogo } = require('../utils/logoFetcher');
const { searchMembers } = require('../utils/memberSearch');
const { DEFAULT_TEAMS } = require('../data/seed');
const { generateScheduleImage, generateStandingsImage } = require('../utils/imageGen');

// Active auto-schedule timers: tournamentId -> setTimeout handle
const autoScheduleTimers = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTemplate(customId) {
  const parts = customId.split('_');
  const last = parts[parts.length - 1];
  return (last === 'ALL' || !last) ? null : last;
}

async function refreshManagePanel(interaction, template) {
  try {
    const msgs = await interaction.channel.messages.fetch({ limit: 20 });
    const panelMsg = msgs.find(m =>
      m.author.id === interaction.client.user.id &&
      m.embeds.length > 0 &&
      m.embeds[0].title?.includes('Manager Panel')
    );
    if (panelMsg) {
      await panelMsg.edit({
        embeds: [buildManagePanelEmbed(template)],
        components: buildManagePanelRows(template),
      });
    }
  } catch {}
}

async function postScheduleImage(guild, tournament, client) {
  const matches = db.get('matches').filter(m => m.tournament_id === tournament.id && m.status === 'pending');
  if (!matches.length) return;

  const teams = db.get('teams');
  await ensureTeamLogos(teams);

  const ttEntries = db.get('tournament_teams').filter(tt => tt.tournament_id === tournament.id);
  const groupOfTeam = {};
  for (const tt of ttEntries) groupOfTeam[tt.team_id] = tt.group_name || 'A';

  const byGroup = {};
  for (const m of matches) {
    const g = groupOfTeam[m.home_team_id] || 'A';
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(m);
  }

  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
  const currentRound = rounds[0] || 1;
  const totalRounds  = rounds.length;

  const buf = await generateScheduleImage(currentRound, totalRounds, byGroup, teams, tournament);
  const scheduleCh = await getTargetChannel(guild, tournament.template, 'matchSchedule');
  if (scheduleCh) {
    await scheduleCh.send({
      content: `📅 **${tournament.name} — Round ${currentRound} Schedule**`,
      files: [new AttachmentBuilder(buf, { name: 'schedule.png' })],
    });
  }
}

// Exported: called from resultInteractions after saving a result
async function postResultAndNextRound(guild, match, tournament, homeTeam, awayTeam, client) {
  const teams = db.get('teams');
  await ensureTeamLogos([homeTeam, awayTeam]);

  // Post standings embed + image to results channel
  const resultsCh = await getTargetChannel(guild, tournament.template, 'results');

  if (resultsCh && match.stage === 'group') {
    const standingsEmbed = buildGroupStandingsEmbed(tournament.id);
    const row = buildStandingsRow(tournament.id);

    // Try to edit existing pinned standings message, else post new
    const storedMsgId = db.getConfig(`standings_msg_${tournament.id}`);
    let posted = false;
    if (storedMsgId) {
      try {
        const old = await resultsCh.messages.fetch(storedMsgId);
        await old.edit({ embeds: [standingsEmbed], components: [row] });
        posted = true;
      } catch {}
    }
    if (!posted) {
      const msg = await resultsCh.send({ embeds: [standingsEmbed], components: [row] });
      db.setConfig(`standings_msg_${tournament.id}`, msg.id);
    }

    // Post standings image
    try {
      const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tournament.id);
      const groups = {};
      for (const tt of ttRows) {
        const g = tt.group_name || 'A';
        if (!groups[g]) groups[g] = [];
        groups[g].push({ ...teams.find(t => t.id === tt.team_id), ...tt });
      }
      for (const g of Object.keys(groups)) {
        groups[g].sort((a, b) => (b.points || 0) - (a.points || 0));
      }
      const standBuf = await generateStandingsImage(tournament, groups);
      await resultsCh.send({ files: [new AttachmentBuilder(standBuf, { name: 'standings.png' })] });
    } catch {}
  }

  // Check if all matches in current round are done → post next round schedule
  if (match.stage === 'group') {
    const currentRound = match.round;
    const allRoundMatches = db.get('matches').filter(m =>
      m.tournament_id === tournament.id && m.round === currentRound && m.stage === 'group'
    );
    const allDone = allRoundMatches.every(m => m.status === 'played');

    if (allDone) {
      const nextRound = currentRound + 1;
      const nextMatches = db.get('matches').filter(m =>
        m.tournament_id === tournament.id && m.round === nextRound && m.status === 'pending'
      );
      if (nextMatches.length > 0) {
        try {
          await postScheduleImage(guild, tournament, client);
          if (resultsCh) {
            await resultsCh.send({
              embeds: [new EmbedBuilder()
                .setColor(COLORS.info)
                .setTitle(`📅  Round ${nextRound} Schedule Posted`)
                .setDescription(
                  `All Round ${currentRound} matches complete!\n` +
                  `Round **${nextRound}** schedule has been posted in the schedule channel.`
                )
                .setTimestamp()],
            });
          }
        } catch {}
      }
    }
  }
}

// ── Main interaction handler ──────────────────────────────────────────────────
async function handleManageInteraction(interaction, client) {
  const id = interaction.customId;

  // ── New Season button ────────────────────────────────────────────────────────
  if (id.startsWith('mgr_new_season_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = extractTemplate(id) || 'NSEL';
    return interaction.showModal(buildNewSeasonModal(template));
  }

  // ── New Season modal ─────────────────────────────────────────────────────────
  if (id.startsWith('mgr_create_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template      = id.replace('mgr_create_modal_', '');
    const name          = interaction.fields.getTextInputValue('tournament_name').trim();
    const teamCount     = parseInt(interaction.fields.getTextInputValue('team_count'))    || 16;
    const groupSize     = parseInt(interaction.fields.getTextInputValue('group_size'))    || 4;
    const deadlineRaw   = interaction.fields.getTextInputValue('deadline_hours') || '';
    const deadlineHours = deadlineRaw ? parseInt(deadlineRaw) : null;

    const existing = db.get('tournaments').filter(t => t.template === template);
    const season   = existing.length + 1;

    db.insert('tournaments', {
      name, template, season,
      type: template === 'MCL' ? 'duo' : 'solo',
      team_count: teamCount,
      group_size: groupSize,
      round_deadline_hours: deadlineHours,
      status: 'setup',
      channel_id: interaction.channelId,
    });

    await refreshManagePanel(interaction, template);
    return interaction.reply({
      embeds: [successEmbed('Season Created',
        `**${name}** (Season ${season}) created!\n` +
        `Template: \`${template}\`  |  Teams: \`${teamCount}\`  |  Groups of \`${groupSize}\`\n` +
        (deadlineHours ? `⏱️ Deadline: **${deadlineHours}h** per round` : '⏱️ No deadline set')
      )],
      ephemeral: true,
    });
  }

  // ── Search & Register Teams button ──────────────────────────────────────────
  if (id.startsWith('mgr_search_teams_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const t = getActiveTournament(extractTemplate(id));
    if (!t) return interaction.reply({ embeds: [warningEmbed('No Tournament', 'Create a season first.')], ephemeral: true });
    return interaction.showModal(buildTeamSearchModal(t.id));
  }

  // ── Team search modal ────────────────────────────────────────────────────────
  if (id.startsWith('mgr_team_search_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tournamentId = parseInt(id.replace('mgr_team_search_modal_', ''));
    const query = interaction.fields.getTextInputValue('search_query').trim().toLowerCase();

    // Search DEFAULT_TEAMS + existing DB teams
    const allKnown = [...DEFAULT_TEAMS];
    for (const t of db.get('teams')) {
      if (!allKnown.find(k => k.name === t.name)) allKnown.push(t);
    }

    const found = allKnown.filter(t =>
      t.name.toLowerCase().includes(query) ||
      (t.short_name || '').toLowerCase().includes(query)
    ).slice(0, 25);

    if (!found.length) {
      return interaction.reply({
        embeds: [warningEmbed('No Results', `No teams found for **"${query}"**.\nTry a broader search term like "Real", "Man", "Bayern"...`)],
        ephemeral: true,
      });
    }

    const enrolled = db.get('tournament_teams')
      .filter(tt => tt.tournament_id === tournamentId)
      .map(tt => db.findById('teams', tt.team_id)?.name)
      .filter(Boolean);

    const options = found.map(t => ({
      label: t.name,
      value: t.name,
      emoji: (t.emoji || '⚽').slice(0, 2),
      description: `${t.short_name || '?'} | ${t.category || 'team'}${enrolled.includes(t.name) ? ' ✅' : ''}`,
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`mgr_team_enroll_${tournamentId}`)
        .setPlaceholder('Select teams to register...')
        .setMinValues(1)
        .setMaxValues(Math.min(options.length, 10))
        .addOptions(options)
    );

    return interaction.reply({
      content: `🔍 **${found.length}** team(s) found for "${query}" — select to register:`,
      components: [row],
      ephemeral: true,
    });
  }

  // ── Enroll teams from search ─────────────────────────────────────────────────
  if (id.startsWith('mgr_team_enroll_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tournamentId = parseInt(id.replace('mgr_team_enroll_', ''));
    const tournament   = db.findById('tournaments', tournamentId);
    const added = [];

    for (const teamName of interaction.values) {
      let team = db.findOne('teams', t => t.name === teamName);
      if (!team) {
        const seed = DEFAULT_TEAMS.find(t => t.name === teamName);
        if (seed) team = db.insert('teams', seed);
      }
      if (!team) continue;

      // Kick off logo fetch in background (non-blocking)
      ensureTeamLogo(team).catch(() => {});

      const already = db.findOne('tournament_teams',
        tt => tt.tournament_id === tournamentId && tt.team_id === team.id
      );
      if (!already) {
        db.insert('tournament_teams', {
          tournament_id: tournamentId, team_id: team.id,
          group_name: null, points: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0,
        });
        added.push(`${team.emoji || '⚽'} ${team.name}`);
      }
    }

    if (tournament) await refreshManagePanel(interaction, tournament.template);
    return interaction.update({
      content: added.length
        ? `✅ Registered:\n${added.map(n => `• ${n}`).join('\n')}`
        : '⚠️ All selected teams were already registered.',
      components: [],
    });
  }

  // ── Add Player button ────────────────────────────────────────────────────────
  if (id.startsWith('mgr_add_player_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const t = getActiveTournament(extractTemplate(id));
    if (!t) return interaction.reply({ embeds: [warningEmbed('No Tournament', 'Create a season first.')], ephemeral: true });
    return interaction.showModal(buildPlayerSearchModal(t.id));
  }

  // ── Player search modal ──────────────────────────────────────────────────────
  if (id.startsWith('mgr_player_search_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tournamentId = parseInt(id.replace('mgr_player_search_modal_', ''));
    const query = interaction.fields.getTextInputValue('member_query').trim();

    const members = await searchMembers(interaction.guild, query);
    if (!members.length) {
      return interaction.reply({
        embeds: [warningEmbed('No Members Found', `No server members match **"${query}"**.\nTry a different name or spelling.`)],
        ephemeral: true,
      });
    }

    const options = members.slice(0, 25).map(m => ({
      label: m.user.globalName || m.user.username,
      value: m.user.id,
      description: `@${m.user.username}  |  ${m.displayName}`,
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`mgr_player_select_${tournamentId}`)
        .setPlaceholder('Select the player...')
        .addOptions(options)
    );

    return interaction.reply({
      content: `👤 **${members.length}** member(s) found — select the player:`,
      components: [row],
      ephemeral: true,
    });
  }

  // ── Player selected → pick team ──────────────────────────────────────────────
  if (id.startsWith('mgr_player_select_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tournamentId = parseInt(id.replace('mgr_player_select_', ''));
    const discordId    = interaction.values[0];

    const enrolled = db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId);
    if (!enrolled.length) {
      return interaction.update({ content: '⚠️ No teams registered in this tournament yet.', components: [] });
    }

    const options = enrolled.slice(0, 25).map(tt => {
      const team = db.findById('teams', tt.team_id) || { name: 'Unknown', emoji: '⚽' };
      return {
        label: team.name,
        value: `${discordId}__${tt.team_id}`,
        emoji: (team.emoji || '⚽').slice(0, 2),
      };
    });

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`mgr_player_assign_${tournamentId}`)
        .setPlaceholder('Assign player to which team?')
        .addOptions(options)
    );

    return interaction.update({ content: `👥 Select the team for <@${discordId}>:`, components: [row] });
  }

  // ── Player assigned to team ──────────────────────────────────────────────────
  if (id.startsWith('mgr_player_assign_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tournamentId = parseInt(id.replace('mgr_player_assign_', ''));
    const [discordId, teamIdStr] = interaction.values[0].split('__');
    const teamId = parseInt(teamIdStr);
    const team   = db.findById('teams', teamId);

    let username = discordId;
    try {
      const member = await interaction.guild.members.fetch(discordId);
      username = member.user.globalName || member.user.username;
    } catch {}

    const existing = db.findOne('players', p => p.discord_id === discordId);
    if (existing) {
      db.update('players', existing.id, { team_id: teamId, discord_username: username });
    } else {
      db.insert('players', { team_id: teamId, discord_id: discordId, discord_username: username });
    }

    return interaction.update({
      content: `✅ <@${discordId}> assigned to **${team?.emoji || '⚽'} ${team?.name || 'team'}**.`,
      components: [],
    });
  }

  // ── Draw Groups ──────────────────────────────────────────────────────────────
  if (id.startsWith('mgr_gen_groups_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = extractTemplate(id);
    const t = getActiveTournament(template);
    if (!t) return interaction.reply({ embeds: [warningEmbed('No Tournament', 'Create a season first.')], ephemeral: true });

    const ttEntries = db.get('tournament_teams').filter(tt => tt.tournament_id === t.id);
    if (!ttEntries.length) return interaction.reply({ embeds: [warningEmbed('No Teams', 'Register teams first.')], ephemeral: true });

    const shuffled = [...ttEntries].sort(() => Math.random() - 0.5);
    const groupSize = t.group_size || 4;
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < shuffled.length; i++) {
      db.update('tournament_teams', shuffled[i].id, { group_name: letters[Math.floor(i / groupSize)] });
    }

    const groupEmbed = buildGroupStandingsEmbed(t.id);
    const scheduleCh = await getTargetChannel(interaction.guild, t.template, 'matchSchedule');
    if (scheduleCh && groupEmbed) await scheduleCh.send({ embeds: [groupEmbed] });

    await refreshManagePanel(interaction, template);
    return interaction.reply({ embeds: [groupEmbed || successEmbed('Groups Drawn', 'Groups have been randomized!')], ephemeral: false });
  }

  // ── Generate Matches ─────────────────────────────────────────────────────────
  if (id.startsWith('mgr_gen_matches_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = extractTemplate(id);
    const t = getActiveTournament(template);
    if (!t) return interaction.reply({ embeds: [warningEmbed('No Tournament', 'Create a season first.')], ephemeral: true });

    const ttEntries = db.get('tournament_teams').filter(tt => tt.tournament_id === t.id);
    const groups = {};
    for (const tt of ttEntries) {
      const g = tt.group_name || 'A';
      if (!groups[g]) groups[g] = [];
      groups[g].push(tt);
    }

    // Remove existing pending group matches before regenerating
    db.deleteWhere('matches', m => m.tournament_id === t.id && m.status === 'pending' && m.stage === 'group');

    const allMatches = [];
    let round = 1;
    for (const groupTeams of Object.values(groups)) {
      for (let i = 0; i < groupTeams.length; i++) {
        for (let j = i + 1; j < groupTeams.length; j++) {
          allMatches.push(db.insert('matches', {
            tournament_id: t.id,
            home_team_id: groupTeams[i].team_id,
            away_team_id: groupTeams[j].team_id,
            stage: 'group', round, leg: 1, status: 'pending',
            home_score: null, away_score: null,
          }));
        }
      }
      round++;
    }

    await refreshManagePanel(interaction, template);
    return interaction.reply({
      embeds: [successEmbed('Matches Generated',
        `Generated **${allMatches.length}** fixtures across **${Object.keys(groups).length}** groups.\n` +
        `Press **Post Schedule** to publish the schedule image.`
      )],
      ephemeral: true,
    });
  }

  // ── Post Schedule (manual) ───────────────────────────────────────────────────
  if (id.startsWith('mgr_post_schedule_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = extractTemplate(id);
    const t = getActiveTournament(template);
    if (!t) return interaction.reply({ embeds: [warningEmbed('No Tournament', 'Create a season first.')], ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    await postScheduleImage(interaction.guild, t, client);
    return interaction.editReply({ embeds: [successEmbed('Schedule Posted', 'Match schedule image sent to the schedule channel!')] });
  }

  // ── Auto-Schedule button ─────────────────────────────────────────────────────
  if (id.startsWith('mgr_auto_schedule_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const t = getActiveTournament(extractTemplate(id));
    if (!t) return interaction.reply({ embeds: [warningEmbed('No Tournament', 'Create a season first.')], ephemeral: true });
    return interaction.showModal(buildAutoScheduleModal(t.id));
  }

  // ── Auto-Schedule modal ──────────────────────────────────────────────────────
  if (id.startsWith('mgr_auto_schedule_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tournamentId  = parseInt(id.replace('mgr_auto_schedule_modal_', ''));
    const delayHours    = parseFloat(interaction.fields.getTextInputValue('delay_hours')) || 24;
    const t             = db.findById('tournaments', tournamentId);
    if (!t) return interaction.reply({ embeds: [errorEmbed('Not Found', 'Tournament not found.')], ephemeral: true });

    const fireAt = Date.now() + delayHours * 3600000;
    db.setConfig(`auto_schedule_${tournamentId}`, fireAt);

    if (autoScheduleTimers.has(tournamentId)) clearTimeout(autoScheduleTimers.get(tournamentId));
    const timer = setTimeout(async () => {
      try {
        await postScheduleImage(interaction.guild, t, client);
        db.setConfig(`auto_schedule_${tournamentId}`, null);
        autoScheduleTimers.delete(tournamentId);
      } catch (e) { console.error('[AutoSchedule]', e); }
    }, delayHours * 3600000);
    autoScheduleTimers.set(tournamentId, timer);

    const fireDate = new Date(fireAt).toUTCString();
    return interaction.reply({
      embeds: [successEmbed('Auto-Schedule Set',
        `Schedule will be posted automatically in **${delayHours}h**.\n📅 Fires at: **${fireDate}**`)],
      ephemeral: true,
    });
  }

  // ── Add Result button ────────────────────────────────────────────────────────
  if (id.startsWith('mgr_add_result_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = extractTemplate(id);
    const t = getActiveTournament(template);
    if (!t) return interaction.reply({ embeds: [warningEmbed('No Tournament', 'Create a season first.')], ephemeral: true });

    const matchMenu = buildPendingMatchesSelect(t.id);
    if (!matchMenu) return interaction.reply({
      embeds: [successEmbed('All Done!', 'No pending matches — all results have been recorded.')],
      ephemeral: true,
    });

    return interaction.reply({ content: `${E.arrow} Select a match:`, components: [matchMenu], ephemeral: true });
  }

  // ── Match selected (from manage panel) ──────────────────────────────────────
  if (id.startsWith('match_select_')) {
    const matchId = parseInt(interaction.values[0]);
    return interaction.showModal(buildResultModal(matchId));
  }

  // ── Start Knockout ───────────────────────────────────────────────────────────
  if (id.startsWith('mgr_knockout_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = extractTemplate(id);
    const t = getActiveTournament(template);
    if (!t) return interaction.reply({ embeds: [warningEmbed('No Tournament', 'Create a season first.')], ephemeral: true });

    const groupNames = [...new Set(
      db.get('tournament_teams').filter(tt => tt.tournament_id === t.id)
        .map(tt => tt.group_name).filter(Boolean)
    )].sort();

    const qualifiers = [];
    for (const g of groupNames) {
      const top2 = db.get('tournament_teams')
        .filter(tt => tt.tournament_id === t.id && tt.group_name === g)
        .sort((a, b) => (b.points - a.points) || ((b.goals_for - b.goals_against) - (a.goals_for - a.goals_against)))
        .slice(0, 2).map(tt => tt.team_id);
      qualifiers.push(...top2);
    }

    if (qualifiers.length < 2) return interaction.reply({ embeds: [warningEmbed('Not Enough Teams', 'Need at least 2 qualified teams.')], ephemeral: true });

    const shuffled = [...qualifiers].sort(() => Math.random() - 0.5);
    const numMatches = Math.floor(shuffled.length / 2);
    const round = numMatches;
    const isFinal = numMatches === 1;

    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      db.insert('matches', { tournament_id: t.id, home_team_id: shuffled[i], away_team_id: shuffled[i + 1], stage: 'knockout', round, leg: 1, status: 'pending', home_score: null, away_score: null });
      if (isFinal) db.insert('matches', { tournament_id: t.id, home_team_id: shuffled[i + 1], away_team_id: shuffled[i], stage: 'knockout', round, leg: 2, status: 'pending', home_score: null, away_score: null });
    }

    db.update('tournaments', t.id, { status: 'active' });

    const bracketEmbed = buildKnockoutBracketEmbed(t.id);
    const scheduleCh = await getTargetChannel(interaction.guild, t.template, 'matchSchedule') || interaction.channel;
    if (bracketEmbed) await scheduleCh.send({ embeds: [bracketEmbed] });

    await refreshManagePanel(interaction, template);
    return interaction.reply({ embeds: [bracketEmbed || successEmbed('Knockout Started', 'Knockout bracket generated!')], ephemeral: false });
  }

  // ── View Bracket ─────────────────────────────────────────────────────────────
  if (id.startsWith('mgr_view_bracket_')) {
    const template = extractTemplate(id);
    const t = getActiveTournament(template);
    if (!t) return interaction.reply({ embeds: [warningEmbed('No Tournament', 'No active tournament.')], ephemeral: true });
    const bracketEmbed = buildKnockoutBracketEmbed(t.id);
    return interaction.reply({ embeds: bracketEmbed ? [bracketEmbed] : [warningEmbed('No Bracket', 'No knockout matches yet.')], ephemeral: true });
  }

  // ── Close Season ─────────────────────────────────────────────────────────────
  if (id.startsWith('mgr_close_season_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = extractTemplate(id);
    const t = getActiveTournament(template);
    if (!t) return interaction.reply({ embeds: [warningEmbed('No Tournament', 'No active tournament.')], ephemeral: true });

    db.update('tournaments', t.id, { status: 'finished' });
    await refreshManagePanel(interaction, template);
    return interaction.reply({ embeds: [successEmbed('Season Closed', `**${t.name}** marked as finished.`)], ephemeral: true });
  }
}

function noPermission(interaction) {
  return interaction.reply({ embeds: [warningEmbed('No Permission', 'Only managers can do this.')], ephemeral: true });
}

module.exports = { handleManageInteraction, postResultAndNextRound };
