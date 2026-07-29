'use strict';
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs   = require('fs');

const MEF_LOGO_PATH = path.join(__dirname, '../../assets/mef_logo.png');
const LOGO_24_PATH  = path.join(__dirname, '../../assets/logo_24.png');

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg1:       '#08080F',
  bg2:       '#0E0B1E',
  gold:      '#F0B429',
  purple:    '#6B2EFF',
  white:     '#FFFFFF',
  light:     '#C8C8DC',
  dim:       '#6A6A88',
  headerBg:  '#0B0816',
  rowOdd:    '#0E0E1B',
  rowEven:   '#121220',
  captainBg: '#14102A',
  border:    '#232038',
  footerBg:  '#060610',
};

// ── Canvas dimensions (1080×1500) ────────────────────────────────────────────
const W         = 1080;
const H         = 1500;
const MARGIN    = 30;
const HEADER_H  = 290;   // taller header — gives boxes room to breathe below text
const TBL_HDR_H = 52;
const FOOTER_H  = 62;
// TITLE_H removed — "OFFICIAL ROSTER" bar is gone
// ROW_H calculated dynamically from remaining space

// ── Columns (must sum to W=1080) ──────────────────────────────────────────────
const COLS = [
  { label: '#',             w: 56  },
  { label: 'PLAYER NAME',   w: 180 },
  { label: 'DISCORD USER',  w: 175 },
  { label: 'DEVICE',        w: 180 },
  { label: 'USER ID',       w: 195 },
  { label: 'SERIAL NUMBER', w: 294 },
];
// 56+180+175+180+195+294 = 1080 ✓

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (!text) return '';
  let t = String(text);
  while (ctx.measureText(t).width > maxWidth && t.length > 1) t = t.slice(0, -1);
  return t === text ? text : t + '…';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return date + '  ' + time;
}

// Draw a small Instagram icon (rounded square + circle + dot)
function drawInstagramIcon(ctx, x, y, size) {
  const r = size * 0.28;
  const grad = ctx.createLinearGradient(x, y + size, x + size, y);
  grad.addColorStop(0,   '#f09433');
  grad.addColorStop(0.25,'#e6683c');
  grad.addColorStop(0.5, '#dc2743');
  grad.addColorStop(0.75,'#cc2366');
  grad.addColorStop(1,   '#bc1888');
  ctx.fillStyle = grad;
  drawRoundedRect(ctx, x, y, size, size, r);
  ctx.fill();

  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = size * 0.11;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.26, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + size * 0.72, y + size * 0.28, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

// Draw an info box (label on top, value below)
function drawInfoBox(ctx, x, y, w, h, label, value) {
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  drawRoundedRect(ctx, x, y, w, h, 6);
  ctx.fill();

  ctx.strokeStyle = C.border;
  ctx.lineWidth   = 1;
  drawRoundedRect(ctx, x, y, w, h, 6);
  ctx.stroke();

  ctx.font      = 'bold 10px Arial';
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 12, y + 18);

  ctx.font      = 'bold 15px Arial';
  ctx.fillStyle = C.white;
  ctx.textAlign = 'left';
  ctx.fillText(fitText(ctx, String(value || '—'), w - 20), x + 12, y + 40);
}

