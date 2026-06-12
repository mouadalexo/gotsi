'use strict';
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, ChannelType,
} = require('discord.js');
const { db }         = require('../utils/database');
const { getTplCfg, getKnownTemplates } = require('../utils/templateConfig');
const { isManager, isAdmin } = require('../utils/permissions');
const { buildManagePanelV2, buildAdminsSubPanel, buildWinnersSubPanel, buildWinnersForTournament } = require('../panels/managePanel');
const { buildWinnersHistoryPayload } = require('../utils/winnersHistory');

function noPermission(i) {
  return i.reply({ content: '❌ Admins only.', ephemeral: true });
}

const _getTplCfg        = getTplCfg;
const _getKnownTemplates = getKnownTemplates;


function _buildNtConfigPanel(pending, cfg) {
  const SEP   = { type: 14, divider: true, spacing: 1 };
  const mkSel = (label, field, opts, current) => ({
    type: 1,
    components: [{
      type: 3, custom_id: `mgr2_nt_cfg_${field}`,
      placeholder: `${label}: ${current}`,
      options: opts.map(v => ({ label: String(v), value: String(v), default: String(v) === String(current) })),
    }],
  });
  const nGroups = pending.teams_per_group > 0 ? Math.ceil(pending.team_count / pending.teams_per_group) : '?';
  const lockedLines = [
    cfg.team_count_opts.length === 1 ? `Teams: **${pending.team_count}**`              : null,
    cfg.tpg_opts.length        === 1 ? `Teams/Group: **${pending.teams_per_group}**`   : null,
    cfg.apg_opts.length        === 1 ? `Advance/Group: **${pending.advance_per_group}**` : null,
    cfg.ppt_opts.length        === 1 ? `Players/Team: **${pending.players_per_team}**` : null,
    cfg.enc_opts.length        === 1 ? `Encounters: **${pending.encounters}**`          : null,
  ].filter(Boolean);
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x57F287, components: [
      { type: 10, content: `**🏟️ New Tournament — ${pending.name}**\nGroups: **${nGroups}** · Advance: **${pending.advance_per_group}/group**\nSelect settings below, then click **Create**.` },
      SEP,
      ...(cfg.team_count_opts.length  > 1 ? [mkSel('Total Teams',        'team_count',        cfg.team_count_opts,  pending.team_count)]        : []),
      ...(cfg.tpg_opts.length         > 1 ? [mkSel('Teams per Group',    'teams_per_group',   cfg.tpg_opts,         pending.teams_per_group)]    : []),
      ...(cfg.apg_opts.length         > 1 ? [mkSel('Advance per Group',  'advance_per_group', cfg.apg_opts,         pending.advance_per_group)]  : []),
      ...(cfg.ppt_opts.length         > 1 ? [mkSel('Players per Team',   'players_per_team',  cfg.ppt_opts,         pending.players_per_team)]   : []),
      ...(cfg.enc_opts.length         > 1 ? [mkSel('Encounters/Match',   'encounters',        cfg.enc_opts,         pending.encounters)]         : []),
      ...(lockedLines.length          > 0 ? [{ type: 10, content: `-# Fixed: ${lockedLines.join(' · ')}` }] : []),
      SEP,
      { type: 1, components: [
        { type: 2, style: 3, label: '✅ Create Tournament', custom_id: 'mgr2_nt_confirm' },
        { type: 2, style: 4, label: '✖ Cancel',             custom_id: 'mgr2_refresh' },
      ]},
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

  // ── Manage Admins (backward-compat — buttons no longer shown in panel) ───
  if (id === 'mgr2_admins') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    return interaction.update(buildAdminsSubPanel());
  }

  if (id === 'mgr2_admin_add_admin' || id === 'mgr2_admin_add_manager') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const role = id === 'mgr2_admin_add_admin' ? 'admin' : 'manager';
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_admin_add_modal_${role}`).setTitle(`Add ${role.charAt(0).toUpperCase() + role.slice(1)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('discord_id').setLabel('Discord User ID')
              .setStyle(TextInputStyle.Short).setPlaceholder('123456789012345678').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('username').setLabel('Username (for display)')
              .setStyle(TextInputStyle.Short).setRequired(false)
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

  // ── New Tournament — Step 0: choose template ────────────────────────────
  if (id === 'mgr2_newtournament') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tpls = _getKnownTemplates();
    const SEP  = { type: 14, divider: true, spacing: 1 };
    const btns = tpls.map(tpl => ({ type: 2, style: 1, label: tpl, custom_id: `mgr2_nt_tpl_${tpl}` }));
    btns.push({ type: 2, style: 2, label: 'Custom…', custom_id: 'mgr2_nt_tpl_CUSTOM' });
    const rows = [];
    for (let i = 0; i < btns.length; i += 5) rows.push({ type: 1, components: btns.slice(i, i + 5) });
    rows.push({ type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'mgr2_refresh' }] });
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0x5865F2, components: [
        { type: 10, content: '**🏟️ New Tournament — Choose Template**\nSelect the competition format:' },
        SEP, ...rows,
      ]}],
    });
  }

  if (id.startsWith('mgr2_nt_tpl_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tpl    = id.slice('mgr2_nt_tpl_'.length);
    const fields = [
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('season')
          .setLabel('Season Number (e.g. 1, 2, 16)')
          .setStyle(TextInputStyle.Short).setPlaceholder('1').setRequired(true)
      ),
    ];
    if (tpl === 'CUSTOM') {
      fields.unshift(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('custom_template')
          .setLabel('Template Tag (e.g. NSF, CUP)')
          .setStyle(TextInputStyle.Short).setPlaceholder('NSF').setMaxLength(10).setRequired(true)
      ));
    }
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_nt_season_${tpl}`)
        .setTitle(tpl === 'CUSTOM' ? 'New Custom Tournament' : `New ${tpl} Season`)
        .addComponents(...fields)
    );
  }

  if (id.startsWith('mgr2_nt_season_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    let tpl = id.slice('mgr2_nt_season_'.length);
    if (tpl === 'CUSTOM') tpl = interaction.fields.getTextInputValue('custom_template').trim().toUpperCase();
    const seasonRaw = interaction.fields.getTextInputValue('season').trim();
    const seasonNum = parseInt(seasonRaw.replace(/\D/g, ''), 10);
    if (!seasonNum || seasonNum < 1 || seasonNum > 999)
      return interaction.reply({ content: '❌ Season must be a number (e.g. 1, 16, 100).', ephemeral: true });
    if (db.get('tournaments').find(t => t.template === tpl && t.season === seasonNum))
      return interaction.reply({ content: `❌ ${tpl} S${seasonNum} already exists.`, ephemeral: true });
    const cfg     = _getTplCfg(tpl);
    const pending = {
      template: tpl, season: seasonNum, name: `${tpl} S${seasonNum}`,
      team_count: cfg.team_count_opts[0], teams_per_group: cfg.tpg_opts[0],
      advance_per_group: cfg.apg_opts[0], players_per_team: cfg.ppt_opts[0],
      encounters: cfg.enc_opts[0],
    };
    db.setConfig(`mgr2_pending_${interaction.user.id}`, pending);
    return interaction.reply(_buildNtConfigPanel(pending, cfg));
  }

  if (id.startsWith('mgr2_nt_cfg_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const field   = id.slice('mgr2_nt_cfg_'.length);
    const pending = db.getConfig(`mgr2_pending_${interaction.user.id}`);
    if (!pending) return interaction.update({ content: '❌ Session expired. Start again.', components: [] });
    const raw     = interaction.values[0];
    pending[field] = isNaN(Number(raw)) ? raw : Number(raw);
    db.setConfig(`mgr2_pending_${interaction.user.id}`, pending);
    return interaction.update(_buildNtConfigPanel(pending, _getTplCfg(pending.template)));
  }

  if (id === 'mgr2_nt_confirm') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const pending = db.getConfig(`mgr2_pending_${interaction.user.id}`);
    if (!pending) return interaction.update(buildManagePanelV2());
    if (db.get('tournaments').find(t => t.template === pending.template && t.season === pending.season)) {
      db.setConfig(`mgr2_pending_${interaction.user.id}`, null);
      return interaction.update(buildManagePanelV2());
    }
    const t = db.insert('tournaments', {
      name: pending.name, template: pending.template, season: pending.season,
      team_count: pending.team_count, teams_per_group: pending.teams_per_group,
      advance_per_group: pending.advance_per_group,
      players_per_team: pending.players_per_team, encounters: pending.encounters,
      win_pts: 3, draw_pts: 1, loss_pts: 0, forfeit_pts: 0,
      round_deadline_hours: null, status: 'setup', registration_open: true,
      type: 'group_knockout', channels: {},
    });
    db.setConfig(`mgr2_pending_${interaction.user.id}`, null);
    const catId = db.getConfig('winners_history_category');
    if (catId) {
      try {
        const chName = `${t.template.toLowerCase().replace(/[^a-z0-9]/g, '-')}-winners`;
        const winCh  = await interaction.guild.channels.create({
          name: chName, type: ChannelType.GuildText, parent: catId,
          topic: `Winners History — ${t.name}`,
        });
        const initMsg = await winCh.send(buildWinnersHistoryPayload(t.id)).catch(() => null);
        if (initMsg) db.update('tournaments', t.id, { winners_history_ref: { channelId: winCh.id, messageId: initMsg.id } });
      } catch (e) { console.error('[Winners] Failed to create history channel:', e.message); }
    }
    await interaction.update(buildManagePanelV2());
    const nGroups = Math.ceil(t.team_count / t.teams_per_group);
    return interaction.followUp({
      content: `✅ **${t.name}** created!\n> **${t.team_count}** teams · **${nGroups}** groups of **${t.teams_per_group}** · **${t.advance_per_group}** advance/group · **${t.players_per_team}v${t.players_per_team}**${catId ? '\n🏆 Winners History channel auto-created.' : ''}\nUse \`/panels\` to open its panels.`,
      ephemeral: true,
    });
  }

  // ── Format Config (⚙️) ───────────────────────────────────────────────────
  if (id === 'mgr2_tpl_cfg') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tpls = _getKnownTemplates();
    const SEP  = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0xFEE75C, components: [
        { type: 10, content: '**⚙️ Format Config — Select a template to edit**' },
        SEP,
        { type: 1, components: [{
          type: 3, custom_id: 'mgr2_tpl_cfg_sel', placeholder: 'Select template…',
          options: tpls.slice(0, 25).map(tpl => {
            const c = _getTplCfg(tpl);
            return { label: tpl, value: tpl, description: `Teams: ${c.team_count_opts.join('/')} · TPG: ${c.tpg_opts.join('/')} · APG: ${c.apg_opts.join('/')} · PPT: ${c.ppt_opts.join('/')}` };
          }),
        }]},
        SEP,
        { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'mgr2_refresh' }]},
      ]}],
    });
  }

  if (id === 'mgr2_tpl_cfg_sel') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tpl = interaction.values[0];
    const cfg = _getTplCfg(tpl);
    const SEP = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0xFEE75C, components: [
        { type: 10, content: `**⚙️ Format Config — ${tpl}**\n> Teams: **${cfg.team_count_opts.join(', ')}** · Groups of: **${cfg.tpg_opts.join(', ')}** · Advance: **${cfg.apg_opts.join(', ')}** · Players/Team: **${cfg.ppt_opts.join(', ')}** · Encounters: **${cfg.enc_opts.join(', ')}**` },
        SEP,
        { type: 1, components: [
          { type: 2, style: 1, label: `Edit ${tpl} options`, custom_id: `mgr2_tpl_cfg_edit_${tpl}` },
          { type: 2, style: 2, label: 'Back', custom_id: 'mgr2_tpl_cfg' },
        ]},
      ]}],
    });
  }

  if (id.startsWith('mgr2_tpl_cfg_edit_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tpl = id.slice('mgr2_tpl_cfg_edit_'.length);
    const cfg = _getTplCfg(tpl);
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_tpl_cfg_save_${tpl}`).setTitle(`Format Config — ${tpl}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('team_count_opts').setLabel('Team Count options (comma-separated)')
              .setStyle(TextInputStyle.Short).setValue(cfg.team_count_opts.join(', ')).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('tpg_opts').setLabel('Teams per Group options')
              .setStyle(TextInputStyle.Short).setValue(cfg.tpg_opts.join(', ')).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('apg_opts').setLabel('Advance per Group options')
              .setStyle(TextInputStyle.Short).setValue(cfg.apg_opts.join(', ')).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('ppt_opts').setLabel('Players per Team options (1=solo, 2=duo…)')
              .setStyle(TextInputStyle.Short).setValue(cfg.ppt_opts.join(', ')).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('enc_opts').setLabel('Encounters/Match (1=single, 2=H+A)')
              .setStyle(TextInputStyle.Short).setValue(cfg.enc_opts.join(', ')).setRequired(true)
          ),
        )
    );
  }

  if (id.startsWith('mgr2_tpl_cfg_save_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tpl      = id.slice('mgr2_tpl_cfg_save_'.length);
    const parseOpts = raw => raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
    const newCfg   = {
      team_count_opts: parseOpts(interaction.fields.getTextInputValue('team_count_opts')),
      tpg_opts:        parseOpts(interaction.fields.getTextInputValue('tpg_opts')),
      apg_opts:        parseOpts(interaction.fields.getTextInputValue('apg_opts')),
      ppt_opts:        parseOpts(interaction.fields.getTextInputValue('ppt_opts')),
      enc_opts:        parseOpts(interaction.fields.getTextInputValue('enc_opts')),
    };
    if (Object.values(newCfg).some(a => !a.length))
      return interaction.reply({ content: '❌ Each field needs at least one valid number.', ephemeral: true });
    db.setConfig(`tpl_cfg_${tpl}`, newCfg);
    await interaction.deferUpdate();
    await interaction.editReply(buildManagePanelV2());
    return interaction.followUp({ content: `✅ Format config for **${tpl}** saved!`, ephemeral: true });
  }

  // ── Set Channels (per tournament) ────────────────────────────────────────
  if (id === 'mgr2_channels_start') {
    const tournaments = db.get('tournaments').filter(t => t.status !== 'finished');
    if (!tournaments.length) return interaction.reply({ content: '❌ No active tournaments.', ephemeral: true });
    const SEP = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0x5865F2, components: [
        { type: 10, content: '**📺 Set Channels — Select a tournament**' },
        SEP,
        { type: 1, components: [{
          type: 3, custom_id: 'mgr2_channels_sel', placeholder: 'Select tournament...',
          options: [
            { label: 'Test', value: 'test' },
            ...tournaments
              .filter(t => t.template !== 'TEST')
              .sort((a, b) => {
                if (a.status === 'active' && b.status !== 'active') return -1;
                if (b.status === 'active' && a.status !== 'active') return 1;
                return a.template.localeCompare(b.template);
              })
              .slice(0, 24)
              .map(t => ({ label: t.name.slice(0, 100), value: String(t.id) })),
          ],
        }]},
        SEP,
        { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'mgr2_refresh' }]},
      ]}],
    });
  }

  if (id === 'mgr2_channels_sel') {
    if (interaction.values[0] === 'test') {
      const rId = db.getConfig('test_results_channel_id');
      const sId = db.getConfig('test_schedule_channel_id');
      const SEP2 = { type: 14, divider: true, spacing: 1 };
      const mkPicker = (label, key, currentId) => ({
        type: 1,
        components: [{
          type: 8, custom_id: `mgr2_testch_${key}`,
          placeholder: currentId ? `${label} (currently set)` : `${label} — select channel`,
          channel_types: [0, 5], min_values: 0, max_values: 1,
          ...(currentId ? { default_values: [{ id: currentId, type: 'channel' }] } : {}),
        }],
      });
      return interaction.reply({
        flags: 32768, ephemeral: true,
        components: [{ type: 17, accent_color: 0x5865F2, components: [
          { type: 10, content: '**📺 Set Channels — Test**\nSelect a channel for each category. Changes save instantly.' },
          SEP2,
          mkPicker('Results & Standings', 'results', rId),
          mkPicker('Schedule', 'schedule', sId),
        ]}],
      });
    }
    const tid  = parseInt(interaction.values[0]);
    const t    = db.findById('tournaments', tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
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
    return interaction.reply({
      flags: 32768, ephemeral: true,
      components: [{ type: 17, accent_color: 0x5865F2, components: [
        { type: 10, content: `**📺 Set Channels — ${t.name}**\nSelect a channel for each category. Changes save instantly.` },
        SEP2,
        chSel('Management', 'management'),
        chSel('Results & Standings', 'results'),
        chSel('Schedule', 'schedule'),
        chSel('Teams List', 'teamsList'),
      ]}],
    });
  }

  if (id.startsWith('mgr2_testch_')) {
    const key3   = id.replace('mgr2_testch_', '');
    const val3   = (interaction.values && interaction.values[0]) || null;
    const cfgKey = key3 === 'results' ? 'test_results_channel_id' : 'test_schedule_channel_id';
    db.setConfig(cfgKey, val3);
    return interaction.reply({ content: `✅ **Test ${key3}** → ${val3 ? `<#${val3}>` : 'cleared'}.`, flags: 64 });
  }

  if (id.startsWith('mgr2_ch_')) {
    const parts2 = id.replace('mgr2_ch_', '').split('_');
    const tid2   = parseInt(parts2[0]);
    const key2   = parts2.slice(1).join('_');
    const t2     = db.findById('tournaments', tid2);
    if (!t2) return interaction.reply({ content: '❌ Tournament not found.', flags: 64 });
    const val    = (interaction.values && interaction.values[0]) || null;
    const updCh  = { ...(t2.channels || {}), [key2]: val };
    if (key2 === 'results') updCh.standings = val;
    db.update('tournaments', tid2, { channels: updCh });
    return interaction.reply({ content: `✅ **${key2}** → ${val ? `<#${val}>` : 'cleared'}.`, flags: 64 });
  }

  // ── Winners Setup ────────────────────────────────────────────────────────
  if (id === 'mgr2_winners') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    return interaction.update(buildWinnersSubPanel());
  }

  // Tournament selected from winners selector
  if (id === 'mgr2_winners_sel') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid = parseInt(interaction.values[0]);
    return interaction.update(buildWinnersForTournament(tid));
  }

  // Set winners history category
  if (id === 'mgr2_winners_setup') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const cur = db.getConfig('winners_history_category') || '';
    return interaction.showModal(
      new ModalBuilder().setCustomId('mgr2_winners_setup_modal').setTitle('Winners History Category')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('category_id').setLabel('Category ID (right-click → Copy ID)')
              .setStyle(TextInputStyle.Short).setValue(cur).setPlaceholder('1234567890123456789').setRequired(true)
          ),
        )
    );
  }

  if (id === 'mgr2_winners_setup_modal') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const catId = interaction.fields.getTextInputValue('category_id').trim().replace(/\D/g, '');
    if (!catId) return interaction.reply({ content: '❌ Invalid category ID.', ephemeral: true });
    db.setConfig('winners_history_category', catId);
    await interaction.deferUpdate();
    await interaction.editReply(buildWinnersSubPanel());
    return interaction.followUp({ content: `✅ Winners History category set to <#${catId}>.`, ephemeral: true });
  }

  // ── Per-tournament winners: Set Winner Role ───────────────────────────────
  if (id.startsWith('mgr2_wt_role_') && !id.includes('_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('mgr2_wt_role_', ''));
    const t   = db.findById('tournaments', tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_wt_role_modal_${tid}`).setTitle(`Winner Role — ${t.name.slice(0, 30)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('role_id').setLabel('Role ID (right-click role → Copy ID)')
              .setStyle(TextInputStyle.Short).setValue(t.winner_role_id || '').setPlaceholder('1234567890123456789').setRequired(false)
          ),
        )
    );
  }

  if (id.startsWith('mgr2_wt_role_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid    = parseInt(id.replace('mgr2_wt_role_modal_', ''));
    const roleId = interaction.fields.getTextInputValue('role_id').trim().replace(/\D/g, '') || null;
    db.update('tournaments', tid, { winner_role_id: roleId });
    await interaction.deferUpdate();
    await interaction.editReply(buildWinnersForTournament(tid));
    return interaction.followUp({
      content: roleId ? `✅ Winner role set to <@&${roleId}>.` : '✅ Winner role cleared.',
      ephemeral: true,
    });
  }

  // ── Per-tournament winners: Set History Ref ───────────────────────────────
  if (id.startsWith('mgr2_wt_ref_') && !id.includes('_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid    = parseInt(id.replace('mgr2_wt_ref_', ''));
    const t      = db.findById('tournaments', tid);
    if (!t) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    const curRef = t.winners_history_ref || {};
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_wt_ref_modal_${tid}`).setTitle(`History Ref — ${t.name.slice(0, 28)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('channel_id').setLabel('History channel ID')
              .setStyle(TextInputStyle.Short).setValue(curRef.channelId || '').setPlaceholder('1234567890123456789').setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('message_id').setLabel('History message ID')
              .setStyle(TextInputStyle.Short).setValue(curRef.messageId || '').setPlaceholder('1234567890123456789').setRequired(true)
          ),
        )
    );
  }

  if (id.startsWith('mgr2_wt_ref_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid   = parseInt(id.replace('mgr2_wt_ref_modal_', ''));
    const chId  = interaction.fields.getTextInputValue('channel_id').trim().replace(/\D/g, '');
    const msgId = interaction.fields.getTextInputValue('message_id').trim().replace(/\D/g, '');
    if (!chId || !msgId) return interaction.reply({ content: '❌ Invalid channel or message ID.', ephemeral: true });
    db.update('tournaments', tid, { winners_history_ref: { channelId: chId, messageId: msgId } });
    await interaction.deferUpdate();
    await interaction.editReply(buildWinnersForTournament(tid));
    return interaction.followUp({
      content: `✅ History message linked: <#${chId}> / \`${msgId}\`.`,
      ephemeral: true,
    });
  }

  // ── Per-tournament winners: Re-post History ───────────────────────────────
  if (id.startsWith('mgr2_wt_repost_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tid = parseInt(id.replace('mgr2_wt_repost_', ''));
    const t   = db.findById('tournaments', tid);
    if (!t || !t.winners_history_ref?.channelId)
      return interaction.reply({ content: '❌ No history channel configured.', ephemeral: true });
    await interaction.deferUpdate();
    try {
      const ch  = await interaction.guild.channels.fetch(t.winners_history_ref.channelId);
      const msg = await ch.send(buildWinnersHistoryPayload(tid));
      db.update('tournaments', tid, { winners_history_ref: { channelId: ch.id, messageId: msg.id } });
      await interaction.editReply(buildWinnersForTournament(tid));
      return interaction.followUp({ content: `✅ Winners history re-posted to <#${ch.id}>.`, ephemeral: true });
    } catch (e) {
      await interaction.editReply(buildWinnersForTournament(tid));
      return interaction.followUp({ content: `❌ Failed to post: ${e.message}`, ephemeral: true });
    }
  }

  // ── Set Role (registration role per tournament) ───────────────────────────
  if (id === 'mgr2_reg_role_start') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tournaments = db.get('tournaments').filter(t => t.template !== 'TEST');
    if (!tournaments.length) return interaction.reply({ content: '❌ No tournaments found.', ephemeral: true });
    const SEP2 = { type: 14, divider: true, spacing: 1 };
    return interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0xFFD700, components: [
        { type: 10, content: '**🎟️ Set Role — Select a tournament**\nThe selected role will be tagged with posts when Tag is ON in the Publish panel.' },
        SEP2,
        { type: 1, components: [{
          type: 3, custom_id: 'mgr2_reg_role_sel', placeholder: 'Select tournament...',
          options: tournaments.slice(0, 25).map(t => ({
            label: t.name.slice(0, 100),
            value: String(t.id),
            description: `Season ${t.season} · ${t.registration_role_id ? '✅ Role set' : 'No role set'}`,
          })),
        }]},
        SEP2,
        { type: 1, components: [{ type: 2, style: 2, label: 'Back', custom_id: 'mgr2_refresh' }]},
      ]}],
    });
  }

  if (id === 'mgr2_reg_role_sel') {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tRR = db.findById('tournaments', parseInt(interaction.values[0]));
    if (!tRR) return interaction.reply({ content: '❌ Tournament not found.', ephemeral: true });
    return interaction.showModal(
      new ModalBuilder().setCustomId(`mgr2_reg_role_modal_${tRR.id}`).setTitle(`Set Role — ${tRR.name.slice(0, 35)}`)
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('role_id').setLabel('Role ID (right-click role → Copy ID)')
              .setStyle(TextInputStyle.Short).setValue(tRR.registration_role_id || '').setPlaceholder('1234567890123456789').setRequired(false)
          ),
        )
    );
  }

  if (id.startsWith('mgr2_reg_role_modal_')) {
    if (!isAdmin(interaction.member)) return noPermission(interaction);
    const tRRid     = parseInt(id.replace('mgr2_reg_role_modal_', ''));
    const regRoleId = interaction.fields.getTextInputValue('role_id').trim().replace(/\D/g, '') || null;
    db.update('tournaments', tRRid, { registration_role_id: regRoleId });
    await interaction.deferUpdate();
    await interaction.editReply(buildManagePanelV2());
    return interaction.followUp({
      content: regRoleId
        ? `✅ Role set to <@&${regRoleId}>. Posts will tag this role when Tag is ON.`
        : '✅ Role cleared.',
      ephemeral: true,
    });
  }

}

module.exports = { handleMgr2Interaction };
