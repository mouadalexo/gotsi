'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

function getInfoCfg(tid) {
  return Object.assign({ text: '', tag: true }, db.getConfig('info_cfg_' + tid) || {});
}

function buildInfoPickerPanel() {
  const tournaments = db.get('tournaments')
    .filter(t => t.status !== 'finished' && (t.template || '').toUpperCase() !== 'TEST' && (t.name || '').toUpperCase() !== 'TEST')
    .sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

  const inner = [
    txt('## 📢 Info Sender'),
    SEP,
    txt('Select a tournament:'),
    SEP,
  ];

  if (!tournaments.length) {
    inner.push(txt('> ⚠️  No tournaments found.'));
  } else {
    inner.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: 'inf_pick',
        placeholder: 'Choose a tournament…',
        options: tournaments.slice(0, 25).map(t => ({
          label: t.name.slice(0, 100),
          value: String(t.id),
        })),
      }],
    });
  }

  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xF5A623, components: inner }] };
}

function buildInfoPanel(tid) {
  const t   = db.findById('tournaments', tid);
  const cfg = getInfoCfg(tid);

  const hasMsg  = !!cfg.text;
  const hasInfo = !!t?.info_channel;
  const tagLabel = cfg.tag ? '🔔 Tag: ON' : '🔕 Tag: OFF';
  const tagStyle = cfg.tag ? 3 : 4;

  const preview = hasMsg
    ? cfg.text.slice(0, 150) + (cfg.text.length > 150 ? '…' : '')
    : '*Not set up yet — click **Setup** to write the message.*';

  const inner = [
    txt('## 📢 ' + (t?.name ?? 'Tournament')),
    SEP,
    txt('**Message:**\n' + preview),
    SEP,
    { type: 1, components: [
      { type: 2, style: 1, label: '🚀  Post', custom_id: 'inf_send_' + tid, disabled: !hasMsg || !hasInfo },
      { type: 2, style: tagStyle, label: tagLabel, custom_id: 'inf_tag_' + tid },
      { type: 2, style: 2, label: '📝  Setup',  custom_id: 'inf_edit_' + tid },
    ]},
    SEP,
    { type: 1, components: [
      { type: 2, style: 2, label: '← Back', custom_id: 'inf_back' },
    ]},
    SEP,
    txt(hasInfo ? '-# Posts to <#' + t.info_channel + '>' : '> ⚠️  No info channel set — go to `/admin` → Set Channels first.'),
    txt('-# © 24 2026  |  Goatsi Bot'),
  ];

  return { flags: 32768, components: [{ type: 17, accent_color: 0xF5A623, components: inner }] };
}

module.exports = { buildInfoPickerPanel, buildInfoPanel, getInfoCfg };
