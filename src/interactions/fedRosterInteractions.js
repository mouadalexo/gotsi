'use strict';
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db }                = require('../utils/database');
const { isBotolaManager }   = require('../utils/permissions');
const { generateRosterPdf } = require('../utils/fedRosterPdf');
const {
  getRosterConfig, getRoster,
  buildLeaderDashboard, buildPickUserPanel,
  buildEditPlayerSelect, buildRemovePlayerSelect,
  buildConfirmRemove, buildAdminPanel, buildAdminClanView,
  buildAdminSettings, buildAdminConfirmRemove,
} = require('../panels/fedRosterPanel');

// ── Helpers ──────────────────────────────────────────────────────────────────
function noPerm(i) {
  return i.reply({ content: '❌ You do not have permission to do that.', ephemeral: true });
}

function isLeader(member) {
  const cfg = getRosterConfig();
  if (!cfg.leaderRoleId) return false;
  return member.roles.cache.has(cfg.leaderRoleId);
}

// Returns roster if field/value is already used in another clan (or another slot of same clan)
function uniqueCheck(excludeRosterId, excludeSlot, field, value) {
  const rosters = db.get('fed_rosters') || [];
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
  const rosters = db.get('fed_rosters') || [];
  const ids     = new Set();
  for (const r of rosters) {
    if (r.id === excludeRosterId) continue;
    for (const p of (r.players || [])) {
      const uid = String(p.discord_user || '').replace(/\D/g, '');
      if (uid) ids.add(uid);
    }
  }
  return ids;
}

// Build clan info modal (4 fields: name, tag, social, logo)
function buildClanInfoModal(roster) {
  const m = new ModalBuilder().setCustomId('fr_modal_clan_info').setTitle('Clan Information');
  const row = f => new ActionRowBuilder().addComponents(f);
  const ti  = (id, label, ph, val, required = true) =>
    new TextInputBuilder().setCustomId(id).setLabel(label)
      .setStyle(TextInputStyle.Short).setPlaceholder(ph)
      .setRequired(required).setValue(val || '');
  m.addComponents(
    row(ti('clan_name',    'Clan Name',     'e.g. Night Stars',         roster?.clan_name    || '')),
    row(ti('clan_tag',     'Clan Tag',      'e.g. NST',                 roster?.clan_tag     || '')),
    row(ti('social_media', 'Social Media',  'e.g. @NightStarsMEF',      roster?.social_media || '', false)),
    row(ti('logo_url',     'Clan Logo URL', 'https://i.imgur.com/...',  roster?.logo_url     || '', false)),
  );
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
    row(ti('name',          'Player Name',     'e.g. Ahmed',           existing?.name          || '')),
    row(ti('device',        'Device',          'Android or iOS',       existing?.device        || '')),
    row(ti('user_id',       'In-Game User ID', 'e.g. 1234567890',      existing?.user_id       || '')),
    row(ti('serial_number', 'Serial Number',   'e.g. A1B2C3D4',        existing?.serial_number || '')),
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
    row(ti('name',          'Player Name',             'e.g. Ahmed',            existing?.name          || '')),
    row(ti('discord_user',  'Discord User ID',         'e.g. 123456789',        existing?.discord_user  || '')),
    row(ti('device',        'Device',                  'Android or iOS',        existing?.device        || '')),
    row(ti('user_id',       'In-Game User ID',         'e.g. 1234567890',       existing?.user_id       || '')),
    row(ti('serial_number', 'Serial Number',           'e.g. A1B2C3D4',         existing?.serial_number || '')),
  );
  return m;
}

