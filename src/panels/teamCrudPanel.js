'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });

const E_CUP  = '<a:cup:1501741159557500971>';
const E_ARR  = '<a:arrow:1501741110798585927>';

const PAGE_SIZE = 20;

function buildTeamCrudPanel(opts = {}) {
  const { error, info, page = 0 } = opts;
  const teams = db.get('teams').sort((a, b) => a.name.localeCompare(b.name));
  const total = teams.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage   = Math.min(Math.max(0, page), totalPages - 1);
  const slice      = teams.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const inner = [];

  inner.push(txt(`# Database Teams\n> **${total}** team${total !== 1 ? 's' : ''} in the master list`));
  if (error) inner.push(txt('> \u274c  ' + error));
  if (info)  inner.push(txt('> \u2705  ' + info));
  inner.push(SEP);

  if (!total) {
    inner.push(txt('No teams yet. Click **Add** to add the first one.'));
  } else {
    const lines = slice.map((t, j) => {
      const num = String(safePage * PAGE_SIZE + j + 1).padStart(2, ' ');
      return `${E_ARR}  \`${num}.\`  **${t.name}**`;
    });
    inner.push(txt(lines.join('\n')));
  }

  inner.push(SEP);
  // Row 1 — Search (green)
  inner.push({ type: 1, components: [
    btn('Search', 'tc_search', 3),
  ]});
  // Row 2 — Add + Delete
  inner.push({ type: 1, components: [
    btn('Add',    'tc_add',       1),
    btn('Delete', 'tc_del_start', 4, total === 0),
  ]});
  // Row 3 — Prev / Next (always shown, disabled when not applicable)
  inner.push({ type: 1, components: [
    btn(`◀ Prev  (${safePage + 1}/${totalPages})`, `tc_page_${safePage - 1}`, 2, safePage === 0 || totalPages === 1),
    btn(`Next ▶  (${safePage + 1}/${totalPages})`, `tc_page_${safePage + 1}`, 2, safePage >= totalPages - 1 || totalPages === 1),
  ]});
  // Row 4 — Refresh
  inner.push({ type: 1, components: [
    btn('Refresh', 'tc_refresh', 2),
  ]});
  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: inner }] };
}

// ── Post Team List picker ─────────────────────────────────────────────────────
// Shows EL and MCL as options (one permanent list per tournament type,
// shared across all seasons — the same message gets edited forever).
function buildPostListPickerPanel(opts = {}) {
  const { error } = opts;
  const TEMPLATES = ['EL', 'MCL'];

  const options = TEMPLATES
    .filter(tmpl => {
      // Only show templates that have at least one tournament
      return db.get('tournaments').some(t => t.template === tmpl);
    })
    .map(tmpl => {
      const ref = db.getConfig('teams_list_ref_' + tmpl);
      return {
        label: tmpl + ' \u2014 Team List',
        description: (ref
          ? '\u26a0\ufe0f Already posted \u2014 will repost and update ref'
          : 'Post the permanent list in this channel'
        ).slice(0, 100),
        value: tmpl,
      };
    });

  const inner = [];
  inner.push(txt(
    '## \ud83d\udccc  Post Permanent Team List\n' +
    '> Select the tournament type.\n' +
    '> The bot posts **one permanent message** in this channel that auto-updates\n' +
    '> on every enroll/remove — across all seasons.'
  ));
  if (error) inner.push(txt('> \u26a0\ufe0f  ' + error));
  inner.push(SEP);

  if (!options.length) {
    inner.push(txt('No tournaments found. Create one first.'));
    inner.push(SEP);
    inner.push({ type: 1, components: [btn('\u2190 Back', 'tc_refresh', 2)] });
    return { flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: inner }] };
  }

  inner.push({ type: 1, components: [{
    type: 3,
    custom_id: 'tc_post_list_sel',
    placeholder: 'Select tournament type...',
    options,
  }]});
  inner.push(SEP);
  inner.push({ type: 1, components: [btn('\u2190 Back', 'tc_refresh', 2)] });

  return { flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: inner }] };
}

function buildSearchResultsPanel(query, teams) {
  const inner = [];
  inner.push(txt(`# ${E_CUP}  Search Results\n> **${teams.length}** team${teams.length !== 1 ? 's' : ''} matching **"${query}"**`));
  inner.push(SEP);
  if (teams.length) {
    const lines = teams.map((t, i) => `${E_ARR}  \`${String(i + 1).padStart(2, ' ')}.\`  **${t.name}**`);
    inner.push(txt(lines.join('\n')));
  } else {
    inner.push(txt('No teams found matching that query.'));
  }
  inner.push(SEP);
  inner.push({ type: 1, components: [btn('\u2190 Back', 'tc_refresh', 2)] });
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));
  return { flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: inner }] };
}

module.exports = { buildTeamCrudPanel, buildPostListPickerPanel, buildSearchResultsPanel };
