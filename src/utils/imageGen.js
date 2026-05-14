'use strict';
const { createCanvas, loadImage } = require('canvas');

// ─── Dark Red color palette ───────────────────────────────────────────────────
const C = {
  bg:       '#130002',
  bgDeep:   '#0A0001',
  card:     '#1E0005',
  cardAlt:  '#2A0008',
  title:    '#FFFFFF',
  sub:      '#FFFFFF',
  textMid:  '#CCCCCC',
  textSub:  '#AAAAAA',
  score:    '#FFFFFF',
  border:   'rgba(200,50,50,0.35)',
  div:      'rgba(220,60,60,0.20)',
  win:      '#57F287',
  loss:     '#ED4245',
  draw:     '#FAA61A',
  gold:     '#F1C40F',
  text:     '#FFFFFF',
  // legacy (used in knockout/roster which keep their style)
  uclBg:      '#08122A',
  uclCard:    '#0C1D45',
  uclCardAlt: '#0E2250',
  uclScore:   '#00CCFF',
  uclTitle:   '#FFFFFF',
  uclSub:     '#9AAAC8',
  uclDiv:     'rgba(255,255,255,0.12)',
};

const TEAM_COLORS = [
  '#E74C3C','#E67E22','#F1C40F','#2ECC71','#1ABC9C',
  '#3498DB','#9B59B6','#E91E63','#FF5722','#009688',
  '#607D8B','#795548','#F44336','#4CAF50','#2196F3',
];

function teamColor(name = '') {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) & 0xFFFFFFFF;
  return TEAM_COLORS[Math.abs(h) % TEAM_COLORS.length];
}

function hexLight(name) {
  const base = teamColor(name);
  const n = parseInt(base.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + 45);
  const g = Math.min(255, ((n >>  8) & 0xff) + 45);
  const b = Math.min(255, ((n      ) & 0xff) + 45);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function rr(ctx, x, y, w, h, r, fill, stroke, sw = 1) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill)   { ctx.fillStyle = fill;     ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
}

