'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, emoji, disabled = false) => ({
  type: 2, style, label, custom_id: id, disabled,
  ...(emoji ? { emoji: { name: emoji } } : {}),
});

function buildTeamCrudPanel(page = 0) {
  const all   = db.get('teams').sort((a, b) => a.name.localeCompare(b.name));
  const PER   = 20;
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / PER));
  const slice = all.slice(page * PER, (page + 1) * PER);

  const E_CUP = '<a:cup:1501741159557500971>';
  const inner = [];

  inner.push(txt(`# ${E_CUP}  Team Database\n> **${total}** teams registered in the master list.`));
  inner.push(SEP);

  if (!slice.length) {
    inner.push(txt('No teams yet. Use **Add Team** to get started.'));
  } else {
    const lines = slice.map((t, i) => {
      const num = String(page * PER + i + 1).padStart(2, ' ');
      const cat = t.category ? ` \`${t.category}\`` : '';
      return `\`${num}.\`  **${t.name}**${cat}  \`ID:${t.id}\``;
    });
    for (let i = 0; i < lines.length; i += 10) {
      inner.push(txt(lines.slice(i, i + 10).join('\n')));
      if (i + 10 < lines.length) inner.push(SEP);
    }
  }

  inner.push(SEP);
  inner.push({
    type: 1, components: [
      btn('➕ Add Team',     'tc_add',           1, '➕'),
      btn('✏ Edit Team',    'tc_edit_start',     2, null, total === 0),
      btn('🗑 Delete Team',  'tc_del_start',      4, null, total === 0),
      btn('🔄 Refresh',     `tc_refresh_${page}`, 2, '🔄'),
    ],
  });

  if (pages > 1) {
    inner.push({
      type: 1, components: [
        btn('◀ Prev',              `tc_page_${Math.max(0, page - 1)}`,       2, null, page === 0),
        btn(`Page ${page+1}/${pages}`, 'tc_noop',                            2, null, true),
        btn('Next ▶',              `tc_page_${Math.min(pages - 1, page + 1)}`, 2, null, page >= pages - 1),
      ],
    });
  }

  inner.push(SEP);
  inner.push(txt('-# Night Stars  •  /team  •  Admin only'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: inner }] };
}

module.exports = { buildTeamCrudPanel };
