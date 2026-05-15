'use strict';
const { SlashCommandBuilder } = require('discord.js');

const SEP  = { type: 14, divider: true, spacing: 1 };
const txt  = c => ({ type: 10, content: c });
const box  = (color, inner) => ({ flags: 32768, components: [{ type: 17, accent_color: color, components: inner }] });

const E_CUP   = '<a:cup:1501741159557500971>';
const E_HASH  = '<a:hashtag:1501741088736678069>';
const E_ARR   = '<a:arrow:1501741110798585927>';
const E_FIRE  = '<a:fire:1472250580583059611>';
const E_CROWN = '<:crownn:1501741176296964277>';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('How to use the Gotsi tournament bot — full guide'),

  async execute(interaction) {
    const inner = [

      // ── Title ────────────────────────────────────────────────────────────
      txt(
        `# ${E_CUP}  Gotsi — Tournament Bot Guide\n` +
        `> Complete guide for admins and managers on how to run NSEL & MCL seasons.`
      ),
      SEP,

      // ── Commands overview ────────────────────────────────────────────────
      txt(
        `${E_HASH}  **Commands**\n` +
        `${E_ARR}  \`/botola\`  —  Open the tournament hub (managers)\n` +
        `${E_ARR}  \`/team\`  —  Manage the master teams list (admins)\n` +
        `${E_ARR}  \`/admin\`  —  Set tournament channels (admins)\n` +
        `${E_ARR}  \`/manage\`  —  Create or configure tournaments (admins)\n` +
        `${E_ARR}  \`/testpanel\`  —  Preview all panels with random data\n` +
        `${E_ARR}  \`/help\`  —  Show this guide`
      ),
      SEP,

      // ── One-time admin setup ─────────────────────────────────────────────
      txt(
        `${E_HASH}  **Step 1 — Admin Setup** *(done once)*\n` +
        `**1.** Use \`/team\` to build the master teams list\n` +
        `${E_ARR}  Click **Add Team** → type the team name → saved\n` +
        `${E_ARR}  Click **Delete Team** → select from dropdown → confirm\n\n` +
        `**2.** Use \`/admin\` to set the public channels for each tournament\n` +
        `${E_ARR}  Click **Set NSEL Channels** or **Set MCL Channels**\n` +
        `${E_ARR}  Paste the channel IDs for: Schedule, Results, Standings\n\n` +
        `**3.** Use \`/manage\` to create a new tournament if needed\n` +
        `${E_ARR}  Choose template (NSEL or MCL), name, season number`
      ),
      SEP,

      // ── Panel system ─────────────────────────────────────────────────────
      txt(
        `${E_HASH}  **Step 2 — The 3 Panels** *(via \`/botola\`)*\n` +
        `Open \`/botola\` → select **NSEL** or **MCL** → 3 panels appear in the management channel\n\n` +
        `${E_FIRE}  **Panel 1 — Tournament Control**\n` +
        `${E_ARR}  Begin Season, Add Result, Advance to Knockout, Settings\n\n` +
        `${E_FIRE}  **Panel 2 — Team Registration**\n` +
        `${E_ARR}  Click **Add Team** → search box appears → type team name → select from results\n` +
        `${E_ARR}  Registration stays open until you click **Close Registration**\n\n` +
        `${E_FIRE}  **Panel 3 — Post to Channels**\n` +
        `${E_ARR}  Post Schedule, Results, Standings, Group Draw to the public channels`
      ),
      SEP,

      // ── Season workflow ───────────────────────────────────────────────────
      txt(
        `${E_HASH}  **Step 3 — Running a Season**\n` +
        `**1.** Register all teams in **Panel 2** using the search\n` +
        `**2.** Click **Begin Season** in Panel 1\n` +
        `${E_ARR}  Groups are drawn automatically\n` +
        `${E_ARR}  Full match schedule is generated\n` +
        `**3.** Post the schedule for each round via **Panel 3 → Post Schedule → Round X**\n` +
        `**4.** After each round is played, add results in **Panel 1 → Add Result**\n` +
        `**5.** Post results via **Panel 3 → Post Results → Round X**\n` +
        `**6.** Post updated standings via **Panel 3 → Post Standings**\n` +
        `**7.** When all group matches are done → click **Advance to Knockout**\n` +
        `**8.** Repeat adding results for each KO round → click **Next Round**\n` +
        `**9.** Final match played → click **Confirm Winner**\n` +
        `${E_ARR}  Winner role is assigned and Winners History is updated automatically`
      ),
      SEP,

      // ── Tips ──────────────────────────────────────────────────────────────
      txt(
        `${E_HASH}  **Tips**\n` +
        `${E_ARR}  Schedule and results are posted **per round** — one message per round, not all at once\n` +
        `${E_ARR}  Use \`/testpanel\` to preview how Schedule, Results and Standings will look before the season\n` +
        `${E_ARR}  Use **Refresh** buttons on panels to get the latest data after any change\n` +
        `${E_ARR}  Channels can only be changed by admins via \`/admin\` — managers cannot touch them`
      ),
      SEP,

      txt(`-# Night Stars  ${E_CUP}  Gotsi Bot  •  /help`),
    ];

    return interaction.reply(box(0x5865F2, inner));
  },
};
