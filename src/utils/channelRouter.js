const { db } = require('./database');

const CHANNEL_MAP = {
  NSEL: {
    teamsList:      '1462982588661628938',
    results:       '1463162274192556072',
    matchSchedule: '1462982363267993672',
    groupDraw:     '1462982363267993672',
    category:      '1462982041703547023',
  },
  MCL: {
    teamsList:      '1463154002660429885',
    results:       '1463162354656088188',
    matchSchedule: '1463153753078108180',
    groupDraw:     '1463153753078108180',
    category:      '1463153310943936532',
  },
};

async function getTargetChannel(guild, template, type) {
  const tmpl = template.toUpperCase();
  const cfg = CHANNEL_MAP[tmpl];
  if (!cfg || !cfg[type]) return null;
  const ch = guild.channels.cache.get(cfg[type]);
  return ch || null;
}

module.exports = { getTargetChannel, CHANNEL_MAP };
