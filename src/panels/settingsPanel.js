'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

const E_ARR = '<a:arrow:1501741110798585927>';
const GREEN  = 0x00FF76;

const DEFAULTS = {
  matchTime:    10,
  injuries:     true,
  extraTime:    true,
  penalties:    true,
  maxSubs:      5,
  subIntervals: 3,
  extraSubET:   true,
  condition:    'Excellent',
  title:        'Match Settings',
};

function getSettings(uid) {
  const saved = db.getConfig('stp_' + uid);
  return Object.assign({}, DEFAULTS, saved || {});
}

// Name is embedded in the button label so we don't need a separate txt component
function togBtn(uid, field, label, currentVal) {
  if (currentVal) {
    return { type: 2, style: 3, label: `✅ ${label}`, custom_id: `stp_tog_${uid}_${field}_off` };
  } else {
    return { type: 2, style: 4, label: `❌ ${label}`, custom_id: `stp_tog_${uid}_${field}_on` };
  }
}

// Component budget: 40 total (container + direct children + nested inside ActionRows)
// Container:  1
// Direct:    28  (txt×8, SEP×11, ActionRow×9)
// Nested:    11  (2 title-btns + 4 selects + 4 toggle-btns + 1 post-select)
// Total:     40 ✅
function buildSettingsPanel(uid) {
  const s = getSettings(uid);
  const inner = [];

  // 1 txt + 1 SEP
  inner.push(txt(`## ⚙️  Settings Panel`));
  inner.push(SEP);

  // 1 txt + 1 ActionRow(2 btns) + 1 SEP
  inner.push(txt(`**Post Title:** ${s.title || 'Match Settings'}`));
  inner.push({ type: 1, components: [
    { type: 2, style: 2, label: '📝  Set Title', custom_id: `stp_settitle_${uid}` },
    { type: 2, style: 2, label: '🔄  Refresh',   custom_id: `stp_refresh_${uid}`  },
  ]});
  inner.push(SEP);

  // ── SELECT MENUS (top) — each: 1 txt + 1 ActionRow(1 select) + 1 SEP ──────

  inner.push(txt('**Match Time — وقت المباراة**'));
  inner.push({ type: 1, components: [{ type: 3, custom_id: `stp_cfg_${uid}_matchTime`, placeholder: 'Select match time…',
    options: Array.from({ length: 11 }, (_, i) => i + 5).map(i => ({
      label: `${i} min`, value: String(i), default: i === Number(s.matchTime),
    })),
  }]});
  inner.push(SEP);

  inner.push(txt('**Max Substitutions — الحد الأقصى للتبديلات**'));
  inner.push({ type: 1, components: [{ type: 3, custom_id: `stp_cfg_${uid}_maxSubs`, placeholder: 'Select max subs…',
    options: Array.from({ length: 7 }, (_, i) => i).map(i => ({
      label: String(i), value: String(i), default: i === Number(s.maxSubs),
    })),
  }]});
  inner.push(SEP);

  inner.push(txt('**Substitution Intervals — فترات التبديلات**'));
  inner.push({ type: 1, components: [{ type: 3, custom_id: `stp_cfg_${uid}_subIntervals`, placeholder: 'Select intervals…',
    options: Array.from({ length: 7 }, (_, i) => i).map(i => ({
      label: String(i), value: String(i), default: i === Number(s.subIntervals),
    })),
  }]});
  inner.push(SEP);

  inner.push(txt('**Condition — حالة اللاعبين**'));
  inner.push({ type: 1, components: [{ type: 3, custom_id: `stp_cfg_${uid}_condition`, placeholder: 'Select condition…',
    options: [
      { label: 'Excellent — ممتاز', value: 'Excellent', default: s.condition !== 'Random' },
      { label: 'Random — عشوائي',   value: 'Random',    default: s.condition === 'Random' },
    ],
  }]});
  inner.push(SEP);

  // ── TOGGLE BUTTONS (bottom) — each: 1 ActionRow(1 btn) + 1 SEP ────────────
  // No separate txt — label is embedded in the button itself

  inner.push({ type: 1, components: [togBtn(uid, 'injuries',  'Injuries — الإصابات',                                           s.injuries  !== false)] });
  inner.push(SEP);

  inner.push({ type: 1, components: [togBtn(uid, 'extraTime', 'Extra Time — الوقت الإضافي',                                    s.extraTime !== false)] });
  inner.push(SEP);

  inner.push({ type: 1, components: [togBtn(uid, 'penalties', 'Penalties — ركلات الترجيح',                                     s.penalties !== false)] });
  inner.push(SEP);

  inner.push({ type: 1, components: [togBtn(uid, 'extraSubET','Extra Sub ET — تبديل إضافي في الوقت الإضافي',                   s.extraSubET !== false)] });
  inner.push(SEP);

  // ── Post selector — 1 txt + 1 ActionRow(1 select) ─────────────────────────
  // No trailing SEP before footer to stay within the 40-component budget
  const allT = db.get('tournaments').filter(t => t.info_channel);
  if (allT.length) {
    inner.push(txt('**Post to tournament info channel:**'));
    inner.push({ type: 1, components: [{
      type: 3,
      custom_id: `stp_post_${uid}`,
      placeholder: 'Select tournament',
      options: allT.slice(0, 25).map(t => ({
        label: t.name,
        description: 'Posts to info channel',
        value: String(t.id),
      })),
    }]});
  } else {
    inner.push(txt('> ⚠️  No tournament has an info channel set.\n> Go to `/admin` → Set Channels.'));
  }

  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

function buildSettingsPost(uid) {
  const s    = getSettings(uid);
  const line = text => `${E_ARR}  **${text}**`;
  const tog  = (enAr, val) => line(`${enAr} ${val ? '✅' : '❌'}`);

  const lines = [
    line(`Match Time (وقت المباراة): ${s.matchTime} min`),
    line(`Max Substitutions (الحد الأقصى للتبديلات): ${s.maxSubs}`),
    line(`Substitution Intervals (فترات التبديلات): ${s.subIntervals}`),
    line(`Condition (حالة اللاعبين): ${s.condition === 'Random' ? 'Random' : 'Excellent'}`),
    tog('Injuries (الإصابات)',       s.injuries  !== false),
    tog('Extra Time (الوقت الإضافي)', s.extraTime !== false),
    tog('Penalties (ركلات الترجيح)', s.penalties !== false),
    tog('Extra Sub (تبديل إضافي)',   s.extraSubET !== false),
  ].join('\n');

  const inner = [
    txt(`# ⚙️  MATCH SETTINGS`),
    SEP,
    txt(lines),
    SEP,
    txt('-# © 24 2026  |  Goatsi Bot'),
  ];

  return { flags: 32768, components: [{ type: 17, accent_color: GREEN, components: inner }] };
}

module.exports = { buildSettingsPanel, buildSettingsPost, getSettings };
