'use strict';
const { db } = require('./database');

const SEP    = { type: 14, divider: true, spacing: 1 };
const txt    = c => ({ type: 10, content: c });
const E_CUP  = '<a:cup:1501741159557500971>';
const CROWN  = '<a:crown:1501741170668077127>';
const ARROW  = '<a:smallarrow:1472222559645863936>';

function buildWinnersHistoryPayload(whTournamentId) {
  const list = db.get('wh_tournaments') || [];
  const t    = list.find(t => t.id === whTournamentId);
  if (!t) return { flags: 32768, components: [{ type: 17, accent_color: 0xFFD700, components: [txt('Tournament not found.')] }] };

  const winners = (db.get('winners') || [])
    .filter(w => w.wh_tournament_id === whTournamentId)
    .sort((a, b) => (a.season || 0) - (b.season || 0));

  const inner = [];
  inner.push(txt('# ' + E_CUP + '  ' + t.name + '  \u2014  Winners History'));
  inner.push(SEP);

  if (!winners.length) {
    inner.push(txt('No winners recorded yet. Season winners will appear here once confirmed.'));
  } else {
    const lines = winners.map(w => {
      const display = (w.player_ids && w.player_ids.length)
        ? w.player_ids.map(pid => '<@' + pid + '>').join(' ')
        : (w.team_name || 'Unknown');
      const num = w.season < 10 ? ' ' + w.season : String(w.season);
      return '**' + CROWN + '  Saison ' + num + '  ' + ARROW + '  ' + display + '**';
    });
    inner.push(txt(lines.join('\n\n')));
  }

  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xFFD700, components: inner }],
  };
}

module.exports = { buildWinnersHistoryPayload };
