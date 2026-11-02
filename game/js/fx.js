'use strict';
// ============================================================
//  Таймеры, эффекты, частицы, звук
// ============================================================
const Timers = [];
function wait(ms) { return new Promise(r => Timers.push({ t: 0, dur: ms / 1000, r })); }
function tween(dur, fn) { return new Promise(r => Timers.push({ t: 0, dur, r, fn })); }
function tickTimers(dt) {
  for (let i = Timers.length - 1; i >= 0; i--) {
    const T = Timers[i]; T.t += dt;
    const f = Math.min(1, T.t / T.dur);
    if (T.fn) T.fn(f < 1 ? (1 - Math.cos(f * Math.PI)) / 2 : 1);
    if (T.t >= T.dur) { Timers.splice(i, 1); T.r(); }
  }
}

const FX = { parts: [], texts: [], projs: [], rings: [], slowmo: 0 };
FX.clear = function () { FX.parts.length = 0; FX.texts.length = 0; FX.projs.length = 0; FX.rings.length = 0; };
FX.spawn = function (p) { if (FX.parts.length < (R.low ? 500 : 1800)) { p.age = 0; FX.parts.push(p); } };
const W = (x, y) => iso(x, y);

FX.float = function (x, y, text, color, scale = 1, dy = 0) {
  const p = W(x, y);
  // не накладывать тексты
  let off = 0; for (const t of FX.texts) if (Math.abs(t.x - p.x) < 30 && t.age < 0.5) off += 17;
  FX.texts.push({ x: p.x, y: p.y - 96 - off - dy, text, color, scale, age: 0, life: 1.6 });
};
FX.drawTexts = function (c) {
  for (const t of FX.texts) {
    const a = t.age < 0.15 ? t.age / 0.15 : Math.max(0, 1 - (t.age - 0.8) / 0.8);
    const s = t.scale * (t.age < 0.15 ? 0.6 + 2.6 * t.age : 1);
    c.save(); c.globalAlpha = Math.min(1, a); c.translate(t.x, t.y - t.age * 22); c.scale(s, s);
    c.font = '700 15px Cinzel, Georgia, serif'; c.textAlign = 'center';
    const tw = c.measureText(t.text).width; c.fillStyle = 'rgba(5,3,8,0.55)'; c.fillRect(-tw / 2 - 5, -14, tw + 10, 19);
    c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(t.text, 0, 0);
    c.fillStyle = t.color; c.fillText(t.text, 0, 0);
    c.restore();
  }
};
FX.shake = function (n) { R.shakeAmt = Math.max(R.shakeAmt, n); };
FX.cinematic = function (x, y) {
  FX.slowmo = 0.9; R.letterT = 1.6;
  const p = iso(x, y); R.cam.tx = p.x * 0.6; R.cam.ty = p.y * 0.6 + 96; R.cam.tz = R.baseZ * 1.12;
  setTimeout(() => { R.cam.tz = R.baseZ; }, 1700);
};

