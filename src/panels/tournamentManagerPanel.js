'use strict';
const { db } = require('../utils/database');

const SEP  = { type: 14, divider: true, spacing: 1 };
const txt  = c => ({ type: 10, content: c });
const btn  = (label, id, style, emoji) => ({ type: 2, style, label, custom_id: id, emoji: { name: emoji } });

// ── Tournament list panel ─────────────────────────────────────────────────────
function buildTournamentListPanel() {
  const all = db.get('tournaments').sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const inner = [
    txt('# 🗂️  Tournament Manager\nPick a tournament to manage, or create a new one.'),
    SEP,
  ];

  if (!all.length) {
    inner.push(txt('No tournaments yet. Create one to get started.'));
    inner.push(SEP);
  } else {
    // Chunk into rows of 4
    for (let i = 0; i < all.length && i < 20; i += 4) {
      const chunk = all.slice(i, i + 4);
      inner.push({
        type: 1,
        components: chunk.map(t => ({
          type: 2,
          style: t.status === 'active' ? 1 : 2,
          label: `${t.template} S${t.season}`,
          custom_id: `tmgr_t_${t.id}`,
          emoji: { name: t.status === 'active' ? '🟢' : t.status === 'finished' ? '🔒' : '⚙️' },
        })),
      });
    }
    inner.push(SEP);
  }

  inner.push({
    type: 1,
    components: [
      btn('New MCL Season',  'tmgr_new_MCL',  3, '⚡'),
      btn('New NSEL Season', 'tmgr_new_NSEL', 3, '🏆'),
    ],
  });
  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));
  inner.push(SEP);

  return { flags: 32768, components: [{ type: 17, accent_color: 0x2b2d31, components: inner }] };
}

// ── Tournament sub-panel ──────────────────────────────────────────────────────
function buildTournamentSubPanel(tournamentId) {
  const t = db.findById('tournaments', tournamentId);
  if (!t) return buildTournamentListPanel();

  const enrolled = db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId);
  const matches  = db.get('matches').filter(m => m.tournament_id === tournamentId);
  const pending  = matches.filter(m => m.status === 'pending');
  const played   = matches.filter(m => m.status === 'played');
  const hasGroups = enrolled.some(tt => tt.group_name);
  const finished  = t.status === 'finished';

  const statusLabel = { setup: '⚙️ Setup', active: '🟢 Active', finished: '🔒 Finished' }[t.status] || t.status;
  const pendingRounds = [...new Set(pending.map(m => m.round))].sort((a, b) => a - b);
  const currentRound  = pendingRounds[0] ? `Round ${pendingRounds[0]}` : '—';

  const inner = [
    txt(
      `# ${t.template} Season ${t.season}  —  ${t.name}\n` +
      `${statusLabel}  ·  Teams **${enrolled.length}/${t.team_count || '?'}**  ·  ` +
      `Played **${played.length}**  ·  Pending **${pending.length}**  ·  Current Round **${currentRound}**`
    ),
    SEP,
    // Row 1
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: 'Add Teams',    custom_id: `tmgr_addteams_${tournamentId}`,   emoji: { name: '👥' }, disabled: finished },
        { type: 2, style: 2, label: 'Add Player',   custom_id: `tmgr_addplayer_${tournamentId}`,  emoji: { name: '👤' }, disabled: finished || !enrolled.length },
        { type: 2, style: 2, label: 'Draw Groups',  custom_id: `tmgr_drawgroups_${tournamentId}`, emoji: { name: '🎲' }, disabled: finished || enrolled.length < 2 },
        { type: 2, style: 2, label: 'Gen Matches',  custom_id: `tmgr_genmatches_${tournamentId}`, emoji: { name: '📅' }, disabled: finished || !hasGroups },
      ],
    },
    // Row 2
    {
      type: 1,
      components: [
        { type: 2, style: 3, label: 'Post Schedule', custom_id: `tmgr_postschedule_${tournamentId}`, emoji: { name: '📤' }, disabled: !pending.length },
        { type: 2, style: 3, label: 'Add Result',    custom_id: `tmgr_addresult_${tournamentId}`,    emoji: { name: '📊' }, disabled: !pending.length },
        { type: 2, style: 1, label: 'Knockout',      custom_id: `tmgr_knockout_${tournamentId}`,     emoji: { name: '🏆' }, disabled: finished || !!pending.find(m => m.stage === 'group') },
        { type: 2, style: 4, label: 'Close Season',  custom_id: `tmgr_closeseason_${tournamentId}`,  emoji: { name: '🔒' }, disabled: finished },
      ],
    },
    // Row 3
    {
      type: 1,
      components: [
        { type: 2, style: 2, label: '◀ Back to List', custom_id: 'tmgr_back',                emoji: { name: '◀️' } },
        { type: 2, style: 2, label: 'Refresh',         custom_id: `tmgr_refresh_${tournamentId}`, emoji: { name: '🔄' } },
      ],
    },
    SEP,
    txt('-# © 24 2026  |  Goatsi Bot'),
    SEP,
  ];

  return { flags: 32768, components: [{ type: 17, accent_color: t.status === 'active' ? 0x00C853 : t.status === 'finished' ? 0x95A5A6 : 0x5865F2, components: inner }] };
}

