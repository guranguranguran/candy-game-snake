/* 平衡性自测：用一个「会玩的 AI」把三档难度各跑一遍
   策略：背包满 → 去垃圾桶；否则先追灰色小人（感化优先）；没人可追 → 捡最近垃圾
   用法：node test/balance.js  */
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const ctx = vm.createContext({ console, setTimeout, clearTimeout });
vm.runInContext(read('test/shim.js'), ctx, { filename: 'shim.js' });
vm.runInContext(read('js/game.js'), ctx, { filename: 'game.js' });

vm.runInContext(`
function play(id) {
  SG.setDifficulty(id); SG.setControl('mouse'); SG.reset(); SG.clearMouse();
  const LIMIT = 60 * 8;                    // 最多模拟 8 分钟
  let frames = 0;
  while (SG.state() === 'play' && frames++ < LIMIT * 60) {
    const p = SG.player();
    if (SG.bag() >= 5) {
      SG.setMouse(SG.bin.x, SG.bin.y);     // 满了先送桶
    } else {
      const grays = SG.npcs().filter(n => n.kind === 'gray');
      let pool = grays.length ? grays : SG.garbageList();
      let best = null, bd = Infinity;
      for (const o of pool) {
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) SG.setMouse(best.x, best.y);
      else SG.clearMouse();
    }
    SG.tick(1 / 60);
  }
  return {
    state: SG.state(), score: SG.score(), dirt: SG.dirt(),
    sec: +(frames / 60).toFixed(1),
    green: SG.npcs().filter(n => n.kind === 'green').length,
    target: SG.target()
  };
}

for (const id of ['easy', 'normal', 'hard']) {
  const r = play(id);
  const label = SG.presets()[id].label;
  const res = r.state === 'win' ? '通关' : (r.state === 'lose' ? '失败(超时前被打爆)' : '8 分钟没能通关');
  console.log('[' + label + '] ' + res +
    ' · 得分 ' + r.score + '/' + r.target +
    ' · 用时 ' + r.sec + 's' +
    ' · 场内垃圾 ' + r.dirt +
    ' · 同伴 ' + r.green + ' 人');
}
`, ctx, { filename: 'balance' });
