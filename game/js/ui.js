'use strict';
// ============================================================
//  Интерфейс (DOM), ввод, меню, переходы
// ============================================================
const UI = {};
const $ = s => document.querySelector(s);

UI.init = function () {
  // меню
  document.querySelectorAll('.card[data-mode]').forEach(el => {
    el.addEventListener('click', () => { SFX.init(); UI.openArmy(el.dataset.mode); });
    el.addEventListener('mouseenter', () => { SFX.init(); SFX.play('click'); });
  });
  $('#btnCodex').onclick = () => UI.codex(true);
  document.querySelectorAll('.army-tab').forEach(t => t.onclick = () => { UI.armySide = t.dataset.side; SFX.play('click'); UI.renderArmy(); });
  $('#armyBack').onclick = () => UI.closeArmy();
  $('#armyGo').onclick = () => { UI.closeArmy(); UI.startGame(UI.armyMode); };
  $('#armyDefault').onclick = () => { UI.rosters[UI.armySide] = DEFAULT_ROSTER.slice(); UI.renderArmy(); };
  $('#armyRandom').onclick = () => UI.armyRandom(UI.armySide);
  $('#armyClear').onclick = () => { UI.rosters[UI.armySide] = []; UI.renderArmy(); };
  $('#codexClose').onclick = () => UI.codex(false);
  $('#endTurn').onclick = () => UI.tryEndTurn();
  $('#ultBtn').onclick = () => { if (UI.humanTurn()) useUlt(G.side); };
  $('#btnMenu').onclick = () => UI.pause(true);
  $('#pResume').onclick = () => UI.pause(false);
  $('#pCodex').onclick = () => UI.codex(true);
  $('#pRestart').onclick = () => { UI.pause(false); UI.startGame(UI.lastMode); };
  $('#pQuit').onclick = () => { UI.pause(false); UI.toMenu(); };
  $('#pSound').onclick = () => { const on = SFX.toggle(); $('#pSound').textContent = 'Звук: ' + (on ? 'вкл' : 'выкл'); };
  $('#confirmYes').onclick = () => { $('#confirm').classList.add('hidden'); UI.doEndTurn(); };
  $('#confirmNo').onclick = () => $('#confirm').classList.add('hidden');
  $('#endAgain').onclick = () => UI.startGame(UI.lastMode);
  $('#endMenu').onclick = () => UI.toMenu();
  document.querySelectorAll('#specBar button').forEach(b => b.onclick = () => {
    G.speed = +b.dataset.speed; document.querySelectorAll('#specBar button').forEach(x => x.classList.toggle('on', x === b));
  });
  const cv = R.cv;
  cv.addEventListener('mousemove', e => UI.onMove(e));
  cv.addEventListener('mousedown', e => UI.onDown(e));
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('wheel', e => { if (G.scene !== 'battle') return; e.preventDefault(); R.cam.tz = clamp(R.cam.tz * (e.deltaY > 0 ? 0.9 : 1.1), R.baseZ * 0.7, R.baseZ * 1.8); }, { passive: false });
  cv.addEventListener('mouseleave', () => { G.hover = null; UI.tip(null); $('#tileInfo').classList.remove('show'); });
  window.addEventListener('keydown', e => UI.onKey(e));
  window.addEventListener('mouseup', () => { UI.drag = null; });
  window.addEventListener('mousemove', e => {
    if (UI.drag) { R.cam.tx -= (e.clientX - UI.drag.x) / R.cam.z; R.cam.ty -= (e.clientY - UI.drag.y) / R.cam.z; R.cam.x = R.cam.tx; R.cam.y = R.cam.ty; UI.drag = { x: e.clientX, y: e.clientY }; }
  });
  UI.portrait = $('#portrait').getContext('2d');
  UI.drawMenuEmblems();
};

UI.humanTurn = () => G.scene === 'battle' && !G.winner && !isAI(G.side) && !G.busy;

