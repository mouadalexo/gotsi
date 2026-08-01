'use strict';
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db }                = require('../utils/database');
const https                 = require('https');
const http                  = require('http');
const fs                    = require('fs');
const path                  = require('path');

const LOGO_CACHE_DIR = path.join(__dirname, '../../assets/clan_logos');

// Download a logo URL and save it to disk; silently skips on error
async function downloadAndCacheLogo(rosterId, logoUrl) {
  if (!logoUrl || !rosterId) return;
  try {
    if (!fs.existsSync(LOGO_CACHE_DIR)) fs.mkdirSync(LOGO_CACHE_DIR, { recursive: true });
    const destPath = path.join(LOGO_CACHE_DIR, rosterId + '.img');
    await new Promise((resolve, reject) => {
      function get(url, redirects) {
        if (redirects > 5) return reject(new Error('too many redirects'));
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return get(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) { res.resume(); return reject(new Error('status ' + res.statusCode)); }
          const out = fs.createWriteStream(destPath);
          res.pipe(out);
          out.on('finish', resolve);
          out.on('error', reject);
        }).on('error', reject);
      }
      get(logoUrl, 0);
    });
  } catch (e) {
    console.error('[FED] Logo cache download failed id=' + rosterId + ':', e.message);
  }
}
const { isBotolaManager }   = require('../utils/permissions');
const { generateRosterPng } = require('./fedRosterPng');
const {
  getRosterConfig, getRoster, getRosterForMember,
  buildLeaderDashboard, buildCreateClanPanel, buildPickUserPanel, buildSearchPanel,
  buildEditPlayerSelect, buildRemovePlayerSelect,
  buildConfirmRemove, buildReorderPanel,
  buildAdminPanel, buildAdminClanView,
  buildAdminSettings, buildAdminConfirmRemove,
} = require('./fedRosterPanel');

// Tracks the last ephemeral preview message ID per user so it can be replaced
const _previewMsgIds = new Map();

