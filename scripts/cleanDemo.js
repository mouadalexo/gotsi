'use strict';
/**
 * Run from gotsi project root:
 *   node scripts/cleanDemo.js
 *
 * Deletes every tournament that is NOT NSEL or MCL, along with all related
 * matches, tournament_teams, and winners rows.
 */

const path = require('path');
const fs   = require('fs');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx === -1) return;
    process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
}

const { db } = require('../src/utils/database');

const KEEP = /^(NSEL|MCL)$/i;

const all = db.get('tournaments');
console.log(`Total tournaments in DB: ${all.length}`);
all.forEach(t => console.log(`  [${t.id}] name="${t.name}" template="${t.template}" status="${t.status}"`));

const toDelete = all.filter(t => !KEEP.test(t.template || '') && !KEEP.test(t.name || ''));

if (!toDelete.length) {
  console.log('\nNothing to delete — DB is already clean.');
  process.exit(0);
}

console.log(`\nDeleting ${toDelete.length} tournament(s):`);
for (const t of toDelete) {
  console.log(`  → removing [${t.id}] "${t.name}" (template: ${t.template})`);
  db.deleteWhere('tournament_teams', r => r.tournament_id === t.id);
  db.deleteWhere('matches',          r => r.tournament_id === t.id);
  db.deleteWhere('winners',          r => r.tournament_id === t.id);
  db.delete('tournaments', t.id);
}

console.log('\n✅ Done. Restart the bot.');