// ---------------- Переходы ----------------
UI.veil = function (mid) {
  return new Promise(res => {
    const v = $('#veil'); v.classList.remove('out'); v.classList.add('in');
    setTimeout(() => { mid && mid(); v.classList.remove('in'); v.classList.add('out'); setTimeout(() => { v.classList.remove('out'); res(); }, 900); }, 900);
  });
};
UI.startGame = function (mode) {
  UI.lastMode = mode;
  $('#endscreen').classList.add('hidden');
  document.body.classList.remove('ended');
  UI.veil(() => {
    newGame(mode, UI.rosters);
    G.scene = 'battle';
    document.body.classList.add('in-battle');
    $('#menu').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    $('#specBar').classList.toggle('hidden', !G.spectator);
    document.body.classList.toggle('spectating', G.spectator);
    G.speed = G.spectator ? 1 : 1;
    document.querySelectorAll('#specBar button').forEach(x => x.classList.toggle('on', x.dataset.speed === '1'));
    R.cam.tz = R.baseZ; R.cam.tx = 0; R.cam.ty = 240;
    document.body.classList.toggle('big-roster', G.units.length > 10); UI.buildRoster(); UI.refresh(); UI.log();
  }).then(() => startTurn(G.first));
};
UI.toMenu = function () {
  UI.veil(() => {
    G.gameId++; Timers.length = 0; FX.clear();
    document.body.classList.remove('ended');
    G.scene = 'menu'; G.winner = null; G.sel = null; G.mode = null;
    buildMap(); spawnUnits(); refreshLight(); R.groundDirty = true;
    document.body.classList.remove('in-battle');
    $('#hud').classList.add('hidden'); $('#endscreen').classList.add('hidden');
    $('#menu').classList.remove('hidden');
  });
};
UI.codex = function (on) { $('#codex').classList.toggle('hidden', !on); };
UI.pause = function (on) { $('#pause').classList.toggle('hidden', !on); };

// ---------------- Баннер хода ----------------
UI.banner = function (side, extra) {
  return new Promise(res => {
    const b = $('#banner'); const F = FACTIONS[side];
    const who = G.spectator ? `Ход ${F.gen}` : isAI(side) ? `Ход врага — ${F.short}` : `Ваш ход — ${F.short}`;
    b.className = 'show b-' + side;
    b.innerHTML = `<div class="b-line"></div><div class="b-sigil">${svgIcon(side === 'order' ? 'sun' : 'moon', 46)}</div>
      <div class="b-title">${who}</div><div class="b-sub">Раунд ${G.round} из ${MAX_ROUNDS}${extra ? ' · ' + extra : ''}</div><div class="b-line"></div>`;
    SFX.play('turn');
    const dur = G.spectator ? 1300 / G.speed : 1400;
    setTimeout(() => { b.className = 'hide b-' + side; }, dur);
    setTimeout(() => { b.className = ''; res(); }, dur + 450);
  });
};
UI.ultFlash = function (side) {
  const f = $('#ultFlash'); const F = FACTIONS[side];
  f.className = 'show u-' + side;
  f.innerHTML = `<div class="uf-title">${F.ult.name}</div><div class="uf-sub">${F.ult.desc}</div>`;
  setTimeout(() => f.className = '', 2200);
};

