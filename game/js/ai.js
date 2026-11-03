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
  // порядок ходов по профилю: скрытные и артиллерия, затем стрелки, ближники, стены, поддержка
  const rank = u => { const p = profileOf(u); return p.immobile ? 0.2 : p.stealth ? 0 : p.support ? 4 : p.lantern ? 1.5 : !p.melee ? (p.aoe ? 2 : 1) : p.sturdy ? 3 : p.fast ? 0.5 : 2.5; };
  const us = alive(side).sort((a, b) => rank(a) - rank(b));
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
    if (hurt >= 7 || conceal || G.res[side] >= RES_MAX - 1 || (dark >= 4 && G.round >= 3)) useUlt(side);
  } else {
    const lit = mine.filter(u => isLit(u.x, u.y)).length;
    const litFoes = theirs.filter(e => isLit(e.x, e.y)).length;
    if ((lit >= 2 && G.round >= 2) || litFoes >= 3 || G.res[side] >= RES_MAX - 1) useUlt(side);
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
  const p = profileOf(u), ch = characterOf(u);
  let caution = cautionOf(u, p);
  let s = 0;
  const enemies = alive(foe(u.side)).filter(e => !e.st.concealed);
  const allies = alive(u.side).filter(a => a !== u);
  let dn = 99;
  // 1. Укрытие от тех, кто может достать эту клетку
  for (const e of enemies) {
    const d = Math.hypot(e.x - x, e.y - y); if (d < dn) dn = d;
    const ranged = attackIds(e).some(id => !ABIL[id].melee);
    if (!(ranged ? d <= 11 : d <= effMov(e) * 2 + 1.5)) continue;
    if (!hasLOS(e, P)) { s += 0.3; continue; }
    const c = coverFor(P, u.side, e).cover;
    s += c >= 40 ? 2.0 : c >= 20 ? 1.0 : -2.0;
    if (e.st.watch > 0 && !u.st.concealed) s -= 1.6;
  }
  // 2. Угроза ответного хода относительно запаса здоровья
  const th = AI.threatAt(u, P);
  s -= caution * 3 * Math.min(2, th.exp / Math.max(1, u.hp));
  // 3. Строй: не оставаться одному там, куда дотянутся двое
  const near = allies.filter(a => Math.max(Math.abs(a.x - x), Math.abs(a.y - y)) <= 2).length;
  if (th.reach >= 2 && near === 0) s -= 2.5 * caution;
  else s += Math.min(near, 2) * (ch === 'line' ? 0.5 : 0.3);
  // 4. Отступление при малом здоровье: к лекарям
  if (u.hp / u.maxHp < 0.4 && !p.revive) {
    if (allies.some(a => profileOf(a).healer && Math.hypot(a.x - x, a.y - y) <= 5)) s += 1.5;
  }
  // 5. Тьма: прячет от тех, у кого нет ночного зрения
  if (!isLit(x, y)) {
    if (enemies.some(e => !nightVision(e))) s += 0.4;
    if (p.stealth && u.side === 'coven') s += 1.4;
  } else if (p.stealth && u.side === 'coven') s -= 1.5;
  // 5б. Ресурс фракции: герой на «своей» клетке приносит +1, на чужой отнимает 1
  s += lightIncome(u, P) * 0.7 * (G.res[u.side] < RES_MAX ? 1 : 0.3);
  // 6. Дистанция до врага по роли (из дальности основной атаки)
  let pref = p.melee ? 1.2 : clamp(p.range - 2, 4, 9), wDist = p.melee ? (p.sturdy ? 0.45 : 0.35) : 0.3;
  if (p.support) { pref = 6; wDist = 0.25; }
  if (p.lantern) { pref = 3; wDist = 0.35; }
  if (p.immobile) wDist = 0;
  if (p.slow && dn > effMov(u) * 3 + 1.5) wDist *= 0.4;   // медленный не гонится за недостижимым
  if (dn < 99) s -= Math.abs(dn - pref) * wDist;
  if (dn < 99 && !enemies.some(e => hasLOS(e, P))) s -= dn * 0.12;
  // 7. Характер
  const C = AI.enemyCenter(u.side);
  if (C) {
    const dC = Math.hypot(x - C.x, y - C.y), front = AI.frontDist(u, C);
    const ahead = Math.max(0, front - dC - 0.5);   // насколько боец впереди всех союзников
    switch (ch) {
      case 'wall': {
        // между врагами и самым израненным союзником (по текущим ОЗ)
        const weak = allies.slice().sort((a, b) => a.hp - b.hp)[0];
        if (weak && Math.hypot(x - weak.x, y - weak.y) <= 2.5 && dC < Math.hypot(weak.x - C.x, weak.y - C.y) - 0.5) s += 2.5;
        break;
      }
      case 'pack': s -= Math.min(3, ahead * 2); break;
      case 'fury':
        if (u.rage < 2) s -= Math.min(3, ahead * 1.5);
        else for (const e of enemies) if (Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) === 1) s += 0.8;
        break;
      case 'expendable': if (dC <= front) s += 1; break;
      case 'lightbearer': s += Math.min(3, near) * 0.8; s -= Math.min(2, ahead * 2); break;
      case 'shepherd': {
        if (allies.length) {
          const ax = allies.reduce((t, a) => t + a.x, 0) / allies.length, ay = allies.reduce((t, a) => t + a.y, 0) / allies.length;
          const da = Math.hypot(x - ax, y - ay); if (da >= 1.5 && da <= 4) s += 1;
        }
        if (dC < front) s -= 2;
        break;
      }
      case 'glass': if (dC < front) s -= 2.5; break;
      case 'patient':
        for (const e of enemies) if (attackIds(e).every(id => ABIL[id].melee) && Math.hypot(e.x - x, e.y - y) < 5) s -= 1.2;
        if (x === u.x && y === u.y && enemies.length && enemies.every(e => !hasLOS(e, P) || coverFor(P, u.side, e).cover >= 20)) s += 0.8;
        break;
    }
  }
  // 8. Алтарь
  const dAlt = Math.hypot(7.5 - x, 7.5 - y);
  const urgency = 1 + Math.max(G.altar.order, G.altar.coven) * 0.35 + (G.altar[foe(u.side)] >= 1 ? 0.8 : 0);
  const nearAlt = x >= 6 && x <= 9 && y >= 6 && y <= 9;
  if (nearAlt && !inAltar(x, y) && enemies.some(e => inAltar(e.x, e.y))) s += 2.5 * urgency;
  const holder = p.sturdy || p.revive;
  if (inAltar(x, y)) s += (holder ? 4.5 : 2.5) * urgency * (ch === 'expendable' ? 1.5 : 1);
  else if (!p.immobile) s -= dAlt * (holder ? 0.22 : 0.1) * urgency;
  // 9. Огонь и толкотня (удары по площади)
  if (tile(x, y).burn > 0) s -= 6;
  for (const [dx, dy] of DIRS8) { const a = unitAt(x + dx, y + dy); if (a && a !== u && a.side === u.side) s -= 0.35; }
  // рядом с союзником, умеющим держать «Бастион», — укрытие
  for (const a of allies) if (CLASSES[a.cls].abil.includes('bulwark') && Math.abs(a.x - x) + Math.abs(a.y - y) === 1) s += 0.6;
  return s;
};


