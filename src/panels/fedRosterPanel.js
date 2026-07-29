'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false, emoji = null) => {
  const b = { type: 2, style, label, custom_id: id, disabled };
  if (emoji) b.emoji = emoji;
  return b;
};

// ── Config helpers ──────────────────────────────────────────────────────────
function getRosterConfig() {
  return {
    maxPlayers:   db.getConfig('fed_roster_max_players')    ?? 12,
    minPlayers:   db.getConfig('fed_roster_min_players')    ?? 8,
    locked:       db.getConfig('fed_roster_locked')         ?? false,
    leaderRoleId: db.getConfig('fed_roster_leader_role_id') ?? null,
  };
}

function getRoster(leaderDiscordId) {
  return (db.get('fed_rosters') || []).find(r => r.leader_discord_id === leaderDiscordId) || null;
}

// ── LEADER: Launcher message (non-ephemeral, posted by =frosters) ────────────
function buildRosterLauncher(member) {
  const cfg    = getRosterConfig();
  const roster = getRoster(member.id);
  const locked = cfg.locked;
  const status  = roster?.status || 'none';
  const players = roster?.players || [];

  const statusLine =
    status === 'submitted' ? '> ✅ Roster **submitted** — ' + players.length + ' player(s) registered.' :
    status === 'draft'     ? '> 📝 Draft in progress — **' + players.length + '** player(s) added.' :
    locked                 ? '> 🔒 Registration is currently locked by admin.' :
                             '> 📋 No roster started yet — click **Open Dashboard** to begin.';

  const inner = [
    txt(
      '## 🏟️  Federation Roster — ' + (member.displayName || member.user?.username || 'Leader') + '\n' +
      statusLine
    ),
    SEP,
    { type: 1, components: [btn('🗂️  Open Dashboard', 'fr_open', locked ? 2 : 1)] },
    SEP,
    txt('-# © 24 2026  |  Goatsi Bot'),
  ];
  return { flags: 32768, components: [{ type: 17, accent_color: 0x00FF8C, components: inner }] };
}

// ── LEADER: Main ephemeral dashboard ────────────────────────────────────────
function buildLeaderDashboard(leaderId, opts = {}) {
  const { error, info } = opts;
  const cfg         = getRosterConfig();
  const roster      = getRoster(leaderId);
  const locked      = cfg.locked;
  const players     = roster?.players || [];
  const filled      = players.length;
  const canAdd      = filled < cfg.maxPlayers && !locked;
  const canEdit     = filled > 0 && !locked;
  const canSub      = filled >= cfg.minPlayers && !locked && roster?.status !== 'submitted';
  const canPdf      = !!roster && (roster.clan_name || filled > 0);
  const isSubmitted = roster?.status === 'submitted';

  const statusEmoji = isSubmitted ? '✅' : locked ? '🔒' : '📝';
  const statusText  = isSubmitted ? 'Submitted' : locked ? 'Locked' : 'Draft';

  const headerLines = [
    '## 🏟️  Clan Registration Dashboard',
    '> **Status:** ' + statusEmoji + ' ' + statusText +
      '  •  **Players:** ' + filled + '/' + cfg.maxPlayers,
  ];
  if (roster?.clan_name) {
    headerLines.push('> **Clan:** ' + roster.clan_name + (roster.clan_tag ? '  `[' + roster.clan_tag + ']`' : ''));
  }
  if (roster?.social_media) headerLines.push('> **Social:** ' + roster.social_media);
  if (roster?.logo_url)     headerLines.push('> **Logo:** ' + roster.logo_url);
  if (locked)               headerLines.push('> 🔒 Registration is currently **locked** by the admin.');
  if (!roster?.clan_name)   headerLines.push('> ⚠️ Fill in **Clan Info** first before adding players.');

  const inner = [txt(headerLines.join('\n'))];
  if (error) inner.push(txt('> ❌  ' + error));
  if (info)  inner.push(txt('> ✅  ' + info));
  inner.push(SEP);

  // Player list
  if (filled > 0) {
    const sorted = [...players].sort((a, b) => a.slot - b.slot);
    const lines  = sorted.map(p =>
      (p.slot === 1 ? '👑' : ' •') + ' **#' + p.slot + '** ' + (p.name || '?') +
      (p.discord_user ? '  <@' + p.discord_user + '>' : '') +
      '  `' + (p.device || '?') + '`'
    );
    inner.push(txt(lines.join('\n')));
    inner.push(SEP);
  }

  inner.push({ type: 1, components: [
    btn('📝  Clan Info',  'fr_clan_info',  locked ? 2 : 1, locked),
    btn('➕  Add Player', 'fr_add_player', 1, !canAdd),
  ]});
  inner.push({ type: 1, components: [
    btn('✏️  Edit Player',   'fr_edit_player_start',   2, !canEdit),
    btn('❌  Remove Player', 'fr_remove_player_start', 4, !canEdit),
  ]});
  inner.push({ type: 1, components: [
    btn('👁️  View Roster', 'fr_preview', 2, !canPdf),
  ]});
  inner.push({ type: 1, components: [
    btn('✅  Submit',   'fr_submit',   isSubmitted ? 2 : 3, !canSub),
    btn('↩️  Unsubmit', 'fr_unsubmit', 2, !isSubmitted || locked),
  ]});


  return { flags: 32832, components: [{ type: 17, accent_color: 0x00FF8C, components: inner }] };
}

