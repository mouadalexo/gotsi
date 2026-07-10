'use strict';
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });

// ── Kept for backward-compat: used by tournamentManagerInteractions.js ────────
function buildNewSeasonModal(template) {
  const seasons = db.get('tournaments').filter(t => t.template === template).length;
  return new ModalBuilder()
    .setCustomId(`mgr_new_season_modal_${template}`)
    .setTitle(`New Season — ${template}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('tournament_name').setLabel('Tournament Name')
          .setStyle(TextInputStyle.Short).setPlaceholder(`${template} Season ${seasons + 1}`).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('team_count').setLabel('Number of Teams')
          .setStyle(TextInputStyle.Short).setPlaceholder('16').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('group_size').setLabel('Teams per Group')
          .setStyle(TextInputStyle.Short).setPlaceholder('4').setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('deadline_hours').setLabel('Round Deadline (hours, optional)')
          .setStyle(TextInputStyle.Short).setPlaceholder('48').setRequired(false)
      ),
    );
}

// ── V2 Manage Panel ───────────────────────────────────────────────────────────
function buildManagePanelV2() {
  const managerRoleId = db.getConfig('manager_role_id');

  const inner = [];

  inner.push(txt(`# 🛠️  Manage Panel\n-# Tournaments, setup & bot settings`));
  inner.push(SEP);

  inner.push(txt(`**Tournaments**`));
  inner.push({ type: 1, components: [
    btn('🏆  Create Tournament', 'mgr2_newtournament',  3),
    btn('⚙️  Settings',          'mgr2_tournsettings',  2),
  ]});

  inner.push(SEP);

  inner.push(txt(`**Setup**`));
  inner.push({ type: 1, components: [
    btn('📺  Channels & Roles', 'mgr2_setup_start', 2),
  ]});

  inner.push(SEP);

  inner.push(txt(
    `**Bot Settings**\n-# Manager Role  →  ${managerRoleId ? `<@&${managerRoleId}>` : '\`not set\`'}`
  ));
  inner.push({ type: 1, components: [
    btn(managerRoleId ? '🔑  Manager Role ✓' : '🔑  Set Manager Role', 'mgr2_set_manager_role', managerRoleId ? 1 : 2),
  ]});

  inner.push(SEP);

  inner.push({ type: 1, components: [
    btn('🔄  Refresh', 'mgr2_refresh', 2),
  ]});

  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: inner }] };
}

// ── Manager Role picker sub-panel — live role select ───────────────────────────
function buildManagerRolePickerPanel() {
  const managerRoleId = db.getConfig('manager_role_id');

  const inner = [
    txt(`# ⚙️  Set Manager Role\n> Select the role that can use the bot management panels.\n> Selection saves immediately.`),
    SEP,
    txt(`**Manager Role**  →  ${managerRoleId ? `<@&${managerRoleId}>` : '\`not set\`'}`),
    SEP,
    {
      type: 1, components: [{
        type: 6,
        custom_id: 'mgr2_manager_role_pick',
        placeholder: '🎟️  Select manager role…',
        min_values: 0, max_values: 1,
      }],
    },
    SEP,
    { type: 1, components: [{ type: 2, style: 2, label: '✓ Done', custom_id: 'mgr2_manager_role_done' }] },
  ];

  return { flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: inner }] };
}

// ── Admins sub-panel (kept for backward-compat) ───────────────────────────────
function buildAdminsSubPanel() {
  const admins = db.get('admins') || [];
  const inner  = [];

  inner.push(txt(
    `# 👥  Manage Admins & Managers\n` +
    `> **${admins.length}** user${admins.length !== 1 ? 's' : ''} with elevated access.`
  ));
  inner.push(SEP);

  if (!admins.length) {
    inner.push(txt('No admins or managers configured. Add one below.'));
  } else {
    const lines = admins.map((a, i) =>
      `\`${i + 1}.\`  <@${a.discord_id}>  —  \`${a.role}\``
    );
    inner.push(txt(lines.join('\n')));
  }
  inner.push(SEP);

  inner.push({ type: 1, components: [
    btn('Add Admin',   'mgr2_admin_add_admin',   1),
    btn('Add Manager', 'mgr2_admin_add_manager', 2),
    btn('Remove User', 'mgr2_admin_del_start',   4, admins.length === 0),
    btn('Back',        'mgr2_refresh',            2),
  ]});
  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: inner }] };
}

module.exports = {
  buildNewSeasonModal,
  buildManagePanelV2,
  buildAdminsSubPanel,
  buildManagerRolePickerPanel,
};