FX.update = function (dt) {
  for (let i = FX.parts.length - 1; i >= 0; i--) {
    const p = FX.parts[i]; p.age += dt;
    if (p.age >= p.life) { FX.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.g) p.vy += p.g * dt;
    if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
    if (p.type === 'ash') p.vx += Math.sin(p.age * 2 + p.size * 9) * 6 * dt;
    if (p.floor !== undefined && p.y > p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.5; p.g = 0; }
  }
  for (let i = FX.texts.length - 1; i >= 0; i--) { FX.texts[i].age += dt; if (FX.texts[i].age > FX.texts[i].life) FX.texts.splice(i, 1); }
  for (let i = FX.rings.length - 1; i >= 0; i--) { const r = FX.rings[i]; r.age += dt; if (r.age > r.life) FX.rings.splice(i, 1); }
  for (let i = FX.projs.length - 1; i >= 0; i--) {
    const pr = FX.projs[i]; pr.age += dt;
    const f = Math.min(1, pr.age / pr.dur);
    const x = pr.ax + (pr.bx - pr.ax) * f, y = pr.ay + (pr.by - pr.ay) * f - Math.sin(f * Math.PI) * pr.arc;
    pr.px = pr.x; pr.py = pr.y; pr.x = x; pr.y = y;
    const col = pr.col;
    if (pr.type === 'orb' || pr.type === 'fireball' || pr.type === 'hex' || pr.type === 'heal') {
      for (let k = 0; k < 3; k++) FX.spawn({ type: 'glow', x: x + rnd(-2, 2), y: y + rnd(-2, 2), vx: rnd(-15, 15), vy: rnd(-15, 15), life: rnd(0.25, 0.5), size: pr.type === 'fireball' ? rnd(3, 6) : rnd(2, 3.5), col });
    } else if (pr.type === 'arrow' || pr.type === 'knife') {
      if (Math.random() < 0.6) FX.spawn({ type: 'glow', x, y, vx: 0, vy: 0, life: 0.25, size: 1.2, col });
    }
    if (f >= 1) { FX.projs.splice(i, 1); pr.r(); }
  }
  // атмосферный пепел
  if (G.map && Math.random() < 0.6) {
    const w = R.toWorld(Math.random() * R.W, -20);
    FX.spawn({ type: 'ash', x: w.x, y: w.y, vx: rnd(-6, 10), vy: rnd(14, 28), life: rnd(8, 14), size: rnd(0.6, 1.6) });
  }
  if (G.map && Math.random() < 0.18) {
    const w = R.toWorld(Math.random() * R.W, R.H * (0.5 + Math.random() * 0.5));
    FX.spawn({ type: 'ember', x: w.x, y: w.y, vx: rnd(-6, 6), vy: rnd(-30, -12), life: rnd(2, 4), size: rnd(0.7, 1.4) });
  }
  // жаровни
  if (G.map && G.eclipse <= 0) for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = G.map[y][x]; if (t.obj !== 'B' || !t.lit) continue;
    if (Math.random() < 0.35) { const p = iso(x, y); FX.spawn({ type: 'ember', x: p.x + rnd(-6, 6), y: p.y - 30, vx: rnd(-10, 10), vy: rnd(-55, -25), life: rnd(0.8, 1.8), size: rnd(0.8, 1.8) }); }
    if (Math.random() < 0.08) { const p = iso(x, y); FX.spawn({ type: 'smoke', x: p.x, y: p.y - 40, vx: rnd(-4, 4), vy: rnd(-16, -8), life: rnd(2, 3), size: rnd(6, 10) }); }
  }
  // мистики и жрецы — искры
  for (const u of G.units) {
    if (u.dead) { if (u.anim.dying > 0) u.anim.dying = Math.min(1.01, u.anim.dying + dt * 0.8); if (u.anim.dying > 1) u.anim.dying = 0; continue; }
    if (u.anim.flash > 0) u.anim.flash -= dt;
    if (u.anim.hurt > 0) u.anim.hurt = Math.max(0, u.anim.hurt - dt * 3);
    if (u.cls === 'mystic' && Math.random() < 0.25) {
      const p = iso(u.rx, u.ry); const P = FACTIONS[u.side].pal;
      FX.spawn({ type: 'glow', x: p.x + 11 * u.face + rnd(-2, 2), y: p.y - 56, vx: rnd(-5, 5), vy: rnd(-25, -10), life: rnd(0.4, 0.9), size: rnd(1, 2), col: P.glow });
    }
  }
};

