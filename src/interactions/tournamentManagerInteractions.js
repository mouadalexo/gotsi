'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { requireManager } = require('../utils/permissions');
const { getTargetChannel } = require('../utils/channelRouter');
const { makeScheduleEmbed } = require('../utils/tournamentEmbeds');
const { buildNewSeasonModal } = require('../panels/managePanel');
const {
  buildTournamentListPanel,
  buildTournamentSubPanel,
  buildMatchPickerPanel,
  buildTeamSearchResultsPanel,
} = require('../panels/tournamentManagerPanel');

// ── Helpers ───────────────────────────────────────────────────────────────────
function noPermission(interaction) {
  return interaction.reply({ content: '❌ Managers only.', ephemeral: true });
}

async function refreshSubPanel(client, tournamentId) {
  try {
    const ref = db.getConfig('managerpanel_ref');
    if (!ref) return;
    const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
    if (msg) await msg.edit(buildTournamentSubPanel(tournamentId)).catch(() => {});
  } catch {}
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleTournamentManagerInteraction(interaction) {
  const id = interaction.customId;

  // ── Back to list ──────────────────────────────────────────────────────────
  if (id === 'tmgr_back') {
    return interaction.update(buildTournamentListPanel());
  }

  // ── Select tournament ─────────────────────────────────────────────────────
  if (id.startsWith('tmgr_t_')) {
    const tid = parseInt(id.replace('tmgr_t_', ''));
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Refresh sub-panel ─────────────────────────────────────────────────────
  if (id.startsWith('tmgr_refresh_')) {
    const tid = parseInt(id.replace('tmgr_refresh_', ''));
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── New season — show template modal ──────────────────────────────────────
  if (id === 'tmgr_new_MCL' || id === 'tmgr_new_NSEL') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = id.replace('tmgr_new_', '');
    const modal = buildNewSeasonModal(template);
    // Reuse existing modal but remap customId for our handler
    modal.setCustomId(`tmgr_create_modal_${template}`);
    return interaction.showModal(modal);
  }

  // ── Create season modal submit ────────────────────────────────────────────
  if (id.startsWith('tmgr_create_modal_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = id.replace('tmgr_create_modal_', '');
    const name     = interaction.fields.getTextInputValue('tournament_name').trim();
    const count    = parseInt(interaction.fields.getTextInputValue('team_count')) || 16;
    const size     = parseInt(interaction.fields.getTextInputValue('group_size')) || 4;
    const deadline = parseInt(interaction.fields.getTextInputValue('deadline_hours') || '0') || null;

    const season = db.get('tournaments').filter(t => t.template === template).length + 1;
    db.insert('tournaments', {
      name, template, season, team_count: count, group_size: size,
      round_deadline_hours: deadline, status: 'setup',
    });

    await refreshListPanel(interaction.client);
    return interaction.reply({ content: `✅ **${name}** created.`, ephemeral: true });
  }

  // ── Add Teams — show search modal ─────────────────────────────────────────
  if (id.startsWith('tmgr_addteams_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid = id.replace('tmgr_addteams_', '');
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`tmgr_team_modal_${tid}`)
        .setTitle('Search & Register Team')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('query').setLabel('Team name (or part of it)')
              .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Real, Bayern, Wydad...').setRequired(true)
          )
        )
    );
  }

  // ── Team search modal submit ──────────────────────────────────────────────
  if (id.startsWith('tmgr_team_modal_')) {
    const tid   = parseInt(id.replace('tmgr_team_modal_', ''));
    const query = interaction.fields.getTextInputValue('query').toLowerCase().trim();
    const enrolled = db.get('tournament_teams').filter(tt => tt.tournament_id === tid).map(tt => tt.team_id);
    const found = db.get('teams').filter(t =>
      t.name.toLowerCase().includes(query) && !enrolled.includes(t.id)
    );

    if (!found.length) {
      await interaction.reply({ content: `❌ No teams found for "${query}".`, ephemeral: true });
      return refreshSubPanel(interaction.client, tid);
    }

    return interaction.update(buildTeamSearchResultsPanel(tid, found));
  }

  // ── Enroll team select menu ───────────────────────────────────────────────
  if (id.startsWith('tmgr_enroll_sel_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid    = parseInt(id.replace('tmgr_enroll_sel_', ''));
    const teamId = parseInt(interaction.values[0]);
    const team   = db.findById('teams', teamId);
    if (!team) return interaction.update(buildTournamentSubPanel(tid));

    const already = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === teamId);
    if (!already) {
      db.insert('tournament_teams', { tournament_id: tid, team_id: teamId, group_name: null, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0, points: 0 });
      db.update('tournaments', tid, { status: 'setup' });
    }

    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Add Player — show search modal ────────────────────────────────────────
  if (id.startsWith('tmgr_addplayer_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid = id.replace('tmgr_addplayer_', '');
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`tmgr_player_modal_${tid}`)
        .setTitle('Assign Player to Team')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('discord_id').setLabel('Player Discord ID or @mention')
              .setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('team_id').setLabel('Team ID (number from DB)')
              .setStyle(TextInputStyle.Short).setPlaceholder('e.g. 5').setRequired(true)
          )
        )
    );
  }

  // ── Player modal submit ───────────────────────────────────────────────────
  if (id.startsWith('tmgr_player_modal_')) {
    const tid      = parseInt(id.replace('tmgr_player_modal_', ''));
    const rawId    = interaction.fields.getTextInputValue('discord_id').trim().replace(/\D/g, '');
    const teamId   = parseInt(interaction.fields.getTextInputValue('team_id').trim());
    const team     = db.findById('teams', teamId);

    if (!team || !rawId) {
      await interaction.reply({ content: '❌ Invalid team ID or Discord ID.', ephemeral: true });
      return refreshSubPanel(interaction.client, tid);
    }

    const existing = db.findOne('players', p => p.discord_id === rawId && p.team_id === teamId);
    if (!existing) db.insert('players', { discord_id: rawId, team_id: teamId });

    await interaction.reply({ content: `✅ <@${rawId}> assigned to **${team.name}**.`, ephemeral: true });
    return refreshSubPanel(interaction.client, tid);
  }

  // ── Draw Groups ───────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_drawgroups_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid   = parseInt(id.replace('tmgr_drawgroups_', ''));
    const t     = db.findById('tournaments', tid);
    const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
    const shuffled = [...ttRows].sort(() => Math.random() - 0.5);
    const groupSize = t?.group_size || 4;
    const letters   = 'ABCDEFGHIJKLMNOP';

    shuffled.forEach((tt, i) => {
      db.update('tournament_teams', tt.id, { group_name: letters[Math.floor(i / groupSize)] });
    });

    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Generate Matches ──────────────────────────────────────────────────────
  if (id.startsWith('tmgr_genmatches_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid   = parseInt(id.replace('tmgr_genmatches_', ''));
    const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);

    // Delete existing pending group matches
    db.deleteWhere('matches', m => m.tournament_id === tid && m.stage === 'group' && m.status === 'pending');

    // Group by group_name
    const groups = {};
    for (const tt of ttRows) {
      const g = tt.group_name || 'A';
      if (!groups[g]) groups[g] = [];
      groups[g].push(tt.team_id);
    }

    // Round-robin per group
    for (const [, gTeams] of Object.entries(groups)) {
      const n = gTeams.length;
      for (let round = 0; round < n - 1; round++) {
        for (let i = 0; i < Math.floor(n / 2); i++) {
          const home = gTeams[i], away = gTeams[n - 1 - i];
          db.insert('matches', { tournament_id: tid, home_team_id: home, away_team_id: away, stage: 'group', round: round + 1, status: 'pending', home_score: null, away_score: null });
        }
        gTeams.splice(1, 0, gTeams.pop()); // rotate
      }
    }

    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Post Schedule ─────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_postschedule_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid  = parseInt(id.replace('tmgr_postschedule_', ''));
    const t    = db.findById('tournaments', tid);
    const pending = db.get('matches').filter(m => m.tournament_id === tid && m.status === 'pending');
    const teams   = db.get('teams');
    const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
    const groupOf = id_ => ttRows.find(tt => tt.team_id === id_)?.group_name || '';

    const rounds = [...new Set(pending.map(m => m.round))].sort((a, b) => a - b);
    const round  = rounds[0] || 1;
    const byRound = pending.filter(m => m.round === round).map(m => ({
      home: teams.find(t => t.id === m.home_team_id)?.name || 'TBD',
      away: teams.find(t => t.id === m.away_team_id)?.name || 'TBD',
      group: groupOf(m.home_team_id),
    }));

    const payload = makeScheduleEmbed(byRound, `Round ${round}`, t.name);
    const scheduleCh = await getTargetChannel(interaction.guild, t.template, 'matchSchedule');
    const target = scheduleCh || interaction.channel;
    await target.send(payload);

    await interaction.reply({ content: `✅ Schedule for Round ${round} posted to ${scheduleCh ? `<#${scheduleCh.id}>` : 'this channel'}.`, ephemeral: true });
    return interaction.message.edit(buildTournamentSubPanel(tid)).catch(() => {});
  }

  // ── Add Result — show match picker ────────────────────────────────────────
  if (id.startsWith('tmgr_addresult_')) {
    const tid = parseInt(id.replace('tmgr_addresult_', ''));
    return interaction.update(buildMatchPickerPanel(tid));
  }

  // ── Match select menu ─────────────────────────────────────────────────────
  if (id.startsWith('tmgr_match_sel_')) {
    const tid     = parseInt(id.replace('tmgr_match_sel_', ''));
    const matchId = parseInt(interaction.values[0]);
    const match   = db.findById('matches', matchId);
    const teams   = db.get('teams');
    const home    = teams.find(t => t.id === match?.home_team_id)?.name || 'Home';
    const away    = teams.find(t => t.id === match?.away_team_id)?.name || 'Away';

    return interaction.showModal(
      new ModalBuilder()
        .setCustomId(`tmgr_result_modal_${matchId}_${tid}`)
        .setTitle(`${home} vs ${away}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('home_score').setLabel(`${home} Score`)
              .setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('away_score').setLabel(`${away} Score`)
              .setStyle(TextInputStyle.Short).setPlaceholder('0').setRequired(true)
          )
        )
    );
  }

  // ── Result modal submit ───────────────────────────────────────────────────
  if (id.startsWith('tmgr_result_modal_')) {
    const parts   = id.replace('tmgr_result_modal_', '').split('_');
    const matchId = parseInt(parts[0]);
    const tid     = parseInt(parts[1]);

    const hs = parseInt(interaction.fields.getTextInputValue('home_score'));
    const as_ = parseInt(interaction.fields.getTextInputValue('away_score'));

    if (isNaN(hs) || isNaN(as_)) {
      return interaction.reply({ content: '❌ Invalid scores.', ephemeral: true });
    }

    const match = db.findById('matches', matchId);
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });

    db.update('matches', matchId, { status: 'played', home_score: hs, away_score: as_ });

    // Update standings for group matches
    if (match.stage === 'group') {
      const homeWon = hs > as_, awayWon = as_ > hs, draw = hs === as_;
      const homeTT  = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === match.home_team_id);
      const awayTT  = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === match.away_team_id);
      if (homeTT) db.update('tournament_teams', homeTT.id, {
        wins: (homeTT.wins||0) + (homeWon?1:0), draws: (homeTT.draws||0) + (draw?1:0), losses: (homeTT.losses||0) + (awayWon?1:0),
        goals_for: (homeTT.goals_for||0) + hs, goals_against: (homeTT.goals_against||0) + as_,
        points: (homeTT.points||0) + (homeWon?3:draw?1:0),
      });
      if (awayTT) db.update('tournament_teams', awayTT.id, {
        wins: (awayTT.wins||0) + (awayWon?1:0), draws: (awayTT.draws||0) + (draw?1:0), losses: (awayTT.losses||0) + (homeWon?1:0),
        goals_for: (awayTT.goals_for||0) + as_, goals_against: (awayTT.goals_against||0) + hs,
        points: (awayTT.points||0) + (awayWon?3:draw?1:0),
      });
    }

    await interaction.reply({ content: `✅ Result saved: **${hs} — ${as_}**`, ephemeral: true });
    return refreshSubPanel(interaction.client, tid);
  }

  // ── Start Knockout ────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_knockout_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid  = parseInt(id.replace('tmgr_knockout_', ''));
    const t    = db.findById('tournaments', tid);
    const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
    const groups = {};
    for (const tt of ttRows) {
      const g = tt.group_name || 'A';
      if (!groups[g]) groups[g] = [];
      groups[g].push(tt);
    }

    const qualifiers = [];
    for (const gTeams of Object.values(groups)) {
      gTeams.sort((a, b) => (b.points||0) - (a.points||0));
      if (gTeams[0]) qualifiers.push(gTeams[0].team_id);
      if (gTeams[1]) qualifiers.push(gTeams[1].team_id);
    }

    if (qualifiers.length < 2) {
      return interaction.reply({ content: '❌ Need at least 2 qualified teams.', ephemeral: true });
    }

    const shuffled = [...qualifiers].sort(() => Math.random() - 0.5);
    const numMatches = Math.floor(shuffled.length / 2);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      db.insert('matches', { tournament_id: tid, home_team_id: shuffled[i], away_team_id: shuffled[i+1], stage: 'knockout', round: numMatches, leg: 1, status: 'pending', home_score: null, away_score: null });
    }

    db.update('tournaments', tid, { status: 'active' });
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Close Season ──────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_closeseason_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('tmgr_closeseason_', ''));
    db.update('tournaments', tid, { status: 'finished' });
    return interaction.update(buildTournamentSubPanel(tid));
  }
}

async function refreshListPanel(client) {
  try {
    const ref = db.getConfig('managerpanel_ref');
    if (!ref) return;
    const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
    if (msg) await msg.edit(buildTournamentListPanel()).catch(() => {});
  } catch {}
}

module.exports = { handleTournamentManagerInteraction };
