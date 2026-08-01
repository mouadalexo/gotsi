'use strict';
// ── Channel naming helpers ───────────────────────────────────────────────────
const CIRCLE_NUMS  = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
const KO_LABELS_BOLD = { 1: '𝗙𝗜𝗡', 2: '𝗦𝗙', 4: '𝗤𝗙', 8: '𝗥𝟭𝟲', 16: '𝗥𝟯𝟮' };
const BOLD_GROUP     = { A: '𝗔', B: '𝗕', C: '𝗖', D: '𝗗' };
const BOLD_MD = ['', '𝗠𝗗𝟭', '𝗠𝗗𝟮', '𝗠𝗗𝟯', '𝗠𝗗𝟰', '𝗠𝗗𝟱', '𝗠𝗗𝟲', '𝗠𝗗𝟳', '𝗠𝗗𝟴', '𝗠𝗗𝟵'];
const BOLD_NUM = BOLD_MD.map((s, i) => i === 0 ? "" : [...s].slice(2).join(""));
const BOLD_R  = ['', '𝗥𝟭', '𝗥𝟮', '𝗥𝟯', '𝗥𝟰', '𝗥𝟱', '𝗥𝟲', '𝗥𝟳', '𝗥𝟴', '𝗥𝟵'];
const getClanTag = c => (c && c.tag) ? c.tag.toUpperCase() : (c ? (c.name || 'clan').slice(0, 5).toUpperCase() : 'clan');
// Discord lowercases ASCII channel names — use Unicode bold sans-serif so tags appear in caps
const toBoldTag = str => String(str).toUpperCase().split('').map(c => {
  const code = c.charCodeAt(0);
  if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D5D4 + (code - 65));
  if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7EC + (code - 48));
  return c;
}).join('');
const mdLabel    = n => BOLD_MD[n] || ('𝗠𝗗' + n);
const boldNum    = n => BOLD_NUM[n] || String(n);
const rLabel     = n => BOLD_R[n]  || ('𝗥' + n);

const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { db }                 = require('../utils/database');
const { isBotolaManager }    = require('../utils/permissions');
const {
  buildFederationPanel, buildFedSetupPanel,
  buildFedRolePanel, buildFedSetupSettingsPanel, buildFedMainSettingsPanel, getFed, saveFed,
} = require('./federationPanel');
const { buildFedPanel1, getFedClans, getFedMatches, getFedStage } = require('./fedPanel1');
const { buildFedPanel2 } = require('./fedPanel2');
const { buildFedPanel3 } = require('./fedPanel3');
const {
  makeFedClanListPost, makeFedSchedulePost, makeFedResultsPost,
  makeFedStandingsPost, makeFedGroupDrawPost, makeFedBracketPost,
  makeFedChampionPost, makeFedMatchChannelMsg, calcMatchResult,
} = require('./fedEmbeds');

function noPerm(i)  { return i.reply({ content: '\u274C Managers only.', ephemeral: true }); }
function noAdmin(i) { return i.reply({ content: '\u274C This action requires **Administrator** permission.', ephemeral: true }); }


// Normalize roster data when it enters a federation season. Roster players are
// objects, while federation matches and embeds need Discord user IDs.
function normalizeFederationRoster(roster) {
  const leaderId = String(roster?.leader_discord_id || '').trim() || null;
  const playerIds = (roster?.players || [])
    .map(player => typeof player === 'string' ? player : player?.discord_user)
    .map(id => String(id || '').trim())
    .filter(Boolean);
  return {
    source_roster_id: roster.id,
    leader_id: leaderId,
    players: [...new Set([leaderId, ...playerIds].filter(Boolean))],
    role_id: roster.clan_role_id || null,
  };
}


async function applyClanMatchPermissions(channel, clan) {
  const writes = [];
  if (clan?.role_id) writes.push(channel.permissionOverwrites.edit(clan.role_id, {
    ViewChannel: true, SendMessages: true,
  }).catch(() => {}));
  await Promise.all(writes);
}

// Refresh the OTHER two panel messages after any data-changing interaction.
// skipKey = 'p1' | 'p2' | 'p3' so we don't fight the interaction's own update.
async function refreshFedPanels(client, skipKey) {
  try {
    const fed  = getFed();
    const refs = fed?.fed_panel_refs || {};
    if (!refs || !Object.keys(refs).length) return;
    const map  = { p1: buildFedPanel1, p2: buildFedPanel2, p3: buildFedPanel3 };
    await Promise.all(Object.entries(map).map(async ([key, build]) => {
      if (key === skipKey) return;
      const ref = refs[key];
      if (!ref?.channelId || !ref?.messageId) return;
      const _clearRef = () => saveFed({ fed_panel_refs: { ...getFed().fed_panel_refs, [key]: null } });
      const ch = client.channels.cache.get(ref.channelId)
              ?? await client.channels.fetch(ref.channelId).catch(() => null);
      if (!ch) { _clearRef(); return; }
      const msg = ch.messages.cache.get(ref.messageId)
               ?? await ch.messages.fetch(ref.messageId).catch(() => null);
      if (!msg) { _clearRef(); return; }
      await msg.edit(build()).catch(() => _clearRef());
    }));
  } catch (e) { console.error('[FED] refreshFedPanels error:', e?.message); }
}

// Fallback: update Panel 1 directly via stored message ref when interaction token has expired.
async function refreshP1Fallback(client) {
  try {
    const fed = getFed();
    const ref = fed?.fed_panel_refs?.p1;
    if (!ref?.channelId || !ref?.messageId) return;
    const ch = client.channels.cache.get(ref.channelId)
            ?? await client.channels.fetch(ref.channelId).catch(() => null);
    if (!ch) return;
    const msg = ch.messages.cache.get(ref.messageId)
             ?? await ch.messages.fetch(ref.messageId).catch(() => null);
    if (!msg) return;
    await msg.edit(buildFedPanel1()).catch(() => {});
  } catch (e) { console.error('[FED] refreshP1Fallback error:', e?.message); }
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
      const cat = guild.channels.cache.get(catId) || null;
      if (cat && cat.children) {
        for (const [, ch] of cat.children.cache) {
          await ch.delete('Federation season ended').catch(() => {});
        }
      }
    } else {
      for (const m of matches) {
        if (m.channel_id) {
          const ch = guild.channels.cache.get(m.channel_id) || null;
          if (ch) await ch.delete('Federation season ended').catch(() => {});
        }
      }
    }
  } catch (e) { console.error('[FED] cleanup channels error:', e.message); }
  // Delete clan roles
  try {
    for (const c of clans) {
      if (c.role_id) {
        db.update('fed_clans', c.id, { role_id: null });
      }
    }
  } catch (e) { console.error('[FED] cleanup roles error:', e.message); }
}

// ── Reset category channels to neutral names (reuse for next season) ───────────
async function resetCategoryChannels(guild, fed, clansSnapshot) {
  const catId = fed.channels?.category || null;
  if (!catId) return;
  try {
    const mgmtIds = new Set(Object.values(fed.channels || {}).filter(v => v && v !== catId));
    const matchChs = [...guild.channels.cache.values()]
      .filter(ch => ch.parentId === catId && ch.type === 0 && !mgmtIds.has(ch.id));
    matchChs.sort((a, b) => a.position - b.position);
    // Use the snapshot passed in — DB is already wiped by the time this runs
    const _clanRoleIds = new Set((clansSnapshot || []).map(c => c.role_id).filter(Boolean));
    for (let i = 0; i < matchChs.length; i++) {
      const ch = matchChs[i];
      try {
        const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
        if (msgs && msgs.size > 0) await ch.bulkDelete(msgs, true).catch(() => {});
        for (const roleId of _clanRoleIds) {
          await ch.permissionOverwrites.delete(roleId).catch(() => {});
        }
        await ch.setName('match-' + (i + 1)).catch(() => {});
      } catch (_) {}
      if (i < matchChs.length - 1) await new Promise(r => setTimeout(r, 300));
    }
  } catch (e) { console.error('[FED] resetCategoryChannels error:', e.message); }
}

