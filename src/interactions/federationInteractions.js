'use strict';
// ── Channel naming helpers ───────────────────────────────────────────────────
const GROUP_EMOJIS = { A: '🟢', B: '🟡', C: '🟠', D: '🟤' };
const CIRCLE_NUMS  = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
const KO_EMOJIS    = ['🔵', '🟣', '🔴', '⚫', '🟠', '🟡', '🟢', '🟤'];
const KO_LABELS_BOLD = { 1: '𝗙𝗜𝗡𝗔𝗟', 2: '𝗦𝗙', 4: '𝗤𝗙', 8: '𝗥𝟭𝟲', 16: '𝗥𝟯𝟮' };
const BOLD_MD = ['', '𝗠𝗗𝟭', '𝗠𝗗𝟮', '𝗠𝗗𝟯', '𝗠𝗗𝟰', '𝗠𝗗𝟱', '𝗠𝗗𝟲', '𝗠𝗗𝟳', '𝗠𝗗𝟴', '𝗠𝗗𝟵'];
const BOLD_R  = ['', '𝗥𝟭', '𝗥𝟮', '𝗥𝟯', '𝗥𝟰', '𝗥𝟱', '𝗥𝟲', '𝗥𝟳', '𝗥𝟴', '𝗥𝟵'];
const getClanTag = c => (c && c.tag) ? c.tag : (c ? (c.name || 'clan').slice(0, 5) : 'clan');
const mdLabel    = n => BOLD_MD[n] || ('𝗠𝗗' + n);
const rLabel     = n => BOLD_R[n]  || ('𝗥' + n);

const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { db }                 = require('../utils/database');
const { isBotolaManager }    = require('../utils/permissions');
const {
  buildFederationPanel, buildFedSetupPanel,
  buildFedRolePanel, buildFedSetupSettingsPanel, buildFedMainSettingsPanel, getFed, saveFed,
} = require('../panels/federationPanel');
const { buildFedPanel1, getFedClans, getFedMatches, getFedStage } = require('../panels/fedPanel1');
const { buildFedPanel2 } = require('../panels/fedPanel2');
const { buildFedPanel3 } = require('../panels/fedPanel3');
const {
  makeFedClanListPost, makeFedSchedulePost, makeFedResultsPost,
  makeFedStandingsPost, makeFedGroupDrawPost, makeFedBracketPost,
  makeFedChampionPost, makeFedMatchChannelMsg, calcMatchResult,
} = require('../utils/fedEmbeds');

function noPerm(i)  { return i.reply({ content: '\u274C Managers only.', ephemeral: true }); }
function noAdmin(i) { return i.reply({ content: '\u274C This action requires **Administrator** permission.', ephemeral: true }); }

// Refresh the OTHER two panel messages after any data-changing interaction.
// skipKey = 'p1' | 'p2' | 'p3' so we don't fight the interaction's own update.
async function refreshFedPanels(client, skipKey) {
  try {
    const fed  = getFed();
    const refs = fed?.fed_panel_refs || {};
    if (!refs || !Object.keys(refs).length) {
      console.warn('[FED] refreshFedPanels: no panel refs stored – run /fed_panels first');
      return;
    }
    const map  = { p1: buildFedPanel1, p2: buildFedPanel2, p3: buildFedPanel3 };
    await Promise.all(Object.entries(map).map(async ([key, build]) => {
      if (key === skipKey) return;
      const ref = refs[key];
      if (!ref?.channelId || !ref?.messageId) return;
      const ch  = client.channels.cache.get(ref.channelId)
               ?? await client.channels.fetch(ref.channelId).catch(e => {
                 console.error('[FED] refreshFedPanels: cannot fetch channel', ref.channelId, e?.message);
                 return null;
               });
      if (!ch) return;
      const msg = ch.messages.cache.get(ref.messageId)
               ?? await ch.messages.fetch(ref.messageId).catch(e => {
                 console.error('[FED] refreshFedPanels: cannot fetch message', key, ref.messageId, e?.message);
                 return null;
               });
      if (!msg) return;
      await msg.edit(build()).catch(e => console.error('[FED] refreshFedPanels: edit failed for', key, e?.message));
    }));
  } catch (e) { console.error('[FED] refreshFedPanels error:', e?.message); }
}

// ── Round-robin schedule generator ──────────────────────────────────────────
function roundRobinSchedule(items) {
  const n = items.length % 2 === 0 ? items.length : items.length + 1;
  const t = [...items];
  if (items.length % 2 !== 0) t.push(null);
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      const home = t[i]; const away = t[n - 1 - i];
      if (home && away) round.push([home, away]);
    }
    rounds.push(round);
    t.splice(1, 0, t.pop());
  }
  return rounds;
}

// ── Season cleanup helper ───────────────────────────────────────────────────
async function cleanupFedSeason(guild, clans, matches, fed) {
  // Delete match channels
  try {
    const catId = fed.channels?.category || null;
    if (catId) {
      const cat = await guild.channels.fetch(catId).catch(() => null);
      if (cat && cat.children) {
        for (const [, ch] of cat.children.cache) {
          await ch.delete('Federation season ended').catch(() => {});
        }
      }
    } else {
      for (const m of matches) {
        if (m.channel_id) {
          const ch = await guild.channels.fetch(m.channel_id).catch(() => null);
          if (ch) await ch.delete('Federation season ended').catch(() => {});
        }
      }
    }
  } catch (e) { console.error('[FED] cleanup channels error:', e.message); }
  // Delete clan roles
  try {
    for (const c of clans) {
      if (c.role_id) {
        const role = await guild.roles.fetch(c.role_id).catch(() => null);
        if (role) await role.delete('Federation season ended').catch(() => {});
        db.update('fed_clans', c.id, { role_id: null });
      }
    }
  } catch (e) { console.error('[FED] cleanup roles error:', e.message); }
}

// ── Begin Season ─────────────────────────────────────────────────────────────

// ── Begin Season progress panel ────────────────────────────────────────────────────
function buildBeginSeasonProgressPanel() {
  const fed = getFed();
  const SEP = { type: 14, divider: true, spacing: 1 };
  const txt = c => ({ type: 10, content: c });
  return {
    flags: 32768,
    components: [{ type: 17, accent_color: 0xFF0049, components: [
      txt('## 1 : Main  —  ' + (fed.tag || fed.name || 'Federation')),
      SEP,
      txt('## ⏳  Starting Season…\n> Creating clan roles and match channels.\n> This will only take a moment — please wait.'),
      SEP,
      txt('-# © 24 2026  |  Goatsi Bot'),
    ]}],
  };
}

