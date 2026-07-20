'use strict';
const { db } = require('../utils/database');
const { getFed, getFedClans } = require('./fedPanel1');

const SEP  = { type: 14, divider: true, spacing: 1 };
const txt  = c => ({ type: 10, content: c });
const btn  = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });
const E_CH = '<a:channelutility:1501741046734786600>';

function buildFedPanel2() {
  const fed      = getFed();
  const clans    = getFedClans();
  const required = fed.clan_count || 8;
  const regOpen  = fed.registration_open !== false;
  const locked   = fed.status !== 'setup';
  const left     = Math.max(0, required - clans.length);

  const inner = [];
  inner.push(txt('## 2 : Registration \u2014 ' + (fed.tag || fed.name || 'Federation')));
  inner.push(SEP);
  inner.push(txt(E_CH + '  **' + clans.length + '** clans registered  \u2022  **' + left + '** spot' + (left !== 1 ? 's' : '') + ' left\n-# Registration: ' + (regOpen ? '\uD83D\uDFE2 Open' : '\uD83D\uDD34 Closed')));
  inner.push(SEP);
  inner.push({ type: 1, components: [btn('\u2795  Add Clan', 'fed_p2_addclan', 1, locked || !regOpen || clans.length >= required)] });
  inner.push({ type: 1, components: [btn('\u270F\uFE0F  Edit', 'fed_p2_editclan', 2, clans.length === 0)] });
  inner.push({ type: 1, components: [
    btn('\uD83D\uDDD1\uFE0F  Remove',    'fed_p2_remove',     4, clans.length === 0 || locked),
    btn('\u274C  Clear All', 'fed_p2_clear',      4, clans.length === 0 || locked),
  ]});
  inner.push({ type: 1, components: [btn('\uD83C\uDFB2  Fill Random', 'fed_p2_fillrandom', 2, locked || clans.length >= required)] });
  inner.push({ type: 1, components: [
    btn(regOpen ? '\uD83D\uDD34  Close Reg' : '\uD83D\uDFE2  Open Reg', 'fed_p2_togglereg', regOpen ? 4 : 3, locked),
    btn('\uD83D\uDD04  Refresh', 'fed_p2_refresh', 2),
  ]});
  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

module.exports = { buildFedPanel2 };
