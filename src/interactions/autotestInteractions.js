'use strict';

const { db } = require('../utils/database');
const {
  makeGroupDrawPost,
  makeSchedulePost,
  makeResultsPost,
  makeStandingsPost,
  makeBracketPost,
} = require('../utils/tournamentEmbeds');

function getOrCreateTestTid() {
  // Find existing test tournament or create one
  let t = db.findById('tournaments', 37);
  if (t) return 37;
  t = db.get('tournaments').find(x => x.template === 'TEST' || x.name === 'TEST');
  if (t) return t.id;
  const created = db.insert('tournaments', {
    name: 'TEST', template: 'TEST', season: 1, status: 'active',
    teams_per_group: 4, advance_per_group: 2,
    win_pts: 3, draw_pts: 1, loss_pts: 0, forfeit_pts: 0,
    team_count: 16,
  });
  return created.id;
}
const SEP      = { type: 14, divider: true, spacing: 1 };
const txt      = c => ({ type: 10, content: c });
const E_CUP    = '<a:cup:1501741159557500971>';
const E_CROWN  = '<:crownn:1501741176296964277>';
const GOLD     = 0xFFD700;
const BLUE     = 0x2563EB;

// ── Per-guild session state ───────────────────────────────────────────────────
const sessions = new Map();

function getState(guildId) {
  if (!sessions.has(guildId)) {
    sessions.set(guildId, { teamCount: 16, mode: 'auto', running: false, steps: [], stepIdx: 0,
    sentMsgs: [], progress: 0, cancelled: false, panelMsg: null, totalSteps: 0 });
  }
  return sessions.get(guildId);
}

// ── Helpers: progress + channel tracking ─────────────────────────────────────
function pbar(pct) {
  const f = Math.round(pct / 10);
  return '`' + '█'.repeat(f) + '░'.repeat(10 - f) + '`  **' + pct + '%**';
}

function buildAutoProgressPanel(s, guildId) {
  const isComplete = s.progress >= 100;
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: isComplete ? 0xFEE75C : 0x5865F2,
      components: [
        { type: 10, content: isComplete ? '✅  **AutoTest Complete!**' : '🤖  **AutoTest Running…**' },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: pbar(s.progress) },
        { type: 14, divider: true, spacing: 1 },
        { type: 1, components: [{ type: 2, style: 4, label: '✕  End Test', custom_id: 'at_end_test' }] },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: '-# © 24 2026  |  Goatsi Bot' },
      ],
    }],
  };
}

function buildStepCtrl(done, total) {
  const pct = Math.round((done / total) * 100);
  const isDone = done >= total;
  if (isDone) return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xFEE75C,
      components: [
        { type: 10, content: '✅  **Test complete!**' },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: pbar(100) },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: '-# © 24 2026  |  Goatsi Bot' },
      ],
    }],
  };
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0x5865F2,
      components: [
        { type: 10, content: `🎮  **Step ${done} / ${total} done**` },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: pbar(pct) },
        { type: 14, divider: true, spacing: 1 },
        { type: 1, components: [{ type: 2, style: 1, label: '▶  Next Step', custom_id: 'at_next_step' }] },
        { type: 1, components: [{ type: 2, style: 4, label: '✕  End Test',  custom_id: 'at_end_test'  }] },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: '-# © 24 2026  |  Goatsi Bot' },
      ],
    }],
  };
}

