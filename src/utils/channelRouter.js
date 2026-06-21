'use strict';
const { db } = require('./database');

const CHANNEL_MAP = {
  EL: {
    teamsList:      '1462982588661628938',
    results:        '1463162274192556072',
    matchSchedule:  '1462982363267993672',
    groupDraw:      '1462982363267993672',
    category:       '1462982041703547023',
  },
  CL: {
    teamsList:      '1463154002660429885',
    results:        '1463162354656088188',
    matchSchedule:  '1463153753078108180',
    groupDraw:      '1463153753078108180',
    category:       '1463153310943936532',
  },
};

async function getTargetChannel(guild, template, type) {
  const tmpl = template.toUpperCase();
  // DB config takes priority over hardcoded map (set via /adminpanel)
  const configId = db.get('config')?.channels?.[tmpl]?.[type];
  const channelId = configId || CHANNEL_MAP[tmpl]?.[type];
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
}

module.exports = { getTargetChannel, CHANNEL_MAP };
