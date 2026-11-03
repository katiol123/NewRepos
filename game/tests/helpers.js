// Загружается в страницу игры. Помогает собирать изолированные сценарии.
window.T = {
  // Чистая арена: без объектов, все жаровни убраны, оба игрока — люди.
  setup(opts = {}) {
    const ros = { order: [], coven: [] };
    for (const [side, cls] of opts.units || []) ros[side].push(cls);
    for (const side of ['order', 'coven']) for (const c of DEFAULT_ROSTER) if (ros[side].length < 6 && !ros[side].includes(c)) ros[side].push(c);
    GAME.newGame('order', ros);
    const G = GAME.G;
    G.control = { order: 'human', coven: 'human' };
    G.spectator = false; G.scene = 'battle'; G.side = opts.side || 'order';
    G.round = opts.round || 3; G.res = { order: 10, coven: 10 };
    G.ultRound = { order: -9, coven: -9 }; G.dawn = 0; G.eclipse = 0; G.speed = 40;
    if (!opts.keepMap) for (const row of G.map) for (const t of row) { t.obj = null; t.ohp = 0; t.lit = false; t.burn = 0; t.rubble = 0; }
    for (const [o, x, y, lit] of opts.objs || []) { const t = G.map[y][x]; t.obj = o; t.ohp = OBJ[o].hp; t.lit = o === 'B' ? lit !== false : false; }
    for (const u of G.units) { u.dead = true; u.x = u.rx = -5; u.y = u.ry = -5; }
    const placed = [];
    for (const [side, cls, x, y] of opts.units || []) {
      const u = G.units.find(v => v.side === side && v.cls === cls && v.dead && !placed.includes(v));
      u.dead = false; u.x = u.rx = x; u.y = u.ry = y; u.hp = u.maxHp; u.ap = 3; u.guard = 0; u.bloodUsed = false; u.tauntUsed = false;
      u.st = { bulwark: false, watch: 0, concealed: false, blessed: 0, cursed: 0, taunt: null }; u.anim.dying = 0;
      placed.push(u);
    }
    refreshLight();
    return placed;
  },
  // Подменить случайность последовательностью чисел (потом вернуть).
  // Подмена случайности. На время подмены отключаем бросок тьмы, чтобы последовательность не сбивалась.
  rig(seq) { const orig = Math.random; let i = 0; GAME.G.noDarkMiss = true; Math.random = () => (i < seq.length ? seq[i++] : 0.5); return () => { Math.random = orig; GAME.G.noDarkMiss = false; }; },
  rigConst(v) { const orig = Math.random; GAME.G.noDarkMiss = true; Math.random = () => v; return () => { Math.random = orig; GAME.G.noDarkMiss = false; }; },
  br(c, label) { const e = c.br.find(b => b[0] === label); return e ? e[1] : null; },
};
