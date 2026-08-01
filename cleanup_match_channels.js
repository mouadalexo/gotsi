'use strict';
// One-time script: remove all clan role overwrites from match channels
// and rename them back to match-1, match-2, etc.

const fs = require('fs');
function loadEnv(p) {
  try {
    return Object.fromEntries(fs.readFileSync(p,'utf8').split('\n')
      .filter(l=>l&&!l.startsWith('#')&&l.includes('='))
      .map(l=>[l.slice(0,l.indexOf('=')).trim(), l.slice(l.indexOf('=')+1).trim()]));
  } catch(_){ return {}; }
}
Object.assign(process.env, loadEnv('/home/ubuntu/goatsi/.env'));

const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log('Logged in as', client.user.tag);
  try {
    const db       = JSON.parse(fs.readFileSync('/home/ubuntu/goatsi/data/db.json','utf8'));
    const fed      = db.config?.federation || {};
    const catId    = fed.channels?.category;
    const mgmtIds  = new Set(Object.entries(fed.channels||{})
      .filter(([k]) => k !== 'category').map(([,v]) => v).filter(Boolean));

    if (!catId) { console.error('No category ID in DB'); process.exit(1); }
    console.log('Category:', catId);
    console.log('Skipping mgmt channels:', [...mgmtIds]);

    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
    const cat   = guild.channels.cache.get(catId);
    if (!cat) { console.error('Category not found in guild'); process.exit(1); }

    const matchChs = [...cat.children.cache.values()]
      .filter(ch => !mgmtIds.has(ch.id))
      .sort((a,b) => a.position - b.position);

    console.log('Match channels to clean:', matchChs.length);

    for (let i = 0; i < matchChs.length; i++) {
      const ch = matchChs[i];
      const overwrites = [...ch.permissionOverwrites.cache.values()];
      const toRemove   = overwrites.filter(ow => ow.id !== guild.id); // keep @everyone
      console.log('  #' + ch.name + ' — removing', toRemove.length, 'overwrites');
      await Promise.all(toRemove.map(ow => ch.permissionOverwrites.delete(ow.id).catch(()=>{})));
      await ch.setName('match-' + (i + 1)).catch(() => {});
    }

    console.log('\n✅ Done. All match channels cleaned and renamed.');
  } catch(e) { console.error('Error:', e.message); }
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
