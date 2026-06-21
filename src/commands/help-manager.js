'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { isBotolaManager }     = require('../utils/permissions');

const SEP    = { type: 14, divider: true, spacing: 1 };
const txt    = c => ({ type: 10, content: c });
const ACCENT = 0x57F287;

const E_CUP  = '<a:cup:1501741159557500971>';
const E_HASH = '<a:hashtag:1501741088736678069>';
const E_ARR  = '<a:arrow:1501741110798585927>';
const E_FIRE = '<a:fire:1472250580583059611>';

function buildMgrPage1() {
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: ACCENT, components: [
      txt(
        `# ${E_CUP}  Manager Guide — Tournament Hub\n` +
        `> Step-by-step for tournament managers. Page **1 / 3**.`
      ),
      SEP,
      txt(
        `${E_HASH}  **Full Season — Step by Step**\n\n` +
        `**1.** \`/botola\` → click your tournament → three panels open in the management channel\n` +
        `**2.** **Panel 2 (Teams)** → **Add Team** → type name → pick from list → assign player(s)\n` +
        `**3.** **Panel 3 (Posts)** → **Post Teams List** → preview → confirm\n` +
        `**4.** **Panel 1 (Control)** → adjust **Settings** if needed (team count, group size, etc.)\n` +
        `**5.** **Panel 1** → **Begin Season** — draws groups + generates full match schedule\n` +
        `**6.** **Panel 3** → **Schedule** → posts Round 1 to the schedule channel automatically\n` +
        `**7.** After matches are played → **Panel 1** → **Add Result** per match\n` +
        `**8.** Repeat 6–7 for every group stage round\n` +
        `**9.** **Panel 1** → **Advance to Knockout** *(unlocks when all group results are in)*\n` +
        `**10.** Add KO results → click **Next Round** after each knockout round\n` +
        `**11.** Final done → **Confirm Winner** → role assigned, history updated`
      ),
      SEP,
      txt(
        `${E_FIRE}  **Panel 1 — Quick Reference**\n\n` +
        `${E_ARR}  **Settings** — group size, team count, advance slots, player count *(setup stage only)*\n` +
        `${E_ARR}  **Begin Season** — locks settings, draws groups, generates full schedule\n` +
        `${E_ARR}  **Add Result** — enter scores for group or knockout matches\n` +
        `${E_ARR}  **Advance to Knockout** — moves to KO stage *(all group matches must be done)*\n` +
        `${E_ARR}  **Next Round** — advances the knockout bracket to the next round\n` +
        `${E_ARR}  **Confirm Winner** — ends the season, assigns winner role`
      ),
      SEP,
      txt(
        `${E_HASH}  **Panel 2 — Team Registration**\n\n` +
        `${E_ARR}  **Add Team** — type a name → pick closest match → assign player(s) via member search\n` +
        `${E_ARR}  **Edit Team** — rename an already-enrolled team\n` +
        `${E_ARR}  **Remove Team** — unenrolls a team, removes registration role from its players\n` +
        `${E_ARR}  Teams list shows current count  (e.g. \`12 / 16 enrolled\`)`
      ),
      SEP,
      { type: 1, components: [
        { type: 2, style: 1, label: 'Page 2 \u2192 Adding Results', custom_id: 'help_mgr_p2' },
      ]},
    ]}],
  };
}

function buildMgrPage2() {
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: ACCENT, components: [
      txt(
        `# ${E_CUP}  Manager Guide \u2014 Adding Results\n` +
        `> Everything about entering match scores. Page **2 / 3**.`
      ),
      SEP,
      txt(
        `${E_FIRE}  **Group Stage \u2014 Add Result Flow**\n\n` +
        `**Step 1** — Click **Add Result** in Panel 1\n` +
        `${E_ARR}  You see the current round number and buttons for each group (Group A, Group B…)\n\n` +
        `**Step 2** — Click a group button (e.g. **Group A**)\n` +
        `${E_ARR}  A dropdown appears with all matches in that group for the current round\n` +
        `${E_ARR}  Matches already done show  \`\u270f\ufe0f Edit: 2 \u2014 1\`\n` +
        `${E_ARR}  Pending matches show  \`\u23f3 Pending\`\n\n` +
        `**Step 3** — Select a match from the dropdown\n` +
        `${E_ARR}  A small form (modal) opens with two score fields\n\n` +
        `**Step 4** — Enter the score and submit\n` +
        `${E_ARR}  Valid values: **0 \u2013 20** or **F** for forfeit \u2014 **both fields must be filled**\n` +
        `${E_ARR}  After submitting you get a confirmation with how many results are left in the round\n\n` +
        `**Next Round button**\n` +
        `${E_ARR}  Shown as  \`X results not added yet\`  (disabled) until every match in the current round is done\n` +
        `${E_ARR}  Once all results are in it becomes  \u2705 **Next Round**  — click it to move to the next round\n` +
        `${E_ARR}  The **\u2190 Groups** button always brings you back to the group selector`
      ),
      SEP,
      txt(
        `${E_HASH}  **Forfeit Scoring (F)**\n\n` +
        `Enter **F** for the forfeiting side and the **actual score** for the other side \u2014 both fields must be filled:\n\n` +
        `\`\`\`\nHome: F    Away: 3   \u2192  shown as  \u00d8 : 3\nHome: 2    Away: F   \u2192  shown as  2 : \u00d8\nHome: F    Away: 0   \u2192  shown as  \u00d8 : 0\`\`\`\n` +
        `${E_ARR}  **\u00d8** in posts marks the forfeiting side so players see it clearly\n` +
        `${E_ARR}  You decide the score \u2014 the bot just replaces the F side with \u00d8 in the post\n` +
        `${E_ARR}  Standings use the actual numbers you entered (F side counts as 0 goals)\n` +
        `${E_ARR}  Entering anything other than 0\u201320 or F will be rejected with an error`
      ),
      SEP,
      txt(
        `${E_FIRE}  **Knockout Stage \u2014 Add Result**\n\n` +
        `${E_ARR}  Click **Add Result** → a dropdown of all pending KO matches appears\n` +
        `${E_ARR}  Select a match → form opens with two score fields\n` +
        `${E_ARR}  If scores are equal → two extra fields appear for **penalties** (must differ)\n` +
        `${E_ARR}  After each KO round → click **Next Round** in Panel 1 to generate the next round\n` +
        `${E_ARR}  You can always go back and **edit** any result by selecting it again`
      ),
      SEP,
      { type: 1, components: [
        { type: 2, style: 2, label: '\u2190 Page 1',           custom_id: 'help_mgr_p1' },
        { type: 2, style: 1, label: 'Page 3 \u2192 Posting',   custom_id: 'help_mgr_p3' },
      ]},
    ]}],
  };
}