function buildStepPanel(s) {
  const total = s.totalSteps || 1;
  const done  = Math.min(s.stepIdx, total);
  const pct   = Math.min(100, Math.round((done / total) * 100));
  const isDone = done >= total;
  const comps = [
    { type: 10, content: isDone ? '✅  **Test Complete!**' : `🎮  **Step ${done} / ${total}**` },
    { type: 14, divider: true, spacing: 1 },
    { type: 10, content: pbar(pct) },
    { type: 14, divider: true, spacing: 1 },
  ];
  if (!isDone) {
    comps.push({ type: 1, components: [{ type: 2, style: 1, label: '▶  Next Step', custom_id: 'at_next_step' }] });
    comps.push({ type: 14, divider: true, spacing: 1 });
  }
  comps.push({ type: 1, components: [{ type: 2, style: 4, label: '✕  End Test', custom_id: 'at_end_test' }] });
  comps.push({ type: 14, divider: true, spacing: 1 });
  comps.push({ type: 10, content: '-# © 24 2026  |  Goatsi Bot' });
  return { flags: 32768, components: [{ type: 17, accent_color: isDone ? 0xFEE75C : 0x5865F2, components: comps }] };
}

function trackChannels(channels, sentMsgs) {
  const wrap = ch => !ch ? null : {
    send: async (payload) => { const m = await ch.send(payload); sentMsgs.push(m); return m; },
  };
  return { results: wrap(channels.results), schedule: wrap(channels.schedule) };
}

