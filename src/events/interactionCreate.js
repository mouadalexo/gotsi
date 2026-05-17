'use strict';
const { errorEmbed } = require('../utils/embeds');
const { handleTeamInteraction }               = require('../interactions/teamInteractions');
const { handleTournamentInteraction }         = require('../interactions/tournamentInteractions');
const { handleResultInteraction }             = require('../interactions/resultInteractions');
const { handleManageInteraction }             = require('../interactions/manageInteractions');
const { handleMgr2Interaction }              = require('../interactions/manageInteractionsNew');
const { handleTestInteraction }               = require('../interactions/testInteractions');
const { handleAdminInteraction }              = require('../interactions/adminInteractions');
const { handleTournamentManagerInteraction }  = require('../interactions/tournamentManagerInteractions');
const { handleTeamCrudInteraction }           = require('../interactions/teamCrudInteractions');
const { handleBotolaInteraction }             = require('../interactions/botolaInteractions');
const { handleEnrollInteraction }             = require('../interactions/enrollInteractions');
const { buildGroupStandingsEmbed, buildKnockoutBracketEmbed } = require('../panels/standingsPanel');

const TEAM_IDS = [
  'team_add_predefined', 'team_predefined_select', 'team_add_custom',
  'custom_team_modal', 'team_add_player', 'team_select', 'team_remove', 'team_remove_select',
];

