'use strict';
const { db } = require('../utils/database');

const SEP = { type: 14, divider: true, spacing: 1 };
const txt = c => ({ type: 10, content: c });
const btn = (label, id, style, disabled = false) => ({ type: 2, style, label, custom_id: id, disabled });

function getFed()      { return db.getConfig('federation') || {}; }
function saveFed(data) { const c = getFed(); db.setConfig('federation', { ...c, ...data }); }
function getFedClans() { const f = getFed(); return (db.get('fed_clans') || []).filter(c => c.fed_season === (f.season || 1)); }
function getFedMatches(){ const f = getFed(); return (db.get('fed_matches') || []).filter(m => m.fed_season === (f.season || 1)); }

function getFedStage(fed, matches) {
  if (!fed || !fed.status || fed.status === 'setup') return 'setup';
  if (fed.status === 'finished') return 'finished';
  if ((fed.system || 'cup') === 'league') return 'league';
  if (matches.some(m => m.stage === 'knockout')) return 'knockout';
  return 'group';
}

function buildFedPanel1() {
  const fed     = getFed();
  const clans   = getFedClans();
  const matches = getFedMatches();
  const stage   = getFedStage(fed, matches);
  const inner   = [];

  inner.push(txt('## 1 : Main  \u2014  ' + (fed.tag || fed.name || 'Federation')));
  inner.push(SEP);

  if (stage === 'setup') {
    const required = fed.clan_count || 8;
    const current  = clans.length;
    const isFull   = current >= required;
    const system   = fed.system || null;

    inner.push(txt(
      '**Status:** Setup\n**System:** ' + (system ? (system === 'league' ? '\uD83D\uDD35 League' : '\uD83D\uDD34 Cup') : '`not set`') + '\n' +
      '**Clans:** ' + current + '/' + required + '  \u2022  **Players/Clan:** ' + (fed.players_per_clan || 8)
    ));
    inner.push(SEP);
    if (!system) {
      inner.push(txt('> \u2699\uFE0F Choose a system below before starting.'));
    } else if (current > required) {
      inner.push(txt('**' + current + '/' + required + '** \u26a0\ufe0f  Too many clans.'));
    } else if (isFull) {
      inner.push(txt('**' + current + '/' + required + '** \u2705  **Ready to begin!**'));
    } else {
      inner.push(txt('**' + current + '/' + required + '** clans registered'));
    }
    inner.push(SEP);
    inner.push({ type: 1, components: [{ type: 3, custom_id: 'fed_p1_system_sel',
      placeholder: system ? 'System: ' + (system === 'league' ? 'League' : 'Cup') : 'Select system\u2026',
      options: [
        { label: '\uD83D\uDD35 League \u2014 Round Robin', value: 'league', default: system === 'league' },
        { label: '\uD83D\uDD34 Cup \u2014 Group + Knockout', value: 'cup', default: system === 'cup' },
      ],
    }]});
    inner.push({ type: 1, components: [
      btn('Begin Season', 'fed_p1_begin',   1, !isFull || !system),
      btn('⚙️  Settings',  'fed_p1_settings',  2),
      btn('Refresh',      'fed_p1_refresh', 2),
    ]});

  } else if (stage === 'league') {
    const pending    = matches.filter(m => m.status === 'pending');
    const played     = matches.filter(m => m.status === 'played');
    const allRounds  = [...new Set(matches.map(m => m.round))].sort((a,b)=>a-b);
    const curRound   = pending.length ? Math.min(...pending.map(m => m.round)) : (allRounds[allRounds.length-1] || 1);
    const curPending = matches.filter(m => m.round === curRound && m.status === 'pending').length;
    const roundDone  = curPending === 0 && matches.filter(m => m.round === curRound && m.status === 'played').length > 0;
    const allDone    = pending.length === 0 && played.length > 0;
    const maxRound   = allRounds[allRounds.length-1] || 1;
    const isLastRound= curRound >= maxRound;

    inner.push(txt('> **Status:** League  |  **Round ' + curRound + '/' + maxRound + '**\n> **Matches:** ' + played.length + ' played  /  ' + pending.length + ' pending'));
    inner.push(SEP);
    inner.push(txt(
      allDone   ? '\u2705 **All rounds complete!** Click **End Season** to finish.' :
      roundDone ? '\u2705 **Round ' + curRound + ' complete!** Click **Next Round** when ready. You can still use **Add Result** to re-enter any result.' :
                  '\u23f3 **Round ' + curRound + '** \u2014 **' + curPending + '** result' + (curPending !== 1 ? 's' : '') + ' remaining'
    ));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Add Result',  'fed_p1_addresult', 1, false),
      btn('Next Round',  'fed_p1_next',      3, !roundDone || allDone),
      btn('Refresh',     'fed_p1_refresh',   2),
      btn('End Season',  'fed_p1_end',       4, false),
    ]});

  } else if (stage === 'group') {
    const gm        = matches.filter(m => m.stage === 'group');
    const played    = gm.filter(m => m.status === 'played');
    const allRounds = [...new Set(gm.map(m => m.round))].sort((a, b) => a - b);
    const maxRound  = allRounds[allRounds.length - 1] || 1;
    // Active round = highest round that has channels or played matches (was started)
    const _started     = gm.filter(m => m.channel_id || m.status === 'played').map(m => m.round);
    const activeRound  = _started.length ? Math.max(..._started) : 1;
    const activePend   = gm.filter(m => m.round === activeRound && m.status === 'pending').length;
    const roundDone    = activePend === 0 && gm.filter(m => m.round === activeRound).length > 0;
    const allDone      = played.length === gm.length && gm.length > 0;
    const nextLabel    = allDone ? 'Next → Knockout' : 'Next Matchday';
    const totalPend    = gm.filter(m => m.status === 'pending').length;

    inner.push(txt('> **Status:** Cup — Group Stage  |  **Matchday ' + activeRound + '/' + maxRound + '**\n> **Matches:** ' + played.length + ' played  /  ' + totalPend + ' pending'));
    inner.push(SEP);
    inner.push(txt(
      allDone   ? '✅ **Group Stage complete!** Click **Next → Knockout** when ready.' :
      roundDone ? '\u2705 **Matchday ' + activeRound + ' complete!** Click **Next Matchday** when ready. You can still use **Add Result** to re-enter any result.' :
                  '⏳ Matchday ' + activeRound + ' — **' + activePend + '** result' + (activePend !== 1 ? 's' : '') + ' remaining'
    ));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Add Result',  'fed_p1_addresult', 1, false),
      btn(nextLabel,     'fed_p1_next',      3, !roundDone && !allDone),
      btn('Refresh',     'fed_p1_refresh',   2),
      btn('End Season',  'fed_p1_end',       4, false),
    ]});

  } else if (stage === 'knockout') {
    const km         = matches.filter(m => m.stage === 'knockout');
    const RLABELS    = {1:'Final',2:'Semi-Finals',4:'Quarter-Finals',8:'Round of 16',16:'Round of 32'};
    const pending    = km.filter(m => m.status === 'pending');
    const played_ko  = km.filter(m => m.status === 'played');
    const curRound   = pending.length
      ? Math.max(...pending.map(m => m.round))
      : played_ko.length ? Math.min(...played_ko.map(m => m.round)) : 1;
    const curPending = km.filter(m => m.round === curRound && m.status === 'pending').length;
    const curPlayed  = km.filter(m => m.round === curRound && m.status === 'played').length;
    const roundDone  = curPending === 0 && curPlayed > 0;
    const rlabel     = RLABELS[curRound] || 'Round ' + curRound;

    inner.push(txt('> **Status:** Cup \u2014 Knockout  |  **' + rlabel + '**\n> **Matches:** ' + curPlayed + ' played  /  ' + curPending + ' pending'));
    inner.push(SEP);
    inner.push(txt(roundDone ? '\u2705 **' + rlabel + ' complete!** Click **Next**.' : '\u23f3 **' + rlabel + '** \u2014 **' + curPending + '** result' + (curPending !== 1 ? 's' : '') + ' remaining'));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('Add Result',  'fed_p1_addresult', 1, false),
      btn('Next',        'fed_p1_next',      3, !roundDone),
      btn('Refresh',     'fed_p1_refresh',   2),
      btn('End Season',  'fed_p1_end',       4, false),
    ]});

  } else {
    inner.push(txt('> **Status:** FINISHED  |  **Season ' + (fed.season || 1) + ' Complete**'));
    inner.push(SEP);
    inner.push({ type: 1, components: [
      btn('New Edition', 'fed_p1_newedition', 1),
      btn('⚙️  Settings',  'fed_p1_settings',  2),
      btn('Refresh',     'fed_p1_refresh',    2),
    ]});
  }

  inner.push(SEP);
  inner.push(txt('-# \u00a9 24 2026  |  Goatsi Bot'));
  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

module.exports = { buildFedPanel1, getFed, saveFed, getFedClans, getFedMatches, getFedStage };