// ── Settings panel ────────────────────────────────────────────────────────────
function buildSettingsPanel(guildId) {
  const s = getState(guildId || 'default');
  if (s.running && s.mode === 'auto') return buildAutoProgressPanel(s, guildId);
  if (s.running && s.mode === 'step')  return buildStepPanel(s);
  return {
    flags: 32768,
    components: [{
      type: 17,
      accent_color: BLUE,
      components: [
        txt('🤖  **AutoTest Panel**\n*Full tournament simulation — group stage through final champion*'),
        SEP,
        txt('👥  **Team Count**'),
        {
          type: 1, components: [
            { type: 2, style: s.teamCount === 8  ? 1 : 2, label: '8 teams  (2 groups × 4)',  custom_id: 'at_size_8'  },
            { type: 2, style: s.teamCount === 16 ? 1 : 2, label: '16 teams  (4 groups × 4)', custom_id: 'at_size_16' },
          ],
        },
        SEP,
        txt('⚡  **Mode**'),
        {
          type: 1, components: [
            { type: 2, style: s.mode === 'step' ? 1 : 2, label: '🎮  Step by Step', custom_id: 'at_auto_off' },
            { type: 2, style: s.mode === 'auto' ? 1 : 2, label: '⚡  Auto Run All',  custom_id: 'at_auto_on'  },
          ],
        },
        SEP,
        {
          type: 1, components: [{
            type: 2, style: 3,
            label: s.running ? '⏳  Test Running…' : `▶  Start Test — ${s.teamCount} teams ⚡`,
            custom_id: 'at_start',
            disabled: s.running,
          }],
        },
        SEP,
        txt('-# © 24 2026  |  Goatsi Bot'),
      ],
    }],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rndScore(noTie) {
  const pool = [[0,1],[1,0],[1,1],[2,0],[0,2],[2,1],[1,2],[3,0],[0,3],[3,1],[1,3],[2,2],[3,2],[2,3]];
  const noTiePool = pool.filter(([h,a]) => h !== a);
  const src = noTie ? noTiePool : pool;
  return src[Math.floor(Math.random() * src.length)];
}

function applyGroupResult(tid, matchId, hs, as_) {
  db.update('matches', matchId, { status: 'played', home_score: hs, away_score: as_ });
  const m   = db.findById('matches', matchId);
  const htt = db.get('tournament_teams').find(tt => tt.tournament_id === tid && tt.team_id === m.home_team_id);
  const att = db.get('tournament_teams').find(tt => tt.tournament_id === tid && tt.team_id === m.away_team_id);
  if (!htt || !att) return;
  const hUpd = { goals_for: (htt.goals_for||0)+hs, goals_against: (htt.goals_against||0)+as_ };
  const aUpd = { goals_for: (att.goals_for||0)+as_, goals_against: (att.goals_against||0)+hs };
  if (hs > as_)      { hUpd.wins=(htt.wins||0)+1; hUpd.points=(htt.points||0)+3; aUpd.losses=(att.losses||0)+1; aUpd.points=att.points||0; }
  else if (as_ > hs) { aUpd.wins=(att.wins||0)+1; aUpd.points=(att.points||0)+3; hUpd.losses=(htt.losses||0)+1; hUpd.points=htt.points||0; }
  else               { hUpd.draws=(htt.draws||0)+1; hUpd.points=(htt.points||0)+1; aUpd.draws=(att.draws||0)+1; aUpd.points=(att.points||0)+1; }
  db.update('tournament_teams', htt.id, hUpd);
  db.update('tournament_teams', att.id, aUpd);
}

async function getTestChannels(client) {
  const rId = db.getConfig('test_results_channel_id');
  const sId = db.getConfig('test_schedule_channel_id');
  const fetch = id => id ? client.channels.fetch(id).catch(() => null) : Promise.resolve(null);
  const [results, schedule] = await Promise.all([fetch(rId), fetch(sId)]);
  return { results, schedule };
}

// ── Build step list ───────────────────────────────────────────────────────────
function buildSteps({ results, schedule }, teamCount, mode = "auto") {
  const tid       = getOrCreateTestTid();
  const groupNames  = 'ABCD'.slice(0, teamCount / 4).split('');
  const rrPairings  = [[[0,3],[1,2]], [[0,2],[3,1]], [[0,1],[2,3]]];
  const steps       = [];

  // Step 0 — setup + group draw
  steps.push(async () => {
    db.deleteWhere('tournament_teams', tt => tt.tournament_id === tid);
    db.deleteWhere('matches',          m  => m.tournament_id  === tid);

    const teams = shuffle(db.get('teams')).slice(0, teamCount);
    teams.forEach((team, i) => {
      db.insert('tournament_teams', {
        tournament_id: tid,
        team_id:       team.id,
        group_name:    groupNames[Math.floor(i / 4)],
        points: 0, wins: 0, draws: 0, losses: 0,
        goals_for: 0, goals_against: 0,
      });
    });
    db.update('tournaments', tid, { team_count: teamCount, teams_per_group: 4, advance_per_group: 2 });

    // Generate all group matches
    for (const g of groupNames) {
      const gTeams = db.get('tournament_teams')
        .filter(tt => tt.tournament_id === tid && tt.group_name === g)
        .map(tt => tt.team_id);
      for (let r = 1; r <= 3; r++) {
        for (const [a, b] of rrPairings[r - 1]) {
          db.insert('matches', {
            tournament_id: tid, stage: 'group', round: r,
            home_team_id: gTeams[a], away_team_id: gTeams[b], status: 'pending',
          });
        }
      }
    }

    if (schedule) await schedule.send(makeGroupDrawPost(tid));
  });

  // Steps 1-3 — group rounds
  for (let round = 1; round <= 3; round++) {
    const r = round;
    steps.push(async () => {
      if (schedule) await schedule.send(makeSchedulePost(tid, r));
      const pending = db.get('matches')
        .filter(m => m.tournament_id === tid && m.stage === 'group' && m.round === r && m.status === 'pending');
      for (const m of pending) {
        const [hs, as_] = rndScore(false);
        applyGroupResult(tid, m.id, hs, as_);
      }
      if (results) await results.send(makeResultsPost(tid, r));
      if (results) await results.send(makeStandingsPost(tid));
    });
  }

  // ── KO helper: compute advancers + koPairs ──
  function buildKoPairs() {
    const ttRows = db.get('tournament_teams').filter(tt => tt.tournament_id === tid);
    const advancers = [];
    for (const g of groupNames) {
      const sorted = ttRows
        .filter(tt => tt.group_name === g)
        .sort((a, b) => {
          const pd = (b.points||0) - (a.points||0);
          if (pd) return pd;
          return ((b.goals_for||0)-(b.goals_against||0)) - ((a.goals_for||0)-(a.goals_against||0));
        });
      advancers.push(sorted[0]?.team_id, sorted[1]?.team_id);
    }
    const koPairs = [];
    for (let i = 0; i < groupNames.length; i += 2) {
      koPairs.push([advancers[i*2], advancers[i*2+3]]);
      koPairs.push([advancers[i*2+2], advancers[i*2+1]]);
    }
    return koPairs;
  }

  if (mode === 'step') {
    // ── Step mode: one step per KO round ──────────────────────────────────────
    let bracketMsgKo  = null;
    let koCurrentRound = null;
    const numKoRounds  = Math.log2(teamCount / 2); // 3 for 16t, 2 for 8t

    // KO setup step: draw QF, send bracket
    steps.push(async () => {
      const koPairs = buildKoPairs();
      koCurrentRound = koPairs.length;
      for (const [home, away] of koPairs) {
        db.insert('matches', { tournament_id: tid, stage: 'knockout', round: koCurrentRound,
          home_team_id: home, away_team_id: away, status: 'pending' });
      }
      if (results) bracketMsgKo = await results.send(makeBracketPost(tid));
    });

    // One step per KO round (QF → SF → Final)
    for (let ko = 0; ko < numKoRounds; ko++) {
      const isLast = ko === numKoRounds - 1;
      steps.push(async () => {
        const roundMatches = db.get('matches')
          .filter(m => m.tournament_id === tid && m.stage === 'knockout'
                    && m.round === koCurrentRound && m.status === 'pending');
        const winners = [];
        for (const m of roundMatches) {
          const [hs, as_] = rndScore(true);
          db.update('matches', m.id, { status: 'played', home_score: hs, away_score: as_ });
          winners.push(hs > as_ ? m.home_team_id : m.away_team_id);
        }
        if (!isLast) {
          const nextRound = Math.floor(koCurrentRound / 2);
          for (let i = 0; i < winners.length; i += 2) {
            db.insert('matches', { tournament_id: tid, stage: 'knockout', round: nextRound,
              home_team_id: winners[i], away_team_id: winners[i + 1], status: 'pending' });
          }
          koCurrentRound = nextRound;
        }
        const bp = makeBracketPost(tid);
        if (bracketMsgKo) await bracketMsgKo.edit(bp).catch(() => {});
        else if (results) bracketMsgKo = await results.send(bp);
        if (isLast) {
          const champTeam = db.get('teams').find(t => t.id === winners[0]) || { name: 'Unknown' };
          if (results) await results.send({
            flags: 32768,
            components: [{ type: 17, accent_color: GOLD, components: [
              txt(`${E_CUP}  **TOURNAMENT CHAMPION  —  TEST**`),
              SEP, txt(`${E_CROWN}  **${champTeam.name.toUpperCase()}**`), SEP,
              txt('-# © 24 2026  |  Goatsi Bot'),
            ]}],
          });
        }
      });
    }
  } else {
    // ── Auto mode: single KO step (original) ──────────────────────────────────
    steps.push(async () => {
    const koPairs = buildKoPairs();
    let currentRound = koPairs.length; // 4 for 16 teams, 2 for 8 teams

    // Insert first KO round matches
    for (const [home, away] of koPairs) {
      db.insert('matches', {
        tournament_id: tid, stage: 'knockout', round: currentRound,
        home_team_id: home, away_team_id: away, status: 'pending',
      });
    }
    // Step mode: send bracket once, edit in place each round
    // Auto mode: run all rounds silently, send bracket once at the end
    let bracketMsg = null;
    if (mode === 'step' && results) bracketMsg = await results.send(makeBracketPost(tid));

    while (currentRound > 0) {
      const roundMatches = db.get('matches')
        .filter(m => m.tournament_id === tid && m.stage === 'knockout' && m.round === currentRound && m.status === 'pending');
      if (!roundMatches.length) break;

      const winners = [];
      for (const m of roundMatches) {
        const [hs, as_] = rndScore(true); // no tie in KO
        db.update('matches', m.id, { status: 'played', home_score: hs, away_score: as_ });
        winners.push(hs > as_ ? m.home_team_id : m.away_team_id);
      }

      // Step mode: edit the bracket in place after each round
      if (mode === 'step') {
        const bracketPayload = makeBracketPost(tid);
        if (bracketMsg) await bracketMsg.edit(bracketPayload).catch(() => {});
        else if (results) bracketMsg = await results.send(bracketPayload);
      }

      const nextRound = Math.floor(currentRound / 2);
      if (nextRound === 0) {
        // Auto mode: send the completed bracket once now
        if (mode === 'auto' && results) await results.send(makeBracketPost(tid));
        // Post champion
        const champTeam = db.get('teams').find(t => t.id === winners[0]) || { name: 'Unknown' };
        if (results) await results.send({
          flags: 32768,
          components: [{
            type: 17, accent_color: GOLD,
            components: [
              txt(`${E_CUP}  **TOURNAMENT CHAMPION  —  TEST**`),
              SEP,
              txt(`${E_CROWN}  **${champTeam.name.toUpperCase()}**`),
              SEP,
              txt('-# © 24 2026  |  Goatsi Bot'),
            ],
          }],
        });
        break;
      }

      // Next KO round matches
      for (let i = 0; i < winners.length; i += 2) {
        db.insert('matches', {
          tournament_id: tid, stage: 'knockout', round: nextRound,
          home_team_id: winners[i], away_team_id: winners[i+1], status: 'pending',
        });
      }
      currentRound = nextRound;
    }
  });

  } // end else (auto mode)

  return steps;
}

// ── Run simulation (auto mode) ────────────────────────────────────────────────
async function runAutoSimulation(client, guildId, panelMsg) {
  const s        = getState(guildId);
  const channels = await getTestChannels(client);
  if (!channels.results && !channels.schedule) {
    s.running = false;
    try { await panelMsg.edit(buildSettingsPanel(guildId)); } catch {}
    return;
  }
  s.sentMsgs = []; s.progress = 0; s.cancelled = false; s.panelMsg = panelMsg;
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const tracked = trackChannels(channels, s.sentMsgs);
  const steps = buildSteps(tracked, s.teamCount, 'auto');
  try {
    for (let i = 0; i < steps.length; i++) {
      if (s.cancelled) break;
      await steps[i]();
      s.progress = Math.round(((i + 1) / steps.length) * 100);
      try { await panelMsg.edit(buildSettingsPanel(guildId)); } catch {}
      await delay(1500);
    }
  } catch (err) {
    const errCh = channels.results || channels.schedule;
    try { if (errCh) await errCh.send({ content: `❌ AutoTest error: \`${err.message}\`` }); } catch {}
  } finally {
    if (!s.cancelled) {
      // Keep panel visible at 100% — only End Test will clear it
      s.progress = 100;
      try { await panelMsg.edit(buildSettingsPanel(guildId)); } catch {}
    }
  }
}

// ── Run simulation (step mode) ────────────────────────────────────────────────
async function startStepSimulation(client, guildId, panelMsg) {
  const s        = getState(guildId);
  const channels = await getTestChannels(client);
  if (!channels.results && !channels.schedule) {
    s.running = false;
    try { await panelMsg.edit(buildSettingsPanel(guildId)); } catch {}
    return;
  }
  s.sentMsgs = []; s.progress = 0; s.cancelled = false; s.panelMsg = panelMsg;
  const tracked = trackChannels(channels, s.sentMsgs);
  const steps = buildSteps(tracked, s.teamCount, 'step');
  s.steps   = steps;
  s.stepIdx = 0;

  try {
    await steps[0]();
    s.stepIdx = 1;
  } catch (err) {
    s.running = false;
    s.steps   = [];
    const errCh2 = channels.results || channels.schedule;
    try { if (errCh2) await errCh2.send({ content: `❌ AutoTest error at step 0: \`${err.message}\`` }); } catch {}
    try { await panelMsg.edit(buildSettingsPanel(guildId)); } catch {}
    return;
  }

  s.totalSteps = steps.length;

  if (steps.length === 1) {
    s.running = false;
    try { await panelMsg.edit(buildSettingsPanel(guildId)); } catch {}
    return;
  }

  // Next Step button lives in the panel itself
  try { await panelMsg.edit(buildSettingsPanel(guildId)); } catch {}
}

// ── Interaction handler ───────────────────────────────────────────────────────
async function handleAutotestInteraction(interaction, client) {
  const id      = interaction.customId;
  const guildId = interaction.guildId;
  const s       = getState(guildId);

  if (id === 'at_size_8' || id === 'at_size_16') {
    if (s.running) return interaction.reply({ content: '⚠️ A test is already running.', ephemeral: true });
    s.teamCount = id === 'at_size_8' ? 8 : 16;
    return interaction.update(buildSettingsPanel(guildId));
  }

  if (id === 'at_auto_on' || id === 'at_auto_off') {
    if (s.running) return interaction.reply({ content: '⚠️ A test is already running.', ephemeral: true });
    s.mode = id === 'at_auto_on' ? 'auto' : 'step';
    return interaction.update(buildSettingsPanel(guildId));
  }

  if (id === 'at_start') {
    if (s.running) return interaction.reply({ content: '⚠️ A test is already running.', ephemeral: true });
    const rId = db.getConfig('test_results_channel_id');
    const sId = db.getConfig('test_schedule_channel_id');
    if (!rId && !sId) {
      return interaction.reply({
        content: '❌ No test channel configured. Use `/admin` → Set Channels → Test to configure.',
        ephemeral: true,
      });
    }
    s.running = true;
    await interaction.update(buildSettingsPanel(guildId));
    if (s.mode === 'auto') {
      runAutoSimulation(client, guildId, interaction.message);
    } else {
      startStepSimulation(client, guildId, interaction.message);
    }
    return;
  }

  if (id === 'at_next_step') {
    if (!s.running || !s.steps || !s.steps.length) {
      return interaction.update(buildSettingsPanel(guildId));
    }
    await interaction.deferUpdate();
    try {
      await s.steps[s.stepIdx]();
    } catch (err) {
      s.running = false; s.steps = []; s.stepIdx = 0;
      return interaction.editReply({
        flags: 32768,
        components: [{ type: 17, accent_color: 0xED4245, components: [
          { type: 10, content: '❌  **Error:** ' + err.message },
          { type: 14, divider: true, spacing: 1 },
          { type: 1, components: [{ type: 2, style: 4, label: '✕  End Test', custom_id: 'at_end_test' }] },
        ]}],
      }).catch(() => {});
    }
    s.stepIdx++;
    if (s.stepIdx >= s.totalSteps) {
      s.steps = []; // keep running=true — panel stays until End Test
    }
    return interaction.editReply(buildSettingsPanel(guildId)).catch(() => {});
  }
  if (id === 'at_end_test') {
    s.cancelled = true;
    s.running = false; s.steps = []; s.stepIdx = 0; s.progress = 0;
    // Delete all posts the test sent
    const toDelete = [...(s.sentMsgs || [])];
    s.sentMsgs = [];
    await Promise.all(toDelete.map(m => m.delete().catch(() => {})));
    // Restore the /test panel if it's separate from this interaction
    if (s.panelMsg && s.panelMsg.id !== interaction.message?.id) {
      try { await s.panelMsg.edit(buildSettingsPanel(guildId)); } catch {}
    }
    const endedMsg = interaction.message;
    await interaction.update({
      flags: 32768,
      components: [{ type: 17, accent_color: 0xED4245,
        components: [
          { type: 10, content: '🛑  **Test ended — all posts cleared.**' },
          { type: 14, divider: true, spacing: 1 },
          { type: 10, content: '-# © 24 2026  |  Goatsi Bot' },
        ],
      }],
    });
    setTimeout(() => { endedMsg.edit(buildSettingsPanel(guildId)).catch(() => {}); }, 4000);
    return;
  }
}

module.exports = { handleAutotestInteraction, buildSettingsPanel };
