'use strict';
const { db } = require('../utils/database');
const { getFed, saveFed } = require('./fedPanel1');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });

function buildFederationPanel() {
  const fed   = getFed();
  const inner = [];

  if (!fed || !fed.name) {
    inner.push(txt('# \uD83D\uDEE1\uFE0F  Setup Panel\n-# Federation of Clans \u2014 configuration'));
    inner.push(SEP);
    inner.push(txt('> \u2699\uFE0F  No federation configured yet.\n> Use **Settings** to set a name and get started.'));
  } else {
    const statusIcon = fed.status === 'active' ? '\uD83D\uDFE2' : fed.status === 'finished' ? '\uD83C\uDFC1' : '\uD83D\uDD27';
    const clans      = (db.get('fed_clans') || []).filter(c => c.fed_season === (fed.season || 1));
    inner.push(txt(
      '# \uD83D\uDEE1\uFE0F  Setup Panel\n' +
      '-# ' + (fed.name || 'Federation of Clans') + '  \u2022  Season ' + (fed.season || 1) + '  \u2022  ' + statusIcon + ' ' +
      (fed.status ? fed.status.charAt(0).toUpperCase() + fed.status.slice(1) : 'Setup') +
      '  \u2022  ' + clans.length + '/' + (fed.clan_count || '?') + ' clans  \u2022  ' +
      ((fed.system || 'cup') === 'league' ? '\uD83D\uDD35 League' : '\uD83D\uDD34 Cup')
    ));
  }

  inner.push(SEP);
  inner.push({ type: 1, components: [
    btn('\uD83C\uDFDF\uFE0F  Panels',           'fed_panels',   1),
    btn('\uD83D\uDCFA  Channels & Roles', 'fed_setup',    2),
    btn('\u2699\uFE0F  Settings',         'fed_setup_settings', 2),
  ]});
  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xE67E22, components: inner }] };
}

// ── Channels & Roles panel ────────────────────────────────────────────────────
function buildFedSetupPanel() {
  const fed = getFed();
  const ch  = fed.channels || {};
  const chSel = (label, key, types = [0, 5]) => ({
    type: 1,
    components: [{
      type: 8, custom_id: 'fed_ch_' + key,
      placeholder: ch[key] ? label + ' (set)' : label + ' \u2014 select channel',
      channel_types: types, min_values: 0, max_values: 1,
      ...(ch[key] ? { default_values: [{ id: ch[key], type: 'channel' }] } : {}),
    }],
  });
  const regRole  = fed.registration_role_id;
  const staffRole= fed.staff_role_id;
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2, components: [
      txt('**\uD83D\uDCFA  Channels & Roles \u2014 ' + (fed.name || 'Federation of Clans') + '**\nSelect channels. Changes save instantly.\n-# Reg Role \u2192 ' + (regRole ? '<@&' + regRole + '>' : '`not set`') + '  \u2022  Staff Role \u2192 ' + (staffRole ? '<@&' + staffRole + '>' : '`not set`')),
      SEP,
      chSel('Management',        'management'),
      chSel('Results',           'results'),
      chSel('Schedule',          'schedule'),
      chSel('Clans List',        'clansList'),
      chSel('Match Category \uD83D\uDCC1', 'category', [4]),
      SEP,
      { type: 1, components: [
        btn(regRole ? '\uD83C\uDF9F\uFE0F  Reg Role \u2713' : '\uD83C\uDF9F\uFE0F  Set Reg Role',   'fed_role_picker',   regRole ? 1 : 2),
        btn(staffRole ? '\uD83D\uDEE1\uFE0F  Staff Role \u2713' : '\uD83D\uDEE1\uFE0F  Set Staff Role', 'fed_staff_picker', staffRole ? 1 : 2),
        btn('\u25C4  Back', 'fed_refresh', 2),
      ]},
    ]}],
  };
}

