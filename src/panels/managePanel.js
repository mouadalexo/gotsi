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
  const tournaments = db.get('tournaments').sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  const admins  = db.get('admins') || [];
  const botCfg  = db.getConfig('bot_config') || {};
  const catId   = db.getConfig('winners_history_category');

  const E_CUP  = '<a:cup:1501741159557500971>';
  const inner  = [];

  // Header
  inner.push(txt(
    `# ⚙️  NS eFootball — Manager Panel\n` +
    `> Bot: **${botCfg.name || 'Night Stars Bot'}**  |  ` +
    `Admins: **${admins.filter(a => a.role === 'admin').length}**  |  ` +
    `Managers: **${admins.filter(a => a.role === 'manager').length}**`
  ));
  inner.push(SEP);

  // Tournament list
  if (!tournaments.length) {
    inner.push(txt('No tournaments yet. Click **New Tournament** to create one.'));
  } else {
    const statusIcon = { setup: '⚙️', active: '🟢', finished: '🏁' };
    const lines = tournaments.slice(0, 8).map(t => {
      const roleSet = t.winner_role_id ? ' 🏆' : '';
      return (
        `${statusIcon[t.status] || '⚙️'}  **${t.name}**  S${t.season}  \`${t.status}\`` +
        (t.status === 'active' ? `  —  ${db.get('tournament_teams').filter(tt => tt.tournament_id === t.id).length} teams` : '') +
        roleSet
      );
    });
    inner.push(txt(`**Tournaments** *(🏆 = winner role configured)*\n${lines.join('\n')}`));
  }
  inner.push(SEP);

  // Main action buttons
  inner.push({ type: 1, components: [
    btn('New Tournament',   'mgr2_newtournament',  1),
    btn('Set Channels',     'mgr2_channels_start', 2),
    btn('Manage Admins',    'mgr2_admins',         2),
    btn('Bot Settings',     'mgr2_bots',           2),
    btn('Refresh',          'mgr2_refresh',        2),
  ]});
  inner.push({ type: 1, components: [
    btn('🏆 Winners Setup', 'mgr2_winners',        1),
    btn('🎟️ Reg. Role',     'mgr2_reg_role_start', 2),
    btn('⚙️ Template Cfg',   'mgr2_tpl_cfg',        2),
    btn('Reset Everything', 'mgr2_reset',          4),
  ]});
  inner.push(SEP);

  // Winners history category status
  if (catId) {
    inner.push(txt(`**Winners History Category:** <#${catId}>`));
  } else {
    inner.push(txt('**Winners History Category:** _Not configured_ — use **🏆 Winners Setup** to configure.'));
  }
  inner.push(SEP);

  // Admins list
  if (admins.length) {
    const lines = admins.map(a => `\`${a.role.padEnd(7)}\`  <@${a.discord_id}>`);
    inner.push(txt(`**Registered Admins & Managers**\n${lines.join('\n')}`));
    inner.push(SEP);
  }

  inner.push(txt('-# Night Stars  •  /manage  •  Admins only'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xEB459E, components: inner }] };
}

// ── Admins sub-panel ──────────────────────────────────────────────────────────
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

  const rows = [
    { type: 1, components: [
      btn('Add Admin',   'mgr2_admin_add_admin',   1),
      btn('Add Manager', 'mgr2_admin_add_manager', 2),
      btn('Remove User', 'mgr2_admin_del_start',   4, admins.length === 0),
      btn('Back',        'mgr2_refresh',            2),
    ]},
  ];
  for (const r of rows) inner.push(r);
  inner.push(SEP);
  inner.push(txt('-# Night Stars  •  /manage  •  Admin management'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xEB459E, components: inner }] };
}

// ── Winners Setup sub-panel ───────────────────────────────────────────────────
function buildWinnersSubPanel() {
  const tournaments = db.get('tournaments');
  const catId       = db.getConfig('winners_history_category');
  const inner       = [];

  inner.push(txt(
    `# 🏆  Winners History Setup\n` +
    `> **Category:** ${catId ? `<#${catId}>` : '`Not configured`'}`
  ));
  inner.push(SEP);

  if (!tournaments.length) {
    inner.push(txt('No tournaments yet.'));
  } else {
    // Group by template — winner role & history shared across seasons
    const byTpl = {};
    for (const t of tournaments) {
      const k = t.template || t.name;
      if (!byTpl[k] || t.season > byTpl[k].season) byTpl[k] = t;
    }
    const lines = Object.entries(byTpl).map(([tpl, t]) => {
      const roleStatus = t.winner_role_id ? `\u2705 <@&${t.winner_role_id}>` : '`Not set`';
      const refStatus  = t.winners_history_ref ? `\u2705 linked` : '`Not set`';
      return `**${tpl}**\n> Winner Role: ${roleStatus}  |  History Msg: ${refStatus}`;
    });
    inner.push(txt(lines.join('\n')));
  }
  inner.push(SEP);

  inner.push({ type: 1, components: [
    btn('Set Category',      'mgr2_winners_setup',      1),
    btn('Set Winner Role',   'mgr2_winner_role_start',  2),
    btn('Set History Msg',   'mgr2_winref_start',       2),
    btn('Back',              'mgr2_refresh',            2),
  ]});
  inner.push(SEP);
  inner.push(txt('-# Night Stars  •  Winners History Setup'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFFD700, components: inner }] };
}

module.exports = {
  buildNewSeasonModal,
  buildManagePanelV2,
  buildAdminsSubPanel,
  buildWinnersSubPanel,
};
