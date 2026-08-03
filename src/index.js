/*
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                         GOATSI BOT — CODEBASE MAP                          ║
 * ║              EFootball Manager Discord Bot  •  Node.js + Discord.js        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * ── ENTRY POINT ──────────────────────────────────────────────────────────────
 *  src/index.js              Bot startup: loads commands/, events/, inits DB
 *  src/events/ready.js       Fires once on login
 *  src/events/messageCreate.js   All prefix (&...) commands (see COMMANDS below)
 *  src/events/interactionCreate.js  Central router → dispatches all button/select/modal IDs
 *
 * ── SYSTEM 1 — BOTOLA TOURNAMENT ──────────────────────────────────────────────
 *  Purpose: Full group-stage + knockout tournament engine for eFootball.
 *  Slash:   /panels  (manager) → lists tournaments → opens panels
 *  Panels:
 *    botola/panel1.js          Main lifecycle panel  (setup → groups → KO)
 *    botola/panel2.js          Teams / groups / standings panel
 *    botola/panel3.js          Schedule / results panel
 *    botola/enrollPanel.js     Enrollment flow UI
 *    botola/resultsPanel.js    Results entry UI
 *    botola/standingsPanel.js  Live standings display
 *    botola/tournamentEmbeds.js  Shared embed builders
 *  Interactions (IDs):
 *    botola/botolaInteractions.js   bot_t_* | p1_* | p2_* | p3_* — full lifecycle
 *    botola/enrollInteractions.js   enr_* — team/player enrollment flow
 *    botola/resultInteractions.js   result entry handlers
 *  DB tables: tournaments, teams, players, tournament_teams, matches, winners,
 *             wh_tournaments, config (group_round_<id>, p3_round_<id>)
 *
 * ── SYSTEM 2 — FEDERATION (CLAN LEAGUE) ───────────────────────────────────────
 *  Purpose: Season-based clan competition with group + knockout rounds,
 *           match channels, standings, and panel-driven round advancement.
 *  Slash:   /federation  (manager)
 *  Panels:
 *    federation/federationPanel.js  Main/setup/roles/settings panels
 *    federation/fedPanel1.js        Fed panel 1 (season overview)
 *    federation/fedPanel2.js        Fed panel 2 (groups/schedule)
 *    federation/fedPanel3.js        Fed panel 3 (knockout)
 *    federation/fedEmbeds.js        Shared embed builders
 *  Interactions (IDs):
 *    federation/federationInteractions.js  fed_* — setup, rounds, matches,
 *                                          results, standings, channel control
 *  DB tables: season_clans, fed_matches, Clan_Registry, config (fed_* keys)
 *
 * ── SYSTEM 3 — CLAN ROSTER (NEW) ──────────────────────────────────────────────
 *  Purpose: Each clan leader registers a clan (name, tag, logo, social),
 *           manages a player roster, and assigns up to 5 co-leaders.
 *  Prefix commands (messageCreate.js):
 *    &clan                  Open roster dashboard (leader + co-leaders)
 *    &coleader @user        Toggle add/remove co-leader (max 5)
 *    &removecoleader @user  Manager or leader force-removes a co-leader
 *    &giveclan @user        Transfer main leadership to another member
 *    &removeleader @user    Strip someone of leader role/clan
 *    &referee               Open referee assignment panel
 *  Panels:
 *    federation/fedRosterPanel.js   Builds dashboard, member-picker, edit,
 *                                   reorder, preview panels; getRoster(),
 *                                   getRosterForMember(), getRosterConfig()
 *  Interactions (IDs):
 *    federation/fedRosterInteractions.js  fr_* | fra_* — all roster buttons,
 *                                         selects, modals (add/edit/remove
 *                                         players, submit, unsubmit, settings)
 *    interactions/clanCrudInteractions.js cc_* — clan CRUD (search/add/edit/
 *                                         remove clans, leader assignment)
 *  Exports:
 *    federation/fedRosterPdf.js   Roster → PDF
 *    federation/fedRosterPng.js   Roster → PNG image
 *  DB table: Clan_Registry  { id, clan_name, clan_tag, leader_discord_id,
 *                              co_leaders[], players[], logo_url, social_media,
 *                              submitted, created_at, updated_at }
 *  Config keys (config table): fed_roster_leader_role_id, fed_roster_co_leader_role_id,
 *                               fed_roster_mef_role_id, fed_roster_max_players,
 *                               fed_roster_min_players, fed_roster_locked,
 *                               fed_roster_instagram, fed_roster_footer_text
 *
 * ── SYSTEM 4 — MANAGEMENT ─────────────────────────────────────────────────────
 *  Purpose: Admin/manager controls — create tournaments, configure roles/channels,
 *           manage admins and settings.
 *  Slash:   /manage  (admin or ManageGuild perm)
 *  Panels:  panels/managePanel.js  (buildManagePanelV2)
 *  Interactions:
 *    interactions/manageInteractionsNew.js  mgr2_* — admins, tournaments,
 *                                           channels, roles, settings
 *    interactions/tournamentInteractions.js tournament_* | tmt_* — legacy
 *                                           tournament create/configure/start
 *    interactions/tournamentManagerInteractions.js  manager-level tournament ops
 *    interactions/settingsInteractions.js   settings_* — bot settings
 *    interactions/teamInteractions.js       team_* | teamcrud_* — team ops
 *    interactions/teamCrudInteractions.js   team CRUD modals/confirms
 *    interactions/infoInteractions.js       info_* — info panels
 *    interactions/whInteractions.js         wh_* — winners history
 *    interactions/autotestInteractions.js   autotest_* — dev/test helpers
 *  Commands: /info, /team, /winnerhistory, /help, /help-manager, /autotest
 *  DB tables: admins, tournaments, teams, players, tournament_teams, matches,
 *             winners, wh_tournaments, config
 *
 * ── DATABASE ──────────────────────────────────────────────────────────────────
 *  File:  data/db.json  (flat JSON, atomic write via .tmp + rename)
 *  Singleton: src/utils/database.js — exports db{get,insert,update,delete,
 *             findById,findWhere,findOne,setConfig,getConfig,...}, initDB, reload
 *  Tables: teams | players | tournaments | tournament_teams | matches |
 *          admins | winners | wh_tournaments | season_clans | fed_matches |
 *          clans (legacy) | Clan_Registry | config (key-value) | _nextId
 *
 * ── UTILITIES ─────────────────────────────────────────────────────────────────
 *  utils/permissions.js     isBotolaManager(), role-check helpers
 *  utils/channelRouter.js   Routes actions to correct Discord channels
 *  utils/tempState.js       In-memory ephemeral state (launcher msg tracking etc.)
 *  utils/embeds.js          Shared embed/component builders
 *  utils/fuzzyTeam.js       Fuzzy team name search
 *  utils/templateConfig.js  Tournament template presets
 *  utils/winnersHistory.js  Winners history helpers
 *  data/seed.js             Seeds default football teams on startup
 */

'use strict';
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { initDB }          = require('./utils/database');
const { seedDefaultData } = require('./data/seed');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();
client.panels   = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) client.commands.set(command.data.name, command);
}

// Load events
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
  else            client.on(event.name,   (...args) => event.execute(...args, client));
}

initDB();
seedDefaultData();
// ── Global error guards — prevent crashes from unhandled Discord API errors ──
process.on('unhandledRejection', (err) => {
  console.error('[UnhandledRejection]', err?.message || err);
});
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err?.message || err);
});
client.on('error', (err) => {
  console.error('[ClientError]', err?.message || err);
});

client.login(process.env.DISCORD_TOKEN);