async function beginSeason(interaction, client) {
  const fed   = getFed();
  const clans = getFedClans();
  if (!clans.length) return interaction.reply({ content: '\u274C No clans registered.', ephemeral: true });
  const season = fed.season || 1;
  const system = fed.system || 'cup';

  // Validate clan count for the chosen system
  const _cc = clans.length;
  if (system === 'cup' && ![8, 16, 32].includes(_cc)) {
    return interaction.reply({ content: `❌ Cup requires exactly **8, 16 or 32 clans**. You have **${_cc}**. Adjust in Settings.`, ephemeral: true });
  }
  if (system === 'league' && (_cc < 8 || _cc > 15)) {
    return interaction.reply({ content: `❌ League requires **8 – 15 clans**. You have **${_cc}**. Adjust in Settings.`, ephemeral: true });
  }

  // Defer with ephemeral reply so Discord doesn't time out.
  // We update panels via direct msg.edit() through stored refs (more reliable
  // than interaction.editReply() for non-ephemeral panel messages).
  await interaction.deferUpdate();
  await interaction.editReply(buildBeginSeasonProgressPanel());

  // Ensure fed_clans/fed_matches tables exist
  if (!db.get('fed_clans'))   { db._ensure('fed_clans'); }
  if (!db.get('fed_matches')) { db._ensure('fed_matches'); }

  let matchesToInsert = [];

  if (system === 'league') {
    const enc      = fed.encounters || 2;
    const schedule = roundRobinSchedule(clans);
    let   round    = 1;
    for (const rnd of schedule) {
      for (const [home, away] of rnd) {
        matchesToInsert.push({ home_clan_id: home.id, away_clan_id: away.id, stage: 'group', group_name: null, round, status: 'pending', fed_season: season });
      }
      round++;
    }
    if (enc === 2) {
      const half = round - 1;
      const returnFixtures = matchesToInsert.map((m, i) => ({
        home_clan_id: m.away_clan_id, away_clan_id: m.home_clan_id,
        stage: 'group', group_name: null, round: m.round + half,
        status: 'pending', fed_season: season,
      }));
      matchesToInsert = matchesToInsert.concat(returnFixtures);
    }
  } else {
    // Cup — groups
    const groupSize = fed.teams_per_group || 4;
    const shuffled  = [...clans].sort(() => Math.random() - 0.5);
    const groups    = [];
    for (let i = 0; i < shuffled.length; i += groupSize) groups.push(shuffled.slice(i, i + groupSize));
    groups.forEach((group, gi) => {
      const gName = String.fromCharCode(65 + gi);
      group.forEach(c => db.update('fed_clans', c.id, { group_name: gName }));
      const schedule = roundRobinSchedule(group);
      schedule.forEach((rnd, ri) => {
        for (const [home, away] of rnd) {
          matchesToInsert.push({ home_clan_id: home.id, away_clan_id: away.id, stage: 'group', group_name: gName, round: ri + 1, status: 'pending', fed_season: season });
        }
      });
    });
  }

  // Guard: if matches already exist for this season, skip generation
  const _existingM = (db.get('fed_matches') || []).filter(m => m.fed_season === season);
  if (_existingM.length === 0) db.insertMany('fed_matches', matchesToInsert);
  saveFed({ status: 'active' });

  // Create clan roles (separate try/catch so failure doesn't block channel creation)
  try {
    const _rGuild = interaction.guild;
    for (const clan of clans) {
      if (!clan.role_id) {
        const role = await _rGuild.roles.create({ name: clan.name, reason: 'Federation season start' });
        db.update('fed_clans', clan.id, { role_id: role.id });
      }
    }
  } catch (e) { console.error('[FED] Role creation error:', e.message, e.code || ''); }

  // Create match channels for first round
  try {
    const guild      = interaction.guild;
    const staffRole  = fed.staff_role_id;
    const fmt        = fed.channel_name_format || '{a}-vs-{b}';

    // Reload clans to get role IDs
    const updatedClans = getFedClans();
    const getClan = id => updatedClans.find(c => c.id === id) || {};
    const _maxCh = Math.floor((fed.clan_count || clans.length) / 2);
    const insertedMatches = (db.get('fed_matches') || [])
      .filter(m => m.fed_season === season && m.round === 1)
      .slice(0, _maxCh);

    // Create match channels
    const parentCat = fed.channels?.category || null;
    const _letters  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let _chi = 0; _chi < insertedMatches.length; _chi++) {
      const im     = insertedMatches[_chi];
      const clanA  = getClan(im.home_clan_id);
      const clanB  = getClan(im.away_clan_id);
      if (!clanA.id || !clanB.id) continue;
      // cup → group emoji + MD1 + tags  |  league → circled number + R1 + tags
      let chName;
      if (system === 'cup') {
        const grpEmoji = GROUP_EMOJIS[im.group_name] || '';
        chName = (grpEmoji + mdLabel(1) + '\u30fb' + getClanTag(clanA) + '\u30fb\uD835\uDDE9\uD835\uDDE6\u30fb' + getClanTag(clanB)).slice(0, 100);
      } else {
        const circleNum = CIRCLE_NUMS[_chi] || String(_chi + 1);
        chName = (circleNum + '\u30fb' + rLabel(1) + '\u30fb' + getClanTag(clanA) + '\u30fb\uD835\uDDE9\uD835\uDDE6\u30fb' + getClanTag(clanB)).slice(0, 100);
      }

      const permOverwrites = [
        { id: guild.id, deny: ['ViewChannel'] },
      ];
      if (staffRole) permOverwrites.push({ id: staffRole, allow: ['ViewChannel', 'SendMessages'] });
      if (clanA.role_id) permOverwrites.push({ id: clanA.role_id, allow: ['ViewChannel', 'SendMessages'] });
      if (clanB.role_id) permOverwrites.push({ id: clanB.role_id, allow: ['ViewChannel', 'SendMessages'] });

      const chOpts = { name: chName, type: 0, permissionOverwrites: permOverwrites, reason: 'Federation match channel' };
      if (parentCat) chOpts.parent = parentCat;
      const ch = await guild.channels.create(chOpts);
      // Post match announcement
      const msg = makeFedMatchChannelMsg(clanA.name || '?', clanB.name || '?');
      await ch.send(msg);
      // Store channel id on match
      const realMatch = (db.get('fed_matches') || []).find(m => m.home_clan_id === im.home_clan_id && m.away_clan_id === im.away_clan_id && m.fed_season === season && m.round === 1);
      if (realMatch) db.update('fed_matches', realMatch.id, { channel_id: ch.id });
    }
  } catch (e) { console.error('[FED] Channel creation error:', e.message, e.code || ''); }

  // Refresh p2+p3 only; p1 updated via editReply to avoid race condition
  await Promise.all([
    refreshFedPanels(client, 'p1').catch(e => console.error('[FED] beginSeason refresh:', e?.message)),
    interaction.editReply(buildFedPanel1()),
  ]);
}

