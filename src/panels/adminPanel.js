'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

const E_CUP  = '<a:cup:1501741159557500971>';
const E_HASH = '<a:hashtag:1501741088736678069>';

function chLine(t, key) {
  const id = t?.channels?.[key];
  return id ? `<#${id}>` : '`not set`';
}

function roleLine(t, key) {
  const id = t?.[key];
  return id ? `<@&${id}>` : '`not set`';
}

function latestTournament(template) {
  return db.get('tournaments')
    .filter(t => t.template === template)
    .sort((a, b) => b.season - a.season)[0] || null;
}

function buildAdminPanel() {
  const nsel     = latestTournament('EL');
  const mcl      = latestTournament('MCL');
  const testChId = db.getConfig('test_channel_id');

  const inner = [
    txt(`# Admin Panel`),
    SEP,
  ];

  if (nsel) {
    inner.push(txt(
      `${E_HASH}  **${nsel.name}**\n` +
      `Management  →  ${chLine(nsel, 'management')}\n` +
      `Schedule    →  ${chLine(nsel, 'schedule')}\n` +
      `Results     →  ${chLine(nsel, 'results')}\n` +
      `Reg. Role   →  ${roleLine(nsel, 'registration_role_id')}`
    ));
    inner.push(SEP);
  }

  if (mcl) {
    inner.push(txt(
      `${E_HASH}  **${mcl.name}**\n` +
      `Management  →  ${chLine(mcl, 'management')}\n` +
      `Schedule    →  ${chLine(mcl, 'schedule')}\n` +
      `Results     →  ${chLine(mcl, 'results')}\n` +
      `Reg. Role   →  ${roleLine(mcl, 'registration_role_id')}`
    ));
    inner.push(SEP);
  }

  if (!nsel && !mcl) {
    inner.push(txt('No EL or MCL tournaments found. Create one first.'));
    inner.push(SEP);
  }

  inner.push(txt(
    `${E_HASH}  **AutoTest (/test)**\n` +
    `Test Channel →  ${testChId ? `<#${testChId}>` : '`not set`'}`
  ));
  inner.push(SEP);

  inner.push({ type: 1, components: [
    { type: 2, style: 1, label: 'Set EL Channels',  custom_id: 'adm_tch_EL',  disabled: !nsel },
    { type: 2, style: 1, label: 'Set MCL Channels', custom_id: 'adm_tch_MCL', disabled: !mcl  },
    { type: 2, style: 1, label: 'Set TEST Channel', custom_id: 'adm_tch_TEST'                  },
    { type: 2, style: 2, label: 'Refresh',          custom_id: 'adm_refresh'                   },
  ]});
  inner.push({ type: 1, components: [
    { type: 2, style: nsel?.registration_role_id ? 1 : 2, label: nsel?.registration_role_id ? 'EL Reg. Role ✓' : 'Set EL Reg. Role', custom_id: 'adm_setregrole_EL',  disabled: !nsel },
    { type: 2, style: mcl?.registration_role_id  ? 1 : 2, label: mcl?.registration_role_id  ? 'MCL Reg. Role ✓' : 'Set MCL Reg. Role', custom_id: 'adm_setregrole_MCL', disabled: !mcl  },
    { type: 2, style: 2, label: 'Rename EL',  custom_id: 'adm_rename_EL',  disabled: !nsel },
    { type: 2, style: 2, label: 'Rename MCL', custom_id: 'adm_rename_MCL', disabled: !mcl  },
  ]});

  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: inner }] };
}

function buildChannelPickerPanel(template) {
  const t  = latestTournament(template);
  const ch = t?.channels || {};

  const makeDefault = id => id ? [{ id, type: 'channel' }] : [];

  const inner = [
    txt(`# ⚙️  Set ${template} Channels\n> Select each channel — each selection saves immediately.`),
    SEP,
    txt(
      `**Management**  →  ${ch.management ? `<#${ch.management}>` : '`not set`'}\n` +
      `**Schedule**    →  ${ch.schedule   ? `<#${ch.schedule}>`   : '`not set`'}\n` +
      `**Results**     →  ${ch.results    ? `<#${ch.results}>`    : '`not set`'}`
    ),
    SEP,
    {
      type: 1, components: [{
        type: 8,
        custom_id: `adm_ch_${template}_management`,
        placeholder: '📋  Management channel…',
        min_values: 0, max_values: 1,
        ...(ch.management ? { default_values: makeDefault(ch.management) } : {}),
      }],
    },
    {
      type: 1, components: [{
        type: 8,
        custom_id: `adm_ch_${template}_schedule`,
        placeholder: '📅  Schedule channel…',
        min_values: 0, max_values: 1,
        ...(ch.schedule ? { default_values: makeDefault(ch.schedule) } : {}),
      }],
    },
    {
      type: 1, components: [{
        type: 8,
        custom_id: `adm_ch_${template}_results`,
        placeholder: '📊  Results channel…',
        min_values: 0, max_values: 1,
        ...(ch.results ? { default_values: makeDefault(ch.results) } : {}),
      }],
    },
    SEP,
    { type: 1, components: [{ type: 2, style: 2, label: '✓ Done', custom_id: 'adm_done' }] },
  ];

  return { flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: inner }] };
}

function buildTestChannelPickerPanel() {
  const testChId = db.getConfig('test_channel_id');
  const makeDefault = id => id ? [{ id, type: 'channel' }] : [];

  const inner = [
    txt(`# ⚙️  Set Test Channel\n> Select the channel where \`/testpanel\` will post the panel.\n> Selection saves immediately.`),
    SEP,
    txt(`**Test Channel**  →  ${testChId ? `<#${testChId}>` : '`not set`'}`),
    SEP,
    {
      type: 1, components: [{
        type: 8,
        custom_id: 'adm_ch_TEST_testpanel',
        placeholder: '🧪  Test panel channel…',
        min_values: 0, max_values: 1,
        ...(testChId ? { default_values: makeDefault(testChId) } : {}),
      }],
    },
    SEP,
    { type: 1, components: [{ type: 2, style: 2, label: '✓ Done', custom_id: 'adm_done' }] },
  ];

  return { flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: inner }] };
}

module.exports = { buildAdminPanel, buildChannelPickerPanel, buildTestChannelPickerPanel };