// ── Main handler ─────────────────────────────────────────────────────────────
async function handleFedRosterInteraction(interaction, client) {
  const id  = interaction.customId || '';
  const mid = interaction.member?.id;

  // ═══════════════════════════════════════════════════════════════════════════
  // LEADER INTERACTIONS  (prefix: fr_)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Open ephemeral dashboard ─────────────────────────────────────────────
  if (id === 'fr_open') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    return interaction.reply(buildLeaderDashboard(mid));
  }

  // ── Refresh dashboard ────────────────────────────────────────────────────
  if (id === 'fr_refresh') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    return interaction.update(buildLeaderDashboard(mid));
  }

  // ── Clan Info modal open ─────────────────────────────────────────────────
  if (id === 'fr_clan_info') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const cfg = getRosterConfig();
    if (cfg.locked) return interaction.reply({ content: '🔒 Registration is locked.', ephemeral: true });
    const roster = getRoster(mid);
    return interaction.showModal(buildClanInfoModal(roster));
  }

  // ── Clan Info modal submit ───────────────────────────────────────────────
  if (id === 'fr_modal_clan_info') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const cfg = getRosterConfig();
    if (cfg.locked) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Registration is locked.' }));
    }
    const clan_name    = interaction.fields.getTextInputValue('clan_name').trim();
    const clan_tag     = interaction.fields.getTextInputValue('clan_tag').trim().toUpperCase();
    const social_media = interaction.fields.getTextInputValue('social_media').trim();
    const logo_url     = interaction.fields.getTextInputValue('logo_url').trim();

    if (!clan_name) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Clan name is required.' }));
    }

    const roster = getRoster(mid);
    const fed    = db.getConfig('federation') || {};
    if (roster) {
      db.update('fed_rosters', roster.id, { clan_name, clan_tag, social_media, logo_url, updated_at: new Date().toISOString() });
    } else {
      db.insert('fed_rosters', {
        guild_id: interaction.guild.id,
        leader_discord_id: mid,
        clan_name, clan_tag, social_media, logo_url,
        players: [],
        status: 'draft',
        clan_role_id: null,
        season: fed.season || 1,
        updated_at: new Date().toISOString(),
      });
    }
    await interaction.deferUpdate();
    return interaction.editReply(buildLeaderDashboard(mid, { info: 'Clan info saved.' }));
  }

  // ── Add Player: step 1 — show Discord user select ─────────────────────────
  if (id === 'fr_add_player') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const cfg = getRosterConfig();
    if (cfg.locked) return interaction.reply({ content: '🔒 Registration is locked.', ephemeral: true });
    const roster = getRoster(mid);
    if (!roster?.clan_name) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Fill in Clan Info before adding players.' }));
    }
    const players  = roster.players || [];
    if (players.length >= cfg.maxPlayers) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Roster is full (' + cfg.maxPlayers + ' players max).' }));
    }
    const usedSlots = players.map(p => p.slot);
    let slot = 1;
    while (usedSlots.includes(slot)) slot++;
    await interaction.deferUpdate();
    return interaction.editReply(buildPickUserPanel(slot));
  }

  // ── Add Player: step 1 result — user selected, show modal ─────────────────
  if (id.startsWith('fr_pick_user_')) {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const slot         = parseInt(id.replace('fr_pick_user_', ''));
    const discordUserId = interaction.values[0];

    // Check if this Discord user is already registered anywhere in the federation
    const registeredIds = getRegisteredDiscordIds(null);
    if (registeredIds.has(discordUserId)) {
      await interaction.deferUpdate();
      return interaction.editReply(buildPickUserPanel(slot, { error: '<@' + discordUserId + '> is already registered in another clan.' }));
    }

    return interaction.showModal(buildAddPlayerModal(slot, discordUserId));
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
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Registration is locked.' }));
    }
    const roster = getRoster(mid);
    if (!roster) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Set Clan Info first.' }));
    }

    const name          = interaction.fields.getTextInputValue('name').trim();
    const device        = interaction.fields.getTextInputValue('device').trim();
    const user_id       = interaction.fields.getTextInputValue('user_id').trim();
    const serial_number = interaction.fields.getTextInputValue('serial_number').trim();

    // Uniqueness checks across the entire federation
    const dupeUserId = uniqueCheck(roster.id, slot, 'user_id', user_id);
    if (dupeUserId) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'In-Game User ID **' + user_id + '** is already registered in **' + (dupeUserId.clan_name || 'another clan') + '**.' }));
    }
    const dupeSerial = uniqueCheck(roster.id, slot, 'serial_number', serial_number);
    if (dupeSerial) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Serial Number **' + serial_number + '** is already registered in **' + (dupeSerial.clan_name || 'another clan') + '**.' }));
    }
    if (discordUserId) {
      const dupeDiscord = getRegisteredDiscordIds(roster.id);
      if (dupeDiscord.has(discordUserId)) {
        await interaction.deferUpdate();
        return interaction.editReply(buildLeaderDashboard(mid, { error: '<@' + discordUserId + '> is already registered in another clan.' }));
      }
    }

    const players   = roster.players || [];
    const existing  = players.find(p => p.slot === slot);
    const newPlayer = { slot, name, discord_user: discordUserId || '', device, user_id, serial_number };

    if (existing) {
      db.update('fed_rosters', roster.id, {
        players: players.map(p => p.slot === slot ? newPlayer : p),
        updated_at: new Date().toISOString(),
      });
    } else {
      db.update('fed_rosters', roster.id, {
        players: [...players, newPlayer],
        updated_at: new Date().toISOString(),
      });
    }
    await interaction.deferUpdate();
    return interaction.editReply(buildLeaderDashboard(mid, { info: 'Player #' + slot + ' — **' + name + '** added.' }));
  }

  // ── Edit Player: select ──────────────────────────────────────────────────
  if (id === 'fr_edit_player_start') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    await interaction.deferUpdate();
    return interaction.editReply(buildEditPlayerSelect(mid));
  }

  if (id === 'fr_sel_edit_player') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const slot   = parseInt(interaction.values[0]);
    const roster = getRoster(mid);
    const player = (roster?.players || []).find(p => p.slot === slot);
    if (!player) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Player not found.' }));
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
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Registration is locked.' }));
    }
    const roster = getRoster(mid);
    if (!roster) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid));
    }

    const name          = interaction.fields.getTextInputValue('name').trim();
    const discord_user  = interaction.fields.getTextInputValue('discord_user').trim().replace(/\D/g, '');
    const device        = interaction.fields.getTextInputValue('device').trim();
    const user_id       = interaction.fields.getTextInputValue('user_id').trim();
    const serial_number = interaction.fields.getTextInputValue('serial_number').trim();

    const dupeUserId = uniqueCheck(roster.id, slot, 'user_id', user_id);
    if (dupeUserId) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'User ID **' + user_id + '** is already registered in **' + (dupeUserId.clan_name || 'another clan') + '**.' }));
    }
    const dupeSerial = uniqueCheck(roster.id, slot, 'serial_number', serial_number);
    if (dupeSerial) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Serial Number **' + serial_number + '** is already registered in **' + (dupeSerial.clan_name || 'another clan') + '**.' }));
    }
    if (discord_user) {
      const dupeDiscord = getRegisteredDiscordIds(roster.id);
      if (dupeDiscord.has(discord_user)) {
        await interaction.deferUpdate();
        return interaction.editReply(buildLeaderDashboard(mid, { error: 'Discord user <@' + discord_user + '> is already registered in another clan.' }));
      }
    }

    const players   = roster.players || [];
    const newPlayer = { slot, name, discord_user, device, user_id, serial_number };
    db.update('fed_rosters', roster.id, {
      players: players.map(p => p.slot === slot ? newPlayer : p),
      updated_at: new Date().toISOString(),
    });
    await interaction.deferUpdate();
    return interaction.editReply(buildLeaderDashboard(mid, { info: 'Player #' + slot + ' updated.' }));
  }

  // ── Remove Player: select ────────────────────────────────────────────────
  if (id === 'fr_remove_player_start') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    await interaction.deferUpdate();
    return interaction.editReply(buildRemovePlayerSelect(mid));
  }

  if (id === 'fr_sel_remove_player') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const slot = parseInt(interaction.values[0]);
    await interaction.deferUpdate();
    return interaction.editReply(buildConfirmRemove(mid, slot));
  }

  if (id.startsWith('fr_confirm_remove_')) {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const slot   = parseInt(id.replace('fr_confirm_remove_', ''));
    const cfg    = getRosterConfig();
    if (cfg.locked) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Registration is locked.' }));
    }
    const roster = getRoster(mid);
    if (!roster) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid));
    }
    const player = (roster.players || []).find(p => p.slot === slot);
    db.update('fed_rosters', roster.id, {
      players: (roster.players || []).filter(p => p.slot !== slot),
      updated_at: new Date().toISOString(),
    });
    await interaction.deferUpdate();
    return interaction.editReply(buildLeaderDashboard(mid, { info: 'Player **' + (player?.name || '#' + slot) + '** removed.' }));
  }

  // ── Preview ──────────────────────────────────────────────────────────────
  if (id === 'fr_preview') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const cfg    = getRosterConfig();
    const roster = getRoster(mid);
    if (!roster) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'No roster found.' }));
    }
    await interaction.deferUpdate();
    try {
      const pdfBuf = await generateRosterPdf(roster, cfg.maxPlayers, cfg.minPlayers);
      await interaction.followUp({
        content: '👁️  **' + (roster.clan_name || 'Roster') + '** — preview PDF',
        files: [{ attachment: pdfBuf, name: (roster.clan_tag || 'roster') + '_preview.pdf' }],
        flags: 64,
      });
    } catch (e) {
      console.error('[FedRoster] PDF error:', e.message);
      await interaction.followUp({ content: '❌ Failed to generate PDF: ' + e.message, flags: 64 });
    }
    return;
  }

  // ── Download PDF ─────────────────────────────────────────────────────────
  if (id === 'fr_pdf') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const cfg    = getRosterConfig();
    const roster = getRoster(mid);
    if (!roster) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'No roster found.' }));
    }
    await interaction.deferUpdate();
    try {
      const pdfBuf = await generateRosterPdf(roster, cfg.maxPlayers, cfg.minPlayers);
      await interaction.followUp({
        content: '📄  **' + (roster.clan_name || 'Roster') + '** — official roster PDF',
        files: [{ attachment: pdfBuf, name: (roster.clan_tag || 'roster') + '_roster.pdf' }],
        flags: 64,
      });
    } catch (e) {
      console.error('[FedRoster] PDF error:', e.message);
      await interaction.followUp({ content: '❌ Failed to generate PDF: ' + e.message, flags: 64 });
    }
    return;
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  if (id === 'fr_submit') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const cfg    = getRosterConfig();
    if (cfg.locked) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Registration is locked.' }));
    }
    const roster  = getRoster(mid);
    const players = roster?.players || [];
    if (!roster?.clan_name) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Fill in Clan Info before submitting.' }));
    }
    if (players.length < cfg.minPlayers) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, {
        error: 'Need at least **' + cfg.minPlayers + '** players to submit (currently ' + players.length + ').',
      }));
    }

    await interaction.deferUpdate();

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
          color:  0x00FFAC,
          reason: 'MEF Federation: ' + roster.clan_name + ' [' + tag + ']',
        });
        // Position just below the federation parent role — same as /clans
        const parentRole = await guild.roles.fetch('1529939492495036456').catch(() => null);
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

    db.update('fed_rosters', roster.id, {
      status: 'submitted',
      clan_role_id: clanRoleId,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return interaction.editReply(buildLeaderDashboard(mid, { info: '✅ Roster submitted! Clan role assigned.' }));
  }

  // ── Unsubmit ─────────────────────────────────────────────────────────────
  if (id === 'fr_unsubmit') {
    if (!isLeader(interaction.member)) return noPerm(interaction);
    const cfg    = getRosterConfig();
    if (cfg.locked) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid, { error: 'Registration is locked.' }));
    }
    const roster = getRoster(mid);
    if (!roster) {
      await interaction.deferUpdate();
      return interaction.editReply(buildLeaderDashboard(mid));
    }
    db.update('fed_rosters', roster.id, {
      status: 'draft',
      submitted_at: null,
      updated_at: new Date().toISOString(),
    });
    await interaction.deferUpdate();
    return interaction.editReply(buildLeaderDashboard(mid, { info: 'Roster moved back to draft.' }));
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
      const roster    = (db.get('fed_rosters') || []).find(r => r.id === rosterId);
      if (!roster) { await interaction.deferUpdate(); return interaction.editReply(buildAdminPanel({ error: 'Clan not found.' })); }
      const newStatus = roster.status === 'submitted' ? 'draft' : 'submitted';
      db.update('fed_rosters', rosterId, { status: newStatus, updated_at: new Date().toISOString() });
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
      const roster   = (db.get('fed_rosters') || []).find(r => r.id === rosterId);
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
      db.delete('fed_rosters', rosterId);
      return interaction.editReply(buildAdminPanel({ info: '**' + clanName + '** removed from the federation.' }));
    }

    // Admin PDF
    if (id.startsWith('fra_pdf_')) {
      const rosterId = parseInt(id.replace('fra_pdf_', ''));
      const roster   = (db.get('fed_rosters') || []).find(r => r.id === rosterId);
      const cfg      = getRosterConfig();
      if (!roster) { await interaction.deferUpdate(); return interaction.editReply(buildAdminPanel({ error: 'Clan not found.' })); }
      await interaction.deferUpdate();
      try {
        const pdfBuf = await generateRosterPdf(roster, cfg.maxPlayers, cfg.minPlayers);
        await interaction.followUp({
          content: '📄  **' + (roster.clan_name || 'Roster') + '** — official roster PDF',
          files: [{ attachment: pdfBuf, name: (roster.clan_tag || 'roster') + '_roster.pdf' }],
          flags: 64,
        });
      } catch (e) {
        console.error('[FedRoster] Admin PDF error:', e.message);
        await interaction.followUp({ content: '❌ PDF error: ' + e.message, flags: 64 });
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
  }
}

module.exports = { handleFedRosterInteraction };
