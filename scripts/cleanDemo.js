'use strict';
/**
 * One-time cleanup — run from gotsi project root:
 *   node scripts/cleanDemo.js
 *
 * Removes any tournament whose name contains "demo", "saison", or "test"
 * (case-insensitive) so they no longer appear in /manage or /botola panels.
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

const JUNK = /demo|saison|test/i;

const junkTournaments = db.get('tournaments').filter(t =>
  JUNK.test(t.name) || JUNK.test(t.template || '')
);

if (!junkTournaments.length) {
  console.log('No junk tournaments found — nothing to clean.');
  process.exit(0);
}

console.log(`Found ${junkTournaments.length} junk tournament(s):`);
for (const t of junkTournaments) {
  console.log(`  → [${t.id}] ${t.name} (${t.template} S${t.season})`);

  db.deleteWhere('tournament_teams', tt => tt.tournament_id === t.id);
  db.deleteWhere('matches',          m  => m.tournament_id  === t.id);
  db.deleteWhere('winners',          w  => w.tournament_id  === t.id);
  db.delete('tournaments', t.id);

  console.log(`     ✓ Deleted tournament + all related data`);
}

console.log('\nDone. Restart the bot for changes to take effect.');
