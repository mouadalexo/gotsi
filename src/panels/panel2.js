'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });

function buildPanel2(tournament) {
  const t      = tournament;
  const tid    = t.id;
  const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const teams  = db.get('teams');
  const players= db.get('players');
  const regOpen= t.registration_open !== false;

  const E_CUP = '<a:cup:1501741159557500971>';
  const inner = [];

  inner.push(txt(
    `# ${E_CUP}  Team Registration  —  ${regOpen ? '🟢 OPEN' : '🔴 CLOSED'}\n` +
    `> **${ttRows.length}** team${ttRows.length !== 1 ? 's' : ''} registered` +
    (t.team_count ? ` / ${t.team_count} spots` : '')
  ));
  inner.push(SEP);

  if (!ttRows.length) {
    inner.push(txt('No teams registered yet. Use **Add Team** to start.'));
    inner.push(SEP);
  } else {
    const hasGroups = ttRows.some(tt => tt.group_name);

    if (hasGroups) {
      const groupMap = {};
      for (const tt of ttRows) {
        const g = tt.group_name || '?';
        if (!groupMap[g]) groupMap[g] = [];
        groupMap[g].push(tt);
      }
      for (const [g, gTeams] of Object.entries(groupMap).sort()) {
        const lines = gTeams.map(tt => {
          const team       = teams.find(t2 => t2.id === tt.team_id) || { name: 'Unknown' };
          const teamPlayers= players.filter(p => p.team_id === tt.team_id);
          const playerStr  = teamPlayers.length
            ? teamPlayers.map(p => `<@${p.discord_id}>`).join(', ')
            : '`No players`';
          return `**${team.name}**  —  ${playerStr}`;
        });
        inner.push(txt(`**Group ${g}**\n${lines.join('\n')}`));
        inner.push(SEP);
      }
    } else {
      const lines = ttRows.map(tt => {
        const team       = teams.find(t2 => t2.id === tt.team_id) || { name: 'Unknown' };
        const teamPlayers= players.filter(p => p.team_id === tt.team_id);
        const playerStr  = teamPlayers.length
          ? teamPlayers.map(p => `<@${p.discord_id}>`).join(', ')
          : '`No players`';
        return `**${team.name}**  —  ${playerStr}`;
      });
      for (let i = 0; i < lines.length; i += 8) {
        inner.push(txt(lines.slice(i, i + 8).join('\n')));
        inner.push(SEP);
      }
    }
  }

  if (regOpen) {
    inner.push({ type: 1, components: [
      btn('Add Team',           `p2_${tid}_addteam`,  1),
      btn('Close Registration', `p2_${tid}_closereg`, 4, ttRows.length < 2),
      btn('Refresh',            `p2_${tid}_refresh`,  2),
    ]});
  } else {
    inner.push({ type: 1, components: [
      btn('Refresh', `p2_${tid}_refresh`, 2),
    ]});
  }

  inner.push(SEP);
  inner.push(txt(`-# Night Stars  •  Panel 2: Team Registration  •  ${t.template || t.name}`));

  return { flags: 32768, components: [{ type: 17, accent_color: 0x57F287, components: inner }] };
}

module.exports = { buildPanel2 };
