'use strict';
const { db } = require('../utils/database');

const SEP  = { type: 14, divider: true, spacing: 1 };
const txt  = c => ({ type: 10, content: c });
const btn  = (label, id, style, disabled) => ({ type: 2, style, label, custom_id: id, disabled: !!disabled });
const GOLD = 0xFFD700;

function getWHT() { return db.get('wh_tournaments') || []; }

// ── Main panel ────────────────────────────────────────────────────────────────
function buildWHMain() {
  const tournaments = getWHT();
  const inner = [txt('# \ud83c\udfc6  Winner History'), SEP];

  if (tournaments.length) {
    inner.push({ type: 1, components: [{
      type: 3,
      custom_id: 'wh_sel',
      placeholder: 'Select a tournament…',
      options: tournaments.map(t => ({ label: t.name.slice(0, 100), value: String(t.id) })),
    }]});
  } else {
    inner.push(txt('*No tournaments yet. Add one below.*'));
  }

  inner.push(SEP);
  inner.push({ type: 1, components: [btn('\u2795 Add Tournament', 'wh_addtmt', 1)] });
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
  return { flags: 32768, components: [{ type: 17, accent_color: GOLD, components: inner }] };
}

// ── Tournament panel ──────────────────────────────────────────────────────────
function buildWHPanel(tid) {
  const t = getWHT().find(t => t.id === tid);
  if (!t) return buildWHMain();

  const winners = (db.get('winners') || [])
    .filter(w => w.wh_tournament_id === tid)
    .sort((a, b) => (a.season || 0) - (b.season || 0));

  const inner = [
    txt('# \ud83c\udfc6  ' + t.name + '  \u2014  Winner History'),
    SEP,
    txt(
      '**Channel** \u2192 ' + (t.channelId ? '<#' + t.channelId + '>' : '`not set`') + '\n' +
      '**Message** \u2192 ' + (t.messageId ? '`linked \u2705`' : '`not posted yet \u2014 use Post/Update`')
    ),
    SEP,
  ];

  if (!winners.length) {
    inner.push(txt('*No winners recorded yet.*'));
  } else {
    const CROWN  = '<a:crown:1501741170668077127>';
    const ARROW  = '<a:smallarrow:1472222559645863936>';
    const lines  = winners.map(w => {
      const display = (w.player_ids && w.player_ids.length)
        ? w.player_ids.map(p => '<@' + p + '>').join(' ')
        : (w.team_name || 'Unknown');
      const num = w.season < 10 ? ' ' + w.season : String(w.season);
      return '**' + CROWN + '  Saison ' + num + '  ' + ARROW + '  ' + display + '**';
    });
    inner.push(txt(lines.join('\n\n')));
  }

  inner.push(SEP);
  inner.push({ type: 1, components: [
    btn('\u2795 Add Winner',     'wh_add_'  + tid, 1),
    btn('\ud83d\udce4 Post / Update', 'wh_post_' + tid, 3),
    btn('\ud83d\uddd1 Remove Winner', 'wh_del_'  + tid, 4),
  ]});
  inner.push({ type: 1, components: [
    btn('\ud83d\udccc Set Channel', 'wh_setch_' + tid, 2),
    btn('\u2190 Back',              'wh_home',          2),
  ]});
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
  return { flags: 32768, components: [{ type: 17, accent_color: GOLD, components: inner }] };
}

// ── User select panel (add winner step 2) ─────────────────────────────────────
function buildWHUserSelect(tid, season, nameDisplay, selectedIds) {
  selectedIds = selectedIds || [];
  const t = getWHT().find(t => t.id === tid);
  const inner = [
    txt(
      '# \u2795  Add Winner\n' +
      '> **Tournament:** ' + (t ? t.name : tid) + '\n' +
      '> **Saison:** ' + season + '\n' +
      '> **Name:** ' + nameDisplay + '\n' +
      (selectedIds.length ? '> **Tagged:** ' + selectedIds.map(p => '<@' + p + '>').join(' ') : '') +
      '\n\n*Optionally tag the winner\u2019s Discord account, then press **Confirm**.*'
    ),
    SEP,
    { type: 1, components: [{
      type: 5,
      custom_id: 'wh_usersel_' + tid,
      placeholder: 'Search and tag a player (optional)\u2026',
      min_values: 0,
      max_values: 1,
    }]},
    SEP,
    { type: 1, components: [
      btn('\u2705 Confirm', 'wh_confirm_' + tid, 1),
      btn('\u2717 Cancel',  'wh_t_'       + tid, 2),
    ]},
    txt('-# \u00a9 24 2026  |  Goatsi Bot'),
  ];
  return { flags: 32768, components: [{ type: 17, accent_color: GOLD, components: inner }] };
}

// ── Set channel panel ─────────────────────────────────────────────────────────
function buildWHSetChannel(tid) {
  const t = getWHT().find(t => t.id === tid);
  const comp = {
    type: 8,
    custom_id: 'wh_ch_' + tid,
    placeholder: 'Select channel\u2026',
    min_values: 1,
    max_values: 1,
  };
  if (t && t.channelId) comp.default_values = [{ id: t.channelId, type: 'channel' }];
  const inner = [
    txt('# \ud83d\udccc  Set Channel\n> **' + (t ? t.name : tid) + '**'),
    SEP,
    { type: 1, components: [comp] },
    SEP,
    { type: 1, components: [btn('\u2190 Back', 'wh_t_' + tid, 2)] },
    txt('-# \u00a9 24 2026  |  Goatsi Bot'),
  ];
  return { flags: 32768, components: [{ type: 17, accent_color: GOLD, components: inner }] };
}

module.exports = { buildWHMain, buildWHPanel, buildWHUserSelect, buildWHSetChannel };
