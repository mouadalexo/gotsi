const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`[BOT] Logged in as ${client.user.tag}`);

    // Auto-deploy slash commands
    const commands = [];
    const commandsPath = path.join(__dirname, '../commands');
    for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
      const cmd = require(path.join(commandsPath, file));
      if (cmd.data) commands.push(cmd.data.toJSON());
    }

    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    try {
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
        { body: commands }
      );
      console.log(`[BOT] Registered ${commands.length} slash commands.`);
    } catch (err) {
      console.error('[BOT] Failed to register commands:', err);
    }

    client.user.setActivity('NS eFootball Manager', { type: 3 });

    // Auto-correct cfg-locked fields on all tournaments and refresh their panels
    setTimeout(async () => {
      try {
        const { db }       = require('../utils/database');
        const { getTplCfg } = require('../utils/templateConfig');
        const { refreshAll } = require('../interactions/botolaInteractions');
        const tournaments = db.get('tournaments');
        const toRefresh = [];
        for (const t of tournaments) {
          const cfg = getTplCfg(t.template || '');
          const fix = {};
          if (cfg.tpg_opts.length        === 1 && t.teams_per_group   !== cfg.tpg_opts[0])        fix.teams_per_group   = cfg.tpg_opts[0];
          if (cfg.apg_opts.length        === 1 && t.advance_per_group !== cfg.apg_opts[0])        fix.advance_per_group = cfg.apg_opts[0];
          if (cfg.ppt_opts.length        === 1 && t.players_per_team  !== cfg.ppt_opts[0])        fix.players_per_team  = cfg.ppt_opts[0];
          if (cfg.team_count_opts.length === 1 && t.team_count        !== cfg.team_count_opts[0]) fix.team_count        = cfg.team_count_opts[0];
          if (Object.keys(fix).length) { db.update('tournaments', t.id, fix); toRefresh.push(t.id); }
          else toRefresh.push(t.id);
        }
        await Promise.all(toRefresh.map(tid => refreshAll(client, tid).catch(() => {})));
        console.log(`[BOT] Startup panel refresh done (${toRefresh.length} tournament(s)).`);
      } catch (e) { console.error('[BOT] Startup panel refresh error:', e.message); }
    }, 3000);
  },
};
