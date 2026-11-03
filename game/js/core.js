'use strict';
// ============================================================
//  Ядро: состояние, правила, бой
// ============================================================
const G = {
  scene: 'menu', map: null, units: [], side: 'order', round: 1,
  res: { order: 3, coven: 3 }, altar: { order: 0, coven: 0 },
  control: { order: 'human', coven: 'ai' }, spectator: false,
  dawn: 0, eclipse: 0, busy: false, winner: null, winReason: '',
  speed: 1, timeScale: 1, sel: null, mode: null, hover: null,
  light: null, gameId: 0, turnCount: 0,
  stats: { order: { dmg: 0, kills: 0, shots: 0, hits: 0 }, coven: { dmg: 0, kills: 0, shots: 0, hits: 0 } },
};

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.5], [1, -1, 1.5], [-1, 1, 1.5], [-1, -1, 1.5]];
let UID = 0;

function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const inb = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
const tile = (x, y) => inb(x, y) ? G.map[y][x] : null;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const foe = s => s === 'order' ? 'coven' : 'order';
const isAI = s => G.control[s] === 'ai';

// ---------------- Карта ----------------
function buildMap() {
  const rows = MAP_TOP.slice();
  for (let y = 8; y < 16; y++) rows.push(MAP_TOP[15 - y].split('').reverse().join(''));
  G.map = [];
  for (let y = 0; y < MH; y++) {
    const r = [];
    for (let x = 0; x < MW; x++) {
      const ch = rows[y][x];
      const t = { x, y, obj: null, ohp: 0, lit: false, burn: 0, burnSide: null, altar: false, rubble: 0, seed: (x * 7919 + y * 104729) % 100000 };
      if (ch === 'A') t.altar = true;
      else if (OBJ[ch]) { t.obj = ch; t.ohp = OBJ[ch].hp; if (ch === 'B') t.lit = true; }
      r.push(t);
    }
    G.map.push(r);
  }
}

const NAME_IDX = {};
function unitName(side, cls) {
  if (CLASSES[cls].faction) return UNIT_NAMES[side][cls];
  const k = side + cls; const i = NAME_IDX[k] = (NAME_IDX[k] || 0) + 1;
  const pool = MERC_NAMES[cls]; const off = side === 'order' ? 0 : 1;
  return pool[(i - 1 + off) % pool.length];
}
const hasTrait = (u, t) => (CLASSES[u.cls].traits || []).includes(t);
const DARK_MISS = 0.15;
// Ночное зрение: герои Ковена и все, у кого есть черта darkvision (нежить, голем)
const nightVision = u => hasTrait(u, 'darkvision') || (u.side === 'coven' && !!CLASSES[u.cls].faction) || (u.side === 'order' && !!CLASSES[u.cls].orderSight);
function makeUnit(side, cls, x, y) {
  const C = CLASSES[cls];
  return {
    id: ++UID, side, cls, name: unitName(side, cls), title: C.names[side],
    armor: C.armor || 0, rage: 0, revived: false, loaded: true, lanternOn: true,
    x, y, rx: x, ry: y, hp: (side === 'coven' && C.hpCoven) || C.hp, maxHp: (side === 'coven' && C.hpCoven) || C.hp, mov: C.mov, aim: C.aim, def: C.def, crit: C.crit,
    ap: 0, guard: 0, bloodUsed: false,
    st: { bulwark: false, watch: 0, concealed: false, blessed: 0, cursed: 0, taunt: null, poison: 0, bleed: 0, blind: 0 },
    face: side === 'order' ? 1 : -1, dead: false, kills: 0,
    anim: { flash: 0, lunge: 0, lx: 0, ly: 0, dying: 0, hurt: 0, cast: 0 },
  };
}

const DEFAULT_ROSTER = ['bastion', 'marksman', 'mystic', 'shade', 'priest'];
const isFront = c => ['bastion', 'shade', 'berserk', 'wolf', 'skelwar', 'golem'].includes(c);
function spawnUnits(rosters) {
  G.units = [];
  for (const k in NAME_IDX) delete NAME_IDX[k];
  rosters = rosters || { order: DEFAULT_ROSTER, coven: DEFAULT_ROSTER };
  for (const side of ['coven', 'order']) {
    // ближники — на передние клетки, катапульта — в самый тыл
    const list = rosters[side].slice(0, MAX_SQUAD).map((c, i) => ({ c, i }))
      .sort((a, b) => (a.c === 'catapult') - (b.c === 'catapult') || isFront(b.c) - isFront(a.c) || a.i - b.i);
    const slots = SLOTS_COVEN.slice();
    if (list.some(o => o.c === 'catapult')) { const back = slots.splice(slots.length - 1, 1)[0]; slots.splice(list.length - 1, 0, back); }
    list.forEach((o, i) => {
      const [x, y] = slots[i];
      G.units.push(side === 'coven' ? makeUnit('coven', o.c, x, y) : makeUnit('order', o.c, 15 - x, 15 - y));
    });
  }
}

function newGame(mode, rosters) {
  if (rosters) G.rosters = rosters;
  G.gameId++;
  Timers.length = 0;
  FX.clear();
  buildMap(); spawnUnits(G.rosters);
  G.round = 1; G.side = 'order'; G.res = { order: 2, coven: 4 }; G.altar = { order: 0, coven: 0 };
  G.dawn = 0; G.eclipse = 0; G.ultRound = { order: -9, coven: -9 };
  G.first = G.forceFirst || (Math.random() < 0.5 ? 'order' : 'coven');
  G.side = G.first; G.res = { order: 3, coven: 3 }; G.res[foe(G.first)] = 4; G.res[G.first] = 3; G.busy = false; G.winner = null; G.winReason = ''; G.sel = null; G.mode = null; G.turnCount = 0;
  G.stats = { order: { dmg: 0, kills: 0, shots: 0, hits: 0 }, coven: { dmg: 0, kills: 0, shots: 0, hits: 0 } };
  G.econ = { order: { turns: 0, atMax: 0, resSum: 0, skills: 0, ults: 0 }, coven: { turns: 0, atMax: 0, resSum: 0, skills: 0, ults: 0 } };
  G.spectator = mode === 'spectator';
  G.control = { order: mode === 'order' ? 'human' : 'ai', coven: mode === 'coven' ? 'human' : 'ai' };
  G.log = [];
  refreshLight();
  R.groundDirty = true;
}

const alive = s => G.units.filter(u => !u.dead && (!s || u.side === s));
function unitAt(x, y) { for (const u of G.units) if (!u.dead && u.x === x && u.y === y) return u; return null; }
function walkable(x, y) { const t = tile(x, y); return !!t && !t.obj; }
function inAltar(x, y) { const t = tile(x, y); return !!t && t.altar; }

