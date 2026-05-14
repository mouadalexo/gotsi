'use strict';
/**
 * One-time setup — run from goatsi project root:
 *   node scripts/setupWinners.js
 */

const path = require('path');
const fs   = require('fs');

// Load .env manually (no dotenv dependency needed)
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  });
}

const { Client, GatewayIntentBits } = require('discord.js');
const { db }                        = require('../src/utils/database');
const { buildWinnersHistoryPayload } = require('../src/utils/winnersHistory');

const CATEGORY_ID = '1501648686705545378';

const TARGET_MAP = [
  { messageId: '1501761409049039021', template: 'NSEL', label: 'NSEL' },
  { messageId: '1501757454361563156', template: 'MCL',  label: 'MCL'  },
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once('clientReady', async () => {
  console.log(`Bot ready: ${client.user.tag}`);

  // 1. Save winners history category to DB config
  db.setConfig('winners_history_category', CATEGORY_ID);
  console.log(`✓ Set winners_history_category → ${CATEGORY_ID}`);

  // 2. Find the guild
  const guild = client.guilds.cache.first();
  if (!guild) { console.error('No guild found!'); client.destroy(); return; }
  console.log(`Guild: ${guild.name} (${guild.id})`);

  // 3. Get all text channels in the Winners History category
  const channels = guild.channels.cache.filter(
    c => c.parentId === CATEGORY_ID && c.isTextBased()
  );
  console.log(`Channels in category: ${channels.map(c => c.name).join(', ')}`);

  // 4. Process each target message
  for (const target of TARGET_MAP) {
    console.log(`\n── Processing ${target.label} (msg: ${target.messageId}) ──`);

    // Find the tournament in DB
    const tournament = db.findOne('tournaments',
      t => t.template === target.template ||
           t.name.toUpperCase().includes(target.template)
    );
    if (!tournament) {
      console.warn(`  ⚠️ No tournament found with template="${target.template}" — will skip DB update`);
    } else {
      console.log(`  Tournament: ${tournament.name} S${tournament.season} (id=${tournament.id})`);
    }

    // Find the message in any channel in the category
    let foundChannel = null;
    let foundMessage = null;

    for (const [, ch] of channels) {
      try {
        const msg = await ch.messages.fetch(target.messageId);
        if (msg) { foundChannel = ch; foundMessage = msg; break; }
      } catch (_) { /* not in this channel */ }
    }

    // Also try ALL guild text channels if not found in category
    if (!foundChannel) {
      const allCh = guild.channels.cache.filter(c => c.isTextBased && c.isTextBased());
      for (const [, ch] of allCh) {
        try {
          const msg = await ch.messages.fetch(target.messageId);
          if (msg) {
            console.log(`  Found in non-category channel: #${ch.name}`);
            foundChannel = ch; foundMessage = msg; break;
          }
        } catch (_) {}
      }
    }

    if (!foundChannel) {
      console.warn(`  ⚠️ Could not find message ${target.messageId} — set winners_history_ref manually via /manage → 🏆 Winners Setup`);
      continue;
    }
    console.log(`  ✓ Found in #${foundChannel.name} (${foundChannel.id})`);

    // Build the V2 payload
    let v2Payload;
    if (tournament) {
      v2Payload = buildWinnersHistoryPayload(tournament.id);
    } else {
      const E_CUP = '<a:cup:1501741159557500971>';
      const SEP   = { type: 14, divider: true, spacing: 1 };
      v2Payload = {
        flags: 32768,
        components: [{ type: 17, accent_color: 0xFFD700, components: [
          { type: 10, content: `# ${E_CUP}  ${target.label}  —  Winners History` },
          SEP,
          { type: 10, content: 'No winners recorded yet. Season winners will appear here once confirmed.' },
          SEP,
          { type: 10, content: `-# Night Stars  •  ${target.label}  •  Winners History` },
        ]}],
      };
    }

    // Send the new V2 message
    let newMsg = null;
    try {
      newMsg = await foundChannel.send(v2Payload);
      console.log(`  ✓ Sent V2 message: ${newMsg.id} in #${foundChannel.name}`);
    } catch (e) {
      console.error(`  ✗ Failed to send V2 message: ${e.message}`);
      continue;
    }

    // Delete the old message
    try {
      await foundMessage.delete();
      console.log(`  ✓ Deleted old message ${target.messageId}`);
    } catch (e) {
      console.warn(`  ⚠️ Could not delete old message: ${e.message}`);
    }

    // Store the new ref in the DB
    if (tournament) {
      db.update('tournaments', tournament.id, {
        winners_history_ref: { channelId: foundChannel.id, messageId: newMsg.id },
      });
      console.log(`  ✓ DB updated: winners_history_ref = { ch: ${foundChannel.id}, msg: ${newMsg.id} }`);
    }
  }

  console.log('\n── Setup complete ──');
  db.get('tournaments').filter(t => t.winners_history_ref).forEach(t => {
    console.log(`  ${t.name} S${t.season}: ref set ✓`);
  });

  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(e => {
  console.error('Login failed:', e.message);
  process.exit(1);
});

setTimeout(() => { console.error('Timeout'); client.destroy(); process.exit(1); }, 35000);