// Safety: renumber players 1..N by slot order, eliminating any gaps or duplicates
function compactSlots(players) {
  const seen = new Map();
  for (const p of (players || [])) seen.set(p.slot, p); // last write wins on duplicate slot
  return [...seen.values()]
    .sort((a, b) => a.slot - b.slot)
    .map((p, i) => ({ ...p, slot: i + 1 }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function noPerm(i) {
  return i.reply({ content: '❌ You do not have permission to do that.', ephemeral: true });
}

function isLeader(member) {
  const cfg = getRosterConfig();
  if (cfg.leaderRoleId && member.roles.cache.has(cfg.leaderRoleId)) return true;
  if (cfg.coLeaderRoleId && member.roles.cache.has(cfg.coLeaderRoleId)) return true;
  // Fallback: check DB directly (covers co-leaders who were assigned before role was given)
  return getRosterForMember(member.id) !== null;
}

// Returns roster if field/value is already used in another clan (or another slot of same clan)
function uniqueCheck(excludeRosterId, excludeSlot, field, value) {
  const rosters = db.get('Clan_Registry') || [];
  const norm    = v => String(v || '').toLowerCase().trim();
  const target  = norm(value);
  if (!target) return null;
  for (const r of rosters) {
    for (const p of (r.players || [])) {
      if (r.id === excludeRosterId && p.slot === excludeSlot) continue;
      if (norm(p[field]) === target) return r;
    }
  }
  return null;
}

// Get all discord user IDs already registered this season
function getRegisteredDiscordIds(excludeRosterId) {
  const fed     = db.getConfig('federation') || {};
  const season  = fed.season || 1;
  const rosters = db.get('Clan_Registry') || [];
  const ids     = new Set();
  for (const r of rosters) {
    if (r.id === excludeRosterId) continue;
    // Exclude leader
    const lid = String(r.leader_discord_id || '').trim();
    if (lid) ids.add(lid);
    // Exclude co-leaders
    for (const cid of (r.co_leaders || [])) {
      const c = String(cid || '').trim();
      if (c) ids.add(c);
    }
    // Exclude players
    for (const p of (r.players || [])) {
      const uid = String(p.discord_user || '').replace(/\D/g, '');
      if (uid) ids.add(uid);
    }
  }
  return ids;
}


// Return assignment info for a Discord user ID (null if free)
function getUserAssignmentInfo(discordId) {
  const id      = String(discordId || '').trim();
  if (!id) return null;
  const rosters = db.get('Clan_Registry') || [];
  for (const r of rosters) {
    const lid = String(r.leader_discord_id || '').trim();
    if (lid === id) return { role: 'Leader', clan: r.clan_name || 'a clan' };
    for (const c of (r.co_leaders || [])) {
      if (String(c || '').trim() === id) return { role: 'Co-Leader', clan: r.clan_name || 'a clan' };
    }
    for (const p of (r.players || [])) {
      const uid = String(p.discord_user || '').replace(/\D/g, '');
      if (uid === id) return { role: 'Player', clan: r.clan_name || 'a clan', name: p.name };
    }
  }
  return null;
}

// Build clan info modal (4 fields: name, tag, social, logo)
function buildClanInfoModal(roster, hidelogo = false) {
  const m = new ModalBuilder().setCustomId('fr_modal_clan_info').setTitle('Clan Information');
  const row = f => new ActionRowBuilder().addComponents(f);
  const ti  = (id, label, ph, val, required = true) =>
    new TextInputBuilder().setCustomId(id).setLabel(label)
      .setStyle(TextInputStyle.Short).setPlaceholder(ph)
      .setRequired(required).setValue(val || '');
  const rows = [
    row(ti('clan_name',    'Clan Name',    '',      roster?.clan_name    || '')),
    row(ti('clan_tag',     'Clan Tag',     '',      roster?.clan_tag     || '')),
    row(ti('social_media', 'Social Media', '@...', roster?.social_media || '', false)),
  ];
  if (!hidelogo) rows.push(row(ti('logo_url', 'Clan Logo URL', 'Use Imgur/direct link — Discord links expire!', roster?.logo_url || '', false)));
  m.addComponents(...rows);
  return m;
}

// Build add-player modal (step 2 of 2 — discord user already selected)
// customId = fr_modal_add_player_<slot>|<discordUserId>
function buildAddPlayerModal(slot, discordUserId, existing = null) {
  const cid = 'fr_modal_add_player_' + slot + '|' + (discordUserId || '');
  const m   = new ModalBuilder().setCustomId(cid).setTitle('Add Player #' + slot + ' — Step 2 of 2');
  const row = f => new ActionRowBuilder().addComponents(f);
  const ti  = (id, label, ph, val, required = true) =>
    new TextInputBuilder().setCustomId(id).setLabel(label)
      .setStyle(TextInputStyle.Short).setPlaceholder(ph)
      .setRequired(required).setValue(val || '');
  m.addComponents(
    row(ti('name',          'Player Name',     '',           existing?.name          || '')),
    row(ti('device',        'Device',          'e.g. iPhone 13 Pro',       existing?.device        || '')),
    row(ti('user_id',       'In-Game User ID', 'e.g. ASMN-034-912-924',      existing?.user_id       || '')),
    row(ti('serial_number', 'Serial Number',   'e.g. GV8G94MALMK1',        existing?.serial_number || '')),
  );
  return m;
}

// Build edit-player modal (all fields editable, discord_user as text)
function buildEditPlayerModal(slot, existing) {
  const m = new ModalBuilder()
    .setCustomId('fr_modal_edit_player_' + slot)
    .setTitle('Edit Player #' + slot);
  const row = f => new ActionRowBuilder().addComponents(f);
  const ti  = (id, label, ph, val, required = true) =>
    new TextInputBuilder().setCustomId(id).setLabel(label)
      .setStyle(TextInputStyle.Short).setPlaceholder(ph)
      .setRequired(required).setValue(val || '');
  m.addComponents(
    row(ti('name',          'Player Name',             '',            existing?.name          || '')),
    row(ti('device',        'Device',                  'e.g. iPhone 13 Pro',        existing?.device        || '')),
    row(ti('user_id',       'In-Game User ID',         'e.g. ASMN-034-912-924',       existing?.user_id       || '')),
    row(ti('serial_number', 'Serial Number',           'e.g. GV8G94MALMK1',         existing?.serial_number || '')),
  );
  return m;
}

// ── Main handler ─────────────────────────────────────────────────────────────
async function handleFedRosterInteraction(interaction, client) {
  const id  = interaction.customId || '';
  const mid = interaction.member?.id;

  // Resolve effective leader ID — DB-only, never role-based.
  // If this user is a co-leader their eid = their clan's main leader_discord_id.
  // All fr_ handlers use eid so co-leaders are always locked to their own clan.
  const _eidRoster = getRosterForMember(mid);
  const eid = _eidRoster ? _eidRoster.leader_discord_id : mid;

  try {

  // ═══════════════════════════════════════════════════════════════════════════
  // LEADER INTERACTIONS  (prefix: fr_)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Open ephemeral dashboard ─────────────────────────────────────────────
  if (id === 'fr_open') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    // Delete the launcher message immediately
    await interaction.message.delete().catch(() => {});
    const _openRoster = getRoster(eid);
    if (!_openRoster) {
      // First time: open modal directly (no logo field)
      return interaction.showModal(buildClanInfoModal(null, true));
    }
    // Refresh leader_name only when the MAIN leader opens (not co-leaders)
    if (mid === eid) {
      const _lName = interaction.member.displayName || interaction.member.user?.username || '';
      if (_lName && _openRoster.leader_name !== _lName) {
        db.update('Clan_Registry', _openRoster.id, { leader_name: _lName });
      }
    }
    // ── Self-repair: create Discord role if missing (e.g. creation failed at registration)
    if (_openRoster.clan_name && !_openRoster.clan_role_id) {
      try {
        const _cg2    = interaction.guild;
        const _mefId2 = db.getConfig('fed_roster_mef_role_id') || null;
        const _ctag2  = _openRoster.clan_tag || _openRoster.clan_name.slice(0, 5).toUpperCase();
        const _nr2    = await _cg2.roles.create({ name: _ctag2, colors: 0x00FFAC,
          reason: 'MEF Federation: ' + _openRoster.clan_name + ' [' + _ctag2 + '] (auto-repair)' });
        const _pr2 = await _cg2.roles.fetch(db.getConfig('fed_roster_leader_role_id') || '1529939782233227365').catch(() => null);
        if (_pr2 && _pr2.position > 1) await _nr2.setPosition(_pr2.position - 1).catch(() => {});
        db.update('Clan_Registry', _openRoster.id, { clan_role_id: _nr2.id });
        const _lm2 = await _cg2.members.fetch(eid).catch(() => null);
        if (_lm2) {
          await _lm2.roles.add(_nr2.id).catch(() => {});
          if (_mefId2) await _lm2.roles.add(_mefId2).catch(() => {});
        }
      } catch (_re) { console.error('[FedRoster] Role auto-repair failed:', _re.message); }
    }
    return interaction.reply(buildLeaderDashboard(eid));
  }

  // ── Refresh dashboard ────────────────────────────────────────────────────
  if (id === 'fr_refresh') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    return interaction.update(buildLeaderDashboard(eid));
  }

  // ── Clan Info modal open ─────────────────────────────────────────────────
  if (id === 'fr_clan_info') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const cfg = getRosterConfig();
    if (cfg.locked) return interaction.reply({ content: '🔒 Registration is locked.', ephemeral: true });
    const roster = getRoster(eid);
    return interaction.showModal(buildClanInfoModal(roster));
  }

  // ── Clan Info modal submit ───────────────────────────────────────────────
  if (id === 'fr_modal_clan_info') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const _isFirstTime = !getRoster(eid);
    const cfg = getRosterConfig();
    if (cfg.locked) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Registration is locked.' }));
    }
    const clan_name    = interaction.fields.getTextInputValue('clan_name').trim();
    const clan_tag     = interaction.fields.getTextInputValue('clan_tag').trim().toUpperCase();
    const social_media = interaction.fields.getTextInputValue('social_media').trim();
    let logo_url = ''; try { logo_url = interaction.fields.getTextInputValue('logo_url').trim(); } catch (_) {}

    if (!clan_name) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Clan name is required.' }));
    }

    // Hard dedup: always re-fetch right before insert to prevent double-submit race
    let roster = getRoster(eid);
    const fed    = db.getConfig('federation') || {};
    if (roster) {
      db.update('Clan_Registry', roster.id, { clan_name, clan_tag, social_media, logo_url, updated_at: new Date().toISOString() });
      if (logo_url && logo_url !== roster.logo_url) downloadAndCacheLogo(roster.id, logo_url);
      // Rename Discord role if tag changed
      if (clan_tag && clan_tag !== roster.clan_tag && roster.clan_role_id) {
        try {
          const _tagRole = await interaction.guild.roles.fetch(roster.clan_role_id).catch(() => null);
          if (_tagRole) await _tagRole.setName(clan_tag).catch(() => {});
        } catch (_) {}
      }
    } else {
      // Re-check inside the else to guard against concurrent submits
      const _doubleCheck = (db.get('Clan_Registry') || []).find(r => r.leader_discord_id === mid);
      if (_doubleCheck) {
        db.update('Clan_Registry', _doubleCheck.id, { clan_name, clan_tag, social_media, logo_url, updated_at: new Date().toISOString() });
        if (logo_url && logo_url !== _doubleCheck.logo_url) downloadAndCacheLogo(_doubleCheck.id, logo_url);
      } else {
        const _ldName = interaction.member.displayName || interaction.member.user?.username || '';
        const newRoster = db.insert('Clan_Registry', {
          guild_id: interaction.guild.id,
          leader_discord_id: eid,
          leader_name: _ldName,
          clan_name, clan_tag, social_media, logo_url,
          players: [],
          co_leaders: [],
          status: 'draft',
          clan_role_id: null,
          season: fed.season || 1,
          updated_at: new Date().toISOString(),
        });
        if (logo_url && newRoster?.id) downloadAndCacheLogo(newRoster.id, logo_url);
        // Create clan Discord role + auto-add leader as Player #1
        if (newRoster?.id) {
          const _cg = interaction.guild;
          const _mefId = db.getConfig('fed_roster_mef_role_id') || null;
          const _ctag  = clan_tag || clan_name.slice(0, 5).toUpperCase();
          let _crId = null;
          try {
            const _nr = await _cg.roles.create({ name: _ctag, colors: 0x00FFAC,
              reason: 'MEF Federation: ' + clan_name + ' [' + _ctag + ']' });
            const _pr = await _cg.roles.fetch(db.getConfig('fed_roster_leader_role_id') || '1529939782233227365').catch(() => null);
            if (_pr && _pr.position > 1) await _nr.setPosition(_pr.position - 1).catch(() => {});
            _crId = _nr.id;
          } catch (_e) { console.error('[FedRoster] Role create error:', _e.message); }
          let _lun = '';
          try {
            const _lm = await _cg.members.fetch(eid).catch(() => null);
            if (_lm) _lun = _lm.user.username;
          } catch (_) {}
          db.update('Clan_Registry', newRoster.id, {
            clan_role_id: _crId,
            players: [{ slot: 1, name: _ldName, discord_user: eid,
              discord_username: _lun, device: '', user_id: '', serial_number: '' }],
          });
          try {
            const _lm2 = await _cg.members.fetch(eid).catch(() => null);
            if (_lm2) {
              if (_crId)   await _lm2.roles.add(_crId).catch(() => {});
              if (_mefId)  await _lm2.roles.add(_mefId).catch(() => {});
            }
          } catch (_) {}
        }
      }
    }
    if (_isFirstTime) {
      await interaction.deferReply({ ephemeral: true });
    } else {
      await interaction.deferUpdate();
    }
    return interaction.editReply(buildLeaderDashboard(eid, { info: 'Clan info saved.' }));
  }

  // ── Add Player: step 1 — show multi-select Discord user select ──────────────
  if (id === 'fr_add_player') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const cfg = getRosterConfig();
    if (cfg.locked) return interaction.reply({ content: '🔒 Registration is locked.', ephemeral: true });
    const roster = getRoster(eid);
    if (!roster?.clan_name) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Fill in Clan Info before adding players.' }));
    }
    const players    = roster.players || [];
    const emptySlots = cfg.maxPlayers - players.length;
    if (emptySlots <= 0) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Roster is full (' + cfg.maxPlayers + ' players max).' }));
    }
    await interaction.deferUpdate();
    return interaction.editReply(buildPickUserPanel(emptySlots));
  }

  // ── Add Player: members selected — add directly, no form ────────────────────
  if (id === 'fr_pick_user') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    await interaction.deferUpdate();
    const cfg       = getRosterConfig();
    const roster    = getRoster(eid);
    if (!roster) return interaction.editReply(buildLeaderDashboard(eid, { error: 'Set Clan Info first.' }));
    const players   = roster.players || [];
    const added     = [];
    const skipped   = [];
    // Always base next slot on the highest existing slot, not player count
    // (count can differ from max slot if gaps ever exist)
    let   nextSlot  = players.length > 0 ? Math.max(...players.map(p => p.slot)) + 1 : 1;

    for (const discordUserId of interaction.values) {
      const assign      = getUserAssignmentInfo(discordUserId);
      const isOwnLeader = String(roster.leader_discord_id || '') === String(discordUserId);
      const isOwnCoLead = (roster.co_leaders || []).map(c => String(c)).includes(String(discordUserId));
      const isOwnClan   = isOwnLeader || isOwnCoLead;
      if (assign && !isOwnClan) {
        skipped.push('<@' + discordUserId + '> (already in **' + assign.clan + '**)');
        continue;
      }
      // Check not already in this clan's player list
      if (players.some(p => String(p.discord_user || '') === String(discordUserId))) {
        skipped.push('<@' + discordUserId + '> (already in your roster)');
        continue;
      }
      let discord_username = '';
      let defaultName = '';
      try {
        const mem = interaction.guild.members.cache.get(discordUserId)
          || await interaction.guild.members.fetch(discordUserId).catch(() => null);
        if (mem) {
          discord_username = mem.user.username;
          defaultName = mem.displayName || mem.user.globalName || mem.user.username || '';
        }
      } catch (_) {}

      players.push({ slot: nextSlot, name: defaultName, discord_user: discordUserId, discord_username, device: '', user_id: '', serial_number: '' });
      added.push('<@' + discordUserId + '>');
      nextSlot++;
    }

    db.update('Clan_Registry', roster.id, { players: compactSlots(players), updated_at: new Date().toISOString() });

    if (!added.length) {
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'No players added — ' + skipped.join(', ') + '.' }));
    }
    // Assign clan role + MEF role to newly added players
    const _addR = getRoster(eid);
    const _addC = _addR?.clan_role_id || null;
    const _addM = db.getConfig('fed_roster_mef_role_id') || null;
    if (_addC || _addM) {
      for (const _addUid of interaction.values) {
        try {
          const _am = interaction.guild.members.cache.get(_addUid)
            || await interaction.guild.members.fetch(_addUid).catch(() => null);
          if (_am) {
            if (_addC) await _am.roles.add(_addC).catch(() => {});
            if (_addM) await _am.roles.add(_addM).catch(() => {});
          }
        } catch (_) {}
      }
    }
    const info  = added.length + ' player(s) added: ' + added.join(', ') + '.';
    const error = skipped.length ? skipped.join(', ') + ' were skipped.' : null;
    return interaction.editReply(buildLeaderDashboard(eid, { info, error }));
  }

  // ── Add Player: step 2 modal submit ─────────────────────────────────────
  if (id.startsWith('fr_modal_add_player_')) {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const rest      = id.replace('fr_modal_add_player_', '');
    const pipeIdx   = rest.indexOf('|');
    const slot      = parseInt(pipeIdx >= 0 ? rest.slice(0, pipeIdx) : rest);
    const discordUserId = pipeIdx >= 0 ? rest.slice(pipeIdx + 1) : null;

    const cfg    = getRosterConfig();
    if (cfg.locked) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Registration is locked.' }));
    }
    const roster = getRoster(eid);
    if (!roster) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Set Clan Info first.' }));
    }

    const name          = interaction.fields.getTextInputValue('name').trim();
    const device        = interaction.fields.getTextInputValue('device').trim();
    const user_id       = interaction.fields.getTextInputValue('user_id').trim();
    const serial_number = interaction.fields.getTextInputValue('serial_number').trim();

    // Uniqueness checks across the entire federation
    const dupeUserId = uniqueCheck(roster.id, slot, 'user_id', user_id);
    if (dupeUserId) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'In-Game User ID **' + user_id + '** is already registered in **' + (dupeUserId.clan_name || 'another clan') + '**.' }));
    }
    const dupeSerial = uniqueCheck(roster.id, slot, 'serial_number', serial_number);
    if (dupeSerial) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Serial Number **' + serial_number + '** is already registered in **' + (dupeSerial.clan_name || 'another clan') + '**.' }));
    }
    if (discordUserId) {
      const dupeDiscord = getRegisteredDiscordIds(roster.id);
      if (dupeDiscord.has(discordUserId)) {
        await interaction.deferUpdate();
        return interaction.editReply(buildLeaderDashboard(eid, { error: '<@' + discordUserId + '> is already registered in another clan.' }));
      }
    }

    const players   = roster.players || [];
    const existing  = players.find(p => p.slot === slot);
    // Resolve Discord username from guild cache for display
    let discord_username = '';
    if (discordUserId) {
      try {
        const mem = interaction.guild.members.cache.get(discordUserId)
          || await interaction.guild.members.fetch(discordUserId).catch(() => null);
        if (mem) discord_username = mem.user.username;
      } catch (_) {}
    }
    const newPlayer = { slot, name, discord_user: discordUserId || '', discord_username, device, user_id, serial_number };

    if (existing) {
      db.update('Clan_Registry', roster.id, {
        players: compactSlots(players.map(p => p.slot === slot ? newPlayer : p)),
        updated_at: new Date().toISOString(),
      });
    } else {
      db.update('Clan_Registry', roster.id, {
        players: compactSlots([...players, newPlayer]),
        updated_at: new Date().toISOString(),
      });
    }
    await interaction.deferUpdate();
    return interaction.editReply(buildLeaderDashboard(eid, { info: 'Player #' + slot + ' — **' + name + '** added.' }));
  }

  // ── Edit Player: select ──────────────────────────────────────────────────
  // ── Reorder players ────────────────────────────────────────────────────────────────────────────
  if (id === 'fr_reorder_start') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    await interaction.deferUpdate();
    return interaction.editReply(buildReorderPanel(eid));
  }

  if (id === 'fr_reorder_sel') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const slot = parseInt(interaction.values[0]);
    await interaction.deferUpdate();
    return interaction.editReply(buildReorderPanel(eid, slot));
  }

  if (id.startsWith('fr_reorder_up_') || id.startsWith('fr_reorder_down_')) {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const isUp   = id.startsWith('fr_reorder_up_');
    const slot   = parseInt(isUp ? id.replace('fr_reorder_up_', '') : id.replace('fr_reorder_down_', ''));
    const roster = getRoster(eid);
    if (!roster) { await interaction.deferUpdate(); return interaction.editReply(buildReorderPanel(eid)); }
    let players  = roster.players || [];
    const sorted = [...players].sort((a, b) => a.slot - b.slot);
    const idx    = sorted.findIndex(p => p.slot === slot);
    const swapIdx = isUp ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) {
      await interaction.deferUpdate();
      return interaction.editReply(buildReorderPanel(eid, slot));
    }
    const slotA = sorted[idx].slot;
    const slotB = sorted[swapIdx].slot;
    players = players.map(p => {
      if (p.slot === slotA) return { ...p, slot: slotB };
      if (p.slot === slotB) return { ...p, slot: slotA };
      return p;
    });
    db.update('Clan_Registry', roster.id, { players });
    await interaction.deferUpdate();
    return interaction.editReply(buildReorderPanel(eid, slotB));
  }

    if (id === 'fr_edit_player_start') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    await interaction.deferUpdate();
    return interaction.editReply(buildEditPlayerSelect(eid));
  }

  if (id === 'fr_sel_edit_player') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const slot   = parseInt(interaction.values[0]);
    const roster = getRoster(eid);
    const player = (roster?.players || []).find(p => p.slot === slot);
    if (!player) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Player not found.' }));
    }
    return interaction.showModal(buildEditPlayerModal(slot, player));
  }

  // ── Edit Player: modal submit ────────────────────────────────────────────
  if (id.startsWith('fr_modal_edit_player_')) {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const slot = parseInt(id.replace('fr_modal_edit_player_', ''));
    const cfg  = getRosterConfig();
    if (cfg.locked) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Registration is locked.' }));
    }
    const roster = getRoster(eid);
    if (!roster) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid));
    }

    const name          = interaction.fields.getTextInputValue('name').trim();
    const device        = interaction.fields.getTextInputValue('device').trim();
    const user_id       = interaction.fields.getTextInputValue('user_id').trim();
    const serial_number = interaction.fields.getTextInputValue('serial_number').trim();

    const dupeUserId = uniqueCheck(roster.id, slot, 'user_id', user_id);
    if (dupeUserId) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'User ID **' + user_id + '** is already registered in **' + (dupeUserId.clan_name || 'another clan') + '**.' }));
    }
    const dupeSerial = uniqueCheck(roster.id, slot, 'serial_number', serial_number);
    if (dupeSerial) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Serial Number **' + serial_number + '** is already registered in **' + (dupeSerial.clan_name || 'another clan') + '**.' }));
    }

    // Keep existing discord_user from DB — not editable via form
    const players    = roster.players || [];
    const _existing  = players.find(p => p.slot === slot);
    const discord_user = _existing?.discord_user || '';

    // Re-fetch latest discord_username so it stays current
    let discord_username = _existing?.discord_username || '';
    if (discord_user) {
      try {
        const _mem = interaction.guild.members.cache.get(discord_user)
          || await interaction.guild.members.fetch(discord_user).catch(() => null);
        if (_mem) discord_username = _mem.user.username;
      } catch (_) {}
    }

    const newPlayer = { slot, name, discord_user, discord_username, device, user_id, serial_number };
    const _lnExtra = (discord_user && discord_user === String(roster.leader_discord_id) && name)
      ? { leader_name: name } : {};
    db.update('Clan_Registry', roster.id, {
      players: players.map(p => p.slot === slot ? newPlayer : p),
      ..._lnExtra,
      updated_at: new Date().toISOString(),
    });
    await interaction.deferUpdate();
    return interaction.editReply(buildLeaderDashboard(eid, { info: 'Player #' + slot + ' updated.' }));
  }

  // ── Remove Player: select ────────────────────────────────────────────────
  if (id === 'fr_remove_player_start') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    await interaction.deferUpdate();
    return interaction.editReply(buildRemovePlayerSelect(eid));
  }

  if (id === 'fr_sel_remove_player') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const slot  = parseInt(interaction.values[0]);
    const _rSel = getRoster(eid);
    const _pSel = (_rSel?.players || []).find(p => p.slot === slot);
    if (_pSel && String(_pSel.discord_user || '') === String(eid)) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, {
        error: 'The leader cannot remove themselves. Transfer or remove leadership first.',
      }));
    }
    await interaction.deferUpdate();
    return interaction.editReply(buildConfirmRemove(eid, slot));
  }

  if (id.startsWith('fr_confirm_remove_')) {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const slot   = parseInt(id.replace('fr_confirm_remove_', ''));
    const cfg    = getRosterConfig();
    if (cfg.locked) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Registration is locked.' }));
    }
    const roster = getRoster(eid);
    if (!roster) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid));
    }
    const player    = (roster.players || []).find(p => p.slot === slot);
    const remaining = (roster.players || [])
      .filter(p => p.slot !== slot)
      .sort((a, b) => a.slot - b.slot)
      .map((p, i) => ({ ...p, slot: i + 1 }));
    db.update('Clan_Registry', roster.id, {
      players: remaining,
      updated_at: new Date().toISOString(),
    });
    // Remove clan role + MEF role from removed player
    const _remUid = player?.discord_user;
    if (_remUid) {
      const _remMef = db.getConfig('fed_roster_mef_role_id') || null;
      try {
        const _remMem = await interaction.guild.members.fetch(_remUid).catch(() => null);
        if (_remMem) {
          if (roster.clan_role_id) await _remMem.roles.remove(roster.clan_role_id).catch(() => {});
          if (_remMef)             await _remMem.roles.remove(_remMef).catch(() => {});
        }
      } catch (_) {}
    }
    await interaction.deferUpdate();
    return interaction.editReply(buildLeaderDashboard(eid, { info: 'Player **' + (player?.name || '#' + slot) + '** removed.' }));
  }

  // ── Preview ──────────────────────────────────────────────────────────────
  if (id === 'fr_preview') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const cfg    = getRosterConfig();
    let roster   = getRoster(eid);
    if (!roster) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'No roster found.' }));
    }
    await interaction.deferUpdate();
    // Delete the previous preview for this user if one exists
    const _prevId = _previewMsgIds.get(mid);
    if (_prevId) {
      await interaction.webhook.deleteMessage(_prevId).catch(() => {});
      _previewMsgIds.delete(mid);
    }
    // Refresh all players' discord_username from live Discord data
    try {
      const _refreshedPlayers = await Promise.all((roster.players || []).map(async p => {
        if (!p.discord_user) return p;
        try {
          const _m = interaction.guild.members.cache.get(p.discord_user)
            || await interaction.guild.members.fetch(p.discord_user).catch(() => null);
          if (_m) return Object.assign({}, p, { discord_username: _m.user.username });
        } catch (_) {}
        return p;
      }));
      if (_refreshedPlayers.some((p, i) => p.discord_username !== (roster.players[i]?.discord_username))) {
        db.update('Clan_Registry', roster.id, { players: _refreshedPlayers, updated_at: new Date().toISOString() });
        roster = Object.assign({}, roster, { players: _refreshedPlayers });
      }
    } catch (_) {}

    try {
      const pngBuf = await generateRosterPng(roster, cfg.maxPlayers, cfg.minPlayers);
      const _previewMsg = await interaction.followUp({
        content: '👁️  **' + (roster.clan_name || 'Roster') + '** — roster preview',
        files: [{ attachment: pngBuf, name: (roster.clan_tag || 'roster') + '_preview.png' }],
        flags: 64,
      });
      _previewMsgIds.set(mid, _previewMsg.id);
    } catch (e) {
      console.error('[FedRoster] PNG error:', e.message);
      await interaction.followUp({ content: '❌ Failed to generate image: ' + e.message, flags: 64 });
    }
    return;
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  if (id === 'fr_submit') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    try { await interaction.deferUpdate(); } catch (_) {}
    const cfg    = getRosterConfig();
    if (cfg.locked) {
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Registration is locked.' }));
    }
    const roster  = getRoster(eid);
    const players = roster?.players || [];
    if (!roster?.clan_name) {
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Fill in Clan Info before submitting.' }));
    }
    if (players.length < cfg.minPlayers) {
      return interaction.editReply(buildLeaderDashboard(eid, {
        error: 'Need at least **' + cfg.minPlayers + '** players to submit (currently ' + players.length + ').',
      }));
    }

    // Create / update clan role — matching /clans behavior exactly
    let clanRoleId = roster.clan_role_id || null;
    try {
      const guild   = interaction.guild;
      const tag     = roster.clan_tag || roster.clan_name.slice(0, 5).toUpperCase();

      if (clanRoleId) {
        const existing = await guild.roles.fetch(clanRoleId).catch(() => null);
        if (!existing) clanRoleId = null;
      }

      if (!clanRoleId) {
        const newRole = await guild.roles.create({
          name:   tag,
          colors: 0x00FFAC,
          reason: 'MEF Federation: ' + roster.clan_name + ' [' + tag + ']',
        });
        // Position just below the federation parent role — same as /clans
        const parentRole = await guild.roles.fetch(db.getConfig('fed_roster_leader_role_id') || '1529939782233227365').catch(() => null);
        if (parentRole && parentRole.position > 1) {
          await newRole.setPosition(parentRole.position - 1).catch(() => {});
        }
        clanRoleId = newRole.id;
      }

      // Assign role to all players whose discord_user is a valid snowflake
      const allMemberIds = [...new Set([
        mid, // leader always gets the role
        ...players.map(p => String(p.discord_user || '').replace(/\D/g, '')).filter(Boolean),
      ])];
      for (const uid of allMemberIds) {
        const member = await guild.members.fetch(uid).catch(() => null);
        if (member) await member.roles.add(clanRoleId).catch(() => {});
      }
    } catch (e) {
      console.error('[FedRoster] Role creation error:', e.message);
    }

    db.update('Clan_Registry', roster.id, {
      status: 'submitted',
      clan_role_id: clanRoleId,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return interaction.editReply(buildLeaderDashboard(eid, { info: '✅ Roster submitted! Clan role assigned.' }));
  }

  // ── Unsubmit ─────────────────────────────────────────────────────────────
  if (id === 'fr_unsubmit') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const cfg    = getRosterConfig();
    if (cfg.locked) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid, { error: 'Registration is locked.' }));
    }
    const roster = getRoster(eid);
    if (!roster) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(eid));
    }
    db.update('Clan_Registry', roster.id, {
      status: 'draft',
      submitted_at: null,
      updated_at: new Date().toISOString(),
    });
    await interaction.deferUpdate();
    return interaction.editReply(buildLeaderDashboard(eid, { info: 'Roster moved back to draft.' }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN INTERACTIONS  (prefix: fra_)
  // ═══════════════════════════════════════════════════════════════════════════

  if (id.startsWith('fra_')) {
    if (!isBotolaManager(interaction.member)) return noPerm(interaction);

    if (id === 'fra_refresh') {
      return interaction.update(buildAdminPanel());
    }

    if (id.startsWith('fra_page_')) {
      const page = parseInt(id.replace('fra_page_', '')) || 0;
      return interaction.update(buildAdminPanel({ page }));
    }

    if (id === 'fra_action_select') {
      const rosterId = parseInt(interaction.values[0]);
      return interaction.update(buildAdminClanView(rosterId));
    }

    if (id.startsWith('fra_view_')) {
      const rosterId = parseInt(id.replace('fra_view_', ''));
      return interaction.update(buildAdminClanView(rosterId));
    }

    // Toggle global lock
    if (id === 'fra_toggle_lock') {
      const cfg     = getRosterConfig();
      const newLock = !cfg.locked;
      db.setConfig('fed_roster_locked', newLock);
      await interaction.deferUpdate();
      return interaction.editReply(buildAdminPanel({ info: 'Registration ' + (newLock ? '🔒 **locked**' : '🟢 **unlocked**') + '.' }));
    }

    // Toggle submitted / draft
    if (id.startsWith('fra_toggle_submit_')) {
      const rosterId  = parseInt(id.replace('fra_toggle_submit_', ''));
      const roster    = (db.get('Clan_Registry') || []).find(r => r.id === rosterId);
      if (!roster) { await interaction.deferUpdate(); return interaction.editReply(buildAdminPanel({ error: 'Clan not found.' })); }
      const newStatus = roster.status === 'submitted' ? 'draft' : 'submitted';
      db.update('Clan_Registry', rosterId, { status: newStatus, updated_at: new Date().toISOString() });
      await interaction.deferUpdate();
      return interaction.editReply(buildAdminClanView(rosterId, { info: 'Status changed to **' + newStatus + '**.' }));
    }

    // Remove → confirm
    if (id.startsWith('fra_remove_') && !id.startsWith('fra_confirm_remove_')) {
      const rosterId = parseInt(id.replace('fra_remove_', ''));
      return interaction.update(buildAdminConfirmRemove(rosterId));
    }

    // Confirm remove
    if (id.startsWith('fra_confirm_remove_')) {
      const rosterId = parseInt(id.replace('fra_confirm_remove_', ''));
      const roster   = (db.get('Clan_Registry') || []).find(r => r.id === rosterId);
      await interaction.deferUpdate();
      if (!roster) return interaction.editReply(buildAdminPanel({ error: 'Clan not found.' }));

      // Delete clan role from Discord
      if (roster.clan_role_id) {
        try {
          const role = await interaction.guild.roles.fetch(roster.clan_role_id).catch(() => null);
          if (role) await role.delete('Clan removed from MEF roster').catch(() => {});
        } catch (_) {}
      }

      // Remove leader role from the leader
      const cfg = getRosterConfig();
      if (cfg.leaderRoleId && roster.leader_discord_id) {
        const m = await interaction.guild.members.fetch(roster.leader_discord_id).catch(() => null);
        if (m) await m.roles.remove(cfg.leaderRoleId).catch(() => {});
      }

      const clanName = roster.clan_name;
      db.delete('Clan_Registry', rosterId);
      // Delete cached logo image
      try {
        const _lp = path.join(LOGO_CACHE_DIR, rosterId + '.img');
        if (fs.existsSync(_lp)) fs.unlinkSync(_lp);
      } catch (_) {}
      return interaction.editReply(buildAdminPanel({ info: '**' + clanName + '** removed from the federation.' }));
    }

    // Admin PDF
    if (id.startsWith('fra_pdf_')) {
      const rosterId = parseInt(id.replace('fra_pdf_', ''));
      let roster     = (db.get('Clan_Registry') || []).find(r => r.id === rosterId);
      const cfg      = getRosterConfig();
      if (!roster) { await interaction.deferUpdate(); return interaction.editReply(buildAdminPanel({ error: 'Clan not found.' })); }
      await interaction.deferUpdate();
      // Refresh discord_username for all players before image
      try {
        const _rp = await Promise.all((roster.players || []).map(async p => {
          if (!p.discord_user) return p;
          try {
            const _m = interaction.guild.members.cache.get(p.discord_user)
              || await interaction.guild.members.fetch(p.discord_user).catch(() => null);
            if (_m) return Object.assign({}, p, { discord_username: _m.user.username });
          } catch (_) {}
          return p;
        }));
        const _changed = _rp.some((p, i) => p.discord_username !== ((roster.players||[])[i]||{}).discord_username);
        if (_changed) {
          db.update('Clan_Registry', roster.id, { players: _rp, updated_at: new Date().toISOString() });
          roster = Object.assign({}, roster, { players: _rp });
        }
      } catch (_) {}
      try {
        const pngBuf = await generateRosterPng(roster, cfg.maxPlayers, cfg.minPlayers);
        await interaction.followUp({
          content: '🖼️  **' + (roster.clan_name || 'Roster') + '** — official roster',
          files: [{ attachment: pngBuf, name: (roster.clan_tag || 'roster') + '_roster.png' }],
          flags: 64,
        });
      } catch (e) {
        console.error('[FedRoster] Admin PNG error:', e.message);
        await interaction.followUp({ content: '❌ Image error: ' + e.message, flags: 64 });
      }
      return;
    }

    // Settings panel
    if (id === 'fra_settings') {
      return interaction.update(buildAdminSettings());
    }

    // Set max players modal
    if (id === 'fra_set_max') {
      return interaction.showModal(
        new ModalBuilder().setCustomId('fra_modal_set_max').setTitle('Set Max Players per Clan')
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('val').setLabel('Max players (2–30)')
              .setStyle(TextInputStyle.Short).setRequired(true)
              .setValue(String(db.getConfig('fed_roster_max_players') ?? 12))
          ))
      );
    }
    if (id === 'fra_modal_set_max') {
      const val = parseInt(interaction.fields.getTextInputValue('val').trim());
      if (isNaN(val) || val < 2 || val > 30) {
        await interaction.deferUpdate();
        return interaction.editReply(buildAdminSettings({ error: 'Max players must be between 2 and 30.' }));
      }
      db.setConfig('fed_roster_max_players', val);
      await interaction.deferUpdate();
      return interaction.editReply(buildAdminSettings({ info: 'Max players set to **' + val + '**.' }));
    }

    // Set min players modal
    if (id === 'fra_set_min') {
      return interaction.showModal(
        new ModalBuilder().setCustomId('fra_modal_set_min').setTitle('Set Min Players to Submit')
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('val').setLabel('Min players (1–30)')
              .setStyle(TextInputStyle.Short).setRequired(true)
              .setValue(String(db.getConfig('fed_roster_min_players') ?? 8))
          ))
      );
    }
    if (id === 'fra_modal_set_min') {
      const val = parseInt(interaction.fields.getTextInputValue('val').trim());
      if (isNaN(val) || val < 1 || val > 30) {
        await interaction.deferUpdate();
        return interaction.editReply(buildAdminSettings({ error: 'Min players must be between 1 and 30.' }));
      }
      db.setConfig('fed_roster_min_players', val);
      await interaction.deferUpdate();
      return interaction.editReply(buildAdminSettings({ info: 'Min players set to **' + val + '**.' }));
    }

    // Set leader role
    if (id === 'fra_set_leader_role') {
      const roleId = (interaction.values || [])[0] || null;
      db.setConfig('fed_roster_leader_role_id', roleId);
      await interaction.deferUpdate();
      return interaction.editReply(buildAdminSettings({
        info: roleId ? 'Leader role set to <@&' + roleId + '>.' : 'Leader role cleared.',
      }));
    }

    // Set co-leader role
    if (id === 'fra_set_co_leader_role') {
      const roleId = (interaction.values || [])[0] || null;
      db.setConfig('fed_roster_co_leader_role_id', roleId);
      await interaction.deferUpdate();
      return interaction.editReply(buildAdminSettings({
        info: roleId ? 'Co-Leader role set to <@&' + roleId + '>.' : 'Co-Leader role cleared.',
      }));
    }

    // Set Instagram — open modal
    if (id === 'fra_set_instagram') {
      const current = db.getConfig('fed_roster_instagram') || '';
      const modal = new ModalBuilder()
        .setCustomId('fra_modal_set_instagram')
        .setTitle('Set Federation Instagram');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('val')
            .setLabel('Instagram username')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('@mef_federation')
            .setRequired(false)
            .setValue(current)
        )
      );
      return interaction.showModal(modal);
    }

    if (id === 'fra_modal_set_instagram') {
      const val = interaction.fields.getTextInputValue('val').trim();
      db.setConfig('fed_roster_instagram', val);
      await interaction.deferUpdate();
      return interaction.editReply(buildAdminSettings({
        info: val ? 'Instagram set to **' + val + '**.' : 'Instagram cleared.',
      }));
    }

    // Set Footer Text — open modal
    if (id === 'fra_set_footer_text') {
      const current = db.getConfig('fed_roster_footer_text') || 'MEF  ·  Powered by 24';
      const modal = new ModalBuilder()
        .setCustomId('fra_modal_set_footer_text')
        .setTitle('Set Footer Text');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('val')
            .setLabel('Bottom-left footer text')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('MEF  ·  Powered by 24')
            .setRequired(false)
            .setValue(current)
        )
      );
      return interaction.showModal(modal);
    }

    if (id === 'fra_modal_set_footer_text') {
      const val = interaction.fields.getTextInputValue('val').trim();
      db.setConfig('fed_roster_footer_text', val || 'MEF  ·  Powered by 24');
      await interaction.deferUpdate();
      return interaction.editReply(buildAdminSettings({
        info: 'Footer text set to **' + (val || 'MEF  ·  Powered by 24') + '**.',
      }));
    }

    // ── Set MEF member role ──────────────────────────────────────────────
    if (id === 'fra_set_mef_role') {
      const roleId = (interaction.values || [])[0] || null;
      db.setConfig('fed_roster_mef_role_id', roleId);
      await interaction.deferUpdate();
      if (roleId) {
        const _allRosters = db.get('Clan_Registry') || [];
        for (const _r of _allRosters) {
          const _allIds = new Set();
          if (_r.leader_discord_id) _allIds.add(String(_r.leader_discord_id));
          for (const _co of (_r.co_leaders || [])) { if (_co) _allIds.add(String(_co)); }
          for (const _p of (_r.players || [])) {
            const _uid = String(_p.discord_user || '').replace(/\D/g, '');
            if (_uid) _allIds.add(_uid);
          }
          for (const _uid of _allIds) {
            try {
              const _mem = await interaction.guild.members.fetch(_uid).catch(() => null);
              if (_mem) await _mem.roles.add(roleId).catch(() => {});
            } catch (_) {}
          }
        }
      }
      return interaction.editReply(buildAdminSettings({
        info: roleId
          ? 'MEF role set to <@&' + roleId + '> — assigned to all current roster members.'
          : 'MEF role cleared.',
      }));
    }
  }

  } catch (err) {
    // Discord token expired (>15 min) — delete the ephemeral message silently
    if (err?.code === 10062) {
      await interaction.message?.delete().catch(() => {});
      return;
    }
    throw err;
  }
}

module.exports = { handleFedRosterInteraction };
