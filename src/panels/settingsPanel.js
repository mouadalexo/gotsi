'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

const E_CUP = '<a:cup:1501741159557500971>';
const E_ARR = '<a:smallarrow:1472222559645863936>';
const BLUE  = 0x2563EB;

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

// Toggle button: green (3) when ON, red (4) when OFF
// custom_id encodes the NEXT value so the handler knows what to set
function togBtn(uid, field, currentVal) {
  if (currentVal) {
    // Currently ON — button is green, click will turn OFF
    return { type: 2, style: 3, label: '✅  On',  custom_id: `stp_tog_${uid}_${field}_off` };
  } else {
    // Currently OFF — button is red, click will turn ON
    return { type: 2, style: 4, label: '❌  Off', custom_id: `stp_tog_${uid}_${field}_on` };
  }
}

function buildSettingsPanel(uid) {
  const s = getSettings(uid);
  const inner = [];

  inner.push(txt(`## ⚙️  Settings Panel`));
  inner.push(SEP);

  // Title + action buttons
  inner.push(txt(`**Post Title:** ${s.title || 'Match Settings'}`));
  inner.push({ type: 1, components: [
    { type: 2, style: 2, label: '📝  Set Title', custom_id: `stp_settitle_${uid}` },
    { type: 2, style: 2, label: '🔄  Refresh',   custom_id: `stp_refresh_${uid}`  },
  ]});
  inner.push(SEP);

  // ── Match Time (select) ────────────────────────────────────────────────────
  inner.push(txt('**Match Time — وقت المباراة**'));
  inner.push({ type: 1, components: [{ type: 3, custom_id: `stp_cfg_${uid}_matchTime`, placeholder: 'Select match time…',
    options: Array.from({ length: 11 }, (_, i) => i + 5).map(i => ({
      label: `${i} min`, value: String(i), default: i === Number(s.matchTime),
    })),
  }]});

  // ── Injuries (toggle button) ───────────────────────────────────────────────
  inner.push(txt('**Injuries — الإصابات**'));
  inner.push({ type: 1, components: [togBtn(uid, 'injuries', s.injuries !== false)] });

  // ── Extra Time (toggle button) ─────────────────────────────────────────────
  inner.push(txt('**Extra Time — الوقت الإضافي**'));
  inner.push({ type: 1, components: [togBtn(uid, 'extraTime', s.extraTime !== false)] });

  // ── Penalties (toggle button) ──────────────────────────────────────────────
  inner.push(txt('**Penalties — ركلات الترجيح**'));
  inner.push({ type: 1, components: [togBtn(uid, 'penalties', s.penalties !== false)] });

  // ── Max Substitutions (select) ─────────────────────────────────────────────
  inner.push(txt('**Max Substitutions — الحد الأقصى للتبديلات**'));
  inner.push({ type: 1, components: [{ type: 3, custom_id: `stp_cfg_${uid}_maxSubs`, placeholder: 'Select max subs…',
    options: Array.from({ length: 7 }, (_, i) => i).map(i => ({
      label: String(i), value: String(i), default: i === Number(s.maxSubs),
    })),
  }]});

  // ── Substitution Intervals (select) ───────────────────────────────────────
  inner.push(txt('**Substitution Intervals — فترات التبديلات**'));
  inner.push({ type: 1, components: [{ type: 3, custom_id: `stp_cfg_${uid}_subIntervals`, placeholder: 'Select intervals…',
    options: Array.from({ length: 7 }, (_, i) => i).map(i => ({
      label: String(i), value: String(i), default: i === Number(s.subIntervals),
    })),
  }]});

  // ── Extra Sub in ET (toggle button) ───────────────────────────────────────
  inner.push(txt('**Extra Substitution in Extra Time — تبديل إضافي في الوقت الإضافي**'));
  inner.push({ type: 1, components: [togBtn(uid, 'extraSubET', s.extraSubET !== false)] });

  // ── Condition (select) ────────────────────────────────────────────────────
  inner.push(txt('**Condition — حالة اللاعبين**'));
  inner.push({ type: 1, components: [{ type: 3, custom_id: `stp_cfg_${uid}_condition`, placeholder: 'Select condition…',
    options: [
      { label: 'Excellent — ممتاز', value: 'Excellent', default: s.condition !== 'Random' },
      { label: 'Random — عشوائي',   value: 'Random',    default: s.condition === 'Random' },
    ],
  }]});

  inner.push(SEP);

  // ── Post selector ─────────────────────────────────────────────────────────
  const allT = db.get('tournaments').filter(t => t.info_channel);
  if (allT.length) {
    inner.push(txt('**Post to tournament info channel:**'));
    inner.push({ type: 1, components: [{
      type: 3,
      custom_id: `stp_post_${uid}`,
      placeholder: 'Select tournament to post settings…',
      options: allT.slice(0, 25).map(t => ({
        label: t.name,
        description: 'Posts to info channel',
        value: String(t.id),
      })),
    }]});
  } else {
    inner.push(txt('> ⚠️  No tournament has an info channel set.\n> Go to `/admin` → Tournament Settings → 📡 Info Channel.'));
  }

  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

function buildSettingsPost(uid, tid) {
  const s     = getSettings(uid);
  const t     = db.findById('tournaments', tid);
  const label = t ? `${t.template || t.name} S${t.season}`.toUpperCase() : '';
  const title = (s.title || 'Match Settings').toUpperCase();

  const line = text => `${E_ARR}  **${text}**`;

  const lines = [
    line(`Match Time — وقت المباراة: ${s.matchTime} min`),

    s.injuries !== false
      ? line('Injuries — الإصابات')
      : line('No Injuries — لا إصابات'),

    s.extraTime !== false
      ? line('Extra Time — الوقت الإضافي')
      : line('No Extra Time — لا وقت إضافي'),

    s.penalties !== false
      ? line('Penalties — ركلات الترجيح')
      : line('No Penalties — لا ركلات الترجيح'),

    line(`Max Substitutions — الحد الأقصى للتبديلات: ${s.maxSubs}`),
    line(`Substitution Intervals — فترات التبديلات: ${s.subIntervals}`),

    s.extraSubET !== false
      ? line('Extra Substitution in Extra Time — تبديل إضافي في الوقت الإضافي')
      : line('No Extra Substitution in Extra Time — لا تبديل إضافي في الوقت الإضافي'),

    s.condition === 'Random'
      ? line('Condition — حالة اللاعبين: Random — عشوائي')
      : line('Condition — حالة اللاعبين: Excellent — ممتاز'),
  ];

  const inner = [
    txt(`${E_CUP}  **${title}  —  ${label}**`),
    SEP,
    txt(lines.join('\n')),
    SEP,
    txt('-# © 24 2026  |  Goatsi Bot'),
  ];

  return { flags: 32768, components: [{ type: 17, accent_color: BLUE, components: inner }] };
}

module.exports = { buildSettingsPanel, buildSettingsPost, getSettings };
