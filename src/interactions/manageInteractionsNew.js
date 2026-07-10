'use strict';
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db }         = require('../utils/database');
const { isManager, isAdmin } = require('../utils/permissions');
const { buildManagePanelV2, buildAdminsSubPanel, buildManagerRolePickerPanel } = require('../panels/managePanel');

function noPermission(i) {
  return i.reply({ content: '❌ Admins only.', ephemeral: true });
}

// ── Format options ────────────────────────────────────────────────────────────
const FORMAT_OPTS = [
  { label: 'Group Stage + Knockout', value: 'group_knockout' },
  { label: 'Round Robin + Knockout', value: 'round_robin_knockout' },
  { label: 'Round Robin only',       value: 'round_robin' },
  { label: 'Knockout only',          value: 'knockout' },
  { label: 'Group Stage only',       value: 'group_stage' },
];

function formatLabel(val) {
  return FORMAT_OPTS.find(f => f.value === val)?.label || val || 'Group Stage + Knockout';
}

const TEAM_COUNT_OPTS     = [8,16,32,64].map(n => ({ label: `${n} Teams`,        value: String(n) }));
const TEAMS_PER_GROUP_OPTS= [4,6,8].map(n =>    ({ label: `${n} per Group`,      value: String(n) }));
const ADVANCE_OPTS        = [1,2,3].map(n =>    ({ label: `${n} per Group`,       value: String(n) }));
const PLAYERS_OPTS        = [1,2,3].map(n =>    ({ label: `${n}v${n}`,           value: String(n) }));
const ENCOUNTERS_OPTS     = [
  { label: '1 Match',           value: '1' },
  { label: '2 Matches (H/A)',   value: '2' },
];
const WIN_PTS_OPTS        = [2,3].map(n => ({ label: `${n} pts`, value: String(n) }));
const DRAW_PTS_OPTS       = [0,1].map(n => ({ label: `${n} pts`, value: String(n) }));

// ── Shared mkSel — supports plain values or {label,value} objects ─────────────
function mkSelOpts(opts, current) {
  return opts.map(v => {
    const lbl = typeof v === 'object' ? v.label : String(v);
    const val = typeof v === 'object' ? v.value : String(v);
    return { label: lbl, value: val, default: val === String(current) };
  });
}

// ── Create Tournament — settings config panel ─────────────────────────────────
function _buildNtConfigPanel(pending) {
  const SEP = { type: 14, divider: true, spacing: 1 };
  const mkSel = (label, field, opts, current) => {
    const options      = mkSelOpts(opts, current);
    const currentLabel = options.find(o => o.default)?.label || String(current);
    return {
      type: 1,
      components: [{
        type: 3, custom_id: `mgr2_nt_cfg_${field}`,
        placeholder: `${label}: ${currentLabel}`,
        options,
      }],
    };
  };
  const nGroups = pending.teams_per_group > 0 ? Math.ceil(pending.team_count / pending.teams_per_group) : '?';
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x57F287, components: [
      { type: 10, content:
        `**🏟️ Create Tournament — ${pending.name}**\n` +
        `-# Tag: \`${pending.template}\` · Groups: **${nGroups}** · Advance: **${pending.advance_per_group}/group**\n` +
        `Adjust settings below, then click **Create**.`
      },
      SEP,
      mkSel('Format',           'type',             FORMAT_OPTS,          pending.type),
      mkSel('Total Teams',      'team_count',        TEAM_COUNT_OPTS,      pending.team_count),
      mkSel('Teams per Group',  'teams_per_group',   TEAMS_PER_GROUP_OPTS, pending.teams_per_group),
      mkSel('Advance / Group',  'advance_per_group', ADVANCE_OPTS,         pending.advance_per_group),
      mkSel('Players / Team',   'players_per_team',  PLAYERS_OPTS,         pending.players_per_team),
      mkSel('Encounters/Match', 'encounters',         ENCOUNTERS_OPTS,      pending.encounters),
      mkSel('Win Points',       'win_pts',            WIN_PTS_OPTS,         pending.win_pts),
      mkSel('Draw Points',      'draw_pts',           DRAW_PTS_OPTS,        pending.draw_pts),
      SEP,
      { type: 1, components: [
        { type: 2, style: 3, label: '✅ Create Tournament', custom_id: 'mgr2_nt_confirm' },
        { type: 2, style: 4, label: '✖ Cancel',             custom_id: 'mgr2_refresh' },
      ]},
    ]}],
  };
}