function dot(ctx, x, y, r, name) {
  ctx.fillStyle = teamColor(name);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.font = `bold ${Math.floor(r * 0.85)}px "DejaVu Sans", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText((String(name || '?')[0]).toUpperCase(), x, y + r * 0.35);
}

// ─── Red diagonal stripes (replaces UCL blue decoration) ─────────────────────
function drawRedStripes(ctx, W, H) {
  const BAND = 210;

  const leftLines = [
    { offset: 0,   width: 26, color: '#6B0000', alpha: 0.72 },
    { offset: 30,  width: 14, color: '#990000', alpha: 0.78 },
    { offset: 50,  width: 10, color: '#CC0000', alpha: 0.58 },
    { offset: 66,  width: 24, color: '#800000', alpha: 0.68 },
    { offset: 96,  width: 12, color: '#B30000', alpha: 0.72 },
    { offset: 114, width:  8, color: '#FF2200', alpha: 0.52 },
    { offset: 128, width: 18, color: '#990000', alpha: 0.62 },
    { offset: 152, width: 10, color: '#6B0000', alpha: 0.48 },
    { offset: 168, width: 16, color: '#CC1100', alpha: 0.58 },
    { offset: 190, width:  8, color: '#800000', alpha: 0.42 },
  ];

  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, BAND, H); ctx.clip();
  for (const l of leftLines) {
    ctx.globalAlpha = l.alpha;
    ctx.strokeStyle = l.color;
    ctx.lineWidth = l.width;
    const dx = 0.44 * H;
    ctx.beginPath();
    ctx.moveTo(l.offset - dx, H + 20);
    ctx.lineTo(l.offset + dx, -20);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  const rightLines = [
    { offset: 0,   width: 22, color: '#880000', alpha: 0.68 },
    { offset: 26,  width: 12, color: '#CC0000', alpha: 0.72 },
    { offset: 44,  width: 26, color: '#6B0000', alpha: 0.58 },
    { offset: 76,  width: 10, color: '#FF2200', alpha: 0.62 },
    { offset: 92,  width: 18, color: '#AA0000', alpha: 0.68 },
    { offset: 116, width:  8, color: '#CC1100', alpha: 0.52 },
    { offset: 130, width: 22, color: '#800000', alpha: 0.62 },
    { offset: 158, width: 12, color: '#990000', alpha: 0.48 },
    { offset: 176, width: 14, color: '#CC0000', alpha: 0.58 },
    { offset: 196, width:  8, color: '#6B0000', alpha: 0.42 },
  ];

  ctx.save();
  ctx.beginPath(); ctx.rect(W - BAND, 0, BAND, H); ctx.clip();
  for (const l of rightLines) {
    ctx.globalAlpha = l.alpha;
    ctx.strokeStyle = l.color;
    ctx.lineWidth = l.width;
    const dx = 0.44 * H;
    const bx = W - l.offset;
    ctx.beginPath();
    ctx.moveTo(bx + dx, H + 20);
    ctx.lineTo(bx - dx, -20);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ─── Crest helpers ────────────────────────────────────────────────────────────
function crestPath(ctx, cx, cy, rw, rh) {
  const cr = rw * 0.22;
  ctx.beginPath();
  ctx.moveTo(cx - rw + cr, cy - rh);
  ctx.lineTo(cx + rw - cr, cy - rh);
  ctx.arcTo(cx + rw, cy - rh, cx + rw, cy - rh + cr, cr);
  ctx.lineTo(cx + rw, cy + rh * 0.28);
  ctx.bezierCurveTo(cx + rw, cy + rh * 0.75, cx + rw * 0.3, cy + rh, cx, cy + rh);
  ctx.bezierCurveTo(cx - rw * 0.3, cy + rh, cx - rw, cy + rh * 0.75, cx - rw, cy + rh * 0.28);
  ctx.lineTo(cx - rw, cy - rh + cr);
  ctx.arcTo(cx - rw, cy - rh, cx - rw + cr, cy - rh, cr);
  ctx.closePath();
}

function drawCrest(ctx, cx, cy, rw, rh, team, isWinner) {
  ctx.save();
  if (isWinner) {
    const glow = ctx.createRadialGradient(cx, cy, rw * 0.5, cx, cy, rw * 1.65);
    glow.addColorStop(0, 'rgba(255,210,0,0.5)');
    glow.addColorStop(1, 'rgba(255,210,0,0)');
    crestPath(ctx, cx, cy, rw * 1.55, rh * 1.55);
    ctx.fillStyle = glow; ctx.fill();
  }
  ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = rw * 0.5; ctx.shadowOffsetY = rw * 0.18;
  crestPath(ctx, cx, cy, rw, rh); ctx.fillStyle = '#000'; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  const grad = ctx.createLinearGradient(cx - rw, cy - rh, cx + rw, cy + rh);
  grad.addColorStop(0, hexLight(team.name));
  grad.addColorStop(0.55, teamColor(team.name));
  grad.addColorStop(1, teamColor(team.name));
  crestPath(ctx, cx, cy, rw, rh); ctx.fillStyle = grad; ctx.fill();
  ctx.save();
  crestPath(ctx, cx, cy, rw, rh); ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(cx, cy - rh, rw, rh * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.09)'; ctx.fillRect(cx - rw, cy - rh * 0.13, rw * 2, rh * 0.26);
  ctx.restore();
  crestPath(ctx, cx, cy, rw, rh);
  ctx.strokeStyle = isWinner ? '#FFD700' : 'rgba(255,255,255,0.8)';
  ctx.lineWidth = Math.max(2, rw * 0.07); ctx.stroke();
  ctx.save();
  crestPath(ctx, cx, cy, rw, rh); ctx.clip();
  const label = (team.short_name || team.name || '?').slice(0, 3).toUpperCase();
  const fs = rw * (label.length > 2 ? 0.52 : 0.68);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = `bold ${fs}px "DejaVu Sans", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6;
  ctx.fillText(label, cx, cy + rh * 0.04);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// ─── Async logo draw: real badge from URL, falls back to drawCrest ────────────
function drawUCLDecoration(ctx, W, H) {
  const BAND = 140;
  const leftLines = [
    { offset: 0,   width: 18, color: '#3300AA', alpha: 0.55 },
    { offset: 22,  width: 12, color: '#5500FF', alpha: 0.70 },
    { offset: 38,  width: 8,  color: '#7744CC', alpha: 0.50 },
    { offset: 52,  width: 20, color: '#2200BB', alpha: 0.60 },
    { offset: 76,  width: 10, color: '#6622EE', alpha: 0.65 },
    { offset: 92,  width: 6,  color: '#4411CC', alpha: 0.45 },
    { offset: 106, width: 14, color: '#8833FF', alpha: 0.55 },
    { offset: 120, width: 8,  color: '#3300DD', alpha: 0.40 },
  ];
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, BAND, H); ctx.clip();
  for (const l of leftLines) {
    ctx.globalAlpha = l.alpha;
    ctx.strokeStyle = l.color; ctx.lineWidth = l.width;
    const dx = 0.42 * H;
    ctx.beginPath(); ctx.moveTo(l.offset - dx, H + 20); ctx.lineTo(l.offset + dx, -20); ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1;
  const rightLines = [
    { offset: 0,   width: 16, color: '#00BBEE', alpha: 0.60 },
    { offset: 18,  width: 10, color: '#FF0066', alpha: 0.65 },
    { offset: 32,  width: 20, color: '#00DDCC', alpha: 0.50 },
    { offset: 56,  width: 8,  color: '#FF5500', alpha: 0.55 },
    { offset: 70,  width: 14, color: '#00AAFF', alpha: 0.60 },
    { offset: 88,  width: 6,  color: '#FF2244', alpha: 0.45 },
    { offset: 100, width: 18, color: '#00EEBB', alpha: 0.55 },
    { offset: 122, width: 10, color: '#FF6600', alpha: 0.40 },
  ];
  ctx.save();
  ctx.beginPath(); ctx.rect(W - BAND, 0, BAND, H); ctx.clip();
  for (const l of rightLines) {
    ctx.globalAlpha = l.alpha;
    ctx.strokeStyle = l.color; ctx.lineWidth = l.width;
    const dx = 0.42 * H;
    const bx = W - l.offset;
    ctx.beginPath(); ctx.moveTo(bx + dx, H + 20); ctx.lineTo(bx - dx, -20); ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1;
}

// ─── Portrait background + header helper ─────────────────────────────────────
function drawPortraitBg(ctx, W, H) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#180003');
  bg.addColorStop(0.5, '#120002');
  bg.addColorStop(1, '#0A0001');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  drawRedStripes(ctx, W, H);
}

function drawPortraitHeader(ctx, W, titleText, subtitleText, titleY = 148, subY = 204) {
  ctx.textAlign = 'center';
  ctx.fillStyle = C.title;
  ctx.font = 'bold italic 100px "DejaVu Sans", Arial, sans-serif';
  ctx.fillText(titleText, W / 2, titleY);
  ctx.fillStyle = C.sub;
  ctx.font = 'bold 23px "DejaVu Sans", Arial, sans-serif';
  ctx.fillText(subtitleText, W / 2, subY);
  ctx.strokeStyle = 'rgba(200,50,50,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(180, subY + 26);
  ctx.lineTo(W - 180, subY + 26);
  ctx.stroke();
}

// ─── 1. Schedule image — dark red portrait 1080px ────────────────────────────
// ─── fitText: auto-size font to fit within maxWidth ───────────────────────────
function fitText(ctx, text, maxWidth, maxSize, minSize = 10, weight = 'bold') {
  for (let sz = maxSize; sz >= minSize; sz -= 1) {
    ctx.font = `${weight} ${sz}px "DejaVu Sans", Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) return sz;
  }
  return minSize;
}

// ─── drawTeamLogoAsync: real logo clipped inside shield, fallback crest ───────
async function drawTeamLogoAsync(ctx, cx, cy, rw, rh, team, isWinner) {
  if (team && team.logo_url) {
    try {
      const img = await loadImage(team.logo_url);
      ctx.save();
      if (isWinner) {
        const glow = ctx.createRadialGradient(cx, cy, rw * 0.2, cx, cy, rw * 2.0);
        glow.addColorStop(0, 'rgba(255,215,0,0.55)');
        glow.addColorStop(1, 'rgba(255,215,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(cx, cy, rw * 2.0, 0, Math.PI * 2); ctx.fill();
      }
      // Draw shield background
      crestPath(ctx, cx, cy, rw, rh);
      ctx.fillStyle = '#111'; ctx.fill();
      // Clip logo inside shield
      crestPath(ctx, cx, cy, rw, rh); ctx.clip();
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
      const scale = Math.min((rw * 1.85) / img.width, (rh * 1.85) / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      ctx.restore();
      // Shield border
      crestPath(ctx, cx, cy, rw, rh);
      ctx.strokeStyle = isWinner ? '#FFD700' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = Math.max(2, rw * 0.06); ctx.stroke();
      return;
    } catch (_) {}
  }
  drawCrest(ctx, cx, cy, rw, rh, team, isWinner);
}

// ─── 1. Schedule image ────────────────────────────────────────────────────────
async function generateScheduleImage(roundNum, totalRounds, matchesByGroup, teams, tournament) {
  const getTeam = id => (Array.isArray(teams) ? teams.find(t => t.id === id) : teams[id]) || { name: 'TBD', short_name: 'TBD' };
  const allMatches = [];
  for (const [, ms] of Object.entries(matchesByGroup).sort()) for (const m of ms) allMatches.push(m);

  const W = 1080;
  const HDR_H = 274;
  const FOOT_H = 72;
  const BAND = 210;
  const n = allMatches.length || 1;

  // Row height auto-adapts: taller rows for fewer matches, shorter for many
  const ROW_H = n <= 2 ? 160 : n <= 4 ? 138 : n <= 6 ? 118 : n <= 8 ? 100 : 88;
  const LOGO_R = Math.round(ROW_H * 0.30); // logo radius (used as rw)
  const LOGO_RH = Math.round(ROW_H * 0.36);
  const H = HDR_H + n * ROW_H + FOOT_H + 16;

  // Dark inner panel — sits flush inside the stripe bands
  const panelX = BAND + 8, panelW = W - (BAND + 8) * 2;
  const panelY = HDR_H - 10;
  const panelH = n * ROW_H + 20;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  drawPortraitBg(ctx, W, H);
  drawPortraitHeader(ctx, W, 'SCHEDULE',
    'ROUND ' + roundNum + ' OF ' + totalRounds + '  —  ' + tournament.name.toUpperCase());

  // Dark red inner panel
  rr(ctx, panelX, panelY, panelW, panelH, 18, 'rgba(12,0,3,0.92)');
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(panelX + 18, panelY);
  ctx.arcTo(panelX + panelW, panelY, panelX + panelW, panelY + panelH, 18);
  ctx.arcTo(panelX + panelW, panelY + panelH, panelX, panelY + panelH, 18);
  ctx.arcTo(panelX, panelY + panelH, panelX, panelY, 18);
  ctx.arcTo(panelX, panelY, panelX + panelW, panelY, 18);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(160,30,30,0.55)';
  ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  const MID_X = W / 2;
  const VS_BOX_W = 72;
  // Each team side: logo center distance from MID_X
  const LOGO_OFF = Math.round(panelW * 0.28); // distance from center to logo center

  for (let i = 0; i < allMatches.length; i++) {
    const m    = allMatches[i];
    const home = getTeam(m.home_team_id);
    const away = getTeam(m.away_team_id);
    const rowY = panelY + i * ROW_H;
    const midY = rowY + ROW_H / 2;

    // Alternating row tint
    if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(40,0,8,0.55)';
      ctx.fillRect(panelX + 2, rowY, panelW - 4, ROW_H);
    }

    // Group label
    if (m.group_name) {
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.font = "bold 10px 'DejaVu Sans', Arial, sans-serif";
      ctx.textAlign = 'left';
      ctx.fillText('GRP ' + m.group_name, panelX + 12, rowY + 14);
    }

    const homeCX = MID_X - LOGO_OFF;
    const awayCX = MID_X + LOGO_OFF;

    // Draw logos
    await drawTeamLogoAsync(ctx, homeCX, midY, LOGO_R, LOGO_RH, home, false);
    await drawTeamLogoAsync(ctx, awayCX, midY, LOGO_R, LOGO_RH, away, false);

    // Home name — right-aligned between panel left and logo left edge, inside panel
    const homeNameRight = homeCX - LOGO_R - 10;
    const homeNameLeft  = panelX + 10;
    const homeMaxW = homeNameRight - homeNameLeft;
    const homeName = (home.name || 'TBD').toUpperCase();
    const homeFS = fitText(ctx, homeName, homeMaxW, ROW_H <= 100 ? 17 : 22, 11);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${homeFS}px "DejaVu Sans", Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(homeName, homeNameRight, midY + homeFS * 0.36);

    // VS
    const vsFS = Math.round(ROW_H * 0.24);
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.font = `bold ${vsFS}px "DejaVu Sans", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('VS', MID_X, midY + vsFS * 0.38);

    // Away name — left-aligned between logo right edge and panel right, inside panel
    const awayNameLeft  = awayCX + LOGO_R + 10;
    const awayNameRight = panelX + panelW - 10;
    const awayMaxW = awayNameRight - awayNameLeft;
    const awayName = (away.name || 'TBD').toUpperCase();
    const awayFS = fitText(ctx, awayName, awayMaxW, ROW_H <= 100 ? 17 : 22, 11);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${awayFS}px "DejaVu Sans", Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(awayName, awayNameLeft, midY + awayFS * 0.36);

    // Row divider
    if (i < allMatches.length - 1) {
      ctx.strokeStyle = 'rgba(160,30,30,0.28)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(panelX + 20, rowY + ROW_H); ctx.lineTo(panelX + panelW - 20, rowY + ROW_H); ctx.stroke();
    }
  }

  // Footer
  ctx.fillStyle = '#AAAAAA';
  ctx.font = "14px 'DejaVu Sans', Arial, sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText('Night Stars  —  ' + tournament.name, W / 2, panelY + panelH + 40);
  ctx.fillStyle = '#8B0000';
  ctx.fillRect(0, H - 8, W, 8);
  return canvas.toBuffer('image/png');
}

// ─── 2. Result image ──────────────────────────────────────────────────────────
async function generateResultImage(match, homeTeam, awayTeam, tournament) {
  const hs = match.home_score, as_ = match.away_score;
  const homeWon = hs > as_, awayWon = as_ > hs, draw = hs === as_;

  const W = 1080, H = 1350;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawPortraitBg(ctx, W, H);

  // ── Header (outside panel) ──────────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.fillStyle = C.title;
  ctx.font = 'bold italic 108px "DejaVu Sans", Arial, sans-serif';
  ctx.fillText('RESULTS', W / 2, 152);

  const sl = match.stage === 'group'
    ? `GROUP ${match.group_name}  —  ROUND ${match.round}  —  ${tournament.name.toUpperCase()}`
    : `${(match.stage || '').toUpperCase()}  —  ${tournament.name.toUpperCase()}`;
  ctx.fillStyle = C.sub;
  ctx.font = 'bold 22px "DejaVu Sans", Arial, sans-serif';
  ctx.fillText(sl, W / 2, 206);
  ctx.strokeStyle = 'rgba(200,50,50,0.45)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(180, 232); ctx.lineTo(W - 180, 232); ctx.stroke();

  // ── Dark red inner panel ────────────────────────────────────────────────────
  const PX = 55, PY = 248, PW = W - PX * 2;
  const PH = 960;  // panel height — content fills this
  rr(ctx, PX, PY, PW, PH, 22, 'rgba(12,0,3,0.93)');
  ctx.strokeStyle = 'rgba(160,30,30,0.60)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PX + 22, PY);
  ctx.arcTo(PX + PW, PY, PX + PW, PY + PH, 22);
  ctx.arcTo(PX + PW, PY + PH, PX, PY + PH, 22);
  ctx.arcTo(PX, PY + PH, PX, PY, 22);
  ctx.arcTo(PX, PY, PX + PW, PY, 22);
  ctx.closePath(); ctx.stroke();

  // FULL TIME label inside panel
  ctx.fillStyle = 'rgba(200,200,200,0.70)';
  ctx.font = 'bold 20px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FULL TIME', W / 2, PY + 42);

  // ── Crests & team names — fully inside panel ────────────────────────────────
  const CREST_Y = PY + 260;  // vertical center of crests
  const CRW = 108, CRH = 128;
  const MID_X = W / 2;
  // Home on left half, away on right half — each crest centered in its half
  const HOME_CX = PX + PW / 4;   // e.g. 55 + 242 = 297
  const AWAY_CX = PX + (PW * 3 / 4);  // e.g. 55 + 727 = 782

  // Winner glow above crest
  if (homeWon) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 15px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★  WINNER  ★', HOME_CX, CREST_Y - CRH - 24);
  }
  if (awayWon) {
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 15px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★  WINNER  ★', AWAY_CX, CREST_Y - CRH - 24);
  }

  await drawTeamLogoAsync(ctx, HOME_CX, CREST_Y, CRW, CRH, homeTeam, homeWon);
  await drawTeamLogoAsync(ctx, AWAY_CX, CREST_Y, CRW, CRH, awayTeam, awayWon);

  // Team names below crests — centered in each half, inside panel
  const NAME_Y = CREST_Y + CRH + 36;
  const halfW = PW / 2 - 20;  // max name width per side

  const homeName = (homeTeam.name || 'HOME').toUpperCase();
  const homeFS = fitText(ctx, homeName, halfW, 34, 16);
  ctx.fillStyle = homeWon ? '#FFFFFF' : 'rgba(210,210,210,0.85)';
  ctx.font = `bold ${homeFS}px "DejaVu Sans", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(homeName, HOME_CX, NAME_Y);

  const awayName = (awayTeam.name || 'AWAY').toUpperCase();
  const awayFS = fitText(ctx, awayName, halfW, 34, 16);
  ctx.fillStyle = awayWon ? '#FFFFFF' : 'rgba(210,210,210,0.85)';
  ctx.font = `bold ${awayFS}px "DejaVu Sans", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(awayName, AWAY_CX, NAME_Y);

  // ── Score box — centered between crests ──────────────────────────────────
  const scoreStr = `${hs}  –  ${as_}`;
  const scoreFS = scoreStr.length <= 7 ? 88 : 70;
  const boxW = 260, boxH = scoreFS + 44;
  const boxX = MID_X - boxW / 2, boxY = CREST_Y - boxH / 2;
  rr(ctx, boxX, boxY, boxW, boxH, 18, 'rgba(100,0,0,0.65)');
  ctx.strokeStyle = 'rgba(200,50,50,0.50)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(boxX + 18, boxY);
  ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, 18);
  ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, 18);
  ctx.arcTo(boxX, boxY + boxH, boxX, boxY, 18);
  ctx.arcTo(boxX, boxY, boxX + boxW, boxY, 18);
  ctx.closePath(); ctx.stroke();

  ctx.fillStyle = C.score;
  ctx.font = `bold ${scoreFS}px "DejaVu Sans", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(scoreStr, MID_X, boxY + boxH * 0.68);

  // ── Outcome section inside panel ─────────────────────────────────────────
  const divY = NAME_Y + 50;
  ctx.strokeStyle = 'rgba(200,50,50,0.28)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PX + 40, divY); ctx.lineTo(PX + PW - 40, divY); ctx.stroke();

  if (!draw) {
    const winnerName = homeWon ? homeTeam.name : awayTeam.name;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`★  ${winnerName.toUpperCase()}  WINS  ★`, MID_X, divY + 52);
  } else {
    ctx.fillStyle = C.draw;
    ctx.font = 'bold 28px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MATCH DRAWN', MID_X, divY + 52);
  }

  // Stage pill
  const pillY = divY + 84;
  rr(ctx, MID_X - 260, pillY, 520, 52, 12, 'rgba(100,0,0,0.35)');
  ctx.fillStyle = C.textSub;
  ctx.font = '19px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  const stageLabel = match.stage === 'group'
    ? `Group Stage  —  Round ${match.round}`
    : (match.stage || 'Knockout Stage');
  ctx.fillText(stageLabel, MID_X, pillY + 34);

  // Footer
  ctx.fillStyle = C.textMid;
  ctx.font = '17px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${tournament.name}  —  Night Stars`, MID_X, H - 48);
  ctx.fillStyle = '#8B0000';
  ctx.fillRect(0, H - 10, W, 10);

  return canvas.toBuffer('image/png');
}

