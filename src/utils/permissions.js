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
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const db = getDb();
  const managerRoleId = db.getConfig('manager_role_id');
  if (managerRoleId && member.roles.cache.has(managerRoleId)) return true;
  const dbAdmins = db.get('admins') || [];
  return dbAdmins.some(a => a.discord_id === member.id);
}

// Check for /botola panels, /panels, settings:
// Discord Administrators, users with the configured manager_role_id, OR manually added managers.
function isBotolaManager(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const db = getDb();
  const managerRoleId = db.getConfig('manager_role_id');
  if (managerRoleId && member.roles.cache.has(managerRoleId)) return true;
  const dbAdmins = db.get('admins') || [];
  return dbAdmins.some(a => a.discord_id === member.id && a.role === 'manager');
}

function requireManager(member) { return isManager(member); }
function requireAdmin(member)   { return isAdmin(member); }

module.exports = { isManager, isAdmin, isBotolaManager, requireManager, requireAdmin };
