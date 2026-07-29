'use strict';
const { isBotolaManager } = require('../utils/permissions');
const { getFed }          = require('../panels/fedPanel1');
const { db }              = require('../utils/database');
const { buildRosterLauncher, getRosterConfig } = require('../panels/fedRosterPanel');

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
      const _allRostersLdr = db.get('fed_rosters') || [];
      const _playerClan = _allRostersLdr.find(r =>
        (r.players || []).some(p => String(p.discord_user || '').replace(/\D/g, '') === mentioned.id)
      );
      if (_playerClan) {
        return message.reply({ content: '❌ <@' + mentioned.id + '> is already a registered player in **' + (_playerClan.clan_name || 'a clan') + '**. Remove them from that roster first.' });
      }

      // Give them the leader role
      await mentioned.roles.add(cfg.leaderRoleId).catch(() => {});

      // Create empty roster entry if none exists
      const existing = (db.get('fed_rosters') || []).find(r => r.leader_discord_id === mentioned.id);
      if (!existing) {
        const fed = db.getConfig('federation') || {};
        db.insert('fed_rosters', {
          guild_id: message.guild.id,
          leader_discord_id: mentioned.id,
          leader_name: mentioned.displayName || mentioned.user?.username || '',
          clan_name: '',
          clan_tag: '',
          social_media: '',
          players: [],
          co_leaders: [],
          status: 'draft',
          clan_role_id: null,
          season: fed.season || 1,
          updated_at: new Date().toISOString(),
        });
      }

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
      const _allRostersCL = db.get('fed_rosters') || [];
      const _mentionedIsLeader = _allRostersCL.find(r => r.leader_discord_id === mentioned.id);
      if (_mentionedIsLeader) {
        return message.reply({ content: '❌ <@' + mentioned.id + '> is already a Clan Leader of **' + (_mentionedIsLeader.clan_name || 'a clan') + '** and cannot be assigned as co-leader.', flags: 64 });
      }

      const coLeaders = roster.co_leaders || [];

      // Toggle: if already co-leader, remove them
      if (coLeaders.includes(mentioned.id)) {
        db.update('fed_rosters', roster.id, {
          co_leaders: coLeaders.filter(uid => uid !== mentioned.id),
          updated_at: new Date().toISOString(),
        });
        // Only remove the role if this person is no longer a leader or co-leader in ANY clan
        const _rostersAfterRemove = db.get('fed_rosters') || [];
        const _stillNeedsRole = _rostersAfterRemove.some(r =>
          r.leader_discord_id === mentioned.id ||
          (r.co_leaders || []).includes(mentioned.id)
        );
        if (!_stillNeedsRole) {
          try { await mentioned.roles.remove(cfg.leaderRoleId); } catch (_) {}
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
      db.update('fed_rosters', roster.id, {
        co_leaders: [...coLeaders, mentioned.id],
        updated_at: new Date().toISOString(),
      });

      // Give them the leader role so they can open the panel
      try { await mentioned.roles.add(cfg.leaderRoleId); } catch (_) {}

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
      const senderRoster = (db.get('fed_rosters') || []).find(r => r.leader_discord_id === message.author.id);
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
      const _allR = db.get('fed_rosters') || [];
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
      db.update('fed_rosters', senderRoster.id, {
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

    // ── =frosters ─────────────────────────────────────────────────────────────
    if (lower === '&clan') {
      const cfg = getRosterConfig();
      if (!cfg.leaderRoleId) {
        return message.reply({ content: '❌ No Clan Leader role configured yet.' });
      }
      if (!message.member.roles.cache.has(cfg.leaderRoleId)) {
        return message.reply({ content: '❌ You do not have the Clan Leader role.' });
      }

      // Delete the command message to keep channel clean
      await message.delete().catch(() => {});

      // Post launcher with Open button — auto-delete after 10 s
      const launcher = await message.channel.send(buildRosterLauncher(message.member));
      setTimeout(() => launcher.delete().catch(() => {}), 15_000);
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