// ---------------- Ростер ----------------
// ---------------- Сбор отрядов ----------------
UI.rosters = { order: DEFAULT_ROSTER.slice(), coven: DEFAULT_ROSTER.slice() };
UI.openArmy = function (mode) {
  UI.armyMode = mode;
  const a = $('#army'); a.classList.remove('hidden');
  $('#armyMode').textContent = mode === 'spectator' ? 'Режим зрителя: обе стороны ведёт ИИ' : `Вы ведёте ${mode === 'order' ? 'Орден' : 'Ковен'}, противника — ИИ`;
  UI.armySide = mode === 'coven' ? 'coven' : 'order';
  UI.armyUnits = [];
  UI.renderArmy();
};
UI.closeArmy = function () { $('#army').classList.add('hidden'); UI.armyUnits = []; };
UI.armyCanAdd = function (side, cls) {
  const r = UI.rosters[side];
  if (r.length >= MAX_SQUAD) return 'Отряд полон (' + MAX_SQUAD + ')';
  if (CLASSES[cls].faction && r.includes(cls)) return 'Герой фракции — только один';
  if (cls === 'catapult' && r.includes('catapult')) return 'Только одна катапульта';
  if (r.filter(c => c === cls).length >= 2) return 'Не больше двух одинаковых';
  return null;
};
UI.renderArmy = function () {
  const side = UI.armySide || 'order';
  document.querySelectorAll('.army-tab').forEach(t => t.classList.toggle('on', t.dataset.side === side));
  UI.armyUnits = [];
  const mk = (cls, sd, big) => { const cv = document.createElement('canvas'); cv.width = big ? 96 : 64; cv.height = big ? 96 : 64; const u = makeUnit(sd, cls, 0, 0); u.face = 1; UI.armyUnits.push({ cv, u, sc: big ? 1.6 : 1.05 }); return cv; };
  // отряды
  for (const sd of ['order', 'coven']) {
    const box = $(sd === 'order' ? '#squadOrder' : '#squadCoven'); box.innerHTML = '';
    const r = UI.rosters[sd];
    for (let i = 0; i < MAX_SQUAD; i++) {
      const slot = document.createElement('div'); slot.className = 'slot' + (r[i] ? '' : ' empty');
      if (r[i]) {
        slot.appendChild(mk(r[i], sd, false));
        slot.insertAdjacentHTML('beforeend', `<span>${CLASSES[r[i]].names[sd]}</span><b class="x-rm">×</b>`);
        slot.dataset.tip = 'Убрать из отряда';
        slot.onclick = () => { r.splice(i, 1); SFX.play('click'); UI.renderArmy(); };
      } else slot.innerHTML = '<span>пусто</span>';
      box.appendChild(slot);
    }
    $(sd === 'order' ? '#cntOrder' : '#cntCoven').textContent = `${r.length}/${MAX_SQUAD}`;
  }
  // пул
  const pool = $('#armyPool'); pool.innerHTML = '';
  const order = Object.keys(CLASSES).filter(c => CLASSES[c].faction).concat(Object.keys(CLASSES).filter(c => CLASSES[c].merc));
  for (const cls of order) {
    const C = CLASSES[cls];
    const why = UI.armyCanAdd(side, cls);
    const card = document.createElement('div'); card.className = 'pcard' + (why ? ' off' : '') + (C.merc ? ' merc' : ' fac-' + side);
    card.appendChild(mk(cls, side, true));
    const hp = (side === 'coven' && C.hpCoven) || C.hp;
    card.insertAdjacentHTML('beforeend', `<div class="pc-t">${C.names[side]}</div><div class="pc-r">${C.merc ? 'наёмник' : 'герой фракции'} · ${C.role}</div>
      <div class="pc-s">ОЗ ${hp} · Шаг ${C.mov} · Броня ${C.armor || 0}</div><div class="pc-d">${C.desc}</div>`);
    card.dataset.tip = `<b>${C.names[side]}</b><br>${C.desc}<br><span class="t-dim">Умения: ${C.abil.map(id => abName(id, side)).join(', ')}</span>${why ? `<br><span class="t-bad">${why}</span>` : ''}`;
    card.onclick = () => { const w = UI.armyCanAdd(side, cls); if (w) { UI.toast(w); return; } UI.rosters[side].push(cls); SFX.play('select'); UI.renderArmy(); };
    pool.appendChild(card);
  }
  $('#armyGo').disabled = !UI.rosters.order.length || !UI.rosters.coven.length;
};
UI.armyRandom = function (side) {
  const r = UI.rosters[side] = [];
  const all = Object.keys(CLASSES);
  let guard = 0;
  while (r.length < MAX_SQUAD && guard++ < 200) { const c = all[Math.floor(Math.random() * all.length)]; if (!UI.armyCanAdd(side, c)) r.push(c); }
  UI.renderArmy();
};
UI.buildRoster = function () {
  const el = $('#roster'); el.innerHTML = '';
  for (const side of ['order', 'coven']) {
    const col = document.createElement('div'); col.className = 'r-col r-' + side;
    col.innerHTML = `<div class="r-head">${FACTIONS[side].short}</div>`;
    for (const u of G.units.filter(v => v.side === side)) {
      const d = document.createElement('div'); d.className = 'r-unit'; d.dataset.id = u.id;
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; d.appendChild(cv);
      d.insertAdjacentHTML('beforeend', `<div class="r-info"><div class="r-name">${u.name}</div><div class="r-hp"><i></i></div></div>`);
      d.onclick = () => { if (u.dead) return; if (UI.humanTurn() && u.side === G.side) selectUnit(u); else R.focus(u.x, u.y); };
      d.onmouseenter = () => { UI.rosterHover = u; };
      d.onmouseleave = () => { UI.rosterHover = null; };
      col.appendChild(d);
    }
    el.appendChild(col);
  }
};
UI.drawMini = function (cv, u, scale, t) {
  const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
  const P = FACTIONS[u.side].pal;
  const g = c.createRadialGradient(cv.width / 2, cv.height * 0.55, 2, cv.width / 2, cv.height * 0.55, cv.width * 0.6);
  g.addColorStop(0, rgba(P.glow, u.dead ? 0.05 : 0.25)); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
  c.translate(cv.width / 2, cv.height * 0.92); c.scale(scale, scale);
  const f = u.face; u.face = 1;
  if (u.dead) c.filter = 'grayscale(1) brightness(0.4)';
  R.drawUnit(c, u, t, { still: !!u.dead });
  c.filter = 'none'; u.face = f;
};