// ── Begin Season ─────────────────────────────────────────────────────────────

async function beginSeason(interaction, client) {
  const fed   = getFed();
  const clans = getFedClans();
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

  // No pre-wipe — Begin Season never deletes data

  // Defer with ephemeral reply so Discord doesn't time out.
  // We update panels via direct msg.edit() through stored refs (more reliable
  // than interaction.editReply() for non-ephemeral panel messages).
  await interaction.deferUpdate();

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

  db.insertMany('fed_matches', matchesToInsert);
  saveFed({ status: 'active' });

  // Link clan roles: find existing server role by clan name, save ID (no creation)
  try {
    const _rGuild = interaction.guild;
    const _allRoles = await _rGuild.roles.fetch();
    for (const clan of getFedClans()) {
      if (!clan.role_id) {
        const _found = _allRoles.find(r => r.name.toLowerCase() === clan.name.toLowerCase());
        if (_found) db.update('fed_clans', clan.id, { role_id: _found.id });
      }
    }
  } catch (e) { console.error('[FED] Role link error:', e.message, e.code || ''); }

  // Create match channels for first round
  try {
    const guild      = interaction.guild;
    await guild.roles.fetch();
    const staffRole  = fed.staff_role_id;
    const fmt        = fed.channel_name_format || '{a}-vs-{b}';

    // Reload clans to get role IDs
    const updatedClans = getFedClans();
    const getClan = id => updatedClans.find(c => c.id === id) || {};
    const _maxCh = Math.floor((fed.clan_count || clans.length) / 2);
    const insertedMatches = (db.get('fed_matches') || [])
      .filter(m => m.fed_season === season && m.round === 1)
      .slice(0, _maxCh);

    // ── Channel reuse: prefer neutral match-N channels in category ──────────────
    const parentCat = fed.channels?.category || null;
    let _neutralChs = [];
    if (parentCat) {
      const _mgmtIds2 = new Set(Object.values(fed.channels || {}).filter(v => v && v !== parentCat));
      _neutralChs = [...guild.channels.cache.values()].filter(c => c && c.parentId === parentCat && c.type === 0 && !_mgmtIds2.has(c.id)).sort((a, b) => a.position - b.position);
    }
    let _neutralIdx = 0;

    // Validate channel count before proceeding
    const _needCh = insertedMatches.length;
    if (!_neutralChs.length || _neutralChs.length < _needCh) {
      const _chErr = !_neutralChs.length
        ? '❌ No match channels found in the federation category. Add the permanent match channels to the category and try again.'
        : `❌ Not enough channels — you have **${_neutralChs.length}** but Round 1 needs **${_needCh}**. Add more channels to the federation category and try again.`;
      saveFed({ status: 'setup' });
      db.deleteWhere('fed_matches', m => m.fed_season === season);
      await interaction.followUp({ flags: 64, content: _chErr }).catch(() => {});
      interaction.editReply(buildFedPanel1()).catch(() => {});
      return;
    }

    for (let _chi = 0; _chi < insertedMatches.length; _chi++) {
      const im = insertedMatches[_chi];
      const clanA = getClan(im.home_clan_id);
      const clanB = getClan(im.away_clan_id);
      if (!clanA.id || !clanB.id) continue;
      try {
        let chName;
        if (system === 'cup') {
          const grpLetter = BOLD_GROUP[im.group_name] || (im.group_name || '');
          chName = (grpLetter + boldNum(1) + "〡" + toBoldTag(getClanTag(clanA)) + "・𝗩𝗦・" + toBoldTag(getClanTag(clanB))).slice(0, 100);
        } else {
          const circleNum = CIRCLE_NUMS[_chi] || String(_chi + 1);
          chName = (circleNum + '\u30fb' + rLabel(1) + '\u30fb' + toBoldTag(getClanTag(clanA)) + '\u30fb\uD835\uDDE9\uD835\uDDE6\u30fb' + toBoldTag(getClanTag(clanB))).slice(0, 100);
        }
        const _nc = _neutralChs[_chi];
        if (!_nc) { console.error('[FED] No available channel for match ' + im.id + ' — all category channels used up.'); continue; }
        try {
          const _oldMsgs = await _nc.messages.fetch({ limit: 100 }).catch(() => null);
          if (_oldMsgs && _oldMsgs.size > 0) await _nc.bulkDelete(_oldMsgs, true).catch(() => {});
          await applyClanMatchPermissions(_nc, clanA);
          await applyClanMatchPermissions(_nc, clanB);
          await _nc.setName(chName).catch(() => {});
          db.update('fed_matches', im.id, { channel_id: _nc.id });
        } catch (_re) { console.error('[FED] Channel reuse failed (match ' + im.id + '):', _re.message); }
      } catch (e) { console.error('[FED] Channel setup error (match ' + im.id + '):', e.message, e.code || ''); }
      if (_chi < insertedMatches.length - 1) await new Promise(r => setTimeout(r, 300));
    }
  } catch (e) { console.error('[FED] Channel creation error:', e.message, e.code || ''); }

  // Refresh panels; also update p1 via stored ref as backup in case interaction token expired
  db.setConfig('fed_p3_round', 1);
  interaction.editReply(buildFedPanel1()).catch(() => refreshP1Fallback(client));
  refreshFedPanels(client, 'p1').catch(e => console.error('[FED] beginSeason refresh:', e?.message));
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
    try {
      const guild     = interaction.guild;
      await guild.roles.fetch();
      const staffRole = fed.staff_role_id;
      const parentCat = fed.channels?.category || null;
      const updClans  = getFedClans();
      const getClanL  = id => updClans.find(c => c.id === id) || {};
      const allRnds   = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
      const pending   = matches.filter(m => m.status === 'pending');
      if (!pending.length) { return interaction.editReply(buildFedPanel1()); }
      const prevRnd   = Math.min(...pending.map(m => m.round)) - 1;
      const nextRnd   = Math.min(...pending.map(m => m.round));
      // Clear previous round channel IDs (channels stay, get repurposed)
      for (const m of matches.filter(m => m.round === prevRnd && m.channel_id)) {
        db.update('fed_matches', m.id, { channel_id: null });
      }
      // Reuse category channels for next round
      const nextMatches  = (db.get('fed_matches') || []).filter(m => m.fed_season === season && m.round === nextRnd);
      const _lgMgmtIds   = new Set(Object.values(fed.channels || {}).filter(v => v && v !== parentCat));
      let   _lgPool      = [];
      if (parentCat) {
        _lgPool = [...guild.channels.cache.values()].filter(c => c && c.parentId === parentCat && c.type === 0 && !_lgMgmtIds.has(c.id)).sort((a, b) => a.position - b.position);
      }
      if (_lgPool.length < nextMatches.length) {
        await interaction.followUp({ flags: 64, content: `❌ Not enough match channels — you have **${_lgPool.length}** but this round needs **${nextMatches.length}**. Add more channels to the federation category.` }).catch(() => {});
        interaction.editReply(buildFedPanel1()).catch(() => {});
        return;
      }
      for (let _li = 0; _li < nextMatches.length; _li++) {
        const im = nextMatches[_li];
        const clanA = getClanL(im.home_clan_id);
        const clanB = getClanL(im.away_clan_id);
        if (!clanA.id || !clanB.id) continue;
        try {
          const circleNum = CIRCLE_NUMS[_li] || String(_li + 1);
          const chName = (circleNum + '\u30fb' + rLabel(nextRnd) + '\u30fb' + toBoldTag(getClanTag(clanA)) + '\u30fb\uD835\uDDE9\uD835\uDDE6\u30fb' + toBoldTag(getClanTag(clanB))).slice(0, 100);
          const _lgCh   = _lgPool[_li];
          const _lgMsgs = await _lgCh.messages.fetch({ limit: 100 }).catch(() => null);
          if (_lgMsgs && _lgMsgs.size > 0) await _lgCh.bulkDelete(_lgMsgs, true).catch(() => {});
          await applyClanMatchPermissions(_lgCh, clanA);
          await applyClanMatchPermissions(_lgCh, clanB);
          await _lgCh.setName(chName).catch(() => {});
          db.update('fed_matches', im.id, { channel_id: _lgCh.id });
        } catch (e) { console.error('[FED] League channel error (match ' + im.id + '):', e.message); }
        if (_li < nextMatches.length - 1) await new Promise(r => setTimeout(r, 300));
      }
      // Background: reset leftover pool channels not used this round
      const _lgLeftover = _lgPool.slice(nextMatches.length);
      if (_lgLeftover.length) (async () => {
        for (let _ui = 0; _ui < _lgLeftover.length; _ui++) {
          const ch = _lgLeftover[_ui];
          try {
            const _msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
            if (_msgs && _msgs.size > 0) await ch.bulkDelete(_msgs, true).catch(() => {});
            const _owIds = [...ch.permissionOverwrites.cache.keys()];
            for (const oid of _owIds) {
              if (oid !== ch.guild.id) await ch.permissionOverwrites.delete(oid).catch(() => {});
            }
            await ch.setName('match-' + (_ui + 1)).catch(() => {});
          } catch (_) {}
          if (_ui < _lgLeftover.length - 1) await new Promise(r => setTimeout(r, 300));
        }
      })().catch(() => {});
    } catch (e) { console.error('[FED] League advance round channel error:', e.message); }
    interaction.editReply(buildFedPanel1()).catch(() => {});
    refreshFedPanels(client, 'p1').catch(e => console.error('[FED] league advance refresh:', e?.message));
    return;
  }

  // Acknowledge immediately — channel creation can take several seconds
  await interaction.deferUpdate();

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
      db.setConfig('fed_p3_round', _nextRound);
      try {
        const guild     = interaction.guild;
        await guild.roles.fetch();
        const staffRole = fed.staff_role_id;
        const parentCat = fed.channels?.category || null;
        const updClans  = getFedClans();
        const getClanG  = id => updClans.find(c => c.id === id) || {};
        // Clear active-round channel IDs (channels stay, get repurposed)
        for (const m of groupMatches.filter(m => m.round === _activeRound && m.channel_id)) {
          db.update('fed_matches', m.id, { channel_id: null });
        }
        // Reuse category channels for next matchday
        const freshM      = (db.get('fed_matches') || []).filter(m => m.fed_season === season && m.stage === 'group' && m.round === _nextRound);
        const _grpMgmtIds = new Set(Object.values(fed.channels || {}).filter(v => v && v !== parentCat));
        let   _grpPool    = [];
        if (parentCat) {
          _grpPool = [...guild.channels.cache.values()].filter(c => c && c.parentId === parentCat && c.type === 0 && !_grpMgmtIds.has(c.id)).sort((a, b) => a.position - b.position);
        }
        if (_grpPool.length < freshM.length) {
          await interaction.followUp({ flags: 64, content: `❌ Not enough match channels — you have **${_grpPool.length}** but this matchday needs **${freshM.length}**. Add more channels to the federation category.` }).catch(() => {});
          interaction.editReply(buildFedPanel1()).catch(() => {});
          return;
        }
        for (let _gmi = 0; _gmi < freshM.length; _gmi++) {
          const im = freshM[_gmi];
          const clanA = getClanG(im.home_clan_id);
          const clanB = getClanG(im.away_clan_id);
          try {
            const grpLetter = BOLD_GROUP[im.group_name] || (im.group_name || '');
            const chName = (grpLetter + boldNum(_nextRound) + "〡" + toBoldTag(getClanTag(clanA)) + "・𝗩𝗦・" + toBoldTag(getClanTag(clanB))).slice(0, 100);
            const _grpCh   = _grpPool[_gmi];
            const _grpMsgs = await _grpCh.messages.fetch({ limit: 100 }).catch(() => null);
            if (_grpMsgs && _grpMsgs.size > 0) await _grpCh.bulkDelete(_grpMsgs, true).catch(() => {});
            await applyClanMatchPermissions(_grpCh, clanA);
            await applyClanMatchPermissions(_grpCh, clanB);
            await _grpCh.setName(chName).catch(() => {});
            db.update('fed_matches', im.id, { channel_id: _grpCh.id });
          } catch (e) { console.error('[FED] Group matchday channel error (match ' + im.id + '):', e.message); }
          if (_gmi < freshM.length - 1) await new Promise(r => setTimeout(r, 300));
        }
        // Background: reset leftover pool channels not used this matchday
        const _grpLeftover = _grpPool.slice(freshM.length);
        if (_grpLeftover.length) (async () => {
          for (let _ui = 0; _ui < _grpLeftover.length; _ui++) {
            const ch = _grpLeftover[_ui];
            try {
              const _msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
              if (_msgs && _msgs.size > 0) await ch.bulkDelete(_msgs, true).catch(() => {});
              const _owIds = [...ch.permissionOverwrites.cache.keys()];
              for (const oid of _owIds) {
                if (oid !== ch.guild.id) await ch.permissionOverwrites.delete(oid).catch(() => {});
              }
              await ch.setName('match-' + (_ui + 1)).catch(() => {});
            } catch (_) {}
            if (_ui < _grpLeftover.length - 1) await new Promise(r => setTimeout(r, 300));
          }
        })().catch(() => {});
      } catch (e) { console.error('[FED] Group matchday channel error:', e.message); }
      interaction.editReply(buildFedPanel1()).catch(() => {});
      refreshFedPanels(client, 'p1').catch(e => console.error('[FED] group matchday refresh:', e?.message));
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
      // Tournament complete — show finished state; manager clicks End Season to clean up
      saveFed({ status: 'finished' });
      interaction.editReply(buildFedPanel1()).catch(() => {});
      refreshFedPanels(client, 'p1').catch(() => {});
      return;
    }
    // Final created but not played (shouldn't happen — Next is disabled), just refresh
    if (koMatches.some(m => m.round === 1 && m.status === 'pending')) return interaction.editReply(buildFedPanel1());
  }

  const curPlayed = koMatches.filter(m => m.round === curRound && m.status === 'played');
  const nextRound = Math.floor(curRound / 2);
  const newMatches = [];

  // Pair winners — use result field directly (handles DM/pen scenarios correctly)
  const winners = curPlayed.map(m => m.result === 'home' ? m.home_clan_id : m.away_clan_id);
  for (let i = 0; i < winners.length - 1; i += 2) {
    newMatches.push({ home_clan_id: winners[i], away_clan_id: winners[i + 1], stage: 'knockout', group_name: null, round: nextRound, status: 'pending', fed_season: season });
  }
  db.insertMany('fed_matches', newMatches);

  // Reuse category channels for next KO round (no create/delete)
  try {
    const guild     = interaction.guild;
    await guild.roles.fetch();
    const staffRole = fed.staff_role_id;
    const parentCat = fed.channels?.category || null;
    const updClans  = getFedClans();
    const getClan   = id => updClans.find(c => c.id === id) || {};

    // Clear old channel IDs in DB — channels stay, get repurposed
    for (const m of curPlayed) {
      if (m.channel_id) db.update('fed_matches', m.id, { channel_id: null });
    }

    // Build pool of available text channels inside the category
    const inserted    = (db.get('fed_matches') || []).filter(m => m.fed_season === season && m.round === nextRound && m.stage === 'knockout');
    const _koaMgmtIds = new Set(Object.values(fed.channels || {}).filter(v => v && v !== parentCat));
    let   _koaPool    = [];
    if (parentCat) {
      _koaPool = [...guild.channels.cache.values()].filter(c => c && c.parentId === parentCat && c.type === 0 && !_koaMgmtIds.has(c.id)).sort((a, b) => a.position - b.position);
    }
    if (_koaPool.length < inserted.length) {
      await interaction.followUp({ flags: 64, content: `❌ Not enough match channels — you have **${_koaPool.length}** but this round needs **${inserted.length}**. Add more channels to the federation category.` }).catch(() => {});
      interaction.editReply(buildFedPanel1()).catch(() => {});
      return;
    }
    for (let _koi = 0; _koi < inserted.length; _koi++) {
      const im = inserted[_koi];
      const clanA = getClan(im.home_clan_id);
      const clanB = getClan(im.away_clan_id);
      try {
        const koLbl = KO_LABELS_BOLD[nextRound] || ('𝗥' + nextRound);
        const chName = (koLbl + '〡' + toBoldTag(getClanTag(clanA)) + '・𝗩𝗦・' + toBoldTag(getClanTag(clanB))).slice(0, 100);
        const _koaCh   = _koaPool[_koi];
        const _koaMsgs = await _koaCh.messages.fetch({ limit: 100 }).catch(() => null);
        if (_koaMsgs && _koaMsgs.size > 0) await _koaCh.bulkDelete(_koaMsgs, true).catch(() => {});
        await applyClanMatchPermissions(_koaCh, clanA);
        await applyClanMatchPermissions(_koaCh, clanB);
        await _koaCh.setName(chName).catch(() => {});
        db.update('fed_matches', im.id, { channel_id: _koaCh.id });
      } catch (e) { console.error('[FED] KO channel error (match ' + im.id + '):', e.message); }
      if (_koi < inserted.length - 1) await new Promise(r => setTimeout(r, 300));
    }
    // Background: reset leftover pool channels not used this KO round
    const _koaLeftover = _koaPool.slice(inserted.length);
    if (_koaLeftover.length) (async () => {
      for (let _ui = 0; _ui < _koaLeftover.length; _ui++) {
        const ch = _koaLeftover[_ui];
        try {
          const _msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null);
          if (_msgs && _msgs.size > 0) await ch.bulkDelete(_msgs, true).catch(() => {});
          const _owIds = [...ch.permissionOverwrites.cache.keys()];
          for (const oid of _owIds) {
            if (oid !== ch.guild.id) await ch.permissionOverwrites.delete(oid).catch(() => {});
          }
          await ch.setName('match-' + (_ui + 1)).catch(() => {});
        } catch (_) {}
        if (_ui < _koaLeftover.length - 1) await new Promise(r => setTimeout(r, 300));
      }
    })().catch(() => {});
  } catch (e) { console.error('[FED] KO channel error:', e.message); }

  await interaction.editReply(buildFedPanel1()).catch(() => {});
  refreshFedPanels(client, 'p1').catch(e => console.error('[FED] KO advance refresh:', e?.message));
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

  // Build per-group ranked lists, then cross-pair: A1 vs B2, B1 vs A2, etc.
  const groupNames = Object.keys(groups).sort();
  const byGroup = {};
  for (const g of groupNames) {
    byGroup[g] = [...groups[g]].sort((a, b) => {
      const sa = stats[a.id] || init(); const sb = stats[b.id] || init();
      return (sb.pts - sa.pts) || ((sb.gf - sb.ga) - (sa.gf - sa.ga));
    }).slice(0, advance);
  }
  const qualifiers = groupNames.flatMap(g => byGroup[g]);

  const firstRound = Math.floor(qualifiers.length / 2);
  const newMatches = [];
  // Cross-pair adjacent group pairs: A1 vs B2, B1 vs A2, C1 vs D2, D1 vs C2 …
  for (let gi = 0; gi < groupNames.length - 1; gi += 2) {
    const gA = groupNames[gi], gB = groupNames[gi + 1];
    if (!byGroup[gA]?.length || !byGroup[gB]?.length) continue;
    if (byGroup[gA][0] && byGroup[gB][advance - 1])
      newMatches.push({ home_clan_id: byGroup[gA][0].id, away_clan_id: byGroup[gB][advance - 1].id, stage: 'knockout', group_name: null, round: firstRound, status: 'pending', fed_season: season });
    if (byGroup[gB][0] && byGroup[gA][advance - 1])
      newMatches.push({ home_clan_id: byGroup[gB][0].id, away_clan_id: byGroup[gA][advance - 1].id, stage: 'knockout', group_name: null, round: firstRound, status: 'pending', fed_season: season });
  }
  db.insertMany('fed_matches', newMatches);

  // Clear last group-stage channel IDs in DB (channels stay, get repurposed for KO)
  try {
    const _lgm = (db.get('fed_matches') || []).filter(m => m.fed_season === season && m.stage === 'group' && m.channel_id);
    for (const m of _lgm) db.update('fed_matches', m.id, { channel_id: null });
  } catch (e) { console.error('[FED] Group channel clear error:', e.message); }

  // Reuse category channels for first KO round
  try {
    const guild     = interaction.guild;
    const staffRole = fed.staff_role_id;
    const parentCat = fed.channels?.category || null;
    const updClans  = getFedClans();
    const getClanU  = id => updClans.find(c => c.id === id) || {};
    const inserted  = (db.get('fed_matches') || []).filter(m => m.fed_season === season && m.round === firstRound && m.stage === 'knockout');
    const _koMgmtIds = new Set(Object.values(fed.channels || {}).filter(v => v && v !== parentCat));
    let   _koPool    = [];
    if (parentCat) {
      _koPool = [...guild.channels.cache.values()].filter(c => c && c.parentId === parentCat && c.type === 0 && !_koMgmtIds.has(c.id)).sort((a, b) => a.position - b.position);
    }
    if (_koPool.length < inserted.length) {
      await interaction.followUp({ flags: 64, content: `❌ Not enough match channels — you have **${_koPool.length}** but the knockout round needs **${inserted.length}**. Add more channels to the federation category.` }).catch(() => {});
      interaction.editReply(buildFedPanel1()).catch(() => {});
      return;
    }
    for (let _koi2 = 0; _koi2 < inserted.length; _koi2++) {
      const im = inserted[_koi2];
      const clanA = getClanU(im.home_clan_id);
      const clanB = getClanU(im.away_clan_id);
      try {
        const koLbl2 = KO_LABELS_BOLD[firstRound] || ('𝗥' + firstRound);
        const chName = (koLbl2 + '〡' + toBoldTag(getClanTag(clanA)) + '・𝗩𝗦・' + toBoldTag(getClanTag(clanB))).slice(0, 100);
        const _koCh   = _koPool[_koi2];
        const _koMsgs = await _koCh.messages.fetch({ limit: 100 }).catch(() => null);
        if (_koMsgs && _koMsgs.size > 0) await _koCh.bulkDelete(_koMsgs, true).catch(() => {});
        await applyClanMatchPermissions(_koCh, clanA);
        await applyClanMatchPermissions(_koCh, clanB);
        await _koCh.setName(chName).catch(() => {});
        db.update('fed_matches', im.id, { channel_id: _koCh.id });
      } catch (e) { console.error('[FED] KO first round channel error (match ' + im.id + '):', e.message); }
      if (_koi2 < inserted.length - 1) await new Promise(r => setTimeout(r, 300));
    }
  } catch (e) { console.error('[FED] KO first round channel error:', e.message); }

  interaction.editReply(buildFedPanel1()).catch(() => refreshP1Fallback(client));
  refreshFedPanels(client, 'p1').catch(e => console.error('[FED] KO first round refresh:', e?.message));
}

