'use strict';
const { SlashCommandBuilder } = require('discord.js');

const SEP   = { type: 14, divider: true, spacing: 1 };
const txt   = c => ({ type: 10, content: c });

const E_CUP   = '<a:cup:1501741159557500971>';
const E_HASH  = '<a:hashtag:1501741088736678069>';
const E_ARR   = '<a:arrow:1501741110798585927>';
const E_FIRE  = '<a:fire:1472250580583059611>';

function buildPage1() {
  return {
    flags: 32768,
    components: [{
      type: 17, accent_color: 0x5865F2,
      components: [
        txt(
          `# ${E_CUP}  Goatsi — Tournament Bot Guide\n` +
          `> Full guide for admins and managers. Page **1 / 2**.`
        ),
        SEP,
        txt(
          `${E_HASH}  **Slash Commands**\n` +
          `${E_ARR}  \`/admin\` — Admin panel: create tournaments, set channels, configure templates\n` +
          `${E_ARR}  \`/botola\` — Manager hub: the 3 control panels\n` +
          `${E_ARR}  \`/team\` — Manage the master teams list *(admins)*\n` +
          `${E_ARR}  \`/help\` — This guide`
        ),
        SEP,
        txt(
          `${E_HASH}  **\`/admin\` — One-Time Admin Setup**\n\n` +
          `**New Tournament**\n` +
          `${E_ARR}  Click **New Tournament** → choose template (EL or CL)\n` +
          `${E_ARR}  Enter the **Season Number** (e.g. \`3\`) → tournament created as \`EL S3\`\n\n` +
          `**Set Channels**\n` +
          `${E_ARR}  Assign channels per tournament: Management, Results, Schedule, Teams List\n\n` +
          `**⚙️ Template Config**\n` +
          `${E_ARR}  Controls which options managers see in the Settings panel\n` +
          `${E_ARR}  EL defaults: Teams \`16/32/64\`, Groups of \`4\`, Advance \`2\`, Solo 1v1\n` +
          `${E_ARR}  CL defaults: Teams \`8/16/32\`, Groups of \`4\`, Advance \`2\`, Duo 2v2\n\n` +
          `**🎟️ Reg. Role** — auto-gives a Discord role when a team enrolls\n` +
          `**🏆 Winners Setup** — winner role, history channel and message link`
        ),
        SEP,
        txt(
          `${E_FIRE}  **Panel 1 — Tournament Control**\n\n` +
          `**Setup stage**\n` +
          `${E_ARR}  **Begin Season** — draws groups + generates full schedule *(unlocks when all teams registered)*\n` +
          `${E_ARR}  **Settings** — select menus for Team Count, Groups size, Advance/Group, Players/Team\n` +
          `${E_ARR}  **🔢 Season** button — change season number (digits only, 1–999, no duplicates)\n\n` +
          `**Group stage**\n` +
          `${E_ARR}  **Add Result** → pick a match → enter scores\n` +
          `${E_ARR}  **Advance to Knockout** — unlocks when all group matches are done\n\n` +
          `**Knockout stage**\n` +
          `${E_ARR}  **Add Result** → **Next Round** after each KO round\n` +
          `${E_ARR}  **Confirm Winner** → role assigned + history updated automatically`
        ),
        SEP,
        { type: 1, components: [
          { type: 2, style: 1, label: 'Page 2 →', custom_id: 'help_p2' },
        ]},
      ],
    }],
  };
}

function buildPage2() {
  return {
    flags: 32768,
    components: [{
      type: 17, accent_color: 0x5865F2,
      components: [
        txt(
          `# ${E_CUP}  Goatsi — Tournament Bot Guide\n` +
          `> Full guide for admins and managers. Page **2 / 2**.`
        ),
        SEP,
        txt(
          `${E_FIRE}  **Panel 2 — Team Registration**\n\n` +
          `${E_ARR}  **Add Team** → type name → pick from 5 closest matches (last option = your exact text)\n` +
          `${E_ARR}  After selecting → assign player(s) via Discord member search\n` +
          `   • EL (1v1): 1 player  |  CL (2v2): 2 players (two separate pickers)\n` +
          `${E_ARR}  **✏️ Edit Team** — rename an enrolled team\n` +
          `${E_ARR}  **🗑️ Remove Team** — unenroll (removes Reg. Role from players automatically)`
        ),
        SEP,
        txt(
          `${E_FIRE}  **Panel 3 — Post & Publish**\n\n` +
          `${E_ARR}  **Post Teams List** — preview (only you see it) → confirm → posts to Teams channel\n` +
          `${E_ARR}  **Post Schedule** — pick a round → posts to Schedule channel *(one round at a time)*\n` +
          `${E_ARR}  **Post Results** — auto-posts when a full round is entered, no action needed\n` +
          `${E_ARR}  **Post Standings** — preview → confirm → posts to Results channel\n` +
          `${E_ARR}  **Post Group Draw** — posts the draw to the management channel`
        ),
        SEP,
        txt(
          `${E_HASH}  **Full Season Flow**\n\n` +
          `**1.** \`/admin\` → New Tournament → template → season number\n` +
          `**2.** \`/admin\` → Set Channels → assign all 4 channels\n` +
          `**3.** \`/botola\` → select tournament → 3 panels appear\n` +
          `**4.** Panel 2 → Add all teams + assign players\n` +
          `**5.** Panel 3 → Post Teams List → preview → confirm\n` +
          `**6.** Panel 1 → **Begin Season** → groups drawn, schedule generated\n` +
          `**7.** Panel 3 → Post Schedule → Round 1\n` +
          `**8.** After round played → Panel 1 → Add Result per match\n` +
          `   *(results auto-post when full round is entered)*\n` +
          `**9.** Repeat 7–8 for every group round\n` +
          `**10.** Panel 1 → Advance to Knockout → add KO results → Next Round\n` +
          `**11.** Final done → Confirm Winner`
        ),
        SEP,
        txt(
          `${E_HASH}  **Quick Tips**\n` +
          `${E_ARR}  Results **auto-post** when every match in a round is entered\n` +
          `${E_ARR}  Teams List **auto-updates** after every enroll / unenroll\n` +
          `${E_ARR}  Post Schedule **one round at a time** — you control when each round is revealed\n` +
          `${E_ARR}  Season numbers are **unique per template** — EL S3 and CL S3 can coexist\n` +
          `${E_ARR}  **Template Config** in \`/admin\` controls which select menus managers see\n` +
          `${E_ARR}  Use **Refresh** on any panel to reload the latest data\n\n` +
          `-# © 24 2026  |  Goatsi Bot`
        ),
        SEP,
        { type: 1, components: [
          { type: 2, style: 2, label: '← Page 1', custom_id: 'help_p1' },
        ]},
      ],
    }],
  };
}

module.exports = {
  buildPage1,
  buildPage2,
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('How to use the Goatsi tournament bot — full guide'),

  async execute(interaction) {
    return interaction.reply(buildPage1());
  },
};
