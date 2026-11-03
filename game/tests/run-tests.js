#!/usr/bin/env node
// ============================================================
//  Проверка «обещаний» умений и механик.
//  Каждый тест строит маленький сценарий и проверяет, что эффект,
//  описанный в подсказке или Кодексе, действительно достижим в игре.
//  Запуск:  node game/tests/run-tests.js   (нужен Playwright + Chromium)
// ============================================================
const path = require('path');
const { chromium } = require('playwright');

const GAME_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const HELPERS = path.resolve(__dirname, 'helpers.js');

// Каждый тест: [название (что обещано), функция внутри страницы -> строка ошибки или null]
const TESTS = [
  ['Удар клинком: ближняя атака игнорирует укрытия', () => {
    const [b, t] = T.setup({ units: [['order', 'bastion', 5, 5], ['coven', 'marksman', 5, 6]], objs: [['c', 6, 6]] });
    const c = calcAttack(b, t, 'cleave');
    if (c.br.some(x => /укрытие/i.test(x[0]))) return 'в расчёте есть укрытие: ' + JSON.stringify(c.br);
    return null;
  }],
  ['Бастион: +20 к защите и полное укрытие соседу со своей стороны', async () => {
    const [b, m, s] = T.setup({ units: [['order', 'bastion', 5, 7], ['order', 'marksman', 5, 6], ['coven', 'marksman', 5, 11]] });
    await useAbility(b, 'bulwark');
    if (T.br(calcAttack(s, b, 'shot'), 'Бастион') !== -20) return 'нет −20 от Бастиона';
    if (T.br(calcAttack(s, m, 'shot'), 'Полное укрытие') !== -40) return 'сосед не получил полное укрытие';
    return null;
  }],
  ['Вызов: радиус 4, −20 по другим, стоит 2, раз за ход', async () => {
    const [b, p, near, far] = T.setup({ units: [['order', 'bastion', 5, 5], ['order', 'priest', 9, 5], ['coven', 'marksman', 5, 8], ['coven', 'mystic', 5, 12]] });
    const r0 = GAME.G.res.order;
    await useAbility(b, 'taunt');
    if (near.st.taunt !== b.id) return 'ближний враг не под Вызовом';
    if (far.st.taunt) return 'дальний враг (7 клеток) под Вызовом';
    if (GAME.G.res.order !== r0 - 2) return 'стоимость не 2';
    if (T.br(calcAttack(near, p, 'shot'), 'Вызов') !== -20) return 'нет −20 по другому союзнику';
    if (T.br(calcAttack(near, b, 'shot'), 'Вызов') !== null) return 'штраф применяется и к самому Стражу';
    if (canUse(b, 'taunt').ok) return 'Вызов можно повторить в том же ходу';
    return null;
  }],
  ['Выстрел: дальность 11, дальше 7 клеток −4 за клетку', () => {
    const [m, t1, t2] = T.setup({ units: [['order', 'marksman', 0, 0], ['coven', 'bastion', 10, 0], ['coven', 'priest', 12, 0]] });
    if (T.br(calcAttack(m, t1, 'shot'), 'Дальность') !== -12) return 'штраф на 10 клетках не −12';
    if (targetsFor(m, 'shot').includes(t2)) return 'цель на 12 клетках доступна';
    return null;
  }],
  ['Пронзающий выстрел: ослабляет укрытие на ступень, стоит 3 ОД', () => {
    const [m, t] = T.setup({ units: [['order', 'marksman', 0, 6], ['coven', 'bastion', 5, 5]], objs: [['P', 4, 5]] });
    if (!hasLOS(m, t)) return 'нет видимости (выглядывание не работает)';
    if (T.br(calcAttack(m, t, 'shot'), 'Полное укрытие') !== -40) return 'обычный выстрел не видит полного укрытия';
    const c = calcAttack(m, t, 'pierce');
    if (T.br(c, 'Половинное укрытие') !== -20) return 'пробитие не ослабило укрытие: ' + JSON.stringify(c.br);
    if (ABIL.pierce.ap !== 3) return 'стоимость не 3';
    return null;
  }],
  ['Бдение: 2 ответных выстрела при 3 ОД, срабатывает на движение', async () => {
    const [m, e] = T.setup({ units: [['order', 'marksman', 2, 2], ['coven', 'bastion', 2, 10]] });
    await useAbility(m, 'watch');
    if (m.st.watch !== 2) return 'выстрелов не 2: ' + m.st.watch;
    const undo = T.rigConst(0.01); // все броски — попадания
    try { const r = reach(e); await moveUnit(e, pathFrom(r, 2, 8)); } finally { undo(); }
    if (m.st.watch === 2) return 'Бдение не сработало на движение';
    if (e.hp === e.maxHp) return 'ответный выстрел не нанёс урона';
    return null;
  }],
  ['Тьма: единственный эффект — 15% промаха по цели во тьме без ночного зрения', async () => {
    const [ma, t, cm, sk, gl] = T.setup({ units: [['order', 'mystic', 2, 2], ['coven', 'bastion', 6, 2], ['coven', 'marksman', 6, 6], ['order', 'skelarch', 2, 6], ['order', 'golem', 3, 9]], objs: [['B', 12, 12]] });
    const c = calcAttack(ma, t, 'bolt');
    if (c.darkMiss !== 0.15) return 'Орден по цели во тьме: шанс промаха ' + c.darkMiss;
    if (c.br.some(b => /тьм/i.test(b[0]))) return 'в расчёте остались другие модификаторы тьмы/света: ' + JSON.stringify(c.br);
    if (calcAttack(cm, ma, 'shot').darkMiss !== 0) return 'герой Ковена страдает от тьмы';
    if (calcAttack(sk, t, 'poisonarrow').darkMiss !== 0) return 'нежить страдает от тьмы';
    if (calcAttack(gl, t, 'smash', { from: { x: 5, y: 2 } }).darkMiss !== 0) return 'голем страдает от тьмы';
    t.x = 11; t.y = 12; refreshLight();
    if (calcAttack(ma, t, 'bolt').darkMiss !== 0) return 'промах тьмы по цели на свету';
    // статистика: доля «скрыт тьмой» среди попавших бросков ≈ 15%
    t.x = 6; t.y = 2; refreshLight(); let dark = 0, landed = 0;
    for (let i = 0; i < 300; i++) { t.hp = 99; t.dead = false; const o = await doAttack(ma, t, 'bolt'); if (o === 'dark') dark++; if (o !== 'miss') landed++; }
    const r = dark / landed; if (r < 0.08 || r > 0.23) return 'доля промахов из-за тьмы ' + r.toFixed(2);
    return null;
  }],
  ['Огненный вал: бьёт и своих, крушит половинные укрытия, поджигает, огонь Ордена светит', async () => {
    const [my, ally, en] = T.setup({ units: [['order', 'mystic', 2, 2], ['order', 'bastion', 7, 2], ['coven', 'marksman', 6, 2]], objs: [['h', 6, 3], ['c', 5, 2]] });
    await useAbility(my, 'inferno', { x: 6, y: 2 });
    const G = GAME.G;
    if (en.hp === en.maxHp) return 'враг не получил урона';
    if (ally.hp === ally.maxHp) return 'союзник в радиусе не получил урона';
    if (G.map[3][6].obj) return 'надгробие (4 прочности) уцелело';
    if (G.map[2][5].obj) return 'саркофаг (5 прочности) уцелел';
    if (!(G.map[2][6].burn > 0)) return 'земля не горит';
    if (!isLit(6, 2)) return 'огонь Ордена не освещает клетку';
    return null;
  }],
  ['Чёрное пламя: гасит свет, враг, стреляющий из него, получает −10', async () => {
    const [cm, om, t] = T.setup({ side: 'coven', units: [['coven', 'mystic', 2, 2], ['order', 'marksman', 6, 3], ['coven', 'bastion', 10, 3]], objs: [['B', 6, 5]] });
    if (!isLit(6, 2)) return 'жаровня не светит заранее';
    await useAbility(cm, 'inferno', { x: 6, y: 2 });
    if (isLit(6, 2)) return 'Чёрное пламя не погасило свет';
    if (om.dead) return 'стрелок погиб, проверка невозможна';
    if (T.br(calcAttack(om, t, 'shot'), 'Чёрное пламя') !== -10) return 'нет −10 при стрельбе из пламени';
    return null;
  }],
  ['Удар из тени: можно подкрасться вплотную скрытым, +20, после удара — раскрыт', async () => {
    const [s, t] = T.setup({ units: [['order', 'shade', 5, 1], ['coven', 'marksman', 5, 5]], objs: [['c', 5, 4]] });
    s.st.concealed = true;
    await moveUnit(s, pathFrom(reach(s), 5, 6));
    if (!s.st.concealed) return 'сокрытие спало при подходе';
    const c = calcAttack(s, t, 'backstab');
    if (T.br(c, 'Из сокрытия') !== 20) return 'нет +20 из сокрытия';
    s.ap = 2; await useAbility(s, 'backstab', t);
    if (s.st.concealed) return 'после атаки не раскрыт';
    return null;
  }],
  ['Удар в спину: крит со спины, без бонуса сбоку и со стороны укрытия', () => {
    const [s, t] = T.setup({ units: [['order', 'shade', 4, 4], ['coven', 'marksman', 4, 3]], objs: [['c', 4, 2]] });
    const pos = (x, y) => { s.x = x; s.y = y; return calcAttack(s, t, 'backstab').exposed; };
    if (!pos(4, 4)) return 'сзади нет бонуса';
    if (!pos(5, 4)) return 'сзади-по-диагонали нет бонуса';
    if (pos(5, 3)) return 'сбоку есть бонус';
    if (pos(5, 2)) return 'со стороны укрытия есть бонус';
    return null;
  }],
  ['Метательный нож: 1 ОД, дальность 5', () => {
    const [s, a, b] = T.setup({ units: [['order', 'shade', 0, 0], ['coven', 'bastion', 5, 0], ['coven', 'priest', 6, 0]] });
    const ts = targetsFor(s, 'knife');
    if (!ts.includes(a)) return 'цель на 5 клетках недоступна';
    if (ts.includes(b)) return 'цель на 6 клетках доступна';
    if (ABIL.knife.ap !== 1) return 'стоимость не 1';
    return null;
  }],
  ['Сокрытие (Ковен): только во тьме, не ближе 2 к врагу, свет раскрывает', async () => {
    let [s, e] = T.setup({ side: 'coven', units: [['coven', 'shade', 3, 3], ['order', 'marksman', 3, 5]], objs: [['B', 12, 12]] });
    if (canUse(s, 'vanish').ok) return 'можно скрыться в 2 клетках от врага';
    e.x = 3; e.y = 9;
    if (!canUse(s, 'vanish').ok) return 'нельзя скрыться во тьме: ' + canUse(s, 'vanish').why;
    s.x = 11; s.y = 12;
    if (canUse(s, 'vanish').ok) return 'можно скрыться на свету';
    s.x = 3; s.y = 3; await useAbility(s, 'vanish');
    if (!s.st.concealed) return 'не скрылась';
    if (targetsFor(e, 'shot').includes(s)) return 'враг может выбрать скрытую целью';
    s.ap = 3; await moveUnit(s, pathFrom(reach(s), 6, 6));
    s.x = 11; s.y = 11; refreshLight();
    if (s.st.concealed) return 'свет не раскрыл Тень Ковена';
    return null;
  }],
  ['Покаяние (Орден): 2 ОД, работает на свету, свет не раскрывает', async () => {
    const [s, e] = T.setup({ units: [['order', 'shade', 11, 11], ['coven', 'marksman', 3, 3]], objs: [['B', 12, 12]] });
    if (!isLit(11, 11)) return 'клетка не освещена';
    if (!canUse(s, 'vanish').ok) return 'нельзя использовать на свету';
    await useAbility(s, 'vanish');
    if (s.ap !== 1) return 'стоимость не 2 ОД (осталось ' + s.ap + ')';
    refreshLight();
    if (!s.st.concealed) return 'свет раскрыл Клинка';
    return null;
  }],
  ['Сокрытие: конец хода вплотную к врагу раскрывает', async () => {
    const [s, e] = T.setup({ units: [['order', 'shade', 4, 4], ['coven', 'marksman', 4, 5]] });
    s.st.concealed = true;
    endTurn();
    if (s.st.concealed) return 'остался скрытым рядом с врагом';
    return null;
  }],
  ['Засада: шаг на скрытого врага — остановка, раскрытие, возврат ОД', async () => {
    const [u, s] = T.setup({ units: [['order', 'bastion', 2, 2], ['coven', 'shade', 2, 4]] });
    s.st.concealed = true;
    await moveUnit(u, pathFrom(reach(u), 2, 9));
    if (s.st.concealed) return 'скрытый не раскрыт';
    if (u.y > 3) return 'не остановился (y=' + u.y + ')';
    if (u.ap < 2) return 'ОД не возвращены (осталось ' + u.ap + ')';
    return null;
  }],
  ['Кара / Порча: дальность 7', () => {
    const [p, a, b] = T.setup({ units: [['order', 'priest', 0, 0], ['coven', 'bastion', 7, 0], ['coven', 'mystic', 8, 0]] });
    const ts = targetsFor(p, 'smite');
    if (!ts.includes(a) || ts.includes(b)) return 'дальность не 7';
    return null;
  }],
  ['Исцеление: через колонну, дальность 5, +5, гасит огонь', async () => {
    const [p, m, far] = T.setup({ units: [['order', 'priest', 1, 5], ['order', 'mystic', 3, 5], ['order', 'bastion', 7, 5]], objs: [['P', 2, 5]] });
    m.hp = 3; far.hp = 5; GAME.G.map[5][3].burn = 3;
    const ts = targetsFor(p, 'heal');
    if (!ts.includes(m)) return 'союзник за колонной недоступен';
    if (ts.includes(far)) return 'союзник на 6 клетках доступен';
    await useAbility(p, 'heal', m);
    if (m.hp !== 8) return 'лечение не +5 (ОЗ ' + m.hp + ')';
    if (GAME.G.map[5][3].burn) return 'огонь не погашен';
    return null;
  }],
  ['Благословение: +15 меткости и защиты на 2 хода', async () => {
    const [p, m, e] = T.setup({ units: [['order', 'priest', 2, 2], ['order', 'marksman', 3, 2], ['coven', 'marksman', 8, 2]] });
    await useAbility(p, 'hex', m);
    if (T.br(calcAttack(m, e, 'shot'), 'Благословение') !== 15) return 'нет +15 к меткости';
    if (T.br(calcAttack(e, m, 'shot'), 'Благословение') !== -15) return 'нет +15 к защите';
    await startTurn('coven'); await startTurn('order');
    if (!(m.st.blessed > 0)) return 'спало раньше второго хода';
    await startTurn('coven'); await startTurn('order');
    if (m.st.blessed > 0) return 'длится больше 2 ходов';
    return null;
  }],
  ['Проклятие: −15 меткости и защиты на 2 хода врага', async () => {
    const [p, e, a] = T.setup({ side: 'coven', units: [['coven', 'priest', 2, 2], ['order', 'marksman', 6, 2], ['coven', 'marksman', 9, 2]] });
    await useAbility(p, 'hex', e);
    if (T.br(calcAttack(e, a, 'shot'), 'Проклятие') !== -15) return 'нет −15 к меткости';
    if (T.br(calcAttack(a, e, 'shot'), 'Проклятие') !== 15) return 'нет −15 к защите';
    await startTurn('order'); await startTurn('coven');
    if (!(e.st.cursed > 0)) return 'спало раньше второго хода врага';
    await startTurn('order'); await startTurn('coven');
    if (e.st.cursed > 0) return 'длится больше 2 ходов';
    return null;
  }],
  ['Кровавая цена: −3 ОЗ, +1 ОД, раз за ход', async () => {
    const [u] = T.setup({ units: [['order', 'bastion', 2, 2]] });
    u.ap = 2; await useAbility(u, 'blood');
    if (u.ap !== 3 || u.hp !== u.maxHp - 3) return `ОД ${u.ap}, ОЗ ${u.hp}`;
    if (canUse(u, 'blood').ok) return 'можно повторить в том же ходу';
    return null;
  }],
  ['Жаровня: только рядом, гасит и зажигает свет', async () => {
    const [u, f] = T.setup({ units: [['order', 'bastion', 5, 6], ['order', 'priest', 10, 10]], objs: [['B', 5, 5]] });
    if (canUse(f, 'brazier').ok) return 'доступно без соседней жаровни';
    if (!isLit(5, 7)) return 'жаровня не светит';
    await useAbility(u, 'brazier', GAME.G.map[5][5]);
    if (isLit(5, 7)) return 'не погасла';
    u.ap = 3; await useAbility(u, 'brazier', GAME.G.map[5][5]);
    if (!isLit(5, 7)) return 'не зажглась';
    return null;
  }],
  ['Стойкость: +8 защиты за ОД, не больше 24', async () => {
    const [a, b] = T.setup({ units: [['order', 'bastion', 2, 2], ['order', 'priest', 6, 6]] });
    a.ap = 2; b.ap = 4; endTurn();
    if (a.guard !== 16) return 'за 2 ОД не 16: ' + a.guard;
    if (b.guard !== 24) return 'за 4 ОД не 24: ' + b.guard;
    return null;
  }],
  ['Задевание: промах в пределах 10% — половина урона', async () => {
    const [m, t] = T.setup({ units: [['order', 'marksman', 2, 2], ['coven', 'priest', 2, 6]] });
    const c = calcAttack(m, t, 'shot');
    const undo = T.rig([(c.hit + 5) / 100, 0.99]);
    let out; try { out = await doAttack(m, t, 'shot'); } finally { undo(); }
    if (out !== 'graze') return 'исход ' + out;
    if (t.maxHp - t.hp !== Math.floor(ABIL.shot.dmg[1] / 2)) return 'урон ' + (t.maxHp - t.hp);
    return null;
  }],
  ['Братство: Орден +5 к защите рядом с союзником', () => {
    const [om, ob, cm] = T.setup({ units: [['order', 'marksman', 5, 6], ['order', 'bastion', 10, 10], ['coven', 'marksman', 5, 12]] });
    if (T.br(calcAttack(cm, om, 'shot'), 'Братство') !== null) return 'бонус без союзника рядом';
    ob.x = 6; ob.y = 6;
    if (T.br(calcAttack(cm, om, 'shot'), 'Братство') !== -5) return 'нет +5 рядом с союзником';
    return null;
  }],
  ['Рассвет: всё освещено, скрытые раскрыты, лечение 2, перезарядка 4 раунда', async () => {
    const [o, s] = T.setup({ units: [['order', 'bastion', 2, 2], ['coven', 'shade', 10, 10]] });
    s.st.concealed = true; o.hp = o.maxHp - 5; GAME.G.res.order = 7;
    await useUlt('order');
    if (!isLit(10, 10) || !isLit(0, 15)) return 'не всё освещено';
    if (s.st.concealed) return 'скрытый не раскрыт';
    if (o.hp !== o.maxHp - 3) return 'лечение не 2';
    GAME.G.res.order = 10;
    if (ultReady('order')) return 'нет перезарядки';
    GAME.G.round += 4;
    if (!ultReady('order')) return 'не перезарядилась за 4 раунда';
    return null;
  }],
  ['Затмение: жаровни гаснут, Орден −10, Ковен лечится на 2', async () => {
    const [c, o, t] = T.setup({ side: 'coven', units: [['coven', 'bastion', 2, 2], ['order', 'marksman', 5, 6], ['coven', 'priest', 5, 10]], objs: [['B', 5, 5]] });
    c.hp = c.maxHp - 5;
    await useUlt('coven');
    if (isLit(5, 6)) return 'жаровня светит';
    if (T.br(calcAttack(o, t, 'shot'), 'Ужас затмения') !== -10) return 'нет −10 Ордену';
    if (c.hp !== c.maxHp - 3) return 'лечение не 2';
    return null;
  }],
  ['Ульты не перебивают друг друга (в обе стороны)', async () => {
    T.setup({ units: [['order', 'bastion', 2, 2], ['coven', 'bastion', 10, 10]], objs: [['B', 5, 5]] });
    const G = GAME.G;
    G.res.order = 10; G.res.coven = 10;
    await useUlt('order');
    G.side = 'coven';
    if (ultReady('coven')) return 'Затмение доступно во время Рассвета';
    await useUlt('coven');
    if (G.eclipse > 0) return 'Затмение наложилось поверх Рассвета';
    if (!isLit(15, 15)) return 'Рассвет погас в ход врага';
    G.dawn = 0; G.side = 'coven'; G.ultRound.coven = -9; refreshLight();
    await useUlt('coven');
    G.side = 'order'; G.ultRound.order = -9;
    if (ultReady('order')) return 'Рассвет доступен во время Затмения';
    await useUlt('order');
    if (G.dawn > 0) return 'Рассвет перебил Затмение';
    if (isLit(5, 6)) return 'жаровня светит во время Затмения';
    return null;
  }],
  ['Алтарь: очко со 2-го раунда, враг рядом блокирует, 4 очка — победа', async () => {
    const [o, c] = T.setup({ round: 2, units: [['order', 'bastion', 7, 7], ['coven', 'bastion', 2, 2]] });
    await startTurn('order');
    if (GAME.G.altar.order !== 1) return 'очко не начислено';
    c.x = 6; c.y = 6; await startTurn('order');
    if (GAME.G.altar.order !== 1) return 'враг вплотную не заблокировал';
    c.x = 2; c.y = 2; GAME.G.altar.order = 3; await startTurn('order');
    if (GAME.G.winner !== 'order') return 'нет ритуальной победы при 4 очках';
    return null;
  }],
  ['Видимость симметрична на боевой карте', () => {
    T.setup({ keepMap: true });
    const fl = []; for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (!GAME.G.map[y][x].obj) fl.push({ x, y });
    for (const a of fl) for (const b of fl) if (hasLOS(a, b) !== hasLOS(b, a)) return `(${a.x},${a.y}) ↔ (${b.x},${b.y})`;
    return null;
  }],
  ['Укрытие засчитывается, только если оно между целью и стрелком', () => {
    const [t, front, side] = T.setup({ units: [['coven', 'bastion', 5, 5], ['order', 'marksman', 5, 10], ['order', 'priest', 10, 5]], objs: [['c', 5, 6]] });
    if (T.br(calcAttack(front, t, 'shot'), 'Половинное укрытие') !== -20) return 'спереди нет укрытия';
    if (T.br(calcAttack(side, t, 'shot'), 'Половинное укрытие') !== null) return 'сбоку засчитано укрытие';
    return null;
  }],

  // ---------------- Наёмники ----------------
  ['Арбалетчик: болт пробивает броню, после выстрела нужна перезарядка', async () => {
    const [x, g] = T.setup({ units: [['order', 'crossbow', 2, 2], ['coven', 'golem', 2, 7]] });
    const undo = T.rigConst(0.01);
    try { await useAbility(x, 'heavybolt', g); } finally { undo(); }
    const lost = g.maxHp - g.hp;
    if (lost < ABIL.heavybolt.dmg[0]) return 'броня голема уменьшила урон: −' + lost;
    if (x.loaded) return 'арбалет остался заряжен';
    if (canUse(x, 'heavybolt').ok) return 'можно стрелять без перезарядки';
    x.ap = 3; await useAbility(x, 'reload');
    if (!x.loaded || !canUse(x, 'heavybolt').ok) return 'перезарядка не работает';
    if (CLASSES.crossbow.mov >= CLASSES.marksman.mov) return 'не медленнее обычного стрелка';
    if (!(CLASSES.crossbow.armor > 0)) return 'нет брони';
    return null;
  }],
  ['Броня уменьшает физический урон (у обычного выстрела)', async () => {
    const [m, g] = T.setup({ units: [['order', 'marksman', 2, 2], ['coven', 'golem', 2, 7]] });
    const undo = T.rig([0.01, 0.99, 0]);  // попадание, без крита, минимальный урон
    try { await doAttack(m, g, 'shot'); } finally { undo(); }
    const lost = g.maxHp - g.hp;
    if (lost !== Math.max(1, ABIL.shot.dmg[0] - g.armor)) return 'урон ' + lost + ' вместо ' + (ABIL.shot.dmg[0] - g.armor);
    return null;
  }],
  ['Берсерк: каждая рана даёт +1 к урону (до +4)', async () => {
    const [b, e] = T.setup({ units: [['order', 'berserk', 4, 4], ['coven', 'marksman', 4, 5]] });
    for (let i = 0; i < 6; i++) await damageUnit(b, 1, e, 'hit');
    if (b.rage !== 4) return 'ярость ' + b.rage + ' вместо 4';
    const undo = T.rig([0.01, 0.99, 0]);  // попадание, без крита, минимальный урон
    try { await doAttack(b, e, 'hack'); } finally { undo(); }
    if (e.maxHp - e.hp !== ABIL.hack.dmg[0] + 4) return 'урон ' + (e.maxHp - e.hp) + ' вместо ' + (ABIL.hack.dmg[0] + 4);
    if (CLASSES.berserk.mov <= 4) return 'не быстрый';
    return null;
  }],
  ['Волк: 30% увернуться от дальней атаки, рваная рана — кровотечение', async () => {
    const [w, m, v] = T.setup({ units: [['order', 'wolf', 4, 4], ['coven', 'marksman', 4, 9], ['coven', 'bastion', 4, 5]] });
    let ev = 0; const N = 200;
    const orig = Math.random;
    for (let i = 0; i < N; i++) { w.hp = w.maxHp; w.dead = false; const r = await doAttack(m, w, 'knife', {}); if (r === 'evade') ev++; }
    const hits = N; const rate = ev / hits;
    if (rate < 0.15 || rate > 0.45) return 'доля уклонений ' + rate.toFixed(2);
    w.hp = w.maxHp; w.dead = false; w.ap = 3;
    const undo = T.rigConst(0.01);
    try { await useAbility(w, 'rend', v); } finally { undo(); }
    if (v.st.bleed !== 3) return 'нет кровотечения';
    const hp = v.hp; await startTurn('coven');
    if (v.hp !== hp - 2) return 'кровотечение не отнимает 2 ОЗ (было ' + hp + ', стало ' + v.hp + ')';
    void orig;
    return null;
  }],
  ['Скелет-воин: раз за бой встаёт с 50% ОЗ', async () => {
    const [s, e] = T.setup({ units: [['order', 'skelwar', 4, 4], ['coven', 'marksman', 4, 9]] });
    await damageUnit(s, 99, e, 'hit');
    if (s.dead) return 'погиб с первого раза';
    if (s.hp !== Math.ceil(s.maxHp / 2)) return 'ОЗ после воскрешения ' + s.hp;
    await damageUnit(s, 99, e, 'hit');
    if (!s.dead) return 'воскрес второй раз';
    return null;
  }],
  ['Нежить: −50% от физических дальних атак, видит во тьме', async () => {
    const [a, s, t] = T.setup({ units: [['order', 'marksman', 2, 2], ['coven', 'skelarch', 2, 7], ['order', 'bastion', 8, 7]] });
    const undo = T.rigConst(0.99);  // максимальный урон: бросок попадания подменим вручную
    undo(); const undo2 = T.rig([0.01, 0.99, 0.99]);  // попадание, без крита, максимальный урон
    let out; try { out = await doAttack(a, s, 'shot'); } finally { undo2(); }
    const lost = s.maxHp - s.hp;
    if (out === 'hit' && lost !== Math.floor(ABIL.shot.dmg[1] / 2)) return 'урон ' + lost + ' вместо половины';
    if (calcAttack(s, t, 'poisonarrow').darkMiss !== 0) return 'нежить страдает от тьмы';
    return null;
  }],
  ['Скелет-лучник: яд 3 хода — −2 шага, −10 меткости, −1 ОЗ в начале хода', async () => {
    const [s, v, o] = T.setup({ side: 'coven', units: [['coven', 'skelarch', 2, 2], ['order', 'marksman', 2, 7], ['coven', 'bastion', 9, 7]] });
    const undo = T.rigConst(0.01);
    try { await useAbility(s, 'poisonarrow', v); } finally { undo(); }
    if (v.st.poison !== 3) return 'нет яда';
    if (effMov(v) !== v.mov - 2) return 'шаг не уменьшен';
    if (T.br(calcAttack(v, o, 'shot'), 'Яд') !== -10) return 'нет −10 к меткости';
    const hp = v.hp; await startTurn('order');
    if (v.hp !== hp - 1) return 'яд не отнял 1 ОЗ';
    await startTurn('order'); await startTurn('order');
    if (v.st.poison !== 0) return 'яд длится дольше 3 ходов';
    if (CLASSES.skelarch.traits.includes('revive')) return 'лучник воскресает';
    return null;
  }],
  ['Голем: землетрясение бьёт всех вокруг и крошит укрытия, видит во тьме', async () => {
    const [g, e, a, f] = T.setup({ units: [['order', 'golem', 5, 5], ['coven', 'marksman', 6, 6], ['order', 'priest', 4, 5], ['coven', 'mystic', 8, 8]], objs: [['h', 5, 4]] });
    await useAbility(g, 'quake');
    if (e.hp === e.maxHp) return 'враг рядом не задет';
    if (a.hp === a.maxHp) return 'союзник рядом не задет (обещано «и своих»)';
    if (f.hp !== f.maxHp) return 'задет дальний враг';
    if (GAME.G.map[4][5].obj) return 'соседнее надгробие уцелело';
    if (calcAttack(g, f, 'smash', { from: { x: 7, y: 8 } }).darkMiss !== 0) return 'голем страдает от тьмы';
    return null;
  }],
  ['Катапульта: не ходит, стоит ресурс, ядро равновероятно падает в одну из 9 клеток', async () => {
    const [c, e] = T.setup({ units: [['order', 'catapult', 1, 1], ['coven', 'bastion', 12, 12]] });
    const r = reach(c); let n = 0; for (const v of r.cost) if (isFinite(v)) n++;
    if (n !== 1) return 'катапульта может ходить';
    if (!ABIL.lob.res) return 'не тратит ресурс';
    if (lobTiles(c).some(t => Math.hypot(t.x - 1, t.y - 1) < ABIL.lob.minRange)) return 'нет мёртвой зоны';
    const counts = {}; const N = 900;
    for (let i = 0; i < N; i++) { const h = lobLanding({ x: 8, y: 8 }); const k = (h.x - 8) + ',' + (h.y - 8); counts[k] = (counts[k] || 0) + 1; }
    if (Object.keys(counts).length !== 9) return 'клеток попадания: ' + Object.keys(counts).length;
    for (const k in counts) if (counts[k] < N / 9 * 0.6 || counts[k] > N / 9 * 1.4) return 'неравномерно: ' + JSON.stringify(counts);
    const r0 = GAME.G.res.order; c.ap = 3; await useAbility(c, 'lob', { x: 8, y: 8 });
    if (GAME.G.res.order !== r0 - ABIL.lob.res) return 'ресурс не списан';
    return null;
  }],
  ['Фонарщик: несёт свет, вспышка ослепляет (−20) и срывает сокрытие, фонарь можно прикрыть', async () => {
    const [l, e, s, o] = T.setup({ units: [['order', 'lantern', 5, 5], ['coven', 'marksman', 7, 5], ['coven', 'shade', 5, 7], ['order', 'bastion', 10, 10]] });
    if (!isLit(5, 6)) return 'фонарь не светит';
    s.st.concealed = true;
    await useAbility(l, 'flash');
    if (e.st.blind !== 1) return 'враг не ослеплён';
    if (T.br(calcAttack(e, o, 'shot'), 'Ослеплён') !== -20) return 'нет −20';
    if (s.st.concealed) return 'сокрытие не сорвано';
    await useAbility(l, 'shutter');
    if (isLit(5, 6)) return 'прикрытый фонарь светит';
    GAME.G.side = 'coven'; endTurn();
    if (e.st.blind) return 'ослепление не спало после хода врага';
    return null;
  }],
  ['Сбор отрядов: до 6 бойцов, наёмники доступны обеим сторонам', () => {
    GAME.newGame('order', { order: ['golem', 'catapult', 'wolf', 'bastion', 'skelwar', 'lantern'], coven: ['golem', 'crossbow', 'berserk', 'skelarch', 'priest', 'shade'] });
    const G = GAME.G;
    if (G.units.filter(u => u.side === 'order').length !== 6) return 'у Ордена не 6';
    if (!G.units.some(u => u.side === 'coven' && u.cls === 'golem')) return 'у Ковена нет голема';
    const cells = new Set(G.units.map(u => u.x + ',' + u.y)); if (cells.size !== 12) return 'бойцы стоят друг на друге';
    for (const u of G.units) if (!walkable(u.x, u.y)) return 'боец в стене: ' + u.name;
    GAME.newGame('order', { order: DEFAULT_ROSTER, coven: DEFAULT_ROSTER });
    return null;
  }],

  // ---------------- Характеры ИИ ----------------
  ['Характер выводится из показателей, а не из класса (новый класс попадает под модель)', () => {
    T.setup({ units: [['order', 'bastion', 2, 2]] });
    // временный «новый» класс: быстрый ближник с малым запасом ОЗ — должен стать стайным хищником
    CLASSES.__test = { merc: true, hp: 9, mov: 7, aim: 60, def: 0, crit: 5, armor: 0, role: 'тест', names: { order: 'Тест', coven: 'Тест' }, abil: ['bite'], traits: [], desc: '' };
    MERC_NAMES.__test = ['Тестовый'];
    let r = null;
    try {
      const u = makeUnit('order', '__test', 0, 0);
      if (characterOf(u) !== 'pack') r = 'быстрый ближник получил ' + characterOf(u);
      CLASSES.__test.hp = 18; CLASSES.__test.mov = 3;
      const w = makeUnit('order', '__test', 0, 0);
      if (!r && characterOf(w) !== 'wall') r = 'крепкий медленный ближник получил ' + characterOf(w);
      CLASSES.__test.abil = ['shot']; CLASSES.__test.hp = 10;
      const a = makeUnit('order', '__test', 0, 0);
      if (!r && characterOf(a) !== 'patient') r = 'стрелок получил ' + characterOf(a);
    } finally { delete CLASSES.__test; delete MERC_NAMES.__test; }
    return r;
  }],
  ['Живая стена встаёт между врагом и самым израненным союзником (по текущим ОЗ)', () => {
    const [b, weak, strong, e] = T.setup({ units: [['order', 'bastion', 7, 3], ['order', 'marksman', 3, 3], ['order', 'priest', 11, 3], ['coven', 'marksman', 3, 12]] });
    weak.hp = 2;
    const between = AI.pos(b, 3, 5), aside = AI.pos(b, 11, 5);
    if (!(between > aside)) return `клетка у израненного (${between.toFixed(1)}) не лучше клетки у здорового (${aside.toFixed(1)})`;
    weak.hp = weak.maxHp; strong.hp = 2;
    if (!(AI.pos(b, 11, 5) > AI.pos(b, 3, 5))) return 'не переключился на нового израненного';
    return null;
  }],
  ['Стайный хищник не рвётся вперёд союзников и не бьёт одиночную цель', () => {
    const [w, ally, e1, e2] = T.setup({ units: [['order', 'wolf', 4, 10], ['order', 'bastion', 4, 9], ['coven', 'marksman', 4, 3], ['coven', 'priest', 6, 3]] });
    const ahead = AI.pos(w, 4, 5), withAlly = AI.pos(w, 5, 9);
    if (!(withAlly > ahead)) return `клетка впереди всех (${ahead.toFixed(1)}) лучше клетки у союзника (${withAlly.toFixed(1)})`;
    w.x = 4; w.y = 4; const solo = AI.bestAction(w, { x: 4, y: 4 }, 3);
    ally.x = 5; ally.y = 3; const pinned = AI.bestAction(w, { x: 4, y: 4 }, 3);
    if (!(pinned && solo && pinned.val > solo.val)) return 'атака по цели в клещах не ценнее атаки по одиночке';
    return null;
  }],
  ['Угроза ответного хода: хрупкий боец избегает клетки под огнём нескольких врагов', () => {
    const [m, e1, e2, e3] = T.setup({ units: [['order', 'mystic', 2, 8], ['coven', 'marksman', 8, 2], ['coven', 'mystic', 9, 4], ['coven', 'shade', 8, 5]] });
    const open = AI.threatAt(m, { x: 6, y: 6 }), far = AI.threatAt(m, { x: 0, y: 14 });
    if (!(open.exp > far.exp)) return 'угроза у врагов не выше угрозы вдали';
    if (!(AI.pos(m, 0, 14) > AI.pos(m, 6, 6))) return 'хрупкий выбирает клетку под огнём';
    return null;
  }],
  ['Характер в карточке виден только у бойцов ИИ', () => {
    T.setup({ units: [['order', 'wolf', 2, 2], ['coven', 'wolf', 8, 8]] });
    const o = GAME.G.units.find(u => u.side === 'order' && u.cls === 'wolf'), c = GAME.G.units.find(u => u.side === 'coven' && u.cls === 'wolf');
    GAME.G.control = { order: 'human', coven: 'ai' };
    if (UI.charLine(o)) return 'у бойца игрока показан характер';
    if (!UI.charLine(c).includes('Характер')) return 'у бойца ИИ нет характера';
    if (!UI.unitTip(c).includes('Характер') || UI.unitTip(o).includes('Характер')) return 'подсказка показывает характер не тем';
    return null;
  }],
  ['Ресурс: герой на свету/во тьме в конце хода даёт ±1, наёмник — нет, попадания ничего не дают', async () => {
    const [o1, o2, m, c1] = T.setup({ units: [['order', 'marksman', 5, 6], ['order', 'priest', 12, 12], ['order', 'wolf', 2, 2], ['coven', 'marksman', 5, 4]], objs: [['B', 5, 5]] });
    const G = GAME.G; G.res.order = 5; G.res.coven = 5;
    if (!isLit(5, 6) || isLit(12, 12)) return 'неверная подготовка света';
    const undo = T.rigConst(0.01); try { await doAttack(o1, c1, 'shot'); } finally { undo(); }
    if (G.res.order !== 5) return 'попадание дало ресурс';
    G.side = 'order'; G.control = { order: 'human', coven: 'human' }; endTurn();
    if (G.res.order !== 5) return 'Орден: свет +1 и тьма −1 должны дать 0, а ресурс ' + G.res.order;
    o2.x = 6; o2.y = 6; G.side = 'order'; endTurn();
    if (G.res.order !== 7) return 'два героя на свету должны дать +2, ресурс ' + G.res.order;
    G.side = 'coven'; c1.x = 5; c1.y = 4; endTurn();
    if (G.res.coven !== 4) return 'герой Ковена на свету должен отнять 1, ресурс ' + G.res.coven;
    return null;
  }],
  ['Особые умения Ордена: факел только у Капеллана, осветительный болт только у Охотницы на ведьм', async () => {
    const [p, m, b, e] = T.setup({ units: [['order', 'priest', 2, 2], ['order', 'marksman', 3, 2], ['order', 'bastion', 4, 2], ['coven', 'bastion', 3, 8]] });
    if (!abilitiesOf(p).includes('torch')) return 'у Капеллана нет факела';
    if (abilitiesOf(b).includes('torch') || abilitiesOf(m).includes('torch')) return 'факел есть у других героев';
    if (!abilitiesOf(m).includes('flare')) return 'у Охотницы на ведьм нет осветительного болта';
    if (!nightVision(m)) return 'Охотница на ведьм не видит во тьме';
    if (nightVision(b)) return 'Храмовник видит во тьме';
    const cm = GAME.G.units.find(u => u.side === 'coven' && u.cls === 'priest');
    if (cm && abilitiesOf(cm).includes('torch')) return 'факел у Ковена';
    if (isLit(3, 8)) return 'цель заранее на свету';
    if (calcAttack(m, e, 'flare').darkMiss !== 0) return 'осветительный болт страдает от тьмы';
    const r0 = GAME.G.res.order;
    const undo = T.rigConst(0.01); try { await useAbility(m, 'flare', e); } finally { undo(); }
    if (GAME.G.res.order !== r0 - ABIL.flare.res) return 'не списана Вера';
    if (!isLit(3, 8) || !isLit(3, 9)) return 'клетка цели не осветилась';
    if (calcAttack(b, e, 'cleave', { from: { x: 3, y: 7 } }).darkMiss !== 0) return 'союзники всё ещё промахиваются из-за тьмы';
    p.ap = 3; await useAbility(p, 'torch', { x: 10, y: 10 });
    if (!isLit(10, 10) || !isLit(11, 11)) return 'факел не светит';
    for (let i = 0; i < 4; i++) await startTurn(i % 2 ? 'order' : 'coven');
    if (isLit(10, 10)) return 'факел горит дольше 2 раундов';
    return null;
  }],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(GAME_URL);
  await page.addScriptTag({ path: HELPERS });
  await page.waitForFunction(() => window.GAME && window.T);
  let fail = 0;
  for (const [name, fn] of TESTS) {
    let res;
    try { res = await page.evaluate(`(${fn.toString()})()`); }
    catch (e) { res = 'исключение: ' + e.message.split('\n')[0]; }
    if (pageErrors.length) { res = (res ? res + '; ' : '') + 'ошибка страницы: ' + pageErrors.splice(0).join(' | '); }
    if (res) { fail++; console.log(`✗ ${name}\n    → ${res}`); } else console.log(`✓ ${name}`);
  }
  await browser.close();
  console.log(`\n${TESTS.length - fail}/${TESTS.length} проверок пройдено`);
  process.exit(fail ? 1 : 0);
})();
