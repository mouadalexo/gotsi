'use strict';
const { SlashCommandBuilder } = require('discord.js');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all bot commands and how to use them'),

  async execute(interaction) {
    const E_CUP  = '<a:cup:1501741159557500971>';
    const E_HASH = '<a:hashtag:1501741088736678069>';

    const inner = [
      txt(`# ${E_CUP}  Night Stars eFootball — Help\n> Full command reference for admins, managers and players.`),
      SEP,

      txt(
        `${E_HASH}  **Admin Commands** — requires Administrator\n` +
        '`/manage` — Open the manager panel (tournament setup, admins, bot settings)\n' +
        '`/team` — Manage the master teams list (add, rename, delete)\n' +
        '`/adminpanel` — Open the admin setup panel (bot-level channel config)'
      ),
      SEP,

      txt(
        `${E_HASH}  **Manager Commands** — requires Manage Guild or DB manager role\n` +
        '`/botola` — Tournament hub: select a tournament to open its 3 management panels\n' +
        '`/managerpanel` — Legacy tournament manager (per-template view)\n' +
        '`/seasonlist` — Post the full team list for a tournament season\n' +
        '`/standings` — Post the current standings embed\n' +
        '`/deadline` — Set or show round deadlines\n' +
        '`/groupdraw` — Post the group draw embed'
      ),
      SEP,

      txt(
        `${E_HASH}  **Panel System** — via \`/botola\`\n` +
        '**Panel 1 — Tournament Management**\n' +
        '> Controls the tournament lifecycle: begin season, add results, advance rounds.\n' +
        '**Panel 2 — Team Registration**\n' +
        '> Enroll teams from the master list, assign players, close registration.\n' +
        '**Panel 3 — Post & Preview**\n' +
        '> Post schedule, results, standings, group draw and bracket to configured channels.'
      ),
      SEP,

      txt(
        `${E_HASH}  **Tournament Flow**\n` +
        '1. Admin creates tournament via `/manage → New Tournament`\n' +
        '2. Set channels via Panel 1 → Set Channels (or `/manage → Set Channels`)\n' +
        '3. Manager opens panels via `/botola → [tournament name]`\n' +
        '4. Register teams in Panel 2, then close registration\n' +
        '5. Click **Begin Season** in Panel 1 — groups are drawn automatically\n' +
        '6. Add match results via Panel 1 → Add Result\n' +
        '7. Once all group matches done, click **Advance to Knockout**\n' +
        '8. Continue adding results and advancing until the champion is crowned\n' +
        '9. Post embeds at any time via Panel 3'
      ),
      SEP,

      txt(
        `${E_HASH}  **Test Panel**\n` +
        '`/testpanel` — Post test panels (MCL/NSEL mock data) to verify embed layouts'
      ),
      SEP,

      txt('-# Night Stars eFootball  •  /help  •  All rights reserved'),
    ];

    return interaction.reply({
      flags: 32768,
      components: [{ type: 17, accent_color: 0x5865F2, components: inner }],
    });
  },
};
