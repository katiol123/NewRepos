'use strict';
// ============================================================
//  Рендер: изометрия, свет, юниты, эффекты
// ============================================================
const R = {
  cv: null, ctx: null, W: 0, H: 0, dpr: 1,
  cam: { x: 0, y: 240, z: 1, tx: 0, ty: 240, tz: 1 },
  shakeAmt: 0, sx: 0, sy: 0, time: 0,
  ground: null, groundDirty: true, gox: 600, goy: 60, gs: 2,
  lightCv: null, vign: null, grain: null, letter: 0, letterT: 0,
  menuDrift: true,
};

const iso = (x, y) => ({ x: (x - y) * TW / 2, y: (x + y) * TH / 2 });

R.init = function () {
  R.cv = document.getElementById('game');
  R.ctx = R.cv.getContext('2d');
  R.lightCv = document.createElement('canvas');
  R.resize();
  window.addEventListener('resize', R.resize);
  // зерно плёнки
  const g = document.createElement('canvas'); g.width = g.height = 192;
  const gx = g.getContext('2d'); const id = gx.createImageData(192, 192);
  for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  gx.putImageData(id, 0, 0); R.grain = g;
};
R.resize = function () {
  R.dpr = Math.min(2, window.devicePixelRatio || 1);
  R.W = window.innerWidth; R.H = window.innerHeight;
  R.cv.width = Math.round(R.W * R.dpr); R.cv.height = Math.round(R.H * R.dpr);
  R.cv.style.width = R.W + 'px'; R.cv.style.height = R.H + 'px';
  R.lightCv.width = Math.ceil(R.W / 2); R.lightCv.height = Math.ceil(R.H / 2);
  const v = document.createElement('canvas'); v.width = R.W; v.height = R.H;
  const vx = v.getContext('2d');
  const gr = vx.createRadialGradient(R.W / 2, R.H / 2, Math.min(R.W, R.H) * 0.3, R.W / 2, R.H / 2, Math.max(R.W, R.H) * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.78)');
  vx.fillStyle = gr; vx.fillRect(0, 0, R.W, R.H); R.vign = v;
  R.bgCv = null;
  R.fitZoom();
};
R.fitZoom = function () {
  const z = Math.min((R.W - (R.W > 1100 ? 470 : 240)) / 1060, (R.H - 230) / 560);
  R.baseZ = clamp(z, 0.45, 1.6);
  R.cam.tz = R.baseZ; if (!R.inited) { R.cam.z = R.baseZ; R.inited = true; }
};
R.focus = function (x, y) {
  const p = iso(x, y);
  R.cam.tx = p.x * 0.35; R.cam.ty = p.y * 0.35 + 240 * 0.65;
};
R.toWorld = function (sx, sy) {
  return { x: (sx - R.W / 2) / R.cam.z + R.cam.x, y: (sy - R.H / 2) / R.cam.z + R.cam.y };
};
R.toScreen = function (wx, wy) { return { x: (wx - R.cam.x) * R.cam.z + R.W / 2, y: (wy - R.cam.y) * R.cam.z + R.H / 2 }; };
R.pickTile = function (sx, sy) {
  const w = R.toWorld(sx, sy);
  const fx = w.x / TW + w.y / TH, fy = w.y / TH - w.x / TW;
  const x = Math.round(fx), y = Math.round(fy);
  return inb(x, y) ? { x, y } : null;
};
R.pickUnit = function (sx, sy) {
  const w = R.toWorld(sx, sy); let best = null, bd = -1;
  for (const u of G.units) {
    if (u.dead) continue;
    const p = iso(u.rx, u.ry);
    if (w.x > p.x - 14 && w.x < p.x + 14 && w.y > p.y - 50 && w.y < p.y + 6) {
      const d = u.rx + u.ry; if (d > bd) { bd = d; best = u; }
    }
  }
  return best;
};

// ------------------------------------------------------------
//  Цвет
function shade(hex, f) {
  let c = parseInt(hex.slice(1), 16); let r = c >> 16, g = (c >> 8) & 255, b = c & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function rgba(hex, a) { const c = parseInt(hex.slice(1), 16); return `rgba(${c >> 16},${(c >> 8) & 255},${c & 255},${a})`; }
function poly(ctx, pts, fill, stroke, lw) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
function ell(ctx, x, y, rx, ry, fill, stroke, lw) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
function diamond(ctx, cx, cy, s) {
  s = s || 1; ctx.beginPath();
  ctx.moveTo(cx, cy - TH / 2 * s); ctx.lineTo(cx + TW / 2 * s, cy); ctx.lineTo(cx, cy + TH / 2 * s); ctx.lineTo(cx - TW / 2 * s, cy); ctx.closePath();
}

// ------------------------------------------------------------
//  Земля (кэшируется)
R.buildGround = function () {
  const s = R.gs;
  const w = MW * TW + 200, h = (MW + MH) * TH / 2 + 260;
  R.gox = MH * TW / 2 + 100; R.goy = 60;
  if (!R.ground) R.ground = document.createElement('canvas');
  const g = R.ground; g.width = w * s; g.height = h * s;
  const c = g.getContext('2d'); c.scale(s, s); c.translate(R.gox, R.goy);
  // утёс под платформой
  const L = iso(0, MH - 1), B = iso(MW - 1, MH - 1), Rr = iso(MW - 1, 0);
  const lx = L.x - TW / 2, ly = L.y, bx = B.x, by = B.y + TH / 2, rx = Rr.x + TW / 2, ry = Rr.y;
  const depth = 120;
  let gr = c.createLinearGradient(0, by - 40, 0, by + depth);
  gr.addColorStop(0, '#2a2530'); gr.addColorStop(1, 'rgba(10,8,14,0)');
  poly(c, [lx, ly, bx, by, bx, by + depth, lx, ly + depth * 0.7], gr);
  gr = c.createLinearGradient(0, by - 40, 0, by + depth);
  gr.addColorStop(0, '#1d1a23'); gr.addColorStop(1, 'rgba(8,6,12,0)');
  poly(c, [bx, by, rx, ry, rx, ry + depth * 0.7, bx, by + depth], gr);
  // кладка утёса
  const rng = mulberry(77);
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
  for (let row = 0; row < 6; row++) {
    const off = row * 13 + 8;
    c.globalAlpha = 1 - row / 6;
    c.beginPath(); c.moveTo(lx, ly + off * 0.8); c.lineTo(bx, by + off); c.lineTo(rx, ry + off * 0.8); c.stroke();
    for (let i = 0; i < 16; i++) {
      const f = (i + (row % 2) * 0.5) / 16;
      const x1 = lx + (bx - lx) * f, y1 = ly + (by - ly) * f + off * (0.8 + 0.2 * f);
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1, y1 + 13); c.stroke();
      const x2 = bx + (rx - bx) * f, y2 = by + (ry - by) * f + off * (1 - 0.2 * f);
      c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2, y2 + 13); c.stroke();
    }
  }
  c.globalAlpha = 1;
  // корни, свисающие с края
  c.strokeStyle = 'rgba(30,22,26,0.9)';
  for (let i = 0; i < 26; i++) {
    const f = rng(); const side = rng() < 0.5;
    const x = side ? lx + (bx - lx) * f : bx + (rx - bx) * f, y = side ? ly + (by - ly) * f : by + (ry - by) * f;
    c.lineWidth = 1 + rng() * 1.5; c.beginPath(); c.moveTo(x, y);
    let cx = x, cy = y; const len = 20 + rng() * 60;
    for (let k = 0; k < 5; k++) { cx += (rng() - 0.5) * 8; cy += len / 5; c.lineTo(cx, cy); }
    c.stroke();
  }
  // тайлы
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) R.groundTile(c, G.map[y][x]);
  // ритуальный круг алтаря
  const A = iso(7.5, 7.5);
  c.save(); c.translate(A.x, A.y); c.scale(1, 0.5);
  c.strokeStyle = 'rgba(150,70,90,0.55)'; c.lineWidth = 2;
  c.beginPath(); c.arc(0, 0, 84, 0, 7); c.stroke();
  c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 74, 0, 7); c.stroke();
  c.beginPath(); c.arc(0, 0, 40, 0, 7); c.stroke();
  // пентаграмма-звезда (7 лучей)
  c.beginPath();
  for (let i = 0; i <= 7; i++) { const a = -Math.PI / 2 + i * (Math.PI * 2 / 7) * 3; const px = Math.cos(a) * 74, py = Math.sin(a) * 74; i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.strokeStyle = 'rgba(170,60,80,0.35)'; c.stroke();
  // руны
  c.fillStyle = 'rgba(190,90,110,0.6)';
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2; c.save(); c.translate(Math.cos(a) * 79, Math.sin(a) * 79); c.rotate(a + Math.PI / 2);
    const r2 = mulberry(i * 31 + 5);
    c.fillRect(-1, -4, 1.5, 8); if (r2() < 0.6) c.fillRect(-3, -2 + r2() * 4, 6, 1.2); if (r2() < 0.5) c.fillRect(1, -4, 1.2, 4);
    c.restore();
  }
  c.restore();
  R.groundDirty = false;
};

