'use strict';
const { db } = require('../utils/database');
const { getStage } = require('./panel1');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });

function buildPanel3(tournament) {
  const t   = tournament;
  const tid = t.id;

  const matches   = db.get('matches').filter(m => m.tournament_id === tid);
  const ttRows    = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const hasGroups = ttRows.some(tt => tt.group_name);
  const hasKO     = matches.some(m => m.stage === 'knockout');
  const hasMatches = matches.length > 0;
  const stage     = getStage(t);

  // Gating logic
  const isFull         = t.team_count > 0 && ttRows.length >= t.team_count;
  const groupMatches   = matches.filter(m => m.stage === 'group');

  // Round selector state
  const _allGrpRds  = [...new Set(groupMatches.map(m => m.round))].sort((a, b) => a - b);
  const _workflowRd = db.getConfig('group_round_' + tid);
  const _currentRd  = (_workflowRd && _allGrpRds.includes(_workflowRd)) ? _workflowRd : (_allGrpRds[0] || 1);
  const _savedRd    = db.getConfig('p3_round_' + tid);
  const _activeRd   = (_savedRd && _allGrpRds.includes(_savedRd)) ? _savedRd : _currentRd;

  // Winner Ann: only when both Final legs (Home + Away) are played
  const koMatches   = matches.filter(m => m.stage === 'knockout');
  const finalMatch  = koMatches.find(m => m.round === 1 && (!m.leg || m.leg === 1));
  const finalDone   = finalMatch?.status === 'played';

  const ch = t.channels || {};
  const chParts = [
    ch.schedule ? `**Schedule** → <#${ch.schedule}>` : '**Schedule** → `not set`',
    ch.results  ? `**Results** → <#${ch.results}>`   : '**Results** → `not set`',
  ];

  // Post / Preview mode toggle
  const previewMode = t.preview_mode === true;
  const modeLabel   = previewMode ? '🔴  Preview' : '🟢  Post';
  const modeStyle   = previewMode ? 4 : 3;
  const actStyle    = previewMode ? 2 : 1;

  // Tag toggle — only active in Post mode (tagging a preview is pointless)
  const tagOn     = t.tag_on === true;
  const tagLabel  = tagOn ? '🔔  Tag: ON' : '🔕  Tag: OFF';
  const tagStyle  = tagOn ? 3 : 2;

  const inner = [];

  inner.push(txt(`## 3 : Publish  —  ${t.template || t.name}`));
  inner.push(SEP);
  inner.push(txt('**Channels**'));
  inner.push(SEP);
  inner.push(txt(chParts.join('\n')));
  inner.push(SEP);

  // Mode + Tag toggle row
  inner.push({ type: 1, components: [
    { type: 2, style: modeStyle, label: modeLabel, custom_id: `p3_${tid}_togglemode` },
    { type: 2, style: tagStyle,  label: tagLabel,  custom_id: `p3_${tid}_toggletag`,  disabled: previewMode },
    btn('Refresh', `p3_${tid}_refresh`, 2),
  ]});
  inner.push(txt(
    previewMode
      ? '> 🔴 **Preview mode** — buttons show you an ephemeral preview only.'
      : tagOn
        ? '> 🟢 **Post mode**  •  🔔 **Tag ON** — posts will ping <@&' + (t.registration_role_id || '?') + '> before each post.'
        : '> 🟢 **Post mode**  •  🔕 **Tag OFF** — posts will be sent without a role ping.'
  ));
  inner.push(SEP);

  // Keep Matchday selection available until the group stage is actually complete.
  const groupStageFinished = groupMatches.length > 0 && groupMatches.every(m => m.status === 'played');
  if (!groupStageFinished && _allGrpRds.length > 0) {
    inner.push({ type: 1, components: [{
      type: 3,
      custom_id: `p3_${tid}_roundsel`,
      placeholder: 'Pick Matchday…',
      options: _allGrpRds.map(r => ({
        label: 'Matchday ' + r,
        value: String(r),
        default: r === _activeRd,
      })),
    }]});
    inner.push(SEP);
  }

  // Group-stage publishing actions are hidden once knockout begins.
  if (stage !== 'knockout') {
    inner.push({ type: 1, components: [
      btn('Group Draw', `p3_${tid}_groupdraw`, 1, !hasGroups),
      btn('Schedule',   `p3_${tid}_schedule`,  1, !hasMatches),
    ]});
    inner.push({ type: 1, components: [
      btn('Results',    `p3_${tid}_results`,   3, !hasMatches),
      btn('Standings',  `p3_${tid}_standings`, 3, !hasGroups),
    ]});
  }
  // KO-stage publishing actions remain available in every stage.
  inner.push({ type: 1, components: [
    btn('KO Bracket',  `p3_${tid}_bracket`,    4, !hasKO),
    btn('Winner Ann',  `p3_${tid}_winner_ann`, 4, !(finalDone || stage === 'finished')),
  ]});


  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

module.exports = { buildPanel3 };