// ── Advance Round ─────────────────────────────────────────────────────────────
async function advanceRound(interaction, client) {
  const fed     = getFed();
  const matches = getFedMatches();
  const clans   = getFedClans();
  const system  = fed.system || 'cup';
  const season  = fed.season || 1;

  if (system === 'league') {
    // League: delete previous round channels, create new round channels
    await interaction.deferUpdate();
    await interaction.editReply({ flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: [{ type: 10, content: '## ⏳  Advancing Round…\n> Setting up next round channels, please wait.' }]}]});
    try {
      const guild     = interaction.guild;
      const staffRole = fed.staff_role_id;
      const parentCat = fed.channels?.category || null;
      const updClans  = getFedClans();
      const getClanL  = id => updClans.find(c => c.id === id) || {};
      const allRnds   = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
      const pending   = matches.filter(m => m.status === 'pending');
      if (!pending.length) { return interaction.editReply(buildFedPanel1()); }
      const prevRnd   = Math.min(...pending.map(m => m.round)) - 1;
      const nextRnd   = Math.min(...pending.map(m => m.round));
      // Delete previous round channels
      for (const m of matches.filter(m => m.round === prevRnd && m.channel_id)) {
        const ch = await guild.channels.fetch(m.channel_id).catch(() => null);
        if (ch) await ch.delete('Fed league next round').catch(() => {});
        db.update('fed_matches', m.id, { channel_id: null });
      }
      // Create next round channels
      const nextMatches = (db.get('fed_matches') || []).filter(m => m.fed_season === season && m.round === nextRnd);
      for (let _li = 0; _li < nextMatches.length; _li++) {
        const im    = nextMatches[_li];
        const clanA = getClanL(im.home_clan_id);
        const clanB = getClanL(im.away_clan_id);
        if (!clanA.id || !clanB.id) continue;
        const circleNum = CIRCLE_NUMS[_li] || String(_li + 1);
        const chName = (circleNum + '\u30fb' + rLabel(nextRnd) + '\u30fb' + getClanTag(clanA) + '\u30fb\uD835\uDDE9\uD835\uDDE6\u30fb' + getClanTag(clanB)).slice(0, 100);
        const po = [{ id: guild.id, deny: ['ViewChannel'] }];
        if (staffRole)       po.push({ id: staffRole,       allow: ['ViewChannel', 'SendMessages'] });
        if (clanA.role_id)   po.push({ id: clanA.role_id,   allow: ['ViewChannel', 'SendMessages'] });
        if (clanB.role_id)   po.push({ id: clanB.role_id,   allow: ['ViewChannel', 'SendMessages'] });
        const chOpts = { name: chName, type: 0, permissionOverwrites: po, reason: 'Fed league round ' + nextRnd };
        if (parentCat) chOpts.parent = parentCat;
        const ch = await guild.channels.create(chOpts);
        await ch.send(makeFedMatchChannelMsg(clanA.name || '?', clanB.name || '?'));
        db.update('fed_matches', im.id, { channel_id: ch.id });
      }
    } catch (e) { console.error('[FED] League advance round channel error:', e.message); }
    await Promise.all([
      refreshFedPanels(client, 'p1').catch(e => console.error('[FED] league advance refresh:', e?.message)),
      interaction.editReply(buildFedPanel1()),
    ]);
    return;
  }

  // Acknowledge immediately — channel creation can take several seconds
  await interaction.deferUpdate();
  await interaction.editReply({ flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: [{ type: 10, content: '## ⏳  Processing…\n> Setting up channels, please wait.' }]}]});

  // Cup: check if all group matches done → generate knockout
  const groupMatches  = matches.filter(m => m.stage === 'group');
  const koMatches     = matches.filter(m => m.stage === 'knockout');
  const allGroupDone  = groupMatches.length > 0 && groupMatches.every(m => m.status === 'played');

  // Cup: if group stage not fully done, advance to next group matchday
  if (!allGroupDone && koMatches.length === 0) {
    const _gRounds     = [...new Set(groupMatches.map(m => m.round))].sort((a,b)=>a-b);
    const _started     = groupMatches.filter(m => m.channel_id || m.status === 'played').map(m => m.round);
    const _activeRound = _started.length ? Math.max(..._started) : 1;
    const _nextRound   = _activeRound + 1;
    if (_gRounds.includes(_nextRound)) {
      try {
        const guild     = interaction.guild;
        const staffRole = fed.staff_role_id;
        const parentCat = fed.channels?.category || null;
        const updClans  = getFedClans();
        const getClanG  = id => updClans.find(c => c.id === id) || {};
        // Delete active-round channels
        for (const m of groupMatches.filter(m => m.round === _activeRound && m.channel_id)) {
          const ch = await guild.channels.fetch(m.channel_id).catch(() => null);
          if (ch) await ch.delete('Fed next matchday').catch(() => {});
          db.update('fed_matches', m.id, { channel_id: null });
        }
        // Create next-round channels — capped at clans/2
        const _maxCh2 = Math.floor((fed.clan_count || updClans.length) / 2);
        const freshM = (db.get('fed_matches') || []).filter(m => m.fed_season === season && m.stage === 'group' && m.round === _nextRound).slice(0, _maxCh2);
        for (const im of freshM) {
          const clanA = getClanG(im.home_clan_id);
          const clanB = getClanG(im.away_clan_id);
          const grpEmoji = GROUP_EMOJIS[im.group_name] || '';
          const chName = (grpEmoji + mdLabel(_nextRound) + '\u30fb' + getClanTag(clanA) + '\u30fb\uD835\uDDE9\uD835\uDDE6\u30fb' + getClanTag(clanB)).slice(0, 100);
          const po = [{ id: guild.id, deny: ['ViewChannel'] }];
          if (staffRole)       po.push({ id: staffRole,       allow: ['ViewChannel','SendMessages'] });
          if (clanA.role_id)   po.push({ id: clanA.role_id,   allow: ['ViewChannel','SendMessages'] });
          if (clanB.role_id)   po.push({ id: clanB.role_id,   allow: ['ViewChannel','SendMessages'] });
          const chOpts = { name: chName, type: 0, permissionOverwrites: po, reason: 'Fed matchday ' + _nextRound };
          if (parentCat) chOpts.parent = parentCat;
          const ch = await guild.channels.create(chOpts);
          await ch.send(makeFedMatchChannelMsg(clanA.name || '?', clanB.name || '?'));
          db.update('fed_matches', im.id, { channel_id: ch.id });
        }
      } catch (e) { console.error('[FED] Group matchday channel error:', e.message); }
      await Promise.all([
        refreshFedPanels(client, 'p1').catch(e => console.error('[FED] group matchday refresh:', e?.message)),
        interaction.editReply(buildFedPanel1()),
      ]);
      return;
    }
  }

  if (allGroupDone && !koMatches.length) {
    // Generate first KO round from group standings
    await generateKnockoutRound(interaction, client, fed, clans, matches, season);
    return;
  }

  // Cup KO: advance to next KO round
  const koPending = koMatches.filter(m => m.status === 'pending');
  const _koPlayed = koMatches.filter(m => m.status === 'played');
  const curRound  = koPending.length
    ? Math.max(...koPending.map(m => m.round))
    : _koPlayed.length ? Math.min(..._koPlayed.map(m => m.round)) : 1;
  if (curRound === 1) {
    // Final match played — end season
    const _finalPlayed = koMatches.some(m => m.round === 1 && m.status === 'played');
    if (_finalPlayed) {
      await cleanupFedSeason(interaction.guild, getFedClans(), getFedMatches(), getFed());
      const _endedS = getFed();
      saveFed({ status: 'setup', season: (_endedS.season || 1) + 1, registration_open: true });
      db.setConfig('fed_bracket_ref', null);
    db.setConfig('fed_standings_ref', null);
      await Promise.all([
        refreshFedPanels(client, 'p1').catch(() => {}),
        interaction.editReply(buildFedPanel1()),
      ]);
      return;
    }
    // Final created but not played (shouldn't happen — Next is disabled), just refresh
    if (koMatches.some(m => m.round === 1 && m.status === 'pending')) return interaction.editReply(buildFedPanel1());
  }

  const curPlayed = koMatches.filter(m => m.round === curRound && m.status === 'played');
  const nextRound = Math.floor(curRound / 2);
  const newMatches = [];

  // Pair winners
  const winners = curPlayed.map(m => {
    const { hp, ap } = calcMatchResult(m);
    return hp > ap ? m.home_clan_id : m.away_clan_id;
  });
  for (let i = 0; i < winners.length - 1; i += 2) {
    newMatches.push({ home_clan_id: winners[i], away_clan_id: winners[i + 1], stage: 'knockout', group_name: null, round: nextRound, status: 'pending', fed_season: season });
  }
  db.insertMany('fed_matches', newMatches);

  // Create new match channels, delete old ones
  try {
    const guild     = interaction.guild;
    const staffRole = fed.staff_role_id;
    const fmt       = fed.channel_name_format || '{a}-vs-{b}';
    const parentCat = fed.channels?.category || null;
    const updClans  = getFedClans();
    const getClan   = id => updClans.find(c => c.id === id) || {};

    // Delete old channels
    for (const m of curPlayed) {
      if (m.channel_id) {
        const ch = await guild.channels.fetch(m.channel_id).catch(() => null);
        if (ch) await ch.delete('Federation next round').catch(() => {});
      }
    }

    // Create new channels
    const inserted = (db.get('fed_matches') || []).filter(m => m.fed_season === season && m.round === nextRound && m.stage === 'knockout');
    for (let _koi = 0; _koi < inserted.length; _koi++) {
      const im    = inserted[_koi];
      const clanA = getClan(im.home_clan_id);
      const clanB = getClan(im.away_clan_id);
      let chName;
      if (nextRound === 1) {
        chName = ('\uD83C\uDFC6\uD835\uDDD9\uD835\uDDD6\uD835\uDDE1\uD835\uDDD4\uD835\uDDDF\u30fb' + getClanTag(clanA) + '\u30fb\uD835\uDDE9\uD835\uDDE6\u30fb' + getClanTag(clanB)).slice(0, 100);
      } else {
        const koLbl = KO_LABELS_BOLD[nextRound] || ('\uD835\uDDE5\uD835\uDDE2' + nextRound);
        chName = ((KO_EMOJIS[_koi] || KO_EMOJIS[0]) + koLbl + '\u30fb' + getClanTag(clanA) + '\u30fb\uD835\uDDE9\uD835\uDDE6\u30fb' + getClanTag(clanB)).slice(0, 100);
      }
      const po = [{ id: guild.id, deny: ['ViewChannel'] }];
      if (staffRole)       po.push({ id: staffRole,       allow: ['ViewChannel', 'SendMessages'] });
      if (clanA.role_id)   po.push({ id: clanA.role_id,   allow: ['ViewChannel', 'SendMessages'] });
      if (clanB.role_id)   po.push({ id: clanB.role_id,   allow: ['ViewChannel', 'SendMessages'] });
      const koChOpts = { name: chName, type: 0, permissionOverwrites: po, reason: 'Fed KO round' };
      if (parentCat) koChOpts.parent = parentCat;
      const ch = await guild.channels.create(koChOpts);
      await ch.send(makeFedMatchChannelMsg(clanA.name || '?', clanB.name || '?'));
      db.update('fed_matches', im.id, { channel_id: ch.id });
    }
  } catch (e) { console.error('[FED] KO channel error:', e.message); }

  await Promise.all([
    refreshFedPanels(client, 'p1').catch(e => console.error('[FED] KO advance refresh:', e?.message)),
    interaction.editReply(buildFedPanel1()),
  ]);
}

async function generateKnockoutRound(interaction, client, fed, clans, matches, season) {
  // Already deferred by advanceRound caller
  const getClan = id => clans.find(c => c.id === id) || {};
  // Calculate group standings and pick top N advancers
  const advance = fed.advance_per_group || 2;
  const groups  = {};
  for (const c of clans) {
    if (c.group_name) {
      if (!groups[c.group_name]) groups[c.group_name] = [];
      groups[c.group_name].push(c);
    }
  }

  const init = () => ({ w: 0, d: 0, l: 0, pts: 0, gf: 0, ga: 0 });
  const stats = {};
  for (const m of matches.filter(m => m.status === 'played' && m.stage === 'group')) {
    if (!stats[m.home_clan_id]) stats[m.home_clan_id] = init();
    if (!stats[m.away_clan_id]) stats[m.away_clan_id] = init();
    const { hp, ap } = calcMatchResult(m);
    const hs = stats[m.home_clan_id]; const as = stats[m.away_clan_id];
    hs.gf += hp; hs.ga += ap; as.gf += ap; as.ga += hp;
    if (hp > ap) { hs.w++; hs.pts += 3; as.l++; }
    else if (hp < ap) { as.w++; as.pts += 3; hs.l++; }
    else { hs.d++; hs.pts += 1; as.d++; as.pts += 1; }
  }

  const qualifiers = [];
  for (const g of Object.keys(groups).sort()) {
    const sorted = groups[g].sort((a, b) => {
      const sa = stats[a.id] || init(); const sb = stats[b.id] || init();
      return (sb.pts - sa.pts) || ((sb.gf - sb.ga) - (sa.gf - sa.ga));
    });
    qualifiers.push(...sorted.slice(0, advance));
  }

  const firstRound = Math.floor(qualifiers.length / 2);
  const newMatches = [];
  for (let i = 0; i < qualifiers.length - 1; i += 2) {
    newMatches.push({ home_clan_id: qualifiers[i].id, away_clan_id: qualifiers[i + 1].id, stage: 'knockout', group_name: null, round: firstRound, status: 'pending', fed_season: season });
  }
  db.insertMany('fed_matches', newMatches);

  // Delete last group-stage match channels before opening KO channels
  try {
    const guild = interaction.guild;
    const lastGroupMatches = (db.get('fed_matches') || []).filter(m => m.fed_season === season && m.stage === 'group' && m.channel_id);
    for (const m of lastGroupMatches) {
      const ch = await guild.channels.fetch(m.channel_id).catch(() => null);
      if (ch) await ch.delete('Fed group stage complete — opening KO').catch(() => {});
      db.update('fed_matches', m.id, { channel_id: null });
    }
  } catch (e) { console.error('[FED] Group channel cleanup error:', e.message); }

  // Create match channels for this first KO round
  try {
    const guild     = interaction.guild;
    const staffRole = fed.staff_role_id;
    const fmt       = fed.channel_name_format || '{a}-vs-{b}';
    const parentCat = fed.channels?.category || null;
    const updClans  = getFedClans();
    const getClanU  = id => updClans.find(c => c.id === id) || {};
    const inserted  = (db.get('fed_matches') || []).filter(m => m.fed_season === season && m.round === firstRound && m.stage === 'knockout');
    for (let _koi2 = 0; _koi2 < inserted.length; _koi2++) {
      const im    = inserted[_koi2];
      const clanA = getClanU(im.home_clan_id);
      const clanB = getClanU(im.away_clan_id);
      let chName;
      if (firstRound === 1) {
        chName = ('\uD83C\uDFC6\uD835\uDDD9\uD835\uDDD6\uD835\uDDE1\uD835\uDDD4\uD835\uDDDF\u30fb' + getClanTag(clanA) + '\u30fb\uD835\uDDE9\uD835\uDDE6\u30fb' + getClanTag(clanB)).slice(0, 100);
      } else {
        const koLbl2 = KO_LABELS_BOLD[firstRound] || ('\uD835\uDDE5\uD835\uDDE2' + firstRound);
        chName = ((KO_EMOJIS[_koi2] || KO_EMOJIS[0]) + koLbl2 + '\u30fb' + getClanTag(clanA) + '\u30fb\uD835\uDDE9\uD835\uDDE6\u30fb' + getClanTag(clanB)).slice(0, 100);
      }
      const po = [{ id: guild.id, deny: ['ViewChannel'] }];
      if (staffRole)     po.push({ id: staffRole,     allow: ['ViewChannel', 'SendMessages'] });
      if (clanA.role_id) po.push({ id: clanA.role_id, allow: ['ViewChannel', 'SendMessages'] });
      if (clanB.role_id) po.push({ id: clanB.role_id, allow: ['ViewChannel', 'SendMessages'] });
      const koChOpts = { name: chName, type: 0, permissionOverwrites: po, reason: 'Fed KO first round' };
      if (parentCat) koChOpts.parent = parentCat;
      const ch = await guild.channels.create(koChOpts);
      await ch.send(makeFedMatchChannelMsg(clanA.name || '?', clanB.name || '?'));
      db.update('fed_matches', im.id, { channel_id: ch.id });
    }
  } catch (e) { console.error('[FED] KO first round channel error:', e.message); }

  await Promise.all([
    refreshFedPanels(client, 'p1').catch(e => console.error('[FED] KO first round refresh:', e?.message)),
    interaction.editReply(buildFedPanel1()),
  ]);
}