// ---------------- Обновление HUD ----------------
UI.refresh = function () {
  if (G.scene !== 'battle') return;
  for (const s of ['order', 'coven']) {
    const F = FACTIONS[s]; const el = $(s === 'order' ? '#facOrder' : '#facCoven');
    let pips = ''; for (let i = 0; i < RES_MAX; i++) pips += `<i class="${i < G.res[s] ? 'on' : ''}${i === F.ult.cost - 1 ? ' mark' : ''}"></i>`;
    let alt = ''; for (let i = 0; i < ALTAR_WIN; i++) alt += `<b class="${i < G.altar[s] ? 'on' : ''}"></b>`;
    el.innerHTML = `<div class="f-sig">${svgIcon(s === 'order' ? 'sun' : 'moon', 26)}</div>
      <div class="f-body"><div class="f-name">${F.name}${!G.spectator && !isAI(s) ? ' <span class="you">вы</span>' : ''}</div>
      <div class="f-res" title="${F.res}: ${G.res[s]}/${RES_MAX}. Ульта «${F.ult.name}» стоит ${F.ult.cost}."><span>${F.res}</span>${pips}</div>
      <div class="f-alt" title="Алтарь: ${G.altar[s]}/${ALTAR_WIN}. Начните ход, удерживая алтарь без врагов на нём."><span>Алтарь</span>${alt}</div></div>`;
    el.classList.toggle('active', G.side === s);
  }
  $('#roundNum').textContent = `Раунд ${G.round}/${MAX_ROUNDS}`;
  $('#turnLabel').textContent = G.winner ? 'Битва окончена' : `Ход: ${FACTIONS[G.side].short}`;
  $('#turnLabel').className = 'c-' + G.side;
  let fx = '';
  if (G.dawn > 0) fx += `<span class="eff e-dawn">Рассвет · ${G.dawn}</span>`;
  if (G.eclipse > 0) fx += `<span class="eff e-ecl">Затмение · ${G.eclipse}</span>`;
  $('#roundFx').innerHTML = fx;
  // ростер
  document.querySelectorAll('.r-unit').forEach(d => {
    const u = G.units.find(v => v.id === +d.dataset.id); if (!u) return;
    d.classList.toggle('dead', u.dead); d.classList.toggle('sel', G.sel === u);
    d.classList.toggle('spent', !u.dead && u.side === G.side && u.ap === 0);
    d.querySelector('.r-hp i').style.width = (u.hp / u.maxHp * 100) + '%';
    d.querySelector('.r-name').innerHTML = u.name + (u.side === G.side && !u.dead ? ` <em>${'●'.repeat(u.ap)}</em>` : '');
  });
  // ульта
  const human = UI.humanTurn();
  const s = G.spectator ? null : (G.control.order === 'human' ? 'order' : 'coven');
  const ub = $('#ultBtn');
  if (s) {
    const F = FACTIONS[s];
    ub.innerHTML = `${svgIcon(s === 'order' ? 'sun' : 'moon', 26)}<span><b>${F.ult.name}</b><small>${F.res}: ${Math.min(G.res[s], F.ult.cost)}/${F.ult.cost}${ultReady(s) ? ' — готово (U)' : enemyUltActive(s) ? ' — подавлено: ' + FACTIONS[foe(s)].ult.name + ' врага' : G.res[s] >= F.ult.cost ? ' — перезарядка ' + (ULT_CD - (G.round - G.ultRound[s])) + ' р.' : ''}</small></span>`;
    ub.className = 'u-' + s + (human && ultReady(s) && G.side === s ? ' ready' : '');
    ub.disabled = !(human && ultReady(s) && G.side === s);
    ub.dataset.tip = `<b>${F.ult.name}</b> — ${F.ult.cost} ${F.res}<br>${F.ult.desc}`;
    ub.style.display = '';
  } else ub.style.display = 'none';
  $('#endTurn').disabled = !human;
  $('#endTurn').style.display = G.spectator ? 'none' : '';
  UI.unitPanel();
};

