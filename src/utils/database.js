'use strict';
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '../../data/db.json');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const DEFAULT_DB = {
  teams: [], players: [], tournaments: [], tournament_teams: [], matches: [],
  admins: [], winners: [], config: {},
  _nextId: { teams: 1, players: 1, tournaments: 1, tournament_teams: 1, matches: 1, admins: 1, winners: 1 },
};

let _db = null;

function load() {
  if (!_db) {
    if (fs.existsSync(DB_PATH)) {
      try {
        _db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        for (const key of Object.keys(DEFAULT_DB)) {
          if (_db[key] === undefined) _db[key] = DEFAULT_DB[key];
        }
        if (!_db._nextId) _db._nextId = { ...DEFAULT_DB._nextId };
        if (!_db._nextId.admins)   _db._nextId.admins   = 1;
        if (!_db._nextId.winners)  _db._nextId.winners  = 1;
        // Migrate tournaments to new fields
        for (const t of (_db.tournaments || [])) {
          if (t.type               === undefined) t.type               = 'group_knockout';
          if (t.teams_per_group    === undefined) t.teams_per_group    = t.group_size || 4;
          if (t.advance_per_group  === undefined) t.advance_per_group  = 2;
          if (t.encounters         === undefined) t.encounters         = 1;
          if (t.players_per_team   === undefined) t.players_per_team   = 1;
          if (t.win_pts            === undefined) t.win_pts            = 3;
          if (t.draw_pts           === undefined) t.draw_pts           = 1;
          if (t.loss_pts           === undefined) t.loss_pts           = 0;
          if (t.forfeit_pts        === undefined) t.forfeit_pts        = 0;
          if (t.registration_open  === undefined) t.registration_open  = (t.status === 'setup');
          if (t.channels           === undefined) t.channels           = {};
          if (t.panel1_ref         === undefined) t.panel1_ref         = null;
          if (t.panel2_ref         === undefined) t.panel2_ref         = null;
          if (t.panel3_ref         === undefined) t.panel3_ref         = null;
          // Winners history fields
          if (t.winner_role_id        === undefined) t.winner_role_id        = null;
          if (t.registration_role_id  === undefined) t.registration_role_id  = null;
          if (t.tag_on               === undefined) t.tag_on               = false;
          if (t.winners_history_ref   === undefined) t.winners_history_ref   = null;
          if (t.teams_list_ref        === undefined) t.teams_list_ref        = null;
        }
      } catch (_) { _db = JSON.parse(JSON.stringify(DEFAULT_DB)); }
    } else { _db = JSON.parse(JSON.stringify(DEFAULT_DB)); }
  }
  return _db;
}

function save() { fs.writeFileSync(DB_PATH, JSON.stringify(_db)); }
function nextId(table) {
  const d = load();
  if (!d._nextId[table]) d._nextId[table] = 1;
  const id = d._nextId[table];
  d._nextId[table] = id + 1;
  return id;
}

const db = {
  get:    (table)           => load()[table],
  save,
  findById:    (table, id)        => load()[table].find(r => r.id === id),
  findWhere:   (table, predicate) => load()[table].filter(predicate),
  findOne:     (table, predicate) => load()[table].find(predicate),
  insert: (table, data) => {
    const rec = { id: nextId(table), created_at: new Date().toISOString(), ...data };
    load()[table].push(rec); save(); return rec;
  },
  update: (table, id, data) => {
    const d   = load();
    const idx = d[table].findIndex(r => r.id === id);
    if (idx === -1) return null;
    d[table][idx] = { ...d[table][idx], ...data }; save(); return d[table][idx];
  },
  updateWhere: (table, predicate, data) => {
    const d = load(); d[table] = d[table].map(r => predicate(r) ? { ...r, ...data } : r); save();
  },
  delete:      (table, id)        => { const d = load(); d[table] = d[table].filter(r => r.id !== id); save(); },
  deleteWhere: (table, predicate) => { const d = load(); d[table] = d[table].filter(r => !predicate(r)); save(); },
  insertMany: (table, records) => {
    const d = load();
    const inserted = records.map(data => {
      if (!d._nextId[table]) d._nextId[table] = 1;
      const id = d._nextId[table]++;
      const rec = { id, created_at: new Date().toISOString(), ...data };
      d[table].push(rec);
      return rec;
    });
    save();
    return inserted;
  },
  updateMany: (table, updates) => {
    // updates = [{id, data}, ...]
    const d = load();
    for (const { id, data } of updates) {
      const idx = d[table].findIndex(r => r.id === id);
      if (idx !== -1) d[table][idx] = { ...d[table][idx], ...data };
    }
    save();
  },
  setConfig:   (key, value)       => { load().config[key] = value; save(); },
  getConfig:   (key)              => load().config[key],
};

function initDB() { load(); console.log('[DB] Database initialized.'); }
function reload() { _db = null; }
module.exports = { db, initDB, reload };