// ── Build Match Result Panel ─────────────────────────────────────────────────
function buildMatchResultPanel(matchId) {
  const clans   = getFedClans();
  const matches = getFedMatches();
  const match   = matches.find(m => m.id === matchId);
  if (!match) return buildFedPanel1();

  const getClan = id => clans.find(c => c.id === id) || { name: '?' };
  const home    = getClan(match.home_clan_id);
  const away    = getClan(match.away_clan_id);
  const stage   = match.stage === 'knockout' ? 'Knockout' : 'Group ' + (match.group_name || '?');

  const SEP = { type: 14, divider: true, spacing: 1 };
  const txt = c => ({ type: 10, content: c });

  const isKO = match.stage === 'knockout';
  const resultBtns = isKO
    ? [
        { type: 2, style: 3, label: '\uD83C\uDFE0  ' + home.name + ' Wins', custom_id: 'fed_p1_result_home_' + matchId },
        { type: 2, style: 3, label: '\u2708\uFE0F  ' + away.name + ' Wins', custom_id: 'fed_p1_result_away_' + matchId },
      ]
    : [
        { type: 2, style: 3, label: '\uD83C\uDFE0  ' + home.name + ' Wins', custom_id: 'fed_p1_result_home_' + matchId },
        { type: 2, style: 2, label: '\u2696\uFE0F  Draw',                   custom_id: 'fed_p1_result_draw_' + matchId },
        { type: 2, style: 3, label: '\u2708\uFE0F  ' + away.name + ' Wins', custom_id: 'fed_p1_result_away_' + matchId },
      ];

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: [
    txt('**\u26BD  Match Result**\n> ' + home.name.toUpperCase() + '  vs  ' + away.name.toUpperCase() + '\n-# ' + stage + (isKO ? '  \u2022  Round ' + match.round + '  \u2022  \u26A0\uFE0F No draws in knockout' : '  \u2022  Round ' + match.round)),
    SEP,
    txt('Select the outcome:'),
    SEP,
    { type: 1, components: resultBtns },
    SEP,
    { type: 1, components: [
      { type: 2, style: 4, label: '\u25C4  Cancel', custom_id: 'fed_p1_refresh' },
    ]},
  ]}]};
}

// ── Build Match Selector Panel ────────────────────────────────────────────────
// ── Build round-selector panel (entry point for Add Result) ─────────────────
function buildMatchSelectorPanel() {
  const fed     = getFed();
  const system  = fed.system || 'cup';
  const allM    = getFedMatches();
  const clans   = getFedClans();
  const SEP     = { type: 14, divider: true, spacing: 1 };
  const txt     = c => ({ type: 10, content: c });

  // Knockout stage: skip round selector, go straight to KO match buttons
  if (system === 'cup') {
    const koPending = allM.filter(m => m.stage === 'knockout' && m.status === 'pending');
    if (koPending.length > 0) {
      const curRound = Math.max(...koPending.map(m => m.round));
      return buildFedRoundMatchesPanel(curRound, allM, clans, 'fed_p1_refresh');
    }
  }

  // Cup group stage: go directly to current active round (no selector)
  if (system === 'cup') {
    const groupM    = allM.filter(m => m.stage === 'group');
    if (groupM.length > 0) {
      const started   = groupM.filter(m => m.channel_id || m.status === 'played').map(m => m.round);
      const activeRound = started.length ? Math.max(...started) : 1;
      // Always show round matches — manager decides when to advance, not the bot
      return buildFedRoundMatchesPanel(activeRound, allM, clans, 'fed_p1_refresh');
    }
  }

  // League: always go to current active round (lowest pending) — no dropdown
  const pending = allM.filter(m => m.status === 'pending');

  if (!pending.length) {
    return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: [
      txt('**No pending matches.**'),
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: '\u25C4  Back', custom_id: 'fed_p1_refresh' }] },
    ]}]};
  }

  const curLeagueRound = Math.min(...pending.map(m => m.round));
  return buildFedRoundMatchesPanel(curLeagueRound, allM, clans, 'fed_p1_refresh');
}

// ── Round match-button panel (like CL/EL buildRoundMatchesPanel) ─────────────
function buildFedRoundMatchesPanel(round, allM, clans, backId) {
  const _allM   = allM   || getFedMatches();
  const _clans  = clans  || getFedClans();
  const _backId = backId || 'fed_p1_addresult';
  const getClan = id => _clans.find(c => c.id === id) || { name: '?' };
  const RLABELS = { 1: 'Final', 2: 'Semi-Finals', 4: 'Quarter-Finals', 8: 'Round of 16', 16: 'Round of 32' };
  const SEP     = { type: 14, divider: true, spacing: 1 };
  const txt     = c => ({ type: 10, content: c });

  const roundMatches = _allM.filter(m => m.round === round);
  if (!roundMatches.length) {
    return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: [
      txt('**No matches found for Round ' + round + '.**'),
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: '\u25C4  Back', custom_id: _backId }] },
    ]}]};
  }

  const isKO      = roundMatches[0]?.stage === 'knockout';
  const rlabel    = isKO ? (RLABELS[round] || 'Round ' + round) : 'Round ' + round;
  const pending   = roundMatches.filter(m => m.status === 'pending').length;
  const played    = roundMatches.filter(m => m.status === 'played').length;

  const inner = [];
  inner.push(txt('**Add Result \u2014 ' + rlabel + '**'));
  inner.push(SEP);
  inner.push(txt('> **' + played + '** played  \u2022  **' + pending + '** pending'));
  inner.push(SEP);

  // Matches as buttons, 2 per row
  for (let i = 0; i < roundMatches.length; i += 2) {
    const chunk = roundMatches.slice(i, i + 2);
    inner.push({ type: 1, components: chunk.map(m => {
      const home  = getClan(m.home_clan_id);
      const away  = getClan(m.away_clan_id);
      const done  = m.status === 'played';
      const label = home.name + ' v ' + away.name;
      // Truncate label to 80 chars (Discord button label limit)
      return { type: 2, style: done ? 2 : 1, label: label.slice(0, 80), custom_id: 'fed_p1_matchbtn_' + m.id, disabled: false };
    })});
  }

  inner.push(SEP);
  inner.push({ type: 1, components: [{ type: 2, style: 2, label: '\u25C4  Back', custom_id: _backId }]});

  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }]};
}