async function generateRosterPng(roster, maxPlayers) {
  // No TITLE_H — rows get the extra 46px
  const rowsArea = H - HEADER_H - TBL_HDR_H - FOOTER_H;
  const ROW_H    = Math.floor(rowsArea / maxPlayers);

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background ────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bgGrad.addColorStop(0, C.bg1);
  bgGrad.addColorStop(1, C.bg2);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle purple glow top-right
  const radial = ctx.createRadialGradient(W, 0, 0, W, 0, 460);
  radial.addColorStop(0, 'rgba(107,46,255,0.13)');
  radial.addColorStop(1, 'rgba(107,46,255,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, W, HEADER_H);

  // Top gold accent stripe
  const topGold = ctx.createLinearGradient(0, 0, W, 0);
  topGold.addColorStop(0,   C.gold);
  topGold.addColorStop(0.5, '#FFD460');
  topGold.addColorStop(1,   C.gold);
  ctx.fillStyle = topGold;
  ctx.fillRect(0, 0, W, 4);

  // ── Load logos ────────────────────────────────────────────────────────────
  let logo24 = null, mefLogo = null, clanLogoImg = null;
  try { if (fs.existsSync(LOGO_24_PATH))  logo24      = await loadImage(LOGO_24_PATH);  } catch (_) {}
  try { if (fs.existsSync(MEF_LOGO_PATH)) mefLogo     = await loadImage(MEF_LOGO_PATH); } catch (_) {}
  if (roster.logo_url) {
    try { clanLogoImg = await loadImage(roster.logo_url); } catch (_) {}
  }

  // ── Logos — top right (MEF + 24) ─────────────────────────────────────────
  const logoRightEdge = W - MARGIN;
  const logoY         = 14;

  if (mefLogo) {
    const lh = 148, lw = mefLogo.width * (lh / mefLogo.height);
    ctx.drawImage(mefLogo, logoRightEdge - lw, logoY, lw, lh);
    if (logo24) {
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      ctx.fillRect(logoRightEdge - lw - 20, logoY + 18, 1, lh - 36);
    }
  }
  if (logo24) {
    const mefW = mefLogo ? (mefLogo.width * (148 / mefLogo.height)) : 0;
    const lh   = 110, lw = logo24.width * (lh / logo24.height);
    const x24  = logoRightEdge - (mefW > 0 ? mefW + 30 + lw : lw);
    ctx.drawImage(logo24, x24, logoY + 18, lw, lh);
  }

  // ── Clan logo — circle, top left ──────────────────────────────────────────
  const CLR  = 55;                       // radius — bigger to match reference
  const CLCX = MARGIN + CLR + 4;         // center x = 89
  const CLCY = 87;                       // center y — aligns with MEF/24 logos vertical center

  if (clanLogoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(CLCX, CLCY, CLR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(clanLogoImg, CLCX - CLR, CLCY - CLR, CLR * 2, CLR * 2);
    ctx.restore();
    // Gold ring
    ctx.strokeStyle = C.gold;
    ctx.lineWidth   = 2.5;
    ctx.beginPath();
    ctx.arc(CLCX, CLCY, CLR, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Placeholder ring
    ctx.strokeStyle = C.border;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(CLCX, CLCY, CLR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Clan text — right of circle ───────────────────────────────────────────
  const textX = CLCX + CLR + 18;   // ~162px from left

  // TOP: "MEF TEAM ROSTER" subtitle (small, gold)
  ctx.font      = 'bold 14px Arial';
  ctx.fillStyle = C.gold;
  ctx.textAlign = 'left';
  ctx.fillText('MEF TEAM ROSTER', textX, 51);

  // MIDDLE BIG: clan tag — matches reference where short tag is the hero text
  ctx.font      = 'bold 30px Arial';
  const tagText  = fitText(ctx, (roster.clan_tag || 'TAG').toUpperCase(), 420);
  ctx.fillStyle = C.white;
  ctx.fillText(tagText, textX, 87);

  // Gold underline under tag
  ctx.font = 'bold 30px Arial';
  const tagW     = Math.min(ctx.measureText(tagText).width, 400);
  const lineGrad = ctx.createLinearGradient(textX, 0, textX + tagW, 0);
  lineGrad.addColorStop(0, C.purple);
  lineGrad.addColorStop(1, 'rgba(107,46,255,0)');
  ctx.fillStyle = lineGrad;
  ctx.fillRect(textX, 92, tagW, 2);

  // BOTTOM: full clan name (smaller, light)
  ctx.font      = '15px Arial';
  ctx.fillStyle = C.light;
  ctx.fillText(fitText(ctx, (roster.clan_name || '').toUpperCase(), 380), textX, 123);

  // ── Info boxes: PLAYERS | LEADER | EXPORTED — equal width ────────────────
  const BOX_Y = 194;   // vertically centered between fed logo bottom (162) and purple bar (290)
  const BOX_H = 64;
  const GAP   = 16;    // wider gap between boxes

  // Three equal boxes spanning full content width
  const BOX_W = Math.floor((W - 2 * MARGIN - 2 * GAP) / 3);  // (1020-20)/3 = 333
  const bx1 = MARGIN;
  const bw1 = BOX_W;
  const bx2 = bx1 + BOX_W + GAP;
  const bw2 = BOX_W;
  const bx3 = bx2 + BOX_W + GAP;
  const bw3 = W - MARGIN - bx3;   // remainder (handles rounding)

  const playerCount = (roster.players || []).filter(p => p && p.name).length;
  const leaderName  = roster.leader_name || roster.clan_leader || '—';
  const exportedStr = fmtDateTime(new Date().toISOString());

  drawInfoBox(ctx, bx1, BOX_Y, bw1, BOX_H, 'PLAYERS',  String(playerCount));
  drawInfoBox(ctx, bx2, BOX_Y, bw2, BOX_H, 'LEADER',   leaderName);
  drawInfoBox(ctx, bx3, BOX_Y, bw3, BOX_H, 'EXPORTED', exportedStr);

  // Header bottom separator
  ctx.fillStyle   = C.gold;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(0, HEADER_H - 1, W, 1);
  ctx.globalAlpha = 1;

  // ── Table header — filled MEF purple ─────────────────────────────────────
  const tableY = HEADER_H;

  ctx.fillStyle = C.purple;
  ctx.fillRect(0, tableY, W, TBL_HDR_H);

  let colX = 0;
  for (const col of COLS) {
    if (colX > 0) {
      ctx.fillStyle   = 'rgba(255,255,255,0.18)';
      ctx.fillRect(colX, tableY + 8, 1, TBL_HDR_H - 16);
    }
    ctx.font      = 'bold 12px Arial';
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    ctx.fillText(col.label, colX + col.w / 2, tableY + TBL_HDR_H / 2 + 5);
    colX += col.w;
  }

  // Bottom edge of header row
  ctx.fillStyle   = 'rgba(255,255,255,0.2)';
  ctx.fillRect(0, tableY + TBL_HDR_H - 1, W, 1);

  // ── Table rows ────────────────────────────────────────────────────────────
  const players = (roster.players || []).sort((a, b) => a.slot - b.slot);

  for (let row = 0; row < maxPlayers; row++) {
    const p         = players[row] || null;
    const rowY      = tableY + TBL_HDR_H + row * ROW_H;
    const isCaptain = row === 0;

    ctx.fillStyle = isCaptain ? C.captainBg : (row % 2 === 0 ? C.rowOdd : C.rowEven);
    ctx.fillRect(0, rowY, W, ROW_H);

    if (isCaptain) {
      ctx.fillStyle = C.gold;
      ctx.fillRect(0, rowY, 4, ROW_H);
    }

    // Row separator: purple (semi-transparent) for empty rows, dim border for filled
    if (p) {
      ctx.fillStyle   = C.border;
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle   = C.purple;
      ctx.globalAlpha = 0.4;
    }
    ctx.fillRect(0, rowY + ROW_H - 1, W, 1);
    ctx.globalAlpha = 1;

    const discordDisplay = p?.discord_username || p?.discord_user || '';
    const vals = [
      String(row + 1),
      p?.name          || '',
      discordDisplay,
      p?.device        || '',
      p?.user_id       || '',
      p?.serial_number || '',
    ];

    colX = 0;
    for (let ci = 0; ci < COLS.length; ci++) {
      const col     = COLS[ci];
      const isNoCol = ci === 0;
      const isName  = ci === 1;

      if (colX > 0) {
        ctx.fillStyle = C.border;
        ctx.fillRect(colX, rowY + 8, 1, ROW_H - 16);
      }

      if (isNoCol) {
        ctx.font      = isCaptain ? 'bold 20px Arial' : 'bold 15px Arial';
        ctx.fillStyle = isCaptain ? C.gold : C.dim;
      } else if (isName) {
        ctx.font      = p ? 'bold 14px Arial' : '13px Arial';
        ctx.fillStyle = p ? C.white : C.dim;
      } else {
        ctx.font      = '13px Arial';
        ctx.fillStyle = p ? C.light : C.dim;
      }

      ctx.textAlign = 'center';
      ctx.fillText(fitText(ctx, vals[ci], col.w - 14), colX + col.w / 2, rowY + ROW_H / 2 + 5);
      colX += col.w;
    }
  }

  ctx.strokeStyle = C.border;
  ctx.lineWidth   = 1;
  ctx.strokeRect(0, tableY, W, TBL_HDR_H + maxPlayers * ROW_H);

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = tableY + TBL_HDR_H + maxPlayers * ROW_H;
  ctx.fillStyle = C.footerBg;
  ctx.fillRect(0, footerY, W, FOOTER_H);

  ctx.fillStyle   = C.gold;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(0, footerY, W, 1);
  ctx.globalAlpha = 1;

  // Left: MEF · Powered by 24
  ctx.font      = '11px Arial';
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'left';
  ctx.fillText('MEF  ·  Powered by 24', MARGIN, footerY + 38);

  // Center: empty (removed per design)

  // Right: Instagram icon + @mef_federation
  const igSize   = 16;
  const igLabel  = '@mef_federation';
  ctx.font       = '12px Arial';
  const igLabelW = ctx.measureText(igLabel).width;
  const igTotalW = igSize + 7 + igLabelW;
  const igX      = W - MARGIN - igTotalW;
  const igY      = footerY + (FOOTER_H - igSize) / 2 - 2;

  drawInstagramIcon(ctx, igX, igY, igSize);
  ctx.font      = '12px Arial';
  ctx.fillStyle = C.light;
  ctx.textAlign = 'left';
  ctx.fillText(igLabel, igX + igSize + 7, igY + igSize - 2);

  return canvas.toBuffer('image/png');
}

module.exports = { generateRosterPng };
