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
  const catId = db.getConfig('winners_history_category');

  const inner = [];

  inner.push(txt(`# Admin Panel`));
  inner.push(SEP);

  inner.push({ type: 1, components: [
    btn('New Tournament', 'mgr2_newtournament',  1),
    btn('Set Channels',   'mgr2_channels_start', 2),
  ]});

  inner.push({ type: 1, components: [
    btn('🏆 Winners Setup', 'mgr2_winners',        1),
    btn('Set Role',          'mgr2_reg_role_start', 2),
    btn('⚙️ Format Config',  'mgr2_tpl_cfg',        2),
  ]});

  inner.push(SEP);

  if (catId) {
    inner.push(txt(`**Winners History Category:** <#${catId}>`));
  } else {
    inner.push(txt('**Winners History Category:** _Not configured_ — use **🏆 Winners Setup** to configure.'));
  }

  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));

  inner.push({ type: 1, components: [
    btn('Refresh', 'mgr2_refresh', 2),
  ]});

  return { flags: 32768, components: [{ type: 17, accent_color: 0xEB459E, components: inner }] };
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

  return { flags: 32768, components: [{ type: 17, accent_color: 0xEB459E, components: inner }] };
}

// ── Winners Setup — tournament selector ───────────────────────────────────────
function buildWinnersSubPanel() {
  const tournaments = db.get('tournaments').filter(t => t.template !== 'TEST');
  const catId       = db.getConfig('winners_history_category');
  const inner       = [];

  inner.push(txt(
    `# 🏆  Winners Setup\n` +
    `> **Category:** ${catId ? `<#${catId}>` : '`Not configured`'}`
  ));
  inner.push(SEP);

  if (!tournaments.length) {
    inner.push(txt('No tournaments found.'));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Set Category', 'mgr2_winners_setup', 2),
      btn('Back',         'mgr2_refresh',       2),
    ]});
  } else {
    inner.push(txt('Select a tournament to manage its winner role and history.'));
    inner.push(SEP);
    inner.push({ type: 1, components: [{
      type: 3, custom_id: 'mgr2_winners_sel', placeholder: 'Select tournament…',
      options: tournaments.slice(0, 25).map(t => ({
        label: t.name.slice(0, 100),
        value: String(t.id),
        description: `Season ${t.season} · ${t.winner_role_id ? 'Role ✅' : 'Role not set'} · ${t.winners_history_ref ? 'History ✅' : 'History not set'}`,
      })),
    }]},);
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Set Category', 'mgr2_winners_setup', 2),
      btn('Back',         'mgr2_refresh',       2),
    ]});
  }

  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFFD700, components: inner }] };
}

// ── Per-tournament winners sub-panel ─────────────────────────────────────────
function buildWinnersForTournament(tid) {
  const t = db.findById('tournaments', tid);
  if (!t) return buildWinnersSubPanel();

  const catId  = db.getConfig('winners_history_category');
  const ref    = t.winners_history_ref || {};
  const inner  = [];

  inner.push(txt(
    `# 🏆  Winners — ${t.name}\n` +
    `> Season **${t.season}**`
  ));
  inner.push(SEP);
  inner.push(txt(
    `**Category:**       ${catId ? `<#${catId}>` : '`Not set`'}\n` +
    `**Winner Role:**    ${t.winner_role_id ? `✅ <@&${t.winner_role_id}>` : '`Not set`'}\n` +
    `**History Channel:**${ref.channelId ? ` ✅ <#${ref.channelId}>` : ' `Not set`'}\n` +
    `**History Message:**${ref.messageId ? ' ✅ Linked' : ' `Not set`'}`
  ));
  inner.push(SEP);

  inner.push({ type: 1, components: [
    btn('Set Winner Role',   `mgr2_wt_role_${tid}`,   2),
    btn('Set History Ref',   `mgr2_wt_ref_${tid}`,    2),
    btn('Re-post History',   `mgr2_wt_repost_${tid}`, 1, !ref.channelId),
  ]});
  inner.push({ type: 1, components: [
    btn('Back', 'mgr2_winners', 2),
  ]});

  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFFD700, components: inner }] };
}

module.exports = {
  buildNewSeasonModal,
  buildManagePanelV2,
  buildAdminsSubPanel,
  buildWinnersSubPanel,
  buildWinnersForTournament,
};
