const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/db.json');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const DEFAULT_DB = {
  teams: [],
  players: [],
  tournaments: [],
  tournament_teams: [],
  matches: [],
  config: {},
  _nextId: { teams: 1, players: 1, tournaments: 1, tournament_teams: 1, matches: 1 },
};

let _db = null;

function load() {
  if (!_db) {
    if (fs.existsSync(DB_PATH)) {
      try {
        _db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        // Ensure all keys exist (migrations)
        for (const key of Object.keys(DEFAULT_DB)) {
          if (_db[key] === undefined) _db[key] = DEFAULT_DB[key];
        }
      } catch (_) {
        _db = JSON.parse(JSON.stringify(DEFAULT_DB));
      }
    } else {
      _db = JSON.parse(JSON.stringify(DEFAULT_DB));
    }
  }
  return _db;
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(_db, null, 2));
}

function nextId(table) {
  const db = load();
  const id = db._nextId[table] || 1;
  db._nextId[table] = id + 1;
  return id;
}

// Generic helpers
const db = {
  get: (table) => load()[table],
  save,

  findById: (table, id) => load()[table].find(r => r.id === id),

  findWhere: (table, predicate) => load()[table].filter(predicate),

  findOne: (table, predicate) => load()[table].find(predicate),

  insert: (table, data) => {
    const rec = { id: nextId(table), created_at: new Date().toISOString(), ...data };
    load()[table].push(rec);
    save();
    return rec;
  },

  update: (table, id, data) => {
    const db = load();
    const idx = db[table].findIndex(r => r.id === id);
    if (idx === -1) return null;
    db[table][idx] = { ...db[table][idx], ...data };
    save();
    return db[table][idx];
  },

  updateWhere: (table, predicate, data) => {
    const db = load();
    db[table] = db[table].map(r => predicate(r) ? { ...r, ...data } : r);
    save();
  },

  delete: (table, id) => {
    const db = load();
    db[table] = db[table].filter(r => r.id !== id);
    save();
  },

  deleteWhere: (table, predicate) => {
    const db = load();
    db[table] = db[table].filter(r => !predicate(r));
    save();
  },

  setConfig: (key, value) => {
    load().config[key] = value;
    save();
  },

  getConfig: (key) => load().config[key],
};

function initDB() {
  load();
  console.log('[DB] Database initialized.');
}

module.exports = { db, initDB };
