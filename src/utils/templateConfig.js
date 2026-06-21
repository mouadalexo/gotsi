'use strict';
const { db } = require('./database');

const DEFAULTS = {
  EL: { team_count_opts: [16, 32, 64], tpg_opts: [4], apg_opts: [2], ppt_opts: [1], enc_opts: [1] },
  CL:  { team_count_opts: [8, 16, 32],  tpg_opts: [4], apg_opts: [2], ppt_opts: [2], enc_opts: [1] },
};

function getTplCfg(template) {
  const stored = db.getConfig(`tpl_cfg_${template}`) || {};
  const def    = DEFAULTS[template] || { team_count_opts: [16, 32, 64], tpg_opts: [4], apg_opts: [2], ppt_opts: [1], enc_opts: [1] };
  return {
    team_count_opts: stored.team_count_opts || def.team_count_opts,
    tpg_opts:        stored.tpg_opts        || def.tpg_opts,
    apg_opts:        stored.apg_opts        || def.apg_opts,
    ppt_opts:        stored.ppt_opts        || def.ppt_opts,
    enc_opts:        stored.enc_opts        || def.enc_opts,
  };
}

function getKnownTemplates() {
  const fromDB = db.get('tournaments').map(t => t.template);
  return [...new Set(['EL', 'CL', ...fromDB])];
}

module.exports = { getTplCfg, getKnownTemplates };