// ─── 3 → 5. Knockout / Roster (unchanged wrappers) ───────────────────────────
// ─── 5. Standings image ───────────────────────────────────────────────────────
function generateStandingsImage(tournament, groupedStandings) {
  const groupEntries = Object.entries(groupedStandings).sort();
  const numGroups = groupEntries.length;

  const W = 1080;
  const BAND = 170;
  const PAD  = 20;
  const GRP_GAP = 18;

  // Auto columns: 1 col for ≤2 groups, 2 cols otherwise
  const PER_ROW = numGroups <= 2 ? 1 : 2;
  const GRP_W = PER_ROW === 1
    ? W - BAND * 2 - PAD * 2          // single wide card
    : Math.floor((W - BAND * 2 - PAD * 2 - GRP_GAP) / 2);

  const HDR_H  = 274;
  const GRP_HDR = 62;
  const COL_HDR = 34;
  const ROW_H   = 72;
  const FOOT_H  = 72;

  const maxTeams = Math.max(...groupEntries.map(([, g]) => g.length));
  const numRows  = Math.ceil(numGroups / PER_ROW);
  const grpH     = GRP_HDR + COL_HDR + maxTeams * ROW_H + 16;
  const H        = HDR_H + numRows * (grpH + GRP_GAP) + FOOT_H + PAD;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawPortraitBg(ctx, W, H);
  drawPortraitHeader(ctx, W, 'STANDINGS',
    tournament.name.toUpperCase() + '  —  GROUP STAGE');

  ctx.fillStyle = C.textMid;
  ctx.font = '15px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Top 2 from each group advance to Knockout Stage', W / 2, 252);

  const startX = BAND + PAD;

  // Stat columns: offsets from gx, right-aligned within GRP_W
  const SX = {
    P:   GRP_W - 218,
    W:   GRP_W - 180,
    D:   GRP_W - 142,
    L:   GRP_W - 104,
    GD:  GRP_W - 60,
    PTS: GRP_W - 14,
  };
  // Name column: from dot end (gx+52) to first stat (gx + SX.P - 6)
  const NAME_MAX_X = SX.P - 10;  // relative to gx

  let rowIdx = 0, colIdx = 0;
  for (const [groupName, gTeams] of groupEntries) {
    const gx = startX + colIdx * (GRP_W + GRP_GAP);
    const gy = HDR_H + rowIdx * (grpH + GRP_GAP) + PAD;

    // ── Group card ──────────────────────────────────────────────────────────
    rr(ctx, gx, gy, GRP_W, grpH, 16, 'rgba(12,0,3,0.92)');
    ctx.strokeStyle = 'rgba(160,30,30,0.50)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gx + 16, gy);
    ctx.arcTo(gx + GRP_W, gy, gx + GRP_W, gy + grpH, 16);
    ctx.arcTo(gx + GRP_W, gy + grpH, gx, gy + grpH, 16);
    ctx.arcTo(gx, gy + grpH, gx, gy, 16);
    ctx.arcTo(gx, gy, gx + GRP_W, gy, 16);
    ctx.closePath(); ctx.stroke();

    // Group header bar
    rr(ctx, gx, gy, GRP_W, GRP_HDR, 16, C.cardAlt);
    ctx.fillStyle = C.cardAlt;
    ctx.fillRect(gx, gy + GRP_HDR - 16, GRP_W, 16);
    // Red left accent
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(gx, gy, 4, GRP_HDR);

    ctx.fillStyle = C.title;
    ctx.font = 'bold 22px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`GROUP ${groupName}`, gx + GRP_W / 2, gy + GRP_HDR / 2 + 8);

    // Column headers
    const hY = gy + GRP_HDR + COL_HDR - 8;
    ctx.fillStyle = C.textMid;
    ctx.font = 'bold 11px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TEAM', gx + 52, hY);
    for (const [k, ox] of Object.entries(SX)) {
      ctx.textAlign = 'center';
      ctx.fillText(k, gx + ox, hY);
    }
    ctx.strokeStyle = C.div; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx + 2, hY + 6); ctx.lineTo(gx + GRP_W - 2, hY + 6); ctx.stroke();

    gTeams.forEach((team, i) => {
      const qualified = i < 2;
      const ry = gy + GRP_HDR + COL_HDR + i * ROW_H;

      // Row bg
      ctx.fillStyle = qualified ? 'rgba(139,0,0,0.22)' : 'transparent';
      ctx.fillRect(gx + 2, ry, GRP_W - 4, ROW_H - 1);

      // Left bar
      ctx.fillStyle = qualified ? C.win : C.loss;
      ctx.fillRect(gx + 2, ry, 3, ROW_H - 1);

      // Rank
      ctx.fillStyle = qualified ? C.win : C.textMid;
      ctx.font = 'bold 14px "DejaVu Sans", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), gx + 14, ry + ROW_H / 2 + 5);

      // Dot
      dot(ctx, gx + 30, ry + ROW_H / 2, 13, team.name);

      // Team name — auto-sized to fit available width
      const nameAreaW = NAME_MAX_X - 54;  // from gx+54 to gx+NAME_MAX_X
      const fullName  = (team.name || 'TBD').toUpperCase();
      const nameFS    = fitText(ctx, fullName, nameAreaW, qualified ? 15 : 14, 9, qualified ? 'bold' : '');
      ctx.fillStyle   = qualified ? C.title : C.textSub;
      ctx.font        = `${qualified ? 'bold ' : ''}${nameFS}px "DejaVu Sans", Arial, sans-serif`;
      ctx.textAlign   = 'left';
      ctx.fillText(fullName, gx + 52, ry + ROW_H / 2 + 5);

      // Stats
      const gd  = (team.goals_for || 0) - (team.goals_against || 0);
      const mp  = (team.wins || 0) + (team.draws || 0) + (team.losses || 0);
      const stats = {
        P:   mp,
        W:   team.wins   || 0,
        D:   team.draws  || 0,
        L:   team.losses || 0,
        GD:  (gd >= 0 ? '+' : '') + gd,
        PTS: team.points || 0,
      };
      for (const [k, ox] of Object.entries(SX)) {
        ctx.fillStyle = k === 'PTS' ? (qualified ? C.win : C.title) : C.textSub;
        ctx.font      = k === 'PTS' ? 'bold 15px "DejaVu Sans", Arial, sans-serif' : '12px "DejaVu Sans", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(stats[k]), gx + ox, ry + ROW_H / 2 + 5);
      }

      if (i < gTeams.length - 1) {
        ctx.strokeStyle = C.div; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(gx + 8, ry + ROW_H - 1); ctx.lineTo(gx + GRP_W - 8, ry + ROW_H - 1); ctx.stroke();
      }
    });

    colIdx++;
    if (colIdx >= PER_ROW) { colIdx = 0; rowIdx++; }
  }

  ctx.fillStyle = C.textMid;
  ctx.font = '15px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Night Stars  —  ' + tournament.name, W / 2, H - 36);
  ctx.fillStyle = '#8B0000';
  ctx.fillRect(0, H - 10, W, 10);

  return canvas.toBuffer('image/png');
}