// ── LEADER: Pick Discord user step (live member select) ──────────────────────
function buildPickUserPanel(slot, opts = {}, memberOptions = []) {
  const { error } = opts;
  const inner = [];
  if (error) inner.push(txt('> ❌  ' + error));
  inner.push(SEP);
  if (memberOptions.length > 0) {
    inner.push({ type: 1, components: [{
      type: 3,
      custom_id: 'fr_pick_user_' + slot,
      placeholder: '👤 Select a member…',
      min_values: 1,
      max_values: 1,
      options: memberOptions,
    }]});
  } else {
    inner.push({ type: 1, components: [{
      type: 5,
      custom_id: 'fr_pick_user_' + slot,
      placeholder: '👤 Select a member…',
      min_values: 1,
      max_values: 1,
    }]});
  }

  return { flags: 32832, components: [{ type: 17, accent_color: 0x00FF8C, components: inner }] };
}

// ── LEADER: Edit player select ───────────────────────────────────────────────
function buildEditPlayerSelect(leaderId) {
  const roster  = getRoster(leaderId);
  const players = (roster?.players || []).sort((a, b) => a.slot - b.slot);
  if (!players.length) return buildLeaderDashboard(leaderId, { error: 'No players to edit.' });

  const inner = [
    { type: 1, components: [{
      type: 3,
      custom_id: 'fr_sel_edit_player',
      placeholder: 'Choose a player to edit…',
      options: players.map(p => ({
        label: '#' + p.slot + '  ' + (p.name || '(no name)'),
        description: (p.device || '') + (p.user_id ? '  •  ID: ' + p.user_id : ''),
        value: String(p.slot),
      })),
    }]},
  ];
  return { flags: 32832, components: [{ type: 17, accent_color: 0x00FF8C, components: inner }] };
}

// ── LEADER: Remove player select ─────────────────────────────────────────────
function buildRemovePlayerSelect(leaderId) {
  const roster  = getRoster(leaderId);
  const players = (roster?.players || []).sort((a, b) => a.slot - b.slot);
  if (!players.length) return buildLeaderDashboard(leaderId, { error: 'No players to remove.' });

  const inner = [
    { type: 1, components: [{
      type: 3,
      custom_id: 'fr_sel_remove_player',
      placeholder: 'Choose a player to remove…',
      options: players.map(p => ({
        label: '#' + p.slot + '  ' + (p.name || '(no name)'),
        description: (p.device || '') + (p.user_id ? '  •  ID: ' + p.user_id : ''),
        value: String(p.slot),
      })),
    }]},
  ];
  return { flags: 32832, components: [{ type: 17, accent_color: 0x00FF8C, components: inner }] };
}

// ── LEADER: Confirm remove ───────────────────────────────────────────────────
function buildConfirmRemove(leaderId, slot) {
  const roster = getRoster(leaderId);
  const player = (roster?.players || []).find(p => p.slot === slot);
  if (!player) return buildLeaderDashboard(leaderId, { error: 'Player not found.' });

  const inner = [
    txt(
      '**❌  Confirm Remove**\n' +
      '> Remove **' + (player.name || 'Player #' + slot) + '** from your roster?\n' +
      '> This cannot be undone.'
    ),
    SEP,
    { type: 1, components: [
      btn('Yes, Remove', 'fr_confirm_remove_' + slot, 4),
      btn('Cancel',      'fr_refresh',                2),
    ]},
  ];
  return { flags: 32832, components: [{ type: 17, accent_color: 0x00FF8C, components: inner }] };
}

