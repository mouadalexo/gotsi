'use strict';

function normalize(s) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[n];
}

function scoreTeam(query, teamName) {
  const q = normalize(query);
  const t = normalize(teamName);
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 75;
  const qWords = q.split(' ');
  const tWords = t.split(' ');
  for (const w of qWords) {
    if (w.length >= 3 && tWords.some(tw => tw.startsWith(w))) return 65;
  }
  const maxLen = Math.max(q.length, t.length);
  if (maxLen === 0) return 0;
  const lev = levenshtein(q, t);
  return Math.floor(((maxLen - lev) / maxLen) * 55);
}

/**
 * Returns top N teams sorted by fuzzy match score against query.
 * @param {string} query
 * @param {Array<{id:number,name:string}>} teams
 * @param {number} topN
 * @returns {Array<{id:number,name:string}>}
 */
function fuzzyTeamSearch(query, teams, topN = 5) {
  if (!query || !query.trim()) return teams.slice(0, topN);
  const scored = teams.map(t => ({ team: t, score: scoreTeam(query, t.name) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 10).slice(0, topN).map(s => s.team);
}

module.exports = { fuzzyTeamSearch };
