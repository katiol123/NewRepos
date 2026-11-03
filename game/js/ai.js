'use strict';
// ============================================================
//  ИИ: утилитарная оценка «позиция + лучшее действие»
// ============================================================
const AI = {};

AI.takeTurn = async function (side) {
  const gid = G.gameId;
  await wait(450);
  if (G.gameId !== gid) return;
  // ульта
  AI.considerUlt(side);
  if (G.busy) await waitUntil(() => !G.busy);
  const order = { shade: 0, wolf: 0.5, catapult: 0.8, marksman: 1, crossbow: 1, skelarch: 1, lantern: 1.5, mystic: 2, berserk: 2.5, skelwar: 2.5, golem: 2.8, bastion: 3, priest: 4 };
  const us = alive(side).sort((a, b) => (order[a.cls] ?? 2) - (order[b.cls] ?? 2));
  for (const u of us) {
    if (G.gameId !== gid || G.winner) return;
    if (u.dead) continue;
    await AI.runUnit(u, gid);
  }
};

function waitUntil(fn) { return new Promise(r => { const ch = () => fn() ? r() : wait(50).then(ch); ch(); }); }

AI.considerUlt = function (side) {
  const F = FACTIONS[side];
  if (!ultReady(side)) return;
  const mine = alive(side), theirs = alive(foe(side));
  if (side === 'order') {
    const hurt = mine.reduce((s, u) => s + Math.min(3, u.maxHp - u.hp), 0);
    const dark = theirs.filter(e => !isLit(e.x, e.y)).length;
    const conceal = theirs.some(e => e.st.concealed);
    if (hurt >= 7 || conceal || G.res[side] >= 9 || (dark >= 4 && G.round >= 3)) useUlt(side);
  } else {
    const lit = mine.filter(u => isLit(u.x, u.y)).length;
    const litFoes = theirs.filter(e => isLit(e.x, e.y)).length;
    if ((lit >= 2 && G.round >= 2) || litFoes >= 3 || G.res[side] >= 9) useUlt(side);
  }
};

AI.runUnit = async function (u, gid) {
  R.focus(u.x, u.y);
  G.sel = u; UI.refresh();
  await wait(380);
  let moves = 0;
  for (let i = 0; i < 7; i++) {
    if (G.gameId !== gid || G.winner || u.dead || u.ap <= 0) break;
    const plan = AI.best(u, moves < 2);
    if (AI.trace) AI.trace.push(G.round + ' ' + u.side[0] + u.cls + ' ap' + u.ap + ' -> ' + (plan ? plan.kind + ' ' + (plan.id || '') + (plan.x !== undefined ? plan.x + ',' + plan.y : '') + ' s=' + plan.score.toFixed(1) : 'none'));
    if (!plan || plan.kind === 'end') break;
    if (plan.kind === 'move') {
      const r = reach(u); const p = pathFrom(r, plan.x, plan.y);
      if (!p || !p.length) break;
      R.focus(plan.x, plan.y);
      await moveUnit(u, p); moves++;
    } else if (plan.kind === 'ab') {
      if (plan.target && plan.target.x !== undefined) R.focus((u.x + plan.target.x) / 2, (u.y + plan.target.y) / 2);
      await useAbility(u, plan.id, plan.target);
    }
    if (G.gameId !== gid) return;
    await wait(260);
  }
  G.sel = null;
};

