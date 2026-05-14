'use strict';
/**
 * Run from gotsi project root:
 *   node scripts/postNselWinners.js
 *
 * Posts the full NSEL 15-season winners history as a Discord V2 component
 * message to the configured winners history channel, then saves the new
 * message ref in the DB.
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

const { Client, GatewayIntentBits } = require('discord.js');
const { db } = require('../src/utils/database');

const E_PIN    = '<a:pin:1501740992884117504>';
const E_FIRE   = '<a:fire:1472250580583059611>';
const E_CROWNN = '<:crownn:1501741176296964277>';
const E_CROWN  = '<a:crown:1501741170668077127>';
const E_CUP    = '<a:cup:1501741159557500971>';
const SEP      = { type: 14, divider: true, spacing: 1 };
const txt      = c => ({ type: 10, content: c });

const PRIZE_ROLE = '<@&1462986630267797598>';

// Season 1 uses crownn (static), seasons 2-15 use crown (animated)
const WINNERS = [
  { season: 1,  emoji: E_CROWNN, display: '<@1362933955510276138>' },
  { season: 2,  emoji: E_CROWN,  display: '<@1164893262956470354>' },
  { season: 3,  emoji: E_CROWN,  display: '<@1362933955510276138>' },
  { season: 4,  emoji: E_CROWN,  display: '**m7cnsllk**' },
  { season: 5,  emoji: E_CROWN,  display: '<@1164893262956470354>' },
  { season: 6,  emoji: E_CROWN,  display: '**m7cnsllk**' },
  { season: 7,  emoji: E_CROWN,  display: '<@1362933955510276138>' },
  { season: 8,  emoji: E_CROWN,  display: '<@1338704217090822185>' },
  { season: 9,  emoji: E_CROWN,  display: '<@1338704217090822185>' },
  { season: 10, emoji: E_CROWN,  display: '**Ilyas Ragnar**' },
  { season: 11, emoji: E_CROWN,  display: '**Ilyas Ragnar**' },
  { season: 12, emoji: E_CROWN,  display: '**Ilyas Ragnar**' },
  { season: 13, emoji: E_CROWN,  display: '<@1362933955510276138>' },
  { season: 14, emoji: E_CROWN,  display: '<@1164893262956470354>' },
  { season: 15, emoji: E_CROWN,  display: '**TIKOO**' },
];

function buildPayload() {
  const inner = [];

  inner.push(txt(
    `${E_PIN} **NSEL Winners History** ${E_PIN}\n\n` +
    `${E_FIRE} **the prize is ${PRIZE_ROLE}** ${E_FIRE}`
  ));
  inner.push(SEP);
  inner.push(txt('╔═══════════════╗'));
  inner.push(SEP);

  for (const w of WINNERS) {
    inner.push(txt(`${w.emoji} **SEASON ${w.season}** : ${w.display}`));
  }

  inner.push(SEP);
  inner.push(txt('╚═══════════════╝'));
  inner.push(SEP);
  inner.push(txt(`-# Night Stars  •  NSEL  •  Winners History`));

  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xFFD700, components: inner }],
  };
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once('clientReady', async () => {
  console.log(`Bot ready: ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) { console.error('No guild found!'); client.destroy(); return; }

  const nsel = db.findOne('tournaments', t =>
    (t.template || '').toUpperCase() === 'NSEL' ||
    (t.name || '').toUpperCase().includes('NSEL')
  );

  const catId = db.getConfig('winners_history_category');
  const ref   = nsel?.winners_history_ref;

  let targetChannel = null;

  if (ref?.channelId) {
    try {
      targetChannel = await guild.channels.fetch(ref.channelId);
      console.log(`Found channel via ref: #${targetChannel.name}`);
    } catch (_) {}
  }

  if (!targetChannel && catId) {
    const channels = guild.channels.cache.filter(
      c => c.parentId === catId && c.isTextBased()
    );
    targetChannel = channels.find(c =>
      c.name.toLowerCase().includes('nsel') &&
      c.name.toLowerCase().includes('winner')
    ) || channels.first();
    if (targetChannel) console.log(`Found channel in category: #${targetChannel.name}`);
  }

  if (!targetChannel) {
    console.error('Could not find the NSEL winners history channel.');
    console.error('Set the channel ref via: /manage → 🏆 Winners Setup → Set History Msg');
    client.destroy();
    return;
  }

  // Delete the old placeholder message if it exists
  if (ref?.messageId) {
    try {
      const old = await targetChannel.messages.fetch(ref.messageId);
      await old.delete();
      console.log(`Deleted old message: ${ref.messageId}`);
    } catch (_) {
      console.log('Old message not found or already deleted — continuing.');
    }
  }

  // Post the new V2 winners history message
  const payload = buildPayload();
  let newMsg;
  try {
    newMsg = await targetChannel.send(payload);
    console.log(`✓ Posted winners history: ${newMsg.id} in #${targetChannel.name}`);
  } catch (e) {
    console.error(`Failed to post message: ${e.message}`);
    client.destroy();
    return;
  }

  // Save new ref to DB
  if (nsel) {
    db.update('tournaments', nsel.id, {
      winners_history_ref: { channelId: targetChannel.id, messageId: newMsg.id },
    });
    console.log(`✓ DB updated with new message ref`);
  } else {
    console.log(`Note: No NSEL tournament in DB — ref not saved automatically.`);
    console.log(`Manually link it: Channel ${targetChannel.id} | Message ${newMsg.id}`);
  }

  console.log('\n✅ Done! Winners history posted successfully.');
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(e => {
  console.error('Login failed:', e.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('Timeout after 35s');
  client.destroy();
  process.exit(1);
}, 35000);
