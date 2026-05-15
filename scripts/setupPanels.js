'use strict';
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const path = require('path');
const fs   = require('fs');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx === -1) return;
    process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
}

const { db }         = require('./src/utils/database');
const { buildPanel1 } = require('./src/panels/panel1');
const { buildPanel2 } = require('./src/panels/panel2');
const { buildPanel3 } = require('./src/panels/panel3');

const MGMT_CATEGORY = '1504650432268734656';
const GUILD_ID      = '1462978668241621158';

// Known channels per tournament
const NSEL_CHANNELS = {
  schedule:   '1462982363267993672',  // 📆・MATCH-SCHEDULE
  results:    '1463162274192556072',  // 📝・NATA2IJ
  standings:  '1462982588661628938',  // 📋・LIST
  screen:     '1462982459187532040',  // 🤳・SCREEN
};
const MCL_CHANNELS = {
  schedule:   '1463153753078108180',  // 📆・MATCH-SCHEDULE
  results:    '1463162354656088188',  // 📝・NATA2IJ
  standings:  '1463154002660429885',  // 📋・LIST
  screen:     '1463153706185785404',  // 🤳・SCREEN
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once('clientReady', async () => {
  console.log(`Ready: ${client.user.tag}`);
  const guild = await client.guilds.fetch(GUILD_ID);

  const tournaments = db.get('tournaments');
  const nsel = tournaments.find(t => t.template === 'NSEL');
  const mcl  = tournaments.find(t => t.template === 'MCL');

  if (!nsel || !mcl) {
    console.error('Could not find NSEL or MCL tournament in DB');
    client.destroy(); process.exit(1);
  }

  async function setupTournament(t, knownChannels, label) {
    console.log(`\n=== Setting up ${label} (id:${t.id}) ===`);

    // 1. Create management channel in the mgmt category
    const mgmtCh = await guild.channels.create({
      name: `${label.toLowerCase()}-management`,
      type: 0,
      parent: MGMT_CATEGORY,
      topic: `${t.name} Season ${t.season} — Management panels`,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      ],
    });
    console.log(`  ✓ Created management channel: #${mgmtCh.name} (${mgmtCh.id})`);

    // 2. Save channels to DB
    const channels = {
      management:  mgmtCh.id,
      registration: mgmtCh.id,
      schedule:    knownChannels.schedule,
      results:     knownChannels.results,
      standings:   knownChannels.standings,
    };
    db.update('tournaments', t.id, { channels });
    const updated = db.findById('tournaments', t.id);
    console.log(`  ✓ Channels saved to DB`);

    // 3. Post Panel 1 (management panel)
    const p1payload = buildPanel1(updated);
    const p1msg = await mgmtCh.send(p1payload);
    db.update('tournaments', t.id, { panel1_ref: { channelId: mgmtCh.id, messageId: p1msg.id } });
    console.log(`  ✓ Panel 1 posted: ${p1msg.id}`);

    // 4. Post Panel 2 (registration panel)
    const p2payload = buildPanel2(updated);
    const p2msg = await mgmtCh.send(p2payload);
    db.update('tournaments', t.id, { panel2_ref: { channelId: mgmtCh.id, messageId: p2msg.id } });
    console.log(`  ✓ Panel 2 posted: ${p2msg.id}`);

    // 5. Post Panel 3 (post & preview panel)
    const finalT = db.findById('tournaments', t.id);
    const p3payload = buildPanel3(finalT);
    const p3msg = await mgmtCh.send(p3payload);
    db.update('tournaments', t.id, { panel3_ref: { channelId: mgmtCh.id, messageId: p3msg.id } });
    console.log(`  ✓ Panel 3 posted: ${p3msg.id}`);

    console.log(`  ✅ ${label} setup complete → <#${mgmtCh.id}>`);
  }

  await setupTournament(nsel, NSEL_CHANNELS, 'NSEL');
  await setupTournament(mcl,  MCL_CHANNELS,  'MCL');

  console.log('\n✅ All done! Managers can now use /botola to access panels.');
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(e => {
  console.error('Login failed:', e.message);
  process.exit(1);
});

setTimeout(() => { console.error('Timeout'); client.destroy(); process.exit(1); }, 60000);
