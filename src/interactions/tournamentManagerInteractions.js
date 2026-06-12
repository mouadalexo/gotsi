'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { requireManager } = require('../utils/permissions');
const { getTargetChannel } = require('../utils/channelRouter');
const { makeSchedulePost, makeResultsPost } = require('../utils/tournamentEmbeds');
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

// Reverse a played group match's effect on standings (used when editing an existing result)
function _reverseGroupStandings(match, tournamentId) {
  const hs = match.home_score, as_ = match.away_score;
  if (hs == null || as_ == null) return;
  const t  = db.findById('tournaments', tournamentId);
  const wp = t?.win_pts  ?? 3;
  const dp = t?.draw_pts ?? 1;
  const lp = t?.loss_pts ?? 0;
  const homeWon = hs > as_, awayWon = as_ > hs, draw = hs === as_;
  for (const [teamId, scored, conceded, won, lost, drew] of [
    [match.home_team_id, hs, as_, homeWon, awayWon, draw],
    [match.away_team_id, as_, hs, awayWon, homeWon, draw],
  ]) {
    const tt = db.findOne('tournament_teams', r => r.tournament_id === tournamentId && r.team_id === teamId);
    if (tt) db.update('tournament_teams', tt.id, {
      goals_for:     Math.max(0, (tt.goals_for     || 0) - scored),
      goals_against: Math.max(0, (tt.goals_against || 0) - conceded),
      wins:          Math.max(0, (tt.wins          || 0) - (won  ? 1 : 0)),
      draws:         Math.max(0, (tt.draws         || 0) - (drew ? 1 : 0)),
      losses:        Math.max(0, (tt.losses        || 0) - (lost ? 1 : 0)),
      points:        Math.max(0, (tt.points        || 0) - (won ? wp : drew ? dp : lp)),
    });
  }
}