const TEST_IDS = ['test_back', 'test_teams_list', 'test_standings', 'test_schedule', 'test_results', 'test_groupdraw'];

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      // ── Slash commands ─────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (command) await command.execute(interaction, client);
        return;
      }

      // ── Autocomplete ───────────────────────────────────────────────────────
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) await command.autocomplete(interaction);
        return;
      }

      // ── /addteam player modal ─────────────────────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId.startsWith('addteam_player_')) {
        const { db }          = require('../utils/database');
        const { buildPanel2 } = require('../panels/panel2');
        const [, , tidStr, teamIdStr] = interaction.customId.split('_');
        const tid    = parseInt(tidStr);
        const teamId = parseInt(teamIdStr);
        const rawId  = interaction.fields.getTextInputValue('discord_id').trim().replace(/\D/g, '');
        if (rawId) {
          const exists = db.findOne('players', p => p.discord_id === rawId && p.team_id === teamId);
          if (!exists) db.insert('players', { discord_id: rawId, team_id: teamId, tournament_id: tid });
        }
        // Refresh Panel 2 if reference exists
        const t = db.findById('tournaments', tid);
        if (t?.panel2_ref) {
          try {
            const ch  = await client.channels.fetch(t.panel2_ref.channelId);
            const msg = await ch.messages.fetch(t.panel2_ref.messageId);
            await msg.edit(buildPanel2(t));
          } catch {}
        }
        const team = db.findById('teams', teamId);
        return interaction.reply({
          content: `✅ **${team?.name || 'Team'}** enrolled${rawId ? ` — player <@${rawId}> assigned` : ''}`,
          ephemeral: true,
        });
      }

      const id = interaction.customId || '';

      // ── Test panel ─────────────────────────────────────────────────────────
      if (TEST_IDS.includes(id)) {
        return handleTestInteraction(interaction);
      }

      // ── Admin panel ────────────────────────────────────────────────────────
      if (id === 'adm_refresh' || id === 'adm_done' || id.startsWith('adm_tch_') || id.startsWith('adm_ch_')) {
        return handleAdminInteraction(interaction);
      }

      // ── Tournament manager panel (legacy tmgr_*) ───────────────────────────
      if (
        id === 'tmgr_back'                       ||
        id.startsWith('tmgr_t_')                 ||
        id.startsWith('tmgr_refresh_')           ||
        id.startsWith('tmgr_new_')               ||
        id.startsWith('tmgr_create_modal_')      ||
        id.startsWith('tmgr_addteams_')          ||
        id.startsWith('tmgr_team_modal_')        ||
        id.startsWith('tmgr_enroll_sel_')        ||
        id.startsWith('tmgr_addplayer_')         ||
        id.startsWith('tmgr_player_modal_')      ||
        id.startsWith('tmgr_drawgroups_')        ||
        id.startsWith('tmgr_genmatches_')        ||
        id.startsWith('tmgr_postschedule_')      ||
        id.startsWith('tmgr_addresult_')         ||
        id.startsWith('tmgr_match_sel_')         ||
        id.startsWith('tmgr_result_modal_')      ||
        id.startsWith('tmgr_knockout_')          ||
        id.startsWith('tmgr_closeseason_')
      ) {
        return handleTournamentManagerInteraction(interaction);
      }

      // ── Team CRUD (/team) ──────────────────────────────────────────────────
      if (
        id === 'tc_add'              ||
        id === 'tc_add_modal'        ||
        id === 'tc_edit_start'       ||
        id === 'tc_edit_sel'         ||
        id === 'tc_del_start'        ||
        id === 'tc_del_sel'          ||
        id === 'tc_del_fuzzy_modal'  ||
        id === 'tc_del_fuzzy_sel'    ||
        id === 'tc_noop'             ||
        id === 'tc_refresh'          ||
        id === 'tc_enroll'           ||
        id === 'tc_search'           ||
        id === 'tc_search_modal'     ||
        id.startsWith('tc_refresh_')      ||
        id.startsWith('tc_page_')         ||
        id.startsWith('tc_edit_modal_')   ||
        id.startsWith('tc_del_confirm_')
      ) {
        return handleTeamCrudInteraction(interaction);
      }

      // ── Enroll flow (enr_*) ─────────────────────────────────────────────
      if (
        id === 'enr_tmt_sel'            ||
        id === 'enr_back_step1'         ||
        id.startsWith('enr_team_sel_')        ||
        id.startsWith('enr_team_type_')       ||
        id.startsWith('enr_team_fuzzy_modal_')||
        id.startsWith('enr_team_fuzzy_sel_')  ||
        id.startsWith('enr_player_sel_')      ||
        id.startsWith('enr_edit_team_')       ||
        id.startsWith('enr_edit_team_modal_') ||
        id.startsWith('enr_remove_team_')     ||
        id.startsWith('enr_skip_')            ||
        id.startsWith('enr_back_step2_')
      ) {
        return handleEnrollInteraction(interaction, client);
      }

      // ── Botola + Panel 1/2/3 ──────────────────────────────────────────────
      if (
        id.startsWith('bot_t_')           ||
        id.startsWith('p1_')              ||
        id.startsWith('p2_')              ||
        id.startsWith('p3_')
      ) {
        return handleBotolaInteraction(interaction);
      }

      // ── New manage panel (mgr2_*) ─────────────────────────────────────────
      if (id.startsWith('mgr2_')) {
        return handleMgr2Interaction(interaction);
      }

      // ── Manager panel (legacy mgr_*) ──────────────────────────────────────
      if (
        id.startsWith('mgr_new_season_')         ||
        id.startsWith('mgr_create_modal_')        ||
        id.startsWith('mgr_search_teams_')        ||
        id.startsWith('mgr_team_search_modal_')   ||
        id.startsWith('mgr_team_enroll_')         ||
        id.startsWith('mgr_add_player_')          ||
        id.startsWith('mgr_player_search_modal_') ||
        id.startsWith('mgr_player_select_')       ||
        id.startsWith('mgr_player_assign_')       ||
        id.startsWith('mgr_gen_groups_')          ||
        id.startsWith('mgr_gen_matches_')         ||
        id.startsWith('mgr_post_schedule_')       ||
        id.startsWith('mgr_auto_schedule_')       ||
        id.startsWith('mgr_auto_schedule_modal_') ||
        id.startsWith('mgr_add_result_')          ||
        id.startsWith('mgr_knockout_')            ||
        id.startsWith('mgr_view_bracket_')        ||
        id.startsWith('mgr_close_season_')
      ) {
        return handleManageInteraction(interaction, client);
      }

      // ── Old team interactions ──────────────────────────────────────────────
      if (TEAM_IDS.includes(id) || id.startsWith('player_add_modal_')) {
        return handleTeamInteraction(interaction, client);
      }

      // ── Result interactions ────────────────────────────────────────────────
      if (
        id === 'tournament_results'       ||
        id === 'result_tournament_select' ||
        id.startsWith('match_select_')    ||
        id.startsWith('result_modal_')    ||
        id.startsWith('view_results_')
      ) {
        return handleResultInteraction(interaction, client);
      }

      // ── Old tournament panel ───────────────────────────────────────────────
      if (
        id === 'tournament_create'   || id === 'template_select' ||
        id.startsWith('tournament_create_modal_') ||
        id === 'tournament_manage'   || id === 'tournament_bracket' ||
        id.startsWith('tmt_')
      ) {
        return handleTournamentInteraction(interaction, client);
      }

      // ── Standings select ───────────────────────────────────────────────────
      if (id === 'tournament_select') {
        const tournamentId = parseInt(interaction.values[0]);
        const groupEmbed   = buildGroupStandingsEmbed(tournamentId);
        const bracketEmbed = buildKnockoutBracketEmbed(tournamentId);
        const embeds = [groupEmbed, bracketEmbed].filter(Boolean);
        return interaction.update({ content: null, embeds: embeds.length ? embeds : undefined, components: [] });
      }

      if (id === 'tournament_select_manage') {
        return handleTournamentInteraction({ ...interaction, customId: 'tournament_select' }, client);
      }

    } catch (err) {
      console.error('[Interaction Error]', err);
      const payload = { embeds: [errorEmbed('Something went wrong', err.message)], ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  },
};