R.groundTile = function (c, t) {
  const p = iso(t.x, t.y); const rng = mulberry(t.seed + 13);
  const v = rng();
  let base;
  if (t.altar) base = '#3a2230';
  else base = v < 0.33 ? '#2e2b35' : v < 0.66 ? '#33303a' : '#2a2832';
  // плита
  diamond(c, p.x, p.y);
  const gr = c.createLinearGradient(p.x - TW / 2, p.y - TH / 2, p.x + TW / 2, p.y + TH / 2);
  gr.addColorStop(0, shade(base, 0.12)); gr.addColorStop(1, shade(base, -0.25));
  c.fillStyle = gr; c.fill();
  // шов
  c.strokeStyle = 'rgba(8,6,12,0.85)'; c.lineWidth = 1.2; c.stroke();
  // фаска
  c.beginPath(); c.moveTo(p.x - TW / 2 + 3, p.y); c.lineTo(p.x, p.y - TH / 2 + 2); c.lineTo(p.x + TW / 2 - 3, p.y);
  c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1; c.stroke();
  // разбиение на плиты
  if (!t.altar && rng() < 0.55) {
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.beginPath();
    if (rng() < 0.5) { c.moveTo(p.x - TW / 4, p.y - TH / 4); c.lineTo(p.x + TW / 4, p.y + TH / 4); }
    else { c.moveTo(p.x + TW / 4, p.y - TH / 4); c.lineTo(p.x - TW / 4, p.y + TH / 4); }
    c.stroke();
  }
  // трещины
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.8;
  const nc = Math.floor(rng() * 3);
  for (let i = 0; i < nc; i++) {
    let x = p.x + (rng() - 0.5) * 30, y = p.y + (rng() - 0.5) * 12;
    c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 12; y += (rng() - 0.5) * 6; c.lineTo(x, y); }
    c.stroke();
  }
  // мох / кровь / кости
  const d = rng();
  if (d < 0.18 && !t.altar) {
    c.fillStyle = 'rgba(58,74,48,0.45)';
    for (let i = 0; i < 6; i++) ell(c, p.x + (rng() - 0.5) * 34, p.y + (rng() - 0.5) * 14, 2 + rng() * 4, 1 + rng() * 2, 'rgba(58,74,48,0.4)');
  } else if (d < 0.27) {
    ell(c, p.x + (rng() - 0.5) * 18, p.y + (rng() - 0.5) * 6, 7 + rng() * 7, 3 + rng() * 3, 'rgba(70,10,18,0.45)');
  } else if (d < 0.36) {
    c.strokeStyle = 'rgba(200,190,170,0.5)'; c.lineWidth = 1.5;
    const bx = p.x + (rng() - 0.5) * 26, by = p.y + (rng() - 0.5) * 9, a = rng() * 3;
    c.beginPath(); c.moveTo(bx - Math.cos(a) * 5, by - Math.sin(a) * 2.5); c.lineTo(bx + Math.cos(a) * 5, by + Math.sin(a) * 2.5); c.stroke();
    ell(c, bx - Math.cos(a) * 5, by - Math.sin(a) * 2.5, 1.4, 1.4, 'rgba(200,190,170,0.5)');
    ell(c, bx + Math.cos(a) * 5, by + Math.sin(a) * 2.5, 1.4, 1.4, 'rgba(200,190,170,0.5)');
  }
  if (t.altar) {
    c.strokeStyle = 'rgba(200,80,100,0.35)'; c.lineWidth = 1;
    diamond(c, p.x, p.y, 0.7); c.stroke();
  }
  // обломки
  if (t.rubble) {
    for (let i = 0; i < 7; i++) {
      const rx = p.x + (rng() - 0.5) * 36, ry = p.y + (rng() - 0.5) * 14, s = 2 + rng() * 4;
      poly(c, [rx - s, ry, rx, ry - s * 0.7, rx + s, ry, rx, ry + s * 0.4], rng() < 0.5 ? '#4a4552' : '#3a3642', 'rgba(0,0,0,0.5)');
    }
  }
  // выжженная земля
  if (t.burn > 0 || t.scorch) {
    t.scorch = 1;
    ell(c, p.x, p.y, 22, 10, 'rgba(8,5,5,0.45)');
  }
};

// ------------------------------------------------------------
//  Объекты карты
R.drawObject = function (c, t, time, alpha) {
  const p = iso(t.x, t.y); const rng = mulberry(t.seed + 99);
  c.save(); c.globalAlpha = alpha; c.translate(p.x, p.y);
  const dmg = t.ohp / OBJ[t.obj].hp;
  switch (t.obj) {
    case '#': R.drawWall(c, rng, dmg); break;
    case 'P': R.drawPillar(c, rng, dmg); break;
    case 'h': R.drawTomb(c, rng); break;
    case 'c': R.drawSarc(c, rng); break;
    case 't': R.drawTree(c, rng, time); break;
    case 'B': R.drawBrazier(c, t, time); break;
  }
  c.restore();
};
function isoBlock(c, hw, hh, h, top, left, right, jag) {
  // левая грань
  poly(c, [-hw, 0, 0, hh, 0, hh - h, -hw, -h], left);
  poly(c, [0, hh, hw, 0, hw, -h, 0, hh - h], right);
  if (jag) {
    c.beginPath(); c.moveTo(-hw, -h); let i = 0;
    for (const j of jag) { const f = (i + 1) / (jag.length + 1); i++; c.lineTo(-hw + hw * 2 * f, (f < 0.5 ? -h + hh * 2 * f : -h + hh * 2 * (1 - f)) * 1 - hh + j); }
    poly(c, [-hw, -h, 0, -hh - h, hw, -h, 0, hh - h], top);
  } else poly(c, [-hw, -h, 0, -hh - h, hw, -h, 0, hh - h], top);
}
R.drawWall = function (c, rng, dmg) {
  const h = (26 + rng() * 22) * (0.55 + 0.45 * dmg);
  const hw = 26, hh = 13;
  // тень
  ell(c, 4, 6, 34, 14, 'rgba(0,0,0,0.35)');
  const lg = c.createLinearGradient(0, -h, 0, hh);
  lg.addColorStop(0, '#4c4656'); lg.addColorStop(1, '#2a2632');
  const rg = c.createLinearGradient(0, -h, 0, hh);
  rg.addColorStop(0, '#3a3543'); rg.addColorStop(1, '#1d1a24');
  poly(c, [-hw, 0, 0, hh, 0, hh - h, -hw, -h], lg);
  poly(c, [0, hh, hw, 0, hw, -h * (0.7 + rng() * 0.3), 0, hh - h], rg);
  // неровный верх
  const tl = -h, tr = -h * (0.7 + rng() * 0.3);
  poly(c, [-hw, tl, 0, tl - hh + 4, hw * 0.4, tl - hh + 8 + rng() * 6, hw, tr, 0, hh - h], '#5a5364');
  // кирпичи
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
  for (let yy = 6; yy < h; yy += 8) {
    c.beginPath(); c.moveTo(-hw, -yy + 0); c.lineTo(0, hh - yy); c.lineTo(hw, -yy); c.stroke();
    for (let k = 0; k < 3; k++) {
      const f = (k + ((yy / 8) % 2) * 0.5 + 0.25) / 3;
      const x = -hw + hw * f, y = -yy + hh * f;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 8); c.stroke();
      const x2 = hw * f, y2 = hh - yy - hh * f;
      c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2, y2 + 8); c.stroke();
    }
  }
  // мох
  for (let i = 0; i < 5; i++) ell(c, -hw + rng() * hw * 2, -h + rng() * 10, 3 + rng() * 4, 1.5, 'rgba(60,80,52,0.5)');
  // светлая кромка
  c.strokeStyle = 'rgba(255,240,220,0.08)'; c.beginPath(); c.moveTo(-hw, tl); c.lineTo(0, tl - hh + 4); c.stroke();
};
R.drawPillar = function (c, rng, dmg) {
  const broken = rng() < 0.45;
  const h = (broken ? 36 + rng() * 14 : 64) * (0.6 + 0.4 * dmg);
  ell(c, 5, 5, 26, 11, 'rgba(0,0,0,0.4)');
  // основание
  isoBlock(c, 18, 9, 7, '#57505f', '#3c3745', '#2b2733');
  const w = 11;
  const gr = c.createLinearGradient(-w, 0, w, 0);
  gr.addColorStop(0, '#2a2632'); gr.addColorStop(0.35, '#6a6274'); gr.addColorStop(0.7, '#3d3846'); gr.addColorStop(1, '#1f1c26');
  c.fillStyle = gr; c.fillRect(-w, -h, w * 2, h - 7);
  // каннелюры
  c.strokeStyle = 'rgba(0,0,0,0.3)';
  for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 4, -h); c.lineTo(i * 4, -7); c.stroke(); }
  if (broken) {
    poly(c, [-w, -h, -4, -h - 6, 2, -h + 1, 6, -h - 4, w, -h + 2, w, -h + 6, -w, -h + 6], '#5d5667');
  } else {
    isoBlock(c, 15, 7.5, 6, '#625a6c', '#463f50', '#322d3a');
    c.save(); c.translate(0, -h + 6); isoBlock(c, 15, 7.5, 6, '#6b6375', '#4a4354', '#332e3c'); c.restore();
  }
  // плющ
  c.strokeStyle = 'rgba(52,72,46,0.8)'; c.lineWidth = 1.5; c.beginPath();
  let x = -w + 2, y = -8; c.moveTo(x, y);
  for (let i = 0; i < 6; i++) { x += (rng() - 0.3) * 5; y -= h / 9; c.lineTo(clamp(x, -w, w), y); }
  c.stroke();
};
R.drawTomb = function (c, rng) {
  const tilt = (rng() - 0.5) * 0.25;
  ell(c, 3, 3, 18, 7, 'rgba(0,0,0,0.4)');
  c.save(); c.rotate(tilt);
  const h = 22 + rng() * 6;
  // толщина
  poly(c, [6, -2, 10, -4, 10, -h + 4, 6, -h + 6], '#2d2a33');
  // лицевая плита
  c.beginPath(); c.moveTo(-8, 0); c.lineTo(-8, -h + 8); c.quadraticCurveTo(-8, -h, -1, -h); c.quadraticCurveTo(6, -h, 6, -h + 8); c.lineTo(6, -2); c.closePath();
  const gr = c.createLinearGradient(-8, -h, 6, 0); gr.addColorStop(0, '#6b6575'); gr.addColorStop(1, '#3a3643');
  c.fillStyle = gr; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.stroke();
  // резьба
  c.strokeStyle = 'rgba(20,16,26,0.8)'; c.lineWidth = 1.5;
  if (rng() < 0.6) { c.beginPath(); c.moveTo(-1, -h + 5); c.lineTo(-1, -h + 15); c.moveTo(-5, -h + 9); c.lineTo(3, -h + 9); c.stroke(); }
  else { c.beginPath(); c.arc(-1, -h + 10, 3.5, 0, 7); c.stroke(); }
  c.lineWidth = 0.8; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-5, -8 + i * -3); c.lineTo(3, -8 + i * -3); c.stroke(); }
  c.restore();
  // свеча
  if (rng() < 0.4) { c.fillStyle = '#d8ccb0'; c.fillRect(-12, -6, 2, 5); ell(c, -11, -8, 1.5, 2.5, 'rgba(255,200,110,0.9)'); }
};
R.drawSarc = function (c, rng) {
  ell(c, 3, 4, 28, 12, 'rgba(0,0,0,0.4)');
  c.save(); c.scale(0.9, 0.9);
  isoBlock(c, 24, 12, 12, '#575062', '#3d3846', '#2a2631');
  c.translate(rng() * 3 - 1.5, -12);
  isoBlock(c, 22, 11, 4, '#6a6276', '#4b4456', '#363141');
  // фигура на крышке
  c.strokeStyle = 'rgba(25,20,30,0.7)'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-12, -10); c.lineTo(10, 1); c.stroke();
  ell(c, -11, -10, 3, 2, '#7a7286');
  c.restore();
  // треснутая плита
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.moveTo(-8, -10); c.lineTo(-3, -6); c.lineTo(-5, 0); c.stroke();
};
R.drawTree = function (c, rng, time) {
  ell(c, 4, 4, 20, 8, 'rgba(0,0,0,0.4)');
  c.strokeStyle = '#1b1517'; c.lineCap = 'round';
  const sway = Math.sin(time * 0.8 + rng() * 6) * 0.03;
  const branch = (x, y, a, len, w, d) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    c.lineWidth = w; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
    if (d > 0) {
      branch(x2, y2, a - 0.45 - rng() * 0.3 + sway, len * (0.68 + rng() * 0.1), w * 0.62, d - 1);
      if (rng() < 0.8) branch(x2, y2, a + 0.4 + rng() * 0.3 + sway, len * (0.62 + rng() * 0.1), w * 0.6, d - 1);
    }
  };
  // корни
  c.lineWidth = 3; c.beginPath(); c.moveTo(-9, 3); c.quadraticCurveTo(-3, -2, 0, -6); c.moveTo(9, 2); c.quadraticCurveTo(3, -2, 0, -6); c.stroke();
  branch(0, 0, -Math.PI / 2 + (rng() - 0.5) * 0.3, 20, 6, 4);
  c.strokeStyle = 'rgba(90,70,60,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-1.5, -2); c.lineTo(-1, -18); c.stroke();
  // висящая цепь
  if (rng() < 0.6) {
    c.strokeStyle = 'rgba(120,110,100,0.7)'; c.lineWidth = 1; c.setLineDash([2, 2]);
    c.beginPath(); c.moveTo(8, -30); c.lineTo(8 + Math.sin(time * 1.3) * 1.5, -16); c.stroke(); c.setLineDash([]);
  }
};
R.drawBrazier = function (c, t, time) {
  ell(c, 2, 4, 16, 7, 'rgba(0,0,0,0.45)');
  c.strokeStyle = '#26211f'; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(-8, 2); c.lineTo(-3, -16); c.moveTo(8, 2); c.lineTo(3, -16); c.moveTo(0, 5); c.lineTo(0, -16); c.stroke();
  // чаша
  c.beginPath(); c.moveTo(-12, -20); c.quadraticCurveTo(0, -8, 12, -20); c.closePath();
  const gr = c.createLinearGradient(-12, 0, 12, 0); gr.addColorStop(0, '#3a302a'); gr.addColorStop(0.5, '#6c5a48'); gr.addColorStop(1, '#2a221d');
  c.fillStyle = gr; c.fill();
  ell(c, 0, -20, 12, 4, t.lit && G.eclipse <= 0 ? '#ff9a3a' : '#2a201b', '#4d4036');
  if (t.lit && G.eclipse <= 0) {
    // пламя
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const f = Math.sin(time * 9 + i * 2 + t.seed) * 2;
      const hgt = 18 + i * 4 + f;
      const g2 = c.createLinearGradient(0, -20, 0, -20 - hgt);
      g2.addColorStop(0, 'rgba(255,170,60,0.9)'); g2.addColorStop(0.6, 'rgba(255,90,20,0.5)'); g2.addColorStop(1, 'rgba(255,50,0,0)');
      c.fillStyle = g2; c.beginPath();
      const w = 9 - i * 2;
      c.moveTo(-w, -20); c.quadraticCurveTo(-w * 0.6 + f, -20 - hgt * 0.6, (i - 1) * 2 + f, -20 - hgt); c.quadraticCurveTo(w * 0.6 + f, -20 - hgt * 0.6, w, -20); c.fill();
    }
    c.restore();
  } else {
    // угли
    for (let i = 0; i < 4; i++) ell(c, -6 + i * 4, -20, 1.2, 0.8, rgba('#ff6a2a', 0.3 + 0.3 * Math.sin(time * 3 + i)));
  }
};

