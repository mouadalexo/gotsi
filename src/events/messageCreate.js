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
    if (lower.startsWith('=fleader')) {
      if (!isBotolaManager(message.member)) {
        return message.reply({ content: '❌ Managers only.' });
      }

      const cfg = getRosterConfig();
      if (!cfg.leaderRoleId) {
        return message.reply({ content: '❌ No Clan Leader role set. Use `/clans_fed_database` → ⚙️ Settings → Set Clan Leader role first.' });
      }

      const mentioned = message.mentions.members.first();
      if (!mentioned) {
        return message.reply({ content: '❌ Usage: `=fleader @user`' });
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
          clan_name: '',
          clan_tag: '',
          social_media: '',
          players: [],
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
            { type: 10, content: '<@' + mentioned.id + '> you are now a Clan Leader. Use `=frosters` to open your clan registration panel.' },
          ],
        }],
      });
    }


    // ── =fcoleader ────────────────────────────────────────────────────────────
    if (lower.startsWith('=fcoleader')) {
      const cfg = getRosterConfig();
      if (!cfg.leaderRoleId) {
        return message.reply({ content: '❌ No Clan Leader role configured yet.', flags: 64 });
      }
      if (!message.member.roles.cache.has(cfg.leaderRoleId)) {
        return message.reply({ content: '❌ You do not have the Clan Leader role.', flags: 64 });
      }
      const mentioned = message.mentions.members.first();
      if (!mentioned) {
        return message.reply({ content: '❌ Mention a member — usage: `=fcoleader @user`', flags: 64 });
      }
      if (mentioned.id === message.author.id) {
        return message.reply({ content: '❌ You cannot add yourself as co-leader.', flags: 64 });
      }

      const roster = getRoster(message.author.id);
      if (!roster || roster.leader_discord_id !== message.author.id) {
        return message.reply({ content: '❌ You must be the main leader to assign co-leaders.', flags: 64 });
      }

      const coLeaders = roster.co_leaders || [];
      if (coLeaders.includes(mentioned.id)) {
        return message.reply({ content: '❌ <@' + mentioned.id + '> is already a co-leader of your clan.', flags: 64 });
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
            { type: 10, content: '<@' + mentioned.id + '> has been assigned as co-leader of **' + (roster.clan_name || 'your clan') + '**. They can now use `=frosters` to manage the roster.' },
          ],
        }],
      });
    }

    // ── =frosters ─────────────────────────────────────────────────────────────
    if (lower === '=frosters') {
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
    if (!lower.startsWith('?referee')) return;

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
      return message.reply('❌ Usage: `?referee @user`');
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