// Ценность лучшего действия из позиции P при ap
AI.bestAction = function (u, P, ap) {
  let best = null;
  const consider = (val, id, target) => { if (!best || val > best.val) best = { val, id, target }; };
  const virt = Object.assign({}, u, { x: P.x, y: P.y });
  const p = profileOf(u), ch = characterOf(u);
  const healCost = CLASSES[u.cls].abil.filter(i => ABIL[i].heal).map(i => ABIL[i].res || 0)[0] || 0;
  const teamHurt = alive(u.side).some(a => a.hp < a.maxHp * 0.6);
  let seenFromP = -1;
  for (const id of abilitiesOf(virt)) {
    const A = ABIL[id];
    if (abCost(u, id) > ap || (A.apAll && ap < 1)) continue;
    if (A.res && G.res[u.side] < resCost(u, id)) continue;
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
        const pk = c.eff / 100;
        const exp = pk * avg * (1 + c.crit / 200);
        const killP = A.dmg[1] * (c.crit > 30 ? 1.5 : 1) >= e.hp ? pk * clamp((A.dmg[1] * (1 + c.crit / 100) - e.hp + 1) / (A.dmg[1] - A.dmg[0] + 1), 0.15, 1) : 0;
        // общий приоритет целей: хрупкие, стрелки, удерживающие алтарь
        const ep = profileOf(e);
        let v = exp * 1.1 + killP * 7 + (ep.fragile ? 0.8 : 0) + (!ep.melee ? 0.5 : 0) + (ep.support ? 0.4 : 0) + (inAltar(e.x, e.y) ? 2 + G.altar[e.side] * 1.2 : 0);
        v -= A.ap * 0.25;
        // характер
        if (ch === 'pack') {
          const pinned = alive(u.side).some(a => a !== u && Math.max(Math.abs(a.x - e.x), Math.abs(a.y - e.y)) <= 1);
          if (!pinned && killP < 0.5) v *= 0.55;
          if (e.hp / e.maxHp < 0.4) v += 2;
        }
        if (ch === 'shadow') {
          if (!alive(e.side).some(o => o !== e && Math.hypot(o.x - e.x, o.y - e.y) <= 2)) v += 2;
          if (seenFromP < 0) seenFromP = alive(foe(u.side)).filter(o => !o.st.concealed && hasLOS(o, P) && Math.hypot(o.x - P.x, o.y - P.y) <= 9).length;
          if (seenFromP >= 3 && killP < 0.6) v -= 2.5;
        }
        if (ch === 'fury' && u.rage >= 2) v += e.hp * 0.08;
        if (A.poison) { if (e.st.poison > 0) v -= 2; if (e.mov >= 6) v += 1.5; }
        if (A.bleed && ep.sturdy) v += 1;
        if (A.armorPierce && e.armor) v += e.armor * 0.8;
        if (A.flare) {   // осветить врага выгодно, если он во тьме и рядом есть наши без ночного зрения
          const blindAllies = alive(u.side).filter(a => a !== u && !nightVision(a) && Math.hypot(a.x - e.x, a.y - e.y) <= 8).length;
          v += (!isLit(e.x, e.y) ? 0.8 + Math.min(3, blindAllies) * 0.6 : -1) - A.res * 0.5;
          if (e.st.concealed) v += 1;
          v += Math.min(3, alive(u.side).filter(a => a !== u && a.ap >= 2 && attackIds(a).length).length) * 0.5;   // метка поможет тем, кто ещё ходит
        }
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
        if (ch === 'glass' && aoeArea(c.x, c.y).filter(q => { const o = unitAt(q.x, q.y); return o && o.side !== u.side && !o.st.concealed; }).length < 2 && !c.ghost) v -= 3;
        v -= 3.5;
        if (v > 0) consider(v, id, c);
      }
    } else if (id === 'heal') {
      for (const a of targetsFor(virt, id, P)) {
        const miss = a.maxHp - a.hp; const v = Math.min(5, miss) * 0.9 + (a.hp <= 4 ? 3 : 0) + (inAltar(a.x, a.y) ? 1.2 : 0) - 1.2;
        consider(v, id, a);
      }
    } else if (id === 'hex') {
      for (const t of targetsFor(virt, id, P)) {
        let v;
        const tp = profileOf(t);
        if (u.side === 'order') v = (t.ap >= 2 && t !== u && attackIds(t).length ? 2.6 : 1.2) + (!tp.melee ? 0.6 : 0);
        else v = 2.0 + (!tp.melee || tp.sturdy ? 0.6 : 0) - (t.st.cursed > 0 ? 3 : 0);
        // пастырь бережёт ресурс на лечение
        if (healCost && teamHurt && G.res[u.side] - (A.res || 0) < healCost) v -= 2.5;
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
      // свет полезен, если подсвечивает врагов без ночного зрения у наших союзников; вредит, если подсвечивает нас
      const R2 = 2.7;
      const litFoes = alive(foe(u.side)).filter(e => Math.hypot(e.x - P.x, e.y - P.y) < R2).length;
      const ourBlind = alive(u.side).filter(a => !nightVision(a)).length;
      const theirBlind = alive(foe(u.side)).filter(e => !nightVision(e)).length;
      const litMine = alive(u.side).filter(a => Math.hypot(a.x - P.x, a.y - P.y) < R2).length;
      const want = litFoes * (ourBlind ? 1 : 0) >= litMine * (theirBlind ? 1 : 0) && (ourBlind > 0 || theirBlind === 0);
      const threatened = u.hp / u.maxHp < 0.4;
      if (u.lanternOn !== (want && !threatened)) consider(1.0, id, null);
    } else if (id === 'flash') {
      const ts = alive(foe(u.side)).filter(e => Math.hypot(e.x - P.x, e.y - P.y) <= 3 && hasLOS(P, e));
      const hidden = alive(foe(u.side)).filter(e => e.st.concealed && Math.hypot(e.x - P.x, e.y - P.y) <= 3).length;
      const vis = ts.filter(e => !e.st.concealed).length;
      if (vis >= 2 || hidden) consider(vis * 1.5 + hidden * 2.5 - 0.5, id, null);
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
        let ally = false;
        for (const q of lobArea(e.x, e.y)) { const o = unitAt(q.x, q.y); if (o && o.side !== u.side && !o.st.concealed) v += (7 - o.armor) / 9 * (o.hp <= 7 ? 2 : 1); if (o && o.side === u.side) ally = true; }
        if (ally) continue;   // никогда не накрывать своих
        // ресурс нужен лечению — стрелять только если выгодно
        const reserve = teamHurt && alive(u.side).some(a => profileOf(a).healer) && G.res[u.side] - ABIL.lob.res < 2 ? 1.2 : 0;
        consider(v * 1.6 - 0.6 - reserve, id, { x: e.x, y: e.y });
      }
    } else if (id === 'radiance') {
      if (u.st.radiant) continue;
      let v = -0.6;   // цена: 1 Вера
      for (const a of alive(u.side)) { const pos = a === u ? P : a; if (CLASSES[a.cls].faction && Math.hypot(pos.x - P.x, pos.y - P.y) <= 2 && !isLit(pos.x, pos.y)) v += 1.0; }
      for (const e of alive(foe(u.side))) if (!e.st.concealed && Math.hypot(e.x - P.x, e.y - P.y) <= 2.5 && !isLit(e.x, e.y)) v += 0.6;
      if (v > 0) consider(v, id, null);
    } else if (id === 'litany') {
      if (u.litanyUsed || G.res[u.side] >= RES_MAX) continue;
      // ценнее, когда ресурса мало и есть на что его тратить
      consider(1.6 + (G.res[u.side] < 3 ? 1.2 : 0) + (G.res[u.side] + 2 >= FACTIONS[u.side].ult.cost && G.res[u.side] < FACTIONS[u.side].ult.cost ? 1 : 0), id, null);
    } else if (id === 'torch') {
      // факел окупается, если осветит своих героев (доход) и врагов без защиты тьмы
      const heroes = alive(u.side).filter(a => CLASSES[a.cls].faction);
      const foes = alive(foe(u.side)).filter(e => !e.st.concealed);
      const cand = [];
      for (const a of heroes) cand.push({ x: a.x, y: a.y });
      for (const e of foes) cand.push({ x: e.x, y: e.y });
      for (const c of cand) {
        if (!inb(c.x, c.y) || blocksLOS(c.x, c.y) || Math.hypot(c.x - P.x, c.y - P.y) > ABIL.torch.range || !hasLOS(P, c)) continue;
        let v = -1.6;  // цена: 1 Вера и 1 ОД
        for (const a of heroes) { const pos = a === u ? P : a; if (!isLit(pos.x, pos.y) && Math.hypot(pos.x - c.x, pos.y - c.y) <= 2) v += 1.2; }
        for (const e of foes) if (!isLit(e.x, e.y) && Math.hypot(e.x - c.x, e.y - c.y) <= 2) v += 0.7 + (e.st.concealed ? 1 : 0);
        if (v > 0) consider(v, id, { x: c.x, y: c.y });
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
      const sc = ps + (act && act.val > 0.2 ? act.val * 0.92 : left * 0.45) - apc * (profileOf(u).reloader ? 0.5 : 0.15) + Math.random() * 0.15;
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