// ------------------------------------------------------------
//  Юниты
R.drawUnit = function (c, u, time, opts = {}) {
  const P = FACTIONS[u.side].pal; const cls = u.cls;
  const bob = opts.still ? 0 : Math.sin(time * 2.2 + u.id) * 1.1;
  const breathe = opts.still ? 0 : Math.sin(time * 1.6 + u.id * 0.7);
  c.save();
  c.scale(u.face, 1);
  const A = { P, t: time, bob, br: breathe, side: u.side, cast: u.anim.cast, u };
  switch (cls) {
    case 'bastion': drawBastion(c, A); break;
    case 'marksman': drawMarksman(c, A); break;
    case 'mystic': drawMystic(c, A); break;
    case 'shade': drawShade(c, A); break;
    case 'priest': drawPriest(c, A); break;
  }
  c.restore();
};
function legs(c, P, y0, h, spread, col) {
  c.fillStyle = col || P.metal2;
  c.fillRect(-spread - 2.5, y0, 4.5, h); c.fillRect(spread - 2, y0, 4.5, h);
  c.fillStyle = P.dark; c.fillRect(-spread - 3.5, y0 + h - 3, 6, 3); c.fillRect(spread - 2, y0 + h - 3, 6, 3);
}
function eyesGlow(c, x, y, col, gap, r) {
  c.save(); c.globalCompositeOperation = 'lighter';
  ell(c, x - gap, y, r * 2.5, r * 2, rgba(col, 0.25)); ell(c, x + gap, y, r * 2.5, r * 2, rgba(col, 0.25));
  ell(c, x - gap, y, r, r * 0.8, col); ell(c, x + gap, y, r, r * 0.8, col);
  c.restore();
}
function drawBastion(c, A) {
  const { P, bob, side } = A;
  legs(c, P, -15, 15, 4);
  c.save(); c.translate(0, bob * 0.5);
  // плащ сзади
  poly(c, [-10, -34, 9, -34, 12, -10, -13, -9], side === 'order' ? '#5d1219' : '#16111c');
  // меч / булава за спиной
  c.strokeStyle = side === 'order' ? '#d6d0c4' : '#7d7a6e'; c.lineWidth = 2.5;
  c.beginPath(); c.moveTo(-8, -22); c.lineTo(-15, -50); c.stroke();
  c.strokeStyle = P.metal2; c.lineWidth = 2; c.beginPath(); c.moveTo(-11, -27); c.lineTo(-5, -29); c.stroke();
  if (side === 'coven') { ell(c, -15.5, -51, 4, 4, '#6d6a5e'); c.fillStyle = '#4b483f'; for (let i = 0; i < 5; i++) { const a = i * 1.25; c.fillRect(-15.5 + Math.cos(a) * 4.5 - 1, -51 + Math.sin(a) * 4.5 - 1, 2, 2); } }
  // торс
  const tg = c.createLinearGradient(-10, -36, 10, -12);
  tg.addColorStop(0, shade(P.metal, 0.15)); tg.addColorStop(1, shade(P.metal, -0.45));
  poly(c, [-10, -36, 10, -36, 9, -14, -9, -14], tg, 'rgba(0,0,0,0.5)');
  if (side === 'order') {
    poly(c, [-7, -34, 7, -34, 8, -10, -8, -10], P.cloth, 'rgba(0,0,0,0.4)');
    c.fillStyle = P.cloth2; c.fillRect(-1.5, -33, 3, 22); c.fillRect(-6, -27, 12, 3);
  } else {
    // рёбра
    c.strokeStyle = '#d7cfb7'; c.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-6, -31 + i * 4); c.quadraticCurveTo(0, -28 + i * 4, 6, -31 + i * 4); c.stroke(); }
    c.fillStyle = P.cloth2; c.fillRect(-8, -16, 16, 4);
  }
  // наплечники
  ell(c, -10, -34, 6, 4, shade(P.metal, -0.1), 'rgba(0,0,0,0.5)');
  ell(c, 10, -34, 6, 4, shade(P.metal, -0.05), 'rgba(0,0,0,0.5)');
  if (side === 'coven') { poly(c, [-14, -36, -18, -44, -11, -37], '#d9d1bb'); poly(c, [14, -36, 18, -44, 11, -37], '#d9d1bb'); }
  // шлем
  if (side === 'order') {
    const hg = c.createLinearGradient(-6, -48, 6, -36); hg.addColorStop(0, '#e6d9a8'); hg.addColorStop(1, '#7d6b40');
    c.fillStyle = hg; c.beginPath(); c.moveTo(-6, -37); c.lineTo(-6, -46); c.quadraticCurveTo(0, -51, 6, -46); c.lineTo(6, -37); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.stroke();
    c.fillStyle = '#120c08'; c.fillRect(-4, -43.5, 9, 1.8); c.fillRect(0.3, -43, 1.5, 5);
    // плюмаж
    c.strokeStyle = P.cloth2; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -49); c.quadraticCurveTo(-8, -54 + A.br, -14, -47); c.stroke();
  } else {
    ell(c, 0, -43, 6.5, 6.5, '#d9d1bb', 'rgba(0,0,0,0.5)');
    c.fillStyle = '#d9d1bb'; c.fillRect(-4, -39, 8, 4);
    c.fillStyle = '#0d0910'; ell(c, -2.4, -43, 1.8, 2.2, '#0d0910'); ell(c, 2.6, -43, 1.8, 2.2, '#0d0910');
    eyesGlow(c, 0.1, -43, P.glow, 2.5, 0.9);
    c.strokeStyle = '#bdb49c'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(-5, -47); c.quadraticCurveTo(-12, -50, -10, -57); c.stroke();
    c.beginPath(); c.moveTo(5, -47); c.quadraticCurveTo(12, -50, 10, -57); c.stroke();
  }
  // щит спереди
  if (side === 'order') {
    const sg = c.createLinearGradient(2, -36, 16, -10); sg.addColorStop(0, '#efe5cc'); sg.addColorStop(1, '#a89878');
    poly(c, [3, -36, 17, -36, 17, -23, 10, -9, 3, -23], sg, '#6f5f3b', 2);
    c.save(); c.globalCompositeOperation = 'lighter'; ell(c, 10, -27, 5, 5, 'rgba(255,190,90,0.35)'); c.restore();
    ell(c, 10, -27, 3.4, 3.4, P.glow);
    c.strokeStyle = P.metal; c.lineWidth = 1;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(10 + Math.cos(a) * 4, -27 + Math.sin(a) * 4); c.lineTo(10 + Math.cos(a) * 6.5, -27 + Math.sin(a) * 6.5); c.stroke(); }
  } else {
    c.beginPath(); c.ellipse(10, -24, 8, 12.5, 0, 0, 7);
    const sg = c.createLinearGradient(2, -36, 18, -10); sg.addColorStop(0, '#3b3245'); sg.addColorStop(1, '#16111c');
    c.fillStyle = sg; c.fill(); c.strokeStyle = '#a9a797'; c.lineWidth = 2; c.stroke();
    c.strokeStyle = '#cfc6ad'; c.lineWidth = 1;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(4, -32 + i * 7); c.lineTo(16, -30 + i * 7); c.stroke(); }
    ell(c, 10, -24, 4, 2.2, '#0b0810'); eyesGlow(c, 10, -24, P.glow2, 0, 1.4);
  }
  c.restore();
}
function drawMarksman(c, A) {
  const { P, bob, side, cast } = A;
  legs(c, P, -14, 14, 3, side === 'order' ? '#5a4a36' : '#cfc7b0');
  c.save(); c.translate(0, bob * 0.6);
  // плащ
  const sway = Math.sin(A.t * 1.5 + A.u.id) * 1.5;
  poly(c, [-6, -32, 5, -32, 7 + sway * 0.3, -10, -10 + sway, -8], side === 'order' ? P.cloth2 : '#221a2a');
  if (side === 'order') {
    poly(c, [-6, -33, 6, -33, 6, -14, -6, -14], P.cloth, 'rgba(0,0,0,0.4)');
    c.fillStyle = '#5a4128'; c.fillRect(-6, -20, 12, 2.5);
    // колчан
    c.save(); c.rotate(-0.3); c.fillStyle = '#4a3622'; c.fillRect(-10, -36, 4, 14); c.fillStyle = P.cloth; c.fillRect(-9.5, -39, 1, 4); c.fillRect(-7.5, -40, 1, 5); c.restore();
    // голова с капюшоном
    ell(c, 0, -38, 5, 5.5, P.skin);
    c.beginPath(); c.moveTo(-6, -35); c.quadraticCurveTo(-7, -46, 0, -46); c.quadraticCurveTo(7, -46, 6, -38); c.lineTo(3, -40); c.quadraticCurveTo(0, -43, -3, -38); c.closePath(); c.fillStyle = P.cloth2; c.fill();
    c.fillStyle = '#2a1b12'; c.fillRect(1.5, -39, 2, 1.2);
    // арбалет
    const ay = cast ? -29 : -26;
    c.strokeStyle = '#4a3622'; c.lineWidth = 3; c.beginPath(); c.moveTo(-2, ay + 2); c.lineTo(16, ay); c.stroke();
    c.strokeStyle = P.metal; c.lineWidth = 2; c.beginPath(); c.moveTo(13, ay - 8); c.quadraticCurveTo(17, ay, 13, ay + 8); c.stroke();
    c.strokeStyle = 'rgba(230,220,200,0.8)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(13, ay - 8); c.lineTo(8, ay); c.lineTo(13, ay + 8); c.stroke();
  } else {
    // скелет
    c.strokeStyle = '#d9d1bb'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -33); c.lineTo(0, -15); c.stroke();
    c.lineWidth = 1.1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-5, -30 + i * 3.5); c.quadraticCurveTo(0, -27 + i * 3.5, 5, -30 + i * 3.5); c.stroke(); }
    poly(c, [-6, -17, 6, -17, 5, -13, -5, -13], '#bfb69d');
    // рваный капюшон
    poly(c, [-8, -32, -6, -46, 2, -48, 7, -40, 6, -32, 3, -28, 0, -32, -4, -27], '#2c2335');
    ell(c, 1, -38, 4.5, 5, '#d9d1bb');
    ell(c, 1, -38, 4, 3, '#0d0910');
    eyesGlow(c, 2, -38.5, P.glow, 1.8, 0.8);
    // лук
    const pull = cast ? 4 : 0;
    c.strokeStyle = '#3a2c2a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(9, -48); c.quadraticCurveTo(18, -30, 9, -12); c.stroke();
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(P.glow, 0.9); c.lineWidth = 1;
    c.beginPath(); c.moveTo(9, -48); c.lineTo(9 - pull, -30); c.lineTo(9, -12); c.stroke(); c.restore();
    c.strokeStyle = '#d9d1bb'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -30); c.lineTo(9 - pull, -30); c.stroke();
  }
  c.restore();
}
function drawMystic(c, A) {
  const { P, bob, side, t, cast } = A;
  // руны под ногами
  c.save(); c.scale(1, 0.45);
  c.strokeStyle = rgba(P.glow, 0.45 + 0.2 * Math.sin(t * 2)); c.lineWidth = 1.5;
  c.setLineDash([4, 5]); c.lineDashOffset = -t * 12; c.beginPath(); c.arc(0, 0, 15, 0, 7); c.stroke(); c.setLineDash([]);
  c.restore();
  c.save(); c.translate(0, bob - 1);
  // мантия
  const rg = c.createLinearGradient(0, -40, 0, 0);
  rg.addColorStop(0, side === 'order' ? '#7a1b22' : '#3d2b55'); rg.addColorStop(1, side === 'order' ? '#3c0d12' : '#120d1a');
  c.beginPath(); c.moveTo(-5, -34); c.lineTo(5, -34); c.lineTo(11 + Math.sin(t * 1.4) * 1, 0); c.lineTo(-11 + Math.sin(t * 1.4 + 1), 0); c.closePath(); c.fillStyle = rg; c.fill();
  c.strokeStyle = side === 'order' ? P.metal : P.glow2; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -30); c.lineTo(0, 0); c.stroke();
  for (let i = 0; i < 3; i++) { c.fillStyle = side === 'order' ? P.metal : rgba(P.glow2, 0.8); c.fillRect(-1.5, -24 + i * 7, 3, 2); }
  // пояс
  c.fillStyle = P.dark; c.fillRect(-6, -22, 12, 2.5);
  // капюшон
  c.beginPath(); c.moveTo(-7, -32); c.quadraticCurveTo(-7, -46, 0, -52); c.quadraticCurveTo(7, -46, 7, -32); c.closePath();
  c.fillStyle = side === 'order' ? '#8c2129' : '#2a1f38'; c.fill();
  ell(c, 0.8, -38, 3.6, 4.2, '#0a0608');
  eyesGlow(c, 0.8, -38.5, side === 'order' ? P.glow : P.glow2, 1.6, 0.75);
  // посох
  const sy = cast ? -6 : 0;
  c.strokeStyle = side === 'order' ? '#5a3d24' : '#2e2a26'; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(12, 2); c.lineTo(11, -50 + sy); c.stroke();
  if (side === 'coven') { c.strokeStyle = '#bdb49c'; c.lineWidth = 1.2; c.beginPath(); c.arc(11, -53 + sy, 5, 0.5, 2.6, true); c.stroke(); }
  else { c.strokeStyle = P.metal; c.lineWidth = 1.5; c.beginPath(); c.moveTo(7, -50 + sy); c.lineTo(15, -50 + sy); c.stroke(); }
  // сфера
  const orbR = 3.5 + Math.sin(t * 5) * 0.5 + (cast ? 2 : 0);
  c.save(); c.globalCompositeOperation = 'lighter';
  const og = c.createRadialGradient(11, -54 + sy, 0, 11, -54 + sy, orbR * 4);
  og.addColorStop(0, rgba(side === 'order' ? '#ffd27a' : '#c9a8ff', 1)); og.addColorStop(0.3, rgba(P.glow, 0.6)); og.addColorStop(1, rgba(P.glow, 0));
  c.fillStyle = og; c.beginPath(); c.arc(11, -54 + sy, orbR * 4, 0, 7); c.fill();
  c.restore();
  ell(c, 11, -54 + sy, orbR * 0.7, orbR * 0.7, side === 'order' ? '#fff3cf' : '#efe2ff');
  c.restore();
}
function drawShade(c, A) {
  const { P, bob, side, t } = A;
  const conc = A.u.st.concealed;
  c.save(); c.translate(0, bob * 0.4 + 2);
  // присед
  legs(c, P, -12, 11, 4.5, side === 'order' ? '#2a2420' : '#120d18');
  // рваный плащ
  const s = Math.sin(t * 2 + A.u.id) * 2;
  poly(c, [-6, -30, 6, -30, 10, -14, 13 + s, -4, 8, -8, 4 + s, -2, 0, -7, -5, -1 + s, -9, -6, -14 + s, -3, -10, -16], side === 'order' ? '#3b302c' : '#1a1222');
  // торс
  poly(c, [-5, -30, 6, -30, 7, -16, -5, -16], side === 'order' ? '#5b4a40' : '#2a1f36', 'rgba(0,0,0,0.5)');
  c.strokeStyle = side === 'order' ? P.cloth2 : P.glow; c.lineWidth = 1; c.beginPath(); c.moveTo(-5, -26); c.lineTo(6, -20); c.stroke();
  // капюшон
  c.beginPath(); c.moveTo(-7, -27); c.quadraticCurveTo(-8, -42, 1, -43); c.quadraticCurveTo(9, -40, 7, -28); c.closePath();
  c.fillStyle = side === 'order' ? '#2f2622' : '#140e1b'; c.fill();
  if (side === 'order') {
    // фарфоровая маска со слезой
    c.beginPath(); c.moveTo(-2, -38); c.quadraticCurveTo(5, -40, 5, -33); c.quadraticCurveTo(3, -29, -1, -30); c.closePath(); c.fillStyle = '#ece4d4'; c.fill();
    c.fillStyle = '#1a1210'; c.fillRect(0.5, -36, 3, 1); c.fillStyle = P.cloth2; c.fillRect(2, -35, 0.9, 4);
  } else {
    ell(c, 1.5, -34, 4, 4, '#050307');
    eyesGlow(c, 2.2, -35, P.glow2, 1.6, 0.8);
  }
  // кинжалы
  c.strokeStyle = '#e6e2da'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(8, -20); c.lineTo(15, -27); c.moveTo(-6, -18); c.lineTo(-12, -12); c.stroke();
  c.save(); c.globalCompositeOperation = 'lighter';
  c.strokeStyle = rgba(side === 'order' ? '#fff0c0' : P.glow2, 0.35 + 0.3 * Math.sin(t * 4)); c.lineWidth = 3;
  c.beginPath(); c.moveTo(9, -21); c.lineTo(15, -27); c.stroke(); c.restore();
  // дымка сокрытия
  if (conc) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { const a = t * 1.5 + i * 1.6; ell(c, Math.cos(a) * 9, -20 + Math.sin(a * 1.3) * 10, 6, 4, rgba(P.glow, 0.08)); }
    c.restore();
  }
  c.restore();
}
function drawPriest(c, A) {
  const { P, bob, side, t, cast } = A;
  c.save(); c.translate(0, bob * 0.7);
  if (side === 'order') {
    // нимб
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = rgba(P.glow, 0.55 + 0.2 * Math.sin(t * 2)); c.lineWidth = 1.6;
    c.beginPath(); c.ellipse(0, -47, 10, 10, 0, 0, 7); c.stroke();
    const hg = c.createRadialGradient(0, -47, 0, 0, -47, 14); hg.addColorStop(0, rgba(P.glow, 0.25)); hg.addColorStop(1, rgba(P.glow, 0));
    c.fillStyle = hg; c.beginPath(); c.arc(0, -47, 14, 0, 7); c.fill();
    c.restore();
    // ряса
    const rg = c.createLinearGradient(0, -36, 0, 0); rg.addColorStop(0, '#ece3cd'); rg.addColorStop(1, '#a89a7c');
    c.beginPath(); c.moveTo(-6, -36); c.lineTo(6, -36); c.lineTo(10, 0); c.lineTo(-10, 0); c.closePath(); c.fillStyle = rg; c.fill();
    c.fillStyle = P.cloth2; c.fillRect(-2.5, -34, 5, 34);
    c.fillStyle = P.metal; c.fillRect(-2.5, -24, 5, 1.2); c.fillRect(-2.5, -12, 5, 1.2);
    ell(c, 0, -40, 4.5, 5, P.skin);
    // митра
    poly(c, [-5, -43, 0, -55, 5, -43], P.metal, '#6f5f3b');
    c.fillStyle = P.cloth2; c.fillRect(-0.7, -53, 1.4, 9); c.fillRect(-3, -49, 6, 1.3);
    c.fillStyle = '#2a1b12'; c.fillRect(1, -41, 2, 1);
    // кадило
    const sw = Math.sin(t * 2.4) * 0.4 + (cast ? -0.8 : 0);
    const hx = 9, hy = -26; const ex = hx + Math.sin(sw) * 13, ey = hy + Math.cos(sw) * 13;
    c.strokeStyle = P.metal; c.lineWidth = 0.8; c.beginPath(); c.moveTo(hx, hy); c.lineTo(ex, ey); c.stroke();
    ell(c, ex, ey + 2, 3, 3.3, P.metal, '#6f5f3b');
    c.save(); c.globalCompositeOperation = 'lighter'; ell(c, ex, ey + 2, 5, 5, rgba(P.glow, 0.3)); c.restore();
  } else {
    // ведьма: тёмная ряса, рогатая корона, фонарь
    const rg = c.createLinearGradient(0, -36, 0, 0); rg.addColorStop(0, '#3b2b4f'); rg.addColorStop(1, '#100b16');
    c.beginPath(); c.moveTo(-6, -36); c.lineTo(6, -36); c.lineTo(11, 0); c.lineTo(-12, 0); c.closePath(); c.fillStyle = rg; c.fill();
    c.strokeStyle = '#cfc6ad'; c.lineWidth = 0.8; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-8 + i * 4, -6); c.lineTo(-7 + i * 4, -1); c.stroke(); }
    ell(c, 0, -40, 4.6, 5.2, '#ddd5bf');
    c.fillStyle = '#0b0710'; c.fillRect(-2.6, -41.5, 2, 2); c.fillRect(1, -41.5, 2, 2);
    eyesGlow(c, 0.2, -40.5, P.glow2, 1.8, 0.6);
    // волосы
    c.fillStyle = '#1d1624'; c.beginPath(); c.moveTo(-5, -44); c.quadraticCurveTo(-9, -36, -8, -26); c.lineTo(-5, -34); c.closePath(); c.fill();
    // рога
    c.strokeStyle = '#cfc6ad'; c.lineWidth = 1.6;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 3, -44); c.quadraticCurveTo(s * 7, -50, s * 5, -56); c.moveTo(s * 5.5, -49); c.lineTo(s * 9, -52); c.stroke(); }
    // посох с фонарём
    c.strokeStyle = '#2b2522'; c.lineWidth = 2; c.beginPath(); c.moveTo(11, 1); c.lineTo(10, -46); c.quadraticCurveTo(14, -50, 16, -44); c.stroke();
    const lx = 16 + Math.sin(t * 2) * 1, ly = -38;
    c.strokeStyle = '#5b544a'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(16, -44); c.lineTo(lx, ly - 3); c.stroke();
    poly(c, [lx - 2.5, ly - 3, lx + 2.5, ly - 3, lx + 3, ly + 3, lx - 3, ly + 3], '#1e1a18', '#5b544a');
    c.save(); c.globalCompositeOperation = 'lighter';
    ell(c, lx, ly, 2, 2.4, P.glow2);
    const lg = c.createRadialGradient(lx, ly, 0, lx, ly, 14); lg.addColorStop(0, rgba(P.glow2, 0.45)); lg.addColorStop(1, rgba(P.glow2, 0));
    c.fillStyle = lg; c.beginPath(); c.arc(lx, ly, 14, 0, 7); c.fill(); c.restore();
  }
  c.restore();
}