function buildMgrPage3() {
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: ACCENT, components: [
      txt(
        `# ${E_CUP}  Manager Guide \u2014 Posting & Publishing\n` +
        `> All post buttons in Panel 3. Page **3 / 3**.`
      ),
      SEP,
      txt(
        `${E_FIRE}  **Panel 3 Buttons**\n\n` +
        `**Row 1 (blue)**\n` +
        `${E_ARR}  **Group Draw** \u2014 posts the group draw to the management channel\n` +
        `${E_ARR}  **Schedule** \u2014 auto-detects the current pending round and posts it to the schedule channel\n\n` +
        `**Row 2 (green)**\n` +
        `${E_ARR}  **Results** \u2014 auto-detects the last fully completed round and posts it to the results channel\n` +
        `${E_ARR}  **Standings** \u2014 generates the current group standings and posts to the results channel\n\n` +
        `**Row 3 (red)**\n` +
        `${E_ARR}  **KO Bracket** \u2014 posts the current knockout bracket\n\n` +
        `> **Tip:** Schedule and Results no longer ask you to pick a round \u2014 they detect it automatically.`
      ),
      SEP,
      txt(
        `${E_HASH}  **Post Flow \u2014 Each Button**\n\n` +
        `**Schedule**\n` +
        `${E_ARR}  Click \u2192 current round schedule posts instantly to the schedule channel\n` +
        `${E_ARR}  Post it **before** the round starts so players know their matchups\n\n` +
        `**Results**\n` +
        `${E_ARR}  Click \u2192 last completed round results post instantly to the results channel\n` +
        `${E_ARR}  Post it **after** entering all results for a round\n\n` +
        `**Standings**\n` +
        `${E_ARR}  Click \u2192 you see a private preview first \u2192 click **Confirm Post** to publish\n` +
        `${E_ARR}  Post after each round so players can track their group position\n\n` +
        `**Group Draw**\n` +
        `${E_ARR}  Click \u2192 posts the group composition to the management channel\n` +
        `${E_ARR}  Post this right after **Begin Season** so players know their group\n\n` +
        `**KO Bracket**\n` +
        `${E_ARR}  Click \u2192 posts the knockout bracket to the results channel\n` +
        `${E_ARR}  Post after **Advance to Knockout** and after each knockout round`
      ),
      SEP,
      txt(
        `${E_HASH}  **Quick Tips**\n\n` +
        `${E_ARR}  Channels must be configured via \`/admin\` \u2192 **Set Channels** before posting works\n` +
        `${E_ARR}  Buttons are **greyed out** when the action isn\u2019t available yet (no matches, etc.)\n` +
        `${E_ARR}  Use **Refresh** on any panel to reload the latest data at any time\n` +
        `${E_ARR}  Editing a result is the same as entering one \u2014 just pick the match again\n` +
        `${E_ARR}  Season numbers are unique per template \u2014 EL S3 and CL S3 can coexist\n\n` +
        `-# \u00a9 24 2026  |  Goatsi Bot`
      ),
      SEP,
      { type: 1, components: [
        { type: 2, style: 2, label: '\u2190 Page 2', custom_id: 'help_mgr_p2' },
      ]},
    ]}],
  };
}

module.exports = {
  buildMgrPage1,
  buildMgrPage2,
  buildMgrPage3,

  data: new SlashCommandBuilder()
    .setName('help-manager')
    .setDescription('Manager guide — adding results, posting, full tournament flow'),

  async execute(interaction) {
    if (!isBotolaManager(interaction.member)) {
      return interaction.reply({
        content: '\u274c This command is for tournament managers only.',
        ephemeral: true,
      });
    }
    return interaction.reply(buildMgrPage1());
  },
};
