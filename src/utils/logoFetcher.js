'use strict';
const https = require('https');
const { db } = require('./database');

const API_FOOTBALL_KEY = '6f787e3b7e5f635e8637cc0f9c752919';

// ── API-Football logo fetch ───────────────────────────────────────────────────
function fetchApiFootballLogo(teamName) {
  return new Promise(resolve => {
    const query = encodeURIComponent(teamName);
    const options = {
      hostname: 'v3.football.api-sports.io',
      path: `/teams?name=${query}`,
      headers: {
        'x-apisports-key': API_FOOTBALL_KEY,
        'Accept': 'application/json',
      },
    };
    const req = https.get(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const logo = j.response?.[0]?.team?.logo || null;
          resolve(logo);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

// ── Wikipedia logo fetch (fallback) ──────────────────────────────────────────
function fetchWikiLogo(teamName) {
  return new Promise(resolve => {
    const slug = encodeURIComponent(teamName.replace(/ /g, '_'));
    const req = https.get({
      hostname: 'en.wikipedia.org',
      path: `/api/rest_v1/page/summary/${slug}`,
      headers: { 'User-Agent': 'GoatsiBot/1.0', 'Accept': 'application/json' },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          resolve(j.thumbnail?.source || j.originalimage?.source || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
  });
}

// ── Main: try API-Football first, then Wikipedia ─────────────────────────────
async function fetchTeamLogo(teamName) {
  let url = await fetchApiFootballLogo(teamName);
  if (!url) url = await fetchWikiLogo(teamName);
  return url;
}

// ── Called when a team is enrolled — fetches + caches logo in background ─────
function ensureTeamLogos(teams) {
  (async () => {
    for (const team of teams) {
      if (team.logo_url) continue;
      const url = await fetchTeamLogo(team.name);
      if (url) {
        db.update('teams', team.id, { logo_url: url });
        console.log(`[LOGO] ${team.name} → ${url.slice(0, 60)}`);
      }
    }
  })().catch(e => console.error('[LOGO ERROR]', e.message));
}

module.exports = { fetchTeamLogo, fetchWikiLogo, fetchApiFootballLogo, ensureTeamLogos };