// ── Tournament Settings — tournament list panel ───────────────────────────────
function _buildTsListPanel() {
  const SEP = { type: 14, divider: true, spacing: 1 };
  const all = db.get('tournaments').filter(t => t.template !== 'TEST').sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  if (!all.length) {
    return {
      flags: 32768,
      components: [{ type: 17, accent_color: 0x5865F2, components: [
        { type: 10, content: '**⚙️ Tournament Settings**\nNo tournaments found.' },
        SEP,
        { type: 1, components: [{ type: 2, style: 2, label: '◀ Back', custom_id: 'mgr2_refresh' }] },
      ]}],
    };
  }
  // Deduplicate: one entry per template — active wins, else most recent
  const seen = new Map();
  for (const t of all) {
    const existing = seen.get(t.template);
    if (!existing) { seen.set(t.template, t); continue; }
    const existingActive = existing.status === 'active';
    const tActive        = t.status === 'active';
    if (tActive && !existingActive) seen.set(t.template, t);
  }
  const deduped = [...seen.values()].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      { type: 10, content: '**⚙️ Tournament Settings — Select a tournament to edit**' },
      SEP,
      { type: 1, components: [{
        type: 3,
        custom_id: 'mgr2_ts_sel',
        placeholder: 'Select tournament…',
        options: deduped.slice(0, 25).map(t => ({
          label: t.name.slice(0, 100),
          value: String(t.id),
        })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: '◀ Back', custom_id: 'mgr2_refresh' }] },
    ]}],
  };
}

// ── Tournament Settings — editor for one tournament ───────────────────────────
function _buildTsEditPanel(tid) {
  const t = db.findById('tournaments', tid);
  if (!t) return _buildTsListPanel();
  const SEP = { type: 14, divider: true, spacing: 1 };
  const mkSel = (label, field, opts, current) => {
    const options      = mkSelOpts(opts, current);
    const currentLabel = options.find(o => o.default)?.label || String(current);
    return {
      type: 1,
      components: [{
        type: 3, custom_id: `mgr2_ts_field_${tid}_${field}`,
        placeholder: `${label}: ${currentLabel}`,
        options,
      }],
    };
  };
  const nGroups = (t.teams_per_group > 0) ? Math.ceil(t.team_count / t.teams_per_group) : '?';
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      { type: 10, content:
        `**⚙️ Tournament Settings — ${t.name}**\n` +
        `-# Tag: \`${t.template}\` · Groups: **${nGroups}** · Advance: **${t.advance_per_group}/group** · Info: ${t.info_channel ? `<#${t.info_channel}>` : '\`not set\`'}`
      },
      SEP,
      mkSel('Format',           'type',              FORMAT_OPTS,          t.type || 'group_knockout'),
      mkSel('Total Teams',      'team_count',         TEAM_COUNT_OPTS,      t.team_count),
      mkSel('Teams per Group',  'teams_per_group',    TEAMS_PER_GROUP_OPTS, t.teams_per_group),
      mkSel('Advance / Group',  'advance_per_group',  ADVANCE_OPTS,         t.advance_per_group),
      mkSel('Players / Team',   'players_per_team',   PLAYERS_OPTS,         t.players_per_team),
      mkSel('Encounters',       'encounters',          ENCOUNTERS_OPTS,      t.encounters),
      mkSel('Win Points',       'win_pts',             WIN_PTS_OPTS,         t.win_pts ?? 3),
      mkSel('Draw Points',      'draw_pts',            DRAW_PTS_OPTS,        t.draw_pts ?? 1),
      SEP,
      { type: 1, components: [
        { type: 2, style: 1, label: '✏️ Edit Name', custom_id: `mgr2_ts_name_${tid}` },
        { type: 2, style: 1, label: '🏷️ Edit Tag',  custom_id: `mgr2_ts_tag_${tid}` },
        { type: 2, style: 2, label: '◀ Back',       custom_id: 'mgr2_tournsettings' },
      ]},
    ]}],
  };
}