function buildFedRolePanel(type) {
  const fed     = getFed();
  const isStaff = type === 'staff';
  const roleId  = isStaff ? fed.staff_role_id : fed.registration_role_id;
  const cid     = isStaff ? 'fed_staff_pick' : 'fed_role_pick';
  const label   = isStaff ? '\uD83D\uDEE1\uFE0F  Staff Role' : '\uD83C\uDF9F\uFE0F  Registration Role';
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xFFD700, components: [
      txt('**' + label + ' \u2014 ' + (fed.name || 'Federation of Clans') + '**\n> Current: ' + (roleId ? '<@&' + roleId + '>' : '`Not set`') + '\n-# Selection saves immediately.'),
      SEP,
      { type: 1, components: [{ type: 6, custom_id: cid, placeholder: label + '\u2026', min_values: 0, max_values: 1 }]},
      SEP,
      { type: 1, components: [btn('\u25C4  Back', 'fed_setup', 2)] },
    ]}],
  };
}

// ── Setup Panel Settings (Players/Clan, Cup Group Size, Edit Name, Channel Format) ──
function buildFedSetupSettingsPanel() {
  const fed = getFed();
  const mkSel = (label, cid, opts, current) => {
    const options = opts.map(v => {
      const lbl = typeof v === 'object' ? v.label : String(v);
      const val = typeof v === 'object' ? v.value : String(v);
      return { label: lbl, value: val, default: val === String(current) };
    });
    const currentLabel = options.find(o => o.default)?.label || String(current);
    return { type: 1, components: [{ type: 3, custom_id: cid, placeholder: label + ': ' + currentLabel, options }] };
  };
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xE67E22, components: [
      txt('**\u2699\uFE0F  Setup Settings \u2014 ' + (fed.name || 'Federation of Clans') + '**'),
      SEP,
      mkSel('Players per Clan', 'fed_cfg_players_per_clan',
        [6, 7, 8, 10, 11].map(n => ({ label: String(n) + ' Players', value: String(n) })),
        fed.players_per_clan || 8
      ),
      mkSel('Cup Group Size', 'fed_cfg_teams_per_group',
        [3, 4, 5, 6].map(n => ({ label: n + ' Clans per Group', value: String(n) })),
        fed.teams_per_group || 4
      ),
      SEP,
      { type: 1, components: [
        btn('\u270F\uFE0F  Edit Name',      'fed_settings_name',     2),
        btn('\uD83C\uDFF7\uFE0F  Edit Tag',       'fed_settings_tag',      2),
        btn('\uD83D\uDCDD  Channel Format', 'fed_settings_chformat', 2),
        btn('◄  Back', 'fed_refresh', 2),
      ]},
    ]}],
  };
}

// ── Main Panel Settings (Number of Clans, Status, League Encounters, Edit Season) ──
function buildFedMainSettingsPanel() {
  const fed = getFed();
  const mkSel = (label, cid, opts, current) => {
    const options = opts.map(v => {
      const lbl = typeof v === 'object' ? v.label : String(v);
      const val = typeof v === 'object' ? v.value : String(v);
      return { label: lbl, value: val, default: val === String(current) };
    });
    const currentLabel = options.find(o => o.default)?.label || String(current);
    return { type: 1, components: [{ type: 3, custom_id: cid, placeholder: label + ': ' + currentLabel, options }] };
  };
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xFF0049, components: [
      txt('**\u2699\uFE0F  Main Settings \u2014 ' + (fed.name || 'Federation of Clans') + '**'),
      SEP,
      mkSel('Number of Clans', 'fed_cfg_clan_count',
        (fed.system === 'league'
          ? [8,9,10,11,12,13,14,15].map(n => ({ label: n + ' Clans', value: String(n) }))
          : [8, 16, 32].map(n => ({ label: n + ' Clans', value: String(n) }))
        ),
        fed.clan_count || (fed.system === 'league' ? 8 : 16)
      ),
      mkSel('League Encounters', 'fed_cfg_encounters', [
        { label: 'Single Leg',   value: '1' },
        { label: 'Home & Away',  value: '2' },
      ], fed.encounters || 2),
      SEP,
      { type: 1, components: [
        btn('\uD83D\uDD22  Edit Season', 'fed_settings_season', 2),
        btn('◄  Back', 'fed_p1_refresh', 2),
      ]},
    ]}],
  };
}

module.exports = { buildFederationPanel, buildFedSetupPanel, buildFedRolePanel, buildFedSetupSettingsPanel, buildFedMainSettingsPanel, getFed, saveFed };