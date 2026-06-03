'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { reload } = require('../src/utils/database');
const {
  buildTestTeamsList,
  buildTestSchedule,
  buildTestResults,
  buildTestStandings,
  buildTestGroupDraw,
  buildTestBracket,
} = require('../src/interactions/testInteractions');

const PUBLIC = path.join(__dirname, 'public');

const PANELS = {
  teams_list: { label: '📋 Teams List',  fn: buildTestTeamsList  },
  schedule:   { label: '📅 Schedule',    fn: buildTestSchedule   },
  results:    { label: '⚽ Results',     fn: buildTestResults    },
  standings:  { label: '📊 Standings',   fn: buildTestStandings  },
  groupdraw:  { label: '🎲 Group Draw',  fn: buildTestGroupDraw  },
  bracket:    { label: '🏆 Bracket',     fn: buildTestBracket    },
};

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const u        = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  // ── GET /api/panels ─────────────────────────────────────────────────────────
  if (pathname === '/api/panels' && req.method === 'GET') {
    reload(); // re-read db.json from disk
    const out = {};
    for (const [id, panel] of Object.entries(PANELS)) {
      try {
        out[id] = { label: panel.label, payload: panel.fn() };
      } catch (e) {
        out[id] = { label: panel.label, error: String(e.message) };
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
    return;
  }

  // ── GET /api/panel/:id ───────────────────────────────────────────────────────
  const pm = pathname.match(/^\/api\/panel\/(\w+)$/);
  if (pm && req.method === 'GET') {
    const panel = PANELS[pm[1]];
    if (!panel) { res.writeHead(404); res.end('Unknown panel'); return; }
    reload();
    try {
      const payload = panel.fn();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ label: panel.label, payload }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── Static files ─────────────────────────────────────────────────────────────
  const rel  = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); res.end(); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
  });
});

const PORT = process.env.PORT || 4500;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Preview] http://0.0.0.0:${PORT}`);
});
