'use strict';
// ============================================================
//  Главный цикл
// ============================================================
(function () {
  R.init();
  buildMap(); spawnUnits(); refreshLight();
  UI.init();
  R.cv.addEventListener('mouseleave', () => { UI.overCanvas = false; });
  // зерно плёнки как CSS-слой
  { const g = document.createElement('canvas'); g.width = g.height = 160; const gx = g.getContext('2d'); const id = gx.createImageData(160, 160);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    gx.putImageData(id, 0, 0); document.getElementById('grain').style.backgroundImage = `url(${g.toDataURL()})`; }
  let last = performance.now(), slow = 0, fast = 0;
  function loop(now) {
    const raw = (now - last) / 1000; last = now;
    let dt = Math.min(0.1, raw);
    // адаптивное качество
    if (raw > 0.045) { slow++; fast = 0; } else { fast++; slow = Math.max(0, slow - 1); }
    if (!R.low && slow > 40) { R.low = true; }
    if (R.low && fast > 600) { R.low = false; slow = 0; }
    // замедление на добивании
    let ts = 1;
    if (FX.slowmo > 0) { FX.slowmo -= dt; ts = 0.35; }
    const gdt = dt * ts * (G.speed || 1);
    tickTimers(gdt);
    FX.update(dt * ts);
    R.frame(dt);
    UI.tick(R.time);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // хук для автотестов
  window.GAME = { G, R, UI, AI, FX, start: m => UI.startGame(m), newGame, startTurn, endTurn, useAbility, moveUnit, reach, pathFrom, calcAttack, targetsFor, canUse, abilitiesOf, useUlt };
})();