// ── Setup — combined Channels + Role panel for one tournament ─────────────────
function _buildSetupPanel(tid) {
  const t = db.findById('tournaments', tid);
  if (!t) return _buildSetupListPanel();
  const ch   = t.channels || {};
  const SEP2 = { type: 14, divider: true, spacing: 1 };
  const chSel = (label, key) => ({
    type: 1,
    components: [{
      type: 8, custom_id: `mgr2_ch_${tid}_${key}`,
      placeholder: ch[key] ? `${label} (currently set)` : `${label} — select channel`,
      channel_types: [0, 5], min_values: 0, max_values: 1,
      ...(ch[key] ? { default_values: [{ id: ch[key], type: 'channel' }] } : {}),
    }],
  });
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      { type: 10, content:
        `**⚙️ Setup — ${t.name}**\n` +
        `Select a channel for each category. Changes save instantly.\n` +
        `-# Tag Role → ${t.registration_role_id ? `<@&${t.registration_role_id}>` : '\`not set\`'}`
      },
      SEP2,
      chSel('Management', 'management'),
      chSel('Results & Standings', 'results'),
      chSel('Schedule', 'schedule'),
      chSel('Teams List', 'teamsList'),
      { type: 1, components: [{
        type: 8, custom_id: `mgr2_ch_${tid}_info`,
        placeholder: t.info_channel ? 'Info Channel (currently set)' : 'Info Channel — select channel',
        channel_types: [0, 5], min_values: 0, max_values: 1,
        ...(t.info_channel ? { default_values: [{ id: t.info_channel, type: 'channel' }] } : {}),
      }]},
      SEP2,
      { type: 1, components: [
        { type: 2, style: t.registration_role_id ? 1 : 2, label: t.registration_role_id ? '🎟️ Role ✓' : '🎟️ Set Role', custom_id: `mgr2_setup_role_${tid}` },
        { type: 2, style: 2, label: '◀ Back', custom_id: 'mgr2_setup_start' },
      ]},
    ]}],
  };
}

function _buildSetupListPanel() {
  const allSetup = db.get('tournaments').filter(t => t.template !== 'TEST');
  const dedupedSetup = Object.values(
    allSetup.reduce((acc, t) => {
      const prev = acc[t.template];
      if (!prev || t.status === 'active' || (prev.status !== 'active' && t.season > prev.season))
        acc[t.template] = t;
      return acc;
    }, {})
  );
  const SEP2 = { type: 14, divider: true, spacing: 1 };
  if (!dedupedSetup.length) {
    return {
      flags: 32768,
      components: [{ type: 17, accent_color: 0x5865F2, components: [
        { type: 10, content: '**⚙️ Setup**\nNo tournaments found.' },
        SEP2,
        { type: 1, components: [{ type: 2, style: 2, label: '◀ Back', custom_id: 'mgr2_refresh' }] },
      ]}],
    };
  }
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      { type: 10, content: '**⚙️ Setup — Select a tournament**' },
      SEP2,
      { type: 1, components: [{
        type: 3, custom_id: 'mgr2_setup_sel', placeholder: 'Select tournament...',
        options: dedupedSetup
          .sort((a, b) => a.template.localeCompare(b.template))
          .map(t => ({ label: t.name.slice(0, 100), value: String(t.id) })),
      }]},
      SEP2,
      { type: 1, components: [{ type: 2, style: 2, label: '◀ Back', custom_id: 'mgr2_refresh' }]},
    ]}],
  };
}

