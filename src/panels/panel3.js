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
  const round1Matches  = groupMatches.filter(m => m.round === 1);
  const round1Complete = round1Matches.length > 0 && round1Matches.every(m => m.status === 'played');

  const ch = t.channels || {};
  const chParts = [
    ch.schedule   ? `Schedule → <#${ch.schedule}>`       : 'Schedule → `not set`',
    ch.results    ? `Results → <#${ch.results}>`         : 'Results → `not set`',
    ch.management ? `Management → <#${ch.management}>`   : 'Management → `not set`',
    ch.teamsList  ? `Teams List → <#${ch.teamsList}>`    : 'Teams List → `not set`',
  ];

  // Post / Preview mode toggle
  const previewMode = t.preview_mode === true;
  const modeLabel   = previewMode ? '🔴  Preview' : '🟢  Post';
  const modeStyle   = previewMode ? 4 : 3;
  const actStyle    = previewMode ? 2 : 1;

  const E_CUP = '<a:cup:1501741159557500971>';
  const inner = [];

  inner.push(txt(`# ${E_CUP}  Post & Publish  —  ${t.name}`));
  inner.push(SEP);
  inner.push(txt(`**Channels**\n${chParts.join('  |  ')}`));
  inner.push(SEP);

  // Mode toggle row
  inner.push({ type: 1, components: [
    { type: 2, style: modeStyle, label: modeLabel, custom_id: `p3_${tid}_togglemode` },
    btn('Refresh', `p3_${tid}_refresh`, 2),
  ]});
  inner.push(txt(
    previewMode
      ? '> 🔴 **Preview mode** — buttons show you an ephemeral preview only.'
      : '> 🟢 **Post mode** — buttons post directly to the configured channels.'
  ));
  inner.push(SEP);

  // Action buttons — gated by tournament state
  inner.push({ type: 1, components: [
    btn('Teams List', `p3_${tid}_teamslist`, actStyle, !isFull),
    btn('Schedule',   `p3_${tid}_schedule`,  actStyle, !hasMatches),
    btn('Results',    `p3_${tid}_results`,   actStyle, !round1Complete),
  ]});
  inner.push({ type: 1, components: [
    btn('Standings',  `p3_${tid}_standings`, actStyle, !hasGroups),
    btn('Group Draw', `p3_${tid}_groupdraw`, 2,        !hasGroups),
    btn('Bracket',    `p3_${tid}_bracket`,   2,        !hasKO),
  ]});

  inner.push(SEP);
  inner.push(txt(`-# Night Stars  •  Panel 3: Post & Publish  •  ${t.template || t.name}`));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: inner }] };
}

module.exports = { buildPanel3 };
