'use strict';
const { Client, GatewayIntentBits } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const DB_PATH       = '/home/ubuntu/goatsi/data/db.json';
const TOKEN         = process.env.DISCORD_TOKEN;
const GUILD_ID      = '1462978668241621158';
const BELOW_ROLE_ID = '1529939492495036456';
const MEF_ROLE_ID   = '1471579185851011073';

// Only process these roster IDs (SRP=4, TGR=6, YAY=5)
const TARGET_IDS = new Set([4, 5, 6]);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  console.log('Bot ready:', client.user.tag);

  const db      = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const rosters = (db.fed_rosters || []).filter(r => TARGET_IDS.has(r.id));
  const guild   = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();

  const belowRole = await guild.roles.fetch(BELOW_ROLE_ID).catch(() => null);
  const position  = belowRole ? belowRole.position - 1 : undefined;

  for (const roster of rosters) {
    console.log(`\n--- Roster ${roster.id}: [${roster.clan_tag}] ${roster.clan_name} ---`);

    const newRole = await guild.roles.create({
      name:   roster.clan_tag,
      colors: 0x00FFAC,
      reason: `MEF Federation backfill: ${roster.clan_name} [${roster.clan_tag}]`,
      ...(position !== undefined ? { position } : {}),
    }).catch(err => { console.error('  Failed to create role:', err.message); return null; });

    if (!newRole) continue;
    console.log(`  Created role: ${newRole.name} (${newRole.id})`);

    roster.clan_role_id = newRole.id;

    const memberIds = new Set();
    if (roster.leader_discord_id) memberIds.add(String(roster.leader_discord_id));
    for (const p of (roster.players || [])) {
      if (p.discord_user) memberIds.add(String(p.discord_user));
    }

    for (const uid of memberIds) {
      const member = guild.members.cache.get(uid);
      if (!member) { console.log(`  ${uid} not in guild, skipping`); continue; }
      await member.roles.add(newRole.id).catch(e => console.log(`  clan role fail ${uid}: ${e.message}`));
      await member.roles.add(MEF_ROLE_ID).catch(e => console.log(`  MEF role fail ${uid}: ${e.message}`));
      console.log(`  OK: ${member.user.username}`);
    }
  }

  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_PATH);
  console.log('\nDB saved. All done!');
  process.exit(0);
});

client.login(TOKEN);