// ── Score-entry panel (score selects 0–10) ───────────────────────────────────
function _makeScoreOpts(selected) {
  return Array.from({ length: 11 }, (_, i) => ({
    label: String(i), value: String(i),
    default: selected !== null && selected !== undefined && Number(selected) === i,
  }));
}

// phase: 'regular' | 'dm' | 'pen'
// homeScore / awayScore: null or number (already selected)
function buildScorePanel(matchId, phase, homeScore, awayScore) {
  const clans  = getFedClans();
  const matches = getFedMatches();
  const match  = matches.find(m => m.id === matchId);
  if (!match) return buildFedPanel1();
  const getClan = id => clans.find(c => c.id === id) || { name: '?' };
  const home    = getClan(match.home_clan_id);
  const away    = getClan(match.away_clan_id);
  const isKO    = match.stage === 'knockout';
  const SEP = { type: 14, divider: true, spacing: 1 };
  const txt = c => ({ type: 10, content: c });

  let phaseLabel, hCid, aCid;
  if (phase === 'dm') {
    phaseLabel = '\u26BD  Decisive Match';
    hCid = 'fed_p1_dh_' + matchId;
    aCid = homeScore !== null && homeScore !== undefined ? 'fed_p1_da_' + homeScore + '_' + matchId : null;
  } else if (phase === 'pen') {
    phaseLabel = '\uD83E\uDD45  Penalties';
    hCid = 'fed_p1_ph_' + matchId;
    aCid = homeScore !== null && homeScore !== undefined ? 'fed_p1_pa_' + homeScore + '_' + matchId : null;
  } else {
    phaseLabel = '\u26BD  Match Result';
    hCid = 'fed_p1_hs_' + matchId;
    aCid = homeScore !== null && homeScore !== undefined ? 'fed_p1_as_' + homeScore + '_' + matchId : null;
  }

  const stageLbl = isKO
    ? 'Knockout  \u2022  Round ' + match.round + (phase === 'regular' ? '  \u2022  \u26A0\uFE0F Draws go to Decisive Match' : '')
    : 'Group ' + (match.group_name || '?') + '  \u2022  Round ' + match.round;

  const inner = [
    txt('**' + phaseLabel + '**\n> ' + home.name.toUpperCase() + '  vs  ' + away.name.toUpperCase() + '\n-# ' + stageLbl),
    SEP,
    { type: 1, components: [{ type: 3, custom_id: hCid, placeholder: home.name + ' \u2014 score (0\u201310)', min_values: 1, max_values: 1, options: _makeScoreOpts(homeScore) }] },
  ];

  if (homeScore !== null && homeScore !== undefined && aCid) {
    inner.push({ type: 1, components: [{ type: 3, custom_id: aCid, placeholder: away.name + ' \u2014 score (0\u201310)', min_values: 1, max_values: 1, options: _makeScoreOpts(awayScore) }] });
  }

  inner.push(SEP);
  inner.push({ type: 1, components: [{ type: 2, style: 2, label: '\u25C4  Back', custom_id: 'fed_p1_scoreback_' + matchId }] });
  return { flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: inner }] };
}