// ---------------- Свет ----------------
function lightSources(forRender) {
  const L = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = G.map[y][x];
    if (t.obj === 'B' && t.lit && G.eclipse <= 0) L.push({ x, y, r: 3.6, i: 1.25, kind: 'brazier' });
    if (t.torch > 0 && G.eclipse <= 0) L.push({ x, y, r: 2.9, i: 1.1, kind: 'fire' });
    if (t.burn > 0) {
      if (t.burnSide === 'order') { if (G.eclipse <= 0) L.push({ x, y, r: 2.2, i: 0.9, kind: 'fire' }); }
      else L.push({ x, y, r: 1.9, i: -1.0, kind: 'void' });
    }
  }
  if (G.eclipse <= 0) for (const u of G.units) if (!u.dead && u.side === 'order' && CLASSES[u.cls].orderHalo) L.push({ x: forRender ? u.rx : u.x, y: forRender ? u.ry : u.y, r: 1.9, i: 0.9, kind: 'lantern' });
  if (G.eclipse <= 0) for (const u of G.units) if (!u.dead && u.st.radiant) L.push({ x: forRender ? u.rx : u.x, y: forRender ? u.ry : u.y, r: 2.9, i: 1.1, kind: 'lantern' });
  if (G.eclipse <= 0) for (const u of G.units) if (!u.dead && hasTrait(u, 'lantern') && u.lanternOn) L.push({ x: forRender ? u.rx : u.x, y: forRender ? u.ry : u.y, r: 2.7, i: 1.0, kind: 'lantern' });
  if (forRender) L.push({ x: 7.5, y: 7.5, r: 2.4, i: 0.4, kind: 'altar', visual: true });
  return L;
}
function refreshLight() {
  const src = lightSources(false);
  const g = [];
  for (let y = 0; y < MH; y++) {
    const row = [];
    for (let x = 0; x < MW; x++) {
      let l = 0.1;
      if (G.dawn > 0) l = 1.2;
      else for (const s of src) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < s.r) l += s.i * (1 - (d / s.r) ** 2);
      }
      row.push(clamp(l, 0, 1.5));
    }
    g.push(row);
  }
  G.light = g;
  // сокрытые на свету раскрываются
  for (const u of alive()) if (u.st.concealed && isLit(u.x, u.y) && u.side === 'coven') reveal(u);
}
const lightAt = (x, y) => G.light ? G.light[y][x] : 1;
const isLit = (x, y) => lightAt(x, y) >= 0.45;

// ---------------- Поиск пути ----------------
function reach(u, apBudget) {
  const budget = (apBudget === undefined ? u.ap : apBudget) * effMov(u);
  const cost = new Float32Array(MW * MH).fill(Infinity);
  const prev = new Int16Array(MW * MH).fill(-1);
  const k0 = u.y * MW + u.x; cost[k0] = 0;
  const open = [k0];
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (cost[open[i]] < cost[open[bi]]) bi = i;
    const k = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    const cx = k % MW, cy = (k / MW) | 0;
    for (const [dx, dy, c] of DIRS8) {
      const nx = cx + dx, ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      if (dx && dy && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
      const o = unitAt(nx, ny); if (o && o !== u && !(o.side !== u.side && o.st.concealed)) continue;
      let nc = cost[k] + c;
      const tt = G.map[ny][nx];
      if (tt.burn > 0) nc += 0.01; // лёгкое предпочтение обходить огонь
      if (nc > budget + 1e-6) continue;
      const nk = ny * MW + nx;
      if (nc < cost[nk] - 1e-6) { cost[nk] = nc; prev[nk] = k; open.push(nk); }
    }
  }
  return { cost, prev, u };
}
function pathFrom(r, x, y) {
  const p = []; let k = y * MW + x;
  if (!isFinite(r.cost[k])) return null;
  while (r.prev[k] !== -1) { p.unshift({ x: k % MW, y: (k / MW) | 0 }); k = r.prev[k]; }
  return p;
}
function effMov(u) { return u.mov <= 0 ? 0 : Math.max(1, u.mov - (u.st.poison > 0 ? 2 : 0)); }
function apFor(u, c) { const m = effMov(u); return c <= 1e-6 ? 0 : m <= 0 ? 99 : Math.ceil(c / m - 0.02); }

// ---------------- Видимость и укрытия ----------------
function blocksLOS(x, y) { const t = tile(x, y); return !!t && !!t.obj && !!OBJ[t.obj].los; }
function losLine(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay); const n = Math.ceil(d * 6);
  const sx = Math.round(ax), sy = Math.round(ay), ex = Math.round(bx), ey = Math.round(by);
  for (let i = 1; i < n; i++) {
    const f = i / n; const x = Math.round(ax + (bx - ax) * f), y = Math.round(ay + (by - ay) * f);
    if ((x === sx && y === sy) || (x === ex && y === ey)) continue;
    if (blocksLOS(x, y)) return false;
  }
  return true;
}
function hasLOS(a, b) { return los1(a, b) || los1(b, a); }
function los1(a, b) {
  if (losLine(a.x, a.y, b.x, b.y)) return true;
  // выглядывание из-за полного укрытия
  for (const [dx, dy] of DIRS4) {
    if (!blocksLOS(a.x + dx, a.y + dy)) continue;
    // шаг в сторону перпендикулярно укрытию
    const px = dy !== 0 ? 1 : 0, py = dx !== 0 ? 1 : 0;
    for (const s of [-1, 1]) {
      const nx = a.x + px * s, ny = a.y + py * s;
      if (walkable(nx, ny) && losLine(nx, ny, b.x, b.y)) return true;
    }
  }
  return false;
}
function coverValueAt(x, y, side) {
  const t = tile(x, y); if (!t) return 0;
  if (t.obj) return OBJ[t.obj].cover;
  const u = unitAt(x, y);
  if (u && u.side === side && u.st.bulwark) return 40;
  return 0;
}
// Укрытие цели (стоящей в pos) от атакующего в from
function coverFor(pos, side, from) {
  let dx = from.x - pos.x, dy = from.y - pos.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  let best = 0, tileC = null, any = false;
  for (const [sx, sy] of DIRS4) {
    const c = coverValueAt(pos.x + sx, pos.y + sy, side);
    if (!c) continue; any = true;
    if (pos.x + sx === from.x && pos.y + sy === from.y) continue;
    if (sx * dx + sy * dy > 0.35 && c > best) { best = c; tileC = { x: pos.x + sx, y: pos.y + sy }; }
  }
  return { cover: best, tile: tileC, any };
}
// Ближний бой: «удар в спину» — у цели нет укрытий рядом, либо атакующий
// стоит с противоположной стороны от каждого её укрытия.
function meleeFlank(pos, side, from) {
  let dx = from.x - pos.x, dy = from.y - pos.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  for (const [sx, sy] of DIRS4) {
    if (!coverValueAt(pos.x + sx, pos.y + sy, side)) continue;
    if (sx * dx + sy * dy > -0.3) return false;
  }
  return true;
}
function coverIcons(pos, side) { // для превью при движении
  return DIRS4.map(([sx, sy]) => ({ dx: sx, dy: sy, c: coverValueAt(pos.x + sx, pos.y + sy, side) })).filter(o => o.c);
}