// Ценность выживания и угрозы позиции
AI.pos = function (u, x, y) {
  const P = { x, y };
  let s = 0;
  const enemies = alive(foe(u.side)).filter(e => !e.st.concealed || false);
  let dn = 99;
  for (const e of enemies) {
    const d = Math.hypot(e.x - x, e.y - y); if (d < dn) dn = d;
    const ranged = CLASSES[e.cls].abil.some(id => ABIL[id].type === 'attack' && !ABIL[id].melee) || e.cls === 'catapult';
    const threat = ranged ? (d <= 11) : (d <= e.mov * 2 + 1.5);
    if (!threat) continue;
    if (!hasLOS(e, P)) { s += 0.3; continue; }
    const c = coverFor(P, u.side, e).cover;
    s += c >= 40 ? 2.0 : c >= 20 ? 1.0 : -2.6;
    if (e.st.watch > 0 && !u.st.concealed) s -= 1.6;
  }
  const lit = isLit(x, y);
  // угроза ответного хода: сколько врагов достанут эту клетку
  if (!(u.cls === 'shade' && (!lit || u.side === 'order'))) {
    let seen = 0; for (const e of enemies) if (Math.hypot(e.x - x, e.y - y) <= 9 && hasLOS(e, P)) seen++;
    const frag = u.hp <= 5 ? 1.6 : 1;
    if (seen >= 2) s -= (seen - 1) * 1.1 * frag * (u.cls === 'mystic' && u.side === 'coven' ? 1.9 : u.cls === 'shade' || u.cls === 'mystic' || u.cls === 'priest' ? 1.4 : 0.7);
  }
  if (u.cls === 'shade') s += u.side === 'order' ? 0.3 : (lit ? -1.5 : 1.8);
  else if (u.side === 'coven') s += lit ? -0.2 : 0.5;
  else s += lit ? 1.0 : -0.4;
  // роли
  const W = { marksman: [8, 0.32], mystic: [6, 0.32], priest: [7, 0.25], bastion: [1.5, 0.45], shade: [1.5, 0.3],
    crossbow: [7, 0.3], skelarch: [7, 0.3], berserk: [1.2, 0.5], wolf: [1.2, 0.4], skelwar: [1.3, 0.4], golem: [1.3, 0.45], lantern: [2.5, 0.35], catapult: [8, 0] }[u.cls] || [4, 0.3];
  if (dn < 99) s -= Math.abs(dn - W[0]) * W[1];
  if (dn < 99 && !enemies.some(e => hasLOS(e, P))) s -= dn * 0.15;
  if (u.cls === 'priest' || u.cls === 'marksman') {
    let da = 99; for (const a of alive(u.side)) if (a !== u) da = Math.min(da, Math.hypot(a.x - x, a.y - y));
    if (da < 99) s -= Math.max(0, da - 3) * 0.25;
  }
  // алтарь
  const dAlt = Math.hypot(7.5 - x, 7.5 - y);
  const urgency = 1 + Math.max(G.altar.order, G.altar.coven) * 0.35 + (G.altar[foe(u.side)] >= 1 ? 0.8 : 0);
  const nearAlt = x >= 6 && x <= 9 && y >= 6 && y <= 9;
  if (nearAlt && !inAltar(x, y) && alive(foe(u.side)).some(e => !e.st.concealed && inAltar(e.x, e.y))) s += 2.5 * urgency;
  if (inAltar(x, y)) s += (u.cls === 'bastion' ? 4.5 : 2.5) * urgency;
  else s -= dAlt * (u.cls === 'bastion' || u.cls === 'shade' ? 0.22 : 0.1) * urgency;
  const t = tile(x, y);
  if (t.burn > 0) s -= 6;
  // не толпиться (огненный вал)
  for (const [dx, dy] of DIRS8) { const a = unitAt(x + dx, y + dy); if (a && a !== u && a.side === u.side) s -= 0.35; }
  // рядом с Бастионом союзника — хорошо
  if (u.cls !== 'bastion') for (const a of alive(u.side)) if (a.cls === 'bastion' && Math.abs(a.x - x) + Math.abs(a.y - y) === 1) s += 0.6;
  return s;
};