// ── Publish helpers ───────────────────────────────────────────────────────────
async function doPublish(interaction, buildFn, preferredChKey = 'results') {
  await interaction.deferUpdate();
  const fed     = getFed();
  const preview = fed.p3_preview === true;
  const tagOn   = fed.p3_tag === true;
  const ch      = fed.channels || {};
  const msg     = buildFn();
  if (!msg) return interaction.followUp({ content: '\u274C Could not build post.', ephemeral: true });
  if (preview) return interaction.followUp({ ...msg, ephemeral: true });

  const targetChId = ch[preferredChKey] || ch.management;
  if (!targetChId) return interaction.followUp({ content: '\u274C No channel set. Set a Results or Schedule channel in Channels & Roles.', ephemeral: true });
  const target = interaction.guild.channels.cache.get(targetChId) || await interaction.guild.channels.fetch(targetChId).catch(() => null);
  if (!target) return interaction.followUp({ content: '\u274C Channel not found.', ephemeral: true });

  let msgToSend = msg;
  if (tagOn && fed.registration_role_id) {
    const roleId  = fed.registration_role_id;
    const isV2    = (msg.flags & 32768) && Array.isArray(msg.components);
    if (isV2) {
      const container = msg.components[0];
      if (container && container.type === 17 && Array.isArray(container.components)) {
        msgToSend = {
          ...msg,
          components: [
            { ...container, components: [{ type: 10, content: '<@&' + roleId + '>' }, ...container.components] },
            ...msg.components.slice(1),
          ],
        };
      }
    } else {
      msgToSend = { ...msg, content: '<@&' + roleId + '>' + (msg.content ? '\n' + msg.content : '') };
    }
  }
  await target.send(msgToSend);
  const _dpConfirm = await interaction.followUp({ flags: 64 | 32768, components: [{ type: 17, accent_color: 0x57F287, components: [
    { type: 10, content: '\u2705 Posted to <#' + targetChId + '>.' },
  ]}]});
  setTimeout(() => _dpConfirm.delete().catch(() => {}), 4000);
}

// ── Live-post publish (edit existing or send new) ─────────────────────────────
async function doPublishLive(interaction, buildFn, preferredChKey, liveRefKey) {
  await interaction.deferUpdate();
  const fed     = getFed();
  const preview = fed.p3_preview === true;
  const tagOn   = fed.p3_tag === true;
  const ch      = fed.channels || {};
  const msg     = buildFn();
  if (!msg) return interaction.followUp({ content: '\u274C Could not build post.', ephemeral: true });
  if (preview) return interaction.followUp({ ...msg, ephemeral: true });

  const targetChId = ch[preferredChKey] || ch.management;
  if (!targetChId) return interaction.followUp({ content: '\u274C No channel set.', ephemeral: true });
  const target = interaction.guild.channels.cache.get(targetChId) || await interaction.guild.channels.fetch(targetChId).catch(() => null);
  if (!target) return interaction.followUp({ content: '\u274C Channel not found.', ephemeral: true });

  let msgToSend = msg;
  if (tagOn && fed.registration_role_id) {
    const roleId = fed.registration_role_id;
    const isV2   = (msg.flags & 32768) && Array.isArray(msg.components);
    if (isV2) {
      const container = msg.components[0];
      if (container && container.type === 17 && Array.isArray(container.components)) {
        msgToSend = { ...msg, components: [{ ...container, components: [{ type: 10, content: '<@&' + roleId + '>' }, ...container.components] }, ...msg.components.slice(1)] };
      }
    } else {
      msgToSend = { ...msg, content: '<@&' + roleId + '>' + (msg.content ? '\n' + msg.content : '') };
    }
  }

  // Try to edit existing live message
  const ref = db.getConfig(liveRefKey);
  let edited = false;
  if (ref) {
    try {
      const refCh  = interaction.guild.channels.cache.get(ref.channelId) || await interaction.guild.channels.fetch(ref.channelId).catch(() => null);
      const refMsg = refCh ? await refCh.messages.fetch(ref.messageId).catch(() => null) : null;
      if (refMsg) { await refMsg.edit(msgToSend); edited = true; }
    } catch (_) {}
  }
  if (!edited) {
    const posted = await target.send(msgToSend).catch(() => null);
    if (posted) db.setConfig(liveRefKey, { channelId: targetChId, messageId: posted.id });
  }

  const verb = edited ? 'Updated' : 'Posted to';
  const _dlConfirm = await interaction.followUp({ flags: 64 | 32768, components: [{ type: 17, accent_color: 0x57F287, components: [
    { type: 10, content: '\u2705 ' + verb + ' <#' + targetChId + '>.' },
  ]}]});
  setTimeout(() => _dlConfirm.delete().catch(() => {}), 4000);
}

// ── Live bracket refresh ────────────────────────────────────────────────────────────────
async function refreshFedBracketMessage(client) {
  const ref = db.getConfig('fed_bracket_ref');
  if (!ref) return;
  try {
    const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
    if (!msg) return;
    const fed     = getFed();
    const clans   = getFedClans();
    const matches = getFedMatches();
    const payload = makeFedBracketPost(fed, matches, clans);
    if (payload) await msg.edit(payload).catch(() => {});
  } catch {}
}

// ── Live standings refresh ────────────────────────────────────────────────────
async function refreshFedStandingsMessage(client) {
  const ref = db.getConfig('fed_standings_ref');
  if (!ref) return;
  try {
    const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
    if (!msg) return;
    const fed     = getFed();
    const clans   = getFedClans();
    const matches = getFedMatches();
    const isLeague= (fed.system || 'cup') === 'league';
    const payload = makeFedStandingsPost(fed, matches, clans, isLeague);
    if (payload) await msg.edit(payload).catch(() => {});
  } catch {}
}

