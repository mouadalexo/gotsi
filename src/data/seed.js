const { db } = require('../utils/database');

const DEFAULT_TEAMS = [
  // International clubs
  { name: 'Real Madrid', short_name: 'RMA', emoji: '👑', category: 'international' },
  { name: 'FC Barcelona', short_name: 'BAR', emoji: '🔵', category: 'international' },
  { name: 'Manchester City', short_name: 'MCI', emoji: '🩵', category: 'international' },
  { name: 'Manchester United', short_name: 'MUN', emoji: '🔴', category: 'international' },
  { name: 'Liverpool FC', short_name: 'LIV', emoji: '🦅', category: 'international' },
  { name: 'Chelsea FC', short_name: 'CHE', emoji: '💙', category: 'international' },
  { name: 'Arsenal FC', short_name: 'ARS', emoji: '🔴', category: 'international' },
  { name: 'Tottenham Hotspur', short_name: 'TOT', emoji: '⚪', category: 'international' },
  { name: 'Bayern Munich', short_name: 'BAY', emoji: '⚽', category: 'international' },
  { name: 'Borussia Dortmund', short_name: 'BVB', emoji: '🟡', category: 'international' },
  { name: 'PSG', short_name: 'PSG', emoji: '🗼', category: 'international' },
  { name: 'Juventus', short_name: 'JUV', emoji: '⚫', category: 'international' },
  { name: 'AC Milan', short_name: 'MIL', emoji: '🔴', category: 'international' },
  { name: 'Inter Milan', short_name: 'INT', emoji: '🔵', category: 'international' },
  { name: 'Atletico Madrid', short_name: 'ATM', emoji: '🔴', category: 'international' },
  { name: 'Sevilla FC', short_name: 'SEV', emoji: '⚪', category: 'international' },
  { name: 'Ajax', short_name: 'AJX', emoji: '🔴', category: 'international' },
  { name: 'Porto FC', short_name: 'POR', emoji: '🔵', category: 'international' },
  { name: 'Benfica', short_name: 'BEN', emoji: '🦅', category: 'international' },
  { name: 'Celtic FC', short_name: 'CEL', emoji: '💚', category: 'international' },
  { name: 'Bayer Leverkusen', short_name: 'LEV', emoji: '⚫', category: 'international' },
  { name: 'Napoli', short_name: 'NAP', emoji: '🔵', category: 'international' },
  { name: 'Roma', short_name: 'ROM', emoji: '🟡', category: 'international' },
  { name: 'Lazio', short_name: 'LAZ', emoji: '⚪', category: 'international' },
  { name: 'Valencia CF', short_name: 'VAL', emoji: '🦇', category: 'international' },
  { name: 'Real Sociedad', short_name: 'RSO', emoji: '🔵', category: 'international' },
  { name: 'RB Leipzig', short_name: 'RBL', emoji: '🔴', category: 'international' },
  { name: 'Shakhtar Donetsk', short_name: 'SHA', emoji: '🟠', category: 'international' },
  { name: 'Galatasaray', short_name: 'GAL', emoji: '🔴', category: 'international' },
  { name: 'Fenerbahce', short_name: 'FEN', emoji: '🟡', category: 'international' },
  // Moroccan clubs
  { name: 'Wydad AC', short_name: 'WAC', emoji: '🔴', category: 'morocco' },
  { name: 'Raja CA', short_name: 'RCA', emoji: '💚', category: 'morocco' },
  { name: 'FUS Rabat', short_name: 'FUS', emoji: '🟠', category: 'morocco' },
  { name: 'AS FAR', short_name: 'FAR', emoji: '🔴', category: 'morocco' },
  { name: 'MAS Fes', short_name: 'MAS', emoji: '🔵', category: 'morocco' },
  { name: 'Ittihad Tanger', short_name: 'ITT', emoji: '🔴', category: 'morocco' },
  { name: 'Moghreb Tetouan', short_name: 'MAT', emoji: '🟢', category: 'morocco' },
  { name: 'Hassania Agadir', short_name: 'HUSA', emoji: '🔵', category: 'morocco' },
  // Saudi clubs
  { name: 'Al-Hilal', short_name: 'HIL', emoji: '🔵', category: 'saudi' },
  { name: 'Al-Nassr', short_name: 'NAS', emoji: '🟡', category: 'saudi' },
  { name: 'Al-Ittihad', short_name: 'ITTJ', emoji: '🟡', category: 'saudi' },
];

function seedDefaultData() {
  const existing = db.get('teams').map(t => t.name);
  for (const team of DEFAULT_TEAMS) {
    if (!existing.includes(team.name)) {
      db.insert('teams', team);
    }
  }
  console.log('[DB] Default teams seeded.');
}

module.exports = { seedDefaultData, DEFAULT_TEAMS };