function generateKnockoutBracket(tournament, matches, teams) {
  const getTeam = id => teams.find(t => t.id === id) || { name: 'TBD', short_name: '???' };
  const roundMap = {};
  for (const m of matches) { if (!roundMap[m.round]) roundMap[m.round] = []; roundMap[m.round].push(m); }
  const roundNums = Object.keys(roundMap).map(Number).sort((a, b) => b - a);
  if (!roundNums.length) return null;

  const CARD_W = 270, TEAM_H = 46, MATCH_H = TEAM_H * 2, COL_GAP = 80, PAD = 36, HDR_H = 70, FOOTER_H = 28;
  const firstCount = roundMap[roundNums[0]].length;
  const MATCH_GAP  = 20;
  const firstColH  = firstCount * MATCH_H + (firstCount - 1) * MATCH_GAP;
  const W = PAD * 2 + roundNums.length * CARD_W + (roundNums.length - 1) * COL_GAP;
  const H = HDR_H + PAD + firstColH + PAD + FOOTER_H;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bgK = { bg: '#1E1F22', card: '#2B2D31', border: '#3F4147', text: '#FFFFFF', textSub: '#B5BAC1', textMid: '#80848E', gold: '#F1C40F', win: '#57F287' };
  ctx.fillStyle = bgK.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = bgK.gold; ctx.fillRect(0, 0, W, 4);
  ctx.fillStyle = bgK.text; ctx.font = 'bold 20px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.fillText(tournament.name + '  —  Knockout Stage', W / 2, 34);
  ctx.fillStyle = bgK.textSub; ctx.font = '13px "DejaVu Sans", Arial, sans-serif'; ctx.fillText('Bracket', W / 2, 54);

  const LABELS = { 1: 'FINAL', 2: 'SEMI-FINALS', 4: 'QUARTER-FINALS', 8: 'ROUND OF 16' };
  const posMap = {};
  roundNums.forEach((rn, ci) => {
    const cms = roundMap[rn], cnt = cms.length;
    const cx = PAD + ci * (CARD_W + COL_GAP);
    ctx.fillStyle = bgK.textMid; ctx.font = 'bold 10px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(LABELS[cnt] || 'ROUND ' + rn, cx + CARD_W / 2, HDR_H + 14);
    posMap[rn] = [];
    cms.forEach((match, mi) => {
      const spacing = firstColH / cnt;
      const cy = HDR_H + PAD + mi * spacing + spacing / 2;
      const cardY = cy - MATCH_H / 2;
      posMap[rn].push({ x: cx, cy, match });
      const home = getTeam(match.home_team_id), away = getTeam(match.away_team_id);
      const played = match.status === 'played';
      const hWon = played && match.home_score > match.away_score;
      const aWon = played && match.away_score > match.home_score;
      rr(ctx, cx, cardY, CARD_W, MATCH_H, 10, bgK.card, bgK.border, 1);
      ctx.strokeStyle = bgK.border; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + 1, cardY + TEAM_H); ctx.lineTo(cx + CARD_W - 1, cardY + TEAM_H); ctx.stroke();
      _teamRow(ctx, cx, cardY, CARD_W, TEAM_H, home, hWon, played ? match.home_score : null, bgK);
      _teamRow(ctx, cx, cardY + TEAM_H, CARD_W, TEAM_H, away, aWon, played ? match.away_score : null, bgK);
      if (!played) {
        ctx.fillStyle = bgK.textMid; ctx.font = 'italic 10px "DejaVu Sans", Arial, sans-serif';
        ctx.textAlign = 'right'; ctx.fillText('No result', cx + CARD_W - 8, cardY + TEAM_H - 3);
      }
    });
  });

  roundNums.forEach((rn, ci) => {
    if (ci === roundNums.length - 1) return;
    const nrn = roundNums[ci + 1], cur = posMap[rn], nxt = posMap[nrn];
    nxt.forEach((np, ni) => {
      const m1 = cur[ni * 2], m2 = cur[ni * 2 + 1];
      if (!m1 || !m2) return;
      const rx = m1.x + CARD_W, mx = rx + COL_GAP / 2;
      ctx.strokeStyle = '#FFF'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(rx, m1.cy); ctx.lineTo(mx, m1.cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx, m2.cy); ctx.lineTo(mx, m2.cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, m1.cy); ctx.lineTo(mx, m2.cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, np.cy); ctx.lineTo(np.x, np.cy); ctx.stroke();
    });
  });

  ctx.fillStyle = bgK.textMid; ctx.font = '11px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('Night Stars', W / 2, H - 8);
  return canvas.toBuffer('image/png');
}

