'use strict';
const { isBotolaManager } = require('../utils/permissions');
const { getFed }          = require('../federation/fedPanel1');
const { db }              = require('../utils/database');
const { buildRosterLauncher, getRosterConfig, getRoster, getRosterForMember } = require('../federation/fedRosterPanel');

// Track last &clan launcher message per user so it can be deleted on next use
const _lastLauncherMsg = new Map();

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild)     return;

    const content = message.content.trim();
    const lower   = content.toLowerCase();

    // ── =fleader @user ────────────────────────────────────────────────────────
    if (lower.startsWith('&leader')) {
      if (!isBotolaManager(message.member)) {
        return message.reply({ content: '❌ Managers only.' });
      }

      const cfg = getRosterConfig();
      if (!cfg.leaderRoleId) {
        return message.reply({ content: '❌ No Clan Leader role set. Use `/clans_fed_database` → ⚙️ Settings → Set Clan Leader role first.' });
      }

      const mentioned = message.mentions.members.first();
      if (!mentioned) {
        return message.reply({ content: '❌ Usage: `&leader @user`' });
      }

      // Block if mentioned is already a registered player in any clan
      const _allRostersLdr = db.get('Clan_Registry') || [];
      const _playerClan = _allRostersLdr.find(r =>
        (r.players || []).some(p => String(p.discord_user || '').replace(/\D/g, '') === mentioned.id)
      );
      if (_playerClan) {
        return message.reply({ content: '❌ <@' + mentioned.id + '> is already a registered player in **' + (_playerClan.clan_name || 'a clan') + '**. Remove them from that roster first.' });
      }

      // Give them the leader role
      await mentioned.roles.add(cfg.leaderRoleId).catch(() => {});


      return message.channel.send({
        flags: 32768,
        components: [{
          type: 17,
          accent_color: 0x00FF8C,
          components: [
            { type: 10, content: '<@' + mentioned.id + '> you are now a Clan Leader. Use `&clan` to open your clan registration panel.' },
          ],
        }],
      });
    }


    // ── =coleader ─────────────────────────────────────────────────────────────
    if (lower.startsWith('&coleader')) {
      const cfg = getRosterConfig();
      if (!cfg.leaderRoleId) {
        return message.reply({ content: '❌ No Clan Leader role configured yet.', flags: 64 });
      }
      if (!message.member.roles.cache.has(cfg.leaderRoleId)) {
        return message.reply({ content: '❌ You do not have the Clan Leader role.', flags: 64 });
      }
      const mentioned = message.mentions.members.first();
      if (!mentioned) {
        return message.reply({ content: '❌ Mention a member — usage: `&coleader @user`', flags: 64 });
      }
      if (mentioned.id === message.author.id) {
        return message.reply({ content: '❌ You cannot add yourself as co-leader.', flags: 64 });
      }

      const roster = getRoster(message.author.id);
      if (!roster || roster.leader_discord_id !== message.author.id) {
        return message.reply({ content: '❌ You must be the main leader of a clan to assign co-leaders.', flags: 64 });
      }

      // Block: cannot give co-leader to someone who is already a main leader of their own clan
      const _allRostersCL = db.get('Clan_Registry') || [];
      const _mentionedIsLeader = _allRostersCL.find(r => r.leader_discord_id === mentioned.id);
      if (_mentionedIsLeader) {
        return message.reply({ content: '❌ <@' + mentioned.id + '> is already a Clan Leader of **' + (_mentionedIsLeader.clan_name || 'a clan') + '** and cannot be assigned as co-leader.', flags: 64 });
      }

      const coLeaders = roster.co_leaders || [];

      // Toggle: if already co-leader, remove them
      if (coLeaders.includes(mentioned.id)) {
        db.update('Clan_Registry', roster.id, {
          co_leaders: coLeaders.filter(uid => uid !== mentioned.id),
          updated_at: new Date().toISOString(),
        });
        // Only remove the role if this person is no longer a leader or co-leader in ANY clan
        const _rostersAfterRemove = db.get('Clan_Registry') || [];
        const _stillNeedsRole = _rostersAfterRemove.some(r =>
          r.leader_discord_id === mentioned.id ||
          (r.co_leaders || []).includes(mentioned.id)
        );
        if (!_stillNeedsRole && cfg.coLeaderRoleId) {
          try { await mentioned.roles.remove(cfg.coLeaderRoleId); } catch (_) {}
        }
        await message.delete().catch(() => {});
        return message.channel.send({
          flags: 32768,
          components: [{
            type: 17,
            accent_color: 0xED4245,
            components: [
              { type: 10, content: '<@' + mentioned.id + '> has been removed as co-leader from **' + (roster.clan_name || 'your clan') + '**.' },
            ],
          }],
        });
      }

      // Max 3 co-leaders
      if (coLeaders.length >= 3) {
        return message.reply({ content: '❌ You already have **3 co-leaders** (maximum). Remove one before adding another.', flags: 64 });
      }

      // Add to co_leaders list in roster
      db.update('Clan_Registry', roster.id, {
        co_leaders: [...coLeaders, mentioned.id],
        updated_at: new Date().toISOString(),
      });

      // Give them the co-leader role so they can open the panel
      if (cfg.coLeaderRoleId) { try { await mentioned.roles.add(cfg.coLeaderRoleId); } catch (_) {} }

      await message.delete().catch(() => {});
      return message.channel.send({
        flags: 32768,
        components: [{
          type: 17,
          accent_color: 0x00FF8C,
          components: [
            { type: 10, content: '<@' + mentioned.id + '> has been assigned as co-leader of **' + (roster.clan_name || 'your clan') + '** (' + (coLeaders.length + 1) + '/3). They can now use `&clan` to manage the roster.' },
          ],
        }],
      });
    }

    // ── =giveclan ─────────────────────────────────────────────────────────────
    if (lower.startsWith('&giveclan')) {
      const cfg = getRosterConfig();
      if (!cfg.leaderRoleId) {
        return message.reply({ content: '❌ No Clan Leader role configured yet.' });
      }

      // Must be main leader (not just co-leader)
      const senderRoster = (db.get('Clan_Registry') || []).find(r => r.leader_discord_id === message.author.id);
      if (!senderRoster) {
        return message.reply({ content: '❌ Only the **main leader** of a clan can transfer leadership.' });
      }

      const mentioned = message.mentions.members.first();
      if (!mentioned) {
        return message.reply({ content: '❌ Usage: `&giveclan @user`' });
      }
      if (mentioned.id === message.author.id) {
        return message.reply({ content: '❌ You cannot transfer leadership to yourself.' });
      }

      // Block if mentioned is already a main leader of a DIFFERENT clan
      const _allR = db.get('Clan_Registry') || [];
      const _theirClan = _allR.find(r => r.leader_discord_id === mentioned.id);
      if (_theirClan) {
        return message.reply({ content: '❌ <@' + mentioned.id + '> is already the main leader of **' + (_theirClan.clan_name || 'another clan') + '**.' });
      }

      const oldLeaderId   = message.author.id;
      const newLeaderId   = mentioned.id;
      const newLeaderName = mentioned.displayName || mentioned.user?.username || '';

      // Build updated co_leaders: remove new leader (they're promoted), add old leader
      const currentCo = senderRoster.co_leaders || [];
      const updatedCo = [
        ...currentCo.filter(uid => uid !== newLeaderId),
        oldLeaderId,
      ];

      // Transfer in DB
      db.update('Clan_Registry', senderRoster.id, {
        leader_discord_id: newLeaderId,
        leader_name:       newLeaderName,
        co_leaders:        updatedCo,
        updated_at:        new Date().toISOString(),
      });

      // Give new leader the role (if they don't have it yet — e.g. they were only a co-leader)
      try { await mentioned.roles.add(cfg.leaderRoleId); } catch (_) {}

      await message.delete().catch(() => {});
      return message.channel.send({
        flags: 32768,
        components: [{
          type: 17,
          accent_color: 0xF0B429,
          components: [
            { type: 10, content: '👑 Leadership of **' + (senderRoster.clan_name || 'the clan') + '** has been transferred to <@' + newLeaderId + '>.\n<@' + oldLeaderId + '> is now a co-leader.' },
          ],
        }],
      });
    }


    // ── &removeleader @user ─────────────────────────────────────────────────────────────────────────────
    if (lower.startsWith('&removeleader')) {
      if (!isBotolaManager(message.member)) {
        return message.reply({ content: '❌ Managers only.' });
      }
      const cfg = getRosterConfig();
      const mentioned = message.mentions.members.first();
      if (!mentioned) {
        return message.reply({ content: '❌ Usage: `&removeleader @user`' });
      }

      const roster = getRoster(mentioned.id);

      // Remove leader Discord role
      if (cfg.leaderRoleId) await mentioned.roles.remove(cfg.leaderRoleId).catch(() => {});

      // Strip co-leader roles from this clan's co-leaders if they hold no other co-leader slot
      if (roster && cfg.coLeaderRoleId) {
        const allRosters = db.get('Clan_Registry') || [];
        for (const coId of (roster.co_leaders || [])) {
          const stillNeeds = allRosters.some(r =>
            r.id !== roster.id && (
              r.leader_discord_id === coId ||
              (r.co_leaders || []).includes(coId)
            )
          );
          if (!stillNeeds) {
            const coMember = await message.guild.members.fetch(coId).catch(() => null);
            if (coMember) await coMember.roles.remove(cfg.coLeaderRoleId).catch(() => {});
          }
        }
      }

      // Delete clan Discord role if one was created
      if (roster?.clan_role_id) {
        const clanRole = message.guild.roles.cache.get(roster.clan_role_id);
        if (clanRole) await clanRole.delete('Clan removed via &removeleader').catch(() => {});
      }

      // Delete Clan_Registry entry
      if (roster) db.delete('Clan_Registry', roster.id);

      await message.delete().catch(() => {});
      return message.channel.send({
        flags: 32768,
        components: [{
          type: 17,
          accent_color: 0xED4245,
          components: [
            { type: 10, content: '❌ <@' + mentioned.id + '> has been removed as Clan Leader' + (roster?.clan_name ? ' of **' + roster.clan_name + '**' : '') + '. Their clan registration has been deleted.' },
          ],
        }],
      });
    }


    // ── &removecoleader @user ───────────────────────────────────────────────────────────────────────
    if (lower.startsWith('&removecoleader')) {
      const cfg = getRosterConfig();
      const mentioned = message.mentions.members.first();
      if (!mentioned) {
        return message.reply({ content: '❌ Usage: `&removecoleader @user`' });
      }

      // Find which clan this person is co-leader of
      const allRosters = db.get('Clan_Registry') || [];
      const targetRoster = allRosters.find(r => (r.co_leaders || []).includes(mentioned.id));
      if (!targetRoster) {
        return message.reply({ content: '❌ <@' + mentioned.id + '> is not a co-leader of any clan.' });
      }

      // Only allow: manager OR the main leader of that clan
      const isManager = isBotolaManager(message.member);
      const isOwnLeader = message.author.id === targetRoster.leader_discord_id;
      if (!isManager && !isOwnLeader) {
        return message.reply({ content: '❌ Only managers or the clan’s main leader can remove a co-leader.' });
      }

      // Remove from co_leaders list
      db.update('Clan_Registry', targetRoster.id, {
        co_leaders: (targetRoster.co_leaders || []).filter(id => id !== mentioned.id),
        updated_at: new Date().toISOString(),
      });

      // Remove co-leader Discord role if they don’t hold it elsewhere
      if (cfg.coLeaderRoleId) {
        const stillNeeds = (db.get('Clan_Registry') || []).some(r =>
          r.leader_discord_id === mentioned.id ||
          (r.co_leaders || []).includes(mentioned.id)
        );
        if (!stillNeeds) await mentioned.roles.remove(cfg.coLeaderRoleId).catch(() => {});
      }

      await message.delete().catch(() => {});
      return message.channel.send({
        flags: 32768,
        components: [{
          type: 17,
          accent_color: 0xED4245,
          components: [
            { type: 10, content: '❌ <@' + mentioned.id + '> has been removed as co-leader of **' + (targetRoster.clan_name || 'the clan') + '**.' },
          ],
        }],
      });
    }

    // ── =frosters ─────────────────────────────────────────────────────────────
    if (lower === '&clan') {
      const cfg = getRosterConfig();
      if (!cfg.leaderRoleId) {
        return message.reply({ content: '❌ No Clan Leader role configured yet.' });
      }
      const _membership = getRosterForMember(message.author.id);
      if (!message.member.roles.cache.has(cfg.leaderRoleId) && !(cfg.coLeaderRoleId && message.member.roles.cache.has(cfg.coLeaderRoleId)) && !_membership) {
        return message.reply({ content: '❌ You do not have the Clan Leader or Co-Leader role.' });
      }

      // Delete the command message to keep channel clean
      await message.delete().catch(() => {});

      // Delete previous launcher for this user if it still exists
      const prevMsg = _lastLauncherMsg.get(message.author.id);
      if (prevMsg) prevMsg.delete().catch(() => {});

      // Post new launcher and track it
      const launcher = await message.channel.send(buildRosterLauncher(message.member));
      _lastLauncherMsg.set(message.author.id, launcher);
      setTimeout(() => {
        launcher.delete().catch(() => {});
        _lastLauncherMsg.delete(message.author.id);
      }, 15_000);
    }

    // ── ?referee ──────────────────────────────────────────────────────────────
    if (!lower.startsWith('&referee')) return;

    if (!isBotolaManager(message.member)) {
      return message.reply('❌ Managers only.');
    }

    const fed   = getFed();
    const catId = fed.channels?.category;
    if (!catId) {
      return message.reply('❌ No match category configured. Set one in the Federation → Channels & Roles panel first.');
    }

    const channel = message.channel;
    if (!channel || channel.parentId !== catId) {
      return message.reply('❌ This only works inside a federation match channel.');
    }

    const mentioned = message.mentions.users.first();
    if (!mentioned) {
      return message.reply('❌ Usage: `&referee @user`');
    }

    const member = await message.guild.members.fetch(mentioned.id).catch(() => null);
    if (!member) {
      return message.reply('❌ Could not find that user in this server.');
    }

    await channel.permissionOverwrites.edit(
      mentioned.id,
      { ViewChannel: true, SendMessages: true },
      { reason: 'Federation referee — added by ' + message.author.tag }
    );

    return message.reply('✅ <@' + mentioned.id + '> added as referee.');
  },
};
