'use strict';
const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { buildClanCrudPanel, buildClanAssignPanel, buildClanSettingsPanel } = require('../panels/clanCrudPanel');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });

async function removeRoleFromMember(guild, userId, roleId) {
  if (!userId || !roleId) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) await member.roles.remove(roleId).catch(() => {});
}

async function addRoleToMember(guild, userId, roleId) {
  if (!userId || !roleId) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) await member.roles.add(roleId).catch(() => {});
}

async function removeRoleFromMembers(guild, userIds, roleId) {
  for (const userId of [...new Set((userIds || []).filter(Boolean))]) {
    await removeRoleFromMember(guild, userId, roleId);
  }
}

function fuzzySearch(query, items) {
  const q = query.toLowerCase();
  return items.filter(c =>
    c.name.toLowerCase().includes(q) || (c.tag || '').toLowerCase().includes(q)
  );
}

async function handleClanCrudInteraction(interaction) {
  const id = interaction.customId;

  // ── Refresh / Back ────────────────────────────────────────────────────────
  if (id === 'cc_refresh' || id.startsWith('cc_refresh_')) {
    return interaction.update(buildClanCrudPanel());
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  if (id.startsWith('cc_page_')) {
    const page = parseInt(id.replace('cc_page_', '')) || 0;
    return interaction.update(buildClanCrudPanel({ page }));
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  if (id === 'cc_settings') {
    return interaction.update(buildClanSettingsPanel());
  }

  if (id === 'cc_set_maxplayers') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('cc_set_maxplayers_modal').setTitle('Set Max Players Per Clan')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('maxplayers').setLabel('Max players per clan (e.g. 10)')
            .setStyle(TextInputStyle.Short)
            .setValue(String(db.getConfig('clans_max_players') || 10))
            .setRequired(true)
        ))
    );
  }

  if (id === 'cc_set_maxplayers_modal') {
    const val = parseInt(interaction.fields.getTextInputValue('maxplayers').trim());
    if (isNaN(val) || val < 2 || val > 30) {
      await interaction.deferUpdate();
      return interaction.editReply(buildClanSettingsPanel({ error: 'Max players must be between 2 and 30.' }));
    }
    db.setConfig('clans_max_players', val);
    await interaction.deferUpdate();
    return interaction.editReply(buildClanSettingsPanel({
      info: 'Max players set to **' + val + '** (1 leader + ' + (val - 1) + ' members).',
    }));
  }

  // ── Set leader role (role select component, type 8) ───────────────────────
  if (id === 'cc_set_leader_role') {
    const roleId = (interaction.values || [])[0] || null;
    db.setConfig('clans_leader_role_id', roleId);
    await interaction.deferUpdate();
    return interaction.editReply(buildClanSettingsPanel({
      info: roleId ? 'Leader role set to <@&' + roleId + '>.' : 'Leader role cleared.',
    }));
  }

  // ── Search ────────────────────────────────────────────────────────────────
  if (id === 'cc_search') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('cc_search_modal').setTitle('Search Clans')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('query').setLabel('Clan name or tag')
            .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Night Stars or NST').setRequired(true)
        ))
    );
  }

  if (id === 'cc_search_modal') {
    const query   = interaction.fields.getTextInputValue('query').trim();
    const results = fuzzySearch(query, db.get('clans') || []);
    await interaction.deferUpdate();
    if (!results.length) {
      return interaction.editReply(buildClanCrudPanel({ error: 'No clans found matching "' + query + '".' }));
    }
    const lines = results.slice(0, 20).map(c => {
      const leader = (c.players || [])[0];
      return '\uD83C\uDFDF\uFE0F  **' + c.name + '**  `[' + (c.tag || '?') + ']`' +
             (leader ? '  \uD83D\uDC51 <@' + leader + '>' : '  \u2014 no leader');
    });
    return interaction.editReply({ flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: [
      txt('## \uD83D\uDD0D  Search — "' + query + '"\n> **' + results.length + '** clan' + (results.length !== 1 ? 's' : '') + ' found'),
      SEP,
      txt(lines.join('\n')),
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: '\u25C4 Back', custom_id: 'cc_refresh' }] },
    ]}]});
  }

  // ── Add ───────────────────────────────────────────────────────────────────
  if (id === 'cc_add') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('cc_add_modal').setTitle('Add Clan')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('clanname').setLabel('Clan Name')
              .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Night Stars').setMaxLength(50).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('clantag').setLabel('Clan Tag (max 5 chars)')
              .setStyle(TextInputStyle.Short).setPlaceholder('e.g. NST').setMaxLength(5).setRequired(true)
          )
        )
    );
  }

  if (id === 'cc_add_modal') {
    const name = interaction.fields.getTextInputValue('clanname').trim();
    const tag  = interaction.fields.getTextInputValue('clantag').trim().toUpperCase();
    await interaction.deferUpdate();
    if (!name) return interaction.editReply(buildClanCrudPanel({ error: 'Clan name cannot be empty.' }));
    if (!tag)  return interaction.editReply(buildClanCrudPanel({ error: 'Clan tag cannot be empty.' }));
    const all = db.get('clans') || [];
    if (all.find(c => c.name.toLowerCase() === name.toLowerCase()))
      return interaction.editReply(buildClanCrudPanel({ error: '**' + name + '** already exists in the database.' }));
    if (all.find(c => (c.tag || '').toLowerCase() === tag.toLowerCase()))
      return interaction.editReply(buildClanCrudPanel({ error: 'Tag **' + tag + '** is already used by another clan.' }));
    db.insert('clans', { name, tag, players: [], role_id: null });
    const newClan = (db.get('clans') || []).find(c => c.name.toLowerCase() === name.toLowerCase());
    return interaction.editReply(buildClanAssignPanel(newClan.id));
  }

  // ── Leader select (user select, type 5) ───────────────────────────────────
  if (id.startsWith('cc_leader_')) {
    const clanId    = parseInt(id.replace('cc_leader_', ''));
    const clan      = (db.get('clans') || []).find(c => c.id === clanId);
    if (!clan) { await interaction.deferUpdate(); return interaction.editReply(buildClanCrudPanel()); }

    const currentPlayers = (clan.players || []).filter(Boolean);
    const previousLeader = currentPlayers[0] || null;
    const members = currentPlayers.slice(1);
    const newLeader = (interaction.values || [])[0] || null;

    if (newLeader) {
      const conflict = (db.get('clans') || []).find(c => c.id !== clanId && (c.players || []).includes(newLeader));
      if (conflict) {
        await interaction.deferUpdate();
        return interaction.editReply(buildClanAssignPanel(clanId, {
          error: '<@' + newLeader + '> is already in **' + conflict.name + '**.',
        }));
      }
    }

    const updatedPlayers = newLeader
      ? [newLeader, ...members.filter(uid => uid !== newLeader)]
      : [...members];
    db.update('clans', clanId, { players: updatedPlayers });

    const leaderRoleId = db.getConfig('clans_leader_role_id') || null;
    if (previousLeader && previousLeader !== newLeader) {
      // The old leader leaves the clan list when leadership is changed or cleared.
      await removeRoleFromMember(interaction.guild, previousLeader, leaderRoleId);
      await removeRoleFromMember(interaction.guild, previousLeader, clan.role_id);
    }
    if (newLeader && previousLeader !== newLeader) {
      await addRoleToMember(interaction.guild, newLeader, clan.role_id);
      await addRoleToMember(interaction.guild, newLeader, leaderRoleId);
    }

    await interaction.deferUpdate();
    return interaction.editReply(buildClanAssignPanel(clanId));
  }

  // ── Members select (user select, type 5, multi) ───────────────────────────
  if (id.startsWith('cc_members_')) {
    const clanId     = parseInt(id.replace('cc_members_', ''));
    const clan       = (db.get('clans') || []).find(c => c.id === clanId);
    if (!clan) { await interaction.deferUpdate(); return interaction.editReply(buildClanCrudPanel()); }

    const maxPlayers  = db.getConfig('clans_max_players') || 10;
    const newSel      = (interaction.values || []);
    const currentPlayers = (clan.players || []).filter(Boolean);
    const leader      = currentPlayers[0] || null;
    const previousMembers = currentPlayers.slice(1);
    // Replace — what is submitted IS the new member list (default_values shows current members pre-selected)
    const merged      = newSel.filter(uid => uid !== leader).slice(0, maxPlayers - 1);

    const conflicts = [];
    for (const uid of newSel) {
      if (uid === leader) { conflicts.push('<@' + uid + '> is already set as leader'); continue; }
      const oc = (db.get('clans') || []).find(c => c.id !== clanId && (c.players || []).includes(uid));
      if (oc) conflicts.push('<@' + uid + '> is already in **' + oc.name + '**');
    }
    if (conflicts.length) {
      await interaction.deferUpdate();
      return interaction.editReply(buildClanAssignPanel(clanId, { error: conflicts.join('\n') }));
    }
    db.update('clans', clanId, { players: leader ? [leader, ...merged] : [...merged] });

    const removedMembers = previousMembers.filter(uid => !merged.includes(uid));
    await removeRoleFromMembers(interaction.guild, removedMembers, clan.role_id);

    await interaction.deferUpdate();
    return interaction.editReply(buildClanAssignPanel(clanId));
  }

  // ── Save clan ─────────────────────────────────────────────────────────────
  // Creates Discord role if not exists, gives clan role to all players,
  // gives leader role to the leader.
  if (id.startsWith('cc_save_')) {
    const clanId = parseInt(id.replace('cc_save_', ''));
    const clan   = (db.get('clans') || []).find(c => c.id === clanId);
    if (!clan) { await interaction.deferUpdate(); return interaction.editReply(buildClanCrudPanel({ error: 'Clan not found.' })); }

    await interaction.deferUpdate();

    const guild        = interaction.guild;
    const leaderRoleId = db.getConfig('clans_leader_role_id') || null;
    const players      = (clan.players || []).filter(Boolean);
    const leader       = players[0] || null;

    // Create Discord clan role if not already created
    let roleId = clan.role_id;
    if (!roleId) {
      let createdRole = null;
      try {
        createdRole = await guild.roles.create({
          name: clan.tag,
          color: 0x00FFAC,
          reason: 'Clan Database: ' + clan.name + ' [' + clan.tag + ']',
        });
        const parentRole = await guild.roles.fetch('1529939492495036456').catch(() => null);
        if (!parentRole) throw new Error('Target parent role 1529939492495036456 was not found.');
        if (parentRole.position <= 1) throw new Error('Target parent role is too low to place a clan role below it.');
        await createdRole.setPosition(parentRole.position - 1);
        roleId = createdRole.id;
        db.update('clans', clanId, { role_id: roleId });
      } catch (e) {
        if (createdRole) await createdRole.delete('Clan role setup failed').catch(() => {});
        console.error('[CLAN] Role creation error:', e.message);
        return interaction.editReply(buildClanCrudPanel({ error: 'Failed to create Discord role: ' + e.message }));
      }
    }

    // Assign clan role to all players, leader role to the leader
    for (const uid of players) {
      try {
        const member = await guild.members.fetch(uid).catch(() => null);
        if (!member) continue;
        if (roleId) await member.roles.add(roleId).catch(() => {});
        if (uid === leader && leaderRoleId) await member.roles.add(leaderRoleId).catch(() => {});
      } catch (_) {}
    }

    return interaction.editReply(buildClanCrudPanel({
      info: '**' + clan.name + '** saved — ' + players.length + ' player' + (players.length !== 1 ? 's' : '') + ' assigned.',
    }));
  }

  // ── Edit — select clan ────────────────────────────────────────────────────
  if (id === 'cc_edit_start') {
    const clans = (db.get('clans') || []).sort((a, b) => a.name.localeCompare(b.name));
    if (!clans.length) return interaction.update(buildClanCrudPanel());
    return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: [
      txt('**\u270F\uFE0F  Edit Clan \u2014 Select one**'),
      SEP,
      { type: 1, components: [{ type: 3, custom_id: 'cc_edit_sel',
        placeholder: 'Select clan to edit\u2026',
        options: clans.slice(0, 25).map(c => ({ label: c.name + '  [' + (c.tag || '') + ']', value: String(c.id) })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: '\u25C4 Back', custom_id: 'cc_refresh' }] },
    ]}]});
  }

  if (id === 'cc_edit_sel') {
    const clanId = parseInt(interaction.values[0]);
    return interaction.update(buildClanAssignPanel(clanId));
  }

  // ── Remove — select clan ──────────────────────────────────────────────────
  if (id === 'cc_remove') {
    const clans = (db.get('clans') || []).sort((a, b) => a.name.localeCompare(b.name));
    if (!clans.length) return interaction.update(buildClanCrudPanel());
    return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: [
      txt('**\uD83D\uDDD1\uFE0F  Remove Clan \u2014 Select one**'),
      SEP,
      { type: 1, components: [{ type: 3, custom_id: 'cc_remove_sel',
        placeholder: 'Select clan to remove\u2026',
        options: clans.slice(0, 25).map(c => ({ label: c.name + '  [' + (c.tag || '') + ']', value: String(c.id) })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: '\u25C4 Back', custom_id: 'cc_refresh' }] },
    ]}]});
  }

  if (id === 'cc_remove_sel') {
    const clanId = parseInt(interaction.values[0]);
    const clan   = (db.get('clans') || []).find(c => c.id === clanId);
    if (!clan) return interaction.update(buildClanCrudPanel());
    return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: [
      txt(
        '**\uD83D\uDDD1\uFE0F  Remove Clan**\n' +
        'Are you sure you want to remove **' + clan.name + '** `[' + (clan.tag || '') + ']`?\n' +
        '> The clan\u2019s Discord role will be **deleted**.\n' +
        '> The leader role will be **removed** from the leader.\n' +
        '> This cannot be undone.'
      ),
      SEP,
      { type: 1, components: [
        { type: 2, style: 4, label: 'Yes, Remove', custom_id: 'cc_remove_confirm_' + clanId },
        { type: 2, style: 2, label: 'Cancel',      custom_id: 'cc_refresh' },
      ]},
    ]}]});
  }

  if (id.startsWith('cc_remove_confirm_')) {
    const clanId = parseInt(id.replace('cc_remove_confirm_', ''));
    const clan   = (db.get('clans') || []).find(c => c.id === clanId);
    if (!clan) { await interaction.deferUpdate(); return interaction.editReply(buildClanCrudPanel()); }

    await interaction.deferUpdate();

    const guild        = interaction.guild;
    const leaderRoleId = db.getConfig('clans_leader_role_id') || null;
    const players      = (clan.players || []).filter(Boolean);
    const leader       = players[0] || null;

    // Remove leader role from leader (never delete the global leader role)
    if (leader && leaderRoleId) {
      try {
        const member = await guild.members.fetch(leader).catch(() => null);
        if (member) await member.roles.remove(leaderRoleId).catch(() => {});
      } catch (_) {}
    }

    // Remove the clan role from every assigned player before deleting the role.
    await removeRoleFromMembers(guild, players, clan.role_id);

    // Delete the clan's Discord role
    if (clan.role_id) {
      try {
        const role = await guild.roles.fetch(clan.role_id).catch(() => null);
        if (role) await role.delete('Clan removed from database').catch(() => {});
      } catch (_) {}
    }

    const clanName = clan.name;
    db.delete('clans', clanId);
    return interaction.editReply(buildClanCrudPanel({ info: '**' + clanName + '** removed from the database.' }));
  }
}

module.exports = { handleClanCrudInteraction };