// ---------------- Расчёт атаки ----------------
function defenseOf(t, pos) {
  pos = pos || t;
  const parts = [];
  if (t.def) parts.push(['Уклонение', -t.def]);
  if (t.guard) parts.push(['Стойкость (ОД)', -t.guard]);
  if (t.st.bulwark) parts.push(['Бастион', -20]);
  if (t.st.blessed > 0) parts.push(['Благословение', -15]);
  if (t.st.cursed > 0) parts.push(['Проклятие', +15]);
  if (t.side === 'order' && G.units.some(a => !a.dead && a !== t && a.side === 'order' && Math.max(Math.abs(a.x - pos.x), Math.abs(a.y - pos.y)) === 1)) parts.push(['Братство', -5]);
  return parts;
}
// att может быть «виртуальным» (для ИИ): from = позиция стрельбы
function calcAttack(att, tgt, id, opt = {}) {
  const A = ABIL[id]; const from = opt.from || att; const tpos = opt.tpos || tgt;
  const br = [];
  let hit = att.aim + (A.aim || 0); br.push(['Меткость', att.aim]);
  if (A.aim) br.push([A.melee ? 'Ближний бой' : 'Оружие', A.aim]);
  const d = dist(from, tpos);
  let cover = 0, ctile = null;
  if (!A.melee) {
    const c = coverFor(tpos, tgt.side, from); cover = c.cover; ctile = c.tile;
    if (A.pierce && cover) { cover -= 20; br.push(['Пробитие', 20]); }
    if (cover) br.push([cover >= 40 ? 'Полное укрытие' : 'Половинное укрытие', -cover]);
    if (d <= 2) br.push(['В упор', 10]);
    if (d > 7) br.push(['Дальность', -Math.round((d - 7) * 4)]);
  }
  if (att.st.blessed > 0) br.push(['Благословение', 15]);
  if (att.st.cursed > 0) br.push(['Проклятие', -15]);
  if (att.st.taunt && att.st.taunt !== tgt.id) br.push(['Вызов', -20]);
  if (att.st.concealed && id === 'backstab') br.push(['Из сокрытия', 20]);
  if (G.eclipse > 0 && att.side === 'order') br.push(['Ужас затмения', -10]);
  if (att.st.poison > 0) br.push(['Яд', -10]);
  if (tgt.st.marked && att.side !== tgt.side) br.push(['Метка света', 20]);
  if (att.st.blind > 0) br.push(['Ослеплён', -20]);
  { const ft = tile(from.x, from.y); if (ft && ft.burn > 0 && ft.burnSide === 'coven' && att.side === 'order') br.push(['Чёрное пламя', -10]); }
  if (opt.reaction) br.push(['Ответный выстрел', -10]);
  for (const p of defenseOf(tgt, tpos)) br.push(p);
  hit = br.reduce((s, p) => s + p[1], 0);
  hit = clamp(Math.round(hit), 5, 95);
  let crit = att.crit + (A.crit || 0);
  const exposed = !A.melee ? cover === 0 : meleeFlank(tpos, tgt.side, from);
  if (exposed) crit += A.flankCrit || (A.melee ? 10 : 20);
  crit = clamp(crit, 0, 100);
  // Тьма: единственный эффект — 15% промаха по цели во тьме, если у атакующего нет ночного зрения
  const darkMiss = !nightVision(att) && !A.flare && !isLit(tpos.x, tpos.y) ? DARK_MISS : 0;
  const eff = Math.round(hit * (1 - darkMiss));
  return { hit, crit, br, cover, ctile, exposed, dist: d, darkMiss, eff };
}
function avgDmg(id) { const A = ABIL[id]; return (A.dmg[0] + A.dmg[1]) / 2; }

// ---------------- Способности: проверка и цели ----------------
function abilitiesOf(u) {
  const l = CLASSES[u.cls].abil.slice();
  if (u.cls === 'catapult') return l;
  // особые умения героев Ордена за Веру
  if (u.side === 'order' && CLASSES[u.cls].orderExtra) l.splice(CLASSES[u.cls].abil.length, 0, ...CLASSES[u.cls].orderExtra);
  if (!hasTrait(u, 'construct')) l.push('blood');
  l.push('brazier');
  return l;
}
function meleeOk(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx && dy) return walkable(a.x + dx, a.y) || walkable(a.x, a.y + dy);
  return true;
}
function adjBrazier(u, pos) {
  pos = pos || u;
  for (const [dx, dy] of DIRS8) { const t = tile(pos.x + dx, pos.y + dy); if (t && t.obj === 'B') return t; }
  return null;
}
function resCost(u, id) { return ABIL[id].res || 0; }
function abCost(u, id) { return id === 'vanish' && u.side === 'order' ? 2 : ABIL[id].ap; }
function canUse(u, id) {
  const A = ABIL[id];
  if (u.dead) return { ok: false, why: 'Пал' };
  if (G.side !== u.side) return { ok: false, why: 'Не ваш ход' };
  if (u.ap < abCost(u, id) || (A.apAll && u.ap < 1)) return { ok: false, why: 'Мало ОД' };
  if (A.res && G.res[u.side] < resCost(u, id)) return { ok: false, why: 'Мало ресурса: ' + FACTIONS[u.side].res };
  if (id === 'blood') { if (u.bloodUsed) return { ok: false, why: 'Уже в этом ходу' }; if (u.hp <= 3) return { ok: false, why: 'Слишком мало ОЗ' }; if (u.ap >= MAX_AP + 1) return { ok: false, why: 'ОД на пределе' }; }
  if (id === 'vanish') { if (u.st.concealed) return { ok: false, why: 'Уже сокрыт' }; if (u.side === 'coven' && isLit(u.x, u.y)) return { ok: false, why: 'Нужна тьма' }; if (alive(foe(u.side)).some(e => !e.st.concealed && Math.max(Math.abs(e.x - u.x), Math.abs(e.y - u.y)) <= 2)) return { ok: false, why: 'Враг слишком близко (≤2 клеток)' }; }
  if (id === 'bulwark' && u.st.bulwark) return { ok: false, why: 'Уже активно' };
  if (ABIL[id].needsLoad && !u.loaded) return { ok: false, why: 'Арбалет разряжен — нужна перезарядка' };
  if (id === 'reload' && u.loaded) return { ok: false, why: 'Уже заряжен' };
  if (id === 'quake' && !quakeVictims(u).length) return { ok: false, why: 'Рядом никого нет' };
  if (id === 'flash' && !flashTargets(u).length) return { ok: false, why: 'Нет врагов в радиусе 3' };
  if (id === 'torch' && !torchTiles(u).length) return { ok: false, why: 'Некуда бросить' };
  if (id === 'lob' && !lobTiles(u).length) return { ok: false, why: 'Нет клеток в досягаемости' };
  if (id === 'brazier' && !adjBrazier(u)) return { ok: false, why: 'Нужна соседняя жаровня' };
  if (id === 'taunt' && u.tauntUsed) return { ok: false, why: 'Уже в этом ходу' };
  if (id === 'radiance' && u.st.radiant) return { ok: false, why: 'Уже сияет' };
  if (id === 'litany' && u.litanyUsed) return { ok: false, why: 'Уже в этом ходу' };
  if (id === 'litany' && G.res[u.side] >= RES_MAX) return { ok: false, why: 'Вера на пределе' };
  if (id === 'watch' && u.st.watch) return { ok: false, why: 'Уже активно' };
  if (id === 'taunt' && !targetsFor(u, id).length) return { ok: false, why: 'Нет врагов рядом' };
  const ty = abType(id, u.side);
  if ((ty === 'attack' || ty === 'ally' || ty === 'enemy' || ty === 'brazier') && !targetsFor(u, id).length) return { ok: false, why: id === 'heal' ? 'Нет раненых союзников в радиусе ' + ABIL.heal.range + ' клеток' : 'Нет целей в досягаемости' };
  return { ok: true };
}
function targetsFor(u, id, from) {
  from = from || u;
  const A = ABIL[id]; const ty = abType(id, u.side);
  if (ty === 'attack' || ty === 'enemy') {
    return alive(foe(u.side)).filter(e => !e.st.concealed && dist(from, e) <= A.range + 0.01 && (A.melee ? meleeOk(from, e) : hasLOS(from, e)));
  }
  if (ty === 'ally') {
    return alive(u.side).filter(a => dist(from, a) <= A.range + 0.01 &&
      (id !== 'heal' || a.hp < a.maxHp || tile(a.x, a.y).burn > 0) && (id !== 'hex' || a.st.blessed <= 0));
  }
  if (id === 'taunt') return alive(foe(u.side)).filter(e => !e.st.concealed && dist(from, e) <= 4.01 && hasLOS(from, e));
  if (ty === 'brazier') { const b = adjBrazier(u, from); return b ? [b] : []; }
  return [];
}
function quakeVictims(u, from) { from = from || u; return alive().filter(v => v !== u && Math.max(Math.abs(v.x - from.x), Math.abs(v.y - from.y)) === 1); }
function flashTargets(u, from) { from = from || u; return alive(foe(u.side)).filter(e => dist(from, e) <= 3.01 && hasLOS(from, e)); }
// Катапульта бьёт навесом — стены не мешают, но есть мёртвая зона
function lobTiles(u) {
  const A = ABIL.lob; const res = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const d = Math.hypot(x - u.x, y - u.y);
    if (d < A.minRange - 0.01 || d > A.range + 0.01) continue;
    res.push({ x, y });
  }
  return res;
}
function lobLanding(c) { return lobArea(c.x, c.y)[Math.floor(Math.random() * 9)]; }
function torchTiles(u, from) {
  from = from || u; const res = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (blocksLOS(x, y) || Math.hypot(x - from.x, y - from.y) > ABIL.torch.range + 0.01) continue;
    if (!hasLOS(from, { x, y })) continue;
    res.push({ x, y });
  }
  return res;
}
function lobArea(cx, cy) { const r = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) r.push({ x: cx + dx, y: cy + dy }); return r; }
function aoeTiles(u) {
  const A = ABIL.inferno; const res = [];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (blocksLOS(x, y)) continue;
    if (Math.hypot(x - u.x, y - u.y) > A.range + 0.01) continue;
    if (!hasLOS(u, { x, y })) continue;
    res.push({ x, y });
  }
  return res;
}
function aoeArea(cx, cy) {
  const r = []; for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (inb(x, y) && Math.hypot(x - cx, y - cy) <= ABIL.inferno.radius + 0.01) r.push({ x, y });
  return r;
}