FX.draw = function (c, time) {
  // кольца
  for (const r of FX.rings) {
    const f = r.age / r.life; const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - f, 3));
    c.save(); c.translate(r.x, r.y); c.scale(1, 0.5); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = rgba(r.col, (1 - f) * 0.9); c.lineWidth = r.w * (1 - f) + 0.5;
    c.beginPath(); c.arc(0, 0, rad, 0, 7); c.stroke(); c.restore();
  }
  // частицы
  for (const p of FX.parts) {
    const f = p.age / p.life;
    switch (p.type) {
      case 'ash': c.fillStyle = `rgba(170,160,170,${0.35 * (1 - f) * Math.min(1, p.age)})`; c.fillRect(p.x, p.y, p.size, p.size); break;
      case 'ember': case 'voidember': {
        c.save(); c.globalCompositeOperation = p.type === 'ember' ? 'lighter' : 'source-over';
        c.fillStyle = p.type === 'ember' ? `rgba(255,${150 + 80 * (1 - f) | 0},60,${1 - f})` : `rgba(140,80,230,${(1 - f) * 0.9})`;
        c.beginPath(); c.arc(p.x, p.y, p.size * (1 - f * 0.5), 0, 7); c.fill(); c.restore(); break;
      }
      case 'glow': {
        c.save(); c.globalCompositeOperation = 'lighter';
        c.fillStyle = rgba(p.col, (1 - f) * 0.9); c.beginPath(); c.arc(p.x, p.y, p.size * (1 - f * 0.6), 0, 7); c.fill(); c.restore(); break;
      }
      case 'spark': {
        c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(p.col || '#ffd08a', 1 - f); c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); c.stroke(); c.restore(); break;
      }
      case 'blood': c.fillStyle = `rgba(${p.dark ? '60,40,80' : '120,8,16'},${1 - f * f})`; c.beginPath(); c.arc(p.x, p.y, p.size, 0, 7); c.fill(); break;
      case 'smoke': {
        const r = p.size * (1 + f * 2);
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(${p.col || '60,55,65'},${0.25 * (1 - f)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(p.x - r, p.y - r, r * 2, r * 2); break;
      }
      case 'debris': c.fillStyle = p.col || '#4a4552'; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); break;
      case 'soul': {
        c.save(); c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
        g.addColorStop(0, rgba(p.col, 0.8 * (1 - f))); g.addColorStop(1, rgba(p.col, 0));
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 10, 0, 7); c.fill(); c.restore(); break;
      }
      case 'slash': {
        c.save(); c.globalCompositeOperation = 'lighter'; c.translate(p.x, p.y); c.rotate(p.rot);
        c.strokeStyle = rgba(p.col, 1 - f); c.lineWidth = 4 * (1 - f) + 1;
        c.beginPath(); c.arc(0, 0, p.size, -1.2 + f * 0.6, 1.0 + f * 0.6); c.stroke(); c.restore(); break;
      }
      case 'beam': {
        c.save(); c.globalCompositeOperation = 'lighter';
        c.strokeStyle = rgba(p.col, (1 - f) * 0.9); c.lineWidth = 6 * (1 - f) + 1;
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x2, p.y2); c.stroke();
        c.strokeStyle = `rgba(255,255,255,${1 - f})`; c.lineWidth = 1.5; c.stroke(); c.restore(); break;
      }
      case 'flash': {
        c.save(); c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, rgba(p.col, 0.9 * (1 - f))); g.addColorStop(1, rgba(p.col, 0));
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, p.size, 0, 7); c.fill(); c.restore(); break;
      }
    }
  }
  // снаряды
  for (const pr of FX.projs) {
    if (pr.x === undefined) continue;
    c.save(); c.globalCompositeOperation = 'lighter';
    if (pr.type === 'arrow' || pr.type === 'knife') {
      const ang = Math.atan2(pr.y - (pr.py ?? pr.y), pr.x - (pr.px ?? pr.x));
      c.translate(pr.x, pr.y); c.rotate(ang);
      c.strokeStyle = rgba(pr.col, 0.6); c.lineWidth = 2; c.beginPath(); c.moveTo(-22, 0); c.lineTo(0, 0); c.stroke();
      c.strokeStyle = '#fff6e0'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-8, 0); c.lineTo(3, 0); c.stroke();
    } else {
      const r = pr.type === 'fireball' ? 9 : 6;
      const g = c.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, r * 2.5);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, rgba(pr.col, 0.9)); g.addColorStop(1, rgba(pr.col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(pr.x, pr.y, r * 2.5, 0, 7); c.fill();
    }
    c.restore();
  }
};

