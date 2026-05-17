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

      // ── Title ─────────────────────────────────────────────────────────────
      txt(
        `# ${E_CUP}  Gotsi — Tournament Bot Guide\n` +
        `> Complete guide for managers and admins on how to run NSEL & MCL seasons.`
      ),
      SEP,

      // ── Commands ──────────────────────────────────────────────────────────
      txt(
        `${E_HASH}  **Slash Commands**\n` +
        `${E_ARR}  \`/botola\`  —  Open the tournament hub *(managers)*\n` +
        `${E_ARR}  \`/team\`  —  Manage the master teams list *(admins)*\n` +
        `${E_ARR}  \`/admin\`  —  Set public channels for each tournament *(admins)*\n` +
        `${E_ARR}  \`/manage\`  —  Create or configure a new tournament *(admins)*\n` +
        `${E_ARR}  \`/help\`  —  Show this guide`
      ),
      SEP,

      // ── Step 1: Admin Setup ───────────────────────────────────────────────
      txt(
        `${E_HASH}  **Step 1 — One-Time Admin Setup**\n\n` +
        `**A. Build the master teams list** using \`/team\`\n` +
        `${E_ARR}  Click **Add Team** → type the name → bot shows the 5 closest matches + your exact text → pick one\n` +
        `${E_ARR}  Click **Delete Team** → same fuzzy search → confirm delete\n\n` +
        `**B. Set public channels** using \`/admin\`\n` +
        `${E_ARR}  Set channels for NSEL and MCL: Schedule, Results, Standings, Teams List\n\n` +
        `**C. Create a tournament** using \`/manage\` if one doesn't exist yet\n` +
        `${E_ARR}  Choose template (NSEL or MCL), name, season number, group size`
      ),
      SEP,

      // ── Step 2: Panels ───────────────────────────────────────────────────
      txt(
        `${E_HASH}  **Step 2 — The 3 Panels** *(open with \`/botola\`)*\n` +
        `Select a tournament → 3 control panels appear in the management channel\n\n` +
        `${E_FIRE}  **Panel 1 — Tournament Control**\n` +
        `${E_ARR}  **Begin Season** → draws groups + generates full match schedule automatically\n` +
        `${E_ARR}  **Add Result** → enter scores match by match\n` +
        `${E_ARR}  **Advance to Knockout** → runs after all group matches are done\n` +
        `${E_ARR}  **Settings** → rename, adjust group size, max teams\n\n` +
        `${E_FIRE}  **Panel 2 — Team Registration**\n` +
        `${E_ARR}  Click **Add Team** → type a name → bot shows the 5 closest matches from the master list\n` +
        `${E_ARR}  The last option always lets you use exactly what you typed (adds as a temporary team)\n` +
        `${E_ARR}  After selecting a team → assign the player(s) using the live member search\n` +
        `${E_ARR}  **NSEL:** 1 player per team   |   **MCL:** 2 players per team (two separate pickers)\n` +
        `${E_ARR}  Use **✏️ Edit Team** to rename, **🗑️ Remove Team** to unenroll — both on the same step\n\n` +
        `${E_FIRE}  **Panel 3 — Post & Preview**\n` +
        `${E_ARR}  **Post Teams List** → shows you a preview first (only you see it) → click Confirm → posted to the teams channel\n` +
        `${E_ARR}  **Post Schedule** → pick a round → only that round's matches are posted to the schedule channel\n` +
        `${E_ARR}  **Post Results** → results auto-post the moment a round is fully played — no action needed\n` +
        `${E_ARR}  **Post Standings** → preview shown first → confirm → posted to standings channel\n` +
        `${E_ARR}  **Post Group Draw** → posts the group draw to the management channel`
      ),
      SEP,

      // ── Step 3: Running a Season ─────────────────────────────────────────
      txt(
        `${E_HASH}  **Step 3 — Running a Season (Full Flow)**\n\n` +
        `**1.** Open \`/botola\` → select your tournament\n` +
        `**2.** In **Panel 2** → add all teams and assign their players\n` +
        `**3.** In **Panel 1** → click **Begin Season**\n` +
        `${E_ARR}  Groups are drawn and the full schedule is generated automatically\n` +
        `**4.** In **Panel 3** → click **Post Teams List** → preview → confirm\n` +
        `**5.** In **Panel 3** → click **Post Schedule** → select **Round 1** → posted to schedule channel\n` +
        `**6.** After Round 1 is played → **Panel 1 → Add Result** for each match\n` +
        `${E_ARR}  When the last match of the round is entered → results post automatically\n` +
        `**7.** Repeat steps 5–6 for every round\n` +
        `**8.** After all group matches → **Panel 1 → Advance to Knockout**\n` +
        `**9.** Continue adding KO results → **Next Round** after each KO round\n` +
        `**10.** Final done → **Confirm Winner** → role assigned + history updated automatically`
      ),
      SEP,

      // ── Tips ─────────────────────────────────────────────────────────────
      txt(
        `${E_HASH}  **Quick Tips**\n` +
        `${E_ARR}  Results for a round **auto-post** the moment all matches in that round are entered\n` +
        `${E_ARR}  Schedule is posted **one round at a time** — you control when each round is revealed\n` +
        `${E_ARR}  Teams List preview is **only visible to you** before you confirm posting\n` +
        `${E_ARR}  Temporary teams (typed freely) exist only for that season and are removed after\n` +
        `${E_ARR}  Use **Refresh** on any panel to reload the latest data after changes\n` +
        `${E_ARR}  Channels are set by admins via \`/admin\` — managers cannot change them`
      ),
      SEP,

      txt(`-# Night Stars  ${E_CUP}  Gotsi Bot  •  /help`),
    ];

    return interaction.reply(box(0x5865F2, inner));
  },
};