// ---------------- Лог ----------------
function log(html, side) { G.log.push({ html, side, t: Date.now() }); if (G.log.length > 60) G.log.shift(); UI.log(); }
const uName = u => `<b class="c-${u.side}">${u.name}</b>`;

// ---------------- Действия ----------------
function faceTo(u, x, y) { const s = (x - y) - (u.x - u.y); if (Math.abs(s) > 0.01) u.face = s > 0 ? 1 : -1; }
function gainRes(side, n) { G.res[side] = clamp(G.res[side] + n, 0, RES_MAX); }

function reveal(u, why) {
  if (!u.st.concealed) return;
  u.st.concealed = false;
  FX.float(u.x, u.y, 'РАСКРЫТ', '#ffd9a0', 1);
  FX.burst('reveal', u.x, u.y, u.side);
  if (why) log(`${uName(u)} раскрыт: ${why}.`, u.side);
}

async function moveUnit(u, path) {
  if (!path || !path.length) return;
  let c = 0, px = u.x, py = u.y;
  for (const s of path) { c += (s.x !== px && s.y !== py) ? 1.5 : 1; px = s.x; py = s.y; }
  const apStart = u.ap; u.ap = Math.max(0, u.ap - apFor(u, c));
  let walked = 0, wx = u.x, wy = u.y;
  SFX.play('step');
  for (const s of path) {
    if (u.dead || G.winner) break;
    faceTo(u, s.x, s.y);
    const amb = unitAt(s.x, s.y);
    if (amb && amb !== u) { reveal(amb, 'на него наткнулись'); FX.float(u.x, u.y, 'ЗАСАДА!', '#ff9b6b', 1); u.ap = Math.max(u.ap, apStart - Math.max(1, apFor(u, walked))); break; }
    walked += (s.x !== wx && s.y !== wy) ? 1.5 : 1; wx = s.x; wy = s.y;
    const fx = u.x, fy = u.y;
    await tween(0.17, f => { u.rx = fx + (s.x - fx) * f; u.ry = fy + (s.y - fy) * f; });
    u.x = s.x; u.y = s.y; u.rx = s.x; u.ry = s.y;
    if (u.st.radiant || (hasTrait(u, 'lantern') && u.lanternOn) || (u.side === 'order' && CLASSES[u.cls].orderHalo)) refreshLight();
    FX.dust(s.x, s.y);
    const t = tile(s.x, s.y);
    if (t.burn > 0) { await damageUnit(u, 2, null, 'fire'); if (u.dead) break; }
    if (u.st.concealed && u.side === 'coven' && isLit(u.x, u.y)) reveal(u, 'вышел на свет');
    // если рядом стоит сокрытый враг — он раскрыт
    for (const e of alive(foe(u.side))) if (e.st.concealed && Math.max(Math.abs(e.x - u.x), Math.abs(e.y - u.y)) <= 1) reveal(e, 'враг вплотную');
    // Бдение
    if (!u.st.concealed) {
      for (const w of alive(foe(u.side))) {
        if (u.dead || G.winner) break;
        if (w.st.watch > 0 && dist(w, u) <= ABIL.shot.range && hasLOS(w, u)) {
          w.st.watch--;
          FX.float(w.x, w.y, 'БДЕНИЕ!', '#ffe08a', 1);
          await wait(220);
          await doAttack(w, u, 'shot', { reaction: true });
          await wait(150);
        }
      }
    }
  }
}

