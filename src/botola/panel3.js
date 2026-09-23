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
    ch.results  ? `**Channel 1** → <#${ch.results}>`   : '**Channel 1** → `not set`',
    ch.schedule ? `**Channel 2** → <#${ch.schedule}>` : '**Channel 2** → `not set`',
  ];

  const inner = [];

  inner.push(txt(`## Publish  —  ${t.template || t.name}`));
  inner.push(SEP);
  inner.push(txt(chParts.join('\n')));
  inner.push(SEP);

  // Keep the pre-season header and channel information above this point unchanged.
  // Publish controls appear after Begin Season creates the tournament matches.
  if (stage !== 'setup') {
    // Post / Preview mode toggle
    const previewMode = t.preview_mode === true;
    const modeLabel   = previewMode ? '🔴  Preview' : '🟢  Post';
    const modeStyle   = previewMode ? 4 : 3;

    // Tag toggle — only active in Post mode (tagging a preview is pointless)
    const tagOn     = t.tag_on === true;
    const tagLabel  = tagOn ? '🔔  Tag: ON' : '🔕  Tag: OFF';
    const tagStyle  = tagOn ? 3 : 2;

    // Mode + Tag toggle row
    inner.push({ type: 1, components: [
      { type: 2, style: modeStyle, label: modeLabel,
        custom_id: `p3_${tid}_${previewMode ? 'togglemode_preview' : 'togglemode_post'}` },
      { type: 2, style: tagStyle,  label: tagLabel,  custom_id: `p3_${tid}_toggletag`,  disabled: previewMode },
    ]});
    inner.push(txt(
      previewMode
        ? '> 🔴 **Preview mode** — buttons show you an ephemeral preview only.'
        : tagOn
          ? '> 🟢 **Post mode**  •  🔔 **Tag ON** — posts will ping <@&' + (t.registration_role_id || '?') + '> before each post.'
          : '> 🟢 **Post mode**  •  🔕 **Tag OFF** — posts will be sent without a role ping.'
    ));
    inner.push(SEP);
  }

  const groupStageFinished = groupMatches.length > 0 && groupMatches.every(m => m.status === 'played');
  const isGroupStage = stage === 'setup' || stage === 'group';
  const isKOStage = stage === 'knockout' || stage === 'finished';

  if (stage === 'group') {
    // Group Draw and the live Standings post belong together.
    inner.push({ type: 1, components: [
      btn('Group Draw', `p3_${tid}_groupdraw`, 1, !hasGroups),
      btn('Standings', `p3_${tid}_standings`, 1, !hasGroups),
    ]});
    inner.push(SEP);

    // Group matches uses the selected Matchday and stays live as results arrive.
    inner.push({ type: 1, components: [
      btn('Group matches', `p3_${tid}_groupmatches`,  3, !hasMatches),
    ]});

    // No separator here: this selector belongs directly to the three actions above.
    // Match the Main panel's progression: only reached matchdays are selectable.
    // Matchday 1 has no selector; after advancing, options become 1..current.
    const _unlockedPublishRds = _allGrpRds.filter(r => r <= _currentRd).slice(0, 25);
    // Keep the selector visible until Advance creates the knockout stage.
    // All group matches can be played while the workflow is still on the final
    // group matchday, so hiding it on groupStageFinished loses the controls
    // before the manager advances.
    if (_unlockedPublishRds.length > 1) {
      inner.push({ type: 1, components: [{
        type: 3,
        custom_id: `p3_${tid}_roundsel`,
        placeholder: 'Pick Matchday…',
        options: _unlockedPublishRds.map(r => ({
          label: 'Matchday ' + r,
          value: String(r),
          default: r === _activeRd,
        })),
      }]});
    }
    inner.push(SEP);
  } else if (isKOStage) {
    inner.push({ type: 1, components: [
      btn('KO Bracket', `p3_${tid}_bracket`,    4, !hasKO),
      btn('Winner Ann', `p3_${tid}_winner_ann`, 4, !(finalDone || stage === 'finished')),
    ]});
    inner.push(SEP);
  }

  // Refresh is always the final, separated control in the panel.
  inner.push({ type: 1, components: [
    btn('Refresh', `p3_${tid}_refresh`, 2),
  ]});


  while (inner.length && inner[inner.length - 1]?.type === 14) inner.pop();

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

module.exports = { buildPanel3 };
