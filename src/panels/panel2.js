'use strict';
const { db }       = require('../utils/database');
const { getStage } = require('./panel1');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });

function buildPanel2(tournament) {
  const t       = tournament;
  const tid     = t.id;
  const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const hasTeams  = ttRows.length > 0;
  const regLocked = getStage(t) !== 'setup';
  const ch        = t.channels || {};

  const E_CH = '<a:channelutility:1501741046734786600>';

  const inner = [];

  const registered = ttRows.length;
  const total      = t.team_count || null;
  const spotsLeft  = total !== null ? total - registered : null;
  const teamListCh = ch.teamsList ? `<#${ch.teamsList}>` : '`not set`';

  const spotsTxt = total !== null
    ? `${E_CH}  **${registered}** teams registered  \u2022  **${spotsLeft}** ${spotsLeft === 1 ? 'spot' : 'spots'} left`
    : `${E_CH}  **${registered}** teams registered`;

  inner.push(txt(`## Registration — ${t.template || t.name}`));
  inner.push(SEP);
  inner.push(txt(`**List** : ${teamListCh}\n${spotsTxt}`));
  inner.push(SEP);

  inner.push({ type: 1, components: [
    btn('Add Team', `p2_${tid}_addteam`, 1, regLocked),
  ]});
  inner.push({ type: 1, components: [
    btn('\uD83D\uDC41 Preview',   `p2_${tid}_previewlist`, 3, !hasTeams),
    btn('Post / Update', `p2_${tid}_postlist`,    3),
  ]});
  inner.push({ type: 1, components: [
    btn('Remove',    `p2_${tid}_removeteam`, 4, !hasTeams || regLocked),
    btn('Clear All', `p2_${tid}_clearteams`, 4, !hasTeams || regLocked),
  ]});
  inner.push({ type: 1, components: [
    btn('Refresh',         `p2_${tid}_refresh`, 2),
    btn('🎲 Random',      `p2_${tid}_random`,  2, regLocked),
  ]});

  inner.push(SEP);
  inner.push(txt(`-# \u00a9 24 2026  |  Goatsi Bot`));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

module.exports = { buildPanel2 };