// ── ADMIN: Main roster management panel ─────────────────────────────────────
const PAGE_SIZE = 8;

function buildAdminPanel(opts = {}) {
  const { page = 0, error, info } = opts;
  const cfg       = getRosterConfig();
  const rosters   = (db.get('fed_rosters') || []).sort((a, b) => (a.clan_name || '').localeCompare(b.clan_name || ''));
  const total     = rosters.length;
  const pages     = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p         = Math.min(Math.max(0, page), pages - 1);
  const slice     = rosters.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);
  const submitted = rosters.filter(r => r.status === 'submitted').length;
  const drafts    = rosters.filter(r => r.status === 'draft').length;

  const inner = [
    txt(
      '# 🏟️  Federation Roster Database\n' +
      '> **Clans:** ' + total + '  •  ✅ ' + submitted + ' submitted  •  📝 ' + drafts + ' draft\n' +
      '> **Max:** ' + cfg.maxPlayers + ' players  •  **Min to submit:** ' + cfg.minPlayers + '\n' +
      '> **Registration:** ' + (cfg.locked ? '🔒 Locked' : '🟢 Open')
    ),
  ];
  if (error) inner.push(txt('> ❌  ' + error));
  if (info)  inner.push(txt('> ✅  ' + info));
  inner.push(SEP);

  if (!total) {
    inner.push(txt('*No clans registered yet.*'));
  } else {
    const lines = slice.map(r => {
      const icon    = r.status === 'submitted' ? '✅' : '📝';
      const players = (r.players || []).length;
      return icon + '  **' + (r.clan_name || '?') + '**  `[' + (r.clan_tag || '?') + ']`' +
             '  —  ' + players + '/' + cfg.maxPlayers + '  •  <@' + r.leader_discord_id + '>';
    });
    inner.push(txt(lines.join('\n')));
  }

  inner.push(SEP);

  if (total > 0) {
    inner.push({ type: 1, components: [{
      type: 3,
      custom_id: 'fra_action_select',
      placeholder: '🔍 Select a clan to manage…',
      options: slice.map(r => ({
        label: (r.clan_name || 'Unknown') + '  [' + (r.clan_tag || '?') + ']',
        description: (r.status === 'submitted' ? '✅ Submitted' : '📝 Draft') + '  •  ' + (r.players || []).length + ' players',
        value: String(r.id),
      })),
    }]});
  }

  inner.push({ type: 1, components: [
    btn('⚙️  Settings', 'fra_settings', 2),
    btn('🔄  Refresh',  'fra_refresh',  2),
    btn(cfg.locked ? '🟢 Unlock All' : '🔒 Lock All', 'fra_toggle_lock', cfg.locked ? 3 : 4),
  ]});

  if (pages > 1) {
    inner.push({ type: 1, components: [
      btn('◀  Prev  (' + (p + 1) + '/' + pages + ')', 'fra_page_' + (p - 1), 2, p === 0),
      btn('Next ▶  (' + (p + 1) + '/' + pages + ')', 'fra_page_' + (p + 1), 2, p >= pages - 1),
    ]});
  }



  return { flags: 32768, components: [{ type: 17, accent_color: 0x00FF8C, components: inner }] };
}

