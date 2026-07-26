'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });

const PAGE_SIZE = 10;

function buildClanCrudPanel(opts = {}) {
  const { error, info, page = 0 } = opts;
  const clans      = (db.get('clans') || []).sort((a, b) => a.name.localeCompare(b.name));
  const maxPlayers = db.getConfig('clans_max_players') || 10;
  const leaderRole = db.getConfig('clans_leader_role_id') || null;
  const total      = clans.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage   = Math.min(Math.max(0, page), totalPages - 1);
  const slice      = clans.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const inner      = [];

  inner.push(txt(
    '# \uD83C\uDFDF\uFE0F  Clan Database\n' +
    '> **' + total + '** clan' + (total !== 1 ? 's' : '') +
    '  \u2022  Max **' + maxPlayers + '** players/clan' +
    (leaderRole ? '  \u2022  Leader role: <@&' + leaderRole + '>' : '  \u2022  No leader role set')
  ));
  if (error) inner.push(txt('> \u274C  ' + error));
  if (info)  inner.push(txt('> \u2705  ' + info));
  inner.push(SEP);

  if (!total) {
    inner.push(txt('No clans yet. Click **Add** to create the first one.'));
  } else {
    const lines = slice.map(c => {
      const leader = (c.players || [])[0];
      return '\uD83C\uDFF0  **' + c.name + '**  `[' + (c.tag || '?') + ']`' +
             (leader ? '  \uD83D\uDC51 <@' + leader + '>' : '  \u2014 no leader');
    });
    inner.push(txt(lines.join('\n')));
  }

  inner.push(SEP);
  inner.push({ type: 1, components: [btn('\uD83D\uDD0D Search', 'cc_search', 3)] });
  inner.push({ type: 1, components: [
    btn('\u2795  Add',        'cc_add',        1),
    btn('\u270F\uFE0F  Edit', 'cc_edit_start', 2, total === 0),
    btn('\uD83D\uDDD1\uFE0F  Remove', 'cc_remove', 4, total === 0),
  ]});
  inner.push({ type: 1, components: [
    btn('\u2699\uFE0F  Settings', 'cc_settings', 2),
    btn('\uD83D\uDD04  Refresh',  'cc_refresh',  2),
  ]});
  inner.push({ type: 1, components: [
    btn('\u25C0 Prev  (' + (safePage + 1) + '/' + totalPages + ')', 'cc_page_' + (safePage - 1), 2, safePage === 0 || totalPages === 1),
    btn('Next \u25B6  (' + (safePage + 1) + '/' + totalPages + ')', 'cc_page_' + (safePage + 1), 2, safePage >= totalPages - 1 || totalPages === 1),
  ]});
  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));

  return { flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: inner }] };
}

function buildClanAssignPanel(clanId, opts = {}) {
  const { error } = opts;
  const clan = (db.get('clans') || []).find(c => c.id === clanId);
  if (!clan) return buildClanCrudPanel({ error: 'Clan not found.' });

  const maxPlayers = db.getConfig('clans_max_players') || 10;
  const players    = (clan.players || []).filter(Boolean);
  const leader     = players[0] || null;
  const members    = players.slice(1);
  const nMembers   = maxPlayers - 1;
  const filled     = players.length;
  const allFilled  = filled >= maxPlayers;

  const leaderStr  = leader ? '\uD83D\uDC51 <@' + leader + '>' : '*Not set*';
  const membersStr = members.length
    ? members.map(uid => '\u2022 <@' + uid + '>').join('  ')
    : '*None assigned*';

  const inner = [
    txt(
      '**\uD83C\uDFDF\uFE0F  ' + clan.name + '** `[' + (clan.tag || '?') + ']`' +
      '  \u2014  **' + filled + '/' + maxPlayers + '** assigned' + (allFilled ? '  \u2705' : '') +
      '\n> **Leader:** ' + leaderStr +
      '\n> **Members (' + members.length + '/' + nMembers + '):** ' + membersStr
    ),
    SEP,
    { type: 1, components: [{ type: 5, custom_id: 'cc_leader_' + clanId,
      placeholder: '\uD83D\uDC51 Select clan leader (1 person)\u2026',
      min_values: 0, max_values: 1,
    }]},
    { type: 1, components: [{ type: 5, custom_id: 'cc_members_' + clanId,
      placeholder: '\uD83D\uDC65 Select members (up to ' + nMembers + ')\u2026',
      min_values: 0, max_values: Math.min(Math.max(nMembers, 1), 25),
      default_values: members.map(uid => ({ id: uid, type: 'user' })),
    }]},
    SEP,
  ];

  if (error) inner.push(txt('> \u274C  ' + error));

  inner.push({ type: 1, components: [
    { type: 2, style: 1, label: '\u2705  Save Clan', custom_id: 'cc_save_' + clanId },
    { type: 2, style: 2, label: '\u25C4 Back',       custom_id: 'cc_refresh' },
  ]});

  return { flags: 32768, components: [{ type: 17, accent_color: 0x57F287, components: inner }] };
}

function buildClanSettingsPanel(opts = {}) {
  const { error, info } = opts;
  const maxPlayers = db.getConfig('clans_max_players') || 10;
  const leaderRole = db.getConfig('clans_leader_role_id') || null;

  const inner = [
    txt(
      '## \u2699\uFE0F  Clan Settings\n' +
      '> **Max players per clan:** ' + maxPlayers + ' (1 leader + ' + (maxPlayers - 1) + ' members)\n' +
      '> **Leader role:** ' + (leaderRole ? '<@&' + leaderRole + '>' : '*Not set*')
    ),
    SEP,
  ];

  if (error) inner.push(txt('> \u274C  ' + error));
  if (info)  inner.push(txt('> \u2705  ' + info));

  inner.push({ type: 1, components: [btn('\uD83D\uDC65  Set Max Players', 'cc_set_maxplayers', 2)] });
  inner.push({ type: 1, components: [{ type: 6, custom_id: 'cc_set_leader_role',
    placeholder: '\uD83D\uDC51 Set or clear leader role\u2026',
    min_values: 0, max_values: 1,
  }]});
  inner.push(SEP);
  inner.push({ type: 1, components: [btn('\u25C4 Back', 'cc_refresh', 2)] });

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: inner }] };
}

module.exports = { buildClanCrudPanel, buildClanAssignPanel, buildClanSettingsPanel };
