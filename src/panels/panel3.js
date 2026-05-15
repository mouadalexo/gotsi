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
  const hasResults= matches.some(m => m.status === 'played');
  const hasMatches= matches.length > 0;
  const stage     = getStage(t);

  const ch   = t.channels || {};
  const chInfo = [
    ch.schedule    ? `Schedule → <#${ch.schedule}>`     : 'Schedule → `not set`',
    ch.results     ? `Results → <#${ch.results}>`       : 'Results → `not set`',
    ch.standings   ? `Standings → <#${ch.standings}>`   : 'Standings → `not set`',
    ch.management  ? `Management → <#${ch.management}>` : 'Management → `not set`',
  ];

  const E_CUP = '<a:cup:1501741159557500971>';
  const inner = [];

  inner.push(txt(
    `# ${E_CUP}  Post & Preview  —  ${t.name}\n` +
    `> A preview will appear in DM/ephemeral before confirming the post.`
  ));
  inner.push(SEP);
  inner.push(txt(`**Configured channels**\n${chInfo.join('  |  ')}`));
  inner.push(SEP);

  inner.push({ type: 1, components: [
    btn('Post Teams List', `p3_${tid}_teamslist`, 1, ttRows.length === 0),
    btn('Post Schedule',   `p3_${tid}_schedule`,  1, !hasMatches),
    btn('Post Results',    `p3_${tid}_results`,   1, !hasResults),
  ]});
  inner.push({ type: 1, components: [
    btn('Post Standings',  `p3_${tid}_standings`, 1, stage === 'setup'),
    btn('Post Group Draw', `p3_${tid}_groupdraw`, 2, !hasGroups),
    btn('Post Bracket',    `p3_${tid}_bracket`,   2, !hasKO),
  ]});
  inner.push({ type: 1, components: [
    btn('Refresh', `p3_${tid}_refresh`, 2),
  ]});

  inner.push(SEP);
  inner.push(txt(`-# Night Stars  •  Panel 3: Post & Preview  •  ${t.template || t.name}`));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: inner }] };
}

module.exports = { buildPanel3 };