async function doAttack(att, tgt, id, opt = {}) {
  const A = ABIL[id];
  const calc = calcAttack(att, tgt, id, opt);
  faceTo(att, tgt.x, tgt.y); faceTo(tgt, att.x, att.y);
  G.stats[att.side].shots++;
  const roll = Math.random() * 100;
  let outcome = 'miss';
  if (roll < calc.hit) outcome = Math.random() * 100 < calc.crit ? 'crit' : 'hit';
  else if (roll < calc.hit + 10) outcome = 'graze';
  let dmg = irnd(A.dmg[0], A.dmg[1]);
  if (outcome === 'crit') dmg = Math.ceil(dmg * 1.5);
  if (outcome === 'graze') dmg = Math.max(1, Math.floor(dmg / 2));
  if (outcome === 'miss') dmg = 0;
  if (outcome !== 'miss' && calc.darkMiss && !G.noDarkMiss && Math.random() < calc.darkMiss) { outcome = 'dark'; dmg = 0; }
  // звериные рефлексы: 30% увернуться от любой дальней атаки
  if ((outcome === 'hit' || outcome === 'crit' || outcome === 'graze') && !A.melee && hasTrait(tgt, 'evade') && Math.random() < 0.3) { outcome = 'evade'; dmg = 0; }
  const notes = [];
  if (dmg > 0) {
    if (A.rage && att.rage) { dmg += att.rage; notes.push('ярость +' + att.rage); }
    if (A.phys && tgt.armor && !A.armorPierce) { const d0 = dmg; dmg = Math.max(1, dmg - tgt.armor); if (dmg < d0) notes.push('броня −' + (d0 - dmg)); }
    if (A.phys && A.armorPierce && tgt.armor) notes.push('пробил броню');
    if (A.phys && !A.melee && hasTrait(tgt, 'undead')) { const d0 = dmg; dmg = Math.max(1, Math.floor(dmg / 2)); if (dmg < d0) notes.push('кость: −' + (d0 - dmg)); }
  }
  if (A.needsLoad) att.loaded = false;
  const lethal = dmg >= tgt.hp && !(hasTrait(tgt, 'revive') && !tgt.revived);
  const fromConcealed = att.st.concealed;
  if (att.st.concealed) reveal(att);
  if (lethal) FX.cinematic(tgt.x, tgt.y);

  if (A.melee) {
    att.anim.cast = 0;
    await tween(0.16, f => { att.anim.lunge = f; att.anim.lx = tgt.x - att.x; att.anim.ly = tgt.y - att.y; });
    FX.slash(tgt.x, tgt.y, att.side, outcome === 'crit');
    SFX.play(outcome === 'miss' ? 'whoosh' : 'slash');
  } else {
    att.anim.cast = 1;
    SFX.play(A.proj === 'arrow' ? 'twang' : A.proj === 'knife' ? 'whoosh' : 'magic');
    let tx = tgt.x, ty = tgt.y;
    if (outcome === 'miss') {
      if (calc.ctile && Math.random() < 0.7) { tx = calc.ctile.x + rnd(-0.2, 0.2); ty = calc.ctile.y + rnd(-0.2, 0.2); }
      else { const a = Math.random() * 6.28; tx += Math.cos(a) * 0.9; ty += Math.sin(a) * 0.9; }
    }
    await FX.projectile(att, { x: tx, y: ty }, A.proj, att.side, outcome === 'miss' ? null : tgt);
    att.anim.cast = 0;
  }

  if (outcome === 'dark') {
    FX.float(tgt.x, tgt.y, 'СКРЫТ ТЬМОЙ', '#9c8cd8', 1);
    log(`${uName(att)} → ${uName(tgt)}: тьма скрыла цель — <i>промах</i>.`, att.side);
  } else if (outcome === 'evade') {
    FX.float(tgt.x, tgt.y, 'УВЕРНУЛСЯ', '#c8f0ff', 1);
    log(`${uName(att)} → ${uName(tgt)}: зверь <i>увернулся</i>.`, att.side);
  } else if (outcome === 'miss') {
    FX.float(tgt.x, tgt.y, 'ПРОМАХ', '#9aa0b5', 0.9);
    log(`${uName(att)} → ${uName(tgt)}: <i>промах</i>&nbsp;<span class="nw">(${calc.hit}%)</span>.`, att.side);
    if (calc.ctile) await damageObject(calc.ctile.x, calc.ctile.y, irnd(1, 2));
  } else {
    G.stats[att.side].hits++;
    if (outcome === 'crit') { FX.float(tgt.x, tgt.y, 'КРИТ!', '#ff5a3c', 1.3); FX.shake(9); }
    if (outcome === 'graze') FX.float(tgt.x, tgt.y, 'ЗАДЕЛ', '#d9c49a', 0.85);
    const word = outcome === 'crit' ? '<b class="crit">крит</b>' : outcome === 'graze' ? 'задевает' : 'попадание';
    log(`${uName(att)} → ${uName(tgt)}: ${word},&nbsp;<span class="nw">−${dmg} (${calc.hit}%)</span>${notes.length ? ' <span class="t-dim">[' + notes.join(', ') + ']</span>' : ''}.`, att.side);
    await damageUnit(tgt, dmg, att, outcome);
    if (!tgt.dead && A.poison) { tgt.st.poison = 3; FX.float(tgt.x, tgt.y, 'ОТРАВЛЕН', '#9dff6a', 0.9); }
    if (!tgt.dead && A.bleed) { tgt.st.bleed = 3; FX.float(tgt.x, tgt.y, 'КРОВОТЕЧЕНИЕ', '#ff4d5e', 0.9); }
  }
  if (A.flare && !tgt.dead) { tgt.st.marked = 1; FX.float(tgt.x, tgt.y, 'МЕТКА СВЕТА', '#ffe9a0', 0.9); }
  if (A.flare) { const ft = tile(tgt.x, tgt.y); if (ft) { ft.torch = 4; FX.burst('ignite', tgt.x, tgt.y, att.side); refreshLight(); R.groundDirty = true; } }
  if (A.melee) await tween(0.16, f => { att.anim.lunge = 1 - f; });
  att.anim.lunge = 0;
  void fromConcealed;
  return outcome;
}

async function damageUnit(u, dmg, src, kind) {
  if (u.dead || dmg <= 0) return;
  u.hp -= dmg; u.anim.flash = 0.3; u.anim.hurt = 1;
  if (src) { G.stats[src.side].dmg += dmg; src.dmgDone = (src.dmgDone || 0) + Math.min(dmg, Math.max(0, u.hp + dmg)); }
  FX.float(u.x, u.y, '−' + dmg, kind === 'crit' ? '#ff3b2f' : kind === 'fire' ? '#ff9d3a' : '#ff6b5e', kind === 'crit' ? 2.0 : 1.5, 0);
  FX.blood(u.x, u.y, u.side, dmg);
  if (kind !== 'fire') FX.shake(3 + dmg * 0.6);
  SFX.play('hit');
  if (u.st.concealed) reveal(u, 'ранен');
  if (u.hp > 0 && hasTrait(u, 'rage') && u.rage < 4) { u.rage++; FX.float(u.x, u.y, 'ЯРОСТЬ ' + u.rage, '#ff7a3a', 0.9); }
  if (u.hp <= 0 && hasTrait(u, 'revive') && !u.revived) {
    u.revived = true; u.hp = Math.ceil(u.maxHp / 2);
    FX.float(u.x, u.y, 'ВОССТАЛ', '#d9f0c0', 1.3); FX.burst('reveal', u.x, u.y, u.side); FX.shake(6);
    log(`${uName(u)} рассыпается… и вновь собирает кости (${u.hp} ОЗ).`, u.side);
    await wait(300); return;
  }
  if (u.hp <= 0) await killUnit(u, src);
}

