'use strict';
const { errorEmbed } = require('../utils/embeds');
const { handleTeamInteraction }               = require('../interactions/teamInteractions');
const { handleTournamentInteraction }         = require('../interactions/tournamentInteractions');
const { handleResultInteraction }             = require('../interactions/resultInteractions');
const { handleManageInteraction }             = require('../interactions/manageInteractions');
const { handleTestInteraction }               = require('../interactions/testInteractions');
const { handleAdminInteraction }              = require('../interactions/adminInteractions');
const { handleTournamentManagerInteraction }  = require('../interactions/tournamentManagerInteractions');
const { buildGroupStandingsEmbed, buildKnockoutBracketEmbed } = require('../panels/standingsPanel');

const TEAM_IDS = [
  'team_add_predefined', 'team_predefined_select', 'team_add_custom',
  'custom_team_modal', 'team_add_player', 'team_select', 'team_remove', 'team_remove_select',
];

const TEST_IDS = ['test_teams_list', 'test_standings', 'test_schedule', 'test_results', 'test_groupdraw'];

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

      const id = interaction.customId || '';

      // ── Test panel ─────────────────────────────────────────────────────────
      if (TEST_IDS.includes(id)) {
        return handleTestInteraction(interaction);
      }

      // ── Admin panel ────────────────────────────────────────────────────────
      if (id === 'adm_refresh' || id.startsWith('adm_set_') || id.startsWith('adm_channels_modal_')) {
        return handleAdminInteraction(interaction);
      }

      // ── Tournament manager panel ───────────────────────────────────────────
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

      // ── Team interactions ──────────────────────────────────────────────────
      if (TEAM_IDS.includes(id) || id.startsWith('player_add_modal_')) {
        return handleTeamInteraction(interaction, client);
      }

      // ── Manager panel interactions ─────────────────────────────────────────
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
