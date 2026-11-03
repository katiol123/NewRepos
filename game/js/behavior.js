'use strict';
// ============================================================
//  Поведение ИИ: профиль бойца и характер.
//  Всё выводится из показателей и набора умений, а не из класса,
//  поэтому новые классы автоматически получают подходящий характер.
// ============================================================

// Основная атака: первое атакующее умение класса
function primaryAttack(u) {
  const ids = CLASSES[u.cls].abil.filter(id => abType(id, u.side) === 'attack');
  return ids[0] || null;
}
function attackIds(u) { return CLASSES[u.cls].abil.filter(id => abType(id, u.side) === 'attack'); }

// Профиль: набор признаков, по которым подбирается характер
function profileOf(u) {
  const abil = CLASSES[u.cls].abil;
  const pa = primaryAttack(u);
  const A = pa ? ABIL[pa] : null;
  return {
    melee: !!(A && A.melee),
    range: A ? A.range : 0,
    fragile: u.maxHp <= 10 && u.armor === 0,
    sturdy: u.maxHp >= 14 || u.armor >= 2,
    fast: u.mov >= 6,
    slow: u.mov > 0 && u.mov <= 3,
    immobile: u.mov === 0,
    support: abil.some(id => abType(id, u.side) === 'ally'),
    healer: abil.some(id => ABIL[id].heal),
    stealth: abil.includes('vanish'),
    aoe: abil.some(id => ['aoe', 'lob'].includes(abType(id, u.side)) || id === 'quake'),
    rage: hasTrait(u, 'rage'),
    revive: hasTrait(u, 'revive') && !u.revived,
    lantern: hasTrait(u, 'lantern'),
    poisoner: abil.some(id => ABIL[id].poison),
    bleeder: abil.some(id => ABIL[id].bleed),
    reloader: abil.some(id => ABIL[id].needsLoad),
  };
}

// Характеры: имя и краткое описание для карточки
const CHARACTERS = {
  artillery: { name: 'Расчётливая артиллерия', desc: 'Бьёт только когда выстрел окупит ресурс. Никогда не накрывает своих.' },
  shadow: { name: 'Охотник из тени', desc: 'Выбирает отбившихся одиночек и не бьёт там, где потом окажется под прицелом толпы.' },
  fury: { name: 'Нарастающая ярость', desc: 'Пока ярость не разгорелась, держится за спинами. Разъярённый — рвётся к самому крепкому врагу.' },
  expendable: { name: 'Бесстрашный расходник', desc: 'Пока может восстать — лезет первым и принимает огонь на себя. Потом осторожнее.' },
  lightbearer: { name: 'Светоносец', desc: 'Держится у союзников и подсвечивает им врагов. Вспышку бережёт для группы или для скрытого врага.' },
  shepherd: { name: 'Пастырь', desc: 'Держится позади отряда. Лечит самых раненых и тех, кто держит алтарь, ресурс бережёт на лечение.' },
  wall: { name: 'Живая стена', desc: 'Встаёт между врагами и самым израненным союзником. Медленный — не гоняется за быстрыми целями.' },
  pack: { name: 'Стайный хищник', desc: 'Не нападает в одиночку: держится у своих и бьёт тех, кого союзники уже взяли в клещи. Добивает раненых.' },
  glass: { name: 'Хрупкий разрушитель', desc: 'Стоит во второй линии. Удар по площади бережёт для нескольких врагов.' },
  patient: { name: 'Терпеливый стрелок', desc: 'Не покидает хорошую позицию без нужды и держит ближников на расстоянии.' },
  line: { name: 'Боец строя', desc: 'Держится плечом к плечу с союзниками.' },
};
function characterOf(u) {
  const p = profileOf(u);
  if (p.immobile) return 'artillery';
  if (p.stealth) return 'shadow';
  if (p.rage) return 'fury';
  if (hasTrait(u, 'revive')) return 'expendable';
  if (p.lantern) return 'lightbearer';
  if (p.support) return 'shepherd';
  if (p.sturdy && p.melee) return 'wall';
  if (p.melee && p.fast) return 'pack';
  if (!p.melee && p.aoe && p.fragile) return 'glass';
  if (!p.melee) return 'patient';
  return 'line';
}
// Дополнительные оттенки характера (для подписи), тоже по показателям
function characterNotes(u) {
  const p = profileOf(u), n = [];
  if (p.reloader) n.push('бережёт позицию — перезаряжается');
  if (p.poisoner) n.push('травит ещё не отравленных, в первую очередь быстрых');
  if (p.bleeder) n.push('пускает кровь крепким врагам');
  if (p.slow && !p.immobile) n.push('не гонится за теми, кого не догонит');
  return n;
}

// Осторожность: насколько боец боится урона в ответный ход
function cautionOf(u, p) {
  let c = 1;
  if (p.fragile) c += 0.5;
  if (p.sturdy) c -= 0.4;
  if (p.melee && p.fast) c += 0.2;
  if (p.rage && u.rage >= 2) c = 0.5;
  if (p.revive) c = 0.3;                            // пока может встать — почти не боится
  if (u.hp / u.maxHp < 0.4 && !p.revive) c *= 2;   // порог отступления
  return c;
}

// ---------------- Общие механизмы ----------------
// Сколько урона боец может получить на клетке P в ход противника
AI.threatAt = function (u, P) {
  let exp = 0, reach = 0;
  for (const e of alive(foe(u.side))) {
    if (e.st.concealed) continue;
    const d = Math.hypot(e.x - P.x, e.y - P.y);
    const mv = effMov(e);
    let best = 0;
    for (const id of attackIds(e)) {
      const A = ABIL[id];
      const avg = (A.dmg[0] + A.dmg[1]) / 2;
      if (A.melee) { if (d <= mv + 1.5) best = Math.max(best, 0.8 * avg); }
      else if (d <= A.range + mv) {
        const c = calcAttack(e, u, id, { tpos: P });
        best = Math.max(best, c.eff / 100 * avg * (hasLOS(e, P) ? 1 : 0.5));
      }
    }
    if (CLASSES[e.cls].abil.includes('lob') && d >= ABIL.lob.minRange && d <= ABIL.lob.range) best = Math.max(best, 7 / 9 * 1.5);
    if (best > 0) { exp += best; reach++; }
  }
  return { exp, reach };
};
// Центр видимых врагов
AI.enemyCenter = function (side) {
  const es = alive(foe(side)).filter(e => !e.st.concealed);
  if (!es.length) return null;
  return { x: es.reduce((s, e) => s + e.x, 0) / es.length, y: es.reduce((s, e) => s + e.y, 0) / es.length };
};
// Насколько близко к врагу самый передний союзник (кроме самого бойца)
AI.frontDist = function (u, C) {
  let f = 99; for (const a of alive(u.side)) if (a !== u) f = Math.min(f, Math.hypot(a.x - C.x, a.y - C.y));
  return f;
};