async function killUnit(u, src) {
  u.hp = 0; u.dead = true; u.anim.dying = 0.0001;
  u.st = { bulwark: false, watch: 0, concealed: false, blessed: 0, cursed: 0, taunt: null, poison: 0, bleed: 0, blind: 0 };
  FX.death(u);
  FX.shake(12);
  SFX.play('death');
  const other = foe(u.side);
  gainRes(other, 1);
  if (src) { src.kills++; G.stats[src.side].kills++; }
  log(`☠ ${uName(u)} пал${src ? ' от руки ' + uName(src) : ''}.`, other);
  if (G.sel === u) G.sel = null;
  checkWin();
  await wait(350);
}

const DESTROY_MSG = { '#': 'Руины стены обрушились.', 'P': 'Колонна рухнула.', 'h': 'Надгробие расколото.', 'c': 'Саркофаг расколот.', 't': 'Мёртвое древо рухнуло.', 'B': 'Жаровня опрокинута — огонь растекается.' };
async function damageObject(x, y, n) {
  const t = tile(x, y); if (!t || !t.obj) return;
  t.ohp -= n;
  FX.debris(x, y, t.obj, false);
  if (t.ohp <= 0) {
    const was = t.obj;
    t.obj = null; t.rubble = 1 + (t.seed % 3); t.lit = false;
    FX.debris(x, y, was, true);
    FX.shake(6);
    SFX.play('crumble');
    if (was === 'B') { t.burn = 4; t.burnSide = 'order'; }
    R.groundDirty = true;
    log(DESTROY_MSG[was]);
    refreshLight();
  }
}

async function useAbility(u, id, target) {
  if (G.busy || G.winner) return;
  const chk = canUse(u, id); if (!chk.ok) return;
  const A = ABIL[id];
  G.busy = true; G.mode = null; UI.tip(null);
  const apCost = A.apAll ? u.ap : abCost(u, id);
  u.ap -= apCost;
  if (A.res) { gainRes(u.side, -resCost(u, id)); if (G.econ) G.econ[u.side].skills += resCost(u, id); }
  if (G.econ) { const U = G.econ[u.side].use = G.econ[u.side].use || {}; U[id] = (U[id] || 0) + 1; }
  try {
    switch (id) {
      case 'cleave': case 'shot': case 'pierce': case 'bolt': case 'backstab': case 'knife': case 'smite':
      case 'flare': case 'heavybolt': case 'hack': case 'bite': case 'rend': case 'boneblade': case 'poisonarrow': case 'smash': case 'hook':
        await doAttack(u, target, id); break;
      case 'reload':
        u.loaded = true; FX.float(u.x, u.y, 'ЗАРЯЖЕН', '#e8d6a0', 0.9); SFX.play('shield');
        log(`${uName(u)} взводит арбалет.`, u.side); await wait(300); break;
      case 'shutter':
        u.lanternOn = !u.lanternOn; SFX.play(u.lanternOn ? 'ignite' : 'douse');
        FX.burst(u.lanternOn ? 'ignite' : 'douse', u.x, u.y, u.side);
        log(`${uName(u)} ${u.lanternOn ? 'открывает' : 'прикрывает'} фонарь.`, u.side); refreshLight(); await wait(250); break;
      case 'flash': {
        const ts = flashTargets(u);
        FX.explosion(u.x, u.y, 'order'); FX.shake(5); SFX.play('dawn');
        for (const e of ts) { e.st.blind = 1; FX.float(e.x, e.y, 'ОСЛЕПЛЁН', '#fff2b0', 0.9); }
        for (const e of alive()) if (e.st.concealed && dist(u, e) <= 3.01) reveal(e, 'вспышка фонаря');
        log(`${uName(u)}: Вспышка! Ослеплено врагов: ${ts.length}.`, u.side); await wait(450); break;
      }
      case 'quake': {
        u.anim.cast = 1; FX.explosion(u.x, u.y, 'coven'); FX.shake(16); SFX.play('boom');
        log(`${uName(u)} бьёт оземь — Землетрясение!`, u.side);
        for (const [dx, dy] of DIRS8) { const t = tile(u.x + dx, u.y + dy); if (t && t.obj && OBJ[t.obj].cover === 20) await damageObject(t.x, t.y, 4); }
        for (const v of quakeVictims(u)) { const d = irnd(3, 5); await damageUnit(v, d, v.side !== u.side ? u : null, 'hit'); }
        u.anim.cast = 0; refreshLight(); await wait(300); break;
      }
      case 'lob': await castLob(u, target); break;
      case 'radiance':
        u.st.radiant = 1; FX.burst('bless', u.x, u.y, u.side); FX.float(u.x, u.y, 'СИЯНИЕ', '#ffe9a0', 1); SFX.play('dawn');
        log(`${uName(u)} поднимает Сияющий щит.`, u.side); refreshLight(); await wait(350); break;
      case 'litany':
        u.litanyUsed = true; gainRes(u.side, 2); u.anim.cast = 1;
        FX.burst('bless', u.x, u.y, u.side); FX.float(u.x, u.y, '+2 ' + FACTIONS[u.side].res, '#ffe08a', 1); SFX.play('heal');
        log(`${uName(u)} поёт Литанию: +2 ${FACTIONS[u.side].res}.`, u.side); await wait(350); u.anim.cast = 0; break;
      case 'torch': {
        faceTo(u, target.x, target.y); u.anim.cast = 1;
        await FX.projectile(u, target, 'fireball', 'order', null); u.anim.cast = 0;
        tile(target.x, target.y).torch = 4;
        FX.burst('ignite', target.x, target.y, u.side); SFX.play('ignite');
        log(`${uName(u)} бросает священный факел.`, u.side);
        refreshLight(); R.groundDirty = true; await wait(250); break;
      }
      case 'bulwark':
        u.st.bulwark = true; FX.burst('shield', u.x, u.y, u.side); SFX.play('shield');
        FX.float(u.x, u.y, 'БАСТИОН', '#e8d6a0', 1);
        log(`${uName(u)} поднимает щит — Бастион.`, u.side); await wait(400); break;
      case 'taunt': {
        const ts = targetsFor(u, 'taunt');
        FX.burst('taunt', u.x, u.y, u.side); SFX.play('horn');
        u.tauntUsed = true;
        for (const e of ts) { e.st.taunt = u.id; FX.float(e.x, e.y, 'ВЫЗОВ', '#ff9b6b', 0.9); }
        log(`${uName(u)} бросает Вызов (${ts.length} враг.).`, u.side); await wait(500); break;
      }
      case 'watch':
        u.st.watch = apCost >= 3 ? 2 : 1;
        FX.burst('watch', u.x, u.y, u.side); SFX.play('shield');
        FX.float(u.x, u.y, 'БДЕНИЕ', '#ffe08a', 1);
        log(`${uName(u)} держит Бдение (${u.st.watch} выстр.).`, u.side); await wait(350); break;
      case 'inferno': await castInferno(u, target); break;
      case 'vanish':
        u.st.concealed = true; u.lastSeen = { x: u.x, y: u.y }; FX.burst('vanish', u.x, u.y, u.side); SFX.play('vanish');
        log(`${uName(u)} растворяется во тьме.`, u.side); await wait(400); break;
      case 'heal': {
        u.anim.cast = 1; faceTo(u, target.x, target.y);
        await FX.projectile(u, target, 'heal', u.side, target);
        const h = Math.min(ABIL.heal.heal, target.maxHp - target.hp);
        target.hp += h; tile(target.x, target.y).burn = 0;
        FX.float(target.x, target.y, '+' + h, '#7dff9e', 1.2); FX.burst('heal', target.x, target.y, u.side); SFX.play('heal');
        log(`${uName(u)} исцеляет ${uName(target)} (+${h}).`, u.side); u.anim.cast = 0; R.groundDirty = true; await wait(300); break;
      }
      case 'hex': {
        u.anim.cast = 1; faceTo(u, target.x, target.y);
        await FX.projectile(u, target, 'hex', u.side, target);
        if (u.side === 'order') { target.st.blessed = 2; FX.float(target.x, target.y, 'БЛАГОСЛОВЛЁН', '#ffe9a0', 1); log(`${uName(u)} благословляет ${uName(target)}.`, u.side); }
        else { target.st.cursed = 2; FX.float(target.x, target.y, 'ПРОКЛЯТ', '#c79bff', 1); log(`${uName(u)} проклинает ${uName(target)}.`, u.side); }
        FX.burst(u.side === 'order' ? 'bless' : 'curse', target.x, target.y, u.side); SFX.play('magic');
        u.anim.cast = 0; await wait(300); break;
      }
      case 'blood':
        u.bloodUsed = true; u.ap += 1; u.hp -= 3; u.anim.flash = 0.3;
        FX.float(u.x, u.y, '−3 ОЗ  +1 ОД', '#ff4d5e', 1); FX.blood(u.x, u.y, u.side, 6); FX.burst('blood', u.x, u.y, u.side); SFX.play('blood');
        log(`${uName(u)} платит кровью за ещё одно действие.`, u.side); await wait(300); break;
      case 'brazier': {
        const b = target; b.lit = !b.lit;
        FX.burst(b.lit ? 'ignite' : 'douse', b.x, b.y, u.side); SFX.play(b.lit ? 'ignite' : 'douse');
        log(`${uName(u)} ${b.lit ? 'разжигает' : 'гасит'} жаровню.`, u.side);
        refreshLight(); await wait(350); break;
      }
    }
  } finally {
    G.busy = false;
    refreshLight();
    if (G.sel && G.sel.dead) G.sel = null;
    UI.refresh();
  }
}