UI.unitPanel = function () {
  const u = G.sel; const panel = $('#unitPanel');
  if (!u || u.dead) { panel.classList.add('empty'); $('#abilities').innerHTML = ''; return; }
  panel.classList.remove('empty');
  panel.className = 'p-' + u.side;
  const C = CLASSES[u.cls];
  $('#uName').textContent = u.name;
  $('#uClass').textContent = `${u.title} · ${C.role}`;
  $('#uHpBar').style.width = (u.hp / u.maxHp * 100) + '%';
  $('#uHpTxt').textContent = `${u.hp} / ${u.maxHp}`;
  let ap = ''; for (let i = 0; i < Math.max(MAX_AP, u.ap); i++) ap += `<i class="${i < u.ap ? 'on' : ''}"></i>`;
  $('#uAp').innerHTML = `<span>ОД</span>${ap}`;
  const st = [];
  st.push(`Мет. ${u.aim}`, `Защ. ${u.def}`, `Шаг ${effMov(u)}${effMov(u) < u.mov ? '↓' : ''}`);
  if (u.armor) st.push(`Броня ${u.armor}`);
  for (const tr of CLASSES[u.cls].traits || []) { const n = TRAIT_NAMES[tr]; if (n) st.push(`<b class="s-gold">${n}</b>`); }
  if (u.rage) st.push(`<b class="s-red">Ярость +${u.rage}</b>`);
  if (CLASSES[u.cls].abil.includes('heavybolt')) st.push(u.loaded ? '<b class="s-gold">заряжен</b>' : '<b class="s-red">разряжен</b>');
  if (u.st.poison > 0) st.push(`<b class="s-red">Яд ${u.st.poison}</b>`);
  if (u.st.bleed > 0) st.push(`<b class="s-red">Кровотечение ${u.st.bleed}</b>`);
  if (u.st.blind > 0) st.push('<b class="s-red">Ослеплён</b>');
  if (hasTrait(u, 'revive')) st.push(u.revived ? '<b class="s-red">уже вставал</b>' : '<b class="s-gold">встанет раз</b>');
  if (u.guard) st.push(`<b class="s-guard">Стойкость +${u.guard}</b>`);
  if (u.st.bulwark) st.push('<b class="s-gold">Бастион</b>');
  if (u.st.watch) st.push(`<b class="s-gold">Бдение ×${u.st.watch}</b>`);
  if (u.st.concealed) st.push('<b class="s-vio">Сокрыт</b>');
  if (u.st.blessed > 0) st.push(`<b class="s-gold">Благословлён ${u.st.blessed}</b>`);
  if (u.st.cursed > 0) st.push(`<b class="s-vio">Проклят ${u.st.cursed}</b>`);
  if (u.st.taunt) st.push('<b class="s-red">Под Вызовом</b>');
  st.push(isLit(u.x, u.y) ? '<b class="s-gold">на свету</b>' : '<b class="s-vio">во тьме</b>');
  $('#uStatus').innerHTML = st.map(x => `<span class="chip">${x}</span>`).join(' · ');
  const human = UI.humanTurn() && u.side === G.side;
  if (G.spectator) { $('#abilities').innerHTML = ''; return; }
  if (u.side !== G.side || isAI(u.side) || G.winner) { $('#abilities').innerHTML = `<div class="ab-wait">${isAI(G.side) ? 'Ход противника…' : 'Боец ждёт своего хода'}</div>`; return; }
  const list = abilitiesOf(u);
  const ab = $('#abilities'); ab.innerHTML = '';
  list.forEach((id, i) => {
    const A = ABIL[id]; const chk = human ? canUse(u, id) : { ok: false, why: '' };
    const b = document.createElement('button');
    b.className = 'ab' + (G.mode === id ? ' on' : '') + (chk.ok ? '' : ' off');
    const cost = A.apAll ? 'все ОД' : abCost(u, id) + ' ОД';
    b.innerHTML = `<span class="ab-key">${i + 1}</span>${svgIcon(A.icon, 26)}<span class="ab-cost">${cost}${A.res ? ' · ' + A.res + '✦' : ''}</span>`;
    let extra = '';
    if (A.dmg) extra += `<br><span class="t-dim">Урон ${A.dmg[0]}–${A.dmg[1]}${A.range ? ' · дальность ' + A.range : ''}</span>`;
    else if (A.range) extra += `<br><span class="t-dim">Дальность ${A.range}</span>`;
    if (A.res) extra += `<br><span class="t-dim">Стоит ${A.res} ${FACTIONS[u.side].res.toLowerCase()}</span>`;
    b.dataset.tip = `<b>${abName(id, u.side)}</b> <span class="t-dim">(${cost})</span><br>${abDesc(id, u.side) || ''}${extra}${!chk.ok && chk.why ? `<br><span class="t-bad">${chk.why}</span>` : ''}`;
    b.onclick = () => UI.pickAbility(id);
    ab.appendChild(b);
  });
};

UI.pickAbility = function (id) {
  const u = G.sel; if (!u || !UI.humanTurn() || u.side !== G.side) return;
  const chk = canUse(u, id); if (!chk.ok) { UI.toast(`${abName(id, u.side)}: ${chk.why === 'Мало ОД' ? `нужно ${abCost(u, id)} ОД, осталось ${u.ap}` : chk.why}`); return; }
  SFX.play('click');
  const ty = abType(id, u.side);
  if (ty === 'self') { useAbility(u, id); return; }
  if (ty === 'brazier') { useAbility(u, id, targetsFor(u, id)[0]); return; }
  G.mode = G.mode === id ? null : id;
  UI.refresh();
};

