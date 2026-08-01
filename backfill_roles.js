'use strict';
const { Client, GatewayIntentBits } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const DB_PATH  = path.join('/home/ubuntu/goatsi', 'data/db.json');
const TOKEN    = process.env.DISCORD_TOKEN;
const GUILD_ID = '1462978668241621158';
const BELOW_ROLE_ID = '1529939492495036456'; // position clan role below this
const MEF_ROLE_ID   = '1471579185851011073';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  console.log('Bot ready:', client.user.tag);

  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const rosters = db.fed_rosters || [];
  const guild   = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch(); // cache all members

  // Get the "below" role to determine position
  const belowRole = await guild.roles.fetch(BELOW_ROLE_ID).catch(() => null);
  const position  = belowRole ? belowRole.position - 1 : undefined;

  for (const roster of rosters) {
    if (!roster.clan_tag) { console.log(`Roster ${roster.id} has no tag, skipping`); continue; }

    console.log(`\n--- Roster ${roster.id}: [${roster.clan_tag}] ${roster.clan_name} ---`);

    // Create new Discord role
    const newRole = await guild.roles.create({
      name:   roster.clan_tag,
      color:  0x00FFAC,
      reason: `MEF Federation backfill: ${roster.clan_name} [${roster.clan_tag}]`,
      ...(position !== undefined ? { position } : {}),
    }).catch(err => { console.error('  Failed to create role:', err.message); return null; });

    if (!newRole) continue;
    console.log(`  Created role: ${newRole.name} (${newRole.id})`);

    // Save to DB
    roster.clan_role_id = newRole.id;

    // Collect all member Discord IDs (leader + players)
    const memberIds = new Set();
    if (roster.leader_discord_id) memberIds.add(String(roster.leader_discord_id));
    for (const p of (roster.players || [])) {
      if (p.discord_user) memberIds.add(String(p.discord_user));
    }

    // Assign clan role + MEF role to each member
    for (const uid of memberIds) {
      const member = guild.members.cache.get(uid);
      if (!member) { console.log(`  Member ${uid} not found in guild, skipping`); continue; }
      await member.roles.add(newRole.id).catch(e => console.log(`  Failed clan role for ${uid}: ${e.message}`));
      await member.roles.add(MEF_ROLE_ID).catch(e => console.log(`  Failed MEF role for ${uid}: ${e.message}`));
      console.log(`  Assigned roles to ${member.user.username} (${uid})`);
    }
  }

  // Write updated DB back
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
  console.log('\nDB saved. Done!');
  process.exit(0);
});

client.login(TOKEN);