async function castLob(u, c) {
  faceTo(u, c.x, c.y); u.anim.cast = 1;
  const hit = lobLanding(c);
  SFX.play('twang');
  await FX.projectile(u, hit, 'boulder', u.side, null);
  u.anim.cast = 0;
  FX.explosion(hit.x, hit.y, 'coven'); FX.debris(hit.x, hit.y, '#', true); FX.shake(13); SFX.play('boom');
  const off = hit.x === c.x && hit.y === c.y ? 'точно в цель' : 'отклонение ' + (hit.x - c.x) + ',' + (hit.y - c.y);
  log(`${uName(u)}: Залп! Ядро — ${off}.`, u.side);
  if (inb(hit.x, hit.y)) {
    const t = tile(hit.x, hit.y);
    if (t.obj && t.obj !== 'P') await damageObject(hit.x, hit.y, 6);
    const v = unitAt(hit.x, hit.y);
    if (v) {
      let d = irnd(ABIL.lob.dmg[0], ABIL.lob.dmg[1]);
      if (v.armor) d = Math.max(1, d - v.armor);
      if (hasTrait(v, 'undead')) d = Math.max(1, Math.floor(d / 2));
      if (hasTrait(v, 'evade') && Math.random() < 0.3) { FX.float(v.x, v.y, 'УВЕРНУЛСЯ', '#c8f0ff', 1); log(`${uName(v)} отскочил от ядра.`, v.side); }
      else { await damageUnit(v, d, v.side !== u.side ? u : null, 'hit'); }
    }
  }
  refreshLight(); R.groundDirty = true;
  await wait(300);
  return hit;
}
async function castInferno(u, c) {
  faceTo(u, c.x, c.y); u.anim.cast = 1;
  SFX.play('magic');
  await FX.projectile(u, c, 'fireball', u.side, null);
  u.anim.cast = 0;
  FX.explosion(c.x, c.y, u.side); FX.shake(14); SFX.play('boom');
  log(`${uName(u)}: ${abName('inferno', u.side)}!`, u.side);
  const area = aoeArea(c.x, c.y);
  for (const p of area) {
    const t = tile(p.x, p.y);
    if (t.obj && t.obj !== 'P') await damageObject(p.x, p.y, 5);
    if (!t.obj) { t.burn = 4; t.burnSide = u.side; }
  }
  refreshLight();
  R.groundDirty = true;
  for (const p of area) {
    const v = unitAt(p.x, p.y);
    if (v) { const d = irnd(ABIL.inferno.dmg[0], ABIL.inferno.dmg[1]); await damageUnit(v, d, v.side !== u.side ? u : null, 'fire'); }
  }
  await wait(300);
}

const ULT_CD = 4;
// Ульта врага, пока действует, не может быть перебита своей (в обе стороны)
function enemyUltActive(side) { return side === 'order' ? G.eclipse > 0 : G.dawn > 0; }
function ultReady(side) { return G.res[side] >= FACTIONS[side].ult.cost && G.round - G.ultRound[side] >= ULT_CD && !enemyUltActive(side); }
async function useUlt(side) {
  if (G.busy || G.winner || G.side !== side) return;
  const F = FACTIONS[side]; if (!ultReady(side)) return;
  G.ultRound[side] = G.round;
  G.busy = true; UI.tip(null); gainRes(side, -F.ult.cost); if (G.econ) G.econ[side].ults++;
  try {
    UI.ultFlash(side);
    if (side === 'order') {
      G.dawn = 2; FX.dawn(); SFX.play('dawn');
      refreshLight();
      for (const e of alive('coven')) if (e.st.concealed) reveal(e, 'Рассвет');
      for (const a of alive('order')) { const h = Math.min(2, a.maxHp - a.hp); if (h > 0) { a.hp += h; FX.float(a.x, a.y, '+' + h, '#7dff9e', 1); } }
      log(`<b class="c-order">Рассвет!</b> Свет заливает руины.`, side);
    } else {
      G.eclipse = 2; FX.eclipse(); SFX.play('eclipse');
      refreshLight();
      for (const a of alive('coven')) { const h = Math.min(2, a.maxHp - a.hp); if (h > 0) { a.hp += h; FX.float(a.x, a.y, '+' + h, '#7dff9e', 1); } }
      log(`<b class="c-coven">Затмение!</b> Огни гаснут, Орден охвачен ужасом.`, side);
    }
    await wait(1200);
  } finally { G.busy = false; UI.refresh(); }
}