// ── ADMIN: Clan detail view ──────────────────────────────────────────────────
function buildAdminClanView(rosterId, opts = {}) {
  const { error, info } = opts;
  const cfg    = getRosterConfig();
  const roster = (db.get('fed_rosters') || []).find(r => r.id === rosterId);
  if (!roster) return buildAdminPanel({ error: 'Clan not found.' });

  const players = (roster.players || []).sort((a, b) => a.slot - b.slot);
  const filled  = players.length;

  const headerLines = [
    '## 🏟️  ' + (roster.clan_name || 'Unknown') + '  `[' + (roster.clan_tag || '?') + ']`',
    '> **Status:** ' + (roster.status === 'submitted' ? '✅ Submitted' : '📝 Draft') +
      '  •  **Players:** ' + filled + '/' + cfg.maxPlayers,
    '> **Leader:** <@' + roster.leader_discord_id + '>',
  ];
  if (roster.social_media) headerLines.push('> **Social:** ' + roster.social_media);
  if (roster.logo_url)     headerLines.push('> **Logo:** ' + roster.logo_url);

  const inner = [txt(headerLines.join('\n'))];
  if (error) inner.push(txt('> ❌  ' + error));
  if (info)  inner.push(txt('> ✅  ' + info));
  inner.push(SEP);

  if (players.length) {
    const lines = players.map(p =>
      (p.slot === 1 ? '👑' : ' •') + ' **#' + p.slot + '** ' + (p.name || '?') +
      (p.discord_user ? '  <@' + p.discord_user + '>' : '') +
      '  `' + (p.device || '?') + '`  `' + (p.user_id || '?') + '`'
    );
    inner.push(txt(lines.join('\n')));
    inner.push(SEP);
  }

  const accentColor = roster.status === 'submitted' ? 0x57F287 : 0xFEE75C;

  inner.push({ type: 1, components: [
    btn(roster.status === 'submitted' ? '↩️  Mark Draft' : '✅  Mark Submitted', 'fra_toggle_submit_' + rosterId, 2),
  ]});
  inner.push({ type: 1, components: [
    btn('🗑️  Remove Clan', 'fra_remove_' + rosterId, 4),
    btn('◄  Back',         'fra_refresh',             2),
  ]});

  return { flags: 32768, components: [{ type: 17, accent_color: accentColor, components: inner }] };
}

// ── ADMIN: Settings panel ────────────────────────────────────────────────────
function buildAdminSettings(opts = {}) {
  const { error, info } = opts;
  const cfg = getRosterConfig();

  const inner = [
    txt(
      '## ⚙️  Roster Settings\n' +
      '> **Max players per clan:** ' + cfg.maxPlayers + '\n' +
      '> **Min players to submit:** ' + cfg.minPlayers + '\n' +
      '> **Clan Leader role:** ' + (cfg.leaderRoleId ? '<@&' + cfg.leaderRoleId + '>' : '*Not set*') + '\n' +
      '> **Registration:** ' + (cfg.locked ? '🔒 Locked' : '🟢 Open')
    ),
  ];
  if (error) inner.push(txt('> ❌  ' + error));
  if (info)  inner.push(txt('> ✅  ' + info));
  inner.push(SEP);
  inner.push({ type: 1, components: [
    btn('👥  Set Max Players', 'fra_set_max', 2),
    btn('✅  Set Min Players', 'fra_set_min', 2),
  ]});
  inner.push({ type: 1, components: [{
    type: 6,
    custom_id: 'fra_set_leader_role',
    placeholder: '👑 Set Clan Leader role…',
    min_values: 0,
    max_values: 1,
  }]});
  inner.push(SEP);
  inner.push({ type: 1, components: [btn('◄  Back', 'fra_refresh', 2)] });

  return { flags: 32768, components: [{ type: 17, accent_color: 0x00FF8C, components: inner }] };
}

// ── ADMIN: Confirm remove ────────────────────────────────────────────────────
function buildAdminConfirmRemove(rosterId) {
  const roster = (db.get('fed_rosters') || []).find(r => r.id === rosterId);
  if (!roster) return buildAdminPanel({ error: 'Clan not found.' });

  const inner = [
    txt(
      '**🗑️  Confirm Remove**\n' +
      '> Remove **' + (roster.clan_name || '?') + '** and all their player data?\n' +
      '> The clan Discord role will also be deleted.\n' +
      '> **This cannot be undone.**'
    ),
    SEP,
    { type: 1, components: [
      btn('Yes, Remove', 'fra_confirm_remove_' + rosterId, 4),
      btn('Cancel',      'fra_refresh',                    2),
    ]},
  ];
  return { flags: 32768, components: [{ type: 17, accent_color: 0x00FF8C, components: inner }] };
}

module.exports = {
  getRosterConfig, getRoster,
  buildRosterLauncher, buildLeaderDashboard, buildPickUserPanel,
  buildEditPlayerSelect, buildRemovePlayerSelect, buildConfirmRemove,
  buildAdminPanel, buildAdminClanView, buildAdminSettings, buildAdminConfirmRemove,
};