UI.toast = function (msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(UI._tt); UI._tt = setTimeout(() => t.classList.remove('show'), 1600);
};

UI.log = function () {
  const el = $('#log'); if (!el) return;
  el.innerHTML = G.log.slice(-14).map(l => `<div class="l l-${l.side || 'n'}">${l.html}</div>`).join('');
  el.scrollTop = el.scrollHeight;
};

// ---------------- Подсказки ----------------
UI.tip = function (html, x, y) {
  const t = $('#tip');
  if (!html) { t.classList.remove('show'); return; }
  t.innerHTML = html; t.classList.add('show');
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = clamp(x + 18, 8, window.innerWidth - w - 8) + 'px';
  t.style.top = clamp(y + 18, 8, window.innerHeight - h - 8) + 'px';
};
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  if (el) UI.tip(el.dataset.tip, e.clientX, e.clientY); else if (!UI.overCanvas) UI.tip(null);
});

UI.onMove = function (e) {
  UI.overCanvas = true;
  const t = R.pickTile(e.clientX, e.clientY);
  const pu = R.pickUnit(e.clientX, e.clientY);
  G.hover = pu ? { x: pu.x, y: pu.y } : t;
  if (G.scene !== 'battle') return;
  const ti = $('#tileInfo');
  if (!G.hover) { UI.tip(null); ti.classList.remove('show'); return; }
  let u = unitAt(G.hover.x, G.hover.y); if (u && hiddenFromViewer(u)) u = null;
  const s = G.sel;
  // подсказка атаки
  if (s && G.mode && u && abType(G.mode, s.side) === 'attack' && R.targetCache(s, G.mode).includes(u)) {
    const c = calcAttack(s, u, G.mode);
    const A = ABIL[G.mode];
    UI.tip(`<b>${abName(G.mode, s.side)}</b> → ${u.name}<div class="brk">${c.br.map(([k, v]) => `<div><span>${k}</span><b class="${v >= 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : ''}${v}</b></div>`).join('')}</div>
      <div class="sum">Попадание <b>${c.hit}%</b> · Крит <b>${c.crit}%</b>${c.exposed ? ` <span class="t-bad">(${A.melee ? 'удар в спину' : 'фланг'})</span>` : ''}</div>
      <div class="t-dim">Урон ${A.dmg[0]}–${A.dmg[1]} · задеть (½ урона): ещё ${Math.min(10, 100 - c.hit)}%</div>`, e.clientX, e.clientY);
  } else if (u && s && G.mode && !R.targetCache(s, G.mode).includes(u) && UI.whyNot(s, G.mode, u)) {
    UI.tip(`<b>${abName(G.mode, s.side)}</b> → ${u.name}<br><span class="t-bad">${UI.whyNot(s, G.mode, u)}</span>`, e.clientX, e.clientY);
  } else if (u) {
    UI.tip(UI.unitTip(u), e.clientX, e.clientY);
  } else UI.tip(null);
  // инфо о клетке
  const tt = tile(G.hover.x, G.hover.y);
  let txt = isLit(G.hover.x, G.hover.y) ? '<span class="s-gold">Свет</span>' : '<span class="s-vio">Тьма</span>';
  if (tt.obj) txt = `<b>${OBJ[tt.obj].name}</b> · ${OBJ[tt.obj].cover >= 40 ? 'полное' : 'половинное'} укрытие · прочность ${tt.ohp}${tt.obj === 'B' ? (tt.lit ? ' · горит' : ' · погасла') : ''}<br>` + txt;
  if (tt.altar) txt += ' · <span class="s-red">Алтарь</span>';
  if (tt.burn > 0) txt += ` · <span class="s-red">${tt.burnSide === 'order' ? 'Огонь' : 'Чёрное пламя'} (${Math.ceil(tt.burn / 2)} р.)</span>`;
  ti.innerHTML = txt; ti.classList.add('show');
};
UI.unitTip = function (u) {
  const st = [];
  if (u.st.watch) st.push('Бдение'); if (u.st.bulwark) st.push('Бастион'); if (u.st.concealed) st.push('Сокрыт');
  if (u.st.blessed > 0) st.push('Благословлён'); if (u.st.cursed > 0) st.push('Проклят'); if (u.guard) st.push('Стойкость +' + u.guard);
  if (u.st.poison > 0) st.push('Яд ' + u.st.poison); if (u.st.bleed > 0) st.push('Кровотечение ' + u.st.bleed); if (u.st.blind > 0) st.push('Ослеплён'); if (u.rage) st.push('Ярость +' + u.rage);
  return `<b class="c-${u.side}">${u.name}</b><br><span class="t-dim">${u.title} · ${CLASSES[u.cls].role}</span><br>ОЗ ${u.hp}/${u.maxHp} · Мет. ${u.aim} · Защ. ${u.def}${u.armor ? ' · Броня ' + u.armor : ''}${st.length ? '<br>' + st.join(', ') : ''}<br><span class="t-dim">${CLASSES[u.cls].desc}</span>`;
};

UI.whyNot = function (s, id, t) {
  const A = ABIL[id]; const ty = abType(id, s.side);
  const wantAlly = ty === 'ally';
  if (wantAlly && t.side !== s.side) return 'Нужен союзник';
  if (!wantAlly && t.side === s.side) return null;
  const d = dist(s, t);
  if (d > A.range + 0.01) return `Слишком далеко: ${d.toFixed(1)} кл. при дальности ${A.range}`;
  if (A.melee && !meleeOk(s, t)) return 'Угол стены мешает удару';
  if (!wantAlly && !A.melee && t !== s && !hasLOS(s, t)) return 'Нет прямой видимости — мешает стена или колонна';
  if (id === 'heal' && t.hp >= t.maxHp && tile(t.x, t.y).burn <= 0) return 'Цель полностью здорова';
  if (id === 'hex' && s.side === 'order' && t.st.blessed > 0) return 'Уже благословлён';
  return 'Недопустимая цель';
};
UI.onDown = function (e) {
  if (G.scene !== 'battle') return;
  if (e.button === 1 || (e.button === 0 && e.shiftKey)) { UI.drag = { x: e.clientX, y: e.clientY }; return; }
  if (e.button === 2) {
    if (G.mode) { G.mode = null; UI.refresh(); }
    else UI.drag = { x: e.clientX, y: e.clientY };
    return;
  }
  if (!UI.humanTurn()) return;
  const pu = R.pickUnit(e.clientX, e.clientY);
  const t = pu ? { x: pu.x, y: pu.y } : R.pickTile(e.clientX, e.clientY);
  if (!t) return;
  const s = G.sel; const u = unitAt(t.x, t.y);
  if (G.mode && s) {
    const ty = abType(G.mode, s.side);
    if (ty === 'lob') {
      if (R.lobCache(s).some(q => q.x === t.x && q.y === t.y)) useAbility(s, G.mode, t);
      else { G.mode = null; UI.refresh(); }
      return;
    }
    if (ty === 'aoe') {
      if (R.aoeCache(s).some(q => q.x === t.x && q.y === t.y)) useAbility(s, G.mode, t);
      else { G.mode = null; UI.refresh(); }
      return;
    }
    if (u && R.targetCache(s, G.mode).includes(u)) { useAbility(s, G.mode, u); return; }
    if (u && abType(G.mode, s.side) === 'ally') { UI.toast(UI.whyNot(s, G.mode, u)); return; }
    if (u && u.side === G.side) { selectUnit(u); return; }
    G.mode = null; UI.tip(null); UI.refresh(); return;
  }
  if (u && u.side === G.side) { selectUnit(u); return; }
  if (s && u && u.side !== s.side) {
    // быстрая атака основным оружием
    const id = CLASSES[s.cls].abil[0];
    if (canUse(s, id).ok && targetsFor(s, id).includes(u)) { G.mode = id; UI.refresh(); UI.onMove(e); }
    else UI.toast(u.st.concealed ? 'Цель не видна' : 'Цель вне досягаемости');
    return;
  }
  if (s && s.ap > 0) {
    const r = R.reachCache(s); const c = r.cost[t.y * MW + t.x];
    if (isFinite(c) && c > 0) {
      const path = pathFrom(r, t.x, t.y);
      G.busy = true;
      moveUnit(s, path).then(() => { G.busy = false; refreshLight(); if (s.dead) G.sel = null; UI.refresh(); checkWin(); });
      UI.refresh();
    }
  }
};

UI.onKey = function (e) {
  if (e.key === 'Escape') {
    if (!$('#confirm').classList.contains('hidden')) { $('#confirm').classList.add('hidden'); return; }
    if (!$('#pause').classList.contains('hidden') && $('#codex').classList.contains('hidden')) { UI.pause(false); return; }
    if (G.winner) return;
    if (!$('#codex').classList.contains('hidden')) { UI.codex(false); return; }
    if (G.mode) { G.mode = null; UI.refresh(); return; }
    if (G.scene === 'battle') UI.pause($('#pause').classList.contains('hidden'));
    return;
  }
  if (G.scene !== 'battle') return;
  const k = e.key.toLowerCase();
  const pan = 40 / R.cam.z;
  if (k === 'w' || k === 'ц' || e.key === 'ArrowUp') R.cam.ty -= pan;
  if (k === 's' || k === 'ы' || e.key === 'ArrowDown') R.cam.ty += pan;
  if (k === 'a' || k === 'ф' || e.key === 'ArrowLeft') R.cam.tx -= pan;
  if (k === 'd' || k === 'в' || e.key === 'ArrowRight') R.cam.tx += pan;
  if (!UI.humanTurn()) return;
  if (/^[1-9]$/.test(e.key) && G.sel) { const l = abilitiesOf(G.sel); const id = l[+e.key - 1]; if (id) UI.pickAbility(id); }
  if (e.key === 'Tab') {
    e.preventDefault();
    const list = alive(G.side); if (!list.length) return;
    const withAp = list.filter(u => u.ap > 0); const pool = withAp.length ? withAp : list;
    const i = pool.indexOf(G.sel); selectUnit(pool[(i + 1) % pool.length]);
  }
  if (e.key === 'Enter') UI.tryEndTurn();
  if (k === 'u' || k === 'г') useUlt(G.side);
};

UI.tryEndTurn = function () {
  if (!UI.humanTurn()) return;
  const left = alive(G.side).filter(u => u.ap > 0);
  if (left.length && left.some(u => u.ap >= 2)) {
    $('#confirmText').innerHTML = `У ${left.length} бойцов остались ОД.<br><span class="t-dim">Несгоревшие ОД превратятся в Стойкость (+${GUARD_PER_AP} к защите за каждое).</span>`;
    $('#confirm').classList.remove('hidden');
  } else UI.doEndTurn();
};
UI.doEndTurn = function () { if (!UI.humanTurn()) return; SFX.play('click'); endTurn(); };

// ---------------- Конец игры ----------------
UI.showEnd = function () {
  ['#pause', '#confirm', '#codex'].forEach(s => $(s).classList.add('hidden'));
  UI.tip(null); document.body.classList.add('ended');
  const w = G.winner; const el = $('#endscreen');
  let title, cls;
  if (w === 'draw') { title = 'Ничья'; cls = 'draw'; }
  else if (G.spectator) { title = `${FACTIONS[w].short} побеждает`; cls = w; }
  else { title = isAI(w) ? 'Поражение' : 'Победа'; cls = isAI(w) ? 'lose' : 'win'; }
  const row = s => { const S = G.stats[s]; return `<div class="es-col c-${s}"><h3>${FACTIONS[s].short}</h3>
    <div>Урон: <b>${S.dmg}</b></div><div>Убийств: <b>${S.kills}</b></div><div>Точность: <b>${S.shots ? Math.round(S.hits / S.shots * 100) : 0}%</b></div><div>Алтарь: <b>${G.altar[s]}/${ALTAR_WIN}</b></div><div>Выжило: <b>${alive(s).length}/${G.units.filter(u => u.side === s).length}</b></div></div>`; };
  $('#endTitle').textContent = title; $('#endTitle').className = 'es-' + cls;
  $('#endReason').textContent = G.winReason + ` (раунд ${G.round})`;
  $('#endStats').innerHTML = row('order') + row('coven');
  el.classList.remove('hidden');
};

// ---------------- Меню: эмблемы на карточках ----------------
UI.drawMenuEmblems = function () {
  document.querySelectorAll('canvas[data-emb]').forEach(cv => {
    const [side, cls] = cv.dataset.emb.split(':');
    const u = makeUnit(side, cls, 0, 0); u.face = side === 'order' ? 1 : -1;
    UI.menuUnits = UI.menuUnits || []; UI.menuUnits.push({ cv, u });
  });
};
UI.tick = function (t) {
  if (G.scene === 'menu' && UI.menuUnits) for (const m of UI.menuUnits) {
    const c = m.cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, m.cv.width, m.cv.height);
    c.translate(m.cv.width / 2, m.cv.height - 8); c.scale(2.4, 2.4); R.drawUnit(c, m.u, t);
  }
  if (UI.armyUnits && UI.armyUnits.length) for (const m of UI.armyUnits) {
    const c = m.cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, m.cv.width, m.cv.height);
    c.translate(m.cv.width / 2, m.cv.height - 6); c.scale(m.sc, m.sc); R.drawUnit(c, m.u, t);
  }
  if (G.scene === 'battle') {
    if (G.sel && !G.sel.dead) UI.drawMini($('#portrait'), G.sel, 2.1, t);
    UI._rt = (UI._rt || 0) + 1;
    if (UI._rt % 3 === 0) document.querySelectorAll('.r-unit').forEach(d => {
      const u = G.units.find(v => v.id === +d.dataset.id); if (u) UI.drawMini(d.querySelector('canvas'), u, 1.05, t);
    });
  }
};
