'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });

function buildPanel2(tournament) {
  const t       = tournament;
  const tid     = t.id;
  const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
  const teams   = db.get('teams');
  const players = db.get('players');
  const needed  = Math.min(t.players_per_team || 1, 4);
  const hasTeams = ttRows.length > 0;

  const E_CUP  = '<a:cup:1501741159557500971>';
  const E_CH   = '<a:channelutility:1501741046734786600>';
  const E_ARR  = '<a:arrow:1501741110798585927>';
  const E_SARR = '<a:smallarrow:1472222559645863936>';

  const inner = [];

  inner.push(txt(
    `# ${E_CUP}  ${t.name}  \u2014  Team List\n` +
    `${E_CH}  The **${ttRows.length}** registered teams for **${t.template || t.name}**` +
    (t.season ? ` **S${t.season}**` : '') +
    (t.team_count ? `  \u2014  *${ttRows.length}/${t.team_count} spots*` : '')
  ));
  inner.push(SEP);

  if (!ttRows.length) {
    inner.push(txt('> No teams registered yet. Use **Add Team** to start.'));
    inner.push(SEP);
  } else {
    const needsPad = ttRows.length >= 10;
    ttRows.forEach((tt, idx) => {
      const team      = teams.find(t2 => t2.id === tt.team_id) || { name: 'Unknown' };
      const tPlayers  = players.filter(p => p.team_id === tt.team_id);
      const num       = String(idx + 1);
      const spacing   = needsPad ? (num.length === 1 ? '    ' : '   ') : '   ';
      let playerLines = '';
      if (needed === 1) {
        const p = tPlayers[0]?.discord_id ? `<@${tPlayers[0].discord_id}>` : '`No player assigned`';
        playerLines = `\n\u3000 Player   ${E_SARR}   ${p}`;
      } else {
        for (let i = 0; i < needed; i++) {
          const p = tPlayers[i]?.discord_id ? `<@${tPlayers[i].discord_id}>` : '`No player assigned`';
          playerLines += `\n\u3000 Player ${i + 1}   ${E_SARR}   ${p}`;
        }
      }
      inner.push(txt(`**${num}${spacing}Team name   ${E_ARR}   ${team.name}**${playerLines}`));
      inner.push(SEP);
    });
  }

  inner.push({ type: 1, components: [
    btn('Add Team',    `p2_${tid}_addteam`,    1),
    btn('Edit Team',   `p2_${tid}_editteam`,   2, !hasTeams),
    btn('Remove Team', `p2_${tid}_removeteam`, 4, !hasTeams),
    btn('Clear Teams', `p2_${tid}_clearteams`, 4, !hasTeams),
    btn('Refresh',     `p2_${tid}_refresh`,    2),
  ]});

  inner.push(SEP);
  inner.push(txt(`-# Night Stars  \u2022  Panel 2: Team Registration  \u2022  ${t.template || t.name}`));

  return { flags: 32768, components: [{ type: 17, accent_color: 0x2B2D31, components: inner }] };
}

module.exports = { buildPanel2 };