function _teamRow(ctx, x, y, w, h, team, isWin, score, colors) {
  const DR = 12, DX = x + 18 + DR, DY = y + h / 2;
  if (isWin) rr(ctx, x + 1, y, w - 2, h, 0, '#152015');
  dot(ctx, DX, DY, DR, team.name);
  ctx.fillStyle = isWin ? (colors ? colors.win : C.win) : (colors ? colors.text : C.text);
  ctx.font = `${isWin ? 'bold ' : ''}13px "DejaVu Sans", Arial, sans-serif`;
  ctx.textAlign = 'left'; ctx.fillText((team.name || 'TBD').slice(0, 18), x + 46, DY + 5);
  if (score !== null && score !== undefined) {
    ctx.fillStyle = isWin ? (colors ? colors.win : C.win) : (colors ? colors.textSub : C.textSub);
    ctx.font = 'bold 15px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'right'; ctx.fillText(String(score), x + w - 12, DY + 5);
  }
}

// ─── 4. Roster image (unchanged style) ────────────────────────────────────────
function generateRosterImage(tournament, groupedRoster) {
  const groupEntries = Object.entries(groupedRoster).sort();
  const maxPerGroup  = Math.max(...groupEntries.map(([, g]) => g.length), 1);

  const W = 860, PAD_X = 30, CARD_GAP = 14;
  const CARD_W = Math.floor((W - PAD_X * 2 - CARD_GAP) / 2);
  const TEAM_H = 58, CARD_PAD = 12;
  const GRP_HDR_H = 46;
  const CARD_H = GRP_HDR_H + maxPerGroup * TEAM_H + CARD_PAD;
  const ROW_GAP = 14, HDR_H = 148, FOOT_H = 40;
  const numRows = Math.ceil(groupEntries.length / 2);
  const H = HDR_H + numRows * (CARD_H + ROW_GAP) - ROW_GAP + FOOT_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.uclBg; ctx.fillRect(0, 0, W, H);
  drawUCLDecoration(ctx, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = C.uclTitle; ctx.font = 'bold italic 56px "DejaVu Sans", Arial, sans-serif';
  ctx.fillText('ROSTER', W / 2, 70);
  ctx.fillStyle = C.uclSub; ctx.font = 'bold 16px "DejaVu Sans", Arial, sans-serif';
  ctx.fillText(tournament.name.toUpperCase() + '  —  GROUP STAGE', W / 2, 104);
  ctx.strokeStyle = C.uclDiv; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD_X + 40, 122); ctx.lineTo(W - PAD_X - 40, 122); ctx.stroke();

  groupEntries.forEach(([groupName, gTeams], idx) => {
    const col = idx % 2, row = Math.floor(idx / 2);
    const cx = PAD_X + col * (CARD_W + CARD_GAP);
    const cy = HDR_H + row * (CARD_H + ROW_GAP);
    rr(ctx, cx, cy, CARD_W, CARD_H, 12, C.uclCard);
    rr(ctx, cx, cy, CARD_W, GRP_HDR_H, 12, C.uclCardAlt);
    ctx.fillStyle = C.uclCardAlt; ctx.fillRect(cx, cy + GRP_HDR_H - 12, CARD_W, 12);
    ctx.fillStyle = C.uclTitle; ctx.font = 'bold 18px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(`GROUP ${groupName}`, cx + CARD_W / 2, cy + GRP_HDR_H / 2 + 6);
    ctx.strokeStyle = C.uclDiv; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + 16, cy + GRP_HDR_H); ctx.lineTo(cx + CARD_W - 16, cy + GRP_HDR_H); ctx.stroke();

    gTeams.forEach((entry, ti) => {
      const ty = cy + GRP_HDR_H + ti * TEAM_H;
      const midY = ty + TEAM_H / 2;
      const DOT_R = 16, DOT_X = cx + 18 + DOT_R;
      if (ti % 2 === 1) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(cx + 1, ty, CARD_W - 2, TEAM_H); }
      ctx.fillStyle = teamColor(entry.team.name);
      ctx.beginPath(); ctx.arc(DOT_X, midY, DOT_R, 0, Math.PI * 2); ctx.fill();
      const lbl = entry.team.emoji && !entry.team.emoji.startsWith('<') ? entry.team.emoji : (entry.team.name[0] || '?').toUpperCase();
      ctx.fillStyle = '#FFF'; ctx.font = `bold 14px "DejaVu Sans", Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.fillText(lbl, DOT_X, midY + 5);
      ctx.fillStyle = C.uclTitle; ctx.font = 'bold 14px "DejaVu Sans", Arial, sans-serif';
      ctx.textAlign = 'left'; ctx.fillText((entry.team.name || 'TBD').slice(0, 18), DOT_X + DOT_R + 10, midY - 3);
      if (entry.players && entry.players.length) {
        ctx.fillStyle = C.uclSub; ctx.font = '11px "DejaVu Sans", Arial, sans-serif';
        ctx.fillText(entry.players.map(p => p.discord_username || 'Unknown').join(' · ').slice(0, 32), DOT_X + DOT_R + 10, midY + 12);
      }
      if (ti < gTeams.length - 1) {
        ctx.strokeStyle = C.uclDiv; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx + 12, ty + TEAM_H); ctx.lineTo(cx + CARD_W - 12, ty + TEAM_H); ctx.stroke();
      }
    });
  });

  ctx.fillStyle = C.uclSub; ctx.font = '13px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.fillText(`Night Stars  —  ${tournament.name}`, W / 2, H - 14);
  return canvas.toBuffer('image/png');
}

// ─── 5. Standings image — dark red portrait 1080px ───────────────────────────
function generateStandingsImage(tournament, groupedStandings) {
  const groupEntries = Object.entries(groupedStandings).sort();
  const PER_ROW = 2;
  const W = 1080;
  const BAND = 180;           // reduced from 210 → wider group cards
  const PAD = 24;
  const GRP_GAP = 20;
  const GRP_W = Math.floor((W - BAND * 2 - PAD * 2 - GRP_GAP) / PER_ROW); // 326
  const HDR_H = 274;
  const GRP_HDR = 64;         // increased from 48
  const COL_HDR = 36;         // increased from 28
  const ROW_H = 76;           // increased from 58
  const FOOT_H = 80;
  const maxTeams = Math.max(...groupEntries.map(([, g]) => g.length));
  const numRows = Math.ceil(groupEntries.length / PER_ROW);
  const grpH = GRP_HDR + COL_HDR + maxTeams * ROW_H + 24;
  // Fit content exactly — no arbitrary 1350 minimum
  const H = HDR_H + numRows * (grpH + GRP_GAP) + FOOT_H + PAD;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawPortraitBg(ctx, W, H);
  drawPortraitHeader(ctx, W, 'STANDINGS',
    tournament.name.toUpperCase() + '  —  GROUP STAGE');

  const startX = BAND + PAD;

  ctx.fillStyle = C.textMid;
  ctx.font = '16px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Top 2 from each group advance to Knockout Stage', W / 2, 252);

  // Column header X offsets relative to gx (GRP_W=326)
  const SX = { P: GRP_W-196, W: GRP_W-160, D: GRP_W-124, L: GRP_W-88, GD: GRP_W-48, PTS: GRP_W-10 };

  let rowIdx = 0, colIdx = 0;
  for (const [groupName, gTeams] of groupEntries) {
    const gx = startX + colIdx * (GRP_W + GRP_GAP);
    const gy = HDR_H + rowIdx * (grpH + GRP_GAP) + PAD;

    // Group card bg
    rr(ctx, gx, gy, GRP_W, grpH, 14, C.card);

    // Group header bar
    rr(ctx, gx, gy, GRP_W, GRP_HDR, 14, C.cardAlt);
    ctx.fillStyle = C.cardAlt;
    ctx.fillRect(gx, gy + GRP_HDR - 14, GRP_W, 14);

    // Red left accent
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(gx, gy, 4, GRP_HDR);

    ctx.fillStyle = C.title;
    ctx.font = 'bold 22px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`GROUP ${groupName}`, gx + GRP_W / 2, gy + GRP_HDR / 2 + 8);

    // Column headers
    const hY = gy + GRP_HDR + COL_HDR - 8;
    ctx.fillStyle = C.textMid;
    ctx.font = 'bold 11px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TEAM', gx + 52, hY);
    for (const [k, ox] of Object.entries(SX)) {
      ctx.textAlign = 'center';
      ctx.fillText(k, gx + ox, hY);
    }
    ctx.strokeStyle = C.div; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx + 2, hY + 6); ctx.lineTo(gx + GRP_W - 2, hY + 6); ctx.stroke();

    gTeams.forEach((team, i) => {
      const qualified = i < 2;
      const ry = gy + GRP_HDR + COL_HDR + i * ROW_H;

      // Row bg
      ctx.fillStyle = qualified ? 'rgba(139,0,0,0.22)' : 'rgba(0,0,0,0.0)';
      ctx.fillRect(gx + 2, ry, GRP_W - 4, ROW_H - 1);

      // Left qualification bar
      ctx.fillStyle = qualified ? C.win : C.loss;
      ctx.fillRect(gx + 2, ry, 3, ROW_H - 1);

      // Rank number
      ctx.fillStyle = qualified ? C.win : C.textMid;
      ctx.font = 'bold 14px "DejaVu Sans", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), gx + 14, ry + ROW_H / 2 + 5);

      // Team dot (initial circle)
      dot(ctx, gx + 30, ry + ROW_H / 2, 14, team.name);

      // Team name — truncated to fit before first stat column
      const nameMaxChars = 12;
      ctx.fillStyle = qualified ? C.title : C.textSub;
      ctx.font = `${qualified ? 'bold ' : ''}13px "DejaVu Sans", Arial, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText((team.name || 'TBD').slice(0, nameMaxChars), gx + 50, ry + ROW_H / 2 + 5);

      // Stats
      const gd = (team.goals_for || 0) - (team.goals_against || 0);
      const mp = (team.wins || 0) + (team.draws || 0) + (team.losses || 0);
      const stats = {
        P: mp,
        W: team.wins || 0,
        D: team.draws || 0,
        L: team.losses || 0,
        GD: (gd >= 0 ? '+' : '') + gd,
        PTS: team.points || 0,
      };
      for (const [k, ox] of Object.entries(SX)) {
        ctx.fillStyle = k === 'PTS' ? (qualified ? C.win : C.title) : C.textSub;
        ctx.font = k === 'PTS' ? 'bold 16px "DejaVu Sans", Arial, sans-serif' : '12px "DejaVu Sans", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(stats[k]), gx + ox, ry + ROW_H / 2 + 5);
      }

      // Row divider
      if (i < gTeams.length - 1) {
        ctx.strokeStyle = C.div; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(gx + 8, ry + ROW_H - 1); ctx.lineTo(gx + GRP_W - 8, ry + ROW_H - 1); ctx.stroke();
      }
    });

    colIdx++;
    if (colIdx >= PER_ROW) { colIdx = 0; rowIdx++; }
  }

  // Footer
  ctx.fillStyle = C.textMid;
  ctx.font = '15px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Night Stars  —  ' + tournament.name, W / 2, H - 38);

  // Bottom accent
  ctx.fillStyle = '#8B0000';
  ctx.fillRect(0, H - 10, W, 10);

  return canvas.toBuffer('image/png');
}

