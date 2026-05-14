'use strict';
const { db } = require('./database');

const SEP    = { type: 14, divider: true, spacing: 1 };
const txt    = c => ({ type: 10, content: c });
const E_CUP  = '<a:cup:1501741159557500971>';
const MEDALS = ['🥇', '🥈', '🥉'];

function buildWinnersHistoryPayload(tournamentId) {
  const t       = db.findById('tournaments', tournamentId);
  const winners = db.findWhere('winners', w => w.tournament_id === tournamentId)
                    .sort((a, b) => (b.season || 0) - (a.season || 0));
  const teams   = db.get('teams');

  const inner = [];
  inner.push(txt(`# ${E_CUP}  ${t.name}  —  Winners History`));
  inner.push(SEP);

  if (!winners.length) {
    inner.push(txt('No winners recorded yet. Season winners will appear here once confirmed.'));
  } else {
    winners.forEach((w, i) => {
      const team    = teams.find(tm => tm.id === w.team_id);
      const players = (w.player_ids || []).map(pid => `<@${pid}>`).join(', ') || '`No player IDs recorded`';
      const medal   = MEDALS[i] || '🏅';
      inner.push(txt(
        `${medal}  **Season ${w.season}**  —  **${team?.name || 'Unknown'}**\n` +
        `> 👤  ${players}`
      ));
      if (i < winners.length - 1) inner.push(SEP);
    });
  }

  inner.push(SEP);
  inner.push(txt(`-# Night Stars  •  ${t.template || t.name}  •  Winners History`));

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xFFD700, components: inner }],
  };
}

module.exports = { buildWinnersHistoryPayload };
