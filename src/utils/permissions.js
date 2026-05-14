const { PermissionFlagsBits } = require('discord.js');

function isManager(member) {
  if (!member) return false;
  return (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.roles.cache.some(r =>
      r.name.toLowerCase().includes('manager') ||
      r.name.toLowerCase().includes('admin') ||
      r.name.toLowerCase().includes('tournament')
    )
  );
}

function requireManager(member) {
  return isManager(member);
}

module.exports = { isManager, requireManager };