const PROJ_COL = {
  order: { arrow: '#ffd59a', orb: '#ff9a3a', fireball: '#ff7a2a', beam: '#ffe7a0', heal: '#9effa8', hex: '#ffe9a0', knife: '#ffffff' },
  coven: { arrow: '#b48cff', orb: '#a77bff', fireball: '#8a4dff', beam: '#7dffd0', heal: '#7dffb8', hex: '#c79bff', knife: '#d9fff2' },
};
FX.projectile = function (from, to, type, side, tgtUnit) {
  const a = iso(from.x, from.y), b = iso(to.x, to.y);
  const col = PROJ_COL[side][type] || '#ffffff';
  const ay = a.y - 30, by = b.y - (tgtUnit ? 26 : 4);
  if (type === 'beam') {
    FX.spawn({ type: 'beam', x: a.x, y: ay, x2: b.x, y2: by, vx: 0, vy: 0, life: 0.45, col });
    FX.spawn({ type: 'flash', x: b.x, y: by, vx: 0, vy: 0, life: 0.4, size: 30, col });
    for (let i = 0; i < 14; i++) FX.spawn({ type: 'glow', x: b.x, y: by, vx: rnd(-80, 80), vy: rnd(-80, 40), life: rnd(0.3, 0.7), size: rnd(1.5, 3), col, drag: 3 });
    return wait(220);
  }
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const speed = type === 'arrow' ? 900 : type === 'knife' ? 700 : type === 'fireball' ? 380 : 500;
  const dur = Math.max(0.12, d / speed);
  const arc = type === 'fireball' ? 60 : type === 'heal' || type === 'hex' ? 30 : type === 'arrow' ? d * 0.06 : 4;
  // вспышка у стрелка
  FX.spawn({ type: 'flash', x: a.x + 10 * from.face, y: ay, vx: 0, vy: 0, life: 0.25, size: 18, col });
  return new Promise(r => {
    FX.projs.push({ ax: a.x + 8 * (from.face || 1), ay, bx: b.x, by, dur, age: 0, type, col, arc, r: () => {
      FX.spawn({ type: 'flash', x: b.x, y: by, vx: 0, vy: 0, life: 0.35, size: type === 'fireball' ? 50 : 24, col });
      const n = type === 'arrow' || type === 'knife' ? 8 : 16;
      for (let i = 0; i < n; i++) FX.spawn({ type: type === 'arrow' || type === 'knife' ? 'spark' : 'glow', x: b.x, y: by, vx: rnd(-120, 120), vy: rnd(-120, 60), life: rnd(0.2, 0.6), size: rnd(1, 3), col, drag: 3 });
      r();
    } });
  });
};
FX.slash = function (x, y, side, big) {
  const p = iso(x, y); const col = side === 'order' ? '#ffe2a0' : '#c9a8ff';
  FX.spawn({ type: 'slash', x: p.x, y: p.y - 26, vx: 0, vy: 0, life: 0.35, size: big ? 26 : 18, rot: rnd(-0.6, 0.6), col });
  for (let i = 0; i < 10; i++) FX.spawn({ type: 'spark', x: p.x, y: p.y - 26, vx: rnd(-160, 160), vy: rnd(-140, 60), life: rnd(0.2, 0.5), col, drag: 2 });
};
FX.blood = function (x, y, side, n) {
  const p = iso(x, y); const dark = side === 'coven';
  for (let i = 0; i < 6 + n * 3; i++) FX.spawn({ type: 'blood', dark, x: p.x + rnd(-4, 4), y: p.y - 26 + rnd(-6, 6), vx: rnd(-70, 70), vy: rnd(-110, -20), g: 380, life: rnd(0.6, 1.4), size: rnd(1, 2.4), floor: p.y + rnd(-6, 8) });
};
FX.dust = function (x, y) {
  const p = iso(x, y);
  for (let i = 0; i < 4; i++) FX.spawn({ type: 'smoke', x: p.x + rnd(-8, 8), y: p.y + rnd(-2, 3), vx: rnd(-10, 10), vy: rnd(-8, -2), life: rnd(0.5, 0.9), size: rnd(3, 5), col: '90,80,90' });
};
FX.debris = function (x, y, kind, big) {
  const p = iso(x, y);
  const n = big ? 30 : 8;
  for (let i = 0; i < n; i++) FX.spawn({ type: 'debris', x: p.x + rnd(-10, 10), y: p.y - rnd(5, 30), vx: rnd(-90, 90), vy: rnd(-160, -40), g: 420, life: rnd(0.8, 1.5), size: rnd(1.5, big ? 5 : 3), col: kind === 't' ? '#2a1d18' : rnd(0, 1) < 0.5 ? '#5a5364' : '#3d3846', floor: p.y + rnd(-8, 10) });
  if (big) for (let i = 0; i < 8; i++) FX.spawn({ type: 'smoke', x: p.x + rnd(-14, 14), y: p.y - rnd(0, 20), vx: rnd(-20, 20), vy: rnd(-25, -5), life: rnd(1, 2), size: rnd(8, 14), col: '90,85,95' });
};
FX.death = function (u) {
  const p = iso(u.x, u.y); const P = FACTIONS[u.side].pal;
  for (let i = 0; i < 50; i++) FX.spawn({ type: 'ember', x: p.x + rnd(-10, 10), y: p.y - rnd(0, 45), vx: rnd(-25, 25), vy: rnd(-60, -15), life: rnd(1, 2.4), size: rnd(0.8, 2.2) });
  for (let i = 0; i < 20; i++) FX.spawn({ type: 'smoke', x: p.x + rnd(-10, 10), y: p.y - rnd(0, 40), vx: rnd(-15, 15), vy: rnd(-30, -10), life: rnd(1.2, 2.2), size: rnd(5, 9), col: '40,35,45' });
  FX.spawn({ type: 'soul', x: p.x, y: p.y - 30, vx: 0, vy: -40, life: 2.2, size: 10, col: P.glow });
  FX.rings.push({ x: p.x, y: p.y, r0: 5, r1: 60, w: 4, col: P.glow, age: 0, life: 0.9 });
};
FX.explosion = function (x, y, side) {
  const p = iso(x, y); const ord = side === 'order';
  const col = ord ? '#ff8a3a' : '#9b5cff';
  FX.rings.push({ x: p.x, y: p.y, r0: 10, r1: 130, w: 8, col, age: 0, life: 0.8 });
  FX.rings.push({ x: p.x, y: p.y, r0: 5, r1: 90, w: 5, col: ord ? '#ffe0a0' : '#5dffc8', age: 0, life: 0.6 });
  FX.spawn({ type: 'flash', x: p.x, y: p.y - 10, vx: 0, vy: 0, life: 0.6, size: 120, col });
  for (let i = 0; i < 70; i++) FX.spawn({ type: ord ? 'ember' : 'voidember', x: p.x + rnd(-30, 30), y: p.y + rnd(-15, 10), vx: rnd(-140, 140), vy: rnd(-220, -40), g: 200, life: rnd(0.6, 1.6), size: rnd(1.2, 3) });
  for (let i = 0; i < 25; i++) FX.spawn({ type: 'smoke', x: p.x + rnd(-40, 40), y: p.y + rnd(-20, 10), vx: rnd(-30, 30), vy: rnd(-40, -10), life: rnd(1.4, 2.6), size: rnd(10, 18), col: ord ? '60,40,30' : '30,10,45' });
};
FX.burst = function (kind, x, y, side) {
  const p = iso(x, y); const P = FACTIONS[side].pal;
  const map = { shield: '#f4e2a8', taunt: '#ff9b6b', watch: '#ffe08a', vanish: P.glow, heal: '#7dff9e', bless: '#ffe9a0', curse: '#c79bff', blood: '#ff3b4b', ignite: '#ff9a3a', douse: '#8f7fbf', reveal: '#ffd9a0' };
  const col = map[kind] || P.glow;
  FX.rings.push({ x: p.x, y: p.y, r0: 6, r1: kind === 'taunt' ? 170 : 46, w: 4, col, age: 0, life: kind === 'taunt' ? 0.9 : 0.6 });
  const n = kind === 'vanish' ? 30 : 18;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.28;
    FX.spawn({ type: kind === 'vanish' || kind === 'douse' ? 'smoke' : 'glow', x: p.x + Math.cos(a) * 10, y: p.y - 20 + Math.sin(a) * 14, vx: Math.cos(a) * rnd(10, 40), vy: rnd(-50, -10), life: rnd(0.5, 1.1), size: kind === 'vanish' || kind === 'douse' ? rnd(5, 9) : rnd(1.2, 2.6), col: kind === 'vanish' || kind === 'douse' ? '40,25,60' : col, drag: 1 });
  }
};
FX.altarPulse = function (side) {
  const p = iso(7.5, 7.5); const col = FACTIONS[side].pal.glow;
  FX.rings.push({ x: p.x, y: p.y, r0: 20, r1: 180, w: 6, col, age: 0, life: 1.2 });
  for (let i = 0; i < 40; i++) FX.spawn({ type: 'glow', x: p.x + rnd(-40, 40), y: p.y + rnd(-20, 20), vx: rnd(-10, 10), vy: rnd(-90, -30), life: rnd(0.8, 1.8), size: rnd(1, 2.5), col });
};
FX.dawn = function () {
  for (let i = 0; i < 160; i++) { const tx = Math.random() * MW, ty = Math.random() * MH; const p = iso(tx, ty); FX.spawn({ type: 'glow', x: p.x, y: p.y, vx: 0, vy: rnd(-60, -20), life: rnd(1, 2.5), size: rnd(1, 2.5), col: '#ffd27a' }); }
  const c = iso(7.5, 7.5); FX.rings.push({ x: c.x, y: c.y, r0: 10, r1: 600, w: 10, col: '#ffd27a', age: 0, life: 1.6 });
};
FX.eclipse = function () {
  for (let i = 0; i < 120; i++) { const tx = Math.random() * MW, ty = Math.random() * MH; const p = iso(tx, ty); FX.spawn({ type: 'smoke', x: p.x, y: p.y, vx: rnd(-10, 10), vy: rnd(-30, -5), life: rnd(1.5, 3), size: rnd(10, 18), col: '30,10,50' }); }
  const c = iso(7.5, 7.5); FX.rings.push({ x: c.x, y: c.y, r0: 600, r1: 10, w: 10, col: '#9b5cff', age: 0, life: 1.6 });
};

