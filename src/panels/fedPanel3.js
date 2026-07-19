'use strict';
const { db } = require('../utils/database');
const { getFed, getFedClans, getFedMatches } = require('./fedPanel1');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });

function buildFedPanel3() {
  const fed     = getFed();
  const clans   = getFedClans();
  const matches = getFedMatches();
  const system  = fed.system || 'cup';
  const ch      = fed.channels || {};

  const hasClans   = clans.length > 0;
  const hasMatches = matches.length > 0;
  const hasGroups  = matches.some(m => m.stage === 'group');
  const hasKO      = matches.some(m => m.stage === 'knockout');
  const played     = matches.filter(m => m.status === 'played');
  const finalMatch = matches.find(m => m.stage === 'knockout' && m.round === 1);
  const finalDone  = finalMatch?.status === 'played';

  const allGrpRds  = [...new Set(matches.filter(m => m.stage === 'group').map(m => m.round))].sort((a,b)=>a-b);
  const savedRd    = db.getConfig('fed_p3_round') || null;
  const activeRd   = (savedRd && allGrpRds.includes(Number(savedRd))) ? Number(savedRd) : (allGrpRds[allGrpRds.length - 1] || 1);

  const previewMode = fed.p3_preview === true;
  const tagOn       = fed.p3_tag === true;

  const chParts = [
    ch.schedule ? '**Schedule** \u2192 <#' + ch.schedule + '>' : '**Schedule** \u2192 `not set`',
    ch.results  ? '**Results** \u2192 <#' + ch.results + '>'   : '**Results** \u2192 `not set`',
  ];

  const inner = [];
  inner.push(txt('## 3 : Publish  \u2014  ' + (fed.tag || fed.name || 'Federation')));
  inner.push(SEP);
  inner.push(txt('**Channels**'));
  inner.push(SEP);
  inner.push(txt(chParts.join('\n')));
  inner.push(SEP);
  inner.push({ type: 1, components: [
    { type: 2, style: previewMode ? 4 : 3, label: previewMode ? '\uD83D\uDD34  Preview' : '\uD83D\uDFE2  Post', custom_id: 'fed_p3_togglemode' },
    { type: 2, style: tagOn ? 3 : 2,       label: tagOn ? '\uD83D\uDD14  Tag: ON' : '\uD83D\uDD15  Tag: OFF', custom_id: 'fed_p3_toggletag', disabled: previewMode },
    btn('Refresh', 'fed_p3_refresh', 2),
  ]});
  inner.push(txt(previewMode ? '> \uD83D\uDD34 **Preview mode** \u2014 ephemeral preview only.' : tagOn ? '> \uD83D\uDFE2 **Post mode**  \u2022  \uD83D\uDD14 **Tag ON**' : '> \uD83D\uDFE2 **Post mode**  \u2022  \uD83D\uDD15 **Tag OFF**'));
  inner.push(SEP);

  if (allGrpRds.length > 0) {
    inner.push({ type: 1, components: [{ type: 3, custom_id: 'fed_p3_roundsel',
      placeholder: 'Pick Round\u2026',
      options: allGrpRds.map(r => ({ label: (system === 'cup' ? 'Match Day ' : 'Round ') + r, value: String(r), default: r === activeRd })),
    }]});
    inner.push(SEP);
  }

  if (system === 'cup') {
    inner.push({ type: 1, components: [btn('Group Draw', 'fed_p3_groupdraw', 1, !hasGroups), btn('Schedule', 'fed_p3_schedule', 1, !hasMatches)] });
    inner.push({ type: 1, components: [btn('Results', 'fed_p3_results', 3, !hasMatches), btn('Standings', 'fed_p3_standings', 3, !hasGroups)] });
    inner.push({ type: 1, components: [btn('KO Bracket', 'fed_p3_bracket', 4, !hasKO), btn('Winner Ann', 'fed_p3_winner', 4, !finalDone)] });
    inner.push({ type: 1, components: [btn('\uD83C\uDFDF\uFE0F  Clan List', 'fed_p3_clanlist', 2, !hasClans)] });
  } else {
    inner.push({ type: 1, components: [btn('Schedule', 'fed_p3_schedule', 1, !hasMatches), btn('Results', 'fed_p3_results', 3, !hasMatches)] });
    inner.push({ type: 1, components: [btn('Standing League', 'fed_p3_standings', 3, !played.length)] });
    inner.push({ type: 1, components: [btn('\uD83C\uDFDF\uFE0F  Clan List', 'fed_p3_clanlist', 2, !hasClans)] });
  }

  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

module.exports = { buildFedPanel3 };
