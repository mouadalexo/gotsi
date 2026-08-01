'use strict';
const { createCanvas, loadImage } = require('canvas');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs   = require('fs');

const MEF_LOGO_PATH = path.join(__dirname, '../../assets/mef_logo.png');

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

async function generateRosterPdf(roster, maxPlayers, minPlayers) {
  const W         = 820;
  const MARGIN    = 22;
  const HEADER_H  = 165;   // clan info + logo area (slightly taller for clan logo row)
  const TBL_HDR_H = 48;
  const ROW_H     = 58;
  const FOOTER_H  = 36;
  const H         = HEADER_H + TBL_HDR_H + maxPlayers * ROW_H + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background gradient ──────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0,    '#6B1FA8');
  bg.addColorStop(0.35, '#8B2FC9');
  bg.addColorStop(0.65, '#C8600A');
  bg.addColorStop(1,    '#F5A623');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Header info boxes (top-left) ─────────────────────────────────────────
  const bx = MARGIN;
  const by = 16;

  // CLAN NAME
  ctx.fillStyle = 'white';
  drawRoundedRect(ctx, bx, by, 370, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('CLAN NAME :', bx + 12, by + 25);
  ctx.font = '13px Arial';
  ctx.fillText(fitText(ctx, roster.clan_name || '', 220), bx + 112, by + 25);

  // TAG
  ctx.fillStyle = 'white';
  drawRoundedRect(ctx, bx, by + 50, 150, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 12px Arial';
  ctx.fillText('TAG :', bx + 12, by + 75);
  ctx.font = '13px Arial';
  ctx.fillText(fitText(ctx, roster.clan_tag || '', 80), bx + 58, by + 75);

  // SOCIAL MEDIA
  ctx.fillStyle = 'white';
  drawRoundedRect(ctx, bx + 162, by + 50, 218, 40, 8);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 11px Arial';
  ctx.fillText('SOCIAL MEDIA :', bx + 174, by + 68);
  ctx.font = '12px Arial';
  ctx.fillText(fitText(ctx, roster.social_media || '', 118), bx + 174, by + 83);

  // CLAN LOGO (if URL provided — draw small image or a placeholder box)
  const logoBoxY = by + 102;
  if (roster.logo_url) {
    try {
      const clanLogo  = await loadImage(roster.logo_url);
      const lh        = 46;
      const lw        = Math.min(clanLogo.width * (lh / clanLogo.height), 120);
      // White rounded background
      ctx.fillStyle = 'white';
      drawRoundedRect(ctx, bx, logoBoxY, lw + 16, lh + 8, 8);
      ctx.fill();
      ctx.drawImage(clanLogo, bx + 8, logoBoxY + 4, lw, lh);
    } catch (_) {
      // If logo fails to load, show a placeholder text box
      ctx.fillStyle = 'white';
      drawRoundedRect(ctx, bx, logoBoxY, 160, 40, 8);
      ctx.fill();
      ctx.fillStyle = '#666';
      ctx.font = '11px Arial';
      ctx.textAlign = 'left';
      ctx.fillText('CLAN LOGO: ' + fitText(ctx, roster.logo_url, 130), bx + 8, logoBoxY + 25);
    }
  }

  // ── Logos top-right (24 × MEF) ───────────────────────────────────────────
  const logoAreaX = W - 230;
  const logoAreaY = 10;

  // "24" brand mark
  ctx.font = 'bold 64px Arial';
  ctx.fillStyle = '#5500CC';
  ctx.textAlign = 'left';
  ctx.fillText('24', logoAreaX, logoAreaY + 70);

  // "×" separator
  ctx.font = 'bold 28px Arial';
  ctx.fillStyle = 'white';
  ctx.fillText('×', logoAreaX + 76, logoAreaY + 62);

  // MEF logo image
  try {
    if (fs.existsSync(MEF_LOGO_PATH)) {
      const logo  = await loadImage(MEF_LOGO_PATH);
      const logoH = 108;
      const logoW = logo.width * (logoH / logo.height);
      ctx.drawImage(logo, logoAreaX + 106, logoAreaY, logoW, logoH);
    }
  } catch (_) {}

  // ── Table ────────────────────────────────────────────────────────────────
  const COLS = [
    { label: 'NO.',           w: 52  },
    { label: 'PLAYER NAME',   w: 135 },
    { label: 'DISCORD USER',  w: 148 },
    { label: 'DEVICE',        w: 88  },
    { label: 'USER ID',       w: 145 },
    { label: 'SERIAL NUMBER', w: 208 },
  ];
  const tableX = MARGIN;
  const tableW = COLS.reduce((s, c) => s + c.w, 0);
  const tableY = HEADER_H;

  // White table background
  ctx.fillStyle = 'white';
  ctx.fillRect(tableX, tableY, tableW, TBL_HDR_H + maxPlayers * ROW_H);

  // Table header
  let colX = tableX;
  ctx.fillStyle = '#1A1A2E';
  ctx.fillRect(tableX, tableY, tableW, TBL_HDR_H);
  for (const col of COLS) {
    ctx.fillStyle = 'white';
    ctx.font      = 'bold 13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(col.label, colX + col.w / 2, tableY + TBL_HDR_H / 2 + 5);
    colX += col.w;
  }

  // Table rows
  const players = (roster.players || []).sort((a, b) => a.slot - b.slot);
  for (let row = 0; row < maxPlayers; row++) {
    const p      = players[row] || null;
    const rowY   = tableY + TBL_HDR_H + row * ROW_H;
    const isRow1 = row === 0;
    // Subtle alternating background
    if (!isRow1) {
      ctx.fillStyle = row % 2 === 0 ? '#F9F9F9' : 'white';
      ctx.fillRect(tableX, rowY, tableW, ROW_H);
    }

    const vals = [
      String(row + 1),
      p?.name          || '',
      p?.discord_user  || '',
      p?.device        || '',
      p?.user_id       || '',
      p?.serial_number || '',
    ];

    colX = tableX;
    for (let ci = 0; ci < COLS.length; ci++) {
      const col    = COLS[ci];
      const isNoCol = ci === 0;

      // Row 1 NO. cell = red (captain)
      if (isNoCol && isRow1) {
        ctx.fillStyle = '#E00000';
        ctx.fillRect(colX, rowY, col.w, ROW_H);
        ctx.fillStyle = 'white';
      } else {
        ctx.fillStyle = isRow1 ? '#F0F0F0' : (row % 2 === 0 ? '#F9F9F9' : 'white');
        ctx.fillRect(colX, rowY, col.w, ROW_H);
        ctx.fillStyle = '#111';
      }

      // Cell border
      ctx.strokeStyle = '#CCCCCC';
      ctx.lineWidth   = 1;
      ctx.strokeRect(colX, rowY, col.w, ROW_H);

      ctx.font      = isNoCol ? 'bold 16px Arial' : '12px Arial';
      ctx.textAlign = 'center';
      const maxW    = col.w - 8;
      ctx.fillText(fitText(ctx, vals[ci], maxW), colX + col.w / 2, rowY + ROW_H / 2 + 5);
      colX += col.w;
    }
  }

  // Outer table border
  ctx.strokeStyle = '#333333';
  ctx.lineWidth   = 2;
  ctx.strokeRect(tableX, tableY, tableW, TBL_HDR_H + maxPlayers * ROW_H);

  // ── Footer ───────────────────────────────────────────────────────────────
  const footerY = tableY + TBL_HDR_H + maxPlayers * ROW_H + 8;
  ctx.font      = '11px Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.80)';
  ctx.textAlign = 'left';
  const now = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  ctx.fillText('MEF — Moroccan eFootball Federation  |  Generated: ' + now, MARGIN, footerY + 20);
  ctx.textAlign = 'right';
  ctx.fillText('Season ' + (roster.season || 1), W - MARGIN, footerY + 20);

  // ── Convert canvas → PDF ─────────────────────────────────────────────────
  const pngBuf = canvas.toBuffer('image/png');

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: true });
    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.image(pngBuf, 0, 0, { width: W, height: H });
    doc.end();
  });
}

module.exports = { generateRosterPdf };