// Kept for legacy backward compat (old match-selector dropdown)
function buildMatchResultPanel(matchId) { return buildScorePanel(matchId, 'regular', null, null); }

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
      return buildFedRoundMatchesPanel(curRound, allM, clans, 'fed_p1_refresh', 'knockout');
    }
  }

  // Cup group stage: go directly to current active round (no selector)
  if (system === 'cup') {
    const groupM    = allM.filter(m => m.stage === 'group');
    if (groupM.length > 0) {
      const started   = groupM.filter(m => m.channel_id || m.status === 'played').map(m => m.round);
      const activeRound = started.length ? Math.max(...started) : 1;
      // Always show round matches — manager decides when to advance, not the bot
      return buildFedRoundMatchesPanel(activeRound, allM, clans, 'fed_p1_refresh', 'group');
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
function buildFedRoundMatchesPanel(round, allM, clans, backId, stageFilter) {
  const _allM   = allM   || getFedMatches();
  const _clans  = clans  || getFedClans();
  const _backId = backId || 'fed_p1_addresult';
  const getClan = id => _clans.find(c => c.id === id) || { name: '?' };
  const RLABELS = { 1: 'Final', 2: 'Semi-Finals', 4: 'Quarter-Finals', 8: 'Round of 16', 16: 'Round of 32' };
  const SEP     = { type: 14, divider: true, spacing: 1 };
  const txt     = c => ({ type: 10, content: c });

  const roundMatches = _allM.filter(m => m.round === round && (!stageFilter || m.stage === stageFilter));
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
async function refreshFedClanListMessage(client) {
  const ref = db.getConfig('fed_clan_list_ref');
  if (!ref) return;
  try {
    const ch  = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await ch?.messages.fetch(ref.messageId).catch(() => null);
    if (!msg) return;
    const fed   = getFed();
    const clans = getFedClans();
    await msg.edit(makeFedClanListPost(fed, clans));
  } catch (_) {}
}

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
  if (id === 'fed_cfg_clan_count') {
    const _newCc   = parseInt(interaction.values[0]);
    const _ccClans = getFedClans();
    if (_ccClans.length > _newCc) {
      await interaction.deferUpdate();
      const _ccErr = await interaction.followUp({ flags: 64 | 32768, components: [{ type: 17, accent_color: 0xFF0049, components: [
        { type: 10, content: '❌  You have **' + _ccClans.length + '** clans registered — remove **' + (_ccClans.length - _newCc) + '** first before reducing the limit to **' + _newCc + '**.' },
      ]}]});
      setTimeout(() => _ccErr.delete().catch(() => {}), 5000);
      return;
    }
    saveFed({ clan_count: _newCc });
    return interaction.update(buildFedMainSettingsPanel());
  }
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

  // Match button clicked — open score entry panel
  if (id.startsWith('fed_p1_matchbtn_')) {
    const matchId = parseInt(id.replace('fed_p1_matchbtn_', ''));
    return interaction.update(buildScorePanel(matchId, 'regular', null, null));
  }

  // Legacy dropdown select (backward compat with any old panels in Discord)
  if (id === 'fed_p1_match_sel') {
    const matchId = parseInt(interaction.values[0]);
    return interaction.update(buildScorePanel(matchId, 'regular', null, null));
  }

  // ── Score selects (regular) ──────────────────────────────────────────────
  if (id.startsWith('fed_p1_hs_')) {
    const matchId   = parseInt(id.replace('fed_p1_hs_', ''));
    const homeScore = parseInt(interaction.values[0]);
    return interaction.update(buildScorePanel(matchId, 'regular', homeScore, null));
  }
  if (id.startsWith('fed_p1_as_')) {
    const parts     = id.replace('fed_p1_as_', '').split('_');
    const homeScore = parseInt(parts[0]);
    const matchId   = parseInt(parts[1]);
    const awayScore = parseInt(interaction.values[0]);
    const allM_as   = getFedMatches();
    const match_as  = allM_as.find(m => m.id === matchId);
    const isKO_as   = match_as && match_as.stage === 'knockout';
    if (isKO_as && homeScore === awayScore) {
      db.update('fed_matches', matchId, { home_score: homeScore, away_score: awayScore });
      return interaction.update(buildScorePanel(matchId, 'dm', null, null));
    }
    const result_as  = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw';
    const homePts_as = result_as === 'home' ? 3 : result_as === 'draw' ? 1 : 0;
    const awayPts_as = result_as === 'away' ? 3 : result_as === 'draw' ? 1 : 0;
    db.update('fed_matches', matchId, { result: result_as, status: 'played', home_score: homeScore, away_score: awayScore, home_pts: homePts_as, away_pts: awayPts_as });
    await interaction.deferUpdate();
    await Promise.all([
      refreshFedBracketMessage(client).catch(() => {}),
      refreshFedStandingsMessage(client).catch(() => {}),
      refreshFedPanels(client, 'p1').catch(() => {}),
      interaction.editReply(match_as ? buildFedRoundMatchesPanel(match_as.round, null, null, 'fed_p1_refresh', match_as.stage) : buildFedPanel1()),
    ]);
    return;
  }
  if (id.startsWith('fed_p1_sc_')) {
    const parts     = id.replace('fed_p1_sc_', '').split('_');
    const homeScore = parseInt(parts[0]);
    const awayScore = parseInt(parts[1]);
    const matchId   = parseInt(parts[2]);
    const allM      = getFedMatches();
    const match     = allM.find(m => m.id === matchId);
    const isKO      = match && match.stage === 'knockout';
    if (isKO && homeScore === awayScore) {
      // KO draw — save regular scores, proceed to Decisive Match
      db.update('fed_matches', matchId, { home_score: homeScore, away_score: awayScore });
      return interaction.update(buildScorePanel(matchId, 'dm', null, null));
    }
    const result   = homeScore > awayScore ? 'home' : homeScore < awayScore ? 'away' : 'draw';
    const homePts  = result === 'home' ? 3 : result === 'draw' ? 1 : 0;
    const awayPts  = result === 'away' ? 3 : result === 'draw' ? 1 : 0;
    db.update('fed_matches', matchId, { result, status: 'played', home_score: homeScore, away_score: awayScore, home_pts: homePts, away_pts: awayPts });
    await interaction.deferUpdate();
    await Promise.all([
      refreshFedBracketMessage(client).catch(() => {}),
      refreshFedStandingsMessage(client).catch(() => {}),
      refreshFedPanels(client, 'p1').catch(() => {}),
      interaction.editReply(match ? buildFedRoundMatchesPanel(match.round, null, null, 'fed_p1_refresh', match.stage) : buildFedPanel1()),
    ]);
    return;
  }

  // ── Score selects (Decisive Match) ───────────────────────────────────────
  if (id.startsWith('fed_p1_dh_')) {
    const matchId = parseInt(id.replace('fed_p1_dh_', ''));
    const dmHome  = parseInt(interaction.values[0]);
    return interaction.update(buildScorePanel(matchId, 'dm', dmHome, null));
  }
  if (id.startsWith('fed_p1_da_')) {
    const parts   = id.replace('fed_p1_da_', '').split('_');
    const dmHome  = parseInt(parts[0]);
    const matchId = parseInt(parts[1]);
    const dmAway  = parseInt(interaction.values[0]);
    const allM_da = getFedMatches();
    const match_da = allM_da.find(m => m.id === matchId);
    if (dmHome === dmAway) {
      db.update('fed_matches', matchId, { decisive_home: dmHome, decisive_away: dmAway });
      return interaction.update(buildScorePanel(matchId, 'pen', null, null));
    }
    const result_da = dmHome > dmAway ? 'home' : 'away';
    db.update('fed_matches', matchId, { result: result_da, status: 'played', decisive_home: dmHome, decisive_away: dmAway, home_pts: result_da === 'home' ? 3 : 0, away_pts: result_da === 'away' ? 3 : 0 });
    await interaction.deferUpdate();
    await Promise.all([
      refreshFedBracketMessage(client).catch(() => {}),
      refreshFedStandingsMessage(client).catch(() => {}),
      refreshFedPanels(client, 'p1').catch(() => {}),
      interaction.editReply(match_da ? buildFedRoundMatchesPanel(match_da.round, null, null, 'fed_p1_refresh', match_da.stage) : buildFedPanel1()),
    ]);
    return;
  }
  if (id.startsWith('fed_p1_dc_')) {
    const parts   = id.replace('fed_p1_dc_', '').split('_');
    const dmHome  = parseInt(parts[0]);
    const dmAway  = parseInt(parts[1]);
    const matchId = parseInt(parts[2]);
    const allM    = getFedMatches();
    const match   = allM.find(m => m.id === matchId);
    if (dmHome === dmAway) {
      // DM draw → penalties
      db.update('fed_matches', matchId, { decisive_home: dmHome, decisive_away: dmAway });
      return interaction.update(buildScorePanel(matchId, 'pen', null, null));
    }
    const result  = dmHome > dmAway ? 'home' : 'away';
    db.update('fed_matches', matchId, { result, status: 'played', decisive_home: dmHome, decisive_away: dmAway, home_pts: result === 'home' ? 3 : 0, away_pts: result === 'away' ? 3 : 0 });
    await interaction.deferUpdate();
    await Promise.all([
      refreshFedBracketMessage(client).catch(() => {}),
      refreshFedStandingsMessage(client).catch(() => {}),
      refreshFedPanels(client, 'p1').catch(() => {}),
      interaction.editReply(match ? buildFedRoundMatchesPanel(match.round, null, null, 'fed_p1_refresh', match.stage) : buildFedPanel1()),
    ]);
    return;
  }

  // ── Score selects (Penalties) ────────────────────────────────────────────
  if (id.startsWith('fed_p1_ph_')) {
    const matchId  = parseInt(id.replace('fed_p1_ph_', ''));
    const penHome  = parseInt(interaction.values[0]);
    return interaction.update(buildScorePanel(matchId, 'pen', penHome, null));
  }
  if (id.startsWith('fed_p1_pa_')) {
    const parts    = id.replace('fed_p1_pa_', '').split('_');
    const penHome  = parseInt(parts[0]);
    const matchId  = parseInt(parts[1]);
    const penAway  = parseInt(interaction.values[0]);
    const allM_pa  = getFedMatches();
    const match_pa = allM_pa.find(m => m.id === matchId);
    const result_pa = penHome >= penAway ? 'home' : 'away';
    db.update('fed_matches', matchId, { result: result_pa, status: 'played', pen_home: penHome, pen_away: penAway, home_pts: result_pa === 'home' ? 3 : 0, away_pts: result_pa === 'away' ? 3 : 0 });
    await interaction.deferUpdate();
    await Promise.all([
      refreshFedBracketMessage(client).catch(() => {}),
      refreshFedStandingsMessage(client).catch(() => {}),
      refreshFedPanels(client, 'p1').catch(() => {}),
      interaction.editReply(match_pa ? buildFedRoundMatchesPanel(match_pa.round, null, null, 'fed_p1_refresh', match_pa.stage) : buildFedPanel1()),
    ]);
    return;
  }
  if (id.startsWith('fed_p1_pc_')) {
    const parts   = id.replace('fed_p1_pc_', '').split('_');
    const penHome = parseInt(parts[0]);
    const penAway = parseInt(parts[1]);
    const matchId = parseInt(parts[2]);
    const allM    = getFedMatches();
    const match   = allM.find(m => m.id === matchId);
    const result  = penHome >= penAway ? 'home' : 'away'; // home wins if equal (edge case)
    db.update('fed_matches', matchId, { result, status: 'played', pen_home: penHome, pen_away: penAway, home_pts: result === 'home' ? 3 : 0, away_pts: result === 'away' ? 3 : 0 });
    await interaction.deferUpdate();
    await Promise.all([
      refreshFedBracketMessage(client).catch(() => {}),
      refreshFedStandingsMessage(client).catch(() => {}),
      refreshFedPanels(client, 'p1').catch(() => {}),
      interaction.editReply(match ? buildFedRoundMatchesPanel(match.round, null, null, 'fed_p1_refresh', match.stage) : buildFedPanel1()),
    ]);
    return;
  }

  // Back from score entry panel → return to match list for that round
  if (id.startsWith('fed_p1_scoreback_')) {
    const matchId_sb = parseInt(id.replace('fed_p1_scoreback_', ''));
    const allM_sb    = getFedMatches();
    const match_sb   = allM_sb.find(m => m.id === matchId_sb);
    if (!match_sb) return interaction.update(buildFedPanel1());
    return interaction.update(buildFedRoundMatchesPanel(match_sb.round, null, null, 'fed_p1_refresh', match_sb.stage));
  }

  // Legacy result buttons (backward compat with old Discord panels still open)
  if (id.startsWith('fed_p1_result_home_') || id.startsWith('fed_p1_result_draw_') || id.startsWith('fed_p1_result_away_')) {
    let result = 'draw';
    let rawId  = id;
    if (id.startsWith('fed_p1_result_home_')) { result = 'home'; rawId = id.replace('fed_p1_result_home_', ''); }
    else if (id.startsWith('fed_p1_result_draw_')) { result = 'draw'; rawId = id.replace('fed_p1_result_draw_', ''); }
    else if (id.startsWith('fed_p1_result_away_')) { result = 'away'; rawId = id.replace('fed_p1_result_away_', ''); }
    const matchId = parseInt(rawId);
    const allM    = getFedMatches();
    const match   = allM.find(m => m.id === matchId);
    db.update('fed_matches', matchId, { result, status: 'played', home_pts: result === 'home' ? 3 : result === 'draw' ? 1 : 0, away_pts: result === 'away' ? 3 : result === 'draw' ? 1 : 0 });
    await interaction.deferUpdate();
    await Promise.all([
      refreshFedBracketMessage(client).catch(() => {}),
      refreshFedStandingsMessage(client).catch(() => {}),
      refreshFedPanels(client, 'p1').catch(() => {}),
      interaction.editReply(match ? buildFedRoundMatchesPanel(match.round, null, null, 'fed_p1_refresh', match.stage) : buildFedPanel1()),
    ]);
    return;
  }

  // ── Panel 1: Two-step round advance ──────────────────────────────────────
  // fed_p1_next kept for backwards compat — acts as completeround
  if (id === 'fed_p1_completeround' || id === 'fed_p1_next') {
    // Respond instantly — no processing page
    saveFed({ round_closed: true });
    interaction.update(buildFedPanel1()).catch(() => refreshP1Fallback(client));
    // Background: remove clan role perms from current round's channels only
    ;(async () => {
      try {
        const _allM  = getFedMatches();
        const _clans = getFedClans();
        const _guild = interaction.guild;
        const _played = _allM.filter(m => m.status === 'played' && m.channel_id);
        if (!_played.length) return;
        const _curRound = Math.max(..._played.map(m => m.round));
        const _roundM   = _played.filter(m => m.round === _curRound);
        const _getClan  = cid => _clans.find(c => c.id === cid) || {};
        for (let _ri = 0; _ri < _roundM.length; _ri++) {
          const m = _roundM[_ri];
          try {
            const ch = _guild.channels.cache.get(m.channel_id);
            if (!ch) continue;
            const cA = _getClan(m.home_clan_id);
            const cB = _getClan(m.away_clan_id);
            if (cA.role_id) await ch.permissionOverwrites.delete(cA.role_id).catch(() => {});
            if (cB.role_id) await ch.permissionOverwrites.delete(cB.role_id).catch(() => {});
          } catch (_) {}
          if (_ri < _roundM.length - 1) await new Promise(r => setTimeout(r, 300));
        }
      } catch (e) { console.error('[FED] completeround perm clear error:', e.message); }
    })();
    return;
  }
  if (id === 'fed_p1_startround') {
    saveFed({ round_closed: false });
    return advanceRound(interaction, client);
  }

  // ── Panel 1: End Season (admin only) ────────────────────────────────────
  // ── Panel 1: End Season — confirmation ─────────────────────────────
  if (id === 'fed_p1_end') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return noAdmin(interaction);
    return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0xFF0049, components: [
      { type: 10, content: '## ⚠️  End Season\n> Are you sure you want to **end the current season**?\n> This cannot be undone.' },
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
    const guild       = interaction.guild;
    const _endedFed   = getFed();
    const _endedClans = getFedClans(); // capture BEFORE wipe — reset needs these IDs
    const _oldSznNum  = _endedFed.season || 1;
    const _nextSeason = _oldSznNum + 1;
    // Wipe DB instantly — capture fed snapshot first for background channel cleanup
    db.deleteWhere('fed_clans',   () => true);
    db.deleteWhere('fed_matches', () => true);
    saveFed({ status: 'setup', season: _nextSeason, registration_open: true });
    db.setConfig('fed_bracket_ref', null);
    db.setConfig('fed_standings_ref', null);
    db.setConfig('fed_clan_list_ref', null);
    // Respond instantly — no progress page
    interaction.update(buildFedPanel1()).catch(() => {});
    refreshFedPanels(client, 'p1').catch(e => console.error('[FED] end_confirm refresh:', e?.message));
    // Background: clean up channels using the pre-wipe fed snapshot (clan role IDs still available)
    resetCategoryChannels(guild, _endedFed, _endedClans).catch(e => console.error('[FED] resetChannels:', e.message));
    return;
  }
  // fed_p1_newedition removed — End Season is the only reset path

  // ── Panel 2: Registration ────────────────────────────────────────────────
  if (id === 'fed_p2_addclan') {
    const _fed      = getFed();
    const _season   = _fed.season || 1;
    const _fedClans = getFedClans();
    const _allRosters = (db.get('fed_rosters') || [])
      .filter(r => r.clan_name && r.clan_name.trim())
      .sort((a, b) => (a.clan_name || '').localeCompare(b.clan_name || ''));
    // Only show clans not already registered this season
    const _available = _allRosters.filter(r => !_fedClans.find(fc => fc.name.toLowerCase() === r.clan_name.toLowerCase()));
    const _errPanel  = msg => ({ flags: 32768, components: [{ type: 17, accent_color: 0xED4245, components: [
      { type: 10, content: '\u274C  ' + msg },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [{ type: 2, style: 2, label: '\u25C4  Back', custom_id: 'fed_p2_refresh' }] },
    ]}]});
    if (_fedClans.length >= (_fed.clan_count || 8)) {
      return interaction.update(_errPanel('The federation is full (' + (_fed.clan_count || 8) + ' clans). Remove a clan or increase the limit first.'));
    }
    if (!_available.length) {
      return interaction.update(_errPanel('No clans registered yet. Leaders must use `=clan` first.'));
    }
    const _remaining = (_fed.clan_count || 8) - _fedClans.length;
    const _maxSel    = Math.min(25, _remaining, _available.length);
    const _opts = _available.slice(0, 25).map(r => ({
      label: r.clan_name + (r.clan_tag ? '  [' + r.clan_tag + ']' : ''),
      value: String(r.id),
      description: (r.players || []).length + ' player' + ((r.players || []).length !== 1 ? 's' : '') + ' registered',
    }));
    return interaction.update({ flags: 32768, components: [{ type: 17, accent_color: 0x57F287, components: [
      { type: 10, content: '## \u2795  Register Clans\n> Select one or more clans. (' + _remaining + ' spot' + (_remaining !== 1 ? 's' : '') + ' left)' },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [{ type: 3, custom_id: 'fed_p2_addclan_sel', placeholder: 'Select clans\u2026', min_values: 1, max_values: _maxSel, options: _opts }] },
      { type: 14, divider: true, spacing: 1 },
      { type: 1, components: [{ type: 2, style: 2, label: '\u25C4  Back', custom_id: 'fed_p2_refresh' }] },
    ]}]});
  }

  if (id === 'fed_p2_addclan_sel') {
    const _fed      = getFed();
    const _season   = _fed.season || 1;
    const _allSrc   = (db.get('fed_rosters') || []).filter(r => r.clan_name && r.clan_name.trim());
    const _skipped  = [];
    await interaction.deferUpdate();
    // Fetch all guild roles once — if a clan has no role_id saved in the roster
    // (e.g. clans created before role tracking was added), look it up by clan tag
    // then by clan name so it is stored correctly from the moment of enrollment.
    const _allRolesMap = await interaction.guild.roles.fetch().catch(() => null);
    for (const _selId of interaction.values) {
      const _src = _allSrc.find(r => r.id === parseInt(_selId));
      if (!_src) { _skipped.push('Unknown clan'); continue; }
      const _fedClans = getFedClans();
      if (_fedClans.find(c => c.name.toLowerCase() === _src.clan_name.toLowerCase())) {
        _skipped.push(_src.clan_name + ' (already registered)'); continue; }
      if (_fedClans.length >= (_fed.clan_count || 8)) {
        _skipped.push(_src.clan_name + ' (federation full)'); continue; }
      const _normalized = normalizeFederationRoster(_src);
      // Use saved role_id if available; otherwise look up by tag then by name
      let _roleId = _normalized.role_id;
      if (!_roleId && _allRolesMap) {
        const _tag  = (_src.clan_tag  || '').trim().toLowerCase();
        const _name = (_src.clan_name || '').trim().toLowerCase();
        const _found = _allRolesMap.find(r =>
          (_tag && r.name.toLowerCase() === _tag) ||
          r.name.toLowerCase() === _name
        );
        if (_found) _roleId = _found.id;
      }
      db.insert('fed_clans', {
        name: _src.clan_name,
        tag: _src.clan_tag || '',
        source_roster_id: _normalized.source_roster_id,
        leader_id: _normalized.leader_id,
        players: _normalized.players,
        fed_season: _season,
        role_id: _roleId,
        group_name: null,
      });
    }
    if (_skipped.length) {
      await interaction.followUp({ content: '⚠️ Skipped: ' + _skipped.join(', '), flags: 64 });
    }
    refreshFedClanListMessage(client).catch(() => {});
    return interaction.editReply(buildFedPanel2());
  }

  if (id.startsWith('fed_p2_players_')) {
    // fed_p2_players_<clanId> — single multi-select: replaces all slots at once
    const clanId     = parseInt(id.replace('fed_p2_players_', ''));
    const selectedIds = (interaction.values || []).slice(0, (getFed().players_per_clan || 8));
    const clan        = (db.get('fed_clans') || []).find(c => c.id === clanId);
    if (!clan) return interaction.update(buildFedPanel2());

    const fed    = getFed();
    const season = fed.season || 1;

    // Check if any selected player is already in another clan
    const allClans = (db.get('fed_clans') || []).filter(c => c.fed_season === season && c.id !== clanId);
    const conflicts = [];
    for (const uid of selectedIds) {
      const otherClan = allClans.find(c => (c.players || []).filter(Boolean).includes(uid));
      if (otherClan) conflicts.push('<@' + uid + '> is already in **' + otherClan.name + '**');
    }
    if (conflicts.length) {
      await interaction.update(buildPlayerAssignPanel(clanId));
      return interaction.followUp({ content: '❌ ' + conflicts.join('\n'), flags: 64 });
    }

    const prevLeader = ((clan.players || []).filter(Boolean))[0] || null;
    const newLeader  = selectedIds[0] || null;
    db.update('fed_clans', clanId, { players: selectedIds });

    // Leader changed: update federation registration role
    if (prevLeader !== newLeader) {
      const regRoleId = fed.registration_role_id;
      if (regRoleId) {
        try {
          if (prevLeader) {
            const oldMember = await interaction.guild.members.fetch(prevLeader).catch(() => null);
            if (oldMember) await oldMember.roles.remove(regRoleId).catch(() => {});
          }
          if (newLeader) {
            const newMember = await interaction.guild.members.fetch(newLeader).catch(() => null);
            if (newMember) await newMember.roles.add(regRoleId).catch(() => {});
          }
        } catch (_) {}
      }
    }

    return interaction.update(buildPlayerAssignPanel(clanId));
  }

  if (id.startsWith('fed_p2_clan_save_')) {
    await interaction.deferUpdate();
    const _savedFed   = getFed();
    const _savedClans = getFedClans();
    if (_savedClans.length >= (_savedFed.clan_count || 8)) {
      refreshFedPanels(client, 'p2').catch(() => {});
    }
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
    refreshFedPanels(client, 'p2').catch(() => {});
    refreshFedClanListMessage(client).catch(() => {});
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
    refreshFedPanels(client, 'p2').catch(() => {});
    refreshFedClanListMessage(client).catch(() => {});
    return interaction.update(buildFedPanel2());
  }

  if (id === 'fed_p2_fillrandom') {
    const fed      = getFed();
    const season   = fed.season || 1;
    const required = fed.clan_count || 8;
    const clans    = getFedClans();
    if (clans.length >= required) return interaction.update(buildFedPanel2());
    const needed = required - clans.length;
    if (needed <= 0) return interaction.update(buildFedPanel2());

    // Use saved permanent role IDs; create only if a slot is missing
    const _permRoles   = db.getConfig('fed_permanent_roles') || {};
    const _allRolesMap = await interaction.guild.roles.fetch().catch(() => null);
    for (let i = 0; i < needed; i++) {
      const freshClans = getFedClans();
      if (freshClans.length >= required) break;
      const num      = freshClans.length + 1;
      const clanName = 'Clan ' + num;
      let   roleId   = _permRoles[clanName] || null;
      // Fallback: look up by name if not in saved config
      if (!roleId && _allRolesMap) {
        const _fr = _allRolesMap.find(r => r.name.toLowerCase() === clanName.toLowerCase());
        if (_fr) { roleId = _fr.id; _permRoles[clanName] = roleId; db.setConfig('fed_permanent_roles', _permRoles); }
      }
      // Only create if truly missing (beyond pre-existing permanent roles)
      if (!roleId) {
        try {
          const _nr = await interaction.guild.roles.create({ name: clanName, reason: 'Federation permanent clan role (auto-created)' });
          roleId = _nr.id; _permRoles[clanName] = roleId; db.setConfig('fed_permanent_roles', _permRoles);
        } catch (_) {}
      }
      db.insert('fed_clans', { name: clanName, tag: 'C' + num, players: [], fed_season: season, role_id: roleId, group_name: null, temporary: true });
    }

    refreshFedPanels(client, 'p2').catch(() => {});
    refreshFedClanListMessage(client).catch(() => {});
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
    // Pre-check: verify there are played matches for the selected round before publishing
    const _rFed   = getFed();
    const _rMts   = getFedMatches();
    const _rIsLg  = (_rFed.system || 'cup') === 'league';
    let _rRd;
    if (_rIsLg) {
      const _rp = _rMts.filter(m => m.status === 'pending');
      _rRd = _rp.length ? Math.min(..._rp.map(m => m.round)) : (_rMts.length ? Math.max(..._rMts.map(m => m.round)) : 1);
    } else {
      const _rgp = _rMts.filter(m => m.stage === 'group' && m.status === 'played').map(m => m.round);
      _rRd = db.getConfig('fed_p3_round') || (_rgp.length ? Math.max(..._rgp) : 1);
    }
    const _rHas = _rMts.some(m => m.status === 'played' && m.round === _rRd && (_rIsLg || m.stage === 'group'));
    if (!_rHas) {
      await interaction.deferUpdate();
      const _noRes = await interaction.followUp({ flags: 64 | 32768, components: [{ type: 17, accent_color: 0xFF0049, components: [
        { type: 10, content: '> ❌  No results for **' + (_rIsLg ? 'Round' : 'Match Day') + ' ' + _rRd + '** yet.' },
      ]}]});
      setTimeout(() => _noRes.delete().catch(() => {}), 4000);
      return;
    }
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
    if (!final.result || final.result === 'draw') return interaction.reply({ content: '\u274C The Final does not have a clear winner \u2014 re-enter the result before announcing the champion.', ephemeral: true });
    return doPublish(interaction, () => {
      const winnerId = final.result === 'home' ? final.home_clan_id : final.away_clan_id;
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
  const players  = (clan.players || []).filter(Boolean);
  const SEP      = { type: 14, divider: true, spacing: 1 };
  const txt      = c => ({ type: 10, content: c });

  const filled    = players.length;
  const allFilled = filled >= nPlayers;
  const rosterStr = players.length
    ? players.map((uid, i) => (i === 0 ? '\uD83D\uDC51 ' : '\u2022 ') + '<@' + uid + '>').join('  ')
    : '*No players assigned yet.*';

  const inner = [
    txt('**\uD83C\uDFDF\uFE0F  ' + clan.name + '** \u2014 Assign up to **' + nPlayers + '** players\n> **' + filled + '/' + nPlayers + '** assigned' + (allFilled ? '  \u2705' : '') + '\n> ' + rosterStr),
    SEP,
    { type: 1, components: [{ type: 2, style: 2, label: '\uD83C\uDFF7\uFE0F  Tag: ' + getClanTag(clan) + '  \u2014 Edit', custom_id: 'fed_p2_edit_tag_' + clanId }] },
    SEP,
    { type: 1, components: [{
      type: 5,
      custom_id: 'fed_p2_players_' + clanId,
      placeholder: '\uD83D\uDC65 Select up to ' + nPlayers + ' players\u2026',
      min_values: 0,
      max_values: Math.min(nPlayers, 25),
    }]},
    SEP,
    { type: 1, components: [
      { type: 2, style: allFilled ? 3 : 2, label: '\u2705 Save Clan', custom_id: 'fed_p2_clan_save_' + clanId },
      { type: 2, style: 4, label: '\u25C4 Back', custom_id: 'fed_p2_refresh' },
    ]},
  ];

  return { flags: 32768, components: [{ type: 17, accent_color: 0x57F287, components: inner }] };
}

module.exports = { handleFederationInteraction, refreshFedPanels };