// Ценность лучшего действия из позиции P при ap
AI.bestAction = function (u, P, ap) {
  let best = null;
  const consider = (val, id, target) => { if (!best || val > best.val) best = { val, id, target }; };
  const virt = Object.assign({}, u, { x: P.x, y: P.y });
  for (const id of abilitiesOf(virt)) {
    const A = ABIL[id];
    if (abCost(u, id) > ap || (A.apAll && ap < 1)) continue;
    if (A.res && G.res[u.side] < A.res) continue;
    if (A.needsLoad && !u.loaded) continue;
    const ty = abType(id, u.side);
    if (ty === 'attack') {
      for (const e of targetsFor(virt, id, P)) {
        const c = calcAttack(virt, e, id, { from: P });
        let avg = avgDmg(id) + (A.rage ? u.rage : 0);
        if (A.phys && !A.armorPierce) avg = Math.max(1, avg - e.armor);
        if (A.phys && !A.melee && hasTrait(e, 'undead')) avg = Math.max(1, avg / 2);
        if (!A.melee && hasTrait(e, 'evade')) avg *= 0.7;
        if (A.poison && !(e.st.poison > 0)) avg += 2.5;
        if (A.bleed && !(e.st.bleed > 0)) avg += 4;
        const pk = c.hit / 100;
        const exp = pk * avg * (1 + c.crit / 200);
        const killP = A.dmg[1] * (c.crit > 30 ? 1.5 : 1) >= e.hp ? pk * clamp((A.dmg[1] * (1 + c.crit / 100) - e.hp + 1) / (A.dmg[1] - A.dmg[0] + 1), 0.15, 1) : 0;
        let v = exp * 1.1 + killP * 7 + (e.cls === 'priest' || e.cls === 'mystic' ? 0.6 : 0) + (inAltar(e.x, e.y) ? 2 + G.altar[e.side] * 1.2 : 0);
        v -= A.ap * 0.25;
        if (id === 'pierce' && ap < 3) continue;
        consider(v, id, e);
      }
    } else if (id === 'inferno') {
      const enemies = alive(foe(u.side)).filter(e => !e.st.concealed);
      const cands = [];
      for (const e of enemies) for (const [dx, dy] of [[0, 0], ...DIRS8]) cands.push({ x: e.x + dx, y: e.y + dy });
      // последняя известная клетка сокрытого врага
      for (const e of alive(foe(u.side))) if (e.st.concealed && e.lastSeen) cands.push({ x: e.lastSeen.x, y: e.lastSeen.y, ghost: e });
      for (const c of cands) {
        if (!inb(c.x, c.y) || blocksLOS(c.x, c.y)) continue;
        if (Math.hypot(c.x - P.x, c.y - P.y) > A.range) continue;
        if (!hasLOS(P, c)) continue;
        let v = 0;
        for (const p of aoeArea(c.x, c.y)) {
          const t = tile(p.x, p.y);
          const o = (p.x === u.x && p.y === u.y) ? null : unitAt(p.x, p.y);
          if (p.x === P.x && p.y === P.y) v -= 7;
          if (o && o.side !== u.side && !o.st.concealed) v += 3.4 + (o.hp <= 4 ? 4 : 0);
          if (o && o.side === u.side) v -= 5;
          if (t.obj && t.obj !== 'P' && t.ohp <= 3) {
            for (const e of enemies) if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) === 1) v += 1.2;
          }
        }
        if (c.ghost && Math.hypot(c.ghost.lastSeen.x - c.x, c.ghost.lastSeen.y - c.y) < 0.1) v += 2.6;
        v -= 3.5;
        if (v > 0) consider(v, id, c);
      }
    } else if (id === 'heal') {
      for (const a of targetsFor(virt, id, P)) {
        const miss = a.maxHp - a.hp; const v = Math.min(5, miss) * 0.9 + (a.hp <= 4 ? 3 : 0) - 1.2;
        consider(v, id, a);
      }
    } else if (id === 'hex') {
      for (const t of targetsFor(virt, id, P)) {
        let v;
        if (u.side === 'order') v = (t.ap >= 2 && t !== u ? 2.6 : 1.2) + (t.cls === 'marksman' || t.cls === 'shade' ? 0.6 : 0);
        else v = 2.0 + (t.cls === 'marksman' || t.cls === 'bastion' ? 0.6 : 0) - (t.st.cursed > 0 ? 3 : 0) - (G.res[u.side] < 5 ? 1.4 : 0);
        consider(v - 0.6, id, t);
      }
    } else if (id === 'bulwark') {
      if (u.st.bulwark) continue;
      let v = 0.6;
      for (const [dx, dy] of DIRS4) { const a = unitAt(P.x + dx, P.y + dy); if (a && a.side === u.side) v += 1.6; }
      if (alive(foe(u.side)).some(e => dist(e, P) < 10)) v += 0.8;
      consider(v, id, null);
    } else if (id === 'taunt') {
      if (u.tauntUsed) continue;
      const ts = alive(foe(u.side)).filter(e => !e.st.concealed && dist(P, e) <= 4 && hasLOS(P, e));
      if (ts.length && u.hp > u.maxHp * 0.5) consider(ts.length * 1.4 - 0.4, id, null);
    } else if (id === 'watch') {
      if (u.st.watch) continue;
      const vis = alive(foe(u.side)).filter(e => !e.st.concealed && dist(P, e) <= 11 && hasLOS(P, e)).length;
      consider(vis ? 1.4 : 2.3 + (ap >= 3 ? 0.8 : 0), id, null);
    } else if (id === 'vanish') {
      if (u.st.concealed || (u.side === 'coven' && isLit(P.x, P.y))) continue;
      if (alive(foe(u.side)).some(e => !e.st.concealed && Math.max(Math.abs(e.x - P.x), Math.abs(e.y - P.y)) <= 2)) continue;
      consider(2.2, id, null);
    } else if (id === 'reload') {
      if (u.loaded) continue;
      consider(3.0, id, null);
    } else if (id === 'shutter') {
      // Ковену фонарь мешает, Ордену — помогает
      const want = u.side === 'order';
      if (u.lanternOn !== want) consider(1.0, id, null);
    } else if (id === 'flash') {
      const ts = alive(foe(u.side)).filter(e => Math.hypot(e.x - P.x, e.y - P.y) <= 3 && hasLOS(P, e));
      const hidden = alive(foe(u.side)).filter(e => e.st.concealed && Math.hypot(e.x - P.x, e.y - P.y) <= 3).length;
      if (ts.length + hidden) consider(ts.filter(e => !e.st.concealed).length * 1.5 + hidden * 2.5 - 0.5, id, null);
    } else if (id === 'quake') {
      let v = -2;
      for (const w of alive()) if (w !== u && Math.max(Math.abs(w.x - P.x), Math.abs(w.y - P.y)) === 1) v += w.side === u.side ? -4.5 : (w.hp <= 4 ? 7 : 4);
      if (v > 0) consider(v, id, null);
    } else if (id === 'lob') {
      if (P.x !== u.x || P.y !== u.y) continue;
      const enemies = alive(foe(u.side)).filter(e => !e.st.concealed);
      for (const e of enemies) {
        const d = Math.hypot(e.x - u.x, e.y - u.y); if (d < ABIL.lob.minRange || d > ABIL.lob.range) continue;
        // ожидание по 9 клеткам
        let v = 0;
        for (const q of lobArea(e.x, e.y)) { const o = unitAt(q.x, q.y); if (o && o.side !== u.side) v += (7 - o.armor) / 9 * (o.hp <= 7 ? 2 : 1); if (o && o.side === u.side) v -= 6 / 9 * 1.5; }
        consider(v * 1.6 - 0.6, id, { x: e.x, y: e.y });
      }
    } else if (id === 'brazier') {
      const b = adjBrazier(virt, P); if (!b) continue;
      let near = 0; for (const e of alive(foe(u.side))) if (Math.hypot(e.x - b.x, e.y - b.y) < 4) near++;
      let mine = 0; for (const a of alive(u.side)) if (Math.hypot(a.x - b.x, a.y - b.y) < 4) mine++;
      const wantDark = u.side === 'coven';
      const altarB = Math.hypot(b.x - 7.5, b.y - 7.5) < 5 ? 0.6 : 0;
      const v = b.lit === wantDark ? 0.2 + altarB + (wantDark ? near * 0.6 + mine * 0.5 : mine * 0.6 + near * 0.5) : -5;
      consider(v, id, b);
    }
  }
  return best;
};