function _buildSetupRolePanel(tid) {
  const t = db.findById('tournaments', tid);
  if (!t) return _buildSetupListPanel();
  const SEP2 = { type: 14, divider: true, spacing: 1 };
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xFFD700, components: [
      { type: 10, content:
        `**🎟️ Set Registration Role — ${t.name}**\n` +
        `> Current role: ${t.registration_role_id ? `<@&${t.registration_role_id}>` : '\`Not set\`'}\n` +
        `-# Selection saves immediately.`
      },
      SEP2,
      { type: 1, components: [{
        type: 6,
        custom_id: `mgr2_setup_role_pick_${tid}`,
        placeholder: '🎟️ Select registration role…',
        min_values: 0, max_values: 1,
      }]},
      SEP2,
      { type: 1, components: [{ type: 2, style: 2, label: '◀ Back', custom_id: `mgr2_setup_sel_direct_${tid}` }]},
    ]}],
  };
}

async function handleMgr2Interaction(interaction) {
  const id = interaction.customId;

  if (!isManager(interaction.member)) return noPermission(interaction);

  // ── Refresh manage panel ─────────────────────────────────────────────────
  if (id === 'mgr2_refresh') {
    return interaction.update(buildManagePanelV2());
  }

  // ── Manage Admins (backward-compat) ──────────────────────────────────────
  if (id === 'mgr2_admins') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    return interaction.update(buildAdminsSubPanel());
  }

  if (id === 'mgr2_admin_add_admin' || id === 'mgr2_admin_add_manager') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const role = id === 'mgr2_admin_add_admin' ? 'admin' : 'manager';
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_admin_add_modal_${role}`).setTitle(`Add ${role}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('discord_id').setLabel('Discord User ID')
              .setStyle(TextInputStyle.Short).setPlaceholder('1234567890123456789').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('username').setLabel('Username (for display)')
              .setStyle(TextInputStyle.Short).setPlaceholder('username').setRequired(false)
          ),
        )
    );
  }

  if (id.startsWith('mgr2_admin_add_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const role      = id.replace('mgr2_admin_add_modal_', '');
    const discordId = interaction.fields.getTextInputValue('discord_id').trim().replace(/\D/g, '');
    const username  = interaction.fields.getTextInputValue('username').trim();
    if (!discordId) return interaction.reply({ content: '❌ Invalid Discord ID.', ephemeral: true });
    const existing = db.findOne('admins', a => a.discord_id === discordId);
    if (existing) {
      db.update('admins', existing.id, { role, username: username || existing.username });
    } else {
      db.insert('admins', { discord_id: discordId, username, role });
    }
    await interaction.deferUpdate();
    await interaction.editReply(buildAdminsSubPanel());
    return interaction.followUp({ content: `✅ <@${discordId}> added as **${role}**.`, ephemeral: true });
  }

  if (id === 'mgr2_admin_del_start') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const admins = db.get('admins') || [];
    if (!admins.length) return interaction.reply({ content: '❌ No admins to remove.', ephemeral: true });
    const SEP = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0xED4245, components: [
        { type: 10, content: '**Remove Admin/Manager — Select user**' },
        SEP,
        { type: 1, components: [{
          type: 3, custom_id: 'mgr2_admin_del_sel', placeholder: 'Select user to remove...',
          options: admins.slice(0, 25).map(a => ({
            label: a.username || `User ${a.discord_id}`,
            value: String(a.id),
            description: a.role,
          })),
        }]},
        SEP,
        { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'mgr2_admins' }]},
      ]}],
    });
  }

  if (id === 'mgr2_admin_del_sel') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const adminId = parseInt(interaction.values[0]);
    const admin   = db.findById('admins', adminId);
    if (!admin) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
    db.delete('admins', adminId);
    await interaction.update(buildAdminsSubPanel());
    return interaction.followUp({ content: `✅ Removed <@${admin.discord_id}> (${admin.role}).`, ephemeral: true });
  }

  // ── Create Tournament — Step 1: modal (name + tag) ───────────────────────
  if (id === 'mgr2_newtournament') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    return interaction.showModal(
      new ModalBuilder().setCustomId('mgr2_nt_modal').setTitle('Create Tournament')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name')
              .setLabel('Tournament Name').setStyle(TextInputStyle.Short)
              .setPlaceholder('e.g. European League').setMaxLength(80).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('template')
              .setLabel('Initialism Tag (e.g. EL, CL, NSF, UCL)')
              .setStyle(TextInputStyle.Short).setPlaceholder('EL').setMaxLength(10).setRequired(true)
          ),
        )
    );
  }

  // ── Create Tournament — Step 2: modal submit → settings config panel ─────
  if (id === 'mgr2_nt_modal') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const name = interaction.fields.getTextInputValue('name').trim();
    const tpl  = interaction.fields.getTextInputValue('template').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!name) return interaction.reply({ content: '❌ Name cannot be empty.', ephemeral: true });
    if (!tpl)  return interaction.reply({ content: '❌ Initialism tag cannot be empty.', ephemeral: true });
    const season = db.get('tournaments').filter(t => t.template === tpl).length + 1;
    const pending = {
      template: tpl, season, name,
      type: 'group_knockout',
      team_count: 16, teams_per_group: 4,
      advance_per_group: 2, players_per_team: 1, encounters: 1,
      win_pts: 3, draw_pts: 1,
    };
    db.setConfig(`mgr2_pending_${interaction.user.id}`, pending);
    return interaction.update(_buildNtConfigPanel(pending));
  }

  // ── Create Tournament — dropdown setting changes ──────────────────────────
  if (id.startsWith('mgr2_nt_cfg_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const field   = id.slice('mgr2_nt_cfg_'.length);
    const pending = db.getConfig(`mgr2_pending_${interaction.user.id}`);
    if (!pending) return interaction.update({ content: '❌ Session expired. Start again.', components: [] });
    const raw     = interaction.values[0];
    pending[field] = isNaN(Number(raw)) ? raw : Number(raw);
    db.setConfig(`mgr2_pending_${interaction.user.id}`, pending);
    return interaction.update(_buildNtConfigPanel(pending));
  }

  // ── Create Tournament — confirm & create ─────────────────────────────────
  if (id === 'mgr2_nt_confirm') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const pending = db.getConfig(`mgr2_pending_${interaction.user.id}`);
    if (!pending) return interaction.update(buildManagePanelV2());
    db.setConfig(`mgr2_pending_${interaction.user.id}`, null);
    return interaction.update({ content: '❌ Tournaments are pre-configured. Use `/panels` to manage existing ones.', components: [] });
  }

  // ── Tournament Settings — show tournament list ────────────────────────────
  if (id === 'mgr2_tournsettings') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    return interaction.update(_buildTsListPanel());
  }

  // ── Tournament Settings — tournament selected → editor ───────────────────
  if (id === 'mgr2_ts_sel') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid = parseInt(interaction.values[0]);
    return interaction.update(_buildTsEditPanel(tid));
  }

  // ── Tournament Settings — dropdown field change ───────────────────────────
  if (id.startsWith('mgr2_ts_field_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const rest  = id.replace('mgr2_ts_field_', '');
    const under = rest.indexOf('_');
    const tid   = parseInt(rest.slice(0, under));
    const field = rest.slice(under + 1);
    const raw   = interaction.values[0];
    const val   = isNaN(Number(raw)) ? raw : Number(raw);
    db.update('tournaments', tid, { [field]: val });
    return interaction.update(_buildTsEditPanel(tid));
  }

  // ── Tournament Settings — edit name button ────────────────────────────────
  if (id.startsWith('mgr2_ts_name_') && !id.startsWith('mgr2_ts_name_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('mgr2_ts_name_', ''));
    const t   = db.findById('tournaments', tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_ts_name_modal_${tid}`).setTitle(`Rename — ${t.name.slice(0, 35)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('New Tournament Name')
              .setStyle(TextInputStyle.Short).setValue(t.name).setMaxLength(80).setRequired(true)
          )
        )
    );
  }

  // ── Tournament Settings — name modal submit ───────────────────────────────
  if (id.startsWith('mgr2_ts_name_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid  = parseInt(id.replace('mgr2_ts_name_modal_', ''));
    const name = interaction.fields.getTextInputValue('name').trim();
    if (!name) return interaction.reply({ content: '❌ Name cannot be empty.', ephemeral: true });
    db.update('tournaments', tid, { name });
    await interaction.deferUpdate();
    await interaction.editReply(_buildTsEditPanel(tid));
    return interaction.followUp({ content: `✅ Renamed to **${name}**.`, ephemeral: true });
  }

  // ── Tournament Settings — edit tag button ─────────────────────────────────
  if (id.startsWith('mgr2_ts_tag_') && !id.startsWith('mgr2_ts_tag_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('mgr2_ts_tag_', ''));
    const t   = db.findById('tournaments', tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_ts_tag_modal_${tid}`).setTitle(`Edit Tag — ${t.name.slice(0, 30)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('tag').setLabel('Initialism Tag (e.g. EL, CL)')
              .setStyle(TextInputStyle.Short).setValue(t.template).setMaxLength(10).setRequired(true)
          )
        )
    );
  }

  // ── Tournament Settings — tag modal submit ────────────────────────────────
  if (id.startsWith('mgr2_ts_tag_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('mgr2_ts_tag_modal_', ''));
    const tag = interaction.fields.getTextInputValue('tag').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!tag) return interaction.reply({ content: '❌ Tag cannot be empty.', ephemeral: true });
    db.update('tournaments', tid, { template: tag });
    await interaction.deferUpdate();
    await interaction.editReply(_buildTsEditPanel(tid));
    return interaction.followUp({ content: `✅ Tag updated to \`${tag}\`.`, ephemeral: true });
  }

  // ── Setup — combined Set Channels + Set Role ─────────────────────────────
  if (id === 'mgr2_setup_start') {
    return interaction.update(_buildSetupListPanel());
  }

  if (id === 'mgr2_setup_sel') {
    const tid = parseInt(interaction.values[0]);
    const t   = db.findById('tournaments', tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    return interaction.update(_buildSetupPanel(tid));
  }

  if (id.startsWith('mgr2_setup_sel_direct_')) {
    const tid = parseInt(id.replace('mgr2_setup_sel_direct_', ''));
    return interaction.update(_buildSetupPanel(tid));
  }

  if (id.startsWith('mgr2_ch_')) {
    const parts2 = id.replace('mgr2_ch_', '').split('_');
    const tid2   = parseInt(parts2[0]);
    const key2   = parts2.slice(1).join('_');
    const t2     = db.findById('tournaments', tid2);
    if (!t2) return interaction.reply({ content: '❌ Tournament not found.', flags: 64 });
    const val    = (interaction.values && interaction.values[0]) || null;
    if (key2 === 'info') {
      db.update('tournaments', tid2, { info_channel: val || null });
      return interaction.update(_buildSetupPanel(tid2));
    }
    const updCh  = { ...(t2.channels || {}), [key2]: val };
    if (key2 === 'results') updCh.standings = val;
    db.update('tournaments', tid2, { channels: updCh });
    return interaction.update(_buildSetupPanel(tid2));
  }

  // ── Setup — Set Role button → role picker ────────────────────────────────
  if (id.startsWith('mgr2_setup_role_') && !id.startsWith('mgr2_setup_role_pick_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('mgr2_setup_role_', ''));
    return interaction.update(_buildSetupRolePanel(tid));
  }

  if (id.startsWith('mgr2_setup_role_pick_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid       = parseInt(id.replace('mgr2_setup_role_pick_', ''));
    const regRoleId = (interaction.values && interaction.values[0]) || null;
    db.update('tournaments', tid, { registration_role_id: regRoleId });
    return interaction.update(_buildSetupRolePanel(tid));
  }

  // ── Set Manager Role — live role picker ──────────────────────────────────
  if (id === 'mgr2_set_manager_role') {
    return interaction.update(buildManagerRolePickerPanel());
  }

  if (id === 'mgr2_manager_role_pick') {
    const roleId = (interaction.values && interaction.values[0]) || null;
    db.setConfig('manager_role_id', roleId);
    return interaction.update(buildManagerRolePickerPanel());
  }

  if (id === 'mgr2_manager_role_done') {
    await interaction.deferUpdate();
    return interaction.editReply(buildManagePanelV2());
  }


}

module.exports = { handleMgr2Interaction };