// Auto-advance knockout: once all matches in the current round are played,
// generate the next round from winners (or close the tournament if the final is done).
async function tryAdvanceKnockout(client, tid, currentRound) {
  const roundMatches = db.get('matches').filter(m =>
    m.tournament_id === tid && m.stage === 'knockout' && m.round === currentRound
  );
  if (!roundMatches.length || roundMatches.some(m => m.status !== 'played')) return;

  const nextRound = currentRound / 2;

  // Final just finished — close the tournament
  if (nextRound < 1) {
    db.update('tournaments', tid, { status: 'finished' });
    return;
  }

  // Collect winners in bracket order (preserve seeding)
  const winners = roundMatches.map(m => {
    if (m.home_score > m.away_score) return m.home_team_id;
    if (m.away_score > m.home_score) return m.away_team_id;
    return m.pen_winner ?? m.home_team_id; // draw resolved by penalties
  });

  // Pair consecutive winners: 1 vs 2, 3 vs 4, ...
  for (let i = 0; i + 1 < winners.length; i += 2) {
    db.insert('matches', {
      tournament_id: tid,
      home_team_id:  winners[i],
      away_team_id:  winners[i + 1],
      stage:         'knockout',
      round:         nextRound,
      leg:           1,
      status:        'pending',
      home_score:    null,
      away_score:    null,
    });
  }
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
  if (id === 'tmgr_new_MCL' || id === 'tmgr_new_EL') {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const template = id.replace('tmgr_new_', '');
    const modal = buildNewSeasonModal(template);
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
    const tid    = parseInt(id.replace('tmgr_drawgroups_', ''));
    const t      = db.findById('tournaments', tid);
    const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
    const shuffled  = [...ttRows].sort(() => Math.random() - 0.5);
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
    const tid        = parseInt(id.replace('tmgr_genmatches_', ''));
    const t          = db.findById('tournaments', tid);
    const encounters = Math.max(1, t?.encounters || 1);
    const ttRows     = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);

    // Delete existing pending group matches
    db.deleteWhere('matches', m => m.tournament_id === tid && m.stage === 'group' && m.status === 'pending');

    // Group teams by group_name
    const groups = {};
    for (const tt of ttRows) {
      const g = tt.group_name || 'A';
      if (!groups[g]) groups[g] = [];
      groups[g].push(tt.team_id);
    }

    // Round-robin per group using Berger rotation.
    // Odd-n groups use a null "bye" slot so every pair is generated correctly.
    // encounters=2 generates a return leg (home/away swapped) as extra rounds.
    for (const [, gTeams] of Object.entries(groups)) {
      const rawN = gTeams.length;
      const teams = rawN % 2 === 0 ? [...gTeams] : [...gTeams, null]; // pad to even
      const n = teams.length;

      for (let enc = 0; enc < encounters; enc++) {
        const roundTeams = [...teams];
        const roundOffset = enc * (n - 1); // round numbers for 2nd encounter continue from where 1st left off
        for (let round = 0; round < n - 1; round++) {
          for (let i = 0; i < n / 2; i++) {
            // Swap home/away for the return leg (enc > 0)
            const home = enc === 0 ? roundTeams[i]         : roundTeams[n - 1 - i];
            const away = enc === 0 ? roundTeams[n - 1 - i] : roundTeams[i];
            if (home === null || away === null) continue; // bye — skip
            db.insert('matches', {
              tournament_id: tid,
              home_team_id:  home,
              away_team_id:  away,
              stage:         'group',
              round:         roundOffset + round + 1,
              status:        'pending',
              home_score:    null,
              away_score:    null,
            });
          }
          roundTeams.splice(1, 0, roundTeams.pop()); // Berger table rotation
        }
      }
    }

    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Post Schedule ─────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_postschedule_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid     = parseInt(id.replace('tmgr_postschedule_', ''));
    const t       = db.findById('tournaments', tid);
    const pending = db.get('matches').filter(m => m.tournament_id === tid && m.status === 'pending');
    const rounds  = [...new Set(pending.map(m => m.round))].sort((a, b) => a - b);
    const round   = rounds[0] || 1;

    const scheduleCh = await getTargetChannel(interaction.guild, t.template, 'matchSchedule').catch(() => null);
    const target     = scheduleCh || interaction.channel;
    const payload    = makeSchedulePost(tid, round);
    if (payload) await target.send(payload).catch(() => {});

    await interaction.reply({ content: `✅ Round ${round} schedule posted to ${scheduleCh ? `<#${scheduleCh.id}>` : 'this channel'}.`, ephemeral: true });
    return interaction.message?.edit(buildTournamentSubPanel(tid)).catch(() => {});
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
    const isKO    = match?.stage === 'knockout';

    const modal = new ModalBuilder()
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
        ),
      );

    if (isKO) {
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('home_pens').setLabel(`${home} Penalties (draw only)`)
            .setStyle(TextInputStyle.Short).setPlaceholder('Leave blank if not a draw').setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('away_pens').setLabel(`${away} Penalties (draw only)`)
            .setStyle(TextInputStyle.Short).setPlaceholder('Leave blank if not a draw').setRequired(false)
        ),
      );
    }

    return interaction.showModal(modal);
  }

  // ── Result modal submit ───────────────────────────────────────────────────
  if (id.startsWith('tmgr_result_modal_')) {
    const parts   = id.replace('tmgr_result_modal_', '').split('_');
    const matchId = parseInt(parts[0]);
    const tid     = parseInt(parts[1]);

    const hs  = parseInt(interaction.fields.getTextInputValue('home_score'));
    const as_ = parseInt(interaction.fields.getTextInputValue('away_score'));

    if (isNaN(hs) || isNaN(as_)) {
      return interaction.reply({ content: '❌ Invalid scores.', ephemeral: true });
    }

    const match = db.findById('matches', matchId);
    if (!match) return interaction.reply({ content: '❌ Match not found.', ephemeral: true });

    const t  = db.findById('tournaments', tid);
    const wp = t?.win_pts  ?? 3;
    const dp = t?.draw_pts ?? 1;
    const lp = t?.loss_pts ?? 0;

    // ── Knockout result ──────────────────────────────────────────────────
    if (match.stage === 'knockout') {
      if (hs === as_) {
        let hp = NaN, ap = NaN;
        try { hp = parseInt(interaction.fields.getTextInputValue('home_pens')); } catch {}
        try { ap = parseInt(interaction.fields.getTextInputValue('away_pens')); } catch {}
        if (isNaN(hp) || isNaN(ap) || hp === ap) {
          return interaction.reply({ content: '❌ Knockout draw — fill in both Penalty fields with different scores.', ephemeral: true });
        }
        const penWinner = hp > ap ? match.home_team_id : match.away_team_id;
        db.update('matches', matchId, {
          status: 'played', home_score: hs, away_score: as_,
          home_pens: hp, away_pens: ap, pen_winner: penWinner,
        });
      } else {
        db.update('matches', matchId, {
          status: 'played', home_score: hs, away_score: as_,
          home_pens: null, away_pens: null, pen_winner: null,
        });
      }
      await tryAdvanceKnockout(interaction.client, tid, match.round);
      await interaction.reply({ content: `✅ KO result saved: **${hs} — ${as_}**`, ephemeral: true });
      return interaction.message?.edit(buildTournamentSubPanel(tid)).catch(() => refreshSubPanel(interaction.client, tid));
    }

    // ── Group result ─────────────────────────────────────────────────────
    // Reverse old standings if this is an edit of an already-played match
    if (match.status === 'played' && match.home_score != null) {
      _reverseGroupStandings(match, tid);
    }

    db.update('matches', matchId, {
      status: 'played', home_score: hs, away_score: as_,
      home_pens: null, away_pens: null, pen_winner: null,
    });

    const homeWon = hs > as_, awayWon = as_ > hs, draw = hs === as_;
    const homeTT  = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === match.home_team_id);
    const awayTT  = db.findOne('tournament_teams', tt => tt.tournament_id === tid && tt.team_id === match.away_team_id);
    if (homeTT) db.update('tournament_teams', homeTT.id, {
      wins:          (homeTT.wins          || 0) + (homeWon ? 1 : 0),
      draws:         (homeTT.draws         || 0) + (draw    ? 1 : 0),
      losses:        (homeTT.losses        || 0) + (awayWon ? 1 : 0),
      goals_for:     (homeTT.goals_for     || 0) + hs,
      goals_against: (homeTT.goals_against || 0) + as_,
      points:        (homeTT.points        || 0) + (homeWon ? wp : draw ? dp : lp),
    });
    if (awayTT) db.update('tournament_teams', awayTT.id, {
      wins:          (awayTT.wins          || 0) + (awayWon ? 1 : 0),
      draws:         (awayTT.draws         || 0) + (draw    ? 1 : 0),
      losses:        (awayTT.losses        || 0) + (homeWon ? 1 : 0),
      goals_for:     (awayTT.goals_for     || 0) + as_,
      goals_against: (awayTT.goals_against || 0) + hs,
      points:        (awayTT.points        || 0) + (awayWon ? wp : draw ? dp : lp),
    });

    await interaction.reply({ content: `✅ Result saved: **${hs} — ${as_}**`, ephemeral: true });
    return interaction.message?.edit(buildTournamentSubPanel(tid)).catch(() => refreshSubPanel(interaction.client, tid));
  }

  // ── Start Knockout ────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_knockout_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const tid     = parseInt(id.replace('tmgr_knockout_', ''));
    const t       = db.findById('tournaments', tid);
    const advance = t?.advance_per_group || 2;
    const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);

    const groups = {};
    for (const tt of ttRows) {
      const g = tt.group_name || 'A';
      if (!groups[g]) groups[g] = [];
      groups[g].push(tt);
    }

    const qualifiers = [];
    for (const gTeams of Object.values(groups)) {
      // Sort by points → goal difference → goals scored (three-level tiebreaker)
      gTeams.sort((a, b) => {
        const pd = (b.points || 0) - (a.points || 0);
        if (pd !== 0) return pd;
        const gd = ((b.goals_for || 0) - (b.goals_against || 0)) - ((a.goals_for || 0) - (a.goals_against || 0));
        if (gd !== 0) return gd;
        return (b.goals_for || 0) - (a.goals_for || 0);
      });
      for (let i = 0; i < advance && i < gTeams.length; i++) {
        qualifiers.push(gTeams[i].team_id);
      }
    }

    if (qualifiers.length < 2) {
      return interaction.reply({ content: '❌ Need at least 2 qualified teams.', ephemeral: true });
    }

    const shuffled   = [...qualifiers].sort(() => Math.random() - 0.5);
    const numMatches = Math.floor(shuffled.length / 2);
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      db.insert('matches', {
        tournament_id: tid,
        home_team_id:  shuffled[i],
        away_team_id:  shuffled[i + 1],
        stage:         'knockout',
        round:         numMatches,
        leg:           1,
        status:        'pending',
        home_score:    null,
        away_score:    null,
      });
    }

    db.update('tournaments', tid, { status: 'active' });
    return interaction.update(buildTournamentSubPanel(tid));
  }

  // ── Next Round ────────────────────────────────────────────────────────────
  if (id.startsWith('tmgr_nextround_')) {
    if (!requireManager(interaction.member)) return noPermission(interaction);
    const parts     = id.replace('tmgr_nextround_', '').split('_');
    const tid       = parseInt(parts[0]);
    const nextRound = parseInt(parts[1]);
    const t         = db.findById('tournaments', tid);
    if (!t) return interaction.update(buildTournamentListPanel());

    const scheduleCh = await getTargetChannel(interaction.guild, t.template, 'matchSchedule').catch(() => null);
    const target     = scheduleCh || interaction.channel;
    const payload    = makeSchedulePost(tid, nextRound);
    if (payload) await target.send(payload).catch(() => {});

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
