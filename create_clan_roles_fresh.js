'use strict';
const { Client, GatewayIntentBits } = require('/home/ubuntu/goatsi/node_modules/discord.js');
const fs   = require('fs');

const DB_PATH         = '/home/ubuntu/goatsi/data/db.json';
const GUILD_ID        = '1462978668241621158';
const CLAN_LEADER_ROLE_ID = '1529939782233227365'; // from clans_leader_role_id in config
const MEF_ROLE_ID     = '1471579185851011073';
const ROLE_COLOR      = 0x00FFAC;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once('ready', async () => {
  console.log('Bot ready:', client.user.tag);

  const db      = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const rosters = db.fed_rosters || [];
  const guild   = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch();

  // Position new roles just below Clan Leader role
  const leaderRole = await guild.roles.fetch(CLAN_LEADER_ROLE_ID).catch(() => null);
  if (!leaderRole) { console.error('Clan Leader role not found!'); process.exit(1); }
  const targetPosition = leaderRole.position - 1;
  console.log(`Clan Leader is at position ${leaderRole.position}, new roles will target position ${targetPosition}\n`);

  for (const roster of rosters) {
    if (!roster.clan_tag) { console.log(`Roster ${roster.id} has no tag, skipping`); continue; }
    console.log(`--- [${roster.clan_tag}] ${roster.clan_name} ---`);

    // Create fresh role
    const newRole = await guild.roles.create({
      name:     roster.clan_tag,
      color:    ROLE_COLOR,
      position: targetPosition,
      reason:   `MEF fresh clan role: ${roster.clan_name} [${roster.clan_tag}]`,
    }).catch(err => { console.error('  Failed to create role:', err.message); return null; });

    if (!newRole) continue;
    console.log(`  Created role: ${newRole.name} (${newRole.id}) at position ${newRole.position}`);

    // Save new role ID to DB
    roster.clan_role_id = newRole.id;

    // Collect all member Discord IDs
    const memberIds = new Set();
    if (roster.leader_discord_id) memberIds.add(String(roster.leader_discord_id));
    for (const p of (roster.players || [])) {
      if (p.discord_user) memberIds.add(String(p.discord_user));
    }
    if (roster.co_leaders) {
      for (const id of roster.co_leaders) memberIds.add(String(id));
    }

    console.log(`  Members to assign: ${memberIds.size}`);

    for (const uid of memberIds) {
      const member = guild.members.cache.get(uid);
      if (!member) { console.log(`  ${uid} — not in guild, skipping`); continue; }
      await member.roles.add(newRole.id).catch(e => console.log(`  clan role fail ${member.user.username}: ${e.message}`));
      await member.roles.add(MEF_ROLE_ID).catch(e => console.log(`  MEF role fail ${member.user.username}: ${e.message}`));
      console.log(`  ✓ ${member.user.username} (${uid})`);
    }
    console.log('');
  }

  // Save DB
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
  console.log('DB saved. All done!');
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
