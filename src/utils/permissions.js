'use strict';
const { PermissionFlagsBits } = require('discord.js');

let _db = null;
function getDb() {
  if (!_db) _db = require('./database').db;
  return _db;
}

function isAdmin(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const dbAdmins = getDb().get('admins') || [];
  return dbAdmins.some(a => a.discord_id === member.id && a.role === 'admin');
}

function isManager(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.roles.cache.some(r =>
    r.name.toLowerCase().includes('manager') ||
    r.name.toLowerCase().includes('admin') ||
    r.name.toLowerCase().includes('tournament')
  )) return true;
  const dbAdmins = getDb().get('admins') || [];
  return dbAdmins.some(a => a.discord_id === member.id);
}

// Strict check for /botola and its panels:
// Only Discord Administrators OR users added as "manager" via the /admin bot panel.
function isBotolaManager(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const dbAdmins = getDb().get('admins') || [];
  return dbAdmins.some(a => a.discord_id === member.id && a.role === 'manager');
}

function requireManager(member) { return isManager(member); }
function requireAdmin(member)   { return isAdmin(member); }

module.exports = { isManager, isAdmin, isBotolaManager, requireManager, requireAdmin };