// ---------------- Ходы ----------------
async function startTurn(side) {
  if (G.winner) return;
  const gid = G.gameId;
  G.side = side; G.sel = null; G.mode = null; G.turnCount++;
  if (G.dawn > 0) G.dawn--;
  if (G.eclipse > 0) G.eclipse--;
  // тление огня
  for (const row of G.map) for (const t of row) { if (t.burn > 0) t.burn--; if (t.torch > 0) t.torch--; }
  R.groundDirty = true;
  refreshLight();
  for (const u of alive(side)) {
    u.ap = MAX_AP; u.bloodUsed = false; u.tauntUsed = false; u.litanyUsed = false; u.st.radiant = 0; u.guard = 0; u.st.bulwark = false; u.st.watch = 0;
  }
  for (const u of alive()) { if (side === 'order' && u.st.blessed > 0) u.st.blessed--; if (side === 'coven' && u.st.cursed > 0) u.st.cursed--; }
  // алтарь
  const mine = alive(side).some(u => inAltar(u.x, u.y));
  const theirs = alive(foe(side)).some(u => u.x >= 6 && u.x <= 9 && u.y >= 6 && u.y <= 9);
  let altarMsg = '';
  const theirsVisible = alive(foe(side)).some(u => !u.st.concealed && u.x >= 6 && u.x <= 9 && u.y >= 6 && u.y <= 9);
  if (mine && theirs && !theirsVisible && G.round >= 2) log('Алтарь молчит — рядом чьё-то незримое присутствие…', side);
  if (mine && !theirs && G.round >= 2) {
    G.altar[side]++; gainRes(side, 1);
    altarMsg = `Алтарь: ${G.altar[side]}/${ALTAR_WIN}`;
    log(`Алтарь откликается ${FACTIONS[side].gen} (${G.altar[side]}/${ALTAR_WIN}).`, side);
    FX.altarPulse(side);
  }
  if (G.econ) { const E = G.econ[side]; E.turns++; E.resSum += G.res[side]; if (G.res[side] >= RES_MAX) E.atMax++; }
  UI.refresh();
  await UI.banner(side, altarMsg);
  if (G.gameId !== gid) return;
  // огонь жжёт стоящих
  for (const u of alive(side)) { const t = tile(u.x, u.y); if (t.burn > 0) await damageUnit(u, 2, null, 'fire'); }
  for (const u of alive(side)) {
    if (u.st.bleed > 0) { u.st.bleed--; FX.float(u.x, u.y, 'кровотечение', '#ff4d5e', 0.8, 18); await damageUnit(u, 2, null, 'bleed'); }
    if (!u.dead && u.st.poison > 0) { u.st.poison--; FX.float(u.x, u.y, 'яд', '#9dff6a', 0.8, 18); await damageUnit(u, 1, null, 'poison'); }
  }
  checkWin();
  if (G.winner) return;
  if (isAI(side)) {
    await AI.takeTurn(side);
    if (G.gameId !== gid || G.winner) return;
    await wait(300);
    endTurn();
  } else {
    const first = alive(side)[0]; if (first) selectUnit(first);
    UI.refresh();
  }
}

// Свет и тьма питают веру: герой Ордена, закончивший ход на свету, даёт +1, во тьме — −1. У Ковена наоборот.
// Наёмники на ресурс не влияют.
function lightIncome(u, pos) {
  if (!CLASSES[u.cls].faction) return 0;
  pos = pos || u;
  const lit = isLit(pos.x, pos.y);
  return u.side === 'order' ? (lit ? 1 : -1) : (lit ? -1 : 1);
}
function endTurn() {
  if (G.winner) return;
  {
    let plus = 0, minus = 0;
    for (const u of alive(G.side)) {
      const d = lightIncome(u); if (!d) continue;
      if (d > 0) plus++; else minus++;
      FX.float(u.x, u.y, (d > 0 ? '+1 ' : '−1 ') + FACTIONS[u.side].res, d > 0 ? '#ffe08a' : '#b9a6ff', 0.8, 30);
    }
    if (plus || minus) { gainRes(G.side, plus - minus); log(`${FACTIONS[G.side].res}: +${plus} / −${minus} за свет и тьму (итого ${plus - minus >= 0 ? '+' : ''}${plus - minus}).`, G.side); }
  }
  // нельзя затаиться вплотную к врагу
  for (const u of alive(G.side)) if (u.st.concealed && alive(foe(u.side)).some(e => Math.max(Math.abs(e.x - u.x), Math.abs(e.y - u.y)) <= 1)) reveal(u, 'не удалось затаиться вплотную к врагу');
  for (const u of alive(G.side)) { u.guard = Math.min(u.ap, MAX_AP) * GUARD_PER_AP; if (u.guard) FX.float(u.x, u.y, 'Стойкость +' + u.guard, '#9fc4ff', 0.75); u.ap = 0; }
  // Вызов действует один ход врага
  for (const u of alive(G.side)) { u.st.taunt = null; u.st.blind = 0; }
  for (const u of alive(foe(G.side))) u.st.marked = 0;   // метка держится до конца хода того, кто её поставил
  G.sel = null; G.mode = null;
  const next = foe(G.side);
  if (next === G.first) G.round++;
  if (G.round > MAX_ROUNDS) { roundLimit(); return; }
  UI.refresh();
  startTurn(next);
}

function roundLimit() {
  const score = s => G.altar[s] * 10 + alive(s).reduce((a, u) => a + u.hp, 0);
  const so = score('order'), sc = score('coven');
  if (so === sc) declare('draw', 'Рассвет так и не наступил: силы равны.');
  else declare(so > sc ? 'order' : 'coven', 'Истекло время ритуала: перевес за сильнейшими.');
}

function checkWin() {
  if (G.winner) return;
  for (const s of ['order', 'coven']) {
    if (!alive(s).length) { declare(foe(s), s === 'order' ? 'Орден истреблён до последнего.' : 'Ковен истреблён до последней тени.'); return; }
    if (G.altar[s] >= ALTAR_WIN) { declare(s, s === 'order' ? 'Алтарь освящён. Ритуал Ковена сорван.' : 'Алтарь осквернён. Пустая Луна восходит.'); return; }
  }
}
function declare(w, reason) {
  if (G.winner) return;
  G.winner = w; G.winReason = reason; G.mode = null;
  const gid = G.gameId;
  if (G.onEnd) { const f = G.onEnd; G.onEnd = null; f(); return; }
  setTimeout(() => { if (G.gameId === gid && G.winner) UI.showEnd(); }, 1600);
}

function selectUnit(u) {
  if (!u || u.dead) return;
  G.sel = u; G.mode = null;
  R.focus(u.x, u.y);
  SFX.play('select');
  UI.refresh();
}
