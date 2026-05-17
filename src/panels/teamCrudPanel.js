'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });

const E_CUP  = '<a:cup:1501741159557500971>';
const E_ARR  = '<a:arrow:1501741110798585927>';

function buildTeamCrudPanel() {
  const teams = db.get('teams').sort((a, b) => a.name.localeCompare(b.name));
  const total = teams.length;
  const inner = [];

  inner.push(txt(`# ${E_CUP}  Teams List\n> **${total}** team${total !== 1 ? 's' : ''} in the master list`));
  inner.push(SEP);

  if (!total) {
    inner.push(txt('No teams yet. Click **Add Team** to add the first one.'));
  } else {
    for (let i = 0; i < teams.length; i += 15) {
      const lines = teams.slice(i, i + 15).map((t, j) => {
        const num = String(i + j + 1).padStart(2, ' ');
        return `${E_ARR}  \`${num}.\`  **${t.name}**`;
      });
      inner.push(txt(lines.join('\n')));
      if (i + 15 < teams.length) inner.push(SEP);
    }
  }

  inner.push(SEP);
  inner.push({ type: 1, components: [
    btn('Add Team',    'tc_add',       1),
    btn('Enroll',      'tc_enroll',    1),
    btn('Delete Team', 'tc_del_start', 4, total === 0),
  ]});
  inner.push({ type: 1, components: [
    btn('Search',  'tc_search',  2),
    btn('Refresh', 'tc_refresh', 2),
  ]});
  inner.push(SEP);
  inner.push(txt('-# Night Stars  \u2022  /team  \u2022  Admin only'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: inner }] };
}

module.exports = { buildTeamCrudPanel };
