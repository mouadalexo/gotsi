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

      return message.reply({
        content: '✅ <@' + mentioned.id + '> has been assigned as a **Clan Leader** and can now use `=frosters` to register their clan.',
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

      // Post launcher with Open button
      return message.channel.send(buildRosterLauncher(message.member));
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