// ─── 6. Group Draw image (unchanged UCL style) ───────────────────────────────
function generateGroupDrawImage(tournament, groupedTeams) {
  const groupEntries = Object.entries(groupedTeams).sort();
  const maxTeams     = Math.max(...groupEntries.map(([, g]) => g.length), 1);
  const W = 800, PAD_X = 30, CARD_GAP = 14;
  const CARD_W = Math.floor((W - PAD_X * 2 - CARD_GAP) / 2);
  const GRP_HDR_H = 52, TEAM_ROW_H = 54, CARD_PAD = 14;
  const CARD_H = GRP_HDR_H + maxTeams * TEAM_ROW_H + CARD_PAD;
  const ROW_GAP = 14, HDR_H = 148, FOOTER_H = 46;
  const numRows = Math.ceil(groupEntries.length / 2);
  const H = HDR_H + numRows * (CARD_H + ROW_GAP) - ROW_GAP + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = C.uclBg; ctx.fillRect(0, 0, W, H);
  drawUCLDecoration(ctx, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = C.uclTitle; ctx.font = 'bold italic 58px "DejaVu Sans", Arial, sans-serif';
  ctx.fillText('GROUP DRAW', W / 2, 72);
  ctx.fillStyle = C.uclSub; ctx.font = 'bold 17px "DejaVu Sans", Arial, sans-serif';
  ctx.fillText(tournament.name.toUpperCase() + '  —  GROUP STAGE', W / 2, 106);
  ctx.strokeStyle = C.uclDiv; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD_X + 40, 124); ctx.lineTo(W - PAD_X - 40, 124); ctx.stroke();

  groupEntries.forEach(([groupName, gTeams], idx) => {
    const col = idx % 2, row = Math.floor(idx / 2);
    const cx = PAD_X + col * (CARD_W + CARD_GAP);
    const cy = HDR_H + row * (CARD_H + ROW_GAP);
    rr(ctx, cx, cy, CARD_W, CARD_H, 12, C.uclCard);
    rr(ctx, cx, cy, CARD_W, GRP_HDR_H, 12, C.uclCardAlt);
    ctx.fillStyle = C.uclCardAlt; ctx.fillRect(cx, cy + GRP_HDR_H - 12, CARD_W, 12);
    ctx.fillStyle = C.uclTitle; ctx.font = 'bold 20px "DejaVu Sans", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.fillText(`GROUP ${groupName}`, cx + CARD_W / 2, cy + GRP_HDR_H / 2 + 7);
    ctx.strokeStyle = C.uclDiv; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx + 16, cy + GRP_HDR_H); ctx.lineTo(cx + CARD_W - 16, cy + GRP_HDR_H); ctx.stroke();

    gTeams.forEach((team, ti) => {
      const ty = cy + GRP_HDR_H + ti * TEAM_ROW_H;
      const midY = ty + TEAM_ROW_H / 2;
      const DOT_R = 18, DOT_X = cx + 22 + DOT_R;
      if (ti % 2 === 1) { ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(cx + 1, ty, CARD_W - 2, TEAM_ROW_H); }
      ctx.fillStyle = teamColor(team.name);
      ctx.beginPath(); ctx.arc(DOT_X, midY, DOT_R, 0, Math.PI * 2); ctx.fill();
      const label = team.emoji && !team.emoji.startsWith('<') ? team.emoji : (team.name[0] || '?').toUpperCase();
      ctx.fillStyle = '#FFF'; ctx.font = `bold ${team.emoji && !team.emoji.startsWith('<') ? 18 : 15}px "DejaVu Sans", Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.fillText(label, DOT_X, midY + 5);
      ctx.fillStyle = C.uclTitle; ctx.font = 'bold 15px "DejaVu Sans", Arial, sans-serif';
      ctx.textAlign = 'left'; ctx.fillText((team.name || 'TBD').slice(0, 20), DOT_X + DOT_R + 12, midY + 5);
      ctx.fillStyle = C.uclSub; ctx.font = '12px "DejaVu Sans", Arial, sans-serif';
      ctx.textAlign = 'right'; ctx.fillText(team.short_name || '', cx + CARD_W - 14, midY + 5);
      if (ti < gTeams.length - 1) {
        ctx.strokeStyle = C.uclDiv; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx + 12, ty + TEAM_ROW_H); ctx.lineTo(cx + CARD_W - 12, ty + TEAM_ROW_H); ctx.stroke();
      }
    });
  });

  ctx.fillStyle = C.uclSub; ctx.font = '13px "DejaVu Sans", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Night Stars  —  ${tournament.name}`, W / 2, H - FOOTER_H + 16);
  return canvas.toBuffer('image/png');
}

module.exports = {
  generateScheduleImage,
  generateResultImage,
  generateKnockoutBracket,
  generateRosterImage,
  generateStandingsImage,
  generateGroupDrawImage,
};