// ── Main handler ──────────────────────────────────────────────────────────────
async function handleFederationInteraction(interaction, client) {
  const id = interaction.customId;
  if (!isBotolaManager(interaction.member)) return noPerm(interaction);

  // ── Main panel ──────────────────────────────────────────────────────────────
  if (id === 'fed_refresh')  return interaction.update(buildFederationPanel());

  // ── Panels: send all 3 to management channel (same as bot_sel_t) ────────
  if (id === 'fed_panels') {
    const fed = getFed();
    const ch  = fed.channels || {};
    if (!ch.management) {
      return interaction.reply({ content: '\u274c No management channel set.\nGo to **Channels & Roles** first.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const mgmtCh = await client.channels.fetch(ch.management).catch(() => null);
    if (!mgmtCh) return interaction.editReply({ content: '\u274c Management channel not found.' });

    // Delete old panel messages if stored
    const refs = fed.fed_panel_refs || {};
    await Promise.all(Object.values(refs).map(async ref => {
      if (!ref?.messageId) return;
      const old = await mgmtCh.messages.fetch(ref.messageId).catch(() => null);
      if (old) await old.delete().catch(() => {});
    }));
    saveFed({ fed_panel_refs: {} });

    const msg1 = await mgmtCh.send(buildFedPanel1()).catch(() => null);
    const msg2 = await mgmtCh.send(buildFedPanel2()).catch(() => null);
    const msg3 = await mgmtCh.send(buildFedPanel3()).catch(() => null);
    saveFed({ fed_panel_refs: {
      p1: msg1 ? { channelId: mgmtCh.id, messageId: msg1.id } : null,
      p2: msg2 ? { channelId: mgmtCh.id, messageId: msg2.id } : null,
      p3: msg3 ? { channelId: mgmtCh.id, messageId: msg3.id } : null,
    }});
    return interaction.editReply({ content: '\u2705 Panels sent to <#' + ch.management + '>.' });
  }

  // ── Panel refreshes (buttons on the panels themselves) ──────────────────
  if (id === 'fed_p1_refresh')    return interaction.update(buildFedPanel1());
  if (id === 'fed_settings_back')  return interaction.update(buildFederationPanel());
  // Clan count chosen directly on Panel 1
  if (id === 'fed_p1_clan_count') {
    const val = parseInt(interaction.values[0]);
    if (!isNaN(val)) saveFed({ clan_count: val });
    return interaction.update(buildFedPanel1());
  }
  if (id === 'fed_p2_refresh') return interaction.update(buildFedPanel2());
  if (id === 'fed_p3_refresh') return interaction.update(buildFedPanel3());

  // ── Channels & Roles ────────────────────────────────────────────────────────
  if (id === 'fed_setup')        return interaction.update(buildFedSetupPanel());
  if (id === 'fed_role_picker')  return interaction.update(buildFedRolePanel('reg'));
  if (id === 'fed_staff_picker') return interaction.update(buildFedRolePanel('staff'));
  if (id === 'fed_role_pick') {
    saveFed({ registration_role_id: (interaction.values && interaction.values[0]) || null });
    return interaction.update(buildFedRolePanel('reg'));
  }
  if (id === 'fed_staff_pick') {
    saveFed({ staff_role_id: (interaction.values && interaction.values[0]) || null });
    return interaction.update(buildFedRolePanel('staff'));
  }
  if (id.startsWith('fed_ch_')) {
    const key = id.replace('fed_ch_', '');
    const val = (interaction.values && interaction.values[0]) || null;
    const ch  = { ...(getFed().channels || {}), [key]: val };
    saveFed({ channels: ch });
    return interaction.update(buildFedSetupPanel());
  }

  // ── Settings ────────────────────────────────────────────────────────────────
  if (id === 'fed_setup_settings') return interaction.update(buildFedSetupSettingsPanel());
  if (id === 'fed_p1_settings')    return interaction.update(buildFedMainSettingsPanel());
  if (id === 'fed_cfg_clan_count')       { saveFed({ clan_count: parseInt(interaction.values[0]) }); return interaction.update(buildFedMainSettingsPanel()); }
  if (id === 'fed_cfg_players_per_clan') { saveFed({ players_per_clan: parseInt(interaction.values[0]) }); return interaction.update(buildFedSetupSettingsPanel()); }
  if (id === 'fed_cfg_encounters')       { saveFed({ encounters: parseInt(interaction.values[0]) }); return interaction.update(buildFedMainSettingsPanel()); }
  if (id === 'fed_cfg_teams_per_group')  { saveFed({ teams_per_group: parseInt(interaction.values[0]) }); return interaction.update(buildFedSetupSettingsPanel()); }

  if (id === 'fed_settings_name') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('fed_settings_name_modal').setTitle('Federation Name')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Federation Name').setStyle(TextInputStyle.Short).setValue(getFed().name || '').setMaxLength(80).setRequired(true)
        ))
    );
  }
  if (id === 'fed_settings_name_modal') {
    const name = interaction.fields.getTextInputValue('name').trim();
    if (!name) return interaction.reply({ content: '\u274C Name cannot be empty.', ephemeral: true });
    saveFed({ name });
    await interaction.deferUpdate();
    return interaction.editReply(buildFedSetupSettingsPanel());
  }
  if (id === 'fed_settings_tag') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('fed_settings_tag_modal').setTitle('Federation Tag')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('tag').setLabel('Short Tag (e.g. MEF)').setStyle(TextInputStyle.Short).setValue(getFed().tag || '').setMaxLength(10).setRequired(true)
        ))
    );
  }
  if (id === 'fed_settings_tag_modal') {
    const tag = interaction.fields.getTextInputValue('tag').trim();
    if (!tag) return interaction.reply({ content: '\u274C Tag cannot be empty.', ephemeral: true });
    saveFed({ tag });
    await interaction.deferUpdate();
    return interaction.editReply(buildFedSetupSettingsPanel());
  }
  if (id === 'fed_settings_season') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('fed_settings_season_modal').setTitle('Season Number')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('season').setLabel('Season Number').setStyle(TextInputStyle.Short).setValue(String(getFed().season || 1)).setMaxLength(3).setRequired(true)
        ))
    );
  }
  if (id === 'fed_settings_season_modal') {
    const num = parseInt(interaction.fields.getTextInputValue('season').trim().replace(/\D/g, ''), 10);
    if (!num || num < 1) return interaction.reply({ content: '\u274C Invalid season number.', ephemeral: true });
    saveFed({ season: num });
    await interaction.deferUpdate();
    return interaction.editReply(buildFedMainSettingsPanel());
  }
  if (id === 'fed_settings_chformat') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('fed_settings_chformat_modal').setTitle('Channel Name Format')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('fmt').setLabel('Format (use {a} and {b} for clan names)').setStyle(TextInputStyle.Short).setValue(getFed().channel_name_format || '{a}-vs-{b}').setMaxLength(80).setRequired(true)
        ))
    );
  }
  if (id === 'fed_settings_chformat_modal') {
    const fmt = interaction.fields.getTextInputValue('fmt').trim();
    saveFed({ channel_name_format: fmt });
    await interaction.deferUpdate();
    return interaction.editReply(buildFedSetupSettingsPanel());
  }

  // ── Panel 1: System selector ─────────────────────────────────────────────
  if (id === 'fed_p1_system_sel') {
    const _newSys = interaction.values[0];
    const _curCc  = getFed().clan_count || 16;
    // Auto-fix clan_count if it's not valid for the new system
    let _resetCc = null;
    if (_newSys === 'cup'    && ![8, 16, 32].includes(_curCc)) _resetCc = 16;
    if (_newSys === 'league' && (_curCc < 8 || _curCc > 15))  _resetCc = 8;
    saveFed({ system: _newSys, ...(_resetCc ? { clan_count: _resetCc } : {}) });
    return interaction.update(buildFedPanel1());
  }

  // ── Panel 1: Begin Season ────────────────────────────────────────────────
  if (id === 'fed_p1_begin') {
    if (getFed().status === 'active') return interaction.update(buildFedPanel1());
    return beginSeason(interaction, client);
  }

  // ── Panel 1: Add Result ──────────────────────────────────────────────────
  if (id === 'fed_p1_addresult') return interaction.update(buildMatchSelectorPanel());

  // Round selected from round-selector dropdown
  if (id === 'fed_p1_addresult_rnd') {
    const round = parseInt(interaction.values[0]);
    return interaction.update(buildFedRoundMatchesPanel(round, null, null, 'fed_p1_addresult'));
  }

  // Match button clicked — open result picker
  if (id.startsWith('fed_p1_matchbtn_')) {
    const matchId = parseInt(id.replace('fed_p1_matchbtn_', ''));
    return interaction.update(buildMatchResultPanel(matchId));
  }

  // Legacy dropdown select (backward compat with any old panels in Discord)
  if (id === 'fed_p1_match_sel') {
    const matchId = parseInt(interaction.values[0]);
    return interaction.update(buildMatchResultPanel(matchId));
  }

  if (id.startsWith('fed_p1_result_home_') || id.startsWith('fed_p1_result_draw_') || id.startsWith('fed_p1_result_away_')) {
    let result = 'draw';
    let rawId  = id;
    if (id.startsWith('fed_p1_result_home_')) { result = 'home'; rawId = id.replace('fed_p1_result_home_', ''); }
    else if (id.startsWith('fed_p1_result_draw_')) { result = 'draw'; rawId = id.replace('fed_p1_result_draw_', ''); }
    else if (id.startsWith('fed_p1_result_away_')) { result = 'away'; rawId = id.replace('fed_p1_result_away_', ''); }
    const matchId = parseInt(rawId);
    const allM   = getFedMatches();
    const match  = allM.find(m => m.id === matchId);
    db.update('fed_matches', matchId, { result, status: 'played', home_pts: result === 'home' ? 3 : result === 'draw' ? 1 : 0, away_pts: result === 'away' ? 3 : result === 'draw' ? 1 : 0 });
    // Run refresh + UI update concurrently for instant feedback
    await interaction.deferUpdate();
    await Promise.all([
      refreshFedBracketMessage(client).catch(() => {}),
      refreshFedStandingsMessage(client).catch(() => {}),
      refreshFedPanels(client, 'p1').catch(() => {}),
      interaction.editReply(match
        ? buildFedRoundMatchesPanel(match.round, null, null, 'fed_p1_refresh')
        : buildFedPanel1()),
    ]);
    return;
  }

  // ── Panel 1: Next ────────────────────────────────────────────────────────
  if (id === 'fed_p1_next') return advanceRound(interaction, client);

  // ── Panel 1: End Season (admin only) ────────────────────────────────────
  // ── Panel 1: End Season — confirmation ─────────────────────────────
  if (id === 'fed_p1_end') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return noAdmin(interaction);
    return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: [
      { type: 10, content: '## ⚠️  End Season\n> Are you sure you want to **end the current season**?\n> All match channels will be **deleted**.\n> This cannot be undone.' },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [
        { type: 2, style: 4, label: '✅  Yes, End Season', custom_id: 'fed_p1_end_confirm' },
        { type: 2, style: 2, label: '❌  Cancel',          custom_id: 'fed_p1_end_cancel'  },
      ]},
    ]}]});
  }

  if (id === 'fed_p1_end_cancel') {
    return interaction.update(buildFedPanel1());
  }

  if (id === 'fed_p1_end_confirm') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return noAdmin(interaction);
    await interaction.deferUpdate();
    await interaction.editReply({ flags: 32768, components: [{ type: 17, accent_color: 0xFEE75C, components: [{ type: 10, content: '## ⏳  Ending Season…\n> Deleting channels and cleaning up, please wait.' }]}]});
    try {
      const allM    = getFedMatches();
      const guild   = interaction.guild;
      const fedCfg  = getFed();
      const catId   = fedCfg.channels?.category || null;
      // Sweep: delete every channel in the federation category
      if (catId) {
        const cat = await guild.channels.fetch(catId).catch(() => null);
        if (cat && cat.children) {
          for (const [, ch] of cat.children.cache) {
            await ch.delete('Federation season ended').catch(() => {});
          }
        }
      } else {
        // Fallback: delete only tracked channels
        for (const m of allM) {
          if (m.channel_id) {
            const ch = await guild.channels.fetch(m.channel_id).catch(() => null);
            if (ch) await ch.delete('Federation season ended').catch(() => {});
          }
        }
      }
    } catch (e) { console.error('[FED] End season channel cleanup:', e.message); }
    // Delete clan roles
    try {
      const _rGuild2 = interaction.guild;
      const allClans = getFedClans();
      for (const c of allClans) {
        if (c.role_id) {
          const role = await _rGuild2.roles.fetch(c.role_id).catch(() => null);
          if (role) await role.delete('Federation season ended').catch(() => {});
          db.update('fed_clans', c.id, { role_id: null });
        }
      }
    } catch (e) { console.error('[FED] Role cleanup error:', e.message); }
    const _endedFed = getFed();
    const _nextSeason = (_endedFed.season || 1) + 1;
    saveFed({ status: 'setup', season: _nextSeason, registration_open: true });
    db.setConfig('fed_bracket_ref', null);
    await Promise.all([
      refreshFedPanels(client, 'p1').catch(e => console.error('[FED] end_confirm refresh:', e?.message)),
      interaction.editReply(buildFedPanel1()),
    ]);
    return;
  }
  if (id === 'fed_p1_newedition') {
    const fed    = getFed();
    const newSeason = (fed.season || 1) + 1;
    saveFed({ season: newSeason, status: 'setup', registration_open: true });
    return interaction.update(buildFedPanel1());
  }

  // ── Panel 2: Registration ────────────────────────────────────────────────
  if (id === 'fed_p2_addclan') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('fed_p2_addclan_modal').setTitle('Register Clan')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('clanname').setLabel('Clan Name').setStyle(TextInputStyle.Short).setPlaceholder('e.g. Night Stars').setMaxLength(50).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('clantag').setLabel('Clan Tag (max 5 chars, e.g. NST)').setStyle(TextInputStyle.Short).setPlaceholder('e.g. NST').setMaxLength(5).setRequired(true)
          )
        )
    );
  }

  if (id === 'fed_p2_addclan_modal') {
    const name = interaction.fields.getTextInputValue('clanname').trim();
    const tag  = interaction.fields.getTextInputValue('clantag').trim();
    const _errPanel = msg => ({ flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: [
      { type: 10, content: '\u274C  ' + msg },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [{ type: 2, style: 2, label: '\u25C4  Back', custom_id: 'fed_p2_refresh' }] },
    ]}]});
    if (!name) { await interaction.deferUpdate(); return interaction.editReply(_errPanel('Clan name cannot be empty.')); }
    if (!tag)  { await interaction.deferUpdate(); return interaction.editReply(_errPanel('Clan tag cannot be empty.')); }
    const fed    = getFed();
    const clans  = getFedClans();
    if (clans.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      await interaction.deferUpdate(); return interaction.editReply(_errPanel('A clan with that name already exists.')); }
    if (clans.find(c => (c.tag || '').toLowerCase() === tag.toLowerCase())) {
      await interaction.deferUpdate(); return interaction.editReply(_errPanel('A clan with that tag already exists.')); }
    const season = fed.season || 1;
    db.insert('fed_clans', { name, tag, players: [], fed_season: season, role_id: null, group_name: null });
    const newClan = (db.get('fed_clans') || []).find(c => c.name.toLowerCase() === name.toLowerCase() && c.fed_season === season);
    await interaction.deferUpdate();
    await interaction.editReply(buildPlayerAssignPanel(newClan.id));
    return;
  }

  if (id.startsWith('fed_p2_player_')) {
    // fed_p2_player_<clanId>_<slot>
    const rest    = id.replace('fed_p2_player_', '');
    const lastUs  = rest.lastIndexOf('_');
    const clanId  = parseInt(rest.slice(0, lastUs));
    const slot    = parseInt(rest.slice(lastUs + 1));
    const userId  = (interaction.values && interaction.values[0]) || null;
    const clan    = (db.get('fed_clans') || []).find(c => c.id === clanId);
    if (!clan) return interaction.update(buildFedPanel2());

    if (userId) {
      // 1. Check duplicate within same clan (different slot)
      const existing = (clan.players || []);
      const dupSlot  = existing.findIndex((uid, i) => uid === userId && i !== slot);
      if (dupSlot !== -1) {
        await interaction.update(buildPlayerAssignPanel(clanId));
        return interaction.followUp({ content: '❌ <@' + userId + '> is already assigned to **Player ' + (dupSlot + 1) + '** in this clan.', ephemeral: true });
      }

      // 2. Check if player is in another clan (same season)
      const fed     = getFed();
      const season  = fed.season || 1;
      const allClans = (db.get('fed_clans') || []).filter(c => c.fed_season === season && c.id !== clanId);
      const otherClan = allClans.find(c => (c.players || []).includes(userId));
      if (otherClan) {
        await interaction.update(buildPlayerAssignPanel(clanId));
        return interaction.followUp({ content: '❌ <@' + userId + '> is already registered in **' + otherClan.name + '**.', ephemeral: true });
      }
    }

    const players = [...(clan.players || [])];
    const prevLeader = players[0] || null;
    players[slot] = userId || null;
    db.update('fed_clans', clanId, { players });

    // Slot 0 = leader: auto-assign/remove the federation registration role
    if (slot === 0) {
      const fed2 = getFed();
      const regRoleId = fed2.registration_role_id;
      if (regRoleId) {
        try {
          // Remove role from previous leader (if different)
          if (prevLeader && prevLeader !== userId) {
            const oldMember = await interaction.guild.members.fetch(prevLeader).catch(() => null);
            if (oldMember) await oldMember.roles.remove(regRoleId).catch(() => {});
          }
          // Add role to new leader
          if (userId) {
            const newMember = await interaction.guild.members.fetch(userId).catch(() => null);
            if (newMember) await newMember.roles.add(regRoleId).catch(() => {});
          }
        } catch (_) {}
      }
    }

    return interaction.update(buildPlayerAssignPanel(clanId));
  }

  if (id.startsWith('fed_p2_clan_save_')) {
    await interaction.deferUpdate();
    await interaction.editReply(buildFedPanel2());
    return;
  }

  if (id === 'fed_p2_remove') {
    const clans = getFedClans();
    if (!clans.length) return interaction.update(buildFedPanel2());
    const SEP = { type: 14, divider: true, spacing: 1 };
    return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: [
      { type: 10, content: '**\uD83D\uDDD1\uFE0F  Remove Clan**' },
      SEP,
      { type: 1, components: [{ type: 3, custom_id: 'fed_p2_remove_sel', placeholder: 'Select clan to remove\u2026',
        options: clans.slice(0, 25).map(c => ({ label: c.name, value: String(c.id) })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: '\u25C4  Back', custom_id: 'fed_p2_refresh' }] },
    ]}]});
  }

  if (id === 'fed_p2_remove_sel') {
    const clanId = parseInt(interaction.values[0]);
    db.delete('fed_clans', clanId);
    return interaction.update(buildFedPanel2());
  }

  if (id === 'fed_p2_editclan') {
    const clans = getFedClans();
    if (!clans.length) return interaction.update(buildFedPanel2());
    const SEP = { type: 14, divider: true, spacing: 1 };
    return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0x5865F2, components: [
      { type: 10, content: '**\u270F\uFE0F  Edit Clan Players**' },
      SEP,
      { type: 1, components: [{ type: 3, custom_id: 'fed_p2_editclan_sel', placeholder: 'Select clan to edit\u2026',
        options: clans.slice(0, 25).map(c => ({ label: c.name, value: String(c.id) })),
      }]},
      SEP,
      { type: 1, components: [{ type: 2, style: 2, label: '\u25C4  Back', custom_id: 'fed_p2_refresh' }] },
    ]}]});
  }

  if (id === 'fed_p2_editclan_sel') {
    const clanId = parseInt(interaction.values[0]);
    return interaction.update(buildPlayerAssignPanel(clanId));
  }

  // ── Edit clan tag modal ──────────────────────────────────────────────────────
  if (id.startsWith('fed_p2_edit_tag_') && !id.endsWith('_modal')) {
    const clanId = parseInt(id.replace('fed_p2_edit_tag_', ''));
    const _clan  = (db.get('fed_clans') || []).find(c => c.id === clanId);
    return interaction.showModal(
      new ModalBuilder().setCustomId('fed_p2_edit_tag_' + clanId + '_modal').setTitle('Edit Clan Tag')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('clantag').setLabel('Clan Tag (max 5 chars)').setStyle(TextInputStyle.Short)
            .setValue(_clan?.tag || '').setMaxLength(5).setRequired(true)
        ))
    );
  }

  if (id.startsWith('fed_p2_edit_tag_') && id.endsWith('_modal')) {
    const clanId = parseInt(id.replace('fed_p2_edit_tag_', '').replace('_modal', ''));
    const tag    = interaction.fields.getTextInputValue('clantag').trim();
    if (!tag) return interaction.reply({ content: '\u274C Tag cannot be empty.', ephemeral: true });
    const _clans = getFedClans();
    const _dup   = _clans.find(c => c.id !== clanId && (c.tag || '').toLowerCase() === tag.toLowerCase());
    if (_dup) return interaction.reply({ content: '\u274C Tag **' + tag + '** is already used by **' + _dup.name + '**.', ephemeral: true });
    db.update('fed_clans', clanId, { tag });
    await interaction.deferUpdate();
    return interaction.editReply(buildPlayerAssignPanel(clanId));
  }

  if (id === 'fed_p2_clear') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return noAdmin(interaction);
    return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: [
      { type: 10, content: '## ⚠️  Clear All Clans\n> Are you sure you want to **remove all registered clans**?\n> This cannot be undone.' },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [
        { type: 2, style: 4, label: '✅  Yes, Clear All', custom_id: 'fed_p2_clear_confirm' },
        { type: 2, style: 2, label: '❌  Cancel',         custom_id: 'fed_p2_clear_cancel'  },
      ]},
    ]}]});
  }

  if (id === 'fed_p2_clear_cancel') {
    return interaction.update(buildFedPanel2());
  }

  if (id === 'fed_p2_clear_confirm') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return noAdmin(interaction);
    const fed    = getFed();
    const season = fed.season || 1;
    db.deleteWhere('fed_clans', c => c.fed_season === season);
    return interaction.update(buildFedPanel2());
  }

  if (id === 'fed_p2_fillrandom') {
    const fed      = getFed();
    const season   = fed.season || 1;
    const required = fed.clan_count || 8;
    const clans    = getFedClans();
    const needed   = required - clans.length;
    if (needed <= 0) return interaction.update(buildFedPanel2());

    for (let i = 0; i < needed; i++) {
      const num = clans.length + i + 1;
      db.insert('fed_clans', { name: 'Clan ' + num, tag: 'C' + num, players: [], fed_season: season, role_id: null, group_name: null });
    }

    return interaction.update(buildFedPanel2());
  }

  if (id === 'fed_p2_togglereg') {
    const fed = getFed();
    const now = fed.registration_open !== false;
    saveFed({ registration_open: !now });
    return interaction.update(buildFedPanel2());
  }

  // ── Panel 3: Toggles ─────────────────────────────────────────────────────
  if (id === 'fed_p3_togglemode') { saveFed({ p3_preview: !getFed().p3_preview }); return interaction.update(buildFedPanel3()); }
  if (id === 'fed_p3_toggletag')  { saveFed({ p3_tag: !getFed().p3_tag });         return interaction.update(buildFedPanel3()); }
  if (id === 'fed_p3_roundsel')   { db.setConfig('fed_p3_round', parseInt(interaction.values[0])); return interaction.update(buildFedPanel3()); }

  // ── Panel 3: Publish actions ──────────────────────────────────────────────
  if (id === 'fed_p3_clanlist') {
    return doPublishLive(interaction, () => {
      const fed = getFed(); const clans = getFedClans();
      return makeFedClanListPost(fed, clans);
    }, 'clansList', 'fed_clan_list_ref');
  }
  if (id === 'fed_p3_groupdraw') {
    return doPublish(interaction, () => {
      const fed = getFed(); const clans = getFedClans();
      return makeFedGroupDrawPost(fed, clans);
    }, 'schedule');
  }
  if (id === 'fed_p3_schedule') {
    return doPublish(interaction, () => {
      const fed   = getFed();
      const clans = getFedClans();
      const mts   = getFedMatches();
      const isLeagueS = (fed.system || 'cup') === 'league';
      let rd;
      if (isLeagueS) {
        const _pend = mts.filter(m => m.status === 'pending');
        rd = _pend.length ? Math.min(..._pend.map(m => m.round)) : (mts.length ? Math.max(...mts.map(m => m.round)) : 1);
      } else {
        const _grpPlayedSch = mts.filter(m => m.stage === 'group' && m.status === 'played').map(m => m.round);
        rd = db.getConfig('fed_p3_round') || (_grpPlayedSch.length ? Math.max(..._grpPlayedSch) : 1);
      }
      return makeFedSchedulePost(fed, mts, rd, clans);
    }, 'schedule');
  }
  if (id === 'fed_p3_results') {
    return doPublish(interaction, () => {
      const fed   = getFed();
      const clans = getFedClans();
      const mts   = getFedMatches();
      const isLeagueR = (fed.system || 'cup') === 'league';
      let rd;
      if (isLeagueR) {
        const _pend = mts.filter(m => m.status === 'pending');
        rd = _pend.length ? Math.min(..._pend.map(m => m.round)) : (mts.length ? Math.max(...mts.map(m => m.round)) : 1);
      } else {
        const _grpPlayedRes = mts.filter(m => m.stage === 'group' && m.status === 'played').map(m => m.round);
        rd = db.getConfig('fed_p3_round') || (_grpPlayedRes.length ? Math.max(..._grpPlayedRes) : 1);
      }
      return makeFedResultsPost(fed, mts, rd, clans);
    }, 'results');
  }
  if (id === 'fed_p3_standings') {
    const _fedStd = getFed();
    if ((_fedStd.system || 'cup') === 'league') {
      return doPublishLive(interaction, () => {
        const fed   = getFed();
        const clans = getFedClans();
        const mts   = getFedMatches();
        return makeFedStandingsPost(fed, mts, clans, true);
      }, 'results', 'fed_standings_ref');
    } else {
      const _grpPlayedSt = getFedMatches().filter(m => m.stage === 'group' && m.status === 'played').map(m => m.round);
      const _rd = db.getConfig('fed_p3_round') || (_grpPlayedSt.length ? Math.max(..._grpPlayedSt) : 1);
      return doPublish(interaction, () => {
        const fed   = getFed();
        const clans = getFedClans();
        const mts   = getFedMatches().filter(m => m.stage === 'group' && m.round <= _rd);
        return makeFedStandingsPost(fed, mts, clans, false, _rd);
      }, 'results');
    }
  }
  if (id === 'fed_p3_bracket') {
    await interaction.deferUpdate();
    const fed    = getFed();
    const clans  = getFedClans();
    const mts    = getFedMatches();
    const msg    = makeFedBracketPost(fed, mts, clans);
    if (!msg) return interaction.followUp({ content: '\u274C Could not build bracket.', ephemeral: true });
    const preview = fed.p3_preview === true;
    if (preview) return interaction.followUp({ ...msg, ephemeral: true });
    const ch      = fed.channels || {};
    const targetChId = ch.results || ch.management;
    if (!targetChId) return interaction.followUp({ content: '\u274C No results channel set.', ephemeral: true });
    const target = interaction.guild.channels.cache.get(targetChId)
                || await interaction.guild.channels.fetch(targetChId).catch(() => null);
    if (!target) return interaction.followUp({ content: '\u274C Channel not found.', ephemeral: true });
    const tagOn  = fed.p3_tag === true;
    let msgToSend = msg;
    if (tagOn && fed.registration_role_id) {
      const roleId = fed.registration_role_id;
      const container = msg.components?.[0];
      if (container?.type === 17 && Array.isArray(container.components)) {
        msgToSend = { ...msg, components: [{ ...container, components: [{ type: 10, content: '<@&' + roleId + '>' }, ...container.components] }, ...msg.components.slice(1)] };
      }
    }
    const _bRef = db.getConfig('fed_bracket_ref');
    let _bEdited = false;
    if (_bRef) {
      try {
        const _bCh  = interaction.guild.channels.cache.get(_bRef.channelId) || await interaction.guild.channels.fetch(_bRef.channelId).catch(() => null);
        const _bMsg = _bCh ? await _bCh.messages.fetch(_bRef.messageId).catch(() => null) : null;
        if (_bMsg) { await _bMsg.edit(msgToSend); _bEdited = true; }
      } catch (_) {}
    }
    if (!_bEdited) {
      const posted = await target.send(msgToSend).catch(() => null);
      if (posted) db.setConfig('fed_bracket_ref', { channelId: targetChId, messageId: posted.id });
    }
    const _bVerb = _bEdited ? 'Bracket updated in' : 'Bracket posted to';
    const _bConfirm = await interaction.followUp({ flags: 64 | 32768, components: [{ type: 17, accent_color: 0x57F287, components: [
      { type: 10, content: '\u2705 ' + _bVerb + ' <#' + targetChId + '> \u2014 updates live as results are added.' },
    ]}]});
    setTimeout(() => _bConfirm.delete().catch(() => {}), 4000);
    return;
  }
  if (id === 'fed_p3_winner') {
    const fed   = getFed();
    const clans = getFedClans();
    const mts   = getFedMatches();
    const final = mts.find(m => m.stage === 'knockout' && m.round === 1 && m.status === 'played');
    if (!final) return interaction.reply({ content: '\u274C Final has not been played yet.', ephemeral: true });
    const { hp, ap } = calcMatchResult(final);
    if (hp === ap) return interaction.reply({ content: '\u274C The Final ended in a draw \u2014 re-enter the result with a clear winner before announcing the champion.', ephemeral: true });
    return doPublish(interaction, () => {
      const winnerId = hp > ap ? final.home_clan_id : final.away_clan_id;
      const winner   = clans.find(c => c.id === winnerId) || { name: '?' };
      return makeFedChampionPost(fed, winner.name);
    }, 'results');
  }
}

