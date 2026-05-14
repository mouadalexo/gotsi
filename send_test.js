process.env.DISCORD_TOKEN    = 'MTUwMDMyMDMwOTIxODI0NjcwNw.Gb-G6V.UKBxubIkxGUD5WgsnQWbF17Uu7GSHDqOO3YcOI';
process.env.DISCORD_GUILD_ID = '1462978668241621158';

const { Client, GatewayIntentBits } = require('./node_modules/discord.js');
const { db }                        = require('./src/utils/database');
const { buildTeamsListEmbed }       = require('./src/panels/teamListPanel');
const { buildGroupStandingsEmbed, buildKnockoutBracketEmbed } = require('./src/panels/standingsPanel');
const { buildAllResultsEmbed }      = require('./src/panels/resultsPanel');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ── Match Schedule panel (built inline — no existing panel for this) ──────────
function buildMatchSchedulePayload(tournamentId) {
  const tournament = db.findById('tournaments', tournamentId);
  if (!tournament) return null;

  const matches = db.get('matches').filter(m => m.tournament_id === tournamentId && m.status === 'pending');
  const teams   = db.get('teams');
  const ttRows  = db.get('tournament_teams').filter(tt => tt.tournament_id === tournamentId);
  const getTeam = id => teams.find(t => t.id === id) || { name: 'TBD' };
  const getGrp  = id => ttRows.find(tt => tt.team_id === id)?.group_name || '?';

  const E_CUP  = '<a:cup:1501741159557500971>';
  const E_ARR  = '<a:arrow:1501741110798585927>';
  const SEP    = { type: 14, divider: true, spacing: 1 };
  const txt    = c => ({ type: 10, content: c });

  const inner = [
    txt(`${E_CUP}  **MATCH SCHEDULE  —  ${tournament.template} S${tournament.season}**`),
    SEP,
  ];

  if (!matches.length) {
    inner.push(txt('✅  All matches have been played — no pending fixtures.'));
    inner.push(SEP);
    inner.push(txt(`-# ${tournament.template}  •  Pending Fixtures`));
    inner.push(SEP);
    return { flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: inner }] };
  }

  // Group by stage then round
  const byStageRound = {};
  for (const m of matches) {
    const key = `${m.stage}__${m.round}`;
    if (!byStageRound[key]) byStageRound[key] = [];
    byStageRound[key].push(m);
  }

  const stageLabel = s => s === 'knockout' ? '⚡ Knockout' : '🔵 Group Stage';

  for (const [key, rMatches] of Object.entries(byStageRound).sort()) {
    const [stage, round] = key.split('__');
    const lines = rMatches.map(m => {
      const home = getTeam(m.home_team_id);
      const away = getTeam(m.away_team_id);
      const grp  = stage === 'group' ? ` · Group ${getGrp(m.home_team_id)}` : '';
      return `${E_ARR}  **${home.name}**  vs  **${away.name}**${grp}`;
    });
    inner.push(txt(`**${stageLabel(stage)}  •  Round ${round}**\n${lines.join('\n')}`));
    inner.push(SEP);
  }

  inner.push(txt(`-# ${tournament.template}  •  Pending Fixtures`));
  inner.push(SEP);

  return { flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: inner }] };
}

client.once('clientReady', async () => {
  console.log('Bot ready:', client.user.tag);

  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
  await guild.channels.fetch();

  const testCh = guild.channels.cache.find(
    c => c.name && c.name.toLowerCase().includes('test') && typeof c.send === 'function'
  );
  if (!testCh) {
    console.error('No test channel. Channels:', guild.channels.cache.map(c => c.name + '(' + c.type + ')').join(', '));
    process.exit(1);
  }
  console.log('Sending to:', testCh.name, testCh.id);

  async function safeSend(payload) {
    try {
      await testCh.send(payload);
      await new Promise(r => setTimeout(r, 700));
    } catch (e) {
      console.error('Send error:', e.message);
    }
  }

  async function sendTournament(t) {
    console.log('Sending', t.template, 'S' + t.season);

    // Section header
    await safeSend({ content: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n**' + t.template + ' Season ' + t.season + ' — ' + t.name + '**\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' });

    // 1. Teams list
    await safeSend(buildTeamsListEmbed(t.id));

    // 2. Match schedule (pending fixtures)
    const schedule = buildMatchSchedulePayload(t.id);
    if (schedule) await safeSend(schedule);

    // 3. Group standings
    const standings = buildGroupStandingsEmbed(t.id);
    if (standings) await safeSend(standings);

    // 4. All results (played group matches)
    const results = buildAllResultsEmbed(t.id);
    if (results) await safeSend(results);

    // 5. Knockout bracket
    const bracket = buildKnockoutBracketEmbed(t.id);
    if (bracket) await safeSend(bracket);
  }

  const tournaments = db.get('tournaments');
  const nsels = tournaments.filter(t => t.template === 'NSEL').sort((a, b) => b.season - a.season);
  const mcls  = tournaments.filter(t => t.template === 'MCL').sort((a, b) => b.season - a.season);

  for (const t of nsels) await sendTournament(t);
  for (const t of mcls.slice(0, 3)) await sendTournament(t);

  console.log('Done!');
  process.exit(0);
});

client.on('error', e => { console.error(e); process.exit(1); });
client.login(process.env.DISCORD_TOKEN);