// ------------------------------------------------------------
//  Процедурный звук (WebAudio)
const SFX = { ctx: null, on: true, master: null, drone: null };
SFX.init = function () {
  if (SFX.ctx) return;
  try {
    SFX.ctx = new (window.AudioContext || window.webkitAudioContext)();
    SFX.master = SFX.ctx.createGain(); SFX.master.gain.value = 0.5; SFX.master.connect(SFX.ctx.destination);
    // гул
    const g = SFX.ctx.createGain(); g.gain.value = 0.05;
    const f = SFX.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    for (const fr of [55, 55.7, 82.4]) { const o = SFX.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); }
    f.connect(g); g.connect(SFX.master); SFX.drone = g;
  } catch (e) { SFX.ctx = null; }
};
SFX.toggle = function () { SFX.on = !SFX.on; if (SFX.master) SFX.master.gain.value = SFX.on ? 0.5 : 0; return SFX.on; };
SFX.noise = function (dur, freq, q, vol, type = 'bandpass') {
  const a = SFX.ctx; const n = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate); const d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const s = a.createBufferSource(); s.buffer = n; const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = a.createGain(); g.gain.value = vol; s.connect(f); f.connect(g); g.connect(SFX.master); s.start();
};
SFX.tone = function (f0, f1, dur, vol, type = 'sine') {
  const a = SFX.ctx; const o = a.createOscillator(); o.type = type; const g = a.createGain();
  o.frequency.setValueAtTime(f0, a.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  o.connect(g); g.connect(SFX.master); o.start(); o.stop(a.currentTime + dur + 0.05);
};
SFX.play = function (k) {
  if (!SFX.ctx || !SFX.on) return;
  try {
    switch (k) {
      case 'select': SFX.tone(660, 880, 0.08, 0.05, 'triangle'); break;
      case 'click': SFX.tone(400, 300, 0.06, 0.05, 'triangle'); break;
      case 'step': SFX.noise(0.12, 300, 1, 0.15); break;
      case 'slash': SFX.noise(0.25, 2400, 2, 0.35); SFX.tone(300, 120, 0.15, 0.1, 'square'); break;
      case 'whoosh': SFX.noise(0.3, 900, 1, 0.2); break;
      case 'twang': SFX.tone(220, 110, 0.18, 0.15, 'triangle'); SFX.noise(0.1, 3000, 3, 0.12); break;
      case 'magic': SFX.tone(300, 1200, 0.35, 0.08, 'sine'); SFX.tone(450, 1800, 0.35, 0.05, 'triangle'); break;
      case 'hit': SFX.noise(0.18, 180, 1, 0.5, 'lowpass'); SFX.tone(120, 50, 0.2, 0.25); break;
      case 'death': SFX.tone(110, 30, 1.2, 0.35, 'sawtooth'); SFX.noise(1.0, 200, 0.5, 0.25, 'lowpass'); break;
      case 'boom': SFX.noise(1.2, 120, 0.6, 0.8, 'lowpass'); SFX.tone(80, 25, 0.9, 0.4); break;
      case 'crumble': SFX.noise(0.7, 250, 0.7, 0.4, 'lowpass'); break;
      case 'shield': SFX.tone(180, 360, 0.3, 0.12, 'square'); break;
      case 'horn': SFX.tone(98, 110, 0.9, 0.18, 'sawtooth'); break;
      case 'vanish': SFX.noise(0.6, 600, 0.5, 0.2); SFX.tone(800, 200, 0.5, 0.05); break;
      case 'heal': SFX.tone(520, 1040, 0.5, 0.08); SFX.tone(660, 1320, 0.5, 0.05); break;
      case 'blood': SFX.tone(90, 60, 0.4, 0.3, 'square'); break;
      case 'ignite': SFX.noise(0.6, 900, 0.6, 0.25); break;
      case 'douse': SFX.noise(0.6, 4000, 0.4, 0.15, 'highpass'); break;
      case 'dawn': SFX.tone(262, 523, 1.6, 0.12); SFX.tone(330, 659, 1.6, 0.1); SFX.tone(392, 784, 1.6, 0.08); break;
      case 'eclipse': SFX.tone(110, 40, 1.8, 0.3, 'sawtooth'); SFX.tone(116, 41, 1.8, 0.2, 'sawtooth'); break;
      case 'turn': SFX.tone(147, 147, 0.9, 0.12, 'triangle'); SFX.tone(220, 220, 0.9, 0.08, 'triangle'); break;
    }
  } catch (e) { /* звук не критичен */ }
};
