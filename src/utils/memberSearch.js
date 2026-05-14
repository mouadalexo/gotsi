'use strict';

/**
 * Search guild members by partial username/displayName.
 * Returns up to `limit` GuildMember objects.
 */
async function searchMembers(guild, query, limit = 10) {
  if (!query || !query.trim()) return [];
  const q = query.trim();

  // Try Discord native search first (needs GuildMembers privileged intent)
  try {
    const fetched = await guild.members.search({ query: q, limit });
    if (fetched.size > 0) {
      return [...fetched.values()].filter(m => !m.user.bot).slice(0, limit);
    }
  } catch {}

  // Fallback: filter the member cache
  const lower = q.toLowerCase();
  const results = [];
  for (const [, member] of guild.members.cache) {
    if (member.user.bot) continue;
    const username    = (member.user.username    || '').toLowerCase();
    const globalName  = (member.user.globalName  || '').toLowerCase();
    const displayName = (member.displayName       || '').toLowerCase();
    if (username.includes(lower) || globalName.includes(lower) || displayName.includes(lower)) {
      results.push(member);
      if (results.length >= limit) break;
    }
  }
  return results;
}

module.exports = { searchMembers };