AI.best = function (u, canMove) {
  const opts = [];
  const cur = { x: u.x, y: u.y };
  const curPos = AI.pos(u, u.x, u.y);
  // Действие с места
  const a0 = AI.bestAction(u, cur, u.ap);
  if (a0 && a0.val > 0.2) opts.push({ kind: 'ab', id: a0.id, target: a0.target, score: curPos + a0.val });
  opts.push({ kind: 'end', score: curPos + Math.min(u.ap, 3) * 0.45 });
  // Кровавая цена — если без неё нельзя добить
  if (u.ap === 1 && !u.bloodUsed && u.hp > 6) {
    const a2 = AI.bestAction(u, cur, 2);
    if (a2 && a2.val > 6) opts.push({ kind: 'ab', id: 'blood', target: null, score: curPos + a2.val - 1.5 });
  }
  if (canMove && u.ap > 0) {
    const r = reach(u);
    for (let k = 0; k < MW * MH; k++) {
      const c = r.cost[k]; if (!isFinite(c) || c === 0) continue;
      const x = k % MW, y = (k / MW) | 0;
      const apc = apFor(u, c); const left = u.ap - apc; if (left < 0) continue;
      const P = { x, y };
      const ps = AI.pos(u, x, y);
      const act = left > 0 ? AI.bestAction(u, P, left) : null;
      const sc = ps + (act && act.val > 0.2 ? act.val * 0.92 : left * 0.45) - apc * 0.15 + Math.random() * 0.15;
      opts.push({ kind: 'move', x, y, score: sc });
    }
  }
  opts.sort((a, b) => b.score - a.score);
  const b = opts[0];
  if (b.kind === 'move' && b.score < curPos + (a0 && a0.val > 0.2 ? a0.val : u.ap * 0.45) + 0.2) {
    // не дёргаться без выгоды
    const alt = opts.find(o => o.kind !== 'move'); return alt;
  }
  return b;
};
