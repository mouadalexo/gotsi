'use strict';
const { isBotolaManager } = require('../utils/permissions');
const { getFed }          = require('../panels/fedPanel1');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild)     return;

    const content = message.content.trim();
    if (!content.toLowerCase().startsWith('?referee')) return;

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
      return message.reply('❌ Usage: `referee @user`');
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