// ── Player assignment panel ───────────────────────────────────────────────────
function buildPlayerAssignPanel(clanId) {
  const clan = (db.get('fed_clans') || []).find(c => c.id === clanId);
  if (!clan) return buildFedPanel2();
  const fed      = getFed();
  const nPlayers = fed.players_per_clan || 8;
  const players  = clan.players || [];
  const SEP      = { type: 14, divider: true, spacing: 1 };
  const txt      = c => ({ type: 10, content: c });

  const statusLines = [];
  for (let i = 0; i < nPlayers; i++) {
    const uid = players[i];
    statusLines.push(uid ? '\u2705 Player ' + (i + 1) + ': <@' + uid + '>' : '\u274C Player ' + (i + 1) + ': not assigned');
  }
  const filled    = players.filter(Boolean).length;
  const allFilled = filled >= nPlayers;

  const inner = [
    txt('**\uD83C\uDFDF\uFE0F  ' + clan.name + '** \u2014 Assign ' + nPlayers + ' players\n> ' + statusLines.join('  \u2022  ')),
    SEP,
    { type: 1, components: [{ type: 2, style: 2, label: '\uD83C\uDFF7\uFE0F  Tag: ' + getClanTag(clan) + '  \u2014 Edit', custom_id: 'fed_p2_edit_tag_' + clanId }] },
    SEP,
  ];

  const selRows = [];
  for (let i = 0; i < nPlayers; i++) {
    selRows.push({ type: 1, components: [{
      type: 5,
      custom_id: 'fed_p2_player_' + clanId + '_' + i,
      placeholder: '\uD83D\uDC64 Player ' + (i + 1) + ' \u2014 search member\u2026',
      min_values: 0, max_values: 1,
    }]});
  }
  inner.push(...selRows);
  inner.push(SEP);
  inner.push({ type: 1, components: [
    { type: 2, style: allFilled ? 3 : 2, label: '\u2705 Save Clan', custom_id: 'fed_p2_clan_save_' + clanId },
    { type: 2, style: 4, label: '\u25C4 Back', custom_id: 'fed_p2_refresh' },
  ]});

  return { flags: 32768, components: [{ type: 17, accent_color: 0x57F287, components: inner }] };
}

module.exports = { handleFederationInteraction, refreshFedPanels };