// ------------------------------------------------------------
//  Главный кадр
R.frame = function (dt) {
  const c = R.ctx, cam = R.cam;
  R.time += dt;
  const time = R.time;
  // камера
  if (G.scene === 'menu') {
    cam.tx = Math.sin(time * 0.08) * 120; cam.ty = 240 + Math.cos(time * 0.06) * 50; cam.tz = R.baseZ * 1.15;
  }
  const k = 1 - Math.pow(0.003, dt);
  cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.z += (cam.tz - cam.z) * k;
  R.shakeAmt *= Math.pow(0.02, dt);
  R.sx = (Math.random() - 0.5) * R.shakeAmt; R.sy = (Math.random() - 0.5) * R.shakeAmt;
  if (R.groundDirty && G.map) R.buildGround();

  c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  // фон
  if (!R.bgCv || R.bgEcl !== (G.eclipse > 0) || R.bgScene !== G.scene) R.buildBg();
  c.drawImage(R.bgCv, 0, 0, R.W, R.H);
  if (!G.map) return;

  const z = cam.z;
  const ox = R.W / 2 - cam.x * z + R.sx, oy = R.H / 2 - cam.y * z + R.sy;
  c.setTransform(R.dpr * z, 0, 0, R.dpr * z, R.dpr * ox, R.dpr * oy);
  // земля
  c.drawImage(R.ground, -R.gox, -R.goy, R.ground.width / R.gs, R.ground.height / R.gs);
  // огненные тайлы (подложка)
  R.drawBurnGround(c, time);
  // свет/тьма
  R.drawLighting(c, time, ox, oy, z);
  // подсветки
  R.drawHighlights(c, time);
  // сущности по глубине
  const ents = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const t = G.map[y][x]; if (t.obj) ents.push({ d: x + y, t }); }
  for (const u of G.units) if (!u.dead || u.anim.dying > 0) ents.push({ d: u.rx + u.ry + 0.01, u });
  ents.sort((a, b) => a.d - b.d);
  for (const e of ents) {
    if (e.t) {
      let alpha = 1;
      const tall = e.t.obj === '#' || e.t.obj === 'P' || e.t.obj === 't';
      if (tall) for (const u of G.units) {
        if (u.dead) continue;
        const dx = e.t.x - u.rx, dy = e.t.y - u.ry;
        if (dx >= 0 && dy >= 0 && dx + dy <= 2.2 && dx + dy > 0) { alpha = 0.42; break; }
      }
      if (tall && G.hover && G.sel) { const dx = e.t.x - G.hover.x, dy = e.t.y - G.hover.y; if (dx >= 0 && dy >= 0 && dx + dy <= 2 && dx + dy > 0) alpha = Math.min(alpha, 0.5); }
      R.drawObject(c, e.t, time, alpha);
    } else R.drawUnitWorld(c, e.u, time);
  }
  // огонь (над)
  R.drawBurnFlames(c, time);
  // частицы
  FX.draw(c, time);
  // верхний слой: полоски ОЗ, иконки
  for (const u of G.units) if (!u.dead && G.scene === 'battle') R.drawUnitHud(c, u, time);
  R.drawTargetHud(c, time);
  FX.drawTexts(c);

  // экранные слои
  c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  if (!R.low) R.drawFog(c, time);
  // ульт-тонировка
  if (G.dawn > 0) { c.fillStyle = 'rgba(255,200,120,0.06)'; c.fillRect(0, 0, R.W, R.H); }
  if (G.eclipse > 0) { c.fillStyle = 'rgba(60,20,100,0.05)'; c.fillRect(0, 0, R.W, R.H); }
  // кинематографичные полосы
  R.letter += ((R.letterT > 0 ? 1 : 0) - R.letter) * Math.min(1, dt * 6);
  if (R.letterT > 0) R.letterT -= dt;
  if (R.letter > 0.01) {
    const h = R.H * 0.09 * R.letter;
    c.fillStyle = '#000'; c.fillRect(0, 0, R.W, h); c.fillRect(0, R.H - h, R.W, h);
  }
};