// ── Add-result match picker view ──────────────────────────────────────────────
function buildMatchPickerPanel(tournamentId) {
  const t       = db.findById('tournaments', tournamentId);
  const matches = db.get('matches').filter(m => m.tournament_id === tournamentId && m.status === 'pending');
  const teams   = db.get('teams');
  const getTeam = id => teams.find(t => t.id === id) || { name: 'Unknown' };

  const inner = [
    txt(`**📊 Add Result — ${t?.name || 'Tournament'}**\nSelect a match from the list below.`),
    SEP,
  ];

  if (!matches.length) {
    inner.push(txt('✅ No pending matches.'));
  } else {
    inner.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: `tmgr_match_sel_${tournamentId}`,
        placeholder: 'Pick a match...',
        options: matches.slice(0, 25).map(m => ({
          label: `${getTeam(m.home_team_id).name} vs ${getTeam(m.away_team_id).name}`,
          value: String(m.id),
          description: `${m.stage} · Round ${m.round}`,
        })),
      }],
    });
  }

  inner.push(SEP);
  inner.push({ type: 1, components: [{ type: 2, style: 2, label: '◀ Back', custom_id: `tmgr_t_${tournamentId}`, emoji: { name: '◀️' } }] });
  inner.push(SEP);
  inner.push(txt('-# © 24 2026  |  Goatsi Bot'));
  inner.push(SEP);

  return { flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: inner }] };
}

// ── Team search results view ──────────────────────────────────────────────────
function buildTeamSearchResultsPanel(tournamentId, teams) {
  const inner = [
    txt(`**👥 Enroll a Team — Select one to add**`),
    SEP,
  ];

  if (!teams.length) {
    inner.push(txt('No teams matched your search.'));
  } else {
    inner.push({
      type: 1,
      components: [{
        type: 3,
        custom_id: `tmgr_enroll_sel_${tournamentId}`,
        placeholder: 'Select team to enroll...',
        options: teams.slice(0, 25).map(t => ({
          label: t.name,
          value: String(t.id),
          description: `${t.short_name || ''} ${t.category || ''}`.trim() || t.name,
        })),
      }],
    });
  }

  inner.push(SEP);
  inner.push({ type: 1, components: [{ type: 2, style: 2, label: '◀ Back', custom_id: `tmgr_t_${tournamentId}`, emoji: { name: '◀️' } }] });
  inner.push(SEP);

  return { flags: 32768, components: [{ type: 17, accent_color: 0x2b2d31, components: inner }] };
}

module.exports = {
  buildTournamentListPanel,
  buildTournamentSubPanel,
  buildMatchPickerPanel,
  buildTeamSearchResultsPanel,
};