R.buildBg = function () {
  const cv = R.bgCv || (R.bgCv = document.createElement('canvas'));
  cv.width = R.W; cv.height = R.H; R.bgEcl = G.eclipse > 0; R.bgScene = G.scene;
  const c = cv.getContext('2d');
  const bg = c.createLinearGradient(0, 0, 0, R.H);
  bg.addColorStop(0, '#07050b'); bg.addColorStop(0.55, '#130c18'); bg.addColorStop(1, '#07050a');
  c.fillStyle = bg; c.fillRect(0, 0, R.W, R.H);
  R.drawSky(c, 0);
};
R.drawSky = function (c, time) {
  // луна
  const mx = G.scene === 'menu' ? R.W * 0.9 : R.W * 0.7, my = G.scene === 'menu' ? R.H * 0.12 : R.H * 0.2;
  c.save(); c.globalCompositeOperation = 'lighter';
  const mg = c.createRadialGradient(mx, my, 0, mx, my, 220);
  const ecl = G.eclipse > 0;
  mg.addColorStop(0, ecl ? 'rgba(140,80,220,0.25)' : 'rgba(200,190,230,0.2)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = mg; c.fillRect(mx - 220, my - 220, 440, 440);
  c.restore();
  ell(c, mx, my, 34, 34, ecl ? '#120a1c' : '#cfc8dc');
  if (!ecl) { ell(c, mx + 10, my - 6, 30, 30, 'rgba(19,12,24,0.55)'); }
  else { c.strokeStyle = 'rgba(190,140,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(mx, my, 34, 0, 7); c.stroke(); }
  // дальние шпили
  c.fillStyle = '#0c0910';
  const base = R.H * 0.62;
  for (let i = 0; i < 9; i++) {
    const x = ((i * 233 + 40) % (R.W + 200)) - 100;
    const h = 60 + (i * 97 % 110);
    c.beginPath(); c.moveTo(x - 18, base); c.lineTo(x - 10, base - h); c.lineTo(x - 4, base - h - 30); c.lineTo(x + 2, base - h); c.lineTo(x + 14, base); c.fill();
  }
};

R.drawLighting = function (c, time, ox, oy, z) {
  const lc = R.lightCv, lx = lc.getContext('2d');
  const sc = 0.5;
  lx.setTransform(1, 0, 0, 1, 0, 0);
  lx.globalCompositeOperation = 'source-over';
  lx.clearRect(0, 0, lc.width, lc.height);
  let dark = 0.62; if (G.dawn > 0) dark = 0.12; if (G.eclipse > 0) dark = 0.72;
  if (G.scene === 'menu') dark = 0.55;
  // темнота только на платформе
  lx.setTransform(sc * z, 0, 0, sc * z, sc * ox, sc * oy);
  lx.fillStyle = `rgba(5,2,12,${dark})`;
  const L = iso(0, MH - 1), B = iso(MW - 1, MH - 1), Rr = iso(MW - 1, 0), T = iso(0, 0);
  lx.beginPath(); lx.moveTo(T.x, T.y - TH / 2 - 80); lx.lineTo(Rr.x + TW / 2 + 40, Rr.y); lx.lineTo(B.x, B.y + TH / 2 + 130); lx.lineTo(L.x - TW / 2 - 40, L.y); lx.closePath(); lx.fill();
  // вырезы света
  lx.globalCompositeOperation = 'destination-out';
  const srcs = lightSources(true);
  for (const s of srcs) {
    if (s.i <= 0) continue;
    const p = iso(s.x, s.y);
    const fl = s.kind === 'altar' ? 1 + 0.08 * Math.sin(time * 1.5) : 0.94 + 0.06 * Math.sin(time * 11 + s.x * 3) + 0.03 * Math.sin(time * 23 + s.y);
    const r = s.r * TW * 0.55 * fl;
    lx.save(); lx.translate(p.x, p.y - 4); lx.scale(1, 0.5);
    const g = lx.createRadialGradient(0, 0, 0, 0, 0, r);
    const a = Math.min(1, s.i);
    g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.55, `rgba(0,0,0,${a * 0.75})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = g; lx.beginPath(); lx.arc(0, 0, r, 0, 7); lx.fill(); lx.restore();
  }
  c.save(); c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  c.drawImage(lc, 0, 0, R.W, R.H);
  c.restore();
  // тёплые/цветные отсветы
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const s of srcs) {
    const p = iso(s.x, s.y);
    const fl = 0.9 + 0.1 * Math.sin(time * 9 + s.x * 2);
    const r = s.r * TW * 0.5 * fl;
    c.save(); c.translate(p.x, p.y - 4); c.scale(1, 0.5);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    const col = s.kind === 'brazier' || s.kind === 'fire' ? '255,140,50' : s.kind === 'altar' ? '190,50,90' : '120,60,200';
    const a = s.kind === 'void' ? 0.22 : s.kind === 'altar' ? 0.22 : 0.2;
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.restore();
  }
  c.restore();
  // символ тьмы на тёмных клетках в режиме прицеливания/движения
  if (G.scene === 'battle' && G.sel && !G.spectator && G.light && !R.low) {
    c.save(); c.globalAlpha = 0.18;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (isLit(x, y) || G.map[y][x].obj) continue;
      const p = iso(x, y); c.fillStyle = '#8c7cc8'; c.beginPath(); c.arc(p.x + 18, p.y + 2, 1.6, 0, 7); c.fill();
    }
    c.restore();
  }
};

R.drawBurnGround = function (c, time) {
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = G.map[y][x]; if (t.burn <= 0) continue;
    const p = iso(x, y);
    diamond(c, p.x, p.y, 0.92);
    const ord = t.burnSide === 'order';
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 30);
    g.addColorStop(0, ord ? 'rgba(255,120,30,0.5)' : 'rgba(40,0,60,0.75)'); g.addColorStop(1, ord ? 'rgba(120,20,0,0.15)' : 'rgba(10,0,20,0.5)');
    c.fillStyle = g; c.fill();
  }
};
R.drawBurnFlames = function (c, time) {
  c.save();
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = G.map[y][x]; if (t.burn <= 0 || t.obj) continue;
    const p = iso(x, y); const ord = t.burnSide === 'order';
    c.globalCompositeOperation = ord ? 'lighter' : 'source-over';
    for (let i = 0; i < 4; i++) {
      const ox = ((i * 37 + t.seed) % 30) - 15, oy = ((i * 13 + t.seed) % 10) - 5;
      const h = 10 + 6 * Math.sin(time * 8 + i * 1.7 + t.seed) + (t.burn > 1 ? 6 : 0);
      const g = c.createLinearGradient(0, p.y + oy, 0, p.y + oy - h);
      if (ord) { g.addColorStop(0, 'rgba(255,170,60,0.75)'); g.addColorStop(1, 'rgba(255,60,0,0)'); }
      else { g.addColorStop(0, 'rgba(20,0,30,0.9)'); g.addColorStop(0.6, 'rgba(90,30,150,0.5)'); g.addColorStop(1, 'rgba(60,0,100,0)'); }
      c.fillStyle = g; c.beginPath();
      const bx = p.x + ox, by = p.y + oy, w = 5;
      c.moveTo(bx - w, by); c.quadraticCurveTo(bx - w * 0.5, by - h * 0.6, bx + Math.sin(time * 6 + i) * 2, by - h); c.quadraticCurveTo(bx + w * 0.5, by - h * 0.6, bx + w, by); c.fill();
    }
    if (Math.random() < 0.15) FX.spawn({ type: ord ? 'ember' : 'voidember', x: p.x + rnd(-16, 16), y: p.y + rnd(-6, 6), vx: rnd(-8, 8), vy: rnd(-40, -20), life: rnd(0.8, 1.6), size: rnd(1, 2.2) });
  }
  c.restore();
};

R.drawUnitWorld = function (c, u, time) {
  const p = iso(u.rx, u.ry);
  let ox = 0, oy = 0;
  if (u.anim.lunge) { const l = iso(u.anim.lx, u.anim.ly); const k = u.anim.lunge * 0.35; ox = l.x * k; oy = l.y * k; }
  if (u.anim.hurt > 0) { ox += (Math.random() - 0.5) * 4 * u.anim.hurt; }
  const x = p.x + ox, y = p.y + oy;
  const dying = u.anim.dying;
  c.save(); c.translate(x, y);
  // кольцо фракции
  if (!u.dead && G.scene === 'battle') {
    const P = FACTIONS[u.side].pal;
    const sel = G.sel === u;
    const active = G.side === u.side && u.ap > 0 && !G.spectator && !isAI(u.side);
    c.save(); c.scale(1, 0.5);
    if (sel) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(0, 0, 8, 0, 0, 30); g.addColorStop(0, rgba(P.glow, 0.0)); g.addColorStop(0.7, rgba(P.glow, 0.35)); g.addColorStop(1, rgba(P.glow, 0));
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 30, 0, 7); c.fill(); c.restore();
      c.strokeStyle = P.glow; c.lineWidth = 2;
      c.setLineDash([6, 4]); c.lineDashOffset = -time * 20; c.beginPath(); c.arc(0, 0, 22, 0, 7); c.stroke(); c.setLineDash([]);
    }
    c.strokeStyle = rgba(P.glow, active ? 0.85 : 0.4); c.lineWidth = active ? 2 : 1.4;
    c.beginPath(); c.arc(0, 0, 17, 0, 7); c.stroke();
    if (u.st.bulwark) { c.strokeStyle = rgba('#f4e2a8', 0.7); c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, 25 + Math.sin(time * 3), 0, 7); c.stroke(); }
    c.restore();
  }
  // тень
  ell(c, 0, 0, 13, 5.5, 'rgba(0,0,0,0.45)');
  // освещённость
  let alpha = 1;
  if (dying > 0) { alpha = Math.max(0, 1 - dying); }
  if (u.st.concealed) alpha *= (u.side === G.side || G.spectator || !isAI(u.side)) ? 0.45 : 0.3;
  let tint = null, ta = 0;
  if (dying > 0) { tint = '#3a2a1a'; ta = Math.min(0.85, dying); c.translate(0, dying * 4); }
  else if (u.anim.flash > 0) { tint = '#ffffff'; ta = 0.75; }
  else if (G.light && !u.dead) { const l = clamp(lightAt(u.x, u.y), 0, 1.2); const b = 0.55 + l * 0.45; if (b < 0.97) { tint = '#06030c'; ta = Math.min(0.32, (1 - b) * 0.75); } }
  c.globalAlpha = alpha;
  if (!tint) R.drawUnit(c, u, time);
  else {
    const sc = R.spriteScale();
    const sp = R.sprite || (R.sprite = document.createElement('canvas'));
    const SW = 96, SH = 100;
    if (sp.width !== SW * sc) { sp.width = SW * sc; sp.height = SH * sc; }
    const s2 = sp.getContext('2d');
    s2.setTransform(1, 0, 0, 1, 0, 0); s2.globalCompositeOperation = 'source-over'; s2.clearRect(0, 0, sp.width, sp.height);
    s2.setTransform(sc, 0, 0, sc, SW / 2 * sc, (SH - 12) * sc);
    R.drawUnit(s2, u, time);
    s2.setTransform(1, 0, 0, 1, 0, 0); s2.globalCompositeOperation = 'source-atop';
    s2.fillStyle = rgba(tint, ta); s2.fillRect(0, 0, sp.width, sp.height);
    c.drawImage(sp, -SW / 2, -(SH - 12), SW, SH);
  }
  c.restore();
};
R.spriteScale = function () { return Math.min(3, Math.max(1, Math.ceil(R.cam.z * R.dpr))); };

R.drawUnitHud = function (c, u, time) {
  const p = iso(u.rx, u.ry);
  const P = FACTIONS[u.side].pal;
  const top = p.y - 64;
  // ОЗ сегменты
  const n = u.maxHp, w = 3, gap = 1, tw = n * (w + gap) - gap;
  const x0 = p.x - tw / 2;
  c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(x0 - 2, top - 2, tw + 4, 8);
  for (let i = 0; i < n; i++) {
    c.fillStyle = i < u.hp ? (u.side === 'order' ? '#e9b45a' : '#a77bff') : 'rgba(80,70,90,0.5)';
    if (i < u.hp && u.hp <= u.maxHp * 0.35) c.fillStyle = '#ff4b4b';
    c.fillRect(x0 + i * (w + gap), top, w, 4);
  }
  // ОД (только в свой ход)
  if (u.side === G.side && u.ap > 0) {
    for (let i = 0; i < u.ap; i++) { ell(c, p.x - (u.ap - 1) * 4 + i * 8, top - 6, 2.4, 2.4, '#7fe0ff', 'rgba(0,0,0,0.6)'); }
  }
  // статусы
  const icons = [];
  if (u.st.watch) icons.push(['eye', '#ffe08a']);
  if (u.st.bulwark) icons.push(['shield', '#f4e2a8']);
  if (u.st.concealed) icons.push(['hood', P.glow]);
  if (u.st.blessed > 0) icons.push(['star', '#ffe9a0']);
  if (u.st.cursed > 0) icons.push(['curse', '#c79bff']);
  if (u.st.taunt) icons.push(['horn', '#ff9b6b']);
  if (u.guard) icons.push(['guard', '#9fc4ff']);
  let ix = p.x - (icons.length - 1) * 6;
  for (const [k, col] of icons) { R.miniIcon(c, k, ix, top - 15, col); ix += 12; }
};
R.miniIcon = function (c, k, x, y, col) {
  c.save(); c.translate(x, y); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 1.2;
  ell(c, 0, 0, 5.5, 5.5, 'rgba(0,0,0,0.75)', col, 0.8);
  c.fillStyle = col;
  switch (k) {
    case 'eye': ell(c, 0, 0, 3.5, 1.8, null, col, 1); ell(c, 0, 0, 1, 1, col); break;
    case 'shield': poly(c, [-3, -3, 3, -3, 3, 0, 0, 3.5, -3, 0], col); break;
    case 'hood': poly(c, [-3, 3, -2.5, -2, 0, -3.5, 2.5, -2, 3, 3], col); break;
    case 'star': poly(c, [0, -3.5, 1, -1, 3.5, -1, 1.5, 0.8, 2.2, 3.5, 0, 2, -2.2, 3.5, -1.5, 0.8, -3.5, -1, -1, -1], col); break;
    case 'curse': c.beginPath(); c.arc(0, 0, 2.6, 0, 5); c.stroke(); break;
    case 'horn': poly(c, [-3, 2, 2, -3, 3, -2, -1, 3], col); break;
    case 'guard': c.font = 'bold 6px serif'; c.textAlign = 'center'; c.fillText('+', 0, 2.2); break;
  }
  c.restore();
};

// ------------------------------------------------------------
//  Подсветки клеток: досягаемость, путь, цели
function outlineSet(c, set, color, width) {
  c.strokeStyle = color; c.lineWidth = width; c.beginPath();
  for (const k of set) {
    const x = k % MW, y = (k / MW) | 0; const p = iso(x, y);
    const T = [p.x, p.y - TH / 2], Rr = [p.x + TW / 2, p.y], B = [p.x, p.y + TH / 2], L = [p.x - TW / 2, p.y];
    if (!set.has((y - 1) * MW + x) || y === 0) { c.moveTo(...T); c.lineTo(...Rr); }
    if (!set.has(y * MW + x + 1) || x === MW - 1) { c.moveTo(...Rr); c.lineTo(...B); }
    if (!set.has((y + 1) * MW + x) || y === MH - 1) { c.moveTo(...B); c.lineTo(...L); }
    if (!set.has(y * MW + x - 1) || x === 0) { c.moveTo(...L); c.lineTo(...T); }
  }
  c.stroke();
}
const AP_COL = ['#7fe0ff', '#7fe0ff', '#f2c75c', '#c98a6a', '#c98a6a'];
R.drawHighlights = function (c, time) {
  if (G.scene !== 'battle' || G.winner) return;
  const u = G.sel;
  // зона алтаря
  {
    const pulse = 0.25 + 0.15 * Math.sin(time * 2);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) { const p = iso(x, y); diamond(c, p.x, p.y, 0.96); c.fillStyle = `rgba(200,40,80,${pulse * 0.35})`; c.fill(); }
    c.restore();
  }
  if (!u || u.dead) return;
  const human = !isAI(u.side) && G.side === u.side;
  if (G.mode) { R.drawTargeting(c, u, time); return; }
  if (!human || G.busy || u.ap <= 0) return;
  const r = R.reachCache(u);
  const bands = [new Set(), new Set(), new Set(), new Set()];
  for (let k = 0; k < MW * MH; k++) { const cst = r.cost[k]; if (!isFinite(cst) || cst === 0) continue; const a = apFor(u, cst); if (a >= 1 && a <= 3) bands[a].add(k); }
  c.save();
  for (let a = 3; a >= 1; a--) {
    const set = new Set(); for (let b = 1; b <= a; b++) for (const k of bands[b]) set.add(k);
    for (const k of bands[a]) { const p = iso(k % MW, (k / MW) | 0); diamond(c, p.x, p.y, 0.94); c.fillStyle = rgba(AP_COL[a], a === 1 ? 0.10 : 0.07); c.fill(); }
    if (a === 3) { c.setLineDash([5, 5]); outlineSet(c, set, rgba(AP_COL[a], 0.5), 1.2); c.setLineDash([]); }
    else { outlineSet(c, set, rgba(AP_COL[a], 0.25), 4); outlineSet(c, set, rgba(AP_COL[a], 0.85), 1.5); }
  }
  c.restore();
  // путь
  const h = G.hover;
  if (h && isFinite(r.cost[h.y * MW + h.x]) && r.cost[h.y * MW + h.x] > 0) {
    const path = pathFrom(r, h.x, h.y);
    const a = apFor(u, r.cost[h.y * MW + h.x]);
    const col = AP_COL[a];
    c.save(); c.strokeStyle = col; c.lineWidth = 2.5;
    c.setLineDash([7, 6]); c.lineDashOffset = -time * 30;
    c.beginPath(); let p0 = iso(u.x, u.y); c.moveTo(p0.x, p0.y);
    for (const s of path) { const p = iso(s.x, s.y); c.lineTo(p.x, p.y); }
    c.stroke(); c.setLineDash([]); c.restore();
    const pe = iso(h.x, h.y);
    diamond(c, pe.x, pe.y, 0.8); c.strokeStyle = col; c.lineWidth = 2; c.stroke();
    // значки укрытий в точке
    for (const ci of coverIcons(h, u.side)) {
      const q = iso(h.x + ci.dx * 0.45, h.y + ci.dy * 0.45);
      R.coverShield(c, q.x, q.y - 12, ci.c);
    }
    // тьма/свет
    const lit = isLit(h.x, h.y);
    const fz = 14 / R.cam.z;
    c.font = `700 ${fz}px "Cormorant Garamond", Georgia, serif`; c.textAlign = 'center';
    c.fillStyle = 'rgba(0,0,0,0.78)'; c.fillRect(pe.x - fz * 3.6, pe.y + 9, fz * 7.2, fz * 1.3);
    c.fillStyle = lit ? '#ffd27a' : '#b9a6ff';
    c.fillText(`${a} ОД · ${lit ? 'свет' : 'тьма'}`, pe.x, pe.y + 9 + fz);
    // предупреждение Бдения
    const watchers = alive(foe(u.side)).filter(w => w.st.watch > 0 && path.some(s => dist(w, s) <= 11 && hasLOS(w, s)));
    if (watchers.length && !u.st.concealed) { c.fillStyle = '#ffe08a'; c.fillText('⚠ под Бдением', pe.x, pe.y + 12 + fz * 2.3); }
    if (path.some(s => tile(s.x, s.y).burn > 0)) { c.fillStyle = '#ff9d3a'; c.fillText('огонь: −2 ОЗ', pe.x, pe.y + 12 + fz * (watchers.length ? 3.5 : 2.3)); }
  }
};
R.coverShield = function (c, x, y, v) {
  const full = v >= 40;
  c.save(); c.translate(x, y);
  poly(c, [-5, -6, 5, -6, 5, 0, 0, 6, -5, 0], full ? 'rgba(127,224,255,0.9)' : 'rgba(0,0,0,0.4)', full ? '#d8f6ff' : '#f2c75c', 1.5);
  if (!full) poly(c, [-5, -6, 0, -6, 0, 6, -5, 0], 'rgba(242,199,92,0.9)');
  c.restore();
};
R._rc = null;
R.reachCache = function (u) {
  const key = u.id + ':' + u.x + ':' + u.y + ':' + u.ap + ':' + G.units.map(v => v.dead ? 'd' : v.x + ',' + v.y).join('|') + ':' + G.turnCount;
  if (!R._rc || R._rc.key !== key) R._rc = { key, r: reach(u) };
  return R._rc.r;
};
R.drawTargeting = function (c, u, time) {
  const id = G.mode; const A = ABIL[id]; const ty = abType(id, u.side);
  // радиус
  c.save(); const p0 = iso(u.x, u.y);
  c.translate(p0.x, p0.y); c.scale(1, 0.5);
  c.strokeStyle = 'rgba(255,90,70,0.35)'; c.setLineDash([5, 7]); c.lineWidth = 1.5;
  const rr = (A.range || 5) * TW / Math.SQRT2;
  c.beginPath(); c.arc(0, 0, rr, 0, 7); c.stroke(); c.setLineDash([]);
  c.restore();
  if (ty === 'aoe') {
    const tiles = R.aoeCache(u);
    c.save(); for (const t of tiles) { const p = iso(t.x, t.y); diamond(c, p.x, p.y, 0.9); c.fillStyle = 'rgba(255,90,60,0.07)'; c.fill(); } c.restore();
    const h = G.hover;
    if (h && tiles.some(t => t.x === h.x && t.y === h.y)) {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const t of aoeArea(h.x, h.y)) {
        const p = iso(t.x, t.y); diamond(c, p.x, p.y, 0.95);
        c.fillStyle = u.side === 'order' ? `rgba(255,120,40,${0.25 + 0.1 * Math.sin(time * 6)})` : `rgba(150,80,255,${0.25 + 0.1 * Math.sin(time * 6)})`; c.fill();
      }
      c.restore();
    }
    return;
  }
  const targets = R.targetCache(u, id);
  for (const t of targets) {
    const p = iso(t.x, t.y);
    const enemy = t.side && t.side !== u.side;
    const col = t.obj ? '#ffb04a' : enemy ? '#ff5a4a' : '#7dff9e';
    c.save(); c.translate(p.x, p.y); c.rotate(time * 0.8); c.scale(1, 1);
    c.strokeStyle = col; c.lineWidth = 1.8;
    for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.arc(0, 0, 20, -0.5, 0.5); c.stroke(); }
    c.restore();
  }
};
R._ac = null; R._tc = null;
R.aoeCache = function (u) { const key = u.id + ':' + u.x + ':' + u.y + ':' + G.turnCount + ':' + G.units.filter(v => !v.dead).length; if (!R._ac || R._ac.key !== key) R._ac = { key, t: aoeTiles(u) }; return R._ac.t; };
R.targetCache = function (u, id) { const key = u.id + ':' + id + ':' + u.x + ':' + u.y + ':' + u.ap + ':' + G.turnCount + ':' + G.units.map(v => v.dead ? 'd' : v.x + ',' + v.y + (v.st.concealed ? 'c' : '')).join('|'); if (!R._tc || R._tc.key !== key) R._tc = { key, t: targetsFor(u, id) }; return R._tc.t; };

R.drawTargetHud = function (c, time) {
  const u = G.sel; if (!u || !G.mode || !G.hover) return;
  const ty = abType(G.mode, u.side);
  if (ty !== 'attack') return;
  const t = unitAt(G.hover.x, G.hover.y);
  if (!t || !R.targetCache(u, G.mode).includes(t)) return;
  const calc = calcAttack(u, t, G.mode);
  const p = iso(t.x, t.y);
  // линия
  const a = iso(u.x, u.y);
  c.save(); c.strokeStyle = 'rgba(255,90,70,0.6)'; c.lineWidth = 1.5; c.setLineDash([3, 5]); c.lineDashOffset = -time * 25;
  c.beginPath(); c.moveTo(a.x, a.y - 26); c.lineTo(p.x, p.y - 26); c.stroke(); c.restore();
  // плашка
  c.save(); c.translate(p.x, p.y - 90);
  poly(c, [-30, -16, 30, -16, 34, 0, 30, 16, -30, 16, -34, 0], 'rgba(10,6,12,0.85)', '#ff5a4a', 1.2);
  c.font = '700 20px Cinzel, Georgia, serif'; c.textAlign = 'center'; c.fillStyle = '#ffe6d0';
  c.fillText(calc.hit + '%', 0, 2);
  c.font = '600 9px "Cormorant Garamond", Georgia, serif'; c.fillStyle = '#ffb08a';
  c.fillText('крит ' + calc.crit + '%', 0, 12);
  c.restore();
};

R.drawFog = function (c, time) {
  c.save();
  for (let i = 0; i < 3; i++) {
    const x = ((time * (8 + i * 3) + i * 400) % (R.W + 600)) - 300;
    const y = R.H * (0.3 + i * 0.13) + Math.sin(time * 0.2 + i) * 30;
    const r = 260 + i * 40;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, i % 2 ? 'rgba(80,60,110,0.07)' : 'rgba(110,90,110,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  c.restore();
};
